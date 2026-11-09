<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/barcode.php';
$db = db();
const LABEL_FORMATS = [
    'a4'    => ['A4-Bogen 3 × 8 (70 × 37 mm)', 'a4'],
    'a4s'   => ['A4-Bogen 4 × 10 (48,5 × 25,4 mm)', 'a4s'],
    'roll'  => ['Etikettendrucker 50 × 30 mm', 'roll'],
    'shelf' => ['Regal-Schild 90 × 50 mm (A4, 2 × 5)', 'shelf'],
];
$fmt = isset(LABEL_FORMATS[$_GET['fmt'] ?? '']) ? $_GET['fmt'] : 'a4';
$skip = max(0, min(39, (int)($_GET['skip'] ?? 0)));
$showPrice = !isset($_GET['go']) || !empty($_GET['price']);

/* Auswahl: ids=1,2,3 oder n[id]=Anzahl */
$counts = [];
foreach ((array)($_GET['n'] ?? []) as $id => $n) if ((int)$n > 0) $counts[(int)$id] = min(500, (int)$n);
foreach (array_filter(array_map('intval', explode(',', (string)($_GET['ids'] ?? '')))) as $id) $counts[$id] ??= 1;

$q = trim((string)($_GET['q'] ?? ''));
$cat = (int)($_GET['cat'] ?? 0);
$where = ['active = 1']; $args = [];
if ($q !== '') { $where[] = '(name LIKE ? OR barcode LIKE ?)'; array_push($args, "%$q%", "%$q%"); }
if ($cat) { $where[] = 'category_id = ?'; $args[] = $cat; }
if ($counts && $q === '' && !$cat) { $where = ['id IN (' . implode(',', array_keys($counts)) . ')']; $args = []; }
$st = $db->prepare('SELECT * FROM products WHERE ' . implode(' AND ', $where) . ' ORDER BY name COLLATE NOCASE LIMIT 300');
$st->execute($args);
$list = $st->fetchAll();

$labels = [];
if (isset($_GET['go']) && $counts) {
    $st = $db->prepare('SELECT * FROM products WHERE id = ?');
    foreach ($counts as $id => $n) {
        $st->execute([$id]);
        if ($p = $st->fetch()) {
            if (!$p['barcode']) {                                    // ohne Strichcode: jetzt eigenen vergeben
                $p['barcode'] = next_internal_ean();
                $db->prepare('UPDATE products SET barcode = ?, updated = ? WHERE id = ?')->execute([$p['barcode'], now(), $id]);
            }
            for ($i = 0; $i < $n; $i++) $labels[] = $p;
        }
    }
}
$GLOBALS['wide'] = true;
page_start('etiketten', 'Etiketten');
?>
<style>
  .sheet { background: #fff; color: #000; margin: 0 auto; }
  .lbl { overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; text-align: center; font-family: Arial, Helvetica, sans-serif; break-inside: avoid; }
  .lbl .shop { font: italic 700 7pt Georgia, serif; color: #a3201d; }
  .lbl .name { font-weight: 700; line-height: 1.1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .lbl .price { font-weight: 800; }
  .lbl .barcode { width: 100%; display: block; }
  .sheet.a4 { width: 210mm; display: grid; grid-template-columns: repeat(3, 70mm); grid-auto-rows: 37mm; padding: 0; }
  .sheet.a4 .lbl { padding: 2.5mm 4mm; } .sheet.a4 .name { font-size: 8.5pt; } .sheet.a4 .price { font-size: 13pt; } .sheet.a4 .barcode { height: 12mm; }
  .sheet.a4s { width: 210mm; display: grid; grid-template-columns: repeat(4, 48.5mm); grid-auto-rows: 25.4mm; padding: 10.7mm 8mm; }
  .sheet.a4s .lbl { padding: 1mm 2mm; } .sheet.a4s .name { font-size: 6.5pt; -webkit-line-clamp: 1; } .sheet.a4s .price { font-size: 9pt; } .sheet.a4s .barcode { height: 9mm; } .sheet.a4s .shop { display: none; }
  .sheet.roll { width: 50mm; } .sheet.roll .lbl { width: 50mm; height: 30mm; padding: 1.5mm 2mm; page-break-after: always; }
  .sheet.roll .name { font-size: 7pt; -webkit-line-clamp: 1; } .sheet.roll .price { font-size: 10pt; } .sheet.roll .barcode { height: 11mm; }
  .sheet.shelf { width: 210mm; display: grid; grid-template-columns: repeat(2, 90mm); grid-auto-rows: 50mm; gap: 4mm 10mm; padding: 10mm 10mm; }
  .sheet.shelf .lbl { border: 1px dashed #bbb; padding: 4mm; } .sheet.shelf .name { font-size: 13pt; } .sheet.shelf .price { font-size: 26pt; color: #a3201d; } .sheet.shelf .barcode { height: 10mm; } .sheet.shelf .shop { font-size: 10pt; }
  @media screen { .sheet { box-shadow: 0 2px 12px rgba(0,0,0,.2); } .sheet .lbl { outline: 1px dotted #ddd; } }
  @media print {
    @page { size: <?= $fmt === 'roll' ? '50mm 30mm' : 'A4' ?>; margin: 0; }
    .content > h1, .label-tools { display: none !important; }
  }
</style>

<?php if (!$labels): ?>
<form method="get" class="label-tools">
  <input type="hidden" name="p" value="etiketten">
  <div class="toolbar">
    <label class="grow">Artikel suchen<input name="q" value="<?= h($q) ?>" placeholder="Name oder Strichcode" data-scan></label>
    <label>Kategorie<select name="cat"><option value="0">alle</option>
      <?php foreach ($db->query('SELECT * FROM categories ORDER BY sort, name') as $c): ?><option value="<?= (int)$c['id'] ?>" <?= $cat === (int)$c['id'] ? 'selected' : '' ?>><?= h($c['name']) ?></option><?php endforeach; ?></select></label>
    <button class="btn ghost" type="submit">Filtern</button>
  </div>
</form>
<form method="get" class="label-tools">
  <input type="hidden" name="p" value="etiketten"><input type="hidden" name="go" value="1">
  <div class="card form">
    <div class="row3">
      <label>Format<select name="fmt"><?php foreach (LABEL_FORMATS as $k => [$t]): ?><option value="<?= $k ?>" <?= $fmt === $k ? 'selected' : '' ?>><?= h($t) ?></option><?php endforeach; ?></select></label>
      <label>Leere Felder am Anfang überspringen<input name="skip" inputmode="numeric" value="<?= $skip ?>"><span class="hint">für angebrochene Bögen</span></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="price" value="1" checked> Preis drucken</label>
    </div>
    <div class="actions">
      <button class="btn" type="submit">Etiketten erzeugen</button>
      <button class="btn ghost" type="button" onclick="document.querySelectorAll('[data-stock]').forEach(i => i.value = Math.max(0, Math.ceil(+i.dataset.stock)))">Anzahl = Bestand</button>
      <button class="btn ghost" type="button" onclick="document.querySelectorAll('[data-stock]').forEach(i => i.value = 0)">Alle auf 0</button>
    </div>
  </div>
  <div class="table-wrap mt"><table class="list">
    <thead><tr><th>Artikel</th><th>Strichcode</th><th class="num">Preis</th><th class="num">Bestand</th><th class="num" style="width:110px">Anzahl</th></tr></thead>
    <tbody>
    <?php if (!$list): ?><tr class="empty-row"><td colspan="5">Keine Artikel gefunden.</td></tr><?php endif; ?>
    <?php foreach ($list as $p): ?>
      <tr><td><?= h($p['name']) ?></td><td class="muted"><?= $p['barcode'] ? h($p['barcode']) : '<span class="pill gold">wird vergeben</span>' ?></td>
        <td class="num"><?= money((int)$p['price']) ?></td><td class="num"><?= h(fmt_qty((float)$p['stock'])) ?></td>
        <td class="num"><input name="n[<?= (int)$p['id'] ?>]" inputmode="numeric" value="<?= (int)($counts[$p['id']] ?? 0) ?>" data-stock="<?= (float)$p['stock'] ?>" style="text-align:right"></td></tr>
    <?php endforeach; ?>
    </tbody></table></div>
</form>
<?php else: ?>
  <div class="label-tools toolbar">
    <button class="btn" onclick="print()">Drucken</button>
    <a class="btn ghost" href="javascript:history.back()">Zurück</a>
    <span class="muted"><?= count($labels) ?> Etiketten · <?= h(LABEL_FORMATS[$fmt][0]) ?> · Im Druckdialog „Ränder: keine“ und „Skalierung 100 %“ wählen.</span>
  </div>
  <div class="sheet <?= h($fmt) ?>">
    <?php for ($i = 0; $i < ($fmt === 'roll' ? 0 : $skip); $i++): ?><div class="lbl"></div><?php endfor; ?>
    <?php foreach ($labels as $p): ?>
      <div class="lbl">
        <div class="shop"><?= h(setting('shop_name')) ?></div>
        <div class="name"><?= h($p['name']) ?></div>
        <?php if ($showPrice): ?><div class="price"><?= money((int)$p['price']) ?></div><?php endif; ?>
        <?= barcode_svg((string)$p['barcode'], 40) ?>
      </div>
    <?php endforeach; ?>
  </div>
<?php endif; ?>
<?php page_end();
