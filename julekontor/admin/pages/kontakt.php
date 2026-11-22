<?php
declare(strict_types=1);
$site = web_site();
$c = $site['contact'];
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $txt = fn(string $k, int $max = 120) => mb_substr(trim((string)($_POST[$k] ?? '')), 0, $max);
    $c = ['street' => $txt('street'), 'city' => $txt('city'), 'phone' => $txt('phone', 40), 'email' => strtolower($txt('email')),
          'facebook' => web_url($txt('facebook', 300)), 'instagram' => web_url($txt('instagram', 300)),
          'maps' => web_url($txt('maps', 300)), 'cvr' => $txt('cvr', 20), 'owner' => $txt('owner', 120)];
    if ($c['email'] !== '' && !filter_var($c['email'], FILTER_VALIDATE_EMAIL)) $errors[] = 'Die E-Mail-Adresse ist nicht gültig.';
    if ($c['city'] === '') $errors[] = 'Bitte Postleitzahl und Ort eintragen.';
    if (!$errors) {
        $site['contact'] = $c;
        web_save($site);
        flash('Gespeichert.');
        redirect('kontakt');
    }
}

page_start('kontakt', 'Kontakt & Adresse');
$miss = array_keys(array_filter(['Inhaber/Firmenname' => ($c['owner'] ?? '') === '', 'Straße und Hausnummer' => $c['street'] === '', 'E-Mail' => $c['email'] === '', 'CVR-Nummer' => $c['cvr'] === '']));
if ($miss) echo '<div class="flash err">Für Impressum, AGB, Widerrufsrecht und Datenschutz fehlen noch: <strong>' . h(implode(', ', $miss)) . '</strong>. Ohne diese Angaben sind die Rechtstexte unvollständig.</div>';
foreach ($errors as $e) echo '<div class="flash err" role="alert">' . h($e) . '</div>';
?>
<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend>Adresse</legend>
    <label>Straße und Hausnummer<input name="street" maxlength="120" value="<?= h($c['street']) ?>"></label>
    <label>Postleitzahl und Ort<input name="city" required maxlength="120" value="<?= h($c['city']) ?>"></label>
    <label>Link zur Karte (z. B. Google Maps) – optional<input name="maps" maxlength="300" inputmode="url" value="<?= h($c['maps']) ?>"></label>
    <p class="hint">Ohne Link öffnet der Knopf „Route planen“ die Adresse in OpenStreetMap.</p>
  </fieldset>
  <fieldset>
    <legend>Kontakt</legend>
    <label>Telefon<input name="phone" maxlength="40" inputmode="tel" value="<?= h($c['phone']) ?>"></label>
    <label>E-Mail<input type="email" name="email" maxlength="120" value="<?= h($c['email']) ?>"></label>
    <p class="hint">An diese Adresse gehen auch die Anfragen von der Website.</p>
    <label>Facebook-Seite<input name="facebook" maxlength="300" inputmode="url" value="<?= h($c['facebook']) ?>"></label>
    <label>Instagram<input name="instagram" maxlength="300" inputmode="url" value="<?= h($c['instagram']) ?>"></label>
  </fieldset>
  <fieldset>
    <legend>Firma</legend>
    <label>Inhaber oder Firmenname mit Rechtsform (z. B. „Julekontor v/ Vorname Nachname“ oder „Julekontor ApS“)<input name="owner" maxlength="120" value="<?= h($c['owner'] ?? '') ?>"></label>
    <label>CVR-Nummer<input name="cvr" maxlength="20" value="<?= h($c['cvr']) ?>"></label>
    <p class="hint">Inhaber, Straße, CVR-Nummer und E-Mail werden automatisch in Impressum, AGB, Widerrufsrecht und Datenschutz eingesetzt.</p>
  </fieldset>
  <div class="actions"><button class="btn" type="submit">Speichern</button></div>
</form>
<p class="hint" style="margin-top:14px">Felder, die leer bleiben, zeigt die Website nicht an.</p>
<?php page_end();
