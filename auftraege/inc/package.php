<?php
/**
 * Versand: Paketgewicht und Kartonvorschlag je Auftrag.
 * Gewicht = Summe (Stückgewicht × Menge) aller Positionen + Eigengewicht des Kartons.
 * Karton: der kleinste aktive Karton, in den
 *   - jedes feste Teil passt (sortierte Maße Teil ≤ sortierte Innenmaße Karton),
 *   - das Volumen aller Teile mit etwas Luft passt (Füllgrad höchstens 85 %),
 *   - das Gesamtgewicht unter seinem Höchstgewicht bleibt.
 * Faltbare Ware (Textilien) zählt nur mit ihrem Volumen, nicht mit ihren Einzelmaßen.
 * Passt nichts, wird der größte Karton mehrfach vorgeschlagen (mehrere Pakete).
 */

const WF_PACK_FILL = 0.85;

function wf_cartons(PDO $db, bool $activeOnly = false): array
{
    $rows = $db->query('SELECT * FROM cartons' . ($activeOnly ? ' WHERE active = 1' : '') . ' ORDER BY len_mm * wid_mm * hgt_mm, sort, id')->fetchAll();
    return array_map(function ($c) {
        foreach (['id', 'len_mm', 'wid_mm', 'hgt_mm', 'weight_g', 'max_g', 'active', 'sort'] as $k) {
            $c[$k] = (int)$c[$k];
        }
        return $c;
    }, $rows);
}

function wf_pack_dims(array $x): array
{
    $d = [(int)$x['len_mm'], (int)$x['wid_mm'], (int)$x['hgt_mm']];
    rsort($d);
    return $d;
}

function wf_pack_fits(array $item, array $box): bool
{
    $a = wf_pack_dims($item);
    $b = wf_pack_dims($box);
    return $a[0] <= $b[0] && $a[1] <= $b[1] && $a[2] <= $b[2];
}

/** Paketdaten für einen Auftrag (Positionen aus orders.items, Produktdaten aus products). */
function wf_package(PDO $db, array $order): array
{
    $items = is_array($order['items'] ?? null) ? $order['items'] : (json_decode((string)($order['items'] ?? '[]'), true) ?: []);
    $ids = array_values(array_filter(array_map(fn($i) => (int)($i['product_id'] ?? 0), $items)));
    $prod = [];
    if ($ids) {
        $q = $db->prepare('SELECT id, name, weight_g, len_mm, wid_mm, hgt_mm, foldable FROM products WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
        $q->execute($ids);
        foreach ($q->fetchAll() as $p) {
            $prod[(int)$p['id']] = $p;
        }
    }
    $lines = [];
    $missing = [];
    $itemsG = 0;
    $vol = 0.0;
    $rigid = [];
    foreach ($items as $i) {
        $qty = max(0, (int)($i['qty'] ?? 0));
        $p = $prod[(int)($i['product_id'] ?? 0)] ?? null;
        if (!$qty) {
            continue;
        }
        if (!$p || (int)$p['weight_g'] <= 0) {
            $missing[] = (string)($i['name'] ?? '');
        }
        $w = $p ? (int)$p['weight_g'] : 0;
        $hasDims = $p && (int)$p['len_mm'] > 0 && (int)$p['wid_mm'] > 0 && (int)$p['hgt_mm'] > 0;
        if ($hasDims) {
            $vol += (int)$p['len_mm'] * (int)$p['wid_mm'] * (int)$p['hgt_mm'] * $qty;
            if (!(int)$p['foldable']) {
                $rigid[] = $p;
            }
        } elseif ($p && !in_array((string)($i['name'] ?? ''), $missing, true)) {
            $missing[] = (string)($i['name'] ?? '');
        }
        $itemsG += $w * $qty;
        $lines[] = ['name' => (string)($i['name'] ?? ''), 'qty' => $qty, 'weight_g' => $w, 'sum_g' => $w * $qty, 'dims' => $hasDims ? [(int)$p['len_mm'], (int)$p['wid_mm'], (int)$p['hgt_mm']] : null];
    }

    $cartons = wf_cartons($db, true);
    $chosen = null;
    $auto = null;
    $parcels = 1;
    foreach ($cartons as $c) {
        $cv = $c['len_mm'] * $c['wid_mm'] * $c['hgt_mm'];
        if ($vol > $cv * WF_PACK_FILL) {
            continue;
        }
        if ($c['max_g'] > 0 && $itemsG + $c['weight_g'] > $c['max_g']) {
            continue;
        }
        foreach ($rigid as $r) {
            if (!wf_pack_fits($r, $c)) {
                continue 2;
            }
        }
        $auto = $c;
        break;
    }
    if (!$auto && $cartons && $vol > 0) {
        // nichts passt in einen Karton: größten Karton nehmen und auf mehrere Pakete verteilen
        $big = end($cartons);
        $cv = $big['len_mm'] * $big['wid_mm'] * $big['hgt_mm'] * WF_PACK_FILL;
        $byVol = (int)ceil($vol / max(1, $cv));
        $byWeight = $big['max_g'] > 0 ? (int)ceil($itemsG / max(1, $big['max_g'] - $big['weight_g'])) : 1;
        $parcels = max(1, $byVol, $byWeight);
        $auto = $big;
    }
    $manual = (int)($order['carton_id'] ?? 0);
    if ($manual) {
        foreach (wf_cartons($db) as $c) {
            if ($c['id'] === $manual) {
                $chosen = $c;
            }
        }
    }
    $box = $chosen ?: $auto;
    if ($chosen) {
        $parcels = 1;
    }
    $totalG = $itemsG + ($box ? $box['weight_g'] * $parcels : 0);
    return [
        'lines' => $lines,
        'missing' => array_values(array_unique(array_filter($missing))),
        'items_g' => $itemsG,
        'volume_l' => round($vol / 1e6, 1),
        'carton' => $box,
        'carton_auto' => $auto,
        'manual' => (bool)$chosen,
        'parcels' => $parcels,
        'total_g' => $totalG,
        'fill' => $box && $vol > 0 ? round($vol / ($box['len_mm'] * $box['wid_mm'] * $box['hgt_mm'] * $parcels) * 100) : 0,
    ];
}
