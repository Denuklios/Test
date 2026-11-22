<?php
declare(strict_types=1);
$db = db();
$d = fn(string $s) => date('Y-m-d', strtotime($s));
$ranges = [
    'heute' => ['Heute', $d('today'), $d('today')],
    'gestern' => ['Gestern', $d('yesterday'), $d('yesterday')],
    'woche' => ['Diese Woche', $d('monday this week'), $d('today')],
    'monat' => ['Dieser Monat', date('Y-m-01'), $d('today')],
    'vormonat' => ['Letzter Monat', $d('first day of last month'), $d('last day of last month')],
    'jahr' => ['Dieses Jahr', date('Y-01-01'), $d('today')],
];
$r = (string)($_GET['r'] ?? '');
if (isset($ranges[$r])) { [, $from, $to] = $ranges[$r]; }
else {
    $from = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['from'] ?? '')) ? $_GET['from'] : date('Y-m-01');
    $to = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['to'] ?? '')) ? $_GET['to'] : $d('today');
}
if ($from > $to) [$from, $to] = [$to, $from];
$args = [$from, $to];
$w = 'date(s.created) BETWEEN ? AND ?';

/* CSV: jede Belegzeile, für Buchhaltung / Revisor */
if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="umsatz-' . $from . '-bis-' . $to . '.csv"');
    $o = fopen('php://output', 'w');
    fwrite($o, "\xEF\xBB\xBF");
    fputcsv($o, ['Datum', 'Zeit', 'Bon', 'Art', 'Zahlung', 'Artikel', 'Strichcode', 'Menge', 'Einzelpreis', 'Rabatt', 'Gesamt brutto', 'Moms %', 'Moms', 'Netto', 'Einkauf', 'Kassierer', 'Z-Nr.'], ';');
    $st = $db->prepare("SELECT s.created, s.number, s.type, s.payment, s.user, z.number zn, i.* FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN closings z ON z.id = s.closing_id WHERE $w ORDER BY s.number, i.id");
    $st->execute($args);
    foreach ($st as $x) fputcsv($o, [date('d.m.Y', strtotime($x['created'])), date('H:i', strtotime($x['created'])), $x['number'], $x['type'] === 'refund' ? 'Rückgabe' : 'Verkauf',
        PAYMENTS[$x['payment']] ?? $x['payment'], $x['name'], $x['barcode'], fmt_qty((float)$x['qty']), money((int)$x['unit_price'], false), money((int)$x['discount'], false),
        money((int)$x['total'], false), str_replace('.', ',', (string)($x['vat'] / 100)), money((int)$x['vat_amount'], false), money((int)$x['total'] - (int)$x['vat_amount'], false),
        money((int)$x['cost'], false), $x['user'], $x['zn']], ';');
    exit;
}

$q = function (string $sql) use ($db, $args) { $st = $db->prepare($sql); $st->execute($args); return $st->fetchAll(); };
$tot = $q("SELECT COALESCE(SUM(CASE WHEN type='sale' THEN 1 END),0) n, COALESCE(SUM(total),0) gross, COALESCE(SUM(vat_total),0) vat, COALESCE(SUM(discount),0) disc,
                  COALESCE(SUM(CASE WHEN type='refund' THEN total END),0) refunds FROM sales s WHERE $w")[0];
$cost = (int)$q("SELECT COALESCE(SUM(i.cost),0) c FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE $w")[0]['c'];
$net = (int)$tot['gross'] - (int)$tot['vat'];
$byPay = $q("SELECT payment, SUM(total) t, COUNT(*) n FROM sales s WHERE $w GROUP BY payment ORDER BY t DESC");
$byVat = $q("SELECT i.vat, SUM(i.total) g, SUM(i.vat_amount) v FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE $w GROUP BY i.vat ORDER BY i.vat DESC");
$byDay = $q("SELECT date(created) d, SUM(total) t, SUM(CASE WHEN type='sale' THEN 1 ELSE 0 END) n FROM sales s WHERE $w GROUP BY d ORDER BY d");
$top = $q("SELECT i.name, SUM(i.qty) q, SUM(i.total) t, SUM(i.total - i.vat_amount - i.cost) m FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE $w GROUP BY COALESCE(i.product_id, i.name) ORDER BY t DESC LIMIT 25");
$byCat = $q("SELECT COALESCE(c.name, 'ohne Kategorie') name, COALESCE(c.color, '#999') color, SUM(i.total) t FROM sale_items i JOIN sales s ON s.id = i.sale_id LEFT JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id WHERE $w GROUP BY c.id ORDER BY t DESC");
$hours = $q("SELECT CAST(strftime('%H', created) AS INTEGER) h, SUM(total) t FROM sales s WHERE $w GROUP BY h ORDER BY h");
$maxDay = max(array_merge([1], array_map(fn($x) => (int)$x['t'], $byDay)));
$maxHour = max(array_merge([1], array_map(fn($x) => (int)$x['t'], $hours)));
$catSum = max(1, array_sum(array_map(fn($x) => max(0, (int)$x['t']), $byCat)));

$GLOBALS['wide'] = true;
page_start('berichte', 'Berichte');
?>
<form class="toolbar no-print" method="get">
  <input type="hidden" name="p" value="berichte">
  <?php foreach ($ranges as $k => [$t]): ?><a class="btn small <?= $r === $k ? '' : 'ghost' ?>" href="./?p=berichte&r=<?= $k ?>"><?= $t ?></a><?php endforeach; ?>
  <label>Von<input type="date" name="from" value="<?= h($from) ?>"></label>
  <label>Bis<input type="date" name="to" value="<?= h($to) ?>"></label>
  <button class="btn ghost small" type="submit">Zeigen</button>
  <a class="btn ghost small" href="./?p=berichte&from=<?= h($from) ?>&to=<?= h($to) ?>&csv=1">CSV für Buchhaltung</a>
</form>
<p class="muted"><?= h(date('d.m.Y', strtotime($from))) ?> – <?= h(date('d.m.Y', strtotime($to))) ?></p>

<div class="stats">
  <div class="stat"><b><?= money((int)$tot['gross']) ?></b><span>Umsatz brutto</span></div>
  <div class="stat"><b><?= money($net) ?></b><span>Umsatz netto</span></div>
  <div class="stat"><b><?= money((int)$tot['vat']) ?></b><span>Moms</span></div>
  <div class="stat"><b><?= money($net - $cost) ?></b><span>Rohertrag<?= $net > 0 ? ' (' . round(($net - $cost) / $net * 100) . ' %)' : '' ?></span></div>
  <div class="stat"><b><?= (int)$tot['n'] ?></b><span>Verkäufe</span></div>
  <div class="stat"><b><?= $tot['n'] ? money((int)round(($tot['gross'] - $tot['refunds']) / $tot['n'])) : '–' ?></b><span>Ø Bon</span></div>
  <div class="stat"><b><?= money((int)$tot['refunds']) ?></b><span>Rückgaben</span></div>
  <div class="stat"><b><?= money((int)$tot['disc']) ?></b><span>Rabatte</span></div>
</div>
<?php if ($cost === 0 && $tot['n']): ?><p class="hint">Rohertrag: Bei den Artikeln sind noch keine Einkaufspreise eingetragen.</p><?php endif; ?>

<?php if (count($byDay) > 1): ?>
<div class="card">
  <h2>Umsatz pro Tag</h2>
  <svg viewBox="0 0 <?= max(300, count($byDay) * 28) ?> 160" style="width:100%;height:180px" role="img" aria-label="Umsatz pro Tag">
    <?php foreach ($byDay as $i => $x): $hgt = max(1, (int)$x['t'] / $maxDay * 130); ?>
      <rect x="<?= $i * 28 + 4 ?>" y="<?= 135 - $hgt ?>" width="20" height="<?= $hgt ?>" rx="3" fill="var(--red)"><title><?= h(date('d.m.', strtotime($x['d']))) ?>: <?= h(money((int)$x['t'])) ?></title></rect>
      <text x="<?= $i * 28 + 14 ?>" y="152" font-size="9" text-anchor="middle" fill="var(--muted)"><?= h(date('d.', strtotime($x['d']))) ?></text>
    <?php endforeach; ?>
  </svg>
</div>
<?php endif; ?>

<div class="two-col mt">
  <div class="table-wrap"><table class="list">
    <thead><tr><th>Zahlungsart</th><th class="num">Bons</th><th class="num">Betrag</th></tr></thead>
    <tbody><?php foreach ($byPay as $x): ?><tr><td><?= h(PAYMENTS[$x['payment']] ?? $x['payment']) ?></td><td class="num"><?= (int)$x['n'] ?></td><td class="num"><?= money((int)$x['t']) ?></td></tr><?php endforeach; ?>
      <?php if (!$byPay): ?><tr class="empty-row"><td colspan="3">Keine Umsätze im Zeitraum.</td></tr><?php endif; ?></tbody>
  </table></div>
  <div class="table-wrap"><table class="list">
    <thead><tr><th>Moms</th><th class="num">Netto</th><th class="num">Moms</th><th class="num">Brutto</th></tr></thead>
    <tbody><?php foreach ($byVat as $x): ?><tr><td><?= vat_label((int)$x['vat']) ?></td><td class="num"><?= money((int)$x['g'] - (int)$x['v'], false) ?></td><td class="num"><?= money((int)$x['v'], false) ?></td><td class="num"><?= money((int)$x['g'], false) ?></td></tr><?php endforeach; ?>
      <?php if (!$byVat): ?><tr class="empty-row"><td colspan="4">–</td></tr><?php endif; ?></tbody>
  </table></div>
</div>

<div class="two-col mt">
  <div>
    <h2>Bestseller</h2>
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Artikel</th><th class="num">Menge</th><th class="num">Umsatz</th><th class="num">Rohertrag</th></tr></thead>
      <tbody><?php foreach ($top as $x): ?><tr><td><?= h($x['name']) ?></td><td class="num"><?= h(fmt_qty((float)$x['q'])) ?></td><td class="num"><?= money((int)$x['t'], false) ?></td><td class="num"><?= money((int)$x['m'], false) ?></td></tr><?php endforeach; ?>
        <?php if (!$top): ?><tr class="empty-row"><td colspan="4">–</td></tr><?php endif; ?></tbody>
    </table></div>
  </div>
  <div>
    <h2>Nach Kategorie</h2>
    <div class="card">
      <?php if (!$byCat): ?><p class="muted">–</p><?php endif; ?>
      <?php foreach ($byCat as $x): $pct = max(0, (int)$x['t']) / $catSum * 100; ?>
        <div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><span><span class="swatch" style="background:<?= h($x['color']) ?>"></span><?= h($x['name']) ?></span><b class="num"><?= money((int)$x['t']) ?></b></div>
          <div style="height:8px;background:var(--paper);border-radius:4px;margin-top:4px"><div style="height:8px;width:<?= round($pct, 1) ?>%;background:<?= h($x['color']) ?>;border-radius:4px"></div></div></div>
      <?php endforeach; ?>
    </div>
    <?php if ($hours): ?>
    <h2 class="mt">Nach Uhrzeit</h2>
    <div class="card">
      <svg viewBox="0 0 336 120" style="width:100%;height:130px" role="img" aria-label="Umsatz nach Uhrzeit">
        <?php $hm = array_column($hours, 't', 'h'); for ($hh = 8; $hh <= 21; $hh++): $v = (int)($hm[$hh] ?? 0); $hgt = $v / $maxHour * 95; ?>
          <rect x="<?= ($hh - 8) * 24 + 2 ?>" y="<?= 100 - $hgt ?>" width="18" height="<?= max(1, $hgt) ?>" rx="3" fill="var(--gold)"><title><?= $hh ?> Uhr: <?= h(money($v)) ?></title></rect>
          <text x="<?= ($hh - 8) * 24 + 11 ?>" y="114" font-size="9" text-anchor="middle" fill="var(--muted)"><?= $hh ?></text>
        <?php endfor; ?>
      </svg>
    </div>
    <?php endif; ?>
  </div>
</div>
<?php page_end();
