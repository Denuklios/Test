<?php
/* Versand & Verpackung: Kartons, Preise der Versanddienste nach Gewicht, Grundwerte und eine Probe-Rechnung */
declare(strict_types=1);
require_once __DIR__ . '/../inc/versand.php';
$db = db();
$dec = fn($v) => (float)str_replace(',', '.', trim((string)$v));
$kr = fn(int $ore) => $ore ? number_format($ore / 100, 2, ',', '') : '';
$n = fn(float $v) => $v ? rtrim(rtrim(number_format($v, 2, ',', ''), '0'), ',') : '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    set_setting('ship_def_weight', (string)max(1, (int)$dec($_POST['ship_def_weight'] ?? 500)));
    $sz = array_map(fn($x) => max(1, $dec($x)), array_pad(preg_split('/\s*[x×*]\s*/i', (string)($_POST['ship_def_size'] ?? '')), 3, 10));
    set_setting('ship_def_size', implode('x', array_map(fn($x) => rtrim(rtrim(number_format($x, 1, '.', ''), '0'), '.'), array_slice($sz, 0, 3))));
    set_setting('ship_fill', (string)max(30, min(100, (int)$dec($_POST['ship_fill'] ?? 75))));
    set_setting('ship_max', (string)max(1000, (int)($dec($_POST['ship_max'] ?? 20) * 1000)));
    set_setting('ship_pack_pass', empty($_POST['ship_pack_pass']) ? '0' : '1');
    $free = parse_money((string)($_POST['web_ship_free'] ?? '0'));
    if ($free !== null && $free >= 0) set_setting('web_ship_free', (string)$free);

    foreach ((array)($_POST['box'] ?? []) as $id => $b) {
        $name = mb_substr(trim((string)($b['name'] ?? '')), 0, 60);
        $vals = [$name, max(0, $dec($b['l'] ?? 0)), max(0, $dec($b['w'] ?? 0)), max(0, $dec($b['h'] ?? 0)), max(0, $dec($b['weight'] ?? 0)),
                 max(0, (int)(parse_money((string)($b['cost'] ?? '0')) ?? 0)), empty($b['active']) ? 0 : 1];
        if ($id === 'new') {
            if ($name !== '' && $vals[1] > 0 && $vals[2] > 0 && $vals[3] > 0) $db->prepare('INSERT INTO ship_boxes (name, l, w, h, weight, cost, active, sort) VALUES (?,?,?,?,?,?,?,100)')->execute($vals);
        } elseif (!empty($b['del'])) $db->prepare('DELETE FROM ship_boxes WHERE id = ?')->execute([(int)$id]);
        elseif ($name !== '') $db->prepare('UPDATE ship_boxes SET name=?, l=?, w=?, h=?, weight=?, cost=?, active=? WHERE id=?')->execute([...$vals, (int)$id]);
    }
    foreach ((array)($_POST['rate'] ?? []) as $id => $r) {
        $carrier = isset(SHIP_CARRIERS[$r['carrier'] ?? '']) ? $r['carrier'] : '';
        $country = isset(SHIP_COUNTRIES[$r['country'] ?? '']) ? $r['country'] : '';
        $service = isset(SHIP_SERVICES[$r['service'] ?? '']) ? $r['service'] : 'shop';
        $kg = $dec($r['kg'] ?? 0);
        $vals = [$carrier, $country, $service, $kg * 1000, max(0, $dec($r['len'] ?? 0)), max(0, $dec($r['sum'] ?? 0)),
                 max(0, (int)(parse_money((string)($r['price'] ?? '0')) ?? 0)), empty($r['active']) ? 0 : 1, mb_substr(trim((string)($r['note'] ?? '')), 0, 200)];
        if (str_starts_with((string)$id, 'new')) {
            if ($carrier && $country && $kg > 0) $db->prepare('INSERT INTO ship_rates (carrier, country, service, max_weight, max_len, max_sum, price, active, note) VALUES (?,?,?,?,?,?,?,?,?)')->execute($vals);
        } elseif (!empty($r['del'])) $db->prepare('DELETE FROM ship_rates WHERE id = ?')->execute([(int)$id]);
        elseif ($carrier && $country && $kg > 0) $db->prepare('UPDATE ship_rates SET carrier=?, country=?, service=?, max_weight=?, max_len=?, max_sum=?, price=?, active=?, note=? WHERE id=?')->execute([...$vals, (int)$id]);
    }
    flash('Gespeichert.');
    redirect('versand' . (!empty($_POST['probe']) ? '&' . http_build_query(['t' => $_POST['probe']]) : ''));
}

$boxes = $db->query('SELECT * FROM ship_boxes ORDER BY active DESC, l * w * h')->fetchAll();
$rates = $db->query('SELECT * FROM ship_rates ORDER BY carrier, country, service, max_weight')->fetchAll();
$byGroup = [];
foreach ($rates as $r) $byGroup[$r['carrier'] . '|' . $r['country']][] = $r;
$activeRates = array_filter($rates, fn($r) => $r['active'] && $r['price'] > 0);
$web = $db->query('SELECT id, name, weight, size_l, size_w, size_h, web_ship FROM products WHERE web = 1 AND active = 1 ORDER BY name')->fetchAll();
$missing = array_filter($web, fn($p) => $p['web_ship'] && (!$p['weight'] || !$p['size_l'] || !$p['size_w'] || !$p['size_h']));

/* Probe-Rechnung */
$probe = is_array($_GET['t'] ?? null) ? $_GET['t'] : [];
$probeLines = [];
foreach ($web as $p) if ((int)($probe[$p['id']] ?? 0) > 0) $probeLines[] = ['qty' => min(50, (int)$probe[$p['id']]), 'weight' => $p['weight'], 'l' => $p['size_l'], 'w' => $p['size_w'], 'h' => $p['size_h'], 'name' => $p['name']];
$probeParcels = $probeLines ? ship_pack(ship_units($probeLines)) : [];

$GLOBALS['wide'] = true;
page_start('versand', 'Versand & Verpackung');
$chk = fn(string $k) => setting($k) === '1' ? 'checked' : '';
$rateRow = function ($id, array $r) use ($kr, $n) { ?>
  <tr>
    <td><select name="rate[<?= h((string)$id) ?>][service]"><?php foreach (SHIP_SERVICES as $k => $l): ?><option value="<?= $k ?>" <?= ($r['service'] ?? 'shop') === $k ? 'selected' : '' ?>><?= h($l) ?></option><?php endforeach; ?></select>
      <input type="hidden" name="rate[<?= h((string)$id) ?>][carrier]" value="<?= h($r['carrier']) ?>"><input type="hidden" name="rate[<?= h((string)$id) ?>][country]" value="<?= h($r['country']) ?>"></td>
    <td><input name="rate[<?= h((string)$id) ?>][kg]" inputmode="decimal" value="<?= h($n((float)($r['max_weight'] ?? 0) / 1000)) ?>" style="width:5em" placeholder="kg"></td>
    <td><input name="rate[<?= h((string)$id) ?>][len]" inputmode="decimal" value="<?= h($n((float)($r['max_len'] ?? 0))) ?>" style="width:5em" placeholder="egal"></td>
    <td><input name="rate[<?= h((string)$id) ?>][sum]" inputmode="decimal" value="<?= h($n((float)($r['max_sum'] ?? 0))) ?>" style="width:5em" placeholder="egal"></td>
    <td><input name="rate[<?= h((string)$id) ?>][price]" inputmode="decimal" value="<?= h($kr((int)($r['price'] ?? 0))) ?>" style="width:6em" placeholder="kr."></td>
    <td class="num"><input type="checkbox" name="rate[<?= h((string)$id) ?>][active]" value="1" <?= !empty($r['active']) ? 'checked' : '' ?> aria-label="eingeschaltet"></td>
    <td><input name="rate[<?= h((string)$id) ?>][note]" value="<?= h($r['note'] ?? '') ?>" placeholder="Notiz"></td>
    <td class="num"><?php if (!str_starts_with((string)$id, 'new')): ?><label class="check small"><input type="checkbox" name="rate[<?= h((string)$id) ?>][del]" value="1"> weg</label><?php endif; ?></td>
  </tr>
<?php };
?>
<?php if (!$activeRates): ?>
  <div class="flash err" role="alert"><b>Noch keine Versandpreise eingeschaltet.</b> Bis du unten Preise prüfst und den Haken „an“ setzt, rechnet der Shop mit dem festen Preis aus den <a href="./?p=shop">Shop-Einstellungen</a>
    (<?= money((int)setting('web_ship_dk')) ?> nach Dänemark, <?= money((int)setting('web_ship_de')) ?> nach Deutschland – je Paket).</div>
<?php endif; ?>
<?php if ($missing): ?>
  <div class="flash" role="status"><b><?= count($missing) ?> Artikel im Shop ohne Gewicht oder Maße</b> – dafür rechnet der Shop mit <?= h(setting('ship_def_weight')) ?> g und <?= h(str_replace('x', ' × ', setting('ship_def_size'))) ?> cm:
    <?= implode(', ', array_map(fn($p) => '<a href="./?p=artikel&id=' . (int)$p['id'] . '">' . h($p['name']) . '</a>', array_slice($missing, 0, 12))) ?><?= count($missing) > 12 ? ' …' : '' ?></div>
<?php endif; ?>

<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend>So rechnet der Shop</legend>
    <p class="hint">Beim Bestellen packt der Shop die Ware: große Stücke zuerst, jedes Stück in einen passenden Karton. Passt nicht alles in einen, werden es mehrere Pakete.
      Dann sucht er bei jedem eingeschalteten Versanddienst die passende Gewichtsstufe. Der Kunde sieht alle Dienste mit Preis und wählt selbst.</p>
    <div class="row4">
      <label>Gewicht, wenn beim Artikel nichts steht (g)<input name="ship_def_weight" inputmode="numeric" value="<?= h(setting('ship_def_weight')) ?>"></label>
      <label>Größe, wenn nichts steht (L × B × H cm)<input name="ship_def_size" value="<?= h(str_replace('x', ' x ', setting('ship_def_size'))) ?>"></label>
      <label>Karton höchstens zu … % füllen<input name="ship_fill" inputmode="numeric" value="<?= h(setting('ship_fill')) ?>"></label>
      <label>Höchstgewicht je Paket (kg)<input name="ship_max" inputmode="decimal" value="<?= h($n((float)setting('ship_max') / 1000)) ?>"></label>
    </div>
    <div class="row4">
      <label>Versandkostenfrei ab Warenwert (kr., 0 = nie)<input name="web_ship_free" inputmode="decimal" value="<?= h(number_format((int)setting('web_ship_free') / 100, 2, ',', '')) ?>"></label>
    </div>
    <label class="check"><input type="checkbox" name="ship_pack_pass" value="1" <?= $chk('ship_pack_pass') ?>> Kosten für Karton und Füllmaterial auf den Versandpreis aufschlagen</label>
  </fieldset>

  <fieldset>
    <legend>Kartons &amp; Versandtaschen</legend>
    <p class="hint">Innenmaße in cm. Das Eigengewicht (mit Füllmaterial) kommt zum Warengewicht dazu. Die vorgegebenen Kartons sind Beispiele – bitte eure echten Maße eintragen.</p>
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Name</th><th>Länge</th><th>Breite</th><th>Höhe</th><th>Eigengewicht g</th><th>Kosten kr.</th><th class="num">an</th><th></th></tr></thead>
      <tbody>
      <?php foreach ([...$boxes, ['id' => 'new', 'name' => '', 'l' => 0, 'w' => 0, 'h' => 0, 'weight' => 0, 'cost' => 0, 'active' => 1]] as $b): $id = (string)$b['id']; ?>
        <tr<?= $id === 'new' ? ' class="new-row"' : '' ?>>
          <td><input name="box[<?= h($id) ?>][name]" value="<?= h($b['name']) ?>" placeholder="<?= $id === 'new' ? '+ neuer Karton' : '' ?>"></td>
          <?php foreach (['l', 'w', 'h', 'weight'] as $k): ?><td><input name="box[<?= h($id) ?>][<?= $k ?>]" inputmode="decimal" value="<?= h($n((float)$b[$k])) ?>" style="width:5em"></td><?php endforeach; ?>
          <td><input name="box[<?= h($id) ?>][cost]" inputmode="decimal" value="<?= h($kr((int)$b['cost'])) ?>" style="width:6em"></td>
          <td class="num"><input type="checkbox" name="box[<?= h($id) ?>][active]" value="1" <?= $b['active'] ? 'checked' : '' ?> aria-label="benutzen"></td>
          <td class="num"><?php if ($id !== 'new'): ?><label class="check small"><input type="checkbox" name="box[<?= h($id) ?>][del]" value="1"> weg</label><?php endif; ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody></table></div>
  </fieldset>

  <?php foreach (SHIP_CARRIERS as $c => $cName): foreach (SHIP_COUNTRIES as $land => $lName): $list = $byGroup[$c . '|' . $land] ?? []; $on = count(array_filter($list, fn($r) => $r['active'] && $r['price'] > 0)); ?>
  <fieldset>
    <legend><?= h($cName) ?> → <?= h($lName) ?> <span class="pill <?= $on ? 'green' : '' ?>"><?= $on ? $on . ' Stufen an' : 'aus' ?></span></legend>
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Lieferung</th><th>bis kg</th><th>längste Seite bis cm</th><th>L+B+H bis cm</th><th>Preis für Kunden kr.</th><th class="num">an</th><th>Notiz</th><th></th></tr></thead>
      <tbody><?php foreach ($list as $r) $rateRow($r['id'], $r); $rateRow('new' . $c . $land, ['carrier' => $c, 'country' => $land, 'service' => 'shop']); ?></tbody>
    </table></div>
  </fieldset>
  <?php endforeach; endforeach; ?>
  <p class="hint">Die eingetragenen Preise sind <b>Vorschläge aus den öffentlichen Preislisten</b> (Stand November 2026) und stehen auf „aus“. Bitte mit eurem eigenen Vertrag bzw. der aktuellen Liste abgleichen
    (bei GLS kommt ein monatlicher Energiezuschlag dazu), dann Haken setzen. Leere Zeile ausfüllen = neue Stufe. Der Preis ist der Preis für den Kunden inkl. Moms.</p>
  <div class="actions"><button class="btn" type="submit">Speichern</button></div>
</form>

<form method="get" class="card form mt">
  <input type="hidden" name="p" value="versand">
  <fieldset>
    <legend>Probe-Paket</legend>
    <p class="hint">Menge eintragen und rechnen lassen – so siehst du, welcher Karton genommen wird und was der Versand kostet.</p>
    <?php if (!$web): ?><p class="muted">Noch keine Artikel im Shop.</p><?php else: ?>
    <div class="probe">
      <?php foreach ($web as $p): ?><label><span><?= h($p['name']) ?></span><input name="t[<?= (int)$p['id'] ?>]" type="number" min="0" max="50" value="<?= (int)($probe[$p['id']] ?? 0) ?: '' ?>" style="width:5em"></label><?php endforeach; ?>
    </div>
    <div class="actions"><button class="btn ghost" type="submit">Rechnen</button></div>
    <?php endif; ?>
    <?php if ($probeParcels): ?>
      <h3>Ergebnis</h3>
      <ul><?php foreach ($probeParcels as $i => $pp): ?><li>Paket <?= $i + 1 ?>: <b><?= h($pp['box']) ?></b> (<?= h(implode(' × ', array_map($n, $pp['d']))) ?> cm), <?= h(number_format($pp['g'] / 1000, 2, ',', '')) ?> kg, <?= (int)$pp['n'] ?> Stück<?= $pp['cost'] ? ', Karton ' . money((int)$pp['cost']) : '' ?></li><?php endforeach; ?></ul>
      <?php foreach (SHIP_COUNTRIES as $land => $lName): $sub = 0; $ms = ship_methods($land, $probeParcels, 0); ?>
        <p><b><?= h($lName) ?>:</b> <?= $ms ? implode(' · ', array_map(fn($m) => h(($m['label'] ?: 'Standardversand') . ($m['label'] ? ' ' . SHIP_SERVICES[$m['service']] : '')) . ' ' . money((int)$m['price']), $ms)) : '<span class="pill red">kein Dienst passt</span>' ?></p>
      <?php endforeach; ?>
    <?php endif; ?>
  </fieldset>
</form>
<style>.probe{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px 18px}.probe label{display:flex;align-items:center;justify-content:space-between;gap:10px}.list input,.list select{min-width:0}.new-row input::placeholder{color:var(--green)}</style>
<?php page_end();
