<?php
declare(strict_types=1);
// Auslieferung hochgeladener Dateien nur fuer eingeloggte Benutzer. ?thumb=1 liefert ein kleines Vorschaubild (wird einmal erzeugt und gemerkt).
require __DIR__ . '/inc/bootstrap.php';
wf_require_user(false);
$st = wf_db()->prepare('SELECT * FROM order_files WHERE id = ?');
$st->execute([(int)($_GET['id'] ?? 0)]);
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

/** Vorschaubild (max. 240 px). Gibt Pfad und MIME zurueck oder null, wenn GD fehlt / kein Bild. */
function wf_thumb(string $dir, array $f, string $path): ?array
{
    if (!str_starts_with($f['mime'], 'image/') || !function_exists('imagecreatefromstring')) {
        return null;
    }
    $keepAlpha = $f['mime'] !== 'image/jpeg';
    $tdir = $dir . '/thumbs';
    $tp = $tdir . '/' . $f['stored_name'] . ($keepAlpha ? '.png' : '.jpg');
    $tm = $keepAlpha ? 'image/png' : 'image/jpeg';
    if (is_file($tp)) {
        return [$tp, $tm];
    }
    $src = @imagecreatefromstring((string)file_get_contents($path));
    if (!$src) {
        return null;
    }
    // EXIF-Drehung bei Fotos, die nicht schon vom Handy-Browser gedreht wurden
    if ($f['mime'] === 'image/jpeg' && function_exists('exif_read_data')) {
        $ex = @exif_read_data($path);
        $rot = [3 => 180, 6 => -90, 8 => 90][$ex['Orientation'] ?? 1] ?? 0;
        if ($rot) {
            $r = imagerotate($src, $rot, 0);
            if ($r) {
                $src = $r;
            }
        }
    }
    $w = imagesx($src);
    $h = imagesy($src);
    $sc = min(1, 240 / max($w, $h));
    $nw = max(1, (int)round($w * $sc));
    $nh = max(1, (int)round($h * $sc));
    $dst = imagecreatetruecolor($nw, $nh);
    if ($keepAlpha) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
    }
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    if (!is_dir($tdir)) {
        @mkdir($tdir, 0775, true);
    }
    $ok = $keepAlpha ? @imagepng($dst, $tp, 6) : @imagejpeg($dst, $tp, 80);
    return $ok ? [$tp, $tm] : null;
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
