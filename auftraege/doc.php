<?php
declare(strict_types=1);
// Druckansicht A4 einer Rechnung/Kreditnota in der Sprache des Kunden. Drucken -> "Als PDF speichern".
require __DIR__ . '/inc/bootstrap.php';
require_once __DIR__ . '/inc/invoice.php';
require_once __DIR__ . '/inc/doctext.php';
wf_require_user(false);
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'unsafe-inline'");

$db = wf_db();
$i = wf_inv_load($db, (int)($_GET['id'] ?? 0));
if (!$i) {
    http_response_code(404);
    exit('not found');
}
$draft = $i['status'] !== 'final';
if ($draft) {
    // Entwurf: aktuelle Kunden- und Firmendaten und frisch gerechnete Beträge zeigen
    $c = $db->prepare('SELECT * FROM customers WHERE id = ?');
    $c->execute([$i['customer_id']]);
    $cust = $c->fetch() ?: [];
    $i['customer_snap'] = $i['type'] === 'credit' && $i['credit_of'] ? (wf_inv_load($db, (int)$i['credit_of'])['customer_snap'] ?? []) : wf_customer_snap($cust);
    $i['seller_snap'] = wf_company();
    $calc = wf_inv_calc($i['lines'], $i['vat_scheme'], (bool)$i['prices_incl'], $i['rate']);
    foreach ($i['lines'] as $k => $l) {
        $i['lines'][$k]['amount'] = $calc['amounts'][$k];
    }
    foreach (['net', 'vat', 'total', 'vat_dkk'] as $k) {
        $i[$k] = $calc[$k];
    }
}
$lang = in_array($_GET['lang'] ?? '', WF_DOC_LANGS, true) ? $_GET['lang'] : $i['lang'];
$T = wf_doc_text($lang);
$S = $i['seller_snap'];
$C = $i['customer_snap'];
$cur = $i['currency'];
$isCredit = $i['type'] === 'credit';
$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$tr = fn(string $k, array $r = []) => strtr($T[$k], $r);
$m = fn(int $c) => wf_doc_money($c, $cur, $lang);
$orig = $isCredit && $i['credit_of'] ? wf_inv_load($db, (int)$i['credit_of']) : null;
$hasDisc = (bool)array_filter($i['lines'], fn($l) => (float)$l['discount'] != 0);
$kinds = array_unique(array_column($i['lines'], 'kind'));
$numTxt = $draft ? '—' : (string)$i['number'];
$title = ($isCredit ? $T['credit'] : $T['invoice']) . ($draft ? '' : ' ' . $i['number']);
$fname = ($isCredit ? 'Kreditnota' : 'Faktura') . '-' . ($draft ? 'kladde' : $i['number']);
?><!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title><?= $e($fname) ?></title>
<style>
@font-face{font-family:Outfit;font-weight:400;src:url(assets/fonts/outfit-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:Outfit;font-weight:600;src:url(assets/fonts/outfit-latin-600-normal.woff2) format("woff2")}
@font-face{font-family:Outfit;font-weight:700;src:url(assets/fonts/outfit-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Cormorant Garamond";font-weight:600;src:url(assets/fonts/cormorant-garamond-latin-600-normal.woff2) format("woff2")}
@page{size:A4;margin:14mm 16mm 16mm}
*{box-sizing:border-box}
body{margin:0;background:#e9e6ef;font:10pt/1.45 Outfit,Arial,sans-serif;color:#1b1622}
.bar{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#1b1622}
.bar button,.bar a{font:inherit;font-size:11pt;padding:8px 16px;border-radius:10px;border:1px solid #8B2BE2;background:#8B2BE2;color:#fff;text-decoration:none;cursor:pointer}
.bar a{background:transparent}
.page{width:210mm;min-height:297mm;margin:16px auto;background:#fff;padding:14mm 16mm 16mm;position:relative;box-shadow:0 6px 30px rgba(0,0,0,.18)}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm}
.logo{height:20mm;width:auto}
.seller{text-align:right;font-size:8.5pt;color:#4a4256;line-height:1.5}
.seller b{color:#1b1622;font-size:10pt}
h1{font-family:"Cormorant Garamond",Georgia,serif;font-size:26pt;font-weight:600;margin:12mm 0 2mm;color:#6d1fc0;letter-spacing:.02em}
.ref{color:#4a4256;margin-bottom:4mm}
.addr{display:flex;justify-content:space-between;gap:10mm;margin-top:6mm}
.cust{white-space:pre-line;min-height:24mm}
.cust b{white-space:normal}
table.meta td{padding:1px 0 1px 6mm}table.meta td:first-child{color:#6b6479;padding-left:0}
table.items{width:100%;border-collapse:collapse;margin-top:9mm}
.items th{text-align:left;font-weight:600;font-size:8.5pt;text-transform:uppercase;letter-spacing:.06em;color:#6b6479;border-bottom:1.5px solid #8B2BE2;padding:2mm 1.5mm}
.items td{padding:2.2mm 1.5mm;border-bottom:1px solid #eee8f5;vertical-align:top}
.items .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.sum{margin-left:auto;margin-top:5mm;min-width:80mm;border-collapse:collapse}
.sum td{padding:1.2mm 1.5mm}.sum td.n{text-align:right;font-variant-numeric:tabular-nums}
.sum tr.g td{border-top:1.5px solid #1b1622;font-weight:700;font-size:11.5pt;padding-top:2mm}
.legal{margin-top:6mm;padding:3mm 4mm;border-left:3px solid #8B2BE2;background:#f6f1fc;font-size:9pt}
.note{margin-top:5mm;white-space:pre-line}
.pay{margin-top:7mm;font-size:9pt}
.pay h3{font-size:9pt;text-transform:uppercase;letter-spacing:.08em;color:#6b6479;margin:0 0 1.5mm}
.pay table td{padding:.4mm 6mm .4mm 0}
.thanks{margin-top:7mm;font-family:"Cormorant Garamond",Georgia,serif;font-size:14pt;color:#6d1fc0}
.foot{position:absolute;left:16mm;right:16mm;bottom:9mm;border-top:1px solid #e3d9f2;padding-top:2mm;font-size:7.5pt;color:#6b6479;text-align:center}
.wm{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;font-size:40pt;font-weight:700;color:rgba(248,113,113,.18);transform:rotate(-24deg);text-align:center}
@media print{body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none;width:auto;min-height:0;padding:0}.foot{position:fixed;left:0;right:0;bottom:0}}
@media(max-width:820px){.page{width:auto;min-height:0;margin:0;padding:6mm}.foot{position:static;margin-top:8mm}.addr,.top{flex-direction:column}.seller{text-align:left}}
</style>
</head>
<body>
<div class="bar"><button onclick="print()">🖨 PDF / Drucken</button><?php foreach (WF_DOC_LANGS as $l): if ($l !== $lang): ?><a href="?id=<?= (int)$i['id'] ?>&amp;lang=<?= $l ?>"><?= strtoupper($l) ?></a><?php endif; endforeach; ?></div>
<div class="page">
<?php if ($draft): ?><div class="wm"><?= $e($T['draft']) ?></div><?php endif; ?>
  <div class="top">
    <img class="logo" src="assets/logo-bg.png" alt="">
    <div class="seller">
      <b><?= $e($S['name'] ?? '') ?></b><br>
      <?php if (!empty($S['owner'])): ?><?= $e($S['owner']) ?><br><?php endif; ?>
      <?= $e($S['street'] ?? '') ?><br><?= $e(trim(($S['zip'] ?? '') . ' ' . ($S['city'] ?? ''))) ?><br><?= $e(wf_country_name($S['country'] ?? 'DK', $lang)) ?><br>
      <?= $e($T['cvr']) ?>: <?= $e($S['cvr'] ?? '') ?><br>
      <?php if ($T['own_vat'] !== '' && !empty($S['moms_registered'])): ?><?= $e($T['own_vat']) ?>: DK<?= $e($S['cvr'] ?? '') ?><br><?php endif; ?>
      <?php if (!empty($S['phone'])): ?><?= $e($S['phone']) ?><br><?php endif; ?>
      <?php if (!empty($S['email'])): ?><?= $e($S['email']) ?><br><?php endif; ?>
      <?php if (!empty($S['web'])): ?><?= $e($S['web']) ?><?php endif; ?>
    </div>
  </div>
  <h1><?= $e($isCredit ? $T['credit'] : $T['invoice']) ?></h1>
  <?php if ($orig): ?><div class="ref"><?= $e($tr('refers', ['{n}' => $orig['number'], '{d}' => wf_doc_date($orig['issue_date'], $lang)])) ?></div><?php endif; ?>
  <div class="addr">
    <div class="cust"><?php
      $lines = array_filter([(string)($C['company'] ?? ''), (string)($C['name'] ?? '')]);
      if (($C['company'] ?? '') !== '' && ($C['name'] ?? '') === ($C['company'] ?? '')) {
          $lines = [$C['company']];
      }
      echo '<b>' . $e(array_shift($lines) ?? '') . '</b>';
      foreach ($lines as $ln) {
          echo "\n" . $e($ln);
      }
      if (trim((string)($C['address'] ?? '')) !== '') {
          echo "\n" . $e(str_replace(', ', "\n", trim((string)$C['address'])));
      }
      if (($C['country'] ?? 'DK') !== ($S['country'] ?? 'DK')) {
          echo "\n" . $e(wf_country_name($C['country'], $lang));
      }
      if (trim((string)($C['vat_id'] ?? '')) !== '') {
          $isDk = ($C['country'] ?? '') === 'DK';
          echo "\n" . $e(($isDk ? $T['cust_cvr'] : $T['vat_id']) . ': ' . ($isDk ? preg_replace('/^DK/', '', $C['vat_id']) : $C['vat_id']));
      }
    ?></div>
    <table class="meta">
      <tr><td><?= $e($isCredit ? $T['credit_number'] : $T['number']) ?></td><td><b><?= $e($numTxt) ?></b></td></tr>
      <tr><td><?= $e($isCredit ? $T['credit_date'] : $T['date']) ?></td><td><?= $e(wf_doc_date($i['issue_date'], $lang)) ?></td></tr>
      <?php if ($i['delivery_date'] && $i['delivery_date'] !== $i['issue_date']): ?><tr><td><?= $e($T['delivery']) ?></td><td><?= $e(wf_doc_date($i['delivery_date'], $lang)) ?></td></tr><?php endif; ?>
      <?php if (!$isCredit): ?><tr><td><?= $e($T['due']) ?></td><td><?= $e(wf_doc_date($i['due_date'], $lang)) ?></td></tr><?php endif; ?>
      <tr><td><?= $e($T['customer_no']) ?></td><td><?= (int)$i['customer_id'] ?></td></tr>
    </table>
  </div>
  <table class="items">
    <tr><th><?= $e($T['desc']) ?></th><th class="n"><?= $e($T['qty']) ?></th><th><?= $e($T['unit']) ?></th><th class="n"><?= $e($T['price']) ?></th><?php if ($hasDisc): ?><th class="n"><?= $e($T['disc']) ?></th><?php endif; ?><th class="n"><?= $e($T['amount']) ?></th></tr>
    <?php foreach ($i['lines'] as $l): ?>
    <tr><td><?= nl2br($e($l['description'])) ?></td><td class="n"><?= $e(wf_doc_num((float)$l['qty'], $lang)) ?></td><td><?= $e($T['units'][$l['unit']] ?? $l['unit']) ?></td>
      <td class="n"><?= $e(wf_doc_money((int)$l['unit_price'], '', $lang)) ?></td><?php if ($hasDisc): ?><td class="n"><?= (float)$l['discount'] ? $e(wf_doc_num((float)$l['discount'], $lang)) . ' %' : '' ?></td><?php endif; ?>
      <td class="n"><?= $e(wf_doc_money((int)$l['amount'], '', $lang)) ?></td></tr>
    <?php endforeach; ?>
  </table>
  <table class="sum">
    <tr><td><?= $e($T['net']) ?></td><td class="n"><?= $e($m((int)$i['net'])) ?></td></tr>
    <?php $p = wf_scheme_rate($i['vat_scheme']); ?>
    <tr><td><?= $e($p ? $tr('vat', ['{p}' => $p]) : $T['vat0']) ?></td><td class="n"><?= $e($m((int)$i['vat'])) ?></td></tr>
    <tr class="g"><td><?= $e($isCredit ? $T['total_credit'] : $T['total']) ?></td><td class="n"><?= $e($m((int)$i['total'])) ?></td></tr>
  </table>
  <?php
  $legal = [];
  if ($i['prices_incl'] && $p) {
      $legal[] = $T['incl_note'];
  }
  if ($i['vat_scheme'] === 'eu_rc') {
      if (in_array('services', $kinds, true)) {
          $legal[] = $T['rc_services'];
      }
      if (in_array('goods', $kinds, true)) {
          $legal[] = $T['rc_goods'];
      }
  } elseif ($i['vat_scheme'] === 'export') {
      $legal[] = $T['export'];
  } elseif ($i['vat_scheme'] === 'novat') {
      $legal[] = $T['novat'];
  }
  if ($cur !== 'DKK' && $p) {
      $legal[] = $tr('vat_dkk', ['{v}' => wf_doc_money((int)$i['vat_dkk'], 'DKK', $lang), '{r}' => str_replace('.', $lang === 'en' ? '.' : ',', $i['rate']),
          '{d}' => wf_doc_date($i['rate_date'], $lang), '{s}' => $i['rate_source'] ?: '—']);
  }
  if ($legal): ?><div class="legal"><?= implode('<br>', array_map($e, $legal)) ?></div><?php endif; ?>
  <?php if (trim($i['note']) !== ''): ?><div class="note"><?= $e($i['note']) ?></div><?php endif; ?>
  <?php if ($isCredit): ?><div class="pay"><?= $e($T['credit_text']) ?></div>
  <?php else: ?>
  <div class="pay"><h3><?= $e($T['pay_title']) ?></h3>
    <p style="margin:0 0 2mm"><?= $e($tr('pay_text', ['{d}' => wf_doc_date($i['due_date'], $lang), '{n}' => $numTxt])) ?></p>
    <table>
      <?php if (!empty($S['bank'])): ?><tr><td><?= $e($T['bank']) ?></td><td><?= $e($S['bank']) ?></td></tr><?php endif; ?>
      <?php if (!empty($S['reg_no'])): ?><tr><td><?= $e($T['reg']) ?></td><td><?= $e($S['reg_no']) ?> &nbsp; <?= $e($T['acc']) ?> <?= $e($S['account_no']) ?></td></tr><?php endif; ?>
      <?php if (!empty($S['iban'])): ?><tr><td><?= $e($T['iban']) ?></td><td><?= $e(trim(chunk_split(preg_replace('/\s+/', '', $S['iban']), 4, ' '))) ?></td></tr><?php endif; ?>
      <?php if (!empty($S['bic'])): ?><tr><td><?= $e($T['bic']) ?></td><td><?= $e($S['bic']) ?></td></tr><?php endif; ?>
    </table>
  </div>
  <div class="thanks"><?= $e($T['thanks']) ?></div>
  <?php endif; ?>
  <div class="foot"><?= $e(implode(' · ', array_filter([$S['name'] ?? '', trim(($S['street'] ?? '') . ', ' . ($S['zip'] ?? '') . ' ' . ($S['city'] ?? ''), ', '), 'CVR ' . ($S['cvr'] ?? ''), $S['email'] ?? '', $S['web'] ?? '']))) ?></div>
</div>
</body>
</html>
