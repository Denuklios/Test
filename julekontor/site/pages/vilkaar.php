<?php
$d = (string)($_GET['d'] ?? 'terms');
if (!in_array($d, ['terms', 'withdrawal', 'privacy', 'imprint'], true)) $d = 'terms';
$c = $SITE['contact'];
site_head(t('legal.' . $d), '');
?>
<section class="sec sec-paper sec-top">
  <div class="wrap narrow">
    <nav class="filter" aria-label="<?= e('foot.legal') ?>">
      <?php foreach (['terms', 'withdrawal', 'privacy', 'imprint'] as $x): ?><a href="<?= h(url('vilkaar', ['d' => $x])) ?>"<?= $x === $d ? ' class="on"' : '' ?>><?= e('legal.' . $x) ?></a><?php endforeach; ?>
    </nav>
    <h1 class="h2"><?= e('legal.' . $d) ?></h1>
    <div class="prose">
      <?php if ($d === 'imprint'): ?>
        <p><strong><?= h(setting('shop_name')) ?></strong><br><?= $c['street'] !== '' ? h($c['street']) . '<br>' : '' ?><?= h($c['city']) ?><br>Danmark</p>
        <p><?= $c['cvr'] !== '' ? 'CVR: ' . h($c['cvr']) . '<br>' : '' ?><?= $c['phone'] !== '' ? h(t('form.phone')) . ': ' . h($c['phone']) . '<br>' : '' ?><?= $c['email'] !== '' ? h(t('form.email')) . ': <a href="mailto:' . h($c['email']) . '">' . h($c['email']) . '</a>' : '' ?></p>
      <?php else: echo paragraphs(t('legal.' . $d . '.body')); endif; ?>
    </div>
  </div>
</section>
<?php site_foot(['page' => 'vilkaar']);
