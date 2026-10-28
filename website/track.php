<?php
/**
 * Wunsch-Fabrik.dk – Besucherzähler
 * Trackt Gesamtbesucher und "online jetzt" über eine MySQL-Datenbank.
 */

header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

// ─── Verbindung ───────────────────────────────────────────────────
$mysqli = wf_db_connect();

if (!$mysqli) {
    echo json_encode(['ok' => false, 'error' => 'DB connection failed']);
    exit;
}

// ─── Tabellen sicherstellen ────────────────────────────────────────
wf_ensure_tables($mysqli);

// ─── Besucher-Kennung OHNE Cookie ─────────────────────────────────
// Tages-Hash aus IP + Browser + täglich wechselndem Zufallswert (siehe wf_visitor_hash in db.php).
// Es wird nichts im Browser gespeichert und die IP-Adresse wird nicht abgelegt.
$sessionId = wf_visitor_hash($mysqli);

// Altes Zähler-Cookie aus früheren Versionen löschen
if (isset($_COOKIE['wf_visit_sid'])) {
    setcookie('wf_visit_sid', '', ['expires' => time() - 3600, 'path' => '/', 'samesite' => 'Lax']);
}

$now = date('Y-m-d H:i:s');

$stmt = $mysqli->prepare("SELECT id FROM visits WHERE session_id = ?");
$stmt->bind_param('s', $sessionId);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    $upd = $mysqli->prepare("UPDATE visits SET last_seen = ? WHERE id = ?");
    $upd->bind_param('si', $now, $row['id']);
    $upd->execute();
    $upd->close();
} else {
    // Land nur über Zeitzone/Browsersprache – keine Abfrage bei Fremddiensten
    $geo = wf_geolocate_ip();
    $ins = $mysqli->prepare("
        INSERT INTO visits (session_id, first_seen, last_seen, country, country_code, region, city)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $country = $geo['country'] ?? null;
    $countryCode = $geo['country_code'] ?? null;
    $region = null;
    $city = null;
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

// Zahlen nicht mehr öffentlich ausgeben – sie stehen nur noch im Admin-Bereich
echo json_encode(['ok' => true]);

$mysqli->close();
