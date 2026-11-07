<?php
declare(strict_types=1);
$site = read_json('site');
page_start('dashboard', 'Übersicht');
$target = strtotime((string)($site['countdownTarget'] ?? ''));
?>
<div class="grid">
  <a class="card tile" href="./?p=startseite">
    <span class="big" aria-hidden="true">⏳</span>
    <h2>Startseite</h2>
    <p class="muted">„<?= h($site['title'] ?? '') ?>“</p>
    <?php if (!empty($site['countdownEnabled']) && $target): ?>
      <p>Countdown bis <strong><?= h(date('d.m.Y H:i', $target)) ?></strong>
        – noch <strong><?= max(0, (int)ceil(($target - time()) / 86400)) ?></strong> Tage</p>
    <?php else: ?>
      <p>Countdown ist ausgeschaltet</p>
    <?php endif; ?>
  </a>
  <?php foreach (JK_MODULES as $id => $m): if ($m['ready'] || $id === 'dashboard') continue; ?>
  <a class="card tile soon" href="./?p=<?= h($id) ?>">
    <span class="big" aria-hidden="true"><?= $m['icon'] ?></span>
    <h2><?= h($m['title']) ?></h2>
    <p class="muted">Kommt bald</p>
  </a>
  <?php endforeach; ?>
  <a class="card tile" href="../bastelwerkstatt/" target="_blank" rel="noopener">
    <span class="big" aria-hidden="true">✂️</span>
    <h2>Bastelwerkstatt ↗</h2>
    <p class="muted">Kalkulation für Bastelprojekte</p>
  </a>
</div>
<?php page_end();
