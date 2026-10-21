<?php
declare(strict_types=1);

/** Daten fuer die Werkstatt-Anzeige: bewusst sparsam (keine Kontaktdaten, keine Preise). */
function wf_display_payload(int $days = 10): array
{
    $db = wf_db();
    $today = date('Y-m-d');
    $to = date('Y-m-d', strtotime("+$days days"));

    $st = $db->prepare("
      SELECT o.id, o.nr, o.title, o.qty, o.status, o.pay_status, o.due_date, o.plan_date, c.name AS customer
      FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.deleted_at IS NULL AND o.status <> 'delivered'
        AND (o.due_date IS NULL OR o.due_date <= ?)
      ORDER BY (o.due_date IS NULL), o.due_date, o.id");
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

/**
 * Sperren im Zeitraum je Tag: Datum => ['full' => bool, 'lost' => Minuten, 'reason' => string, 'times' => ['13:00-17:00', ...]].
 * Eintraege ohne Uhrzeit sperren den ganzen Tag; mit Uhrzeit nur dieses Zeitfenster (ueberlappende Fenster werden nicht doppelt gezaehlt).
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
        $lost = 0;
        $iv = $x['iv'] ?? [];
        usort($iv, fn($a, $b) => $a[0] <=> $b[0]);
        $cur = null;
        foreach ($iv as [$a, $b]) {
            if ($cur && $a <= $cur[1]) {
                $cur[1] = max($cur[1], $b);
            } else {
                if ($cur) {
                    $lost += $cur[1] - $cur[0];
                }
                $cur = [$a, $b];
            }
        }
        if ($cur) {
            $lost += $cur[1] - $cur[0];
        }
        $out[$d] = ['full' => !empty($x['full']), 'lost' => $lost, 'reason' => (string)($x['reason'] ?? ''), 'times' => $x['times'] ?? []];
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
 *  Wochenenden zaehlen mit der Wochenend-Kapazitaet, gesperrte Tage mit 0. */
function wf_capacity(string $from, string $to, int $excludeOrder = 0): array
{
    $db = wf_db();
    $procs = $db->query('SELECT id, key, capacity_min FROM process_types WHERE active = 1 ORDER BY sort')->fetchAll();
    $st = $db->prepare("
      SELECT COALESCE(o.plan_date, o.due_date) AS d, op.process_id, SUM(op.minutes) AS m
      FROM order_processes op JOIN orders o ON o.id = op.order_id
      WHERE o.deleted_at IS NULL AND o.status NOT IN ('done','delivered') AND o.id <> ?
        AND COALESCE(o.plan_date, o.due_date) BETWEEN ? AND ?
      GROUP BY d, op.process_id");
    $st->execute([$excludeOrder, $from, $to]);
    $booked = [];
    foreach ($st as $r) {
        $booked[$r['d']][(int)$r['process_id']] = (int)$r['m'];
    }
    $blocked = wf_block_days($from, $to);
    $wk = wf_weekend_min();
    $out = [];
    for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
        $d = date('Y-m-d', $t);
        $weekend = (int)date('N', $t) >= 6;
        $b = $blocked[$d] ?? null;
        $isBlocked = $b && $b['full'];
        $lost = $b && !$b['full'] ? $b['lost'] : 0;
        $row = ['date' => $d, 'weekend' => $weekend, 'blocked' => $isBlocked ? $b['reason'] : null,
                'partial' => $lost > 0 ? ['lost' => $lost, 'reason' => $b['reason'], 'times' => $b['times']] : null, 'p' => []];
        foreach ($procs as $p) {
            $base = $weekend ? min((int)$p['capacity_min'], $wk) : (int)$p['capacity_min'];
            $cap = $isBlocked ? 0 : max(0, $base - $lost);
            $bk = $booked[$d][(int)$p['id']] ?? 0;
            $row['p'][$p['key']] = ['cap' => $cap, 'booked' => $bk, 'free' => max(0, $cap - $bk)];
        }
        $out[] = $row;
    }
    return $out;
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
