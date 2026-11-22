<?php
$d = (string)($_GET['d'] ?? 'terms');
if (!in_array($d, ['terms', 'withdrawal', 'privacy', 'imprint'], true)) $d = 'terms';
site_head(t('legal.' . $d), '');
?>
<section class="sec sec-paper sec-top">
  <div class="wrap narrow">
    <nav class="filter" aria-label="<?= e('foot.legal') ?>">
      <?php foreach (['terms', 'withdrawal', 'privacy', 'imprint'] as $x): ?><a href="<?= h(url('vilkaar', ['d' => $x])) ?>"<?= $x === $d ? ' class="on"' : '' ?>><?= e('legal.' . $x) ?></a><?php endforeach; ?>
    </nav>
    <h1 class="h2"><?= e('legal.' . $d) ?></h1>
    <div class="prose legal">
      <?= paragraphs(legal_fill(t('legal.' . $d . '.body'))) ?>
    </div>
  </div>
</section>
<?php site_foot(['page' => 'vilkaar']);
