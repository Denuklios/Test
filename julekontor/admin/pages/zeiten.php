<?php
declare(strict_types=1);
$site = web_site();
$hrs = $site['hours'];
$names = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $hrs['published'] = !empty($_POST['published']);
    $hrs['note'] = web_post_langs('note', 300);
    foreach ($names as $i => $n) {
        $o = (string)($_POST['open'][$i] ?? ''); $cl = (string)($_POST['close'][$i] ?? '');
        $closed = !empty($_POST['closed'][$i]);
        $ok = fn(string $t) => (bool)preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t);
        if (!$closed && (!$ok($o) || !$ok($cl) || $o >= $cl)) $errors[] = $n . ': bitte „von“ und „bis“ richtig eintragen.';
        $hrs['days'][$i] = ['open' => $ok($o) ? $o : '10:00', 'close' => $ok($cl) ? $cl : '17:00', 'closed' => $closed];
    }
    if (!$errors) {
        $site['hours'] = $hrs;
        web_save($site);
        flash('Gespeichert.');
        redirect('zeiten');
    }
}

page_start('zeiten', 'Öffnungszeiten');
foreach ($errors as $e) echo '<div class="flash err" role="alert">' . h($e) . '</div>';
?>
<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend>Wochentage</legend>
    <label class="check"><input type="checkbox" name="published" value="1" <?= $hrs['published'] ? 'checked' : '' ?>> Öffnungszeiten auf der Website zeigen</label>
    <p class="hint">Solange der Haken fehlt, steht auf der Website „Öffnungszeiten folgen“.</p>
    <?php foreach ($names as $i => $n): $d = $hrs['days'][$i]; ?>
    <div class="day-row">
      <strong><?= h($n) ?></strong>
      <label class="small">von<input type="time" name="open[<?= $i ?>]" value="<?= h($d['open']) ?>"></label>
      <label class="small">bis<input type="time" name="close[<?= $i ?>]" value="<?= h($d['close']) ?>"></label>
      <label class="check"><input type="checkbox" name="closed[<?= $i ?>]" value="1" <?= $d['closed'] ? 'checked' : '' ?>> geschlossen</label>
    </div>
    <?php endforeach; ?>
  </fieldset>
  <fieldset>
    <legend>Hinweis</legend>
    <?php web_lang_fields('note', 'Text unter den Öffnungszeiten', $hrs['note'], true, 300, 'Zum Beispiel Feiertage oder „Im Januar geschlossen“.'); ?>
  </fieldset>
  <div class="actions"><button class="btn" type="submit">Speichern</button></div>
</form>
<?php page_end();
