<?php
/* Einkauf & Lager: eine Liste für alles, was eingekauft wird (Tabelle calc_materials).
   - „Bastelmaterial“ ist in der Preiskalkulation wählbar.
   - „Einzeln verkaufen“ legt einen Artikel in Kasse und Shop an (mit Aufschlag) und hält dessen Bestand gleich.
   Bestand wird in Packungen geführt (eine Packung = so wie eingekauft), verkauft wird in Stück (sell_units je Packung). */
declare(strict_types=1);
require_once __DIR__ . '/db.php';

const MAT_REASONS = ['purchase' => 'Einkauf', 'built' => 'Verbastelt', 'built_back' => 'Bau zurückgenommen', 'sale' => 'Verkauf Kasse', 'refund' => 'Rückgabe Kasse',
                     'web' => 'Online-Bestellung', 'web_cancel' => 'Online-Bestellung storniert', 'inventory' => 'Inventur', 'correction' => 'Korrektur',
                     'waste' => 'Bruch / Schwund', 'receipt' => 'Wareneingang'];

function eur_rate(): float { return (float)str_replace(',', '.', setting('web_eur_rate')) ?: 7.46; }
function mat_get(int $id): ?array {
    $st = db()->prepare('SELECT * FROM calc_materials WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: null;
}
/* Einkaufspreis einer Packung in Kronen */
function mat_pack_dkk(array $m): float { return (float)$m['price'] * ($m['currency'] === 'EUR' ? eur_rate() : 1); }
/* Einkaufspreis eines Verkaufsstücks in Øre */
function mat_unit_cost(array $m): int { return (int)round(mat_pack_dkk($m) / max(1, (int)$m['sell_units']) * 100); }
function mat_margin(array $m): float { return $m['margin'] === null || $m['margin'] === '' ? (float)setting('lager_margin') : (float)$m['margin']; }
/* Verkaufspreis runden (Kronen rein, Øre raus) */
function mat_round(float $kr): int {
    $r = setting('lager_round');
    if ($r === '95') return (int)(max(1, ceil($kr + 0.05)) * 100 - 5);
    $step = in_array($r, ['1', '5', '10'], true) ? (int)$r : 0;
    if ($step === 0) return (int)round($kr * 100);
    return (int)(ceil($kr / $step - 1e-9) * $step * 100);
}
/* Errechneter Verkaufspreis brutto in Øre: Einkauf + Aufschlag + Moms, gerundet */
function mat_calc_price(array $m): int {
    $vat = vat_rates()[0] / 10000;
    return mat_round(mat_unit_cost($m) / 100 * (1 + mat_margin($m) / 100) * (1 + $vat));
}
function mat_sale_price(array $m): int { return $m['sell_price'] !== null && (int)$m['sell_price'] > 0 ? (int)$m['sell_price'] : mat_calc_price($m); }

/* Bestand eines Materials ändern (in Packungen). $fromProduct: die Änderung kam vom verknüpften Artikel, der schon stimmt. */
function mat_move(int $id, float $qty, string $reason, string $user, string $note = '', ?float $price = null, string $currency = '', bool $fromProduct = false): float {
    $db = db();
    $db->prepare('UPDATE calc_materials SET stock = round(stock + ?, 4), updated = ? WHERE id = ?')->execute([$qty, now(), $id]);
    $m = mat_get($id);
    if (!$m) return 0.0;
    $db->prepare('INSERT INTO calc_material_moves (material_id, qty, stock_after, reason, price, currency, note, user, created) VALUES (?,?,?,?,?,?,?,?,?)')
       ->execute([$id, $qty, (float)$m['stock'], $reason, $price, $currency, mb_substr($note, 0, 200), $user, now()]);
    if (!$fromProduct) mat_sync_product_stock($m, $user);
    return (float)$m['stock'];
}
/* Bestand des verknüpften Artikels = Packungen × Stück je Packung */
function mat_sync_product_stock(array $m, string $user): void {
    if (!$m['product_id']) return;
    $db = db();
    $st = $db->prepare('SELECT stock FROM products WHERE id = ?');
    $st->execute([$m['product_id']]);
    $old = $st->fetchColumn();
    if ($old === false) return;
    $new = round((float)$m['stock'] * max(1, (int)$m['sell_units']), 3);
    $diff = round($new - (float)$old, 3);
    if (abs($diff) < 0.0005) return;
    $db->prepare('UPDATE products SET stock = ?, track_stock = 1, updated = ? WHERE id = ?')->execute([$new, now(), $m['product_id']]);
    $db->prepare('INSERT INTO stock_moves (product_id, qty, stock_after, reason, ref, note, user, created) VALUES (?,?,?,?,?,?,?,?)')
       ->execute([$m['product_id'], $diff, $new, 'material', '', 'aus Einkauf & Lager', $user, now()]);
}
/* Wird von stock_move() aufgerufen: Verkauf in Kasse/Shop zieht auch beim Material ab */
function mat_from_product_move(int $productId, float $qty, string $reason, string $user, string $ref): void {
    $st = db()->prepare('SELECT id, sell_units FROM calc_materials WHERE product_id = ?');
    $st->execute([$productId]);
    foreach ($st->fetchAll() as $m) mat_move((int)$m['id'], $qty / max(1, (int)$m['sell_units']), isset(MAT_REASONS[$reason]) ? $reason : 'correction', $user, $ref, null, '', true);
}

/* Artikel in Kasse und Shop anlegen oder aktualisieren (Preis, Einkauf, Gewicht, Maße, Bestand, Foto) */
function mat_to_product(int $id, string $user): array {
    $db = db();
    $m = mat_get($id);
    if (!$m) throw new ShopError('Eintrag nicht gefunden.');
    $price = mat_sale_price($m);
    if ($price <= 0) throw new ShopError('Bitte zuerst den Einkaufspreis eintragen.');
    $name = trim((string)$m['sell_name']) !== '' ? trim((string)$m['sell_name']) : (string)$m['name'];
    $pid = (int)$m['product_id'];
    if ($pid) { $st = $db->prepare('SELECT id, image FROM products WHERE id = ?'); $st->execute([$pid]); $prod = $st->fetch(); if (!$prod) $pid = 0; }
    $vals = [$price, mat_unit_cost($m), (float)$m['weight'], (float)$m['size_l'], (float)$m['size_w'], (float)$m['size_h'], now()];
    if ($pid) {
        $db->prepare('UPDATE products SET price = ?, cost = ?, weight = ?, size_l = ?, size_w = ?, size_h = ?, updated = ?, track_stock = 1, active = 1, web = 1 WHERE id = ?')->execute([...$vals, $pid]);
        $created = false;
    } else {
        $cat = $db->query("SELECT id FROM categories WHERE name = 'Bastelbedarf'")->fetchColumn();
        if (!$cat) { $db->prepare("INSERT INTO categories (name, color, sort) VALUES ('Bastelbedarf', '#2f6b3a', 90)")->execute(); $cat = (int)$db->lastInsertId(); }
        $db->prepare("INSERT INTO products (name, barcode, category_id, price, cost, weight, size_l, size_w, size_h, updated, vat, track_stock, favorite, active, web, web_ship, note, created, unit)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,1,1,1,'Aus Einkauf & Lager',?,'Stk.')")
           ->execute([$name, null, (int)$cat, ...$vals, vat_rates()[0], now()]);
        $pid = (int)$db->lastInsertId();
        $db->prepare('UPDATE calc_materials SET product_id = ? WHERE id = ?')->execute([$pid, $id]);
        $m['product_id'] = $pid;
        $prod = ['image' => ''];
        $created = true;
    }
    if (($prod['image'] ?? '') === '' && $m['image'] !== '' && defined('WEB_IMG_DIR') && is_file(WEB_IMG_DIR . '/' . $m['image'])) {
        try { $db->prepare('UPDATE products SET image = ? WHERE id = ?')->execute([save_product_image($pid, WEB_IMG_DIR . '/' . $m['image']), $pid]); } catch (Throwable $e) {}
    }
    mat_sync_product_stock($m, $user);
    return ['product_id' => $pid, 'created' => $created, 'price' => $price, 'name' => $name];
}
