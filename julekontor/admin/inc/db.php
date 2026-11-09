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
    'bon_width'    => '80',            // Bonrolle 80 oder 58 mm
    'invoice_note' => '',              // z. B. Bankverbindung unter der A4-Rechnung
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
