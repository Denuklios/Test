<?php
declare(strict_types=1);
$db = db();
$who = user_name();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['do'] ?? '') === 'refund') {
    csrf_check();
    $id = (int)$_POST['id'];
    $qtys = [];
    foreach ((array)($_POST['qty'] ?? []) as $iid => $q) { $v = parse_qty((string)$q); if ($v) $qtys[(int)$iid] = $v; }
    if (!$qtys) { flash('Bitte bei mindestens einer Position eine Menge zum Zurückgeben eintragen.', 'err'); redirect('verkaeufe&id=' . $id); }
    $r = refund_sale($id, $qtys, (string)($_POST['payment'] ?? ''), $who, (string)($_POST['note'] ?? ''));
    flash('Rückgabe gebucht: Beleg ' . $r['number'] . ' über ' . money(abs((int)$r['total'])) . ($r['payment'] === 'cash' ? ' – bitte bar auszahlen.' : '.'));
    redirect('verkaeufe&id=' . $r['id']);
}

/* ---------- Einzelbeleg ---------- */
if (isset($_GET['id'])) {
    $s = sale_full((int)$_GET['id']);
    if (!$s) redirect('verkaeufe');
    $done = $s['type'] === 'sale' ? refunded_qtys((int)$s['id']) : [];
    $st = $db->prepare('SELECT id, number, total FROM sales WHERE ref_sale_id = ? ORDER BY number');
    $st->execute([$s['id']]);
    $refunds = $st->fetchAll();
    $open = open_closing();
    page_start('verkaeufe', ($s['type'] === 'refund' ? 'Rückgabe ' : 'Beleg ') . $s['number']);
    ?>
    <p class="no-print"><a href="./?p=verkaeufe&day=<?= h(substr($s['created'], 0, 10)) ?>">← Belege vom <?= h(date('d.m.Y', strtotime($s['created']))) ?></a></p>
    <div class="two-col">
      <div class="card">
        <p><?= h(fmt_dt($s['created'])) ?> · <?= h($s['user']) ?> · <span class="pill"><?= h(PAYMENTS[$s['payment']] ?? $s['payment']) ?></span>
          <?php if ($s['type'] === 'refund'): ?> <span class="pill red">Rückgabe zu <a href="./?p=verkaeufe&id=<?= (int)$s['ref_sale_id'] ?>">Beleg <?= (int)$s['ref_number'] ?></a></span><?php endif; ?></p>
        <table class="list mt">
          <thead><tr><th>Artikel</th><th class="num">Menge</th><th class="num">Preis</th><th class="num">Rabatt</th><th class="num">Summe</th></tr></thead>
          <tbody><?php foreach ($s['items'] as $i): ?>
            <tr><td><?= h($i['name']) ?><br><span class="muted small"><?= h($i['barcode']) ?> · Moms <?= vat_label((int)$i['vat']) ?></span></td>
              <td class="num"><?= h(fmt_qty((float)$i['qty'])) ?></td><td class="num"><?= money((int)$i['unit_price'], false) ?></td>
              <td class="num"><?= $i['discount'] ? money((int)$i['discount'], false) : '' ?></td><td class="num"><?= money((int)$i['total'], false) ?></td></tr>
          <?php endforeach; ?></tbody>
          <tfoot>
            <?php if ($s['rounding']): ?><tr><td colspan="4">Rundung</td><td class="num"><?= money((int)$s['rounding'], false) ?></td></tr><?php endif; ?>
            <tr><td colspan="4">Gesamt</td><td class="num"><?= money((int)$s['total']) ?></td></tr>
            <?php foreach ($s['vat_lines'] as $v => $x): ?><tr><td colspan="4" class="muted" style="font-weight:400">davon Moms <?= vat_label($v) ?></td><td class="num muted" style="font-weight:400"><?= money($x['vat'], false) ?></td></tr><?php endforeach; ?>
          </tfoot>
        </table>
        <?php if ($s['payment'] === 'cash' && $s['type'] === 'sale'): ?><p class="mt muted">Gegeben <?= money((int)$s['given']) ?> · Rückgeld <?= money((int)$s['change']) ?></p><?php endif; ?>
        <?php if ($s['card_ref']): ?><p class="muted">Zahlungs-Referenz: <?= h($s['card_ref']) ?></p><?php endif; ?>
        <?php if ($s['note']): ?><p class="muted">Notiz: <?= h($s['note']) ?></p><?php endif; ?>
        <?php if ($refunds): ?><p class="mt">Rückgaben: <?php foreach ($refunds as $r): ?><a class="pill red" href="./?p=verkaeufe&id=<?= (int)$r['id'] ?>">Beleg <?= (int)$r['number'] ?> (<?= money((int)$r['total']) ?>)</a> <?php endforeach; ?></p><?php endif; ?>
        <p class="mt no-print"><a class="btn ghost small" href="bon.php?id=<?= (int)$s['id'] ?>" target="_blank">Bon drucken</a></p>
      </div>
      <?php if ($s['type'] === 'sale'): ?>
      <form method="post" class="card form no-print" onsubmit="return confirm('Rückgabe jetzt buchen?')">
        <?= csrf_field() ?><input type="hidden" name="do" value="refund"><input type="hidden" name="id" value="<?= (int)$s['id'] ?>">
        <h2>Rückgabe / Storno</h2>
        <?php if (!$open): ?><p class="flash err">Die Kasse ist geschlossen. Für eine Rückgabe zuerst unter „Tagesabschluss“ die Kasse öffnen.</p><?php endif; ?>
        <p class="hint">Der Beleg bleibt unverändert. Es entsteht ein neuer Rückgabe-Beleg, der Bestand wird wieder gutgeschrieben.</p>
        <?php $any = false; foreach ($s['items'] as $i): $left = round((float)$i['qty'] - ($done[$i['id']] ?? 0), 3); if ($left <= 0) continue; $any = true; ?>
          <label><?= h($i['name']) ?> <span class="hint">(max. <?= h(fmt_qty($left)) ?>)</span>
            <input name="qty[<?= (int)$i['id'] ?>]" inputmode="decimal" value="<?= h(fmt_qty($left)) ?>" data-max="<?= $left ?>"></label>
        <?php endforeach; ?>
        <?php if (!$any): ?><p class="muted">Alles von diesem Beleg ist schon zurückgegeben.</p><?php else: ?>
          <label>Erstatten per<select name="payment"><?php foreach (PAYMENTS as $k => $t): ?><option value="<?= $k ?>" <?= $k === $s['payment'] ? 'selected' : '' ?>><?= $t ?></option><?php endforeach; ?></select></label>
          <label>Grund (optional)<input name="note" maxlength="200" placeholder="z. B. defekt, Umtausch"></label>
          <div class="actions"><button class="btn danger" type="submit" <?= $open ? '' : 'disabled' ?>>Rückgabe buchen</button>
            <button class="btn ghost" type="button" onclick="this.form.querySelectorAll('[data-max]').forEach(i => i.value = '0')">Alle auf 0</button></div>
        <?php endif; ?>
      </form>
      <?php endif; ?>
    </div>
    <?php
    page_end();
    return;
}

/* ---------- Liste ---------- */
$day = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($_GET['day'] ?? '')) ? $_GET['day'] : date('Y-m-d');
$nr = (int)($_GET['nr'] ?? 0);
if ($nr) {
    $st = $db->prepare('SELECT id FROM sales WHERE number = ?');
    $st->execute([$nr]);
    if ($id = $st->fetchColumn()) redirect('verkaeufe&id=' . $id);
    flash('Beleg ' . $nr . ' gibt es nicht.', 'err');
}
$st = $db->prepare("SELECT s.*, (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) n FROM sales s WHERE date(created) = ? ORDER BY number DESC");
$st->execute([$day]);
$rows = $st->fetchAll();
$sum = array_sum(array_column($rows, 'total'));
$GLOBALS['wide'] = true;
page_start('verkaeufe', 'Belege');
?>
<form class="toolbar no-print" method="get">
  <input type="hidden" name="p" value="verkaeufe">
  <a class="btn ghost small" href="./?p=verkaeufe&day=<?= date('Y-m-d', strtotime($day . ' -1 day')) ?>">←</a>
  <label>Tag<input type="date" name="day" value="<?= h($day) ?>" onchange="this.form.submit()"></label>
  <a class="btn ghost small" href="./?p=verkaeufe&day=<?= date('Y-m-d', strtotime($day . ' +1 day')) ?>">→</a>
  <label>Bonnummer<input name="nr" inputmode="numeric" placeholder="z. B. 128" style="max-width:140px"></label>
  <button class="btn ghost" type="submit">Öffnen</button>
</form>
<div class="stats">
  <div class="stat"><b><?= money($sum) ?></b><span>Summe <?= h(date('d.m.Y', strtotime($day))) ?></span></div>
  <div class="stat"><b><?= count(array_filter($rows, fn($r) => $r['type'] === 'sale')) ?></b><span>Verkäufe</span></div>
  <div class="stat"><b><?= count(array_filter($rows, fn($r) => $r['type'] === 'refund')) ?></b><span>Rückgaben</span></div>
</div>
<div class="table-wrap"><table class="list">
  <thead><tr><th>Nr.</th><th>Zeit</th><th>Art</th><th>Zahlung</th><th class="num">Pos.</th><th>Kassierer</th><th class="num">Betrag</th></tr></thead>
  <tbody>
  <?php if (!$rows): ?><tr class="empty-row"><td colspan="7">Keine Belege an diesem Tag.</td></tr><?php endif; ?>
  <?php foreach ($rows as $r): ?>
    <tr class="click" onclick="location='./?p=verkaeufe&id=<?= (int)$r['id'] ?>'">
      <td><b><?= (int)$r['number'] ?></b></td><td><?= h(date('H:i', strtotime($r['created']))) ?></td>
      <td><?= $r['type'] === 'refund' ? '<span class="pill red">Rückgabe</span>' : 'Verkauf' ?></td>
      <td><?= h(PAYMENTS[$r['payment']] ?? $r['payment']) ?></td><td class="num"><?= (int)$r['n'] ?></td>
      <td class="muted"><?= h($r['user']) ?></td><td class="num"><b><?= money((int)$r['total']) ?></b></td></tr>
  <?php endforeach; ?>
  </tbody></table></div>
<?php page_end();
