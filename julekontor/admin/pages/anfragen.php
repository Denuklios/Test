<?php
declare(strict_types=1);
$db = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $id = (int)($_POST['id'] ?? 0);
    $act = (string)($_POST['act'] ?? '');
    if ($act === 'done')   $db->prepare("UPDATE web_requests SET status = 'erledigt' WHERE id = ?")->execute([$id]);
    if ($act === 'reopen') $db->prepare("UPDATE web_requests SET status = 'neu' WHERE id = ?")->execute([$id]);
    if ($act === 'delete') { $db->prepare('DELETE FROM web_requests WHERE id = ?')->execute([$id]); flash('Anfrage gelöscht.'); }
    redirect('anfragen' . (!empty($_POST['all']) ? '&all=1' : ''));
}

$all = !empty($_GET['all']);
$rows = $db->query('SELECT * FROM web_requests ' . ($all ? '' : "WHERE status = 'neu' ") . 'ORDER BY created DESC LIMIT 300')->fetchAll();
$nDone = (int)$db->query("SELECT COUNT(*) FROM web_requests WHERE status = 'erledigt'")->fetchColumn();

page_start('anfragen', 'Anfragen');
?>
<p class="muted">Fragen und Reservierungen von der Website. <?= $all ? '<a href="./?p=anfragen">Nur offene zeigen</a>' : ($nDone ? '<a href="./?p=anfragen&all=1">Auch erledigte zeigen (' . $nDone . ')</a>' : '') ?></p>
<?php if (!$rows): ?>
<div class="card empty"><div class="big">💌</div><h2>Keine offenen Anfragen</h2><p class="muted">Sobald jemand auf der Website etwas fragt oder reserviert, steht es hier.</p></div>
<?php endif; ?>
<?php foreach ($rows as $r): ?>
<div class="card req">
  <div class="req-head">
    <span class="pill <?= $r['kind'] === 'frage' ? '' : 'gold' ?>"><?= h(WEB_REQUEST_KINDS[$r['kind']] ?? $r['kind']) ?></span>
    <?php if ($r['product_name'] !== ''): ?><strong><?= h($r['product_name']) ?></strong><?php endif; ?>
    <span class="muted small"><?= h(fmt_dt($r['created'])) ?> · <?= h(WEB_LANGS[$r['lang']] ?? $r['lang']) ?></span>
    <?php if ($r['status'] === 'erledigt'): ?><span class="pill green">erledigt</span><?php endif; ?>
  </div>
  <div><strong><?= h($r['name']) ?></strong>
    <?php if ($r['email'] !== ''): ?> · <a href="mailto:<?= h($r['email']) ?>"><?= h($r['email']) ?></a><?php endif; ?>
    <?php if ($r['phone'] !== ''): ?> · <a href="tel:<?= h(preg_replace('/[^0-9+]/', '', $r['phone'])) ?>"><?= h($r['phone']) ?></a><?php endif; ?>
  </div>
  <?php if ($r['message'] !== ''): ?><p class="req-msg"><?= h($r['message']) ?></p><?php endif; ?>
  <form method="post" class="actions">
    <?= csrf_field() ?>
    <input type="hidden" name="id" value="<?= (int)$r['id'] ?>">
    <?php if ($all): ?><input type="hidden" name="all" value="1"><?php endif; ?>
    <?php if ($r['status'] === 'neu'): ?><button class="btn small green" name="act" value="done">Erledigt</button>
    <?php else: ?><button class="btn small ghost" name="act" value="reopen">Wieder öffnen</button><?php endif; ?>
    <button class="btn small ghost" name="act" value="delete" onclick="return confirm('Diese Anfrage wirklich löschen?')">Löschen</button>
  </form>
</div>
<?php endforeach; ?>
<?php page_end();
