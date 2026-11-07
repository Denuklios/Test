<?php
declare(strict_types=1);
$site = read_json('site');
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $txt = fn(string $k, int $max = 120) => mb_substr(trim((string)($_POST[$k] ?? '')), 0, $max);
    $new = $site;
    $new['title']            = $txt('title');
    $new['afterTitle']       = $txt('afterTitle');
    $new['footer']           = $txt('footer', 200);
    $new['countdownEnabled'] = !empty($_POST['countdownEnabled']);
    $new['snow']             = !empty($_POST['snow']);
    $new['bell']             = !empty($_POST['bell']);
    foreach (['days', 'hours', 'minutes', 'seconds'] as $k) $new['labels'][$k] = $txt('label_' . $k, 30);

    $t = (string)($_POST['countdownTarget'] ?? '');
    $d = DateTime::createFromFormat('Y-m-d\TH:i', $t);
    if (!$d || $d->format('Y-m-d\TH:i') !== $t) $errors[] = 'Bitte ein gültiges Datum mit Uhrzeit wählen.';
    else $new['countdownTarget'] = $t;
    if ($new['title'] === '') $errors[] = 'Die Überschrift darf nicht leer sein.';

    if (!$errors) {
        write_json('site', $new);
        flash('Gespeichert. Die Startseite zeigt die Änderungen sofort.');
        redirect('startseite');
    }
    $site = $new;
}

$L = $site['labels'] ?? [];
page_start('startseite', 'Startseite');
foreach ($errors as $e) echo '<div class="flash err" role="alert">' . h($e) . '</div>';
?>
<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend>Texte</legend>
    <label>Überschrift<input name="title" required maxlength="120" value="<?= h($site['title'] ?? '') ?>"></label>
    <label>Fußzeile<input name="footer" maxlength="200" value="<?= h($site['footer'] ?? '') ?>"></label>
  </fieldset>

  <fieldset>
    <legend>Countdown</legend>
    <label class="check"><input type="checkbox" name="countdownEnabled" value="1" <?= !empty($site['countdownEnabled']) ? 'checked' : '' ?>> Countdown anzeigen</label>
    <label>Läuft bis<input type="datetime-local" name="countdownTarget" required value="<?= h($site['countdownTarget'] ?? '') ?>"></label>
    <label>Überschrift, wenn der Countdown abgelaufen ist<input name="afterTitle" maxlength="120" value="<?= h($site['afterTitle'] ?? '') ?>"></label>
    <div class="row4">
      <label>Tage<input name="label_days" maxlength="30" value="<?= h($L['days'] ?? '') ?>"></label>
      <label>Stunden<input name="label_hours" maxlength="30" value="<?= h($L['hours'] ?? '') ?>"></label>
      <label>Minuten<input name="label_minutes" maxlength="30" value="<?= h($L['minutes'] ?? '') ?>"></label>
      <label>Sekunden<input name="label_seconds" maxlength="30" value="<?= h($L['seconds'] ?? '') ?>"></label>
    </div>
  </fieldset>

  <fieldset>
    <legend>Effekte</legend>
    <label class="check"><input type="checkbox" name="snow" value="1" <?= !empty($site['snow']) ? 'checked' : '' ?>> Schneefall</label>
    <label class="check"><input type="checkbox" name="bell" value="1" <?= !empty($site['bell']) ? 'checked' : '' ?>> Glocken-Knopf</label>
  </fieldset>

  <div class="actions">
    <button class="btn" type="submit">Speichern</button>
    <a class="btn ghost" href="../" target="_blank" rel="noopener">Startseite ansehen ↗</a>
  </div>
</form>
<?php page_end();
