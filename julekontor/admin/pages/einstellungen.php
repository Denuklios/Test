<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/sumup.php';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = (string)($_POST['do'] ?? '');
    /* ---------- SumUp ---------- */
    if ($do === 'sumup_save') {
        $key = trim((string)($_POST['sumup_api_key'] ?? ''));
        if ($key !== '') set_setting('sumup_api_key', mb_substr($key, 0, 300));       // leer = alten Schlüssel behalten
        set_setting('sumup_affiliate_key', mb_substr(trim((string)($_POST['sumup_affiliate_key'] ?? '')), 0, 200));
        set_setting('sumup_app_id', mb_substr(trim((string)($_POST['sumup_app_id'] ?? '')), 0, 200));
        $mc = mb_substr(trim((string)($_POST['sumup_merchant'] ?? '')), 0, 40);
        if ($mc === '' && setting('sumup_api_key') !== '') $mc = sumup_merchant_code(setting('sumup_api_key'));   // automatisch holen
        set_setting('sumup_merchant', $mc);
        set_setting('sumup_enabled', !empty($_POST['sumup_enabled']) ? '1' : '0');
        flash('SumUp gespeichert' . ($mc !== '' ? ' – Verbindung zum Konto ' . $mc . ' steht.' : '.'));
        redirect('einstellungen#sumup');
    }
    if ($do === 'sumup_pair') {
        $r = sumup_pair((string)($_POST['pairing_code'] ?? ''), mb_substr(trim((string)($_POST['reader_name'] ?? '')), 0, 60) ?: 'Kasse');
        flash('Gerät gekoppelt (' . ($r['device']['model'] ?? 'Solo') . ' ' . ($r['device']['identifier'] ?? '') . '). Status: ' . ($r['status'] ?? '?') . '.');
        redirect('einstellungen#sumup');
    }
    if ($do === 'sumup_unpair') {
        sumup_unpair();
        flash('Gerät entkoppelt. Am Solo zusätzlich unter Verbindungen → API → Trennen.');
        redirect('einstellungen#sumup');
    }
    if ($do === 'sumup_remove_key') {
        foreach (['sumup_api_key', 'sumup_merchant', 'sumup_reader_id', 'sumup_reader_name'] as $k) set_setting($k, '');
        set_setting('sumup_enabled', '0');
        flash('SumUp-Zugang gelöscht.');
        redirect('einstellungen#sumup');
    }
    if ($do === 'verify') {
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
    set_setting('receipt_qr', !empty($_POST['receipt_qr']) ? '1' : '0');
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
    <label class="check"><input type="checkbox" name="receipt_qr" value="1" <?= setting('receipt_qr') === '1' ? 'checked' : '' ?>> Nach dem Bezahlen einen <b>QR-Code für den digitalen Beleg</b> zeigen (spart Papier – der Kunde scannt ihn mit dem Handy)</label>
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
<?php
  $rdr = null; $rst = null; $sumErr = '';
  if (setting('sumup_reader_id') !== '') { try { $rdr = sumup_reader(); $rst = sumup_reader_status(); } catch (ShopError $e) { $sumErr = $e->getMessage(); } }
  $recent = db()->query("SELECT c.*, s.number FROM card_payments c LEFT JOIN sales s ON s.uuid = c.uuid ORDER BY c.created DESC LIMIT 12")->fetchAll();
?>
<div class="card mt" id="sumup">
  <h2>SumUp Solo – Kartenzahlung automatisch</h2>
  <p class="muted">Die Kasse schickt den Betrag direkt an das SumUp Solo. Der Kunde zahlt am Gerät, und die Kasse bucht von selbst, sobald SumUp „bezahlt“ meldet. Ohne diese Einrichtung funktioniert „Karte“ wie bisher: Betrag am Gerät eintippen und bestätigen.</p>
  <?php if ($sumErr): ?><p class="flash err"><?= h($sumErr) ?></p><?php endif; ?>
  <form method="post" class="form mt">
    <?= csrf_field() ?><input type="hidden" name="do" value="sumup_save">
    <details <?= setting('sumup_api_key') === '' ? 'open' : '' ?>><summary>So bekommst du die Schlüssel (einmalig, ca. 5 Minuten)</summary>
      <ol class="hint" style="margin-top:8px">
        <li>Auf <b>me.sumup.com</b> anmelden → oben rechts Profil → <b>Einstellungen</b> → <b>Für Entwickler</b> → <b>Toolkit</b>.</li>
        <li><b>API Keys</b> → <b>Erstellen</b>, Namen „Julekontor Kasse“ geben, Schlüssel kopieren (SumUp zeigt ihn nur einmal!) und unten eintragen.</li>
        <li><b>Affiliate Keys</b> → als „Application identifier“ z. B. <code>dk.julekontor.kasse</code> eintragen → <b>Hinzufügen</b>. Den Key und genau diese App-ID unten eintragen.</li>
        <li>Speichern – die Händlernummer holt die Kasse dann selbst.</li>
      </ol></details>
    <div class="row2">
      <label>API-Schlüssel (geheim)<input type="password" name="sumup_api_key" autocomplete="off" placeholder="<?= setting('sumup_api_key') !== '' ? 'gespeichert – leer lassen zum Behalten' : 'sup_sk_…' ?>"></label>
      <label>Händlernummer (Merchant Code)<input name="sumup_merchant" value="<?= $s('sumup_merchant') ?>" placeholder="wird automatisch geholt"></label>
      <label>Affiliate-Key<input name="sumup_affiliate_key" value="<?= $s('sumup_affiliate_key') ?>" autocomplete="off"></label>
      <label>App-ID (Application identifier)<input name="sumup_app_id" value="<?= $s('sumup_app_id') ?>" placeholder="dk.julekontor.kasse"></label>
    </div>
    <label class="check"><input type="checkbox" name="sumup_enabled" value="1" <?= setting('sumup_enabled') === '1' ? 'checked' : '' ?>> In der Kasse verwenden</label>
    <div class="actions"><button class="btn" type="submit">Speichern &amp; Verbindung prüfen</button></div>
  </form>

  <?php if (setting('sumup_merchant') !== ''): ?>
    <h2 class="mt">Gerät</h2>
    <?php if (setting('sumup_reader_id') === ''): ?>
      <form method="post" class="form">
        <?= csrf_field() ?><input type="hidden" name="do" value="sumup_pair">
        <p class="hint">Am Solo <b>abmelden</b> (falls angemeldet) → <b>Verbindungen → API → Verbinden</b>. Das Gerät zeigt einen Code, der 5 Minuten gilt.</p>
        <div class="row2">
          <label>Kopplungs-Code vom Solo<input name="pairing_code" required maxlength="12" autocomplete="off" style="text-transform:uppercase;letter-spacing:.15em;font-weight:700"></label>
          <label>Name des Geräts<input name="reader_name" maxlength="60" value="Kasse"></label>
        </div>
        <div class="actions"><button class="btn" type="submit">Koppeln</button></div>
      </form>
    <?php else: ?>
      <p><b><?= h(setting('sumup_reader_name') ?: 'SumUp Solo') ?></b>
        <?php if ($rdr): ?> · <?= h(($rdr['device']['model'] ?? '') . ' ' . ($rdr['device']['identifier'] ?? '')) ?> · Kopplung: <span class="pill <?= ($rdr['status'] ?? '') === 'paired' ? 'green' : 'gold' ?>"><?= h($rdr['status'] ?? '?') ?></span><?php endif; ?>
        <?php if ($rst): ?> · <span class="pill <?= ($rst['status'] ?? '') === 'ONLINE' ? 'green' : 'red' ?>"><?= ($rst['status'] ?? '') === 'ONLINE' ? 'online' : 'offline' ?></span>
          <?= isset($rst['battery_level']) ? ' · Akku ' . (int)$rst['battery_level'] . ' %' : '' ?><?= !empty($rst['connection_type']) ? ' · ' . h($rst['connection_type']) : '' ?><?php endif; ?></p>
      <?php if ($rdr && ($rdr['status'] ?? '') === 'processing'): ?><p class="hint">Warte auf Bestätigung am Gerät … Seite in ein paar Sekunden neu laden.</p><?php endif; ?>
      <?php if ($rdr && ($rdr['status'] ?? '') === 'expired'): ?><p class="flash err">Die Kopplung ist abgelaufen. Bitte entkoppeln und neu koppeln.</p><?php endif; ?>
      <form method="post" class="actions" onsubmit="return confirm('Gerät entkoppeln?')"><?= csrf_field() ?><input type="hidden" name="do" value="sumup_unpair">
        <a class="btn ghost small" href="./?p=einstellungen#sumup">Status aktualisieren</a><button class="btn ghost small" type="submit">Entkoppeln</button></form>
    <?php endif; ?>
    <p class="hint mt">Status in der Kasse: <?= sumup_ready() ? '<span class="pill green">aktiv</span>' : '<span class="pill">noch nicht aktiv</span> – braucht Schlüssel, Affiliate-Key, App-ID, gekoppeltes Gerät und den Haken „In der Kasse verwenden“.' ?></p>
  <?php endif; ?>

  <?php if ($recent): ?>
    <h2 class="mt">Letzte Kartenzahlungen</h2>
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Zeit</th><th class="num">Betrag</th><th>SumUp</th><th>Karte</th><th>Bon</th></tr></thead>
      <tbody><?php foreach ($recent as $c): ?>
        <tr><td class="small"><?= h(fmt_dt($c['created'])) ?></td><td class="num"><?= money((int)$c['amount']) ?></td>
          <td><span class="pill <?= $c['status'] === 'successful' ? 'green' : ($c['status'] === 'pending' ? 'gold' : 'red') ?>"><?= h(['successful' => 'bezahlt', 'pending' => 'offen', 'failed' => 'fehlgeschlagen', 'cancelled' => 'abgebrochen'][$c['status']] ?? $c['status']) ?></span> <span class="muted small"><?= h($c['tx_code']) ?></span></td>
          <td class="small"><?= h($c['card']) ?></td>
          <td><?= $c['number'] ? '<a href="./?p=verkaeufe&nr=' . (int)$c['number'] . '">' . (int)$c['number'] . '</a>' : ($c['status'] === 'successful' ? '<span class="pill red">bezahlt, aber kein Bon!</span>' : '–') ?></td></tr>
      <?php endforeach; ?></tbody></table></div>
    <p class="hint">„Bezahlt, aber kein Bon“ heißt: Das Geld ist bei SumUp, der Verkauf wurde in der Kasse aber nicht gebucht (z. B. Tablet abgestürzt). Dann den Verkauf in der Kasse noch einmal eingeben und mit „Karte (manuell)“ abschließen.</p>
  <?php endif; ?>
  <?php if (setting('sumup_api_key') !== ''): ?>
    <form method="post" class="mt" onsubmit="return confirm('SumUp-Zugang komplett löschen?')"><?= csrf_field() ?><input type="hidden" name="do" value="sumup_remove_key"><button class="btn ghost small" type="submit">SumUp-Zugang löschen</button></form>
  <?php endif; ?>
</div>

<form method="post" class="card mt">
  <?= csrf_field() ?><input type="hidden" name="do" value="verify">
  <h2>Belege prüfen</h2>
  <p class="muted">Jeder Beleg trägt eine Prüfsumme, die auf dem vorherigen aufbaut. Diese Prüfung zeigt, ob in der Datenbank nachträglich etwas verändert wurde.</p>
  <div class="actions mt"><button class="btn ghost" type="submit">Jetzt prüfen</button></div>
</form>
<?php page_end();
