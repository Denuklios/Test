<?php
/* Versand: Ware in Kartons packen und je Versanddienst den Preis nach Gewicht und Größe finden.
   Gepackt wird so: größte Stücke zuerst, jedes Stück in das erste Paket, in das es noch passt,
   sonst ein neues Paket. Am Ende bekommt jedes Paket den kleinsten Karton, in den alles passt. */
declare(strict_types=1);
require_once __DIR__ . '/db.php';

const SHIP_CARRIERS = ['postnord' => 'PostNord', 'gls' => 'GLS', 'dao' => 'DAO'];
const SHIP_SERVICES = ['shop' => 'Paketshop', 'home' => 'an die Haustür'];
const SHIP_COUNTRIES = ['dk' => 'Dänemark', 'de' => 'Deutschland'];

function ship_dims(float $l, float $w, float $h): array { $d = [max(0.1, $l), max(0.1, $w), max(0.1, $h)]; rsort($d); return $d; }
function ship_fits(array $item, array $box): bool { return $item[0] <= $box[0] + 0.01 && $item[1] <= $box[1] + 0.01 && $item[2] <= $box[2] + 0.01; }
function ship_boxes(): array {
    $b = db()->query('SELECT * FROM ship_boxes WHERE active = 1')->fetchAll();
    foreach ($b as &$x) { $x['d'] = ship_dims((float)$x['l'], (float)$x['w'], (float)$x['h']); $x['vol'] = $x['d'][0] * $x['d'][1] * $x['d'][2]; }
    usort($b, fn($a, $c) => $a['vol'] <=> $c['vol']);
    return $b;
}
/* $units: Liste von ['d' => [l,w,h], 'g' => Gramm]. Ergebnis: Pakete mit Karton, Maßen und Gewicht. */
function ship_pack(array $units): array {
    $boxes = ship_boxes();
    $fill = max(0.3, min(1, (float)setting('ship_fill') / 100));
    $maxG = max(1000, (float)setting('ship_max'));
    usort($units, fn($a, $b) => $b['d'][0] * $b['d'][1] * $b['d'][2] <=> $a['d'][0] * $a['d'][1] * $a['d'][2]);
    $parcels = [];
    foreach ($units as $u) {
        $vol = $u['d'][0] * $u['d'][1] * $u['d'][2];
        $placed = false;
        foreach ($parcels as &$p) {
            if ($p['box'] === null || !ship_fits($u['d'], $p['box']['d'])) continue;
            if ($p['vol'] + $vol > $p['box']['vol'] * $fill || $p['g'] + $u['g'] + $p['box']['weight'] > $maxG) continue;
            $p['units'][] = $u; $p['vol'] += $vol; $p['g'] += $u['g']; $placed = true; break;
        }
        unset($p);
        if ($placed) continue;
        $big = null;                                          // größter Karton, in den das Stück passt
        foreach (array_reverse($boxes) as $b) if (ship_fits($u['d'], $b['d']) && $vol <= $b['vol'] * $fill + 0.01) { $big = $b; break; }
        $parcels[] = ['box' => $big, 'units' => [$u], 'vol' => $vol, 'g' => $u['g']];
    }
    $out = [];
    foreach ($parcels as $p) {
        $box = $p['box'];
        if ($box) foreach ($boxes as $b) {                    // kleinster Karton, in den alles passt
            if ($b['vol'] * $fill + 0.01 < $p['vol']) continue;
            $ok = true; foreach ($p['units'] as $u) if (!ship_fits($u['d'], $b['d'])) { $ok = false; break; }
            if ($ok) { $box = $b; break; }
        }
        $d = $box ? $box['d'] : ship_dims($p['units'][0]['d'][0] + 2, $p['units'][0]['d'][1] + 2, $p['units'][0]['d'][2] + 2);
        $out[] = ['box' => $box ? $box['name'] : 'eigene Verpackung', 'box_id' => $box ? (int)$box['id'] : 0, 'd' => $d,
                  'g' => (int)round($p['g'] + ($box ? (float)$box['weight'] : 100)), 'cost' => $box ? (int)$box['cost'] : 0, 'n' => count($p['units'])];
    }
    return $out;
}
/* Stück aus dem Warenkorb: [['qty' => n, 'weight' => g, 'l' => .., 'w' => .., 'h' => ..], …] */
function ship_units(array $lines): array {
    $defG = max(1, (float)setting('ship_def_weight'));
    $defD = array_map('floatval', array_pad(preg_split('/\s*[x×*]\s*/i', setting('ship_def_size')), 3, 10));
    $u = [];
    foreach ($lines as $l) {
        $has = (float)$l['l'] > 0 && (float)$l['w'] > 0 && (float)$l['h'] > 0;
        $d = $has ? ship_dims((float)$l['l'], (float)$l['w'], (float)$l['h']) : ship_dims(...array_slice($defD, 0, 3));
        $g = (float)$l['weight'] > 0 ? (float)$l['weight'] : $defG;
        for ($i = 0; $i < min(200, (int)$l['qty']); $i++) $u[] = ['d' => $d, 'g' => $g];
    }
    return $u;
}
function ship_rates_for(string $country): array {
    $st = db()->prepare('SELECT * FROM ship_rates WHERE country = ? AND active = 1 AND price > 0 ORDER BY max_weight, price');
    $st->execute([$country]);
    return $st->fetchAll();
}
/* Versandarten für ein Land mit Preis für diese Pakete. Ohne eingeschaltete Preise gilt der feste Preis aus den Shop-Einstellungen. */
function ship_methods(string $country, array $parcels, int $subtotal): array {
    $free = (int)setting('web_ship_free');
    $isFree = $free > 0 && $subtotal >= $free;
    $pack = setting('ship_pack_pass') === '1' ? array_sum(array_column($parcels, 'cost')) : 0;
    $groups = [];
    foreach (ship_rates_for($country) as $r) $groups[$r['carrier'] . '-' . $r['service']][] = $r;
    $m = [];
    foreach ($groups as $key => $rates) {
        $sum = 0;
        foreach ($parcels as $p) {
            $hit = null;
            foreach ($rates as $r) {
                if ($p['g'] > (float)$r['max_weight']) continue;
                if ((float)$r['max_len'] > 0 && $p['d'][0] > (float)$r['max_len']) continue;
                if ((float)$r['max_sum'] > 0 && array_sum($p['d']) > (float)$r['max_sum']) continue;
                if ($hit === null || (int)$r['price'] < (int)$hit['price']) $hit = $r;
            }
            if (!$hit) { $sum = null; break; }
            $sum += (int)$hit['price'];
        }
        if ($sum === null) continue;
        [$c, $s] = explode('-', $key);
        $m[] = ['id' => $key, 'carrier' => $c, 'service' => $s, 'label' => (SHIP_CARRIERS[$c] ?? $c), 'price' => $isFree ? 0 : $sum + $pack];
    }
    if (!$m && !ship_rates_for($country)) {
        $flat = max(0, (int)setting($country === 'de' ? 'web_ship_de' : 'web_ship_dk'));
        $m[] = ['id' => 'standard', 'carrier' => '', 'service' => 'standard', 'label' => '', 'price' => $isFree ? 0 : $flat * max(1, count($parcels))];
    }
    usort($m, fn($a, $b) => $a['price'] <=> $b['price']);
    return $m;
}
