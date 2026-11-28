<?php
/* JSON-Schnittstelle der Preiskalkulation. Nur für Admins; schreibende Aufrufe brauchen den CSRF-Schlüssel im Kopf X-CSRF.
   Gerechnet wird im Browser (kalk.js) – der Server speichert nur. */
declare(strict_types=1);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/shop.php';
require __DIR__ . '/../inc/web.php';
header('Content-Type: application/json; charset=utf-8');

function out(array $d, int $code = 200): never {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
if (!current_user()) out(['error' => 'Bitte neu anmelden.', 'login' => true], 401);
if (role() !== 'admin') out(['error' => 'Keine Berechtigung.'], 403);
$a = (string)($_GET['a'] ?? '');
$db = db();
$in = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals(csrf_token(), (string)($_SERVER['HTTP_X_CSRF'] ?? $_POST['csrf'] ?? ''))) out(['error' => 'Sitzung abgelaufen. Bitte Seite neu laden.'], 400);
    if (str_starts_with((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) $in = json_decode((string)file_get_contents('php://input'), true) ?: [];
}

const CALC_TYPES = ['area', 'length', 'piece', 'weight', 'cast', 'wear', 'volume'];
const CALC_SETTINGS = ['calc_wage', 'calc_markup', 'calc_fee', 'calc_vat', 'calc_round', 'calc_round_mode', 'calc_wage_mode', 'calc_need', 'calc_tax', 'calc_fixed', 'calc_hours', 'calc_am', 'calc_deduct_off'];

$num = function ($v, float $min = 0, float $max = 1e9): float {
    $v = is_string($v) ? str_replace(',', '.', trim($v)) : $v;
    return is_numeric($v) ? max($min, min($max, (float)$v)) : $min;
};
$numOrNull = fn($v) => ($v === null || $v === '') ? null : $num($v);
$txt = fn($v, int $max) => mb_substr(trim((string)$v), 0, $max);
$clean = function ($o): array {                  // nur einfache Werte aus Packung/Verbrauch übernehmen
    $r = [];
    if (is_array($o)) foreach ($o as $k => $v) if (preg_match('/^[a-zA-Z]{1,12}$/', (string)$k) && (is_scalar($v) || $v === null)) $r[$k] = is_string($v) ? mb_substr($v, 0, 20) : $v;
    return $r;
};

function img_url_calc(string $f): string { return $f !== '' && is_file(WEB_IMG_DIR . '/' . $f) ? '../../data/bilder/' . rawurlencode($f) : ''; }
function project_out(array $p, PDO $db): array {
    $st = $db->prepare('SELECT id, material_id, use FROM calc_lines WHERE project_id = ? ORDER BY sort, id');
    $st->execute([$p['id']]);
    $lines = array_map(fn($l) => ['id' => (int)$l['id'], 'material_id' => (int)$l['material_id'], 'use' => json_decode($l['use'], true) ?: new stdClass()], $st->fetchAll());
    $prod = null;
    if ($p['product_id']) {
        $s2 = $db->prepare('SELECT id, name, price, active FROM products WHERE id = ?'); $s2->execute([$p['product_id']]);
        if ($r = $s2->fetch()) $prod = ['id' => (int)$r['id'], 'name' => $r['name'], 'price' => (int)$r['price'], 'active' => (bool)$r['active']];
    }
    return ['id' => (int)$p['id'], 'category_id' => $p['category_id'] ? (int)$p['category_id'] : null, 'name' => $p['name'], 'notes' => $p['notes'],
            'status' => $p['status'], 'batch' => (int)$p['batch'], 'minutes' => (float)$p['minutes'],
            'wage' => $p['wage'] === null ? null : (float)$p['wage'], 'markup' => $p['markup'] === null ? null : (float)$p['markup'],
            'packaging' => (float)$p['packaging'], 'extra' => (float)$p['extra'], 'own_price' => $p['own_price'] === null ? null : (float)$p['own_price'],
            'product' => $prod, 'image' => img_url_calc((string)$p['image']), 'built' => (int)$p['built'],
            'timer_start' => $p['timer_start'] === null ? null : (int)$p['timer_start'], 'updated' => $p['updated'], 'lines' => $lines];
}
function material_out(array $m): array {
    $prod = null;
    if ($m['product_id']) {
        $st = db()->prepare('SELECT id, name, price, stock, active, web, image FROM products WHERE id = ?'); $st->execute([$m['product_id']]);
        if ($r = $st->fetch()) $prod = ['id' => (int)$r['id'], 'name' => $r['name'], 'price' => (int)$r['price'] / 100, 'stock' => (float)$r['stock'], 'active' => (bool)$r['active'], 'web' => (bool)$r['web'], 'image' => $r['image'] !== ''];
    }
    return ['id' => (int)$m['id'], 'name' => $m['name'], 'grp' => $m['grp'], 'type' => $m['type'], 'price' => (float)$m['price'], 'currency' => $m['currency'],
            'pack' => json_decode($m['pack'], true) ?: new stdClass(), 'supplier' => $m['supplier'], 'note' => $m['note'],
            'stock' => (float)$m['stock'], 'min_stock' => (float)$m['min_stock'], 'unit' => $m['unit'], 'craft' => (bool)$m['craft'], 'sell' => (bool)$m['sell'],
            'sell_units' => (int)$m['sell_units'], 'sell_name' => $m['sell_name'], 'margin' => $m['margin'] === null ? null : (float)$m['margin'],
            'sell_price' => $m['sell_price'] === null ? null : (int)$m['sell_price'] / 100, 'calc_price' => mat_calc_price($m) / 100, 'unit_cost' => mat_unit_cost($m) / 100,
            'weight' => (float)$m['weight'], 'size_l' => (float)$m['size_l'], 'size_w' => (float)$m['size_w'], 'size_h' => (float)$m['size_h'],
            'image' => img_url_calc((string)$m['image']), 'product' => $prod, 'updated' => $m['updated']];
}
function material_by_id(PDO $db, int $id): array {
    $m = mat_get($id);
    if (!$m) out(['error' => 'Eintrag nicht gefunden.'], 404);
    return $m;
}
function get_project(PDO $db, int $id): array {
    $st = $db->prepare('SELECT * FROM calc_projects WHERE id = ?'); $st->execute([$id]);
    $p = $st->fetch();
    if (!$p) out(['error' => 'Projekt nicht gefunden.'], 404);
    return $p;
}

try {
    if ($a === 'all') {
        $set = [];
        foreach (CALC_SETTINGS as $k) $set[substr($k, 5)] = setting($k);
        out([
            'settings' => $set, 'now' => time(),
            'eur_rate' => eur_rate(), 'lager' => ['margin' => setting('lager_margin'), 'round' => setting('lager_round')],
            'vat' => vat_rates()[0] / 10000,           // 2500 = 25 %
            'categories' => array_map(fn($c) => ['id' => (int)$c['id'], 'name' => $c['name']], $db->query('SELECT * FROM calc_categories ORDER BY sort, name')->fetchAll()),
            'materials' => array_map('material_out', $db->query('SELECT * FROM calc_materials ORDER BY grp, name')->fetchAll()),
            'reasons' => MAT_REASONS,
            'projects' => array_map(fn($p) => project_out($p, $db), $db->query('SELECT * FROM calc_projects ORDER BY updated DESC')->fetchAll()),
        ]);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'unbekannt'], 404);

    if ($a === 'settings') {
        $v = [
            'calc_wage' => $num($in['wage'] ?? 0, 0, 5000), 'calc_markup' => $num($in['markup'] ?? 0, 0, 1000), 'calc_fee' => $num($in['fee'] ?? 0, 0, 20),
            'calc_vat' => !empty($in['vat']) ? '1' : '0', 'calc_round' => in_array((string)($in['round'] ?? ''), ['0', '1', '5', '10'], true) ? (string)$in['round'] : '5',
            'calc_round_mode' => ($in['round_mode'] ?? '') === 'near' ? 'near' : 'up', 'calc_wage_mode' => ($in['wage_mode'] ?? '') === 'bedarf' ? 'bedarf' : 'standard',
            'calc_need' => $num($in['need'] ?? 0, 0, 1e7), 'calc_tax' => $num($in['tax'] ?? 0, 0, 80), 'calc_fixed' => $num($in['fixed'] ?? 0, 0, 1e7), 'calc_hours' => $num($in['hours'] ?? 0, 0, 744),
            'calc_am' => $num($in['am'] ?? 8, 0, 50),
            'calc_deduct_off' => implode(',', array_intersect(explode(',', (string)($in['deduct_off'] ?? '')), ['moms', 'fee', 'material', 'pack', 'extra', 'fixed', 'am', 'tax'])),
        ];
        foreach ($v as $k => $x) set_setting($k, (string)$x);
        out(['ok' => true]);
    }

    if ($a === 'category') {
        $name = $txt($in['name'] ?? '', 60);
        if (!empty($in['delete'])) {
            $db->prepare('UPDATE calc_projects SET category_id = NULL WHERE category_id = ?')->execute([(int)$in['id']]);
            $db->prepare('DELETE FROM calc_categories WHERE id = ?')->execute([(int)$in['id']]);
            out(['ok' => true]);
        }
        if ($name === '') out(['error' => 'Bitte einen Namen eingeben.'], 422);
        if (!empty($in['id'])) { $db->prepare('UPDATE calc_categories SET name = ? WHERE id = ?')->execute([$name, (int)$in['id']]); $id = (int)$in['id']; }
        else { $db->prepare('INSERT INTO calc_categories (name, sort) VALUES (?, 0)')->execute([$name]); $id = (int)$db->lastInsertId(); }
        out(['ok' => true, 'category' => ['id' => $id, 'name' => $name]]);
    }

    if ($a === 'material') {
        if (!empty($in['delete'])) {
            $m = material_by_id($db, (int)$in['id']);
            $db->prepare('DELETE FROM calc_materials WHERE id = ?')->execute([$m['id']]);
            web_delete_image((string)$m['image']);
            out(['ok' => true]);
        }
        $name = $txt($in['name'] ?? '', 120);
        $type = in_array($in['type'] ?? '', CALC_TYPES, true) ? $in['type'] : '';
        if ($name === '' || $type === '') out(['error' => 'Bitte Name und Art eingeben.'], 422);
        $sellPrice = $numOrNull($in['sell_price'] ?? null);
        $row = [$name, $txt($in['grp'] ?? '', 60), $type, $num($in['price'] ?? 0, 0, 1e7), ($in['currency'] ?? '') === 'EUR' ? 'EUR' : 'DKK',
                json_encode($clean($in['pack'] ?? [])), $txt($in['supplier'] ?? '', 120), $txt($in['note'] ?? '', 500),
                $num($in['min_stock'] ?? 0, 0, 1e6), $txt($in['unit'] ?? '', 20) ?: 'Packung', empty($in['craft']) ? 0 : 1, empty($in['sell']) ? 0 : 1,
                max(1, (int)$num($in['sell_units'] ?? 1, 1, 100000)), $txt($in['sell_name'] ?? '', 120), $numOrNull($in['margin'] ?? null),
                $sellPrice === null || $sellPrice <= 0 ? null : (int)round($sellPrice * 100),
                $num($in['weight'] ?? 0, 0, 100000), $num($in['size_l'] ?? 0, 0, 1000), $num($in['size_w'] ?? 0, 0, 1000), $num($in['size_h'] ?? 0, 0, 1000), now()];
        $cols = 'name=?, grp=?, type=?, price=?, currency=?, pack=?, supplier=?, note=?, min_stock=?, unit=?, craft=?, sell=?, sell_units=?, sell_name=?, margin=?, sell_price=?, weight=?, size_l=?, size_w=?, size_h=?, updated=?';
        $db->beginTransaction();
        if (!empty($in['id'])) {
            $old = material_by_id($db, (int)$in['id']);
            $db->prepare("UPDATE calc_materials SET $cols WHERE id=?")->execute([...$row, $old['id']]);
            $id = (int)$old['id'];
            if ((int)$old['sell_units'] !== max(1, (int)$num($in['sell_units'] ?? 1, 1, 100000))) mat_sync_product_stock(mat_get($id), user_name());
        } else {
            $db->prepare('INSERT INTO calc_materials (name, grp, type, price, currency, pack, supplier, note, min_stock, unit, craft, sell, sell_units, sell_name, margin, sell_price, weight, size_l, size_w, size_h, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute($row);
            $id = (int)$db->lastInsertId();
            $start = $num($in['stock'] ?? 0, 0, 1e6);
            if ($start > 0) mat_move($id, $start, 'purchase', user_name(), 'Anfangsbestand', (float)$row[3], $row[4]);
        }
        $m = mat_get($id);
        if ($m['product_id'] && !empty($in['update_shop'])) mat_to_product($id, user_name());
        $db->commit();
        out(['ok' => true, 'material' => material_out(mat_get($id))]);
    }

    /* Einkauf, Inventur, Bruch oder Korrektur buchen (Menge in Packungen) */
    if ($a === 'mat_move') {
        $m = material_by_id($db, (int)($in['id'] ?? 0));
        $kind = (string)($in['kind'] ?? '');
        $qty = $num($in['qty'] ?? 0, -1e6, 1e6);
        $note = $txt($in['note'] ?? '', 200);
        $db->beginTransaction();
        if ($kind === 'purchase') {
            if ($qty <= 0) out(['error' => 'Bitte die Menge eingeben.'], 422);
            $price = $numOrNull($in['price'] ?? null);
            $cur = ($in['currency'] ?? $m['currency']) === 'EUR' ? 'EUR' : 'DKK';
            if ($price !== null && $price > 0 && (abs($price - (float)$m['price']) > 0.001 || $cur !== $m['currency'])) {
                $db->prepare('UPDATE calc_materials SET price = ?, currency = ? WHERE id = ?')->execute([$price, $cur, $m['id']]);
            }
            if (($sup = $txt($in['supplier'] ?? '', 120)) !== '') $db->prepare('UPDATE calc_materials SET supplier = ? WHERE id = ?')->execute([$sup, $m['id']]);
            mat_move((int)$m['id'], $qty, 'purchase', user_name(), $note, $price ?? (float)$m['price'], $cur);
            $m2 = mat_get((int)$m['id']);
            if ($m2['product_id'] && !empty($in['update_shop'])) mat_to_product((int)$m['id'], user_name());
        } elseif ($kind === 'inventory') {
            $qty = max(0, $qty);
            mat_move((int)$m['id'], round($qty - (float)$m['stock'], 4), 'inventory', user_name(), $note);
        } elseif ($kind === 'waste') {
            mat_move((int)$m['id'], -abs($qty), 'waste', user_name(), $note);
        } elseif ($kind === 'correction') {
            mat_move((int)$m['id'], $qty, 'correction', user_name(), $note);
        } else out(['error' => 'unbekannt'], 422);
        $db->commit();
        out(['ok' => true, 'material' => material_out(mat_get((int)$m['id']))]);
    }

    /* Verlauf eines Eintrags */
    if ($a === 'mat_moves') {
        $st = $db->prepare('SELECT * FROM calc_material_moves WHERE material_id = ? ORDER BY id DESC LIMIT 60');
        $st->execute([(int)($in['id'] ?? 0)]);
        out(['moves' => array_map(fn($r) => ['qty' => (float)$r['qty'], 'after' => (float)$r['stock_after'], 'reason' => MAT_REASONS[$r['reason']] ?? $r['reason'],
            'price' => $r['price'] === null ? null : (float)$r['price'], 'currency' => $r['currency'], 'note' => $r['note'], 'user' => $r['user'], 'created' => $r['created']], $st->fetchAll())]);
    }

    /* Einzeln verkaufen: Artikel in Kasse und Online-Shop anlegen bzw. Preis und Bestand aktualisieren */
    if ($a === 'mat_shop') {
        $m = material_by_id($db, (int)($in['id'] ?? 0));
        if (!$m['sell']) $db->prepare('UPDATE calc_materials SET sell = 1 WHERE id = ?')->execute([$m['id']]);
        $db->beginTransaction();
        $r = mat_to_product((int)$m['id'], user_name());
        $db->commit();
        out(['ok' => true, 'created' => $r['created'], 'material' => material_out(mat_get((int)$m['id']))]);
    }

    if ($a === 'mat_photo') {
        $m = material_by_id($db, (int)($_POST['id'] ?? 0));
        if (!empty($_POST['remove'])) $img = '';
        elseif ($tmp = web_upload('photo')) $img = web_save_image('mat' . $m['id'], $tmp, 1400);
        else out(['error' => 'Kein Foto ausgewählt.'], 422);
        $db->prepare('UPDATE calc_materials SET image = ? WHERE id = ?')->execute([$img, $m['id']]);
        if ($img !== $m['image']) web_delete_image((string)$m['image']);
        if ($img !== '' && $m['product_id']) {
            try { $db->prepare('UPDATE products SET image = ? WHERE id = ?')->execute([save_product_image((int)$m['product_id'], WEB_IMG_DIR . '/' . $img), $m['product_id']]); } catch (Throwable $e) {}
        }
        out(['ok' => true, 'material' => material_out(mat_get((int)$m['id']))]);
    }

    if ($a === 'lager_settings') {
        set_setting('lager_margin', (string)$num($in['margin'] ?? 100, 0, 2000));
        set_setting('lager_round', in_array((string)($in['round'] ?? ''), ['0', '1', '5', '10', '95'], true) ? (string)$in['round'] : '1');
        out(['ok' => true, 'materials' => array_map('material_out', $db->query('SELECT * FROM calc_materials ORDER BY grp, name')->fetchAll())]);
    }

    if ($a === 'project') {
        if (!empty($in['delete'])) {
            $p = get_project($db, (int)$in['id']);
            $db->prepare('DELETE FROM calc_projects WHERE id = ?')->execute([$p['id']]);
            web_delete_image((string)$p['image']);
            out(['ok' => true]);
        }
        $name = $txt($in['name'] ?? '', 120) ?: 'Neues Projekt';
        $cat = (int)($in['category_id'] ?? 0);
        $row = [$cat ?: null, $name, $txt($in['notes'] ?? '', 4000), ($in['status'] ?? '') === 'fertig' ? 'fertig' : 'arbeit',
                max(1, (int)$num($in['batch'] ?? 1, 1, 10000)), $num($in['minutes'] ?? 0, 0, 100000),
                $numOrNull($in['wage'] ?? null), $numOrNull($in['markup'] ?? null), $num($in['packaging'] ?? 0), $num($in['extra'] ?? 0),
                $numOrNull($in['own_price'] ?? null), now()];
        $db->beginTransaction();
        if (!empty($in['id'])) {
            $p = get_project($db, (int)$in['id']);
            $db->prepare('UPDATE calc_projects SET category_id=?, name=?, notes=?, status=?, batch=?, minutes=?, wage=?, markup=?, packaging=?, extra=?, own_price=?, updated=? WHERE id=?')
               ->execute([...$row, $p['id']]);
            $id = (int)$p['id'];
        } else {
            $db->prepare('INSERT INTO calc_projects (category_id, name, notes, status, batch, minutes, wage, markup, packaging, extra, own_price, updated, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
               ->execute([...$row, now()]);
            $id = (int)$db->lastInsertId();
        }
        if (isset($in['lines']) && is_array($in['lines'])) {
            $db->prepare('DELETE FROM calc_lines WHERE project_id = ?')->execute([$id]);
            $ins = $db->prepare('INSERT INTO calc_lines (project_id, material_id, use, sort) VALUES (?,?,?,?)');
            $ok = $db->prepare('SELECT 1 FROM calc_materials WHERE id = ?');
            foreach (array_slice($in['lines'], 0, 200) as $i => $l) {
                $ok->execute([(int)($l['material_id'] ?? 0)]);
                if ($ok->fetchColumn()) $ins->execute([$id, (int)$l['material_id'], json_encode($clean($l['use'] ?? [])), $i]);
            }
        }
        $db->commit();
        out(['ok' => true, 'project' => project_out(get_project($db, $id), $db)]);
    }

    if ($a === 'copy') {
        $p = get_project($db, (int)($in['id'] ?? 0));
        $db->prepare('INSERT INTO calc_projects (category_id, name, notes, status, batch, minutes, wage, markup, packaging, extra, own_price, created, updated)
                      SELECT category_id, name || \' (Kopie)\', notes, \'arbeit\', batch, minutes, wage, markup, packaging, extra, own_price, ?, ? FROM calc_projects WHERE id = ?')->execute([now(), now(), $p['id']]);
        $id = (int)$db->lastInsertId();
        $db->prepare('INSERT INTO calc_lines (project_id, material_id, use, sort) SELECT ?, material_id, use, sort FROM calc_lines WHERE project_id = ?')->execute([$id, $p['id']]);
        out(['ok' => true, 'project' => project_out(get_project($db, $id), $db)]);
    }

    if ($a === 'timer') {
        $p = get_project($db, (int)($in['id'] ?? 0));
        if (($in['action'] ?? '') === 'start') $db->prepare('UPDATE calc_projects SET timer_start = ? WHERE id = ?')->execute([time(), $p['id']]);
        else $db->prepare('UPDATE calc_projects SET timer_start = NULL WHERE id = ?')->execute([$p['id']]);
        out(['ok' => true, 'project' => project_out(get_project($db, (int)$p['id']), $db), 'now' => time()]);
    }

    if ($a === 'built') {
        $p = get_project($db, (int)($in['id'] ?? 0));
        $n = (int)$num($in['n'] ?? 0, -100000, 100000);
        $db->beginTransaction();
        $db->prepare('UPDATE calc_projects SET built = max(0, built + ?) WHERE id = ?')->execute([$n, $p['id']]);
        /* Verbrauchtes Material vom Lager abziehen (Packungen rechnet der Browser aus) */
        foreach (array_slice(is_array($in['use'] ?? null) ? $in['use'] : [], 0, 200) as $u) {
            $packs = $num($u['packs'] ?? 0, -1e6, 1e6);
            if (abs($packs) < 1e-7 || !mat_get((int)($u['id'] ?? 0))) continue;
            mat_move((int)$u['id'], -$packs, $n < 0 ? 'built_back' : 'built', user_name(), $n . ' × ' . $p['name']);
        }
        /* Fertige Stücke in den Bestand des Kassen-Artikels */
        if (!empty($in['to_stock']) && $p['product_id'] && $n !== 0) {
            $chk = $db->prepare('SELECT id FROM products WHERE id = ?'); $chk->execute([$p['product_id']]);
            if ($chk->fetchColumn()) stock_move((int)$p['product_id'], $n, 'receipt', user_name(), '', 'gebaut: ' . $p['name']);
        }
        $db->commit();
        out(['ok' => true, 'project' => project_out(get_project($db, (int)$p['id']), $db)]);
    }

    if ($a === 'photo') {
        $p = get_project($db, (int)($_POST['id'] ?? 0));
        if (!empty($_POST['remove'])) $img = '';
        elseif ($tmp = web_upload('photo')) $img = web_save_image('calc' . $p['id'], $tmp, 1400);
        else out(['error' => 'Kein Foto ausgewählt.'], 422);
        $db->prepare('UPDATE calc_projects SET image = ? WHERE id = ?')->execute([$img, $p['id']]);
        if ($img !== $p['image']) web_delete_image((string)$p['image']);
        out(['ok' => true, 'project' => project_out(get_project($db, (int)$p['id']), $db)]);
    }

    /* Ermittelten Preis in die Kasse (und damit in den Online-Shop) übernehmen */
    if ($a === 'to_product') {
        $p = get_project($db, (int)($in['id'] ?? 0));
        $price = (int)round($num($in['price'] ?? 0, 0, 1e7) * 100);
        $cost = (int)round($num($in['cost'] ?? 0, 0, 1e7) * 100);
        if ($price <= 0) out(['error' => 'Es gibt noch keinen Verkaufspreis.'], 422);
        $pid = (int)$p['product_id'];
        if ($pid) { $s2 = $db->prepare('SELECT id, image FROM products WHERE id = ?'); $s2->execute([$pid]); $prod = $s2->fetch(); if (!$prod) $pid = 0; }
        if ($pid) {
            $db->prepare('UPDATE products SET price = ?, cost = ?, updated = ? WHERE id = ?')->execute([$price, $cost, now(), $pid]);
            $created = false;
        } else {
            $db->prepare("INSERT INTO products (name, price, cost, vat, track_stock, favorite, active, note, created, updated) VALUES (?,?,?,?,1,1,1,'Aus der Preiskalkulation',?,?)")
               ->execute([$p['name'], $price, $cost, vat_rates()[0], now(), now()]);
            $pid = (int)$db->lastInsertId();
            $db->prepare('UPDATE calc_projects SET product_id = ? WHERE id = ?')->execute([$pid, $p['id']]);
            $prod = ['image' => ''];
            $created = true;
        }
        if (($prod['image'] ?? '') === '' && $p['image'] !== '' && is_file(WEB_IMG_DIR . '/' . $p['image'])) {
            try { $db->prepare('UPDATE products SET image = ? WHERE id = ?')->execute([save_product_image($pid, WEB_IMG_DIR . '/' . $p['image']), $pid]); } catch (Throwable $e) {}
        }
        out(['ok' => true, 'created' => $created, 'project' => project_out(get_project($db, (int)$p['id']), $db)]);
    }

    /* Sicherung aus der alten Bastelwerkstatt-App übernehmen */
    if ($a === 'import') {
        $data = $in['data'] ?? null;
        if (!is_array($data) || ($data['app'] ?? '') !== 'julekontor-bastel' || !is_array($data['state'] ?? null)) out(['error' => 'Das ist keine Sicherung der Bastelwerkstatt.'], 422);
        $st = $data['state']; $images = is_array($data['images'] ?? null) ? $data['images'] : [];
        $eurOld = str_contains((string)($st['settings']['currency'] ?? '€'), '€');
        $rate = (float)str_replace(',', '.', setting('web_eur_rate')) ?: 7.46;
        $n = fn($v) => is_numeric(str_replace(',', '.', (string)$v)) ? (float)str_replace(',', '.', (string)$v) : 0.0;
        $db->beginTransaction();
        $catMap = []; $matMap = []; $cnt = ['categories' => 0, 'materials' => 0, 'projects' => 0];
        foreach ($st['categories'] ?? [] as $c) {
            $db->prepare('INSERT INTO calc_categories (name) VALUES (?)')->execute([mb_substr((string)($c['name'] ?? 'Kategorie'), 0, 60)]);
            $catMap[(string)($c['id'] ?? '')] = (int)$db->lastInsertId(); $cnt['categories']++;
        }
        foreach ($st['materials'] ?? [] as $m) {
            if (!in_array($m['type'] ?? '', CALC_TYPES, true)) continue;
            $db->prepare('INSERT INTO calc_materials (name, grp, type, price, currency, pack, note, updated) VALUES (?,?,?,?,?,?,?,?)')
               ->execute([mb_substr((string)($m['name'] ?? 'Material'), 0, 120), 'Aus der Bastelwerkstatt', $m['type'], $n($m['price'] ?? 0), $eurOld ? 'EUR' : 'DKK',
                          json_encode($clean($m['pack'] ?? [])), mb_substr((string)($m['note'] ?? ''), 0, 500), now()]);
            $matMap[(string)($m['id'] ?? '')] = (int)$db->lastInsertId(); $cnt['materials']++;
        }
        foreach ($st['projects'] ?? [] as $p) {
            $conv = fn($v) => ($v === '' || $v === null) ? null : $n($v) * ($eurOld ? $rate : 1);
            $db->prepare('INSERT INTO calc_projects (category_id, name, notes, status, batch, minutes, wage, markup, packaging, extra, built, created, updated) VALUES (?,?,?,?,1,?,?,?,0,?,?,?,?)')
               ->execute([$catMap[(string)($p['categoryId'] ?? '')] ?? null, mb_substr((string)($p['name'] ?? 'Projekt'), 0, 120), mb_substr((string)($p['notes'] ?? ''), 0, 4000),
                          !empty($p['done']) ? 'fertig' : 'arbeit', $n($p['minutes'] ?? 0), null,
                          ($p['markup'] ?? '') === '' ? null : $n($p['markup']), $conv($p['extra'] ?? null) ?? 0, is_array($p['builds'] ?? null) ? count($p['builds']) : 0, now(), now()]);
            $pid = (int)$db->lastInsertId(); $cnt['projects']++;
            $ins = $db->prepare('INSERT INTO calc_lines (project_id, material_id, use, sort) VALUES (?,?,?,?)');
            foreach (($p['lines'] ?? []) as $i => $l) if (isset($matMap[(string)($l['materialId'] ?? '')])) $ins->execute([$pid, $matMap[(string)$l['materialId']], json_encode($clean($l['use'] ?? [])), $i]);
            $first = (string)(($p['images'] ?? [])[0] ?? '');
            if ($first !== '' && isset($images[$first]) && preg_match('#^data:image/(jpeg|png|webp);base64,(.+)$#', (string)$images[$first], $mm)) {
                $tmp = tempnam(sys_get_temp_dir(), 'jk');
                file_put_contents($tmp, base64_decode($mm[2]));
                try { $db->prepare('UPDATE calc_projects SET image = ? WHERE id = ?')->execute([web_save_image('calc' . $pid, $tmp, 1400), $pid]); } catch (Throwable $e) {}
                @unlink($tmp);
            }
        }
        $db->commit();
        out(['ok' => true, 'counts' => $cnt]);
    }

    out(['error' => 'unbekannt'], 404);
} catch (ShopError $e) {
    if ($db->inTransaction()) $db->rollBack();
    out(['error' => $e->getMessage()], 422);
} catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    error_log('julekontor kalkulation: ' . $e->getMessage());
    out(['error' => 'Fehler beim Speichern. Bitte noch einmal versuchen.'], 500);
}
