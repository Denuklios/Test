<?php
declare(strict_types=1);
$site = web_site();
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $site['countdownEnabled'] = !empty($_POST['countdownEnabled']);
    if (!empty($_POST['new_preview'])) $site['preview'] = '';
    $site['snow']     = !empty($_POST['snow']);
    $site['bell']     = !empty($_POST['bell']);
    $site['requests'] = !empty($_POST['requests']);
    $site['hero']     = web_post_langs('hero', 160);
    $site['notice']   = web_post_langs('notice', 160);
    $site['launch']   = in_array($_POST['launch'] ?? '', ['auto', 'open', 'closed'], true) ? $_POST['launch'] : 'auto';
    foreach (['openAt' => 'Eröffnung der Website', 'countdownTarget' => 'Countdown'] as $k => $label) {
        $t = (string)($_POST[$k] ?? '');
        $d = DateTime::createFromFormat('Y-m-d\TH:i', $t);
        if (!$d || $d->format('Y-m-d\TH:i') !== $t) $errors[] = $label . ': bitte ein gültiges Datum mit Uhrzeit wählen.';
        else $site[$k] = $t;
    }
    if (!$errors) {
        web_save($site);
        flash('Gespeichert. Die Website zeigt die Änderungen sofort.');
        redirect('startseite');
    }
}

$previewUrl = web_base_url() . '?vorschau=' . web_preview_token($site);
page_start('startseite', 'Eröffnung & Startseite');
foreach ($errors as $e) echo '<div class="flash err" role="alert">' . h($e) . '</div>';
?>
<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend>Eröffnung</legend>
    <p class="hint">Bis die Website öffnet, sehen Besucher nur die Countdown-Seite. Shop, Kalender und alle anderen Seiten sind bis dahin gesperrt.</p>
    <div class="row2">
      <label>Website &amp; Online-Shop öffnen am<input type="datetime-local" name="openAt" required value="<?= h($site['openAt']) ?>"></label>
      <label>Countdown auf der Startseite zählt bis (Eröffnung des Ladens)<input type="datetime-local" name="countdownTarget" required value="<?= h($site['countdownTarget']) ?>"></label>
    </div>
    <p class="hint">Vor der Website-Eröffnung zählt die Uhr bis zur Website-Eröffnung. Danach zeigt die Startseite „Unser Laden in Padborg öffnet am … – noch …“ mit den Knöpfen zum Shop und zum Adventskalender.</p>
    <label class="check"><input type="checkbox" name="countdownEnabled" value="1" <?= $site['countdownEnabled'] ? 'checked' : '' ?>> Countdown-Uhr anzeigen</label>
    <label class="check"><input type="radio" name="launch" value="auto" <?= $site['launch'] === 'auto' ? 'checked' : '' ?>> Website öffnet von selbst am Eröffnungstag</label>
    <label class="check"><input type="radio" name="launch" value="open" <?= $site['launch'] === 'open' ? 'checked' : '' ?>> Website ist jetzt schon für alle offen</label>
    <label class="check"><input type="radio" name="launch" value="closed" <?= $site['launch'] === 'closed' ? 'checked' : '' ?>> Website bleibt gesperrt, auch nach dem Eröffnungstag</label>
    <p class="hint">Stand jetzt: <strong><?= web_is_open($site) ? 'Die Website ist für alle sichtbar.' : 'Besucher sehen nur die Countdown-Seite.' ?></strong></p>
  </fieldset>

  <fieldset>
    <legend>Vorschau</legend>
    <p class="hint">Mit diesem geheimen Link siehst du die ganze Website schon vor der Eröffnung – auf diesem Gerät dann 30 Tage lang. Im Adventskalender sind in der Vorschau alle Türchen offen. Nicht weitergeben.</p>
    <div class="copy-row">
      <input readonly value="<?= h($previewUrl) ?>" onclick="this.select()">
      <a class="btn small" href="<?= h($previewUrl) ?>" target="_blank" rel="noopener">Vorschau öffnen ↗</a>
    </div>
    <label class="check"><input type="checkbox" name="new_preview" value="1"> Neuen Vorschau-Link erzeugen (der alte gilt dann nicht mehr)</label>
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
