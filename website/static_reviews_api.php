<?php
/**
 * Wunsch-Fabrik.dk – Feste Referenzkunden-Bewertungen (die 3 im Slider)
 * Admin: Einträge hinzufügen, bearbeiten, löschen
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
// Sitzung nur fortsetzen, wenn schon eine besteht (Admin angemeldet) – Besucher bekommen kein Cookie
if (isset($_COOKIE[session_name()])) {
    session_start();
}
require_once __DIR__ . '/db.php';

$mysqli = wf_db_connect();
if (!$mysqli) { echo json_encode(['ok' => false, 'error' => 'DB error']); exit; }
wf_ensure_tables($mysqli);

$action = $_REQUEST['action'] ?? 'list';
$isAdmin = wf_admin_can('reviews', $mysqli);

// ─── ÖFFENTLICH: Freigegebene feste Bewertungen ──────────────────────
if ($action === 'list') {
    $result = $mysqli->query("SELECT id, name, company, text FROM static_reviews WHERE active=1 ORDER BY sort_order ASC, id ASC");
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    echo json_encode(['ok' => true, 'reviews' => $rows]);
    exit;
}

if (!$isAdmin) { echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']); exit; }

// ─── ADMIN: Alle ──────────────────────────────────────────────────────
if ($action === 'list_all') {
    $result = $mysqli->query("SELECT * FROM static_reviews ORDER BY sort_order ASC, id ASC");
    $rows = [];
    while ($row = $result->fetch_assoc()) { $row['active'] = (bool)$row['active']; $rows[] = $row; }
    echo json_encode(['ok' => true, 'reviews' => $rows]);
    exit;
}

// ─── ADMIN: Speichern (neu/bearbeiten) ───────────────────────────────
if ($action === 'save') {
    $id = (int)($_POST['id'] ?? 0);
    $name = trim($_POST['name'] ?? '');
    $company = trim($_POST['company'] ?? '');
    $text = trim($_POST['text'] ?? '');
    $active = !empty($_POST['active']) ? 1 : 0;
    $sortOrder = (int)($_POST['sort_order'] ?? 0);

    if (!$name || !$text) {
        echo json_encode(['ok' => false, 'error' => 'Name und Text sind erforderlich']);
        exit;
    }

    $now = date('Y-m-d H:i:s');
    if ($id > 0) {
        $stmt = $mysqli->prepare("UPDATE static_reviews SET name=?, company=?, text=?, active=?, sort_order=?, updated_at=? WHERE id=?");
        $stmt->bind_param('sssissi', $name, $company, $text, $active, $sortOrder, $now, $id);
    } else {
        $stmt = $mysqli->prepare("INSERT INTO static_reviews (name, company, text, active, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)");
        $stmt->bind_param('sssiss', $name, $company, $text, $active, $sortOrder, $now, $now);
    }
    $stmt->execute();
    $newId = $id > 0 ? $id : $mysqli->insert_id;
    $stmt->close();
    echo json_encode(['ok' => true, 'id' => $newId]);
    exit;
}

// ─── ADMIN: Löschen ───────────────────────────────────────────────────
if ($action === 'delete') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) { echo json_encode(['ok' => false, 'error' => 'Ungültige ID']); exit; }
    $stmt = $mysqli->prepare("DELETE FROM static_reviews WHERE id=?");
    $stmt->bind_param('i', $id); $stmt->execute(); $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Aktiv/Inaktiv ────────────────────────────────────────────
if ($action === 'toggle_active') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) { echo json_encode(['ok' => false, 'error' => 'Ungültige ID']); exit; }
    $mysqli->query("UPDATE static_reviews SET active = 1-active WHERE id=$id");
    echo json_encode(['ok' => true]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
