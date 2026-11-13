<?php
// Familienkalender – Sync-Server (PHP 7.4+ mit PDO-SQLite)
// Einfach den Ordner "kalender" auf den Webspace hochladen. Fertig.
declare(strict_types=1);
// Nur verschlüsselt: http -> https umleiten (der Gruppen-Code darf nie unverschlüsselt übertragen werden)
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    || (($_SERVER['REQUEST_SCHEME'] ?? '') === 'https')
    || (($_SERVER['SERVER_PORT'] ?? '') == 443);
$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if (!$isHttps && !$isLocal) {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        header('Location: https://' . ($_SERVER['HTTP_HOST'] ?? '') . ($_SERVER['REQUEST_URI'] ?? ''), true, 301);
        exit;
    }
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"ok":false,"error":"Bitte https verwenden"}';
    exit;
}
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Group-Key');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { exit; }

const DATA_DIR = __DIR__ . '/data';
const PHOTO_DIR = DATA_DIR . '/photos';
const MAX_PHOTO = 8 * 1024 * 1024;

function out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $code = 400): void { out(['ok' => false, 'error' => $msg], $code); }
function nowMs(): int { return (int) round(microtime(true) * 1000); }

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0775, true);
    if (!is_dir(PHOTO_DIR)) mkdir(PHOTO_DIR, 0775, true);
    $pdo = new PDO('sqlite:' . DATA_DIR . '/kalender.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT, created INTEGER)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS items (group_id INTEGER, kind TEXT, id TEXT, data TEXT, deleted INTEGER DEFAULT 0, ts INTEGER, PRIMARY KEY(group_id, kind, id))');
    $pdo->exec('CREATE INDEX IF NOT EXISTS items_ts ON items(group_id, ts)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS auth_fail (ip TEXT, at INTEGER)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS auth_fail_ip ON auth_fail(ip, at)');
    return $pdo;
}

function body(): array {
    $raw = file_get_contents('php://input');
    $j = json_decode($raw ?: '[]', true);
    return is_array($j) ? $j : [];
}

/** Schutz gegen Code-Raten: 10 Fehlversuche in 15 Minuten -> 1 Stunde gesperrt (nur diese IP) */
const FAIL_MAX = 10;
function clientIp(): string { return (string) ($_SERVER['REMOTE_ADDR'] ?? '?'); }
function checkLocked(): void {
    $st = db()->prepare('SELECT COUNT(*) FROM auth_fail WHERE ip = ? AND at > ?');
    $st->execute([clientIp(), time() - 3600]);
    if ((int) $st->fetchColumn() >= FAIL_MAX) {
        // nur sperren, wenn die Fehlversuche gehäuft (innerhalb 15 Min.) kamen
        $st = db()->prepare('SELECT MAX(at) - MIN(at) FROM (SELECT at FROM auth_fail WHERE ip = ? AND at > ? ORDER BY at DESC LIMIT ' . FAIL_MAX . ')');
        $st->execute([clientIp(), time() - 3600]);
        if ((int) $st->fetchColumn() <= 900) {
            header('Retry-After: 3600');
            fail('Zu viele falsche Codes – bitte in einer Stunde erneut versuchen', 429);
        }
    }
}
function noteFail(): void {
    db()->prepare('INSERT INTO auth_fail (ip, at) VALUES (?, ?)')->execute([clientIp(), time()]);
    db()->prepare('DELETE FROM auth_fail WHERE at < ?')->execute([time() - 86400]);
}

function groupFromKey(): array {
    checkLocked();
    $key = $_SERVER['HTTP_X_GROUP_KEY'] ?? ($_GET['k'] ?? '');
    $key = strtoupper(trim((string) $key));
    if ($key === '') fail('Gruppen-Code fehlt', 401); // kein Rate-Versuch, zählt nicht
    $st = db()->prepare('SELECT * FROM groups WHERE code = ?');
    $st->execute([$key]);
    $g = $st->fetch(PDO::FETCH_ASSOC);
    if (!$g) { noteFail(); fail('Gruppen-Code unbekannt', 401); }
    return $g;
}

function newCode(): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $c = '';
        for ($i = 0; $i < 8; $i++) $c .= $chars[random_int(0, strlen($chars) - 1)];
        $st = db()->prepare('SELECT 1 FROM groups WHERE code = ?');
        $st->execute([$c]);
    } while ($st->fetch());
    return $c;
}

function saveItem(int $gid, string $kind, array $item, $raw = null): int {
    $id = (string) ($item['id'] ?? '');
    if ($id === '' || strlen($id) > 64 || !preg_match('/^[A-Za-z0-9_-]+$/', $id)) fail('Ungültige ID');
    $ts = nowMs();
    $deleted = !empty($item['deleted']) ? 1 : 0;
    // Original-JSON behalten (leere Objekte {} bleiben Objekte)
    if (is_object($raw)) { $raw->updatedAt = $ts; $json = json_encode($raw, JSON_UNESCAPED_UNICODE); }
    else { $item['updatedAt'] = $ts; $json = json_encode($item, JSON_UNESCAPED_UNICODE); }
    $st = db()->prepare('INSERT INTO items (group_id, kind, id, data, deleted, ts) VALUES (?,?,?,?,?,?)
        ON CONFLICT(group_id, kind, id) DO UPDATE SET data=excluded.data, deleted=excluded.deleted, ts=excluded.ts');
    $st->execute([$gid, $kind, $id, $json, $deleted, $ts]);
    return $ts;
}

$a = $_GET['a'] ?? '';
try {
    switch ($a) {
        case 'ping':
            db();
            out(['ok' => true, 'app' => 'familienkalender', 'version' => 1, 'time' => nowMs()]);

        case 'create_group':
            // Neue Gruppen nur, wenn ausdrücklich freigeschaltet (Datei data/allow_create_group anlegen).
            // Die Familie besteht schon – so können Fremde hier keine Gruppen anlegen.
            if (!is_file(DATA_DIR . '/allow_create_group')) fail('Neue Kalender anlegen ist auf diesem Server abgeschaltet. Bitte mit Gruppen-Code beitreten.', 403);
            checkLocked();
            $b = body();
            $name = trim((string) ($b['name'] ?? 'Familie'));
            // Umzug von einem anderen Server: gewünschten Code übernehmen, wenn er frei ist
            $want = strtoupper(trim((string) ($b['code'] ?? '')));
            if ($want !== '') {
                if (!preg_match('/^[A-HJ-NP-Z2-9]{8}$/', $want)) fail('Ungültiger Code');
                $st = db()->prepare('SELECT 1 FROM groups WHERE code = ?');
                $st->execute([$want]);
                if ($st->fetch()) fail('Code schon vergeben', 409);
                $code = $want;
            } else {
                $code = newCode();
            }
            db()->prepare('INSERT INTO groups (code, name, created) VALUES (?,?,?)')->execute([$code, mb_substr($name, 0, 60), nowMs()]);
            out(['ok' => true, 'code' => $code, 'name' => $name]);

        case 'group':
            $g = groupFromKey();
            out(['ok' => true, 'name' => $g['name'], 'code' => $g['code']]);

        case 'rename_group':
            $g = groupFromKey();
            $b = body();
            db()->prepare('UPDATE groups SET name = ? WHERE id = ?')->execute([mb_substr(trim((string) ($b['name'] ?? '')), 0, 60), $g['id']]);
            out(['ok' => true]);

        case 'sync':
            $g = groupFromKey();
            $since = (int) ($_GET['since'] ?? 0);
            $st = db()->prepare('SELECT kind, data, ts FROM items WHERE group_id = ? AND ts > ? ORDER BY ts');
            $st->execute([$g['id'], $since]);
            $items = ['member' => [], 'event' => [], 'place' => [], 'template' => []];
            $max = $since;
            while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
                $d = json_decode($r['data']);
                if (!is_object($d)) continue;
                $items[$r['kind']][] = $d;
                if ((int) $r['ts'] > $max) $max = (int) $r['ts'];
            }
            out(['ok' => true, 'group' => $g['name'], 'since' => $max, 'members' => $items['member'], 'events' => $items['event'],
                 'places' => $items['place'], 'templates' => $items['template']]);

        case 'save':
            $g = groupFromKey();
            $b = body();
            $kind = (string) ($b['kind'] ?? '');
            if (!in_array($kind, ['member', 'event', 'place', 'template'], true)) fail('Unbekannter Typ');
            $item = $b['item'] ?? null;
            if (!is_array($item)) fail('Daten fehlen');
            $rawBody = json_decode(file_get_contents('php://input'));
            $ts = saveItem((int) $g['id'], $kind, $item, $rawBody->item ?? null);
            out(['ok' => true, 'updatedAt' => $ts]);

        case 'photo_upload':
            $g = groupFromKey();
            if (empty($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) fail('Kein Foto empfangen');
            if ($_FILES['photo']['size'] > MAX_PHOTO) fail('Foto zu groß (max. 8 MB)');
            $info = @getimagesize($_FILES['photo']['tmp_name']);
            if (!$info) fail('Keine Bilddatei');
            $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/heic' => 'heic'][$info['mime']] ?? 'jpg';
            $name = $g['id'] . '_' . bin2hex(random_bytes(12)) . '.' . $ext;
            if (!move_uploaded_file($_FILES['photo']['tmp_name'], PHOTO_DIR . '/' . $name)) fail('Speichern fehlgeschlagen', 500);
            out(['ok' => true, 'name' => $name]);

        case 'photo':
            $g = groupFromKey();
            $name = basename((string) ($_GET['name'] ?? ''));
            if (!preg_match('/^(\d+)_[a-f0-9]+\.(jpg|png|webp|heic)$/', $name, $m) || (int) $m[1] !== (int) $g['id']) fail('Nicht gefunden', 404);
            $path = PHOTO_DIR . '/' . $name;
            if (!is_file($path)) fail('Nicht gefunden', 404);
            $mime = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'heic' => 'image/heic'][$m[2]];
            header('Content-Type: ' . $mime);
            header('Cache-Control: private, max-age=31536000');
            readfile($path);
            exit;

        default:
            fail('Unbekannte Aktion', 404);
    }
} catch (Throwable $e) {
    fail('Serverfehler: ' . $e->getMessage(), 500);
}
