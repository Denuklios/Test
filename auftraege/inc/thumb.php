<?php
declare(strict_types=1);

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
