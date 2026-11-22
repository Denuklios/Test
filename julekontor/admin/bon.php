<?php
/* Beleg drucken: als Kassenbon (Bondrucker 80/58 mm) oder als A4-Rechnung (normaler Drucker).
   ?id=…  &fmt=bon|a4 (ohne = Standard aus den Einstellungen)  &auto=1 druckt sofort. */
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/shop.php';
require __DIR__ . '/inc/receipt.php';
if (!current_user() || !can('verkaeufe')) { http_response_code(403); exit('Bitte anmelden.'); }
$id = (int)($_GET['id'] ?? 0);

/* Kundenadresse für die A4-Rechnung speichern (gehört nicht zur Prüfsumme des Belegs) */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    db()->prepare('UPDATE sales SET customer = ? WHERE id = ?')->execute([mb_substr(trim((string)($_POST['customer'] ?? '')), 0, 400), $id]);
    header('Location: bon.php?fmt=a4&id=' . $id);
    exit;
}

$s = sale_full($id);
if (!$s) { http_response_code(404); exit('Beleg nicht gefunden.'); }
$r = receipt_data($s);
$shop = shop_header();
$fmt = in_array($_GET['fmt'] ?? '', ['bon', 'a4'], true) ? $_GET['fmt'] : (setting('print_default') === 'a4' ? 'a4' : 'bon');
$width = setting('bon_width') === '58' ? 58 : 80;
$m = fn(int $c) => money($c, false);
$refund = $r['type'] === 'refund';
$customer = (string)$s['customer'];
$logo = is_file(JK_ROOT . '/logo/julekontor-logo.png') ? '../logo/julekontor-logo.png' : '';
$q = fn(string $f) => 'bon.php?fmt=' . $f . '&id=' . $id;
?><!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $fmt === 'a4' ? ($refund ? 'Kreditnota' : 'Faktura') : 'Bon' ?> <?= (int)$r['number'] ?></title>
<style>
<?php receipt_css($fmt, $width); ?>
</style>
</head>
<body>
<div class="tools">
  <button class="main" onclick="print()">🖨 Drucken</button>
  <a href="<?= h($q('bon')) ?>" class="<?= $fmt === 'bon' ? 'on' : '' ?>">🧾 Bon (<?= $width ?> mm)</a>
  <a href="<?= h($q('a4')) ?>" class="<?= $fmt === 'a4' ? 'on' : '' ?>">📄 A4-Rechnung</a>
  <button onclick="history.length > 1 ? history.back() : close()">Zurück</button>
</div>

<?php receipt_body(receipt_render_vars($s, $fmt), $logo, true); ?>
<?php if (!empty($_GET['auto'])): ?><script>addEventListener('load', () => setTimeout(() => print(), 350));</script><?php endif; ?>
</body>
</html>
