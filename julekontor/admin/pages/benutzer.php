<?php
declare(strict_types=1);
const ROLES = ['admin' => 'Admin (alles)', 'kasse' => 'Kasse (verkaufen, Belege, Tagesabschluss)'];
$me = current_user();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $cfg = config();
    $do = (string)($_POST['do'] ?? '');
    $email = strtolower(trim((string)($_POST['email'] ?? '')));
    $admins = fn(array $users) => count(array_filter($users, fn($u) => ($u['role'] ?? 'admin') === 'admin'));

    if ($do === 'add') {
        $pw = (string)($_POST['password'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { flash('Bitte eine gültige E-Mail-Adresse eingeben.', 'err'); redirect('benutzer'); }
        foreach ($cfg['users'] as $u) if ($u['email'] === $email) { flash('Diese E-Mail gibt es schon.', 'err'); redirect('benutzer'); }
        if (mb_strlen($pw) < 10) { flash('Das Passwort muss mindestens 10 Zeichen haben.', 'err'); redirect('benutzer'); }
        $cfg['users'][] = ['email' => $email, 'name' => mb_substr(trim((string)($_POST['name'] ?? '')), 0, 40),
                           'role' => isset(ROLES[$_POST['role'] ?? '']) ? $_POST['role'] : 'kasse',
                           'hash' => password_hash($pw, PASSWORD_DEFAULT), 'created' => date('c')];
        write_private(JK_CONFIG, $cfg);
        flash('Benutzer angelegt.');
    }
    if ($do === 'update') {
        foreach ($cfg['users'] as &$u) {
            if ($u['email'] !== $email) continue;
            $u['name'] = mb_substr(trim((string)($_POST['name'] ?? '')), 0, 40);
            $role = isset(ROLES[$_POST['role'] ?? '']) ? $_POST['role'] : 'kasse';
            if ($u['email'] === $me['email'] && $role !== 'admin') { flash('Du kannst dir selbst die Admin-Rolle nicht nehmen.', 'err'); redirect('benutzer'); }
            $u['role'] = $role;
            $pw = (string)($_POST['password'] ?? '');
            if ($pw !== '') {
                if (mb_strlen($pw) < 10) { flash('Das Passwort muss mindestens 10 Zeichen haben.', 'err'); redirect('benutzer'); }
                $u['hash'] = password_hash($pw, PASSWORD_DEFAULT);
            }
        }
        unset($u);
        if (!$admins($cfg['users'])) { flash('Es muss mindestens ein Admin bleiben.', 'err'); redirect('benutzer'); }
        write_private(JK_CONFIG, $cfg);
        flash('Gespeichert.');
    }
    if ($do === 'delete') {
        if ($email === $me['email']) { flash('Du kannst dich nicht selbst löschen.', 'err'); redirect('benutzer'); }
        $cfg['users'] = array_values(array_filter($cfg['users'], fn($u) => $u['email'] !== $email));
        if (!$admins($cfg['users'])) { flash('Es muss mindestens ein Admin bleiben.', 'err'); redirect('benutzer'); }
        write_private(JK_CONFIG, $cfg);
        flash('Benutzer gelöscht.');
    }
    redirect('benutzer');
}

page_start('benutzer', 'Benutzer');
?>
<p class="muted">Mitarbeiter mit der Rolle <b>Kasse</b> sehen nur Kasse, Belege und Tagesabschluss – keine Einkaufspreise, keine Einstellungen.
  Der Name erscheint auf dem Bon als Ekspedient.</p>
<?php foreach (config()['users'] ?? [] as $u): ?>
  <form method="post" class="card form mt">
    <?= csrf_field() ?><input type="hidden" name="email" value="<?= h($u['email']) ?>">
    <p><b><?= h($u['email']) ?></b><?= $u['email'] === $me['email'] ? ' <span class="pill green">du</span>' : '' ?></p>
    <div class="row3">
      <label>Name (auf dem Bon)<input name="name" maxlength="40" value="<?= h($u['name'] ?? '') ?>"></label>
      <label>Rolle<select name="role"><?php foreach (ROLES as $k => $t): ?><option value="<?= $k ?>" <?= ($u['role'] ?? 'admin') === $k ? 'selected' : '' ?>><?= h($t) ?></option><?php endforeach; ?></select></label>
      <label>Neues Passwort<input type="password" name="password" autocomplete="new-password" placeholder="leer = unverändert"></label>
    </div>
    <div class="actions">
      <button class="btn small" type="submit" name="do" value="update">Speichern</button>
      <?php if ($u['email'] !== $me['email']): ?><button class="btn ghost small" type="submit" name="do" value="delete" onclick="return confirm('Benutzer löschen?')">Löschen</button><?php endif; ?>
    </div>
  </form>
<?php endforeach; ?>
<form method="post" class="card form mt">
  <?= csrf_field() ?><input type="hidden" name="do" value="add">
  <h2>Neuer Benutzer</h2>
  <div class="row2">
    <label>E-Mail (zum Anmelden)<input type="email" name="email" required autocomplete="off"></label>
    <label>Name (auf dem Bon)<input name="name" maxlength="40"></label>
    <label>Rolle<select name="role"><?php foreach (ROLES as $k => $t): ?><option value="<?= $k ?>" <?= $k === 'kasse' ? 'selected' : '' ?>><?= h($t) ?></option><?php endforeach; ?></select></label>
    <label>Passwort (mind. 10 Zeichen)<input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
  </div>
  <div class="actions"><button class="btn" type="submit">Anlegen</button></div>
</form>
<?php page_end();
