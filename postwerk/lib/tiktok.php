<?php
/**
 * Postwerk – TikTok-Anbindung (Login Kit + Content Posting API + Display API).
 */
declare(strict_types=1);

class TikTokError extends RuntimeException
{
    public string $tcode;
    public int $http;
    public string $logId;

    public function __construct(string $code, string $message, int $http = 0, string $logId = '')
    {
        parent::__construct($message);
        $this->tcode = $code;
        $this->http = $http;
        $this->logId = $logId;
    }

    public function transient(): bool
    {
        return in_array($this->tcode, ['rate_limit_exceeded', 'internal_error', 'server_error', 'temporarily_unavailable'], true)
            || $this->http >= 500 || $this->http === 429;
    }
}

const TT_DEFAULT_SCOPES = 'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload';

function tt_api_base(): string { return rtrim((string)cfg('api_base', 'https://open.tiktokapis.com'), '/'); }
function tt_auth_base(): string { return rtrim((string)cfg('auth_base', 'https://www.tiktok.com'), '/'); }
function tt_redirect_uri(): string { return pp_base_url() . '/oauth.php'; }
function tt_configured(): bool { return cfg('client_key') && cfg('client_secret'); }

/** Verständliche deutsche Meldungen zu den häufigsten TikTok-Fehlercodes. */
function tt_error_text(string $code, string $fallback = ''): string
{
    $m = [
        'spam_risk_too_many_posts' => 'TikTok-Tageslimit erreicht: Über die Schnittstelle sind nur begrenzt viele Beiträge pro Tag erlaubt. Später erneut planen.',
        'spam_risk_user_banned_from_posting' => 'TikTok hat das Posten für dieses Konto vorübergehend gesperrt.',
        'spam_risk_too_many_pending_share' => 'Zu viele unfertige Entwürfe im TikTok-Postfach. Bitte erst einige in der App veröffentlichen oder löschen.',
        'spam_risk' => 'TikTok hat den Beitrag als Spam-Risiko abgelehnt.',
        'reached_active_user_cap' => 'Die TikTok-App hat ihr Tageslimit an aktiven Nutzern erreicht. Morgen erneut versuchen.',
        'unaudited_client_can_only_post_to_private_accounts' => 'Die TikTok-App ist noch nicht freigegeben (Audit). Bis dahin geht Direkt-Posten nur privat ("Nur ich") und nur bei privatem Konto. Lösung: Modus "Entwurf ins TikTok-Postfach" nutzen oder das Audit beantragen.',
        'privacy_level_option_mismatch' => 'Diese Sichtbarkeit ist für das Konto nicht erlaubt. Bitte eine andere Sichtbarkeit wählen.',
        'url_ownership_unverified' => 'Die Domain ist bei TikTok nicht bestätigt. Im TikTok-Entwicklerportal unter "URL properties" die Domain dieses Tools bestätigen.',
        'access_token_invalid' => 'Die TikTok-Anmeldung ist abgelaufen. Unter "Konten" neu verbinden.',
        'scope_not_authorized' => 'Dem Konto fehlt eine Berechtigung. Unter "Konten" neu verbinden und alle Häkchen erlauben.',
        'scope_permission_missed' => 'Dem Konto fehlt eine Berechtigung. Unter "Konten" neu verbinden und alle Häkchen erlauben.',
        'rate_limit_exceeded' => 'Zu viele Anfragen an TikTok. Wird automatisch wiederholt.',
        'file_format_check_failed' => 'Dateiformat wird von TikTok nicht unterstützt (erlaubt: MP4, MOV, WebM).',
        'duration_check_failed' => 'Das Video ist zu lang oder zu kurz für dieses Konto.',
        'frame_rate_check_failed' => 'Bildrate wird nicht unterstützt (23–60 fps).',
        'picture_size_check_failed' => 'Bildgröße wird nicht unterstützt (max. 1080p, mind. 360 px).',
        'video_pull_failed' => 'TikTok konnte das Video nicht abrufen.',
        'photo_pull_failed' => 'TikTok konnte die Fotos nicht abrufen. Ist die Domain bestätigt und öffentlich erreichbar?',
        'internal_error' => 'Interner Fehler bei TikTok. Wird automatisch wiederholt.',
        'invalid_params' => 'TikTok hat ungültige Angaben gemeldet.',
        'invalid_file_upload' => 'Die Datei wurde von TikTok nicht angenommen.',
        'auth_removed' => 'Der Zugriff wurde in der TikTok-App entzogen. Unter "Konten" neu verbinden.',
        'publish_cancelled' => 'Der Beitrag wurde abgebrochen.',
    ];
    return $m[$code] ?? ($fallback !== '' ? $fallback : $code);
}

/** Ruft die TikTok-API auf und wirft TikTokError bei Fehlern. */
function tt_call(string $token, string $method, string $path, $json = null): array
{
    $headers = ['Authorization: Bearer ' . $token];
    $body = null;
    if ($json !== null) {
        $headers[] = 'Content-Type: application/json; charset=UTF-8';
        $body = json_encode($json, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    $r = pp_http($method, tt_api_base() . $path, $headers, $body);
    $j = is_array($r['json']) ? $r['json'] : [];
    $err = $j['error'] ?? null;
    $code = is_array($err) ? (string)($err['code'] ?? '') : (is_string($err) ? $err : '');
    if ($r['status'] >= 400 || ($code !== '' && $code !== 'ok')) {
        $code = $code !== '' && $code !== 'ok' ? $code : 'http_' . $r['status'];
        $msg = is_array($err) ? (string)($err['message'] ?? '') : (string)($j['error_description'] ?? '');
        $logId = is_array($err) ? (string)($err['log_id'] ?? '') : '';
        pp_log('TikTok-Fehler', ['path' => $path, 'code' => $code, 'msg' => $msg, 'log_id' => $logId, 'http' => $r['status']]);
        throw new TikTokError($code, tt_error_text($code, $msg), $r['status'], $logId);
    }
    return $j;
}

/* ------------------------------------------------------------- OAuth/Konten */

function tt_auth_url(string $state): string
{
    $q = http_build_query([
        'client_key' => cfg('client_key'),
        'scope' => cfg('scopes', TT_DEFAULT_SCOPES),
        'response_type' => 'code',
        'redirect_uri' => tt_redirect_uri(),
        'state' => $state,
        'disable_auto_auth' => 1,
    ]);
    return tt_auth_base() . '/v2/auth/authorize/?' . $q;
}

function tt_token_request(array $params): array
{
    $params = array_merge(['client_key' => cfg('client_key'), 'client_secret' => cfg('client_secret')], $params);
    $r = pp_http('POST', tt_api_base() . '/v2/oauth/token/', ['Content-Type: application/x-www-form-urlencoded', 'Cache-Control: no-cache'], http_build_query($params));
    $j = is_array($r['json']) ? $r['json'] : [];
    if (empty($j['access_token'])) {
        $code = (string)($j['error'] ?? ('http_' . $r['status']));
        pp_log('Token-Fehler', ['code' => $code, 'desc' => $j['error_description'] ?? '', 'http' => $r['status']]);
        throw new TikTokError($code, 'TikTok-Anmeldung fehlgeschlagen: ' . ($j['error_description'] ?? $code), $r['status']);
    }
    return $j;
}

function tt_store_token(array $tok, array $extra = []): array
{
    $openId = (string)$tok['open_id'];
    return db_update('accounts', function (array &$a) use ($tok, $openId, $extra) {
        $acc = $a[$openId] ?? ['open_id' => $openId, 'connected_at' => time()];
        $acc['access_token'] = $tok['access_token'];
        $acc['expires_at'] = time() + (int)($tok['expires_in'] ?? 86400);
        if (!empty($tok['refresh_token'])) {
            $acc['refresh_token'] = $tok['refresh_token'];
            $acc['refresh_expires_at'] = time() + (int)($tok['refresh_expires_in'] ?? 31536000);
        }
        if (!empty($tok['scope'])) $acc['scope'] = $tok['scope'];
        $acc = array_merge($acc, $extra);
        unset($acc['auth_error']);
        $a[$openId] = $acc;
        return $acc;
    });
}

function tt_exchange_code(string $code): array
{
    $tok = tt_token_request(['code' => $code, 'grant_type' => 'authorization_code', 'redirect_uri' => tt_redirect_uri()]);
    $acc = tt_store_token($tok);
    try {
        tt_refresh_profile($acc);
    } catch (Throwable $e) {
        pp_log('Profil konnte nicht geladen werden', ['err' => $e->getMessage()]);
    }
    return db_read('accounts')[$acc['open_id']];
}

function tt_accounts(): array
{
    $a = db_read('accounts');
    uasort($a, fn($x, $y) => ($x['connected_at'] ?? 0) <=> ($y['connected_at'] ?? 0));
    return $a;
}

/** Findet ein Konto per open_id oder @Benutzername; ohne Angabe das erste. */
function tt_find_account(?string $ref): ?array
{
    $all = tt_accounts();
    if ($ref === null || $ref === '') return $all ? reset($all) : null;
    $ref = ltrim($ref, '@');
    foreach ($all as $a) {
        if ($a['open_id'] === $ref || strcasecmp((string)($a['username'] ?? ''), $ref) === 0) return $a;
    }
    return null;
}

/** Liefert das Konto mit gültigem Zugangsschlüssel (erneuert ihn bei Bedarf). */
function tt_fresh_account(string $openId): array
{
    $acc = db_read('accounts')[$openId] ?? null;
    if (!$acc) throw new PPError('TikTok-Konto ist nicht (mehr) verbunden. Unter "Konten" verbinden.');
    if (($acc['expires_at'] ?? 0) > time() + 300) return $acc;
    if (empty($acc['refresh_token']) || ($acc['refresh_expires_at'] ?? 0) < time()) {
        throw new TikTokError('access_token_invalid', tt_error_text('access_token_invalid'));
    }
    try {
        $tok = tt_token_request(['grant_type' => 'refresh_token', 'refresh_token' => $acc['refresh_token']]);
    } catch (TikTokError $e) {
        db_update('accounts', function (array &$a) use ($openId, $e) { if (isset($a[$openId])) $a[$openId]['auth_error'] = $e->getMessage(); });
        throw new TikTokError('access_token_invalid', tt_error_text('access_token_invalid'), $e->http);
    }
    $tok['open_id'] = $tok['open_id'] ?? $openId;
    return tt_store_token($tok);
}

function tt_user_info(array $acc, bool $stats = true): array
{
    $fields = 'open_id,union_id,avatar_url,display_name,username,profile_deep_link,bio_description,is_verified';
    if ($stats) $fields .= ',follower_count,following_count,likes_count,video_count';
    $j = tt_call($acc['access_token'], 'GET', '/v2/user/info/?fields=' . $fields);
    return $j['data']['user'] ?? [];
}

function tt_refresh_profile(array $acc): array
{
    $acc = tt_fresh_account($acc['open_id']);
    $scope = (string)($acc['scope'] ?? cfg('scopes', TT_DEFAULT_SCOPES));
    $u = tt_user_info($acc, str_contains($scope, 'user.info.stats'));
    $extra = [
        'username' => $u['username'] ?? ($acc['username'] ?? ''),
        'display_name' => $u['display_name'] ?? ($acc['display_name'] ?? ''),
        'avatar' => $u['avatar_url'] ?? ($acc['avatar'] ?? ''),
        'profile_at' => time(),
    ];
    db_update('accounts', function (array &$a) use ($acc, $extra) { $a[$acc['open_id']] = array_merge($a[$acc['open_id']], $extra); });
    if (isset($u['follower_count'])) pp_stats_record($acc['open_id'], $u);
    try { tt_creator_info($acc); } catch (Throwable $e) { /* nicht kritisch */ }
    return $u;
}

function tt_creator_info(array $acc): array
{
    $j = tt_call($acc['access_token'], 'POST', '/v2/post/publish/creator_info/query/', new stdClass());
    $ci = $j['data'] ?? [];
    db_update('accounts', function (array &$a) use ($acc, $ci) {
        if (isset($a[$acc['open_id']])) { $a[$acc['open_id']]['creator_info'] = $ci; $a[$acc['open_id']]['creator_info_at'] = time(); }
    });
    return $ci;
}

function tt_disconnect(string $openId): void
{
    $acc = db_read('accounts')[$openId] ?? null;
    if ($acc && !empty($acc['access_token'])) {
        try {
            pp_http('POST', tt_api_base() . '/v2/oauth/revoke/', ['Content-Type: application/x-www-form-urlencoded'],
                http_build_query(['client_key' => cfg('client_key'), 'client_secret' => cfg('client_secret'), 'token' => $acc['access_token']]));
        } catch (Throwable $e) { /* egal */ }
    }
    db_update('accounts', function (array &$a) use ($openId) { unset($a[$openId]); });
}

/* ------------------------------------------------------------ Hochladen */

/** Lädt eine Datei in Teilen (gestreamt, wenig Speicher) an die Upload-Adresse von TikTok. */
function tt_upload_file(string $uploadUrl, string $path, int $size, int $chunkSize, int $chunks, string $mime): void
{
    for ($i = 0; $i < $chunks; $i++) {
        $start = $i * $chunkSize;
        $len = ($i === $chunks - 1) ? $size - $start : $chunkSize;
        $end = $start + $len - 1;
        $fh = fopen($path, 'rb');
        fseek($fh, $start);
        $left = $len;
        $r = pp_http('PUT', $uploadUrl, [
            'Content-Type: ' . $mime,
            'Content-Length: ' . $len,
            "Content-Range: bytes $start-$end/$size",
        ], null, [
            CURLOPT_UPLOAD => true,
            CURLOPT_INFILESIZE => $len,
            CURLOPT_TIMEOUT => 900,
            CURLOPT_READFUNCTION => function ($ch, $fd, $want) use ($fh, &$left) {
                if ($left <= 0) return '';
                $d = fread($fh, min($want, $left));
                $left -= strlen((string)$d);
                return (string)$d;
            },
        ]);
        fclose($fh);
        if ($r['status'] >= 300) {
            throw new TikTokError('upload_failed', 'Hochladen zu TikTok fehlgeschlagen (Teil ' . ($i + 1) . '/' . $chunks . ', HTTP ' . $r['status'] . ').', $r['status']);
        }
    }
}

/** Teilt nach TikTok-Regeln: bis 64 MB am Stück, sonst 32-MB-Teile (letzter Teil nimmt den Rest). */
function tt_chunk_plan(int $size): array
{
    if ($size <= 64 * PP_MB) return [$size, 1];
    $chunk = 32 * PP_MB;
    return [$chunk, intdiv($size, $chunk)];
}

/* -------------------------------------------------------------- Statistik */

function pp_stats_record(string $openId, array $u): void
{
    $day = date('Y-m-d');
    db_update('stats', function (array &$s) use ($openId, $u, $day) {
        $s[$openId][$day] = [
            'followers' => (int)($u['follower_count'] ?? 0),
            'following' => (int)($u['following_count'] ?? 0),
            'likes' => (int)($u['likes_count'] ?? 0),
            'videos' => (int)($u['video_count'] ?? 0),
            't' => time(),
        ];
        ksort($s[$openId]);
        if (count($s[$openId]) > 800) $s[$openId] = array_slice($s[$openId], -800, null, true);
    });
}

function tt_video_list(array $acc, int $max = 60): array
{
    $fields = 'id,title,video_description,create_time,cover_image_url,share_url,duration,view_count,like_count,comment_count,share_count';
    $out = [];
    $cursor = null;
    while (count($out) < $max) {
        $body = ['max_count' => 20];
        if ($cursor !== null) $body['cursor'] = $cursor;
        $j = tt_call($acc['access_token'], 'POST', '/v2/video/list/?fields=' . $fields, $body);
        $vids = $j['data']['videos'] ?? [];
        foreach ($vids as $v) $out[] = $v;
        if (empty($j['data']['has_more']) || !$vids) break;
        $cursor = $j['data']['cursor'] ?? null;
    }
    return $out;
}

/** Videos mit Zahlen, 20 Minuten zwischengespeichert. */
function pp_videos_cached(string $openId, bool $force = false): array
{
    $f = PP_DATA . '/cache/videos_' . preg_replace('/[^a-z0-9_\-]/i', '', $openId) . '.json';
    if (!$force && is_file($f) && filemtime($f) > time() - 1200) {
        return json_decode((string)file_get_contents($f), true) ?: [];
    }
    $acc = tt_fresh_account($openId);
    $vids = tt_video_list($acc);
    file_put_contents($f, json_encode($vids, JSON_UNESCAPED_UNICODE));
    return $vids;
}

/** Beste Uhrzeiten: Durchschnitt der Aufrufe je Stunde/Wochentag der eigenen Videos. */
function pp_best_times(array $videos): array
{
    $byHour = array_fill(0, 24, ['n' => 0, 'views' => 0]);
    $byDay = array_fill(1, 7, ['n' => 0, 'views' => 0]);
    foreach ($videos as $v) {
        if (empty($v['create_time'])) continue;
        $h = (int)date('G', (int)$v['create_time']);
        $d = (int)date('N', (int)$v['create_time']);
        $byHour[$h]['n']++; $byHour[$h]['views'] += (int)($v['view_count'] ?? 0);
        $byDay[$d]['n']++; $byDay[$d]['views'] += (int)($v['view_count'] ?? 0);
    }
    $hours = [];
    foreach ($byHour as $h => $x) $hours[$h] = ['videos' => $x['n'], 'avg_views' => $x['n'] ? (int)round($x['views'] / $x['n']) : 0];
    $days = [];
    $names = [1 => 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    foreach ($byDay as $d => $x) $days[$names[$d]] = ['videos' => $x['n'], 'avg_views' => $x['n'] ? (int)round($x['views'] / $x['n']) : 0];
    $rank = $hours;
    uasort($rank, fn($a, $b) => $b['avg_views'] <=> $a['avg_views']);
    $top = [];
    foreach ($rank as $h => $x) { if ($x['videos'] > 0 && count($top) < 3) $top[] = sprintf('%02d:00', $h); }
    return ['hours' => $hours, 'weekdays' => $days, 'top_hours' => $top, 'based_on_videos' => count($videos)];
}

function pp_stats_summary(string $openId, bool $withVideos = true): array
{
    $hist = db_read('stats')[$openId] ?? [];
    $days = array_keys($hist);
    $last = $hist ? end($hist) : null;
    $delta = function (int $n) use ($hist, $last) {
        if (!$last) return null;
        $target = date('Y-m-d', strtotime("-$n days"));
        $base = null;
        foreach ($hist as $d => $v) { if ($d <= $target) $base = $v; }
        if (!$base) $base = reset($hist);
        return ['followers' => $last['followers'] - $base['followers'], 'likes' => $last['likes'] - $base['likes'], 'videos' => $last['videos'] - $base['videos']];
    };
    $out = ['current' => $last, 'change_7d' => $delta(7), 'change_30d' => $delta(30), 'history' => $hist, 'first_day' => $days[0] ?? null];
    if ($withVideos) {
        try {
            $vids = pp_videos_cached($openId);
            $tot = ['views' => 0, 'likes' => 0, 'comments' => 0, 'shares' => 0];
            foreach ($vids as $v) {
                $tot['views'] += (int)($v['view_count'] ?? 0);
                $tot['likes'] += (int)($v['like_count'] ?? 0);
                $tot['comments'] += (int)($v['comment_count'] ?? 0);
                $tot['shares'] += (int)($v['share_count'] ?? 0);
            }
            $out['videos'] = $vids;
            $out['video_totals'] = $tot;
            $out['engagement_rate'] = $tot['views'] ? round(($tot['likes'] + $tot['comments'] + $tot['shares']) / $tot['views'] * 100, 2) : null;
            $out['best_times'] = pp_best_times($vids);
        } catch (Throwable $e) {
            $out['videos_error'] = $e->getMessage();
        }
    }
    return $out;
}
