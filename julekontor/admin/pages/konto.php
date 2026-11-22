<?php
declare(strict_types=1);
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $cur = (string)($_POST['current'] ?? '');
    $pw  = (string)($_POST['password'] ?? '');
    if (!password_verify($cur, $user['hash'])) $errors[] = 'Das aktuelle Passwort stimmt nicht.';
    elseif (mb_strlen($pw) < 10) $errors[] = 'Das neue Passwort muss mindestens 10 Zeichen haben.';
    elseif ($pw !== ($_POST['password2'] ?? '')) $errors[] = 'Die beiden neuen Passwörter stimmen nicht überein.';
    else {
        $cfg = config();
        foreach ($cfg['users'] as &$u) if ($u['email'] === $user['email']) $u['hash'] = password_hash($pw, PASSWORD_DEFAULT);
        unset($u);
        write_private(JK_CONFIG, $cfg);
        session_regenerate_id(true);
        flash('Dein Passwort ist geändert.');
        redirect('konto');
    }
}

page_start('konto', 'Mein Konto');
foreach ($errors as $e) echo '<div class="flash err" role="alert">' . h($e) . '</div>';
?>
<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend>Passwort ändern</legend>
    <p class="muted">Angemeldet als <strong><?= h($user['email']) ?></strong></p>
    <input type="email" name="email" value="<?= h($user['email']) ?>" autocomplete="username" hidden>
    <label>Aktuelles Passwort<input type="password" name="current" autocomplete="current-password" required></label>
    <label>Neues Passwort (mind. 10 Zeichen)<input type="password" name="password" autocomplete="new-password" minlength="10" required></label>
    <label>Neues Passwort wiederholen<input type="password" name="password2" autocomplete="new-password" minlength="10" required></label>
  </fieldset>
  <div class="actions"><button class="btn" type="submit">Passwort ändern</button></div>
</form>
<?php page_end();
