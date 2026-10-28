<?php
/**
 * Wunsch-Fabrik.dk – Werkstatt-Fotos API
 * Öffentlich: aktive Fotos abrufen
 * Admin: Fotos hochladen, bearbeiten, löschen, Reihenfolge ändern
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
// Sitzung nur fortsetzen, wenn schon eine besteht (Admin angemeldet) – Besucher bekommen kein Cookie
if (isset($_COOKIE[session_name()])) {
    session_start();
}
require_once __DIR__ . '/db.php';

$mysqli = wf_db_connect();
if (!$mysqli) {
    echo json_encode(['ok' => false, 'error' => 'DB connection failed']);
    exit;
}
wf_ensure_tables($mysqli);
wf_cleanup_workshop_photos($mysqli);

$action = $_REQUEST['action'] ?? 'list';
$isAdmin = wf_admin_can('workshop', $mysqli);

// ─── Aufräum-Funktion: alte Fotos (>7 Tage) löschen + Bild-Dateien entfernen ──
function wf_cleanup_workshop_photos($mysqli) {
    $result = $mysqli->query("
        SELECT id, image FROM workshop_photos
        WHERE created_at < (NOW() - INTERVAL 7 DAY)
    ");
    while ($row = $result->fetch_assoc()) {
        $path = __DIR__ . '/' . $row['image'];
        if (is_file($path)) @unlink($path);
    }
    $mysqli->query("DELETE FROM workshop_photos WHERE created_at < (NOW() - INTERVAL 7 DAY)");
}

// ─── ÖFFENTLICH: Aktive Fotos abrufen ────────────────────────────────
if ($action === 'list') {
    $result = $mysqli->query("
        SELECT id, image, media_type, video_thumb, caption
        FROM workshop_photos
        WHERE active = 1
        ORDER BY sort_order ASC, created_at DESC
        LIMIT 9
    ");
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    echo json_encode(['ok' => true, 'photos' => $rows]);
    exit;
}

// ─── ALLE FOLGENDEN AKTIONEN BENÖTIGEN ADMIN-LOGIN ──────────────────
if (!$isAdmin) {
    echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']);
    exit;
}

// ─── ADMIN: Alle Fotos (auch inaktive) ──────────────────────────────
if ($action === 'list_all') {
    $result = $mysqli->query("SELECT * FROM workshop_photos ORDER BY sort_order ASC, created_at DESC");
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $row['active'] = (bool)$row['active'];
        $rows[] = $row;
    }
    echo json_encode(['ok' => true, 'photos' => $rows]);
    exit;
}

// ─── ADMIN: Foto hochladen ────────────────────────────────────────────
if ($action === 'upload') {
    $caption = trim($_POST['caption'] ?? '');
    $sortOrder = (int)($_POST['sort_order'] ?? 0);

    if (empty($_FILES['image']['tmp_name']) || $_FILES['image']['error'] !== 0) {
        echo json_encode(['ok' => false, 'error' => 'no_image']);
        exit;
    }

    $allowedImageExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    $allowedVideoExt = ['mp4', 'webm', 'mov'];
    $origName = $_FILES['image']['name'];
    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    $isVideo = in_array($ext, $allowedVideoExt, true);
    $isImage = in_array($ext, $allowedImageExt, true);

    if (!$isVideo && !$isImage) {
        echo json_encode(['ok' => false, 'error' => 'invalid_file_type']);
        exit;
    }

    $maxVideoBytes = 50 * 1024 * 1024; // 50 MB
    if ($isVideo && $_FILES['image']['size'] > $maxVideoBytes) {
        echo json_encode(['ok' => false, 'error' => 'Video zu groß – maximal 50 MB erlaubt']);
        exit;
    }

    $uploadDir = __DIR__ . '/workshop-images';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    $safeName = 'wsp_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
    $destPath = $uploadDir . '/' . $safeName;

    if (!move_uploaded_file($_FILES['image']['tmp_name'], $destPath)) {
        echo json_encode(['ok' => false, 'error' => 'upload_failed']);
        exit;
    }

    $imagePath = 'workshop-images/' . $safeName;
    $now = date('Y-m-d H:i:s');
    $mediaType = $isVideo ? 'video' : 'image';

    // Thumbnail: vom Browser als Base64-JPEG mitgeschickt (Canvas-Snapshot erster Frame)
    $thumbPath = null;
    if ($isVideo && !empty($_POST['thumb_data'])) {
        $thumbData = $_POST['thumb_data'];
        if (preg_match('#^data:image/jpeg;base64,#', $thumbData)) {
            $thumbRaw = base64_decode(substr($thumbData, strpos($thumbData, ',') + 1));
            if ($thumbRaw !== false) {
                $thumbName = 'wsp_' . time() . '_' . bin2hex(random_bytes(4)) . '_thumb.jpg';
                $thumbDest = $uploadDir . '/' . $thumbName;
                file_put_contents($thumbDest, $thumbRaw);
                $thumbPath = 'workshop-images/' . $thumbName;
            }
        }
    }

    $stmt = $mysqli->prepare("
        INSERT INTO workshop_photos (created_at, image, media_type, video_thumb, caption, sort_order, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    ");
    $stmt->bind_param('sssssi', $now, $imagePath, $mediaType, $thumbPath, $caption, $sortOrder);
    $stmt->execute();
    $newId = $mysqli->insert_id;
    $stmt->close();

    // Maximal 9 Fotos: ältestes entfernen, falls Limit überschritten
    $countResult = $mysqli->query("SELECT COUNT(*) AS c FROM workshop_photos");
    $count = (int)($countResult->fetch_assoc()['c'] ?? 0);
    if ($count > 9) {
        $toDelete = $count - 9;
        $oldestResult = $mysqli->query("
            SELECT id, image, video_thumb FROM workshop_photos
            ORDER BY created_at ASC
            LIMIT $toDelete
        ");
        while ($old = $oldestResult->fetch_assoc()) {
            $oldPath = __DIR__ . '/' . $old['image'];
            if (is_file($oldPath)) @unlink($oldPath);
            if (!empty($old['video_thumb'])) {
                $oldThumb = __DIR__ . '/' . $old['video_thumb'];
                if (is_file($oldThumb)) @unlink($oldThumb);
            }
            $mysqli->query("DELETE FROM workshop_photos WHERE id = " . (int)$old['id']);
        }
    }

    echo json_encode(['ok' => true, 'id' => $newId, 'image' => $imagePath, 'video_thumb' => $thumbPath]);
    exit;
}

// ─── ADMIN: Bildunterschrift bearbeiten ─────────────────────────────
if ($action === 'update_caption') {
    $id = (int)($_POST['id'] ?? 0);
    $caption = trim($_POST['caption'] ?? '');
    if (!$id) {
        echo json_encode(['ok' => false, 'error' => 'invalid_id']);
        exit;
    }
    $stmt = $mysqli->prepare("UPDATE workshop_photos SET caption = ? WHERE id = ?");
    $stmt->bind_param('si', $caption, $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Aktiv/Inaktiv umschalten ─────────────────────────────────
if ($action === 'toggle_active') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) {
        echo json_encode(['ok' => false, 'error' => 'invalid_id']);
        exit;
    }
    $mysqli->query("UPDATE workshop_photos SET active = 1 - active WHERE id = " . $id);
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Foto löschen ──────────────────────────────────────────────
if ($action === 'delete') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) {
        echo json_encode(['ok' => false, 'error' => 'invalid_id']);
        exit;
    }
    $stmt = $mysqli->prepare("SELECT image, video_thumb FROM workshop_photos WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($row && $row['image']) {
        $path = __DIR__ . '/' . $row['image'];
        if (is_file($path)) @unlink($path);
    }
    if ($row && !empty($row['video_thumb'])) {
        $thumbPath = __DIR__ . '/' . $row['video_thumb'];
        if (is_file($thumbPath)) @unlink($thumbPath);
    }

    $stmt = $mysqli->prepare("DELETE FROM workshop_photos WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
