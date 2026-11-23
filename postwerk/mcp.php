<?php
/**
 * Postwerk – MCP-Server (Streamable HTTP, JSON-Antworten) für Claude.
 * Adresse als eigenen Connector in claude.ai eintragen:
 *   https://deine-domain/postwerk/mcp.php?key=pw_…
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';

const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { http_response_code(204); exit; }
if ($method !== 'POST') {
    header('Allow: POST');
    pp_json_out(['error' => 'MCP-Endpunkt: bitte per POST (JSON-RPC) ansprechen.'], 405);
    exit;
}
$keyRec = pp_key_check(pp_request_key());
if (!$keyRec) {
    pp_json_out(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32001, 'message' => 'Ungültiger oder gesperrter Schlüssel']], 401);
    exit;
}

$raw = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($raw)) {
    pp_json_out(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32700, 'message' => 'Parse error']], 400);
    exit;
}
$batch = array_is_list($raw);
$msgs = $batch ? $raw : [$raw];
$replies = [];
foreach ($msgs as $m) {
    $r = mcp_handle(is_array($m) ? $m : []);
    if ($r !== null) $replies[] = $r;
}
if (!$replies) { http_response_code(202); exit; }
pp_json_out($batch ? $replies : $replies[0]);
pp_tick_in_background();

/* ------------------------------------------------------------------------ */

function mcp_handle(array $m): ?array
{
    $id = $m['id'] ?? null;
    $method = (string)($m['method'] ?? '');
    $params = is_array($m['params'] ?? null) ? $m['params'] : [];
    if (!array_key_exists('id', $m)) return null; // Benachrichtigung
    $ok = fn($result) => ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
    switch ($method) {
        case 'initialize':
            $v = (string)($params['protocolVersion'] ?? '');
            return $ok([
                'protocolVersion' => in_array($v, MCP_VERSIONS, true) ? $v : MCP_VERSIONS[1],
                'capabilities' => ['tools' => ['listChanged' => false]],
                'serverInfo' => ['name' => 'postwerk', 'title' => 'Postwerk TikTok-Planer', 'version' => PP_VERSION],
                'instructions' => mcp_instructions(),
            ]);
        case 'ping':
            return $ok(new stdClass());
        case 'tools/list':
            return $ok(['tools' => mcp_tools()]);
        case 'tools/call':
            $name = (string)($params['name'] ?? '');
            $args = is_array($params['arguments'] ?? null) ? $params['arguments'] : [];
            try {
                $res = mcp_call($name, $args);
                return $ok(['content' => [['type' => 'text', 'text' => json_encode($res, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)]], 'isError' => false]);
            } catch (Throwable $e) {
                if (!($e instanceof PPError || $e instanceof TikTokError || $e instanceof PPNetError)) {
                    pp_log('MCP-Fehler', ['tool' => $name, 'err' => $e->getMessage(), 'at' => $e->getFile() . ':' . $e->getLine()]);
                }
                return $ok(['content' => [['type' => 'text', 'text' => 'Fehler: ' . $e->getMessage()]], 'isError' => true]);
            }
        default:
            return ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => -32601, 'message' => 'Unbekannte Methode: ' . $method]];
    }
}

function mcp_instructions(): string
{
    return 'Postwerk plant und veröffentlicht TikTok-Beiträge direkt über die offizielle TikTok-Schnittstelle (ohne Metricool-Limit). '
        . 'Zeiten gelten in der Zeitzone ' . date_default_timezone_get() . ' (z. B. "2026-11-24 18:30"), "now" = sofort. '
        . 'Videos per video_url (öffentlicher Link, wird heruntergeladen) oder per file_id (vorher per REST-API hochgeladen, siehe upload_instructions). '
        . 'TikTok erlaubt über die Schnittstelle keinen ersten Kommentar. Der Zeitplan läuft per Cronjob jede Minute. '
        . 'Vor dem Veröffentlichen im Namen des Nutzers Inhalt und Zeitpunkt bestätigen lassen, sofern nicht anders vereinbart.';
}

function mcp_post_props(): array
{
    return [
        'account' => ['type' => 'string', 'description' => '@Benutzername oder open_id. Leer = erstes Konto.'],
        'caption' => ['type' => 'string', 'description' => 'Beschreibung inkl. Hashtags (Video: max. 2200 Zeichen).'],
        'publish_at' => ['type' => 'string', 'description' => 'Zeitpunkt, z. B. "2026-11-24 18:30" oder ISO 8601. "now" = sofort.'],
        'mode' => ['type' => 'string', 'enum' => ['direct', 'draft'], 'description' => 'direct = direkt veröffentlichen, draft = als Entwurf ins TikTok-Postfach (Nutzer stellt in der App fertig).'],
        'privacy' => ['type' => 'string', 'enum' => array_keys(PP_PRIVACY)],
        'is_aigc' => ['type' => 'boolean', 'description' => 'Als KI-generiert kennzeichnen.'],
        'disable_comment' => ['type' => 'boolean'],
        'disable_duet' => ['type' => 'boolean'],
        'disable_stitch' => ['type' => 'boolean'],
        'brand_content' => ['type' => 'boolean', 'description' => 'Bezahlte Partnerschaft (Marke eines Dritten).'],
        'brand_organic' => ['type' => 'boolean', 'description' => 'Werbung für die eigene Marke.'],
        'needs_review' => ['type' => 'boolean', 'description' => 'true = wartet auf Freigabe in der Oberfläche.'],
        'note' => ['type' => 'string', 'description' => 'Interne Notiz (wird nicht veröffentlicht).'],
    ];
}

function mcp_tools(): array
{
    $ro = ['readOnlyHint' => true, 'openWorldHint' => false];
    return [
        ['name' => 'list_accounts', 'title' => 'TikTok-Konten', 'description' => 'Verbundene TikTok-Konten mit erlaubten Sichtbarkeiten und maximaler Videolänge.',
            'inputSchema' => ['type' => 'object', 'properties' => new stdClass()], 'annotations' => $ro],
        ['name' => 'schedule_video', 'title' => 'Video planen', 'description' => 'Plant ein TikTok-Video (oder veröffentlicht sofort mit publish_at="now"). Video per video_url oder file_id.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'video_url' => ['type' => 'string', 'description' => 'Öffentlicher Link zur MP4/MOV/WebM-Datei.'],
                'file_id' => ['type' => 'string', 'description' => 'ID eines per API hochgeladenen Videos.'],
                'cover_image_url' => ['type' => 'string', 'description' => 'Optional: Vorschaubild für den Planer.'],
                'cover_ms' => ['type' => 'integer', 'description' => 'Titelbild: Zeitpunkt im Video in Millisekunden.'],
            ] + mcp_post_props(), 'required' => ['caption', 'publish_at']]],
        ['name' => 'schedule_photos', 'title' => 'Foto-Beitrag planen', 'description' => 'Plant einen TikTok-Foto-Beitrag (Karussell, 1–35 Bilder). Die Domain des Tools muss bei TikTok bestätigt sein.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'image_urls' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Öffentliche Links zu JPG/PNG/WebP.'],
                'title' => ['type' => 'string', 'description' => 'Titel (max. 90 Zeichen).'],
                'photo_cover_index' => ['type' => 'integer'],
            ] + mcp_post_props(), 'required' => ['image_urls', 'caption', 'publish_at']]],
        ['name' => 'list_posts', 'title' => 'Beiträge anzeigen', 'description' => 'Listet geplante und veröffentlichte Beiträge.',
            'inputSchema' => ['type' => 'object', 'properties' => [
                'status' => ['type' => 'string', 'description' => 'Komma-getrennt: ' . implode(',', array_keys(PP_STATUS))],
                'from' => ['type' => 'string'], 'to' => ['type' => 'string'],
                'limit' => ['type' => 'integer', 'description' => 'Standard 50'],
            ]], 'annotations' => $ro],
        ['name' => 'get_post', 'title' => 'Beitrag', 'description' => 'Details und Verlauf eines Beitrags.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => ['type' => 'string']], 'required' => ['id']], 'annotations' => $ro],
        ['name' => 'update_post', 'title' => 'Beitrag ändern', 'description' => 'Ändert einen noch nicht veröffentlichten Beitrag (Text, Zeit, Einstellungen, neues Video per video_url/file_id). Fehlgeschlagene werden dabei neu eingeplant.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => ['type' => 'string'], 'video_url' => ['type' => 'string'], 'file_id' => ['type' => 'string'], 'title' => ['type' => 'string']] + mcp_post_props(), 'required' => ['id']]],
        ['name' => 'post_action', 'title' => 'Beitrag steuern', 'description' => 'approve = freigeben, cancel = abbrechen, now = sofort veröffentlichen, retry = Fehlgeschlagenen erneut versuchen, delete = löschen.',
            'inputSchema' => ['type' => 'object', 'properties' => ['id' => ['type' => 'string'], 'action' => ['type' => 'string', 'enum' => ['approve', 'cancel', 'now', 'retry', 'delete']]], 'required' => ['id', 'action']],
            'annotations' => ['destructiveHint' => true]],
        ['name' => 'get_stats', 'title' => 'Statistik', 'description' => 'Follower, Likes, Entwicklung (7/30 Tage), Zahlen der letzten Videos und beste Uhrzeiten.',
            'inputSchema' => ['type' => 'object', 'properties' => ['account' => ['type' => 'string'], 'refresh' => ['type' => 'boolean'], 'videos' => ['type' => 'integer', 'description' => 'Wie viele Videos auflisten (Standard 15)']]], 'annotations' => $ro],
        ['name' => 'run_scheduler', 'title' => 'Zeitplan ausführen', 'description' => 'Führt den Zeitplan sofort aus (fällige Beiträge senden, Status abfragen).',
            'inputSchema' => ['type' => 'object', 'properties' => new stdClass()]],
        ['name' => 'upload_instructions', 'title' => 'Upload-Anleitung', 'description' => 'Wie man eine lokale Videodatei per curl hochlädt, um eine file_id zu bekommen.',
            'inputSchema' => ['type' => 'object', 'properties' => new stdClass()], 'annotations' => $ro],
    ];
}

function mcp_call(string $name, array $a): array
{
    switch ($name) {
        case 'list_accounts':
            $out = [];
            foreach (tt_accounts() as $x) {
                $out[] = ['username' => '@' . ($x['username'] ?? ''), 'name' => $x['display_name'] ?? '', 'open_id' => $x['open_id'],
                    'privacy_options' => $x['creator_info']['privacy_level_options'] ?? null,
                    'max_video_seconds' => $x['creator_info']['max_video_post_duration_sec'] ?? null,
                    'problem' => $x['auth_error'] ?? null];
            }
            return ['accounts' => $out, 'hint' => $out ? null : 'Noch kein Konto verbunden. In der Oberfläche unter "Konten" verbinden.'];

        case 'schedule_video':
            $a['type'] = 'video';
            $p = pp_post_create($a, 'claude');
            return ['created' => pp_post_public($p), 'warning' => mcp_day_warning($p)];

        case 'schedule_photos':
            $a['type'] = 'photo';
            $p = pp_post_create($a, 'claude');
            return ['created' => pp_post_public($p), 'warning' => mcp_day_warning($p)];

        case 'list_posts':
            $from = !empty($a['from']) ? pp_parse_time($a['from']) : 0;
            $to = !empty($a['to']) ? pp_parse_time($a['to']) : PHP_INT_MAX;
            $st = !empty($a['status']) ? explode(',', (string)$a['status']) : null;
            $list = [];
            foreach (pp_posts() as $p) {
                if ($st && !in_array($p['status'], $st, true)) continue;
                if ($p['publish_at'] < $from || $p['publish_at'] > $to) continue;
                $x = pp_post_public($p);
                unset($x['history']);
                $x['caption'] = mb_strimwidth($x['caption'], 0, 140, '…');
                $list[] = $x;
            }
            $limit = max(1, (int)($a['limit'] ?? 50));
            return ['count' => count($list), 'posts' => array_slice($list, -$limit)];

        case 'get_post':
            $p = pp_post((string)($a['id'] ?? ''));
            if (!$p) throw new PPError('Beitrag nicht gefunden.');
            return pp_post_public($p);

        case 'update_post':
            $id = (string)($a['id'] ?? '');
            unset($a['id']);
            return ['updated' => pp_post_public(pp_post_update($id, $a))];

        case 'post_action':
            $id = (string)($a['id'] ?? '');
            $act = (string)($a['action'] ?? '');
            if ($act === 'delete') { pp_post_delete($id); return ['deleted' => $id]; }
            $p = pp_post_action($id, $act);
            if (in_array($act, ['now', 'retry'], true)) { pp_tick(50); $p = pp_post($id); }
            return ['post' => pp_post_public($p)];

        case 'get_stats':
            $acc = tt_find_account($a['account'] ?? null);
            if (!$acc) throw new PPError('Kein TikTok-Konto verbunden.');
            if (!empty($a['refresh'])) { tt_refresh_profile($acc); pp_videos_cached($acc['open_id'], true); }
            $s = pp_stats_summary($acc['open_id']);
            $n = (int)($a['videos'] ?? 15);
            $s['videos'] = array_map(fn($v) => [
                'datum' => date('d.m.Y H:i', (int)($v['create_time'] ?? 0)),
                'titel' => mb_strimwidth((string)($v['title'] ?? $v['video_description'] ?? ''), 0, 90, '…'),
                'aufrufe' => $v['view_count'] ?? null, 'likes' => $v['like_count'] ?? null,
                'kommentare' => $v['comment_count'] ?? null, 'geteilt' => $v['share_count'] ?? null, 'link' => $v['share_url'] ?? null,
            ], array_slice($s['videos'] ?? [], 0, $n));
            $s['history'] = array_slice($s['history'], -30, null, true);
            return ['account' => '@' . ($acc['username'] ?? '')] + $s;

        case 'run_scheduler':
            return pp_tick(50);

        case 'upload_instructions':
            $base = pp_base_url();
            return [
                'kurz' => 'Kleine Dateien (bis ca. 60 MB): curl -H "Authorization: Bearer <API-Schlüssel>" -F "file=@video.mp4" -F "thumb=@cover.jpg" "' . $base . '/api.php?action=upload"  → {"file_id":"v…"}. Danach schedule_video mit file_id.',
                'gross' => [
                    '1) POST ' . $base . '/api.php?action=upload_start  JSON {"name":"video.mp4","size":<Bytes>}  → upload_id',
                    '2) PUT  ' . $base . '/api.php?action=upload_chunk&upload_id=<id>&offset=<Bytes bisher>  Rohdaten, je bis 8 MB',
                    '3) POST ' . $base . '/api.php?action=upload_finish  JSON {"upload_id":"<id>"}  → file_id',
                ],
                'hinweis' => 'Der API-Schlüssel ist derselbe wie im Connector-Link (Parameter key=). Alternativ ein Video über einen öffentlichen Link mit video_url übergeben.',
            ];
    }
    throw new PPError('Unbekanntes Werkzeug: ' . $name);
}

function mcp_day_warning(array $p): ?string
{
    $day = date('Y-m-d', $p['publish_at']);
    $n = 0;
    foreach (pp_posts() as $x) {
        if ($x['account'] === $p['account'] && date('Y-m-d', $x['publish_at']) === $day && !in_array($x['status'], ['canceled', 'failed'], true)) $n++;
    }
    $cap = (int)cfg('daily_cap', 15);
    return $n > $cap ? "Achtung: $n Beiträge am $day geplant. TikTok begrenzt Beiträge pro Tag über die Schnittstelle (ca. $cap)." : null;
}
