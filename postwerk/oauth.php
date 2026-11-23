<?php
/** TikTok-Anmeldung: ?start=1 leitet zu TikTok, TikTok leitet mit ?code=… zurück. */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';

if (!pp_logged_in()) { header('Location: index.php'); exit; }

if (isset($_GET['start'])) {
    if (!tt_configured()) { header('Location: index.php?p=settings&msg=' . rawurlencode('Bitte zuerst Client Key und Client Secret eintragen.')); exit; }
    if (!pp_csrf_ok($_GET['csrf'] ?? null)) { http_response_code(400); exit('Ungültige Anfrage.'); }
    $state = bin2hex(random_bytes(16));
    $_SESSION['pp_oauth_state'] = $state;
    header('Location: ' . tt_auth_url($state));
    exit;
}

$msg = '';
if (!empty($_GET['error'])) {
    $msg = 'TikTok-Anmeldung abgebrochen: ' . ($_GET['error_description'] ?? $_GET['error']);
} elseif (empty($_GET['code']) || empty($_SESSION['pp_oauth_state']) || !hash_equals($_SESSION['pp_oauth_state'], (string)($_GET['state'] ?? ''))) {
    $msg = 'Anmeldung ungültig oder abgelaufen. Bitte erneut verbinden.';
} else {
    unset($_SESSION['pp_oauth_state']);
    try {
        $acc = tt_exchange_code((string)$_GET['code']);
        $msg = 'Verbunden: @' . ($acc['username'] ?? $acc['display_name'] ?? $acc['open_id']);
        pp_log('Konto verbunden', ['user' => $acc['username'] ?? '']);
    } catch (Throwable $e) {
        $msg = $e->getMessage();
    }
}
header('Location: index.php?p=accounts&msg=' . rawurlencode($msg));
