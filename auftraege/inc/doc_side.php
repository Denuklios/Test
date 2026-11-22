<?php
// Rechnung/Kreditnota im Seitenleisten-Design (dunkle Leiste links, Inhalt auf Weiß). Wird aus wf_doc_html() eingebunden
// und nutzt deren Variablen ($i, $S, $C, $T, $e, $tr, $m, $p, $legal, $logoSrc, $draft, $isCredit, $numTxt, $hasDisc, $lineOff, $discTotal, $orig, $lang, $cur, $embed).
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
:root{--ink:#1b1622;--side:#211b2b;--p1:#8B2BE2;--p2:#A855F7;--p3:#c9a0ff;--line:#e6dcf3;--muted:#6b6479}
body{margin:0;background:#e9e6ef;font:9.6pt/1.5 Outfit,Arial,sans-serif;color:var(--ink)}
.bar{position:sticky;top:0;z-index:5;display:flex;gap:8px;justify-content:center;padding:10px;background:var(--ink)}
.bar button,.bar a{font:inherit;font-size:11pt;padding:8px 16px;border-radius:10px;border:1px solid var(--p1);background:var(--p1);color:#fff;text-decoration:none;cursor:pointer}
.bar a{background:transparent}
.page{width:210mm;min-height:297mm;margin:16px auto;background:#fff;display:grid;grid-template-columns:64mm 1fr;box-shadow:0 6px 30px rgba(0,0,0,.18);position:relative;overflow:hidden}
/* Seitenleiste */
.side{background:var(--side);color:#d9d2e6;padding:12mm 7mm 10mm 9mm;position:relative;overflow:hidden;font-size:8.6pt;line-height:1.55}
.side::before{content:"";position:absolute;left:-30mm;top:-30mm;width:90mm;height:90mm;border-radius:50%;background:radial-gradient(circle,rgba(168,85,247,.35),rgba(139,43,226,0) 70%)}
.side>*{position:relative}
.logowrap{position:relative;margin:-4mm -4mm 6mm;padding:4mm;background:radial-gradient(closest-side,rgba(255,255,255,.28),rgba(255,255,255,.08) 60%,rgba(255,255,255,0))}
.logowrap .logo{margin:0}
.logo{display:block;height:15mm;width:auto;max-width:46mm;object-fit:contain;margin-bottom:10mm;filter:drop-shadow(0 0 .8mm #fff) drop-shadow(0 0 3mm rgba(255,255,255,.7)) drop-shadow(0 0 7mm rgba(233,213,255,.55))}
.sec{padding:0 0 5mm;margin:0 0 5mm;border-bottom:1px solid rgba(201,160,255,.18)}
.sec:last-child{border-bottom:0}
.sec h4{margin:0 0 2mm;font-size:7.4pt;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--p3)}
.sec b{color:#fff;font-weight:600}
.kv{display:grid;grid-template-columns:auto 1fr;gap:.6mm 3mm}.kv span{color:#a99fbb}.kv b{text-align:right;font-variant-numeric:tabular-nums}
.cust{white-space:pre-line}.cust b{white-space:normal;font-size:10pt}
.iban{color:#fff;font-weight:600;letter-spacing:.03em;word-break:break-word}
/* Inhalt */
.main{padding:13mm 13mm 10mm 11mm;display:flex;flex-direction:column;position:relative}
h1{margin:0;font-family:"Cormorant Garamond",Georgia,serif;font-weight:700;font-size:40pt;line-height:.95;color:var(--p1);letter-spacing:.01em}
.co{margin-top:2mm;font-size:8.4pt;letter-spacing:.32em;text-transform:uppercase;color:var(--muted)}
.rule{width:18mm;height:1.6mm;border-radius:1mm;background:linear-gradient(90deg,var(--p1),var(--p2));margin:4mm 0 0}
.ref{color:var(--muted);margin-top:4mm}
table.items{width:100%;border-collapse:collapse;margin-top:11mm}
.items th{text-align:left;font-size:7.6pt;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--p1);padding:0 1.6mm 2.6mm;border-bottom:1.6px solid var(--ink)}
.items td{padding:3.4mm 1.6mm;border-bottom:1px solid var(--line);vertical-align:top}
.items .no{width:7mm;color:var(--p2);font-weight:700;font-size:8pt;padding-top:3.8mm}
.items .d{font-weight:600}.items .d .dx{display:block;font-weight:400;font-size:.9em;opacity:.8;margin-top:1mm}
.items .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.items td.amt{font-weight:600}
.sum{margin:5mm 0 0 auto;min-width:76mm;border-collapse:collapse}
.sum td{padding:1.6mm 1.6mm}.sum td.n{text-align:right;font-variant-numeric:tabular-nums}.sum tr.dtot td{color:#15803d;font-weight:600}.doff{color:#15803d;font-size:.82em}
.sum tr.g td{padding-top:3mm;border-top:1.6px solid var(--ink);font-size:14pt;font-weight:700;color:var(--p1)}
.sum tr.g td:first-child{font-size:10.5pt;color:var(--ink)}
.note{margin-top:7mm;white-space:pre-line;font-style:italic;color:#3d3549}
.legal{margin-top:4mm;padding:3mm 4mm;border-left:3px solid var(--p2);background:#f7f2fd;font-size:8.6pt}
.pay{margin-top:6mm;font-size:9pt;color:#3d3549}
.end{margin-top:auto;padding-top:10mm;display:flex;justify-content:space-between;align-items:flex-end;gap:8mm}
.thanks{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:21pt;line-height:1.05;color:var(--ink)}
.thanks small{display:block;font-family:Outfit,Arial,sans-serif;font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:var(--p1);margin-top:2mm}
.sig{text-align:right;font-size:8.4pt;color:var(--muted)}.sig b{display:block;color:var(--ink);font-size:10.5pt}
.wm{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;font-size:46pt;font-weight:700;color:rgba(248,113,113,.18);transform:rotate(-24deg);z-index:3}
@media print{body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none}}
@media screen and (max-width:820px){.page{width:auto;min-height:0;margin:0;grid-template-columns:1fr}.main{padding:7mm 6mm}.side{padding:8mm 6mm}}
</style>
</head>
<body>
<?php if (!$embed): ?><div class="bar"><button onclick="print()">🖨 PDF / Drucken</button><?php foreach (WF_DOC_LANGS as $l): if ($l !== $lang): ?><a href="?id=<?= (int)$i['id'] ?>&amp;lang=<?= $l ?>"><?= strtoupper($l) ?></a><?php endif; endforeach; ?></div><?php endif; ?>
<div class="page">
<?php if ($draft): ?><div class="wm"><?= $e($T['draft']) ?></div><?php endif; ?>
  <aside class="side">
    <div class="logowrap"><img class="logo" src="<?= $e($logoSrc) ?>" alt=""></div>
    <div class="sec"><h4><?= $e($T['to']) ?></h4><div class="cust"><?php
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
    <div class="sec"><h4><?= $e($isCredit ? $T['credit'] : $T['invoice']) ?></h4><div class="kv">
      <span><?= $e($isCredit ? $T['credit_number'] : $T['number']) ?></span><b><?= $e($numTxt) ?></b>
      <span><?= $e($isCredit ? $T['credit_date'] : $T['date']) ?></span><b><?= $e(wf_doc_date($i['issue_date'], $lang)) ?></b>
      <?php if ($i['delivery_date'] && $i['delivery_date'] !== $i['issue_date']): ?><span><?= $e($T['delivery']) ?></span><b><?= $e(wf_doc_date($i['delivery_date'], $lang)) ?></b><?php endif; ?>
      <?php if (!$isCredit): ?><span><?= $e($T['due']) ?></span><b><?= $e(wf_doc_date($i['due_date'], $lang)) ?></b><?php endif; ?>
      <span><?= $e($T['customer_no']) ?></span><b><?= (int)$i['customer_id'] ?></b>
    </div></div>
    <?php if (!$isCredit): ?><div class="sec"><h4><?= $e($T['pay_title']) ?></h4>
      <?php if (!empty($S['bank'])): ?><b><?= $e($S['bank']) ?></b><br><?php endif; ?>
      <?php if (!empty($S['reg_no'])): ?><?= $e($T['reg']) ?> <?= $e($S['reg_no']) ?> · <?= $e($T['acc']) ?> <?= $e($S['account_no']) ?><br><?php endif; ?>
      <?php if (!empty($S['iban'])): ?><?= $e($T['iban']) ?><br><span class="iban"><?= $e(trim(chunk_split(preg_replace('/\s+/', '', $S['iban']), 4, ' '))) ?></span><br><?php endif; ?>
      <?php if (!empty($S['bic'])): ?><?= $e($T['bic']) ?> <?= $e($S['bic']) ?><?php endif; ?>
    </div><?php endif; ?>
    <div class="sec"><h4><?= $e($S['name'] ?? '') ?></h4>
      <?php if (!empty($S['owner'])): ?><?= $e($S['owner']) ?><br><?php endif; ?>
      <?= $e($S['street'] ?? '') ?><br><?= $e(trim(($S['zip'] ?? '') . ' ' . ($S['city'] ?? ''))) ?> · <?= $e(wf_country_name($S['country'] ?? 'DK', $lang)) ?><br>
      <?= $e($T['cvr']) ?>: <?= $e($S['cvr'] ?? '') ?><br>
      <?php if ($T['own_vat'] !== '' && !empty($S['moms_registered'])): ?><?= $e($T['own_vat']) ?>: DK<?= $e($S['cvr'] ?? '') ?><br><?php endif; ?>
      <?php if (!empty($S['phone'])): ?><?= $e($S['phone']) ?><br><?php endif; ?>
      <?php if (!empty($S['email'])): ?><?= $e($S['email']) ?><br><?php endif; ?>
      <?php if (!empty($S['web'])): ?><?= $e($S['web']) ?><?php endif; ?>
    </div>
  </aside>
  <main class="main">
    <h1><?= $e($isCredit ? $T['credit'] : $T['invoice']) ?></h1>
    <div class="co"><?= $e($S['name'] ?? '') ?></div>
    <div class="rule"></div>
    <?php if ($orig): ?><div class="ref"><?= $e($tr('refers', ['{n}' => $orig['number'], '{d}' => wf_doc_date($orig['issue_date'], $lang)])) ?></div><?php endif; ?>
    <table class="items">
      <tr><th></th><th><?= $e($T['desc']) ?></th><th class="n"><?= $e($T['qty']) ?></th><th class="n"><?= $e($T['price']) ?></th><?php if ($hasDisc): ?><th class="n"><?= $e($T['disc']) ?></th><?php endif; ?><th class="n"><?= $e($T['amount']) ?></th></tr>
      <?php foreach (array_values($i['lines']) as $k => $l): ?>
      <tr><td class="no"><?= sprintf('%02d', $k + 1) ?></td><td class="d"><?php $dl = explode("\n", (string)$l['description'], 2); ?><?= $e($dl[0]) ?><?php if (isset($dl[1])): ?><span class="dx"><?= nl2br($e($dl[1])) ?></span><?php endif; ?></td>
        <td class="n"><?= $e(wf_doc_num((float)$l['qty'], $lang)) ?> <?= $e($T['units'][$l['unit']] ?? $l['unit']) ?></td>
        <td class="n"><?= $e(wf_doc_money((int)$l['unit_price'], '', $lang)) ?></td><?php if ($hasDisc): ?><td class="n"><?php if ((float)$l['discount']): ?><?= $e(wf_doc_num((float)$l['discount'], $lang)) ?> %<br><small class="doff">−<?= $e(wf_doc_money($lineOff($l), '', $lang)) ?></small><?php endif; ?></td><?php endif; ?>
        <td class="n amt"><?= $e(wf_doc_money((int)$l['amount'], '', $lang)) ?></td></tr>
      <?php endforeach; ?>
    </table>
    <table class="sum">
      <?php if ($discTotal > 0): ?><tr class="dtot"><td><?= $e($T['disc_total']) ?></td><td class="n">−<?= $e($m($discTotal)) ?></td></tr><?php endif; ?>
      <tr><td><?= $e($T['net']) ?></td><td class="n"><?= $e($m((int)$i['net'])) ?></td></tr>
      <tr><td><?= $e($p ? $tr('vat', ['{p}' => $p]) : $T['vat0']) ?></td><td class="n"><?= $e($m((int)$i['vat'])) ?></td></tr>
      <tr class="g"><td><?= $e($isCredit ? $T['total_credit'] : $T['total']) ?></td><td class="n"><?= $e($m((int)$i['total'])) ?></td></tr>
    </table>
    <?php if (trim($i['note']) !== ''): ?><div class="note"><?= $e($i['note']) ?></div><?php endif; ?>
    <?php if ($legal): ?><div class="legal"><?= implode('<br>', array_map($e, $legal)) ?></div><?php endif; ?>
    <div class="pay"><?= $e($isCredit ? $T['credit_text'] : $tr('pay_text', ['{d}' => wf_doc_date($i['due_date'], $lang), '{n}' => $numTxt])) ?></div>
    <div class="end">
      <div class="thanks"><?= $e($T['thanks']) ?><small><?= $e($S['web'] ?? ($S['name'] ?? '')) ?></small></div>
      <?php if (!empty($S['owner'])): ?><div class="sig"><b><?= $e($S['owner']) ?></b><?= $e($S['name'] ?? '') ?></div><?php endif; ?>
    </div>
  </main>
</div>
</body>
</html>
