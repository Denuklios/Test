<?php
/** Liefert Videos/Vorschaubilder aus dem geschützten Ordner an angemeldete Nutzer (mit Range für Safari). */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';

if (!pp_logged_in()) { http_response_code(403); exit; }
session_write_close();
try {
    $path = pp_video_path((string)($_GET['f'] ?? ''));
} catch (Throwable $e) { http_response_code(404); exit; }
if (isset($_GET['thumb'])) {
    if (!is_file($path . '.thumb')) { http_response_code(404); exit; }
    $d = (string)file_get_contents($path . '.thumb');
    header('Content-Type: ' . (substr($d, 0, 4) === "\x89PNG" ? 'image/png' : (substr($d, 0, 4) === 'RIFF' ? 'image/webp' : 'image/jpeg')));
    header('Cache-Control: private, max-age=86400');
    echo $d;
    exit;
}
if (!is_file($path)) { http_response_code(404); exit; }
$meta = pp_video_meta(basename($path)) ?? [];
$size = filesize($path);
$start = 0; $end = $size - 1;
header('Accept-Ranges: bytes');
header('Content-Type: ' . ($meta['mime'] ?? 'video/mp4'));
header('Cache-Control: private, max-age=3600');
if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
    if ($m[1] !== '') { $start = (int)$m[1]; if ($m[2] !== '') $end = min((int)$m[2], $size - 1); }
    elseif ($m[2] !== '') { $start = max(0, $size - (int)$m[2]); }
    if ($start > $end) { http_response_code(416); header("Content-Range: bytes */$size"); exit; }
    http_response_code(206);
    header("Content-Range: bytes $start-$end/$size");
}
header('Content-Length: ' . ($end - $start + 1));
if (isset($_GET['download'])) header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $meta['name'] ?? 'video.mp4') . '"');
$fh = fopen($path, 'rb');
fseek($fh, $start);
$left = $end - $start + 1;
while ($left > 0 && !feof($fh) && !connection_aborted()) {
    $buf = fread($fh, min(262144, $left));
    echo $buf; flush();
    $left -= strlen($buf);
}
fclose($fh);
