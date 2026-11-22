<?php
declare(strict_types=1);
// Zeitplan-Aufruf (z. B. stündlich von cron-job.org oder Google Apps Script): verschickt fällige Kundenmails und das Archiv,
// auch wenn die App nicht geöffnet ist. Geschützt durch den geheimen Schlüssel aus den Einstellungen.
// Fehler sichtbar machen: Text in der Antwort (für cron-job.org) und in den Einstellungen
register_shutdown_function(function (): void {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        wf_cron_fail($e['message'] . ' in ' . basename($e['file']) . ':' . $e['line']);
    }
});
function wf_cron_fail(string $msg): void
{
    try {
        wf_db()->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('cron_error', ?)")->execute([date('Y-m-d H:i:s') . ' · ' . mb_substr($msg, 0, 400)]);
    } catch (Throwable $e) {
        // Datenbank nicht erreichbar: nur Ausgabe
    }
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
    }
    echo 'FEHLER: ' . $msg . "\n";
}
require __DIR__ . '/inc/bootstrap.php';
require_once __DIR__ . '/inc/custmail.php';
session_write_close();
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$db = wf_db();
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
$db->prepare('DELETE FROM rate_limit WHERE at < ?')->execute([time() - 600]);
$cnt = $db->prepare('SELECT COUNT(*) FROM rate_limit WHERE ip = ? AND at >= ?');
$cnt->execute([$ip, time() - 600]);
$key = (string)($_GET['key'] ?? '');
$real = (string)($db->query("SELECT value FROM meta WHERE key = 'cron_key'")->fetchColumn() ?: '');
if ((int)$cnt->fetchColumn() >= 30 || $real === '' || !hash_equals($real, $key)) {
    $db->prepare('INSERT INTO rate_limit (ip, at) VALUES (?, ?)')->execute([$ip, time()]);
    // für die Fehlersuche in den Einstellungen: Aufruf kam an, aber Schlüssel falsch/fehlt
    $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('cron_denied', ?)")->execute([date('Y-m-d H:i:s') . ($key === '' ? ' · ohne Schlüssel' : ' · falscher Schlüssel')]);
    http_response_code(403);
    exit("forbidden\n");
}
@set_time_limit(120);
try {
    $archive = wf_archive_cfg()['mode'] !== '' ? wf_archive_run($db, 20) : ['sent' => 0, 'failed' => 0];
    $mails = wf_cm_run($db, 20);
} catch (Throwable $e) {
    wf_cron_fail($e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine());
    exit;
}
$db->exec("DELETE FROM meta WHERE key = 'cron_error'");
$res = "OK archive={$archive['sent']} failed={$archive['failed']} followup=$mails";
$db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('cron_last', ?), ('cron_result', ?)")->execute([date('Y-m-d H:i:s'), $res]);
echo $res . "\n";
