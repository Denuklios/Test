<?php
/**
 * Nachgebauter TikTok-Server für Tests (php -S … tests/mock_tiktok.php).
 * Zustand liegt in MOCK_STATE (JSON-Datei).
 */
declare(strict_types=1);
$stateFile = getenv('MOCK_STATE') ?: sys_get_temp_dir() . '/pw_mock.json';
$st = is_file($stateFile) ? json_decode(file_get_contents($stateFile), true) : [];
$st += ['calls' => [], 'uploads' => [], 'publishes' => [], 'token_n' => 0];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'];
$body = file_get_contents('php://input');
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$st['calls'][] = ['m' => $method, 'p' => $path, 'auth' => $auth, 'range' => $_SERVER['HTTP_CONTENT_RANGE'] ?? null, 'len' => strlen($body),
    'json' => json_decode($body, true), 'form' => ($method === 'POST' && str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'urlencoded')) ? (parse_str($body, $f) ?: $f) : null];

function out($d, int $code = 200): void { http_response_code($code); header('Content-Type: application/json'); echo json_encode($d); }
function ok($data): void { out(['data' => $data, 'error' => ['code' => 'ok', 'message' => '', 'log_id' => 'L1']]); }
function err(string $code, int $http = 400): void { out(['data' => new stdClass(), 'error' => ['code' => $code, 'message' => 'mock ' . $code, 'log_id' => 'L2']], $http); }

$validToken = fn() => preg_match('/^Bearer (at_\d+)$/', $auth, $m) && $m[1] === 'at_' . $st['token_n'];

switch (true) {
    case $path === '/v2/auth/authorize/':
        header('Location: ' . $_GET['redirect_uri'] . '?code=CODE123&state=' . $_GET['state']);
        break;
    case $path === '/v2/oauth/token/':
        parse_str($body, $f);
        if (($f['client_secret'] ?? '') !== 'secret') { out(['error' => 'invalid_client', 'error_description' => 'bad secret'], 401); break; }
        if (($f['grant_type'] ?? '') === 'authorization_code' && ($f['code'] ?? '') !== 'CODE123') { out(['error' => 'invalid_grant', 'error_description' => 'bad code'], 400); break; }
        if (($f['grant_type'] ?? '') === 'refresh_token' && ($f['refresh_token'] ?? '') !== 'rt_1') { out(['error' => 'invalid_grant', 'error_description' => 'bad rt'], 400); break; }
        $st['token_n']++;
        out(['access_token' => 'at_' . $st['token_n'], 'expires_in' => (int)(getenv('MOCK_EXPIRES') ?: 86400), 'open_id' => 'OPEN1', 'refresh_token' => 'rt_1',
            'refresh_expires_in' => 31536000, 'scope' => 'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload', 'token_type' => 'Bearer']);
        break;
    case $path === '/v2/user/info/':
        if (!$validToken()) { err('access_token_invalid', 401); break; }
        ok(['user' => ['open_id' => 'OPEN1', 'username' => 'testkanal', 'display_name' => 'Test Kanal', 'avatar_url' => '', 'follower_count' => 1234, 'following_count' => 5, 'likes_count' => 9999, 'video_count' => 42]]);
        break;
    case $path === '/v2/post/publish/creator_info/query/':
        if (!$validToken()) { err('access_token_invalid', 401); break; }
        ok(['creator_username' => 'testkanal', 'creator_nickname' => 'Test Kanal', 'privacy_level_options' => ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
            'comment_disabled' => false, 'duet_disabled' => false, 'stitch_disabled' => true, 'max_video_post_duration_sec' => 600]);
        break;
    case $path === '/v2/post/publish/video/init/' || $path === '/v2/post/publish/inbox/video/init/':
        if (!$validToken()) { err('access_token_invalid', 401); break; }
        $j = json_decode($body, true);
        if (str_contains($j['post_info']['title'] ?? '', 'SPAM')) { err('spam_risk_too_many_posts', 403); break; }
        if (str_contains($j['post_info']['title'] ?? '', 'RATELIMIT') && empty($st['rl_done'])) { $st['rl_done'] = 1; err('rate_limit_exceeded', 429); break; }
        $si = $j['source_info'];
        if ($si['source'] !== 'FILE_UPLOAD' || $si['total_chunk_count'] < 1) { err('invalid_params'); break; }
        $pid = 'v_pub_' . count($st['publishes']);
        $st['publishes'][$pid] = ['kind' => str_contains($path, 'inbox') ? 'inbox' : 'direct', 'init' => $j, 'received' => 0, 'size' => $si['video_size']];
        ok(['publish_id' => $pid, 'upload_url' => 'http://' . $_SERVER['HTTP_HOST'] . '/upload/' . $pid]);
        break;
    case $path === '/v2/post/publish/content/init/':
        if (!$validToken()) { err('access_token_invalid', 401); break; }
        $j = json_decode($body, true);
        foreach ($j['source_info']['photo_images'] as $u) { if (!preg_match('~/media/[a-f0-9]{32}\.(jpg|webp)$~', $u)) { err('invalid_params'); break 2; } }
        $pid = 'p_pub_' . count($st['publishes']);
        $st['publishes'][$pid] = ['kind' => $j['post_mode'] === 'DIRECT_POST' ? 'direct' : 'inbox', 'init' => $j, 'received' => 1, 'size' => 1];
        ok(['publish_id' => $pid]);
        break;
    case str_starts_with($path, '/upload/'):
        $pid = substr($path, 8);
        if (!isset($st['publishes'][$pid])) { http_response_code(404); break; }
        preg_match('~bytes (\d+)-(\d+)/(\d+)~', $_SERVER['HTTP_CONTENT_RANGE'] ?? '', $m);
        if (!$m || (int)$m[2] - (int)$m[1] + 1 !== strlen($body) || (int)$m[1] !== $st['publishes'][$pid]['received']) { http_response_code(400); echo 'bad range'; break; }
        $st['publishes'][$pid]['received'] += strlen($body);
        file_put_contents($stateFile . '.' . $pid, $body, FILE_APPEND);
        $st['publishes'][$pid]['chunks'] = ($st['publishes'][$pid]['chunks'] ?? 0) + 1;
        if ($st['publishes'][$pid]['received'] >= $st['publishes'][$pid]['size']) $st['publishes'][$pid]['md5'] = md5_file($stateFile . '.' . $pid);
        http_response_code($st['publishes'][$pid]['received'] >= $st['publishes'][$pid]['size'] ? 201 : 206);
        break;
    case $path === '/v2/post/publish/status/fetch/':
        if (!$validToken()) { err('access_token_invalid', 401); break; }
        $pid = json_decode($body, true)['publish_id'] ?? '';
        $p = $st['publishes'][$pid] ?? null;
        if (!$p) { err('invalid_publish_id'); break; }
        if ($p['received'] < $p['size']) ok(['status' => 'PROCESSING_UPLOAD']);
        elseif ($p['kind'] === 'inbox') ok(['status' => 'SEND_TO_USER_INBOX']);
        else ok(['status' => 'PUBLISH_COMPLETE', 'publicaly_available_post_id' => [7300000000000000001]]);
        break;
    case $path === '/v2/video/list/':
        if (!$validToken()) { err('access_token_invalid', 401); break; }
        $now = time();
        ok(['videos' => [
            ['id' => '1', 'title' => 'Video A', 'create_time' => $now - 86400, 'view_count' => 1000, 'like_count' => 100, 'comment_count' => 10, 'share_count' => 5, 'share_url' => 'https://x/1'],
            ['id' => '2', 'title' => 'Video B', 'create_time' => $now - 2 * 86400 + 3600, 'view_count' => 5000, 'like_count' => 300, 'comment_count' => 20, 'share_count' => 9, 'share_url' => 'https://x/2'],
        ], 'cursor' => 0, 'has_more' => false]);
        break;
    case $path === '/files/clip.mp4':
        header('Content-Type: video/mp4');
        echo "\x00\x00\x00\x18ftypmp42" . str_repeat('A', 3000);
        break;
    case $path === '/files/redirect':
        header('Location: /files/clip.mp4', true, 302);
        break;
    case $path === '/files/pic.png':
        $im = imagecreatetruecolor(40, 60); imagefill($im, 0, 0, imagecolorallocate($im, 200, 30, 60));
        header('Content-Type: image/png'); imagepng($im);
        break;
    default:
        http_response_code(404);
        echo 'not found';
}
unset($st['calls'][count($st['calls']) - 1]['form']);
file_put_contents($stateFile, json_encode($st));
