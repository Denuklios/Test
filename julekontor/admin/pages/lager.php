<?php
declare(strict_types=1);
$db = db();
$who = user_name();
const LAGER_MODES = [
    'receipt'    => ['Wareneingang', 'Menge kommt dazu'],
    'inventory'  => ['Inventur', 'Gezählten Bestand eintragen'],
    'waste'      => ['Bruch / Schwund', 'Menge geht ab'],
    'correction' => ['Korrektur', '+ oder − Menge'],
];
$mode = (string)($_POST['mode'] ?? $_GET['mode'] ?? $_SESSION['lager_mode'] ?? 'receipt');
if (!isset(LAGER_MODES[$mode])) $mode = 'receipt';
$_SESSION['lager_mode'] = $mode;

function find_product(PDO $db, string $code): ?array {
    $code = trim($code);
    if ($code === '') return null;
    if (ctype_digit($code) && strlen($code) < 6) { $st = $db->prepare('SELECT * FROM products WHERE id = ?'); $st->execute([(int)$code]); }
    else { $st = $db->prepare('SELECT * FROM products WHERE barcode = ? OR sku = ? LIMIT 1'); $st->execute([$code, $code]); }
    return $st->fetch() ?: null;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $p = find_product($db, (string)($_POST['code'] ?? ''));
    if (!$p) {
        $code = trim((string)($_POST['code'] ?? ''));
        flash('Kein Artikel mit „' . $code . '“. ' . (preg_match('/^\d{8,14}$/', $code) ? 'Jetzt anlegen?' : ''), 'err');
        redirect('lager' . (preg_match('/^\d{8,14}$/', $code) ? '&unknown=' . rawurlencode($code) : ''));
    }
    $qty = parse_qty((string)($_POST['qty'] ?? '1'));
    if ($qty === null) { flash('Bitte eine gültige Menge eingeben.', 'err'); redirect('lager&id=' . $p['id']); }
    $note = mb_substr(trim((string)($_POST['note'] ?? '')), 0, 200);
    if ($mode === 'inventory') $after = stock_set((int)$p['id'], $qty, $who, $note);
    else {
        if ($mode !== 'correction') $qty = abs($qty);
        if ($mode === 'waste') $qty = -$qty;
        if ($qty == 0) { flash('Menge 0 – nichts gebucht.', 'err'); redirect('lager'); }
        $after = stock_move((int)$p['id'], $qty, $mode, $who, '', $note);
    }
    if (!$p['track_stock']) $db->prepare('UPDATE products SET track_stock = 1 WHERE id = ?')->execute([$p['id']]);
    flash(LAGER_MODES[$mode][0] . ': „' . $p['name'] . '“ – neuer Bestand ' . fmt_qty($after) . ' ' . $p['unit']);
    redirect('lager');
}

$sel = isset($_GET['id']) ? find_product($db, (string)$_GET['id']) : null;
$value = $db->query('SELECT COALESCE(SUM(stock * cost),0) c, COALESCE(SUM(stock * price),0) p, COUNT(*) n FROM products WHERE active = 1 AND track_stock = 1 AND stock > 0')->fetch();
$low = $db->query('SELECT * FROM products WHERE active = 1 AND track_stock = 1 AND stock <= min_stock ORDER BY stock - min_stock, name LIMIT 100')->fetchAll();
$moves = $db->query('SELECT m.*, p.name, p.unit FROM stock_moves m JOIN products p ON p.id = m.product_id ORDER BY m.id DESC LIMIT 60')->fetchAll();
$GLOBALS['wide'] = true;
page_start('lager', 'Lager');
?>
<div class="stats">
  <div class="stat"><b><?= money((int)round($value['c'])) ?></b><span>Lagerwert (Einkauf)</span></div>
  <div class="stat"><b><?= money((int)round($value['p'])) ?></b><span>Lagerwert (Verkauf)</span></div>
  <div class="stat"><b><?= (int)$value['n'] ?></b><span>Artikel auf Lager</span></div>
  <div class="stat"><b style="color:<?= $low ? 'var(--err)' : 'var(--green)' ?>"><?= count($low) ?></b><span>unter Mindestbestand</span></div>
</div>

<?php if (!empty($_GET['unknown'])): ?>
  <div class="flash err">Unbekannter Strichcode <?= h((string)$_GET['unknown']) ?>. <a href="./?p=artikel&new=1&barcode=<?= h(rawurlencode((string)$_GET['unknown'])) ?>">Als neuen Artikel anlegen →</a></div>
<?php endif; ?>

<form method="post" class="card form no-print" id="lform">
  <?= csrf_field() ?>
  <div class="actions" role="radiogroup" aria-label="Buchungsart">
    <?php foreach (LAGER_MODES as $k => [$t, $d]): ?>
      <label class="check" style="border:1px solid var(--line);border-radius:999px;padding:6px 14px;<?= $mode === $k ? 'background:var(--red);color:var(--on-red);border-color:var(--red)' : '' ?>">
        <input type="radio" name="mode" value="<?= $k ?>" <?= $mode === $k ? 'checked' : '' ?> onchange="location='./?p=lager&mode=<?= $k ?>'" style="display:none"><?= $t ?></label>
    <?php endforeach; ?>
  </div>
  <p class="hint"><?= h(LAGER_MODES[$mode][1]) ?>. Mit dem Hand-Scanner: Artikel scannen, Menge eingeben, Enter.</p>
  <div class="row3" style="grid-template-columns:2fr 1fr 2fr">
    <label>Artikel (scannen, Code oder Nr.)<input name="code" id="code" required data-scan value="<?= h($sel ? ((string)$sel['barcode'] ?: (string)$sel['id']) : '') ?>" autofocus autocomplete="off"></label>
    <label><?= $mode === 'inventory' ? 'Gezählt' : 'Menge' ?><input name="qty" id="qty" inputmode="decimal" required value="<?= $mode === 'inventory' && $sel ? h(fmt_qty((float)$sel['stock'])) : '1' ?>"></label>
    <label>Notiz (optional)<input name="note" maxlength="200" placeholder="<?= $mode === 'receipt' ? 'z. B. Lieferant, Rechnungsnr.' : '' ?>"></label>
  </div>
  <?php if ($sel): ?><p><b><?= h($sel['name']) ?></b> – Bestand jetzt <?= h(fmt_qty((float)$sel['stock'])) ?> <?= h($sel['unit']) ?></p><?php endif; ?>
  <div class="actions"><button class="btn" type="submit">Buchen</button></div>
</form>

<div class="two-col mt">
  <div>
    <h2>Nachbestellen</h2>
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Artikel</th><th class="num">Bestand</th><th class="num">Mindest</th></tr></thead>
      <tbody>
      <?php if (!$low): ?><tr class="empty-row"><td colspan="3">Alles ausreichend auf Lager.</td></tr><?php endif; ?>
      <?php foreach ($low as $r): ?>
        <tr class="click" onclick="location='./?p=lager&id=<?= (int)$r['id'] ?>'"><td><?= h($r['name']) ?></td>
          <td class="num"><span class="pill red"><?= h(fmt_qty((float)$r['stock'])) ?></span></td><td class="num"><?= h(fmt_qty((float)$r['min_stock'])) ?></td></tr>
      <?php endforeach; ?>
      </tbody></table></div>
  </div>
  <div>
    <h2>Letzte Bewegungen</h2>
    <div class="table-wrap"><table class="list">
      <thead><tr><th>Zeit</th><th>Artikel</th><th>Art</th><th class="num">Menge</th><th class="num">danach</th></tr></thead>
      <tbody>
      <?php if (!$moves): ?><tr class="empty-row"><td colspan="5">Noch keine Buchungen.</td></tr><?php endif; ?>
      <?php foreach ($moves as $m): ?>
        <tr title="<?= h(trim($m['user'] . ' ' . $m['ref'] . ' ' . $m['note'])) ?>"><td class="muted small"><?= h(fmt_dt($m['created'])) ?></td><td><?= h($m['name']) ?></td>
          <td class="small"><?= h(STOCK_REASONS[$m['reason']] ?? $m['reason']) ?></td>
          <td class="num" style="color:<?= $m['qty'] < 0 ? 'var(--err)' : 'var(--green)' ?>"><?= $m['qty'] > 0 ? '+' : '' ?><?= h(fmt_qty((float)$m['qty'])) ?></td>
          <td class="num"><?= h(fmt_qty((float)$m['stock_after'])) ?></td></tr>
      <?php endforeach; ?>
      </tbody></table></div>
  </div>
</div>
<script>
document.addEventListener('DOMContentLoaded', () => {
  const code = document.getElementById('code'), qty = document.getElementById('qty');
  // Enter im Code-Feld springt zur Menge (Hand-Scanner schickt Enter)
  code.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); qty.focus(); qty.select(); } });
  // Scan, während ein anderes Feld aktiv ist: Code übernehmen
  JKScan.listen(c => { code.value = c; qty.focus(); qty.select(); });
});
</script>
<?php page_end();
