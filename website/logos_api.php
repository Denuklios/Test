<?php
/**
 * Wunsch-Fabrik.dk – Referenz-Logos API
 * Öffentlich: aktive Logos abrufen
 * Admin: Logo hochladen (Auto-Resize klein + groß), löschen
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
$isAdmin = wf_admin_can('logos', $mysqli);

// ─── ÖFFENTLICH: Aktive Logos ─────────────────────────────────────────
if ($action === 'list') {
    $result = $mysqli->query("SELECT id, name, website, image_small, image_full FROM ref_logos WHERE active=1 ORDER BY sort_order ASC, id ASC");
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    echo json_encode(['ok' => true, 'logos' => $rows]);
    exit;
}

if (!$isAdmin) { echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']); exit; }

// ─── ADMIN: Alle ──────────────────────────────────────────────────────
if ($action === 'list_all') {
    $result = $mysqli->query("SELECT * FROM ref_logos ORDER BY sort_order ASC, id ASC");
    $rows = [];
    while ($row = $result->fetch_assoc()) { $row['active'] = (bool)$row['active']; $rows[] = $row; }
    echo json_encode(['ok' => true, 'logos' => $rows]);
    exit;
}

// ─── ADMIN: Upload ────────────────────────────────────────────────────
if ($action === 'upload') {
    if (empty($_FILES['image']['tmp_name']) || $_FILES['image']['error'] !== 0) {
        echo json_encode(['ok' => false, 'error' => 'Kein Bild hochgeladen']);
        exit;
    }

    $allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $_FILES['image']['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, $allowedTypes, true)) {
        echo json_encode(['ok' => false, 'error' => 'Nur JPG, PNG, WEBP, GIF erlaubt']);
        exit;
    }

    $name = trim($_POST['name'] ?? '');
    if (!$name) { echo json_encode(['ok' => false, 'error' => 'Firmenname erforderlich']); exit; }
    $website   = trim($_POST['website'] ?? '');
    $sortOrder = (int)($_POST['sort_order'] ?? 0);

    $uploadDir = __DIR__ . '/ref-logo-images';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    // GD Source laden
    switch ($mimeType) {
        case 'image/jpeg': $src = imagecreatefromjpeg($_FILES['image']['tmp_name']); break;
        case 'image/png':  $src = imagecreatefrompng($_FILES['image']['tmp_name']); break;
        case 'image/webp': $src = imagecreatefromwebp($_FILES['image']['tmp_name']); break;
        case 'image/gif':  $src = imagecreatefromgif($_FILES['image']['tmp_name']); break;
        default: $src = false;
    }

    if (!$src) { echo json_encode(['ok' => false, 'error' => 'Bild konnte nicht verarbeitet werden']); exit; }

    $origW = imagesx($src);
    $origH = imagesy($src);

    $base = 'logo_' . time() . '_' . bin2hex(random_bytes(4));

    // ─── Kleine Version (60px hoch, transparenter Hintergrund) ─────────
    $smallH = 60;
    $smallW = (int)($origW * $smallH / $origH);
    $small = imagecreatetruecolor($smallW, $smallH);
    imagesavealpha($small, true);
    imagefill($small, 0, 0, imagecolorallocatealpha($small, 0, 0, 0, 127));
    imagecopyresampled($small, $src, 0, 0, 0, 0, $smallW, $smallH, $origW, $origH);
    $smallPath = $uploadDir . '/' . $base . '_small.png';
    imagepng($small, $smallPath, 8);
    imagedestroy($small);

    // ─── Große Version (max 400px breit, max 200px hoch) ─────────────
    $maxW = 400; $maxH = 200;
    $scale = min($maxW / $origW, $maxH / $origH, 1);
    $fullW = (int)($origW * $scale);
    $fullH = (int)($origH * $scale);
    $full = imagecreatetruecolor($fullW, $fullH);
    imagesavealpha($full, true);
    imagefill($full, 0, 0, imagecolorallocatealpha($full, 0, 0, 0, 127));
    imagecopyresampled($full, $src, 0, 0, 0, 0, $fullW, $fullH, $origW, $origH);
    $fullPath = $uploadDir . '/' . $base . '_full.png';
    imagepng($full, $fullPath, 8);
    imagedestroy($full);
    imagedestroy($src);

    $smallRel = 'ref-logo-images/' . $base . '_small.png';
    $fullRel  = 'ref-logo-images/' . $base . '_full.png';
    $now = date('Y-m-d H:i:s');

    $stmt = $mysqli->prepare("INSERT INTO ref_logos (created_at, name, website, image_small, image_full, sort_order, active) VALUES (?,?,?,?,?,?,1)");
    $stmt->bind_param('sssssi', $now, $name, $website, $smallRel, $fullRel, $sortOrder);
    $stmt->execute();
    $newId = $mysqli->insert_id;
    $stmt->close();

    echo json_encode(['ok' => true, 'id' => $newId]);
    exit;
}

// ─── ADMIN: Name/Website bearbeiten ──────────────────────────────────
if ($action === 'update') {
    $id = (int)($_POST['id'] ?? 0);
    $name = trim($_POST['name'] ?? '');
    $website = trim($_POST['website'] ?? '');
    if (!$id || !$name) { echo json_encode(['ok' => false, 'error' => 'Ungültige Daten']); exit; }
    $stmt = $mysqli->prepare("UPDATE ref_logos SET name=?, website=? WHERE id=?");
    $stmt->bind_param('ssi', $name, $website, $id);
    $stmt->execute(); $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Aktiv/Inaktiv ────────────────────────────────────────────
if ($action === 'toggle_active') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) { echo json_encode(['ok' => false, 'error' => 'Ungültige ID']); exit; }
    $mysqli->query("UPDATE ref_logos SET active = 1-active WHERE id=$id");
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Löschen ───────────────────────────────────────────────────
if ($action === 'delete') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) { echo json_encode(['ok' => false, 'error' => 'Ungültige ID']); exit; }
    $stmt = $mysqli->prepare("SELECT image_small, image_full FROM ref_logos WHERE id=?");
    $stmt->bind_param('i', $id); $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc(); $stmt->close();
    if ($row) {
        foreach ([$row['image_small'], $row['image_full']] as $img) {
            if ($img) { $p = __DIR__ . '/' . $img; if (is_file($p)) @unlink($p); }
        }
    }
    $stmt = $mysqli->prepare("DELETE FROM ref_logos WHERE id=?");
    $stmt->bind_param('i', $id); $stmt->execute(); $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
