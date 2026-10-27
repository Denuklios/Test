<?php
declare(strict_types=1);
require_once __DIR__ . '/invoice.php';
require_once __DIR__ . '/doctext.php';

/** HTML einer Rechnung/Kreditnota (A4). $embed = eigenständige Datei (Logo eingebettet, ohne Bedienleiste) z. B. fürs Revisor-Paket. */
function wf_doc_html(PDO $db, array $i, ?string $lang = null, bool $embed = false, ?string $design = null): string
{
    ob_start();
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
    $lang = in_array($lang ?? '', WF_DOC_LANGS, true) ? $lang : $i['lang'];
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
    // Rabatt gesamt: Prozent-Rabatte der Zeilen + eigene Rabattzeilen (Minusbetrag, Text beginnt mit Rabatt/Rabat/Discount)
    $lineOff = fn($l) => (float)$l['discount'] != 0 ? (int)round((float)$l['qty'] * (int)$l['unit_price']) - (int)$l['amount'] : 0;
    $discTotal = array_sum(array_map(fn($l) => $lineOff($l) + ((int)$l['amount'] < 0 && preg_match('/^(Rabatt?|Discount)\b/iu', (string)$l['description']) ? -(int)$l['amount'] : 0), $i['lines']));
    $kinds = array_unique(array_column($i['lines'], 'kind'));
    $numTxt = $draft ? '—' : (string)$i['number'];
    $title = ($isCredit ? $T['credit'] : $T['invoice']) . ($draft ? '' : ' ' . $i['number']);
    $fname = ($isCredit ? 'Kreditnota' : 'Faktura') . '-' . ($draft ? 'kladde' : $i['number']);
    $p = wf_scheme_rate($i['vat_scheme']);
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
    // Gestaltung: 'band' (dunkles Kopfband, Standard) oder 'side' (dunkle Seitenleiste)
    $design = in_array($design ?? '', ['band', 'side'], true) ? $design : ((string)(wf_company()['doc_design'] ?? 'band') === 'side' ? 'side' : 'band');   // aktuelle Einstellung, nicht der eingefrorene Stand
    $logoSrc = $embed ? 'data:image/png;base64,' . base64_encode((string)file_get_contents(__DIR__ . '/../assets/logo-bg.png')) : 'assets/logo-bg.png';
    if ($design === 'side') {
        require __DIR__ . '/doc_side.php';
        return (string)ob_get_clean();
    }
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
@font-face{font-family:"Cormorant Garamond";font-weight:700;src:url(assets/fonts/cormorant-garamond-latin-700-normal.woff2) format("woff2")}
@page{size:A4;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
:root{--ink:#1b1622;--p1:#8B2BE2;--p2:#A855F7;--soft:#f5f0fc;--line:#e6dcf3;--muted:#6b6479}
body{margin:0;background:#e9e6ef;font:9.6pt/1.5 Outfit,Arial,sans-serif;color:var(--ink)}
.bar{position:sticky;top:0;z-index:5;display:flex;gap:8px;justify-content:center;padding:10px;background:var(--ink)}
.bar button,.bar a{font:inherit;font-size:11pt;padding:8px 16px;border-radius:10px;border:1px solid var(--p1);background:var(--p1);color:#fff;text-decoration:none;cursor:pointer}
.bar a{background:transparent}
.page{width:210mm;min-height:297mm;margin:16px auto;background:#fff;position:relative;box-shadow:0 6px 30px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden}
/* Kopfband */
.hero{position:relative;background:var(--ink);color:#fff;padding:12mm 16mm 10mm;display:flex;justify-content:space-between;gap:10mm;overflow:hidden}
.hero::before{content:"";position:absolute;right:-30mm;top:-40mm;width:120mm;height:120mm;border-radius:50%;background:radial-gradient(circle,rgba(168,85,247,.55),rgba(139,43,226,0) 70%)}
.hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2.2mm;background:linear-gradient(90deg,var(--p1),var(--p2),#d8b4fe)}
.brand{position:relative;display:flex;flex-direction:column;gap:5mm}
.logo{height:17mm;width:auto;max-width:70mm;align-self:flex-start;object-fit:contain;filter:drop-shadow(0 0 .8mm #fff) drop-shadow(0 0 3mm rgba(255,255,255,.7)) drop-shadow(0 0 7mm rgba(233,213,255,.55))}
.doctype{font-family:"Cormorant Garamond",Georgia,serif;font-weight:700;font-size:38pt;line-height:.9;letter-spacing:.01em}
.doctype em{display:block;font-family:Outfit,Arial,sans-serif;font-style:normal;font-weight:600;font-size:11pt;letter-spacing:.28em;text-transform:uppercase;color:#d8b4fe;margin-top:3mm}
.seller{position:relative;text-align:right;font-size:8.2pt;line-height:1.55;color:#d9d2e6;align-self:flex-end}
.seller b{display:block;color:#fff;font-size:11pt;letter-spacing:.06em;margin-bottom:1mm}
/* Inhalt */
.body{padding:9mm 16mm 0;flex:1;position:relative}
.ref{color:var(--muted);margin:-3mm 0 5mm}
.top2{display:grid;grid-template-columns:1.1fr 1fr;gap:8mm;align-items:start}
.lbl{font-size:7.2pt;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--p1);margin-bottom:1.6mm}
.cust{white-space:pre-line;font-size:10pt;line-height:1.45}
.cust b{white-space:normal;font-size:11.5pt}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm}
.tile{background:var(--soft);border-radius:3mm;padding:2.6mm 3.4mm;border:1px solid var(--line)}
.tile span{display:block;font-size:6.8pt;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.tile b{font-size:11pt}
.tile.main{background:linear-gradient(135deg,var(--p1),var(--p2));border-color:transparent;color:#fff}.tile.main span{color:#efe3ff}
.stitch{height:0;border-top:1.4px dashed var(--p2);margin:7mm 0 0;opacity:.7}
table.items{width:100%;border-collapse:separate;border-spacing:0;margin-top:6mm}
.items th{text-align:left;font-weight:600;font-size:7.2pt;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);padding:0 2mm 2.4mm;border-bottom:1.5px solid var(--ink)}
.items td{padding:3mm 2mm;vertical-align:top;border-bottom:1px solid var(--line)}
.items tr:nth-child(even) td{background:#fbf8fe}
.items .no{width:9mm;font-family:"Cormorant Garamond",Georgia,serif;font-weight:700;font-size:13pt;color:var(--p2);line-height:1.1}
.items .d{font-weight:600}
.items .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.items td.amt{font-weight:600}
.after{display:grid;grid-template-columns:1fr 78mm;gap:8mm;margin-top:6mm;align-items:start}
.sum{width:100%;border-collapse:collapse}
.sum td{padding:1.4mm 2mm}.sum td.n{text-align:right;font-variant-numeric:tabular-nums}.sum tr.dtot td{color:#15803d;font-weight:600}.doff{color:#15803d;font-size:.82em}
.grand{margin-top:2mm;border-radius:3.5mm;padding:4mm 4.5mm;background:var(--ink);color:#fff;display:flex;justify-content:space-between;align-items:baseline;position:relative;overflow:hidden}
.grand::after{content:"";position:absolute;inset:auto 0 0 0;height:1.4mm;background:linear-gradient(90deg,var(--p1),var(--p2))}
.grand span{font-size:7.6pt;letter-spacing:.18em;text-transform:uppercase;color:#d8b4fe}
.grand b{font-size:16pt;font-variant-numeric:tabular-nums}
.legal{padding:3mm 4mm;border-radius:3mm;background:var(--soft);border:1px dashed var(--p2);font-size:8.6pt}
.note{white-space:pre-line;font-style:italic;color:#3d3549;margin-bottom:3mm}
.pay{margin-top:8mm;display:grid;grid-template-columns:1fr 1fr;gap:6mm;padding:5mm;border-radius:4mm;border:1.4px dashed var(--p2);position:relative}
.pay .lbl{grid-column:1/-1;margin:0}
.pay p{margin:0;grid-column:1/-1}
.pay table td{padding:.5mm 5mm .5mm 0}.pay table td:first-child{color:var(--muted)}
.thanks{margin:9mm 0 6mm;text-align:center;font-family:"Cormorant Garamond",Georgia,serif;font-style:italic;font-weight:600;font-size:20pt;color:var(--p1)}
.thanks::before,.thanks::after{content:"✦";font-style:normal;font-size:10pt;color:var(--p2);margin:0 4mm;vertical-align:middle}
.foot{margin-top:auto;background:var(--ink);color:#bfb6cf;font-size:7.4pt;text-align:center;padding:4mm 16mm;letter-spacing:.04em}
.foot b{color:#fff;letter-spacing:.2em}
.wm{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;font-size:46pt;font-weight:700;color:rgba(248,113,113,.18);transform:rotate(-24deg);text-align:center;z-index:3}
@media print{body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none;width:210mm;min-height:297mm}}
@media screen and (max-width:820px){.page{width:auto;min-height:0;margin:0}.hero{flex-direction:column;padding:8mm 6mm}.seller{text-align:left;align-self:flex-start}.body{padding:6mm}.top2,.after,.pay{grid-template-columns:1fr}.foot{padding:4mm 6mm}}
</style>
</head>
<body>
<?php if (!$embed): ?><div class="bar"><button onclick="print()">🖨 PDF / Drucken</button><?php foreach (WF_DOC_LANGS as $l): if ($l !== $lang): ?><a href="?id=<?= (int)$i['id'] ?>&amp;lang=<?= $l ?>"><?= strtoupper($l) ?></a><?php endif; endforeach; ?></div><?php endif; ?>
<div class="page">
<?php if ($draft): ?><div class="wm"><?= $e($T['draft']) ?></div><?php endif; ?>
  <header class="hero">
    <div class="brand">
      <img class="logo" src="<?= $embed ? 'data:image/png;base64,' . base64_encode((string)file_get_contents(__DIR__ . '/../assets/logo-bg.png')) : 'assets/logo-bg.png' ?>" alt="">
      <div class="doctype"><?= $e($isCredit ? $T['credit'] : $T['invoice']) ?><em><?= $draft ? $e($T['draft']) : 'Nº ' . $e($numTxt) ?></em></div>
    </div>
    <div class="seller">
      <b><?= $e(mb_strtoupper((string)($S['name'] ?? ''))) ?></b>
      <?php if (!empty($S['owner'])): ?><?= $e($S['owner']) ?><br><?php endif; ?>
      <?= $e($S['street'] ?? '') ?> · <?= $e(trim(($S['zip'] ?? '') . ' ' . ($S['city'] ?? ''))) ?> · <?= $e(wf_country_name($S['country'] ?? 'DK', $lang)) ?><br>
      <?= $e($T['cvr']) ?>: <?= $e($S['cvr'] ?? '') ?><?php if ($T['own_vat'] !== '' && !empty($S['moms_registered'])): ?> · <?= $e($T['own_vat']) ?>: DK<?= $e($S['cvr'] ?? '') ?><?php endif; ?><br>
      <?= $e(implode(' · ', array_filter([$S['phone'] ?? '', $S['email'] ?? '']))) ?><?php if (!empty($S['web'])): ?><br><?= $e($S['web']) ?><?php endif; ?>
    </div>
  </header>
  <div class="body">
  <?php if ($orig): ?><div class="ref"><?= $e($tr('refers', ['{n}' => $orig['number'], '{d}' => wf_doc_date($orig['issue_date'], $lang)])) ?></div><?php endif; ?>
  <div class="top2">
    <div><div class="lbl"><?= $e($T['to'] ?? '') ?></div><div class="cust"><?php
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
    ?></div></div>
    <div class="tiles">
      <div class="tile main"><span><?= $e($isCredit ? $T['credit_number'] : $T['number']) ?></span><b><?= $e($numTxt) ?></b></div>
      <div class="tile"><span><?= $e($isCredit ? $T['credit_date'] : $T['date']) ?></span><b><?= $e(wf_doc_date($i['issue_date'], $lang)) ?></b></div>
      <?php if (!$isCredit): ?><div class="tile"><span><?= $e($T['due']) ?></span><b><?= $e(wf_doc_date($i['due_date'], $lang)) ?></b></div><?php endif; ?>
      <div class="tile"><span><?= $e($T['customer_no']) ?></span><b><?= (int)$i['customer_id'] ?></b></div>
      <?php if ($i['delivery_date'] && $i['delivery_date'] !== $i['issue_date']): ?><div class="tile"><span><?= $e($T['delivery']) ?></span><b><?= $e(wf_doc_date($i['delivery_date'], $lang)) ?></b></div><?php endif; ?>
    </div>
  </div>
  <div class="stitch"></div>
  <table class="items">
    <tr><th></th><th><?= $e($T['desc']) ?></th><th class="n"><?= $e($T['qty']) ?></th><th><?= $e($T['unit']) ?></th><th class="n"><?= $e($T['price']) ?></th><?php if ($hasDisc): ?><th class="n"><?= $e($T['disc']) ?></th><?php endif; ?><th class="n"><?= $e($T['amount']) ?></th></tr>
    <?php foreach (array_values($i['lines']) as $k => $l): ?>
    <tr><td class="no"><?= sprintf('%02d', $k + 1) ?></td><td class="d"><?= nl2br($e($l['description'])) ?></td><td class="n"><?= $e(wf_doc_num((float)$l['qty'], $lang)) ?></td><td><?= $e($T['units'][$l['unit']] ?? $l['unit']) ?></td>
      <td class="n"><?= $e(wf_doc_money((int)$l['unit_price'], '', $lang)) ?></td><?php if ($hasDisc): ?><td class="n"><?php if ((float)$l['discount']): ?><?= $e(wf_doc_num((float)$l['discount'], $lang)) ?> %<br><small class="doff">−<?= $e(wf_doc_money($lineOff($l), '', $lang)) ?></small><?php endif; ?></td><?php endif; ?>
      <td class="n amt"><?= $e(wf_doc_money((int)$l['amount'], '', $lang)) ?></td></tr>
    <?php endforeach; ?>
  </table>
  <div class="after">
    <div>
  <?php
  if (trim($i['note']) !== ''): ?><div class="note"><?= $e($i['note']) ?></div><?php endif; ?>
  <?php if ($legal): ?><div class="legal"><?= implode('<br>', array_map($e, $legal)) ?></div><?php endif; ?>
    </div>
    <div>
      <table class="sum">
        <?php if ($discTotal > 0): ?><tr class="dtot"><td><?= $e($T['disc_total']) ?></td><td class="n">−<?= $e($m($discTotal)) ?></td></tr><?php endif; ?>
        <tr><td><?= $e($T['net']) ?></td><td class="n"><?= $e($m((int)$i['net'])) ?></td></tr>
        <tr><td><?= $e($p ? $tr('vat', ['{p}' => $p]) : $T['vat0']) ?></td><td class="n"><?= $e($m((int)$i['vat'])) ?></td></tr>
      </table>
      <div class="grand"><span><?= $e($isCredit ? $T['total_credit'] : $T['total']) ?></span><b><?= $e($m((int)$i['total'])) ?></b></div>
    </div>
  </div>
  <?php if ($isCredit): ?><div class="pay"><p><?= $e($T['credit_text']) ?></p></div>
  <?php else: ?>
  <div class="pay"><div class="lbl"><?= $e($T['pay_title']) ?></div>
    <p><?= $e($tr('pay_text', ['{d}' => wf_doc_date($i['due_date'], $lang), '{n}' => $numTxt])) ?></p>
    <table>
      <?php if (!empty($S['bank'])): ?><tr><td><?= $e($T['bank']) ?></td><td><?= $e($S['bank']) ?></td></tr><?php endif; ?>
      <?php if (!empty($S['reg_no'])): ?><tr><td><?= $e($T['reg']) ?></td><td><?= $e($S['reg_no']) ?> &nbsp; <?= $e($T['acc']) ?> <?= $e($S['account_no']) ?></td></tr><?php endif; ?>
    </table>
    <table>
      <?php if (!empty($S['iban'])): ?><tr><td><?= $e($T['iban']) ?></td><td><b><?= $e(trim(chunk_split(preg_replace('/\s+/', '', $S['iban']), 4, ' '))) ?></b></td></tr><?php endif; ?>
      <?php if (!empty($S['bic'])): ?><tr><td><?= $e($T['bic']) ?></td><td><?= $e($S['bic']) ?></td></tr><?php endif; ?>
    </table>
  </div>
  <div class="thanks"><?= $e($T['thanks']) ?></div>
  <?php endif; ?>
  </div>
  <footer class="foot"><b><?= $e(mb_strtoupper((string)($S['name'] ?? ''))) ?></b> &nbsp;·&nbsp; <?= $e(implode(' · ', array_filter([trim(($S['street'] ?? '') . ', ' . ($S['zip'] ?? '') . ' ' . ($S['city'] ?? ''), ', '), 'CVR ' . ($S['cvr'] ?? ''), $S['email'] ?? '', $S['web'] ?? '']))) ?></footer>
</div>
</body>
</html>
<?php
    return (string)ob_get_clean();
}
