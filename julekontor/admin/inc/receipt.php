<?php
/* Beleg-Darstellung (Bon oder A4-Rechnung) – gemeinsam für den Druck im Admin (bon.php)
   und den digitalen Beleg für Kunden (../beleg.php). */
declare(strict_types=1);

function receipt_render_vars(array $s, string $fmt): array {
    $r = receipt_data($s);
    return [
        'r' => $r, 's' => $s, 'fmt' => $fmt, 'shop' => shop_header(),
        'width' => setting('bon_width') === '58' ? 58 : 80,
        'm' => fn(int $c) => money($c, false),
        'refund' => $r['type'] === 'refund',
        'customer' => (string)$s['customer'],
    ];
}

/* CSS für beide Formate. $print: true = Seitenformat für den Drucker setzen */
function receipt_css(string $fmt, int $width): void { ?>
  * { box-sizing: border-box; }
  body { margin: 0; background: #e9e4dc; color: #000; }
  .tools { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 12px; font-family: system-ui, sans-serif; }
  .tools a, .tools button { font: 600 15px system-ui; padding: 10px 18px; border-radius: 999px; border: 2px solid #a3201d; background: #fff; color: #a3201d; text-decoration: none; cursor: pointer; }
  .tools .main { background: #a3201d; color: #fff; }
  .tools .on { background: #f3e2c4; }
  @media print { body { background: #fff; } .tools, .no-print { display: none !important; } }

  /* ---------- Bon ---------- */
  .bon { width: <?= $width - 6 ?>mm; margin: 0 auto 20px; background: #fff; padding: 4mm 3mm; font: <?= $width === 58 ? '10.5px' : '12px' ?>/1.35 "Courier New", ui-monospace, monospace; }
  .bon .c { text-align: center; } .bon .r { text-align: right; } .bon .b { font-weight: 700; }
  .bon .logo { display: block; width: 70%; margin: 0 auto 4px; }
  @media print { .bon .logo { filter: grayscale(1) contrast(1.4); } }
  .bon h1 { font: 700 18px/1.1 Georgia, serif; margin: 0; }
  .bon .line { border-top: 1px dashed #000; margin: 6px 0; }
  .bon table { width: 100%; border-collapse: collapse; }
  .bon td { padding: 1px 0; vertical-align: top; }
  .bon .big td { font-size: 1.25em; font-weight: 700; padding-top: 3px; }
  .bon .small { font-size: .85em; }
  <?php if ($fmt === 'bon'): ?>@page { size: <?= $width ?>mm auto; margin: 3mm; }
  @media print { .bon { margin: 0; width: auto; padding: 0; } }<?php endif; ?>

  /* ---------- A4-Rechnung ---------- */
  .a4 { width: 210mm; min-height: 297mm; margin: 0 auto 20px; background: #fff; padding: 16mm 18mm 14mm; font: 10pt/1.45 Arial, Helvetica, sans-serif; color: #222;
    display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,.15); }
  .a4 header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  .a4 header img { height: 34mm; }
  .a4 header .shopname { font: italic 700 22pt Georgia, serif; color: #a3201d; }
  .a4 .from { text-align: right; font-size: 9pt; color: #444; }
  .a4 .from b { color: #222; }
  .a4 .sender { font-size: 7.5pt; color: #777; border-bottom: 1px solid #ccc; padding-bottom: 1mm; margin-bottom: 2mm; }
  .a4 .addr { margin-top: 10mm; display: flex; justify-content: space-between; gap: 20px; align-items: flex-end; }
  .a4 .cust { width: 85mm; min-height: 30mm; white-space: pre-line; font-size: 10.5pt; }
  .a4 .meta { border-collapse: collapse; font-size: 9.5pt; }
  .a4 .meta td { padding: 1px 0 1px 12px; } .a4 .meta td:first-child { color: #666; padding-left: 0; }
  .a4 h1 { font: 700 20pt Georgia, serif; color: #a3201d; margin: 10mm 0 4mm; letter-spacing: .02em; }
  .a4 table.items { width: 100%; border-collapse: collapse; }
  .a4 table.items th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .05em; color: #666; border-bottom: 2px solid #a3201d; padding: 6px 4px; }
  .a4 table.items td { padding: 7px 4px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  .a4 .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .a4 .sub { color: #777; font-size: 8.5pt; }
  .a4 .totals { margin-left: auto; margin-top: 5mm; border-collapse: collapse; min-width: 80mm; }
  .a4 .totals td { padding: 3px 4px; } .a4 .totals td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .a4 .totals .grand td { font: 700 13pt Arial, sans-serif; border-top: 2px solid #222; padding-top: 6px; }
  .a4 .paid { margin-top: 6mm; display: inline-block; border: 2px solid #2e5a3c; color: #2e5a3c; font-weight: 700; padding: 4px 12px; border-radius: 4px; transform: rotate(-2deg); }
  .a4 footer { margin-top: auto; padding-top: 8mm; border-top: 1px solid #ddd; font-size: 8.5pt; color: #555; display: flex; justify-content: space-between; gap: 20px; white-space: pre-line; }
  .custform { max-width: 210mm; margin: 0 auto 12px; background: #fff8ec; border: 1px dashed #c3923e; border-radius: 10px; padding: 10px 14px; font: 14px system-ui, sans-serif; }
  .custform textarea { width: 100%; min-height: 70px; font: 14px system-ui; padding: 8px; border-radius: 8px; border: 1px solid #ccc; margin: 6px 0; }
  .custform button { font: 600 14px system-ui; padding: 8px 16px; border-radius: 999px; border: 0; background: #a3201d; color: #fff; }
  <?php if ($fmt === 'a4'): ?>@page { size: A4; margin: 0; }
  @media print { .a4 { box-shadow: none; margin: 0; width: 210mm; height: 297mm; } }<?php endif; ?>
<?php }

/* $logo: Pfad zum Logo relativ zur aufrufenden Seite. $editable: Kundenfeld (nur im Admin) */
function receipt_body(array $v, string $logo, bool $editable): void {
    extract($v); ?>
<?php if ($fmt === 'bon'): ?>
<div class="bon">
  <div class="c">
    <?php if ($logo && $width === 80): ?><img class="logo" src="<?= h($logo) ?>" alt=""><?php else: ?><h1><?= h($shop['name']) ?></h1><?php endif; ?>
    <?php if ($shop['line'] && !$logo): ?><div><?= h($shop['line']) ?></div><?php endif; ?>
    <div><?= nl2br(h($shop['address'])) ?></div>
    <?php if ($shop['phone']): ?><div>Tlf. <?= h($shop['phone']) ?></div><?php endif; ?>
    <?php if ($shop['cvr']): ?><div>CVR <?= h($shop['cvr']) ?></div><?php endif; ?>
  </div>
  <div class="line"></div>
  <div class="c b"><?= $refund ? 'RETUR / KREDITNOTA' : 'KVITTERING' ?></div>
  <table class="small">
    <tr><td>Bon nr. <?= (int)$r['number'] ?></td><td class="r"><?= h(date('d.m.Y H:i', strtotime($r['created']))) ?></td></tr>
    <?php if ($refund && $r['ref_number']): ?><tr><td colspan="2">Retur til bon nr. <?= (int)$r['ref_number'] ?></td></tr><?php endif; ?>
    <tr><td colspan="2">Ekspedient: <?= h($r['user']) ?></td></tr>
  </table>
  <div class="line"></div>
  <table>
    <?php foreach ($r['items'] as $i): ?>
      <tr><td colspan="2"><?= h($i['name']) ?></td></tr>
      <tr><td>&nbsp; <?= h(fmt_qty($i['qty'])) ?> x <?= $m($i['unit_price']) ?></td><td class="r"><?= $m((int)round($i['qty'] * $i['unit_price'])) ?></td></tr>
      <?php if ($i['discount']): ?><tr><td>&nbsp; Rabat</td><td class="r">-<?= $m(abs($i['discount'])) ?></td></tr><?php endif; ?>
    <?php endforeach; ?>
  </table>
  <div class="line"></div>
  <table>
    <?php if ($r['rounding']): ?><tr><td>Øreafrunding</td><td class="r"><?= $m($r['rounding']) ?></td></tr><?php endif; ?>
    <tr class="big"><td>I ALT <?= h($shop['currency']) ?></td><td class="r"><?= $m($r['total']) ?></td></tr>
    <?php if ($r['discount']): ?><tr><td class="small">Heraf rabat</td><td class="r small"><?= $m(abs($r['discount'])) ?></td></tr><?php endif; ?>
  </table>
  <table class="small" style="margin-top:4px">
    <?php foreach ($r['vat_lines'] as $v): ?>
      <tr><td>Moms <?= vat_label($v['rate']) ?> af <?= $m($v['gross'] - $v['vat']) ?></td><td class="r"><?= $m($v['vat']) ?></td></tr>
    <?php endforeach; ?>
  </table>
  <div class="line"></div>
  <table>
    <tr><td><?= h($r['payment_label']) ?></td><td class="r"><?= $m($r['payment'] === 'cash' && !$refund ? $r['given'] : $r['total']) ?></td></tr>
    <?php if ($r['payment'] === 'cash' && $r['change'] > 0): ?><tr><td>Byttepenge</td><td class="r"><?= $m($r['change']) ?></td></tr><?php endif; ?>
    <?php if ($r['card_ref']): ?><tr><td class="small" colspan="2">Ref. <?= h($r['card_ref']) ?></td></tr><?php endif; ?>
  </table>
  <div class="line"></div>
  <div class="c"><?= nl2br(h($shop['footer'])) ?></div>
  <div class="c small" style="margin-top:6px">Kontrol <?= h($r['hash']) ?></div>
</div>

<?php else: ?>
<?php if ($editable): ?><form method="post" class="custform no-print">
  <?= csrf_field() ?>
  <b>Kunde auf der Rechnung</b> <span style="color:#777">(optional – Name, Firma, Adresse, ggf. CVR)</span>
  <textarea name="customer" placeholder="Firma / Name&#10;Straße&#10;PLZ Ort&#10;CVR"><?= h($customer) ?></textarea>
  <button type="submit">Übernehmen</button>
</form><?php endif; ?>
<div class="a4">
  <header>
    <div><?php if ($logo): ?><img src="<?= h($logo) ?>" alt="<?= h($shop['name']) ?>"><?php else: ?><div class="shopname"><?= h($shop['name']) ?></div><?= h($shop['line']) ?><?php endif; ?></div>
    <div class="from">
      <b><?= h($shop['name']) ?></b><br><?= nl2br(h($shop['address'])) ?>
      <?php if ($shop['phone']): ?><br>Tlf. <?= h($shop['phone']) ?><?php endif; ?>
      <?php if ($shop['cvr']): ?><br>CVR <?= h($shop['cvr']) ?><?php endif; ?>
    </div>
  </header>
  <div class="addr">
    <div>
      <div class="sender"><?= h($shop['name']) ?> · <?= h(str_replace("\n", ' · ', $shop['address'])) ?></div>
      <div class="cust"><?= $customer !== '' ? h($customer) : '<span style="color:#aaa">Kontantkunde</span>' ?></div>
    </div>
    <table class="meta">
      <tr><td><?= $refund ? 'Kreditnota nr.' : 'Faktura nr.' ?></td><td><b><?= (int)$r['number'] ?></b></td></tr>
      <?php if ($refund && $r['ref_number']): ?><tr><td>Vedr. faktura nr.</td><td><?= (int)$r['ref_number'] ?></td></tr><?php endif; ?>
      <tr><td>Dato</td><td><?= h(date('d.m.Y', strtotime($r['created']))) ?></td></tr>
      <tr><td>Leveringsdato</td><td><?= h(date('d.m.Y', strtotime($r['created']))) ?></td></tr>
      <tr><td>Ekspedient</td><td><?= h($r['user']) ?></td></tr>
    </table>
  </div>
  <h1><?= $refund ? 'Kreditnota' : 'Faktura' ?></h1>
  <table class="items">
    <thead><tr><th>Beskrivelse</th><th class="n">Antal</th><th class="n">Stk.pris</th><th class="n">Rabat</th><th class="n">Moms</th><th class="n">Beløb</th></tr></thead>
    <tbody>
    <?php foreach ($s['items'] as $i): ?>
      <tr><td><?= h($i['name']) ?><?php if ($i['barcode']): ?><div class="sub">Varenr. <?= h($i['barcode']) ?></div><?php endif; ?></td>
        <td class="n"><?= h(fmt_qty((float)$i['qty'])) ?></td><td class="n"><?= $m((int)$i['unit_price']) ?></td>
        <td class="n"><?= $i['discount'] ? $m((int)$i['discount']) : '' ?></td><td class="n"><?= vat_label((int)$i['vat']) ?></td>
        <td class="n"><?= $m((int)$i['total']) ?></td></tr>
    <?php endforeach; ?>
    </tbody>
  </table>
  <?php $net = array_sum(array_map(fn($v) => $v['gross'] - $v['vat'], $r['vat_lines'])); ?>
  <table class="totals">
    <tr><td>Subtotal ekskl. moms</td><td><?= $m($net) ?></td></tr>
    <?php foreach ($r['vat_lines'] as $v): ?><tr><td>Moms <?= vat_label($v['rate']) ?></td><td><?= $m($v['vat']) ?></td></tr><?php endforeach; ?>
    <?php if ($r['rounding']): ?><tr><td>Øreafrunding</td><td><?= $m($r['rounding']) ?></td></tr><?php endif; ?>
    <tr class="grand"><td>I alt <?= h($shop['currency']) ?></td><td><?= $m($r['total']) ?></td></tr>
  </table>
  <div><span class="paid"><?= $refund ? 'Udbetalt' : 'Betalt' ?> <?= h(date('d.m.Y', strtotime($r['created']))) ?> · <?= h($r['payment_label']) ?></span></div>
  <footer>
    <div><?= h($shop['footer']) ?></div>
    <div style="text-align:right"><?= h(setting('invoice_note')) ?><?= setting('invoice_note') ? "\n" : '' ?>Kontrol <?= h($r['hash']) ?></div>
  </footer>
</div>
<?php endif; ?>
<?php }
