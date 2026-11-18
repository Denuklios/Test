<?php
/* Julekontor – Empfangsstelle für Updates der Website.
   Nimmt nur ein ZIP an, wenn im Kopf "Authorization: Bearer <Schlüssel>" der richtige Schlüssel steht.
   Der Schlüssel selbst wird nirgends gespeichert, nur ein Prüfwert in data/private/deploy-key.php.

   Einrichten: Diese Datei in den Website-Ordner legen (dorthin, wo index.php liegt).
   Innerhalb von 2 Stunden danach einmal POST ?a=setup mit dem gewünschten Schlüssel (mind. 24 Zeichen) aufrufen.
   Danach gilt nur noch dieser Schlüssel. Neuer Schlüssel: data/private/deploy-key.php löschen und Datei neu hochladen.

   Geschützt (wird nie überschrieben): data/private, data/bilder, data/produkte, data/site.json und diese Datei. */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');

const DIR = __DIR__;
const KEYFILE = DIR . '/data/private/deploy-key.php';
const LOCKFILE = DIR . '/data/private/deploy-lock.php';
const PROTECT = ['data/private/', 'data/bilder/', 'data/produkte/'];
const KEEP_IF_EXISTS = ['data/site.json', 'data/private/.htaccess'];

function out(array $d, int $code = 200): never { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function read_php(string $f): array { if (!is_file($f)) return []; $v = include $f; return is_array($v) ? $v : []; }
function write_php(string $f, array $d): void {
    if (!is_dir(dirname($f))) mkdir(dirname($f), 0750, true);
    $t = $f . '.' . bin2hex(random_bytes(4));
    file_put_contents($t, "<?php\nreturn " . var_export($d, true) . ";\n", LOCK_EX); rename($t, $f);
    if (function_exists('opcache_invalidate')) @opcache_invalidate($f, true);
}
function bearer(): string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($h === '' && function_exists('getallheaders')) foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v;
    return preg_match('/^Bearer\s+(\S+)$/i', trim($h), $m) ? $m[1] : '';
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'nur POST'], 405);
if (!is_file(DIR . '/data/private/.htaccess')) {               // Schutz für den Schlüsselordner sicherstellen
    if (!is_dir(DIR . '/data/private')) mkdir(DIR . '/data/private', 0750, true);
    file_put_contents(DIR . '/data/private/.htaccess', "Require all denied\nDeny from all\n");
}
$a = (string)($_GET['a'] ?? '');
$token = bearer();
$key = read_php(KEYFILE);

/* Bremse gegen Raten: nach 5 Fehlversuchen pro Stunde ist Schluss */
$lock = read_php(LOCKFILE);
$lock = array_values(array_filter($lock, fn($t) => is_int($t) && $t > time() - 3600));
if (count($lock) >= 5) out(['error' => 'gesperrt – zu viele Fehlversuche, bitte in einer Stunde erneut'], 429);
$fail = function () use ($lock): never { $lock[] = time(); write_php(LOCKFILE, $lock); out(['error' => 'Schlüssel falsch'], 403); };

if ($a === 'setup') {
    if ($key) out(['error' => 'Schlüssel ist schon eingerichtet'], 409);
    if (time() - filemtime(__FILE__) > 7200) out(['error' => 'Einrichtungszeit abgelaufen – deploy.php neu hochladen'], 403);
    if (strlen($token) < 24) out(['error' => 'Schlüssel zu kurz (mind. 24 Zeichen)'], 422);
    $salt = bin2hex(random_bytes(16));
    write_php(KEYFILE, ['salt' => $salt, 'hash' => hash('sha256', $salt . $token), 'created' => date('c')]);
    out(['ok' => true, 'setup' => true]);
}

if (!$key || $token === '' || !hash_equals($key['hash'], hash('sha256', $key['salt'] . $token))) $fail();

if ($a === 'status') {
    out(['ok' => true, 'php' => PHP_VERSION, 'zip' => class_exists('ZipArchive'), 'writable' => is_writable(DIR),
         'index_php' => is_file(DIR . '/index.php'), 'index_html' => is_file(DIR . '/index.html'), 'max_post' => ini_get('post_max_size')]);
}

if ($a === 'deploy') {
    if (!class_exists('ZipArchive')) out(['error' => 'ZipArchive fehlt auf dem Server'], 500);
    $tmp = tempnam(sys_get_temp_dir(), 'jkd');
    $in = fopen('php://input', 'rb'); $o = fopen($tmp, 'wb'); $n = stream_copy_to_stream($in, $o); fclose($in); fclose($o);
    if ($n < 100) { @unlink($tmp); out(['error' => 'leeres Paket'], 422); }
    $z = new ZipArchive();
    if ($z->open($tmp) !== true) { @unlink($tmp); out(['error' => 'kein gültiges ZIP'], 422); }
    $written = 0; $skipped = [];
    for ($i = 0; $i < $z->numFiles; $i++) {
        $name = str_replace('\\', '/', (string)$z->getNameIndex($i));
        if ($name === '' || str_ends_with($name, '/')) continue;
        if (str_starts_with($name, '/') || preg_match('#(^|/)\.\.(/|$)#', $name) || str_contains($name, "\0")) { $skipped[] = $name; continue; }
        if (basename($name) === 'deploy.php') { $skipped[] = $name; continue; }
        $prot = false; foreach (PROTECT as $p) if (str_starts_with($name, $p)) $prot = true;
        if ($prot && !in_array($name, KEEP_IF_EXISTS, true)) { $skipped[] = $name; continue; }
        $dest = DIR . '/' . $name;
        if (in_array($name, KEEP_IF_EXISTS, true) && is_file($dest)) { $skipped[] = $name; continue; }
        if (!is_dir(dirname($dest))) mkdir(dirname($dest), 0755, true);
        $data = $z->getFromIndex($i);
        if ($data === false) { $skipped[] = $name; continue; }
        $t = $dest . '.' . bin2hex(random_bytes(4)) . '.tmp';
        file_put_contents($t, $data); rename($t, $dest); $written++;
        if (str_ends_with($name, '.php') && function_exists('opcache_invalidate')) @opcache_invalidate($dest, true);
    }
    $z->close(); @unlink($tmp);
    $removed = [];
    if (is_file(DIR . '/index.php') && is_file(DIR . '/index.html')) { @unlink(DIR . '/index.html'); $removed[] = 'index.html'; }
    out(['ok' => true, 'written' => $written, 'skipped' => count($skipped), 'skipped_list' => array_slice($skipped, 0, 50), 'removed' => $removed]);
}

out(['error' => 'unbekannt'], 404);
