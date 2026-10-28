<?php
/**
 * Wunsch-Fabrik.dk – Bewertungen API
 * Öffentlich: Bewertung einreichen, freigegebene Bewertungen abrufen,
 *             "Diese Woche bearbeitet" + "Frisch aus der Werkstatt"
 * Admin: Bewertungen freigeben / löschen, alle Bewertungen abrufen
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
session_start();
require_once __DIR__ . '/db.php';

$mysqli = wf_db_connect();
if (!$mysqli) {
    echo json_encode(['ok' => false, 'error' => 'DB connection failed']);
    exit;
}
wf_ensure_tables($mysqli);

$action = $_REQUEST['action'] ?? '';
$isAdmin = !empty($_SESSION['wf_admin_id']);

// ─── ÖFFENTLICH: Bewertung einreichen ───────────────────────────────
if ($action === 'submit') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
        exit;
    }
    $name = strip_tags(trim($_POST['name'] ?? ''));
    $company = strip_tags(trim($_POST['company'] ?? ''));
    $initialsOnly = !empty($_POST['initials_only']) ? 1 : 0;
    $text = strip_tags(trim($_POST['text'] ?? ''));

    if (!$name || !$text) {
        echo json_encode(['ok' => false, 'error' => 'missing_fields']);
        exit;
    }
    if (mb_strlen($text) > 1000) {
        echo json_encode(['ok' => false, 'error' => 'text_too_long']);
        exit;
    }

    $now = date('Y-m-d H:i:s');
    $stmt = $mysqli->prepare("INSERT INTO reviews (created_at, name, company, initials_only, text, status) VALUES (?, ?, ?, ?, ?, 'pending')");
    $stmt->bind_param('sssis', $now, $name, $company, $initialsOnly, $text);
    $stmt->execute();
    $stmt->close();

    // Push-Benachrichtigung an Admin (falls aktiviert)
    $preview = mb_substr($text, 0, 120) . (mb_strlen($text) > 120 ? '…' : '');
    $pushMsg = "★ Neue Bewertung von $name" . ($company ? " ($company)" : '') . ":\n„$preview“\n\nIm Admin freigeben oder ablehnen.";
    wf_send_push($mysqli, $pushMsg, 'Wunsch-Fabrik.dk · Neue Bewertung', 'star');

    echo json_encode(['ok' => true]);
    exit;
}

// ─── ÖFFENTLICH: Freigegebene Bewertungen abrufen ───────────────────
if ($action === 'list_approved') {
    $result = $mysqli->query("
        SELECT id, name, company, initials_only, text, created_at
        FROM reviews
        WHERE status = 'approved'
        ORDER BY created_at DESC
        LIMIT 20
    ");
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $displayName = $row['name'];
        if ((int)$row['initials_only'] === 1) {
            $parts = preg_split('/\s+/', trim($row['name']));
            $initials = array_map(function($p) { return mb_strtoupper(mb_substr($p, 0, 1)) . '.'; }, $parts);
            $displayName = implode(' ', $initials);
        }
        $rows[] = [
            'id' => (int)$row['id'],
            'name' => $displayName,
            'company' => $row['company'],
            'text' => $row['text'],
            'created_at' => $row['created_at'],
        ];
    }
    echo json_encode(['ok' => true, 'reviews' => $rows]);
    exit;
}

// ─── ÖFFENTLICH: "Diese Woche bearbeitet" + "Frisch aus der Werkstatt" ─
if ($action === 'workshop_stats') {
    // Anfragen der letzten 7 Tage mit Status in_progress oder done
    $processedThisWeek = (int)($mysqli->query("
        SELECT COUNT(*) AS c FROM inquiries
        WHERE status IN ('in_progress', 'done')
        AND created_at >= (NOW() - INTERVAL 7 DAY)
    ")->fetch_assoc()['c'] ?? 0);

    // Letzte erledigte Anfragen (nur Produktart, anonymisiert)
    $recent = [];
    $result = $mysqli->query("
        SELECT product, created_at FROM inquiries
        WHERE status = 'done' AND product IS NOT NULL AND product != ''
        ORDER BY created_at DESC
        LIMIT 6
    ");
    while ($row = $result->fetch_assoc()) {
        $recent[] = ['product' => $row['product'], 'date' => $row['created_at']];
    }

    echo json_encode([
        'ok' => true,
        'processed_this_week' => $processedThisWeek,
        'recent_work' => $recent,
    ]);
    exit;
}

// ─── ALLE FOLGENDEN AKTIONEN BENÖTIGEN ADMIN-LOGIN ──────────────────
if (!$isAdmin) {
    echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']);
    exit;
}

// ─── ADMIN: Alle Bewertungen abrufen ────────────────────────────────
if ($action === 'list_all') {
    $result = $mysqli->query("SELECT * FROM reviews ORDER BY created_at DESC");
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $row['initials_only'] = (bool)$row['initials_only'];
        $rows[] = $row;
    }
    echo json_encode(['ok' => true, 'reviews' => $rows]);
    exit;
}

// ─── ADMIN: Bewertung freigeben / ablehnen / status ändern ──────────
if ($action === 'set_status') {
    $id = (int)($_POST['id'] ?? 0);
    $status = trim($_POST['status'] ?? '');
    $allowed = ['pending', 'approved', 'rejected'];
    if (!$id || !in_array($status, $allowed, true)) {
        echo json_encode(['ok' => false, 'error' => 'invalid_data']);
        exit;
    }
    $stmt = $mysqli->prepare("UPDATE reviews SET status = ? WHERE id = ?");
    $stmt->bind_param('si', $status, $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Bewertung löschen ────────────────────────────────────────
if ($action === 'delete') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) {
        echo json_encode(['ok' => false, 'error' => 'invalid_id']);
        exit;
    }
    $stmt = $mysqli->prepare("DELETE FROM reviews WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
