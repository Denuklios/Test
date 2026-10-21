<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/display.php';

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
    $st = $db->prepare('SELECT o.*, c.name AS customer_name, c.company AS customer_company FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?');
    $st->execute([$id]);
    $o = $st->fetch();
    if (!$o) {
        wf_fail('not_found', 404);
    }
    $p = $db->prepare('SELECT process_id, minutes FROM order_processes WHERE order_id = ?');
    $p->execute([$id]);
    $o['processes'] = $p->fetchAll();
    $f = $db->prepare('SELECT id, original_name, mime, size, uploaded_at FROM order_files WHERE order_id = ? ORDER BY id');
    $f->execute([$id]);
    $o['files'] = $f->fetchAll();
    $l = $db->prepare('SELECT user_name, what, at FROM status_log WHERE order_id = ? ORDER BY id DESC LIMIT 30');
    $l->execute([$id]);
    $o['log'] = $l->fetchAll();
    return $o;
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
                'users' => $db->query('SELECT id, name, wf_admin_id, active FROM users ORDER BY id')->fetchAll(),
                'tokens' => $tokens,
                'blocked' => $db->query("SELECT id, date_from, date_to, reason, time_from, time_to FROM blocked_days WHERE date_to >= date('now','localtime') ORDER BY date_from")->fetchAll(),
                'settings' => ['weekend_min' => wf_weekend_min()],
                'version' => wf_version(),
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
            $sql = 'SELECT o.id, o.nr, o.title, o.qty, o.price, o.deposit, o.currency, o.status, o.pay_status, o.due_date, o.plan_date,
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
            $plan = date_or_null($in, 'plan_date');
            $oldRow = $id ? order_row($db, $id) : null;
            foreach (['due_date' => $due, 'plan_date' => $plan] as $field => $val) {
                if ($val !== null && (!$oldRow || ($oldRow[$field] ?? null) !== $val)) {
                    if ($val < date('Y-m-d')) {
                        wf_fail('date_past', 400, ['field' => $field]);
                    }
                    if (wf_blocked_reason($val) !== null) {
                        wf_fail('date_blocked', 400, ['field' => $field]);
                    }
                }
            }
            if ($due !== null && $plan !== null && $due < $plan) {
                wf_fail('due_before_plan');
            }
            $procs = [];
            foreach ((array)($in['processes'] ?? []) as $pr) {
                $pid = (int)($pr['process_id'] ?? 0);
                $min = max(0, min(100000, (int)($pr['minutes'] ?? 0)));
                if ($pid > 0) {
                    $procs[$pid] = $min;
                }
            }
            $db->beginTransaction();
            if ($id) {
                $old = order_row($db, $id);
                $db->prepare('UPDATE orders SET customer_id=?, title=?, description=?, article=?, qty=?, price=?, deposit=?, currency=?, pay_status=?, status=?, due_date=?, plan_date=?, notes=?, updated_at=datetime(\'now\') WHERE id=?')
                   ->execute([$cid, $title, s($in, 'description', 5000), s($in, 'article', 300), $qty, $price, $deposit, $cur, $pay, $status, $due, $plan, s($in, 'notes', 5000), $id]);
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
                $db->prepare('INSERT INTO orders (nr, customer_id, title, description, article, qty, price, deposit, currency, pay_status, status, due_date, plan_date, notes, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
                   ->execute([$nr, $cid, $title, s($in, 'description', 5000), s($in, 'article', 300), $qty, $price, $deposit, $cur, $pay, $status, $due, $plan, s($in, 'notes', 5000), $user['id'] ?: null]);
                $id = (int)$db->lastInsertId();
                log_order($db, $id, $user, 'created');
            }
            $db->prepare('DELETE FROM order_processes WHERE order_id = ?')->execute([$id]);
            $ins = $db->prepare('INSERT INTO order_processes (order_id, process_id, minutes) SELECT ?, id, ? FROM process_types WHERE id = ?');
            foreach ($procs as $pid => $min) {
                $ins->execute([$id, $min, $pid]);
            }
            wf_touch();
            $db->commit();
            wf_json(['ok' => true, 'order' => order_row($db, $id)]);
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
            wf_json(['ok' => true, 'order' => order_row($db, $id)]);
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
            $st = $db->prepare("SELECT c.id, c.name, c.company, c.email, c.phone, c.currency,
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
            $vals = [$name, s($in, 'company', 200), $email, s($in, 'phone', 60), s($in, 'address', 500), $cur, s($in, 'notes', 3000)];
            if ($id) {
                $db->prepare('UPDATE customers SET name=?, company=?, email=?, phone=?, address=?, currency=?, notes=? WHERE id=? AND anonymized_at IS NULL')->execute([...$vals, $id]);
            } else {
                $db->prepare('INSERT INTO customers (name, company, email, phone, address, currency, notes) VALUES (?,?,?,?,?,?,?)')->execute($vals);
                $id = (int)$db->lastInsertId();
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
            header('Content-Disposition: attachment; filename="kunde-' . $id . '.json"');
            wf_json(['customer' => $c->fetch(), 'orders' => $o->fetchAll()]);
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
            $db->prepare('DELETE FROM order_files WHERE id = ?')->execute([$f['id']]);
            wf_touch();
            wf_json(['ok' => true, 'order' => order_row($db, (int)$f['order_id'])]);
        }

        // ---------- Kalender ----------
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
            $st = $db->prepare("SELECT o.id, o.nr, o.title, o.qty, o.status, o.due_date, COALESCE(o.plan_date, o.due_date) AS d, c.name AS customer_name
                                FROM orders o JOIN customers c ON c.id = o.customer_id
                                WHERE o.deleted_at IS NULL AND o.status <> 'delivered' AND COALESCE(o.plan_date, o.due_date) BETWEEN ? AND ?
                                ORDER BY d, o.id");
            $st->execute([$from, $to]);
            wf_json(['ok' => true, 'days' => wf_capacity($from, $to), 'orders' => $st->fetchAll()]);
        }

        // ---------- Terminvorschlag / Verfuegbarkeit ----------
        case 'suggest':
        case 'available': {
            $need = [];
            foreach (explode(',', (string)($_GET['p'] ?? '')) as $part) {
                [$pid, $min] = array_pad(explode(':', $part), 2, '0');
                if ((int)$pid > 0) {
                    $need[(int)$pid] = max(0, min(100000, (int)$min));
                }
            }
            if ($a === 'suggest' && !$need) {
                wf_fail('no_processes');
            }
            $from = (string)($_GET['from'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $from) || $from < date('Y-m-d')) {
                $from = date('Y-m-d');
            }
            // mode=open: nur nicht gesperrte Tage (Abgabetermin nach feststehendem Produktionstag), keine Kapazitaetspruefung
            $open = ($_GET['mode'] ?? '') === 'open';
            $to = date('Y-m-d', strtotime($from . ($a === 'suggest' ? ' +60 days' : ' +180 days')));
            $split = false;
            $dates = wf_free_days($open ? [] : $need, $from, $to, (int)($_GET['exclude'] ?? 0), $split);
            if ($a === 'suggest') {
                $dates = array_slice($dates, 0, 4);
            }
            wf_json(['ok' => true, 'dates' => $dates, 'split' => $split]);
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
            $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('weekend_min', ?)")->execute([(string)$wk]);
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
                }
                $db->prepare('DELETE FROM orders WHERE id = ?')->execute([$oid]);
                $n++;
            }
            wf_json(['ok' => true, 'purged' => $n]);
        }

        default:
            wf_fail('unknown_action', 404);
    }
} catch (Throwable $e) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    error_log('auftraege api: ' . $e->getMessage());
    wf_fail('server_error', 500);
}
