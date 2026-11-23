<?php
/**
 * Postwerk – Oberfläche: Planer, neuer Beitrag, Konten, Statistik, Einstellungen.
 */
declare(strict_types=1);
require __DIR__ . '/lib/boot.php';

pp_session();
$page = (string)($_GET['p'] ?? 'plan');
$flash = (string)($_GET['msg'] ?? '');
$firstRun = !cfg('password_hash');

function go(string $to, string $msg = ''): void
{
    header('Location: index.php?' . $to . ($msg !== '' ? '&msg=' . rawurlencode($msg) : ''));
    exit;
}

/* --------------------------------------------------- Einrichtung / Login */
if ($firstRun) {
    $err = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST' && pp_csrf_ok($_POST['csrf'] ?? null)) {
        $pw = (string)($_POST['password'] ?? '');
        if (mb_strlen($pw) < 10) $err = 'Bitte mindestens 10 Zeichen.';
        elseif ($pw !== ($_POST['password2'] ?? '')) $err = 'Die Passwörter stimmen nicht überein.';
        else {
            cfg_set(['password_hash' => password_hash($pw, PASSWORD_DEFAULT), 'created' => time()]);
            pp_login($pw);
            go('p=settings', 'Willkommen! Jetzt die TikTok-App eintragen.');
        }
    }
    page_auth('Postwerk einrichten', 'Lege ein Passwort für die Oberfläche fest.', true, $err);
    exit;
}
if ($page === 'logout') { pp_session(); session_destroy(); go('p=login'); }
if (!pp_logged_in()) {
    $err = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (pp_csrf_ok($_POST['csrf'] ?? null) && pp_login((string)($_POST['password'] ?? ''))) go('p=plan');
        $err = 'Passwort falsch (oder zu viele Versuche – 15 Minuten warten).';
    }
    page_auth('Anmelden', '', false, $err);
    exit;
}

/* ---------------------------------------------------------- Aktionen */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!pp_csrf_ok($_POST['csrf'] ?? null)) go('p=' . $page, 'Sitzung abgelaufen, bitte erneut versuchen.');
    $do = (string)($_POST['do'] ?? '');
    try {
        switch ($do) {
            case 'save_post':
                $in = $_POST;
                $in['publish_at'] = ($_POST['when'] ?? '') === 'now' ? 'now' : ($_POST['publish_at'] ?? '');
                foreach (['disable_comment', 'disable_duet', 'disable_stitch', 'is_aigc', 'brand_content', 'brand_organic', 'auto_music'] as $k) $in[$k] = isset($_POST[$k]);
                $in['images'] = array_filter(explode(',', (string)($_POST['images'] ?? '')));
                if (empty($in['file_id'])) unset($in['file_id']);
                if (!empty($_POST['id'])) {
                    $p = pp_post_update((string)$_POST['id'], $in);
                    $m = 'Beitrag gespeichert.';
                } else {
                    $p = pp_post_create($in, 'ui');
                    $m = $p['status'] === 'review' ? 'Beitrag angelegt, wartet auf Freigabe.' : 'Beitrag eingeplant für ' . pp_fmt_time($p['publish_at']) . '.';
                }
                if (($_POST['when'] ?? '') === 'now') { pp_tick(50); $p = pp_post($p['id']); $m = 'Wird jetzt veröffentlicht: ' . PP_STATUS[$p['status']] . ($p['error'] ? ' – ' . $p['error'] : ''); }
                go('p=post&id=' . $p['id'], $m);
            case 'approve': case 'cancel': case 'now': case 'retry':
                $p = pp_post_action((string)$_POST['id'], $do);
                if ($do === 'now' || $do === 'retry') { pp_tick(50); $p = pp_post($p['id']); }
                go('p=post&id=' . $p['id'], 'Status: ' . PP_STATUS[$p['status']] . (!empty($p['error']) && $p['status'] === 'failed' ? ' – ' . $p['error'] : ''));
            case 'delete':
                pp_post_delete((string)$_POST['id']);
                go('p=plan', 'Beitrag gelöscht.');
            case 'duplicate':
                $src = pp_post((string)$_POST['id']);
                if (!$src) throw new PPError('Beitrag nicht gefunden.');
                if (!empty($src['file']) && !is_file(pp_video_path($src['file']))) throw new PPError('Das Video wurde inzwischen gelöscht.');
                $p = pp_post_create(array_merge($src, ['file_id' => $src['file'], 'publish_at' => max(time() + 3600, $src['publish_at'] + 86400), 'account' => $src['account']]), 'ui');
                go('p=new&id=' . $p['id'], 'Kopie angelegt (einen Tag später). Jetzt anpassen.');
            case 'settings':
                $vals = [
                    'client_key' => trim((string)$_POST['client_key']),
                    'timezone' => in_array($_POST['timezone'] ?? '', DateTimeZone::listIdentifiers(), true) ? $_POST['timezone'] : 'Europe/Copenhagen',
                    'default_privacy' => isset(PP_PRIVACY[$_POST['default_privacy'] ?? '']) ? $_POST['default_privacy'] : 'PUBLIC_TO_EVERYONE',
                    'default_mode' => ($_POST['default_mode'] ?? '') === 'draft' ? 'draft' : 'direct',
                    'default_aigc' => isset($_POST['default_aigc']),
                    'review_external' => isset($_POST['review_external']),
                    'unaudited' => isset($_POST['unaudited']),
                    'keep_days' => max(0, (int)$_POST['keep_days']),
                    'daily_cap' => max(1, (int)$_POST['daily_cap']),
                    'base_url' => rtrim(trim((string)$_POST['base_url']), '/'),
                    'scopes' => trim((string)$_POST['scopes']) ?: TT_DEFAULT_SCOPES,
                    'default_hashtags' => trim((string)($_POST['default_hashtags'] ?? '')),
                ];
                if (trim((string)$_POST['client_secret']) !== '') $vals['client_secret'] = trim((string)$_POST['client_secret']);
                cfg_set($vals);
                go('p=settings', 'Einstellungen gespeichert.');
            case 'new_key':
                $name = trim((string)($_POST['name'] ?? '')) ?: 'Claude';
                $_SESSION['pp_new_key'] = ['key' => pp_key_create($name), 'name' => $name];
                go('p=settings#keys', 'Schlüssel erzeugt. Er wird nur jetzt angezeigt.');
            case 'revoke_key':
                pp_key_revoke((string)$_POST['kid']);
                go('p=settings#keys', 'Schlüssel gesperrt.');
            case 'password':
                if (!password_verify((string)$_POST['old'], (string)cfg('password_hash'))) throw new PPError('Altes Passwort falsch.');
                if (mb_strlen((string)$_POST['new']) < 10) throw new PPError('Neues Passwort: mindestens 10 Zeichen.');
                cfg_set(['password_hash' => password_hash((string)$_POST['new'], PASSWORD_DEFAULT)]);
                pp_login((string)$_POST['new']);
                go('p=settings', 'Passwort geändert.');
            case 'disconnect':
                tt_disconnect((string)$_POST['open_id']);
                go('p=accounts', 'Konto getrennt.');
            case 'refresh_account':
                $a = tt_find_account((string)$_POST['open_id']);
                if ($a) { tt_refresh_profile($a); pp_videos_cached($a['open_id'], true); }
                go('p=' . ($_POST['back'] ?? 'accounts'), 'Aktualisiert.');
            case 'tick':
                $r = pp_tick(50);
                go('p=plan', isset($r['skipped']) ? 'Zeitplan läuft bereits.' : 'Zeitplan ausgeführt: ' . count($r['published'] ?? []) . ' gesendet, ' . count($r['polled'] ?? []) . ' abgefragt.');
        }
    } catch (Throwable $e) {
        $back = $page === 'new' ? 'p=new' . (!empty($_POST['id']) ? '&id=' . rawurlencode((string)$_POST['id']) : '') : 'p=' . $page . (!empty($_POST['id']) ? '&id=' . rawurlencode((string)$_POST['id']) : '');
        if ($page === 'new') $_SESSION['pp_form'] = $_POST;
        go($back, 'Fehler: ' . $e->getMessage());
    }
}

pp_tick_in_background();

/* ------------------------------------------------------------ Seiten */
$accounts = tt_accounts();
ob_start();
switch ($page) {
    case 'new': page_new($accounts); break;
    case 'post': page_post(); break;
    case 'accounts': page_accounts($accounts); break;
    case 'stats': page_stats($accounts); break;
    case 'settings': page_settings(); break;
    case 'log': page_log(); break;
    default: $page = 'plan'; page_plan($accounts);
}
$content = ob_get_clean();
layout($page, $content, $flash);

/* ===================================================================== */

function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . h(pp_csrf()) . '">'; }

function icon(string $n): string
{
    $p = [
        'plan' => '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
        'new' => '<path d="M12 5v14M5 12h14"/>',
        'accounts' => '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
        'stats' => '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
        'settings' => '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
        'video' => '<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3z"/>',
        'photo' => '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    ][$n] ?? '';
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $p . '</svg>';
}

function head_html(string $title): void
{
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="theme-color" content="#0f1115"><title>' . h($title) . ' · Postwerk</title>'
        . '<link rel="icon" href="data:image/svg+xml,' . rawurlencode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f1115"/><path d="M11 9v14l12-7z" fill="#fe2c55"/><path d="M10 8v14l12-7z" fill="#25f4ee" opacity=".85"/></svg>') . '">'
        . '<link rel="stylesheet" href="assets/app.css?v=' . PP_VERSION . '"></head>';
}

function page_auth(string $title, string $text, bool $setup, string $err): void
{
    head_html($title);
    echo '<body class="auth"><form method="post" class="card authcard"><div class="brand big"><span class="logo"></span>Postwerk</div>';
    echo '<h1>' . h($title) . '</h1>' . ($text ? '<p class="muted">' . h($text) . '</p>' : '');
    if ($err) echo '<div class="flash err">' . h($err) . '</div>';
    echo csrf_field() . '<label>Passwort<input type="password" name="password" required autofocus autocomplete="' . ($setup ? 'new-password' : 'current-password') . '"></label>';
    if ($setup) echo '<label>Passwort wiederholen<input type="password" name="password2" required autocomplete="new-password"></label>';
    echo '<button class="btn primary wide">' . ($setup ? 'Einrichten' : 'Anmelden') . '</button></form></body></html>';
}

function layout(string $page, string $content, string $flash): void
{
    head_html(['plan' => 'Planer', 'new' => 'Neuer Beitrag', 'post' => 'Beitrag', 'accounts' => 'Konten', 'stats' => 'Statistik', 'settings' => 'Einstellungen', 'log' => 'Protokoll'][$page] ?? 'Postwerk');
    echo '<body data-csrf="' . h(pp_csrf()) . '"><div class="app"><nav class="side"><a class="brand" href="index.php"><span class="logo"></span>Postwerk</a>';
    foreach (['plan' => 'Planer', 'new' => 'Neu', 'stats' => 'Statistik', 'accounts' => 'Konten', 'settings' => 'Einstellungen'] as $k => $l) {
        echo '<a class="nav' . ($page === $k ? ' on' : '') . ($k === 'new' ? ' nav-new' : '') . '" href="index.php?p=' . $k . '">' . icon($k) . '<span>' . $l . '</span></a>';
    }
    $lt = (int)cfg('last_tick', 0);
    echo '<div class="side-foot">' . ($lt ? 'Zeitplan zuletzt: ' . date('d.m. H:i', $lt) : 'Zeitplan lief noch nie') . '<br><a href="index.php?p=log">Protokoll</a> · <a href="index.php?p=logout">Abmelden</a></div></nav>';
    echo '<main>';
    if ($flash !== '') echo '<div class="flash' . (str_starts_with($flash, 'Fehler') ? ' err' : '') . '">' . h($flash) . '</div>';
    echo $content . '</main></div><script src="assets/app.js?v=' . PP_VERSION . '"></script></body></html>';
}

function badge(string $status): string
{
    return '<span class="badge s-' . h($status) . '">' . h(PP_STATUS[$status] ?? $status) . '</span>';
}

function thumb(array $p, string $cls = 'thumb'): string
{
    if ($p['type'] === 'photo' && !empty($p['images'])) return '<img class="' . $cls . '" loading="lazy" src="media/' . h($p['images'][0]) . '" alt="">';
    if (!empty($p['file'])) {
        $m = pp_video_meta($p['file']);
        if ($m && !empty($m['thumb'])) return '<img class="' . $cls . '" loading="lazy" src="media.php?thumb=1&f=' . h($p['file']) . '" alt="">';
        if ($m && is_file(pp_video_path($p['file']))) return '<video class="' . $cls . '" preload="metadata" muted playsinline src="media.php?f=' . h($p['file']) . '#t=0.5"></video>';
    }
    return '<div class="' . $cls . ' ph">' . icon($p['type'] === 'photo' ? 'photo' : 'video') . '</div>';
}

/* ------------------------------------------------------------- Planer */
function page_plan(array $accounts): void
{
    $posts = pp_posts();
    $tz = new DateTimeZone(date_default_timezone_get());
    $wk = (int)($_GET['w'] ?? 0);
    $monday = (new DateTime('monday this week', $tz))->modify(($wk >= 0 ? '+' : '') . $wk . ' week');
    $days = [];
    for ($i = 0; $i < 7; $i++) { $d = (clone $monday)->modify("+$i day"); $days[$d->format('Y-m-d')] = $d; }

    $counts = array_fill_keys(array_keys(PP_STATUS), 0);
    foreach ($posts as $p) $counts[$p['status']]++;
    $attention = array_filter($posts, fn($p) => in_array($p['status'], ['failed', 'review'], true));
    $upcoming = array_filter($posts, fn($p) => in_array($p['status'], ['scheduled', 'review'], true));
    $next = $upcoming ? reset($upcoming) : null;

    echo '<header class="top"><div><h1>Planer</h1><p class="muted">' . count($upcoming) . ' geplant' . ($next ? ' · nächster ' . h(pp_fmt_time($next['publish_at'], 'D d.m. H:i')) : '') . '</p></div>'
        . '<div class="actions"><form method="post">' . csrf_field() . '<input type="hidden" name="do" value="tick"><button class="btn ghost" title="Fällige Beiträge jetzt senden">Zeitplan jetzt ausführen</button></form>'
        . '<a class="btn primary" href="index.php?p=new">' . icon('new') . ' Neuer Beitrag</a></div></header>';

    if (!tt_configured()) echo '<div class="notice">Noch keine TikTok-App eingetragen. <a href="index.php?p=settings">Zu den Einstellungen</a></div>';
    elseif (!$accounts) echo '<div class="notice">Noch kein TikTok-Konto verbunden. <a href="index.php?p=accounts">Konto verbinden</a></div>';
    if ((int)cfg('last_tick', 0) < time() - 900 && $upcoming) echo '<div class="notice warn">Der Zeitplan lief seit über 15 Minuten nicht. Bitte den Cronjob einrichten (siehe Einstellungen), sonst werden Beiträge nur beim Öffnen dieser Seite gesendet.</div>';

    if ($attention) {
        echo '<section class="card"><h2>Braucht Aufmerksamkeit</h2><div class="rows">';
        foreach ($attention as $p) post_row($p);
        echo '</div></section>';
    }

    echo '<div class="weeknav"><a class="btn ghost sm" href="index.php?p=plan&w=' . ($wk - 1) . '">‹</a><strong>' . h($monday->format('d.m.')) . ' – ' . h(end($days)->format('d.m.Y')) . '</strong><a class="btn ghost sm" href="index.php?p=plan&w=' . ($wk + 1) . '">›</a>'
        . ($wk ? '<a class="btn ghost sm" href="index.php?p=plan">Heute</a>' : '') . '</div>';
    echo '<div class="week">';
    $wd = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    $i = 0;
    foreach ($days as $key => $d) {
        $isToday = $key === date('Y-m-d');
        echo '<div class="day' . ($isToday ? ' today' : '') . '"><div class="dayhead"><span>' . $wd[$i++] . '</span> ' . $d->format('d.m.') . '<a class="add" title="Beitrag an diesem Tag" href="index.php?p=new&day=' . $key . '">+</a></div>';
        $n = 0;
        foreach ($posts as $p) {
            if (date('Y-m-d', $p['publish_at']) !== $key) continue;
            $n++;
            echo '<a class="chip s-' . h($p['status']) . '" href="index.php?p=post&id=' . h($p['id']) . '">' . thumb($p, 'cthumb')
                . '<span class="ctext"><span class="cap"><b>' . date('H:i', $p['publish_at']) . '</b> ' . h(mb_strimwidth($p['caption'] ?: ($p['title'] ?? ''), 0, 80, '…')) . '</span>' . badge($p['status']) . '</span></a>';
        }
        if (!$n) echo '<div class="empty">–</div>';
        echo '</div>';
    }
    echo '</div>';

    $recent = array_reverse(array_filter($posts, fn($p) => in_array($p['status'], ['published', 'inbox', 'processing', 'publishing', 'canceled'], true)));
    echo '<section class="card"><h2>Zuletzt</h2><div class="rows">';
    if (!$recent) echo '<p class="muted">Noch nichts veröffentlicht.</p>';
    foreach (array_slice($recent, 0, 15) as $p) post_row($p);
    echo '</div></section>';
}

function post_row(array $p): void
{
    echo '<a class="row" href="index.php?p=post&id=' . h($p['id']) . '">' . thumb($p) . '<div class="rtext"><div class="rmeta">' . badge($p['status'])
        . ' <span>' . h(pp_fmt_time($p['publish_at'], 'D d.m. H:i')) . '</span>' . ($p['account_name'] ? ' <span class="muted">@' . h($p['account_name']) . '</span>' : '')
        . ($p['mode'] === 'draft' ? ' <span class="tag">Entwurf</span>' : '') . (($p['source'] ?? '') === 'claude' ? ' <span class="tag">Claude</span>' : '') . '</div>'
        . '<div class="rcap">' . h(mb_strimwidth($p['caption'] ?: ($p['title'] ?? ''), 0, 160, '…')) . '</div>'
        . (!empty($p['error']) && in_array($p['status'], ['failed', 'scheduled'], true) ? '<div class="rerr">' . h($p['error']) . '</div>' : '') . '</div></a>';
}

/* ------------------------------------------------------ Neuer Beitrag */
function page_new(array $accounts): void
{
    $edit = !empty($_GET['id']) ? pp_post((string)$_GET['id']) : null;
    if ($edit && !in_array($edit['status'], PP_EDITABLE, true)) { echo '<div class="notice">Dieser Beitrag kann nicht mehr bearbeitet werden.</div>'; return; }
    $f = $_SESSION['pp_form'] ?? null;
    unset($_SESSION['pp_form']);
    $v = function (string $k, $def = '') use ($edit, $f) { return $f[$k] ?? ($edit[$k] ?? $def); };
    $type = $v('type', $_GET['type'] ?? 'video');
    $when = $edit ? date('Y-m-d\TH:i', $edit['publish_at']) : (($_GET['day'] ?? '') ? $_GET['day'] . 'T18:00' : date('Y-m-d\TH:i', (int)(ceil((time() + 3600) / 900) * 900)));
    if ($f && !empty($f['publish_at'])) $when = $f['publish_at'];
    $acc = $edit ? ($accounts[$edit['account']] ?? null) : ($accounts ? reset($accounts) : null);
    $opts = $acc['creator_info']['privacy_level_options'] ?? array_keys(PP_PRIVACY);
    $priv = $v('privacy', cfg('default_privacy', 'PUBLIC_TO_EVERYONE'));
    $meta = ($edit && !empty($edit['file'])) ? pp_video_meta($edit['file']) : null;
    $fileId = $f['file_id'] ?? ($edit['file'] ?? '');
    $imgs = $f ? array_filter(explode(',', (string)($f['images'] ?? ''))) : ($edit['images'] ?? []);
    $caption = $v('caption', $edit ? '' : (string)cfg('default_hashtags', ''));
    $bool = fn($k, $def) => $f ? isset($f[$k]) : (bool)($edit[$k] ?? $def);

    echo '<header class="top"><h1>' . ($edit ? 'Beitrag bearbeiten' : 'Neuer Beitrag') . '</h1></header>';
    echo '<form method="post" class="compose" id="compose">' . csrf_field() . '<input type="hidden" name="do" value="save_post">';
    if ($edit) echo '<input type="hidden" name="id" value="' . h($edit['id']) . '">';
    echo '<div class="col">';
    echo '<div class="seg"><label><input type="radio" name="type" value="video"' . ($type === 'video' ? ' checked' : '') . '>' . icon('video') . ' Video</label><label><input type="radio" name="type" value="photo"' . ($type === 'photo' ? ' checked' : '') . '>' . icon('photo') . ' Fotos</label></div>';

    // Video
    echo '<section class="card only-video"><h2>Video</h2><input type="hidden" name="file_id" id="file_id" value="' . h($fileId) . '">'
        . '<input type="hidden" name="duration" id="duration">'
        . '<div class="drop" id="vdrop"' . ($fileId ? ' hidden' : '') . '><input type="file" id="vfile" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm">'
        . '<div>' . icon('video') . '<b>Video hierher ziehen oder antippen</b><span class="muted">MP4, MOV oder WebM · Hochformat 9:16 empfohlen</span></div></div>'
        . '<div class="progress" id="vprog" hidden><div></div><span></span></div>'
        . '<div class="vprev" id="vprev"' . ($fileId ? '' : ' hidden') . '><video id="vplayer" controls playsinline preload="metadata"' . ($fileId ? ' src="media.php?f=' . h($fileId) . '"' : '') . '></video>'
        . '<div class="vinfo"><span id="vname">' . h($meta['name'] ?? '') . '</span><button type="button" class="btn ghost sm" id="vchange">Anderes Video</button></div>'
        . '<label>Titelbild aus dem Video<input type="range" id="cover" min="0" max="1000" value="0" step="1"><input type="hidden" name="cover_ms" id="cover_ms" value="' . h($v('cover_ms', '')) . '"></label><span class="muted small" id="covert">Schieberegler bewegen, um das Titelbild zu wählen</span></div></section>';

    // Fotos
    echo '<section class="card only-photo"><h2>Fotos</h2><input type="hidden" name="images" id="images" value="' . h(implode(',', $imgs)) . '">'
        . '<div class="drop" id="idrop"><input type="file" id="ifile" accept="image/jpeg,image/png,image/webp" multiple><div>' . icon('photo') . '<b>Fotos hierher ziehen oder antippen</b><span class="muted">bis zu 35 Bilder · JPG, PNG, WebP</span></div></div>'
        . '<div class="progress" id="iprog" hidden><div></div><span></span></div><div class="imgs" id="imgs">';
    foreach ($imgs as $im) echo '<figure data-n="' . h($im) . '"><img src="media/' . h($im) . '" alt=""><button type="button" class="x" title="Entfernen">×</button></figure>';
    echo '</div><label>Titel <span class="muted">(max. 90 Zeichen)</span><input name="title" maxlength="90" value="' . h($v('title')) . '"></label>'
        . '<label class="chk"><input type="checkbox" name="auto_music"' . ($bool('auto_music', true) ? ' checked' : '') . '> Automatisch Musik hinzufügen</label></section>';

    echo '<section class="card"><h2>Text</h2><label>Beschreibung &amp; Hashtags<textarea name="caption" id="caption" rows="7" maxlength="4000" placeholder="Worum geht es? #hashtags">' . h($caption) . '</textarea></label>'
        . '<div class="capinfo"><span id="capcount">0</span> / <span id="capmax">2200</span> Zeichen · <span id="hashcount">0</span> Hashtags</div>'
        . '<label>Interne Notiz <span class="muted">(wird nicht veröffentlicht)</span><input name="note" value="' . h($v('note')) . '"></label></section>';
    echo '</div><div class="col">';

    echo '<section class="card"><h2>Wann &amp; wo</h2>';
    if (!$accounts) echo '<div class="notice">Kein TikTok-Konto verbunden – der Beitrag wird gespeichert, kann aber erst nach dem Verbinden gesendet werden.</div>';
    else {
        echo '<label>Konto<select name="account">';
        foreach ($accounts as $a) echo '<option value="' . h($a['open_id']) . '"' . (($acc['open_id'] ?? '') === $a['open_id'] ? ' selected' : '') . '>@' . h($a['username'] ?? $a['display_name'] ?? $a['open_id']) . '</option>';
        echo '</select></label>';
    }
    echo '<div class="seg"><label><input type="radio" name="when" value="later" checked> Planen</label><label><input type="radio" name="when" value="now"> Sofort</label></div>'
        . '<label class="only-later">Zeitpunkt<input type="datetime-local" name="publish_at" value="' . h($when) . '"></label>'
        . '<p class="muted small only-later">Zeitzone: ' . h(date_default_timezone_get()) . '</p>'
        . '<label>Art<select name="mode"><option value="direct"' . ($v('mode', cfg('default_mode', 'direct')) === 'direct' ? ' selected' : '') . '>Direkt veröffentlichen</option><option value="draft"' . ($v('mode', cfg('default_mode', 'direct')) === 'draft' ? ' selected' : '') . '>Entwurf ins TikTok-Postfach</option></select></label>'
        . '<label>Wer darf es sehen?<select name="privacy">';
    foreach (PP_PRIVACY as $k => $l) if (in_array($k, $opts, true)) echo '<option value="' . $k . '"' . ($priv === $k ? ' selected' : '') . '>' . $l . '</option>';
    echo '</select></label>';
    if (cfg('unaudited')) echo '<p class="muted small">Die TikTok-App ist als „noch nicht freigegeben“ markiert: direkte Beiträge erscheinen privat.</p>';
    echo '</section>';

    echo '<section class="card"><h2>Einstellungen</h2>'
        . '<label class="chk"><input type="checkbox" name="is_aigc"' . ($bool('is_aigc', cfg('default_aigc', false)) ? ' checked' : '') . '> KI-generierter Inhalt (Kennzeichnung)</label>'
        . '<label class="chk"><input type="checkbox" name="disable_comment"' . ($bool('disable_comment', false) ? ' checked' : '') . '> Kommentare aus</label>'
        . '<label class="chk only-video"><input type="checkbox" name="disable_duet"' . ($bool('disable_duet', false) ? ' checked' : '') . '> Duett aus</label>'
        . '<label class="chk only-video"><input type="checkbox" name="disable_stitch"' . ($bool('disable_stitch', false) ? ' checked' : '') . '> Stitch aus</label>'
        . '<details><summary>Werbung offenlegen</summary><label class="chk"><input type="checkbox" name="brand_organic"' . ($bool('brand_organic', false) ? ' checked' : '') . '> Eigene Marke (Werbeinhalt)</label>'
        . '<label class="chk"><input type="checkbox" name="brand_content"' . ($bool('brand_content', false) ? ' checked' : '') . '> Markeninhalt (bezahlte Partnerschaft)</label>'
        . '<p class="muted small">Mit dem Veröffentlichen stimmst du der <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">Music Usage Confirmation</a> von TikTok zu.</p></details></section>';

    echo '<div class="submitbar"><button class="btn primary wide" id="submit">' . ($edit ? 'Speichern' : 'Einplanen') . '</button></div>';
    echo '</div></form>';
}

/* ------------------------------------------------------------ Beitrag */
function page_post(): void
{
    $p = pp_post((string)($_GET['id'] ?? ''));
    if (!$p) { echo '<div class="notice">Beitrag nicht gefunden.</div>'; return; }
    $btn = fn($do, $label, $cls = 'ghost', $confirm = '') => '<form method="post"' . ($confirm ? ' data-confirm="' . h($confirm) . '"' : '') . '>' . csrf_field()
        . '<input type="hidden" name="do" value="' . $do . '"><input type="hidden" name="id" value="' . h($p['id']) . '"><button class="btn ' . $cls . '">' . $label . '</button></form>';
    echo '<header class="top"><div><a class="muted" href="index.php?p=plan">‹ Planer</a><h1>' . ($p['type'] === 'photo' ? 'Foto-Beitrag' : 'Video') . ' ' . badge($p['status']) . '</h1></div><div class="actions">';
    if ($p['status'] === 'review') echo $btn('approve', 'Freigeben', 'primary');
    if (in_array($p['status'], PP_EDITABLE, true)) echo '<a class="btn ghost" href="index.php?p=new&id=' . h($p['id']) . '">Bearbeiten</a>';
    if (in_array($p['status'], ['review', 'scheduled', 'canceled'], true)) echo $btn('now', 'Jetzt veröffentlichen', 'ghost', 'Jetzt sofort auf TikTok veröffentlichen?');
    if ($p['status'] === 'failed') echo $btn('retry', 'Erneut versuchen', 'primary');
    if (in_array($p['status'], ['review', 'scheduled', 'failed'], true)) echo $btn('cancel', 'Abbrechen');
    if (!empty($p['file']) || $p['type'] === 'photo') echo $btn('duplicate', 'Kopieren');
    if (!in_array($p['status'], ['publishing', 'processing'], true)) echo $btn('delete', 'Löschen', 'danger', 'Beitrag wirklich löschen?');
    echo '</div></header><div class="detail"><div class="col">';
    if ($p['type'] === 'video') {
        if (!empty($p['file']) && is_file(pp_video_path($p['file']))) echo '<video class="big" controls playsinline preload="metadata" src="media.php?f=' . h($p['file']) . '"></video>';
        else echo '<div class="notice">Videodatei ist nicht mehr auf dem Server (nach Veröffentlichung automatisch gelöscht).</div>';
    } else {
        echo '<div class="imgs big">';
        foreach ($p['images'] as $im) echo '<img src="media/' . h($im) . '" alt="">';
        echo '</div>';
    }
    echo '</div><div class="col">';
    if (!empty($p['error']) && in_array($p['status'], ['failed', 'scheduled'], true)) echo '<div class="flash err">' . h($p['error']) . '</div>';
    if ($p['status'] === 'inbox') echo '<div class="notice">Der Entwurf liegt im TikTok-Postfach. Öffne die TikTok-App (Benachrichtigung), füge den Text ein und veröffentliche.</div>';
    if (!empty($p['url'])) echo '<a class="btn primary" target="_blank" rel="noopener" href="' . h($p['url']) . '">Auf TikTok ansehen ↗</a>';
    echo '<section class="card"><dl class="kv">'
        . '<dt>Zeitpunkt</dt><dd>' . h(pp_fmt_time($p['publish_at'], 'l, d.m.Y H:i')) . '</dd>'
        . '<dt>Konto</dt><dd>' . ($p['account_name'] ? '@' . h($p['account_name']) : '–') . '</dd>'
        . '<dt>Art</dt><dd>' . ($p['mode'] === 'draft' ? 'Entwurf ins TikTok-Postfach' : 'Direkt veröffentlichen') . '</dd>'
        . '<dt>Sichtbarkeit</dt><dd>' . h(PP_PRIVACY[$p['privacy']] ?? $p['privacy']) . '</dd>'
        . '<dt>Optionen</dt><dd>' . implode(', ', array_filter([$p['is_aigc'] ? 'KI-Kennzeichnung' : '', $p['disable_comment'] ? 'Kommentare aus' : '', !empty($p['disable_duet']) ? 'Duett aus' : '', !empty($p['disable_stitch']) ? 'Stitch aus' : '', $p['brand_content'] ? 'Bezahlte Partnerschaft' : '', $p['brand_organic'] ? 'Eigene Marke' : ''])) . '</dd>'
        . '<dt>Quelle</dt><dd>' . h(['ui' => 'Oberfläche', 'api' => 'API', 'claude' => 'Claude'][$p['source'] ?? 'ui'] ?? '') . '</dd>'
        . (!empty($p['note']) ? '<dt>Notiz</dt><dd>' . h($p['note']) . '</dd>' : '')
        . '</dl></section>';
    if (!empty($p['title'])) echo '<section class="card"><h2>Titel</h2><p>' . h($p['title']) . '</p></section>';
    echo '<section class="card"><h2>Beschreibung <button type="button" class="btn ghost sm copy" data-copy="' . h($p['caption']) . '">Kopieren</button></h2><p class="pre">' . h($p['caption']) . '</p></section>';
    echo '<section class="card"><h2>Verlauf</h2><ul class="hist">';
    foreach (array_reverse($p['history'] ?? []) as $hh) echo '<li><span>' . date('d.m. H:i', $hh['t']) . '</span> ' . h($hh['msg']) . '</li>';
    echo '</ul></section></div></div>';
    if (in_array($p['status'], ['publishing', 'processing'], true)) echo '<meta http-equiv="refresh" content="15">';
}

/* ------------------------------------------------------------- Konten */
function page_accounts(array $accounts): void
{
    echo '<header class="top"><h1>TikTok-Konten</h1>';
    if (tt_configured()) echo '<a class="btn primary" href="oauth.php?start=1&csrf=' . h(pp_csrf()) . '">TikTok-Konto verbinden</a>';
    echo '</header>';
    if (!tt_configured()) { echo '<div class="notice">Zuerst unter <a href="index.php?p=settings">Einstellungen</a> Client Key und Client Secret der TikTok-App eintragen.</div>'; return; }
    if (!$accounts) echo '<div class="card"><p>Noch kein Konto verbunden. Tippe auf „TikTok-Konto verbinden“, melde dich bei TikTok an und erlaube alle Berechtigungen.</p></div>';
    echo '<div class="grid">';
    foreach ($accounts as $a) {
        $ci = $a['creator_info'] ?? [];
        echo '<section class="card acc"><div class="acchead">' . (!empty($a['avatar']) ? '<img src="' . h($a['avatar']) . '" alt="" referrerpolicy="no-referrer">' : '<div class="avatar">' . icon('accounts') . '</div>')
            . '<div><b>' . h($a['display_name'] ?? '') . '</b><br><span class="muted">@' . h($a['username'] ?? '') . '</span></div></div>';
        if (!empty($a['auth_error'])) echo '<div class="flash err">' . h($a['auth_error']) . ' – bitte neu verbinden.</div>';
        echo '<dl class="kv"><dt>Verbunden seit</dt><dd>' . h(pp_fmt_time($a['connected_at'] ?? null, 'd.m.Y')) . '</dd>'
            . '<dt>Anmeldung gültig bis</dt><dd>' . h(pp_fmt_time($a['refresh_expires_at'] ?? null, 'd.m.Y')) . '</dd>'
            . '<dt>Sichtbarkeiten</dt><dd>' . h(implode(', ', array_map(fn($o) => PP_PRIVACY[$o] ?? $o, $ci['privacy_level_options'] ?? [])) ?: '–') . '</dd>'
            . '<dt>Max. Videolänge</dt><dd>' . (isset($ci['max_video_post_duration_sec']) ? (int)$ci['max_video_post_duration_sec'] . ' s' : '–') . '</dd>'
            . '<dt>Berechtigungen</dt><dd class="small">' . h(str_replace(',', ', ', (string)($a['scope'] ?? ''))) . '</dd></dl><div class="actions">'
            . '<form method="post">' . csrf_field() . '<input type="hidden" name="do" value="refresh_account"><input type="hidden" name="open_id" value="' . h($a['open_id']) . '"><button class="btn ghost sm">Aktualisieren</button></form>'
            . '<a class="btn ghost sm" href="oauth.php?start=1&csrf=' . h(pp_csrf()) . '">Neu verbinden</a>'
            . '<form method="post" data-confirm="Konto trennen? Geplante Beiträge für dieses Konto schlagen dann fehl.">' . csrf_field() . '<input type="hidden" name="do" value="disconnect"><input type="hidden" name="open_id" value="' . h($a['open_id']) . '"><button class="btn danger sm">Trennen</button></form>'
            . '</div></section>';
    }
    echo '</div>';
}

/* ------------------------------------------------------------ Statistik */
function fmt_n($n): string
{
    if ($n === null) return '–';
    $n = (int)$n;
    if (abs($n) >= 1000000) return str_replace('.', ',', (string)round($n / 1000000, 1)) . ' Mio.';
    if (abs($n) >= 10000) return str_replace('.', ',', (string)round($n / 1000, 1)) . ' Tsd.';
    return number_format($n, 0, ',', '.');
}

function delta($d): string
{
    if ($d === null) return '';
    return '<span class="delta ' . ($d > 0 ? 'up' : ($d < 0 ? 'down' : '')) . '">' . ($d > 0 ? '+' : '') . fmt_n($d) . '</span>';
}

function page_stats(array $accounts): void
{
    echo '<header class="top"><h1>Statistik</h1>';
    if (!$accounts) { echo '</header><div class="notice">Noch kein Konto verbunden. <a href="index.php?p=accounts">Konto verbinden</a></div>'; return; }
    $acc = $accounts[$_GET['a'] ?? ''] ?? reset($accounts);
    echo '<div class="actions">';
    if (count($accounts) > 1) {
        echo '<form><input type="hidden" name="p" value="stats"><select name="a" onchange="this.form.submit()">';
        foreach ($accounts as $a) echo '<option value="' . h($a['open_id']) . '"' . ($a['open_id'] === $acc['open_id'] ? ' selected' : '') . '>@' . h($a['username'] ?? '') . '</option>';
        echo '</select></form>';
    }
    echo '<form method="post">' . csrf_field() . '<input type="hidden" name="do" value="refresh_account"><input type="hidden" name="back" value="stats"><input type="hidden" name="open_id" value="' . h($acc['open_id']) . '"><button class="btn ghost">Aktualisieren</button></form></div></header>';
    $s = pp_stats_summary($acc['open_id']);
    $c = $s['current'];
    echo '<div class="kpis">';
    foreach ([['Follower', 'followers'], ['Likes gesamt', 'likes'], ['Videos', 'videos']] as [$l, $k]) {
        echo '<div class="kpi"><span>' . $l . '</span><b>' . fmt_n($c[$k] ?? null) . '</b><small>7 Tage ' . (delta($s['change_7d'][$k] ?? null) ?: '–') . ' · 30 Tage ' . (delta($s['change_30d'][$k] ?? null) ?: '–') . '</small></div>';
    }
    $t = $s['video_totals'] ?? null;
    echo '<div class="kpi"><span>Aufrufe (letzte ' . count($s['videos'] ?? []) . ' Videos)</span><b>' . fmt_n($t['views'] ?? null) . '</b><small>Interaktionsrate ' . ($s['engagement_rate'] !== null && isset($s['engagement_rate']) ? str_replace('.', ',', (string)$s['engagement_rate']) . ' %' : '–') . '</small></div></div>';
    if (!empty($s['videos_error'])) echo '<div class="flash err">Videos konnten nicht geladen werden: ' . h($s['videos_error']) . '</div>';

    // Follower-Verlauf
    $hist = array_slice($s['history'], -60, null, true);
    echo '<section class="card"><h2>Follower-Verlauf</h2>';
    if (count($hist) < 2) echo '<p class="muted">Der Verlauf füllt sich ab jetzt jeden Tag automatisch.</p>';
    else echo line_chart($hist);
    echo '</section>';

    if (!empty($s['best_times']['based_on_videos'])) {
        $bt = $s['best_times'];
        echo '<section class="card"><h2>Beste Uhrzeiten <span class="muted small">Ø Aufrufe nach Veröffentlichungszeit (' . (int)$bt['based_on_videos'] . ' Videos)</span></h2>';
        if ($bt['top_hours']) echo '<p>Am besten liefen deine Videos um <b>' . h(implode(', ', $bt['top_hours'])) . '</b> Uhr.</p>';
        echo bar_chart($bt['hours']);
        echo '</section>';
    }

    echo '<section class="card"><h2>Letzte Videos</h2><div class="tablewrap"><table class="tbl"><thead><tr><th>Video</th><th>Datum</th><th>Aufrufe</th><th>Likes</th><th>Komm.</th><th>Geteilt</th><th>Rate</th></tr></thead><tbody>';
    foreach (($s['videos'] ?? []) as $vd) {
        $views = (int)($vd['view_count'] ?? 0);
        $rate = $views ? round((($vd['like_count'] ?? 0) + ($vd['comment_count'] ?? 0) + ($vd['share_count'] ?? 0)) / $views * 100, 1) : null;
        echo '<tr><td class="vcell">' . (!empty($vd['cover_image_url']) ? '<img src="' . h($vd['cover_image_url']) . '" alt="" referrerpolicy="no-referrer" loading="lazy">' : '')
            . '<a href="' . h($vd['share_url'] ?? '#') . '" target="_blank" rel="noopener">' . h(mb_strimwidth((string)($vd['title'] ?? $vd['video_description'] ?? ''), 0, 70, '…') ?: 'Video') . '</a></td>'
            . '<td>' . h(pp_fmt_time((int)($vd['create_time'] ?? 0), 'd.m. H:i')) . '</td><td>' . fmt_n($views) . '</td><td>' . fmt_n($vd['like_count'] ?? null) . '</td><td>' . fmt_n($vd['comment_count'] ?? null) . '</td><td>' . fmt_n($vd['share_count'] ?? null) . '</td><td>' . ($rate !== null ? str_replace('.', ',', (string)$rate) . ' %' : '–') . '</td></tr>';
    }
    if (empty($s['videos'])) echo '<tr><td colspan="7" class="muted">Keine Videos gefunden.</td></tr>';
    echo '</tbody></table></div></section>';
}

function line_chart(array $hist): string
{
    $vals = array_map(fn($x) => (int)$x['followers'], $hist);
    $min = min($vals); $max = max($vals);
    if ($max === $min) { $max++; $min = max(0, $min - 1); }
    $w = 640; $hgt = 180; $n = count($vals);
    $pts = []; $i = 0;
    foreach ($vals as $v) { $pts[] = round($i++ / max(1, $n - 1) * ($w - 20) + 10, 1) . ',' . round($hgt - 20 - ($v - $min) / ($max - $min) * ($hgt - 40), 1); }
    $keys = array_keys($hist);
    return '<svg class="chart" viewBox="0 0 ' . $w . ' ' . $hgt . '" role="img" aria-label="Follower-Verlauf">'
        . '<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" points="' . implode(' ', $pts) . '"/>'
        . '<polygon fill="var(--accent)" opacity=".08" points="10,' . ($hgt - 20) . ' ' . implode(' ', $pts) . ' ' . ($w - 10) . ',' . ($hgt - 20) . '"/>'
        . '<text x="10" y="14" class="ct">' . fmt_n($max) . '</text><text x="10" y="' . ($hgt - 4) . '" class="ct">' . h(date('d.m.', strtotime($keys[0]))) . '</text>'
        . '<text x="' . ($w - 10) . '" y="' . ($hgt - 4) . '" class="ct" text-anchor="end">' . h(date('d.m.', strtotime(end($keys)))) . ' · ' . fmt_n(end($vals)) . '</text></svg>';
}

function bar_chart(array $hours): string
{
    $max = max(1, max(array_column($hours, 'avg_views')));
    $out = '<div class="bars">';
    foreach ($hours as $hr => $x) {
        $pct = round($x['avg_views'] / $max * 100);
        $out .= '<div class="bar" title="' . sprintf('%02d', $hr) . ' Uhr: Ø ' . fmt_n($x['avg_views']) . ' Aufrufe (' . $x['videos'] . ' Videos)"><i style="height:' . max($x['videos'] ? 3 : 0, $pct) . '%"></i><span>' . ($hr % 3 === 0 ? $hr : '') . '</span></div>';
    }
    return $out . '</div>';
}

/* --------------------------------------------------------- Einstellungen */
function page_settings(): void
{
    $base = pp_base_url();
    echo '<header class="top"><h1>Einstellungen</h1></header>';
    $nk = $_SESSION['pp_new_key'] ?? null;
    unset($_SESSION['pp_new_key']);

    echo '<form method="post" class="card">' . csrf_field() . '<input type="hidden" name="do" value="settings"><h2>TikTok-App</h2>'
        . '<p class="muted small">Aus dem <a href="https://developers.tiktok.com/apps" target="_blank" rel="noopener">TikTok-Entwicklerportal</a> (Anleitung in README.md).</p>'
        . '<div class="two"><label>Client Key<input name="client_key" value="' . h(cfg('client_key', '')) . '" autocomplete="off"></label>'
        . '<label>Client Secret<input name="client_secret" type="password" placeholder="' . (cfg('client_secret') ? '•••••••• (gespeichert)' : '') . '" autocomplete="off"></label></div>'
        . '<label>Redirect URI <span class="muted">(so im Entwicklerportal eintragen)</span><div class="copyline"><code>' . h(tt_redirect_uri()) . '</code><button type="button" class="btn ghost sm copy" data-copy="' . h(tt_redirect_uri()) . '">Kopieren</button></div></label>'
        . '<label>Domain-Bestätigung für Fotos <span class="muted">(URL-Präfix im Entwicklerportal)</span><div class="copyline"><code>' . h($base . '/media/') . '</code></div></label>'
        . '<label>Öffentliche Adresse dieses Tools <span class="muted">(leer = automatisch)</span><input name="base_url" value="' . h(cfg('base_url', '')) . '" placeholder="' . h($base) . '"></label>'
        . '<label class="chk"><input type="checkbox" name="unaudited"' . (cfg('unaudited') ? ' checked' : '') . '> App ist noch nicht von TikTok freigegeben (Direkt-Beiträge nur privat)</label>'
        . '<details><summary>Berechtigungen (Scopes)</summary><input name="scopes" value="' . h(cfg('scopes', TT_DEFAULT_SCOPES)) . '"></details>'
        . '<h2>Standardwerte</h2><div class="two">'
        . '<label>Zeitzone<input name="timezone" value="' . h(date_default_timezone_get()) . '" list="tzs"></label>'
        . '<label>Sichtbarkeit<select name="default_privacy">';
    foreach (PP_PRIVACY as $k => $l) echo '<option value="' . $k . '"' . (cfg('default_privacy', 'PUBLIC_TO_EVERYONE') === $k ? ' selected' : '') . '>' . $l . '</option>';
    echo '</select></label><label>Art<select name="default_mode"><option value="direct">Direkt veröffentlichen</option><option value="draft"' . (cfg('default_mode') === 'draft' ? ' selected' : '') . '>Entwurf ins TikTok-Postfach</option></select></label>'
        . '<label>Videos nach Veröffentlichung löschen nach (Tagen, 0 = nie)<input type="number" min="0" name="keep_days" value="' . (int)cfg('keep_days', 14) . '"></label>'
        . '<label>Warnung ab Beiträgen pro Tag<input type="number" min="1" name="daily_cap" value="' . (int)cfg('daily_cap', 15) . '"></label>'
        . '<label>Standard-Hashtags für neue Beiträge<input name="default_hashtags" value="' . h(cfg('default_hashtags', '')) . '" placeholder="#wusstestdu #fakten"></label></div>'
        . '<label class="chk"><input type="checkbox" name="default_aigc"' . (cfg('default_aigc') ? ' checked' : '') . '> Neue Beiträge standardmäßig als KI-generiert kennzeichnen</label>'
        . '<label class="chk"><input type="checkbox" name="review_external"' . (cfg('review_external') ? ' checked' : '') . '> Beiträge von Claude/API erst nach meiner Freigabe veröffentlichen</label>'
        . '<datalist id="tzs"><option>Europe/Copenhagen</option><option>Europe/Berlin</option><option>Europe/Vienna</option><option>Europe/Zurich</option></datalist>'
        . '<button class="btn primary">Speichern</button></form>';

    echo '<section class="card" id="keys"><h2>Claude &amp; API-Zugang</h2>';
    if ($nk) {
        $mcp = $base . '/mcp.php?key=' . $nk['key'];
        echo '<div class="newkey"><p><b>Neuer Schlüssel „' . h($nk['name']) . '“</b> – nur jetzt sichtbar:</p>'
            . '<label>Connector-Adresse für claude.ai (Einstellungen → Connectors → Eigenen Connector hinzufügen)<div class="copyline"><code>' . h($mcp) . '</code><button type="button" class="btn ghost sm copy" data-copy="' . h($mcp) . '">Kopieren</button></div></label>'
            . '<label>API-Schlüssel (für curl/REST)<div class="copyline"><code>' . h($nk['key']) . '</code><button type="button" class="btn ghost sm copy" data-copy="' . h($nk['key']) . '">Kopieren</button></div></label>'
            . '<p class="muted small">Wer diese Adresse kennt, kann in deinem Namen auf TikTok posten. Nicht weitergeben.</p></div>';
    }
    $keys = (array)cfg('api_keys', []);
    if ($keys) {
        echo '<table class="tbl"><thead><tr><th>Name</th><th>Erstellt</th><th>Zuletzt benutzt</th><th></th></tr></thead><tbody>';
        foreach ($keys as $k) {
            echo '<tr><td>' . h($k['name']) . '</td><td>' . h(pp_fmt_time($k['created'], 'd.m.Y')) . '</td><td>' . h(pp_fmt_time($k['last_used'] ?? null)) . '</td><td><form method="post" data-confirm="Schlüssel sperren?">' . csrf_field()
                . '<input type="hidden" name="do" value="revoke_key"><input type="hidden" name="kid" value="' . h($k['id']) . '"><button class="btn danger sm">Sperren</button></form></td></tr>';
        }
        echo '</tbody></table>';
    }
    echo '<form method="post" class="inline">' . csrf_field() . '<input type="hidden" name="do" value="new_key"><input name="name" value="Claude" aria-label="Name"><button class="btn primary">Schlüssel erzeugen</button></form>'
        . '<p class="muted small">Enthält der Name „Claude“, werden die Beiträge im Planer als „Claude“ markiert.</p></section>';

    $cronUrl = $base . '/cron.php?key=' . cfg('cron_key');
    echo '<section class="card"><h2>Zeitplan (Cronjob)</h2><p>Damit Beiträge pünktlich erscheinen, muss jede Minute (oder alle 5 Minuten) diese Adresse aufgerufen werden – im Cronjob-Bereich deines Webhosters oder bei einem kostenlosen Dienst wie cron-job.org:</p>'
        . '<div class="copyline"><code>' . h($cronUrl) . '</code><button type="button" class="btn ghost sm copy" data-copy="' . h($cronUrl) . '">Kopieren</button></div>'
        . '<p class="muted small">Alternativ als Befehl: <code>php ' . h(PP_ROOT) . '/cron.php</code> · Zuletzt gelaufen: ' . h(pp_fmt_time((int)cfg('last_tick', 0) ?: null)) . '</p></section>';

    echo '<form method="post" class="card">' . csrf_field() . '<input type="hidden" name="do" value="password"><h2>Passwort ändern</h2><div class="two">'
        . '<label>Altes Passwort<input type="password" name="old" autocomplete="current-password"></label><label>Neues Passwort<input type="password" name="new" autocomplete="new-password"></label></div>'
        . '<button class="btn ghost">Ändern</button></form>';
    echo '<p class="muted small">Postwerk ' . PP_VERSION . ' · PHP ' . PHP_VERSION . ' · upload_max_filesize ' . h(ini_get('upload_max_filesize')) . ' (Videos werden in Teilen hochgeladen, die Grenze spielt keine Rolle)</p>';
}

function page_log(): void
{
    $f = PP_DATA . '/log.txt';
    $lines = is_file($f) ? array_slice(file($f), -200) : [];
    echo '<header class="top"><h1>Protokoll</h1></header><section class="card"><pre class="log">' . h(implode('', array_reverse($lines)) ?: 'Leer.') . '</pre></section>';
}
