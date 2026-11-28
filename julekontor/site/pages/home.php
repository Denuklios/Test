<?php
$L = $LANG;
$new = array_slice(array_map(fn($r) => web_product($r, $L), web_product_rows()), 0, 4);
$posts = db()->query("SELECT * FROM web_posts WHERE published = 1 ORDER BY date DESC, id DESC LIMIT 3")->fetchAll();
$st = db()->prepare("SELECT * FROM web_events WHERE published = 1 AND date >= ? ORDER BY date, time LIMIT 3"); $st->execute([date('Y-m-d')]);
$events = $st->fetchAll();
$cats = ['kranse', 'pynt', 'traeer', 'braet', 'mere'];
$supCat = (int)db()->query("SELECT c.id FROM categories c JOIN products p ON p.category_id = c.id WHERE c.name = 'Bastelbedarf' AND p.web = 1 AND p.active = 1 LIMIT 1")->fetchColumn();
$storeAt = strtotime((string)$SITE['countdownTarget']);
site_head('', 'home');
hero(false);
?>
<div class="ribbon" aria-hidden="true"><div class="ribbon-track" id="ribbon"></div></div>

<section class="sec sec-paper" id="sortiment">
  <div class="wrap">
    <header class="sec-head reveal">
      <p class="eyebrow"><?= e('range.eyebrow') ?></p>
      <h2><?= e('range.title') ?></h2>
      <p class="lead"><?= e('range.lead') ?></p>
    </header>
    <div class="range">
      <?php foreach ($cats as $i => $c): ?>
      <a class="card<?= $i === 0 ? ' card-big' : '' ?> reveal" href="<?= h(url('butik')) ?>">
        <div class="arch"><img src="<?= h(slot_img($c)) ?>" alt="" loading="lazy"></div>
        <div class="card-text"><h3><?= e("cat.$c.t") ?></h3><p><?= e("cat.$c.d") ?></p></div>
      </a>
      <?php endforeach; ?>
    </div>
    <p class="center reveal"><a class="btn" href="<?= h(url('butik')) ?>"><?= e('home.range.more') ?></a></p>
  </div>
</section>

<section class="sec sec-pine" id="haandlavet">
  <div class="scallop scallop-top" aria-hidden="true"></div>
  <div class="wrap craft">
    <div class="craft-num reveal">
      <div class="seal">
        <svg class="seal-ring" viewBox="0 0 300 300" aria-hidden="true"><defs><path id="sealPath" d="M150 150m-118 0a118 118 0 1 1 236 0a118 118 0 1 1-236 0"/></defs><text><textPath href="#sealPath" textLength="736" lengthAdjust="spacing">HÅNDLAVET ✦ HANDGEMACHT ✦ HANDMADE ✦ JULEKONTOR ✦</textPath></text></svg>
        <div class="seal-core"><span class="seal-num" id="sealNum">85</span><span class="seal-pct">%</span></div>
      </div>
    </div>
    <div class="craft-text reveal">
      <p class="eyebrow"><?= e('craft.eyebrow') ?></p>
      <h2><?= e('craft.title') ?></h2>
      <p class="lead"><?= e('craft.lead') ?></p>
      <ul class="craft-list">
        <?php foreach ([1, 2, 3] as $n): ?>
        <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.600 6.600L21 9.300l-5 4.400 1.600 6.800L12 16.900 6.400 20.500 8 13.700 3 9.300l6.400-.700z"/></svg><div><strong><?= e("craft.p{$n}t") ?></strong><span><?= e("craft.p{$n}d") ?></span></div></li>
        <?php endforeach; ?>
      </ul>
    </div>
    <div class="craft-art reveal"><div class="frame"><img src="<?= h(slot_img('werkstatt')) ?>" alt="" loading="lazy"></div></div>
  </div>
  <div class="scallop scallop-bottom" aria-hidden="true"></div>
</section>

<?php if ($storeAt && $storeAt > time()): ?>
<section class="sec sec-paper store">
  <div class="wrap store-grid">
    <div class="store-photo reveal"><div class="frame"><img src="assets/img/laden.webp" alt="<?= e('store.alt') ?>" loading="lazy" width="1376" height="768"></div></div>
    <div class="store-text reveal">
      <p class="eyebrow"><?= e('store.eyebrow') ?></p>
      <h2><?= e('store.title') ?></h2>
      <p class="lead"><?= e('store.text', ['date' => fmt_date(date('Y-m-d', $storeAt))]) ?></p>
      <a class="btn btn-line" href="<?= h(url('kontakt')) ?>"><?= e('visit.title') ?></a>
    </div>
  </div>
</section>
<?php endif; ?>

<?php if ($supCat): ?>
<section class="sec sec-paper sec-tight">
  <div class="wrap">
    <a class="supplies reveal" href="<?= h(url('butik', ['k' => $supCat])) ?>">
      <img src="assets/img/bastel.webp" alt="" loading="lazy" width="1792" height="592">
      <span class="supplies-card"><span class="eyebrow"><?= e('supplies.eyebrow') ?></span><strong><?= e('supplies.title') ?></strong><span><?= e('supplies.text') ?></span><span class="btn btn-small"><?= e('supplies.cta') ?></span></span>
    </a>
  </div>
</section>
<?php endif; ?>

<?php if ($new): ?>
<section class="sec sec-paper">
  <div class="wrap">
    <header class="sec-head reveal"><p class="eyebrow"><?= e('home.new.eyebrow') ?></p><h2><?= e('home.new.title') ?></h2></header>
    <div class="shelf"><?php foreach ($new as $p) product_card($p); ?></div>
    <p class="center reveal"><a class="btn btn-line" href="<?= h(url('butik')) ?>"><?= e('home.range.more') ?></a></p>
  </div>
</section>
<?php endif; ?>

<?php if ($SITE['calendar']['enabled']): ?>
<section class="sec sec-night teaser">
  <canvas class="snow snow-night" id="snow2" aria-hidden="true"></canvas>
  <div class="wrap">
    <header class="sec-head reveal">
      <p class="eyebrow"><?= e('cal.eyebrow') ?></p>
      <h2><?= e('cal.title') ?></h2>
      <p class="lead"><?= e('home.cal.text') ?></p>
      <a class="btn" href="<?= h(url('julekalender')) ?>"><?= e('hero.cta2') ?></a>
    </header>
  </div>
</section>
<?php endif; ?>

<?php if ($events || $posts): ?>
<section class="sec sec-paper">
  <div class="wrap duo">
    <?php if ($events): ?>
    <div>
      <header class="sec-head left reveal"><p class="eyebrow"><?= e('home.events.eyebrow') ?></p><h2><?= e('home.events.title') ?></h2></header>
      <div class="ev-list">
        <?php foreach ($events as $ev): $ts = strtotime($ev['date']); ?>
        <a class="ev reveal" href="<?= h(url('arrangementer')) ?>#e<?= (int)$ev['id'] ?>">
          <span class="ev-date"><b><?= date('j', $ts) ?></b><?= h(mb_substr(fmt_date($ev['date']), strpos(fmt_date($ev['date']), ' ') + 1, 3)) ?></span>
          <span><strong><?= h(tl($ev, 'title')) ?></strong><?= $ev['time'] !== '' ? '<small>' . h($ev['time']) . '</small>' : '' ?></span>
        </a>
        <?php endforeach; ?>
      </div>
      <p class="reveal"><a class="more" href="<?= h(url('arrangementer')) ?>"><?= e('home.events.all') ?> →</a></p>
    </div>
    <?php endif; ?>
    <?php if ($posts): ?>
    <div>
      <header class="sec-head left reveal"><p class="eyebrow"><?= e('home.news.eyebrow') ?></p><h2><?= e('home.news.title') ?></h2></header>
      <div class="ev-list">
        <?php foreach ($posts as $po): ?>
        <a class="ev reveal" href="<?= h(url('nyheder', ['id' => $po['id']])) ?>">
          <?php if (img_url($po['image'])): ?><img class="ev-img" src="<?= h(img_url($po['image'])) ?>" alt="" loading="lazy"><?php endif; ?>
          <span><strong><?= h(tl($po, 'title')) ?></strong><small><?= h(fmt_date($po['date'])) ?></small></span>
        </a>
        <?php endforeach; ?>
      </div>
      <p class="reveal"><a class="more" href="<?= h(url('nyheder')) ?>"><?= e('home.news.all') ?> →</a></p>
    </div>
    <?php endif; ?>
  </div>
</section>
<?php endif; ?>

<section class="sec sec-paper sec-visit">
  <div class="wrap visit-teaser">
    <div class="frame frame-tilt reveal"><img src="assets/img/butik.webp" alt="" loading="lazy" width="1400" height="933"></div>
    <div class="reveal">
      <p class="eyebrow"><?= e('visit.eyebrow') ?></p>
      <h2><?= e('visit.title') ?></h2>
      <p class="lead"><?= e('visit.lead') ?></p>
      <p style="margin-top:22px"><a class="btn" href="<?= h(url('kontakt')) ?>"><?= e('home.visit.cta') ?></a></p>
    </div>
  </div>
</section>
<?php site_foot(['page' => 'home', 'count85' => true]);
