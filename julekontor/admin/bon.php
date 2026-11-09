<?php
/* Kassenbon zum Drucken (80 mm Bonrolle, passt auch auf A4). ?id=…  &auto=1 druckt sofort. */
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/shop.php';
if (!current_user() || !can('verkaeufe')) { http_response_code(403); exit('Bitte anmelden.'); }
$s = sale_full((int)($_GET['id'] ?? 0));
if (!$s) { http_response_code(404); exit('Beleg nicht gefunden.'); }
$r = receipt_data($s);
$shop = shop_header();
$m = fn(int $c) => money($c, false);
$refund = $r['type'] === 'refund';
?><!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bon <?= (int)$r['number'] ?></title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #eee; font: 12px/1.35 "Courier New", ui-monospace, monospace; color: #000; }
  .bon { width: 74mm; margin: 12px auto; background: #fff; padding: 4mm 3mm; }
  .c { text-align: center; } .r { text-align: right; } .b { font-weight: 700; }
  h1 { font: 700 18px/1.1 Georgia, serif; margin: 0; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .big td { font-size: 15px; font-weight: 700; padding-top: 3px; }
  .small { font-size: 10px; }
  .tools { text-align: center; margin: 12px; font-family: system-ui, sans-serif; }
  .tools button { font: 600 15px system-ui; padding: 10px 18px; border-radius: 999px; border: 0; background: #a3201d; color: #fff; margin: 4px; }
  @media print { body { background: #fff; } .bon { margin: 0; width: auto; padding: 0; } .tools { display: none; } }
</style>
</head>
<body>
<div class="tools"><button onclick="print()">Drucken</button><button onclick="history.length > 1 ? history.back() : close()" style="background:#666">Zurück</button></div>
<div class="bon">
  <div class="c">
    <h1><?= h($shop['name']) ?></h1>
    <?php if ($shop['line']): ?><div><?= h($shop['line']) ?></div><?php endif; ?>
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
<?php if (!empty($_GET['auto'])): ?><script>addEventListener('load', () => setTimeout(() => print(), 250));</script><?php endif; ?>
</body>
</html>
