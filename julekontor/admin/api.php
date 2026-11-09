<?php
/* JSON-Schnittstelle für die Tablet-Kasse. Nur mit Anmeldung; schreibende Aufrufe brauchen den CSRF-Schlüssel im Kopf X-CSRF. */
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/shop.php';
require __DIR__ . '/inc/sumup.php';

header('Content-Type: application/json; charset=utf-8');

function out(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$user = current_user();
if (!$user) out(['error' => 'Bitte neu anmelden.', 'login' => true], 401);
if (!can('kasse')) out(['error' => 'Keine Berechtigung.'], 403);
$who = user_name($user);
$a = (string)($_GET['a'] ?? '');

$in = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals(csrf_token(), (string)($_SERVER['HTTP_X_CSRF'] ?? ''))) out(['error' => 'Sitzung abgelaufen. Bitte Seite neu laden.', 'reload' => true], 400);
    $in = json_decode((string)file_get_contents('php://input'), true) ?: [];
}

function product_out(array $p): array {
    return ['id' => (int)$p['id'], 'name' => $p['name'], 'barcode' => (string)$p['barcode'], 'sku' => (string)$p['sku'],
            'cat' => $p['category_id'] ? (int)$p['category_id'] : null, 'price' => (int)$p['price'], 'vat' => (int)$p['vat'],
            'stock' => (float)$p['stock'], 'track' => (bool)$p['track_stock'], 'open' => (bool)$p['open_price'],
            'fav' => (bool)$p['favorite'], 'unit' => $p['unit'], 'img' => product_image_url((string)$p['image'])];
}
function card_out(?array $c): ?array {
    return $c ? ['status' => $c['status'], 'amount' => (int)$c['amount'], 'tx_code' => $c['tx_code'], 'card' => $c['card'], 'message' => $c['message']] : null;
}
function closing_out(): ?array {
    $c = open_closing();
    return $c ? ['id' => (int)$c['id'], 'opened_at' => $c['opened_at'], 'opened_by' => $c['opened_by'], 'float' => (int)$c['float']] : null;
}

try {
    switch ($a) {
        case 'init':
            $db = db();
            out([
                'user' => $who, 'role' => role(), 'csrf' => csrf_token(),
                'shop' => shop_header(),
                'settings' => [
                    'currency' => setting('currency'), 'vat_rates' => vat_rates(), 'round_cash' => (int)setting('round_cash'),
                    'payments' => enabled_payments(),
                    'mobilepay_number' => setting('mobilepay_number'),
                    'print_default' => setting('print_default'),
                    'sumup' => sumup_ready() ? ['reader' => setting('sumup_reader_name') ?: 'SumUp Solo'] : null,
                ],
                'categories' => $db->query('SELECT id, name, color FROM categories ORDER BY sort, name')->fetchAll(),
                'products' => array_map('product_out', $db->query('SELECT * FROM products WHERE active = 1 ORDER BY name COLLATE NOCASE')->fetchAll()),
                'closing' => closing_out(),
            ]);

        case 'open_day':
            open_day((int)($in['float'] ?? 0), $who);
            out(['closing' => closing_out()]);

        case 'sale':
            $s = create_sale($in, $who);
            out(['receipt' => receipt_data($s)]);

        case 'cash_move':
            cash_move((int)($in['amount'] ?? 0), (string)($in['note'] ?? ''), $who);
            out(['ok' => true]);

        case 'report':
            $c = open_closing();
            if (!$c) out(['closing' => null]);
            out(['closing' => closing_out(), 'totals' => closing_totals($c)]);

        case 'close_day':
            if (!open_closing()) throw new ShopError('Die Kasse ist nicht geöffnet.');
            $z = close_day((int)($in['counted'] ?? 0), (int)($in['withdrawn'] ?? 0), $who);
            out(['z' => ['id' => (int)$z['id'], 'number' => (int)$z['number']]]);

        case 'recent':
            $st = db()->query("SELECT id, number, type, created, total, payment FROM sales ORDER BY number DESC LIMIT 30");
            out(['sales' => $st->fetchAll()]);

        case 'receipt':
            $s = sale_full((int)($_GET['id'] ?? 0));
            if (!$s) throw new ShopError('Beleg nicht gefunden.');
            out(['receipt' => receipt_data($s)]);

        case 'sumup_start':
            $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
            $hook = ($https ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/sumup-hook.php';
            $cp = sumup_start((string)($in['uuid'] ?? ''), (int)($in['amount'] ?? 0), $who, $hook);
            out(['payment' => card_out($cp)]);

        case 'sumup_status':
            $cp = sumup_refresh((string)($_GET['uuid'] ?? ''));
            if (!$cp) throw new ShopError('Keine Kartenzahlung zu diesem Vorgang.');
            out(['payment' => card_out($cp)]);

        case 'sumup_cancel':
            sumup_cancel((string)($in['uuid'] ?? ''));
            out(['ok' => true]);

        case 'sumup_giveup':
            $cp = sumup_give_up((string)($in['uuid'] ?? ''));
            out(['payment' => $cp ? card_out($cp) : null]);

        case 'product':
            $st = db()->prepare('SELECT * FROM products WHERE (barcode = ? OR sku = ?) AND active = 1 LIMIT 1');
            $code = trim((string)($_GET['code'] ?? ''));
            $st->execute([$code, $code]);
            $p = $st->fetch();
            out(['product' => $p ? product_out($p) : null]);

        default:
            out(['error' => 'Unbekannte Aktion.'], 404);
    }
} catch (ShopError $e) {
    out(['error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    error_log('Kasse: ' . $e->getMessage());
    out(['error' => 'Interner Fehler. Bitte noch einmal versuchen.'], 500);
}
