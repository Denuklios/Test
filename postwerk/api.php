<?php
/**
 * Postwerk – REST-API. Anmeldung per API-Schlüssel (Authorization: Bearer pw_…)
 * oder per angemeldeter Sitzung + X-CSRF-Header (Oberfläche).
 *
 * Aktionen (?action=…):
 *   GET  accounts                        verbundene TikTok-Konten
 *   POST upload            (multipart "file", optional "thumb")   → Video/Bild in einem Stück
 *   POST upload_start      {name,size,kind}                       → upload_id
 *   PUT  upload_chunk      ?upload_id=&offset=  (Rohdaten)        → received
 *   POST upload_finish     {upload_id,duration?,width?,height?,thumb?} → file_id
 *   GET  posts             ?status=&from=&to=
 *   GET  post              ?id=
 *   POST create            {…Beitrag…}
 *   POST update            {id, …}
 *   POST approve|cancel|now|retry  {id}
 *   POST delete            {id}
 *   GET  stats             ?account=&refresh=1
 *   POST tick                                                     → Zeitplan sofort ausführen
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';

$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$key = pp_request_key();
$keyRec = $key ? pp_key_check($key) : null;
$viaSession = false;
if (!$keyRec) {
    if (pp_logged_in() && ($method === 'GET' || pp_csrf_ok($_SERVER['HTTP_X_CSRF'] ?? null))) {
        $viaSession = true;
    } else {
        pp_json_out(['error' => 'Nicht angemeldet. API-Schlüssel als "Authorization: Bearer …" senden.'], 401);
        exit;
    }
}
$source = $viaSession ? 'ui' : (stripos((string)($keyRec['name'] ?? ''), 'claude') !== false ? 'claude' : 'api');

function body_json(): array
{
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($ct, 'application/json') !== false) {
        $j = json_decode((string)file_get_contents('php://input'), true);
        return is_array($j) ? $j : [];
    }
    return $_POST;
}

try {
    switch ($action) {
        case 'accounts':
            $out = [];
            foreach (tt_accounts() as $a) {
                $out[] = [
                    'open_id' => $a['open_id'], 'username' => $a['username'] ?? '', 'display_name' => $a['display_name'] ?? '',
                    'privacy_options' => $a['creator_info']['privacy_level_options'] ?? null,
                    'max_video_seconds' => $a['creator_info']['max_video_post_duration_sec'] ?? null,
                    'problem' => $a['auth_error'] ?? null,
                ];
            }
            pp_json_out(['accounts' => $out]);
            break;

        case 'upload':
            $f = $_FILES['file'] ?? null;
            if (!$f || $f['error'] !== UPLOAD_ERR_OK) {
                throw new PPError('Keine Datei empfangen (Feld "file"). Fehlercode ' . ($f['error'] ?? '–') . '. Große Dateien bitte mit upload_start/upload_chunk senden.');
            }
            $tmp = PP_DATA . '/uploads/' . pp_id('mp') . '.part';
            move_uploaded_file($f['tmp_name'], $tmp);
            if (@getimagesize($tmp)) {
                pp_json_out(['image' => pp_image_store($tmp)]);
                break;
            }
            $meta = ['duration' => $_POST['duration'] ?? null];
            if (!empty($_FILES['thumb']['tmp_name'])) $meta['thumb'] = (string)file_get_contents($_FILES['thumb']['tmp_name']);
            $v = pp_video_store($tmp, (string)$f['name'], $meta);
            pp_json_out(['file_id' => $v['id'], 'video' => $v]);
            break;

        case 'upload_start':
            $b = body_json();
            pp_json_out(pp_upload_start((string)($b['name'] ?? 'video.mp4'), (int)($b['size'] ?? 0), (string)($b['kind'] ?? 'video')));
            break;

        case 'upload_chunk':
            $data = (string)file_get_contents('php://input');
            if (strlen($data) > 16 * PP_MB) throw new PPError('Teil zu groß (max. 16 MB).');
            $got = pp_upload_chunk((string)($_GET['upload_id'] ?? ''), (int)($_GET['offset'] ?? 0), $data);
            pp_json_out(['received' => $got]);
            break;

        case 'upload_finish':
            $b = body_json();
            $r = pp_upload_finish((string)($b['upload_id'] ?? ''), $b);
            pp_json_out(isset($r['image']) ? $r : ['file_id' => $r['id'], 'video' => $r]);
            break;

        case 'posts':
            $list = [];
            $from = isset($_GET['from']) ? pp_parse_time($_GET['from']) : 0;
            $to = isset($_GET['to']) ? pp_parse_time($_GET['to']) : PHP_INT_MAX;
            foreach (pp_posts() as $p) {
                if (!empty($_GET['status']) && !in_array($p['status'], explode(',', (string)$_GET['status']), true)) continue;
                if ($p['publish_at'] < $from || $p['publish_at'] > $to) continue;
                $list[] = pp_post_public($p);
            }
            pp_json_out(['posts' => $list]);
            break;

        case 'post':
            $p = pp_post((string)($_GET['id'] ?? ''));
            if (!$p) throw new PPError('Beitrag nicht gefunden.');
            pp_json_out(['post' => pp_post_public($p)]);
            break;

        case 'create':
            if ($method !== 'POST') throw new PPError('POST erwartet.');
            $p = pp_post_create(body_json(), $source);
            pp_json_out(['post' => pp_post_public($p)], 201);
            break;

        case 'update':
            $b = body_json();
            pp_json_out(['post' => pp_post_public(pp_post_update((string)($b['id'] ?? ''), $b))]);
            break;

        case 'approve': case 'cancel': case 'now': case 'retry':
            if ($method !== 'POST') throw new PPError('POST erwartet.');
            $b = body_json();
            $p = pp_post_action((string)($b['id'] ?? $_GET['id'] ?? ''), $action);
            if ($action === 'now' || $action === 'retry') { pp_tick(50); $p = pp_post($p['id']); }
            pp_json_out(['post' => pp_post_public($p)]);
            break;

        case 'delete':
            if ($method !== 'POST') throw new PPError('POST erwartet.');
            $b = body_json();
            pp_post_delete((string)($b['id'] ?? ''));
            pp_json_out(['ok' => true]);
            break;

        case 'stats':
            $acc = tt_find_account($_GET['account'] ?? null);
            if (!$acc) throw new PPError('Kein TikTok-Konto verbunden.');
            if (!empty($_GET['refresh'])) { tt_refresh_profile($acc); pp_videos_cached($acc['open_id'], true); }
            $s = pp_stats_summary($acc['open_id']);
            pp_json_out(['account' => '@' . ($acc['username'] ?? ''), 'stats' => $s]);
            break;

        case 'tick':
            pp_json_out(pp_tick(50));
            break;

        default:
            pp_json_out(['error' => 'Unbekannte Aktion', 'actions' => ['accounts', 'upload', 'upload_start', 'upload_chunk', 'upload_finish', 'posts', 'post', 'create', 'update', 'approve', 'cancel', 'now', 'retry', 'delete', 'stats', 'tick']], 400);
    }
} catch (PPError | TikTokError | PPNetError $e) {
    pp_json_out(['error' => $e->getMessage()], 400);
} catch (Throwable $e) {
    pp_log('API-Fehler', ['err' => $e->getMessage(), 'at' => $e->getFile() . ':' . $e->getLine()]);
    pp_json_out(['error' => 'Interner Fehler: ' . $e->getMessage()], 500);
}
