<?php
/**
 * Wunsch-Fabrik.dk – Admin API
 * Login, Kontaktanfragen, Statistiken
 */

header('Content-Type: application/json');
session_start();
require_once __DIR__ . '/db.php';

$mysqli = wf_db_connect();
if (!$mysqli) {
    echo json_encode(['ok' => false, 'error' => 'DB connection failed']);
    exit;
}
wf_ensure_tables($mysqli);

$action = $_REQUEST['action'] ?? '';

// ─── LOGIN ─────────────────────────────────────────────────────────
if ($action === 'login') {
    $username = trim($_POST['username'] ?? '');
    $password = (string)($_POST['password'] ?? '');
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);

    // Schutz gegen Passwort-Raten: max. 8 Fehlversuche je IP in 15 Minuten
    $mysqli->query("DELETE FROM admin_login_attempts WHERE at < (NOW() - INTERVAL 1 DAY)");
    $stmt = $mysqli->prepare("SELECT COUNT(*) AS c FROM admin_login_attempts WHERE ip = ? AND at >= (NOW() - INTERVAL 15 MINUTE)");
    $stmt->bind_param('s', $ip);
    $stmt->execute();
    $fails = (int)($stmt->get_result()->fetch_assoc()['c'] ?? 0);
    $stmt->close();
    if ($fails >= 8) {
        echo json_encode(['ok' => false, 'error' => 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.']);
        exit;
    }

    $stmt = $mysqli->prepare("SELECT id, password_hash, active FROM admin_users WHERE username = ?");
    $stmt->bind_param('s', $username);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();

    // Alte Logins haben das Passwort beim Speichern getrimmt – beides zulassen
    $okPass = $user && (password_verify($password, $user['password_hash']) || password_verify(trim($password), $user['password_hash']));
    if ($okPass && !(int)$user['active']) {
        echo json_encode(['ok' => false, 'error' => 'Dieses Konto ist gesperrt. Bitte an den Inhaber wenden.']);
        exit;
    }
    if ($okPass) {
        session_regenerate_id(true);
        $_SESSION['wf_admin_id'] = $user['id'];
        $_SESSION['wf_admin_user'] = $username;
        $me = wf_admin_current($mysqli);
        $_SESSION['wf_admin_name'] = $me['display_name'];
        $_SESSION['wf_admin_orders'] = in_array('auftraege', $me['perms'], true);
        $now = date('Y-m-d H:i:s');
        $stmt = $mysqli->prepare("UPDATE admin_users SET last_login = ? WHERE id = ?");
        $stmt->bind_param('si', $now, $user['id']);
        $stmt->execute();
        $stmt->close();
        $stmt = $mysqli->prepare("DELETE FROM admin_login_attempts WHERE ip = ?");
        $stmt->bind_param('s', $ip);
        $stmt->execute();
        $stmt->close();
        wf_orders_app_sync($me['id'], $me['display_name'], $_SESSION['wf_admin_orders']);
        wf_admin_log($mysqli, 'login', 'Angemeldet');
        echo json_encode(['ok' => true]);
    } else {
        $now = date('Y-m-d H:i:s');
        $stmt = $mysqli->prepare("INSERT INTO admin_login_attempts (ip, username, at) VALUES (?, ?, ?)");
        $u64 = mb_substr($username, 0, 64);
        $stmt->bind_param('sss', $ip, $u64, $now);
        $stmt->execute();
        $stmt->close();
        echo json_encode(['ok' => false, 'error' => 'Benutzername oder Passwort falsch']);
    }
    exit;
}

// ─── LOGOUT ────────────────────────────────────────────────────────
if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    // Auch die Auftrags-App auf diesem Gerät abmelden (Cookie „Gerät merken“ gilt nur im Ordner auftraege/)
    $appPath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/auftraege/';
    setcookie('wf_auftraege_device', '', ['expires' => time() - 3600, 'path' => $appPath, 'httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
    echo json_encode(['ok' => true]);
    exit;
}

// ─── AUTH CHECK für alle weiteren Aktionen ──────────────────────────
$me = wf_admin_current($mysqli);
if (!$me) {
    $_SESSION = [];
    echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet', 'auth' => false]);
    exit;
}

/** Bricht ab, wenn der Benutzer den Bereich nicht bearbeiten darf. */
function wf_need($area) {
    global $me;
    if ($me['role'] === 'admin') return;
    if ($area === 'owner' || !in_array($area, $me['perms'], true)) {
        echo json_encode(['ok' => false, 'error' => 'Dafür fehlt dir die Berechtigung.', 'forbidden' => true]);
        exit;
    }
}

$areaOf = [
    'inquiries' => 'inquiries', 'set_status' => 'inquiries', 'delete_inquiry' => 'inquiries',
    'stats' => 'overview', 'live_monitor' => 'overview', 'visitor_countries' => 'overview',
    'template_list' => 'calculator', 'template_load' => 'calculator', 'template_save' => 'calculator', 'template_delete' => 'calculator',
    'debug_push' => 'owner', 'debug_mail' => 'owner', 'debug_geo' => 'owner',
    'get_notify_settings' => 'owner', 'set_notify_settings' => 'owner', 'send_test_push' => 'owner',
    'team_list' => 'owner', 'team_save' => 'owner', 'team_password' => 'owner', 'team_delete' => 'owner', 'activity' => 'owner',
];
if (isset($areaOf[$action])) {
    wf_need($areaOf[$action]);
}

// ─── CHECK SESSION (für Page-Load) ──────────────────────────────────
if ($action === 'check') {
    $_SESSION['wf_admin_name'] = $me['display_name'];
    $_SESSION['wf_admin_orders'] = in_array('auftraege', $me['perms'], true);
    echo json_encode([
        'ok' => true,
        'user' => $me['name'],
        'me' => ['id' => (int)$me['id'], 'username' => $me['username'], 'name' => $me['name'], 'role' => $me['role'], 'perms' => $me['perms'], 'color' => $me['color']],
        'areas' => wf_admin_areas(),
    ]);
    exit;
}

// ─── MITARBEITER: Liste ─────────────────────────────────────────────
if ($action === 'team_list') {
    $rows = [];
    $res = $mysqli->query("SELECT id, username, display_name, email, role, perms, color, active, last_login, created_at, created_by FROM admin_users ORDER BY role = 'admin' DESC, active DESC, display_name, username");
    while ($r = $res->fetch_assoc()) {
        $r['id'] = (int)$r['id'];
        $r['active'] = (int)$r['active'];
        $r['perms'] = $r['role'] === 'admin' ? array_keys(wf_admin_areas()) : (json_decode((string)$r['perms'], true) ?: []);
        $rows[] = $r;
    }
    // Aktivität der letzten 30 Tage je Benutzer (für die Karten)
    $counts = [];
    $res = $mysqli->query("SELECT user_id, COUNT(*) AS c, MAX(at) AS last FROM admin_activity WHERE at >= (NOW() - INTERVAL 30 DAY) GROUP BY user_id");
    while ($r = $res->fetch_assoc()) $counts[(int)$r['user_id']] = ['count' => (int)$r['c'], 'last' => $r['last']];
    echo json_encode(['ok' => true, 'team' => $rows, 'activity' => $counts, 'areas' => wf_admin_areas(), 'defaults' => wf_admin_default_perms(), 'me' => (int)$me['id']]);
    exit;
}

// ─── MITARBEITER: anlegen / ändern ──────────────────────────────────
if ($action === 'team_save') {
    $id       = (int)($_POST['id'] ?? 0);
    $username = mb_strtolower(trim($_POST['username'] ?? ''));
    $name     = mb_substr(trim($_POST['display_name'] ?? ''), 0, 100);
    $email    = mb_substr(trim($_POST['email'] ?? ''), 0, 255);
    $role     = ($_POST['role'] ?? '') === 'admin' ? 'admin' : 'mitarbeiter';
    $color    = preg_match('/^#[0-9a-fA-F]{6}$/', $_POST['color'] ?? '') ? $_POST['color'] : '#A855F7';
    $active   = !empty($_POST['active']) ? 1 : 0;
    $password = (string)($_POST['password'] ?? '');
    $perms    = array_values(array_intersect(array_keys(wf_admin_areas()), (array)json_decode($_POST['perms'] ?? '[]', true)));

    if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) {
        echo json_encode(['ok' => false, 'error' => 'Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen, Punkt, Minus, Unterstrich.']);
        exit;
    }
    if ($name === '') {
        echo json_encode(['ok' => false, 'error' => 'Bitte einen Namen eintragen (erscheint bei Aufträgen und Rechnungen).']);
        exit;
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['ok' => false, 'error' => 'E-Mail-Adresse ist ungültig.']);
        exit;
    }
    if ($id === 0 && mb_strlen($password) < 8) {
        echo json_encode(['ok' => false, 'error' => 'Startpasswort: mindestens 8 Zeichen.']);
        exit;
    }
    $stmt = $mysqli->prepare("SELECT id FROM admin_users WHERE username = ? AND id <> ?");
    $stmt->bind_param('si', $username, $id);
    $stmt->execute();
    $taken = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($taken) {
        echo json_encode(['ok' => false, 'error' => 'Dieser Benutzername ist schon vergeben.']);
        exit;
    }
    // Sich selbst nicht aussperren
    if ($id === (int)$me['id'] && ($role !== 'admin' || !$active)) {
        echo json_encode(['ok' => false, 'error' => 'Du kannst dich nicht selbst sperren oder dir die Inhaber-Rechte nehmen.']);
        exit;
    }
    $permsJson = json_encode($perms);
    if ($id > 0) {
        $stmt = $mysqli->prepare("UPDATE admin_users SET username = ?, display_name = ?, email = ?, role = ?, perms = ?, color = ?, active = ? WHERE id = ?");
        $stmt->bind_param('ssssssii', $username, $name, $email, $role, $permsJson, $color, $active, $id);
        $stmt->execute();
        $stmt->close();
        wf_admin_log($mysqli, 'team', 'Mitarbeiter geändert: ' . $name . ($active ? '' : ' (gesperrt)'));
    } else {
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $now = date('Y-m-d H:i:s');
        $by = $me['name'];
        $stmt = $mysqli->prepare("INSERT INTO admin_users (username, password_hash, created_at, display_name, email, role, perms, color, active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('ssssssssis', $username, $hash, $now, $name, $email, $role, $permsJson, $color, $active, $by);
        $stmt->execute();
        $id = (int)$stmt->insert_id;
        $stmt->close();
        wf_admin_log($mysqli, 'team', 'Mitarbeiter angelegt: ' . $name);
    }
    wf_orders_app_sync($id, $name, $active && ($role === 'admin' || in_array('auftraege', $perms, true)));
    echo json_encode(['ok' => true, 'id' => $id]);
    exit;
}

// ─── MITARBEITER: Passwort neu setzen ───────────────────────────────
if ($action === 'team_password') {
    $id = (int)($_POST['id'] ?? 0);
    $password = (string)($_POST['password'] ?? '');
    if (mb_strlen($password) < 8) {
        echo json_encode(['ok' => false, 'error' => 'Neues Passwort: mindestens 8 Zeichen.']);
        exit;
    }
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $mysqli->prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?");
    $stmt->bind_param('si', $hash, $id);
    $stmt->execute();
    $stmt->close();
    wf_admin_log($mysqli, 'team', 'Passwort neu gesetzt für Benutzer #' . $id);
    echo json_encode(['ok' => true]);
    exit;
}

// ─── MITARBEITER: löschen ───────────────────────────────────────────
if ($action === 'team_delete') {
    $id = (int)($_POST['id'] ?? 0);
    if ($id === (int)$me['id']) {
        echo json_encode(['ok' => false, 'error' => 'Du kannst dich nicht selbst löschen.']);
        exit;
    }
    $stmt = $mysqli->prepare("SELECT display_name, username FROM admin_users WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$u) {
        echo json_encode(['ok' => false, 'error' => 'Benutzer nicht gefunden.']);
        exit;
    }
    $stmt = $mysqli->prepare("DELETE FROM admin_users WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    $name = $u['display_name'] ?: $u['username'];
    // In der Auftrags-App bleibt der Name in der Historie stehen, das Konto wird dort nur deaktiviert.
    wf_orders_app_sync($id, $name, false);
    wf_admin_log($mysqli, 'team', 'Mitarbeiter gelöscht: ' . $name);
    echo json_encode(['ok' => true]);
    exit;
}

// ─── AKTIVITÄTEN-PROTOKOLL ──────────────────────────────────────────
if ($action === 'activity') {
    $uid = (int)($_REQUEST['user_id'] ?? 0);
    $rows = [];
    if ($uid > 0) {
        $stmt = $mysqli->prepare("SELECT at, user_id, user_name, area, what FROM admin_activity WHERE user_id = ? ORDER BY at DESC LIMIT 100");
        $stmt->bind_param('i', $uid);
        $stmt->execute();
        $res = $stmt->get_result();
    } else {
        $res = $mysqli->query("SELECT at, user_id, user_name, area, what FROM admin_activity ORDER BY at DESC LIMIT 100");
    }
    while ($r = $res->fetch_assoc()) $rows[] = $r;
    echo json_encode(['ok' => true, 'activity' => $rows]);
    exit;
}

// ─── INQUIRIES LISTE ────────────────────────────────────────────────
if ($action === 'inquiries') {
    $result = $mysqli->query("SELECT * FROM inquiries ORDER BY created_at DESC LIMIT 200");
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    echo json_encode(['ok' => true, 'inquiries' => $rows]);
    exit;
}

// ─── INQUIRY STATUS ÄNDERN ──────────────────────────────────────────
if ($action === 'set_status') {
    $id     = (int)($_POST['id'] ?? 0);
    $status = trim($_POST['status'] ?? '');
    $allowed = ['new', 'in_progress', 'done', 'archived'];
    if (!$id || !in_array($status, $allowed, true)) {
        echo json_encode(['ok' => false, 'error' => 'Ungültige Daten']);
        exit;
    }
    $stmt = $mysqli->prepare("UPDATE inquiries SET status = ? WHERE id = ?");
    $stmt->bind_param('si', $status, $id);
    $stmt->execute();
    $stmt->close();
    wf_admin_log($mysqli, 'inquiries', 'Anfrage #' . $id . ' → ' . $status);

    // Kunde automatisch benachrichtigen bei "in Bearbeitung" oder "erledigt"
    if (in_array($status, ['in_progress', 'done'], true)) {
        $stmt = $mysqli->prepare("SELECT name, email, lang FROM inquiries WHERE id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $inquiry = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($inquiry) {
            wf_send_customer_mail($inquiry['email'], $inquiry['name'], $inquiry['lang'] ?? 'de', $status);
        }
    }

    echo json_encode(['ok' => true]);
    exit;
}

// ─── INQUIRY LÖSCHEN ────────────────────────────────────────────────
if ($action === 'delete_inquiry') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) {
        echo json_encode(['ok' => false, 'error' => 'Ungültige ID']);
        exit;
    }
    $stmt = $mysqli->prepare("DELETE FROM inquiries WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    wf_admin_log($mysqli, 'inquiries', 'Anfrage #' . $id . ' gelöscht');
    echo json_encode(['ok' => true]);
    exit;
}

// ─── STATISTIKEN ────────────────────────────────────────────────────
if ($action === 'stats') {
    // Gesamtbesucher
    $total = (int)($mysqli->query("SELECT COUNT(*) AS c FROM visits")->fetch_assoc()['c'] ?? 0);

    // Online jetzt
    $online = (int)($mysqli->query("
        SELECT COUNT(DISTINCT session_id) AS c FROM visits
        WHERE last_seen >= (NOW() - INTERVAL 5 MINUTE)
    ")->fetch_assoc()['c'] ?? 0);

    // Besuche der letzten 14 Tage (nach first_seen gruppiert)
    $daily = [];
    $result = $mysqli->query("
        SELECT DATE(first_seen) AS day, COUNT(*) AS cnt
        FROM visits
        WHERE first_seen >= (NOW() - INTERVAL 14 DAY)
        GROUP BY DATE(first_seen)
        ORDER BY day ASC
    ");
    while ($row = $result->fetch_assoc()) {
        $daily[] = ['date' => $row['day'], 'count' => (int)$row['cnt']];
    }

    // Anfragen-Statistiken
    $inquiryTotal = (int)($mysqli->query("SELECT COUNT(*) AS c FROM inquiries")->fetch_assoc()['c'] ?? 0);
    $inquiryNew   = (int)($mysqli->query("SELECT COUNT(*) AS c FROM inquiries WHERE status = 'new'")->fetch_assoc()['c'] ?? 0);

    // Ausstehende Bewertungen
    $reviewsPending = (int)($mysqli->query("SELECT COUNT(*) AS c FROM reviews WHERE status = 'pending'")->fetch_assoc()['c'] ?? 0);

    // Top Produkte
    $topProducts = [];
    $result = $mysqli->query("
        SELECT product, COUNT(*) AS cnt
        FROM inquiries
        WHERE product IS NOT NULL AND product != ''
        GROUP BY product
        ORDER BY cnt DESC
        LIMIT 6
    ");
    while ($row = $result->fetch_assoc()) {
        $topProducts[] = ['product' => $row['product'], 'count' => (int)$row['cnt']];
    }

    echo json_encode([
        'ok' => true,
        'visitors_total'  => $total,
        'visitors_online' => max(0, $online),
        'visitors_daily'  => $daily,
        'inquiries_total' => $inquiryTotal,
        'inquiries_new'   => $inquiryNew,
        'reviews_pending' => $reviewsPending,
        'top_products'    => $topProducts,
    ]);
    exit;
}

// ─── LIVE-MONITOR: aktuelle Online-Zahl + Verlauf der letzten Minuten ──
if ($action === 'live_monitor') {
    // Aktuell online (letzte 5 Minuten)
    $online = (int)($mysqli->query("
        SELECT COUNT(DISTINCT session_id) AS c FROM visits
        WHERE last_seen >= (NOW() - INTERVAL 5 MINUTE)
    ")->fetch_assoc()['c'] ?? 0);

    // Verlauf: Online-Zahl für jede der letzten 30 Minuten (1-Minuten-Schritte)
    $history = [];
    for ($i = 29; $i >= 0; $i--) {
        $minutesAgoStart = $i + 1;
        $minutesAgoEnd = $i;
        $stmt = $mysqli->prepare("
            SELECT COUNT(DISTINCT session_id) AS c FROM visits
            WHERE last_seen >= (NOW() - INTERVAL ? MINUTE)
            AND last_seen <= (NOW() - INTERVAL ? MINUTE)
        ");
        $stmt->bind_param('ii', $minutesAgoStart, $minutesAgoEnd);
        $stmt->execute();
        $cnt = (int)($stmt->get_result()->fetch_assoc()['c'] ?? 0);
        $stmt->close();
        $history[] = $cnt;
    }

    // Liste der aktuell Online mit Land/Region (für Live-Monitor)
    $onlineList = [];
    $listResult = $mysqli->query("
        SELECT country, country_code, region, city, last_seen
        FROM visits
        WHERE last_seen >= (NOW() - INTERVAL 5 MINUTE)
        ORDER BY last_seen DESC
        LIMIT 50
    ");
    while ($row = $listResult->fetch_assoc()) {
        $onlineList[] = [
            'country' => $row['country'],
            'country_code' => $row['country_code'],
            'region' => $row['region'],
            'city' => $row['city'],
        ];
    }

    echo json_encode(['ok' => true, 'online' => max(0, $online), 'history' => $history, 'online_list' => $onlineList]);
    exit;
}

// ─── DEBUG: Push-Status prüfen (temporär) ───────────────────────────
if ($action === 'debug_push') {
    $result = $mysqli->query("SELECT * FROM notify_settings WHERE id = 1");
    $settings = $result->fetch_assoc();

    $online = (int)($mysqli->query("
        SELECT COUNT(DISTINCT session_id) AS c FROM visits
        WHERE last_seen >= (NOW() - INTERVAL 5 MINUTE)
    ")->fetch_assoc()['c'] ?? 0);

    $curlAvailable = function_exists('curl_init');

    echo json_encode([
        'ok' => true,
        'settings' => $settings,
        'current_online' => $online,
        'curl_available' => $curlAvailable,
        'threshold_met' => $online >= (int)$settings['threshold'],
    ]);
    exit;
}

// ─── DEBUG: Mail-Versand testen (temporär) ──────────────────────────
if ($action === 'debug_mail') {
    $testEmail = trim($_POST['test_email'] ?? '');
    if (!$testEmail || !filter_var($testEmail, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['ok' => false, 'error' => 'Bitte gültige Test-E-Mail-Adresse angeben']);
        exit;
    }

    $mailFunctionExists = function_exists('mail');

    $subject = 'Test-Mail von Wunsch-Fabrik.dk Admin';
    $body = "Dies ist eine Testmail, um zu prüfen ob mail() auf dem Server funktioniert.\n\nZeitstempel: " . date('Y-m-d H:i:s');
    $headers  = "From: Wunsch-Fabrik.dk <hej@wunsch-fabrik.dk>\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    $sent = @mail($testEmail, $subject, $body, $headers);

    // Auch die wf_send_customer_mail Funktion testen
    $sent2 = wf_send_customer_mail($testEmail, 'Test Kunde', 'de', 'received');

    echo json_encode([
        'ok' => true,
        'mail_function_exists' => $mailFunctionExists,
        'direct_mail_sent' => $sent,
        'wf_send_customer_mail_sent' => $sent2,
        'php_mail_ini_sendmail_path' => ini_get('sendmail_path'),
        'php_mail_smtp' => ini_get('SMTP'),
    ]);
    exit;
}

// ─── DEBUG: IP & Geolocation prüfen (temporär) ──────────────────────
if ($action === 'debug_geo') {
    $candidates = [
        'HTTP_CF_CONNECTING_IP' => $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
        'HTTP_X_FORWARDED_FOR' => $_SERVER['HTTP_X_FORWARDED_FOR'] ?? null,
        'HTTP_X_REAL_IP' => $_SERVER['HTTP_X_REAL_IP'] ?? null,
        'HTTP_CLIENT_IP' => $_SERVER['HTTP_CLIENT_IP'] ?? null,
        'REMOTE_ADDR' => $_SERVER['REMOTE_ADDR'] ?? null,
    ];

    $testIp = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
    if ($testIp && strpos($testIp, ',') !== false) {
        $testIp = trim(explode(',', $testIp)[0]);
    }

    $geo = wf_geolocate_ip($testIp);

    // Direkte Rohantwort von ip-api.com für genauere Diagnose
    $rawResponse = null;
    if ($testIp) {
        $ch = curl_init("http://ip-api.com/json/" . urlencode($testIp));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3);
        $rawResponse = @curl_exec($ch);
        curl_close($ch);
    }

    // Anzahl Besuche mit/ohne Geo-Daten in der DB
    $withGeo = (int)($mysqli->query("SELECT COUNT(*) AS c FROM visits WHERE country IS NOT NULL")->fetch_assoc()['c'] ?? 0);
    $withoutGeo = (int)($mysqli->query("SELECT COUNT(*) AS c FROM visits WHERE country IS NULL")->fetch_assoc()['c'] ?? 0);

    echo json_encode([
        'ok' => true,
        'ip_candidates' => $candidates,
        'used_ip' => $testIp,
        'geo_result' => $geo,
        'raw_api_response' => $rawResponse,
        'visits_with_geo' => $withGeo,
        'visits_without_geo' => $withoutGeo,
        'curl_available' => function_exists('curl_init'),
    ]);
    exit;
}

// ─── BESUCHER NACH LAND (gesamte Historie) ──────────────────────────
if ($action === 'visitor_countries') {
    $rows = [];
    $result = $mysqli->query("
        SELECT
            country,
            country_code,
            COUNT(*) AS total_visits,
            COUNT(DISTINCT region) AS region_count
        FROM visits
        WHERE country IS NOT NULL
        GROUP BY country, country_code
        ORDER BY total_visits DESC
    ");
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'country' => $row['country'],
            'country_code' => $row['country_code'],
            'total_visits' => (int)$row['total_visits'],
        ];
    }

    // Regionen/Städte pro Land (Top 5 je Land, fürs Aufklappen)
    $regionsByCountry = [];
    $regionResult = $mysqli->query("
        SELECT country, region, city, COUNT(*) AS cnt
        FROM visits
        WHERE country IS NOT NULL AND region IS NOT NULL
        GROUP BY country, region, city
        ORDER BY country, cnt DESC
    ");
    while ($row = $regionResult->fetch_assoc()) {
        $regionsByCountry[$row['country']][] = [
            'region' => $row['region'],
            'city' => $row['city'],
            'count' => (int)$row['cnt'],
        ];
    }

    // Anzahl Besuche ohne Geo-Daten (z.B. lokale Tests, fehlgeschlagene Lookups)
    $unknownCount = (int)($mysqli->query("SELECT COUNT(*) AS c FROM visits WHERE country IS NULL")->fetch_assoc()['c'] ?? 0);

    echo json_encode([
        'ok' => true,
        'countries' => $rows,
        'regions_by_country' => $regionsByCountry,
        'unknown_count' => $unknownCount,
    ]);
    exit;
}

// ─── PUSH-EINSTELLUNGEN ABRUFEN ─────────────────────────────────────
if ($action === 'get_notify_settings') {
    $result = $mysqli->query("SELECT * FROM notify_settings WHERE id = 1");
    $row = $result->fetch_assoc();
    echo json_encode([
        'ok' => true,
        'push_enabled' => (bool)($row['push_enabled'] ?? 0),
        'ntfy_topic' => $row['ntfy_topic'] ?? '',
        'threshold' => (int)($row['threshold'] ?? 3),
        'cooldown_minutes' => (int)($row['cooldown_minutes'] ?? 15),
    ]);
    exit;
}

// ─── PUSH-EINSTELLUNGEN SPEICHERN ───────────────────────────────────
if ($action === 'set_notify_settings') {
    $pushEnabled = !empty($_POST['push_enabled']) ? 1 : 0;
    $ntfyTopic   = trim($_POST['ntfy_topic'] ?? '');
    $threshold   = max(1, (int)($_POST['threshold'] ?? 3));
    $cooldown    = max(1, (int)($_POST['cooldown_minutes'] ?? 15));
    $now = date('Y-m-d H:i:s');

    $stmt = $mysqli->prepare("
        UPDATE notify_settings
        SET push_enabled = ?, ntfy_topic = ?, threshold = ?, cooldown_minutes = ?, updated_at = ?
        WHERE id = 1
    ");
    $stmt->bind_param('isiis', $pushEnabled, $ntfyTopic, $threshold, $cooldown, $now);
    $stmt->execute();
    $stmt->close();

    echo json_encode(['ok' => true]);
    exit;
}

// ─── PUSH-TEST SENDEN ────────────────────────────────────────────────
if ($action === 'send_test_push') {
    $result = $mysqli->query("SELECT ntfy_topic FROM notify_settings WHERE id = 1");
    $row = $result->fetch_assoc();
    $topic = $row['ntfy_topic'] ?? '';

    if (empty($topic)) {
        echo json_encode(['ok' => false, 'error' => 'Kein Topic eingetragen']);
        exit;
    }

    $ch = curl_init("https://ntfy.sh/" . rawurlencode($topic));
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, '🔔 Testbenachrichtigung von Wunsch-Fabrik.dk – alles funktioniert!');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Title: Wunsch-Fabrik.dk',
        'Priority: default',
        'Tags: bell',
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 5);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
    $response = @curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode >= 200 && $httpCode < 300) {
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['ok' => false, 'error' => 'ntfy.sh antwortete mit Status ' . $httpCode]);
    }
    exit;
}

// ─── ÄNDERE PASSWORT ────────────────────────────────────────────────
if ($action === 'change_password') {
    $current = (string)($_POST['current_password'] ?? '');
    $new     = (string)($_POST['new_password'] ?? '');

    if (mb_strlen($new) < 8) {
        echo json_encode(['ok' => false, 'error' => 'Neues Passwort muss mind. 8 Zeichen haben']);
        exit;
    }

    $stmt = $mysqli->prepare("SELECT password_hash FROM admin_users WHERE id = ?");
    $stmt->bind_param('i', $_SESSION['wf_admin_id']);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$user || !(password_verify($current, $user['password_hash']) || password_verify(trim($current), $user['password_hash']))) {
        echo json_encode(['ok' => false, 'error' => 'Aktuelles Passwort falsch']);
        exit;
    }

    $newHash = password_hash($new, PASSWORD_DEFAULT);
    $stmt = $mysqli->prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?");
    $stmt->bind_param('si', $newHash, $_SESSION['wf_admin_id']);
    $stmt->execute();
    $stmt->close();

    echo json_encode(['ok' => true]);
    exit;
}

// ─── PRODUKTVORLAGEN für Preis-Kalkulator ──────────────────────────
if ($action === 'template_list') {
    wf_ensure_templates_table($mysqli);
    $result = $mysqli->query("SELECT id, name, description, created_at FROM product_templates ORDER BY name ASC");
    $templates = [];
    while ($row = $result->fetch_assoc()) {
        $templates[] = $row;
    }
    echo json_encode(['ok' => true, 'templates' => $templates]);
    exit;
}

if ($action === 'template_load') {
    wf_ensure_templates_table($mysqli);
    $id = intval($_REQUEST['id'] ?? 0);
    if ($id <= 0) {
        echo json_encode(['ok' => false, 'error' => 'Ungültige Template-ID']);
        exit;
    }
    $stmt = $mysqli->prepare("SELECT * FROM product_templates WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $template = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    
    if (!$template) {
        echo json_encode(['ok' => false, 'error' => 'Template nicht gefunden']);
        exit;
    }
    
    // JSON-Felder automatisch parsen
    $template['fixed_items'] = json_decode($template['fixed_items'], true) ?? [];
    $template['var_items'] = json_decode($template['var_items'], true) ?? [];
    
    echo json_encode(['ok' => true, 'template' => $template]);
    exit;
}

if ($action === 'template_save') {
    wf_ensure_templates_table($mysqli);
    $name = trim($_POST['name'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $fixed_items = $_POST['fixed_items'] ?? '[]';
    $var_items = $_POST['var_items'] ?? '[]';
    $hour_rate = floatval($_POST['hour_rate'] ?? 0);
    $setup_min = intval($_POST['setup_min'] ?? 0);
    $prod_min = intval($_POST['prod_min'] ?? 0);
    $margin_mode = $_POST['margin_mode'] ?? 'markup';
    $margin_pct = floatval($_POST['margin_pct'] ?? 0);
    $min_margin_pct = floatval($_POST['min_margin_pct'] ?? 0);
    $id = intval($_POST['id'] ?? 0);
    
    if (empty($name)) {
        echo json_encode(['ok' => false, 'error' => 'Template-Name erforderlich']);
        exit;
    }
    
    if ($id > 0) {
        // Update
        $stmt = $mysqli->prepare("
            UPDATE product_templates 
            SET name = ?, description = ?, fixed_items = ?, var_items = ?, 
                hour_rate = ?, setup_min = ?, prod_min = ?, margin_mode = ?, 
                margin_pct = ?, min_margin_pct = ?
            WHERE id = ?
        ");
        $stmt->bind_param('ssssdiiisddi', 
            $name, $description, $fixed_items, $var_items, 
            $hour_rate, $setup_min, $prod_min, $margin_mode, 
            $margin_pct, $min_margin_pct, $id
        );
    } else {
        // Insert
        $stmt = $mysqli->prepare("
            INSERT INTO product_templates 
            (name, description, fixed_items, var_items, hour_rate, setup_min, prod_min, margin_mode, margin_pct, min_margin_pct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->bind_param('ssssdiiidd', 
            $name, $description, $fixed_items, $var_items, 
            $hour_rate, $setup_min, $prod_min, $margin_mode, 
            $margin_pct, $min_margin_pct
        );
    }
    
    if ($stmt->execute()) {
        echo json_encode(['ok' => true, 'id' => $id > 0 ? $id : $mysqli->insert_id]);
    } else {
        echo json_encode(['ok' => false, 'error' => $stmt->error]);
    }
    $stmt->close();
    exit;
}

if ($action === 'template_delete') {
    wf_ensure_templates_table($mysqli);
    $id = intval($_REQUEST['id'] ?? 0);
    if ($id <= 0) {
        echo json_encode(['ok' => false, 'error' => 'Ungültige Template-ID']);
        exit;
    }
    $stmt = $mysqli->prepare("DELETE FROM product_templates WHERE id = ?");
    $stmt->bind_param('i', $id);
    if ($stmt->execute()) {
        echo json_encode(['ok' => true]);
    } else {
        echo json_encode(['ok' => false, 'error' => $stmt->error]);
    }
    $stmt->close();
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
