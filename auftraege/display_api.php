<?php
declare(strict_types=1);
// Endpunkt fuer die Werkstatt-Anzeige: Zugriff nur per geheimem, widerrufbarem Token (kein Login).
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/display.php';

// Die Anzeige nutzt keine Session; Schreibzugriffe auf die Session-Datei vermeiden (Polling).
session_write_close();
header('Referrer-Policy: no-referrer');

$db = wf_db();
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';

// Ratenbegrenzung gegen Token-Raten: max. 30 Fehlversuche je 10 Minuten und IP.
$db->prepare('DELETE FROM rate_limit WHERE at < ?')->execute([time() - 600]);
$cnt = $db->prepare('SELECT COUNT(*) FROM rate_limit WHERE ip = ? AND at >= ?');
$cnt->execute([$ip, time() - 600]);
if ((int)$cnt->fetchColumn() >= 30) {
    wf_fail('rate_limited', 429);
}

$token = (string)($_GET['t'] ?? '');
$row = false;
if (preg_match('/^[0-9a-f]{64}$/', $token)) {
    $st = $db->prepare('SELECT id, last_used_at, revoked_at FROM display_tokens WHERE token_hash = ?');
    $st->execute([hash('sha256', $token)]);
    $row = $st->fetch();
}
if (!$row || $row['revoked_at']) {
    $db->prepare('INSERT INTO rate_limit (ip, at) VALUES (?, ?)')->execute([$ip, time()]);
    wf_fail($row ? 'revoked' : 'invalid_token', 403);
}
if (!$row['last_used_at'] || strtotime($row['last_used_at'] . ' UTC') < time() - 60) {
    $db->prepare("UPDATE display_tokens SET last_used_at = datetime('now') WHERE id = ?")->execute([$row['id']]);
}

if (isset($_GET['full'])) {
    wf_json(['ok' => true] + wf_display_payload());
}
wf_json(['ok' => true, 'version' => wf_version()]);
