<?php
declare(strict_types=1);
$site = web_site();
$slots = WEB_CATEGORIES + ['werkstatt' => 'Werkstatt (Abschnitt „Handgemacht“)'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $k = (string)($_POST['slot'] ?? '');
    if (!isset($slots[$k])) redirect('bilder');
    $old = (string)($site['images'][$k] ?? '');
    if (!empty($_POST['remove'])) {
        unset($site['images'][$k]);
        web_save($site); web_delete_image($old);
        flash('Foto entfernt. Die Website zeigt wieder die Zeichnung.');
    } elseif ($tmp = web_upload('image')) {
        $site['images'][$k] = web_save_image($k, $tmp);
        web_save($site); web_delete_image($old);
        flash('Foto gespeichert.');
    }
    redirect('bilder');
}

page_start('bilder', 'Bilder');
?>
<p class="muted">Die Website zeigt für jeden Bereich eine Zeichnung. Lädst du hier ein eigenes Foto hoch, ersetzt es die Zeichnung. Am besten Querformat.</p>
<div class="img-grid">
<?php foreach ($slots as $k => $label): $f = (string)($site['images'][$k] ?? ''); $has = $f !== '' && is_file(WEB_IMG_DIR . '/' . $f); ?>
  <form method="post" enctype="multipart/form-data" class="card img-slot">
    <?= csrf_field() ?>
    <input type="hidden" name="slot" value="<?= h($k) ?>">
    <strong><?= h($label) ?></strong>
    <?php if ($has): ?><img src="../data/bilder/<?= h(rawurlencode($f)) ?>" alt="">
    <?php else: ?><div class="ph">Noch kein Foto –<br>die Zeichnung wird gezeigt</div><?php endif; ?>
    <input type="file" name="image" accept="image/jpeg,image/png,image/webp" <?= $has ? '' : 'required' ?>>
    <div class="actions">
      <button class="btn small" type="submit">Hochladen</button>
      <?php if ($has): ?><button class="btn ghost small" type="submit" name="remove" value="1" formnovalidate>Entfernen</button><?php endif; ?>
    </div>
  </form>
<?php endforeach; ?>
</div>
<?php page_end();
