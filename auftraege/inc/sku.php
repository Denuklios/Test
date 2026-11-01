<?php
declare(strict_types=1);

/**
 * Artikelnummern nach SKU-Prinzip: WF-<Kürzel der Kategorie>-<laufende Nummer>, z. B. WF-TS-011.
 * - Kürzel: zwei Buchstaben je (Unter-)Kategorie, einmal festgelegt und dann gespeichert (product_categories.sku_code).
 *   Für Kategorien aus dem Vorgabe-Katalog gilt dessen Kürzel (T-Shirts = TS, Tassen = MU …).
 * - Nummer: je Kürzel fortlaufend, mindestens dreistellig; Nummern aus dem Katalog werden übersprungen,
 *   damit ein späterer Katalog-Import nichts doppelt belegt.
 * - Ohne Kategorie: WF-AR-…, Leistungen ohne Kategorie: WF-LS-….
 */

require_once __DIR__ . '/catalog.php';

const WF_SKU_RE = '/^WF-[A-Z0-9]{2,4}-\d{3,}$/';

function wf_sku_letters(string $s): string
{
    $s = strtr(mb_strtoupper($s), ['Ä' => 'AE', 'Ö' => 'OE', 'Ü' => 'UE', 'ß' => 'SS', 'Æ' => 'AE', 'Ø' => 'OE', 'Å' => 'AA', 'É' => 'E', 'È' => 'E', 'À' => 'A']);
    return preg_replace('/[^A-Z]/', '', $s) ?? '';
}

/** Kürzel und höchste Nummer je Kürzel aus dem Vorgabe-Katalog. */
function wf_sku_catalog(): array
{
    static $c = null;
    if ($c !== null) {
        return $c;
    }
    $c = ['byName' => [], 'max' => []];
    foreach (wf_catalog() as $row) {
        if (preg_match('/^WF-([A-Z0-9]{2,4})-(\d+)$/', (string)$row[2], $m)) {
            $c['byName'][mb_strtolower((string)$row[1])] ??= $m[1];
            $c['max'][$m[1]] = max($c['max'][$m[1]] ?? 0, (int)$m[2]);
        }
    }
    return $c;
}

/** Kürzel einer Kategorie (wird beim ersten Mal festgelegt und gespeichert). */
function wf_sku_code(PDO $db, ?int $catId, string $kind = 'goods'): string
{
    if (!$catId) {
        return $kind === 'services' ? 'LS' : 'AR';
    }
    $q = $db->prepare('SELECT name, sku_code FROM product_categories WHERE id = ?');
    $q->execute([$catId]);
    $cat = $q->fetch();
    if (!$cat) {
        return $kind === 'services' ? 'LS' : 'AR';
    }
    if ($cat['sku_code'] !== '') {
        return $cat['sku_code'];
    }
    // schon vergebene Kürzel anderer Kategorien (gespeichert oder in deren Artikelnummern)
    $used = ['AR' => 1];
    $o = $db->prepare("SELECT sku_code FROM product_categories WHERE id <> ? AND sku_code <> ''");
    $o->execute([$catId]);
    foreach ($o->fetchAll(PDO::FETCH_COLUMN) as $u) {
        $used[$u] = 1;
    }
    $o = $db->prepare('SELECT sku FROM products WHERE category_id IS NOT ? AND sku LIKE ?');
    $o->execute([$catId, 'WF-%']);
    foreach ($o->fetchAll(PDO::FETCH_COLUMN) as $s) {
        if (preg_match('/^WF-([A-Z0-9]{2,4})-\d+$/', $s, $m)) {
            $used[$m[1]] = 1;
        }
    }
    $code = '';
    // 1. Kürzel, das die Produkte dieser Kategorie schon tragen (z. B. aus dem Katalog)
    $o = $db->prepare('SELECT sku FROM products WHERE category_id = ? AND sku LIKE ?');
    $o->execute([$catId, 'WF-%']);
    $cnt = [];
    foreach ($o->fetchAll(PDO::FETCH_COLUMN) as $s) {
        if (preg_match('/^WF-([A-Z0-9]{2,4})-\d+$/', $s, $m)) {
            $cnt[$m[1]] = ($cnt[$m[1]] ?? 0) + 1;
        }
    }
    arsort($cnt);
    foreach (array_keys($cnt) as $c) {
        if (!isset($used[$c])) {
            $code = (string)$c;
            break;
        }
    }
    // 2. Kürzel aus dem Vorgabe-Katalog für gleichnamige Kategorien
    if ($code === '') {
        $c = wf_sku_catalog()['byName'][mb_strtolower((string)$cat['name'])] ?? '';
        if ($c !== '' && !isset($used[$c])) {
            $code = $c;
        }
    }
    // 3. aus dem Namen: erster Buchstabe + ein weiterer, sonst erster Buchstabe + Ziffer
    if ($code === '') {
        $L = wf_sku_letters((string)$cat['name']) ?: 'X';
        $cands = [];
        for ($i = 1; $i < strlen($L); $i++) {
            $cands[] = $L[0] . $L[$i];
        }
        foreach (range('A', 'Z') as $ch) {
            $cands[] = $L[0] . $ch;
        }
        for ($i = 1; $i <= 9; $i++) {
            $cands[] = $L[0] . $i;
        }
        foreach ($cands as $c) {
            if (!isset($used[$c])) {
                $code = $c;
                break;
            }
        }
        if ($code === '') {
            $code = substr($L . 'XX', 0, 2) . (string)$catId;
        }
    }
    $db->prepare('UPDATE product_categories SET sku_code = ? WHERE id = ?')->execute([$code, $catId]);
    return $code;
}

/** Nächste freie Artikelnummer für ein Kürzel. */
function wf_sku_next(PDO $db, string $code): string
{
    $q = $db->prepare('SELECT sku FROM products WHERE sku LIKE ?');
    $q->execute(['WF-' . $code . '-%']);
    $max = wf_sku_catalog()['max'][$code] ?? 0;
    foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $s) {
        if (preg_match('/^WF-' . preg_quote($code, '/') . '-(\d+)$/', $s, $m)) {
            $max = max($max, (int)$m[1]);
        }
    }
    return sprintf('WF-%s-%03d', $code, $max + 1);
}

function wf_sku_for(PDO $db, ?int $catId, string $kind = 'goods'): string
{
    return wf_sku_next($db, wf_sku_code($db, $catId, $kind));
}

/**
 * Bestehende Artikelnummern auf das SKU-Schema umstellen. Nummern, die schon passen, bleiben;
 * alle anderen und doppelte bekommen eine neue. Gibt die Anzahl umgestellter Produkte zurück.
 */
function wf_sku_convert_all(PDO $db): int
{
    $seen = [];
    $redo = [];
    foreach ($db->query('SELECT id, sku, category_id, kind FROM products ORDER BY id')->fetchAll() as $r) {
        if (preg_match(WF_SKU_RE, (string)$r['sku']) && !isset($seen[$r['sku']])) {
            $seen[$r['sku']] = 1;
        } else {
            $redo[] = $r;
        }
    }
    $up = $db->prepare('UPDATE products SET sku = ? WHERE id = ?');
    foreach ($redo as $r) {
        $up->execute(['', (int)$r['id']]);   // erst leeren, damit die alte Nummer die Zählung nicht stört
    }
    foreach ($redo as $r) {
        $up->execute([wf_sku_for($db, $r['category_id'] !== null ? (int)$r['category_id'] : null, (string)$r['kind']), (int)$r['id']]);
    }
    return count($redo);
}
