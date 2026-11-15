<?php
declare(strict_types=1);
$db = db();
$id = (int)($_GET['id'] ?? 0);

/* CSV für die Buchhaltung */
if (isset($_GET['csv'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="online-bestellungen-' . date('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['Nummer', 'Datum', 'Status', 'Bezahlt', 'Bezahlt am', 'Zahlungsart', 'Lieferung', 'Name', 'E-Mail', 'Waren', 'Versand', 'Gesamt', 'davon Moms'], ';');
    foreach ($db->query('SELECT * FROM web_orders ORDER BY id') as $o)
        fputcsv($out, ['W-' . $o['number'], $o['created'], WEB_ORDER_STATUS[$o['status']], $o['paid'] ? 'ja' : 'nein', $o['paid_at'], WEB_PAYMENTS[$o['payment']], WEB_DELIVERY[$o['delivery']],
                       $o['name'], $o['email'], money((int)$o['subtotal'], false), money((int)$o['shipping'], false), money((int)$o['total'], false), money((int)$o['vat_total'], false)], ';');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $id) {
    csrf_check();
    $o = web_order_get('id', $id);
    if (!$o) redirect('bestellungen');
    $act = (string)($_POST['act'] ?? '');
    if ($act === 'status' && isset(WEB_ORDER_STATUS[$_POST['status'] ?? ''])) {
        $s = (string)$_POST['status'];
        if ($s === 'storniert') web_order_cancel($o, user_name());
        elseif ($o['status'] === 'storniert') flash('Eine stornierte Bestellung kann nicht wieder geöffnet werden – die Ware ist zurück im Lager.', 'err');
        else $db->prepare('UPDATE web_orders SET status = ? WHERE id = ?')->execute([$s, $id]);
        if (!flash_peek()) flash('Status geändert.');
    }
    if ($act === 'paid') { web_order_paid($o, 'von Hand: ' . user_name()); flash('Als bezahlt markiert.'); }
    if ($act === 'unpaid') { $db->prepare("UPDATE web_orders SET paid = 0, paid_at = '' WHERE id = ?")->execute([$id]); flash('Als unbezahlt markiert.'); }
    if ($act === 'note') { $db->prepare('UPDATE web_orders SET admin_note = ? WHERE id = ?')->execute([mb_substr(trim((string)($_POST['admin_note'] ?? '')), 0, 1000), $id]); flash('Notiz gespeichert.'); }
    if ($act === 'mail') { web_order_mail(web_order_get('id', $id), false); flash('Bestätigung noch einmal an den Kunden geschickt.'); }
    redirect('bestellungen&id=' . $id);
}

if ($id && ($o = web_order_get('id', $id))) {
    page_start('bestellungen', 'Bestellung ' . web_order_no($o));
    ?>
    <p><a href="./?p=bestellungen">← Alle Bestellungen</a></p>
    <div class="card form">
      <div class="req-head">
        <span class="pill <?= $o['status'] === 'storniert' ? 'red' : ($o['status'] === 'neu' ? 'gold' : 'green') ?>"><?= h(WEB_ORDER_STATUS[$o['status']]) ?></span>
        <span class="pill <?= $o['paid'] ? 'green' : 'red' ?>"><?= $o['paid'] ? 'bezahlt' . ($o['paid_at'] ? ' am ' . h(fmt_dt($o['paid_at'])) : '') : 'noch nicht bezahlt' ?></span>
        <span class="muted"><?= h(fmt_dt($o['created'])) ?> · <?= h(WEB_DELIVERY[$o['delivery']]) ?> · <?= h(WEB_PAYMENTS[$o['payment']]) ?> · <?= h(WEB_LANGS[$o['lang']] ?? '') ?></span>
      </div>
      <div class="table-wrap"><table class="list">
        <thead><tr><th>Artikel</th><th class="num">Menge</th><th class="num">Preis</th><th class="num">Summe</th></tr></thead>
        <tbody>
        <?php foreach ($o['items'] as $it): ?><tr><td><?= h($it['name']) ?></td><td class="num"><?= (int)$it['qty'] ?></td><td class="num"><?= h(money((int)$it['unit_price'])) ?></td><td class="num"><?= h(money((int)$it['total'])) ?></td></tr><?php endforeach; ?>
        <?php if ($o['shipping']): ?><tr><td colspan="3">Versand</td><td class="num"><?= h(money((int)$o['shipping'])) ?></td></tr><?php endif; ?>
        </tbody>
        <tfoot><tr><td colspan="3">Gesamt (darin Moms <?= h(money((int)$o['vat_total'])) ?>)</td><td class="num"><?= h(money((int)$o['total'])) ?></td></tr></tfoot>
      </table></div>
      <div>
        <strong><?= h($o['name']) ?></strong> · <a href="mailto:<?= h($o['email']) ?>"><?= h($o['email']) ?></a><?= $o['phone'] !== '' ? ' · ' . h($o['phone']) : '' ?>
        <?php if ($o['delivery'] !== 'pickup'): ?><br><?= h($o['street']) ?>, <?= h($o['zip']) ?> <?= h($o['city']) ?>, <?= h($o['country']) ?><?php endif; ?>
        <?php if ($o['note'] !== ''): ?><p class="req-msg"><em>Hinweis des Kunden:</em> <?= h($o['note']) ?></p><?php endif; ?>
      </div>
      <form method="post" class="actions">
        <?= csrf_field() ?><input type="hidden" name="act" value="status">
        <?php foreach (WEB_ORDER_STATUS as $k => $label): if ($k === $o['status']) continue; ?>
          <button class="btn small <?= $k === 'storniert' ? 'ghost' : '' ?>" name="status" value="<?= h($k) ?>" <?= $k === 'storniert' ? 'onclick="return confirm(\'Bestellung stornieren? Die Ware wird zurück ins Lager gebucht.\')"' : '' ?>><?= h($label) ?></button>
        <?php endforeach; ?>
      </form>
      <form method="post" class="actions">
        <?= csrf_field() ?>
        <?php if ($o['paid']): ?><button class="btn small ghost" name="act" value="unpaid">Doch nicht bezahlt</button>
        <?php else: ?><button class="btn small green" name="act" value="paid">Als bezahlt markieren</button><?php endif; ?>
        <button class="btn small ghost" name="act" value="mail">Bestätigung erneut senden</button>
        <a class="btn small ghost" href="../?s=ordre&t=<?= h($o['token']) ?>" target="_blank" rel="noopener">Seite des Kunden ↗</a>
      </form>
      <form method="post">
        <?= csrf_field() ?><input type="hidden" name="act" value="note">
        <label>Interne Notiz<textarea name="admin_note" maxlength="1000" rows="2"><?= h($o['admin_note']) ?></textarea></label>
        <div class="actions" style="margin-top:8px"><button class="btn small" type="submit">Notiz speichern</button></div>
      </form>
    </div>
    <?php
    page_end();
    return;
}

$all = !empty($_GET['all']);
$rows = $db->query('SELECT * FROM web_orders ' . ($all ? '' : "WHERE status IN ('neu', 'bestaetigt') OR (paid = 0 AND status != 'storniert') ") . 'ORDER BY id DESC LIMIT 400')->fetchAll();
$GLOBALS['wide'] = true;
page_start('bestellungen', 'Bestellungen');
?>
<p class="muted">Bestellungen aus dem Online-Shop. Die Ware ist ab der Bestellung im Lager reserviert; beim Stornieren kommt sie zurück.
  <?= $all ? '<a href="./?p=bestellungen">Nur offene zeigen</a>' : '<a href="./?p=bestellungen&all=1">Alle zeigen</a>' ?> · <a href="./?p=bestellungen&csv=1">CSV für die Buchhaltung</a></p>
<div class="flash" style="background:var(--paper)">Online-Bestellungen laufen <strong>nicht</strong> über die Kasse: Sie stehen nicht im Tagesabschluss und nicht in den Berichten. Für die Buchhaltung gibt es die CSV-Liste.</div>
<?php if (!$rows): ?>
<div class="card empty"><div class="big">🛒</div><h2>Keine offenen Bestellungen</h2></div>
<?php else: ?>
<div class="table-wrap"><table class="list">
  <thead><tr><th>Nr.</th><th>Datum</th><th>Kunde</th><th>Lieferung</th><th>Zahlung</th><th>Status</th><th class="num">Gesamt</th></tr></thead>
  <tbody>
  <?php foreach ($rows as $o): ?>
  <tr class="click" onclick="location.href='./?p=bestellungen&id=<?= (int)$o['id'] ?>'">
    <td><a href="./?p=bestellungen&id=<?= (int)$o['id'] ?>" style="font-weight:700;text-decoration:none">W-<?= (int)$o['number'] ?></a></td>
    <td><?= h(fmt_dt($o['created'])) ?></td><td><?= h($o['name']) ?></td><td><?= h(WEB_DELIVERY[$o['delivery']]) ?></td>
    <td><?= h(WEB_PAYMENTS[$o['payment']]) ?> <span class="pill <?= $o['paid'] ? 'green' : 'red' ?>"><?= $o['paid'] ? 'bezahlt' : 'offen' ?></span></td>
    <td><span class="pill <?= $o['status'] === 'storniert' ? 'red' : ($o['status'] === 'neu' ? 'gold' : 'green') ?>"><?= h(WEB_ORDER_STATUS[$o['status']]) ?></span></td>
    <td class="num"><?= h(money((int)$o['total'])) ?></td>
  </tr>
  <?php endforeach; ?>
  </tbody>
</table></div>
<?php endif; ?>
<?php page_end();
