<?php
$imgs = db()->query('SELECT * FROM web_gallery ORDER BY sort, id DESC')->fetchAll();
site_head(t('gallery.title'), 'galleri');
page_banner(t('gallery.eyebrow'), t('gallery.title'), '', 'assets/img/vaerksted.webp');
?>
<section class="sec sec-paper sec-tight">
  <div class="wrap">
    <?php if (!$imgs): ?><p class="empty-note"><?= e('gallery.empty') ?></p><?php endif; ?>
    <div class="gallery">
      <?php foreach ($imgs as $g): if (!($u = img_url($g['image']))) continue; $cap = tl($g, 'title'); ?>
      <a class="shot reveal" href="<?= h($u) ?>" data-zoom data-caption="<?= h($cap) ?>"><img src="<?= h($u) ?>" alt="<?= h($cap) ?>" loading="lazy"><?php if ($cap !== ''): ?><span><?= h($cap) ?></span><?php endif; ?></a>
      <?php endforeach; ?>
    </div>
  </div>
</section>
<dialog class="modal modal-zoom" id="zoomModal"><div class="zoom-card"><button class="modal-x" type="button" data-close aria-label="<?= e('close') ?>">×</button><img id="zoomImg" alt=""><p id="zoomCap"></p></div></dialog>
<?php site_foot(['page' => 'galleri']);
