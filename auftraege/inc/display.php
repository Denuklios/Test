<?php
declare(strict_types=1);

/** Daten fuer die Werkstatt-Anzeige: bewusst sparsam (keine Kontaktdaten, keine Preise). */
function wf_display_payload(int $days = 10): array
{
    $db = wf_db();
    $today = date('Y-m-d');
    $to = date('Y-m-d', strtotime("+$days days"));

    $st = $db->prepare("
      SELECT o.id, o.nr, o.title, o.qty, o.status, o.pay_status, o.due_date, o.plan_date, c.name AS customer,
             (SELECT MIN(start_time) FROM order_processes WHERE order_id = o.id) AS start
      FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.deleted_at IS NULL AND o.status <> 'delivered'
        AND (o.due_date IS NULL OR o.due_date <= ?)
      ORDER BY (o.due_date IS NULL), o.due_date, (start IS NULL), start, o.id");
    $st->execute([$to]);
    $orders = $st->fetchAll();

    $procs = [];
    foreach ($db->query('SELECT op.order_id, p.key FROM order_processes op JOIN process_types p ON p.id = op.process_id ORDER BY p.sort') as $r) {
        $procs[(int)$r['order_id']][] = $r['key'];
    }
    foreach ($orders as &$o) {
        $o['processes'] = $procs[(int)$o['id']] ?? [];
        $o['overdue'] = $o['due_date'] !== null && $o['due_date'] < $today && $o['status'] !== 'done';
        $o['unpaid'] = $o['pay_status'] !== 'paid';
        unset($o['id'], $o['plan_date']);
    }
    unset($o);

    return [
        'version' => wf_version(),
        'today' => $today,
        'orders' => $orders,
        'processes' => $db->query('SELECT key, name_de, name_da, color FROM process_types WHERE active = 1 ORDER BY sort')->fetchAll(),
        'capacity' => wf_capacity($today, date('Y-m-d', strtotime('+6 days'))),
    ];
}

/** Minuten pro Werktag-Verfahren am Wochenende (Einstellung, Standard 300 = 5 Stunden). */
function wf_weekend_min(): int
{
    $v = wf_db()->query("SELECT value FROM meta WHERE key = 'weekend_min'")->fetchColumn();
    return $v === false ? 300 : max(0, (int)$v);
}

function wf_hhmm_to_min(string $t): int
{
    return (int)substr($t, 0, 2) * 60 + (int)substr($t, 3, 2);
}

function wf_min_to_hhmm(int $m): string
{
    return sprintf('%02d:%02d', intdiv($m, 60), $m % 60);
}

/** Arbeitsbeginn (Minuten seit Mitternacht). Das Tagesfenster eines Verfahrens beginnt hier und ist so lang wie seine Kapazitaet. */
function wf_day_start(): int
{
    $v = wf_db()->query("SELECT value FROM meta WHERE key = 'day_start'")->fetchColumn();
    return wf_hhmm_to_min(is_string($v) && preg_match('/^\d\d:\d\d$/', $v) ? $v : '08:00');
}

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

/** Freie Zeitfenster: $window [von, bis] ohne die (verschmolzenen) $busy-Fenster. */
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

/** Auslastung je Tag und Verfahren. Gebucht wird am Produktionstag, sonst am Abgabetermin.
 *  Wochenenden zaehlen mit der Wochenend-Kapazitaet, gesperrte Tage mit 0.
 *  Je Verfahren: cap, booked, free (Minuten) und iv = freie Zeitfenster ['08:00','10:00'] (Tagesfenster ab Arbeitsbeginn,
 *  ohne Teilsperren und ohne Auftraege mit Startzeit). Auftraege ohne Startzeit zaehlen nur in booked/free. */
function wf_capacity(string $from, string $to, int $excludeOrder = 0): array
{
    $db = wf_db();
    $procs = $db->query('SELECT id, key, capacity_min FROM process_types WHERE active = 1 ORDER BY sort')->fetchAll();
    $st = $db->prepare("
      SELECT COALESCE(o.plan_date, o.due_date) AS d, op.process_id, op.minutes AS m, op.start_time AS s
      FROM order_processes op JOIN orders o ON o.id = op.order_id
      WHERE o.deleted_at IS NULL AND o.status NOT IN ('done','delivered') AND o.id <> ?
        AND COALESCE(o.plan_date, o.due_date) BETWEEN ? AND ?");
    $st->execute([$excludeOrder, $from, $to]);
    $booked = [];
    $sched = [];
    foreach ($st as $r) {
        $booked[$r['d']][(int)$r['process_id']] = ($booked[$r['d']][(int)$r['process_id']] ?? 0) + (int)$r['m'];
        if ($r['s'] && (int)$r['m'] > 0) {
            $a = wf_hhmm_to_min($r['s']);
            $sched[$r['d']][(int)$r['process_id']][] = [$a, $a + (int)$r['m']];
        }
    }
    $blocked = wf_block_days($from, $to);
    $wk = wf_weekend_min();
    $start = wf_day_start();
    $out = [];
    for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
        $d = date('Y-m-d', $t);
        $weekend = (int)date('N', $t) >= 6;
        $b = $blocked[$d] ?? null;
        $isBlocked = $b && $b['full'];
        $row = ['date' => $d, 'weekend' => $weekend, 'blocked' => $isBlocked ? $b['reason'] : null, 'partial' => null, 'p' => []];
        $maxLost = 0;
        foreach ($procs as $p) {
            $base = $weekend ? min((int)$p['capacity_min'], $wk) : (int)$p['capacity_min'];
            $window = [$start, $start + $base];
            $blockIv = $b && !$b['full'] ? $b['iv'] : [];
            // Verlust = Teilsperre innerhalb des Tagesfensters dieses Verfahrens
            $lost = $base - wf_iv_len(wf_free_iv($window, $blockIv));
            $maxLost = max($maxLost, $lost);
            $cap = $isBlocked ? 0 : max(0, $base - $lost);
            $bk = $booked[$d][(int)$p['id']] ?? 0;
            $iv = [];
            if (!$isBlocked && $cap > 0) {
                foreach (wf_free_iv($window, array_merge($blockIv, $sched[$d][(int)$p['id']] ?? [])) as [$x, $y]) {
                    $iv[] = [wf_min_to_hhmm($x), wf_min_to_hhmm($y)];
                }
            }
            $row['p'][$p['key']] = ['cap' => $cap, 'booked' => $bk, 'free' => max(0, $cap - $bk), 'iv' => $iv];
        }
        if ($b && !$b['full'] && $maxLost > 0) {
            $row['partial'] = ['lost' => $maxLost, 'reason' => $b['reason'], 'times' => $b['times']];
        }
        $out[] = $row;
    }
    return $out;
}

/**
 * Moegliche Startzeiten fuer eine Arbeit von $minutes Minuten eines Verfahrens an einem Tag (15-Minuten-Raster).
 * Leer, wenn der Tag gesperrt/zu voll ist oder die Arbeit laenger als ein normaler Werktag dauert (dann kein Zeitfenster, nur "ganzer Tag").
 * Rueckgabe: ['starts' => [['start' => '08:00', 'end' => '12:00'], ...], 'free' => [['08:00','10:00'], ...]]
 */
function wf_slots(string $date, int $processId, int $minutes, int $excludeOrder = 0): array
{
    $none = ['starts' => [], 'free' => []];
    $key = null;
    $dayCap = 0;
    foreach (wf_db()->query('SELECT id, key, capacity_min FROM process_types') as $r) {
        if ((int)$r['id'] === $processId) {
            $key = $r['key'];
            $dayCap = (int)$r['capacity_min'];
        }
    }
    if ($key === null || $minutes <= 0 || $minutes > $dayCap || $date < date('Y-m-d')) {
        return $none;
    }
    $day = wf_capacity($date, $date, $excludeOrder)[0];
    $x = $day['p'][$key] ?? null;
    if ($day['blocked'] !== null || !$x || $x['cap'] <= 0) {
        return $none;
    }
    $starts = [];
    if ($x['free'] >= $minutes) {
        foreach ($x['iv'] as [$a, $b]) {
            for ($m = wf_hhmm_to_min($a); $m + $minutes <= wf_hhmm_to_min($b); $m += 15) {
                $starts[] = ['start' => wf_min_to_hhmm($m), 'end' => wf_min_to_hhmm($m + $minutes)];
            }
        }
    }
    return ['starts' => $starts, 'free' => $x['iv']];
}

/**
 * Tage, an denen alle Verfahren in $need (process_id => Minuten) in die freie Kapazitaet passen.
 * Ohne $need: alle nicht gesperrten Tage mit Kapazitaet. Vergangene Tage kommen nie vor.
 * Dauert ein Verfahren laenger als ein normaler Werktag, kommen nur komplett freie Tage in Frage ($split = true).
 */
function wf_free_days(array $need, string $from, string $to, int $excludeOrder = 0, bool &$split = false): array
{
    $from = max($from, date('Y-m-d'));
    if ($from > $to) {
        return [];
    }
    $keys = [];
    $dayCap = [];
    foreach (wf_db()->query('SELECT id, key, capacity_min FROM process_types') as $r) {
        $keys[(int)$r['id']] = $r['key'];
        $dayCap[(int)$r['id']] = (int)$r['capacity_min'];
    }
    $out = [];
    foreach (wf_capacity($from, $to, $excludeOrder) as $d) {
        if ($d['blocked'] !== null) {
            continue;
        }
        $fits = true;
        if ($need) {
            foreach ($need as $pid => $min) {
                $x = $d['p'][$keys[$pid] ?? ''] ?? null;
                if (!$x || $x['cap'] <= 0) {
                    $fits = false;
                    break;
                }
                // Laenger als ein normaler Werktag: mehrtaegig, dann nur komplett freie Tage. Sonst muss es in den Tag passen.
                $multiDay = $min > ($dayCap[$pid] ?? 0);
                if ($multiDay) {
                    $split = true;
                }
                if ($x['free'] < ($multiDay ? $x['cap'] : $min)) {
                    $fits = false;
                    break;
                }
            }
        } else {
            $fits = array_sum(array_column($d['p'], 'cap')) > 0;
        }
        if ($fits) {
            $out[] = $d['date'];
        }
    }
    return $out;
}
