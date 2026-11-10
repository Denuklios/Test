<?php
/**
 * Wunsch-Fabrik.dk – Newsletter: Anmelden (POST a=subscribe), Bestätigen (a=confirm), Abmelden (a=unsub).
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/newsletter_lib.php';

header('X-Robots-Tag: noindex, nofollow');
$a = (string)($_REQUEST['a'] ?? '');
$mysqli = wf_db_connect();

/** Kleine Ergebnisseite im Stil der Webseite. */
function wf_nl_page($lang, $title, $text, $form = '') {
    header('Content-Type: text/html; charset=utf-8');
    $back = wf_nl_t($lang, 'back');
    echo '<!doctype html><html lang="' . wf_nl_esc($lang) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>' . wf_nl_esc($title) . ' – Wunsch-Fabrik.dk</title></head>'
        . '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#090909;color:#F0EEF5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:16px;box-sizing:border-box;">'
        . '<div style="max-width:460px;width:100%;background:#16131f;border:1px solid rgba(168,85,247,.3);border-radius:18px;padding:28px;text-align:center;">'
        . '<img src="wf-logo-160.png" alt="WF" style="height:36px;margin-bottom:14px;">'
        . '<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:1.6rem;margin:0 0 10px;">' . wf_nl_esc($title) . '</h1>'
        . '<p style="color:#b9b3c7;line-height:1.55;margin:0 0 18px;">' . wf_nl_esc($text) . '</p>' . $form
        . '<p style="margin:18px 0 0;"><a href="./" style="color:#C9A0FF;">' . wf_nl_esc($back) . '</a></p></div></body></html>';
    exit;
}

if (!$mysqli) {
    if ($a === 'subscribe') { header('Content-Type: application/json'); echo json_encode(['ok' => false, 'error' => 'db']); exit; }
    wf_nl_page('de', 'Fehler', 'Bitte später noch einmal versuchen.');
}
wf_nl_tables($mysqli);

// ─── Anmelden (vom Formular auf der Webseite) ──────────────────────
if ($a === 'subscribe') {
    header('Content-Type: application/json');
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !empty($_POST['website']) || empty($_POST['consent'])) {
        echo json_encode(['ok' => false, 'error' => 'input']);
        exit;
    }
    // höchstens 5 Anmeldungen je Stunde und Anschluss (IP wird nur als Prüfsumme gespeichert)
    $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|wfnl');
    $st = $mysqli->prepare("SELECT COUNT(*) FROM newsletter_rate WHERE ip_hash = ? AND at > (NOW() - INTERVAL 1 HOUR)");
    $st->bind_param('s', $ip);
    $st->execute();
    $cnt = (int)$st->get_result()->fetch_row()[0];
    $st->close();
    if ($cnt >= 5) { echo json_encode(['ok' => false, 'error' => 'rate']); exit; }
    $now = date('Y-m-d H:i:s');
    $st = $mysqli->prepare("INSERT INTO newsletter_rate (ip_hash, at) VALUES (?, ?)");
    $st->bind_param('ss', $ip, $now);
    $st->execute();
    $st->close();
    echo json_encode(wf_nl_subscribe($mysqli, $_POST['email'] ?? '', $_POST['name'] ?? '', $_POST['lang'] ?? 'de', 'webseite'));
    exit;
}

// ─── Anmeldeseite (Link aus Kunden-Mails, Auftragsbestätigung und Verfolgungsseite) ─────
if ($a === 'join') {
    $lang = wf_nl_lang($_REQUEST['l'] ?? 'de');
    $email = mb_substr(trim((string)($_REQUEST['e'] ?? '')), 0, 190);
    $msg = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!empty($_POST['website'])) wf_nl_page($lang, wf_nl_t($lang, 'join_title'), wf_nl_t($lang, 'join_sent'));
        if (empty($_POST['consent']) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $msg = wf_nl_t($lang, 'join_need');
        } else {
            $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|wfnl');
            $st = $mysqli->prepare("SELECT COUNT(*) FROM newsletter_rate WHERE ip_hash = ? AND at > (NOW() - INTERVAL 1 HOUR)");
            $st->bind_param('s', $ip);
            $st->execute();
            $cnt = (int)$st->get_result()->fetch_row()[0];
            $st->close();
            if ($cnt < 5) {
                $now = date('Y-m-d H:i:s');
                $st = $mysqli->prepare("INSERT INTO newsletter_rate (ip_hash, at) VALUES (?, ?)");
                $st->bind_param('ss', $ip, $now);
                $st->execute();
                $st->close();
                $r = wf_nl_subscribe($mysqli, $email, $_POST['name'] ?? '', $lang, 'kundenlink');
                if ($r['ok']) wf_nl_page($lang, wf_nl_t($lang, 'join_title'), wf_nl_t($lang, !empty($r['already']) ? 'join_already' : 'join_sent'));
            }
            $msg = wf_nl_t($lang, 'join_need');
        }
    }
    $consent = wf_nl_esc(wf_nl_consent_text($lang));
    $form = '<form method="post" action="newsletter.php?a=join&amp;l=' . $lang . '" style="text-align:left">'
        . ($msg !== '' ? '<p style="color:#f87171;margin:0 0 10px;">' . wf_nl_esc($msg) . '</p>' : '')
        . '<input type="email" name="e" required value="' . wf_nl_esc($email) . '" style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:999px;border:1px solid rgba(168,85,247,.45);background:rgba(255,255,255,.05);color:#F0EEF5;font-size:1rem;margin-bottom:10px;">'
        . '<input type="hidden" name="name" value="' . wf_nl_esc(mb_substr((string)($_REQUEST['n'] ?? ''), 0, 120)) . '">'
        . '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;">'
        . '<label style="display:flex;gap:8px;align-items:flex-start;font-size:.85rem;color:#b9b3c7;line-height:1.45;margin-bottom:14px;cursor:pointer;"><input type="checkbox" name="consent" value="1" style="margin-top:3px;accent-color:#8B2BE2;"> ' . $consent . '</label>'
        . '<button type="submit" style="width:100%;background:#8B2BE2;color:#fff;border:0;border-radius:999px;padding:12px 24px;font-size:1rem;font-weight:600;cursor:pointer;">' . wf_nl_esc(wf_nl_t($lang, 'join_btn')) . '</button></form>';
    wf_nl_page($lang, wf_nl_t($lang, 'join_title'), wf_nl_t($lang, 'join_text'), $form);
}

$token = preg_match('/^[0-9a-f]{32}$/', (string)($_REQUEST['t'] ?? '')) ? (string)$_REQUEST['t'] : '';
$sub = null;
if ($token !== '') {
    $st = $mysqli->prepare("SELECT * FROM newsletter_subscribers WHERE token = ?");
    $st->bind_param('s', $token);
    $st->execute();
    $sub = $st->get_result()->fetch_assoc();
    $st->close();
}
$lang = wf_nl_lang($sub['lang'] ?? ($_REQUEST['l'] ?? 'de'));

// ─── Bestätigen (Link aus der Bestätigungsmail) ────────────────────
if ($a === 'confirm') {
    if (!$sub || $sub['status'] === 'unsubscribed') wf_nl_page($lang, wf_nl_t($lang, 'bad_title'), wf_nl_t($lang, 'bad_text'));
    if ($sub['status'] === 'pending') {
        $now = date('Y-m-d H:i:s');
        $id = (int)$sub['id'];
        $st = $mysqli->prepare("UPDATE newsletter_subscribers SET status = 'active', confirmed_at = ? WHERE id = ?");
        $st->bind_param('si', $now, $id);
        $st->execute();
        $st->close();
    }
    wf_nl_page($lang, wf_nl_t($lang, 'ok_title'), wf_nl_t($lang, 'ok_text'));
}

// ─── Abmelden (Link in jedem Newsletter; Mailprogramme senden POST „One-Click“) ──
if ($a === 'unsub') {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if ($sub && $sub['status'] !== 'unsubscribed') {
            $now = date('Y-m-d H:i:s');
            $id = (int)$sub['id'];
            $st = $mysqli->prepare("UPDATE newsletter_subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE id = ?");
            $st->bind_param('si', $now, $id);
            $st->execute();
            $st->close();
            wf_nl_app_optout($sub['email']);   // als Widerspruch beim Kunden der Auftrags-App vermerken
        }
        if (isset($_POST['List-Unsubscribe'])) { http_response_code(200); exit; }
        wf_nl_page($lang, wf_nl_t($lang, 'unsub_title'), wf_nl_t($lang, 'unsub_done'));
    }
    if (!$sub) wf_nl_page($lang, wf_nl_t($lang, 'unsub_title'), wf_nl_t($lang, 'bad_text'));
    if ($sub['status'] === 'unsubscribed') wf_nl_page($lang, wf_nl_t($lang, 'unsub_title'), wf_nl_t($lang, 'unsub_done'));
    // Erst nach Klick abmelden (Virenscanner in Mailprogrammen öffnen Links sonst automatisch)
    $form = '<form method="post" action="newsletter.php?a=unsub&amp;t=' . $token . '"><button type="submit" style="background:#8B2BE2;color:#fff;border:0;border-radius:999px;padding:12px 24px;font-size:1rem;font-weight:600;cursor:pointer;">'
        . wf_nl_esc(wf_nl_t($lang, 'unsub_btn')) . '</button></form>';
    wf_nl_page($lang, wf_nl_t($lang, 'unsub_title'), wf_nl_t($lang, 'unsub_text') . ' (' . $sub['email'] . ')', $form);
}

header('Location: ./');
