<?php
declare(strict_types=1);

require_once __DIR__ . '/plan.php';

/** Daten fuer die Werkstatt-Anzeige: bewusst sparsam (keine Kontaktdaten, keine Preise). */
function wf_display_payload(int $days = 10): array
{
    $db = wf_db();
    $today = date('Y-m-d');
    $to = date('Y-m-d', strtotime("+$days days"));

    $st = $db->prepare("
      SELECT o.id, o.nr, o.title, o.qty, o.status, o.pay_status, o.due_date, o.plan_date, o.start_time AS start, o.worker_id, o.total_min,
             c.name AS customer
      FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.deleted_at IS NULL AND o.status <> 'delivered'
        AND (o.due_date IS NULL OR o.due_date <= ?)
      ORDER BY (o.due_date IS NULL), o.due_date, (o.start_time IS NULL), o.start_time, o.id");
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
        $o['worker_id'] = (int)$o['worker_id'];
        $o['total_min'] = (int)$o['total_min'];
        unset($o['id']);
    }
    unset($o);

    $workers = array_map(fn($w) => ['id' => $w['id'], 'name' => $w['name'], 'color' => $w['color']], wf_workers(true));
    $plan = wf_plan_load($today, date('Y-m-d', strtotime('+6 days')));

    return [
        'version' => wf_version(),
        'today' => $today,
        'orders' => $orders,
        'processes' => $db->query('SELECT key, name_de, name_da, color FROM process_types WHERE active = 1 ORDER BY sort')->fetchAll(),
        'workers' => $workers,
        'capacity' => wf_plan_public($plan),
    ];
}
