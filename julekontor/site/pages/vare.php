<?php
$rows = web_product_rows('AND p.id = ?', [(int)($_GET['id'] ?? 0)]);
if (!$rows) { http_response_code(404); require __DIR__ . '/butik.php'; return; }
$p = web_product($rows[0], $LANG);
site_head($p['name'], 'butik', mb_substr($p['desc'], 0, 150));
?>
<section class="sec sec-paper sec-top">
  <div class="wrap">
    <p class="crumb"><a href="<?= h(url('butik')) ?>">← <?= e('shop.back') ?></a></p>
    <div class="product">
      <div class="frame product-img reveal">
        <?php if ($p['kit']): ?><span class="tag"><?= e('shelf.kit') ?></span><?php endif; ?>
        <img src="<?= h($p['image'] ?: 'assets/img/stjerne.webp') ?>" alt="<?= h($p['name']) ?>" width="480" height="480">
      </div>
      <div class="product-info reveal">
        <?php if ($p['category'] !== ''): ?><p class="eyebrow"><?= h($p['category']) ?></p><?php endif; ?>
        <h1><?= h($p['name']) ?></h1>
        <div class="product-price"><?= price_html($p['price']) ?><?php if ($p['price'] !== null): ?><span class="vat"><?= e('shop.vat') ?></span><?php endif; ?></div>
        <?php if ($p['desc'] !== ''): ?><div class="prose"><?= paragraphs($p['desc']) ?></div><?php endif; ?>
        <ul class="facts">
          <li><?= $p['max'] < 1 ? e('shelf.soldout') : ($rows[0]['track_stock'] ? e('shop.stock', ['n' => $p['max']]) : '') ?></li>
          <li><?= e($p['ship'] ? 'shop.ships' : 'shop.pickupOnly') ?></li>
        </ul>
        <?php if ($p['buyable']): ?>
        <div class="buy">
          <label><span><?= e('shop.qty') ?></span><input type="number" id="qty" min="1" max="<?= $p['max'] ?>" value="1" inputmode="numeric"></label>
          <button class="btn" type="button" data-add="<?= $p['id'] ?>" data-qty="#qty"><?= e('shop.add') ?></button>
        </div>
        <?php endif; ?>
      </div>
    </div>
    <?php if ($SITE['requests']): ?>
    <div class="product-ask"><?php contact_form($p['kit'] ? 'bausatz' : 'frage', $p['id'], t('shop.question')); ?></div>
    <?php endif; ?>
  </div>
</section>
<?php site_foot(['page' => 'vare']);
