<?php
/*
  Dienstplan – Sonderpreis Baumarkt (PHP, keine Datenbank nötig)
  Einfach diese Datei in einen Ordner auf deiner Domain hochladen (z. B. /dienstplan/index.php)
  und die Seite sofort einmal öffnen: Dort legst du dein Admin-Passwort fest.
  Der Ordner muss Schreibrechte haben, damit "dienstplan-data" angelegt werden kann.
  Benötigt PHP 7.3 oder neuer.
*/
error_reporting(E_ALL);
ini_set('display_errors', '0');
define('DIR_', __DIR__ . '/dienstplan-data');
$DB = null;
$FH = null;

/* ---------- Hilfen ---------- */
function out($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function bad($m, $c = 400) { out(['error' => $m], $c); }
function lower($s) { return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s); }
function cut($s, $n) { return function_exists('mb_substr') ? mb_substr($s, 0, $n, 'UTF-8') : substr($s, 0, $n); }
function norm($s) { return lower(trim((string)$s)); }
function rnd($n) {
    $a = 'abcdefghjkmnpqrstuvwxyz23456789'; $s = '';
    for ($i = 0; $i < $n; $i++) $s .= $a[random_int(0, strlen($a) - 1)];
    return $s;
}
function is_https() {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}
function base_path() { return rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/') . '/'; }
function tm($s) { return is_string($s) && preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $s) === 1; }

function open_db($write) {
    global $DB, $FH;
    $g = glob(DIR_ . '/daten-*.php');
    if (!$g) return false;
    $FH = fopen($g[0], 'c+');
    if (!$FH) bad('Datei nicht lesbar. Bitte Schreibrechte prüfen.', 500);
    flock($FH, $write ? LOCK_EX : LOCK_SH);
    $raw = stream_get_contents($FH);
    $p = strpos($raw, "\n");
    $DB = json_decode($p === false ? '' : substr($raw, $p + 1), true);
    if (!is_array($DB)) bad('Datenfehler', 500);
    return true;
}
function save_db() {
    global $DB, $FH;
    ftruncate($FH, 0); rewind($FH);
    fwrite($FH, "<?php exit; ?>\n" . json_encode($DB, JSON_UNESCAPED_UNICODE));
    fflush($FH);
}
function set_pw(&$u, $pw) {
    $u['hash'] = password_hash($pw, PASSWORD_DEFAULT);
    $u['ver'] = ($u['ver'] ?? 0) + 1;
}
function default_templates() {
    return [
        ['id' => 't1', 'name' => 'Früh', 'start' => '08:00', 'end' => '16:30', 'color' => '#2f80ed'],
        ['id' => 't2', 'name' => 'Spät', 'start' => '11:30', 'end' => '20:00', 'color' => '#f2994a'],
        ['id' => 't3', 'name' => 'Frei', 'start' => '', 'end' => '', 'color' => '#94a3b8'],
        ['id' => 't4', 'name' => 'Urlaub', 'start' => '', 'end' => '', 'color' => '#27ae60'],
        ['id' => 't5', 'name' => 'Krank', 'start' => '', 'end' => '', 'color' => '#eb5757'],
    ];
}

/* ---------- Login-Cookie (signiert, unabhängig von PHP-Sessions) ---------- */
function sign($p) { global $DB; return hash_hmac('sha256', $p, $DB['secret']); }
function set_login($role, $u) {
    $id = $role === 'admin' ? 'admin' : $u['id'];
    $exp = time() + 30 * 86400;
    $p = $role . '.' . $id . '.' . ($u['ver'] ?? 0) . '.' . $exp;
    setcookie('sid', $p . '.' . sign($p), ['expires' => $exp, 'path' => base_path(), 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
}
function clear_login() {
    setcookie('sid', '', ['expires' => time() - 3600, 'path' => base_path(), 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
}
function read_session() {
    global $DB;
    if (empty($_COOKIE['sid'])) return null;
    $parts = explode('.', $_COOKIE['sid']);
    if (count($parts) !== 5) return null;
    $p = implode('.', array_slice($parts, 0, 4));
    if (!hash_equals(sign($p), $parts[4])) return null;
    if (time() > (int)$parts[3]) return null;
    if ($parts[0] === 'admin') {
        if ((int)($DB['admin']['ver'] ?? 0) !== (int)$parts[2]) return null;
        return ['role' => 'admin', 'idx' => -1];
    }
    foreach ($DB['emps'] as $i => $e) {
        if ($e['id'] === $parts[1]) {
            if ((int)($e['ver'] ?? 0) !== (int)$parts[2]) return null;
            return ['role' => 'emp', 'idx' => $i];
        }
    }
    return null;
}
/* ---------- App-Token (Authorization: Bearer), 90 Tage gültig, pro Gerät ---------- */
define('TOKEN_DAYS', 90);
function bearer() {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if ($h === '' && function_exists('getallheaders')) foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v;
    if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', trim((string)$h), $m)) return strtolower($m[1]);
    // Manche Hoster entfernen den Authorization-Header, daher zusätzlich ein eigener Header
    $x = (string)($_SERVER['HTTP_X_DIENSTPLAN_TOKEN'] ?? '');
    return preg_match('/^[a-f0-9]{64}$/i', $x) ? strtolower($x) : null;
}
function prune_tokens() {
    global $DB;
    if (empty($DB['tokens'])) { $DB['tokens'] = []; return; }
    foreach ($DB['tokens'] as $k => $t) if (($t['exp'] ?? 0) < time()) unset($DB['tokens'][$k]);
}
function issue_token($s, $device, $label) {
    global $DB;
    prune_tokens();
    $u = user_ref($s);
    $id = $s['role'] === 'admin' ? 'admin' : $u['id'];
    // Ein Token pro Gerät: altes Token desselben Geräts ersetzen
    foreach ($DB['tokens'] as $k => $t) if ($t['uid'] === $id && $t['dev'] === $device) unset($DB['tokens'][$k]);
    $mine = array_filter($DB['tokens'], function ($t) use ($id) { return $t['uid'] === $id; });
    if (count($mine) >= 10) { uasort($mine, function ($a, $b) { return $a['t'] - $b['t']; }); unset($DB['tokens'][array_key_first($mine)]); }
    $tok = bin2hex(random_bytes(32));
    $DB['tokens'][hash('sha256', $tok)] = ['uid' => $id, 'ver' => (int)($u['ver'] ?? 0), 'dev' => $device, 'label' => $label, 't' => time(), 'exp' => time() + TOKEN_DAYS * 86400];
    return $tok;
}
function read_token($tok) {
    global $DB;
    $t = $DB['tokens'][hash('sha256', $tok)] ?? null;
    if (!$t || ($t['exp'] ?? 0) < time()) return null;
    if ($t['uid'] === 'admin') {
        if ((int)($DB['admin']['ver'] ?? 0) !== (int)$t['ver']) return null;
        return ['role' => 'admin', 'idx' => -1, 'tok' => $tok];
    }
    foreach ($DB['emps'] as $i => $e) if ($e['id'] === $t['uid']) {
        if ((int)($e['ver'] ?? 0) !== (int)$t['ver']) return null;
        return ['role' => 'emp', 'idx' => $i, 'tok' => $tok];
    }
    return null;
}
function drop_tokens_of($uid) {
    global $DB;
    foreach ($DB['tokens'] ?? [] as $k => $t) if ($t['uid'] === $uid) unset($DB['tokens'][$k]);
}
function check_login($b) {
    global $DB;
    $user = norm($b['user'] ?? ''); $pw = (string)($b['pw'] ?? '');
    $fk = ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $user;
    $f = $DB['fails'][$fk] ?? null;
    if ($f && $f['until'] > time()) bad('Zu viele Versuche. Bitte kurz warten.', 429);
    $s = null;
    if ($user === 'admin') { if (password_verify($pw, $DB['admin']['hash'])) $s = ['role' => 'admin', 'idx' => -1]; }
    else foreach ($DB['emps'] as $i => $e) if (norm($e['name']) === $user && password_verify($pw, $e['hash'])) { $s = ['role' => 'emp', 'idx' => $i]; break; }
    if (!$s) {
        $n = ($f['n'] ?? 0) + 1;
        $DB['fails'][$fk] = ['n' => $n, 'until' => $n >= 5 ? time() + 60 : 0, 't' => time()];
        foreach ($DB['fails'] as $k => $v) if (($v['t'] ?? 0) < time() - 3600) unset($DB['fails'][$k]);
        save_db();
        bad('Name oder Passwort falsch.', 401);
    }
    unset($DB['fails'][$fk]);
    return $s;
}
function mins($a, $b) {
    $x = (int)substr($a, 0, 2) * 60 + (int)substr($a, 3, 2); $y = (int)substr($b, 0, 2) * 60 + (int)substr($b, 3, 2);
    return $y > $x ? $y - $x : $y + 1440 - $x;
}

function &user_ref($s) {
    global $DB;
    if ($s['role'] === 'admin') return $DB['admin'];
    return $DB['emps'][$s['idx']];
}
function state_for($s) {
    global $DB;
    $adm = $s['role'] === 'admin';
    if ($adm) $me = ['role' => 'admin', 'id' => 'admin', 'name' => 'Admin', 'mustChange' => false];
    else { $u = $DB['emps'][$s['idx']]; $me = ['role' => 'emp', 'id' => $u['id'], 'name' => $u['name'], 'mustChange' => !empty($u['mustChange'])]; }
    $emps = [];
    foreach ($DB['emps'] as $e) {
        $o = ['id' => $e['id'], 'name' => $e['name']];
        if ($adm) { $o['mustChange'] = !empty($e['mustChange']); if (!empty($e['mustChange'])) $o['initPw'] = $e['initPw']; }
        $emps[] = $o;
    }
    return ['me' => $me, 'emps' => $emps, 'templates' => array_values($DB['templates']), 'plan' => $DB['plan'] ? $DB['plan'] : new stdClass()];
}
function clean_name($n, $selfId = null) {
    global $DB;
    $n = cut(trim(preg_replace('/\s+/u', ' ', (string)$n)), 30);
    if ($n === '') bad('Bitte einen Namen eingeben.');
    if (norm($n) === 'admin') bad('Dieser Name ist reserviert.');
    foreach ($DB['emps'] as $e) if ($e['id'] !== $selfId && norm($e['name']) === norm($n)) bad('Dieser Vorname existiert schon. Bitte unterscheiden, z. B. „Tim K“.', 409);
    return $n;
}
function clean_cell($c) {
    global $DB;
    if ($c === null) return null;
    if (!is_array($c) || !isset($c['t']) || !is_string($c['t'])) bad('Ungültiger Dienst');
    if ($c['t'] !== '') {
        $ok = false;
        foreach ($DB['templates'] as $t) if ($t['id'] === $c['t']) $ok = true;
        if (!$ok) bad('Unbekannter Dienst');
    }
    $o = ['t' => $c['t']];
    if (array_key_exists('s', $c)) {
        if (!tm($c['s']) || !tm($c['e'] ?? null)) bad('Ungültige Uhrzeit');
        $o['s'] = $c['s']; $o['e'] = $c['e'];
    }
    if (array_key_exists('n', $c) && $c['n'] !== null) {
        if (!is_string($c['n'])) bad('Ungültige Notiz');
        $n = cut(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $c['n'])), 80);
        if ($n !== '') $o['n'] = $n;
    }
    return $o;
}

/* ---------- API ---------- */
$api = $_GET['api'] ?? null;
if ($api !== null) {
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'dienstplan') bad('Ungültige Anfrage');
    $b = [];
    if ($method === 'POST') { $b = json_decode(file_get_contents('php://input'), true); if (!is_array($b)) $b = []; }

    $exists = (bool)glob(DIR_ . '/daten-*.php');
    $resetFlag = file_exists(DIR_ . '/RESET_ADMIN');

    if ($api === 'state' && $method === 'GET' && !$exists) out(['setup' => 'first']);
    if ($api === 'state' && $method === 'GET' && $resetFlag) out(['setup' => 'admin']);

    if ($api === 'setup' && $method === 'POST') {
        $pw = (string)($b['pw'] ?? '');
        if (strlen($pw) < 6) bad('Das Passwort braucht mindestens 6 Zeichen.');
        if (!$exists) {
            if (!is_dir(DIR_) && !@mkdir(DIR_, 0755)) bad('Der Ordner „dienstplan-data“ konnte nicht angelegt werden. Bitte Schreibrechte für den Ordner prüfen.', 500);
            @file_put_contents(DIR_ . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
            @file_put_contents(DIR_ . '/index.html', '');
            $DB = ['secret' => bin2hex(random_bytes(32)), 'admin' => [], 'emps' => [], 'templates' => default_templates(), 'plan' => [], 'fails' => []];
            set_pw($DB['admin'], $pw);
            for ($i = 1; $i <= 10; $i++) {
                $u = ['id' => 'm' . $i, 'name' => 'Mitarbeiter' . $i]; $sp = rnd(6);
                set_pw($u, $sp); $u['mustChange'] = true; $u['initPw'] = $sp; $DB['emps'][] = $u;
            }
            $FH = @fopen(DIR_ . '/daten-' . bin2hex(random_bytes(8)) . '.php', 'c+');
            if (!$FH) bad('Datei konnte nicht angelegt werden. Bitte Schreibrechte prüfen.', 500);
            flock($FH, LOCK_EX); save_db();
        } elseif ($resetFlag) {
            open_db(true); set_pw($DB['admin'], $pw); save_db(); @unlink(DIR_ . '/RESET_ADMIN');
        } else bad('Die Einrichtung ist bereits abgeschlossen.', 403);
        set_login('admin', $DB['admin']);
        out(state_for(['role' => 'admin', 'idx' => -1]));
    }

    if (!$exists) bad('Noch nicht eingerichtet.', 401);
    open_db($method === 'POST');

    if ($api === 'login' && $method === 'POST') {
        $s = check_login($b); save_db();
        set_login($s['role'], user_ref($s));
        out(state_for($s));
    }
    if ($api === 'apilogin' && $method === 'POST') {
        $dev = (string)($b['device'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $dev)) bad('Ungültige Geräte-Kennung');
        $label = cut(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string)($b['label'] ?? ''))), 40);
        if (!is_https()) bad('Die App braucht eine HTTPS-Verbindung.', 403);
        $s = check_login($b);
        $tok = issue_token($s, $dev, $label); save_db();
        out(['token' => $tok, 'expires' => time() + TOKEN_DAYS * 86400, 'state' => state_for($s)]);
    }
    if ($api === 'logout' && $method === 'POST') {
        $tok = bearer();
        if ($tok !== null && isset($DB['tokens'][hash('sha256', $tok)])) { unset($DB['tokens'][hash('sha256', $tok)]); save_db(); }
        clear_login(); out(['ok' => true]);
    }

    $tok = bearer();
    $s = $tok !== null ? read_token($tok) : read_session();
    if (!$s) bad('Bitte anmelden.', 401);
    if ($api === 'state' && $method === 'GET') out(state_for($s));
    if ($api === 'hours' && $method === 'GET') {
        $mo = (string)($_GET['month'] ?? '');
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $mo)) bad('Ungültiger Monat');
        $tpl = [];
        foreach ($DB['templates'] as $t) $tpl[$t['id']] = $t;
        $res = [];
        foreach ($DB['emps'] as $e) {
            if ($s['role'] !== 'admin' && $e['id'] !== $DB['emps'][$s['idx']]['id']) continue;
            $sum = 0; $n = 0;
            foreach ($DB['plan'] as $k => $day) {
                if (strpos($k, $mo . '-') !== 0 || !isset($day[$e['id']])) continue;
                $c = $day[$e['id']]; $t = $tpl[$c['t']] ?? null;
                $st = isset($c['s']) ? $c['s'] : ($t['start'] ?? ''); $en = isset($c['s']) ? $c['e'] : ($t['end'] ?? '');
                if (tm($st) && tm($en)) { $sum += mins($st, $en); $n++; }
            }
            $res[] = ['id' => $e['id'], 'name' => $e['name'], 'minutes' => $sum, 'shifts' => $n];
        }
        out(['month' => $mo, 'emps' => $res]);
    }
    if ($method !== 'POST') bad('Nicht gefunden', 404);

    if ($api === 'password') {
        $u = &user_ref($s); $pw = (string)($b['pw'] ?? ''); $old = (string)($b['old'] ?? '');
        if (!password_verify($old, $u['hash'])) bad('Das aktuelle Passwort stimmt nicht.', 403);
        if (strlen($pw) < 6) bad('Das neue Passwort braucht mindestens 6 Zeichen.');
        if ($pw === $old) bad('Bitte ein anderes Passwort wählen.');
        set_pw($u, $pw); unset($u['mustChange'], $u['initPw']);
        // Andere Geräte sind durch die neue Version abgemeldet, dieses Gerät bleibt angemeldet
        if (!empty($s['tok'])) { $DB['tokens'][hash('sha256', $s['tok'])]['ver'] = $u['ver']; }
        prune_tokens(); save_db();
        if (empty($s['tok'])) set_login($s['role'], $u);
        out(state_for($s));
    }
    if ($s['role'] !== 'admin') bad('Keine Berechtigung.', 403);

    if ($api === 'plan') {
        $ch = $b['changes'] ?? null;
        if (!is_array($ch) || count($ch) > 40) bad('Ungültige Änderung');
        $staged = [];
        foreach ($ch as $k => $day) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$k)) bad('Ungültiges Datum');
            if (!is_array($day)) bad('Ungültige Änderung');
            foreach ($day as $eid => $cell) {
                $found = false;
                foreach ($DB['emps'] as $e) if ($e['id'] === (string)$eid) $found = true;
                if (!$found) bad('Unbekannter Mitarbeiter');
                $staged[] = [(string)$k, (string)$eid, clean_cell($cell)];
            }
        }
        foreach ($staged as $x) {
            list($k, $eid, $c) = $x;
            if ($c === null) { unset($DB['plan'][$k][$eid]); }
            else { $DB['plan'][$k][$eid] = $c; }
            if (isset($DB['plan'][$k]) && !$DB['plan'][$k]) unset($DB['plan'][$k]);
        }
        save_db(); out(state_for($s));
    }
    if ($api === 'emp') {
        if (count($DB['emps']) >= 15) bad('Maximal 15 Mitarbeiter.');
        $u = ['id' => 'm' . base_convert((string)(int)(microtime(true) * 1000), 10, 36), 'name' => clean_name($b['name'] ?? '')];
        $sp = rnd(6); set_pw($u, $sp); $u['mustChange'] = true; $u['initPw'] = $sp;
        $DB['emps'][] = $u; save_db(); out(state_for($s));
    }
    if ($api === 'emp/rename') {
        foreach ($DB['emps'] as $i => $e) if ($e['id'] === ($b['id'] ?? '')) {
            $DB['emps'][$i]['name'] = clean_name($b['name'] ?? '', $e['id']);
            $DB['emps'][$i]['ver'] = ($e['ver'] ?? 0) + 1;
            save_db(); out(state_for($s));
        }
        bad('Unbekannt', 404);
    }
    if ($api === 'emp/reset') {
        foreach ($DB['emps'] as $i => $e) if ($e['id'] === ($b['id'] ?? '')) {
            $sp = rnd(6); set_pw($DB['emps'][$i], $sp); $DB['emps'][$i]['mustChange'] = true; $DB['emps'][$i]['initPw'] = $sp;
            drop_tokens_of($e['id']); save_db(); out(state_for($s));
        }
        bad('Unbekannt', 404);
    }
    if ($api === 'emp/delete') {
        $id = (string)($b['id'] ?? '');
        $DB['emps'] = array_values(array_filter($DB['emps'], function ($e) use ($id) { return $e['id'] !== $id; }));
        foreach (array_keys($DB['plan']) as $k) { unset($DB['plan'][$k][$id]); if (!$DB['plan'][$k]) unset($DB['plan'][$k]); }
        drop_tokens_of($id); save_db(); out(state_for($s));
    }
    if ($api === 'templates') {
        $list = $b['templates'] ?? null;
        if (!is_array($list) || count($list) > 20) bad('Maximal 20 Dienste.');
        $outl = [];
        foreach ($list as $t) {
            $name = cut(trim((string)($t['name'] ?? '')), 20); if ($name === '') bad('Jeder Dienst braucht einen Namen.');
            $st = (string)($t['start'] ?? ''); $en = (string)($t['end'] ?? '');
            if (($st !== '' && !tm($st)) || ($en !== '' && !tm($en))) bad('Ungültige Uhrzeit');
            if (!preg_match('/^#[0-9a-fA-F]{6}$/', (string)($t['color'] ?? ''))) bad('Ungültige Farbe');
            $id = substr(preg_replace('/[^a-z0-9]/i', '', (string)($t['id'] ?? '')), 0, 20);
            if ($id === '') $id = 't' . bin2hex(random_bytes(3));
            $outl[] = ['id' => $id, 'name' => $name, 'start' => $st, 'end' => $en, 'color' => $t['color']];
        }
        $DB['templates'] = $outl; save_db(); out(state_for($s));
    }
    bad('Nicht gefunden', 404);
}

/* ---------- Oberfläche ---------- */
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
echo <<<'HTML'
<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#d9480f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Dienstplan">
<title>Dienstplan – Sonderpreis Baumarkt</title>
<style>
:root{--bg:#f4f5f7;--card:#fff;--text:#1b1f27;--muted:#6b7280;--line:#e3e6eb;--accent:#d9480f;--accent-t:#fff;--soft:#eef0f4;--danger:#c92a2a;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#14161a;--card:#1d2026;--text:#eceef2;--muted:#9aa3b2;--line:#2c313a;--accent:#ff8a4c;--accent-t:#1b1f27;--soft:#262a32;--danger:#ff6b6b;color-scheme:dark}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;min-height:100vh;touch-action:manipulation}
.top{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:calc(12px + env(safe-area-inset-top,0px)) 16px 10px;max-width:1000px;margin:0 auto}
.top h1{font-size:19px;margin:0}.top p{margin:0;color:var(--muted);font-size:12px}
.who{background:var(--soft);padding:6px 12px;border-radius:999px;font-weight:600;font-size:14px;max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
main{max-width:1000px;margin:0 auto;padding:4px 14px calc(96px + env(safe-area-inset-bottom,0px))}
.bnav{position:fixed;left:0;right:0;bottom:0;z-index:15;display:flex;background:var(--card);border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom,0px)}
.bnav button{flex:1;border:0;background:none;color:var(--muted);font:inherit;font-size:11px;padding:8px 4px 10px;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:58px;cursor:pointer}
.bnav .ic{font-size:22px;line-height:1}.bnav .on{color:var(--accent);font-weight:700}
.btn{border:1px solid var(--line);background:var(--card);color:var(--text);padding:12px 16px;min-height:46px;border-radius:12px;font:inherit;font-weight:600;cursor:pointer}
.btn.pri{background:var(--accent);color:var(--accent-t);border-color:var(--accent)}
.btn.danger{color:var(--danger)}.btn.armed{background:var(--danger);color:#fff;border-color:var(--danger)}
.btn.full{width:100%}.btn:disabled{opacity:.5}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:12px}
.hint{color:var(--muted);font-size:13px;margin:0 0 12px}
input[type=text],input[type=password],input[type=time]{font:inherit;font-size:16px;color:var(--text);background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;min-height:46px;min-width:0;width:100%}
input[type=color]{width:46px;height:46px;border:1px solid var(--line);border-radius:12px;background:var(--card);padding:3px;flex:none}
label.l{display:block;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:12px 0 6px}
.row{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}.row>input[type=text]{flex:1}
.dash{color:var(--muted)}
.login{max-width:380px;margin:0 auto;padding:calc(40px + env(safe-area-inset-top,0px)) 18px 30px}
.login .logo{width:64px;height:64px;border-radius:18px;background:var(--accent);display:grid;place-items:center;font-size:32px;margin:0 auto 12px}
.login h1{text-align:center;margin:0 0 2px;font-size:22px}.login .sub{text-align:center;color:var(--muted);margin:0 0 22px;font-size:14px}
.err{color:var(--danger);font-weight:600;font-size:14px;min-height:20px;margin:10px 0 0}
.seg{display:flex;background:var(--soft);border-radius:12px;padding:3px}
.seg button{border:0;background:none;color:var(--text);padding:8px 14px;border-radius:9px;font:inherit;font-weight:600;cursor:pointer}
.seg button.on{background:var(--card);box-shadow:0 1px 2px rgba(0,0,0,.15)}
.weekbar{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.weekbar .t{flex:1;font-weight:700;line-height:1.2}.weekbar .t small{display:block;color:var(--muted);font-weight:500;font-size:12px}
.weekbar .btn{padding:0 14px}
.chips{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--card);color:var(--text);padding:10px 16px;min-height:44px;border-radius:999px;font:inherit;font-weight:600;cursor:pointer}
.chip.on{background:var(--accent);color:var(--accent-t);border-color:var(--accent)}
.days{display:flex;gap:6px;margin-bottom:12px}
.dbtn{flex:1;min-width:0;border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:12px;padding:8px 0;font:inherit;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer}
.dbtn span{font-size:12px;color:var(--muted)}.dbtn b{font-size:17px}
.dbtn.td{border-color:var(--accent)}
.dbtn.on{background:var(--accent);color:var(--accent-t);border-color:var(--accent)}.dbtn.on span{color:var(--accent-t);opacity:.85}
.dayh{font-weight:700;margin:0 2px 8px}
.dr{display:grid;grid-template-columns:104px 1fr;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px 10px;margin-bottom:6px;min-height:58px}
.dr.edit{cursor:pointer}.dr .nm{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cnt{color:var(--muted);font-size:13px;text-align:center;margin-top:8px}
.pill{--c:#94a3b8;display:flex;flex-direction:column;gap:1px;align-items:flex-start;padding:7px 10px;border-radius:10px;border-left:5px solid var(--c);background:color-mix(in srgb,var(--c) 20%,var(--card));line-height:1.25;position:relative;min-height:38px;justify-content:center}
.pill b{font-size:15px}.pill span{color:var(--muted);font-size:14px;white-space:nowrap}
.pill i{position:absolute;right:8px;top:4px;font-style:normal;font-weight:700;color:var(--accent)}
.pill.off{justify-content:center}
.pill .nt{font-style:normal;font-size:12px;color:var(--text);opacity:.8;white-space:normal}
.pill.empty{border-left-color:var(--line);background:transparent;color:var(--muted);align-items:center}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--card)}
table.grid{border-collapse:separate;border-spacing:0;width:100%;min-width:780px}
.grid th,.grid td{padding:6px;border-bottom:1px solid var(--line);border-right:1px solid var(--line);text-align:center;vertical-align:middle}
.grid th:last-child,.grid td:last-child{border-right:0}.grid tbody tr:last-child>*{border-bottom:0}
.grid thead th{background:var(--soft);font-size:13px}.grid thead th small{display:block;color:var(--muted);font-weight:500;font-size:11px}
.grid thead th.today{background:var(--accent);color:var(--accent-t)}.grid thead th.today small{color:var(--accent-t);opacity:.85}
.grid .sticky{position:sticky;left:0;background:var(--card);z-index:2;text-align:left;min-width:100px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grid thead .sticky{background:var(--soft)}.grid th.nm{font-size:14px}
.grid tfoot td,.grid tfoot th{background:var(--soft);font-size:12px;color:var(--muted);border-bottom:0}
.grid td.edit{cursor:pointer}.grid td.tc{background:color-mix(in srgb,var(--accent) 7%,transparent)}
.grid .pill{padding:5px 7px;min-height:34px}.grid .pill b{font-size:13px}.grid .pill span{font-size:12px}
.today-card h2{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.big{--c:#94a3b8;border-left:7px solid var(--c);background:color-mix(in srgb,var(--c) 20%,var(--card));border-radius:14px;padding:16px}
.big b{font-size:26px;display:block}.big span{font-size:22px;font-weight:600}
.big.none{border-left-color:var(--line);background:var(--soft);color:var(--muted)}
.next{margin-top:12px;color:var(--muted);font-size:15px}
.wk{margin:12px 2px 4px;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.li{display:grid;grid-template-columns:62px 1fr;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px 10px;margin-bottom:6px}
.li.today{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.li .d b{display:block}.li .d small{color:var(--muted);font-size:12px}.li .none{color:var(--muted);font-size:14px}
.ecard .pw{background:var(--soft);border-radius:10px;padding:8px 10px;font-size:14px;margin:8px 0}
.ecard code{font-size:17px;font-weight:700;letter-spacing:.06em}
.tpl{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px;margin-bottom:10px}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:30;display:flex;align-items:flex-end;justify-content:center}
.sh{background:var(--card);width:100%;max-width:520px;border-radius:20px 20px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));max-height:92vh;overflow:auto}
.sh h3{margin:0 0 2px;font-size:18px}.sh .s2{color:var(--muted);font-size:14px;margin-bottom:12px}
.tgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}
.tbtn{--c:#94a3b8;text-align:left;border:0;border-left:6px solid var(--c);background:color-mix(in srgb,var(--c) 20%,var(--card));color:var(--text);border-radius:12px;padding:12px;min-height:58px;font:inherit;cursor:pointer}
.tbtn.on{outline:2px solid var(--accent)}.tbtn b{display:block;font-size:16px}.tbtn span{font-size:13px;color:var(--muted)}
.mx{width:100%;border-collapse:separate;border-spacing:2px 3px;table-layout:fixed}
.mx col:first-child{width:64px}
.mx thead th{font-size:12px;padding:4px 0;border-radius:8px;background:var(--soft);cursor:pointer;font-weight:600}
.mx thead th:first-child{background:none;cursor:default}
.mx thead th small{display:block;color:var(--muted);font-weight:500;font-size:11px}
.mx thead th.today{background:var(--accent);color:var(--accent-t)}.mx thead th.today small{color:var(--accent-t);opacity:.85}
.mx th.nm{text-align:left;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:2px}
.mx td{padding:0;text-align:center;vertical-align:middle}.mx td.edit{cursor:pointer}
.mc{--c:#94a3b8;border-radius:7px;min-height:38px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10.5px;line-height:1.15;font-weight:600;background:color-mix(in srgb,var(--c) 30%,var(--card));border-left:3px solid var(--c);position:relative;overflow:hidden}
.mc.o{font-size:10px;font-weight:700}
.mc.e{background:transparent;border-left:0;color:var(--muted);font-weight:400;font-size:14px}
.mc.cu::after{content:"*";position:absolute;right:3px;top:0;color:var(--accent);font-weight:800}
.mx tfoot th{font-size:11px;color:var(--muted);text-align:left;font-weight:500}.mx tfoot td{font-size:12px;color:var(--muted);padding-top:4px}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;font-size:12px;color:var(--muted)}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}
.grp{--c:#94a3b8;background:var(--card);border:1px solid var(--line);border-left:6px solid var(--c);border-radius:14px;padding:10px 12px;margin-bottom:8px}
.grp.none{border-left-color:var(--line);background:var(--soft)}
.gh{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}.gh b{font-size:16px}.gh span{color:var(--muted);font-size:14px}
.gh em{margin-left:auto;font-style:normal;font-weight:700;background:color-mix(in srgb,var(--c) 25%,var(--card));border-radius:999px;padding:1px 9px;font-size:13px}
.gn{display:flex;flex-wrap:wrap;gap:6px}
.nc{background:var(--soft);border-radius:999px;padding:6px 12px;font-weight:600;font-size:15px}
.grp.none .nc{background:var(--card);color:var(--muted)}
.nc small{margin-left:6px;color:var(--muted);font-weight:500;font-size:12px}
.nc.me{background:var(--accent);color:var(--accent-t)}.nc.me small{color:var(--accent-t);opacity:.85}
@media (min-width:700px){.mx col:first-child{width:130px}.mc{font-size:13px;min-height:44px}.mx th.nm{font-size:15px}}
#toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));background:var(--text);color:var(--bg);padding:11px 18px;border-radius:12px;z-index:50;font-weight:600;max-width:90%;text-align:center}
#toast.bad{background:var(--danger);color:#fff}
@media (min-width:700px){.dr{grid-template-columns:160px 1fr}}
</style></head>
<body>
<div id="app"></div><div id="sheet"></div><div id="toast" hidden></div>
<script>
(function(){
var $=function(s){return document.querySelector(s)};
var BASE=location.pathname;
var ST=null,tab='',sub='planen',armed='',sheet=null,meDays=14,lastPw='';
var mode=window.innerWidth<700?'day':'week';
var DN=['Mo','Di','Mi','Do','Fr','Sa','So'],DNL=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
var pad=function(n){return String(n).padStart(2,'0')};
var key=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
var addDays=function(d,n){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()+n);return x};
var mondayOf=function(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x};
var fromKey=function(k){var p=k.split('-');return new Date(+p[0],+p[1]-1,+p[2])};
var short=function(d){return pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'};
function isoWeek(d){var t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));var dn=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-dn);var y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y0)/864e5+1)/7)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var weekStart=mondayOf(new Date()),selDay=key(new Date());
var tt;function toast(t,bad){var el=$('#toast');el.textContent=t;el.className=bad?'bad':'';el.hidden=false;clearTimeout(tt);tt=setTimeout(function(){el.hidden=true},bad?4000:1800)}

async function api(path,body){
  var h={'X-Requested-With':'dienstplan'};
  var opt=body===undefined?{method:'GET',headers:h}:{method:'POST',headers:Object.assign(h,{'Content-Type':'application/json'}),body:JSON.stringify(body)};
  var r=await fetch(BASE+'?api='+path,opt),j={};
  try{j=await r.json()}catch(e){}
  if(r.status===401&&path!=='login'&&path!=='state'){ST=null;renderLogin('');throw new Error('Bitte neu anmelden.')}
  if(!r.ok)throw new Error(j.error||'Fehler');
  return j;
}
var isAdmin=function(){return ST&&ST.me&&ST.me.role==='admin'};
var named=function(e){return !/^mitarbeiter\s*\d*$/i.test(String(e.name).trim())};
var vis=function(){return ST.emps.filter(named)};
function shiftOf(eid,k){
  var c=(ST.plan[k]||{})[eid];if(!c)return null;
  var t=ST.templates.filter(function(x){return x.id===c.t})[0],cu=c.s!==undefined;
  var s=cu?c.s:(t?t.start:''),e=cu?c.e:(t?t.end:'');
  return {name:t?t.name:(s?'Individuell':'?'),color:t?t.color:'#64748b',s:s,e:e,custom:cu,off:!s&&!e,n:c.n||''};
}
function pill(sh){
  if(!sh)return '<div class="pill empty">–</div>';
  return '<div class="pill'+(sh.off?' off':'')+'" style="--c:'+esc(sh.color)+'"><b>'+esc(sh.name)+'</b>'+(sh.off?'':'<span>'+esc(sh.s)+'–'+esc(sh.e)+'</span>')+(sh.custom&&!sh.off?'<i title="abweichende Zeit">*</i>':'')+(sh.n?'<em class="nt">📝 '+esc(sh.n)+'</em>':'')+'</div>';
}

/* ---------- Login / Einrichtung ---------- */
function renderLogin(err){
  var last='';try{last=localStorage.getItem('dp_user')||''}catch(e){}
  $('#sheet').innerHTML='';
  $('#app').innerHTML='<div class="login"><div class="logo">📅</div><h1>Dienstplan</h1><p class="sub">Sonderpreis Baumarkt</p><form id="lf"><label class="l">Vorname</label><input type="text" id="lu" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" value="'+esc(last)+'"><label class="l">Passwort</label><input type="password" id="lp" autocomplete="current-password"><div class="err" id="le">'+esc(err)+'</div><button class="btn pri full" type="submit" style="margin-top:12px">Anmelden</button></form></div>';
  $('#lf').addEventListener('submit',async function(ev){
    ev.preventDefault();var u=$('#lu').value,p=$('#lp').value;
    try{ST=await api('login',{user:u,pw:p});lastPw=p;try{localStorage.setItem('dp_user',u.trim())}catch(e){}tab='';render()}
    catch(e){$('#le').textContent=e.message}
  });
  (last?$('#lp'):$('#lu')).focus();
}
function renderSetup(kind){
  var first=kind==='first';
  $('#app').innerHTML='<div class="login"><div class="logo">🔧</div><h1>'+(first?'Einrichtung':'Neues Admin-Passwort')+'</h1><p class="sub">'+(first?'Lege jetzt dein Admin-Passwort fest (mind. 6 Zeichen). Dein Login heißt „admin“.':'Wähle ein neues Admin-Passwort (mind. 6 Zeichen).')+'</p><form id="sf"><label class="l">Admin-Passwort</label><input type="password" id="s1" autocomplete="new-password"><label class="l">Wiederholen</label><input type="password" id="s2" autocomplete="new-password"><div class="err" id="se"></div><button class="btn pri full" type="submit" style="margin-top:12px">Speichern</button></form></div>';
  $('#sf').addEventListener('submit',async function(ev){
    ev.preventDefault();var a=$('#s1').value;
    if(a!==$('#s2').value){$('#se').textContent='Die beiden Passwörter sind nicht gleich.';return}
    try{ST=await api('setup',{pw:a});tab='';render();toast('Fertig eingerichtet ✓')}catch(e){$('#se').textContent=e.message}
  });
}
function renderForce(){
  $('#app').innerHTML='<div class="login"><div class="logo">🔑</div><h1>Neues Passwort</h1><p class="sub">Hallo '+esc(ST.me.name)+'! Bitte wähle jetzt dein eigenes Passwort (mind. 6 Zeichen).</p><form id="ff">'+(lastPw?'':'<label class="l">Start-Passwort</label><input type="password" id="fo" autocomplete="current-password">')+'<label class="l">Neues Passwort</label><input type="password" id="fn" autocomplete="new-password"><label class="l">Wiederholen</label><input type="password" id="fn2" autocomplete="new-password"><div class="err" id="fe"></div><button class="btn pri full" type="submit" style="margin-top:12px">Speichern</button></form></div>';
  $('#ff').addEventListener('submit',async function(ev){
    ev.preventDefault();var a=$('#fn').value,b=$('#fn2').value;
    if(a!==b){$('#fe').textContent='Die beiden Passwörter sind nicht gleich.';return}
    try{ST=await api('password',{old:lastPw||$('#fo').value,pw:a});lastPw='';tab='';render();toast('Passwort gespeichert ✓')}
    catch(e){$('#fe').textContent=e.message}
  });
}

/* ---------- Ansichten ---------- */
function weekBar(){
  var e=addDays(weekStart,6);
  return '<div class="weekbar"><button class="btn" data-act="wk" data-d="-1">‹</button><div class="t">KW '+isoWeek(weekStart)+'<small>'+short(weekStart)+' – '+short(e)+e.getFullYear()+'</small></div><button class="btn" data-act="wk" data-d="0">Heute</button><button class="btn" data-act="wk" data-d="1">›</button></div><div class="seg" style="margin-bottom:12px"><button class="'+(mode==='day'?'on':'')+'" data-act="mode" data-v="day" style="flex:1">Tag</button><button class="'+(mode==='week'?'on':'')+'" data-act="mode" data-v="week" style="flex:1">Woche</button></div>';
}
function cnt(k){var n=0;vis().forEach(function(e){var sh=shiftOf(e.id,k);if(sh&&!sh.off)n++});return n}
function hm(t){return t?String(t).replace(/^0/,''):''}
function legend(){return '<div class="legend">'+ST.templates.map(function(t){return '<span><i style="background:'+esc(t.color)+'"></i>'+esc(t.name)+(t.start?' '+esc(t.start)+'–'+esc(t.end):'')+'</span>'}).join('')+'</div>'}
function mcell(sh,ed){
  if(!sh)return '<div class="mc e">'+(ed?'+':'·')+'</div>';
  if(sh.off)return '<div class="mc o" style="--c:'+esc(sh.color)+'">'+esc(sh.name)+'</div>';
  return '<div class="mc w'+(sh.custom?' cu':'')+'" style="--c:'+esc(sh.color)+'"><span>'+hm(sh.s)+'</span><span>'+hm(sh.e)+'</span></div>';
}
function emptyNote(){return '<div class="card hint" style="margin:0">Noch keine Mitarbeiter mit Namen. Im Admin-Bereich unter „Team“ Namen eintragen.</div>'}
function grid(ed){
  var tk=key(new Date()),days=[0,1,2,3,4,5,6].map(function(i){return addDays(weekStart,i)}),list=vis();
  if(!list.length)return emptyNote();
  var h='<table class="mx"><colgroup><col><col><col><col><col><col><col><col></colgroup><thead><tr><th></th>';
  days.forEach(function(d,i){var k=key(d);h+='<th class="'+(k===tk?'today':'')+'" data-act="goday" data-k="'+k+'">'+DN[i]+'<small>'+pad(d.getDate())+'</small></th>'});
  h+='</tr></thead><tbody>';
  list.forEach(function(e){
    h+='<tr><th class="nm">'+esc(e.name)+'</th>';
    days.forEach(function(d){var k=key(d);h+='<td class="'+(ed?'edit':'')+'"'+(ed?' data-act="cell" data-e="'+esc(e.id)+'" data-k="'+k+'"':'')+'>'+mcell(shiftOf(e.id,k),ed)+'</td>'});
    h+='</tr>';
  });
  h+='</tbody><tfoot><tr><th>Im Dienst</th>';
  days.forEach(function(d){h+='<td>'+cnt(key(d))+'</td>'});
  return h+'</tr></tfoot></table>';
}
function grp(title,sub,color,items,none){
  return '<div class="grp'+(none?' none':'')+'"'+(color?' style="--c:'+esc(color)+'"':'')+'><div class="gh"><b>'+esc(title)+'</b>'+(sub?'<span>'+esc(sub)+'</span>':'')+'<em>'+items.length+'</em></div><div class="gn">'+items.map(function(x){var me=ST.me.id===x.e.id;return '<span class="nc'+(me?' me':'')+'">'+esc(x.e.name)+(x.sh&&x.sh.custom&&!x.sh.off?'<small>'+esc(x.sh.s)+'–'+esc(x.sh.e)+'</small>':'')+'</span>'}).join('')+'</div></div>';
}
function dayGroups(k){
  var list=vis(),g={};
  if(!list.length)return emptyNote();
  list.forEach(function(e){
    var c=(ST.plan[k]||{})[e.id],id='-';
    if(c)id=ST.templates.some(function(t){return t.id===c.t})?c.t:'x';
    (g[id]=g[id]||[]).push({e:e,sh:shiftOf(e.id,k)});
  });
  var h='';
  ST.templates.forEach(function(t){if(g[t.id])h+=grp(t.name,t.start?t.start+'–'+t.end:'',t.color,g[t.id])});
  if(g.x)h+=grp('Individuell','','#64748b',g.x);
  if(g['-'])h+=grp('Nicht eingetragen','','',g['-'],true);
  return h;
}
function planInner(ed){
  var h=weekBar();
  if(mode==='week')return h+grid(ed)+legend();
  var tk=key(new Date()),days=[0,1,2,3,4,5,6].map(function(i){return addDays(weekStart,i)});
  if(!days.some(function(d){return key(d)===selDay}))selDay=key(weekStart);
  h+='<div class="days">'+days.map(function(d,i){var k=key(d);return '<button class="dbtn'+(k===selDay?' on':'')+(k===tk?' td':'')+'" data-act="day" data-k="'+k+'"><span>'+DN[i]+'</span><b>'+pad(d.getDate())+'</b></button>'}).join('')+'</div>';
  var sd=fromKey(selDay);
  h+='<div class="dayh">'+DNL[(sd.getDay()+6)%7]+', '+short(sd)+sd.getFullYear()+' · '+cnt(selDay)+' im Dienst</div>';
  if(!ed)return h+dayGroups(selDay);
  var list=vis();
  if(!list.length)return h+emptyNote();
  list.forEach(function(e){
    var sh=shiftOf(e.id,selDay);
    h+='<div class="dr edit" data-act="cell" data-e="'+esc(e.id)+'" data-k="'+selDay+'"><div class="nm">'+esc(e.name)+'</div>'+(sh?pill(sh):'<div class="pill empty">+ eintragen</div>')+'</div>';
  });
  return h;
}
function meView(){
  var now=new Date(),sh=shiftOf(ST.me.id,key(now));
  var h='<div class="card today-card"><h2>Heute · '+DNL[(now.getDay()+6)%7]+', '+short(now)+'</h2>';
  h+=sh?'<div class="big" style="--c:'+esc(sh.color)+'"><b>'+esc(sh.name)+'</b>'+(sh.off?'':'<span>'+esc(sh.s)+' – '+esc(sh.e)+' Uhr</span>')+'</div>':'<div class="big none"><b>Nichts eingetragen</b></div>';
  var nx=null,nk='';
  for(var i=1;i<=90&&!nx;i++){var kk=key(addDays(now,i)),s2=shiftOf(ST.me.id,kk);if(s2&&!s2.off){nx=s2;nk=kk}}
  if(nx){var nd=fromKey(nk);h+='<div class="next">Nächster Dienst: <b>'+DN[(nd.getDay()+6)%7]+' '+short(nd)+'</b> · '+esc(nx.name)+' '+esc(nx.s)+'–'+esc(nx.e)+'</div>'}
  h+='</div>';
  var lw=-1;
  for(var j=0;j<meDays;j++){
    var d=addDays(now,j),s3=shiftOf(ST.me.id,key(d)),wd=(d.getDay()+6)%7,w=isoWeek(d);
    if(w!==lw){h+='<div class="wk">KW '+w+'</div>';lw=w}
    h+='<div class="li'+(j===0?' today':'')+'"><div class="d"><b>'+DN[wd]+'</b><small>'+short(d)+'</small></div><div>'+(s3?pill(s3):'<span class="none">Nichts eingetragen</span>')+'</div></div>';
  }
  return h+'<button class="btn full" data-act="more" style="margin-top:8px">Weitere 14 Tage</button>';
}
function kontoView(){
  return '<div class="card"><b>Passwort ändern</b><label class="l">Aktuelles Passwort</label><input type="password" id="po" autocomplete="current-password"><label class="l">Neues Passwort (mind. 6 Zeichen)</label><input type="password" id="pn" autocomplete="new-password"><label class="l">Wiederholen</label><input type="password" id="pn2" autocomplete="new-password"><button class="btn pri full" data-act="chpw" style="margin-top:14px">Passwort speichern</button></div><button class="btn full danger" data-act="logout">Abmelden</button>';
}
function adminView(){
  var st=[['planen','Planen'],['team','Team'],['zeiten','Zeiten']];
  var h='<div class="chips">'+st.map(function(x){return '<button class="chip'+(sub===x[0]?' on':'')+'" data-act="sub" data-v="'+x[0]+'">'+x[1]+'</button>'}).join('')+'</div>';
  if(sub==='planen'){
    h+='<p class="hint">Tippe auf einen Eintrag, um den Dienst zu wählen. Änderungen sind sofort für alle sichtbar.</p>'+planInner(true);
    h+='<button class="btn full'+(armed==='copy'?' armed':'')+'" data-act="copyprev" style="margin-top:12px">'+(armed==='copy'?'Diese Woche wirklich überschreiben?':'Vorwoche übernehmen')+'</button>';
  }else if(sub==='team'){
    h+='<p class="hint">Der Vorname ist zugleich der Login. Das Start-Passwort gibst du dem Mitarbeiter weiter, danach vergibt er sein eigenes. Einträge, die noch „Mitarbeiter1“, „Mitarbeiter2“ … heißen, bleiben im Plan unsichtbar, bis du sie umbenennst.</p>';
    ST.emps.forEach(function(e){
      var a=armed==='e:'+e.id;
      h+='<div class="card ecard"><input type="text" data-f="ename" data-id="'+esc(e.id)+'" value="'+esc(e.name)+'" maxlength="30" autocomplete="off"><div class="pw">'+(e.mustChange?'Start-Passwort: <code>'+esc(e.initPw)+'</code>':'✓ Passwort vom Mitarbeiter selbst gewählt')+'</div><div class="row" style="margin:0"><button class="btn" data-act="reset" data-id="'+esc(e.id)+'">Neues Start-Passwort</button><button class="btn danger'+(a?' armed':'')+'" data-act="del" data-k="e:'+esc(e.id)+'">'+(a?'Sicher?':'Entfernen')+'</button></div></div>';
    });
    h+='<div class="card"><b>Mitarbeiter hinzufügen</b><div class="row" style="margin-top:8px"><input type="text" id="newemp" maxlength="30" placeholder="Vorname" autocomplete="off"><button class="btn pri" data-act="addemp"'+(ST.emps.length>=15?' disabled':'')+'>Hinzufügen</button></div></div>';
  }else{
    h+='<p class="hint">Standard-Dienste mit Zeiten. Ohne Zeiten = ganztägig (Frei, Urlaub, Krank). Im Plan kannst du die Zeit pro Tag trotzdem abweichend setzen.</p>';
    ST.templates.forEach(function(t){
      var a=armed==='t:'+t.id;
      h+='<div class="tpl"><div class="row"><input type="color" data-f="tcolor" data-id="'+esc(t.id)+'" value="'+esc(t.color)+'"><input type="text" data-f="tname" data-id="'+esc(t.id)+'" value="'+esc(t.name)+'" maxlength="20" autocomplete="off"></div><div class="row"><input type="time" data-f="tstart" data-id="'+esc(t.id)+'" value="'+esc(t.start)+'" style="flex:1"><span class="dash">bis</span><input type="time" data-f="tend" data-id="'+esc(t.id)+'" value="'+esc(t.end)+'" style="flex:1"></div><button class="btn danger full'+(a?' armed':'')+'" data-act="del" data-k="t:'+esc(t.id)+'">'+(a?'Sicher löschen?':'Dienst löschen')+'</button></div>';
    });
    h+='<button class="btn pri full" data-act="addtpl">+ Neuer Dienst</button>';
  }
  return h;
}
function render(){
  if(!ST){renderLogin('');return}
  if(ST.setup){renderSetup(ST.setup);return}
  if(ST.me.mustChange){renderForce();return}
  var tabs=isAdmin()?[['admin','⚙️','Admin'],['plan','📅','Plan'],['konto','👤','Konto']]:[['me','🗓️','Mein Dienst'],['plan','📅','Gesamtplan'],['konto','👤','Konto']];
  if(!tabs.some(function(t){return t[0]===tab}))tab=tabs[0][0];
  var y=window.scrollY,sl=$('.scroll')?$('.scroll').scrollLeft:0;
  var v=tab==='plan'?planInner(false):tab==='me'?meView():tab==='admin'?adminView():kontoView();
  $('#app').innerHTML='<div class="top"><div><h1>Dienstplan</h1><p>Sonderpreis Baumarkt</p></div><div class="who">'+esc(ST.me.name)+'</div></div><main>'+v+'</main><nav class="bnav">'+tabs.map(function(t){return '<button class="'+(tab===t[0]?'on':'')+'" data-act="tab" data-v="'+t[0]+'"><span class="ic">'+t[1]+'</span>'+t[2]+'</button>'}).join('')+'</nav>';
  window.scrollTo(0,y);if($('.scroll'))$('.scroll').scrollLeft=sl;
}
function renderSheet(){
  var r=$('#sheet');if(!sheet||!ST){r.innerHTML='';return}
  var emp=ST.emps.filter(function(e){return e.id===sheet.e})[0];if(!emp){sheet=null;r.innerHTML='';return}
  var d=fromKey(sheet.k),cur=(ST.plan[sheet.k]||{})[sheet.e]||null,sh=shiftOf(sheet.e,sheet.k);
  var df=ST.templates.filter(function(t){return t.start&&t.end})[0];
  var s0=sh&&sh.s?sh.s:(df?df.start:'08:00'),e0=sh&&sh.e?sh.e:(df?df.end:'16:30');
  var h='<div class="ov" data-act="close"><div class="sh"><h3>'+esc(emp.name)+'</h3><div class="s2">'+DNL[(d.getDay()+6)%7]+', '+short(d)+d.getFullYear()+'</div><div class="tgrid">';
  ST.templates.forEach(function(t){h+='<button class="tbtn'+(cur&&cur.t===t.id&&cur.s===undefined?' on':'')+'" style="--c:'+esc(t.color)+'" data-act="pick" data-t="'+esc(t.id)+'"><b>'+esc(t.name)+'</b><span>'+(t.start?esc(t.start)+'–'+esc(t.end):'ganztägig')+'</span></button>'});
  h+='</div><label class="l">Notiz (optional)</label><input type="text" id="cn" maxlength="80" placeholder="z. B. Inventur" value="'+esc(cur&&cur.n?cur.n:'')+'" autocomplete="off"><label class="l">Abweichende Zeit</label><div class="row"><input type="time" id="cs" value="'+esc(s0)+'" style="flex:1"><span class="dash">bis</span><input type="time" id="ce" value="'+esc(e0)+'" style="flex:1"></div><button class="btn pri full" data-act="setcustom">Zeit übernehmen</button><div class="row" style="margin:12px 0 0"><button class="btn danger" data-act="clearcell" style="flex:1">Leeren</button><button class="btn" data-act="close" style="flex:1">Schließen</button></div></div></div>';
  r.innerHTML=h;
}
async function savePlan(ch){
  try{ST=await api('plan',{changes:ch});toast('Gespeichert ✓')}catch(e){toast(e.message,1)}
  sheet=null;renderSheet();render();
}
async function act(fn){try{ST=await fn();render()}catch(e){toast(e.message,1);if(ST)render()}}

/* ---------- Events ---------- */
document.addEventListener('click',async function(ev){
  var el=ev.target.closest('[data-act]');if(!el||!ST||ST.setup)return;
  var a=el.dataset.act;
  if(a==='close'){if(el.classList.contains('ov')&&ev.target!==el)return;sheet=null;renderSheet();return}
  if(a==='tab'){tab=el.dataset.v;armed='';render();return}
  if(a==='sub'){sub=el.dataset.v;armed='';render();return}
  if(a==='mode'){mode=el.dataset.v;render();return}
  if(a==='day'){selDay=el.dataset.k;render();return}
  if(a==='goday'){selDay=el.dataset.k;mode='day';render();return}
  if(a==='wk'){var dd=+el.dataset.d;weekStart=dd===0?mondayOf(new Date()):addDays(weekStart,7*dd);var tk=key(new Date());selDay=(key(mondayOf(new Date()))===key(weekStart))?tk:key(weekStart);render();return}
  if(a==='more'){meDays+=14;render();return}
  if(a==='logout'){try{await api('logout',{})}catch(e){}ST=null;lastPw='';renderLogin('');return}
  if(a==='chpw'){
    var n=$('#pn').value;if(n!==$('#pn2').value){toast('Die beiden Passwörter sind nicht gleich.',1);return}
    try{ST=await api('password',{old:$('#po').value,pw:n});toast('Passwort gespeichert ✓');render()}catch(e){toast(e.message,1)}return;
  }
  if(!isAdmin())return;
  if(a==='cell'){sheet={e:el.dataset.e,k:el.dataset.k};renderSheet();return}
  if(a==='pick'){var o={};o[sheet.e]={t:el.dataset.t};if($('#cn').value.trim())o[sheet.e].n=$('#cn').value;var c1={};c1[sheet.k]=o;savePlan(c1);return}
  if(a==='setcustom'){
    var s=$('#cs').value,e=$('#ce').value;if(!s||!e){toast('Bitte Beginn und Ende eintragen.',1);return}
    var cu=(ST.plan[sheet.k]||{})[sheet.e],base=cu?ST.templates.filter(function(t){return t.id===cu.t&&t.start})[0]:null;
    if(!base)base=ST.templates.filter(function(t){return t.start})[0];
    var o2={};o2[sheet.e]={t:base?base.id:'',s:s,e:e};if($('#cn').value.trim())o2[sheet.e].n=$('#cn').value;var c2={};c2[sheet.k]=o2;savePlan(c2);return;
  }
  if(a==='clearcell'){var o3={};o3[sheet.e]=null;var c3={};c3[sheet.k]=o3;savePlan(c3);return}
  if(a==='copyprev'){
    if(armed!=='copy'){armed='copy';render();return}
    armed='';var ch={};
    for(var i=0;i<7;i++){var src=key(addDays(weekStart,i-7)),dst=key(addDays(weekStart,i));ch[dst]={};ST.emps.forEach(function(em){var c=(ST.plan[src]||{})[em.id];ch[dst][em.id]=c?JSON.parse(JSON.stringify(c)):null})}
    try{ST=await api('plan',{changes:ch});toast('Woche übernommen ✓')}catch(er){toast(er.message,1)}render();return;
  }
  if(a==='addemp'){var nm=$('#newemp').value;act(function(){return api('emp',{name:nm})});return}
  if(a==='reset'){act(function(){return api('emp/reset',{id:el.dataset.id})});return}
  if(a==='addtpl'){
    var list=ST.templates.concat([{id:'t'+Date.now().toString(36),name:'Neuer Dienst',start:'09:00',end:'17:00',color:'#8e44ad'}]);
    act(function(){return api('templates',{templates:list})});return;
  }
  if(a==='del'){
    var kk=el.dataset.k;if(armed!==kk){armed=kk;render();return}
    armed='';var id=kk.slice(2);
    if(kk.charAt(0)==='e'){act(function(){return api('emp/delete',{id:id})})}
    else{var l2=ST.templates.filter(function(t){return t.id!==id});act(function(){return api('templates',{templates:l2})})}
    return;
  }
});
document.addEventListener('input',function(ev){
  var t=ev.target,f=t.dataset&&t.dataset.f;if(!f||!ST||!isAdmin()||f==='ename')return;
  var tp=ST.templates.filter(function(x){return x.id===t.dataset.id})[0];if(!tp)return;
  if(f==='tname')tp.name=t.value;else if(f==='tcolor')tp.color=t.value;else if(f==='tstart')tp.start=t.value;else if(f==='tend')tp.end=t.value;
});
document.addEventListener('change',async function(ev){
  var t=ev.target,f=t.dataset&&t.dataset.f;if(!f||!ST||!isAdmin())return;
  if(f==='ename'){act(function(){return api('emp/rename',{id:t.dataset.id,name:t.value})});return}
  try{await api('templates',{templates:ST.templates});toast('Gespeichert ✓')}catch(e){toast(e.message,1)}
});
async function refresh(){
  if(!ST||ST.setup||sheet||ST.me.mustChange)return;
  var ae=document.activeElement;if(ae&&/INPUT|TEXTAREA/.test(ae.tagName))return;
  try{ST=await api('state');render()}catch(e){}
}
document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
setInterval(function(){if(!document.hidden)refresh()},60000);
(async function(){try{ST=await api('state');render()}catch(e){renderLogin('')}})();
})();
</script></body></html>
HTML;
