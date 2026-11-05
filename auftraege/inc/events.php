<?php
declare(strict_types=1);

/**
 * Meldungen für die Handy-App (Benachrichtigungen): neue Anfragen von der Webseite, unterschriebene Angebote, Zahlungseingänge.
 * Nichts wird extra gespeichert: die App schickt einen Stand („Cursor“, je Art die zuletzt gesehene Nummer)
 * und bekommt alles Neuere zurück. Beim ersten Abruf ohne Stand kommt nur der aktuelle Stand (keine Flut alter Meldungen).
 * Anfragen liegen in der MariaDB der Webseite (Zugangsdaten aus ../db_config.php); fehlt sie, entfällt nur diese Art.
 */

const WF_EVENT_KINDS = ['inquiry', 'signed', 'payment', 'mail'];

function wf_events_cursor_parse(string $c): ?array
{
    if ($c === '') {
        return null;
    }
    $r = [];
    foreach (explode(',', $c) as $part) {
        [$k, $v] = array_pad(explode(':', $part, 2), 2, '');
        if (in_array($k, WF_EVENT_KINDS, true)) {
            $r[$k] = max(0, (int)$v);
        }
    }
    return $r;
}

function wf_events_cursor(array $c): string
{
    return implode(',', array_map(fn($k) => $k . ':' . (int)($c[$k] ?? 0), WF_EVENT_KINDS));
}

/** Verbindung zur Webseiten-Datenbank (nur lesen), null wenn nicht vorhanden. */
function wf_events_site_db(): ?PDO
{
    static $db = false;
    if ($db !== false) {
        return $db;
    }
    $db = null;
    $cfg = getenv('WF_SITE_DB_CONFIG') ?: dirname(__DIR__, 2) . '/db_config.php';
    if (!is_file($cfg) || !extension_loaded('pdo_mysql')) {
        return null;
    }
    try {
        require_once $cfg;
        if (defined('DB_HOST') && defined('DB_NAME')) {
            $db = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', (string)DB_USER, (string)DB_PASS,
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_TIMEOUT => 3]);
        }
    } catch (Throwable $e) {
        $db = null;
    }
    return $db;
}

/** Neue Anfragen (oder nur höchste Nummer, wenn $after null). Liefert [max, items]. */
function wf_events_inquiries(?int $after): array
{
    $site = wf_events_site_db();
    if (!$site) {
        return [$after ?? 0, []];
    }
    try {
        $max = (int)$site->query('SELECT COALESCE(MAX(id), 0) FROM inquiries')->fetchColumn();
        if ($after === null) {
            return [$max, []];
        }
        $q = $site->prepare('SELECT id, name, product, qty, message FROM inquiries WHERE id > ? ORDER BY id LIMIT 20');
        $q->execute([$after]);
        $items = [];
        foreach ($q->fetchAll() as $r) {
            $what = trim(implode(' ', array_filter([trim((string)$r['qty']), trim((string)$r['product'])])));
            $items[] = ['kind' => 'inquiry', 'id' => (int)$r['id'], 'title' => trim((string)$r['name']),
                'text' => $what !== '' ? $what : mb_substr(trim((string)$r['message']), 0, 120), 'open' => 'inquiry:' . (int)$r['id']];
        }
        return [$max, $items];
    } catch (Throwable $e) {
        return [$after ?? 0, []];
    }
}

function wf_events(PDO $db, string $cursor, string $selfName = ''): array
{
    $c = wf_events_cursor_parse($cursor);
    $first = $c === null;
    $items = [];
    $next = [];

    [$next['inquiry'], $inq] = wf_events_inquiries($first || !isset($c['inquiry']) ? null : $c['inquiry']);
    $items = array_merge($items, $inq);

    // unterschriebene Angebote (Nummer = Bestätigung)
    $next['signed'] = (int)$db->query('SELECT COALESCE(MAX(id), 0) FROM order_confirmations WHERE signed_at IS NOT NULL')->fetchColumn();
    if (!$first && isset($c['signed'])) {
        $q = $db->prepare('SELECT oc.id, oc.order_id, oc.signer_name, o.nr, o.title FROM order_confirmations oc JOIN orders o ON o.id = oc.order_id
            WHERE oc.signed_at IS NOT NULL AND oc.id > ? ORDER BY oc.id LIMIT 20');
        $q->execute([$c['signed']]);
        foreach ($q->fetchAll() as $r) {
            $items[] = ['kind' => 'signed', 'id' => (int)$r['id'], 'title' => trim((string)$r['signer_name']),
                'text' => trim($r['nr'] . ' ' . $r['title']), 'open' => 'order:' . (int)$r['order_id']];
        }
    }

    // Zahlungseingänge auf Rechnungen (ohne eigene Buchungen und ohne Rückerstattungen)
    $next['payment'] = (int)$db->query('SELECT COALESCE(MAX(id), 0) FROM invoice_payments')->fetchColumn();
    if (!$first && isset($c['payment'])) {
        $q = $db->prepare('SELECT p.id, p.amount, p.created_by, i.number, i.currency, i.order_id, i.type, cu.name AS customer
            FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id LEFT JOIN customers cu ON cu.id = i.customer_id
            WHERE p.id > ? AND p.amount > 0 ORDER BY p.id LIMIT 20');
        $q->execute([$c['payment']]);
        foreach ($q->fetchAll() as $r) {
            if ($r['type'] === 'credit' || ($selfName !== '' && $r['created_by'] === $selfName)) {
                continue;
            }
            $amt = number_format(((int)$r['amount']) / 100, 2, ',', '.') . ' ' . ($r['currency'] === 'DKK' ? 'kr.' : $r['currency']);
            $items[] = ['kind' => 'payment', 'id' => (int)$r['id'], 'title' => trim((string)($r['customer'] ?? '')) ?: ('#' . $r['number']),
                'text' => $amt . ' · ' . $r['number'], 'open' => $r['order_id'] ? 'order:' . (int)$r['order_id'] : ''];
        }
    }
    // neue Mails im Posteingang (Postfach im Auftragsprogramm); vorher kurz abgleichen, damit die Meldung ohne Zeitplan kommt
    if (function_exists('wf_imap_cfg') && wf_imap_cfg()) {
        $last = strtotime((string)($db->query("SELECT value FROM meta WHERE key = 'mail_sync_last'")->fetchColumn() ?: '')) ?: 0;
        if (time() - $last > 150) {
            wf_mail_sync($db, 8);
        }
    }
    $next['mail'] = (int)$db->query("SELECT COALESCE(MAX(id), 0) FROM mail_msgs WHERE folder = 'in'")->fetchColumn();
    if (!$first && isset($c['mail'])) {
        $q = $db->prepare("SELECT id, from_addr, from_name, subject, snippet, order_id FROM mail_msgs WHERE folder = 'in' AND archived = 0 AND seen = 0 AND id > ? ORDER BY id LIMIT 20");
        $q->execute([$c['mail']]);
        foreach ($q->fetchAll() as $r) {
            $items[] = ['kind' => 'mail', 'id' => (int)$r['id'], 'title' => trim((string)$r['from_name']) ?: (string)$r['from_addr'],
                'text' => trim((string)$r['subject']) !== '' ? (string)$r['subject'] : mb_substr((string)$r['snippet'], 0, 120), 'open' => 'mail:' . (int)$r['id']];
        }
    }
    return ['cursor' => wf_events_cursor($next), 'events' => $items];
}

/** Anzahl neuer (noch nicht bearbeiteter) Anfragen von der Webseite, 0 ohne Webseiten-Datenbank. */
function wf_inq_new(): int
{
    $site = wf_events_site_db();
    if (!$site) {
        return 0;
    }
    try {
        return (int)$site->query("SELECT COUNT(*) FROM inquiries WHERE status = 'new'")->fetchColumn();
    } catch (Throwable $e) {
        return 0;
    }
}
