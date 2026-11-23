<?php
/**
 * Postwerk – Grundfunktionen: Konfiguration, Datenablage, HTTP, Anmeldung.
 * Läuft auf normalem PHP-Webspace (PHP 8.0+, curl). Keine Datenbank nötig.
 */
declare(strict_types=1);

const PP_VERSION = '1.0.0';
const PP_MB = 1048576;

if (!defined('PP_ROOT')) define('PP_ROOT', dirname(__DIR__));
if (!defined('PP_DATA')) define('PP_DATA', rtrim((string)(getenv('PP_DATA_DIR') ?: PP_ROOT . '/data'), '/'));
if (!defined('PP_MEDIA')) define('PP_MEDIA', rtrim((string)(getenv('PP_MEDIA_DIR') ?: PP_ROOT . '/media'), '/'));

class PPError extends RuntimeException {}
class PPNetError extends RuntimeException {}

/* ------------------------------------------------------------------ Start */

function pp_boot(): void
{
    foreach ([PP_DATA, PP_DATA . '/videos', PP_DATA . '/uploads', PP_DATA . '/cache', PP_MEDIA] as $d) {
        if (!is_dir($d)) @mkdir($d, 0775, true);
    }
    if (!is_dir(PP_DATA) || !is_writable(PP_DATA)) {
        http_response_code(500);
        exit('Der Ordner "data" ist nicht beschreibbar. Bitte Schreibrechte (775) setzen.');
    }
    $deny = "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n";
    if (!is_file(PP_DATA . '/.htaccess')) file_put_contents(PP_DATA . '/.htaccess', $deny);
    if (!is_file(PP_DATA . '/index.html')) file_put_contents(PP_DATA . '/index.html', '');
    if (!is_file(PP_MEDIA . '/.htaccess')) {
        file_put_contents(PP_MEDIA . '/.htaccess', "Options -Indexes\n<FilesMatch \"\\.(php|phtml|phar|pl|py|cgi|sh)$\">\n$deny</FilesMatch>\n");
    }
    if (!is_file(PP_MEDIA . '/index.html')) file_put_contents(PP_MEDIA . '/index.html', '');
    date_default_timezone_set((string)cfg('timezone', 'Europe/Copenhagen'));
    if (!cfg('cron_key')) cfg_set(['cron_key' => bin2hex(random_bytes(16))]);
}

/* ------------------------------------------------------------ Datenablage */

function db_file(string $name): string
{
    return PP_DATA . '/' . preg_replace('/[^a-z0-9_\-]/i', '', $name) . '.json';
}

function db_read(string $name): array
{
    $f = db_file($name);
    if (!is_file($f)) return [];
    $j = json_decode((string)file_get_contents($f), true);
    return is_array($j) ? $j : [];
}

/** Liest, verändert (per Referenz) und schreibt eine JSON-Datei unter Sperre. */
function db_update(string $name, callable $fn)
{
    $f = db_file($name);
    $lock = fopen($f . '.lock', 'c');
    flock($lock, LOCK_EX);
    try {
        $data = db_read($name);
        $res = $fn($data);
        $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
        file_put_contents($tmp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        rename($tmp, $f);
        return $res;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function cfg(string $key, $default = null)
{
    static $env = ['api_base' => 'PP_API_BASE', 'auth_base' => 'PP_AUTH_BASE', 'base_url' => 'PP_BASE_URL'];
    if (isset($env[$key]) && getenv($env[$key])) return getenv($env[$key]);
    $c = db_read('config');
    return array_key_exists($key, $c) ? $c[$key] : $default;
}

function cfg_set(array $values): void
{
    db_update('config', function (array &$c) use ($values) {
        foreach ($values as $k => $v) {
            if ($v === null) unset($c[$k]); else $c[$k] = $v;
        }
    });
}

function pp_log(string $msg, array $ctx = []): void
{
    $f = PP_DATA . '/log.txt';
    if (is_file($f) && filesize($f) > 2 * PP_MB) {
        @rename($f, PP_DATA . '/log.old.txt');
    }
    $line = date('Y-m-d H:i:s') . '  ' . $msg . ($ctx ? '  ' . json_encode($ctx, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '') . "\n";
    @file_put_contents($f, $line, FILE_APPEND | LOCK_EX);
}

function pp_id(string $prefix, int $bytes = 8): string
{
    return $prefix . bin2hex(random_bytes($bytes));
}

/* ------------------------------------------------------------------- HTTP */

/**
 * @return array{status:int, body:string, json:mixed, headers:array}
 */
function pp_http(string $method, string $url, array $headers = [], ?string $body = null, array $curl = []): array
{
    $ch = curl_init($url);
    $respHeaders = [];
    $opts = [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => array_merge($headers, ['Expect:']),
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => 'Postwerk/' . PP_VERSION,
        CURLOPT_HEADERFUNCTION => function ($ch, $h) use (&$respHeaders) {
            $p = strpos($h, ':');
            if ($p !== false) $respHeaders[strtolower(trim(substr($h, 0, $p)))] = trim(substr($h, $p + 1));
            return strlen($h);
        },
    ];
    if ($body !== null) $opts[CURLOPT_POSTFIELDS] = $body;
    curl_setopt_array($ch, array_replace($opts, $curl));
    $resp = curl_exec($ch);
    $err = curl_error($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($resp === false) throw new PPNetError('Netzwerkfehler: ' . $err);
    $resp = is_string($resp) ? $resp : '';
    return ['status' => $status, 'body' => $resp, 'json' => json_decode($resp, true), 'headers' => $respHeaders];
}

/** Prüft, dass eine fremde Adresse öffentlich ist (keine internen Server). */
function pp_check_public_url(string $url): void
{
    $u = parse_url($url);
    if (!$u || !in_array(strtolower($u['scheme'] ?? ''), ['http', 'https'], true) || empty($u['host'])) {
        throw new PPError('Ungültige Adresse: nur http(s)-Links sind erlaubt.');
    }
    if (getenv('PP_ALLOW_PRIVATE_URLS')) return; // nur für Tests
    $host = $u['host'];
    $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
    if (!$ips) throw new PPError('Adresse nicht erreichbar: ' . $host);
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw new PPError('Interne Adressen sind nicht erlaubt.');
        }
    }
}

/** Lädt eine Datei herunter (mit Größenlimit, Weiterleitungen geprüft). */
function pp_download(string $url, string $dest, int $maxBytes): array
{
    for ($i = 0; $i < 6; $i++) {
        pp_check_public_url($url);
        $fh = fopen($dest, 'wb');
        $got = 0;
        $tooBig = false;
        $r = pp_http('GET', $url, [], null, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_TIMEOUT => 600,
            CURLOPT_WRITEFUNCTION => function ($ch, $data) use ($fh, &$got, $maxBytes, &$tooBig) {
                $got += strlen($data);
                if ($got > $maxBytes) { $tooBig = true; return 0; }
                return fwrite($fh, $data);
            },
        ]);
        fclose($fh);
        if ($tooBig) { @unlink($dest); throw new PPError('Datei ist zu groß (max. ' . round($maxBytes / PP_MB) . ' MB).'); }
        if ($r['status'] >= 300 && $r['status'] < 400 && !empty($r['headers']['location'])) {
            $loc = $r['headers']['location'];
            if (!preg_match('~^https?://~i', $loc)) {
                $p = parse_url($url);
                $loc = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '') . ($loc[0] === '/' ? $loc : '/' . $loc);
            }
            $url = $loc;
            continue;
        }
        if ($r['status'] !== 200) { @unlink($dest); throw new PPError('Download fehlgeschlagen (HTTP ' . $r['status'] . ').'); }
        return ['size' => $got, 'type' => $r['headers']['content-type'] ?? '', 'url' => $url];
    }
    @unlink($dest);
    throw new PPError('Zu viele Weiterleitungen.');
}

/* ------------------------------------------------------------ Web-Helfer */

function h($s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function pp_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') == 443);
}

function pp_base_url(): string
{
    $b = (string)cfg('base_url', '');
    if ($b !== '') return rtrim($b, '/');
    if (empty($_SERVER['HTTP_HOST'])) return '';
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return (pp_is_https() ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . $dir;
}

function pp_json_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
}

function pp_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('postwerk');
    $path = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/';
    session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 30, 'path' => $path, 'httponly' => true, 'samesite' => 'Lax', 'secure' => pp_is_https()]);
    ini_set('session.gc_maxlifetime', (string)(60 * 60 * 24 * 30));
    session_start();
}

function pp_logged_in(): bool
{
    pp_session();
    return !empty($_SESSION['pp_user']) && ($_SESSION['pp_pwv'] ?? '') === substr((string)cfg('password_hash', ''), -12);
}

function pp_csrf(): string
{
    pp_session();
    if (empty($_SESSION['pp_csrf'])) $_SESSION['pp_csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['pp_csrf'];
}

function pp_csrf_ok(?string $t): bool
{
    pp_session();
    return is_string($t) && !empty($_SESSION['pp_csrf']) && hash_equals($_SESSION['pp_csrf'], $t);
}

function pp_login(string $password): bool
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
    $blocked = db_update('logins', function (array &$l) use ($ip) {
        foreach ($l as $k => $v) if ($v['t'] < time() - 900) unset($l[$k]);
        return ($l[$ip]['n'] ?? 0) >= 8;
    });
    if ($blocked) return false;
    $hash = (string)cfg('password_hash', '');
    if ($hash !== '' && password_verify($password, $hash)) {
        pp_session();
        session_regenerate_id(true);
        $_SESSION['pp_user'] = 1;
        $_SESSION['pp_pwv'] = substr($hash, -12);
        db_update('logins', function (array &$l) use ($ip) { unset($l[$ip]); });
        return true;
    }
    usleep(600000);
    db_update('logins', function (array &$l) use ($ip) {
        $l[$ip] = ['n' => ($l[$ip]['n'] ?? 0) + 1, 't' => time()];
    });
    return false;
}

/* ------------------------------------------------------------ API-Schlüssel */

function pp_request_key(): ?string
{
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$h && function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v;
    }
    if (preg_match('/^Bearer\s+(\S+)$/i', $h, $m)) return $m[1];
    if (!empty($_SERVER['HTTP_X_API_KEY'])) return $_SERVER['HTTP_X_API_KEY'];
    if (!empty($_GET['key'])) return (string)$_GET['key'];
    return null;
}

function pp_key_create(string $name): string
{
    $key = 'pw_' . bin2hex(random_bytes(24));
    db_update('config', function (array &$c) use ($key, $name) {
        $c['api_keys'][] = ['id' => pp_id('k', 4), 'name' => $name, 'hash' => hash('sha256', $key), 'created' => time(), 'last_used' => null];
    });
    return $key;
}

function pp_key_check(?string $key): ?array
{
    if (!$key) return null;
    $hash = hash('sha256', $key);
    foreach ((array)cfg('api_keys', []) as $k) {
        if (hash_equals($k['hash'], $hash)) {
            if (($k['last_used'] ?? 0) < time() - 60) {
                db_update('config', function (array &$c) use ($hash) {
                    foreach ($c['api_keys'] as &$x) if ($x['hash'] === $hash) $x['last_used'] = time();
                });
            }
            return $k;
        }
    }
    return null;
}

function pp_key_revoke(string $id): void
{
    db_update('config', function (array &$c) use ($id) {
        $c['api_keys'] = array_values(array_filter($c['api_keys'] ?? [], fn($k) => $k['id'] !== $id));
    });
}

/* ---------------------------------------------------------------- Zeiten */

/** Wandelt Eingaben wie "2026-11-24 18:30", ISO 8601, "now" oder Unix-Zeit in einen Zeitstempel. */
function pp_parse_time($v): int
{
    if ($v === null || $v === '' || $v === 'now' || $v === 'jetzt' || $v === 'sofort') return time();
    if (is_int($v) || (is_string($v) && ctype_digit($v) && strlen($v) >= 9)) return (int)$v;
    try {
        $d = new DateTime((string)$v, new DateTimeZone(date_default_timezone_get()));
    } catch (Exception $e) {
        throw new PPError('Zeitpunkt nicht lesbar: ' . $v . ' (Beispiel: 2026-11-24 18:30)');
    }
    return $d->getTimestamp();
}

function pp_fmt_time(?int $ts, string $fmt = 'd.m.Y H:i'): string
{
    if (!$ts) return '–';
    return strtr(date($fmt, $ts), [
        'Monday' => 'Montag', 'Tuesday' => 'Dienstag', 'Wednesday' => 'Mittwoch', 'Thursday' => 'Donnerstag', 'Friday' => 'Freitag', 'Saturday' => 'Samstag', 'Sunday' => 'Sonntag',
        'Mon' => 'Mo', 'Tue' => 'Di', 'Wed' => 'Mi', 'Thu' => 'Do', 'Fri' => 'Fr', 'Sat' => 'Sa', 'Sun' => 'So',
    ]);
}

function pp_iso(?int $ts): ?string
{
    return $ts ? date('c', $ts) : null;
}
