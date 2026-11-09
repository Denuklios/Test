<?php
declare(strict_types=1);
$db = db();
$who = user_name();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = (string)($_POST['do'] ?? '');
    if ($do === 'open') {
        open_day(parse_money((string)($_POST['float'] ?? '0')) ?? 0, $who);
        flash('Kasse geöffnet.');
        redirect('abschluss');
    }
    if ($do === 'move') {
        $amt = parse_money((string)($_POST['amount'] ?? '')) ?? 0;
        if (($_POST['dir'] ?? '') === 'out') $amt = -abs($amt); else $amt = abs($amt);
        cash_move($amt, (string)($_POST['note'] ?? ''), $who);
        flash($amt < 0 ? 'Entnahme gebucht.' : 'Einlage gebucht.');
        redirect('abschluss');
    }
    if ($do === 'close') {
        $counted = parse_money((string)($_POST['counted'] ?? ''));
        if ($counted === null) { flash('Bitte den gezählten Bargeldbestand eintragen.', 'err'); redirect('abschluss'); }
        $z = close_day($counted, parse_money((string)($_POST['withdrawn'] ?? '0')) ?? 0, $who);
        flash('Tagesabschluss Z ' . $z['number'] . ' erstellt.');
        redirect('abschluss&z=' . $z['id']);
    }
}

function report_table(array $t, array $c): void { ?>
  <div class="stats">
    <div class="stat"><b><?= money($t['gross']) ?></b><span>Umsatz (brutto)</span></div>
    <div class="stat"><b><?= $t['count_sales'] ?></b><span>Verkäufe</span></div>
    <div class="stat"><b><?= $t['count_refunds'] ?></b><span>Rückgaben (<?= money($t['refunds']) ?>)</span></div>
    <div class="stat"><b><?= money($t['discount']) ?></b><span>Rabatte</span></div>
  </div>
  <div class="two-col">
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Zahlungsart</th><th class="num">Betrag</th></tr></thead>
      <tbody><?php foreach (PAYMENTS as $k => $l): if (!isset($t['payments'][$k])) continue; ?><tr><td><?= $l ?></td><td class="num"><?= money($t['payments'][$k]) ?></td></tr><?php endforeach; ?>
        <?php if (!$t['payments']): ?><tr class="empty-row"><td colspan="2">Noch keine Umsätze.</td></tr><?php endif; ?></tbody>
      <tfoot><tr><td>Summe</td><td class="num"><?= money($t['gross']) ?></td></tr></tfoot>
    </table></div>
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Moms</th><th class="num">Netto</th><th class="num">Moms</th><th class="num">Brutto</th></tr></thead>
      <tbody><?php foreach ($t['vat'] as $v => $x): ?><tr><td><?= vat_label((int)$v) ?></td><td class="num"><?= money($x['net'], false) ?></td><td class="num"><?= money($x['vat'], false) ?></td><td class="num"><?= money($x['gross'], false) ?></td></tr><?php endforeach; ?>
        <?php if (!$t['vat']): ?><tr class="empty-row"><td colspan="4">–</td></tr><?php endif; ?></tbody>
    </table></div>
  </div>
  <div class="table-wrap mt"><table class="list">
    <tbody>
      <tr><td>Wechselgeld zu Beginn</td><td class="num"><?= money((int)$c['float']) ?></td></tr>
      <tr><td>+ Bareinnahmen</td><td class="num"><?= money($t['payments']['cash'] ?? 0) ?></td></tr>
      <tr><td>+ Einlagen / − Entnahmen</td><td class="num"><?= money($t['cash_moves']) ?></td></tr>
      <?php if ($t['rounding']): ?><tr><td class="muted">(darin Øre-Rundung)</td><td class="num muted"><?= money($t['rounding']) ?></td></tr><?php endif; ?>
    </tbody>
    <tfoot><tr><td>Soll-Bestand in der Kasse</td><td class="num"><?= money($t['expected_cash']) ?></td></tr></tfoot>
  </table></div>
  <?php if ($t['first']): ?><p class="muted small mt">Belege Nr. <?= $t['first'] ?> bis <?= $t['last'] ?> · <?= h(fmt_qty((float)$t['items'])) ?> Artikel</p><?php endif; ?>
<?php }

/* ---------- Z-Bericht ansehen ---------- */
if (isset($_GET['z'])) {
    $st = $db->prepare('SELECT * FROM closings WHERE id = ? AND closed_at IS NOT NULL');
    $st->execute([(int)$_GET['z']]);
    $z = $st->fetch();
    if (!$z) redirect('abschluss');
    $t = json_decode($z['totals'], true);
    page_start('abschluss', 'Z-Bericht Nr. ' . $z['number']);
    ?>
    <p class="no-print"><a href="./?p=abschluss">← Tagesabschluss</a> · <a href="#" onclick="print();return false">Drucken</a></p>
    <p><b><?= h(setting('shop_name')) ?></b><?= setting('shop_cvr') ? ' · CVR ' . h(setting('shop_cvr')) : '' ?><br>
      Geöffnet <?= h(fmt_dt($z['opened_at'])) ?> (<?= h($z['opened_by']) ?>) · Abgeschlossen <?= h(fmt_dt($z['closed_at'])) ?> (<?= h($z['closed_by']) ?>)</p>
    <?php report_table($t, $z); $diff = (int)$z['counted'] - (int)$z['expected']; ?>
    <div class="table-wrap mt"><table class="list"><tbody>
      <tr><td>Gezählt</td><td class="num"><?= money((int)$z['counted']) ?></td></tr>
      <tr><td>Differenz</td><td class="num"><span class="pill <?= $diff === 0 ? 'green' : 'red' ?>"><?= $diff > 0 ? '+' : '' ?><?= money($diff) ?></span></td></tr>
      <tr><td>Zur Bank / entnommen</td><td class="num"><?= money((int)$z['withdrawn']) ?></td></tr>
      <tr><td>Bleibt als Wechselgeld</td><td class="num"><?= money((int)$z['counted'] - (int)$z['withdrawn']) ?></td></tr>
    </tbody></table></div>
    <p class="muted small mt">Prüfsumme <?= h(substr((string)$z['hash'], 0, 16)) ?></p>
    <?php
    page_end();
    return;
}

$c = open_closing();
$GLOBALS['wide'] = true;
page_start('abschluss', 'Tagesabschluss');

if (!$c): ?>
  <form method="post" class="card form" style="max-width:520px">
    <?= csrf_field() ?><input type="hidden" name="do" value="open">
    <h2>Kasse öffnen</h2>
    <p class="muted">Zähle das Wechselgeld in der Kassenlade und trage es ein.</p>
    <?php $last = $db->query('SELECT counted - COALESCE(withdrawn,0) FROM closings WHERE closed_at IS NOT NULL ORDER BY id DESC LIMIT 1')->fetchColumn(); ?>
    <label>Wechselgeld (<?= h(setting('currency')) ?>)<input name="float" inputmode="decimal" value="<?= $last !== false ? h(money((int)$last, false)) : '0,00' ?>" autofocus></label>
    <?php if ($last !== false): ?><p class="hint">Vorschlag: was beim letzten Abschluss in der Kasse blieb.</p><?php endif; ?>
    <div class="actions"><button class="btn" type="submit">Kasse öffnen</button></div>
  </form>
<?php else:
  $t = closing_totals($c); ?>
  <p>Geöffnet seit <b><?= h(fmt_dt($c['opened_at'])) ?></b> von <?= h($c['opened_by']) ?> · <a href="kasse/">Zur Kasse →</a></p>
  <h2 class="mt">Zwischenstand (X-Bericht)</h2>
  <?php report_table($t, $c); ?>
  <div class="two-col mt no-print">
    <form method="post" class="card form">
      <?= csrf_field() ?><input type="hidden" name="do" value="move">
      <h2>Einlage / Entnahme</h2>
      <div class="row2">
        <label>Art<select name="dir"><option value="out">Entnahme (Geld raus)</option><option value="in">Einlage (Geld rein)</option></select></label>
        <label>Betrag<input name="amount" inputmode="decimal" required></label>
      </div>
      <label>Grund<input name="note" required maxlength="200" placeholder="z. B. Einkauf Briefmarken, Wechselgeld von der Bank"></label>
      <div class="actions"><button class="btn ghost" type="submit">Buchen</button></div>
      <?php $st = $db->prepare('SELECT * FROM cash_moves WHERE closing_id = ? ORDER BY id'); $st->execute([$c['id']]); foreach ($st as $m): ?>
        <p class="small"><?= h(date('H:i', strtotime($m['created']))) ?> · <?= h($m['note']) ?> · <b><?= money((int)$m['amount']) ?></b></p>
      <?php endforeach; ?>
    </form>
    <form method="post" class="card form" id="zform" onsubmit="return confirm('Tag jetzt abschließen? Danach sind keine Änderungen mehr möglich.')">
      <?= csrf_field() ?><input type="hidden" name="do" value="close">
      <h2>Tag abschließen (Z-Bericht)</h2>
      <details><summary>Geld zählen (Scheine und Münzen)</summary>
        <div class="row3 mt" id="denoms">
          <?php foreach ([100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50] as $d): ?>
            <label><?= money($d, false) ?><input inputmode="numeric" data-d="<?= $d ?>" placeholder="Anzahl"></label>
          <?php endforeach; ?>
        </div>
      </details>
      <label>Gezählter Bargeldbestand<input name="counted" id="counted" inputmode="decimal" required placeholder="Soll: <?= h(money($t['expected_cash'], false)) ?>"></label>
      <p class="hint" id="diff"></p>
      <label>Davon zur Bank / entnommen<input name="withdrawn" inputmode="decimal" value="0,00"></label>
      <div class="actions"><button class="btn" type="submit">Abschließen</button></div>
    </form>
  </div>
  <script>
  (function(){
    const exp = <?= (int)$t['expected_cash'] ?>, c = document.getElementById('counted'), out = document.getElementById('diff');
    const fmt = v => (v/100).toLocaleString('de-DE', {minimumFractionDigits: 2});
    const parse = s => { s = String(s).replace(/\s/g,''); if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g,''); return Math.round(parseFloat(s.replace(',', '.')) * 100); };
    function show(){ const v = parse(c.value); if (isNaN(v)) { out.textContent = ''; return; } const d = v - exp;
      out.textContent = d === 0 ? 'Stimmt genau.' : (d > 0 ? 'Überschuss ' : 'Fehlbetrag ') + fmt(Math.abs(d)); out.style.color = d === 0 ? 'var(--green)' : 'var(--err)'; }
    c.addEventListener('input', show);
    document.getElementById('denoms').addEventListener('input', () => {
      let s = 0; document.querySelectorAll('[data-d]').forEach(i => s += (parseInt(i.value) || 0) * +i.dataset.d);
      c.value = fmt(s); show();
    });
  })();
  </script>
<?php endif; ?>

<h2 class="mt">Frühere Abschlüsse</h2>
<div class="table-wrap"><table class="list">
  <thead><tr><th>Z-Nr.</th><th>Geöffnet</th><th>Abgeschlossen</th><th class="num">Umsatz</th><th class="num">Differenz</th></tr></thead>
  <tbody>
  <?php $rows = $db->query('SELECT * FROM closings WHERE closed_at IS NOT NULL ORDER BY number DESC LIMIT 60')->fetchAll(); ?>
  <?php if (!$rows): ?><tr class="empty-row"><td colspan="5">Noch kein Abschluss.</td></tr><?php endif; ?>
  <?php foreach ($rows as $z): $tt = json_decode($z['totals'], true); $d = (int)$z['counted'] - (int)$z['expected']; ?>
    <tr class="click" onclick="location='./?p=abschluss&z=<?= (int)$z['id'] ?>'"><td><b><?= (int)$z['number'] ?></b></td>
      <td><?= h(fmt_dt($z['opened_at'])) ?></td><td><?= h(fmt_dt($z['closed_at'])) ?> · <?= h($z['closed_by']) ?></td>
      <td class="num"><?= money((int)$tt['gross']) ?></td><td class="num"><span class="pill <?= $d === 0 ? 'green' : 'red' ?>"><?= money($d) ?></span></td></tr>
  <?php endforeach; ?>
  </tbody></table></div>
<?php page_end();
