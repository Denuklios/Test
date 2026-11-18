<?php
/* Warenwirtschaft & Kasse: Datenbank (SQLite in data/private), Einstellungen, Geldbeträge.
   Alle Beträge in Øre/Cent als ganze Zahlen. Preise sind Bruttopreise (inkl. Moms/MwSt.). */
declare(strict_types=1);

const JK_DB = JK_PRIVATE . '/shop.sqlite';

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!is_dir(JK_PRIVATE)) mkdir(JK_PRIVATE, 0750, true);
    $pdo = new PDO('sqlite:' . JK_DB, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    migrate($pdo);
    return $pdo;
}

function migrate(PDO $db): void {
    $v = (int)$db->query('PRAGMA user_version')->fetchColumn();
    if ($v < 1) {
        $db->exec(<<<SQL
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#a3201d', sort INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            sku TEXT,
            barcode TEXT UNIQUE,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            price INTEGER NOT NULL DEFAULT 0,          -- Verkaufspreis brutto
            cost INTEGER NOT NULL DEFAULT 0,           -- Einkaufspreis netto
            vat INTEGER NOT NULL DEFAULT 2500,         -- Steuersatz in Hundertstel-Prozent (2500 = 25 %)
            stock REAL NOT NULL DEFAULT 0,
            min_stock REAL NOT NULL DEFAULT 0,
            unit TEXT NOT NULL DEFAULT 'Stk.',
            track_stock INTEGER NOT NULL DEFAULT 1,
            open_price INTEGER NOT NULL DEFAULT 0,     -- Preis wird an der Kasse eingegeben
            favorite INTEGER NOT NULL DEFAULT 1,       -- als Kachel in der Kasse zeigen
            active INTEGER NOT NULL DEFAULT 1,
            note TEXT NOT NULL DEFAULT '',
            created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE INDEX products_name ON products(name);
        CREATE TABLE stock_moves (
            id INTEGER PRIMARY KEY,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            qty REAL NOT NULL,                         -- + Zugang, - Abgang
            stock_after REAL NOT NULL,
            reason TEXT NOT NULL,                      -- sale, refund, receipt, correction, inventory
            ref TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
            user TEXT NOT NULL, created TEXT NOT NULL);
        CREATE INDEX stock_moves_product ON stock_moves(product_id, created);
        CREATE TABLE closings (
            id INTEGER PRIMARY KEY,
            number INTEGER UNIQUE,                     -- Z-Nummer, erst beim Abschluss vergeben
            opened_at TEXT NOT NULL, opened_by TEXT NOT NULL,
            float INTEGER NOT NULL DEFAULT 0,          -- Wechselgeld zu Beginn
            closed_at TEXT, closed_by TEXT,
            counted INTEGER, expected INTEGER,         -- gezählt / erwartet in der Kasse
            withdrawn INTEGER,                         -- zur Bank / entnommen
            totals TEXT, hash TEXT);
        CREATE TABLE sales (
            id INTEGER PRIMARY KEY,
            uuid TEXT NOT NULL UNIQUE,                 -- vom Tablet vergeben: doppelt gesendete Verkäufe zählen nur einmal
            number INTEGER NOT NULL UNIQUE,            -- fortlaufende Bonnummer
            type TEXT NOT NULL DEFAULT 'sale',         -- sale | refund
            ref_sale_id INTEGER REFERENCES sales(id),
            closing_id INTEGER NOT NULL REFERENCES closings(id),
            created TEXT NOT NULL, user TEXT NOT NULL,
            total INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, vat_total INTEGER NOT NULL,
            payment TEXT NOT NULL,                     -- cash, card, mobilepay, other
            given INTEGER NOT NULL DEFAULT 0, change INTEGER NOT NULL DEFAULT 0,
            rounding INTEGER NOT NULL DEFAULT 0,       -- Bargeld-Rundung (z. B. auf 50 Øre)
            card_ref TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
            prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
        CREATE INDEX sales_created ON sales(created);
        CREATE TABLE sale_items (
            id INTEGER PRIMARY KEY,
            sale_id INTEGER NOT NULL REFERENCES sales(id),
            ref_item_id INTEGER REFERENCES sale_items(id),   -- bei Rückgabe: welche Zeile zurückgegeben wurde
            product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
            name TEXT NOT NULL, barcode TEXT NOT NULL DEFAULT '',
            qty REAL NOT NULL, unit_price INTEGER NOT NULL,
            discount INTEGER NOT NULL DEFAULT 0,       -- Rabatt auf die Zeile (inkl. anteiligem Bonrabatt)
            total INTEGER NOT NULL, vat INTEGER NOT NULL, vat_amount INTEGER NOT NULL, cost INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX sale_items_sale ON sale_items(sale_id);
        CREATE TABLE cash_moves (
            id INTEGER PRIMARY KEY, closing_id INTEGER NOT NULL REFERENCES closings(id),
            amount INTEGER NOT NULL, note TEXT NOT NULL, user TEXT NOT NULL, created TEXT NOT NULL);
        PRAGMA user_version = 1;
        SQL);
    }
    if ($v < 2) {
        $db->exec(<<<SQL
        ALTER TABLE products ADD COLUMN image TEXT NOT NULL DEFAULT '';      -- Dateiname in data/produkte/
        ALTER TABLE sales ADD COLUMN customer TEXT NOT NULL DEFAULT '';      -- Käufer für A4-Rechnung (gehört nicht zur Prüfsumme)
        PRAGMA user_version = 2;
        SQL);
    }
    if ($v < 3) {
        $db->exec(<<<SQL
        CREATE TABLE card_payments (                 -- Kartenzahlungen über SumUp Solo
            uuid TEXT PRIMARY KEY,                   -- = uuid des Verkaufs
            amount INTEGER NOT NULL, currency TEXT NOT NULL,
            reader_id TEXT NOT NULL, client_tx_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',  -- pending, successful, failed, cancelled
            tx_code TEXT NOT NULL DEFAULT '', card TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
            user TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE INDEX card_payments_ctx ON card_payments(client_tx_id);
        PRAGMA user_version = 3;
        SQL);
    }
    if ($v < 4) {
        $db->exec(<<<SQL
        ALTER TABLE sales ADD COLUMN receipt_token TEXT NOT NULL DEFAULT '';   -- geheimer Link zum digitalen Beleg
        PRAGMA user_version = 4;
        SQL);
    }
    if ($v < 5) {
        $db->exec(<<<SQL
        ALTER TABLE products ADD COLUMN web INTEGER NOT NULL DEFAULT 0;        -- auf der Website zeigen
        ALTER TABLE products ADD COLUMN web_kit INTEGER NOT NULL DEFAULT 0;    -- Bausatz mit Anleitung zum Selberbauen
        ALTER TABLE products ADD COLUMN web_text TEXT NOT NULL DEFAULT '';     -- kurzer Text für die Website
        CREATE TABLE advent_doors (                  -- Adventskalender: Inhalt der 24 Türchen
            day INTEGER PRIMARY KEY,
            title_da TEXT NOT NULL DEFAULT '', title_de TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
            text_da TEXT NOT NULL DEFAULT '', text_de TEXT NOT NULL DEFAULT '', text_en TEXT NOT NULL DEFAULT '',
            image TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '', code TEXT NOT NULL DEFAULT '',
            updated TEXT NOT NULL DEFAULT '');
        CREATE TABLE web_requests (                  -- Anfragen und Reservierungen von der Website
            id INTEGER PRIMARY KEY, created TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'frage',      -- frage, reservierung, bausatz
            product_id INTEGER, product_name TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'da',
            status TEXT NOT NULL DEFAULT 'neu',      -- neu, erledigt
            ip_hash TEXT NOT NULL DEFAULT '');
        CREATE INDEX web_requests_created ON web_requests(created);
        PRAGMA user_version = 5;
        SQL);
    }
    if ($v < 6) {
        $db->exec(<<<SQL
        ALTER TABLE products ADD COLUMN web_ship INTEGER NOT NULL DEFAULT 1;     -- kann verschickt werden (sonst nur Abholung)
        ALTER TABLE products ADD COLUMN web_name_da TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN web_name_de TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN web_name_en TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN web_desc_da TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN web_desc_de TEXT NOT NULL DEFAULT '';
        ALTER TABLE products ADD COLUMN web_desc_en TEXT NOT NULL DEFAULT '';
        CREATE TABLE web_texts (key TEXT PRIMARY KEY, da TEXT NOT NULL DEFAULT '', de TEXT NOT NULL DEFAULT '', en TEXT NOT NULL DEFAULT '');
        CREATE TABLE web_posts (                     -- Neuigkeiten
            id INTEGER PRIMARY KEY, date TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 1, image TEXT NOT NULL DEFAULT '',
            title_da TEXT NOT NULL DEFAULT '', title_de TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
            text_da TEXT NOT NULL DEFAULT '', text_de TEXT NOT NULL DEFAULT '', text_en TEXT NOT NULL DEFAULT '');
        CREATE TABLE web_events (                    -- Termine und Workshops
            id INTEGER PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 1, image TEXT NOT NULL DEFAULT '',
            title_da TEXT NOT NULL DEFAULT '', title_de TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
            text_da TEXT NOT NULL DEFAULT '', text_de TEXT NOT NULL DEFAULT '', text_en TEXT NOT NULL DEFAULT '',
            price TEXT NOT NULL DEFAULT '');
        CREATE TABLE web_gallery (
            id INTEGER PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0, image TEXT NOT NULL DEFAULT '',
            title_da TEXT NOT NULL DEFAULT '', title_de TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '');
        CREATE TABLE web_faq (
            id INTEGER PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0,
            title_da TEXT NOT NULL DEFAULT '', title_de TEXT NOT NULL DEFAULT '', title_en TEXT NOT NULL DEFAULT '',
            text_da TEXT NOT NULL DEFAULT '', text_de TEXT NOT NULL DEFAULT '', text_en TEXT NOT NULL DEFAULT '');
        CREATE TABLE web_orders (                    -- Bestellungen aus dem Online-Shop
            id INTEGER PRIMARY KEY, number INTEGER NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE, created TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'neu',      -- neu, bestaetigt, versendet, abgeholt, storniert
            paid INTEGER NOT NULL DEFAULT 0, paid_at TEXT NOT NULL DEFAULT '', pay_ref TEXT NOT NULL DEFAULT '',
            delivery TEXT NOT NULL,                  -- pickup, dk, de
            payment TEXT NOT NULL,                   -- pickup, mobilepay, bank, card
            name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
            street TEXT NOT NULL DEFAULT '', zip TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '', admin_note TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'da',
            subtotal INTEGER NOT NULL, shipping INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL, vat_total INTEGER NOT NULL DEFAULT 0,
            ip_hash TEXT NOT NULL DEFAULT '');
        CREATE INDEX web_orders_created ON web_orders(created);
        CREATE TABLE web_order_items (
            id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES web_orders(id) ON DELETE CASCADE,
            product_id INTEGER, name TEXT NOT NULL, qty INTEGER NOT NULL, unit_price INTEGER NOT NULL, total INTEGER NOT NULL, vat INTEGER NOT NULL DEFAULT 2500);
        PRAGMA user_version = 6;
        SQL);
    }
    if ($v < 7) {
        /* Grundausstattung „Häufige Fragen“ – nur wenn noch keine angelegt sind. Im Admin frei änderbar. */
        if (!(int)$db->query('SELECT COUNT(*) FROM web_faq')->fetchColumn()) {
            $db->exec(<<<'SQL'
        INSERT INTO web_faq (sort, title_da, title_de, title_en, text_da, text_de, text_en) VALUES
        (10, 'Hvor finder jeg Julekontor?', 'Wo finde ich das Julekontor?', 'Where is Julekontor?', 'Vi ligger ved Padborg, lige nord for den dansk-tyske grænse. Adresse og rutevejledning finder du på siden ”Besøg os”.', 'Wir liegen bei Padborg, direkt hinter der deutsch-dänischen Grenze. Adresse und Routenplaner findest du auf der Seite „Besuch uns“.', 'We are near Padborg, just north of the Danish-German border. You will find the address and directions on the “Visit us” page.'),
        (20, 'Hvornår har I åbent?', 'Wann habt ihr geöffnet?', 'When are you open?', 'De aktuelle åbningstider står på siden ”Besøg os”. Særlige åbningsdage op til jul skriver vi under ”Nyheder”.', 'Die aktuellen Öffnungszeiten stehen auf der Seite „Besuch uns“. Besondere Öffnungstage vor Weihnachten kündigen wir unter „Neuigkeiten“ an.', 'Current opening hours are on the “Visit us” page. Special opening days before Christmas are announced under “News”.'),
        (30, 'Kan jeg bestille på nettet og hente i butikken?', 'Kann ich online bestellen und im Laden abholen?', 'Can I order online and collect in the shop?', 'Ja. Vælg ”Afhentning i butikken” i kurven. Vi lægger varerne til side i 14 dage, og du kan betale, når du henter dem.', 'Ja. Wähle im Warenkorb „Abholung im Laden“. Wir legen die Ware 14 Tage für dich zurück, und du kannst bei der Abholung bezahlen.', 'Yes. Choose “Collection in the shop” in the basket. We keep your items for 14 days and you can pay when you collect them.'),
        (40, 'Sender I også varer?', 'Verschickt ihr auch?', 'Do you ship?', 'Ja, til Danmark og Tyskland. Fragtprisen ser du i kurven, før du bestiller. Enkelte varer – f.eks. skrøbelige eller friske ting – kan kun hentes i butikken; det står ved varen.', 'Ja, nach Dänemark und Deutschland. Die Versandkosten siehst du im Warenkorb, bevor du bestellst. Einzelne Artikel – zum Beispiel zerbrechliche oder frische Stücke – gibt es nur zur Abholung; das steht beim Artikel.', 'Yes, within Denmark and to Germany. You see the shipping cost in the basket before you order. A few items – fragile or fresh pieces, for example – are for collection only; this is stated on the item.'),
        (50, 'Hvordan kan jeg betale?', 'Wie kann ich bezahlen?', 'How can I pay?', 'De mulige betalingsmåder vises, når du bestiller. Ved afhentning kan du betale i butikken. Derudover tilbyder vi efter omstændighederne MobilePay, bankoverførsel og betalingskort.', 'Die möglichen Zahlungsarten werden bei der Bestellung angezeigt. Bei Abholung kannst du im Laden bezahlen. Außerdem bieten wir je nach Bestellung MobilePay, Überweisung und Kartenzahlung an.', 'The available payment methods are shown at checkout. If you collect, you can pay in the shop. Depending on the order we also offer MobilePay, bank transfer and card payment.'),
        (60, 'Hvorfor står priserne i kroner?', 'Warum stehen die Preise in Kronen?', 'Why are the prices in kroner?', 'Vi er en dansk butik, så alle priser er i danske kroner inkl. moms. Beløbet i euro ved siden af er kun en hjælp og kan afvige lidt fra den kurs, din bank bruger.', 'Wir sind ein dänischer Laden, deshalb stehen alle Preise in dänischen Kronen inklusive Mehrwertsteuer. Der Euro-Betrag daneben ist nur eine Hilfe und kann leicht vom Kurs deiner Bank abweichen.', 'We are a Danish shop, so all prices are in Danish kroner including VAT. The euro amount shown alongside is only a guide and may differ slightly from the rate your bank uses.'),
        (70, 'Er alt hos jer håndlavet?', 'Ist bei euch alles handgemacht?', 'Is everything handmade?', 'Omkring 85 % af vores sortiment er lavet i hånden. Derfor er to stykker aldrig helt ens – små forskelle i farve, form og størrelse i forhold til billedet hører med.', 'Rund 85 % unseres Sortiments sind von Hand gemacht. Deshalb sind zwei Stücke nie ganz gleich – kleine Unterschiede in Farbe, Form und Größe gegenüber dem Bild gehören dazu.', 'Around 85% of our range is made by hand. That is why no two pieces are exactly alike – small differences in colour, shape and size compared with the picture are part of it.'),
        (80, 'En vare er udsolgt – kommer den igen?', 'Ein Artikel ist ausverkauft – kommt er wieder?', 'An item is sold out – will it come back?', 'Mange ting laver vi i små serier, og nogle findes kun én gang. Skriv til os via formularen ved varen eller på kontaktsiden, så fortæller vi, om der kommer flere.', 'Vieles fertigen wir in kleinen Serien, manches gibt es nur ein einziges Mal. Schreib uns über das Formular beim Artikel oder auf der Kontaktseite, dann sagen wir dir, ob es Nachschub gibt.', 'We make many things in small batches and some exist only once. Write to us using the form on the item or the contact page and we will tell you whether more are coming.'),
        (90, 'Kan jeg fortryde mit køb?', 'Kann ich meinen Kauf rückgängig machen?', 'Can I cancel my purchase?', 'Ja. Køber du i netbutikken, har du 14 dages fortrydelsesret. Undtaget er bl.a. varer lavet efter dine ønsker og friske varer som kranse af gran. Alle detaljer står under ”Fortrydelsesret”.', 'Ja. Wenn du im Online-Shop kaufst, hast du 14 Tage Widerrufsrecht. Ausgenommen sind unter anderem Ware, die nach deinen Wünschen angefertigt wurde, und frische Ware wie Kränze aus Tannengrün. Alle Einzelheiten stehen unter „Widerrufsrecht“.', 'Yes. If you buy in the online shop you have a 14-day right of withdrawal. Exceptions include goods made to your wishes and fresh goods such as fir wreaths. All details are under “Right of withdrawal”.'),
        (100, 'Hvad gør jeg, hvis en vare er gået i stykker undervejs?', 'Was mache ich, wenn etwas beschädigt ankommt?', 'What if something arrives damaged?', 'Skriv til os hurtigst muligt med dit ordrenummer og et billede af varen og emballagen. Så finder vi en løsning – ombytning eller pengene tilbage.', 'Schreib uns so schnell wie möglich mit deiner Bestellnummer und einem Foto von Ware und Verpackung. Dann finden wir eine Lösung – Ersatz oder Geld zurück.', 'Write to us as soon as possible with your order number and a photo of the item and the packaging. We will find a solution – a replacement or your money back.'),
        (110, 'Hvad er julekalenderen?', 'Was ist der Adventskalender?', 'What is the advent calendar?', 'Fra 1. til 24. december åbner der hver dag en ny låge her på siden – med en hilsen, en idé eller en lille overraskelse fra butikken. Lågerne kan først åbnes på dagen.', 'Vom 1. bis 24. Dezember öffnet sich hier auf der Seite jeden Tag ein neues Türchen – mit einem Gruß, einer Idee oder einer kleinen Überraschung aus dem Laden. Die Türchen lassen sich erst am jeweiligen Tag öffnen.', 'From 1 to 24 December a new door opens on this site every day – with a greeting, an idea or a little surprise from the shop. Doors can only be opened on their day.');
        SQL);
        }
        $db->exec('PRAGMA user_version = 7');
    }
    if ($v < 8) {
        $db->exec(<<<SQL
        CREATE TABLE calc_categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE calc_materials (                -- Materiallager der Preiskalkulation
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, grp TEXT NOT NULL DEFAULT '',
            type TEXT NOT NULL,                      -- area, length, piece, weight, cast, wear, volume
            price REAL NOT NULL DEFAULT 0,           -- Preis der Packung in der angegebenen Währung
            currency TEXT NOT NULL DEFAULT 'DKK',    -- DKK oder EUR
            pack TEXT NOT NULL DEFAULT '{}',         -- Packungsgröße (JSON)
            supplier TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', updated TEXT NOT NULL);
        CREATE TABLE calc_projects (
            id INTEGER PRIMARY KEY, category_id INTEGER, name TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'arbeit',   -- arbeit, fertig
            batch INTEGER NOT NULL DEFAULT 1,        -- Material und Zeit gelten für so viele Stück
            minutes REAL NOT NULL DEFAULT 0, wage REAL, markup REAL,
            packaging REAL NOT NULL DEFAULT 0,       -- Verpackung pro Stück in Kronen
            extra REAL NOT NULL DEFAULT 0,           -- Sonstiges pro Durchgang in Kronen
            own_price REAL,                          -- eigener Verkaufspreis (statt des errechneten)
            product_id INTEGER, image TEXT NOT NULL DEFAULT '', built INTEGER NOT NULL DEFAULT 0, timer_start INTEGER,
            created TEXT NOT NULL, updated TEXT NOT NULL);
        CREATE TABLE calc_lines (
            id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES calc_projects(id) ON DELETE CASCADE,
            material_id INTEGER NOT NULL REFERENCES calc_materials(id) ON DELETE CASCADE,
            use TEXT NOT NULL DEFAULT '{}', sort INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX calc_lines_project ON calc_lines(project_id);
        PRAGMA user_version = 8;
        SQL);
    }
}

/* ---------- Einstellungen ---------- */
const SHOP_DEFAULTS = [
    'shop_name'    => 'Julekontor',
    'shop_line'    => 'Danmarks Gammeldags Julebutik',
    'shop_address' => "6330 Padborg / Vilsbæk",
    'shop_cvr'     => '',
    'shop_phone'   => '',
    'currency'     => 'DKK',
    'vat_rates'    => '2500',          // kommagetrennt, Hundertstel-Prozent
    'receipt_footer' => "Tak for besøget – glædelig jul!",
    'pay_cash'     => '1',
    'pay_card'     => '1',
    'pay_mobilepay' => '1',
    'pay_other'    => '0',
    'mobilepay_number' => '',
    'round_cash'   => '50',            // Barzahlung auf 50 Øre runden (Dänemark); 0 = aus
    'next_ean'     => '1',
    'print_default' => 'bon',          // bon = Bondrucker, a4 = A4-Rechnung
    'receipt_qr'   => '1',             // nach dem Bezahlen QR-Code für den digitalen Beleg zeigen
    'bon_width'    => '80',            // Bonrolle 80 oder 58 mm
    'invoice_note' => '',              // z. B. Bankverbindung unter der A4-Rechnung
    'web_ship_dk'  => '4900',          // Versand Dänemark in Øre
    'web_ship_de'  => '9900',          // Versand Deutschland in Øre
    'web_ship_free' => '0',            // ab diesem Warenwert versandkostenfrei (0 = nie)
    'web_eur_rate' => '7.46',          // 1 Euro = so viele Kronen (nur als Hinweis)
    'web_pay_pickup' => '1',           // Bezahlen bei Abholung
    'web_pay_mobilepay' => '1',
    'web_pay_bank' => '0',
    'web_pay_card' => '0',             // Karte über SumUp (Online-Bezahlseite)
    'web_bank_text' => '',             // Bankverbindung für Überweisung
    'web_shop_on'  => '1',             // Bestellen im Online-Shop möglich
    'calc_wage'    => '150',           // Preiskalkulation: Stundenlohn in Kronen
    'calc_markup'  => '30',            // Gewinnaufschlag in Prozent
    'calc_fee'     => '0',             // Kartengebühr in Prozent
    'calc_vat'     => '1',             // Moms auf den Preis rechnen
    'calc_round'   => '5',             // auf volle 5 oder 10 Kronen runden
    'calc_round_mode' => 'up',         // up = aufrunden, near = kaufmännisch
    'calc_wage_mode' => 'standard',    // standard = fester Stundensatz, bedarf = aus dem Monatsbedarf errechnet
    'calc_need'    => '0',             // so viel Geld braucht man im Monat netto (Kronen)
    'calc_tax'     => '35',            // geschätzte Steuern und Abgaben in Prozent
    'calc_fixed'   => '0',             // feste Kosten pro Monat (Kronen), z. B. Miete, Strom
    'calc_hours'   => '100',           // so viele Stunden im Monat wird gebastelt
    'sumup_enabled' => '0',
    'sumup_api_key' => '',
    'sumup_affiliate_key' => '',
    'sumup_app_id' => '',
    'sumup_merchant' => '',
    'sumup_reader_id' => '',
    'sumup_reader_name' => '',
];

function setting(string $key): string {
    static $cache = null;
    if ($cache === null) {
        $cache = SHOP_DEFAULTS;
        foreach (db()->query('SELECT key, value FROM settings') as $r) $cache[$r['key']] = $r['value'];
    }
    return (string)($cache[$key] ?? '');
}
function set_setting(string $key, string $value): void {
    db()->prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        ->execute([$key, $value]);
}
function vat_rates(): array {
    $r = array_values(array_filter(array_map('intval', explode(',', setting('vat_rates'))), fn($v) => $v >= 0));
    return $r ?: [2500];
}

/* ---------- Geld ---------- */
function money(int $cents, bool $cur = true): string {
    $s = number_format($cents / 100, 2, ',', '.');
    return $cur ? $s . ' ' . setting('currency') : $s;
}
/* "12,50" / "12.50" / "1.234,50" → 1250 */
function parse_money(string $s): ?int {
    $s = trim(str_replace([' ', setting('currency'), 'kr.', 'kr', '€'], '', $s));
    if ($s === '') return null;
    if (preg_match('/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/', $s)) $s = str_replace(['.', ','], ['', '.'], $s);
    else $s = str_replace(',', '.', $s);
    if (!is_numeric($s)) return null;
    return (int)round((float)$s * 100);
}
function parse_qty(string $s): ?float {
    $s = str_replace(',', '.', trim($s));
    return is_numeric($s) ? round((float)$s, 3) : null;
}
function fmt_qty(float $q): string {
    return rtrim(rtrim(number_format($q, 3, ',', ''), '0'), ',');
}
function vat_label(int $v): string { return rtrim(rtrim(number_format($v / 100, 2, ',', ''), '0'), ',') . ' %'; }
/* Steueranteil aus einem Bruttobetrag */
function vat_of(int $gross, int $vat): int { return (int)round($gross * $vat / (10000 + $vat)); }
function now(): string { return date('Y-m-d H:i:s'); }
function fmt_dt(?string $dt): string { return $dt ? date('d.m.Y H:i', strtotime($dt)) : '–'; }

/* ---------- EAN-13 ---------- */
function ean_check(string $d12): int {
    $sum = 0;
    for ($i = 0; $i < 12; $i++) $sum += (int)$d12[$i] * ($i % 2 ? 3 : 1);
    return (10 - $sum % 10) % 10;
}
function ean_valid(string $code): bool {
    return (bool)preg_match('/^\d{13}$/', $code) && ean_check(substr($code, 0, 12)) === (int)$code[12];
}
/* Eigene Strichcodes für Artikel ohne Herstellercode: Präfix 20–29 ist für den Ladeninternen Gebrauch reserviert. */
function next_internal_ean(): string {
    $db = db();
    for ($n = max(1, (int)setting('next_ean')); ; $n++) {
        $d12 = '20' . str_pad((string)$n, 10, '0', STR_PAD_LEFT);
        $code = $d12 . ean_check($d12);
        $st = $db->prepare('SELECT 1 FROM products WHERE barcode = ?');
        $st->execute([$code]);
        if (!$st->fetchColumn()) { set_setting('next_ean', (string)($n + 1)); return $code; }
    }
}

/* ---------- Produktbilder (data/produkte, öffentlich lesbar) ---------- */
const JK_IMG_DIR = JK_DATA . '/produkte';

function product_image_url(string $file, string $prefix = '../'): string {
    return $file !== '' ? $prefix . '../data/produkte/' . rawurlencode($file) : '';
}
/* Hochgeladenes Foto quadratisch zuschneiden, auf 480 px verkleinern und als JPEG speichern. Gibt den Dateinamen zurück. */
function save_product_image(int $productId, string $tmp): string {
    $info = @getimagesize($tmp);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) throw new ShopError('Bitte ein Foto als JPG, PNG oder WebP hochladen.');
    if ($info[0] * $info[1] > 50_000_000) throw new ShopError('Das Foto ist zu groß.');
    $src = match ($info[2]) {
        IMAGETYPE_JPEG => imagecreatefromjpeg($tmp), IMAGETYPE_PNG => imagecreatefrompng($tmp),
        IMAGETYPE_WEBP => imagecreatefromwebp($tmp), default => imagecreatefromgif($tmp),
    };
    if (!$src) throw new ShopError('Das Foto konnte nicht gelesen werden.');
    // Handyfotos: Drehung aus den Kameradaten übernehmen
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $o = (int)(@exif_read_data($tmp)['Orientation'] ?? 1);
        $rot = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
        if ($rot) $src = imagerotate($src, $rot, 0);
    }
    $w = imagesx($src); $h = imagesy($src); $side = min($w, $h);
    $size = min(480, $side);
    $dst = imagecreatetruecolor($size, $size);
    imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));   // transparente PNGs auf Weiß
    imagecopyresampled($dst, $src, 0, 0, (int)(($w - $side) / 2), (int)(($h - $side) / 2), $size, $size, $side, $side);
    if (!is_dir(JK_IMG_DIR)) mkdir(JK_IMG_DIR, 0755, true);
    $name = $productId . '-' . bin2hex(random_bytes(4)) . '.jpg';
    if (!imagejpeg($dst, JK_IMG_DIR . '/' . $name, 82)) throw new ShopError('Das Foto konnte nicht gespeichert werden.');
    return $name;
}
function delete_product_image(string $file): void {
    if ($file !== '' && preg_match('/^[0-9]+-[0-9a-f]{8}\.jpg$/', $file)) @unlink(JK_IMG_DIR . '/' . $file);
}
