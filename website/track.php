<?php
/**
 * Wunsch-Fabrik.dk – Besucherzähler
 * Trackt Gesamtbesucher und "online jetzt" über eine MySQL-Datenbank.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
require_once __DIR__ . '/db.php';

// ─── Verbindung ───────────────────────────────────────────────────
$mysqli = wf_db_connect();

if (!$mysqli) {
    echo json_encode(['ok' => false, 'error' => 'DB connection failed']);
    exit;
}

// ─── Tabellen sicherstellen ────────────────────────────────────────
wf_ensure_tables($mysqli);

// ─── Session-ID ermitteln (Cookie-basiert, kein Login nötig) ──────
$sessionId = $_COOKIE['wf_visit_sid'] ?? null;
if (!$sessionId) {
    $sessionId = bin2hex(random_bytes(16));
    setcookie('wf_visit_sid', $sessionId, [
        'expires'  => time() + 60 * 60 * 24 * 365, // 1 Jahr
        'path'     => '/',
        'samesite' => 'Lax',
    ]);
}

$now = date('Y-m-d H:i:s');

// ─── Eintrag aktualisieren oder erstellen ─────────────────────────
$stmt = $mysqli->prepare("SELECT id FROM visits WHERE session_id = ?");
$stmt->bind_param('s', $sessionId);
$stmt->execute();
$result = $stmt->get_result();

/**
 * Ermittelt die echte Besucher-IP, auch hinter Proxies/CDNs.
 */
function wf_get_client_ip() {
    $headers = [
        'HTTP_CF_CONNECTING_IP', // Cloudflare
        'HTTP_X_REAL_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_CLIENT_IP',
        'REMOTE_ADDR',
    ];
    foreach ($headers as $header) {
        if (!empty($_SERVER[$header])) {
            $ip = $_SERVER[$header];
            if (strpos($ip, ',') !== false) {
                $ip = trim(explode(',', $ip)[0]);
            }
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return null;
}

if ($row = $result->fetch_assoc()) {
    // Bestehende Session: last_seen aktualisieren
    $upd = $mysqli->prepare("UPDATE visits SET last_seen = ? WHERE id = ?");
    $upd->bind_param('si', $now, $row['id']);
    $upd->execute();
    $upd->close();
} else {
    // Neue Session: Eintrag erstellen + Geolocation ermitteln
    $clientIp = wf_get_client_ip();
    $geo = wf_geolocate_ip($clientIp);

    $ins = $mysqli->prepare("
        INSERT INTO visits (session_id, first_seen, last_seen, country, country_code, region, city)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $country = $geo['country'] ?? null;
    $countryCode = $geo['country_code'] ?? null;
    $region = $geo['region'] ?? null;
    $city = $geo['city'] ?? null;
    $ins->bind_param('sssssss', $sessionId, $now, $now, $country, $countryCode, $region, $city);
    $ins->execute();
    $ins->close();
}
$stmt->close();

// ─── Online jetzt: aktiv in den letzten 5 Minuten ─────────────────
$onlineResult = $mysqli->query("
    SELECT COUNT(DISTINCT session_id) AS cnt
    FROM visits
    WHERE last_seen >= (NOW() - INTERVAL 5 MINUTE)
");
$online = (int)($onlineResult->fetch_assoc()['cnt'] ?? 1);

// ─── Gesamtbesucher: eindeutige Sessions insgesamt ────────────────
$totalResult = $mysqli->query("SELECT COUNT(*) AS cnt FROM visits");
$total = (int)($totalResult->fetch_assoc()['cnt'] ?? 0);

// ─── Push-Benachrichtigung bei Schwellenwert (ntfy.sh) ────────────
wf_check_push_notification($mysqli, max(1, $online));

echo json_encode([
    'ok'     => true,
    'online' => max(1, $online),
    'total'  => $total,
]);

$mysqli->close();
