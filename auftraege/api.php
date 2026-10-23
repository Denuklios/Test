<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/display.php';
require_once __DIR__ . '/inc/invoice.php';
require __DIR__ . '/inc/confirm.php';
require_once __DIR__ . '/inc/expense.php';

const WF_STATUSES = ['inquiry', 'approval', 'material', 'production', 'done', 'delivered'];
const WF_PAY = ['open', 'deposit', 'paid'];

$user = wf_require_user();
$a = (string)($_GET['a'] ?? '');
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
$in = [];
if ($isPost) {
    wf_check_csrf();
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === 0) {
        $in = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($in)) {
            wf_fail('bad_json');
        }
    }
}
$db = wf_db();

// ---------- Hilfsfunktionen ----------
function s(array $in, string $k, int $max = 500): string
{
    $v = $in[$k] ?? '';
    if (!is_scalar($v)) {
        return '';
    }
    $v = trim((string)$v);
    return mb_substr($v, 0, $max);
}
function money(array $in, string $k): float
{
    $v = str_replace(',', '.', (string)($in[$k] ?? 0));
    if (!is_numeric($v) || (float)$v < 0 || (float)$v > 10000000) {
        wf_fail('bad_' . $k);
    }
    return round((float)$v, 2);
}
function date_or_null(array $in, string $k): ?string
{
    $v = s($in, $k, 10);
    if ($v === '') {
        return null;
    }
    $d = DateTime::createFromFormat('Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) {
        wf_fail('bad_' . $k);
    }
    return $v;
}
function need_post(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        wf_fail('post_required', 405);
    }
}
function log_order(PDO $db, int $orderId, array $user, string $what): void
{
    $db->prepare('INSERT INTO status_log (order_id, user_name, what) VALUES (?,?,?)')->execute([$orderId, $user['name'], $what]);
}
function order_row(PDO $db, int $id): array
{
    $st = $db->prepare('SELECT o.*, c.name AS customer_name, c.company AS customer_company, c.email AS customer_email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?');
    $st->execute([$id]);
    $o = $st->fetch();
    if (!$o) {
        wf_fail('not_found', 404);
    }
    $p = $db->prepare('SELECT process_id, minutes, per_piece FROM order_processes WHERE order_id = ?');
    $p->execute([$id]);
    $o['processes'] = $p->fetchAll();
    $dd = $db->prepare('SELECT date, start_time, minutes, kind FROM order_days WHERE order_id = ? ORDER BY date, start_time');
    $dd->execute([$id]);
    $o['days'] = array_map(fn($r) => ['date' => $r['date'], 'start' => $r['start_time'], 'end' => wf_min_to_hhmm(wf_hhmm_to_min($r['start_time']) + (int)$r['minutes']), 'minutes' => (int)$r['minutes'], 'kind' => $r['kind']], $dd->fetchAll());
    $f = $db->prepare('SELECT id, original_name, mime, size, uploaded_at FROM order_files WHERE order_id = ? ORDER BY id');
    $f->execute([$id]);
    $o['files'] = $f->fetchAll();
    $l = $db->prepare('SELECT user_name, what, at FROM status_log WHERE order_id = ? ORDER BY id DESC LIMIT 30');
    $l->execute([$id]);
    $o['log'] = $l->fetchAll();
    $o['invoices'] = array_map(fn($i) => ['id' => $i['id'], 'purpose' => $i['purpose'], 'status' => $i['status'], 'number' => $i['number'], 'total' => (int)$i['total'],
        'currency' => $i['currency'], 'open' => $i['balance']['open'], 'paid' => $i['balance']['paid'], 'due_date' => $i['due_date'], 'fully_credited' => $i['fully_credited']], wf_order_invoices($db, $id));
    $c = $db->prepare('SELECT id, created_at, expires_at, revoked_at, viewed_at, signed_at, signer_name, sign_ip FROM order_confirmations WHERE order_id = ? ORDER BY id DESC LIMIT 1');
    $c->execute([$id]);
    $o['confirmation'] = $c->fetch() ?: null;
    return $o;
}

/** Hochgeladene Datei pruefen (Endung + echter Inhaltstyp) und unter Zufallsnamen ablegen. Gibt [stored, mime, name, size]. */
function store_upload(string $field = 'file'): array
{
    $f = $_FILES[$field] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        wf_fail('upload_failed');
    }
    if ($f['size'] > wf_cfg('max_upload_bytes')) {
        wf_fail('too_large');
    }
    $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, wf_cfg('allowed_ext'), true)) {
        wf_fail('bad_type');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    $okMime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'pdf' => 'application/pdf'];
    if (($okMime[$ext] ?? '') !== $mime) {
        wf_fail('bad_type');
    }
    $stored = bin2hex(random_bytes(16)) . '.dat';
    $dest = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/' . $stored;
    if (!move_uploaded_file($f['tmp_name'], $dest)) {
        wf_fail('upload_failed', 500);
    }
    @chmod($dest, 0640);
    $orig = preg_replace('/[^\p{L}\p{N}._ -]/u', '_', basename((string)$f['name']));
    return [$stored, $mime, mb_substr((string)$orig, 0, 200), (int)$f['size']];
}

/** Rechnungszeilen aus der Eingabe pruefen. */
function inv_lines_in(array $in): array
{
    $raw = $in['lines'] ?? [];
    if (!is_array($raw) || count($raw) > 200) {
        wf_fail('bad_lines');
    }
    $out = [];
    foreach ($raw as $l) {
        if (!is_array($l)) {
            wf_fail('bad_lines');
        }
        $desc = s($l, 'description', 2000);
        $qty = str_replace(',', '.', (string)($l['qty'] ?? '1'));
        $price = wf_to_cents($l['unit_price'] ?? '0', true);
        $disc = str_replace(',', '.', (string)($l['discount'] ?? '0'));
        if ($desc === '' && ($price ?? 0) === 0) {
            continue;   // leere Zeile ignorieren
        }
        if (!is_numeric($qty) || abs((float)$qty) > 1000000 || $price === null || !is_numeric($disc ?: '0') || (float)$disc < 0 || (float)$disc > 100) {
            wf_fail('bad_lines');
        }
        $out[] = ['description' => $desc, 'qty' => round((float)$qty, 3), 'unit' => in_array($l['unit'] ?? '', WF_UNITS, true) ? $l['unit'] : 'stk',
            'unit_price' => $price, 'discount' => round((float)($disc ?: 0), 2), 'kind' => ($l['kind'] ?? '') === 'services' ? 'services' : 'goods'];
    }
    return [$out];
}
function inv_rate_in(array $in, string $currency): string
{
    if ($currency === 'DKK') {
        return '1';
    }
    $r = str_replace(',', '.', trim((string)($in['rate'] ?? '')));
    if ($r === '' || !is_numeric($r)) {
        return '0';
    }
    if ((float)$r < 0 || (float)$r > 10000) {
        wf_fail('bad_rate');
    }
    return rtrim(rtrim(sprintf('%.6F', (float)$r), '0'), '.');
}

try {
    switch ($a) {
        case 'me': {
            $tokens = $db->query('SELECT id, label, created_at, revoked_at, last_used_at FROM display_tokens ORDER BY id DESC')->fetchAll();
            wf_json([
                'ok' => true,
                'user' => $user,
                'csrf' => wf_csrf(),
                'statuses' => WF_STATUSES,
                'pay' => WF_PAY,
                'currencies' => wf_cfg('currencies'),
                'processes' => $db->query('SELECT * FROM process_types ORDER BY sort')->fetchAll(),
                'workers' => wf_workers(),
                'users' => $db->query('SELECT id, name, wf_admin_id, active FROM users ORDER BY id')->fetchAll(),
                'tokens' => $tokens,
                'blocked' => $db->query("SELECT id, date_from, date_to, reason, time_from, time_to FROM blocked_days WHERE date_to >= date('now','localtime') ORDER BY date_from")->fetchAll(),
                'settings' => ['weekend_min' => wf_weekend_min(), 'day_start' => wf_min_to_hhmm(wf_day_start())],
                'version' => wf_version(),
                'company' => wf_company(),
                'company_missing' => wf_company_missing(wf_company()),
                'countries' => wf_countries(),
                'eu' => WF_EU,
                'units' => WF_UNITS,
                'exp_categories' => wf_exp_categories(),
                'ai_enabled' => wf_ai_key() !== '',
                'invoices_final' => (int)$db->query("SELECT COUNT(*) FROM invoices WHERE status = 'final'")->fetchColumn(),
            ]);
        }

        case 'version':
            wf_json(['ok' => true, 'version' => wf_version()]);

        // ---------- Auftraege ----------
        case 'orders': {
            $w = ['1=1'];
            $p = [];
            $show = (string)($_GET['show'] ?? 'active');
            if ($show === 'trash') {
                $w[] = 'o.deleted_at IS NOT NULL';
            } else {
                $w[] = 'o.deleted_at IS NULL';
                if ($show === 'active') {
                    $w[] = "o.status <> 'delivered'";
                }
            }
            if (($q = trim((string)($_GET['q'] ?? ''))) !== '') {
                $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
                $w[] = "(o.nr LIKE ? ESCAPE '\\' OR o.title LIKE ? ESCAPE '\\' OR o.article LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR c.company LIKE ? ESCAPE '\\')";
                array_push($p, $like, $like, $like, $like, $like);
            }
            if (!empty($_GET['status']) && in_array($_GET['status'], WF_STATUSES, true)) {
                $w[] = 'o.status = ?';
                $p[] = $_GET['status'];
            }
            if (!empty($_GET['pay']) && in_array($_GET['pay'], WF_PAY, true)) {
                $w[] = 'o.pay_status = ?';
                $p[] = $_GET['pay'];
            }
            if (!empty($_GET['worker'])) {
                $w[] = 'o.worker_id = ?';
                $p[] = (int)$_GET['worker'];
            }
            if (!empty($_GET['customer_id'])) {
                $w[] = 'o.customer_id = ?';
                $p[] = (int)$_GET['customer_id'];
            }
            if (!empty($_GET['process'])) {
                $w[] = 'EXISTS (SELECT 1 FROM order_processes op WHERE op.order_id = o.id AND op.process_id = ?)';
                $p[] = (int)$_GET['process'];
            }
            foreach (['from' => '>=', 'to' => '<='] as $k => $op) {
                $v = (string)($_GET[$k] ?? '');
                if ($v !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
                    $w[] = "o.due_date $op ?";
                    $p[] = $v;
                }
            }
            if (!empty($_GET['overdue'])) {
                $w[] = "o.due_date < date('now','localtime') AND o.status NOT IN ('done','delivered')";
            }
            $sql = 'SELECT o.id, o.nr, o.title, o.qty, o.price, o.deposit, o.currency, o.status, o.pay_status, o.due_date, o.plan_date, o.start_time, o.finish_date, o.total_min, o.worker_id,
                           (SELECT id FROM order_files WHERE order_id = o.id AND mime LIKE \'image/%\' ORDER BY id LIMIT 1) AS thumb,
                           c.name AS customer_name, c.company AS customer_company, o.customer_id,
                           (SELECT group_concat(process_id) FROM order_processes WHERE order_id = o.id) AS process_ids
                    FROM orders o JOIN customers c ON c.id = o.customer_id
                    WHERE ' . implode(' AND ', $w) . '
                    ORDER BY (o.due_date IS NULL), o.due_date, o.id DESC LIMIT 500';
            $st = $db->prepare($sql);
            $st->execute($p);
            wf_json(['ok' => true, 'orders' => $st->fetchAll()]);
        }

        case 'order':
            wf_json(['ok' => true, 'order' => order_row($db, (int)($_GET['id'] ?? 0))]);

        case 'order_save': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            $cid = (int)($in['customer_id'] ?? 0);
            $chk = $db->prepare('SELECT 1 FROM customers WHERE id = ? AND anonymized_at IS NULL');
            $chk->execute([$cid]);
            if (!$chk->fetchColumn()) {
                wf_fail('bad_customer');
            }
            $title = s($in, 'title', 200);
            if ($title === '') {
                wf_fail('title_required');
            }
            $qty = max(1, min(1000000, (int)($in['qty'] ?? 1)));
            $price = money($in, 'price');
            $deposit = money($in, 'deposit');
            $cur = s($in, 'currency', 3);
            if (!in_array($cur, wf_cfg('currencies'), true)) {
                wf_fail('bad_currency');
            }
            $status = s($in, 'status', 20) ?: 'inquiry';
            $pay = s($in, 'pay_status', 10) ?: 'open';
            if (!in_array($status, WF_STATUSES, true) || !in_array($pay, WF_PAY, true)) {
                wf_fail('bad_status');
            }
            if ($pay === 'paid') {
                $deposit = $price;
            } elseif ($pay === 'open') {
                $deposit = 0.0;
            } elseif ($deposit <= 0) {
                wf_fail('deposit_required');
            }
            $due = date_or_null($in, 'due_date');
            $planIn = date_or_null($in, 'plan_date');
            $startIn = trim((string)($in['start_time'] ?? ''));
            if ($startIn !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $startIn)) {
                wf_fail('bad_start_time');
            }
            $startIn = $startIn === '' ? null : $startIn;
            $oldRow = $id ? order_row($db, $id) : null;
            // Verfahren mit geschaetzter Dauer; die Gesamtdauer ist ihre Summe (eine Person arbeitet alles nacheinander ab)
            // Dauer je Stueck in Minuten (1-60); die Gesamtzeit je Verfahren = je Stueck x Menge. Rohe 'minutes' bleiben fuer Altdaten/API moeglich.
            $procs = [];
            $perPiece = [];
            foreach ((array)($in['processes'] ?? []) as $pr) {
                $pid = (int)($pr['process_id'] ?? 0);
                if ($pid <= 0) {
                    continue;
                }
                $pp = (int)($pr['per_piece'] ?? 0);
                if ($pp > 0) {
                    if ($pp > 60) {
                        wf_fail('bad_per_piece');
                    }
                    $procs[$pid] = $pp * $qty;
                    $perPiece[$pid] = $pp;
                } else {
                    $procs[$pid] = max(0, min(100000, (int)($pr['minutes'] ?? 0)));
                    $perPiece[$pid] = null;
                }
            }
            $total = array_sum($procs);
            $wid = (int)($in['worker_id'] ?? 1) ?: 1;
            $worker = wf_worker($wid);
            if (!$worker || !$worker['active']) {
                wf_fail('bad_worker');
            }
            // Vergangenheit und gesperrte Tage nur pruefen, wenn das Datum neu oder geaendert ist
            foreach (['due_date' => $due, 'plan_date' => $planIn] as $field => $val) {
                if ($val !== null && (!$oldRow || ($oldRow[$field] ?? null) !== $val)) {
                    if ($val < date('Y-m-d')) {
                        wf_fail('date_past', 400, ['field' => $field]);
                    }
                    if (wf_blocked_reason($val) !== null) {
                        wf_fail('date_blocked', 400, ['field' => $field]);
                    }
                }
            }
            // Einplanen: ohne Produktionstag wird der fruehestmoegliche gewaehlt. Unveraenderte Planung bleibt, wie sie ist.
            $needPlan = $total > 0 && !in_array($status, ['done', 'delivered'], true);
            $unchanged = $oldRow && (int)$oldRow['worker_id'] === $wid && (int)$oldRow['total_min'] === $total && $oldRow['finish_date'] !== null
                && ($planIn === null || $planIn === $oldRow['plan_date']) && ($startIn === null || $startIn === $oldRow['start_time']);
            $alloc = null;
            if ($needPlan && !$unchanged) {
                $from = $planIn ?? date('Y-m-d');
                $plan = wf_plan_load($from, date('Y-m-d', strtotime($from . ' +150 days')), $id);
                if ($planIn === null) {
                    $opts = wf_plan_options($plan, $wid, $worker['day_min'], $total, $from, 1);
                    if (!$opts) {
                        wf_fail('no_capacity');
                    }
                    $planIn = $opts[0]['start_date'];
                }
                $alloc = wf_alloc($plan, $wid, $worker['day_min'], $total, $planIn, $startIn === null ? null : wf_hhmm_to_min($startIn));
                if (!$alloc) {
                    wf_fail($startIn !== null ? 'slot_taken' : 'no_capacity');
                }
            }
            $finish = $alloc ? $alloc['finish'] : ($unchanged ? $oldRow['finish_date'] : null);
            // Abgabe mindestens einen Tag nach dem Produktionsende. Bereits gespeicherte, unveraenderte Termine bleiben unangetastet.
            $dueChanged = !$oldRow || ($oldRow['due_date'] ?? null) !== $due;
            if ($due !== null && $finish !== null && $due <= $finish && ($dueChanged || $alloc)) {
                wf_fail('due_before_finish', 400, ['finish' => $finish]);
            }
            // Uebergabe am Abgabetag: eine Stunde der Person ist weg. Faellt der Termin aufs Wochenende (oder auf einen Tag ohne
            // freie Stunde), springt er automatisch auf den naechsten passenden Tag, in der Regel Montag.
            $handover = null;
            $dueAdjusted = null;
            $handoverSlot = null;
            $needH = false;
            if ($due !== null && !in_array($status, ['done', 'delivered'], true)) {
                $hasH = false;
                foreach ($oldRow['days'] ?? [] as $dd_) {
                    $hasH = $hasH || ($dd_['kind'] ?? '') === 'handover';
                }
                $needH = $dueChanged || $alloc || !$oldRow || (int)$oldRow['worker_id'] !== $wid || !$hasH;
                if ($needH) {
                    $planH = wf_plan_load($due, date('Y-m-d', strtotime($due . ' +90 days')), $id);
                    $next = wf_due_days($planH, $wid, $due, 1);
                    if (!$next) {
                        wf_fail('no_handover_slot');
                    }
                    if ($next[0] !== $due) {
                        $dueAdjusted = ['from' => $due, 'to' => $next[0]];
                        $due = $next[0];
                    }
                    $handoverSlot = wf_handover_slot($planH, $wid, $due);
                }
            }
            $db->beginTransaction();
            if ($id) {
                $old = order_row($db, $id);
                $db->prepare('UPDATE orders SET customer_id=?, title=?, description=?, article=?, qty=?, price=?, deposit=?, currency=?, pay_status=?, status=?, due_date=?, worker_id=?, notes=?, updated_at=datetime(\'now\') WHERE id=?')
                   ->execute([$cid, $title, s($in, 'description', 5000), s($in, 'article', 300), $qty, $price, $deposit, $cur, $pay, $status, $due, $wid, s($in, 'notes', 5000), $id]);
                if ($old['status'] !== $status) {
                    log_order($db, $id, $user, 'status:' . $status);
                }
                if ($old['pay_status'] !== $pay) {
                    log_order($db, $id, $user, 'pay:' . $pay);
                }
                log_order($db, $id, $user, 'edit');
            } else {
                $year = date('Y');
                $n = (int)$db->query("SELECT COUNT(*) FROM orders WHERE nr LIKE '$year-%'")->fetchColumn() + 1;
                do {
                    $nr = sprintf('%s-%04d', $year, $n++);
                    $ex = $db->prepare('SELECT 1 FROM orders WHERE nr = ?');
                    $ex->execute([$nr]);
                } while ($ex->fetchColumn());
                $db->prepare('INSERT INTO orders (nr, customer_id, title, description, article, qty, price, deposit, currency, pay_status, status, due_date, worker_id, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                   ->execute([$nr, $cid, $title, s($in, 'description', 5000), s($in, 'article', 300), $qty, $price, $deposit, $cur, $pay, $status, $due, $wid, s($in, 'notes', 5000), $user['id'] ?: null]);
                $id = (int)$db->lastInsertId();
                log_order($db, $id, $user, 'created');
            }
            $db->prepare('DELETE FROM order_processes WHERE order_id = ?')->execute([$id]);
            $ins = $db->prepare('INSERT INTO order_processes (order_id, process_id, minutes, per_piece) SELECT ?, id, ?, ? FROM process_types WHERE id = ?');
            foreach ($procs as $pid => $min) {
                $ins->execute([$id, $min, $perPiece[$pid], $pid]);
            }
            if ($alloc) {
                wf_plan_save($db, $id, $alloc, $total);
            } elseif ($total === 0) {
                wf_plan_clear($db, $id, 0);
                $db->prepare('UPDATE orders SET plan_date = NULL WHERE id = ?')->execute([$id]);
            } else {
                $db->prepare('UPDATE orders SET total_min = ? WHERE id = ?')->execute([$total, $id]);
            }
            if ($due === null || in_array($status, ['done', 'delivered'], true)) {
                if ($due === null) {
                    wf_handover_save($db, $id, null, null);
                }
            } elseif ($needH) {
                wf_handover_save($db, $id, $due, $handoverSlot);
            }
            wf_touch();
            $db->commit();
            wf_json(['ok' => true, 'order' => order_row($db, $id), 'due_adjusted' => $dueAdjusted]);
        }

        case 'order_status': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            $o = order_row($db, $id);
            $upd = [];
            if (isset($in['status'])) {
                if (!in_array($in['status'], WF_STATUSES, true)) {
                    wf_fail('bad_status');
                }
                $upd['status'] = $in['status'];
            }
            if (isset($in['pay_status'])) {
                if (!in_array($in['pay_status'], WF_PAY, true)) {
                    wf_fail('bad_status');
                }
                $upd['pay_status'] = $in['pay_status'];
                if ($in['pay_status'] === 'paid') {
                    $upd['deposit'] = $o['price'];
                } elseif ($in['pay_status'] === 'open') {
                    $upd['deposit'] = 0;
                }
            }
            if (!$upd) {
                wf_fail('nothing');
            }
            $set = implode(',', array_map(fn($k) => "$k = ?", array_keys($upd)));
            $db->prepare("UPDATE orders SET $set, updated_at = datetime('now') WHERE id = ?")->execute([...array_values($upd), $id]);
            foreach ($upd as $k => $v) {
                if ($k === 'status') {
                    log_order($db, $id, $user, 'status:' . $v);
                }
                if ($k === 'pay_status') {
                    log_order($db, $id, $user, 'pay:' . $v);
                }
            }
            wf_touch();
            // Abgeholt/versendet: Schlussrechnung als Entwurf vorbereiten (falls noch keine Rechnung existiert)
            $invId = null;
            if (($upd['status'] ?? '') === 'delivered' && (float)$o['price'] > 0) {
                $had = (bool)array_filter(wf_order_invoices($db, $id), fn($i) => $i['purpose'] !== 'deposit' && !$i['fully_credited']);
                if (!$had) {
                    try {
                        $invId = wf_order_invoice($db, $id, 'final', $user['name']);
                    } catch (RuntimeException $e) {
                        $invId = null;   // z. B. Anzahlung noch Entwurf: dann von Hand
                    }
                }
            }
            wf_json(['ok' => true, 'order' => order_row($db, $id), 'invoice_id' => $invId]);
        }

        case 'order_invoice': {
            need_post();
            try {
                $amt = isset($in['amount']) && $in['amount'] !== '' ? wf_to_cents($in['amount']) : null;
                if (isset($in['amount']) && $in['amount'] !== '' && !$amt) {
                    wf_fail('bad_amount');
                }
                $iid = wf_order_invoice($db, (int)($in['order_id'] ?? 0), ($in['purpose'] ?? '') === 'deposit' ? 'deposit' : 'final', $user['name'], $amt);
            } catch (RuntimeException $e) {
                wf_fail($e->getMessage(), $e->getMessage() === 'not_found' ? 404 : 400);
            }
            wf_json(['ok' => true, 'id' => $iid]);
        }

        // ---------- Auftragsbestaetigung mit Unterschrift ----------
        case 'confirm_create': {
            need_post();
            $o = order_row($db, (int)($in['order_id'] ?? 0));
            $cs = $db->prepare('SELECT * FROM customers WHERE id = ?');
            $cs->execute([$o['customer_id']]);
            $cust = $cs->fetch();
            $token = bin2hex(random_bytes(24));
            $lang = in_array($in['lang'] ?? '', WF_DOC_LANGS, true) ? $in['lang'] : wf_doc_lang_for($cust);
            $db->prepare("UPDATE order_confirmations SET revoked_at = datetime('now') WHERE order_id = ? AND signed_at IS NULL AND revoked_at IS NULL")->execute([$o['id']]);
            $db->prepare("INSERT INTO order_confirmations (order_id, token_hash, lang, snapshot, created_by, expires_at) VALUES (?,?,?,?,?, datetime('now', '+30 days'))")
                ->execute([$o['id'], hash('sha256', $token), $lang, json_encode(wf_confirm_snapshot($db, $o, $cust), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $user['name']]);
            log_order($db, $o['id'], $user, 'confirm_sent');
            wf_json(['ok' => true, 'token' => $token]);
        }

        case 'confirm_revoke': {
            need_post();
            $db->prepare("UPDATE order_confirmations SET revoked_at = datetime('now') WHERE order_id = ? AND signed_at IS NULL AND revoked_at IS NULL")->execute([(int)($in['order_id'] ?? 0)]);
            wf_json(['ok' => true]);
        }

        case 'confirm_signature': {
            $st = $db->prepare('SELECT signature FROM order_confirmations WHERE id = ? AND signed_at IS NOT NULL');
            $st->execute([(int)($_GET['id'] ?? 0)]);
            $sig = (string)($st->fetchColumn() ?: '');
            if ($sig === '') {
                wf_fail('not_found', 404);
            }
            header('Content-Type: image/png');
            header('Cache-Control: private, max-age=3600');
            echo base64_decode($sig);
            exit;
        }

        // ---------- Produkte ----------
        case 'products':
            wf_json(['ok' => true, 'products' => $db->query('SELECT * FROM products ORDER BY active DESC, sort, name COLLATE NOCASE')->fetchAll()]);

        case 'product_save': {
            need_post();
            $name = s($in, 'name', 300);
            if ($name === '') {
                wf_fail('name_required');
            }
            $price = wf_to_cents($in['price'] ?? '0');
            if ($price === null) {
                wf_fail('bad_price');
            }
            $vals = [$name, in_array($in['unit'] ?? '', WF_UNITS, true) ? $in['unit'] : 'stk', $price, ($in['kind'] ?? '') === 'services' ? 'services' : 'goods', !empty($in['active']) || !isset($in['active']) ? 1 : 0];
            $id = (int)($in['id'] ?? 0);
            if ($id) {
                $db->prepare('UPDATE products SET name=?, unit=?, price=?, kind=?, active=? WHERE id = ?')->execute([...$vals, $id]);
            } else {
                $db->prepare('INSERT INTO products (name, unit, price, kind, active) VALUES (?,?,?,?,?)')->execute($vals);
                $id = (int)$db->lastInsertId();
            }
            wf_json(['ok' => true, 'id' => $id]);
        }

        case 'product_delete': {
            need_post();
            $db->prepare('DELETE FROM products WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
            wf_json(['ok' => true]);
        }

        case 'company_lookup': {
            $country = (string)($_GET['country'] ?? 'DK');
            if (!isset(wf_countries()[$country])) {
                wf_fail('bad_country');
            }
            $r = wf_company_lookup($country, (string)($_GET['number'] ?? ''));
            if ($r === null) {
                wf_fail('lookup_unavailable', 503);
            }
            if (($r['valid'] ?? true) === false || ($r['name'] ?? '') === '') {
                wf_fail('lookup_not_found', 404);
            }
            wf_json(['ok' => true] + $r);
        }

        case 'order_delete':
        case 'order_restore': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            order_row($db, $id);
            $db->prepare('UPDATE orders SET deleted_at = ' . ($a === 'order_delete' ? "datetime('now')" : 'NULL') . ' WHERE id = ?')->execute([$id]);
            log_order($db, $id, $user, $a === 'order_delete' ? 'deleted' : 'restored');
            wf_touch();
            wf_json(['ok' => true]);
        }

        // ---------- Kunden ----------
        case 'customers': {
            $q = trim((string)($_GET['q'] ?? ''));
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
            $st = $db->prepare("SELECT c.id, c.name, c.company, c.email, c.phone, c.currency, c.country, c.vat_id, c.is_business,
                                  (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.deleted_at IS NULL) AS order_count
                                FROM customers c
                                WHERE c.anonymized_at IS NULL AND (? = '' OR c.name LIKE ? ESCAPE '\\' OR c.company LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')
                                ORDER BY c.name COLLATE NOCASE LIMIT 300");
            $st->execute([$q, $like, $like, $like, $like]);
            wf_json(['ok' => true, 'customers' => $st->fetchAll()]);
        }

        case 'customer': {
            $id = (int)($_GET['id'] ?? 0);
            $st = $db->prepare('SELECT * FROM customers WHERE id = ?');
            $st->execute([$id]);
            $c = $st->fetch();
            if (!$c) {
                wf_fail('not_found', 404);
            }
            $o = $db->prepare('SELECT id, nr, title, qty, price, deposit, currency, status, pay_status, due_date FROM orders WHERE customer_id = ? AND deleted_at IS NULL ORDER BY id DESC');
            $o->execute([$id]);
            $c['orders'] = $o->fetchAll();
            $iv = $db->prepare('SELECT id, type, status, number, issue_date, due_date, currency, total FROM invoices WHERE customer_id = ? ORDER BY COALESCE(number, 1e12) DESC, id DESC');
            $iv->execute([$id]);
            $c['invoices'] = $iv->fetchAll();
            wf_json(['ok' => true, 'customer' => $c]);
        }

        case 'customer_save': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            $name = s($in, 'name', 200);
            if ($name === '') {
                wf_fail('name_required');
            }
            $email = s($in, 'email', 200);
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                wf_fail('bad_email');
            }
            $cur = s($in, 'currency', 3) ?: 'DKK';
            if (!in_array($cur, wf_cfg('currencies'), true)) {
                wf_fail('bad_currency');
            }
            $country = s($in, 'country', 2) ?: 'DK';
            if (!isset(wf_countries()[$country])) {
                wf_fail('bad_country');
            }
            $docLang = s($in, 'doc_lang', 2);
            if ($docLang !== '' && !in_array($docLang, WF_DOC_LANGS, true)) {
                wf_fail('bad_lang');
            }
            $isBiz = !empty($in['is_business']) ? 1 : 0;
            $vat = wf_vat_norm(s($in, 'vat_id', 30), $country);
            if ($vat !== '' && $country === 'DK' && !wf_cvr_valid(substr($vat, 2))) {
                wf_fail('bad_cvr');
            }
            if ($vat !== '' && in_array($country, WF_EU, true) && !preg_match('/^[A-Z]{2}[A-Z0-9]{2,14}$/', $vat)) {
                wf_fail('bad_vat_id');
            }
            $vals = [$name, s($in, 'company', 200), $email, s($in, 'phone', 60), s($in, 'address', 500), $cur, s($in, 'notes', 3000), $country, $vat, $isBiz, $docLang];
            if ($id) {
                $old = $db->prepare('SELECT vat_id, country FROM customers WHERE id = ?');
                $old->execute([$id]);
                $o = $old->fetch();
                $db->prepare('UPDATE customers SET name=?, company=?, email=?, phone=?, address=?, currency=?, notes=?, country=?, vat_id=?, is_business=?, doc_lang=? WHERE id=? AND anonymized_at IS NULL')->execute([...$vals, $id]);
                if ($o && ($o['vat_id'] !== $vat || $o['country'] !== $country)) {
                    $db->prepare("UPDATE customers SET vat_valid = NULL, vat_checked_at = NULL, vat_checked_name = '' WHERE id = ?")->execute([$id]);
                }
            } else {
                $db->prepare('INSERT INTO customers (name, company, email, phone, address, currency, notes, country, vat_id, is_business, doc_lang) VALUES (?,?,?,?,?,?,?,?,?,?,?)')->execute($vals);
                $id = (int)$db->lastInsertId();
            }
            // EU-Firmenkunde: USt-ID gleich bei VIES pruefen (ohne Netz bleibt sie ungeprueft)
            if ($vat !== '' && in_array($country, WF_EU, true)) {
                $chk = $db->prepare('SELECT vat_checked_at FROM customers WHERE id = ?');
                $chk->execute([$id]);
                if (!$chk->fetchColumn() && ($r = wf_vies($vat)) !== null) {
                    $db->prepare("UPDATE customers SET vat_valid = ?, vat_checked_name = ?, vat_checked_at = datetime('now') WHERE id = ?")->execute([$r['valid'] ? 1 : 0, $r['name'], $id]);
                }
            }
            wf_touch();
            wf_json(['ok' => true, 'id' => $id]);
        }

        // DSGVO: Personendaten entfernen, Auftraege bleiben (Buchhaltung) ohne Personenbezug.
        case 'customer_anonymize': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            $db->prepare("UPDATE customers SET name = 'Gelöscht #' || id, company = '', email = '', phone = '', address = '', notes = '', anonymized_at = datetime('now') WHERE id = ?")->execute([$id]);
            wf_touch();
            wf_json(['ok' => true]);
        }

        case 'customer_export': { // DSGVO-Auskunft
            $id = (int)($_GET['id'] ?? 0);
            $c = $db->prepare('SELECT * FROM customers WHERE id = ?');
            $c->execute([$id]);
            $o = $db->prepare('SELECT nr, title, description, article, qty, price, deposit, currency, status, pay_status, due_date, notes, created_at FROM orders WHERE customer_id = ?');
            $o->execute([$id]);
            $iv = $db->prepare('SELECT type, status, number, issue_date, due_date, currency, net, vat, total, customer_snap FROM invoices WHERE customer_id = ?');
            $iv->execute([$id]);
            header('Content-Disposition: attachment; filename="kunde-' . $id . '.json"');
            wf_json(['customer' => $c->fetch(), 'orders' => $o->fetchAll(), 'invoices' => $iv->fetchAll()]);
        }

        // ---------- Dateien ----------
        case 'file_upload': {
            need_post();
            $oid = (int)($_POST['order_id'] ?? 0);
            order_row($db, $oid);
            $f = $_FILES['file'] ?? null;
            if (!$f || $f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
                wf_fail('upload_failed');
            }
            if ($f['size'] > wf_cfg('max_upload_bytes')) {
                wf_fail('too_large');
            }
            $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, wf_cfg('allowed_ext'), true)) {
                wf_fail('bad_type');
            }
            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
            $okMime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif', 'pdf' => 'application/pdf'];
            if (($okMime[$ext] ?? '') !== $mime) {
                wf_fail('bad_type');
            }
            $stored = bin2hex(random_bytes(16)) . '.dat';
            $dest = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/' . $stored;
            if (!move_uploaded_file($f['tmp_name'], $dest)) {
                wf_fail('upload_failed', 500);
            }
            @chmod($dest, 0640);
            $orig = preg_replace('/[^\p{L}\p{N}._ -]/u', '_', basename((string)$f['name']));
            $db->prepare('INSERT INTO order_files (order_id, original_name, stored_name, mime, size) VALUES (?,?,?,?,?)')
               ->execute([$oid, mb_substr($orig, 0, 200), $stored, $mime, (int)$f['size']]);
            log_order($db, $oid, $user, 'file:' . $orig);
            wf_touch();
            wf_json(['ok' => true, 'order' => order_row($db, $oid)]);
        }

        case 'file_delete': {
            need_post();
            $st = $db->prepare('SELECT * FROM order_files WHERE id = ?');
            $st->execute([(int)($in['id'] ?? 0)]);
            $f = $st->fetch();
            if (!$f) {
                wf_fail('not_found', 404);
            }
            @unlink(rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/' . $f['stored_name']);
            array_map('unlink', glob(rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/thumbs/' . $f['stored_name'] . '.*') ?: []);
            $db->prepare('DELETE FROM order_files WHERE id = ?')->execute([$f['id']]);
            wf_touch();
            wf_json(['ok' => true, 'order' => order_row($db, (int)$f['order_id'])]);
        }

        // ---------- Kalender und Planung ----------
        case 'calendar': {
            $from = (string)($_GET['from'] ?? date('Y-m-d'));
            $to = (string)($_GET['to'] ?? date('Y-m-d', strtotime('+27 days')));
            foreach ([$from, $to] as $d) {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
                    wf_fail('bad_date');
                }
            }
            if (strtotime($to) - strtotime($from) > 100 * 86400) {
                wf_fail('range_too_large');
            }
            $st = $db->prepare("SELECT d.date, d.start_time, d.minutes, d.kind, o.id, o.nr, o.title, o.qty, o.status, o.worker_id, o.finish_date, o.due_date, o.total_min, c.name AS customer_name,
                                       (SELECT group_concat(process_id) FROM order_processes WHERE order_id = o.id) AS process_ids,
                                       (SELECT id FROM order_files WHERE order_id = o.id AND mime LIKE 'image/%' ORDER BY id LIMIT 1) AS thumb
                                FROM order_days d JOIN orders o ON o.id = d.order_id JOIN customers c ON c.id = o.customer_id
                                WHERE o.deleted_at IS NULL AND o.status NOT IN ('done','delivered') AND d.date BETWEEN ? AND ?
                                ORDER BY d.date, d.start_time, o.id");
            $st->execute([$from, $to]);
            $items = array_map(function ($r) {
                $r['end'] = wf_min_to_hhmm(wf_hhmm_to_min($r['start_time']) + (int)$r['minutes']);
                return $r;
            }, $st->fetchAll());
            wf_json(['ok' => true, 'days' => wf_plan_public(wf_plan_load($from, $to)), 'items' => $items, 'workers' => wf_workers(true)]);
        }

        // Naechste freie Produktionstage fuer eine Gesamtdauer (und Person). limit>6 fuer die Tageswahl.
        case 'plan_options': {
            $worker = wf_worker((int)($_GET['worker_id'] ?? 1) ?: 1);
            if (!$worker || !$worker['active']) {
                wf_fail('bad_worker');
            }
            $total = max(0, min(100000, (int)($_GET['total'] ?? 0)));
            if ($total <= 0) {
                wf_fail('no_duration');
            }
            $from = (string)($_GET['from'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || $from < date('Y-m-d')) {
                $from = date('Y-m-d');
            }
            $limit = max(1, min(200, (int)($_GET['limit'] ?? 6)));
            $plan = wf_plan_load($from, date('Y-m-d', strtotime($from . ' +150 days')), (int)($_GET['exclude'] ?? 0));
            wf_json(['ok' => true, 'options' => wf_plan_options($plan, $worker['id'], $worker['day_min'], $total, $from, $limit), 'day_min' => $worker['day_min']]);
        }

        // Freie Startzeiten an einem Tag
        case 'plan_slots':
        case 'plan_preview': {
            $worker = wf_worker((int)($_GET['worker_id'] ?? 1) ?: 1);
            $date = (string)($_GET['date'] ?? '');
            if (!$worker || !$worker['active']) {
                wf_fail('bad_worker');
            }
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
                wf_fail('bad_date');
            }
            $total = max(0, min(100000, (int)($_GET['total'] ?? 0)));
            if ($total <= 0) {
                wf_fail('no_duration');
            }
            $plan = wf_plan_load($date, date('Y-m-d', strtotime($date . ' +150 days')), (int)($_GET['exclude'] ?? 0));
            if ($a === 'plan_slots') {
                wf_json(['ok' => true] + wf_plan_starts($plan, $worker['id'], $worker['day_min'], $total, $date) + ['blocked' => wf_blocked_reason($date)]);
            }
            $start = (string)($_GET['start'] ?? '');
            $al = $date < date('Y-m-d') ? null : wf_alloc($plan, $worker['id'], $worker['day_min'], $total, $date, preg_match('/^\d\d:\d\d$/', $start) ? wf_hhmm_to_min($start) : null);
            $dueMin = null;
            if ($al) {
                $after = date('Y-m-d', strtotime($al['finish'] . ' +1 day'));
                $planD = wf_plan_load($after, date('Y-m-d', strtotime($after . ' +90 days')), (int)($_GET['exclude'] ?? 0));
                $dueMin = wf_due_days($planD, $worker['id'], $after, 1)[0] ?? null;
            }
            wf_json(['ok' => true, 'possible' => (bool)$al, 'due_min' => $dueMin] + ($al ? wf_alloc_public($al) : []));
        }

        // Moegliche Abgabetage ab $from: nur Werktage, nicht gesperrt, und die Person hat noch eine freie Stunde fuer die Uebergabe
        case 'due_days': {
            $worker = wf_worker((int)($_GET['worker_id'] ?? 1) ?: 1);
            if (!$worker || !$worker['active']) {
                wf_fail('bad_worker');
            }
            $from = (string)($_GET['from'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || $from < date('Y-m-d')) {
                $from = date('Y-m-d');
            }
            $plan = wf_plan_load($from, date('Y-m-d', strtotime($from . ' +180 days')), (int)($_GET['exclude'] ?? 0));
            wf_json(['ok' => true, 'dates' => wf_due_days($plan, $worker['id'], $from, 150)]);
        }

        case 'workers_save': {
            need_post();
            $rows = (array)($in['workers'] ?? []);
            foreach ($rows as $w) {
                $wid = (int)($w['id'] ?? 0);
                $name = mb_substr(trim((string)($w['name'] ?? '')), 0, 40);
                $color = (string)($w['color'] ?? '');
                $min = (int)($w['day_min'] ?? 480);
                if ($wid < 1 || $wid > 4 || !preg_match('/^#[0-9a-fA-F]{6}$/', $color) || $min < 0 || $min > 1440) {
                    wf_fail('bad_worker');
                }
                if ($wid === 1 && $name === '') {
                    wf_fail('name_required');
                }
                if ($wid > 1 && $name === '') {
                    $n = $db->prepare("SELECT COUNT(*) FROM orders WHERE worker_id = ? AND deleted_at IS NULL AND status NOT IN ('done','delivered')");
                    $n->execute([$wid]);
                    if ((int)$n->fetchColumn() > 0) {
                        wf_fail('worker_in_use');
                    }
                }
                $db->prepare('UPDATE workers SET name = ?, color = ?, day_min = ? WHERE id = ?')->execute([$name, strtolower($color), $min, $wid]);
            }
            wf_touch();
            wf_json(['ok' => true]);
        }

        case 'blocked_save': {
            need_post();
            $f = date_or_null($in, 'date_from');
            $t = date_or_null($in, 'date_to') ?? $f;
            if (!$f) {
                wf_fail('bad_date_from');
            }
            if ($t < $f) {
                wf_fail('bad_date_to');
            }
            if ($t < date('Y-m-d')) {
                wf_fail('date_past');
            }
            $tf = s($in, 'time_from', 5);
            $tt = s($in, 'time_to', 5);
            if ($tf !== '' || $tt !== '') {
                // Uhrzeit nur komplett (von und bis), im Format HH:MM, Ende nach Anfang
                if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $tf) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $tt) || $tt <= $tf) {
                    wf_fail('bad_time');
                }
            }
            $db->prepare('INSERT INTO blocked_days (date_from, date_to, reason, time_from, time_to) VALUES (?,?,?,?,?)')
               ->execute([$f, $t, s($in, 'reason', 100), $tf === '' ? null : $tf, $tt === '' ? null : $tt]);
            wf_touch();
            wf_json(['ok' => true]);
        }

        case 'blocked_delete': {
            need_post();
            $db->prepare('DELETE FROM blocked_days WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
            wf_touch();
            wf_json(['ok' => true]);
        }

        case 'settings_save': {
            need_post();
            $wk = (int)($in['weekend_min'] ?? 300);
            if ($wk < 0 || $wk > 1440) {
                wf_fail('bad_weekend_min');
            }
            $ds = s($in, 'day_start', 5) ?: '08:00';
            if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $ds)) {
                wf_fail('bad_day_start');
            }
            $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('weekend_min', ?)")->execute([(string)$wk]);
            $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('day_start', ?)")->execute([$ds]);
            wf_touch();
            wf_json(['ok' => true]);
        }

        // ---------- Einstellungen ----------
        case 'processes_save': {
            need_post();
            foreach ((array)($in['processes'] ?? []) as $p) {
                $cap = max(0, min(1440, (int)($p['capacity_min'] ?? 0)));
                $db->prepare('UPDATE process_types SET capacity_min = ?, active = ? WHERE id = ?')
                   ->execute([$cap, empty($p['active']) ? 0 : 1, (int)($p['id'] ?? 0)]);
            }
            wf_touch();
            wf_json(['ok' => true]);
        }

        case 'users_save': {
            need_post();
            $seen = [];
            foreach ((array)($in['users'] ?? []) as $u) {
                $name = mb_substr(trim((string)($u['name'] ?? '')), 0, 60);
                $wid = trim((string)($u['wf_admin_id'] ?? ''));
                if ($name === '') {
                    wf_fail('name_required');
                }
                if ($wid !== '') {
                    if (isset($seen[$wid])) {
                        wf_fail('duplicate_admin_id');
                    }
                    $seen[$wid] = 1;
                }
                $db->prepare('UPDATE users SET name = ?, wf_admin_id = ?, active = ? WHERE id = ?')
                   ->execute([$name, $wid === '' ? null : $wid, empty($u['active']) ? 0 : 1, (int)($u['id'] ?? 0)]);
            }
            wf_json(['ok' => true]);
        }

        case 'token_create': {
            need_post();
            $label = s($in, 'label', 60) ?: 'Werkstatt-Monitor';
            $token = bin2hex(random_bytes(32));
            $db->prepare('INSERT INTO display_tokens (label, token_hash) VALUES (?,?)')->execute([$label, hash('sha256', $token)]);
            // Klartext wird nur dieses eine Mal angezeigt.
            wf_json(['ok' => true, 'token' => $token]);
        }

        case 'token_revoke': {
            need_post();
            $db->prepare("UPDATE display_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL")->execute([(int)($in['id'] ?? 0)]);
            wf_json(['ok' => true]);
        }

        case 'backup': {
            // Konsistente Kopie der SQLite-Datei.
            $tmp = tempnam(sys_get_temp_dir(), 'wfb');
            $db->exec("VACUUM INTO '" . str_replace("'", "''", $tmp . '.sqlite') . "'");
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="auftraege-' . date('Y-m-d') . '.sqlite"');
            readfile($tmp . '.sqlite');
            @unlink($tmp);
            @unlink($tmp . '.sqlite');
            exit;
        }

        // Papierkorb leeren: endgueltig loeschen nach Ablauf.
        case 'purge': {
            need_post();
            $days = (int)wf_cfg('trash_days');
            $st = $db->prepare("SELECT id FROM orders WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)");
            $st->execute(["-$days days"]);
            $n = 0;
            foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $oid) {
                foreach ($db->query('SELECT stored_name FROM order_files WHERE order_id = ' . (int)$oid) as $f) {
                    @unlink(rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/' . $f['stored_name']);
                    array_map('unlink', glob(rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/thumbs/' . $f['stored_name'] . '.*') ?: []);
                }
                $db->prepare('DELETE FROM orders WHERE id = ?')->execute([$oid]);
                $n++;
            }
            wf_json(['ok' => true, 'purged' => $n]);
        }


        // ---------- Firmendaten ----------
        case 'company_save': {
            need_post();
            $c = wf_company();
            foreach (['name' => 200, 'owner' => 200, 'street' => 200, 'zip' => 20, 'city' => 100, 'email' => 200, 'phone' => 60, 'web' => 200, 'bank' => 100, 'bic' => 11] as $k => $max) {
                if (array_key_exists($k, $in)) {
                    $c[$k] = s($in, $k, $max);
                }
            }
            $c['cvr'] = preg_replace('/\D/', '', s($in, 'cvr', 20)) ?? '';
            if ($c['cvr'] !== '' && !wf_cvr_valid($c['cvr'])) {
                wf_fail('bad_cvr');
            }
            $c['reg_no'] = preg_replace('/\D/', '', s($in, 'reg_no', 10)) ?? '';
            $c['account_no'] = preg_replace('/\D/', '', s($in, 'account_no', 20)) ?? '';
            if ($c['reg_no'] !== '' && strlen($c['reg_no']) !== 4) {
                wf_fail('bad_reg_no');
            }
            $iban = strtoupper(preg_replace('/\s+/', '', s($in, 'iban', 40)) ?? '');
            if ($iban !== '') {
                $r = substr($iban, 4) . substr($iban, 0, 4);
                $num = preg_replace_callback('/[A-Z]/', fn($m) => (string)(ord($m[0]) - 55), $r);
                $mod = 0;
                foreach (str_split((string)$num, 7) as $part) {
                    $mod = (int)(($mod . $part) % 97);
                }
                if (!preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/', $iban) || $mod !== 1) {
                    wf_fail('bad_iban');
                }
            }
            $c['iban'] = $iban;
            $c['bic'] = strtoupper($c['bic']);
            if ($c['email'] !== '' && !filter_var($c['email'], FILTER_VALIDATE_EMAIL)) {
                wf_fail('bad_email');
            }
            $c['moms_registered'] = !empty($in['moms_registered']);
            $c['moms_period'] = in_array($in['moms_period'] ?? '', ['half', 'quarter', 'month'], true) ? $in['moms_period'] : 'half';
            $c['pay_days'] = max(0, min(90, (int)($in['pay_days'] ?? 14)));
            $c['phone_share'] = max(0, min(100, (int)($in['phone_share'] ?? ($c['phone_share'] ?? 50))));
            // Startnummer nur bis zur ersten festgeschriebenen Rechnung aenderbar (sonst Luecke)
            if ((int)$db->query("SELECT COUNT(*) FROM invoices WHERE status = 'final'")->fetchColumn() === 0) {
                $c['invoice_start'] = max(1, min(99999999, (int)($in['invoice_start'] ?? 1)));
            }
            $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('company', ?)")->execute([json_encode($c, JSON_UNESCAPED_UNICODE)]);
            wf_journal($db, $user['name'], 'company', null, ['cvr' => $c['cvr'], 'name' => $c['name'], 'moms_registered' => $c['moms_registered']]);
            wf_json(['ok' => true, 'company' => $c, 'missing' => wf_company_missing($c)]);
        }

        case 'customer_vat_check': {
            need_post();
            $st = $db->prepare('SELECT id, vat_id, country FROM customers WHERE id = ? AND anonymized_at IS NULL');
            $st->execute([(int)($in['id'] ?? 0)]);
            $c = $st->fetch();
            if (!$c || $c['vat_id'] === '') {
                wf_fail('vat_id_required');
            }
            $r = wf_vies($c['vat_id']);
            if ($r === null) {
                wf_fail('vies_unreachable', 503);
            }
            $db->prepare("UPDATE customers SET vat_valid = ?, vat_checked_name = ?, vat_checked_at = datetime('now') WHERE id = ?")->execute([$r['valid'] ? 1 : 0, $r['name'], $c['id']]);
            wf_json(['ok' => true, 'valid' => $r['valid'], 'name' => $r['name']]);
        }

        case 'rate': {
            $cur = (string)($_GET['cur'] ?? '');
            if (!in_array($cur, wf_cfg('currencies'), true)) {
                wf_fail('bad_currency');
            }
            $r = wf_rate($cur);
            if (!$r) {
                wf_fail('rate_unavailable', 503);
            }
            wf_json(['ok' => true] + $r);
        }

        // ---------- Rechnungen ----------
        case 'invoices': {
            $w = ['1=1'];
            $p = [];
            $q = trim((string)($_GET['q'] ?? ''));
            if ($q !== '') {
                $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
                $w[] = "(CAST(i.number AS TEXT) = ? OR c.name LIKE ? ESCAPE '\\' OR c.company LIKE ? ESCAPE '\\')";
                array_push($p, $q, $like, $like);
            }
            if (!empty($_GET['customer_id'])) {
                $w[] = 'i.customer_id = ?';
                $p[] = (int)$_GET['customer_id'];
            }
            if (!empty($_GET['year']) && preg_match('/^\d{4}$/', (string)$_GET['year'])) {
                $w[] = "substr(i.issue_date,1,4) = ?";
                $p[] = (string)$_GET['year'];
            }
            $st = $db->prepare("SELECT i.id, i.type, i.status, i.number, i.issue_date, i.due_date, i.currency, i.rate, i.total, i.total_dkk, i.vat_scheme, i.sent_at, i.credit_of,
                                       c.name AS customer_name, c.company AS customer_company, i.customer_id,
                                       (SELECT number FROM invoices o WHERE o.id = i.credit_of) AS credit_of_number
                                FROM invoices i JOIN customers c ON c.id = i.customer_id
                                WHERE " . implode(' AND ', $w) . " ORDER BY i.status = 'final', COALESCE(i.number, 0) DESC, i.id DESC LIMIT 500");
            $st->execute($p);
            $rows = $st->fetchAll();
            $today = date('Y-m-d');
            $sum = ['open_dkk' => 0, 'overdue_dkk' => 0, 'drafts' => 0, 'overdue' => 0];
            foreach ($rows as &$r) {
                $o = wf_inv_open($db, $r);
                $r['paid'] = $o['paid'];
                $r['open'] = $o['open'];
                $r['state'] = $r['status'] === 'draft' ? 'draft' : ($r['type'] === 'credit' ? 'credit' : ($o['open'] > 0 ? ($r['due_date'] < $today ? 'overdue' : 'open') : ($o['open'] < 0 ? 'refund' : 'paid')));
                if ($r['state'] === 'draft') {
                    $sum['drafts']++;
                }
                if (in_array($r['state'], ['open', 'overdue'], true)) {
                    $dkk = (int)round($o['open'] * (float)$r['rate']);
                    $sum['open_dkk'] += $dkk;
                    if ($r['state'] === 'overdue') {
                        $sum['overdue_dkk'] += $dkk;
                        $sum['overdue']++;
                    }
                }
            }
            unset($r);
            $f = (string)($_GET['state'] ?? '');
            if ($f !== '') {
                $rows = array_values(array_filter($rows, fn($r) => $f === 'unpaid' ? in_array($r['state'], ['open', 'overdue'], true) : $r['state'] === $f));
            }
            wf_json(['ok' => true, 'invoices' => $rows, 'summary' => $sum]);
        }

        case 'invoice': {
            $i = wf_inv_load($db, (int)($_GET['id'] ?? 0));
            if (!$i) {
                wf_fail('not_found', 404);
            }
            $c = $db->prepare('SELECT * FROM customers WHERE id = ?');
            $c->execute([$i['customer_id']]);
            $i['customer'] = $c->fetch();
            $i['balance'] = wf_inv_open($db, $i);
            $i['credits'] = $db->query('SELECT id, number, status, total, issue_date FROM invoices WHERE credit_of = ' . (int)$i['id'] . ' ORDER BY id')->fetchAll();
            $i['credit_of_number'] = $i['credit_of'] ? $db->query('SELECT number FROM invoices WHERE id = ' . (int)$i['credit_of'])->fetchColumn() : null;
            if ($i['status'] === 'draft') {
                $i['scheme_auto'] = wf_scheme_auto(wf_company(), $i['customer']);
                $i['calc'] = wf_inv_calc($i['lines'], $i['vat_scheme'], (bool)$i['prices_incl'], $i['rate']);
            }
            wf_json(['ok' => true, 'invoice' => $i]);
        }

        // Live-Summe im Editor (ohne zu speichern) - gleiche Rechnung wie beim Festschreiben
        case 'invoice_calc': {
            need_post();
            [$lines] = inv_lines_in($in);
            $scheme = in_array($in['vat_scheme'] ?? '', WF_SCHEMES, true) ? $in['vat_scheme'] : 'dk';
            wf_json(['ok' => true, 'calc' => wf_inv_calc($lines, $scheme, !empty($in['prices_incl']), inv_rate_in($in, (string)($in['currency'] ?? 'DKK')))]);
        }

        case 'invoice_save': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            $cur = null;
            if ($id) {
                $cur = wf_inv_load($db, $id);
                if (!$cur) {
                    wf_fail('not_found', 404);
                }
                if ($cur['status'] !== 'draft') {
                    wf_fail('invoice_locked', 409);
                }
            }
            $isCredit = $cur && $cur['type'] === 'credit';
            $cid = $isCredit ? (int)$cur['customer_id'] : (int)($in['customer_id'] ?? 0);
            $cs = $db->prepare('SELECT * FROM customers WHERE id = ? AND anonymized_at IS NULL');
            $cs->execute([$cid]);
            $cust = $cs->fetch();
            if (!$cust) {
                wf_fail('bad_customer');
            }
            $co = wf_company();
            $issue = date_or_null($in, 'issue_date') ?? date('Y-m-d');
            $delivery = date_or_null($in, 'delivery_date');
            $due = date_or_null($in, 'due_date') ?? date('Y-m-d', strtotime($issue . ' +' . (int)$co['pay_days'] . ' days'));
            if ($due < $issue) {
                wf_fail('due_before_issue');
            }
            [$lines] = inv_lines_in($in);
            if ($isCredit) {
                // Kreditnota: Waehrung, Kurs, Moms-Regel und Preisart wie die Originalrechnung
                [$currency, $rate, $rateDate, $rateSrc, $scheme, $manual, $incl] = [$cur['currency'], $cur['rate'], $cur['rate_date'], $cur['rate_source'], $cur['vat_scheme'], 1, (int)$cur['prices_incl']];
            } else {
                $currency = s($in, 'currency', 3) ?: $cust['currency'];
                if (!in_array($currency, wf_cfg('currencies'), true)) {
                    wf_fail('bad_currency');
                }
                $rate = inv_rate_in($in, $currency);
                $rateDate = $currency === 'DKK' ? null : (date_or_null($in, 'rate_date') ?? $issue);
                $rateSrc = $currency === 'DKK' ? '' : (s($in, 'rate_source', 60) ?: 'manuel');
                if ($currency !== 'DKK' && (float)$rate <= 0 && ($r = wf_rate($currency))) {
                    [$rate, $rateDate, $rateSrc] = [$r['rate'], $r['date'], $r['source']];
                }
                $sch = (string)($in['vat_scheme'] ?? '');
                $manual = in_array($sch, WF_SCHEMES, true) ? 1 : 0;
                $scheme = $manual ? $sch : wf_scheme_auto($co, $cust);
                $incl = !empty($in['prices_incl']) ? 1 : 0;
            }
            $lang = in_array($in['lang'] ?? '', WF_DOC_LANGS, true) ? $in['lang'] : wf_doc_lang_for($cust);
            $vals = [$cid, $issue, $delivery, $due, $currency, $rate, $rateDate, $rateSrc, $scheme, $manual, $incl, $lang, s($in, 'note', 3000)];
            $db->beginTransaction();
            if ($id) {
                $db->prepare("UPDATE invoices SET customer_id=?, issue_date=?, delivery_date=?, due_date=?, currency=?, rate=?, rate_date=?, rate_source=?, vat_scheme=?, scheme_manual=?, prices_incl=?, lang=?, note=? WHERE id = ? AND status = 'draft'")->execute([...$vals, $id]);
                $db->prepare('DELETE FROM invoice_lines WHERE invoice_id = ?')->execute([$id]);
            } else {
                $orderId = (int)($in['order_id'] ?? 0) ?: null;
                $db->prepare('INSERT INTO invoices (customer_id, issue_date, delivery_date, due_date, currency, rate, rate_date, rate_source, vat_scheme, scheme_manual, prices_incl, lang, note, order_id, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([...$vals, $orderId, $user['name']]);
                $id = (int)$db->lastInsertId();
            }
            $ins = $db->prepare('INSERT INTO invoice_lines (invoice_id, pos, description, qty, unit, unit_price, discount, kind) VALUES (?,?,?,?,?,?,?,?)');
            foreach ($lines as $k => $l) {
                $ins->execute([$id, $k + 1, $l['description'], $l['qty'], $l['unit'], $l['unit_price'], $l['discount'], $l['kind']]);
            }
            $calc = wf_inv_recalc($db, $id);
            $db->commit();
            wf_json(['ok' => true, 'id' => $id, 'calc' => $calc, 'vat_scheme' => $scheme, 'rate' => $rate]);
        }

        case 'invoice_delete': {
            need_post();
            $st = $db->prepare("DELETE FROM invoices WHERE id = ? AND status = 'draft'");
            $st->execute([(int)($in['id'] ?? 0)]);
            if (!$st->rowCount()) {
                wf_fail('invoice_locked', 409);
            }
            wf_json(['ok' => true]);
        }

        case 'invoice_approve': {
            need_post();
            try {
                $r = wf_inv_approve($db, (int)($in['id'] ?? 0), $user['name']);
            } catch (RuntimeException $e) {
                [$code, $detail] = array_pad(explode(':', $e->getMessage(), 2), 2, '');
                wf_fail($code, 400, ['detail' => $detail]);
            }
            wf_order_sync_pay($db, (int)$db->query('SELECT order_id FROM invoices WHERE id = ' . (int)$in['id'])->fetchColumn() ?: null);
            wf_json(['ok' => true] + $r);
        }

        case 'invoice_credit':
        case 'invoice_copy': {
            need_post();
            $src = wf_inv_load($db, (int)($in['id'] ?? 0));
            if (!$src) {
                wf_fail('not_found', 404);
            }
            $credit = $a === 'invoice_credit';
            if ($credit && ($src['status'] !== 'final' || $src['type'] !== 'invoice')) {
                wf_fail('bad_credit_ref');
            }
            if ($credit) {
                $left = (int)$src['total'] - (int)$db->query("SELECT COALESCE(SUM(total),0) FROM invoices WHERE credit_of = " . (int)$src['id'] . " AND status = 'final'")->fetchColumn();
                if ($left <= 0) {
                    wf_fail('credit_too_high');
                }
                if ((int)$db->query("SELECT COUNT(*) FROM invoices WHERE credit_of = " . (int)$src['id'] . " AND status = 'draft'")->fetchColumn()) {
                    wf_fail('credit_draft_exists');
                }
            }
            $co = wf_company();
            $today = date('Y-m-d');
            $db->beginTransaction();
            $db->prepare('INSERT INTO invoices (type, customer_id, order_id, credit_of, issue_date, delivery_date, due_date, currency, rate, rate_date, rate_source, vat_scheme, scheme_manual, prices_incl, lang, note, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$credit ? 'credit' : 'invoice', $src['customer_id'], $credit ? $src['order_id'] : null, $credit ? $src['id'] : null, $today, $credit ? $src['delivery_date'] : null,
                    $credit ? $today : date('Y-m-d', strtotime("+{$co['pay_days']} days")), $src['currency'], $credit ? $src['rate'] : ($src['currency'] === 'DKK' ? '1' : '0'),
                    $credit ? $src['rate_date'] : null, $credit ? $src['rate_source'] : '', $src['vat_scheme'], $credit ? 1 : (int)$src['scheme_manual'], $src['prices_incl'], $src['lang'], $credit ? '' : $src['note'], $user['name']]);
            $nid = (int)$db->lastInsertId();
            $ins = $db->prepare('INSERT INTO invoice_lines (invoice_id, pos, description, qty, unit, unit_price, discount, kind) VALUES (?,?,?,?,?,?,?,?)');
            foreach ($src['lines'] as $l) {
                $ins->execute([$nid, $l['pos'], $l['description'], $l['qty'], $l['unit'], $l['unit_price'], $l['discount'], $l['kind']]);
            }
            wf_inv_recalc($db, $nid);
            $db->commit();
            wf_json(['ok' => true, 'id' => $nid]);
        }

        case 'invoice_pay': {
            need_post();
            $i = wf_inv_load($db, (int)($in['id'] ?? 0));
            if (!$i || $i['status'] !== 'final') {
                wf_fail('invoice_not_final');
            }
            $amt = wf_to_cents($in['amount'] ?? '');
            if (!$amt) {
                wf_fail('bad_amount');
            }
            $date = date_or_null($in, 'date') ?? date('Y-m-d');
            if ($date > date('Y-m-d')) {
                wf_fail('date_in_future');
            }
            $method = in_array($in['method'] ?? '', ['bank', 'mobilepay', 'cash', 'card', 'other'], true) ? $in['method'] : 'bank';
            $db->beginTransaction();
            $db->prepare('INSERT INTO invoice_payments (invoice_id, date, amount, method, note, created_by) VALUES (?,?,?,?,?,?)')->execute([$i['id'], $date, $amt, $method, s($in, 'note', 200), $user['name']]);
            $pid = (int)$db->lastInsertId();
            wf_journal($db, $user['name'], $i['type'] === 'credit' ? 'refund' : 'payment', $i['id'], ['number' => $i['number'], 'payment' => $pid, 'date' => $date, 'amount' => $amt, 'currency' => $i['currency'], 'method' => $method]);
            $db->commit();
            wf_order_sync_pay($db, $i['order_id'] ? (int)$i['order_id'] : null);
            wf_json(['ok' => true, 'balance' => wf_inv_open($db, $i)]);
        }

        // Zahlung zuruecknehmen = Gegenbuchung (das Original bleibt sichtbar)
        case 'invoice_pay_reverse': {
            need_post();
            $st = $db->prepare('SELECT p.*, i.number, i.currency FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.id = ? AND p.reverses IS NULL AND p.amount > 0');
            $st->execute([(int)($in['payment_id'] ?? 0)]);
            $p = $st->fetch();
            if (!$p || $db->query('SELECT 1 FROM invoice_payments WHERE reverses = ' . (int)$p['id'])->fetchColumn()) {
                wf_fail('not_found', 404);
            }
            $db->beginTransaction();
            $db->prepare('INSERT INTO invoice_payments (invoice_id, date, amount, method, note, reverses, created_by) VALUES (?,?,?,?,?,?,?)')
                ->execute([$p['invoice_id'], date('Y-m-d'), -(int)$p['amount'], $p['method'], 'Storno', $p['id'], $user['name']]);
            wf_journal($db, $user['name'], 'payment_reversal', (int)$p['invoice_id'], ['number' => $p['number'], 'reverses' => (int)$p['id'], 'amount' => -(int)$p['amount'], 'currency' => $p['currency']]);
            $db->commit();
            wf_order_sync_pay($db, (int)$db->query('SELECT order_id FROM invoices WHERE id = ' . (int)$p['invoice_id'])->fetchColumn() ?: null);
            wf_json(['ok' => true]);
        }

        case 'invoice_sent': {
            need_post();
            $db->prepare("UPDATE invoices SET sent_at = COALESCE(sent_at, datetime('now')) WHERE id = ? AND status = 'final'")->execute([(int)($in['id'] ?? 0)]);
            wf_json(['ok' => true]);
        }


        // ---------- Ausgaben (Belege) ----------
        case 'expenses': {
            $w = ['1=1'];
            $p = [];
            $q = trim((string)($_GET['q'] ?? ''));
            if ($q !== '') {
                $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
                $w[] = "(e.supplier LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR CAST(e.number AS TEXT) = ?)";
                array_push($p, $like, $like, $q);
            }
            if (!empty($_GET['year']) && preg_match('/^\d{4}$/', (string)$_GET['year'])) {
                $w[] = 'substr(e.date,1,4) = ?';
                $p[] = (string)$_GET['year'];
            }
            $f = (string)($_GET['state'] ?? '');
            if ($f === 'draft') {
                $w[] = "e.status = 'draft'";
            } elseif ($f === 'unpaid') {
                $w[] = "e.status = 'final' AND e.paid_date IS NULL AND e.reverses IS NULL AND e.gross > 0 AND NOT EXISTS (SELECT 1 FROM expenses r WHERE r.reverses = e.id)";
            } elseif ($f === 'final') {
                $w[] = "e.status = 'final'";
            }
            $st = $db->prepare('SELECT e.id, e.status, e.number, e.date, e.supplier, e.description, e.category, e.currency, e.gross, e.gross_dkk, e.deduct_dkk, e.vat_mode, e.paid_date,
                                       e.reverses, e.file_stored IS NOT NULL AS has_file, e.file_mime, (SELECT r.id FROM expenses r WHERE r.reverses = e.id) AS reversed_by
                                FROM expenses e WHERE ' . implode(' AND ', $w) . " ORDER BY e.status = 'final', e.date DESC, e.id DESC LIMIT 500");
            $st->execute($p);
            $y = date('Y');
            $sum = $db->query("SELECT COALESCE(SUM(gross_dkk),0) AS g, COALESCE(SUM(deduct_dkk),0) AS d FROM expenses WHERE status = 'final' AND substr(date,1,4) = '$y'")->fetch();
            $sum['drafts'] = (int)$db->query("SELECT COUNT(*) FROM expenses WHERE status = 'draft'")->fetchColumn();
            $sum['bank_open'] = (int)$db->query('SELECT COUNT(*) FROM bank_tx WHERE match_type IS NULL')->fetchColumn();
            wf_json(['ok' => true, 'expenses' => $st->fetchAll(), 'summary' => $sum]);
        }

        case 'expense': {
            $e = wf_exp_load($db, (int)($_GET['id'] ?? 0));
            if (!$e) {
                wf_fail('not_found', 404);
            }
            $e['reversed_by'] = $db->query('SELECT id FROM expenses WHERE reverses = ' . (int)$e['id'])->fetchColumn() ?: null;
            $e['bank'] = $db->query("SELECT id, date, text, amount FROM bank_tx WHERE match_type = 'expense' AND match_id = " . (int)$e['id'])->fetch() ?: null;
            wf_json(['ok' => true, 'expense' => $e]);
        }

        // Beleg hochladen: neuer Entwurf (oder an Entwurf anhaengen); mit Schluessel liest Claude ihn gleich aus
        case 'expense_upload': {
            need_post();
            $id = (int)($_POST['id'] ?? 0);
            if ($id) {
                $e = wf_exp_load($db, $id);
                if (!$e || $e['status'] !== 'draft') {
                    wf_fail('expense_locked', 409);
                }
            }
            [$stored, $mime, $name] = store_upload();
            $co = wf_company();
            if ($id) {
                $old = $e['file_stored'];
                $db->prepare('UPDATE expenses SET file_stored = ?, file_mime = ?, file_name = ? WHERE id = ?')->execute([$stored, $mime, $name, $id]);
                if ($old && !(int)$db->query("SELECT COUNT(*) FROM expenses WHERE file_stored = " . $db->quote($old))->fetchColumn()) {
                    @unlink(rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/' . $old);
                }
            } else {
                $db->prepare("INSERT INTO expenses (date, file_stored, file_mime, file_name, vat_share, created_by) VALUES (date('now','localtime'), ?, ?, ?, 100, ?)")->execute([$stored, $mime, $name, $user['name']]);
                $id = (int)$db->lastInsertId();
            }
            $ai = null;
            $aiErr = null;
            if (!empty($_POST['scan']) && wf_ai_key() !== '' && $mime !== 'image/gif') {
                try {
                    $ai = wf_ai_scan(rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/' . $stored, $mime, $co);
                    $cats = wf_exp_categories();
                    $cat = isset($cats[$ai['category'] ?? '']) ? $ai['category'] : 'misc';
                    $cur = in_array($ai['currency'] ?? '', ['DKK', 'EUR'], true) ? $ai['currency'] : 'DKK';
                    $date = wf_csv_date((string)($ai['date'] ?? '')) ?: date('Y-m-d');
                    $mode = in_array($ai['vat_mode'] ?? '', WF_VAT_MODES, true) ? $ai['vat_mode'] : 'dk';
                    $rate = '1';
                    $rd = null;
                    if ($cur !== 'DKK' && ($r = wf_rate($cur))) {
                        [$rate, $rd] = [$r['rate'], $r['date']];
                    } elseif ($cur !== 'DKK') {
                        $rate = '0';
                    }
                    $country = strtoupper(substr((string)($ai['supplier_country'] ?? 'DK'), 0, 2));
                    $db->prepare('UPDATE expenses SET date=?, supplier=?, supplier_country=?, supplier_vat=?, doc_no=?, description=?, category=?, currency=?, rate=?, rate_date=?,
                                  gross=?, vat=?, vat_mode=?, vat_share=?, paid_date=?, pay_method=?, ai_model=? WHERE id = ? AND status = \'draft\'')
                        ->execute([$date > date('Y-m-d') ? date('Y-m-d') : $date, mb_substr((string)($ai['supplier'] ?? ''), 0, 200), isset(wf_countries()[$country]) ? $country : 'DK',
                            mb_substr((string)($ai['supplier_vat'] ?? ''), 0, 30), mb_substr((string)($ai['doc_no'] ?? ''), 0, 60), mb_substr((string)($ai['description'] ?? ''), 0, 300),
                            $cat, $cur, $rate, $rd, wf_to_cents((string)($ai['total'] ?? '0')) ?? 0, $mode === 'dk' ? (wf_to_cents((string)($ai['vat'] ?? '0')) ?? 0) : 0, $mode,
                            wf_exp_share($cat, $co), !empty($ai['is_paid']) ? $date : null, !empty($ai['is_paid']) ? 'card' : '', $ai['model'], $id]);
                } catch (RuntimeException $ex) {
                    $aiErr = $ex->getMessage();
                }
            }
            wf_json(['ok' => true, 'id' => $id, 'ai' => $ai ? ['confident' => (bool)($ai['confident'] ?? false), 'notes' => (string)($ai['notes'] ?? ''), 'is_receipt' => (bool)($ai['is_receipt'] ?? true)] : null, 'ai_error' => $aiErr]);
        }

        case 'expense_save': {
            need_post();
            $id = (int)($in['id'] ?? 0);
            if ($id) {
                $e = wf_exp_load($db, $id);
                if (!$e) {
                    wf_fail('not_found', 404);
                }
                if ($e['status'] !== 'draft') {
                    wf_fail('expense_locked', 409);
                }
            }
            $cats = wf_exp_categories();
            $cat = isset($cats[$in['category'] ?? '']) ? $in['category'] : 'misc';
            $mode = in_array($in['vat_mode'] ?? '', WF_VAT_MODES, true) ? $in['vat_mode'] : 'dk';
            $cur = s($in, 'currency', 3) ?: 'DKK';
            if (!in_array($cur, wf_cfg('currencies'), true)) {
                wf_fail('bad_currency');
            }
            $gross = wf_to_cents($in['gross'] ?? '', true);
            $vat = wf_to_cents($in['vat'] ?? '0', true);
            if ($gross === null || $vat === null) {
                wf_fail('bad_amount');
            }
            $date = date_or_null($in, 'date') ?? date('Y-m-d');
            $rate = inv_rate_in($in, $cur);
            $rd = $cur === 'DKK' ? null : (date_or_null($in, 'rate_date') ?? $date);
            if ($cur !== 'DKK' && (float)$rate <= 0 && ($r = wf_rate($cur))) {
                [$rate, $rd] = [$r['rate'], $r['date']];
            }
            $share = isset($in['vat_share']) && $in['vat_share'] !== '' ? max(0, min(100, (int)$in['vat_share'])) : wf_exp_share($cat, wf_company());
            $country = s($in, 'supplier_country', 2) ?: 'DK';
            if (!isset(wf_countries()[$country])) {
                wf_fail('bad_country');
            }
            $paid = date_or_null($in, 'paid_date');
            $vals = [$date, s($in, 'supplier', 200), $country, s($in, 'supplier_vat', 30), s($in, 'doc_no', 60), s($in, 'description', 300), $cat, $cur, $rate, $rd,
                $gross, $mode === 'dk' ? $vat : 0, $mode, $share, s($in, 'no_receipt', 300), s($in, 'note', 2000), $paid, $paid ? (s($in, 'pay_method', 20) ?: 'bank') : ''];
            if ($id) {
                $db->prepare("UPDATE expenses SET date=?, supplier=?, supplier_country=?, supplier_vat=?, doc_no=?, description=?, category=?, currency=?, rate=?, rate_date=?,
                              gross=?, vat=?, vat_mode=?, vat_share=?, no_receipt=?, note=?, paid_date=?, pay_method=? WHERE id = ? AND status = 'draft'")->execute([...$vals, $id]);
            } else {
                $db->prepare('INSERT INTO expenses (date, supplier, supplier_country, supplier_vat, doc_no, description, category, currency, rate, rate_date, gross, vat, vat_mode, vat_share,
                              no_receipt, note, paid_date, pay_method, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([...$vals, $user['name']]);
                $id = (int)$db->lastInsertId();
            }
            $c = wf_exp_calc($gross, $mode === 'dk' ? $vat : 0, $mode, $share, $rate);
            $db->prepare("UPDATE expenses SET gross_dkk=?, vat_dkk=?, net_dkk=?, rc_vat_dkk=?, deduct_dkk=? WHERE id = ? AND status = 'draft'")->execute([$c['gross_dkk'], $c['vat_dkk'], $c['net_dkk'], $c['rc_vat_dkk'], $c['deduct_dkk'], $id]);
            wf_json(['ok' => true, 'id' => $id, 'calc' => $c + ['vat_share' => $share, 'rate' => $rate]]);
        }

        case 'expense_approve': {
            need_post();
            try {
                $n = wf_exp_approve($db, (int)($in['id'] ?? 0), $user['name']);
            } catch (RuntimeException $e) {
                wf_fail($e->getMessage());
            }
            wf_json(['ok' => true, 'number' => $n]);
        }

        case 'expense_delete': {
            need_post();
            $e = wf_exp_load($db, (int)($in['id'] ?? 0));
            if (!$e || $e['status'] !== 'draft') {
                wf_fail('expense_locked', 409);
            }
            $db->prepare("DELETE FROM expenses WHERE id = ? AND status = 'draft'")->execute([$e['id']]);
            $db->prepare("UPDATE bank_tx SET match_type = NULL, match_id = NULL, matched_at = NULL, matched_by = NULL WHERE match_type = 'expense' AND match_id = ?")->execute([$e['id']]);
            if ($e['file_stored'] && !(int)$db->query('SELECT COUNT(*) FROM expenses WHERE file_stored = ' . $db->quote($e['file_stored']))->fetchColumn()) {
                @unlink(rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/' . $e['file_stored']);
            }
            wf_json(['ok' => true]);
        }

        case 'expense_reverse': {
            need_post();
            try {
                $nid = wf_exp_reverse($db, (int)($in['id'] ?? 0), $user['name'], s($in, 'reason', 300));
            } catch (RuntimeException $e) {
                wf_fail($e->getMessage());
            }
            wf_json(['ok' => true, 'id' => $nid]);
        }

        // Zahlungsdatum einer gebuchten Ausgabe setzen/entfernen (bleibt aenderbar)
        case 'expense_paid': {
            need_post();
            $paid = date_or_null($in, 'paid_date');
            $db->prepare("UPDATE expenses SET paid_date = ?, pay_method = ? WHERE id = ?")->execute([$paid, $paid ? (s($in, 'pay_method', 20) ?: 'bank') : '', (int)($in['id'] ?? 0)]);
            wf_json(['ok' => true]);
        }

        case 'ai_key_save': {
            need_post();
            $k = trim((string)($in['key'] ?? ''));
            if ($k !== '' && !preg_match('/^sk-ant-[A-Za-z0-9_\-]{20,}$/', $k)) {
                wf_fail('ai_bad_key');
            }
            $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('anthropic_key', ?)")->execute([$k]);
            wf_json(['ok' => true]);
        }

        // ---------- Kontoauszug ----------
        case 'bank_import': {
            need_post();
            $f = $_FILES['file'] ?? null;
            if (!$f || $f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name']) || $f['size'] > 5000000) {
                wf_fail('upload_failed');
            }
            try {
                $rows = wf_csv_parse((string)file_get_contents($f['tmp_name']));
            } catch (RuntimeException $e) {
                wf_fail($e->getMessage());
            }
            $added = wf_bank_import($db, $rows);
            $auto = wf_bank_automatch($db, $user['name']);
            wf_journal($db, $user['name'], 'bank_import', null, ['rows' => count($rows), 'new' => $added, 'auto' => $auto]);
            wf_json(['ok' => true, 'rows' => count($rows), 'added' => $added, 'auto' => $auto]);
        }

        case 'bank': {
            $only = ($_GET['show'] ?? 'open') === 'open';
            $rows = $db->query('SELECT * FROM bank_tx' . ($only ? ' WHERE match_type IS NULL' : '') . ' ORDER BY date DESC, id DESC LIMIT 500')->fetchAll();
            foreach ($rows as &$r) {
                if (!$r['match_type']) {
                    $r['candidates'] = array_slice(wf_bank_candidates($db, $r), 0, 4);
                } elseif ($r['match_type'] === 'invoice') {
                    $r['match_label'] = (string)$db->query('SELECT number FROM invoices WHERE id = ' . (int)$r['match_id'])->fetchColumn();
                } elseif ($r['match_type'] === 'expense') {
                    $r['match_label'] = (string)$db->query('SELECT COALESCE(number, \'\') || \' · \' || supplier FROM expenses WHERE id = ' . (int)$r['match_id'])->fetchColumn();
                }
            }
            unset($r);
            wf_json(['ok' => true, 'tx' => $rows, 'open' => (int)$db->query('SELECT COUNT(*) FROM bank_tx WHERE match_type IS NULL')->fetchColumn()]);
        }

        case 'bank_match': {
            need_post();
            $type = (string)($in['type'] ?? '');
            if (in_array($type, ['private', 'transfer', 'other'], true) && trim((string)($in['note'] ?? '')) === '' && $type === 'other') {
                wf_fail('note_required');
            }
            try {
                wf_bank_match($db, (int)($in['tx_id'] ?? 0), $type, (int)($in['id'] ?? 0), $user['name'], s($in, 'note', 200));
            } catch (RuntimeException $e) {
                wf_fail($e->getMessage());
            }
            wf_json(['ok' => true]);
        }

        // Zuordnung loesen; bei Rechnung wird die Zahlung per Gegenbuchung storniert
        case 'bank_unmatch': {
            need_post();
            $st = $db->prepare('SELECT * FROM bank_tx WHERE id = ? AND match_type IS NOT NULL');
            $st->execute([(int)($in['tx_id'] ?? 0)]);
            $tx = $st->fetch();
            if (!$tx) {
                wf_fail('not_found', 404);
            }
            $db->beginTransaction();
            if ($tx['match_type'] === 'invoice') {
                $p = $db->prepare("SELECT p.* FROM invoice_payments p WHERE p.invoice_id = ? AND p.date = ? AND p.amount > 0 AND p.method = 'bank'
                                   AND NOT EXISTS (SELECT 1 FROM invoice_payments r WHERE r.reverses = p.id) ORDER BY p.id DESC LIMIT 1");
                $p->execute([$tx['match_id'], $tx['date']]);
                if ($pay = $p->fetch()) {
                    $db->prepare('INSERT INTO invoice_payments (invoice_id, date, amount, method, note, reverses, created_by) VALUES (?,?,?,?,?,?,?)')
                        ->execute([$pay['invoice_id'], date('Y-m-d'), -(int)$pay['amount'], 'bank', 'Storno Bankzuordnung', $pay['id'], $user['name']]);
                    wf_journal($db, $user['name'], 'payment_reversal', (int)$pay['invoice_id'], ['reverses' => (int)$pay['id'], 'amount' => -(int)$pay['amount'], 'bank_tx' => (int)$tx['id']]);
                }
            } elseif ($tx['match_type'] === 'expense') {
                $db->prepare("UPDATE expenses SET paid_date = NULL, pay_method = '' WHERE id = ?")->execute([$tx['match_id']]);
            }
            $db->prepare('UPDATE bank_tx SET match_type = NULL, match_id = NULL, match_note = \'\', matched_at = NULL, matched_by = NULL WHERE id = ?')->execute([$tx['id']]);
            $db->commit();
            if ($tx['match_type'] === 'invoice') {
                wf_order_sync_pay($db, (int)$db->query('SELECT order_id FROM invoices WHERE id = ' . (int)$tx['match_id'])->fetchColumn() ?: null);
            }
            wf_json(['ok' => true]);
        }

        // Ausgabe aus Kontobewegung anlegen (Beleg danach fotografieren/anhaengen)
        case 'bank_to_expense': {
            need_post();
            $st = $db->prepare('SELECT * FROM bank_tx WHERE id = ? AND match_type IS NULL AND amount < 0');
            $st->execute([(int)($in['tx_id'] ?? 0)]);
            $tx = $st->fetch();
            if (!$tx) {
                wf_fail('not_found', 404);
            }
            $db->beginTransaction();
            $db->prepare("INSERT INTO expenses (date, supplier, description, gross, gross_dkk, vat_share, paid_date, pay_method, created_by) VALUES (?,?,?,?,?,100,?,'bank',?)")
                ->execute([$tx['date'], mb_substr($tx['text'], 0, 200), '', -(int)$tx['amount'], -(int)$tx['amount'], $tx['date'], $user['name']]);
            $id = (int)$db->lastInsertId();
            $db->prepare("UPDATE bank_tx SET match_type = 'expense', match_id = ?, matched_at = datetime('now'), matched_by = ? WHERE id = ?")->execute([$id, $user['name'], $tx['id']]);
            $db->commit();
            wf_json(['ok' => true, 'id' => $id]);
        }

        case 'journal_verify':
            wf_json(['ok' => true] + wf_journal_verify($db));

        default:
            wf_fail('unknown_action', 404);
    }
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    // Datenbank-Sperren (Trigger) als verstaendlicher Fehler statt Serverfehler
    if (preg_match('/(invoice_locked|payment_locked|journal_locked|invoice_not_final|expense_locked|confirmation_locked)/', $e->getMessage(), $m)) {
        wf_fail($m[1], 409);
    }
    error_log('auftraege api: ' . $e->getMessage());
    wf_fail('server_error', 500);
}
