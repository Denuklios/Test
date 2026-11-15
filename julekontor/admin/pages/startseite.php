<?php
declare(strict_types=1);
$site = web_site();
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $site['countdownEnabled'] = !empty($_POST['countdownEnabled']);
    $site['snow']     = !empty($_POST['snow']);
    $site['bell']     = !empty($_POST['bell']);
    $site['requests'] = !empty($_POST['requests']);
    $site['hero']     = web_post_langs('hero', 160);
    $site['notice']   = web_post_langs('notice', 160);
    $t = (string)($_POST['countdownTarget'] ?? '');
    $d = DateTime::createFromFormat('Y-m-d\TH:i', $t);
    if (!$d || $d->format('Y-m-d\TH:i') !== $t) $errors[] = 'Bitte ein gültiges Datum mit Uhrzeit wählen.';
    else $site['countdownTarget'] = $t;
    if (!$errors) {
        web_save($site);
        flash('Gespeichert. Die Website zeigt die Änderungen sofort.');
        redirect('startseite');
    }
}

page_start('startseite', 'Startseite');
foreach ($errors as $e) echo '<div class="flash err" role="alert">' . h($e) . '</div>';
?>
<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend>Eröffnung</legend>
    <label class="check"><input type="checkbox" name="countdownEnabled" value="1" <?= $site['countdownEnabled'] ? 'checked' : '' ?>> Countdown bis zur Eröffnung anzeigen</label>
    <label>Eröffnung am<input type="datetime-local" name="countdownTarget" required value="<?= h($site['countdownTarget']) ?>"></label>
    <p class="hint">Ist der Tag erreicht, verschwindet der Countdown von selbst und die Seite zeigt „Jetzt geöffnet“.</p>
  </fieldset>

  <fieldset>
    <legend>Texte</legend>
    <?php web_lang_fields('hero', 'Satz unter dem Logo', $site['hero'], false, 160, 'Leer lassen für den Standardtext.'); ?>
    <?php web_lang_fields('notice', 'Hinweisband ganz oben', $site['notice'], false, 160, 'Zum Beispiel „Heute bis 20 Uhr geöffnet“. Leer = kein Band.'); ?>
  </fieldset>

  <fieldset>
    <legend>Effekte</legend>
    <label class="check"><input type="checkbox" name="snow" value="1" <?= $site['snow'] ? 'checked' : '' ?>> Schneefall</label>
    <label class="check"><input type="checkbox" name="bell" value="1" <?= $site['bell'] ? 'checked' : '' ?>> Glocke zum Anklicken</label>
  </fieldset>

  <fieldset>
    <legend>Anfragen</legend>
    <label class="check"><input type="checkbox" name="requests" value="1" <?= $site['requests'] ? 'checked' : '' ?>> Besucher können Fragen stellen und Artikel reservieren</label>
    <p class="hint">Die Nachrichten stehen unter <a href="./?p=anfragen">Anfragen</a>. Ist unter „Kontakt &amp; Adresse“ eine E-Mail eingetragen, kommt zusätzlich eine E-Mail.</p>
  </fieldset>

  <div class="actions">
    <button class="btn" type="submit">Speichern</button>
    <a class="btn ghost" href="../" target="_blank" rel="noopener">Website ansehen ↗</a>
  </div>
</form>
<?php page_end();
