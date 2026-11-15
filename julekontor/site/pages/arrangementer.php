<?php
$today = date('Y-m-d');
$all = db()->query('SELECT * FROM web_events WHERE published = 1 ORDER BY date, time')->fetchAll();
$next = array_filter($all, fn($e) => $e['date'] >= $today);
$past = array_slice(array_reverse(array_filter($all, fn($e) => $e['date'] < $today)), 0, 6);
site_head(t('events.title'), 'arrangementer');
page_banner(t('events.eyebrow'), t('events.title'), '', 'assets/img/butik.webp');
$show = function (array $ev, bool $old = false) { $ts = strtotime($ev['date']); ?>
  <article class="event reveal<?= $old ? ' old' : '' ?>" id="e<?= (int)$ev['id'] ?>">
    <div class="ev-date big"><b><?= date('j', $ts) ?></b><?= h(mb_substr(fmt_date($ev['date']), strpos(fmt_date($ev['date']), ' ') + 1)) ?></div>
    <div class="event-body">
      <h3><?= h(tl($ev, 'title')) ?></h3>
      <p class="event-meta"><?= h(fmt_date($ev['date'], true)) ?><?= $ev['time'] !== '' ? ' · ' . h($ev['time']) : '' ?><?= $ev['price'] !== '' ? ' · ' . h($ev['price']) : '' ?></p>
      <div class="prose"><?= paragraphs(tl($ev, 'text')) ?></div>
      <?php if (!$old && $GLOBALS['SITE']['requests']): ?><p><a class="more" href="<?= h(url('kontakt')) ?>#skriv"><?= e('events.ask') ?> →</a></p><?php endif; ?>
    </div>
    <?php if (img_url($ev['image'])): ?><div class="frame event-img"><img src="<?= h(img_url($ev['image'])) ?>" alt="" loading="lazy"></div><?php endif; ?>
  </article>
<?php };
?>
<section class="sec sec-paper sec-tight">
  <div class="wrap narrow-l">
    <?php if (!$next): ?><p class="empty-note"><?= e('events.empty') ?></p><?php endif; ?>
    <?php foreach ($next as $ev) $show($ev); ?>
    <?php if ($past): ?><h2 class="sub reveal"><?= e('events.past') ?></h2><?php foreach ($past as $ev) $show($ev, true); endif; ?>
  </div>
</section>
<?php site_foot(['page' => 'arrangementer']);
