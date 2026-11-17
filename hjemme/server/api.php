<?php
// Hjemme – Familien-Ortung, Sync-Server (PHP 7.4+ mit PDO-SQLite)
// Ordner "hjemme" auf den Webspace laden, fertig. Daten liegen in data/ (per .htaccess gesperrt).
declare(strict_types=1);

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    || (($_SERVER['REQUEST_SCHEME'] ?? '') === 'https')
    || (($_SERVER['SERVER_PORT'] ?? '') == 443);
$isLocal = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true);
if (!$isHttps && !$isLocal && PHP_SAPI !== 'cli') {
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
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Member, X-Token');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { exit; }

if (!defined('NB_DATA_DIR')) define('NB_DATA_DIR', __DIR__ . '/data');
const KEEP_DAYS = 30;          // Verlauf und Ereignisse so lange aufbewahren
const LOW_BATTERY = 15;        // Prozent
const MAX_AVATAR = 400 * 1024; // Bytes

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
    if (!is_dir(NB_DATA_DIR)) mkdir(NB_DATA_DIR, 0775, true);
    if (!is_dir(NB_DATA_DIR . '/avatars')) mkdir(NB_DATA_DIR . '/avatars', 0775, true);
    $pdo = new PDO('sqlite:' . NB_DATA_DIR . '/hjemme.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('PRAGMA busy_timeout=5000');
    $pdo->exec('CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, token TEXT, name TEXT, color INTEGER, emoji TEXT,
        avatar TEXT, phone TEXT, created INTEGER, last TEXT, paused INTEGER DEFAULT 0, bubble_until INTEGER DEFAULT 0,
        eta TEXT, alert_ts TEXT DEFAULT \'{}\', updated INTEGER)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS circles (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT,
        owner TEXT, created INTEGER, settings TEXT DEFAULT \'{}\')');
    $pdo->exec('CREATE TABLE IF NOT EXISTS circle_members (circle_id INTEGER, member_id TEXT, role TEXT, joined INTEGER,
        share INTEGER DEFAULT 1, PRIMARY KEY(circle_id, member_id))');
    $pdo->exec('CREATE TABLE IF NOT EXISTS places (id TEXT, circle_id INTEGER, name TEXT, icon TEXT, lat REAL, lng REAL,
        radius REAL, created_by TEXT, deleted INTEGER DEFAULT 0, ts INTEGER, PRIMARY KEY(circle_id, id))');
    $pdo->exec('CREATE TABLE IF NOT EXISTS presence (member_id TEXT, circle_id INTEGER, place_id TEXT, since INTEGER,
        PRIMARY KEY(member_id, circle_id, place_id))');
    $pdo->exec('CREATE TABLE IF NOT EXISTS locs (member_id TEXT, ts INTEGER, lat REAL, lng REAL, acc REAL, spd REAL, bat INTEGER)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS locs_m ON locs(member_id, ts)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, circle_id INTEGER, ts INTEGER,
        type TEXT, member_id TEXT, target TEXT, data TEXT)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS events_c ON events(circle_id, id)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS events_t ON events(target, id)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS throttle (ip TEXT, kind TEXT, at INTEGER)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS throttle_ip ON throttle(ip, kind, at)');
    return $pdo;
}

function q(string $sql, array $args = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

function body(): array {
    static $b = null;
    if ($b !== null) return $b;
    $raw = $GLOBALS['NB_TEST_BODY'] ?? file_get_contents('php://input');
    $j = json_decode($raw ?: '[]', true);
    return $b = (is_array($j) ? $j : []);
}

function clientIp(): string { return (string) ($_SERVER['REMOTE_ADDR'] ?? '?'); }

/** Höchstens $max Vorgänge der Art $kind je IP in $window Sekunden */
function throttle(string $kind, int $max, int $window, string $msg): void {
    $n = (int) q('SELECT COUNT(*) FROM throttle WHERE ip = ? AND kind = ? AND at > ?', [clientIp(), $kind, time() - $window])->fetchColumn();
    if ($n >= $max) { header('Retry-After: ' . $window); fail($msg, 429); }
}
function noteThrottle(string $kind): void {
    q('INSERT INTO throttle (ip, kind, at) VALUES (?, ?, ?)', [clientIp(), $kind, time()]);
    if (random_int(0, 50) === 0) q('DELETE FROM throttle WHERE at < ?', [time() - 86400 * 2]);
}

function me(): array {
    $id = (string) ($_SERVER['HTTP_X_MEMBER'] ?? '');
    $tok = (string) ($_SERVER['HTTP_X_TOKEN'] ?? '');
    if ($id === '' || $tok === '') fail('Nicht angemeldet', 401);
    $m = q('SELECT * FROM members WHERE id = ?', [$id])->fetch();
    if (!$m || !hash_equals((string) $m['token'], hash('sha256', $tok))) fail('Anmeldung ungültig', 401);
    return $m;
}

function newCode(): string {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $c = '';
        for ($i = 0; $i < 6; $i++) $c .= $chars[random_int(0, strlen($chars) - 1)];
    } while (q('SELECT 1 FROM circles WHERE code = ?', [$c])->fetch());
    return $c;
}

function newId(int $bytes = 12): string { return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '='); }

function circleOf(array $me, $cid): array {
    $c = q('SELECT c.*, cm.role, cm.share FROM circles c JOIN circle_members cm ON cm.circle_id = c.id WHERE c.id = ? AND cm.member_id = ?',
        [(int) $cid, $me['id']])->fetch();
    if (!$c) fail('Kreis nicht gefunden', 404);
    return $c;
}

function myCircleIds(string $mid): array {
    return array_map('intval', q('SELECT circle_id FROM circle_members WHERE member_id = ?', [$mid])->fetchAll(PDO::FETCH_COLUMN));
}

function addEvent(int $cid, string $type, string $mid, array $data = [], ?string $target = null): int {
    q('INSERT INTO events (circle_id, ts, type, member_id, target, data) VALUES (?,?,?,?,?,?)',
        [$cid, nowMs(), $type, $mid, $target, json_encode($data, JSON_UNESCAPED_UNICODE)]);
    return (int) db()->lastInsertId();
}

function dist(float $lat1, float $lng1, float $lat2, float $lng2): float {
    $r = 6371000.0;
    $p1 = deg2rad($lat1); $p2 = deg2rad($lat2);
    $dp = $p2 - $p1; $dl = deg2rad($lng2 - $lng1);
    $a = sin($dp / 2) ** 2 + cos($p1) * cos($p2) * sin($dl / 2) ** 2;
    return 2 * $r * asin(min(1.0, sqrt($a)));
}

function cleanColor($v): int { return max(0, min(0xFFFFFF, (int) $v)); }
function cleanText($v, int $len): string { return mb_substr(trim((string) $v), 0, $len); }

/** Öffentliche Sicht auf ein Mitglied (für andere im Kreis) */
function memberView(array $m, int $share): array {
    $last = json_decode((string) ($m['last'] ?? ''), true) ?: null;
    $now = nowMs();
    $bubble = (int) $m['bubble_until'] > $now;
    $hidden = !$share || (int) $m['paused'] === 1;
    if ($last && $hidden) {
        // nur Akku und „zuletzt gesehen“, kein Ort
        $last = ['bat' => $last['bat'] ?? null, 'chg' => $last['chg'] ?? false, 'ts' => $last['ts'] ?? 0];
    } elseif ($last && $bubble) {
        // „Blase“: nur ungefährer Ort (ca. 2 km)
        $last['lat'] = round((float) $last['lat'] * 50) / 50;
        $last['lng'] = round((float) $last['lng'] * 30) / 30;
        $last['acc'] = 2000; $last['spd'] = null; $last['hdg'] = null;
    }
    return [
        'id' => $m['id'], 'name' => $m['name'], 'color' => (int) $m['color'], 'emoji' => $m['emoji'],
        'avatar' => $m['avatar'], 'phone' => $m['phone'], 'last' => $last,
        'paused' => (int) $m['paused'] === 1, 'sharing' => (bool) $share, 'bubble' => $bubble,
        'bubbleUntil' => (int) $m['bubble_until'],
        'eta' => json_decode((string) ($m['eta'] ?? ''), true) ?: null, 'updated' => (int) $m['updated'],
    ];
}

function circleView(array $c, string $myId): array {
    $members = q('SELECT m.*, cm.role, cm.share, cm.joined FROM circle_members cm JOIN members m ON m.id = cm.member_id WHERE cm.circle_id = ? ORDER BY cm.joined',
        [$c['id']])->fetchAll();
    $mv = [];
    foreach ($members as $m) {
        $v = memberView($m, $m['id'] === $myId ? 1 : (int) $m['share']);
        $v['role'] = $m['role'];
        $v['sharing'] = (bool) $m['share'];
        $pr = q('SELECT place_id, since FROM presence WHERE member_id = ? AND circle_id = ?', [$m['id'], $c['id']])->fetch();
        $v['place'] = ($pr && (int) $m['share'] && !(int) $m['paused']) ? $pr['place_id'] : null;
        $v['placeSince'] = $pr ? (int) $pr['since'] : null;
        $mv[] = $v;
    }
    $places = q('SELECT id, name, icon, lat, lng, radius, created_by AS createdBy FROM places WHERE circle_id = ? AND deleted = 0 ORDER BY name', [$c['id']])->fetchAll();
    foreach ($places as &$p) { $p['lat'] = (float) $p['lat']; $p['lng'] = (float) $p['lng']; $p['radius'] = (float) $p['radius']; }
    return [
        'id' => (int) $c['id'], 'name' => $c['name'], 'code' => $c['code'], 'owner' => $c['owner'],
        'settings' => json_decode((string) $c['settings'], true) ?: new stdClass(),
        'members' => $mv, 'places' => $places,
    ];
}

function eventView(array $e): array {
    return ['id' => (int) $e['id'], 'circle' => (int) $e['circle_id'], 'ts' => (int) $e['ts'], 'type' => $e['type'],
        'member' => $e['member_id'], 'target' => $e['target'], 'data' => json_decode((string) $e['data'], true) ?: new stdClass()];
}

/** Ankommen/Verlassen von Orten, Akku, Tempo, ETA – nach jedem neuen Standort */
function checkRules(array $me, array $p, ?int $bat, bool $chg, ?array $prevLast): void {
    $mid = $me['id'];
    $alerts = json_decode((string) $me['alert_ts'], true) ?: [];
    $now = nowMs();
    $acc = (float) ($p['acc'] ?? 50);
    $paused = (int) $me['paused'] === 1;
    foreach (q('SELECT c.id, c.settings, cm.share FROM circles c JOIN circle_members cm ON cm.circle_id = c.id WHERE cm.member_id = ?', [$mid])->fetchAll() as $c) {
        $cid = (int) $c['id'];
        $settings = json_decode((string) $c['settings'], true) ?: [];
        if (!(int) $c['share'] || $paused) continue;
        // Orte
        if ($acc <= 250) {
            $inside = [];
            foreach (q('SELECT p.*, pr.since FROM places p LEFT JOIN presence pr ON pr.place_id = p.id AND pr.circle_id = p.circle_id AND pr.member_id = ?
                        WHERE p.circle_id = ? AND p.deleted = 0', [$mid, $cid])->fetchAll() as $pl) {
                $d = dist((float) $p['lat'], (float) $p['lng'], (float) $pl['lat'], (float) $pl['lng']);
                $r = (float) $pl['radius'];
                $was = $pl['since'] !== null;
                if (!$was && $d <= $r) {
                    q('INSERT OR REPLACE INTO presence (member_id, circle_id, place_id, since) VALUES (?,?,?,?)', [$mid, $cid, $pl['id'], $now]);
                    addEvent($cid, 'arrive', $mid, ['place' => $pl['id'], 'name' => $pl['name'], 'icon' => $pl['icon']]);
                } elseif ($was && $d > $r + max(60.0, $acc)) {
                    q('DELETE FROM presence WHERE member_id = ? AND circle_id = ? AND place_id = ?', [$mid, $cid, $pl['id']]);
                    addEvent($cid, 'leave', $mid, ['place' => $pl['id'], 'name' => $pl['name'], 'icon' => $pl['icon'],
                        'stay' => $now - (int) $pl['since']]);
                }
            }
        }
        // Tempo
        $limit = (float) ($settings['speedLimit'] ?? 0);
        $kmh = isset($p['spd']) && $p['spd'] !== null ? (float) $p['spd'] * 3.6 : 0;
        if ($limit > 0 && $kmh > $limit && $acc <= 50 && ($now - (int) ($alerts["spd$cid"] ?? 0)) > 15 * 60000) {
            addEvent($cid, 'speeding', $mid, ['kmh' => round($kmh), 'limit' => $limit, 'lat' => $p['lat'], 'lng' => $p['lng']]);
            $alerts["spd$cid"] = $now;
        }
        // Akku
        $prevBat = $prevLast['bat'] ?? null;
        if ($bat !== null && !$chg && $bat <= LOW_BATTERY && ($prevBat === null || $prevBat > LOW_BATTERY)
            && ($now - (int) ($alerts["bat$cid"] ?? 0)) > 3 * 3600000) {
            addEvent($cid, 'battery_low', $mid, ['bat' => $bat]);
            $alerts["bat$cid"] = $now;
        }
    }
    // Unterwegs-Ziel erreicht?
    $eta = json_decode((string) ($me['eta'] ?? ''), true);
    if ($eta && isset($eta['lat'], $eta['lng'])) {
        if (dist((float) $p['lat'], (float) $p['lng'], (float) $eta['lat'], (float) $eta['lng']) <= 150) {
            foreach (myCircleIds($mid) as $cid) {
                if (!empty($eta['circle']) && (int) $eta['circle'] !== $cid) continue;
                addEvent($cid, 'eta_arrived', $mid, ['name' => $eta['name'] ?? 'Ziel', 'started' => $eta['started'] ?? null]);
            }
            q('UPDATE members SET eta = NULL WHERE id = ?', [$mid]);
        } elseif ($now - (int) ($eta['started'] ?? $now) > 12 * 3600000) {
            q('UPDATE members SET eta = NULL WHERE id = ?', [$mid]);
        }
    }
    q('UPDATE members SET alert_ts = ? WHERE id = ?', [json_encode($alerts), $mid]);
}

function housekeeping(): void {
    if (random_int(0, 200) !== 0) return;
    $cut = nowMs() - KEEP_DAYS * 86400000;
    q('DELETE FROM locs WHERE ts < ?', [$cut]);
    q('DELETE FROM events WHERE ts < ?', [$cut]);
}

function route(string $a): void {
    switch ($a) {
        case 'ping':
            db();
            out(['ok' => true, 'app' => 'hjemme', 'version' => 1, 'time' => nowMs()]);

        case 'register': {
            throttle('register', 20, 3600, 'Zu viele Anmeldungen – bitte später erneut versuchen');
            noteThrottle('register');
            $b = body();
            $name = cleanText($b['name'] ?? '', 40);
            if ($name === '') fail('Bitte einen Namen angeben');
            $id = newId();
            $token = newId(24);
            q('INSERT INTO members (id, token, name, color, emoji, phone, created, updated) VALUES (?,?,?,?,?,?,?,?)',
                [$id, hash('sha256', $token), $name, cleanColor($b['color'] ?? 0x3D7BF7), cleanText($b['emoji'] ?? '', 8),
                 cleanText($b['phone'] ?? '', 30), nowMs(), nowMs()]);
            out(['ok' => true, 'id' => $id, 'token' => $token]);
        }

        case 'profile': {
            $me = me();
            $b = body();
            $name = array_key_exists('name', $b) ? cleanText($b['name'], 40) : $me['name'];
            if ($name === '') $name = $me['name'];
            q('UPDATE members SET name = ?, color = ?, emoji = ?, phone = ?, updated = ? WHERE id = ?', [
                $name,
                array_key_exists('color', $b) ? cleanColor($b['color']) : (int) $me['color'],
                array_key_exists('emoji', $b) ? cleanText($b['emoji'], 8) : $me['emoji'],
                array_key_exists('phone', $b) ? cleanText($b['phone'], 30) : $me['phone'],
                nowMs(), $me['id']]);
            out(['ok' => true]);
        }

        case 'avatar_upload': {
            $me = me();
            $b = body();
            $bin = base64_decode((string) ($b['jpeg'] ?? ''), true);
            if ($bin === false || strlen($bin) < 100) fail('Kein Bild empfangen');
            if (strlen($bin) > MAX_AVATAR) fail('Bild zu groß');
            if (substr($bin, 0, 3) !== "\xFF\xD8\xFF") fail('Bitte JPEG senden');
            $name = bin2hex(random_bytes(10)) . '.jpg';
            file_put_contents(NB_DATA_DIR . '/avatars/' . $name, $bin);
            if ($me['avatar'] && preg_match('/^[a-f0-9]+\.jpg$/', (string) $me['avatar'])) @unlink(NB_DATA_DIR . '/avatars/' . $me['avatar']);
            q('UPDATE members SET avatar = ?, updated = ? WHERE id = ?', [$name, nowMs(), $me['id']]);
            out(['ok' => true, 'avatar' => $name]);
        }

        case 'avatar': {
            me();
            $name = basename((string) ($_GET['name'] ?? ''));
            if (!preg_match('/^[a-f0-9]+\.jpg$/', $name) || !is_file(NB_DATA_DIR . '/avatars/' . $name)) fail('Nicht gefunden', 404);
            header('Content-Type: image/jpeg');
            header('Cache-Control: private, max-age=31536000, immutable');
            readfile(NB_DATA_DIR . '/avatars/' . $name);
            exit;
        }

        case 'create_circle': {
            $me = me();
            throttle('create', 10, 86400, 'Heute wurden schon genug Kreise angelegt');
            noteThrottle('create');
            $name = cleanText(body()['name'] ?? 'Familie', 40) ?: 'Familie';
            $code = newCode();
            q('INSERT INTO circles (code, name, owner, created, settings) VALUES (?,?,?,?,?)', [$code, $name, $me['id'], nowMs(), '{}']);
            $cid = (int) db()->lastInsertId();
            q('INSERT INTO circle_members (circle_id, member_id, role, joined, share) VALUES (?,?,?,?,1)', [$cid, $me['id'], 'admin', nowMs()]);
            out(['ok' => true, 'circle' => circleView(circleOf($me, $cid), $me['id'])]);
        }

        case 'join': {
            $me = me();
            throttle('joinfail', 10, 3600, 'Zu viele falsche Codes – bitte in einer Stunde erneut versuchen');
            $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) (body()['code'] ?? '')));
            $c = q('SELECT * FROM circles WHERE code = ?', [$code])->fetch();
            if (!$c) { noteThrottle('joinfail'); fail('Code unbekannt', 404); }
            $exists = q('SELECT 1 FROM circle_members WHERE circle_id = ? AND member_id = ?', [$c['id'], $me['id']])->fetch();
            if (!$exists) {
                q('INSERT INTO circle_members (circle_id, member_id, role, joined, share) VALUES (?,?,?,?,1)', [$c['id'], $me['id'], 'member', nowMs()]);
                addEvent((int) $c['id'], 'join', $me['id'], ['name' => $me['name']]);
            }
            out(['ok' => true, 'circle' => circleView(circleOf($me, $c['id']), $me['id'])]);
        }

        case 'leave': {
            $me = me();
            $c = circleOf($me, body()['circle'] ?? 0);
            q('DELETE FROM circle_members WHERE circle_id = ? AND member_id = ?', [$c['id'], $me['id']]);
            q('DELETE FROM presence WHERE circle_id = ? AND member_id = ?', [$c['id'], $me['id']]);
            addEvent((int) $c['id'], 'left', $me['id'], ['name' => $me['name']]);
            // letzter macht das Licht aus / Admin weitergeben
            $rest = q('SELECT member_id, role FROM circle_members WHERE circle_id = ? ORDER BY joined', [$c['id']])->fetchAll();
            if (!$rest) {
                foreach (['events', 'places', 'presence', 'circles'] as $t) q("DELETE FROM $t WHERE " . ($t === 'circles' ? 'id' : 'circle_id') . ' = ?', [$c['id']]);
            } elseif (!array_filter($rest, fn($r) => $r['role'] === 'admin')) {
                q('UPDATE circle_members SET role = ? WHERE circle_id = ? AND member_id = ?', ['admin', $c['id'], $rest[0]['member_id']]);
            }
            out(['ok' => true]);
        }

        case 'remove_member': {
            $me = me();
            $b = body();
            $c = circleOf($me, $b['circle'] ?? 0);
            if ($c['role'] !== 'admin') fail('Nur Admins dürfen Mitglieder entfernen', 403);
            $mid = (string) ($b['member'] ?? '');
            if ($mid === $me['id']) fail('Zum Austreten bitte „Kreis verlassen“ nutzen');
            q('DELETE FROM circle_members WHERE circle_id = ? AND member_id = ?', [$c['id'], $mid]);
            q('DELETE FROM presence WHERE circle_id = ? AND member_id = ?', [$c['id'], $mid]);
            addEvent((int) $c['id'], 'removed', $me['id'], [], $mid);
            out(['ok' => true]);
        }

        case 'set_role': {
            $me = me();
            $b = body();
            $c = circleOf($me, $b['circle'] ?? 0);
            if ($c['role'] !== 'admin') fail('Nur Admins dürfen das', 403);
            $role = ($b['role'] ?? '') === 'admin' ? 'admin' : 'member';
            q('UPDATE circle_members SET role = ? WHERE circle_id = ? AND member_id = ?', [$role, $c['id'], (string) ($b['member'] ?? '')]);
            out(['ok' => true]);
        }

        case 'circle_update': {
            $me = me();
            $b = body();
            $c = circleOf($me, $b['circle'] ?? 0);
            if ($c['role'] !== 'admin') fail('Nur Admins dürfen den Kreis ändern', 403);
            $settings = json_decode((string) $c['settings'], true) ?: [];
            if (isset($b['settings']) && is_array($b['settings'])) {
                foreach (['speedLimit', 'quietStart', 'quietEnd'] as $k) if (array_key_exists($k, $b['settings'])) $settings[$k] = (float) $b['settings'][$k];
            }
            $name = isset($b['name']) ? (cleanText($b['name'], 40) ?: $c['name']) : $c['name'];
            $code = !empty($b['newCode']) ? newCode() : $c['code'];
            q('UPDATE circles SET name = ?, settings = ?, code = ? WHERE id = ?', [$name, json_encode($settings), $code, $c['id']]);
            out(['ok' => true, 'circle' => circleView(circleOf($me, $c['id']), $me['id'])]);
        }

        case 'share': {
            $me = me();
            $b = body();
            if (isset($b['circle'])) {
                $c = circleOf($me, $b['circle']);
                q('UPDATE circle_members SET share = ? WHERE circle_id = ? AND member_id = ?', [!empty($b['share']) ? 1 : 0, $c['id'], $me['id']]);
                addEvent((int) $c['id'], !empty($b['share']) ? 'share_on' : 'share_off', $me['id']);
            }
            if (array_key_exists('paused', $b)) {
                q('UPDATE members SET paused = ?, updated = ? WHERE id = ?', [!empty($b['paused']) ? 1 : 0, nowMs(), $me['id']]);
                foreach (myCircleIds($me['id']) as $cid) addEvent($cid, !empty($b['paused']) ? 'paused' : 'resumed', $me['id']);
            }
            if (array_key_exists('bubbleUntil', $b)) {
                $until = max(0, min(nowMs() + 7 * 86400000, (int) $b['bubbleUntil']));
                q('UPDATE members SET bubble_until = ?, updated = ? WHERE id = ?', [$until, nowMs(), $me['id']]);
                if ($until > nowMs()) foreach (myCircleIds($me['id']) as $cid) addEvent($cid, 'bubble', $me['id'], ['until' => $until]);
            }
            out(['ok' => true]);
        }

        case 'loc': {
            $me = me();
            $b = body();
            $pts = $b['points'] ?? [];
            if (!is_array($pts) || !$pts) fail('Keine Punkte');
            $pts = array_slice($pts, -500);
            $bat = isset($b['bat']) ? max(0, min(100, (int) $b['bat'])) : null;
            $chg = !empty($b['chg']);
            $prev = json_decode((string) ($me['last'] ?? ''), true) ?: null;
            $prevTs = (int) ($prev['ts'] ?? 0);
            $now = nowMs();
            $ins = db()->prepare('INSERT INTO locs (member_id, ts, lat, lng, acc, spd, bat) VALUES (?,?,?,?,?,?,?)');
            db()->beginTransaction();
            $newest = null;
            foreach ($pts as $p) {
                if (!is_array($p) || !isset($p['lat'], $p['lng'])) continue;
                $lat = (float) $p['lat']; $lng = (float) $p['lng'];
                if (abs($lat) > 90 || abs($lng) > 180 || ($lat == 0 && $lng == 0)) continue;
                $ts = min($now + 60000, (int) ($p['ts'] ?? $now));
                $pt = ['lat' => round($lat, 6), 'lng' => round($lng, 6), 'acc' => isset($p['acc']) ? round((float) $p['acc'], 1) : null,
                    'spd' => isset($p['spd']) && $p['spd'] !== null && (float) $p['spd'] >= 0 ? round((float) $p['spd'], 2) : null,
                    'hdg' => isset($p['hdg']) && $p['hdg'] !== null ? round((float) $p['hdg']) : null, 'ts' => $ts];
                if ((int) $me['paused'] !== 1) $ins->execute([$me['id'], $ts, $pt['lat'], $pt['lng'], $pt['acc'], $pt['spd'], $bat]);
                if (!$newest || $ts >= $newest['ts']) $newest = $pt;
            }
            db()->commit();
            if (!$newest) fail('Keine gültigen Punkte');
            if ($newest['ts'] >= $prevTs) {
                $last = $newest + ['bat' => $bat, 'chg' => $chg, 'act' => cleanText($b['act'] ?? '', 16), 'net' => cleanText($b['net'] ?? '', 10)];
                if ((int) $me['paused'] === 1 && $prev) {
                    // pausiert: Ort einfrieren, nur Akku/Zeit aktualisieren
                    $last = array_merge($prev, ['bat' => $bat, 'chg' => $chg, 'ts' => $newest['ts']]);
                }
                q('UPDATE members SET last = ?, updated = ? WHERE id = ?', [json_encode($last), $now, $me['id']]);
                checkRules($me, $newest, $bat, $chg, $prev);
            }
            housekeeping();
            out(['ok' => true]);
        }

        case 'poll': {
            $me = me();
            $since = (int) ($_GET['since'] ?? 0);
            $cids = myCircleIds($me['id']);
            $circles = [];
            foreach ($cids as $cid) $circles[] = circleView(circleOf($me, $cid), $me['id']);
            $events = [];
            if ($since > 0 || isset($_GET['since'])) {
                $in = $cids ? implode(',', $cids) : '0';
                // erster Abruf: nur die letzten 100 Ereignisse
                $sql = $since > 0
                    ? "SELECT * FROM events WHERE id > ? AND (circle_id IN ($in) OR target = ?) ORDER BY id LIMIT 300"
                    : "SELECT * FROM (SELECT * FROM events WHERE id > ? AND (circle_id IN ($in) OR target = ?) ORDER BY id DESC LIMIT 100) ORDER BY id";
                foreach (q($sql, [$since, $me['id']])->fetchAll() as $e) {
                    if ($e['target'] !== null && $e['target'] !== $me['id'] && !in_array($e['type'], ['ring', 'locate', 'nudge'], true)) continue;
                    $events[] = eventView($e);
                }
            }
            $maxId = (int) q('SELECT COALESCE(MAX(id), 0) FROM events')->fetchColumn();
            $self = memberView($me, 1);
            out(['ok' => true, 'me' => $self, 'circles' => $circles, 'events' => $events,
                'cursor' => $events ? max($since, end($events)['id']) : max($since, $since > 0 ? $since : $maxId), 'time' => nowMs()]);
        }

        case 'history': {
            $me = me();
            $mid = (string) ($_GET['member'] ?? $me['id']);
            $from = (int) ($_GET['from'] ?? nowMs() - 86400000);
            $to = (int) ($_GET['to'] ?? nowMs());
            if ($mid !== $me['id']) {
                // nur, wenn wir einen Kreis teilen, in dem die Person ihren Standort teilt
                $ok = q('SELECT 1 FROM circle_members a JOIN circle_members b ON a.circle_id = b.circle_id
                         WHERE a.member_id = ? AND b.member_id = ? AND b.share = 1', [$me['id'], $mid])->fetch();
                if (!$ok) fail('Kein Zugriff', 403);
                $m = q('SELECT paused, bubble_until FROM members WHERE id = ?', [$mid])->fetch();
                if ($m && (int) $m['bubble_until'] > nowMs()) out(['ok' => true, 'points' => [], 'hidden' => 'bubble']);
            }
            $rows = q('SELECT ts, lat, lng, acc, spd, bat FROM locs WHERE member_id = ? AND ts BETWEEN ? AND ? ORDER BY ts LIMIT 20000',
                [$mid, $from, $to])->fetchAll(PDO::FETCH_NUM);
            $pts = array_map(fn($r) => [(int) $r[0], (float) $r[1], (float) $r[2], $r[3] === null ? null : (float) $r[3],
                $r[4] === null ? null : (float) $r[4], $r[5] === null ? null : (int) $r[5]], $rows);
            out(['ok' => true, 'points' => $pts]);
        }

        case 'place_save': {
            $me = me();
            $b = body();
            $c = circleOf($me, $b['circle'] ?? 0);
            $p = $b['place'] ?? [];
            $id = (string) ($p['id'] ?? '');
            if (!preg_match('/^[A-Za-z0-9_-]{4,40}$/', $id)) $id = newId(8);
            $name = cleanText($p['name'] ?? '', 40);
            if ($name === '') fail('Bitte einen Namen angeben');
            $lat = (float) ($p['lat'] ?? 0); $lng = (float) ($p['lng'] ?? 0);
            if (abs($lat) > 90 || abs($lng) > 180) fail('Ungültiger Ort');
            $radius = max(50, min(2000, (float) ($p['radius'] ?? 150)));
            $isNew = !q('SELECT 1 FROM places WHERE circle_id = ? AND id = ? AND deleted = 0', [$c['id'], $id])->fetch();
            q('INSERT OR REPLACE INTO places (id, circle_id, name, icon, lat, lng, radius, created_by, deleted, ts) VALUES (?,?,?,?,?,?,?,?,0,?)',
                [$id, $c['id'], $name, cleanText($p['icon'] ?? '📍', 8), $lat, $lng, $radius, $me['id'], nowMs()]);
            if (!$isNew) q('DELETE FROM presence WHERE circle_id = ? AND place_id = ?', [$c['id'], $id]);
            addEvent((int) $c['id'], $isNew ? 'place_new' : 'place_edit', $me['id'], ['name' => $name, 'icon' => $p['icon'] ?? '📍', 'place' => $id]);
            out(['ok' => true, 'id' => $id]);
        }

        case 'place_delete': {
            $me = me();
            $b = body();
            $c = circleOf($me, $b['circle'] ?? 0);
            q('UPDATE places SET deleted = 1, ts = ? WHERE circle_id = ? AND id = ?', [nowMs(), $c['id'], (string) ($b['id'] ?? '')]);
            q('DELETE FROM presence WHERE circle_id = ? AND place_id = ?', [$c['id'], (string) ($b['id'] ?? '')]);
            out(['ok' => true]);
        }

        case 'send': {
            // Chat, Check-in, SOS, Anstupsen, Klingeln, Standort anfordern
            $me = me();
            $b = body();
            $type = (string) ($b['type'] ?? '');
            $allowed = ['chat', 'checkin', 'sos', 'sos_cancel', 'sos_ok', 'nudge', 'ring', 'ring_stop', 'locate', 'reaction', 'react'];
            if (!in_array($type, $allowed, true)) fail('Unbekannte Nachricht');
            $data = [];
            foreach (['text' => 500, 'emoji' => 8, 'place' => 60] as $k => $len) if (isset($b[$k])) $data[$k] = cleanText($b[$k], $len);
            foreach (['lat', 'lng', 'acc'] as $k) if (isset($b[$k]) && is_numeric($b[$k])) $data[$k] = (float) $b[$k];
            if (isset($b['ref']) && is_numeric($b['ref'])) $data['ref'] = (int) $b['ref'];
            if ($type === 'chat' && ($data['text'] ?? '') === '') fail('Leere Nachricht');
            $target = isset($b['target']) ? (string) $b['target'] : null;
            if (in_array($type, ['ring', 'ring_stop', 'locate', 'nudge'], true) && !$target) fail('Empfänger fehlt');
            if ($type === 'sos' || $type === 'sos_cancel' || $type === 'sos_ok') {
                // SOS geht an alle Kreise
                $ids = [];
                foreach (myCircleIds($me['id']) as $cid) $ids[] = addEvent($cid, $type, $me['id'], $data);
                out(['ok' => true, 'ids' => $ids]);
            }
            $c = circleOf($me, $b['circle'] ?? 0);
            if ($target && !q('SELECT 1 FROM circle_members WHERE circle_id = ? AND member_id = ?', [$c['id'], $target])->fetch()) fail('Empfänger nicht im Kreis');
            if (in_array($type, ['ring', 'locate'], true)) {
                throttle("$type:$target", 10, 600, 'Bitte kurz warten');
                noteThrottle("$type:$target");
            }
            $id = addEvent((int) $c['id'], $type, $me['id'], $data, $target);
            out(['ok' => true, 'id' => $id]);
        }

        case 'eta': {
            $me = me();
            $b = body();
            if (empty($b['dest'])) {
                q('UPDATE members SET eta = NULL, updated = ? WHERE id = ?', [nowMs(), $me['id']]);
                out(['ok' => true]);
            }
            $d = $b['dest'];
            $eta = ['name' => cleanText($d['name'] ?? 'Ziel', 60), 'lat' => (float) ($d['lat'] ?? 0), 'lng' => (float) ($d['lng'] ?? 0),
                'started' => nowMs(), 'circle' => isset($b['circle']) ? (int) $b['circle'] : null,
                'minutes' => isset($b['minutes']) ? (int) $b['minutes'] : null];
            q('UPDATE members SET eta = ?, updated = ? WHERE id = ?', [json_encode($eta, JSON_UNESCAPED_UNICODE), nowMs(), $me['id']]);
            foreach (myCircleIds($me['id']) as $cid) {
                if ($eta['circle'] && $eta['circle'] !== $cid) continue;
                addEvent($cid, 'eta_start', $me['id'], ['name' => $eta['name'], 'minutes' => $eta['minutes']]);
            }
            out(['ok' => true]);
        }

        case 'delete_account': {
            $me = me();
            foreach (myCircleIds($me['id']) as $cid) {
                addEvent($cid, 'left', $me['id'], ['name' => $me['name']]);
            }
            q('DELETE FROM circle_members WHERE member_id = ?', [$me['id']]);
            q('DELETE FROM presence WHERE member_id = ?', [$me['id']]);
            q('DELETE FROM locs WHERE member_id = ?', [$me['id']]);
            q('UPDATE members SET token = ?, last = NULL, name = ?, phone = NULL, avatar = NULL WHERE id = ?', ['-', 'Gelöscht', $me['id']]);
            out(['ok' => true]);
        }

        default:
            fail('Unbekannte Aktion', 404);
    }
}

if (!defined('NB_NO_ROUTE')) {
    try {
        route((string) ($_GET['a'] ?? ''));
    } catch (Throwable $e) {
        fail('Serverfehler: ' . $e->getMessage(), 500);
    }
}
