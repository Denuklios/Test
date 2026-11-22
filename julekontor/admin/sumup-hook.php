<?php
/* Rückmeldung von SumUp, wenn eine Kartenzahlung am Solo abgeschlossen ist.
   Wir trauen der Nachricht nicht blind: Sie löst nur eine Nachfrage bei SumUp aus (sumup_refresh). */
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/sumup.php';
header('Content-Type: application/json');
$body = json_decode((string)file_get_contents('php://input'), true) ?: [];
$ctx = (string)($body['payload']['client_transaction_id'] ?? '');
if ($ctx !== '' && preg_match('/^[A-Za-z0-9-]{8,80}$/', $ctx)) {
    $st = db()->prepare("SELECT uuid FROM card_payments WHERE client_tx_id = ? AND status = 'pending'");
    $st->execute([$ctx]);
    if ($uuid = $st->fetchColumn()) { try { sumup_refresh((string)$uuid); } catch (Throwable $e) { error_log('SumUp-Hook: ' . $e->getMessage()); } }
}
echo '{"ok":true}';
