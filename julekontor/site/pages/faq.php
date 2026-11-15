<?php
$rows = db()->query('SELECT * FROM web_faq ORDER BY sort, id')->fetchAll();
site_head(t('faq.title'), 'faq');
page_banner(t('faq.eyebrow'), t('faq.title'));
?>
<section class="sec sec-paper sec-tight">
  <div class="wrap narrow">
    <?php if (!$rows): ?><p class="empty-note"><?= e('faq.empty') ?><br><br><a class="btn" href="<?= h(url('kontakt')) ?>#skriv"><?= e('form.title') ?></a></p><?php endif; ?>
    <?php foreach ($rows as $r): ?>
    <details class="faq reveal"><summary><?= h(tl($r, 'title')) ?></summary><div class="prose"><?= paragraphs(tl($r, 'text')) ?></div></details>
    <?php endforeach; ?>
  </div>
</section>
<?php site_foot(['page' => 'faq']);
