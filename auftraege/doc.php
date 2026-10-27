<?php
declare(strict_types=1);
// Druckansicht A4 einer Rechnung/Kreditnota in der Sprache des Kunden. Drucken -> "Als PDF speichern".
require __DIR__ . '/inc/bootstrap.php';
require_once __DIR__ . '/inc/invoice.php';
require_once __DIR__ . '/inc/docrender.php';
wf_require_user(false);
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'unsafe-inline'");

$db = wf_db();
$i = wf_inv_load($db, (int)($_GET['id'] ?? 0));
if (!$i) {
    http_response_code(404);
    exit('not found');
}
echo wf_doc_html($db, $i, (string)($_GET['lang'] ?? ''), false, isset($_GET['design']) ? (string)$_GET['design'] : null);
