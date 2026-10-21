<?php
declare(strict_types=1);

/*
 * Planung nach Person.
 *
 * - Jede Person (Inhaber + bis zu 3 Mitarbeiter) hat pro Tag ein Zeitfenster: ab Arbeitsbeginn, so lang wie ihre Tagesstunden
 *   (am Wochenende hoechstens die Wochenend-Stunden).
 * - Ein Auftrag hat eine Gesamtdauer (Summe der Verfahren) und belegt Bloecke in dieser Zeit (Tabelle order_days).
 *   Was eine Person an einem Tag belegt, ist fuer alles andere weg, egal welches Verfahren.
 * - Passt ein Auftrag in einen Arbeitstag, braucht er eine zusammenhaengende Luecke. Ist er laenger als ein Arbeitstag,
 *   fuellt er ab dem Starttag die freien Zeiten der folgenden Tage auf.
 * - Ganze Sperrtage fallen komplett aus, Teilsperren nehmen nur ihr Zeitfenster heraus (fuer alle Personen).
 * Alle Zeiten intern in Minuten seit Mitternacht.
 */

function wf_hhmm_to_min(string $t): int
{
    return (int)substr($t, 0, 2) * 60 + (int)substr($t, 3, 2);
}

function wf_min_to_hhmm(int $m): string
{
    return sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
}

/** Wochenend-Minuten: so viel kann eine Person am Samstag/Sonntag hoechstens arbeiten (Standard 300 = 5 Stunden). */
function wf_weekend_min(): int
{
    $v = wf_db()->query("SELECT value FROM meta WHERE key = 'weekend_min'")->fetchColumn();
    return $v === false ? 300 : max(0, (int)$v);
}

/** Arbeitsbeginn (Minuten seit Mitternacht). */
function wf_day_start(): int
{
    $v = wf_db()->query("SELECT value FROM meta WHERE key = 'day_start'")->fetchColumn();
    return wf_hhmm_to_min(is_string($v) && preg_match('/^\d\d:\d\d$/', $v) ? $v : '08:00');
}

/** Personen. Der Inhaber (id 1) ist immer aktiv, Mitarbeiter erst mit eingetragenem Namen. */
function wf_workers(bool $onlyActive = false): array
{
    $out = [];
    foreach (wf_db()->query('SELECT id, name, color, day_min FROM workers ORDER BY id') as $w) {
        $w['id'] = (int)$w['id'];
        $w['day_min'] = (int)$w['day_min'];
        $w['active'] = $w['id'] === 1 || trim((string)$w['name']) !== '';
        if (!$onlyActive || $w['active']) {
            $out[] = $w;
        }
    }
    return $out;
}

function wf_worker(int $id): ?array
{
    foreach (wf_workers() as $w) {
        if ($w['id'] === $id) {
            return $w;
        }
    }
    return null;
}

// ---------- Zeitfenster-Rechnung ----------

/** Sortiert und verschmilzt Zeitfenster [[von, bis], ...]. */
function wf_merge_iv(array $iv): array
{
    usort($iv, fn($a, $b) => $a[0] <=> $b[0]);
    $out = [];
    foreach ($iv as [$a, $b]) {
        if ($out && $a <= $out[count($out) - 1][1]) {
            $out[count($out) - 1][1] = max($out[count($out) - 1][1], $b);
        } else {
            $out[] = [$a, $b];
        }
    }
    return $out;
}

/** Freie Zeitfenster: $window [von, bis] ohne die $busy-Fenster. */
function wf_free_iv(array $window, array $busy): array
{
    $free = [];
    $cur = $window[0];
    foreach (wf_merge_iv($busy) as [$a, $b]) {
        if ($b <= $cur || $a >= $window[1]) {
            continue;
        }
        if ($a > $cur) {
            $free[] = [$cur, min($a, $window[1])];
        }
        $cur = max($cur, $b);
    }
    if ($cur < $window[1]) {
        $free[] = [$cur, $window[1]];
    }
    return $free;
}

function wf_iv_len(array $iv): int
{
    return array_sum(array_map(fn($x) => $x[1] - $x[0], $iv));
}

// ---------- Sperrtage ----------

/**
 * Sperren im Zeitraum je Tag: Datum => ['full' => bool, 'iv' => [[von,bis],...] (verschmolzen), 'reason' => string, 'times' => ['13:00-17:00', ...]].
 * Eintraege ohne Uhrzeit sperren den ganzen Tag; mit Uhrzeit nur dieses Zeitfenster.
 */
function wf_block_days(string $from, string $to): array
{
    $st = wf_db()->prepare('SELECT date_from, date_to, reason, time_from, time_to FROM blocked_days WHERE date_to >= ? AND date_from <= ? ORDER BY id');
    $st->execute([$from, $to]);
    $raw = [];
    foreach ($st as $r) {
        $part = ($r['time_from'] && $r['time_to']) ? [wf_hhmm_to_min($r['time_from']), wf_hhmm_to_min($r['time_to'])] : null;
        for ($t = max(strtotime($r['date_from']), strtotime($from)); $t <= min(strtotime($r['date_to']), strtotime($to)); $t += 86400) {
            $d = date('Y-m-d', $t);
            $raw[$d]['reason'] = $raw[$d]['reason'] ?? $r['reason'];
            if ($part) {
                $raw[$d]['iv'][] = $part;
                $raw[$d]['times'][] = $r['time_from'] . '-' . $r['time_to'];
            } else {
                $raw[$d]['full'] = true;
            }
        }
    }
    $out = [];
    foreach ($raw as $d => $x) {
        $out[$d] = ['full' => !empty($x['full']), 'iv' => wf_merge_iv($x['iv'] ?? []), 'reason' => (string)($x['reason'] ?? ''), 'times' => $x['times'] ?? []];
    }
    return $out;
}

/** Grund, wenn der ganze Tag gesperrt ist; sonst null (Teilsperren verhindern keinen Termin). */
function wf_blocked_reason(string $date): ?string
{
    $m = wf_block_days($date, $date);
    return isset($m[$date]) && $m[$date]['full'] ? $m[$date]['reason'] : null;
}

// ---------- Planstand ----------

/**
 * Laedt den Planstand fuer [$from, $to]:
 * ['days' => [Datum => ['weekend' => bool, 'blocked' => ?string, 'partial' => ?array,
 *                       'w' => [worker_id => ['cap' => Min, 'booked' => Min, 'free' => Min, 'iv' => [[von,bis],...]]]]]]
 * Beruecksichtigt nur aktive Personen und nur Auftraege, die nicht erledigt/abgeholt/geloescht sind.
 * $excludeOrder nimmt die Bloecke eines Auftrags heraus (beim Bearbeiten).
 */
function wf_plan_load(string $from, string $to, int $excludeOrder = 0): array
{
    $db = wf_db();
    $workers = wf_workers(true);
    $st = $db->prepare("
      SELECT d.date, d.start_time, d.minutes, o.worker_id
      FROM order_days d JOIN orders o ON o.id = d.order_id
      WHERE o.deleted_at IS NULL AND o.status NOT IN ('done','delivered') AND o.id <> ? AND d.date BETWEEN ? AND ?");
    $st->execute([$excludeOrder, $from, $to]);
    $allocs = [];
    foreach ($st as $r) {
        $a = wf_hhmm_to_min($r['start_time']);
        $allocs[$r['date']][(int)$r['worker_id']][] = [$a, $a + (int)$r['minutes']];
    }
    $blocked = wf_block_days($from, $to);
    $wk = wf_weekend_min();
    $start = wf_day_start();
    $days = [];
    for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
        $d = date('Y-m-d', $t);
        $weekend = (int)date('N', $t) >= 6;
        $b = $blocked[$d] ?? null;
        $isBlocked = $b && $b['full'];
        $blockIv = $b && !$b['full'] ? $b['iv'] : [];
        $row = ['weekend' => $weekend, 'blocked' => $isBlocked ? $b['reason'] : null, 'partial' => null, 'w' => []];
        $maxLost = 0;
        foreach ($workers as $w) {
            $base = $weekend ? min($w['day_min'], $wk) : $w['day_min'];
            $window = [$start, $start + $base];
            $lost = $base - wf_iv_len(wf_free_iv($window, $blockIv));
            $maxLost = max($maxLost, $lost);
            $cap = $isBlocked ? 0 : max(0, $base - $lost);
            $busy = $allocs[$d][$w['id']] ?? [];
            $iv = $cap > 0 ? wf_free_iv($window, array_merge($blockIv, $busy)) : [];
            $row['w'][$w['id']] = ['cap' => $cap, 'booked' => wf_iv_len(wf_merge_iv($busy)), 'free' => wf_iv_len($iv), 'iv' => $iv];
        }
        if ($b && !$b['full'] && $maxLost > 0) {
            $row['partial'] = ['lost' => $maxLost, 'reason' => $b['reason'], 'times' => $b['times']];
        }
        $days[$d] = $row;
    }
    return ['days' => $days];
}

/** Fuer die Ausgabe im JSON: Zeitfenster als 'HH:MM'-Paare. */
function wf_plan_public(array $plan): array
{
    $out = [];
    foreach ($plan['days'] as $d => $row) {
        foreach ($row['w'] as $wid => $x) {
            $row['w'][$wid]['iv'] = array_map(fn($p) => [wf_min_to_hhmm($p[0]), wf_min_to_hhmm($p[1])], $x['iv']);
        }
        $out[] = ['date' => $d] + $row;
    }
    return $out;
}

// ---------- Einplanen ----------

/**
 * Plant $total Minuten fuer eine Person ab $startDay ein.
 * $dayRef = Tagesstunden der Person (Werktag). Ist $total <= $dayRef, braucht der Auftrag eine zusammenhaengende Luecke am Starttag.
 * Ist er laenger, werden ab dem Starttag die freien Zeiten der folgenden Tage aufgefuellt (Luecken unter 30 Min. werden uebersprungen).
 * $startMin: gewuenschte Startzeit am Starttag (muss in einer Luecke liegen), sonst frueheste Moeglichkeit.
 * Rueckgabe: ['chunks' => [[Datum, Start, Minuten], ...], 'finish' => Datum, 'finish_min' => Ende-Minute] oder null.
 */
function wf_alloc(array $plan, int $wid, int $dayRef, int $total, string $startDay, ?int $startMin = null): ?array
{
    if ($total <= 0 || !isset($plan['days'][$startDay]['w'][$wid])) {
        return null;
    }
    $first = $plan['days'][$startDay]['w'][$wid]['iv'];
    if ($startMin !== null) {
        $inside = array_values(array_filter($first, fn($p) => $p[0] <= $startMin && $startMin < $p[1]));
        if (!$inside) {
            return null;
        }
        // Erste Luecke ab der gewuenschten Startzeit beschneiden, spaetere Luecken des Tages bleiben
        $clipped = [];
        foreach ($first as $p) {
            if ($p[1] <= $startMin) {
                continue;
            }
            $clipped[] = [max($p[0], $startMin), $p[1]];
        }
        $first = $clipped;
    }
    if ($total <= $dayRef) {
        foreach ($first as [$a, $b]) {
            if ($startMin !== null && $a !== $startMin) {
                continue;
            }
            if ($b - $a >= $total) {
                return ['chunks' => [[$startDay, $a, $total]], 'finish' => $startDay, 'finish_min' => $a + $total];
            }
        }
        return null;
    }
    // laenger als ein Arbeitstag: Tage nacheinander auffuellen
    $remaining = $total;
    $chunks = [];
    foreach ($plan['days'] as $d => $row) {
        if ($d < $startDay) {
            continue;
        }
        $ivs = $d === $startDay ? $first : ($row['w'][$wid]['iv'] ?? []);
        foreach ($ivs as [$a, $b]) {
            $len = $b - $a;
            if ($len < 30 && $len < $remaining) {
                continue;
            }
            $take = min($remaining, $len);
            $chunks[] = [$d, $a, $take];
            $remaining -= $take;
            if ($remaining <= 0) {
                break 2;
            }
        }
        if ($d === $startDay && !$chunks) {
            return null;
        }
    }
    if ($remaining > 0 || !$chunks) {
        return null;
    }
    $last = $chunks[count($chunks) - 1];
    return ['chunks' => $chunks, 'finish' => $last[0], 'finish_min' => $last[1] + $last[2]];
}

/** Fuer die Ausgabe: Bloecke und Ende als Text. */
function wf_alloc_public(array $al): array
{
    return [
        'start_date' => $al['chunks'][0][0],
        'start' => wf_min_to_hhmm($al['chunks'][0][1]),
        'finish' => $al['finish'],
        'finish_time' => wf_min_to_hhmm($al['finish_min']),
        'chunks' => array_map(fn($c) => ['date' => $c[0], 'start' => wf_min_to_hhmm($c[1]), 'end' => wf_min_to_hhmm($c[1] + $c[2]), 'minutes' => $c[2]], $al['chunks']),
    ];
}

/**
 * Die naechsten Tage, an denen der Auftrag starten kann (fruehester Start je Tag), ab $from, nie in der Vergangenheit.
 * Jeder Eintrag: wf_alloc_public() + 'free' (freie Minuten der Person an diesem Starttag).
 */
function wf_plan_options(array $plan, int $wid, int $dayRef, int $total, string $from, int $limit): array
{
    $from = max($from, date('Y-m-d'));
    $out = [];
    foreach ($plan['days'] as $d => $row) {
        if ($d < $from) {
            continue;
        }
        $x = $row['w'][$wid] ?? null;
        if (!$x || $row['blocked'] !== null || $x['free'] <= 0) {
            continue;
        }
        // schneller Vorfilter
        if ($total <= $dayRef) {
            if (!array_filter($x['iv'], fn($p) => $p[1] - $p[0] >= $total)) {
                continue;
            }
        } elseif ($x['free'] < min($total, 120)) {
            continue;
        }
        $al = wf_alloc($plan, $wid, $dayRef, $total, $d, null);
        if ($al) {
            $out[] = wf_alloc_public($al) + ['free' => $x['free']];
            if (count($out) >= $limit) {
                break;
            }
        }
    }
    return $out;
}

/** Moegliche Startzeiten an einem Tag (15-Minuten-Raster) fuer diesen Auftrag. */
function wf_plan_starts(array $plan, int $wid, int $dayRef, int $total, string $day): array
{
    $x = $plan['days'][$day]['w'][$wid] ?? null;
    if (!$x || $plan['days'][$day]['blocked'] !== null || $day < date('Y-m-d')) {
        return ['starts' => [], 'free' => []];
    }
    $starts = [];
    foreach ($x['iv'] as [$a, $b]) {
        for ($m = $a; $m < $b; $m += 15) {
            if ($total <= $dayRef) {
                if ($m + $total > $b) {
                    break;
                }
                $starts[] = ['start' => wf_min_to_hhmm($m), 'end' => wf_min_to_hhmm($m + $total)];
            } elseif ($b - $m >= 30) {
                $al = wf_alloc($plan, $wid, $dayRef, $total, $day, $m);
                if ($al) {
                    $starts[] = ['start' => wf_min_to_hhmm($m), 'end' => wf_min_to_hhmm($m + min($total, $b - $m)), 'finish' => $al['finish']];
                }
            }
        }
    }
    return ['starts' => $starts, 'free' => array_map(fn($p) => [wf_min_to_hhmm($p[0]), wf_min_to_hhmm($p[1])], $x['iv'])];
}

/** Speichert die Bloecke eines Auftrags und die abgeleiteten Felder. */
function wf_plan_save(PDO $db, int $orderId, array $al, int $total): void
{
    $db->prepare('DELETE FROM order_days WHERE order_id = ?')->execute([$orderId]);
    $ins = $db->prepare('INSERT INTO order_days (order_id, date, start_time, minutes) VALUES (?,?,?,?)');
    foreach ($al['chunks'] as [$d, $a, $m]) {
        $ins->execute([$orderId, $d, wf_min_to_hhmm($a), $m]);
    }
    $db->prepare('UPDATE orders SET plan_date = ?, start_time = ?, finish_date = ?, total_min = ? WHERE id = ?')
       ->execute([$al['chunks'][0][0], wf_min_to_hhmm($al['chunks'][0][1]), $al['finish'], $total, $orderId]);
}

/** Entfernt die Planung eines Auftrags (z. B. keine Dauer mehr). */
function wf_plan_clear(PDO $db, int $orderId, int $total): void
{
    $db->prepare('DELETE FROM order_days WHERE order_id = ?')->execute([$orderId]);
    $db->prepare('UPDATE orders SET start_time = NULL, finish_date = NULL, total_min = ? WHERE id = ?')->execute([$total, $orderId]);
}
