<?php
/* Julekontor Admin – Grundgerüst: Sitzung, Anmeldung, Schutz gegen Fremd-Formulare (CSRF), Dateien lesen/schreiben. */
declare(strict_types=1);

const JK_ROOT    = __DIR__ . '/../..';
const JK_DATA    = JK_ROOT . '/data';
const JK_PRIVATE = JK_DATA . '/private';
const JK_CONFIG  = JK_PRIVATE . '/config.php';
const JK_LOCK    = JK_PRIVATE . '/login-attempts.php';

/* Bereiche des Admin. Neue Bereiche: hier eintragen und eine Datei pages/<id>.php anlegen.
   'ready' => false zeigt den Bereich als „kommt bald“. 'roles' = wer ihn sehen darf. */
const JK_ALL = ['admin', 'kasse'];
const JK_MODULES = [
    'dashboard'     => ['title' => 'Übersicht',        'icon' => '🏠', 'ready' => true,  'group' => '',        'roles' => JK_ALL],
    'kasse'         => ['title' => 'Kasse öffnen',     'icon' => '🧾', 'ready' => true,  'group' => 'Laden',   'roles' => JK_ALL, 'href' => 'kasse/'],
    'artikel'       => ['title' => 'Artikel',          'icon' => '🏷️', 'ready' => true,  'group' => 'Laden',   'roles' => ['admin']],
    'lager'         => ['title' => 'Lager',            'icon' => '📦', 'ready' => true,  'group' => 'Laden',   'roles' => ['admin']],
    'verkaeufe'     => ['title' => 'Belege',           'icon' => '🧮', 'ready' => true,  'group' => 'Laden',   'roles' => JK_ALL],
    'abschluss'     => ['title' => 'Tagesabschluss',   'icon' => '🔒', 'ready' => true,  'group' => 'Laden',   'roles' => JK_ALL],
    'berichte'      => ['title' => 'Berichte',         'icon' => '📊', 'ready' => true,  'group' => 'Laden',   'roles' => ['admin']],
    'etiketten'     => ['title' => 'Etiketten',        'icon' => '🔖', 'ready' => true,  'group' => 'Laden',   'roles' => ['admin']],
    'einstellungen' => ['title' => 'Kassen-Einstellungen', 'icon' => '⚙️', 'ready' => true, 'group' => 'Laden', 'roles' => ['admin']],
    'startseite'    => ['title' => 'Startseite',       'icon' => '⏳', 'ready' => true,  'group' => 'Website', 'roles' => ['admin']],
    'kontakt'       => ['title' => 'Kontakt & Adresse', 'icon' => '📍', 'ready' => false, 'group' => 'Website', 'roles' => ['admin']],
    'zeiten'        => ['title' => 'Öffnungszeiten',   'icon' => '🕯️', 'ready' => false, 'group' => 'Website', 'roles' => ['admin']],
    'bilder'        => ['title' => 'Bilder',           'icon' => '🖼️', 'ready' => false, 'group' => 'Website', 'roles' => ['admin']],
    'benutzer'      => ['title' => 'Benutzer',         'icon' => '👥', 'ready' => true,  'group' => 'Konto',   'roles' => ['admin']],
    'konto'         => ['title' => 'Mein Konto',       'icon' => '🔑', 'ready' => true,  'group' => 'Konto',   'roles' => JK_ALL],
];

date_default_timezone_set('Europe/Copenhagen');
ini_set('display_errors', '0');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

/* Eigene Sitzungsablage mit 12 Stunden Laufzeit: Das Kassen-Tablet soll nicht nach 24 Minuten Pause abgemeldet werden. */
$sessDir = JK_PRIVATE . '/sessions';
if (!is_dir($sessDir)) @mkdir($sessDir, 0750, true);
if (is_dir($sessDir) && is_writable($sessDir)) session_save_path($sessDir);
ini_set('session.gc_maxlifetime', '43200');
ini_set('session.use_strict_mode', '1');
if (!defined('JK_NO_SESSION')) {
session_name('jk_admin');
session_set_cookie_params([
    'lifetime' => 43200,
    'path'     => rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'], basename(dirname($_SERVER['SCRIPT_NAME'])) === 'kasse' ? 2 : 1)), '/') . '/',
    'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
}

function h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

/* ---------- Dateien ---------- */
function write_atomic(string $file, string $content): void {
    $dir = dirname($file);
    if (!is_dir($dir)) mkdir($dir, 0750, true);
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $content, LOCK_EX) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        throw new RuntimeException('Datei konnte nicht gespeichert werden: ' . basename($file));
    }
}
/* Private Daten liegen als PHP-Datei vor: Selbst wenn .htaccess nicht greift, gibt der Server sie nie als Text heraus. */
function read_private(string $file): array {
    if (!is_file($file)) return [];
    $v = include $file;
    return is_array($v) ? $v : [];
}
function write_private(string $file, array $data): void {
    write_atomic($file, "<?php\n// Automatisch erzeugt – nicht von Hand bearbeiten.\nreturn " . var_export($data, true) . ";\n");
    if (function_exists('opcache_invalidate')) @opcache_invalidate($file, true);
}
function read_json(string $name): array {
    $f = JK_DATA . '/' . $name . '.json';
    $v = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    return is_array($v) ? $v : [];
}
function write_json(string $name, array $data): void {
    write_atomic(JK_DATA . '/' . $name . '.json',
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
}

/* ---------- Konto ---------- */
function config(): array { return read_private(JK_CONFIG); }
function is_set_up(): bool { return !empty(config()['users']); }
function current_user(): ?array {
    $email = $_SESSION['user'] ?? null;
    if (!$email) return null;
    foreach (config()['users'] ?? [] as $u) if ($u['email'] === $email) return $u;
    return null;
}
function role(): string { return current_user()['role'] ?? 'admin'; }
function can(string $module): bool { return isset(JK_MODULES[$module]) && in_array(role(), JK_MODULES[$module]['roles'], true); }
function user_name(?array $u = null): string { $u ??= current_user(); return (string)($u['name'] ?? '') ?: (string)($u['email'] ?? ''); }

function login_user(string $email): void {
    session_regenerate_id(true);
    $_SESSION['user'] = $email;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
function logout_user(): void {
    $_SESSION = [];
    session_regenerate_id(true);
}

/* Bremse gegen Passwort-Raten: nach 5 Fehlversuchen 15 Minuten Pause je IP-Adresse. */
function attempts_key(): string { return hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '-'); }
function login_blocked(): int {
    $a = read_private(JK_LOCK)[attempts_key()] ?? null;
    if (!$a || $a['n'] < 5) return 0;
    $left = $a['t'] + 900 - time();
    return max(0, $left);
}
function login_failed(): void {
    $all = read_private(JK_LOCK);
    foreach ($all as $k => $a) if ($a['t'] < time() - 900) unset($all[$k]);
    $k = attempts_key();
    $all[$k] = ['n' => ($all[$k]['n'] ?? 0) + 1, 't' => time()];
    write_private(JK_LOCK, $all);
}
function login_ok(): void {
    $all = read_private(JK_LOCK);
    unset($all[attempts_key()]);
    write_private(JK_LOCK, $all);
}

/* ---------- Formulare ---------- */
function csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . h(csrf_token()) . '">'; }
function csrf_check(): void {
    if (!hash_equals(csrf_token(), (string)($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('Das Formular ist abgelaufen. Bitte Seite neu laden und noch einmal versuchen.');
    }
}
function flash(?string $msg = null, string $type = 'ok'): ?array {
    if ($msg !== null) { $_SESSION['flash'] = ['msg' => $msg, 'type' => $type]; return null; }
    $f = $_SESSION['flash'] ?? null;
    unset($_SESSION['flash']);
    return $f;
}
/* redirect('artikel') oder redirect('artikel&id=5') – der Teil nach dem ersten & muss schon kodiert sein */
function redirect(string $page): never {
    [$page, $frag] = array_pad(explode('#', $page, 2), 2, null);
    [$p, $rest] = array_pad(explode('&', $page, 2), 2, null);
    header('Location: ./?p=' . rawurlencode($p) . ($rest !== null ? '&' . $rest : '') . ($frag !== null ? '#' . rawurlencode($frag) : ''));
    exit;
}
