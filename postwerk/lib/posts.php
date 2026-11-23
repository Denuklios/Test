<?php
/**
 * Postwerk – Dateien, Beiträge, Veröffentlichen, Zeitplan.
 */
declare(strict_types=1);

const PP_STATUS = [
    'review' => 'Wartet auf Freigabe',
    'scheduled' => 'Geplant',
    'publishing' => 'Wird hochgeladen',
    'processing' => 'TikTok verarbeitet',
    'published' => 'Veröffentlicht',
    'inbox' => 'Im TikTok-Postfach',
    'failed' => 'Fehlgeschlagen',
    'canceled' => 'Abgebrochen',
];
const PP_PRIVACY = [
    'PUBLIC_TO_EVERYONE' => 'Öffentlich',
    'MUTUAL_FOLLOW_FRIENDS' => 'Freunde',
    'FOLLOWER_OF_CREATOR' => 'Follower',
    'SELF_ONLY' => 'Nur ich',
];
const PP_EDITABLE = ['review', 'scheduled', 'failed', 'canceled'];

/* ---------------------------------------------------------------- Dateien */

function pp_max_video_bytes(): int { return (int)cfg('max_video_mb', 1024) * PP_MB; }

function pp_video_path(string $fid): string
{
    if (!preg_match('/^v[a-f0-9]{16}$/', $fid)) throw new PPError('Ungültige Datei-ID: ' . $fid);
    return PP_DATA . '/videos/' . $fid;
}

function pp_video_meta(string $fid): ?array
{
    $f = pp_video_path($fid) . '.json';
    return is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
}

/** Erkennt das Videoformat an den ersten Bytes. */
function pp_sniff_video(string $path): ?string
{
    $h = (string)file_get_contents($path, false, null, 0, 16);
    if (strlen($h) >= 12 && substr($h, 4, 4) === 'ftyp') {
        return substr($h, 8, 2) === 'qt' ? 'video/quicktime' : 'video/mp4';
    }
    if (substr($h, 0, 4) === "\x1A\x45\xDF\xA3") return 'video/webm';
    return null;
}

/** Übernimmt eine fertige Videodatei in die Ablage. */
function pp_video_store(string $tmpPath, string $name, array $meta = [], bool $move = true): array
{
    $mime = pp_sniff_video($tmpPath);
    if (!$mime) { @unlink($tmpPath); throw new PPError('Das ist keine Videodatei (erlaubt: MP4, MOV, WebM).'); }
    $size = filesize($tmpPath);
    if ($size < 1024) { @unlink($tmpPath); throw new PPError('Videodatei ist leer oder beschädigt.'); }
    if ($size > pp_max_video_bytes()) { @unlink($tmpPath); throw new PPError('Video ist zu groß.'); }
    $fid = pp_id('v');
    $dest = pp_video_path($fid);
    $ok = $move ? @rename($tmpPath, $dest) : @copy($tmpPath, $dest);
    if (!$ok && $move) { $ok = @copy($tmpPath, $dest); @unlink($tmpPath); }
    if (!$ok) throw new PPError('Video konnte nicht gespeichert werden.');
    $info = [
        'id' => $fid, 'name' => mb_substr(basename($name) ?: 'video.mp4', 0, 120), 'size' => $size, 'mime' => $mime, 'created' => time(),
        'duration' => isset($meta['duration']) ? round((float)$meta['duration'], 2) : null,
        'width' => isset($meta['width']) ? (int)$meta['width'] : null,
        'height' => isset($meta['height']) ? (int)$meta['height'] : null,
        'thumb' => false,
    ];
    file_put_contents($dest . '.json', json_encode($info, JSON_UNESCAPED_UNICODE));
    if (!empty($meta['thumb'])) pp_video_set_thumb($fid, (string)$meta['thumb']);
    return pp_video_meta($fid);
}

/** Speichert ein Vorschaubild (data:-URL oder Rohdaten JPEG/PNG/WebP). */
function pp_video_set_thumb(string $fid, string $data): void
{
    if (str_starts_with($data, 'data:')) {
        $p = strpos($data, ',');
        $data = (string)base64_decode(substr($data, $p + 1), true);
    }
    if (strlen($data) < 100 || strlen($data) > 3 * PP_MB) return;
    $sig = substr($data, 0, 4);
    if (!($sig === "\xFF\xD8\xFF\xE0" || substr($data, 0, 3) === "\xFF\xD8\xFF" || $sig === "\x89PNG" || $sig === 'RIFF')) return;
    file_put_contents(pp_video_path($fid) . '.thumb', $data);
    $m = pp_video_meta($fid);
    if ($m) { $m['thumb'] = true; file_put_contents(pp_video_path($fid) . '.json', json_encode($m, JSON_UNESCAPED_UNICODE)); }
}

function pp_video_from_url(string $url, array $meta = []): array
{
    $tmp = PP_DATA . '/uploads/' . pp_id('dl') . '.part';
    $r = pp_download($url, $tmp, pp_max_video_bytes());
    $name = basename((string)parse_url($r['url'], PHP_URL_PATH)) ?: 'video.mp4';
    if (!empty($meta['cover_image_url'])) {
        try {
            $t = PP_DATA . '/uploads/' . pp_id('th') . '.part';
            pp_download((string)$meta['cover_image_url'], $t, 3 * PP_MB);
            $meta['thumb'] = (string)file_get_contents($t);
            @unlink($t);
        } catch (Throwable $e) { /* Vorschaubild ist optional */ }
    }
    return pp_video_store($tmp, $name, $meta);
}

function pp_video_delete(string $fid): void
{
    $p = pp_video_path($fid);
    foreach (['', '.json', '.thumb'] as $s) @unlink($p . $s);
}

/** Fotos liegen öffentlich unter media/, damit TikTok sie abholen kann (PULL_FROM_URL). */
function pp_image_store(string $tmpPath): string
{
    $info = @getimagesize($tmpPath);
    if (!$info) { @unlink($tmpPath); throw new PPError('Das ist kein Bild.'); }
    $id = bin2hex(random_bytes(16));
    if ($info[2] === IMAGETYPE_JPEG) {
        $ext = 'jpg';
        rename($tmpPath, PP_MEDIA . "/$id.$ext") || copy($tmpPath, PP_MEDIA . "/$id.$ext");
    } elseif ($info[2] === IMAGETYPE_WEBP) {
        $ext = 'webp';
        rename($tmpPath, PP_MEDIA . "/$id.$ext") || copy($tmpPath, PP_MEDIA . "/$id.$ext");
    } else {
        if (!function_exists('imagecreatefromstring')) throw new PPError('Bitte Fotos als JPG oder WebP hochladen.');
        $im = @imagecreatefromstring((string)file_get_contents($tmpPath));
        if (!$im) throw new PPError('Bild konnte nicht gelesen werden.');
        $ext = 'jpg';
        $w = imagesx($im); $hgt = imagesy($im);
        $bg = imagecreatetruecolor($w, $hgt);
        imagefill($bg, 0, 0, imagecolorallocate($bg, 255, 255, 255));
        imagecopy($bg, $im, 0, 0, 0, 0, $w, $hgt);
        imagejpeg($bg, PP_MEDIA . "/$id.$ext", 92);
    }
    @unlink($tmpPath);
    return "$id.$ext";
}

function pp_image_from_url(string $url): string
{
    $tmp = PP_DATA . '/uploads/' . pp_id('im') . '.part';
    pp_download($url, $tmp, 20 * PP_MB);
    return pp_image_store($tmp);
}

function pp_image_valid(string $name): bool
{
    return (bool)preg_match('/^[a-f0-9]{32}\.(jpg|webp)$/', $name) && is_file(PP_MEDIA . '/' . $name);
}

function pp_image_url(string $name): string { return pp_base_url() . '/media/' . $name; }

/* ---------------------------------------------------- Hochladen in Teilen */

function pp_upload_start(string $name, int $size, string $kind = 'video'): array
{
    $max = $kind === 'image' ? 20 * PP_MB : pp_max_video_bytes();
    if ($size <= 0 || $size > $max) throw new PPError('Datei ist zu groß oder leer (max. ' . round($max / PP_MB) . ' MB).');
    $uid = pp_id('u');
    file_put_contents(PP_DATA . "/uploads/$uid.json", json_encode(['name' => $name, 'size' => $size, 'kind' => $kind, 't' => time()]));
    touch(PP_DATA . "/uploads/$uid.part");
    return ['upload_id' => $uid, 'chunk_size' => 4 * PP_MB];
}

function pp_upload_meta(string $uid): array
{
    if (!preg_match('/^u[a-f0-9]{16}$/', $uid) || !is_file(PP_DATA . "/uploads/$uid.json")) throw new PPError('Upload nicht gefunden.');
    return json_decode((string)file_get_contents(PP_DATA . "/uploads/$uid.json"), true);
}

function pp_upload_chunk(string $uid, int $offset, string $data): int
{
    $m = pp_upload_meta($uid);
    $part = PP_DATA . "/uploads/$uid.part";
    clearstatcache(true, $part);
    $have = filesize($part);
    if ($offset !== $have) return $have; // Client setzt an der richtigen Stelle fort
    if ($have + strlen($data) > $m['size']) throw new PPError('Mehr Daten als angekündigt.');
    file_put_contents($part, $data, FILE_APPEND | LOCK_EX);
    clearstatcache(true, $part);
    return filesize($part);
}

/** @return array Video-Metadaten oder ['image' => name] */
function pp_upload_finish(string $uid, array $meta = []): array
{
    $m = pp_upload_meta($uid);
    $part = PP_DATA . "/uploads/$uid.part";
    clearstatcache(true, $part);
    if (filesize($part) !== (int)$m['size']) throw new PPError('Upload unvollständig (' . filesize($part) . ' von ' . $m['size'] . ' Bytes).');
    @unlink(PP_DATA . "/uploads/$uid.json");
    if ($m['kind'] === 'image') return ['image' => pp_image_store($part)];
    return pp_video_store($part, (string)$m['name'], $meta);
}

/* --------------------------------------------------------------- Beiträge */

function pp_posts(): array
{
    $p = db_read('posts');
    uasort($p, fn($a, $b) => ($a['publish_at'] <=> $b['publish_at']) ?: strcmp($a['id'], $b['id']));
    return $p;
}

function pp_post(string $id): ?array { return db_read('posts')[$id] ?? null; }

/** Ändert einen Beitrag atomar. $fn bekommt den Beitrag per Referenz; gibt sie false zurück, wird nichts gespeichert. */
function pp_post_patch(string $id, callable $fn): ?array
{
    return db_update('posts', function (array &$all) use ($id, $fn) {
        if (!isset($all[$id])) return null;
        $p = $all[$id];
        if ($fn($p) === false) return null;
        $p['updated_at'] = time();
        $all[$id] = $p;
        return $p;
    });
}

function pp_hist(array &$p, string $msg): void
{
    $p['history'][] = ['t' => time(), 'msg' => $msg];
    if (count($p['history']) > 40) $p['history'] = array_slice($p['history'], -40);
}

function pp_bool($v): bool
{
    if (is_bool($v)) return $v;
    return in_array(strtolower((string)$v), ['1', 'true', 'on', 'yes', 'ja'], true);
}

/**
 * Prüft und vereinheitlicht Eingaben für einen Beitrag (Formular, REST, MCP).
 * Lädt Videos/Fotos aus Links herunter.
 */
function pp_post_input(array $in, ?array $existing = null): array
{
    $p = $existing ?? [];
    $isNew = $existing === null;
    $type = $in['type'] ?? ($p['type'] ?? ((!empty($in['image_urls']) || !empty($in['images'])) ? 'photo' : 'video'));
    if (!in_array($type, ['video', 'photo'], true)) throw new PPError('Typ muss "video" oder "photo" sein.');
    $p['type'] = $type;

    if ($isNew || array_key_exists('account', $in)) {
        $acc = tt_find_account(isset($in['account']) ? (string)$in['account'] : null);
        if (!$acc && !empty($in['account'])) throw new PPError('TikTok-Konto "' . $in['account'] . '" ist nicht verbunden.');
        $p['account'] = $acc['open_id'] ?? null;
        $p['account_name'] = $acc ? ($acc['username'] ?? $acc['display_name'] ?? '') : '';
    }

    if ($type === 'video') {
        if (!empty($in['file_id'])) {
            $meta = pp_video_meta((string)$in['file_id']);
            if (!$meta || !is_file(pp_video_path((string)$in['file_id']))) throw new PPError('Videodatei ' . $in['file_id'] . ' nicht gefunden.');
            $p['file'] = $meta['id'];
        } elseif (!empty($in['video_url'])) {
            $meta = pp_video_from_url((string)$in['video_url'], ['cover_image_url' => $in['cover_image_url'] ?? null, 'duration' => $in['duration'] ?? null]);
            $p['file'] = $meta['id'];
            $p['source_url'] = (string)$in['video_url'];
        }
        if (empty($p['file'])) throw new PPError('Kein Video angegeben (file_id oder video_url).');
        $p['images'] = [];
    } else {
        $imgs = [];
        foreach ((array)($in['images'] ?? []) as $n) { if (pp_image_valid((string)$n)) $imgs[] = (string)$n; }
        foreach ((array)($in['image_urls'] ?? []) as $u) { $imgs[] = pp_image_from_url((string)$u); }
        if ($imgs || $isNew) $p['images'] = $imgs;
        if (count($p['images'] ?? []) < 1) throw new PPError('Für einen Foto-Beitrag mindestens ein Bild angeben.');
        if (count($p['images']) > 35) throw new PPError('Höchstens 35 Fotos pro Beitrag.');
        $p['file'] = null;
    }

    foreach (['caption', 'title', 'note'] as $k) {
        if (array_key_exists($k, $in)) $p[$k] = trim(str_replace("\r\n", "\n", (string)$in[$k]));
    }
    $p['caption'] = $p['caption'] ?? '';
    $p['title'] = $p['title'] ?? '';
    if ($type === 'video' && mb_strlen($p['caption']) > 2200) throw new PPError('Beschreibung ist zu lang (max. 2200 Zeichen).');
    if ($type === 'photo' && mb_strlen($p['caption']) > 4000) throw new PPError('Beschreibung ist zu lang (max. 4000 Zeichen).');
    if ($type === 'photo' && mb_strlen($p['title']) > 90) throw new PPError('Titel ist zu lang (max. 90 Zeichen).');

    if ($isNew || array_key_exists('publish_at', $in)) {
        $ts = pp_parse_time($in['publish_at'] ?? null);
        $p['publish_at'] = max($ts, $isNew ? time() : 0);
        if ($ts < time()) $p['publish_at'] = time();
    }

    $mode = $in['mode'] ?? ($p['mode'] ?? cfg('default_mode', 'direct'));
    if (!in_array($mode, ['direct', 'draft'], true)) throw new PPError('Modus muss "direct" oder "draft" sein.');
    $p['mode'] = $mode;

    $priv = $in['privacy'] ?? ($p['privacy'] ?? cfg('default_privacy', 'PUBLIC_TO_EVERYONE'));
    if (!isset(PP_PRIVACY[$priv])) throw new PPError('Sichtbarkeit unbekannt. Erlaubt: ' . implode(', ', array_keys(PP_PRIVACY)));
    $p['privacy'] = $priv;

    foreach (['disable_comment' => false, 'disable_duet' => false, 'disable_stitch' => false, 'brand_content' => false, 'brand_organic' => false, 'auto_music' => true] as $k => $def) {
        if (array_key_exists($k, $in)) $p[$k] = pp_bool($in[$k]);
        elseif (!isset($p[$k])) $p[$k] = $def;
    }
    if (array_key_exists('is_aigc', $in)) $p['is_aigc'] = pp_bool($in['is_aigc']);
    elseif (!isset($p['is_aigc'])) $p['is_aigc'] = (bool)cfg('default_aigc', false);
    if (array_key_exists('cover_ms', $in) && $in['cover_ms'] !== '' && $in['cover_ms'] !== null) $p['cover_ms'] = max(0, (int)$in['cover_ms']);
    if (array_key_exists('photo_cover_index', $in)) $p['photo_cover_index'] = max(0, (int)$in['photo_cover_index']);
    return $p;
}

function pp_post_create(array $in, string $source = 'ui'): array
{
    $p = pp_post_input($in);
    $needsReview = array_key_exists('needs_review', $in) ? pp_bool($in['needs_review'])
        : ($source !== 'ui' && cfg('review_external', false));
    $p['id'] = pp_id('p', 6);
    $p['status'] = $needsReview ? 'review' : 'scheduled';
    $p['source'] = $source;
    $p['created_at'] = time();
    $p['attempts'] = 0;
    $p['history'] = [];
    pp_hist($p, 'Angelegt (' . ['ui' => 'Oberfläche', 'api' => 'API', 'claude' => 'Claude'][$source] . ')' . ($needsReview ? ' – wartet auf Freigabe' : ''));
    db_update('posts', function (array &$all) use ($p) { $all[$p['id']] = $p; });
    return $p;
}

function pp_post_update(string $id, array $in): array
{
    $cur = pp_post($id);
    if (!$cur) throw new PPError('Beitrag nicht gefunden.');
    if (!in_array($cur['status'], PP_EDITABLE, true)) throw new PPError('Beitrag kann im Status "' . PP_STATUS[$cur['status']] . '" nicht mehr geändert werden.');
    $new = pp_post_input($in, $cur);
    return pp_post_patch($id, function (array &$p) use ($new, $in) {
        if (!in_array($p['status'], PP_EDITABLE, true)) return false;
        $old = $p['file'] ?? null;
        $p = array_merge($p, $new);
        if (in_array($p['status'], ['failed', 'canceled'], true)) {
            $p['status'] = 'scheduled'; $p['attempts'] = 0; $p['error'] = null; $p['next_try'] = null;
            pp_hist($p, 'Geändert und neu eingeplant');
        } else {
            pp_hist($p, 'Geändert');
        }
        if (!empty($in['needs_review']) && $p['status'] === 'scheduled') $p['status'] = 'review';
    }) ?? throw new PPError('Beitrag konnte nicht geändert werden.');
}

function pp_post_action(string $id, string $action): array
{
    $res = pp_post_patch($id, function (array &$p) use ($action) {
        switch ($action) {
            case 'approve':
                if ($p['status'] !== 'review') throw new PPError('Beitrag wartet nicht auf Freigabe.');
                $p['status'] = 'scheduled'; pp_hist($p, 'Freigegeben'); break;
            case 'cancel':
                if (!in_array($p['status'], ['review', 'scheduled', 'failed'], true)) throw new PPError('Nur geplante Beiträge können abgebrochen werden.');
                $p['status'] = 'canceled'; pp_hist($p, 'Abgebrochen'); break;
            case 'now':
                if (!in_array($p['status'], ['review', 'scheduled', 'failed', 'canceled'], true)) throw new PPError('Beitrag ist schon unterwegs oder veröffentlicht.');
                $p['status'] = 'scheduled'; $p['publish_at'] = time(); $p['next_try'] = null; $p['attempts'] = 0; $p['error'] = null;
                pp_hist($p, 'Sofort veröffentlichen'); break;
            case 'retry':
                if ($p['status'] !== 'failed') throw new PPError('Nur fehlgeschlagene Beiträge können wiederholt werden.');
                $p['status'] = 'scheduled'; $p['attempts'] = 0; $p['error'] = null; $p['next_try'] = null;
                if ($p['publish_at'] < time()) $p['publish_at'] = time();
                pp_hist($p, 'Erneuter Versuch'); break;
            default:
                throw new PPError('Unbekannte Aktion.');
        }
    });
    if (!$res) throw new PPError('Beitrag nicht gefunden.');
    return $res;
}

function pp_post_delete(string $id): void
{
    $p = pp_post($id);
    if (!$p) throw new PPError('Beitrag nicht gefunden.');
    if (in_array($p['status'], ['publishing', 'processing'], true)) throw new PPError('Beitrag wird gerade übertragen und kann nicht gelöscht werden.');
    db_update('posts', function (array &$all) use ($id) { unset($all[$id]); });
    $stillUsed = fn($k, $v) => array_filter(db_read('posts'), fn($x) => in_array($v, (array)($x[$k] ?? []), true) || ($x[$k] ?? null) === $v);
    if (!empty($p['file']) && !$stillUsed('file', $p['file'])) pp_video_delete($p['file']);
    foreach ((array)($p['images'] ?? []) as $img) { if (!$stillUsed('images', $img)) @unlink(PP_MEDIA . '/' . $img); }
}

/** Kurzfassung für API/MCP. */
function pp_post_public(array $p): array
{
    $meta = !empty($p['file']) ? pp_video_meta($p['file']) : null;
    return [
        'id' => $p['id'],
        'status' => $p['status'],
        'status_text' => PP_STATUS[$p['status']] ?? $p['status'],
        'type' => $p['type'],
        'mode' => $p['mode'],
        'account' => $p['account_name'] ? '@' . $p['account_name'] : ($p['account'] ?? null),
        'publish_at' => pp_iso($p['publish_at']),
        'caption' => $p['caption'],
        'title' => $p['title'] ?? '',
        'privacy' => $p['privacy'],
        'is_aigc' => $p['is_aigc'],
        'disable_comment' => $p['disable_comment'],
        'video' => $meta ? ['file_id' => $meta['id'], 'name' => $meta['name'], 'size_mb' => round($meta['size'] / PP_MB, 1), 'duration' => $meta['duration']] : null,
        'images' => array_map('pp_image_url', (array)($p['images'] ?? [])),
        'error' => $p['error'] ?? null,
        'tiktok_url' => $p['url'] ?? null,
        'source' => $p['source'] ?? null,
        'note' => $p['note'] ?? '',
        'history' => array_map(fn($h) => date('d.m. H:i', $h['t']) . ' ' . $h['msg'], array_slice($p['history'] ?? [], -6)),
    ];
}

/* ------------------------------------------------------- Veröffentlichen */

function pp_fail(string $id, string $msg, bool $retry, ?string $code = null): void
{
    pp_post_patch($id, function (array &$p) use ($msg, $retry, $code) {
        $p['error'] = $msg;
        $p['error_code'] = $code;
        if ($retry && $p['attempts'] < 5) {
            $p['status'] = 'scheduled';
            $p['next_try'] = time() + 120 * $p['attempts'] * $p['attempts'];
            pp_hist($p, 'Versuch ' . $p['attempts'] . ' fehlgeschlagen, neuer Versuch um ' . date('H:i', $p['next_try']) . ': ' . $msg);
        } else {
            $p['status'] = 'failed';
            pp_hist($p, 'Fehlgeschlagen: ' . $msg);
        }
    });
    pp_log('Beitrag fehlgeschlagen', ['id' => $id, 'msg' => $msg, 'retry' => $retry]);
}

function pp_publish(string $id): string
{
    $p = pp_post_patch($id, function (array &$p) {
        if ($p['status'] !== 'scheduled') return false;
        $p['status'] = 'publishing';
        $p['attempts'] = ($p['attempts'] ?? 0) + 1;
        $p['started_at'] = time();
    });
    if (!$p) return 'skip';
    try {
        if (empty($p['account'])) throw new PPError('Kein TikTok-Konto verbunden. Unter "Konten" verbinden.');
        $acc = tt_fresh_account($p['account']);
        $token = $acc['access_token'];
        $ci = tt_creator_info($acc);
        $privacy = $p['privacy'];
        $opts = (array)($ci['privacy_level_options'] ?? []);
        $note = '';
        if ($opts && !in_array($privacy, $opts, true) && $p['mode'] === 'direct') {
            throw new TikTokError('privacy_level_option_mismatch', tt_error_text('privacy_level_option_mismatch') . ' Erlaubt: ' . implode(', ', array_map(fn($o) => PP_PRIVACY[$o] ?? $o, $opts)));
        }
        if (cfg('unaudited', false) && $p['mode'] === 'direct' && $privacy !== 'SELF_ONLY') {
            $privacy = 'SELF_ONLY';
            $note = ' (privat, weil die TikTok-App noch nicht freigegeben ist)';
        }
        $common = [
            'privacy_level' => $privacy,
            'disable_comment' => $p['disable_comment'] || !empty($ci['comment_disabled']),
            'brand_content_toggle' => (bool)$p['brand_content'],
            'brand_organic_toggle' => (bool)$p['brand_organic'],
            'is_aigc' => (bool)$p['is_aigc'],
        ];

        if ($p['type'] === 'video') {
            $path = pp_video_path($p['file']);
            if (!is_file($path)) throw new PPError('Videodatei fehlt auf dem Server.');
            $meta = pp_video_meta($p['file']) ?? [];
            $maxDur = (int)($ci['max_video_post_duration_sec'] ?? 0);
            if ($maxDur && !empty($meta['duration']) && $meta['duration'] > $maxDur + 0.5) {
                throw new PPError('Video ist ' . round($meta['duration']) . ' s lang, das Konto erlaubt höchstens ' . $maxDur . ' s.');
            }
            $size = filesize($path);
            [$chunk, $count] = tt_chunk_plan($size);
            $source = ['source' => 'FILE_UPLOAD', 'video_size' => $size, 'chunk_size' => $chunk, 'total_chunk_count' => $count];
            if ($p['mode'] === 'draft') {
                $r = tt_call($token, 'POST', '/v2/post/publish/inbox/video/init/', ['source_info' => $source]);
            } else {
                $info = $common + [
                    'title' => $p['caption'],
                    'disable_duet' => $p['disable_duet'] || !empty($ci['duet_disabled']),
                    'disable_stitch' => $p['disable_stitch'] || !empty($ci['stitch_disabled']),
                ];
                if (isset($p['cover_ms'])) $info['video_cover_timestamp_ms'] = (int)$p['cover_ms'];
                $r = tt_call($token, 'POST', '/v2/post/publish/video/init/', ['post_info' => $info, 'source_info' => $source]);
            }
            $publishId = (string)($r['data']['publish_id'] ?? '');
            $uploadUrl = (string)($r['data']['upload_url'] ?? '');
            if ($publishId === '' || $uploadUrl === '') throw new TikTokError('invalid_response', 'Unerwartete Antwort von TikTok.');
            pp_post_patch($id, function (array &$x) use ($publishId) { $x['publish_id'] = $publishId; });
            tt_upload_file($uploadUrl, $path, $size, $chunk, $count, $meta['mime'] ?? 'video/mp4');
        } else {
            $info = $common + ['title' => $p['title'] ?? '', 'description' => $p['caption'], 'auto_add_music' => (bool)($p['auto_music'] ?? true)];
            $r = tt_call($token, 'POST', '/v2/post/publish/content/init/', [
                'post_info' => $info,
                'source_info' => [
                    'source' => 'PULL_FROM_URL',
                    'photo_cover_index' => min((int)($p['photo_cover_index'] ?? 0), count($p['images']) - 1),
                    'photo_images' => array_map('pp_image_url', $p['images']),
                ],
                'post_mode' => $p['mode'] === 'draft' ? 'MEDIA_UPLOAD' : 'DIRECT_POST',
                'media_type' => 'PHOTO',
            ]);
            $publishId = (string)($r['data']['publish_id'] ?? '');
            if ($publishId === '') throw new TikTokError('invalid_response', 'Unerwartete Antwort von TikTok.');
        }

        pp_post_patch($id, function (array &$x) use ($publishId, $note, $acc) {
            $x['status'] = 'processing';
            $x['publish_id'] = $publishId;
            $x['processing_since'] = time();
            $x['error'] = null;
            if (!empty($acc['username'])) $x['account_name'] = $acc['username'];
            pp_hist($x, 'An TikTok übergeben' . $note);
        });
        pp_log('Beitrag übergeben', ['id' => $id, 'publish_id' => $publishId]);
        return 'processing';
    } catch (TikTokError $e) {
        pp_fail($id, $e->getMessage(), $e->transient(), $e->tcode);
    } catch (PPNetError $e) {
        pp_fail($id, $e->getMessage(), true);
    } catch (Throwable $e) {
        pp_fail($id, $e->getMessage(), false);
    }
    return 'error';
}

function pp_poll(string $id): string
{
    $p = pp_post($id);
    if (!$p || empty($p['publish_id'])) return 'skip';
    try {
        $acc = tt_fresh_account($p['account']);
        $r = tt_call($acc['access_token'], 'POST', '/v2/post/publish/status/fetch/', ['publish_id' => $p['publish_id']]);
    } catch (TikTokError $e) {
        if (!$e->transient() && $p['status'] === 'processing') pp_fail($id, $e->getMessage(), false, $e->tcode);
        return 'error';
    } catch (Throwable $e) {
        return 'error';
    }
    $d = $r['data'] ?? [];
    $st = (string)($d['status'] ?? '');
    pp_post_patch($id, function (array &$x) use ($st, $d, $acc) {
        $x['last_poll'] = time();
        $x['tiktok_status'] = $st;
        if ($st === 'PUBLISH_COMPLETE') {
            $ids = (array)($d['publicaly_available_post_id'] ?? $d['publicly_available_post_id'] ?? []);
            $user = $acc['username'] ?? $x['account_name'] ?? '';
            if ($ids) {
                $x['tiktok_post_id'] = (string)$ids[0];
                $x['url'] = 'https://www.tiktok.com/@' . $user . '/' . ($x['type'] === 'photo' ? 'photo' : 'video') . '/' . $ids[0];
            } elseif ($user) {
                $x['url'] = 'https://www.tiktok.com/@' . $user;
            }
            $x['status'] = 'published';
            $x['published_at'] = time();
            pp_hist($x, 'Veröffentlicht');
        } elseif ($st === 'SEND_TO_USER_INBOX') {
            if ($x['status'] !== 'inbox') {
                $x['status'] = 'inbox';
                $x['inbox_at'] = time();
                pp_hist($x, 'Im TikTok-Postfach angekommen – in der TikTok-App fertigstellen');
            }
        } elseif ($st === 'FAILED') {
            $reason = (string)($d['fail_reason'] ?? 'unbekannt');
            $x['status'] = 'failed';
            $x['error'] = tt_error_text($reason, 'TikTok hat den Beitrag abgelehnt: ' . $reason);
            $x['error_code'] = $reason;
            pp_hist($x, 'Fehlgeschlagen: ' . $x['error']);
        } elseif ($x['status'] === 'processing' && time() - ($x['processing_since'] ?? time()) > 3 * 3600) {
            $x['status'] = 'failed';
            $x['error'] = 'TikTok hat nach 3 Stunden nicht bestätigt. Bitte in der TikTok-App nachsehen.';
            pp_hist($x, $x['error']);
        }
    });
    return $st;
}

/* --------------------------------------------------------------- Zeitplan */

/**
 * Ein Durchlauf: fällige Beiträge veröffentlichen, laufende abfragen, aufräumen.
 * Wird von cron.php, api.php?action=tick und nebenbei von Seitenaufrufen gestartet.
 */
function pp_tick(int $maxSeconds = 50): array
{
    $lock = fopen(PP_DATA . '/tick.lock', 'c');
    if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); return ['skipped' => 'läuft schon']; }
    $t0 = time();
    $out = ['published' => [], 'polled' => [], 'errors' => []];
    try {
        @set_time_limit(max(60, $maxSeconds + 30));
        ignore_user_abort(true);
        // Hängengebliebene Uploads (z. B. Abbruch durch Server-Zeitlimit) zurücksetzen
        foreach (pp_posts() as $p) {
            if ($p['status'] === 'publishing' && ($p['started_at'] ?? 0) < time() - 1800) {
                pp_fail($p['id'], 'Upload wurde unterbrochen.', true);
            }
        }
        foreach (pp_posts() as $p) {
            if (in_array($p['status'], ['processing'], true)
                || ($p['status'] === 'inbox' && ($p['inbox_at'] ?? 0) > time() - 3 * 86400 && ($p['last_poll'] ?? 0) < time() - 1800)) {
                $out['polled'][$p['id']] = pp_poll($p['id']);
            }
        }
        foreach (pp_posts() as $p) {
            if (time() - $t0 > $maxSeconds) break;
            if ($p['status'] === 'scheduled' && $p['publish_at'] <= time() && ($p['next_try'] ?? 0) <= time()) {
                $r = pp_publish($p['id']);
                $out[$r === 'processing' ? 'published' : 'errors'][] = $p['id'];
            }
        }
        if (time() - $t0 < $maxSeconds) pp_housekeeping();
        cfg_set(['last_tick' => time()]);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
    return $out;
}

function pp_housekeeping(): void
{
    // Tägliche Statistik
    $today = date('Y-m-d');
    $stats = db_read('stats');
    foreach (tt_accounts() as $a) {
        if (!isset($stats[$a['open_id']][$today]) && empty($a['auth_error'])) {
            try { tt_refresh_profile($a); } catch (Throwable $e) { pp_log('Statistik nicht abrufbar', ['err' => $e->getMessage()]); }
        }
    }
    if ((int)cfg('last_cleanup', 0) > time() - 3600) return;
    cfg_set(['last_cleanup' => time()]);
    // Alte Teil-Uploads löschen
    foreach (glob(PP_DATA . '/uploads/*') ?: [] as $f) { if (filemtime($f) < time() - 86400) @unlink($f); }
    // Videos veröffentlichter Beiträge nach X Tagen löschen
    $keep = (int)cfg('keep_days', 14);
    if ($keep > 0) {
        $used = [];
        foreach (pp_posts() as $p) {
            $done = in_array($p['status'], ['published', 'inbox'], true) && ($p['published_at'] ?? $p['inbox_at'] ?? time()) < time() - $keep * 86400;
            if (!empty($p['file'])) $used[$p['file']] = ($used[$p['file']] ?? true) && $done;
        }
        foreach ($used as $fid => $deletable) {
            if ($deletable && is_file(pp_video_path($fid))) {
                @unlink(pp_video_path($fid));
                pp_log('Video nach Veröffentlichung gelöscht', ['file' => $fid]);
            }
        }
        // Videos ohne Beitrag nach 7 Tagen löschen
        foreach (glob(PP_DATA . '/videos/v*.json') ?: [] as $mf) {
            $fid = basename($mf, '.json');
            if (!isset($used[$fid]) && filemtime($mf) < time() - 7 * 86400) pp_video_delete($fid);
        }
    }
}

/** Startet einen Durchlauf nach Auslieferung der Seite, falls der letzte über 60 s her ist. */
function pp_tick_in_background(): void
{
    if ((int)cfg('last_tick', 0) > time() - 60) return;
    register_shutdown_function(function () {
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        try { pp_tick(40); } catch (Throwable $e) { pp_log('Tick-Fehler', ['err' => $e->getMessage()]); }
    });
}
