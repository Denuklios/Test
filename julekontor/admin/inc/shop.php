<?php
/* Kassenlogik: Verkauf, Rückgabe, Lagerbuchungen, Kassenschicht (öffnen/schließen = Z-Bericht).
   Belege werden nie geändert oder gelöscht. Jeder Beleg trägt eine Prüfsumme über den vorherigen,
   so fällt jede nachträgliche Änderung in der Datenbank auf (siehe verify_chain()). */
declare(strict_types=1);
require_once __DIR__ . '/db.php';

const PAYMENTS = ['cash' => 'Bar', 'card' => 'Karte', 'mobilepay' => 'MobilePay', 'other' => 'Sonstige'];
const PAYMENTS_DA = ['cash' => 'Kontant', 'card' => 'Kort', 'mobilepay' => 'MobilePay', 'other' => 'Andet'];
const STOCK_REASONS = ['sale' => 'Verkauf', 'refund' => 'Rückgabe', 'receipt' => 'Wareneingang',
                       'correction' => 'Korrektur', 'inventory' => 'Inventur', 'waste' => 'Bruch/Schwund'];

class ShopError extends RuntimeException {}

function enabled_payments(): array {
    return array_filter(PAYMENTS, fn($k) => setting('pay_' . $k) === '1', ARRAY_FILTER_USE_KEY);
}

/* ---------- Lager ---------- */
function stock_move(int $productId, float $qty, string $reason, string $user, string $ref = '', string $note = ''): float {
    $db = db();
    $db->prepare('UPDATE products SET stock = round(stock + ?, 3), updated = ? WHERE id = ?')->execute([$qty, now(), $productId]);
    $st = $db->prepare('SELECT stock FROM products WHERE id = ?');
    $st->execute([$productId]);
    $after = (float)$st->fetchColumn();
    $db->prepare('INSERT INTO stock_moves (product_id, qty, stock_after, reason, ref, note, user, created) VALUES (?,?,?,?,?,?,?,?)')
       ->execute([$productId, $qty, $after, $reason, $ref, $note, $user, now()]);
    return $after;
}
/* Inventur: gezählten Bestand setzen, Differenz wird gebucht */
function stock_set(int $productId, float $counted, string $user, string $note = ''): float {
    $st = db()->prepare('SELECT stock FROM products WHERE id = ?');
    $st->execute([$productId]);
    $diff = round($counted - (float)$st->fetchColumn(), 3);
    return stock_move($productId, $diff, 'inventory', $user, '', $note);
}

/* ---------- Kassenschicht ---------- */
function open_closing(): ?array {
    $r = db()->query('SELECT * FROM closings WHERE closed_at IS NULL ORDER BY id DESC LIMIT 1')->fetch();
    return $r ?: null;
}
function open_day(int $float, string $user): array {
    if ($c = open_closing()) return $c;
    db()->prepare('INSERT INTO closings (opened_at, opened_by, float) VALUES (?,?,?)')->execute([now(), $user, max(0, $float)]);
    return open_closing();
}
function cash_move(int $amount, string $note, string $user): void {
    $c = open_closing();
    if (!$c) throw new ShopError('Die Kasse ist nicht geöffnet.');
    if ($amount === 0) throw new ShopError('Bitte einen Betrag eingeben.');
    if (trim($note) === '') throw new ShopError('Bitte einen Grund angeben.');
    db()->prepare('INSERT INTO cash_moves (closing_id, amount, note, user, created) VALUES (?,?,?,?,?)')
        ->execute([$c['id'], $amount, mb_substr($note, 0, 200), $user, now()]);
}

/* Summen einer Schicht (für X-Bericht = Zwischenstand und Z-Bericht = Abschluss) */
function closing_totals(array $c): array {
    $db = db();
    $id = (int)$c['id'];
    $t = ['sales' => 0, 'refunds' => 0, 'count_sales' => 0, 'count_refunds' => 0, 'discount' => 0, 'rounding' => 0,
          'gross' => 0, 'vat' => [], 'payments' => [], 'cash_moves' => 0, 'items' => 0, 'first' => null, 'last' => null];
    $st = $db->prepare('SELECT * FROM sales WHERE closing_id = ? ORDER BY number');
    $st->execute([$id]);
    foreach ($st as $s) {
        $isRefund = $s['type'] === 'refund';
        $t[$isRefund ? 'refunds' : 'sales'] += (int)$s['total'];
        $t[$isRefund ? 'count_refunds' : 'count_sales']++;
        $t['discount'] += (int)$s['discount'];
        $t['rounding'] += (int)$s['rounding'];
        $t['gross'] += (int)$s['total'];
        $t['payments'][$s['payment']] = ($t['payments'][$s['payment']] ?? 0) + (int)$s['total'];
        $t['first'] ??= (int)$s['number'];
        $t['last'] = (int)$s['number'];
    }
    $st = $db->prepare('SELECT i.vat, SUM(i.total) g, SUM(i.vat_amount) v, SUM(i.qty) q FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.closing_id = ? GROUP BY i.vat ORDER BY i.vat DESC');
    $st->execute([$id]);
    foreach ($st as $r) {
        $t['vat'][(int)$r['vat']] = ['gross' => (int)$r['g'], 'vat' => (int)$r['v'], 'net' => (int)$r['g'] - (int)$r['v']];
        $t['items'] += (float)$r['q'];
    }
    $st = $db->prepare('SELECT COALESCE(SUM(amount),0) FROM cash_moves WHERE closing_id = ?');
    $st->execute([$id]);
    $t['cash_moves'] = (int)$st->fetchColumn();
    $t['expected_cash'] = (int)$c['float'] + ($t['payments']['cash'] ?? 0) + $t['cash_moves'];
    return $t;
}
function close_day(int $counted, int $withdrawn, string $user): array {
    $db = db();
    $db->beginTransaction();
    try {
        $c = open_closing();
        if (!$c) throw new ShopError('Die Kasse ist nicht geöffnet.');
        $t = closing_totals($c);
        $number = (int)$db->query('SELECT COALESCE(MAX(number),0)+1 FROM closings')->fetchColumn();
        $closed = now();
        $prev = (string)$db->query('SELECT hash FROM closings WHERE number IS NOT NULL ORDER BY number DESC LIMIT 1')->fetchColumn();
        $json = json_encode($t, JSON_UNESCAPED_UNICODE);
        $hash = hash('sha256', implode('|', [$prev, $number, $closed, $counted, $t['expected_cash'], $json]));
        $db->prepare('UPDATE closings SET number=?, closed_at=?, closed_by=?, counted=?, expected=?, withdrawn=?, totals=?, hash=? WHERE id=?')
           ->execute([$number, $closed, $user, $counted, $t['expected_cash'], max(0, $withdrawn), $json, $hash, $c['id']]);
        $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
    $st = $db->prepare('SELECT * FROM closings WHERE id = ?');
    $st->execute([$c['id']]);
    return $st->fetch();
}

/* ---------- Verkauf ---------- */
function round_cash(int $total): int {
    $step = (int)setting('round_cash');
    return $step > 0 ? (int)(round($total / $step) * $step) : $total;
}

/**
 * $in = ['uuid', 'items' => [['product_id'|null, 'name', 'qty', 'price' (brutto je Einheit), 'discount' (Zeilenrabatt), 'vat']],
 *        'discount_pct' (Bonrabatt in %), 'payment', 'given', 'card_ref', 'note']
 */
function create_sale(array $in, string $user): array {
    $db = db();
    $uuid = (string)($in['uuid'] ?? '');
    if (!preg_match('/^[a-zA-Z0-9-]{8,64}$/', $uuid)) throw new ShopError('Ungültige Vorgangsnummer.');
    if ($s = sale_by_uuid($uuid)) return $s;            // schon gebucht (z. B. erneut gesendet nach Verbindungsabbruch)

    $payment = (string)($in['payment'] ?? '');
    if (!isset(enabled_payments()[$payment])) throw new ShopError('Diese Zahlungsart ist nicht freigeschaltet.');
    $items = $in['items'] ?? [];
    if (!is_array($items) || !$items) throw new ShopError('Der Warenkorb ist leer.');
    if (count($items) > 300) throw new ShopError('Zu viele Positionen.');

    $rates = vat_rates();
    $lines = [];
    $pst = $db->prepare('SELECT * FROM products WHERE id = ?');
    foreach ($items as $it) {
        $qty = round((float)($it['qty'] ?? 0), 3);
        if ($qty <= 0 || $qty > 100000) throw new ShopError('Ungültige Menge.');
        $price = (int)($it['price'] ?? 0);
        if ($price < 0 || $price > 100000000) throw new ShopError('Ungültiger Preis.');
        $p = null;
        if (!empty($it['product_id'])) {
            $pst->execute([(int)$it['product_id']]);
            $p = $pst->fetch() ?: null;
            if (!$p) throw new ShopError('Ein Artikel im Warenkorb existiert nicht mehr.');
        }
        $vat = $p ? (int)$p['vat'] : (int)($it['vat'] ?? $rates[0]);
        if (!$p && !in_array($vat, $rates, true)) $vat = $rates[0];
        $gross = (int)round($price * $qty);
        $disc = max(0, min($gross, (int)($it['discount'] ?? 0)));
        $lines[] = [
            'product_id' => $p ? (int)$p['id'] : null,
            'name' => mb_substr($p ? $p['name'] : (trim((string)($it['name'] ?? '')) ?: 'Diverse'), 0, 120),
            'barcode' => $p ? (string)$p['barcode'] : '',
            'qty' => $qty, 'unit_price' => $price, 'discount' => $disc, 'total' => $gross - $disc, 'vat' => $vat,
            'cost' => $p ? (int)round((int)$p['cost'] * $qty) : 0,
            'track' => $p && $p['track_stock'],
        ];
    }

    // Bonrabatt anteilig auf die Zeilen verteilen (damit die Steuer je Satz stimmt)
    $pct = max(0, min(100, (float)($in['discount_pct'] ?? 0)));
    $sub = array_sum(array_column($lines, 'total'));
    $cartDisc = (int)round($sub * $pct / 100);
    if ($cartDisc > 0 && $sub > 0) {
        $left = $cartDisc;
        foreach ($lines as $i => &$l) {
            $share = $i === array_key_last($lines) ? $left : (int)round($cartDisc * $l['total'] / $sub);
            $share = min($share, $l['total'], $left);
            $l['total'] -= $share; $l['discount'] += $share; $left -= $share;
        }
        unset($l);
    }
    $total = 0; $vatTotal = 0; $discount = 0;
    foreach ($lines as &$l) {
        $l['vat_amount'] = vat_of($l['total'], $l['vat']);
        $total += $l['total']; $vatTotal += $l['vat_amount']; $discount += $l['discount'];
    }
    unset($l);

    $rounding = 0;
    if ($payment === 'cash') { $r = round_cash($total); $rounding = $r - $total; $total = $r; }
    $given = $payment === 'cash' ? max((int)($in['given'] ?? 0), $total) : $total;

    $db->beginTransaction();
    try {
        $c = open_closing();
        if (!$c) throw new ShopError('Die Kasse ist nicht geöffnet. Bitte zuerst die Kasse öffnen.');
        $number = (int)$db->query('SELECT COALESCE(MAX(number),0)+1 FROM sales')->fetchColumn();
        $prev = (string)($db->query('SELECT hash FROM sales ORDER BY number DESC LIMIT 1')->fetchColumn() ?: str_repeat('0', 64));
        $created = now();
        $hash = sale_hash($prev, $number, $created, 'sale', $total, $payment, $lines);
        $db->prepare('INSERT INTO sales (uuid, number, type, closing_id, created, user, total, discount, vat_total, payment, given, change, rounding, card_ref, note, prev_hash, hash)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([$uuid, $number, 'sale', $c['id'], $created, $user, $total, $discount, $vatTotal, $payment, $given,
                      $given - $total, $rounding, mb_substr((string)($in['card_ref'] ?? ''), 0, 80), mb_substr((string)($in['note'] ?? ''), 0, 200), $prev, $hash]);
        $saleId = (int)$db->lastInsertId();
        $ist = $db->prepare('INSERT INTO sale_items (sale_id, product_id, name, barcode, qty, unit_price, discount, total, vat, vat_amount, cost) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        foreach ($lines as $l) {
            $ist->execute([$saleId, $l['product_id'], $l['name'], $l['barcode'], $l['qty'], $l['unit_price'], $l['discount'], $l['total'], $l['vat'], $l['vat_amount'], $l['cost']]);
            if ($l['track']) stock_move($l['product_id'], -$l['qty'], 'sale', $user, 'Bon ' . $number);
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        if ($e instanceof PDOException && str_contains($e->getMessage(), 'UNIQUE') && ($s = sale_by_uuid($uuid))) return $s;
        throw $e;
    }
    return sale_full($saleId);
}

/* Rückgabe/Storno: neuer Beleg mit negativen Beträgen. $qtys = [sale_item_id => Menge] (leer = alles) */
function refund_sale(int $saleId, array $qtys, string $payment, string $user, string $note = ''): array {
    $db = db();
    $orig = sale_full($saleId);
    if (!$orig || $orig['type'] !== 'sale') throw new ShopError('Beleg nicht gefunden.');
    if (!isset(PAYMENTS[$payment])) $payment = $orig['payment'];
    $done = refunded_qtys($saleId);
    $lines = [];
    foreach ($orig['items'] as $it) {
        $max = round((float)$it['qty'] - ($done[$it['id']] ?? 0), 3);
        $q = $qtys ? round((float)($qtys[$it['id']] ?? 0), 3) : $max;
        if ($q <= 0) continue;
        if ($q > $max + 0.0001) throw new ShopError('„' . $it['name'] . '“ wurde schon zurückgegeben.');
        $share = $q / (float)$it['qty'];
        $total = (int)round((int)$it['total'] * $share);
        $lines[] = ['ref_item_id' => (int)$it['id'], 'product_id' => $it['product_id'] ? (int)$it['product_id'] : null,
                    'name' => $it['name'], 'barcode' => $it['barcode'], 'qty' => -$q, 'unit_price' => (int)$it['unit_price'],
                    'discount' => -(int)round((int)$it['discount'] * $share), 'total' => -$total, 'vat' => (int)$it['vat'],
                    'vat_amount' => -vat_of($total, (int)$it['vat']), 'cost' => -(int)round((int)$it['cost'] * $share)];
    }
    if (!$lines) throw new ShopError('Es ist nichts mehr zum Zurückgeben übrig.');
    $total = array_sum(array_column($lines, 'total'));
    $rounding = 0;
    if ($payment === 'cash') { $r = -round_cash(-$total); $rounding = $r - $total; $total = $r; }

    $db->beginTransaction();
    try {
        $c = open_closing();
        if (!$c) throw new ShopError('Die Kasse ist nicht geöffnet. Bitte zuerst die Kasse öffnen.');
        $number = (int)$db->query('SELECT COALESCE(MAX(number),0)+1 FROM sales')->fetchColumn();
        $prev = (string)($db->query('SELECT hash FROM sales ORDER BY number DESC LIMIT 1')->fetchColumn() ?: str_repeat('0', 64));
        $created = now();
        $hash = sale_hash($prev, $number, $created, 'refund', $total, $payment, $lines);
        $db->prepare('INSERT INTO sales (uuid, number, type, ref_sale_id, closing_id, created, user, total, discount, vat_total, payment, given, change, rounding, note, prev_hash, hash)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([bin2hex(random_bytes(16)), $number, 'refund', $saleId, $c['id'], $created, $user, $total,
                      array_sum(array_column($lines, 'discount')), array_sum(array_column($lines, 'vat_amount')),
                      $payment, $total, 0, $rounding, mb_substr($note, 0, 200), $prev, $hash]);
        $rid = (int)$db->lastInsertId();
        $ist = $db->prepare('INSERT INTO sale_items (sale_id, ref_item_id, product_id, name, barcode, qty, unit_price, discount, total, vat, vat_amount, cost) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
        $tst = $db->prepare('SELECT track_stock FROM products WHERE id = ?');
        foreach ($lines as $l) {
            $ist->execute([$rid, $l['ref_item_id'], $l['product_id'], $l['name'], $l['barcode'], $l['qty'], $l['unit_price'], $l['discount'], $l['total'], $l['vat'], $l['vat_amount'], $l['cost']]);
            if ($l['product_id']) {
                $tst->execute([$l['product_id']]);
                if ($tst->fetchColumn()) stock_move($l['product_id'], -$l['qty'], 'refund', $user, 'Bon ' . $number . ' (Rückgabe zu ' . $orig['number'] . ')');
            }
        }
        $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
    return sale_full($rid);
}

function refunded_qtys(int $saleId): array {
    $st = db()->prepare('SELECT i.ref_item_id, -SUM(i.qty) q FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.ref_sale_id = ? GROUP BY i.ref_item_id');
    $st->execute([$saleId]);
    $out = [];
    foreach ($st as $r) $out[(int)$r['ref_item_id']] = (float)$r['q'];
    return $out;
}

function sale_hash(string $prev, int $number, string $created, string $type, int $total, string $payment, array $lines): string {
    $l = array_map(fn($x) => [$x['name'], $x['qty'] + 0, $x['unit_price'], $x['total'], $x['vat']], $lines);
    return hash('sha256', implode('|', [$prev, $number, $created, $type, $total, $payment, json_encode($l, JSON_UNESCAPED_UNICODE)]));
}
/* Prüft die Kette aller Belege. Gibt die erste fehlerhafte Bonnummer zurück oder null. */
function verify_chain(): ?int {
    $db = db();
    $prev = str_repeat('0', 64);
    $ist = $db->prepare('SELECT name, qty, unit_price, total, vat FROM sale_items WHERE sale_id = ? ORDER BY id');
    foreach ($db->query('SELECT * FROM sales ORDER BY number') as $s) {
        $ist->execute([$s['id']]);
        $lines = array_map(fn($r) => ['name' => $r['name'], 'qty' => (float)$r['qty'], 'unit_price' => (int)$r['unit_price'], 'total' => (int)$r['total'], 'vat' => (int)$r['vat']], $ist->fetchAll());
        if ($s['prev_hash'] !== $prev || sale_hash($prev, (int)$s['number'], $s['created'], $s['type'], (int)$s['total'], $s['payment'], $lines) !== $s['hash']) return (int)$s['number'];
        $prev = $s['hash'];
    }
    return null;
}

function sale_by_uuid(string $uuid): ?array {
    $st = db()->prepare('SELECT id FROM sales WHERE uuid = ?');
    $st->execute([$uuid]);
    $id = $st->fetchColumn();
    return $id ? sale_full((int)$id) : null;
}
function sale_full(int $id): ?array {
    $st = db()->prepare('SELECT * FROM sales WHERE id = ?');
    $st->execute([$id]);
    $s = $st->fetch();
    if (!$s) return null;
    $st = db()->prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id');
    $st->execute([$id]);
    $s['items'] = $st->fetchAll();
    $s['vat_lines'] = [];
    foreach ($s['items'] as $i) {
        $v = (int)$i['vat'];
        $s['vat_lines'][$v]['gross'] = ($s['vat_lines'][$v]['gross'] ?? 0) + (int)$i['total'];
        $s['vat_lines'][$v]['vat'] = ($s['vat_lines'][$v]['vat'] ?? 0) + (int)$i['vat_amount'];
    }
    if ($s['ref_sale_id']) {
        $st = db()->prepare('SELECT number FROM sales WHERE id = ?');
        $st->execute([$s['ref_sale_id']]);
        $s['ref_number'] = (int)$st->fetchColumn();
    }
    return $s;
}

/* Beleg für Bon-Druck und Kasse (alles, was das Tablet anzeigen muss) */
function receipt_data(array $s): array {
    return [
        'id' => (int)$s['id'], 'number' => (int)$s['number'], 'type' => $s['type'], 'ref_number' => $s['ref_number'] ?? null,
        'created' => $s['created'], 'user' => $s['user'], 'total' => (int)$s['total'], 'discount' => (int)$s['discount'],
        'vat_total' => (int)$s['vat_total'], 'payment' => $s['payment'], 'payment_label' => PAYMENTS_DA[$s['payment']] ?? $s['payment'],
        'given' => (int)$s['given'], 'change' => (int)$s['change'], 'rounding' => (int)$s['rounding'], 'card_ref' => $s['card_ref'],
        'items' => array_map(fn($i) => ['name' => $i['name'], 'qty' => (float)$i['qty'], 'unit_price' => (int)$i['unit_price'],
                                        'discount' => (int)$i['discount'], 'total' => (int)$i['total'], 'vat' => (int)$i['vat']], $s['items']),
        'vat_lines' => array_map(fn($v, $r) => ['rate' => $v, 'gross' => $r['gross'], 'vat' => $r['vat']], array_keys($s['vat_lines']), $s['vat_lines']),
        'hash' => substr($s['hash'], 0, 12),
    ];
}
function shop_header(): array {
    return ['name' => setting('shop_name'), 'line' => setting('shop_line'), 'address' => setting('shop_address'),
            'cvr' => setting('shop_cvr'), 'phone' => setting('shop_phone'), 'footer' => setting('receipt_footer'),
            'currency' => setting('currency')];
}
