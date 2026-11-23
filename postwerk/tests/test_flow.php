<?php
/**
 * Ende-zu-Ende-Test: startet Postwerk und einen nachgebauten TikTok-Server,
 * richtet ein, verbindet ein Konto, lädt Videos/Fotos hoch, plant per REST und MCP,
 * veröffentlicht und prüft die Daten, die bei "TikTok" ankommen.
 *   php tests/test_flow.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$tmp = sys_get_temp_dir() . '/pw_test_' . getmypid();
@mkdir($tmp);
$data = "$tmp/data"; $media = "$tmp/media";
$state = "$tmp/mock.json";
$appPort = 18000 + random_int(0, 900); $mockPort = $appPort + 1000;
$app = "http://127.0.0.1:$appPort";
$mock = "http://127.0.0.1:$mockPort";
putenv('NO_PROXY=127.0.0.1,localhost'); putenv('no_proxy=127.0.0.1,localhost');

$env = array_merge(getenv(), [
    'PP_DATA_DIR' => $data, 'PP_MEDIA_DIR' => $media, 'PP_API_BASE' => $mock, 'PP_AUTH_BASE' => $mock, 'PP_BASE_URL' => $app,
    'PP_ALLOW_PRIVATE_URLS' => '1', 'MOCK_STATE' => $state, 'NO_PROXY' => '127.0.0.1,localhost', 'no_proxy' => '127.0.0.1,localhost',
]);
// media/ muss unter dem App-Ordner liegen, damit der eingebaute Server Fotos ausliefert -> Router
$router = "$tmp/router.php";
file_put_contents($router, '<?php $p = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);'
    . 'if (str_starts_with($p, "/media/")) { $f = getenv("PP_MEDIA_DIR") . "/" . basename($p); if (is_file($f)) { header("Content-Type: image/jpeg"); readfile($f); return true; } http_response_code(404); return true; }'
    . 'return false;');
$procs = [];
$procs[] = proc_open(['php', '-d', 'upload_max_filesize=100M', '-d', 'post_max_size=100M', '-S', "127.0.0.1:$appPort", '-t', $root, $router], [1 => ['file', "$tmp/app.log", 'a'], 2 => ['file', "$tmp/app.log", 'a']], $pp, $root, $env);
$procs[] = proc_open(['php', '-S', "127.0.0.1:$mockPort", __DIR__ . '/mock_tiktok.php'], [1 => ['file', "$tmp/mock.log", 'a'], 2 => ['file', "$tmp/mock.log", 'a']], $pp, __DIR__, $env);
register_shutdown_function(function () use ($procs, $tmp) {
    foreach ($procs as $p) { proc_terminate($p); }
    if (!getenv('KEEP')) exec('rm -rf ' . escapeshellarg($tmp));
});
usleep(700000);

$fails = 0; $n = 0;
function check(bool $c, string $what, $extra = null): void
{
    global $fails, $n;
    $n++;
    echo ($c ? "  ok  " : "  FEHLER  ") . $what . ($c || $extra === null ? '' : '  → ' . (is_string($extra) ? $extra : json_encode($extra, JSON_UNESCAPED_UNICODE))) . "\n";
    if (!$c) $fails++;
}
$jar = "$tmp/cookies.txt";
function req(string $method, string $url, $body = null, array $headers = [], bool $cookies = true): array
{
    global $jar;
    $ch = curl_init($url);
    $o = [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HEADER => true, CURLOPT_HTTPHEADER => $headers, CURLOPT_PROXY => '', CURLOPT_TIMEOUT => 60];
    if ($cookies) { $o[CURLOPT_COOKIEJAR] = $jar; $o[CURLOPT_COOKIEFILE] = $jar; }
    if ($body !== null) $o[CURLOPT_POSTFIELDS] = $body;
    curl_setopt_array($ch, $o);
    $r = curl_exec($ch);
    $hs = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $head = substr((string)$r, 0, $hs); $b = substr((string)$r, $hs);
    preg_match('/^Location:\s*(.+)$/mi', $head, $m);
    return ['code' => $code, 'body' => $b, 'json' => json_decode($b, true), 'location' => isset($m[1]) ? trim($m[1]) : null];
}
function csrf(string $html): string { preg_match('/name="csrf" value="([a-f0-9]+)"/', $html, $m); return $m[1] ?? ''; }
function mockstate(): array { global $state; return json_decode((string)file_get_contents($state), true) ?: []; }
function mcp(string $key, string $method, array $params = [], int $id = 1): array
{
    global $app;
    $r = req('POST', "$app/mcp.php?key=$key", json_encode(['jsonrpc' => '2.0', 'id' => $id, 'method' => $method, 'params' => $params]), ['Content-Type: application/json'], false);
    return $r['json'] ?? ['raw' => $r['body'], 'code' => $r['code']];
}
function tool(string $key, string $name, array $args): array
{
    $r = mcp($key, 'tools/call', ['name' => $name, 'arguments' => $args]);
    $t = $r['result']['content'][0]['text'] ?? '';
    return ['error' => $r['result']['isError'] ?? true, 'text' => $t, 'data' => json_decode($t, true)];
}

echo "Einrichtung\n";
$r = req('GET', "$app/index.php");
check(str_contains($r['body'], 'Postwerk einrichten'), 'Erster Aufruf zeigt Einrichtung');
$r = req('POST', "$app/index.php", http_build_query(['csrf' => csrf($r['body']), 'password' => 'geheim12345', 'password2' => 'geheim12345']));
check($r['code'] === 302 && str_contains((string)$r['location'], 'settings'), 'Passwort gesetzt', $r);
$r = req('GET', "$app/index.php?p=settings");
check(str_contains($r['body'], 'Redirect URI') && str_contains($r['body'], "$app/oauth.php"), 'Einstellungen zeigen Redirect URI');
$c = csrf($r['body']);
$r = req('POST', "$app/index.php?p=settings", http_build_query(['csrf' => $c, 'do' => 'settings', 'client_key' => 'ck', 'client_secret' => 'secret', 'timezone' => 'Europe/Copenhagen',
    'default_privacy' => 'PUBLIC_TO_EVERYONE', 'default_mode' => 'direct', 'default_aigc' => '1', 'keep_days' => '14', 'daily_cap' => '15', 'base_url' => '', 'scopes' => '']));
check($r['code'] === 302, 'Einstellungen gespeichert');
$r = req('POST', "$app/index.php?p=settings", http_build_query(['csrf' => $c, 'do' => 'new_key', 'name' => 'Claude']));
$r = req('GET', "$app/index.php?p=settings");
preg_match('/mcp\.php\?key=(pw_[a-f0-9]+)/', $r['body'], $m);
$key = $m[1] ?? '';
check($key !== '', 'API-Schlüssel erzeugt und einmal angezeigt');
$r = req('GET', "$app/index.php?p=settings");
check(!str_contains($r['body'], $key), 'Schlüssel wird danach nicht mehr angezeigt');

echo "TikTok verbinden\n";
$r = req('GET', "$app/index.php?p=accounts");
preg_match('/oauth\.php\?start=1&(?:amp;)?csrf=([a-f0-9]+)/', $r['body'], $m);
$r = req('GET', "$app/oauth.php?start=1&csrf=" . ($m[1] ?? ''));
check(str_starts_with((string)$r['location'], "$mock/v2/auth/authorize/") && str_contains($r['location'], 'video.publish'), 'Weiterleitung zu TikTok mit Scopes', $r['location']);
$r2 = req('GET', $r['location'], null, [], false);
$r3 = req('GET', $r2['location']);
check(str_contains(urldecode((string)$r3['location']), 'Verbunden: @testkanal'), 'Konto verbunden (Code gegen Token getauscht)', $r3['location']);
$r = req('GET', "$app/oauth.php?code=CODE123&state=falsch");
check(str_contains(urldecode((string)$r['location']), 'ungültig'), 'Falscher state wird abgelehnt');

echo "API & MCP\n";
check(req('GET', "$app/api.php?action=accounts", null, [], false)['code'] === 401, 'API ohne Schlüssel: 401');
check(req('GET', "$app/api.php?action=accounts", null, ['Authorization: Bearer pw_falsch'], false)['code'] === 401, 'API mit falschem Schlüssel: 401');
$r = req('GET', "$app/api.php?action=accounts", null, ["Authorization: Bearer $key"], false);
check(($r['json']['accounts'][0]['username'] ?? '') === 'testkanal', 'API listet Konto', $r['body']);
$init = mcp($key, 'initialize', ['protocolVersion' => '2025-06-18', 'capabilities' => new stdClass(), 'clientInfo' => ['name' => 't', 'version' => '1']]);
check(($init['result']['serverInfo']['name'] ?? '') === 'postwerk' && $init['result']['protocolVersion'] === '2025-06-18', 'MCP initialize', $init);
$r = req('POST', "$app/mcp.php?key=$key", json_encode(['jsonrpc' => '2.0', 'method' => 'notifications/initialized']), ['Content-Type: application/json'], false);
check($r['code'] === 202, 'MCP Benachrichtigung → 202');
$tl = mcp($key, 'tools/list');
$names = array_column($tl['result']['tools'] ?? [], 'name');
check(in_array('schedule_video', $names, true) && in_array('get_stats', $names, true), 'MCP Werkzeuge', $names);
check((mcp('pw_x', 'tools/list')['error']['code'] ?? 0) === -32001, 'MCP mit falschem Schlüssel abgelehnt');

echo "Video hochladen (in Teilen) und sofort veröffentlichen\n";
$video = "\x00\x00\x00\x20ftypisom" . random_bytes(9 * 1048576 + 12345);
$s = req('POST', "$app/api.php?action=upload_start", json_encode(['name' => 'kleo.mp4', 'size' => strlen($video)]), ["Authorization: Bearer $key", 'Content-Type: application/json'], false)['json'];
$off = 0;
while ($off < strlen($video)) {
    $part = substr($video, $off, 4 * 1048576);
    $rr = req('PUT', "$app/api.php?action=upload_chunk&upload_id={$s['upload_id']}&offset=$off", $part, ["Authorization: Bearer $key", 'Content-Type: application/octet-stream'], false)['json'];
    $off = $rr['received'];
}
$rr = req('PUT', "$app/api.php?action=upload_chunk&upload_id={$s['upload_id']}&offset=0", 'xx', ["Authorization: Bearer $key"], false)['json'];
check(($rr['received'] ?? 0) === strlen($video), 'Falscher Offset wird ignoriert (Fortsetzen möglich)');
$fin = req('POST', "$app/api.php?action=upload_finish", json_encode(['upload_id' => $s['upload_id'], 'duration' => 38.2]), ["Authorization: Bearer $key", 'Content-Type: application/json'], false)['json'];
$fid = $fin['file_id'] ?? '';
check(str_starts_with($fid, 'v') && $fin['video']['size'] === strlen($video), 'Upload in Teilen zusammengesetzt', $fin);

$t = tool($key, 'schedule_video', ['file_id' => $fid, 'caption' => "Kleopatra lebte näher an der Mondlandung 🤯\n#kleopatra #fakten", 'publish_at' => 'now', 'is_aigc' => true, 'cover_ms' => 1500, 'disable_duet' => true]);
check(!$t['error'] && $t['data']['created']['status'] === 'scheduled', 'MCP schedule_video legt Beitrag an', $t['text']);
$pid1 = $t['data']['created']['id'] ?? '';
$t = tool($key, 'run_scheduler', []);
check(!$t['error'] && in_array($pid1, $t['data']['published'] ?? [], true), 'Zeitplan sendet fälligen Beitrag', $t['text']);
$ms = mockstate();
$pub = end($ms['publishes']);
check($pub['md5'] === md5($video), 'Video kommt bitgenau bei TikTok an');
$pi = $pub['init']['post_info'];
check($pi['title'] === "Kleopatra lebte näher an der Mondlandung 🤯\n#kleopatra #fakten" && $pi['is_aigc'] === true && $pi['privacy_level'] === 'PUBLIC_TO_EVERYONE'
    && $pi['video_cover_timestamp_ms'] === 1500 && $pi['disable_duet'] === true && $pi['disable_stitch'] === true, 'post_info korrekt (Text, KI, Titelbild, Duett, Stitch durch Konto gesperrt)', $pi);
check($pub['init']['source_info']['total_chunk_count'] === 1 && $pub['init']['source_info']['chunk_size'] === strlen($video), 'Unter 64 MB: ein Teil');
$t = tool($key, 'run_scheduler', []);
$t = tool($key, 'get_post', ['id' => $pid1]);
check(($t['data']['status'] ?? '') === 'published' && $t['data']['tiktok_url'] === 'https://www.tiktok.com/@testkanal/video/7300000000000000001', 'Status veröffentlicht + Link', $t['text']);

echo "Video per Link, planen, Freigabe, ändern\n";
$t = tool($key, 'schedule_video', ['video_url' => "$mock/files/redirect", 'caption' => 'Kerbholz #geschichte', 'publish_at' => '2030-01-05 14:00', 'needs_review' => true]);
check(!$t['error'] && $t['data']['created']['status'] === 'review' && str_contains($t['data']['created']['publish_at'], '2030-01-05T14:00:00+01:00'), 'Download per Link (mit Weiterleitung), Zeitzone Kopenhagen, Freigabe nötig', $t['text']);
$pid2 = $t['data']['created']['id'] ?? '';
$t = tool($key, 'update_post', ['id' => $pid2, 'caption' => 'Kerbholz – neu #geschichte', 'publish_at' => '2030-01-05 15:30']);
check(!$t['error'] && $t['data']['updated']['caption'] === 'Kerbholz – neu #geschichte' && str_contains($t['data']['updated']['publish_at'], 'T15:30'), 'Beitrag geändert', $t['text']);
$t = tool($key, 'post_action', ['id' => $pid2, 'action' => 'approve']);
check(($t['data']['post']['status'] ?? '') === 'scheduled', 'Freigegeben');
tool($key, 'run_scheduler', []);
check(pp_status($key, $pid2) === 'scheduled', 'Zukünftiger Beitrag wird nicht zu früh gesendet');
$t = tool($key, 'schedule_video', ['video_url' => "$mock/files/pic.png", 'caption' => 'x', 'publish_at' => 'now']);
check($t['error'] && str_contains($t['text'], 'keine Videodatei'), 'Bild als Video wird abgelehnt', $t['text']);
$t = tool($key, 'schedule_video', ['file_id' => $fid, 'caption' => str_repeat('a', 2201), 'publish_at' => 'now']);
check($t['error'] && str_contains($t['text'], '2200'), 'Zu lange Beschreibung abgelehnt');

echo "Entwurf ins Postfach\n";
$t = tool($key, 'schedule_video', ['file_id' => $fid, 'caption' => 'Entwurf', 'publish_at' => 'now', 'mode' => 'draft']);
$pid3 = $t['data']['created']['id'];
tool($key, 'run_scheduler', []); tool($key, 'run_scheduler', []);
$ms = mockstate(); $pub = end($ms['publishes']);
check($pub['kind'] === 'inbox' && !isset($pub['init']['post_info']), 'Inbox-Endpunkt ohne post_info');
check(pp_status($key, $pid3) === 'inbox', 'Status „Im TikTok-Postfach“');

echo "Fotos\n";
$t = tool($key, 'schedule_photos', ['image_urls' => ["$mock/files/pic.png", "$mock/files/pic.png"], 'title' => 'Pyramiden', 'caption' => 'Fotos #ägypten', 'publish_at' => 'now']);
check(!$t['error'] && count($t['data']['created']['images']) === 2, 'Foto-Beitrag (PNG → JPG umgewandelt)', $t['text']);
$pid4 = $t['data']['created']['id'] ?? '';
$img = $t['data']['created']['images'][0] ?? '';
check(req('GET', $img, null, [], false)['code'] === 200, 'Foto öffentlich abrufbar für TikTok');
tool($key, 'run_scheduler', []); tool($key, 'run_scheduler', []);
$ms = mockstate(); $pub = end($ms['publishes']);
check($pub['init']['media_type'] === 'PHOTO' && $pub['init']['post_info']['title'] === 'Pyramiden' && $pub['init']['post_info']['description'] === 'Fotos #ägypten', 'Foto-Init korrekt', $pub['init']);
check(pp_status($key, $pid4) === 'published', 'Foto-Beitrag veröffentlicht');

echo "Fehler und Wiederholung\n";
$t = tool($key, 'schedule_video', ['file_id' => $fid, 'caption' => 'SPAM test', 'publish_at' => 'now']);
$pid5 = $t['data']['created']['id'];
tool($key, 'run_scheduler', []);
$t = tool($key, 'get_post', ['id' => $pid5]);
check($t['data']['status'] === 'failed' && str_contains((string)$t['data']['error'], 'Tageslimit'), 'Spam-Fehler → fehlgeschlagen mit deutscher Meldung', $t['data']['error'] ?? null);
$t = tool($key, 'schedule_video', ['file_id' => $fid, 'caption' => 'RATELIMIT test', 'publish_at' => 'now']);
$pid6 = $t['data']['created']['id'];
tool($key, 'run_scheduler', []);
$t = tool($key, 'get_post', ['id' => $pid6]);
check($t['data']['status'] === 'scheduled' && str_contains(implode(' ', $t['data']['history']), 'neuer Versuch'), 'Ratenlimit → automatischer neuer Versuch geplant', $t['data']);
$t = tool($key, 'post_action', ['id' => $pid6, 'action' => 'now']);
tool($key, 'run_scheduler', []);
check(pp_status($key, $pid6) === 'published', '„Jetzt“ sendet erneut und klappt');

echo "Token-Erneuerung\n";
$acc = json_decode(file_get_contents("$data/accounts.json"), true);
$acc['OPEN1']['expires_at'] = time() - 10;
file_put_contents("$data/accounts.json", json_encode($acc));
$before = mockstate()['token_n'];
$t = tool($key, 'schedule_video', ['file_id' => $fid, 'caption' => 'nach Erneuerung', 'publish_at' => 'now']);
tool($key, 'run_scheduler', []); tool($key, 'run_scheduler', []);
check(mockstate()['token_n'] === $before + 1 && pp_status($key, $t['data']['created']['id']) === 'published', 'Abgelaufener Zugang wird erneuert, Beitrag geht raus');

echo "Großes Video (über 64 MB, mehrere Teile)\n";
$bigf = "$tmp/big.mp4";
$fh = fopen($bigf, 'wb'); fwrite($fh, "\x00\x00\x00\x20ftypisom"); for ($i = 0; $i < 70; $i++) fwrite($fh, random_bytes(1048576)); fclose($fh);
$r = req('POST', "$app/api.php?action=upload", ['file' => new CURLFile($bigf, 'video/mp4', 'big.mp4')], ["Authorization: Bearer $key"], false);
check(!empty($r['json']['file_id']), 'Upload in einem Stück (multipart)', $r['body']);
$t = tool($key, 'schedule_video', ['file_id' => $r['json']['file_id'] ?? '', 'caption' => 'Groß', 'publish_at' => 'now']);
tool($key, 'run_scheduler', []);
$ms = mockstate(); $pub = end($ms['publishes']);
check($pub['init']['source_info']['total_chunk_count'] === 2 && $pub['chunks'] === 2 && $pub['md5'] === md5_file($bigf), '70 MB → 2 Teile à 32 MB + Rest, bitgenau');

echo "Statistik & Oberfläche\n";
$t = tool($key, 'get_stats', ['refresh' => true]);
check(!$t['error'] && $t['data']['current']['followers'] === 1234 && count($t['data']['videos']) === 2 && $t['data']['best_times']['based_on_videos'] === 2, 'Statistik mit Followern, Videos, besten Zeiten', $t['text']);
foreach (['plan' => 'Planer', 'stats' => 'Follower', 'accounts' => 'testkanal', 'new' => 'Einplanen', 'log' => 'Protokoll', 'post&id=' . $pid1 => 'Auf TikTok ansehen'] as $pg => $needle) {
    $r = req('GET', "$app/index.php?p=$pg");
    check($r['code'] === 200 && str_contains($r['body'], $needle) && !preg_match('/(Warning|Fatal error|Notice|Deprecated)/', $r['body']), "Seite $pg lädt", substr(strip_tags($r['body']), 0, 400));
}
// Beitrag über das Formular anlegen
$r = req('GET', "$app/index.php?p=new");
$r = req('POST', "$app/index.php?p=new", http_build_query(['csrf' => csrf($r['body']), 'do' => 'save_post', 'type' => 'video', 'file_id' => $fid, 'caption' => 'Formular #test', 'when' => 'later',
    'publish_at' => '2030-02-01T18:00', 'mode' => 'direct', 'privacy' => 'SELF_ONLY', 'account' => 'OPEN1', 'is_aigc' => '1']));
check(str_contains(urldecode((string)$r['location']), 'eingeplant für 01.02.2030 18:00'), 'Formular plant Beitrag', $r['location']);
// Video im Browser abspielbar (Range)
$r = req('GET', "$app/media.php?f=$fid", null, ['Range: bytes=0-99']);
check($r['code'] === 206 && strlen($r['body']) === 100, 'Video-Vorschau mit Range-Anfragen');
check(req('GET', "$app/media.php?f=$fid", null, [], false)['code'] === 403, 'Video ohne Anmeldung gesperrt');
check(req('GET', "$app/cron.php?key=falsch", null, [], false)['code'] === 403, 'Cron mit falschem Schlüssel gesperrt');
$ck = json_decode(file_get_contents("$data/config.json"), true)['cron_key'];
check((req('GET', "$app/cron.php?key=$ck", null, [], false)['json']['ok'] ?? false) === true, 'Cron per URL');
check(!str_contains((string)file_get_contents("$data/config.json"), $key), 'Schlüssel nur als Hash gespeichert');
$log = (string)@file_get_contents("$tmp/app.log");
check(!preg_match('/PHP (Warning|Fatal|Notice|Deprecated)/', $log), 'Keine PHP-Warnungen im Serverlog', substr($log, 0, 1500));

echo "\n" . ($n - $fails) . " von $n Prüfungen bestanden\n";
exit($fails ? 1 : 0);

function pp_status(string $key, string $id): string { return tool($key, 'get_post', ['id' => $id])['data']['status'] ?? '?'; }
