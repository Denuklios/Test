<?php
/**
 * Wunsch-Fabrik.dk – Impressionen API
 * Upload mit automatischer Größenanpassung (GD), Verwaltung
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
session_start();
require_once __DIR__ . '/db.php';

$mysqli = wf_db_connect();
if (!$mysqli) { echo json_encode(['ok' => false, 'error' => 'DB error']); exit; }
wf_ensure_tables($mysqli);

$action = $_REQUEST['action'] ?? 'list';
$isAdmin = !empty($_SESSION['wf_admin_id']);

// ─── ÖFFENTLICH: Liste ────────────────────────────────────────────────
if ($action === 'list') {
    $result = $mysqli->query("SELECT id, image, media_type, video_thumb, caption FROM impressionen WHERE active=1 ORDER BY sort_order ASC, id DESC");
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    echo json_encode(['ok' => true, 'images' => $rows]);
    exit;
}

if (!$isAdmin) { echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']); exit; }

// ─── ADMIN: Alle ──────────────────────────────────────────────────────
if ($action === 'list_all') {
    $result = $mysqli->query("SELECT * FROM impressionen ORDER BY sort_order ASC, id DESC");
    $rows = [];
    while ($row = $result->fetch_assoc()) { $row['active'] = (bool)$row['active']; $rows[] = $row; }
    echo json_encode(['ok' => true, 'images' => $rows]);
    exit;
}

// ─── ADMIN: Upload ────────────────────────────────────────────────────
if ($action === 'upload') {
    if (empty($_FILES['image']['tmp_name']) || $_FILES['image']['error'] !== 0) {
        echo json_encode(['ok' => false, 'error' => 'Keine Datei hochgeladen']);
        exit;
    }

    $allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    $allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $_FILES['image']['tmp_name']);
    finfo_close($finfo);

    $isVideo = in_array($mimeType, $allowedVideoTypes, true);
    $isImage = in_array($mimeType, $allowedImageTypes, true);

    if (!$isVideo && !$isImage) {
        echo json_encode(['ok' => false, 'error' => 'Nur JPG, PNG, WEBP, GIF, MP4, WEBM oder MOV erlaubt']);
        exit;
    }

    $maxVideoBytes = 50 * 1024 * 1024; // 50 MB
    if ($isVideo && $_FILES['image']['size'] > $maxVideoBytes) {
        echo json_encode(['ok' => false, 'error' => 'Video zu groß – maximal 50 MB erlaubt']);
        exit;
    }

    $caption   = trim($_POST['caption'] ?? '');
    $sortOrder = (int)($_POST['sort_order'] ?? 0);

    $uploadDir = __DIR__ . '/impressionen-images';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    $now = date('Y-m-d H:i:s');

    // ─── VIDEO ────────────────────────────────────────────────────
    if ($isVideo) {
        $ext = $mimeType === 'video/webm' ? 'webm' : ($mimeType === 'video/quicktime' ? 'mov' : 'mp4');
        $safeName = 'imp_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $destPath = $uploadDir . '/' . $safeName;

        if (!move_uploaded_file($_FILES['image']['tmp_name'], $destPath)) {
            echo json_encode(['ok' => false, 'error' => 'Video konnte nicht gespeichert werden']);
            exit;
        }
        $videoPath = 'impressionen-images/' . $safeName;

        // Thumbnail: vom Browser als Base64-JPEG mitgeschickt (Canvas-Snapshot erster Frame)
        $thumbPath = null;
        if (!empty($_POST['thumb_data'])) {
            $thumbData = $_POST['thumb_data'];
            if (preg_match('#^data:image/jpeg;base64,#', $thumbData)) {
                $thumbRaw = base64_decode(substr($thumbData, strpos($thumbData, ',') + 1));
                if ($thumbRaw !== false) {
                    $thumbName = 'imp_' . time() . '_' . bin2hex(random_bytes(4)) . '_thumb.jpg';
                    $thumbDest = $uploadDir . '/' . $thumbName;
                    file_put_contents($thumbDest, $thumbRaw);
                    $thumbPath = 'impressionen-images/' . $thumbName;
                }
            }
        }

        $stmt = $mysqli->prepare("INSERT INTO impressionen (created_at, image, media_type, video_thumb, caption, sort_order, active) VALUES (?,?,'video',?,?,?,1)");
        $stmt->bind_param('ssssi', $now, $videoPath, $thumbPath, $caption, $sortOrder);
        $stmt->execute();
        $newId = $mysqli->insert_id;
        $stmt->close();

        echo json_encode(['ok' => true, 'id' => $newId, 'image' => $videoPath, 'video_thumb' => $thumbPath]);
        exit;
    }

    // ─── BILD ─────────────────────────────────────────────────────
    $safeName = 'imp_' . time() . '_' . bin2hex(random_bytes(4)) . '.jpg';
    $destPath = $uploadDir . '/' . $safeName;

    // ─── Auto-Resize via GD ────────────────────────────────────────
    $targetW = 800;
    $targetH = 600;

    switch ($mimeType) {
        case 'image/jpeg': $src = imagecreatefromjpeg($_FILES['image']['tmp_name']); break;
        case 'image/png':  $src = imagecreatefrompng($_FILES['image']['tmp_name']); break;
        case 'image/webp': $src = imagecreatefromwebp($_FILES['image']['tmp_name']); break;
        case 'image/gif':  $src = imagecreatefromgif($_FILES['image']['tmp_name']); break;
        default: $src = false;
    }

    if (!$src) {
        echo json_encode(['ok' => false, 'error' => 'Bild konnte nicht verarbeitet werden']);
        exit;
    }

    $origW = imagesx($src);
    $origH = imagesy($src);

    // Landscape/Portrait erkennen und auf Zielgröße skalieren (cover-Modus)
    $scaleW = $targetW / $origW;
    $scaleH = $targetH / $origH;
    $scale = max($scaleW, $scaleH);

    $scaledW = (int)($origW * $scale);
    $scaledH = (int)($origH * $scale);
    $offsetX = (int)(($scaledW - $targetW) / 2);
    $offsetY = (int)(($scaledH - $targetH) / 2);

    $dest = imagecreatetruecolor($targetW, $targetH);
    // Weißer Hintergrund für transparente Bilder
    $white = imagecolorallocate($dest, 255, 255, 255);
    imagefill($dest, 0, 0, $white);

    imagecopyresampled($dest, $src, -$offsetX, -$offsetY, 0, 0, $scaledW, $scaledH, $origW, $origH);
    imagejpeg($dest, $destPath, 88);
    imagedestroy($src);
    imagedestroy($dest);

    $imagePath = 'impressionen-images/' . $safeName;

    $stmt = $mysqli->prepare("INSERT INTO impressionen (created_at, image, media_type, caption, sort_order, active) VALUES (?,?,'image',?,?,1)");
    $stmt->bind_param('sssi', $now, $imagePath, $caption, $sortOrder);
    $stmt->execute();
    $newId = $mysqli->insert_id;
    $stmt->close();

    echo json_encode(['ok' => true, 'id' => $newId, 'image' => $imagePath]);
    exit;
}

// ─── ADMIN: Beschriftung bearbeiten ──────────────────────────────────
if ($action === 'update') {
    $id = (int)($_POST['id'] ?? 0);
    $caption = trim($_POST['caption'] ?? '');
    $sortOrder = (int)($_POST['sort_order'] ?? 0);
    if (!$id) { echo json_encode(['ok' => false, 'error' => 'Ungültige ID']); exit; }
    $stmt = $mysqli->prepare("UPDATE impressionen SET caption=?, sort_order=? WHERE id=?");
    $stmt->bind_param('sii', $caption, $sortOrder, $id);
    $stmt->execute(); $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Aktiv/Inaktiv ────────────────────────────────────────────
if ($action === 'toggle_active') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) { echo json_encode(['ok' => false, 'error' => 'Ungültige ID']); exit; }
    $mysqli->query("UPDATE impressionen SET active = 1-active WHERE id=$id");
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Löschen ───────────────────────────────────────────────────
if ($action === 'delete') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) { echo json_encode(['ok' => false, 'error' => 'Ungültige ID']); exit; }
    $stmt = $mysqli->prepare("SELECT image, video_thumb FROM impressionen WHERE id=?");
    $stmt->bind_param('i', $id); $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc(); $stmt->close();
    if ($row && $row['image']) {
        $path = __DIR__ . '/' . $row['image'];
        if (is_file($path)) @unlink($path);
    }
    if ($row && !empty($row['video_thumb'])) {
        $thumbPath = __DIR__ . '/' . $row['video_thumb'];
        if (is_file($thumbPath)) @unlink($thumbPath);
    }
    $stmt = $mysqli->prepare("DELETE FROM impressionen WHERE id=?");
    $stmt->bind_param('i', $id); $stmt->execute(); $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
