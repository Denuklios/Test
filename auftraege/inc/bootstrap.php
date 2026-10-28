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
    if ($adminId && !wf_user_sync_session((string)$adminId)) {
        return $cache = null;   // gesperrt oder ohne Recht „Aufträge“ im Admin-Bereich
    }
    if ($adminId) {
        wf_device_remember((string)$adminId);
    } else {
        $adminId = wf_device_login();   // bei jeder Anfrage prüfen, damit Abmelden eines Geräts sofort wirkt
    }
    if (!$adminId && wf_cfg('dev_login') && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
        $adminId = $_SESSION['wf_dev_admin'] ?? ($_GET['dev'] ?? null);
        if ($adminId) {
            $_SESSION['wf_dev_admin'] = $adminId;
            if (isset($_GET['dev'])) {
                wf_device_remember((string)$adminId);   // lokal wie ein Login über die Hauptseite behandeln (Tests)
            }
        }
    }
    if (!$adminId) {
        return $cache = null;
    }
    $st = wf_db()->prepare('SELECT id, name, wf_admin_id, active FROM users WHERE wf_admin_id = ?');
    $st->execute([(string)$adminId]);
    $u = $st->fetch();
    if ($u && !(int)$u['active']) {
        return $cache = null;   // im Admin-Bereich gesperrter Mitarbeiter
    }
    if (!$u) {
        // Eingeloggter Admin der Hauptseite ohne Zuordnung: darf nutzen, Name = "Admin <id>".
        $u = ['id' => 0, 'name' => 'Admin ' . $adminId, 'wf_admin_id' => (string)$adminId, 'active' => 1];
    }
    return $cache = $u;
}

/**
 * Mitarbeiter aus dem Admin-Bereich der Hauptseite übernehmen: Name (wf_admin_name) und
 * Recht „Aufträge“ (wf_admin_orders) setzt admin_api.php beim Anmelden in die Session.
 * Legt den Benutzer hier an bzw. hält den Namen aktuell, damit der Verlauf zeigt, wer was angelegt hat.
 * false = kein Zugang zur App.
 */
function wf_user_sync_session(string $adminId): bool
{
    if (isset($_SESSION['wf_admin_orders']) && !$_SESSION['wf_admin_orders']) {
        return false;
    }
    $name = mb_substr(trim((string)($_SESSION['wf_admin_name'] ?? '')), 0, 60);
    if ($name === '') {
        return true;   // ältere Hauptseite ohne Mitarbeiter-Verwaltung: wie bisher
    }
    try {
        $db = wf_db();
        $st = $db->prepare('SELECT id, name, active FROM users WHERE wf_admin_id = ?');
        $st->execute([$adminId]);
        $u = $st->fetch();
        if (!$u) {
            $db->prepare('INSERT INTO users (name, wf_admin_id, active) VALUES (?,?,1)')->execute([$name, $adminId]);
        } elseif (!(int)$u['active']) {
            return false;
        } elseif ($u['name'] !== $name) {
            $db->prepare('UPDATE users SET name = ? WHERE id = ?')->execute([$name, $u['id']]);
        }
    } catch (Throwable $e) {
        // ohne Abgleich weiter wie bisher
    }
    return true;
}

const WF_DEVICE_COOKIE = 'wf_auftraege_device';

/** Pfad der App für das Geräte-Cookie (z. B. /auftraege/), damit es nicht an die ganze Domain geht. */
function wf_app_path(): string
{
    $root = realpath(dirname(__DIR__)) ?: '';
    $file = realpath((string)($_SERVER['SCRIPT_FILENAME'] ?? '')) ?: '';
    $name = (string)($_SERVER['SCRIPT_NAME'] ?? '');
    if ($root === '' || !str_starts_with($file, $root) || $name === '') {
        return '/';
    }
    $rel = str_replace(DIRECTORY_SEPARATOR, '/', substr($file, strlen($root)));
    $base = str_ends_with($name, $rel) ? substr($name, 0, -strlen($rel)) : dirname($name);
    return rtrim($base, '/') . '/';
}

function wf_device_cookie(string $value, int $expires): void
{
    if (headers_sent()) {
        return;
    }
    setcookie(WF_DEVICE_COOKIE, $value, ['expires' => $expires, 'path' => wf_app_path(), 'httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
}

function wf_device_label(): string
{
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $os = preg_match('/Android/i', $ua) ? 'Android' : (preg_match('/iPhone|iPad/i', $ua) ? 'iPhone/iPad' : (preg_match('/Windows/i', $ua) ? 'Windows' : (preg_match('/Mac OS/i', $ua) ? 'Mac' : (preg_match('/Linux/i', $ua) ? 'Linux' : ''))));
    $br = preg_match('/Edg\//', $ua) ? 'Edge' : (preg_match('/SamsungBrowser/', $ua) ? 'Samsung Internet' : (preg_match('/Firefox\//', $ua) ? 'Firefox' : (preg_match('/Chrome\//', $ua) ? 'Chrome' : (preg_match('/Safari\//', $ua) ? 'Safari' : ''))));
    return trim($br . ($br && $os ? ' · ' : '') . $os) ?: 'Gerät';
}

/** Angemeldet über die Hauptseite: Gerät merken (Cookie 1 Jahr), damit die App später auch ohne Hauptseite öffnet. */
function wf_device_remember(string $adminId): void
{
    try {
        $db = wf_db();
        $tok = (string)($_COOKIE[WF_DEVICE_COOKIE] ?? '');
        if ($tok !== '') {
            $st = $db->prepare('SELECT admin_id FROM app_devices WHERE token_hash = ?');
            $st->execute([hash('sha256', $tok)]);
            if ($st->fetchColumn() === $adminId) {
                return;
            }
        }
        $tok = bin2hex(random_bytes(32));
        $db->prepare('INSERT INTO app_devices (token_hash, admin_id, label, last_used_at) VALUES (?,?,?,datetime(\'now\'))')->execute([hash('sha256', $tok), $adminId, wf_device_label()]);
        wf_device_cookie($tok, time() + 365 * 86400);
    } catch (Throwable $e) {
        // ohne Gerät merken weiter wie bisher
    }
}

/** Anmeldung über ein gemerktes Gerät. Gibt die Admin-ID zurück oder null. */
function wf_device_login(): ?string
{
    $tok = (string)($_COOKIE[WF_DEVICE_COOKIE] ?? '');
    if ($tok === '' || !preg_match('/^[0-9a-f]{64}$/', $tok)) {
        return null;
    }
    try {
        $db = wf_db();
        $st = $db->prepare('SELECT id, admin_id, last_used_at FROM app_devices WHERE token_hash = ?');
        $st->execute([hash('sha256', $tok)]);
        $d = $st->fetch();
        if (!$d) {
            wf_device_cookie('', time() - 3600);
            return null;
        }
        if ((string)$d['last_used_at'] < date('Y-m-d H:i:s', time() - 86400)) {
            $db->prepare("UPDATE app_devices SET last_used_at = datetime('now') WHERE id = ?")->execute([$d['id']]);
            wf_device_cookie($tok, time() + 365 * 86400);   // verlängern, solange das Gerät benutzt wird
        }
        return (string)$d['admin_id'];
    } catch (Throwable $e) {
        return null;
    }
}

/** ID des gemerkten Geräts dieser Anfrage (für „dieses Gerät“ in den Einstellungen). */
function wf_device_current(): int
{
    $tok = (string)($_COOKIE[WF_DEVICE_COOKIE] ?? '');
    if ($tok === '') {
        return 0;
    }
    $st = wf_db()->prepare('SELECT id FROM app_devices WHERE token_hash = ?');
    $st->execute([hash('sha256', $tok)]);
    return (int)$st->fetchColumn();
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
