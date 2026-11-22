<?php
/* MCP-Schnittstelle (Model Context Protocol) für das Auftragstool.
   Damit kann Claude (claude.ai, Claude-App, Claude Code) das Auftragstool bedienen.

   Einrichten: als Admin angemeldet https://<domain>/auftraege/mcp.php im Browser öffnen,
   „Schlüssel erzeugen“ klicken und die angezeigte Adresse in Claude als eigenen Connector eintragen.

   Technik: „Streamable HTTP“ ohne Server-Events (jede Anfrage = eine JSON-Antwort). Jedes Werkzeug ruft
   intern dieselbe Aktion von api.php auf wie die Oberfläche – gleiche Prüfungen, gleiche Regeln. */
declare(strict_types=1);
define('WF_MCP', true);
require_once __DIR__ . '/inc/bootstrap.php';

const MCP_NAME = 'wunsch-fabrik-auftraege';
const MCP_VERSION = '1.0.0';
const MCP_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

// ---------- Werkzeuge: Name => [Beschreibung, Eingabe-Schema, Aktion in api.php, GET/POST, schreibend?] ----------
function mcp_s(string $desc, string $type = 'string', array $extra = []): array
{
    return ['type' => $type, 'description' => $desc] + $extra;
}
function mcp_obj(array $props, array $required = []): array
{
    $o = ['type' => 'object', 'properties' => (object)$props];
    if ($required) {
        $o['required'] = $required;
    }
    return $o;
}

function mcp_tools(): array
{
    $status = mcp_s('Auftragsstatus: inquiry (Anfrage), approval (Freigabe), material (Material), production (Produktion), done (fertig), delivered (abgeholt/versendet)', 'string',
        ['enum' => ['inquiry', 'approval', 'material', 'production', 'done', 'delivered']]);
    $pay = mcp_s('Zahlstatus: open (offen), deposit (Anzahlung), paid (bezahlt)', 'string', ['enum' => ['open', 'deposit', 'paid']]);
    $id = mcp_s('ID (Zahl, nicht die Auftragsnummer)', 'integer');
    $date = fn(string $d) => mcp_s($d . ' (JJJJ-MM-TT)');
    $item = mcp_obj([
        'product_id' => mcp_s('Produkt-ID aus dem Katalog (optional)', 'integer'),
        'name' => mcp_s('Bezeichnung der Position'),
        'sku' => mcp_s('Artikelnummer (optional)'),
        'qty' => mcp_s('Menge (wird aus sizes berechnet, wenn angegeben)', 'integer'),
        'sizes' => mcp_s('Mengen je Größe, z. B. {"S":3,"M":4}', 'object'),
        'opts' => mcp_s('Gewählte Eigenschaften, z. B. {"Farbe":"Schwarz"}', 'object'),
        'price' => mcp_s('Stückpreis', 'number'),
        'disc' => mcp_s('Rabatt (Prozent oder Betrag, siehe disc_type)', 'number'),
        'disc_type' => mcp_s('pct = Prozent, abs = Betrag', 'string', ['enum' => ['pct', 'abs']]),
        'processes' => mcp_s('Verfahren dieser Position: [{"process_id":1,"per_piece":10}] – per_piece = Minuten je Stück (1–60)', 'array', ['items' => ['type' => 'object']]),
        'src_name' => mcp_s('Bezugsquelle/Lieferant (nur intern)'),
        'src_url' => mcp_s('Link zur Bezugsquelle (nur intern)'),
        'src_sku' => mcp_s('Hersteller-Artikelnummer (nur intern)'),
    ], ['name']);
    $invLine = mcp_obj([
        'description' => mcp_s('Text der Position'),
        'qty' => mcp_s('Menge', 'number'),
        'unit' => mcp_s('Einheit, z. B. stk, timer'),
        'unit_price' => mcp_s('Einzelpreis (wie prices_incl angibt mit oder ohne Moms)', 'number'),
        'discount' => mcp_s('Rabatt in Prozent (0–100)', 'number'),
        'kind' => mcp_s('goods = Ware, services = Leistung', 'string', ['enum' => ['goods', 'services']]),
    ], ['description', 'unit_price']);

    return [
        'info' => ['Grunddaten des Auftragstools: Status-Werte, Verfahren (process_types mit IDs), Personen (workers), Firmendaten, Einheiten, Ausgabenkategorien. Zuerst aufrufen, um IDs zu kennen.',
            mcp_obj([]), 'me', 'GET', false],
        'auftraege_liste' => ['Aufträge suchen und auflisten (höchstens 500, nach Abgabetermin sortiert).',
            mcp_obj([
                'show' => mcp_s('active = offene (Standard), all = alle, trash = Papierkorb', 'string', ['enum' => ['active', 'all', 'trash']]),
                'q' => mcp_s('Suche in Nummer, Titel, Artikel, Kundenname, Firma'),
                'status' => $status, 'pay' => $pay,
                'worker' => mcp_s('Nur Aufträge dieser Person (worker_id)', 'integer'),
                'customer_id' => mcp_s('Nur Aufträge dieses Kunden', 'integer'),
                'process' => mcp_s('Nur Aufträge mit diesem Verfahren (process_id)', 'integer'),
                'from' => $date('Abgabetermin ab'), 'to' => $date('Abgabetermin bis'),
                'overdue' => mcp_s('true = nur überfällige', 'boolean'),
            ]), 'orders', 'GET', false],
        'auftrag_lesen' => ['Einen Auftrag vollständig lesen (Kunde, Positionen, Verfahren, Planung, Dateien, Verlauf, Rechnungen).',
            mcp_obj(['id' => $id], ['id']), 'order', 'GET', false],
        'auftrag_speichern' => ['Auftrag anlegen (ohne id) oder ändern (mit id). ACHTUNG beim Ändern: Es werden ALLE Felder neu gesetzt – vorher auftrag_lesen aufrufen und alle Werte (auch items) vollständig mitschicken. Ohne plan_date plant die App selbst den frühesten freien Produktionstag. Der Abgabetermin muss nach dem Produktionsende liegen.',
            mcp_obj([
                'id' => mcp_s('Auftrags-ID zum Ändern; weglassen für neuen Auftrag', 'integer'),
                'customer_id' => mcp_s('Kunden-ID (vorher mit kunden_suchen ermitteln oder kunde_speichern anlegen)', 'integer'),
                'title' => mcp_s('Titel des Auftrags'),
                'description' => mcp_s('Beschreibung'),
                'article' => mcp_s('Artikel (Kurztext)'),
                'notes' => mcp_s('Interne Notizen'),
                'qty' => mcp_s('Menge (nur ohne items)', 'integer'),
                'items' => mcp_s('Positionen (Produkte)', 'array', ['items' => $item]),
                'processes' => mcp_s('Nur ohne items: [{"process_id":1,"per_piece":10}]', 'array', ['items' => ['type' => 'object']]),
                'price' => mcp_s('Gesamtpreis', 'number'),
                'deposit' => mcp_s('Anzahlung (Pflicht bei pay_status=deposit)', 'number'),
                'currency' => mcp_s('Währung, z. B. DKK oder EUR'),
                'status' => $status, 'pay_status' => $pay,
                'due_date' => $date('Abgabetermin'),
                'plan_date' => $date('Produktionstag (optional)'),
                'start_time' => mcp_s('Startzeit HH:MM (optional)'),
                'worker_id' => mcp_s('Person (Standard 1)', 'integer'),
            ], ['customer_id', 'title', 'currency']), 'order_save', 'POST', true],
        'auftrag_status' => ['Nur Status und/oder Zahlstatus eines Auftrags ändern. Bei status=delivered legt die App automatisch eine Schlussrechnung als Entwurf an; ggf. bekommt der Kunde eine Status-Mail.',
            mcp_obj([
                'id' => $id, 'status' => $status, 'pay_status' => $pay,
                'ship_mode' => mcp_s('Nur bei delivered: pickup (abgeholt) oder ship (verschickt)'),
                'carrier' => mcp_s('Versanddienst (bei ship)'),
                'tracking_no' => mcp_s('Sendungsnummer (bei ship)'),
            ], ['id']), 'order_status', 'POST', true],
        'kunden_suchen' => ['Kunden suchen (Name, Firma, E-Mail, Telefon). Leere Suche = alle (höchstens 300).',
            mcp_obj(['q' => mcp_s('Suchtext')]), 'customers', 'GET', false],
        'kunde_lesen' => ['Einen Kunden mit seinen Aufträgen und Rechnungen lesen.', mcp_obj(['id' => $id], ['id']), 'customer', 'GET', false],
        'kunde_speichern' => ['Kunden anlegen (ohne id) oder ändern (mit id; alle Felder mitschicken).',
            mcp_obj([
                'id' => mcp_s('Kunden-ID zum Ändern', 'integer'),
                'name' => mcp_s('Name'), 'company' => mcp_s('Firma'), 'email' => mcp_s('E-Mail'), 'phone' => mcp_s('Telefon'),
                'address' => mcp_s('Adresse (mehrzeilig)'), 'country' => mcp_s('Land als ISO-Code, z. B. DK, DE'),
                'is_business' => mcp_s('Firmenkunde?', 'boolean'), 'vat_id' => mcp_s('USt-IdNr./CVR'),
                'currency' => mcp_s('Währung'), 'doc_lang' => mcp_s('Belegsprache: de, da, en (leer = automatisch)'),
                'notes' => mcp_s('Notizen'), 'no_followup' => mcp_s('Keine Nachfrage-Mails', 'boolean'),
            ], ['name']), 'customer_save', 'POST', true],
        'produkte' => ['Produktkatalog mit Preisen, Eigenschaften und Kategorien.', mcp_obj([]), 'products', 'GET', false],
        'kategorien' => ['Produktkategorien.', mcp_obj([]), 'categories', 'GET', false],
        'kalender' => ['Geplante Produktion und Abgaben in einem Zeitraum (Standard: heute + 4 Wochen).',
            mcp_obj(['from' => $date('Von'), 'to' => $date('Bis')]), 'calendar', 'GET', false],
        'termin_vorschlaege' => ['Nächste freie Produktionstage für eine Arbeitsdauer.',
            mcp_obj(['worker_id' => mcp_s('Person', 'integer'), 'total' => mcp_s('Gesamtdauer in Minuten', 'integer'),
                'from' => $date('Frühestens ab'), 'limit' => mcp_s('Anzahl Vorschläge (Standard 6)', 'integer')], ['total']), 'plan_options', 'GET', false],
        'notiz_auswerten' => ['Freien Text (z. B. Kundennachricht, Telefonnotiz) in einen Auftragsentwurf umwandeln lassen. Speichert nichts.',
            mcp_obj(['text' => mcp_s('Notiztext')], ['text']), 'note_parse', 'POST', false],
        'rechnungen_liste' => ['Rechnungen auflisten mit Summen (offen, überfällig).',
            mcp_obj(['q' => mcp_s('Suche'), 'customer_id' => mcp_s('Kunde', 'integer'), 'year' => mcp_s('Jahr, z. B. 2026'),
                'state' => mcp_s('draft, open, overdue, unpaid, paid, credit, refund')]), 'invoices', 'GET', false],
        'rechnung_lesen' => ['Eine Rechnung mit Positionen und Zahlungen lesen.', mcp_obj(['id' => $id], ['id']), 'invoice', 'GET', false],
        'rechnung_entwurf_speichern' => ['Rechnungsentwurf anlegen (ohne id) oder ändern. Wird NICHT festgeschrieben. Die Moms-Regel wählt die App selbst.',
            mcp_obj([
                'id' => mcp_s('Entwurfs-ID zum Ändern', 'integer'),
                'customer_id' => mcp_s('Kunde', 'integer'), 'order_id' => mcp_s('Zugehöriger Auftrag (optional)', 'integer'),
                'issue_date' => $date('Rechnungsdatum'), 'due_date' => $date('Fällig am'), 'delivery_date' => $date('Lieferdatum'),
                'currency' => mcp_s('DKK oder EUR'), 'lang' => mcp_s('de, da oder en'), 'prices_incl' => mcp_s('Preise inkl. Moms?', 'boolean'),
                'note' => mcp_s('Bemerkung'), 'lines' => mcp_s('Positionen', 'array', ['items' => $invLine]),
            ], ['customer_id', 'lines']), 'invoice_save', 'POST', true],
        'rechnung_festschreiben' => ['Rechnungsentwurf endgültig festschreiben (bekommt fortlaufende Nummer, danach NICHT mehr änderbar oder löschbar). Nur nach ausdrücklicher Bestätigung durch den Benutzer aufrufen!',
            mcp_obj(['id' => $id], ['id']), 'invoice_approve', 'POST', true],
        'zahlung_erfassen' => ['Zahlungseingang zu einer festgeschriebenen Rechnung buchen (Teilzahlung möglich). Kann nur storniert, nicht gelöscht werden.',
            mcp_obj(['id' => mcp_s('Rechnungs-ID', 'integer'), 'amount' => mcp_s('Betrag', 'number'), 'date' => $date('Zahlungsdatum'),
                'method' => mcp_s('Zahlungsart', 'string', ['enum' => ['bank', 'mobilepay', 'cash', 'card', 'other']]), 'note' => mcp_s('Notiz')], ['id', 'amount']), 'invoice_pay', 'POST', true],
        'ausgaben_liste' => ['Ausgaben/Belege auflisten.',
            mcp_obj(['q' => mcp_s('Suche'), 'year' => mcp_s('Jahr'), 'state' => mcp_s('Filter, z. B. draft, booked')]), 'expenses', 'GET', false],
        'moms_uebersicht' => ['Moms-Cockpit eines Jahres: Zeiträume, Fristen, offene Aufgaben.',
            mcp_obj(['year' => mcp_s('Jahr', 'integer')]), 'tax_overview', 'GET', false],
        'api_aufruf' => ['Beliebige weitere Aktion von api.php aufrufen (für alles, wofür es kein eigenes Werkzeug gibt), z. B. order_ship, order_delete, order_restore, product_save, category_save, invoice_credit, invoice_pay_reverse, expense_save, expense_approve, bank, bank_match, blocked_save, workers_save, confirm_create. Schreibende Aktionen mit method=POST und body. Gesperrt: Backups, Schlüssel, Benutzer, Löschen aller Daten, Datei-Uploads.',
            mcp_obj(['action' => mcp_s('Name der Aktion (Parameter a)'), 'method' => mcp_s('GET oder POST', 'string', ['enum' => ['GET', 'POST']]),
                'query' => mcp_s('GET-Parameter', 'object'), 'body' => mcp_s('JSON-Daten bei POST', 'object')], ['action']), '*', '*', true],
    ];
}

// Für api_aufruf gesperrt: Dateien statt JSON, Schlüssel/Zugänge, Massenlöschung, Uploads
const MCP_BLOCKED = ['backup', 'revisor_zip', 'purge', 'ai_key_save', 'token_create', 'token_revoke', 'app_token_create', 'app_token_revoke', 'app_tokens',
    'device_revoke', 'users_save', 'admin_url_save', 'file_upload', 'product_image_upload', 'expense_upload', 'app_pair', 'archive_save', 'company_save'];

// ---------- Schlüssel ----------
function mcp_key_hash(): string
{
    return (string)(wf_db()->query("SELECT value FROM meta WHERE key = 'mcp_key_hash'")->fetchColumn() ?: '');
}
function mcp_sent_key(): string
{
    $h = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+([0-9a-f]{64})$/i', trim($h), $m)) {
        return strtolower($m[1]);
    }
    $k = (string)($_GET['k'] ?? '');
    return preg_match('/^[0-9a-f]{64}$/', $k) ? $k : '';
}

// ---------- Antworten ----------
function mcp_send($payload, int $code = 200): never
{
    header_remove('Set-Cookie');
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function mcp_result($id, array $result): array
{
    return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
}
function mcp_error($id, int $code, string $msg): array
{
    return ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $msg]];
}
function mcp_text($id, string $text, bool $isError = false): array
{
    return mcp_result($id, ['content' => [['type' => 'text', 'text' => $text]], 'isError' => $isError]);
}

// ---------- Einrichtungsseite (Browser, als Admin angemeldet) ----------
function mcp_setup_page(): never
{
    $u = wf_user();
    header('Content-Type: text/html; charset=utf-8');
    if (!$u || !empty($u['app'])) {
        http_response_code(401);
        exit('<!doctype html><meta charset="utf-8"><p style="font:16px system-ui;margin:40px">Bitte zuerst als Admin anmelden und diese Seite dann neu laden.</p>');
    }
    $db = wf_db();
    $msg = '';
    $newUrl = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals(wf_csrf(), (string)($_POST['csrf'] ?? ''))) {
            exit('Sitzung abgelaufen. Bitte neu laden.');
        }
        if (($_POST['do'] ?? '') === 'create') {
            $key = bin2hex(random_bytes(32));
            $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('mcp_key_hash', ?)")->execute([hash('sha256', $key)]);
            $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('mcp_key_created', ?)")->execute([date('Y-m-d H:i')]);
            $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
            $newUrl = ($https ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . strtok((string)$_SERVER['REQUEST_URI'], '?') . '?k=' . $key;
        } elseif (($_POST['do'] ?? '') === 'revoke') {
            $db->exec("DELETE FROM meta WHERE key IN ('mcp_key_hash', 'mcp_key_created', 'mcp_last_used')");
            $msg = 'Der Schlüssel ist gesperrt. Claude hat keinen Zugriff mehr.';
        }
    }
    $has = mcp_key_hash() !== '';
    $created = (string)($db->query("SELECT value FROM meta WHERE key = 'mcp_key_created'")->fetchColumn() ?: '');
    $last = (string)($db->query("SELECT value FROM meta WHERE key = 'mcp_last_used'")->fetchColumn() ?: '');
    $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $csrf = $e(wf_csrf());
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Claude-Zugang · Aufträge</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;color:#222;background:#faf8f5}
h1{font-size:1.5rem}.box{background:#fff;border:1px solid #ddd;border-radius:10px;padding:16px;margin:16px 0}code,input.url{font:14px ui-monospace,monospace;word-break:break-all}
input.url{width:100%;padding:10px;box-sizing:border-box}button{font:inherit;padding:10px 16px;border-radius:8px;border:0;background:#5b6b4f;color:#fff;cursor:pointer}
button.red{background:#9b2c2c}.warn{background:#fff4d6;border-color:#e8c766}ol li{margin:4px 0}</style></head><body>
<h1>Claude-Zugang (MCP) für das Auftragstool</h1>';
    if ($msg) {
        echo '<div class="box">' . $e($msg) . '</div>';
    }
    if ($newUrl) {
        echo '<div class="box warn"><strong>Neue Connector-Adresse – nur jetzt sichtbar, gleich kopieren:</strong><br><input class="url" readonly value="' . $e($newUrl) . '" onclick="this.select()">
<p>Wer diese Adresse kennt, kann das Auftragstool bedienen. Nicht weitergeben. Ein neuer Schlüssel macht den alten ungültig.</p></div>';
    }
    echo '<div class="box"><p>Status: ' . ($has ? '<strong>aktiv</strong> (erzeugt ' . $e($created) . ($last ? ', zuletzt benutzt ' . $e($last) : ', noch nicht benutzt') . ')' : '<strong>kein Schlüssel</strong> – Claude hat keinen Zugriff') . '</p>
<form method="post" style="display:inline"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="do" value="create"><button>' . ($has ? 'Neuen Schlüssel erzeugen' : 'Schlüssel erzeugen') . '</button></form> ';
    if ($has) {
        echo '<form method="post" style="display:inline" onsubmit="return confirm(\'Zugang für Claude wirklich sperren?\')"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="do" value="revoke"><button class="red">Sperren</button></form>';
    }
    echo '</div><div class="box"><strong>In Claude eintragen</strong><ol>
<li>claude.ai → Einstellungen → Connectors → „Eigenen Connector hinzufügen“.</li>
<li>Name: <code>Aufträge</code>, URL: die Adresse von oben. Keine OAuth-Daten nötig.</li>
<li>Im Chat den Connector einschalten und z. B. fragen: „Welche Aufträge sind diese Woche fällig?“</li></ol>
<p>Claude Code: <code>claude mcp add --transport http auftraege "ADRESSE"</code></p></div></body></html>';
    exit;
}

// ---------- Ein Werkzeug ausführen: dieselbe Aktion wie die Oberfläche, Ergebnis abfangen ----------
function mcp_call_api($rpcId, string $action, string $method, array $query, array $body): never
{
    $GLOBALS['WF_MCP_USER'] = ['id' => 0, 'name' => 'Claude (MCP)', 'wf_admin_id' => 'mcp', 'active' => 1, 'mcp' => 1];
    $GLOBALS['WF_MCP_IN'] = $body;
    $GLOBALS['WF_MCP_RPC'] = $rpcId;
    $q = [];
    foreach ($query as $k => $v) {
        if (is_bool($v)) {
            $v = $v ? '1' : '';
        }
        if (is_scalar($v)) {
            $q[(string)$k] = (string)$v;
        }
    }
    $_GET = $q + ['a' => $action];
    $_GET['a'] = $action;
    $_POST = [];
    $_SERVER['REQUEST_METHOD'] = $method;
    $GLOBALS['WF_MCP_LEVEL'] = ob_get_level();
    // Vor allen anderen Abschluss-Funktionen: Ausgabe von api.php einsammeln und als MCP-Antwort verpacken
    register_shutdown_function(function (): void {
        $out = '';
        while (ob_get_level() > $GLOBALS['WF_MCP_LEVEL']) {
            $out = (string)ob_get_clean() . $out;
        }
        $code = (int)http_response_code();
        $data = json_decode($out, true);
        $err = $code >= 400 || !is_array($data) || (($data['ok'] ?? true) === false);
        if (!is_array($data)) {
            $text = $out === '' ? 'Keine Antwort von api.php (HTTP ' . $code . ').' : mb_substr(strip_tags($out), 0, 2000);
        } else {
            unset($data['csrf']);
            $text = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        }
        header_remove('Set-Cookie');
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(mcp_text($GLOBALS['WF_MCP_RPC'], $text, $err), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    });
    ob_start();
    include __DIR__ . '/api.php';
    exit;
}

// ---------- Anfrage ----------
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$sent = mcp_sent_key();

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($sent === '' && in_array($method, ['GET', 'POST'], true) && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
    mcp_setup_page();   // Browser ohne Schlüssel
}
$hash = mcp_key_hash();
if ($sent === '' || $hash === '' || !hash_equals($hash, hash('sha256', $sent))) {
    usleep(400000);
    header('WWW-Authenticate: Bearer');
    mcp_send(mcp_error(null, -32001, 'Ungültiger oder fehlender Schlüssel. Neuen Schlüssel unter auftraege/mcp.php erzeugen.'), 401);
}
if ($method !== 'POST') {
    header('Allow: POST');
    mcp_send(mcp_error(null, -32000, 'Nur POST (MCP Streamable HTTP ohne Server-Events).'), 405);
}
$db = wf_db();
$st = $db->query("SELECT value FROM meta WHERE key = 'mcp_last_used'")->fetchColumn();
if ((string)$st < date('Y-m-d H:i', time() - 300)) {
    $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('mcp_last_used', ?)")->execute([date('Y-m-d H:i')]);
}

$req = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($req)) {
    mcp_send(mcp_error(null, -32700, 'Ungültiges JSON.'), 400);
}
if (array_is_list($req)) {   // Stapel: nur Benachrichtigungen zulassen, sonst die erste Anfrage bearbeiten
    $calls = array_values(array_filter($req, fn($r) => is_array($r) && isset($r['id'])));
    if (!$calls) {
        http_response_code(202);
        exit;
    }
    $req = $calls[0];
}
$id = $req['id'] ?? null;
$rpc = (string)($req['method'] ?? '');
$params = is_array($req['params'] ?? null) ? $req['params'] : [];

if (!array_key_exists('id', $req)) {   // Benachrichtigung (z. B. notifications/initialized)
    http_response_code(202);
    exit;
}

switch ($rpc) {
    case 'initialize': {
        $want = (string)($params['protocolVersion'] ?? '');
        mcp_send(mcp_result($id, [
            'protocolVersion' => in_array($want, MCP_PROTOCOLS, true) ? $want : MCP_PROTOCOLS[0],
            'capabilities' => ['tools' => ['listChanged' => false]],
            'serverInfo' => ['name' => MCP_NAME, 'version' => MCP_VERSION],
            'instructions' => 'Auftragstool der Wunsch-Fabrik (Textilveredelung: Sticken, DTF, Gravur …). Zuerst „info“ aufrufen, um Verfahren, Personen und Status zu kennen. '
                . 'Beträge in der Währung des Auftrags. Vor dem Ändern eines Auftrags immer auftrag_lesen und dann alle Felder mitschicken. '
                . 'Festschreiben von Rechnungen und Buchen von Zahlungen ist endgültig – nur nach ausdrücklicher Zustimmung des Benutzers.',
        ]));
    }
    case 'ping':
        mcp_send(mcp_result($id, []));
    case 'tools/list': {
        $list = [];
        foreach (mcp_tools() as $name => [$desc, $schema, , , $write]) {
            $list[] = ['name' => $name, 'description' => $desc, 'inputSchema' => $schema,
                'annotations' => ['readOnlyHint' => !$write, 'destructiveHint' => in_array($name, ['rechnung_festschreiben', 'zahlung_erfassen', 'api_aufruf'], true), 'openWorldHint' => false]];
        }
        mcp_send(mcp_result($id, ['tools' => $list]));
    }
    case 'resources/list':
        mcp_send(mcp_result($id, ['resources' => []]));
    case 'prompts/list':
        mcp_send(mcp_result($id, ['prompts' => []]));
    case 'tools/call': {
        $name = (string)($params['name'] ?? '');
        $args = is_array($params['arguments'] ?? null) ? $params['arguments'] : [];
        $tools = mcp_tools();
        if (!isset($tools[$name])) {
            mcp_send(mcp_error($id, -32602, 'Unbekanntes Werkzeug: ' . $name));
        }
        [, , $action, $httpMethod] = $tools[$name];
        if ($action === '*') {
            $action = (string)($args['action'] ?? '');
            $httpMethod = strtoupper((string)($args['method'] ?? 'GET')) === 'POST' ? 'POST' : 'GET';
            if (!preg_match('/^[a-z_]{2,40}$/', $action) || in_array($action, MCP_BLOCKED, true)) {
                mcp_send(mcp_text($id, 'Diese Aktion ist über MCP nicht erlaubt: ' . $action, true));
            }
            mcp_call_api($id, $action, $httpMethod, is_array($args['query'] ?? null) ? $args['query'] : [], is_array($args['body'] ?? null) ? $args['body'] : []);
        }
        if ($httpMethod === 'GET') {
            mcp_call_api($id, $action, 'GET', $args, []);
        }
        mcp_call_api($id, $action, 'POST', [], $args);
    }
    default:
        mcp_send(mcp_error($id, -32601, 'Unbekannte Methode: ' . $rpc));
}
