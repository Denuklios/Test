<?php
/* Website: Inhalte (data/site.json), Bilder (data/bilder), Adventskalender und Anfragen.
   Wird vom Admin und von der öffentlichen Schnittstelle (api.php) benutzt. */
declare(strict_types=1);
require_once __DIR__ . '/db.php';

const WEB_LANGS = ['da' => 'Dänisch', 'de' => 'Deutsch', 'en' => 'Englisch'];
const WEB_IMG_DIR = JK_DATA . '/bilder';
/* Bereiche im Sortiment: Schlüssel => Name im Admin. Die Texte dazu stehen in assets/js/i18n.js. */
const WEB_CATEGORIES = [
    'kranse'  => 'Adventskränze',
    'pynt'    => 'Dekoration',
    'traeer'  => 'Kleine Bäume',
    'braet'   => 'Gravierte Bretter',
    'mere'    => '… und vieles mehr',
];
const WEB_REQUEST_KINDS = ['frage' => 'Frage', 'reservierung' => 'Reservierung', 'bausatz' => 'Bausatz'];

/* Alle Website-Einstellungen mit Vorgaben. Fehlt etwas in site.json, gilt die Vorgabe. */
function web_site(): array {
    $s = read_json('site');
    $d = [
        'countdownEnabled' => true,
        'countdownTarget'  => '2027-11-14T10:00',
        'snow' => true, 'bell' => true,
        'hero' => ['da' => '', 'de' => '', 'en' => ''],        // eigener Satz unter dem Logo (leer = Standardtext)
        'notice' => ['da' => '', 'de' => '', 'en' => ''],      // Hinweisband ganz oben (leer = aus)
        'contact' => ['street' => '', 'city' => '6330 Padborg / Vilsbæk', 'phone' => '', 'email' => '',
                      'facebook' => '', 'instagram' => '', 'maps' => '', 'cvr' => ''],
        'hours' => ['published' => false, 'days' => [],
                    'note' => ['da' => '', 'de' => '', 'en' => '']],
        'calendar' => ['enabled' => true, 'year' => 2027, 'preview' => ''],
        'requests' => true,
        'images' => [],
    ];
    foreach ($d as $k => $v) {
        if (!array_key_exists($k, $s)) { $s[$k] = $v; continue; }
        if (is_array($v) && is_array($s[$k]) && !array_is_list($v)) $s[$k] += $v;
    }
    for ($i = 0; $i < 7; $i++) $s['hours']['days'][$i] = ($s['hours']['days'][$i] ?? []) + ['open' => '10:00', 'close' => '17:00', 'closed' => $i === 0];
    $s['hours']['days'] = array_slice($s['hours']['days'], 0, 7);
    return $s;
}
function web_save(array $site): void { write_json('site', $site); }

/* Drei Sprachfelder aus einem Formular lesen: name_da, name_de, name_en */
function web_post_langs(string $name, int $max): array {
    $o = [];
    foreach (WEB_LANGS as $l => $_) $o[$l] = mb_substr(trim((string)($_POST[$name . '_' . $l] ?? '')), 0, $max);
    return $o;
}
function web_url(string $u): string {
    $u = trim($u);
    if ($u === '') return '';
    if (!preg_match('~^https?://~i', $u)) $u = 'https://' . $u;
    return filter_var($u, FILTER_VALIDATE_URL) ? mb_substr($u, 0, 300) : '';
}

/* ---------- Bilder (data/bilder, öffentlich lesbar) ---------- */
/* Foto verkleinern (längste Seite höchstens $max) und als JPEG speichern. Gibt den Dateinamen zurück. */
function web_save_image(string $prefix, string $tmp, int $max = 1400): string {
    $info = @getimagesize($tmp);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) throw new ShopError('Bitte ein Foto als JPG, PNG oder WebP hochladen.');
    if ($info[0] * $info[1] > 50_000_000) throw new ShopError('Das Foto ist zu groß.');
    $src = match ($info[2]) {
        IMAGETYPE_JPEG => @imagecreatefromjpeg($tmp), IMAGETYPE_PNG => @imagecreatefrompng($tmp), default => @imagecreatefromwebp($tmp),
    };
    if (!$src) throw new ShopError('Das Foto konnte nicht gelesen werden.');
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $o = (int)(@exif_read_data($tmp)['Orientation'] ?? 1);
        $rot = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
        if ($rot) $src = imagerotate($src, $rot, 0);
    }
    $w = imagesx($src); $h = imagesy($src);
    $f = min(1, $max / max($w, $h));
    $nw = max(1, (int)round($w * $f)); $nh = max(1, (int)round($h * $f));
    $dst = imagecreatetruecolor($nw, $nh);
    imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    if (!is_dir(WEB_IMG_DIR)) mkdir(WEB_IMG_DIR, 0755, true);
    $name = preg_replace('/[^a-z0-9]/', '', $prefix) . '-' . bin2hex(random_bytes(4)) . '.jpg';
    if (!imagejpeg($dst, WEB_IMG_DIR . '/' . $name, 84)) throw new ShopError('Das Foto konnte nicht gespeichert werden.');
    return $name;
}
function web_delete_image(string $file): void {
    if ($file !== '' && preg_match('/^[a-z0-9]+-[0-9a-f]{8}\.jpg$/', $file)) @unlink(WEB_IMG_DIR . '/' . $file);
}
/* Hochgeladene Datei aus $_FILES – null, wenn nichts gewählt wurde */
function web_upload(string $field): ?string {
    $f = $_FILES[$field] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) throw new ShopError('Das Foto konnte nicht hochgeladen werden (zu groß?).');
    return $f['tmp_name'];
}

/* ---------- Adventskalender ---------- */
function advent_doors(): array {
    $rows = [];
    foreach (db()->query('SELECT * FROM advent_doors') as $r) $rows[(int)$r['day']] = $r;
    return $rows;
}
function advent_door_filled(?array $r): bool {
    if (!$r) return false;
    foreach (['title_da', 'title_de', 'title_en', 'text_da', 'text_de', 'text_en', 'image', 'code'] as $k) if (trim((string)$r[$k]) !== '') return true;
    return false;
}
/* Ein Türchen geht am jeweiligen Dezembertag um 0 Uhr (dänische Zeit) auf und bleibt bis zum 6. Januar offen. */
function advent_open(int $day, int $year, ?int $now = null): bool {
    $now ??= time();
    $from = mktime(0, 0, 0, 12, $day, $year);
    $until = mktime(0, 0, 0, 1, 7, $year + 1);
    return $now >= $from && $now < $until;
}
function advent_preview_token(array &$site): string {
    if (!preg_match('/^[0-9a-f]{24}$/', (string)$site['calendar']['preview'])) {
        $site['calendar']['preview'] = bin2hex(random_bytes(12));
        web_save($site);
    }
    return $site['calendar']['preview'];
}

/* ---------- Formular-Helfer für den Admin ---------- */
/* Drei Eingabefelder nebeneinander: Dänisch, Deutsch, Englisch */
function web_lang_fields(string $name, string $label, array $values, bool $area = false, int $max = 200, string $hint = ''): void {
    echo '<div class="langs"><div class="langs-label">' . h($label) . '</div><div class="langs-row">';
    foreach (WEB_LANGS as $l => $ln) {
        $v = h((string)($values[$l] ?? ''));
        $id = h($name . '_' . $l);
        echo '<label><span class="lang-tag">' . h($ln) . '</span>';
        echo $area ? '<textarea name="' . $id . '" maxlength="' . $max . '" rows="4">' . $v . '</textarea>'
                   : '<input name="' . $id . '" maxlength="' . $max . '" value="' . $v . '">';
        echo '</label>';
    }
    echo '</div>' . ($hint !== '' ? '<p class="hint">' . h($hint) . '</p>' : '') . '</div>';
}
