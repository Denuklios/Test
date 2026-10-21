<?php
declare(strict_types=1);

$WF = require __DIR__ . '/config.php';
if (is_file(__DIR__ . '/config.local.php')) {
    $WF = array_replace($WF, require __DIR__ . '/config.local.php');
}

if (!extension_loaded('pdo_sqlite')) {
    http_response_code(500);
    exit('pdo_sqlite fehlt auf diesem Hosting-Paket.');
}

// Nur fuer automatische Tests (Umgebungsvariablen), auf dem Server nicht gesetzt.
if (getenv('WF_TEST_DATA_DIR')) {
    $WF['data_dir'] = getenv('WF_TEST_DATA_DIR');
    $WF['dev_login'] = true;
}

if ($WF['session_name'] !== '') {
    session_name($WF['session_name']);
}
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
    session_start();
}

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');

function wf_cfg(string $k)
{
    global $WF;
    return $WF[$k] ?? null;
}

function wf_db(): PDO
{
    static $pdo = null;
    if ($pdo) {
        return $pdo;
    }
    $dir = rtrim((string)wf_cfg('data_dir'), '/');
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    if (!is_dir($dir . '/uploads')) {
        mkdir($dir . '/uploads', 0775, true);
    }
    if (!is_file($dir . '/.htaccess')) {
        file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
    }
    $new = !is_file($dir . '/auftraege.sqlite');
    $pdo = new PDO('sqlite:' . $dir . '/auftraege.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    require_once __DIR__ . '/schema.php';
    wf_migrate($pdo);
    if ($new) {
        @chmod($dir . '/auftraege.sqlite', 0660);
    }
    return $pdo;
}

function wf_json($data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function wf_fail(string $code, int $http = 400, array $extra = []): never
{
    wf_json(['ok' => false, 'error' => $code] + $extra, $http);
}

/** Aktueller Benutzer oder null. Nutzt das vorhandene Admin-Login der Hauptseite. */
function wf_user(): ?array
{
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    $adminId = $_SESSION[wf_cfg('session_key')] ?? null;
    if (!$adminId && wf_cfg('dev_login') && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
        $adminId = $_SESSION['wf_dev_admin'] ?? ($_GET['dev'] ?? null);
        if ($adminId) {
            $_SESSION['wf_dev_admin'] = $adminId;
        }
    }
    if (!$adminId) {
        return $cache = null;
    }
    $st = wf_db()->prepare('SELECT id, name, wf_admin_id, active FROM users WHERE wf_admin_id = ? AND active = 1');
    $st->execute([(string)$adminId]);
    $u = $st->fetch();
    if (!$u) {
        // Eingeloggter Admin der Hauptseite ohne Zuordnung: darf nutzen, Name = "Admin <id>".
        $u = ['id' => 0, 'name' => 'Admin ' . $adminId, 'wf_admin_id' => (string)$adminId, 'active' => 1];
    }
    return $cache = $u;
}

function wf_require_user(bool $json = true): array
{
    $u = wf_user();
    if (!$u) {
        if ($json) {
            wf_fail('not_logged_in', 401);
        }
        http_response_code(401);
        exit('Bitte zuerst auf der Hauptseite als Admin anmelden.');
    }
    return $u;
}

function wf_csrf(): string
{
    if (empty($_SESSION['wf_csrf'])) {
        $_SESSION['wf_csrf'] = bin2hex(random_bytes(24));
    }
    return $_SESSION['wf_csrf'];
}

function wf_check_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || !hash_equals(wf_csrf(), $sent)) {
        wf_fail('csrf', 403);
    }
}

/** Erhoeht die Aenderungsnummer fuer die Werkstatt-Anzeige. */
function wf_touch(): void
{
    wf_db()->exec("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'change_counter'");
}

function wf_version(): int
{
    return (int)wf_db()->query("SELECT value FROM meta WHERE key = 'change_counter'")->fetchColumn();
}
