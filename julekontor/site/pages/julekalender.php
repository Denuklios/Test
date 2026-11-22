<?php
header('Cache-Control: no-store');
if (!$SITE['calendar']['enabled']) { require __DIR__ . '/home.php'; return; }
$year = (int)$SITE['calendar']['year'];
$rows = advent_doors(); $doors = []; $any = false; $all = true;
for ($d = 1; $d <= 24; $d++) { $op = $PREVIEW || advent_open($d, $year); $doors[] = ['day' => $d, 'open' => $op]; $any = $any || $op; $all = $all && $op; }
site_head(t('cal.title'), 'julekalender', t('home.cal.text'));
?>
<section class="sec sec-night sec-top" id="kalender">
  <canvas class="snow snow-night" id="snow2" aria-hidden="true"></canvas>
  <div class="wrap">
    <header class="sec-head reveal">
      <p class="eyebrow"><?= e('cal.eyebrow') ?></p>
      <h1 class="h2"><?= e('cal.title') ?></h1>
      <p class="lead"><?= e($all ? 'cal.leadAfter' : ($any ? 'cal.leadDuring' : 'cal.leadBefore'), ['year' => $year]) ?></p>
    </header>
    <div class="cal" id="cal"></div>
    <?php if ($PREVIEW): ?><p class="cal-preview"><?= e('cal.preview') ?></p><?php endif; ?>
  </div>
</section>
<dialog class="modal" id="doorModal" aria-labelledby="doorTitle">
  <div class="modal-card door-card">
    <button class="modal-x" type="button" data-close aria-label="<?= e('close') ?>">×</button>
    <div class="door-day"><span id="doorDay">1</span><small><?= e('cal.month') ?></small></div>
    <div class="door-img" id="doorImg" hidden></div>
    <h3 id="doorTitle"></h3>
    <p class="door-text" id="doorText"></p>
    <div class="door-code" id="doorCode" hidden><small><?= e('cal.code') ?></small><b></b></div>
    <a class="btn" id="doorLink" hidden target="_blank" rel="noopener"><?= e('cal.link') ?></a>
  </div>
</dialog>
<?php site_foot(['page' => 'julekalender', 'calendar' => ['year' => $year, 'doors' => $doors, 'preview' => $PREVIEW]]);
