<?php
declare(strict_types=1);
$site = read_json('site');
$db = db();
$c = open_closing();
$today = $db->query("SELECT COALESCE(SUM(total),0) t, COALESCE(SUM(CASE WHEN type='sale' THEN 1 END),0) n FROM sales WHERE date(created) = '" . date('Y-m-d') . "'")->fetch();
$low = (int)$db->query('SELECT COUNT(*) FROM products WHERE active = 1 AND track_stock = 1 AND stock <= min_stock')->fetchColumn();
$nProducts = (int)$db->query('SELECT COUNT(*) FROM products WHERE active = 1')->fetchColumn();
$admin = role() === 'admin';
page_start('dashboard', 'Übersicht');
$target = strtotime((string)($site['countdownTarget'] ?? ''));
?>
<div class="grid">
  <a class="card tile" href="kasse/" style="border-color:var(--red)">
    <span class="big" aria-hidden="true">🧾</span>
    <h2>Kasse öffnen</h2>
    <p><?= $c ? 'Geöffnet seit ' . h(date('H:i', strtotime($c['opened_at']))) . ' (' . h($c['opened_by']) . ')' : 'Kasse ist geschlossen' ?></p>
    <p class="muted">Heute <?= money((int)$today['t']) ?> · <?= (int)$today['n'] ?> Verkäufe</p>
  </a>
  <?php if ($admin): ?>
  <a class="card tile" href="./?p=artikel">
    <span class="big" aria-hidden="true">🏷️</span>
    <h2>Artikel</h2>
    <p><?= $nProducts ?> aktive Artikel</p>
    <?php if (!$nProducts): ?><p class="muted">Leg los: ersten Artikel anlegen oder Liste importieren.</p><?php endif; ?>
  </a>
  <a class="card tile" href="./?p=lager">
    <span class="big" aria-hidden="true">📦</span>
    <h2>Lager</h2>
    <p><?= $low ? '<span class="pill red">' . $low . ' unter Mindestbestand</span>' : 'Alles ausreichend auf Lager' ?></p>
  </a>
  <?php endif; ?>
  <a class="card tile" href="./?p=abschluss">
    <span class="big" aria-hidden="true">🔒</span>
    <h2>Tagesabschluss</h2>
    <p class="muted"><?= $c ? 'Zwischenstand ansehen oder Tag abschließen' : 'Kasse öffnen mit Wechselgeld' ?></p>
  </a>
  <?php if ($admin): ?>
  <a class="card tile" href="./?p=startseite">
    <span class="big" aria-hidden="true">⏳</span>
    <h2>Startseite</h2>
    <p class="muted">„<?= h($site['title'] ?? '') ?>“</p>
    <?php if (!empty($site['countdownEnabled']) && $target): ?>
      <p>Countdown bis <strong><?= h(date('d.m.Y', $target)) ?></strong> – noch <strong><?= max(0, (int)ceil(($target - time()) / 86400)) ?></strong> Tage</p>
    <?php endif; ?>
  </a>
  <a class="card tile" href="../bastelwerkstatt/" target="_blank" rel="noopener">
    <span class="big" aria-hidden="true">✂️</span>
    <h2>Bastelwerkstatt ↗</h2>
    <p class="muted">Kalkulation für Bastelprojekte</p>
  </a>
  <?php endif; ?>
</div>
<?php page_end();
