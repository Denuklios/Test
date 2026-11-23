<?php
/**
 * Zeitplan-Durchlauf. Aufruf jede Minute (oder alle 5 Minuten) per Cronjob:
 *   php /pfad/zu/postwerk/cron.php
 * oder per URL:  https://deine-domain/postwerk/cron.php?key=CRON-SCHLÜSSEL
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';

if (PHP_SAPI !== 'cli') {
    if (!hash_equals((string)cfg('cron_key'), (string)($_GET['key'] ?? ''))) {
        pp_json_out(['error' => 'Falscher Schlüssel'], 403);
        exit;
    }
}
$res = pp_tick(PHP_SAPI === 'cli' ? 240 : 50);
if (PHP_SAPI === 'cli') echo json_encode($res, JSON_UNESCAPED_UNICODE) . "\n";
else pp_json_out(['ok' => true] + $res);
