<?php
/* Julekontor – Einstieg der Website. Jede Seite ist ./?s=<name>.
   Vor dem Eröffnungstag (Countdown) zeigt jede Adresse nur die Countdown-Seite. */
declare(strict_types=1);
require __DIR__ . '/site/lib.php';

const SITE_PAGES = ['home', 'butik', 'vare', 'kurv', 'ordre', 'julekalender', 'nyheder', 'arrangementer', 'galleri', 'faq', 'om', 'kontakt', 'vilkaar'];
$s = (string)($_GET['s'] ?? 'home');

try {
    if (!$OPEN) { require __DIR__ . '/site/pages/soon.php'; exit; }
    if (!in_array($s, SITE_PAGES, true)) { http_response_code(404); $s = 'home'; }
    require __DIR__ . '/site/pages/' . $s . '.php';
} catch (Throwable $e) {
    error_log('julekontor: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) http_response_code(500);
    echo '<p style="font:1.2rem Georgia,serif;text-align:center;margin:20vh 1rem">Julekontor – ' . h(t('checkout.err.server')) . '</p>';
}
