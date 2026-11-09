<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/layout.php';
require __DIR__ . '/inc/shop.php';

$p = (string)($_GET['p'] ?? 'dashboard');

/* ---------- Ersteinrichtung: erstes Admin-Konto anlegen ---------- */
if (!is_set_up()) {
    $error = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        csrf_check();
        $email = strtolower(trim((string)($_POST['email'] ?? '')));
        $pw = (string)($_POST['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $error = 'Bitte eine gültige E-Mail-Adresse eingeben.';
        elseif (mb_strlen($pw) < 10) $error = 'Das Passwort muss mindestens 10 Zeichen haben.';
        elseif ($pw !== ($_POST['password2'] ?? '')) $error = 'Die beiden Passwörter stimmen nicht überein.';
        elseif (!is_set_up()) {
            $cfg = config();
            $cfg['users'] = [['email' => $email, 'name' => '', 'role' => 'admin', 'hash' => password_hash($pw, PASSWORD_DEFAULT), 'created' => date('c')]];
            write_private(JK_CONFIG, $cfg);
            login_user($email);
            flash('Willkommen! Dein Admin-Konto ist angelegt.');
            redirect('dashboard');
        }
    }
    page_auth('Admin einrichten', 'Lege dein Admin-Konto an. Das geht nur ein einziges Mal.', $error, true);
    exit;
}

/* ---------- Abmelden ---------- */
if ($p === 'logout' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    logout_user();
    flash('Du bist abgemeldet.');
    redirect('login');
}

/* ---------- Anmelden ---------- */
$user = current_user();
if (!$user) {
    $error = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        csrf_check();
        if ($wait = login_blocked()) {
            $error = 'Zu viele Fehlversuche. Bitte in ' . ceil($wait / 60) . ' Minuten noch einmal versuchen.';
        } else {
            $email = strtolower(trim((string)($_POST['email'] ?? '')));
            $pw = (string)($_POST['password'] ?? '');
            $found = null;
            foreach (config()['users'] ?? [] as $u) if ($u['email'] === $email) $found = $u;
            if ($found && password_verify($pw, $found['hash'])) {
                login_ok();
                login_user($email);
                redirect($p === 'login' ? 'dashboard' : $p);
            }
            login_failed();
            $error = 'E-Mail oder Passwort stimmt nicht.';
        }
    }
    page_auth('Anmelden', 'Julekontor Admin', $error, false);
    exit;
}

/* ---------- Bereiche ---------- */
if ($p === 'login') redirect('dashboard');
if (!isset(JK_MODULES[$p])) { http_response_code(404); $p = 'dashboard'; }
if (!can($p)) { flash('Für diesen Bereich fehlt dir die Berechtigung.', 'err'); redirect('dashboard'); }
$mod = JK_MODULES[$p];
if (!empty($mod['href'])) { header('Location: ' . $mod['href']); exit; }
$file = __DIR__ . '/pages/' . $p . '.php';

if (!$mod['ready'] || !is_file($file)) {
    page_start($p, $mod['title']);
    echo '<div class="card empty"><div class="big">' . $mod['icon'] . '</div><h2>' . h($mod['title']) . '</h2>'
       . '<p class="muted">Dieser Bereich wird als Nächstes eingerichtet.</p></div>';
    page_end();
    exit;
}
try {
    require $file;
} catch (ShopError $e) {
    flash($e->getMessage(), 'err');
    redirect($p);
}
