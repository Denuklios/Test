<?php
declare(strict_types=1);

/**
 * Produktdaten zu einem Barcode (EAN/GTIN/UPC) aus offenen Datenbanken holen.
 * 1. UPCitemdb (kostenlose Stufe, ca. 100 Abfragen am Tag je Server, gut bei Markenartikeln/Textilien)
 * 2. Open Products Facts (frei, Non-Food)
 * Es geht nur die Nummer hinaus, keine Kundendaten. Ergebnisse werden 30 Tage zwischengespeichert.
 * Abdeckung ist lückenhaft: viele Rohlinge und Großhandelsware sind dort nicht oder nur teilweise erfasst.
 */

function wf_gtin_valid(string $code): bool
{
    return (bool)preg_match('/^\d{8,14}$/', $code);
}

/** "12 x 8.5 x 3 inches" / "30 x 20 x 2 cm" → [L, B, H] in cm */
function wf_gtin_dims(string $s): ?array
{
    if (!preg_match('/([\d.,]+)\s*[x×]\s*([\d.,]+)\s*[x×]\s*([\d.,]+)\s*(cm|mm|in|inch|inches|")?/i', $s, $m)) {
        return null;
    }
    $f = match (strtolower($m[4] ?? '')) { 'mm' => 0.1, 'cm' => 1.0, '' => 1.0, default => 2.54 };
    $d = array_map(fn($v) => round((float)str_replace(',', '.', $v) * $f, 1), [$m[1], $m[2], $m[3]]);
    return min($d) > 0 ? $d : null;
}

/** "1.2 lb", "300 g", "0,5 kg", "8 oz" → Gramm */
function wf_gtin_grams(string $s): int
{
    if (!preg_match('/([\d.,]+)\s*(kg|g|gr|lbs?|pounds?|oz|ounces?)\b/i', $s, $m)) {
        return 0;
    }
    $v = (float)str_replace(',', '.', $m[1]);
    $u = strtolower($m[2]);
    $g = match (true) { $u === 'kg' => $v * 1000, str_starts_with($u, 'lb') || str_starts_with($u, 'pound') => $v * 453.592, str_starts_with($u, 'oz') || str_starts_with($u, 'ounce') => $v * 28.3495, default => $v };
    return (int)round($g);
}

function wf_gtin_lookup(PDO $db, string $code): array
{
    $key = 'gtin_' . $code;
    $q = $db->prepare('SELECT value FROM meta WHERE key = ?');
    $q->execute([$key]);
    $c = json_decode((string)($q->fetchColumn() ?: ''), true);
    if (is_array($c) && ($c['at'] ?? 0) > time() - 30 * 86400) {
        return $c['r'];
    }
    $r = ['found' => false, 'source' => '', 'name' => '', 'brand' => '', 'color' => '', 'size' => '', 'weight_g' => 0, 'dims_cm' => null, 'limited' => false];

    $raw = wf_http('https://api.upcitemdb.com/prod/trial/lookup?upc=' . $code, null, 8);
    $answered = $raw !== null;
    $r['limited'] = $raw === null;   // UPCitemdb antwortet bei erreichtem Tageslimit mit Fehlerstatus
    $j = json_decode((string)$raw, true);
    $it = is_array($j) ? ($j['items'][0] ?? null) : null;
    if (is_array($it) && trim((string)($it['title'] ?? '')) !== '') {
        $r = array_merge($r, ['found' => true, 'source' => 'UPCitemdb', 'name' => trim((string)$it['title']), 'brand' => trim((string)($it['brand'] ?? '')),
            'color' => trim((string)($it['color'] ?? '')), 'size' => trim((string)($it['size'] ?? '')),
            'weight_g' => wf_gtin_grams((string)($it['weight'] ?? '')), 'dims_cm' => wf_gtin_dims((string)($it['dimension'] ?? ''))]);
    } else {
        $raw = wf_http('https://world.openproductsfacts.org/api/v2/product/' . $code . '.json?fields=product_name,brands,quantity', null, 8);
        $answered = $answered || $raw !== null;
        $j = json_decode((string)$raw, true);
        $p = is_array($j) && (int)($j['status'] ?? 0) === 1 ? ($j['product'] ?? null) : null;
        if (is_array($p) && trim((string)($p['product_name'] ?? '')) !== '') {
            $r = array_merge($r, ['found' => true, 'source' => 'Open Products Facts', 'name' => trim((string)$p['product_name']),
                'brand' => trim(explode(',', (string)($p['brands'] ?? ''))[0]), 'weight_g' => wf_gtin_grams((string)($p['quantity'] ?? ''))]);
        }
    }
    // nur echte Antworten merken (nicht „Limit erreicht“ oder Netzfehler), damit später erneut gesucht werden kann
    if ($r['found'] || ($answered && !$r['limited'])) {
        $db->prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')->execute([$key, json_encode(['at' => time(), 'r' => $r], JSON_UNESCAPED_UNICODE)]);
    }
    return $r;
}
