<?php
/**
 * Wunsch-Fabrik.dk – Bestenliste für den Veredelungs-Tycoon
 *
 * Öffentlich: Punktestand melden, Bestenliste abrufen, eigenen Rang abrufen
 * Admin:      Eintrag löschen, Namen bereinigen, alle Einträge abrufen
 *
 * Jeder Spieler bekommt beim ersten Melden einen zufälligen Token, der im
 * Browser gespeichert wird. Darüber wird sein Eintrag später aktualisiert –
 * dadurch entsteht pro Gerät genau eine Zeile statt einer pro Meldung.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
session_start();
require_once __DIR__ . '/db.php';

$mysqli = wf_db_connect();
if (!$mysqli) {
    echo json_encode(['ok' => false, 'error' => 'db_connect_failed']);
    exit;
}

/* ─── Tabelle anlegen, falls noch nicht vorhanden ───────────────────── */
function wf_ensure_highscore_table($mysqli) {
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS game_scores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            token VARCHAR(64) NOT NULL UNIQUE,
            name VARCHAR(40) NOT NULL,
            umsatz DOUBLE NOT NULL DEFAULT 0,
            pins INT NOT NULL DEFAULT 0,
            teile DOUBLE NOT NULL DEFAULT 0,
            orders INT NOT NULL DEFAULT 0,
            machines INT NOT NULL DEFAULT 0,
            playtime INT NOT NULL DEFAULT 0,
            country VARCHAR(8) DEFAULT NULL,
            blocked TINYINT(1) NOT NULL DEFAULT 0,
            INDEX idx_umsatz (umsatz),
            INDEX idx_blocked (blocked)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}
wf_ensure_highscore_table($mysqli);

/* Selbsttest: highscore_api.php?action=ping */
if (($_REQUEST['action'] ?? '') === 'ping') {
    $c   = $mysqli->query("SELECT COUNT(*) AS c FROM game_scores");
    $tbl = $mysqli->query("SHOW TABLES LIKE 'game_scores'");
    echo json_encode([
        'ok'      => true,
        'version' => 'v4',
        'tabelle' => ($tbl && $tbl->num_rows > 0) ? 'vorhanden' : 'FEHLT: ' . $mysqli->error,
        'php'     => PHP_VERSION,
        'mysql'   => $mysqli->server_info,
        'entries' => (int)($c ? $c->fetch_assoc()['c'] : -1),
    ]);
    exit;
}

$action  = $_REQUEST['action'] ?? '';
$isAdmin = !empty($_SESSION['wf_admin_id']);

/* Namen säubern: keine Tags, keine Steuerzeichen, sinnvolle Länge */
function wf_clean_name($raw) {
    $n = strip_tags(trim((string)$raw));
    $n = preg_replace('/[\x00-\x1F\x7F]/u', '', $n);
    $n = preg_replace('/\s+/u', ' ', $n);
    return mb_substr($n, 0, 24);
}

/* ─── ÖFFENTLICH: Punktestand melden ────────────────────────────────── */
if ($action === 'submit') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
        exit;
    }

    $name  = wf_clean_name($_POST['name'] ?? '');
    $token = preg_replace('/[^a-zA-Z0-9]/', '', (string)($_POST['token'] ?? ''));

    if (mb_strlen($name) < 2) { echo json_encode(['ok' => false, 'error' => 'name_too_short']); exit; }
    if (strlen($token) < 12)  { echo json_encode(['ok' => false, 'error' => 'bad_token']);      exit; }

    $umsatz   = max(0, (float)($_POST['umsatz']   ?? 0));
    $pins     = max(0, (int)  ($_POST['pins']     ?? 0));
    $teile    = max(0, (float)($_POST['teile']    ?? 0));
    $orders   = max(0, (int)  ($_POST['orders']   ?? 0));
    $machines = max(0, (int)  ($_POST['machines'] ?? 0));
    $playtime = max(0, (int)  ($_POST['playtime'] ?? 0));

    /* Grobe Plausibilitätsprüfung: ohne Spielzeit kein Umsatz.
       Kein echter Manipulationsschutz – das Spiel läuft im Browser. */
    if ($playtime < 20 && $umsatz > 10000) {
        echo json_encode(['ok' => false, 'error' => 'implausible']);
        exit;
    }
    if ($umsatz > 1e30) {
        echo json_encode(['ok' => false, 'error' => 'implausible']);
        exit;
    }

    $ip      = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
    $ip      = trim(explode(',', $ip)[0]);
    $now     = date('Y-m-d H:i:s');
    $country = null;

    /* Prüfen ob dieser Spieler schon eine Zeile hat */
    $stmt = $mysqli->prepare("SELECT id, umsatz, country, blocked FROM game_scores WHERE token = ? LIMIT 1");
    $stmt->bind_param('s', $token);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($existing) {
        if ((int)$existing['blocked'] === 1) { echo json_encode(['ok' => false, 'error' => 'blocked']); exit; }

        /* Nur nach oben korrigieren – ein Prestige-Neustart darf den
           Bestwert nicht wieder auf null ziehen. */
        if ($umsatz <= (float)$existing['umsatz']) {
            $stmt = $mysqli->prepare("UPDATE game_scores SET name = ?, updated_at = ? WHERE token = ?");
            $stmt->bind_param('sss', $name, $now, $token);
            $stmt->execute();
            $stmt->close();
        } else {
            $stmt = $mysqli->prepare("
                UPDATE game_scores
                SET name = ?, umsatz = ?, pins = ?, teile = ?, orders = ?, machines = ?, playtime = ?, updated_at = ?
                WHERE token = ?
            ");
            $stmt->bind_param('sdidiiiss', $name, $umsatz, $pins, $teile, $orders, $machines, $playtime, $now, $token);
            $stmt->execute();
            $stmt->close();
        }
    } else {
        /* Land nur beim ersten Eintrag ermitteln, spart Anfragen */
        $geo = function_exists('wf_geolocate_ip') ? wf_geolocate_ip($ip) : null;
        $country = $geo['country_code'] ?? null;

        $stmt = $mysqli->prepare("
            INSERT INTO game_scores
                (created_at, updated_at, token, name, umsatz, pins, teile, orders, machines, playtime, country)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ");
        $stmt->bind_param('ssssdidiiis', $now, $now, $token, $name, $umsatz, $pins, $teile, $orders, $machines, $playtime, $country);
        $stmt->execute();
        $stmt->close();
    }

    /* Rang zurückmelden */
    $stmt = $mysqli->prepare("
        SELECT COUNT(*) + 1 AS pos
        FROM game_scores
        WHERE blocked = 0 AND umsatz > (SELECT umsatz FROM game_scores WHERE token = ?)
    ");
    $stmt->bind_param('s', $token);
    $stmt->execute();
    $rank = (int)($stmt->get_result()->fetch_assoc()['pos'] ?? 0);
    $stmt->close();

    $total = (int)($mysqli->query("SELECT COUNT(*) AS c FROM game_scores WHERE blocked = 0")->fetch_assoc()['c'] ?? 0);

    echo json_encode(['ok' => true, 'rank' => $rank, 'total' => $total]);
    exit;
}

/* ─── ÖFFENTLICH: Bestenliste abrufen ───────────────────────────────── */
if ($action === 'list') {
    $limit = (int)($_REQUEST['limit'] ?? 25);
    $limit = max(1, min(100, $limit));
    $token = preg_replace('/[^a-zA-Z0-9]/', '', (string)($_REQUEST['token'] ?? ''));

    $result = $mysqli->query("
        SELECT name, umsatz, pins, teile, orders, machines, playtime, country, updated_at
        FROM game_scores
        WHERE blocked = 0
        ORDER BY umsatz DESC, pins DESC, updated_at ASC
        LIMIT $limit
    ");
    $rows = [];
    $i = 0;
    while ($row = $result->fetch_assoc()) {
        $i++;
        $rows[] = [
            'rank'     => $i,
            'name'     => $row['name'],
            'umsatz'   => (float)$row['umsatz'],
            'pins'     => (int)$row['pins'],
            'teile'    => (float)$row['teile'],
            'orders'   => (int)$row['orders'],
            'machines' => (int)$row['machines'],
            'playtime' => (int)$row['playtime'],
            'country'  => $row['country'],
            'updated'  => $row['updated_at'],
        ];
    }

    $total = (int)($mysqli->query("SELECT COUNT(*) AS c FROM game_scores WHERE blocked = 0")->fetch_assoc()['c'] ?? 0);

    /* Eigenen Rang mitliefern, auch wenn er außerhalb der Liste liegt */
    $me = null;
    if ($token) {
        $stmt = $mysqli->prepare("SELECT name, umsatz, pins FROM game_scores WHERE token = ? AND blocked = 0 LIMIT 1");
        $stmt->bind_param('s', $token);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            $stmt = $mysqli->prepare("SELECT COUNT(*) + 1 AS pos FROM game_scores WHERE blocked = 0 AND umsatz > ?");
            $u = (float)$row['umsatz'];
            $stmt->bind_param('d', $u);
            $stmt->execute();
            $rank = (int)($stmt->get_result()->fetch_assoc()['pos'] ?? 0);
            $stmt->close();
            $me = ['rank' => $rank, 'name' => $row['name'], 'umsatz' => $u, 'pins' => (int)$row['pins']];
        }
    }

    echo json_encode(['ok' => true, 'total' => $total, 'scores' => $rows, 'me' => $me]);
    exit;
}

/* ─── ÖFFENTLICH: Prüfen ob ein Name noch frei ist ──────────────────── */
if ($action === 'check_name') {
    $name  = wf_clean_name($_REQUEST['name'] ?? '');
    $token = preg_replace('/[^a-zA-Z0-9]/', '', (string)($_REQUEST['token'] ?? ''));
    if (mb_strlen($name) < 2) { echo json_encode(['ok' => false, 'error' => 'name_too_short']); exit; }

    $stmt = $mysqli->prepare("SELECT COUNT(*) AS c FROM game_scores WHERE name = ? AND token <> ?");
    $stmt->bind_param('ss', $name, $token);
    $stmt->execute();
    $c = (int)($stmt->get_result()->fetch_assoc()['c'] ?? 0);
    $stmt->close();

    echo json_encode(['ok' => true, 'free' => $c === 0]);
    exit;
}

/* ─── ADMIN: alle Einträge ──────────────────────────────────────────── */
if ($action === 'admin_list') {
    if (!$isAdmin) { echo json_encode(['ok' => false, 'error' => 'unauthorized']); exit; }
    $result = $mysqli->query("SELECT * FROM game_scores ORDER BY umsatz DESC LIMIT 500");
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    echo json_encode(['ok' => true, 'scores' => $rows]);
    exit;
}

/* ─── ADMIN: Eintrag löschen ────────────────────────────────────────── */
if ($action === 'admin_delete') {
    if (!$isAdmin) { echo json_encode(['ok' => false, 'error' => 'unauthorized']); exit; }
    $id = (int)($_REQUEST['id'] ?? 0);
    $stmt = $mysqli->prepare("DELETE FROM game_scores WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

/* ─── ADMIN: Eintrag sperren / freigeben ────────────────────────────── */
if ($action === 'admin_block') {
    if (!$isAdmin) { echo json_encode(['ok' => false, 'error' => 'unauthorized']); exit; }
    $id      = (int)($_REQUEST['id'] ?? 0);
    $blocked = !empty($_REQUEST['blocked']) ? 1 : 0;
    $stmt = $mysqli->prepare("UPDATE game_scores SET blocked = ? WHERE id = ?");
    $stmt->bind_param('ii', $blocked, $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'unknown_action']);
