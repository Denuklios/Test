<?php
/* Julekontor Admin – Grundgerüst: Sitzung, Anmeldung, Schutz gegen Fremd-Formulare (CSRF), Dateien lesen/schreiben. */
declare(strict_types=1);

const JK_ROOT    = __DIR__ . '/../..';
const JK_DATA    = JK_ROOT . '/data';
const JK_PRIVATE = JK_DATA . '/private';
const JK_CONFIG  = JK_PRIVATE . '/config.php';
const JK_LOCK    = JK_PRIVATE . '/login-attempts.php';

/* Bereiche des Admin. Neue Bereiche: hier eintragen und eine Datei pages/<id>.php anlegen.
   'ready' => false zeigt den Bereich als „kommt bald“. */
const JK_MODULES = [
    'dashboard'  => ['title' => 'Übersicht',       'icon' => '🏠', 'ready' => true],
    'startseite' => ['title' => 'Startseite',      'icon' => '⏳', 'ready' => true],
    'kontakt'    => ['title' => 'Kontakt & Adresse', 'icon' => '📍', 'ready' => false],
    'zeiten'     => ['title' => 'Öffnungszeiten',  'icon' => '🕯️', 'ready' => false],
    'bilder'     => ['title' => 'Bilder',          'icon' => '🖼️', 'ready' => false],
    'konto'      => ['title' => 'Mein Konto',      'icon' => '🔑', 'ready' => true],
];

ini_set('display_errors', '0');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');

session_name('jk_admin');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => dirname($_SERVER['SCRIPT_NAME']) . '/',
    'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

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
function redirect(string $page): never {
    header('Location: ./?p=' . rawurlencode($page));
    exit;
}
