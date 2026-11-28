<?php
$rows = web_product_rows();
$cats = [];
foreach ($rows as $r) if ($r['category_id']) $cats[(int)$r['category_id']] = $r['category'];
asort($cats);
$k = (int)($_GET['k'] ?? 0);
if (!isset($cats[$k])) $k = 0;
$list = array_map(fn($r) => web_product($r, $LANG), $k ? array_filter($rows, fn($r) => (int)$r['category_id'] === $k) : $rows);
site_head(t('shop.title'), 'butik', t('shop.lead'));
page_banner(t('shop.eyebrow'), t('shop.title'), t('shop.lead'), $k && $cats[$k] === 'Bastelbedarf' ? 'assets/img/bastel.webp' : 'assets/img/butik-inde.webp');
?>
<section class="sec sec-paper sec-tight">
  <div class="wrap">
    <?php if (count($cats) > 1): ?>
    <nav class="filter reveal" aria-label="<?= e('shop.title') ?>">
      <a href="<?= h(url('butik')) ?>"<?= !$k ? ' class="on"' : '' ?>><?= e('shop.all') ?></a>
      <?php foreach ($cats as $id => $name): ?><a href="<?= h(url('butik', ['k' => $id])) ?>"<?= $k === $id ? ' class="on"' : '' ?>><?= h($name) ?></a><?php endforeach; ?>
    </nav>
    <?php endif; ?>
    <?php if ($list): ?><div class="shelf"><?php foreach ($list as $p) product_card($p); ?></div>
    <?php else: ?><p class="empty-note reveal"><?= e('shop.empty') ?></p><?php endif; ?>
  </div>
</section>
<?php site_foot(['page' => 'butik']);
