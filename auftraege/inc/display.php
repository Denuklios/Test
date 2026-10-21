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

/** Gesperrte Tage im Zeitraum: Datum => Grund. */
function wf_blocked_map(string $from, string $to): array
{
    $st = wf_db()->prepare('SELECT date_from, date_to, reason FROM blocked_days WHERE date_to >= ? AND date_from <= ?');
    $st->execute([$from, $to]);
    $map = [];
    foreach ($st as $r) {
        for ($t = max(strtotime($r['date_from']), strtotime($from)); $t <= min(strtotime($r['date_to']), strtotime($to)); $t += 86400) {
            $map[date('Y-m-d', $t)] = $map[date('Y-m-d', $t)] ?? $r['reason'];
        }
    }
    return $map;
}

function wf_blocked_reason(string $date): ?string
{
    $m = wf_blocked_map($date, $date);
    return array_key_exists($date, $m) ? $m[$date] : null;
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
    $blocked = wf_blocked_map($from, $to);
    $wk = wf_weekend_min();
    $out = [];
    for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
        $d = date('Y-m-d', $t);
        $weekend = (int)date('N', $t) >= 6;
        $isBlocked = array_key_exists($d, $blocked);
        $row = ['date' => $d, 'weekend' => $weekend, 'blocked' => $isBlocked ? ($blocked[$d] ?? '') : null, 'p' => []];
        foreach ($procs as $p) {
            $cap = $isBlocked ? 0 : ($weekend ? min((int)$p['capacity_min'], $wk) : (int)$p['capacity_min']);
            $b = $booked[$d][(int)$p['id']] ?? 0;
            $row['p'][$p['key']] = ['cap' => $cap, 'booked' => $b, 'free' => max(0, $cap - $b)];
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
