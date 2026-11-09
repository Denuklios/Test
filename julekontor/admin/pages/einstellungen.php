<?php
declare(strict_types=1);
$check = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    if (($_POST['do'] ?? '') === 'verify') {
        $bad = verify_chain();
        flash($bad === null ? 'Prüfung bestanden: Alle Belege sind unverändert.' : 'ACHTUNG: Beleg ' . $bad . ' wurde nachträglich verändert!', $bad === null ? 'ok' : 'err');
        redirect('einstellungen');
    }
    $txt = fn(string $k, int $max = 200) => mb_substr(trim((string)($_POST[$k] ?? '')), 0, $max);
    foreach (['shop_name' => 60, 'shop_line' => 80, 'shop_cvr' => 20, 'shop_phone' => 30, 'mobilepay_number' => 30] as $k => $max) set_setting($k, $txt($k, $max));
    set_setting('shop_address', $txt('shop_address', 300));
    set_setting('receipt_footer', $txt('receipt_footer', 300));
    set_setting('invoice_note', $txt('invoice_note', 300));
    set_setting('print_default', ($_POST['print_default'] ?? '') === 'a4' ? 'a4' : 'bon');
    set_setting('bon_width', ($_POST['bon_width'] ?? '') === '58' ? '58' : '80');
    set_setting('currency', in_array($_POST['currency'] ?? '', ['DKK', 'EUR', 'SEK', 'NOK'], true) ? $_POST['currency'] : 'DKK');
    $rates = array_values(array_unique(array_filter(array_map(fn($x) => (int)round((float)str_replace(',', '.', trim($x)) * 100), explode(';', str_replace(' ', '', (string)($_POST['vat_rates'] ?? '25')))), fn($v) => $v >= 0 && $v <= 5000)));
    set_setting('vat_rates', implode(',', $rates ?: [2500]));
    set_setting('round_cash', (string)max(0, min(100, (int)($_POST['round_cash'] ?? 0))));
    $any = false;
    foreach (array_keys(PAYMENTS) as $k) { $on = !empty($_POST['pay_' . $k]); $any = $any || $on; set_setting('pay_' . $k, $on ? '1' : '0'); }
    if (!$any) set_setting('pay_cash', '1');
    flash('Einstellungen gespeichert.');
    redirect('einstellungen');
}
$s = fn(string $k) => h(setting($k));
page_start('einstellungen', 'Kassen-Einstellungen');
?>
<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend>Laden (steht auf dem Bon)</legend>
    <div class="row2">
      <label>Name<input name="shop_name" value="<?= $s('shop_name') ?>"></label>
      <label>Zusatzzeile<input name="shop_line" value="<?= $s('shop_line') ?>"></label>
    </div>
    <label>Adresse<textarea name="shop_address" rows="2"><?= $s('shop_address') ?></textarea></label>
    <div class="row2">
      <label>CVR-Nummer<input name="shop_cvr" value="<?= $s('shop_cvr') ?>"><span class="hint">Muss auf dem Bon stehen.</span></label>
      <label>Telefon<input name="shop_phone" value="<?= $s('shop_phone') ?>"></label>
    </div>
    <label>Text unten auf dem Bon<textarea name="receipt_footer" rows="2"><?= $s('receipt_footer') ?></textarea></label>
  </fieldset>
  <fieldset>
    <legend>Drucken</legend>
    <div class="row2">
      <label>Nach dem Verkauf drucken als<select name="print_default">
        <option value="bon" <?= setting('print_default') !== 'a4' ? 'selected' : '' ?>>Bon (Bondrucker)</option>
        <option value="a4" <?= setting('print_default') === 'a4' ? 'selected' : '' ?>>A4-Rechnung (normaler Drucker)</option></select>
        <span class="hint">Das andere Format kann man beim Drucken trotzdem jederzeit wählen.</span></label>
      <label>Breite der Bonrolle<select name="bon_width">
        <option value="80" <?= setting('bon_width') !== '58' ? 'selected' : '' ?>>80 mm (Standard)</option>
        <option value="58" <?= setting('bon_width') === '58' ? 'selected' : '' ?>>58 mm (kleine Drucker)</option></select></label>
    </div>
    <label>Text unten auf der A4-Rechnung<textarea name="invoice_note" rows="2" placeholder="z. B. Bank: Sydbank · Reg. 1234 · Konto 12345678"><?= $s('invoice_note') ?></textarea></label>
  </fieldset>
  <fieldset>
    <legend>Geld &amp; Steuer</legend>
    <div class="row3">
      <label>Währung<select name="currency"><?php foreach (['DKK', 'EUR', 'SEK', 'NOK'] as $c): ?><option <?= setting('currency') === $c ? 'selected' : '' ?>><?= $c ?></option><?php endforeach; ?></select></label>
      <label>Steuersätze in %<input name="vat_rates" value="<?= h(implode('; ', array_map(fn($v) => str_replace('.', ',', (string)($v / 100)), vat_rates()))) ?>"><span class="hint">Mehrere mit Semikolon, z. B. „25“ oder „19; 7“. Der erste ist Standard.</span></label>
      <label>Bargeld runden auf<select name="round_cash">
        <?php foreach ([0 => 'nicht runden', 50 => '0,50 (Dänemark)', 5 => '0,05', 10 => '0,10', 100 => '1,00'] as $v => $t): ?><option value="<?= $v ?>" <?= (int)setting('round_cash') === $v ? 'selected' : '' ?>><?= $t ?></option><?php endforeach; ?></select></label>
    </div>
  </fieldset>
  <fieldset>
    <legend>Zahlungsarten</legend>
    <?php foreach (PAYMENTS as $k => $t): ?><label class="check"><input type="checkbox" name="pay_<?= $k ?>" value="1" <?= setting('pay_' . $k) === '1' ? 'checked' : '' ?>> <?= $t ?></label><?php endforeach; ?>
    <label>MobilePay-Nummer (wird in der Kasse groß angezeigt)<input name="mobilepay_number" value="<?= $s('mobilepay_number') ?>" placeholder="z. B. Box-Nummer 12345"></label>
  </fieldset>
  <div class="actions"><button class="btn" type="submit">Speichern</button></div>
</form>
<form method="post" class="card mt">
  <?= csrf_field() ?><input type="hidden" name="do" value="verify">
  <h2>Belege prüfen</h2>
  <p class="muted">Jeder Beleg trägt eine Prüfsumme, die auf dem vorherigen aufbaut. Diese Prüfung zeigt, ob in der Datenbank nachträglich etwas verändert wurde.</p>
  <div class="actions mt"><button class="btn ghost" type="submit">Jetzt prüfen</button></div>
</form>
<?php page_end();
