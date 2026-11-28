<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/sumup.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $err = [];
    foreach (['web_ship_dk' => 'Versand Dänemark', 'web_ship_de' => 'Versand Deutschland', 'web_ship_free' => 'Versandkostenfrei ab'] as $k => $label) {
        $v = parse_money((string)($_POST[$k] ?? '0')) ?? -1;
        if ($v < 0) $err[] = $label . ': bitte einen Betrag eintragen.'; else set_setting($k, (string)$v);
    }
    $rate = (float)str_replace(',', '.', (string)($_POST['web_eur_rate'] ?? ''));
    if ($rate < 1 || $rate > 20) $err[] = 'Bitte einen gültigen Euro-Kurs eintragen (z. B. 7,46).'; else set_setting('web_eur_rate', (string)$rate);
    foreach (['web_shop_on', 'web_pay_pickup', 'web_pay_mobilepay', 'web_pay_bank', 'web_pay_card'] as $k) set_setting($k, empty($_POST[$k]) ? '0' : '1');
    set_setting('web_bank_text', mb_substr(trim((string)($_POST['web_bank_text'] ?? '')), 0, 600));
    set_setting('mobilepay_number', mb_substr(trim((string)($_POST['mobilepay_number'] ?? '')), 0, 20));
    flash($err ? implode(' ', $err) : 'Gespeichert.', $err ? 'err' : 'ok');
    redirect('shop');
}
$m = fn(string $k) => number_format((int)setting($k) / 100, 2, ',', '');
$chk = fn(string $k) => setting($k) === '1' ? 'checked' : '';
$keyOk = setting('sumup_api_key') !== '' && setting('sumup_merchant') !== '';
page_start('shop', 'Shop-Einstellungen');
?>
<p class="muted">Welche Artikel im Online-Shop stehen, legst du beim Artikel fest (Laden → Artikel → „Auf der Website zeigen“).</p>
<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend>Bestellen</legend>
    <label class="check"><input type="checkbox" name="web_shop_on" value="1" <?= $chk('web_shop_on') ?>> Online bestellen ist möglich</label>
    <p class="hint">Ohne Haken bleibt der Shop sichtbar, aber niemand kann etwas in den Warenkorb legen.</p>
  </fieldset>
  <fieldset>
    <legend>Versand</legend>
    <div class="row4">
      <label>Dänemark (<?= h(setting('currency')) ?>)<input name="web_ship_dk" inputmode="decimal" value="<?= h($m('web_ship_dk')) ?>"></label>
      <label>Deutschland (<?= h(setting('currency')) ?>)<input name="web_ship_de" inputmode="decimal" value="<?= h($m('web_ship_de')) ?>"></label>
      <label>Kostenlos ab Warenwert<input name="web_ship_free" inputmode="decimal" value="<?= h($m('web_ship_free')) ?>"></label>
      <label>1 Euro = … Kronen<input name="web_eur_rate" inputmode="decimal" value="<?= h(str_replace('.', ',', setting('web_eur_rate'))) ?>"></label>
    </div>
    <p class="hint"><b>Fester Ersatzpreis je Paket:</b> gilt nur, solange unter <a href="./?p=versand">Versand &amp; Verpackung</a> für das Land keine Versandpreise eingeschaltet sind. „Kostenlos ab“ 0 = immer Versandkosten. Abholung im Laden ist immer kostenlos. Der Euro-Kurs dient nur für den Hinweis „ca. … €“ – bezahlt wird in Kronen. Ob ein Artikel verschickt werden kann, steht beim Artikel.</p>
  </fieldset>
  <fieldset>
    <legend>Bezahlung</legend>
    <label class="check"><input type="checkbox" name="web_pay_pickup" value="1" <?= $chk('web_pay_pickup') ?>> Bezahlen bei Abholung im Laden</label>
    <label class="check"><input type="checkbox" name="web_pay_mobilepay" value="1" <?= $chk('web_pay_mobilepay') ?>> MobilePay</label>
    <label>MobilePay-Nummer<input name="mobilepay_number" maxlength="20" value="<?= h(setting('mobilepay_number')) ?>" style="max-width:220px"></label>
    <label class="check"><input type="checkbox" name="web_pay_bank" value="1" <?= $chk('web_pay_bank') ?>> Überweisung</label>
    <label>Bankverbindung (wird dem Kunden nach der Bestellung gezeigt)<textarea name="web_bank_text" maxlength="600" rows="3"><?= h(setting('web_bank_text')) ?></textarea></label>
    <label class="check"><input type="checkbox" name="web_pay_card" value="1" <?= $chk('web_pay_card') ?>> Kartenzahlung über SumUp</label>
    <?php if ($keyOk): ?><p class="hint">SumUp-Zugang ist hinterlegt (Händler <?= h(setting('sumup_merchant')) ?>). Mit einem echten Konto ist die Online-Kartenzahlung noch nicht getestet – bitte zuerst eine Probebestellung mit kleinem Betrag machen.</p>
    <?php else: ?><p class="hint">Dafür muss unter <a href="./?p=einstellungen">Kassen-Einstellungen → SumUp</a> der API-Schlüssel eingetragen sein. Solange er fehlt, wird Kartenzahlung nicht angeboten.</p><?php endif; ?>
    <p class="hint">MobilePay und Überweisung erscheinen nur, wenn Nummer bzw. Bankverbindung eingetragen sind.</p>
  </fieldset>
  <div class="actions"><button class="btn" type="submit">Speichern</button></div>
</form>
<?php page_end();
