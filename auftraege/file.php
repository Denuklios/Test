<?php
declare(strict_types=1);
// Auslieferung hochgeladener Dateien nur fuer eingeloggte Benutzer. ?thumb=1 liefert ein kleines Vorschaubild (wird einmal erzeugt und gemerkt).
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/thumb.php';
wf_require_user(false);
if (isset($_GET['exp'])) {
    // Beleg einer Ausgabe
    $st = wf_db()->prepare('SELECT id, file_stored AS stored_name, file_mime AS mime, file_name AS original_name FROM expenses WHERE id = ? AND file_stored IS NOT NULL');
    $st->execute([(int)$_GET['exp']]);
} else {
    $st = wf_db()->prepare('SELECT * FROM order_files WHERE id = ?');
    $st->execute([(int)($_GET['id'] ?? 0)]);
}
$f = $st->fetch();
$dir = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads';
$path = $f ? $dir . '/' . $f['stored_name'] : '';
if (!$f || !is_file($path)) {
    http_response_code(404);
    exit('Nicht gefunden');
}
$mime = $f['mime'];
if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'], true)) {
    $mime = 'application/octet-stream';
}

if (isset($_GET['thumb'])) {
    $t = wf_thumb($dir, $f, $path);
    if ($t) {
        [$path, $mime] = $t;
        header('Cache-Control: private, max-age=86400');
    }
}
header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($path));
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
if (!isset($_GET['thumb'])) {
    header('Cache-Control: private, max-age=3600');
}
$disp = isset($_GET['dl']) ? 'attachment' : 'inline';
header('Content-Disposition: ' . $disp . '; filename*=UTF-8\'\'' . rawurlencode($f['original_name']));
readfile($path);
