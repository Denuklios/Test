<?php
// Gassirunde – Server für PHP-Webspace (PHP 7.4+ mit PDO-SQLite), z. B. one.com.
// Gleiche Funktionen wie server.js: Konten, Runden, Bewertungen, Spaziergänge, Live.
// Live-Positionen holt die App hier per Abfrage alle paar Sekunden (statt Server-Sent Events),
// weil Webspace-PHP keine Dauerverbindungen hält.
//
// Aufruf: api.php?p=<pfad>, z. B. api.php?p=auth/login. Daten liegen in daten/ (per .htaccess gesperrt).
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');

const DATA_DIR = __DIR__ . '/daten';   // privat, per .htaccess gesperrt (data/ enthält nur öffentliche Demo-Runden)
const SESSION_DAYS = 60;
const LIVE_TTL = 120;          // Sekunden ohne Signal, dann verschwindet man von der Karte
const COOKIE = 'gassi_session';
const DOG_AGES = ['welpe', 'erwachsen', 'senior'];

// ---------- Antworten ----------

function out($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function fail(string $msg, int $code = 400): void { out(['error' => $msg], $code); }

function body(): array {
    $type = $_SERVER['CONTENT_TYPE'] ?? ($_SERVER['HTTP_CONTENT_TYPE'] ?? '');
    // Nur JSON annehmen: schützt zusammen mit SameSite-Cookies gegen Formular-Angriffe fremder Seiten
    if (strpos($type, 'application/json') !== 0) fail('Bitte JSON senden.', 415);
    $raw = file_get_contents('php://input', false, null, 0, 1000001);
    if (strlen((string) $raw) > 1000000) fail('Anfrage zu groß.', 413);
    $j = json_decode($raw ?: '{}', true);
    if (!is_array($j)) fail('Ungültiges JSON.');
    return $j;
}

function s($v, int $max): string {
    if (!is_string($v)) return '';
    $v = trim($v);
    return function_exists('mb_substr') ? mb_substr($v, 0, $max) : substr($v, 0, $max);
}
function n($v, float $min, float $max) {
    return (is_int($v) || is_float($v)) && is_finite((float) $v) && $v >= $min && $v <= $max ? $v + 0 : null;
}
function oneOf($v, array $list, string $dflt): string { return in_array($v, $list, true) ? $v : $dflt; }
function nowIso(): string { return gmdate('Y-m-d\TH:i:s\Z'); }
function uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

// ---------- Datenbank ----------

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0775, true);
    if (!file_exists(DATA_DIR . '/.htaccess')) file_put_contents(DATA_DIR . '/.htaccess', "Require all denied\nDeny from all\n");
    $pdo = new PDO('sqlite:' . DATA_DIR . '/gassi.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('PRAGMA busy_timeout=5000');
    $pdo->exec('PRAGMA foreign_keys=ON');
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, dog TEXT NOT NULL DEFAULT \'\', dog_age TEXT NOT NULL DEFAULT \'erwachsen\', pw TEXT NOT NULL, created_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, created_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS ratings (route_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, stars INTEGER NOT NULL, text TEXT NOT NULL DEFAULT \'\', date TEXT NOT NULL, PRIMARY KEY (route_id, user_id))');
    $pdo->exec('CREATE TABLE IF NOT EXISTS walks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, meters REAL NOT NULL, ms REAL NOT NULL, name TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS live (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, at INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS waves (id INTEGER PRIMARY KEY AUTOINCREMENT, to_id TEXT NOT NULL, from_id TEXT NOT NULL, at INTEGER NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS failures (ip TEXT PRIMARY KEY, count INTEGER NOT NULL, since INTEGER NOT NULL)');
    // Neuere Spalten in bestehender Datenbank ergänzen
    $cols = array_column($pdo->query('PRAGMA table_info(users)')->fetchAll(), 'name');
    if (!in_array('dog_breed', $cols, true)) $pdo->exec("ALTER TABLE users ADD COLUMN dog_breed TEXT NOT NULL DEFAULT ''");
    if (!in_array('dog_years', $cols, true)) $pdo->exec('ALTER TABLE users ADD COLUMN dog_years INTEGER');
    if (!in_array('show_dog', $cols, true)) $pdo->exec('ALTER TABLE users ADD COLUMN show_dog INTEGER NOT NULL DEFAULT 1');
    return $pdo;
}

function q(string $sql, array $args = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

// ---------- Konten & Sessions ----------

function publicUser(?array $u): ?array {
    if (!$u) return null;
    return ['id' => $u['id'], 'email' => $u['email'], 'name' => $u['name'], 'dog' => $u['dog'], 'dogAge' => $u['dog_age'],
        'dogBreed' => $u['dog_breed'] ?? '', 'dogYears' => isset($u['dog_years']) ? (int) $u['dog_years'] : null,
        'showDog' => !isset($u['show_dog']) || (int) $u['show_dog'] === 1, 'createdAt' => $u['created_at']];
}

function isHttps(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

function cookiePath(): string {
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return $dir === '' ? '/' : $dir . '/';
}

function setSessionCookie(string $token, int $maxAge): void {
    setcookie(COOKIE, $token, [
        'expires' => $maxAge > 0 ? time() + $maxAge : time() - 3600,
        'path' => cookiePath(), 'secure' => isHttps(), 'httponly' => true, 'samesite' => 'Lax',
    ]);
}

function createSession(array $user): void {
    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    q('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)', [hash('sha256', $token), $user['id'], time() + SESSION_DAYS * 86400]);
    setSessionCookie($token, SESSION_DAYS * 86400);
}

function currentUser(): ?array {
    static $cached = false;
    if ($cached !== false) return $cached;
    $token = $_COOKIE[COOKIE] ?? '';
    $cached = null;
    if ($token === '') return null;
    $u = q('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?', [hash('sha256', $token), time()])->fetch();
    $cached = $u ?: null;
    return $cached;
}

function requireUser(): array {
    $u = currentUser();
    if (!$u) fail('Bitte melde dich an.', 401);
    return $u;
}

function clientIp(): string { return (string) ($_SERVER['REMOTE_ADDR'] ?? '?'); }

function tooManyFailures(): bool {
    $f = q('SELECT * FROM failures WHERE ip = ?', [clientIp()])->fetch();
    return $f && $f['count'] >= 10 && time() - $f['since'] < 900;
}
function noteFailure(): void {
    $f = q('SELECT * FROM failures WHERE ip = ?', [clientIp()])->fetch();
    if (!$f || time() - $f['since'] > 900) q('INSERT OR REPLACE INTO failures (ip, count, since) VALUES (?, 1, ?)', [clientIp(), time()]);
    else q('UPDATE failures SET count = count + 1 WHERE ip = ?', [clientIp()]);
}

function validateProfile(array $b, bool $partial = false): array {
    $out = [];
    if (!$partial || array_key_exists('name', $b)) {
        $out['name'] = s($b['name'] ?? null, 40);
        if ($out['name'] === '') fail('Bitte gib deinen Vornamen an.');
    }
    if (!$partial || array_key_exists('dog', $b)) $out['dog'] = s($b['dog'] ?? null, 40);
    if (!$partial || array_key_exists('dogAge', $b)) $out['dog_age'] = oneOf($b['dogAge'] ?? null, DOG_AGES, 'erwachsen');
    if (!$partial || array_key_exists('dogBreed', $b)) $out['dog_breed'] = s($b['dogBreed'] ?? null, 60);
    if (!$partial || array_key_exists('dogYears', $b)) {
        $y = $b['dogYears'] ?? null;
        $out['dog_years'] = is_int($y) && $y >= 0 && $y <= 25 ? $y : null;
    }
    if (!$partial || array_key_exists('showDog', $b)) $out['show_dog'] = (($b['showDog'] ?? true) === false) ? 0 : 1;
    return $out;
}

function validatePassword($pw): void {
    if (!is_string($pw) || strlen($pw) < 8) fail('Das Passwort braucht mindestens 8 Zeichen.');
    if (strlen($pw) > 200) fail('Das Passwort ist zu lang.');
}

function checkPassword(array $u, $pw): bool { return is_string($pw) && password_verify($pw, $u['pw']); }

// ---------- Geometrie (wie core.js) ----------

function geoDistance(array $a, array $b): float {
    $r = 6371000; $rad = M_PI / 180;
    $dLat = ($b[0] - $a[0]) * $rad; $dLng = ($b[1] - $a[1]) * $rad;
    $h = sin($dLat / 2) ** 2 + cos($a[0] * $rad) * cos($b[0] * $rad) * sin($dLng / 2) ** 2;
    return 2 * $r * asin(sqrt($h));
}
function pathLength(array $pts): float {
    $m = 0.0;
    for ($i = 1; $i < count($pts); $i++) $m += geoDistance($pts[$i - 1], $pts[$i]);
    return $m;
}
function pointAlong(array $pts, float $meters): array {
    $left = max(0.0, $meters);
    for ($i = 1; $i < count($pts); $i++) {
        $seg = geoDistance($pts[$i - 1], $pts[$i]);
        if ($left <= $seg && $seg > 0) {
            $t = $left / $seg;
            return [$pts[$i - 1][0] + ($pts[$i][0] - $pts[$i - 1][0]) * $t, $pts[$i - 1][1] + ($pts[$i][1] - $pts[$i - 1][1]) * $t];
        }
        $left -= $seg;
    }
    return end($pts);
}

// ---------- Runden ----------

function demoRoutes(): array {
    static $routes = null;
    if ($routes === null) $routes = json_decode((string) file_get_contents(__DIR__ . '/data/demo-routes.json'), true) ?: [];
    return $routes;
}

function namesById(array $ids): array {
    $ids = array_values(array_unique(array_filter($ids)));
    if (!$ids) return [];
    $rows = q('SELECT id, name, dog FROM users WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids)->fetchAll();
    $out = [];
    foreach ($rows as $r) $out[$r['id']] = $r;
    return $out;
}

function allRoutes(): array {
    $rows = q('SELECT * FROM routes ORDER BY created_at')->fetchAll();
    $ratings = q('SELECT * FROM ratings ORDER BY date')->fetchAll();
    $ids = array_merge(array_column($rows, 'author_id'), array_column($ratings, 'user_id'));
    $names = namesById($ids);
    $byRoute = [];
    foreach ($ratings as $x) {
        $u = $names[$x['user_id']] ?? null;
        $byRoute[$x['route_id']][] = ['userId' => $x['user_id'], 'stars' => (int) $x['stars'], 'text' => $x['text'], 'date' => $x['date'], 'name' => $u['name'] ?? 'Anonym', 'dog' => $u['dog'] ?? ''];
    }
    $out = [];
    foreach (demoRoutes() as $r) { $r['ratings'] = $byRoute[$r['id']] ?? []; $out[] = $r; }
    foreach ($rows as $row) {
        $r = json_decode($row['data'], true);
        $r['author'] = $names[$row['author_id']]['name'] ?? 'Anonym';
        $r['ratings'] = $byRoute[$r['id']] ?? [];
        $out[] = $r;
    }
    return $out;
}

// ---------- Runden aus OpenStreetMap (data/osm/<zelle>.json, Zellen 0,5°) ----------

function osmCell(string $key): array {
    static $cache = [];
    if (!isset($cache[$key])) {
        $f = __DIR__ . '/data/osm/' . $key . '.json';
        $cache[$key] = (preg_match('/^-?\d+_-?\d+$/', $key) && is_file($f)) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    }
    return $cache[$key];
}

function osmNear(float $lat, float $lng, float $rKm, int $limit = 250): array {
    $dLat = $rKm / 111; $dLng = $rKm / (111 * cos(deg2rad($lat)));
    $found = [];
    for ($a = (int) floor(($lat - $dLat) * 2); $a <= (int) floor(($lat + $dLat) * 2); $a++) {
        for ($b = (int) floor(($lng - $dLng) * 2); $b <= (int) floor(($lng + $dLng) * 2); $b++) {
            foreach (osmCell("{$a}_{$b}") as $r) {
                $d = geoDistance([$lat, $lng], $r['points'][0]) / 1000;
                if ($d <= $rKm) $found[] = [$d, $r];
            }
        }
    }
    usort($found, function ($x, $y) { return $x[0] <=> $y[0]; });
    return array_map(function ($x) { return $x[1]; }, array_slice($found, 0, $limit));
}

function ratingsFor(array $ids): array {
    if (!$ids) return [];
    $rows = q('SELECT * FROM ratings WHERE route_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ') ORDER BY date', $ids)->fetchAll();
    $names = namesById(array_column($rows, 'user_id'));
    $out = [];
    foreach ($rows as $x) {
        $u = $names[$x['user_id']] ?? null;
        $out[$x['route_id']][] = ['userId' => $x['user_id'], 'stars' => (int) $x['stars'], 'text' => $x['text'], 'date' => $x['date'], 'name' => $u['name'] ?? 'Anonym', 'dog' => $u['dog'] ?? ''];
    }
    return $out;
}

function routeExists(string $id): bool {
    if (preg_match('/^osm-[wr]\d{1,12}$/', $id)) return true; // Runde aus OpenStreetMap
    foreach (demoRoutes() as $r) if ($r['id'] === $id) return true;
    return (bool) q('SELECT 1 FROM routes WHERE id = ?', [$id])->fetch();
}

// ---------- Live ----------

const DEMO_WALKERS = [
    ['id' => 'demo-mette', 'name' => 'Mette', 'dog' => 'Bella', 'dogBreed' => 'Labrador Retriever', 'dogYears' => 4, 'status' => 'offen', 'route' => 'froeslev-hundeskov', 'speed' => 1.2, 'offset' => 300, 'reverse' => false],
    ['id' => 'demo-lars', 'name' => 'Lars', 'dog' => 'Rufus', 'dogBreed' => 'Deutscher Schäferhund', 'dogYears' => 7, 'status' => 'abstand', 'route' => 'froeslev-hundeskov', 'speed' => 1.1, 'offset' => 1800, 'reverse' => true],
    ['id' => 'demo-sofie', 'name' => 'Sofie', 'dog' => 'Molly', 'dogBreed' => 'Dackel', 'dogYears' => 3, 'status' => 'neutral', 'route' => 'gendarmstien-kollund', 'speed' => 1.3, 'offset' => 900, 'reverse' => false],
    ['id' => 'demo-henrik', 'name' => 'Henrik', 'dog' => 'Bamse', 'dogBreed' => 'Berner Sennenhund', 'dogYears' => 9, 'status' => 'abstand', 'route' => 'gendarmstien-kollund', 'speed' => 1.0, 'offset' => 3200, 'reverse' => false],
    ['id' => 'demo-freja', 'name' => 'Freja', 'dog' => 'Luna', 'dogBreed' => 'Border Collie', 'dogYears' => 2, 'status' => 'offen', 'route' => 'hundeskov-torp', 'speed' => 1.2, 'offset' => 400, 'reverse' => false],
];

function liveSnapshot(): array {
    q('DELETE FROM live WHERE at < ?', [time() - LIVE_TTL]);
    $rows = q('SELECT l.*, u.name, u.dog, u.dog_breed, u.dog_years, u.show_dog FROM live l JOIN users u ON u.id = l.user_id')->fetchAll();
    $people = [];
    foreach ($rows as $r) {
        $show = (int) $r['show_dog'] === 1;
        $people[] = ['id' => $r['user_id'], 'name' => $r['name'], 'dog' => $r['dog'], 'status' => $r['status'], 'lat' => (float) $r['lat'], 'lng' => (float) $r['lng'], 'at' => (int) $r['at'] * 1000,
            'dogBreed' => $show ? $r['dog_breed'] : '', 'dogYears' => $show && $r['dog_years'] !== null ? (int) $r['dog_years'] : null];
    }
    if (getenv('GASSI_DEMO_WALKERS') !== '0') {
        $now = microtime(true);
        foreach (DEMO_WALKERS as $w) {
            foreach (demoRoutes() as $route) {
                if ($route['id'] !== $w['route']) continue;
                $len = pathLength($route['points']);
                $d = fmod($w['offset'] + $now * $w['speed'], $len);
                if ($w['reverse']) $d = $len - $d;
                $p = pointAlong($route['points'], $d);
                $people[] = ['id' => $w['id'], 'name' => $w['name'], 'dog' => $w['dog'], 'dogBreed' => $w['dogBreed'], 'dogYears' => $w['dogYears'], 'status' => $w['status'], 'lat' => $p[0], 'lng' => $p[1], 'at' => (int) ($now * 1000), 'demo' => true];
            }
        }
    }
    return $people;
}

// ---------- Anfrage verteilen ----------

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = trim((string) ($_GET['p'] ?? ''), '/');
$parts = $path === '' ? [] : explode('/', $path);
$p0 = $parts[0] ?? ''; $p1 = $parts[1] ?? null; $p2 = $parts[2] ?? null;

try {
    if ($method === 'GET' && $p0 === 'health') out(['ok' => true, 'accounts' => true, 'live' => 'poll']);

    // ----- Konto -----
    if ($p0 === 'auth') {
        if ($method === 'GET' && $p1 === 'me') out(['user' => publicUser(currentUser())]);

        if ($method === 'POST' && $p1 === 'register') {
            $b = body();
            $email = strtolower(s($b['email'] ?? null, 200));
            if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/', $email)) fail('Bitte gib eine gültige E-Mail-Adresse an.');
            validatePassword($b['password'] ?? null);
            $prof = validateProfile($b);
            if (q('SELECT 1 FROM users WHERE email = ?', [$email])->fetch()) fail('Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich stattdessen an.', 409);
            $user = ['id' => 'u-' . uuid(), 'email' => $email, 'name' => $prof['name'], 'dog' => $prof['dog'], 'dog_age' => $prof['dog_age'],
                'pw' => password_hash($b['password'], PASSWORD_DEFAULT), 'created_at' => nowIso(),
                'dog_breed' => $prof['dog_breed'], 'dog_years' => $prof['dog_years'], 'show_dog' => $prof['show_dog']];
            q('INSERT INTO users (id, email, name, dog, dog_age, pw, created_at, dog_breed, dog_years, show_dog) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', array_values($user));
            createSession($user);
            out(['user' => publicUser($user)], 201);
        }

        if ($method === 'POST' && $p1 === 'login') {
            if (tooManyFailures()) fail('Zu viele Fehlversuche. Bitte warte 15 Minuten.', 429);
            $b = body();
            $u = q('SELECT * FROM users WHERE email = ?', [strtolower(s($b['email'] ?? null, 200))])->fetch();
            if (!$u || !checkPassword($u, $b['password'] ?? null)) { noteFailure(); fail('E-Mail-Adresse oder Passwort stimmt nicht.', 401); }
            if (password_needs_rehash($u['pw'], PASSWORD_DEFAULT)) q('UPDATE users SET pw = ? WHERE id = ?', [password_hash($b['password'], PASSWORD_DEFAULT), $u['id']]);
            createSession($u);
            out(['user' => publicUser($u)]);
        }

        if ($method === 'POST' && $p1 === 'logout') {
            body();
            $token = $_COOKIE[COOKIE] ?? '';
            if ($token !== '') q('DELETE FROM sessions WHERE token_hash = ?', [hash('sha256', $token)]);
            setSessionCookie('', 0);
            out(['ok' => true]);
        }
        fail('Unbekannte Anfrage.', 404);
    }

    // ----- Eigenes Profil -----
    if ($p0 === 'me') {
        $user = requireUser();
        if ($method === 'PATCH' && $p1 === null) {
            $prof = validateProfile(body(), true);
            foreach ($prof as $k => $v) { q("UPDATE users SET $k = ? WHERE id = ?", [$v, $user['id']]); $user[$k] = $v; }
            out(['user' => publicUser($user)]);
        }
        if ($method === 'POST' && $p1 === 'password') {
            $b = body();
            if (!checkPassword($user, $b['current'] ?? null)) fail('Das aktuelle Passwort stimmt nicht.', 403);
            validatePassword($b['next'] ?? null);
            q('UPDATE users SET pw = ? WHERE id = ?', [password_hash($b['next'], PASSWORD_DEFAULT), $user['id']]);
            q('DELETE FROM sessions WHERE user_id = ?', [$user['id']]); // überall abmelden …
            createSession($user);                                        // … außer hier
            out(['ok' => true]);
        }
        if ($method === 'DELETE' && $p1 === null) {
            $b = body();
            if (!checkPassword($user, $b['password'] ?? null)) fail('Das Passwort stimmt nicht.', 403);
            $own = q('SELECT id FROM routes WHERE author_id = ?', [$user['id']])->fetchAll(PDO::FETCH_COLUMN);
            db()->beginTransaction();
            foreach ($own as $rid) q('DELETE FROM ratings WHERE route_id = ?', [$rid]);
            q('DELETE FROM waves WHERE to_id = ? OR from_id = ?', [$user['id'], $user['id']]);
            q('DELETE FROM users WHERE id = ?', [$user['id']]); // Rest per ON DELETE CASCADE
            db()->commit();
            setSessionCookie('', 0);
            out(['ok' => true]);
        }
        if ($p1 === 'walks' && $method === 'GET') {
            $rows = q('SELECT date, meters, ms, name FROM walks WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 1000', [$user['id']])->fetchAll();
            foreach ($rows as &$r) { $r['meters'] = (float) $r['meters']; $r['ms'] = (float) $r['ms']; }
            out($rows);
        }
        if ($p1 === 'walks' && $method === 'POST') {
            $b = body();
            $ts = strtotime((string) ($b['date'] ?? '')) ?: time();
            $walk = ['date' => gmdate('Y-m-d\TH:i:s\Z', $ts), 'meters' => n($b['meters'] ?? null, 0, 200000) ?? 0, 'ms' => n($b['ms'] ?? null, 0, 86400000) ?? 0, 'name' => s($b['name'] ?? null, 60) ?: 'Spaziergang'];
            q('INSERT INTO walks (user_id, date, meters, ms, name) VALUES (?, ?, ?, ?, ?)', [$user['id'], $walk['date'], $walk['meters'], $walk['ms'], $walk['name']]);
            out($walk, 201);
        }
        fail('Unbekannte Anfrage.', 404);
    }

    // ----- Runden -----
    if ($p0 === 'routes') {
        if ($method === 'GET' && $p1 === null) { // lesen darf jeder
            $all = allRoutes();
            if (isset($_GET['lat'], $_GET['lng']) && is_numeric($_GET['lat']) && is_numeric($_GET['lng'])) {
                $r = max(1.0, min(80.0, (float) ($_GET['r'] ?? 25)));
                $near = osmNear((float) $_GET['lat'], (float) $_GET['lng'], $r);
                $rat = ratingsFor(array_column($near, 'id'));
                foreach ($near as $x) { $x['ratings'] = $rat[$x['id']] ?? []; $all[] = $x; }
            }
            out($all);
        }

        if ($method === 'POST' && $p1 === null) {
            $user = requireUser();
            $b = body();
            $points = [];
            foreach ((array) ($b['points'] ?? []) as $pt) {
                if (count($points) >= 10000) break;
                if (is_array($pt) && n($pt[0] ?? null, -90, 90) !== null && n($pt[1] ?? null, -180, 180) !== null) $points[] = [round($pt[0], 6), round($pt[1], 6)];
            }
            if (count($points) < 2) fail('Die Runde braucht mindestens zwei GPS-Punkte.');
            $name = s($b['name'] ?? null, 60);
            if ($name === '') fail('Bitte gib der Runde einen Namen.');
            $a = is_array($b['attrs'] ?? null) ? $b['attrs'] : [];
            $route = [
                'id' => 'r-' . substr(uuid(), 0, 8), 'name' => $name, 'area' => s($b['area'] ?? null, 60), 'description' => s($b['description'] ?? null, 400),
                'source' => 'nutzer', 'authorId' => $user['id'], 'createdAt' => nowIso(),
                'points' => $points, 'distanceKm' => round(pathLength($points) / 1000, 2), 'durationMin' => n($b['durationMin'] ?? null, 0, 1440),
                'attrs' => [
                    'water' => !empty($a['water']), 'shade' => n($a['shade'] ?? null, 0, 100) ?? 50,
                    'surface' => oneOf($a['surface'] ?? null, ['natur', 'gemischt', 'asphalt'], 'gemischt'),
                    'crossings' => n($a['crossings'] ?? null, 0, 20) ?? 0,
                    'leash' => oneOf($a['leash'] ?? null, ['frei', 'teilweise', 'pflicht'], 'teilweise'),
                    'bins' => !empty($a['bins']),
                ],
                'busyness' => array_fill(0, 24, 15),
            ];
            q('INSERT INTO routes (id, author_id, data, created_at) VALUES (?, ?, ?, ?)', [$route['id'], $user['id'], json_encode($route, JSON_UNESCAPED_UNICODE), $route['createdAt']]);
            $route['author'] = $user['name'];
            $route['ratings'] = [];
            out($route, 201);
        }

        if ($method === 'DELETE' && $p1 !== null && $p2 === null) {
            $user = requireUser();
            body();
            $row = q('SELECT author_id FROM routes WHERE id = ?', [$p1])->fetch();
            if (!$row) fail('Runde nicht gefunden.', 404);
            if ($row['author_id'] !== $user['id']) fail('Nur wer die Runde angelegt hat, kann sie löschen.', 403);
            q('DELETE FROM ratings WHERE route_id = ?', [$p1]);
            q('DELETE FROM routes WHERE id = ?', [$p1]);
            out(['ok' => true]);
        }

        if ($method === 'POST' && $p1 !== null && $p2 === 'ratings') {
            $user = requireUser();
            if (!routeExists($p1)) fail('Runde nicht gefunden.', 404);
            $b = body();
            $stars = $b['stars'] ?? null;
            if (!is_int($stars) || $stars < 1 || $stars > 5) fail('Bitte 1 bis 5 Sterne vergeben.');
            q('INSERT OR REPLACE INTO ratings (route_id, user_id, stars, text, date) VALUES (?, ?, ?, ?, ?)', [$p1, $user['id'], $stars, s($b['text'] ?? null, 500), nowIso()]);
            out(ratingsFor([$p1])[$p1] ?? []);
        }
        fail('Unbekannte Anfrage.', 404);
    }

    // ----- Live (nur angemeldet) -----
    if ($p0 === 'live') {
        $user = requireUser();
        if ($method === 'GET' && $p1 === 'poll') {
            // Positionen aller + Winken, die für mich bestimmt sind (werden einmal zugestellt)
            $waves = q('SELECT w.id, w.from_id, w.at, u.name, u.dog FROM waves w JOIN users u ON u.id = w.from_id WHERE w.to_id = ? ORDER BY w.id', [$user['id']])->fetchAll();
            if ($waves) q('DELETE FROM waves WHERE id <= ? AND to_id = ?', [end($waves)['id'], $user['id']]);
            q('DELETE FROM waves WHERE at < ?', [time() - 600]);
            $msgs = [];
            foreach ($waves as $w) $msgs[] = ['to' => $user['id'], 'from' => $w['from_id'], 'fromName' => $w['name'], 'fromDog' => $w['dog'], 'text' => 'Lust auf eine gemeinsame Runde?', 'at' => (int) $w['at'] * 1000];
            out(['people' => liveSnapshot(), 'waves' => $msgs]);
        }
        if ($method === 'POST' && $p1 === null) {
            $b = body();
            $lat = n($b['lat'] ?? null, -90, 90); $lng = n($b['lng'] ?? null, -180, 180);
            if ($lat === null || $lng === null) fail('Position unvollständig.');
            q('INSERT OR REPLACE INTO live (user_id, status, lat, lng, at) VALUES (?, ?, ?, ?, ?)', [$user['id'], oneOf($b['status'] ?? null, ['offen', 'neutral', 'abstand'], 'neutral'), $lat, $lng, time()]);
            out(['ok' => true]);
        }
        if ($method === 'DELETE' && $p1 === null) {
            body();
            q('DELETE FROM live WHERE user_id = ?', [$user['id']]);
            out(['ok' => true]);
        }
        if ($method === 'POST' && $p1 === 'wave') {
            $b = body();
            $to = s($b['to'] ?? null, 64);
            $target = q('SELECT * FROM live WHERE user_id = ? AND at >= ?', [$to, time() - LIVE_TTL])->fetch();
            if (!$target) fail('Die Person ist gerade nicht mehr unterwegs.', 404);
            if ($target['status'] === 'abstand') fail('Die Person bittet um Abstand.', 403);
            q('INSERT INTO waves (to_id, from_id, at) VALUES (?, ?, ?)', [$to, $user['id'], time()]);
            out(['ok' => true]);
        }
        fail('Unbekannte Anfrage.', 404);
    }

    fail('Unbekannte Anfrage.', 404);
} catch (Throwable $e) {
    error_log('gassi: ' . $e->getMessage());
    fail('Serverfehler', 500);
}
