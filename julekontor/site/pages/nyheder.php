<?php
$id = (int)($_GET['id'] ?? 0);
if ($id) {
    $st = db()->prepare('SELECT * FROM web_posts WHERE id = ? AND published = 1'); $st->execute([$id]);
    $po = $st->fetch();
}
if (!empty($po)) {
    site_head(tl($po, 'title'), 'nyheder', mb_substr(tl($po, 'text'), 0, 150)); ?>
<section class="sec sec-paper sec-top">
  <article class="wrap narrow article">
    <p class="crumb"><a href="<?= h(url('nyheder')) ?>">← <?= e('news.back') ?></a></p>
    <p class="eyebrow"><?= h(fmt_date($po['date'])) ?></p>
    <h1><?= h(tl($po, 'title')) ?></h1>
    <?php if (img_url($po['image'])): ?><div class="frame"><img src="<?= h(img_url($po['image'])) ?>" alt=""></div><?php endif; ?>
    <div class="prose"><?= paragraphs(tl($po, 'text')) ?></div>
  </article>
</section>
<?php site_foot(['page' => 'nyheder']); return; }
$posts = db()->query('SELECT * FROM web_posts WHERE published = 1 ORDER BY date DESC, id DESC LIMIT 60')->fetchAll();
site_head(t('news.title'), 'nyheder');
page_banner(t('news.eyebrow'), t('news.title'));
?>
<section class="sec sec-paper sec-tight">
  <div class="wrap">
    <?php if (!$posts): ?><p class="empty-note"><?= e('news.empty') ?></p><?php endif; ?>
    <div class="posts">
      <?php foreach ($posts as $po): ?>
      <a class="post reveal" href="<?= h(url('nyheder', ['id' => $po['id']])) ?>">
        <div class="post-img"><img src="<?= h(img_url($po['image']) ?: 'assets/img/pynt.webp') ?>" alt="" loading="lazy"></div>
        <small><?= h(fmt_date($po['date'])) ?></small>
        <h3><?= h(tl($po, 'title')) ?></h3>
        <p><?= h(mb_strimwidth(preg_replace('/\s+/', ' ', tl($po, 'text')), 0, 150, ' …')) ?></p>
        <span class="more"><?= e('news.more') ?> →</span>
      </a>
      <?php endforeach; ?>
    </div>
  </div>
</section>
<?php site_foot(['page' => 'nyheder']);
