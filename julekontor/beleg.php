<?php
/* Digitaler Kassenbeleg für Kunden – erreichbar über den QR-Code an der Kasse.
   ?t=<geheimer Schlüssel>  &fmt=a4 für die Rechnung im A4-Format. Keine Anmeldung nötig. */
declare(strict_types=1);
define('JK_NO_SESSION', true);
require __DIR__ . '/admin/inc/bootstrap.php';
require __DIR__ . '/admin/inc/shop.php';
require __DIR__ . '/admin/inc/receipt.php';
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

$t = (string)($_GET['t'] ?? '');
$s = null;
if (preg_match('/^[0-9a-f]{32}$/', $t)) {
    $st = db()->prepare('SELECT id FROM sales WHERE receipt_token = ?');
    $st->execute([$t]);
    if ($id = $st->fetchColumn()) $s = sale_full((int)$id);
}
if (!$s) {
    http_response_code(404);
    exit('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><p style="font:16px system-ui;padding:24px">Dieser Beleg wurde nicht gefunden. / Kvitteringen blev ikke fundet.</p>');
}
$fmt = ($_GET['fmt'] ?? '') === 'a4' ? 'a4' : 'bon';
$v = receipt_render_vars($s, $fmt);
$logo = is_file(__DIR__ . '/logo/julekontor-logo.png') ? 'logo/julekontor-logo.png' : '';
$link = fn(string $f) => 'beleg.php?t=' . $t . ($f === 'a4' ? '&fmt=a4' : '');
?><!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#a3201d">
<title>Kvittering <?= (int)$v['r']['number'] ?> · <?= h($v['shop']['name']) ?></title>
<style>
<?php receipt_css($fmt, $v['width']); ?>
  .hello { max-width: 420px; margin: 14px auto 6px; padding: 0 14px; text-align: center; font: 15px/1.45 system-ui, sans-serif; color: #3a1d17; }
  .hello b { font: italic 700 22px Georgia, serif; color: #a3201d; display: block; }
  @media screen and (max-width: 520px) {
    .bon { width: auto; margin: 0 12px 20px; font-size: 13px; }
    .a4 { width: auto; min-height: 0; padding: 18px 14px; }
    .a4 header img { height: 90px; } .a4 .addr { flex-direction: column; align-items: flex-start; }
    .a4 table.items th:nth-child(4), .a4 table.items td:nth-child(4), .a4 table.items th:nth-child(5), .a4 table.items td:nth-child(5) { display: none; }
  }
</style>
</head>
<body>
<div class="hello no-print"><b>Tak for dit køb!</b>Din kvittering · Deine Quittung · Your receipt</div>
<div class="tools">
  <button class="main" onclick="print()">⬇ Gem som PDF / Udskriv</button>
  <a href="<?= h($link('bon')) ?>" class="<?= $fmt === 'bon' ? 'on' : '' ?>">🧾 Kvittering</a>
  <a href="<?= h($link('a4')) ?>" class="<?= $fmt === 'a4' ? 'on' : '' ?>">📄 Faktura (A4)</a>
</div>
<?php receipt_body($v, $logo, false); ?>
</body>
</html>
