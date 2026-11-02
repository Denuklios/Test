<?php
// Familienkalender – Sync-Server (PHP 7.4+ mit PDO-SQLite)
// Einfach den Ordner "kalender" auf den Webspace hochladen. Fertig.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
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
    return $pdo;
}

function body(): array {
    $raw = file_get_contents('php://input');
    $j = json_decode($raw ?: '[]', true);
    return is_array($j) ? $j : [];
}

function groupFromKey(): array {
    $key = $_SERVER['HTTP_X_GROUP_KEY'] ?? ($_GET['k'] ?? '');
    $key = strtoupper(trim((string) $key));
    if ($key === '') fail('Gruppen-Code fehlt', 401);
    $st = db()->prepare('SELECT * FROM groups WHERE code = ?');
    $st->execute([$key]);
    $g = $st->fetch(PDO::FETCH_ASSOC);
    if (!$g) fail('Gruppen-Code unbekannt', 401);
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
            $b = body();
            $name = trim((string) ($b['name'] ?? 'Familie'));
            $code = newCode();
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
