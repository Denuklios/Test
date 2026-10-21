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

/** Auslastung je Tag und Verfahren. Gebucht wird am Produktionstag, sonst am Abgabetermin. */
function wf_capacity(string $from, string $to): array
{
    $db = wf_db();
    $procs = $db->query('SELECT id, key, capacity_min FROM process_types WHERE active = 1 ORDER BY sort')->fetchAll();
    $st = $db->prepare("
      SELECT COALESCE(o.plan_date, o.due_date) AS d, op.process_id, SUM(op.minutes) AS m
      FROM order_processes op JOIN orders o ON o.id = op.order_id
      WHERE o.deleted_at IS NULL AND o.status NOT IN ('done','delivered')
        AND COALESCE(o.plan_date, o.due_date) BETWEEN ? AND ?
      GROUP BY d, op.process_id");
    $st->execute([$from, $to]);
    $booked = [];
    foreach ($st as $r) {
        $booked[$r['d']][(int)$r['process_id']] = (int)$r['m'];
    }
    $out = [];
    for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
        $d = date('Y-m-d', $t);
        $weekend = (int)date('N', $t) >= 6;
        $row = ['date' => $d, 'weekend' => $weekend, 'p' => []];
        foreach ($procs as $p) {
            $cap = $weekend ? 0 : (int)$p['capacity_min'];
            $b = $booked[$d][(int)$p['id']] ?? 0;
            $row['p'][$p['key']] = ['cap' => $cap, 'booked' => $b, 'free' => max(0, $cap - $b)];
        }
        $out[] = $row;
    }
    return $out;
}
