<?php
/* MCP-Schnittstelle (Model Context Protocol) für die Julekontor-Preiskalkulation (Bastelwerkstatt).
   Damit kann Claude Bastelprojekte samt Anleitung, Materiallager, Arbeitszeit und Preise lesen und pflegen.

   Einrichten: als Admin angemeldet https://<domain>/admin/kalkulation/mcp.php im Browser öffnen,
   „Schlüssel erzeugen“ klicken und die angezeigte Adresse in Claude als eigenen Connector eintragen.

   Rechenweg wie in kalk.js (dort rechnet die Oberfläche): Material + Arbeitszeit + Verpackung + Sonstiges
   = Selbstkosten → + Gewinnaufschlag → + Moms → + Kartengebühr → runden = Verkaufspreis. */
declare(strict_types=1);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/shop.php';
require __DIR__ . '/../inc/web.php';

const MCP_NAME = 'julekontor-kalkulation';
const MCP_VERSION = '1.0.0';
const MCP_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MCP_KEY_FILE = JK_PRIVATE . '/mcp-key.php';
const MC_TYPES = ['area', 'length', 'piece', 'weight', 'cast', 'wear', 'volume'];
const MC_SETTINGS = ['wage', 'markup', 'fee', 'vat', 'round', 'round_mode', 'wage_mode', 'need', 'tax', 'fixed', 'hours', 'am', 'deduct_off'];

/* ---------- Antworten ---------- */
function mcp_send($payload, int $code = 200): never {
    header_remove('Set-Cookie');
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function mcp_result($id, array $r): array { return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $r]; }
function mcp_error($id, int $c, string $m): array { return ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $c, 'message' => $m]]; }
final class McpFail extends RuntimeException {}
function fail(string $m): never { throw new McpFail($m); }

/* ---------- Zahlen und Werte ---------- */
function n($v): float {
    if (is_int($v) || is_float($v)) return is_finite((float)$v) ? (float)$v : 0.0;
    if ($v === null || is_array($v)) return 0.0;
    $s = preg_replace('/\s/', '', (string)$v);
    if (str_contains($s, ',')) $s = str_replace(',', '.', str_replace('.', '', $s));
    return is_numeric($s) ? (float)$s : 0.0;
}
function is_empty($v): bool { return $v === null || trim((string)(is_array($v) ? 'x' : $v)) === ''; }
function lim(float $v, float $min, float $max): float { return max($min, min($max, $v)); }
function txt($v, int $max): string { return mb_substr(trim((string)(is_scalar($v) ? $v : '')), 0, $max); }
function clean_obj($o): array {          // wie api.php: nur einfache Werte mit kurzen Namen
    $r = [];
    if (is_array($o)) foreach ($o as $k => $v) if (preg_match('/^[a-zA-Z]{1,12}$/', (string)$k) && (is_scalar($v) || $v === null)) $r[$k] = is_string($v) ? mb_substr($v, 0, 20) : $v;
    return $r;
}
function r2(float $v): float { return round($v, 2); }

/* ---------- Daten laden ---------- */
function S(): array {
    static $s = null;
    if ($s === null) { $s = []; foreach (MC_SETTINGS as $k) $s[$k] = setting('calc_' . $k); }
    return $s;
}
function eur_rate(): float { return n(setting('web_eur_rate')) ?: 7.46; }
function vat(): float { return vat_rates()[0] / 10000; }
function materials(): array {
    static $m = null;
    if ($m === null) {
        $m = [];
        foreach (db()->query('SELECT * FROM calc_materials ORDER BY grp, name') as $r) $m[(int)$r['id']] = mat_out($r);
    }
    return $m;
}
function mat_out(array $r): array {
    return ['id' => (int)$r['id'], 'name' => $r['name'], 'grp' => $r['grp'], 'type' => $r['type'], 'price' => (float)$r['price'], 'currency' => $r['currency'],
            'pack' => json_decode($r['pack'], true) ?: [], 'supplier' => $r['supplier'], 'note' => $r['note']];
}
function project_raw(int $id): array {
    $st = db()->prepare('SELECT * FROM calc_projects WHERE id = ?'); $st->execute([$id]);
    $p = $st->fetch();
    if (!$p) fail('Projekt ' . $id . ' nicht gefunden.');
    return $p;
}
function project(int $id): array {
    $p = project_raw($id);
    $st = db()->prepare('SELECT id, material_id, use FROM calc_lines WHERE project_id = ? ORDER BY sort, id'); $st->execute([$id]);
    $lines = array_map(fn($l) => ['material_id' => (int)$l['material_id'], 'use' => json_decode($l['use'], true) ?: []], $st->fetchAll());
    $prod = null;
    if ($p['product_id']) {
        $s2 = db()->prepare('SELECT id, name, price, active FROM products WHERE id = ?'); $s2->execute([$p['product_id']]);
        if ($r = $s2->fetch()) $prod = ['id' => (int)$r['id'], 'name' => $r['name'], 'price_kr' => (int)$r['price'] / 100, 'active' => (bool)$r['active']];
    }
    return ['id' => (int)$p['id'], 'category_id' => $p['category_id'] ? (int)$p['category_id'] : null, 'name' => $p['name'], 'notes' => $p['notes'],
            'status' => $p['status'], 'batch' => (int)$p['batch'], 'minutes' => (float)$p['minutes'],
            'wage' => $p['wage'] === null ? null : (float)$p['wage'], 'markup' => $p['markup'] === null ? null : (float)$p['markup'],
            'packaging' => (float)$p['packaging'], 'extra' => (float)$p['extra'], 'own_price' => $p['own_price'] === null ? null : (float)$p['own_price'],
            'product' => $prod, 'has_image' => (string)$p['image'] !== '', 'built' => (int)$p['built'],
            'timer_running_since' => $p['timer_start'] === null ? null : date('Y-m-d H:i:s', (int)$p['timer_start']), 'updated' => $p['updated'], 'lines' => $lines];
}

/* ---------- Rechnen (wie kalk.js) ---------- */
const LEN = ['mm' => 0.1, 'cm' => 1, 'm' => 100];
const WEIGHT = ['g' => 1, 'kg' => 1000];
const VOL = ['ml' => 1, 'l' => 1000];
function pack_total(array $m): float {
    $p = $m['pack'];
    $cnt = max(1, n($p['count'] ?? 0) ?: 1);
    return match ($m['type']) {
        'area' => n($p['length'] ?? 0) * (LEN[$p['lengthUnit'] ?? ''] ?? 1) * n($p['width'] ?? 0) * (LEN[$p['widthUnit'] ?? ''] ?? 1) * $cnt,
        'length' => n($p['length'] ?? 0) * (LEN[$p['lengthUnit'] ?? ''] ?? 1) * $cnt,
        'piece', 'wear' => n($p['count'] ?? 0),
        'weight', 'cast' => n($p['amount'] ?? 0) * (WEIGHT[$p['unit'] ?? ''] ?? 1),
        'volume' => n($p['amount'] ?? 0) * (VOL[$p['unit'] ?? ''] ?? 1),
        default => 0.0,
    };
}
function unit_price(array $m): float { $t = pack_total($m); return $t > 0 ? n($m['price']) * ($m['currency'] === 'EUR' ? eur_rate() : 1) / $t : 0.0; }
function powder_share(array $m): float { $P = n($m['pack']['ratioP'] ?? 0); $W = n($m['pack']['ratioW'] ?? 0); return $P > 0 && $W >= 0 ? $P / ($P + $W) : 1.0; }
function used_amount(array $m, array $u): float {
    $qty = max(0, is_empty($u['qty'] ?? null) ? 1 : n($u['qty']));
    return match ($m['type']) {
        'area' => n($u['a'] ?? 0) * (LEN[$u['aUnit'] ?? ''] ?? 1) * n($u['b'] ?? 0) * (LEN[$u['bUnit'] ?? ''] ?? 1) * $qty,
        'length' => n($u['a'] ?? 0) * (LEN[$u['aUnit'] ?? ''] ?? 1) * $qty,
        'piece' => n($u['a'] ?? 0),
        'weight' => n($u['a'] ?? 0) * (WEIGHT[$u['aUnit'] ?? ''] ?? 1),
        'cast' => n($u['a'] ?? 0) * (WEIGHT[$u['aUnit'] ?? ''] ?? 1) * (($u['mode'] ?? '') === 'pulver' ? 1 : powder_share($m)),
        'wear' => is_empty($u['a'] ?? null) ? 1 : n($u['a']),
        'volume' => n($u['a'] ?? 0) * (VOL[$u['aUnit'] ?? ''] ?? 1),
        default => 0.0,
    };
}
const BASE_UNIT = ['area' => 'cm²', 'length' => 'cm', 'piece' => 'Stk.', 'weight' => 'g', 'cast' => 'g Pulver', 'wear' => 'Benutzungen', 'volume' => 'ml'];
function unit_price_text(array $m): string {
    $up = unit_price($m);
    if (!$up) return 'Preis und Packungsgröße fehlen';
    $f = fn($v) => number_format($v, $v >= 1 ? 2 : 3, ',', '.') . ' kr.';
    return match ($m['type']) {
        'area' => $f($up * 100) . ' pro 10 × 10 cm · ' . $f($up * 10000) . ' pro m²',
        'length' => $f($up * 100) . ' pro Meter',
        'piece' => $f($up) . ' pro Stück',
        'weight' => $f($up * 100) . ' pro 100 g',
        'cast' => $f($up * 100) . ' pro 100 g Pulver',
        'wear' => $f($up) . ' pro Benutzung',
        'volume' => $f($up * 100) . ' pro 100 ml',
        default => '',
    };
}
function tax_total(): float { $am = min(0.5, n(S()['am']) / 100); $t = min(0.8, n(S()['tax']) / 100); return 1 - (1 - $am) * (1 - $t); }
function need_wage(): float {
    $need = n(S()['need']); $fixed = n(S()['fixed']); $hours = n(S()['hours']);
    return $need <= 0 || $hours <= 0 ? 0.0 : ($need / (1 - tax_total()) + $fixed) / $hours;
}
function base_wage(): float { $w = need_wage(); return S()['wage_mode'] === 'bedarf' && $w > 0 ? $w : n(S()['wage']); }
function round_price(float $v): float {
    $r = n(S()['round']);
    if ($r <= 0) return round($v, 2);
    return S()['round_mode'] === 'near' ? max($r, round($v / $r) * $r) : ceil($v / $r - 1e-9) * $r;
}
function line_cost(array $l): float { $m = materials()[$l['material_id']] ?? null; return $m ? unit_price($m) * used_amount($m, $l['use']) : 0.0; }
function calc(array $p, ?float $markupOverride = null): array {
    $nB = max(1, (int)n($p['batch']) ?: 1);
    $wage = $p['wage'] === null ? base_wage() : n($p['wage']);
    $materialAll = array_sum(array_map('line_cost', $p['lines']));
    $material = $materialAll / $nB; $labor = n($p['minutes']) / 60 * $wage / $nB; $extra = n($p['extra']) / $nB; $pack = n($p['packaging']);
    $self = $material + $labor + $extra + $pack;
    $markup = $markupOverride ?? ($p['markup'] === null ? n(S()['markup']) : n($p['markup']));
    $net = $self * (1 + $markup / 100);
    $vatF = S()['vat'] === '1' ? 1 + vat() : 1;
    $fee = min(0.5, n(S()['fee']) / 100);
    $withFee = $net / max(0.05, 1 / $vatF - $fee);
    $rounded = round_price($withFee);
    $own = $markupOverride === null && $p['own_price'] !== null && n($p['own_price']) > 0;
    $final = $own ? n($p['own_price']) : $rounded;
    $revenue = $final / $vatF - $final * $fee;
    $profit = $revenue - $self;
    $minPiece = n($p['minutes']) / $nB;
    return [
        'stueck_pro_durchgang' => $nB, 'stundensatz' => r2($wage),
        'material_pro_stueck' => r2($material), 'arbeitszeit_pro_stueck' => r2($labor), 'sonstiges_pro_stueck' => r2($extra), 'verpackung_pro_stueck' => r2($pack),
        'selbstkosten' => r2($self), 'aufschlag_prozent' => $markup, 'netto_mit_gewinn' => r2($net),
        'moms' => r2($withFee - $withFee / $vatF), 'kartengebuehr' => r2($withFee * $fee), 'errechnet_vor_runden' => r2($withFee), 'errechnet_gerundet' => r2($rounded),
        'eigener_preis_aktiv' => $own, 'verkaufspreis' => r2($final), 'verkaufspreis_eur' => r2($final / eur_rate()),
        'bleibt_nach_moms_und_gebuehr' => r2($revenue), 'gewinn_pro_stueck' => r2($profit), 'marge_prozent' => $revenue > 0 ? round($profit / $revenue * 100, 1) : 0,
        'verdienst_pro_stunde' => $minPiece > 0 ? r2(($profit + $labor) / ($minPiece / 60)) : null, 'minuten_pro_stueck' => round($minPiece, 1),
        'einkaufspreis_fuer_kasse' => r2($material + $extra + $pack),
    ];
}
function lines_detail(array $p, float $factor = 1): array {
    $out = [];
    foreach ($p['lines'] as $l) {
        $m = materials()[$l['material_id']] ?? null;
        if (!$m) continue;
        $used = used_amount($m, $l['use']) * $factor; $tot = pack_total($m);
        $out[] = ['material_id' => $m['id'], 'material' => $m['name'], 'art' => $m['type'], 'verbrauch' => $l['use'],
                  'menge' => round($used, 2) . ' ' . BASE_UNIT[$m['type']], 'packungen' => $m['type'] === 'wear' ? null : ($tot > 0 ? (int)ceil($used / $tot - 1e-9) : null),
                  'kosten' => r2(line_cost($l) * $factor)];
    }
    return $out;
}

/* ---------- Werkzeuge ---------- */
function s_(string $d, string|array $t = 'string', array $x = []): array { return ['type' => $t, 'description' => $d] + $x; }
function o_(array $props, array $req = []): array { $o = ['type' => 'object', 'properties' => (object)$props]; if ($req) $o['required'] = $req; return $o; }

function tools(): array {
    $id = s_('Projekt-ID', 'integer');
    $packDoc = 'Packungsgröße je Art: area {length,lengthUnit(mm|cm|m),width,widthUnit,count} · length {length,lengthUnit,count} · piece {count} · '
        . 'weight {amount,unit(g|kg)} · cast {amount,unit(g|kg),ratioP,ratioW} (Mischverhältnis Pulver:Wasser) · wear {count} (hält so viele Benutzungen) · volume {amount,unit(ml|l)}';
    $useDoc = 'Verbrauch je Art (für den ganzen Durchgang): area {a,aUnit,b,bUnit,qty} (Fläche a×b, qty Stück) · length {a,aUnit,qty} · piece {a} · weight {a,aUnit} · '
        . 'cast {a,aUnit,mode} (a = fertige Gießmasse; mode "pulver" = a ist reines Pulver) · wear {a} (Benutzungen, Standard 1) · volume {a,aUnit}';
    return [
        'uebersicht' => ['Alles auf einen Blick: Einstellungen (Stundensatz, Aufschlag, Moms, Rundung), Kategorien, Materiallager mit Preis pro Einheit und alle Projekte mit Verkaufspreis, Selbstkosten und Gewinn.', o_([]), false],
        'projekt_lesen' => ['Ein Bastelprojekt vollständig: Anleitung/Notizen, Materialliste mit Verbrauch und Kosten, Arbeitszeit, vollständige Preisberechnung.', o_(['id' => $id], ['id']), false],
        'preis_berechnen' => ['Preis eines Projekts berechnen, optional mit anderem Gewinnaufschlag. Enthält „Was wäre wenn“-Tabelle für verschiedene Aufschläge. Speichert nichts.',
            o_(['id' => $id, 'aufschlag' => s_('Gewinnaufschlag in Prozent zum Ausprobieren', 'number')], ['id']), false],
        'nachbauen' => ['Bereitlege-Liste: Was wird für N Stück gebraucht (Mengen, Packungen, Kosten, Zeit, Verkaufswert)?',
            o_(['id' => $id, 'stueck' => s_('Anzahl Stück (Standard 10)', 'integer')], ['id']), false],
        'projekt_speichern' => ['Bastelprojekt anlegen (ohne id) oder ändern (mit id – nur die angegebenen Felder werden geändert). In „notes“ steht die Bastelanleitung (Schritte, Tipps, Maße). lines ersetzt die komplette Materialliste. ' . $useDoc,
            o_([
                'id' => s_('Projekt-ID zum Ändern', 'integer'), 'name' => s_('Name'), 'category_id' => s_('Kategorie-ID (0 = ohne)', 'integer'),
                'notes' => s_('Bastelanleitung / Notizen (Text, bis 4000 Zeichen)'), 'status' => s_('arbeit (in Arbeit) oder fertig', 'string', ['enum' => ['arbeit', 'fertig']]),
                'batch' => s_('Material und Zeit gelten für so viele Stück (Durchgang)', 'integer'), 'minutes' => s_('Arbeitszeit in Minuten für den ganzen Durchgang', 'number'),
                'wage' => s_('Eigener Stundensatz in kr. (null = Standard aus den Einstellungen)', ['number', 'null']),
                'markup' => s_('Eigener Gewinnaufschlag in % (null = Standard)', ['number', 'null']),
                'packaging' => s_('Verpackung pro Stück in kr.', 'number'), 'extra' => s_('Sonstiges pro Durchgang in kr.', 'number'),
                'own_price' => s_('Eigener Verkaufspreis in kr. statt des errechneten (null = errechneten nehmen)', ['number', 'null']),
                'lines' => s_('Materialliste: [{"material_id":3,"use":{"a":20,"aUnit":"cm","qty":2}}]', 'array', ['items' => ['type' => 'object']]),
            ]), true],
        'projekt_kopieren' => ['Projekt mit Materialliste kopieren (z. B. für eine Variante).', o_(['id' => $id], ['id']), true],
        'projekt_loeschen' => ['Projekt endgültig löschen (mit Foto). Nur nach Bestätigung durch den Benutzer.', o_(['id' => $id], ['id']), true],
        'material_speichern' => ['Material im Lager anlegen (ohne id) oder ändern (mit id – nur angegebene Felder). Preis gilt für die ganze Packung. ' . $packDoc,
            o_([
                'id' => s_('Material-ID zum Ändern', 'integer'), 'name' => s_('Name, z. B. „Satinband rot 10 mm“'), 'grp' => s_('Gruppe, z. B. Bänder'),
                'type' => s_('Art', 'string', ['enum' => MC_TYPES]), 'price' => s_('Preis der Packung', 'number'),
                'currency' => s_('DKK oder EUR', 'string', ['enum' => ['DKK', 'EUR']]), 'pack' => s_('Packungsgröße (siehe oben)', 'object'),
                'supplier' => s_('Bezugsquelle'), 'note' => s_('Notiz'),
            ]), true],
        'material_loeschen' => ['Material löschen (verschwindet auch aus allen Projekten!). Nur nach Bestätigung.', o_(['id' => s_('Material-ID', 'integer')], ['id']), true],
        'kategorie_speichern' => ['Kategorie anlegen (ohne id) oder umbenennen.', o_(['id' => s_('Kategorie-ID', 'integer'), 'name' => s_('Name')], ['name']), true],
        'kategorie_loeschen' => ['Kategorie löschen (Projekte bleiben, ohne Kategorie).', o_(['id' => s_('Kategorie-ID', 'integer')], ['id']), true],
        'stoppuhr' => ['Stoppuhr eines Projekts starten oder stoppen. Beim Stoppen: uebernehmen=set (als Arbeitszeit eintragen), add (dazuzählen) oder drop (verwerfen).',
            o_(['id' => $id, 'aktion' => s_('start oder stop', 'string', ['enum' => ['start', 'stop']]),
                'uebernehmen' => s_('Nur bei stop', 'string', ['enum' => ['set', 'add', 'drop']])], ['id', 'aktion']), true],
        'gebaut_eintragen' => ['Zähler „schon gebaut“ erhöhen (oder mit negativer Zahl verringern).', o_(['id' => $id, 'n' => s_('Anzahl Stück', 'integer')], ['id', 'n']), true],
        'in_kasse_uebernehmen' => ['Errechneten (oder eigenen) Verkaufspreis als Artikel in die Kasse und den Online-Shop übernehmen bzw. den verknüpften Artikel aktualisieren. Nur nach Bestätigung.',
            o_(['id' => $id], ['id']), true],
        'einstellungen_speichern' => ['Einstellungen der Preiskalkulation ändern (nur angegebene Felder).',
            o_([
                'wage' => s_('Standard-Stundensatz in kr.', 'number'), 'wage_mode' => s_('standard = fester Satz, bedarf = aus Monatsbedarf', 'string', ['enum' => ['standard', 'bedarf']]),
                'markup' => s_('Standard-Gewinnaufschlag in %', 'number'), 'fee' => s_('Kartengebühr in %', 'number'), 'vat' => s_('Moms auf den Preis rechnen', 'boolean'),
                'round' => s_('Runden auf 0, 1, 5 oder 10 kr.', 'string', ['enum' => ['0', '1', '5', '10']]), 'round_mode' => s_('up = aufrunden, near = kaufmännisch', 'string', ['enum' => ['up', 'near']]),
                'need' => s_('Monatsbedarf netto in kr.', 'number'), 'tax' => s_('Einkommensteuer nach AM-bidrag in %', 'number'), 'am' => s_('AM-bidrag in %', 'number'),
                'fixed' => s_('Feste Kosten pro Monat in kr.', 'number'), 'hours' => s_('Bastelstunden pro Monat', 'number'),
            ]), true],
    ];
}

function run(string $name, array $a): array {
    $db = db();
    switch ($name) {
        case 'uebersicht': {
            $cats = $db->query('SELECT id, name FROM calc_categories ORDER BY sort, name')->fetchAll();
            $catName = array_column($cats, 'name', 'id');
            $projects = [];
            foreach ($db->query('SELECT id FROM calc_projects ORDER BY updated DESC')->fetchAll() as $r) {
                $p = project((int)$r['id']); $c = calc($p);
                $projects[] = ['id' => $p['id'], 'name' => $p['name'], 'kategorie' => $catName[$p['category_id']] ?? null, 'status' => $p['status'],
                    'verkaufspreis' => $c['verkaufspreis'], 'selbstkosten' => $c['selbstkosten'], 'gewinn_pro_stueck' => $c['gewinn_pro_stueck'],
                    'minuten_pro_stueck' => $c['minuten_pro_stueck'], 'in_kasse' => $p['product'] !== null, 'schon_gebaut' => $p['built'], 'hat_anleitung' => trim($p['notes']) !== ''];
            }
            return ['einstellungen' => S() + ['stundensatz_wirksam' => r2(base_wage()), 'moms_satz' => vat(), 'euro_kurs' => eur_rate()],
                'kategorien' => array_map(fn($c) => ['id' => (int)$c['id'], 'name' => $c['name']], $cats),
                'materialien' => array_values(array_map(fn($m) => $m + ['preis_pro_einheit' => unit_price_text($m)], materials())),
                'projekte' => $projects];
        }
        case 'projekt_lesen': {
            $p = project((int)($a['id'] ?? 0));
            return ['projekt' => array_diff_key($p, ['lines' => 1]), 'materialliste' => lines_detail($p), 'preis' => calc($p)];
        }
        case 'preis_berechnen': {
            $p = project((int)($a['id'] ?? 0));
            $what = [];
            foreach ([0, 10, 20, 30, 50, 75, 100] as $mk) { $c = calc($p, (float)$mk); $what[] = ['aufschlag' => $mk, 'preis' => $c['errechnet_gerundet'], 'gewinn' => $c['gewinn_pro_stueck'], 'pro_stunde' => $c['verdienst_pro_stunde']]; }
            return ['projekt' => $p['name'], 'preis' => calc($p, isset($a['aufschlag']) ? n($a['aufschlag']) : null), 'was_waere_wenn' => $what];
        }
        case 'nachbauen': {
            $p = project((int)($a['id'] ?? 0));
            $N = max(1, (int)($a['stueck'] ?? 10)); $c = calc($p); $f = $N / $c['stueck_pro_durchgang'];
            return ['projekt' => $p['name'], 'stueck' => $N, 'schon_gebaut' => $p['built'], 'bereitlegen' => lines_detail($p, $f),
                'materialkosten' => r2(array_sum(array_map('line_cost', $p['lines'])) * $f), 'verpackung' => r2($c['verpackung_pro_stueck'] * $N),
                'arbeitszeit_minuten' => round(n($p['minutes']) * $f), 'verkaufswert' => r2($c['verkaufspreis'] * $N), 'gewinn' => r2($c['gewinn_pro_stueck'] * $N)];
        }
        case 'projekt_speichern': {
            $cur = !empty($a['id']) ? project((int)$a['id']) : null;
            $v = fn(string $k, $def = null) => array_key_exists($k, $a) ? $a[$k] : ($cur[$k] ?? $def);
            $numOrNull = fn($x) => is_empty($x) ? null : lim(n($x), 0, 1e9);
            $cat = (int)$v('category_id', 0);
            if ($cat) { $ck = $db->prepare('SELECT 1 FROM calc_categories WHERE id = ?'); $ck->execute([$cat]); if (!$ck->fetchColumn()) fail('Kategorie ' . $cat . ' gibt es nicht.'); }
            $row = [$cat ?: null, txt($v('name', ''), 120) ?: 'Neues Projekt', txt($v('notes', ''), 4000), $v('status') === 'fertig' ? 'fertig' : 'arbeit',
                    max(1, (int)lim(n($v('batch', 1)), 1, 10000)), lim(n($v('minutes', 0)), 0, 100000), $numOrNull($v('wage')), $numOrNull($v('markup')),
                    lim(n($v('packaging', 0)), 0, 1e9), lim(n($v('extra', 0)), 0, 1e9), $numOrNull($v('own_price')), now()];
            if (mb_strlen(trim((string)($a['notes'] ?? ''))) > 4000) fail('Die Anleitung ist länger als 4000 Zeichen. Bitte kürzen.');
            $db->beginTransaction();
            if ($cur) {
                $db->prepare('UPDATE calc_projects SET category_id=?, name=?, notes=?, status=?, batch=?, minutes=?, wage=?, markup=?, packaging=?, extra=?, own_price=?, updated=? WHERE id=?')->execute([...$row, $cur['id']]);
                $id = $cur['id'];
            } else {
                $db->prepare('INSERT INTO calc_projects (category_id, name, notes, status, batch, minutes, wage, markup, packaging, extra, own_price, updated, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([...$row, now()]);
                $id = (int)$db->lastInsertId();
            }
            if (isset($a['lines']) && is_array($a['lines'])) {
                $db->prepare('DELETE FROM calc_lines WHERE project_id = ?')->execute([$id]);
                $ins = $db->prepare('INSERT INTO calc_lines (project_id, material_id, use, sort) VALUES (?,?,?,?)');
                foreach (array_slice(array_values($a['lines']), 0, 200) as $i => $l) {
                    $mid = (int)($l['material_id'] ?? 0);
                    if (!isset(materials()[$mid])) { $db->rollBack(); fail('Material ' . $mid . ' gibt es nicht im Lager. Erst mit material_speichern anlegen.'); }
                    $ins->execute([$id, $mid, json_encode(clean_obj($l['use'] ?? [])), $i]);
                }
            }
            $db->commit();
            $p = project($id);
            return ['ok' => true, 'projekt' => array_diff_key($p, ['lines' => 1]), 'materialliste' => lines_detail($p), 'preis' => calc($p)];
        }
        case 'projekt_kopieren': {
            $p = project_raw((int)($a['id'] ?? 0));
            $db->prepare("INSERT INTO calc_projects (category_id, name, notes, status, batch, minutes, wage, markup, packaging, extra, own_price, created, updated)
                          SELECT category_id, name || ' (Kopie)', notes, 'arbeit', batch, minutes, wage, markup, packaging, extra, own_price, ?, ? FROM calc_projects WHERE id = ?")->execute([now(), now(), $p['id']]);
            $id = (int)$db->lastInsertId();
            $db->prepare('INSERT INTO calc_lines (project_id, material_id, use, sort) SELECT ?, material_id, use, sort FROM calc_lines WHERE project_id = ?')->execute([$id, $p['id']]);
            return ['ok' => true, 'neue_id' => $id, 'name' => project($id)['name']];
        }
        case 'projekt_loeschen': {
            $p = project_raw((int)($a['id'] ?? 0));
            $db->prepare('DELETE FROM calc_projects WHERE id = ?')->execute([$p['id']]);
            web_delete_image((string)$p['image']);
            return ['ok' => true, 'geloescht' => $p['name']];
        }
        case 'material_speichern': {
            $cur = null;
            if (!empty($a['id'])) { $cur = materials()[(int)$a['id']] ?? fail('Material ' . (int)$a['id'] . ' nicht gefunden.'); }
            $v = fn(string $k, $def = '') => array_key_exists($k, $a) ? $a[$k] : ($cur[$k] ?? $def);
            $name = txt($v('name'), 120); $type = (string)$v('type');
            if ($name === '' || !in_array($type, MC_TYPES, true)) fail('Bitte Name und Art (' . implode(', ', MC_TYPES) . ') angeben.');
            $row = [$name, txt($v('grp'), 60), $type, lim(n($v('price', 0)), 0, 1e7), $v('currency') === 'EUR' ? 'EUR' : 'DKK',
                    json_encode(clean_obj($v('pack', []))), txt($v('supplier'), 120), txt($v('note'), 500), now()];
            if ($cur) {
                $db->prepare('UPDATE calc_materials SET name=?, grp=?, type=?, price=?, currency=?, pack=?, supplier=?, note=?, updated=? WHERE id=?')->execute([...$row, $cur['id']]);
                $id = $cur['id'];
            } else {
                $db->prepare('INSERT INTO calc_materials (name, grp, type, price, currency, pack, supplier, note, updated) VALUES (?,?,?,?,?,?,?,?,?)')->execute($row);
                $id = (int)$db->lastInsertId();
            }
            $st = $db->prepare('SELECT * FROM calc_materials WHERE id = ?'); $st->execute([$id]); $m = mat_out($st->fetch());
            return ['ok' => true, 'material' => $m + ['preis_pro_einheit' => unit_price_text($m)]];
        }
        case 'material_loeschen': {
            $id = (int)($a['id'] ?? 0);
            $m = materials()[$id] ?? fail('Material ' . $id . ' nicht gefunden.');
            $st = $db->prepare('SELECT COUNT(DISTINCT project_id) FROM calc_lines WHERE material_id = ?'); $st->execute([$id]);
            $db->prepare('DELETE FROM calc_materials WHERE id = ?')->execute([$id]);
            return ['ok' => true, 'geloescht' => $m['name'], 'entfernt_aus_projekten' => (int)$st->fetchColumn()];
        }
        case 'kategorie_speichern': {
            $name = txt($a['name'] ?? '', 60);
            if ($name === '') fail('Bitte einen Namen angeben.');
            if (!empty($a['id'])) { $db->prepare('UPDATE calc_categories SET name = ? WHERE id = ?')->execute([$name, (int)$a['id']]); $id = (int)$a['id']; }
            else { $db->prepare('INSERT INTO calc_categories (name, sort) VALUES (?, 0)')->execute([$name]); $id = (int)$db->lastInsertId(); }
            return ['ok' => true, 'kategorie' => ['id' => $id, 'name' => $name]];
        }
        case 'kategorie_loeschen': {
            $id = (int)($a['id'] ?? 0);
            $db->prepare('UPDATE calc_projects SET category_id = NULL WHERE category_id = ?')->execute([$id]);
            $db->prepare('DELETE FROM calc_categories WHERE id = ?')->execute([$id]);
            return ['ok' => true];
        }
        case 'stoppuhr': {
            $p = project_raw((int)($a['id'] ?? 0));
            if (($a['aktion'] ?? '') === 'start') {
                $db->prepare('UPDATE calc_projects SET timer_start = ? WHERE id = ?')->execute([time(), $p['id']]);
                return ['ok' => true, 'laeuft_seit' => date('Y-m-d H:i:s')];
            }
            if ($p['timer_start'] === null) fail('Die Stoppuhr läuft bei diesem Projekt nicht.');
            $mins = max(1, (int)round((time() - (int)$p['timer_start']) / 60));
            $how = (string)($a['uebernehmen'] ?? 'drop');
            $newMin = $how === 'set' ? $mins : ($how === 'add' ? (float)$p['minutes'] + $mins : (float)$p['minutes']);
            $db->prepare('UPDATE calc_projects SET timer_start = NULL, minutes = ?, updated = ? WHERE id = ?')->execute([$newMin, now(), $p['id']]);
            return ['ok' => true, 'gemessen_minuten' => $mins, 'arbeitszeit_jetzt_minuten' => $newMin];
        }
        case 'gebaut_eintragen': {
            $p = project_raw((int)($a['id'] ?? 0));
            $db->prepare('UPDATE calc_projects SET built = max(0, built + ?) WHERE id = ?')->execute([(int)lim(n($a['n'] ?? 0), -100000, 100000), $p['id']]);
            return ['ok' => true, 'schon_gebaut' => project((int)$p['id'])['built']];
        }
        case 'in_kasse_uebernehmen': {
            $p = project((int)($a['id'] ?? 0)); $raw = project_raw($p['id']); $c = calc($p);
            $price = (int)round($c['verkaufspreis'] * 100); $cost = (int)round($c['einkaufspreis_fuer_kasse'] * 100);
            if ($price <= 0) fail('Es gibt noch keinen Verkaufspreis.');
            $pid = (int)$raw['product_id']; $prod = null;
            if ($pid) { $s2 = $db->prepare('SELECT id, image FROM products WHERE id = ?'); $s2->execute([$pid]); $prod = $s2->fetch() ?: null; if (!$prod) $pid = 0; }
            if ($pid) {
                $db->prepare('UPDATE products SET price = ?, cost = ?, updated = ? WHERE id = ?')->execute([$price, $cost, now(), $pid]);
                $created = false;
            } else {
                $db->prepare("INSERT INTO products (name, price, cost, vat, track_stock, favorite, active, note, created, updated) VALUES (?,?,?,?,1,1,1,'Aus der Preiskalkulation',?,?)")
                   ->execute([$p['name'], $price, $cost, vat_rates()[0], now(), now()]);
                $pid = (int)$db->lastInsertId();
                $db->prepare('UPDATE calc_projects SET product_id = ? WHERE id = ?')->execute([$pid, $p['id']]);
                $prod = ['image' => '']; $created = true;
            }
            if (($prod['image'] ?? '') === '' && $raw['image'] !== '' && is_file(WEB_IMG_DIR . '/' . $raw['image'])) {
                try { $db->prepare('UPDATE products SET image = ? WHERE id = ?')->execute([save_product_image($pid, WEB_IMG_DIR . '/' . $raw['image']), $pid]); } catch (Throwable $e) {}
            }
            return ['ok' => true, 'neu_angelegt' => $created, 'artikel_id' => $pid, 'preis' => $c['verkaufspreis'], 'einkaufspreis' => $c['einkaufspreis_fuer_kasse']];
        }
        case 'einstellungen_speichern': {
            $s = S();
            $g = fn(string $k) => array_key_exists($k, $a) ? $a[$k] : $s[$k];
            $vals = [
                'wage' => lim(n($g('wage')), 0, 5000), 'markup' => lim(n($g('markup')), 0, 1000), 'fee' => lim(n($g('fee')), 0, 20),
                'vat' => array_key_exists('vat', $a) ? ($a['vat'] ? '1' : '0') : $s['vat'],
                'round' => in_array((string)$g('round'), ['0', '1', '5', '10'], true) ? (string)$g('round') : '5',
                'round_mode' => $g('round_mode') === 'near' ? 'near' : 'up', 'wage_mode' => $g('wage_mode') === 'bedarf' ? 'bedarf' : 'standard',
                'need' => lim(n($g('need')), 0, 1e7), 'tax' => lim(n($g('tax')), 0, 80), 'fixed' => lim(n($g('fixed')), 0, 1e7), 'hours' => lim(n($g('hours')), 0, 744), 'am' => lim(n($g('am')), 0, 50),
            ];
            foreach ($vals as $k => $x) set_setting('calc_' . $k, (string)$x);
            return ['ok' => true, 'einstellungen' => $vals];
        }
    }
    fail('Unbekanntes Werkzeug: ' . $name);
}

/* ---------- Schlüssel ---------- */
function key_info(): array { return read_private(MCP_KEY_FILE); }
function sent_key(): string {
    $h = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+([0-9a-f]{64})$/i', trim($h), $m)) return strtolower($m[1]);
    $k = (string)($_GET['k'] ?? '');
    return preg_match('/^[0-9a-f]{64}$/', $k) ? $k : '';
}

/* ---------- Einrichtungsseite (Browser, als Admin angemeldet) ---------- */
function setup_page(): never {
    header('Content-Type: text/html; charset=utf-8');
    if (!current_user() || role() !== 'admin') {
        http_response_code(401);
        exit('<!doctype html><meta charset="utf-8"><p style="font:16px system-ui;margin:40px">Bitte zuerst im <a href="../">Julekontor-Admin</a> anmelden und diese Seite dann neu laden.</p>');
    }
    $msg = ''; $newUrl = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals(csrf_token(), (string)($_POST['csrf'] ?? ''))) exit('Sitzung abgelaufen. Bitte neu laden.');
        if (($_POST['do'] ?? '') === 'create') {
            $key = bin2hex(random_bytes(32));
            write_private(MCP_KEY_FILE, ['hash' => hash('sha256', $key), 'created' => date('Y-m-d H:i'), 'by' => user_name()]);
            $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
            $newUrl = ($https ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . strtok((string)$_SERVER['REQUEST_URI'], '?') . '?k=' . $key;
        } elseif (($_POST['do'] ?? '') === 'revoke') {
            @unlink(MCP_KEY_FILE);
            if (function_exists('opcache_invalidate')) @opcache_invalidate(MCP_KEY_FILE, true);
            $msg = 'Der Schlüssel ist gesperrt. Claude hat keinen Zugriff mehr.';
        }
    }
    $k = $msg ? [] : key_info();
    $csrf = h(csrf_token());
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Claude-Zugang · Preiskalkulation</title><style>body{font:16px/1.5 Georgia,serif;max-width:720px;margin:0 auto;padding:24px 16px;color:#2b1a12;background:#fbf6ee}
h1{font-size:1.5rem;color:#7c1511}.box{background:#fff;border:1px solid #e3d6c3;border-radius:10px;padding:16px;margin:16px 0}code,input.url{font:14px ui-monospace,monospace;word-break:break-all}
input.url{width:100%;padding:10px;box-sizing:border-box}button{font:inherit;padding:10px 16px;border-radius:8px;border:0;background:#1f4d2b;color:#fff;cursor:pointer}
button.red{background:#7c1511}.warn{background:#fff4d6;border-color:#e8c766}ol li{margin:4px 0}</style></head><body>
<p><a href="./">← Preiskalkulation</a></p><h1>Claude-Zugang (MCP) für die Preiskalkulation</h1>';
    if ($msg) echo '<div class="box">' . h($msg) . '</div>';
    if ($newUrl) echo '<div class="box warn"><strong>Neue Connector-Adresse – nur jetzt sichtbar, gleich kopieren:</strong><br><input class="url" readonly value="' . h($newUrl) . '" onclick="this.select()">
<p>Wer diese Adresse kennt, kann Projekte, Material und Preise ändern. Nicht weitergeben. Ein neuer Schlüssel macht den alten ungültig.</p></div>';
    $has = !empty($k['hash']);
    echo '<div class="box"><p>Status: ' . ($has ? '<strong>aktiv</strong> (erzeugt ' . h($k['created'] ?? '') . ')' : '<strong>kein Schlüssel</strong> – Claude hat keinen Zugriff') . '</p>
<form method="post" style="display:inline"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="do" value="create"><button>' . ($has ? 'Neuen Schlüssel erzeugen' : 'Schlüssel erzeugen') . '</button></form> ';
    if ($has) echo '<form method="post" style="display:inline" onsubmit="return confirm(\'Zugang für Claude wirklich sperren?\')"><input type="hidden" name="csrf" value="' . $csrf . '"><input type="hidden" name="do" value="revoke"><button class="red">Sperren</button></form>';
    echo '</div><div class="box"><strong>In Claude eintragen</strong><ol>
<li>claude.ai → Einstellungen → Connectors → „Eigenen Connector hinzufügen“.</li>
<li>Name: <code>Julekontor Bastelwerkstatt</code>, URL: die Adresse von oben. Keine OAuth-Daten nötig.</li>
<li>Im Chat den Connector einschalten und z. B. sagen: „Schreib mir eine Bastelanleitung für den Weihnachtsstern ins Projekt und rechne den Preis.“</li></ol>
<p>Claude Code: <code>claude mcp add --transport http julekontor "ADRESSE"</code></p></div></body></html>';
    exit;
}

/* ---------- Anfrage ---------- */
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$sent = sent_key();
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($sent === '' && in_array($method, ['GET', 'POST'], true) && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) setup_page();
$hash = (string)(key_info()['hash'] ?? '');
if ($sent === '' || $hash === '' || !hash_equals($hash, hash('sha256', $sent))) {
    usleep(400000);
    header('WWW-Authenticate: Bearer');
    mcp_send(mcp_error(null, -32001, 'Ungültiger oder fehlender Schlüssel. Neuen Schlüssel unter admin/kalkulation/mcp.php erzeugen.'), 401);
}
session_abort();   // MCP-Aufrufe brauchen keine Sitzung
if ($method !== 'POST') { header('Allow: POST'); mcp_send(mcp_error(null, -32000, 'Nur POST (MCP Streamable HTTP ohne Server-Events).'), 405); }

$req = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($req)) mcp_send(mcp_error(null, -32700, 'Ungültiges JSON.'), 400);
if (array_is_list($req)) {
    $calls = array_values(array_filter($req, fn($r) => is_array($r) && isset($r['id'])));
    if (!$calls) { http_response_code(202); exit; }
    $req = $calls[0];
}
if (!array_key_exists('id', $req)) { http_response_code(202); exit; }
$id = $req['id'];
$params = is_array($req['params'] ?? null) ? $req['params'] : [];

switch ((string)($req['method'] ?? '')) {
    case 'initialize':
        $want = (string)($params['protocolVersion'] ?? '');
        mcp_send(mcp_result($id, [
            'protocolVersion' => in_array($want, MCP_PROTOCOLS, true) ? $want : MCP_PROTOCOLS[0],
            'capabilities' => ['tools' => ['listChanged' => false]],
            'serverInfo' => ['name' => MCP_NAME, 'version' => MCP_VERSION],
            'instructions' => 'Preiskalkulation und Bastelwerkstatt vom Julekontor (Weihnachtsladen in Padborg, Dänemark). Beträge in dänischen Kronen (kr.), Moms 25 %. '
                . 'Zuerst „uebersicht“ aufrufen. Die Bastelanleitung eines Projekts steht im Feld notes (höchstens 4000 Zeichen, gerne mit nummerierten Schritten, Material und Tipps). '
                . 'Materialien müssen im Lager stehen, bevor sie in ein Projekt kommen. Löschen und „in die Kasse übernehmen“ nur nach Zustimmung des Benutzers.',
        ]));
    case 'ping':
        mcp_send(mcp_result($id, []));
    case 'tools/list':
        $list = [];
        foreach (tools() as $name => [$desc, $schema, $write]) {
            $list[] = ['name' => $name, 'description' => $desc, 'inputSchema' => $schema,
                'annotations' => ['readOnlyHint' => !$write, 'destructiveHint' => in_array($name, ['projekt_loeschen', 'material_loeschen', 'kategorie_loeschen', 'in_kasse_uebernehmen'], true), 'openWorldHint' => false]];
        }
        mcp_send(mcp_result($id, ['tools' => $list]));
    case 'resources/list':
        mcp_send(mcp_result($id, ['resources' => []]));
    case 'prompts/list':
        mcp_send(mcp_result($id, ['prompts' => []]));
    case 'tools/call':
        $name = (string)($params['name'] ?? '');
        if (!isset(tools()[$name])) mcp_send(mcp_error($id, -32602, 'Unbekanntes Werkzeug: ' . $name));
        try {
            $out = run($name, is_array($params['arguments'] ?? null) ? $params['arguments'] : []);
            $text = json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            mcp_send(mcp_result($id, ['content' => [['type' => 'text', 'text' => $text]], 'isError' => false]));
        } catch (McpFail | ShopError $e) {
            if (db()->inTransaction()) db()->rollBack();
            mcp_send(mcp_result($id, ['content' => [['type' => 'text', 'text' => $e->getMessage()]], 'isError' => true]));
        } catch (Throwable $e) {
            if (db()->inTransaction()) db()->rollBack();
            error_log('julekontor mcp: ' . $e->getMessage());
            mcp_send(mcp_result($id, ['content' => [['type' => 'text', 'text' => 'Fehler beim Ausführen. Bitte noch einmal versuchen.']], 'isError' => true]));
        }
    default:
        mcp_send(mcp_error($id, -32601, 'Unbekannte Methode: ' . (string)($req['method'] ?? '')));
}
