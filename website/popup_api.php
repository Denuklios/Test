<?php
/**
 * Wunsch-Fabrik.dk – Website-Popup (Sonderangebote, Urlaubshinweis etc.)
 * Ein einzelner Datensatz, den der Kunde im Admin-Bereich komplett steuert:
 * an/aus, Titel, Text, Bild, optionaler Button mit eigenem an/aus-Schalter.
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

$action = $_REQUEST['action'] ?? 'get';
$isAdmin = wf_admin_can('popup', $mysqli);

// ─── ÖFFENTLICH: Popup-Daten abrufen (für index.html) ────────────────
if ($action === 'get') {
    $result = $mysqli->query("SELECT aktiv, titel, text, bild, button_aktiv, button_text, button_link, updated_at FROM popup_settings WHERE id = 1");
    $row = $result ? $result->fetch_assoc() : null;
    if (!$row) {
        echo json_encode(['ok' => true, 'popup' => ['aktiv' => false]]);
        exit;
    }
    echo json_encode(['ok' => true, 'popup' => [
        'aktiv'        => (bool)$row['aktiv'],
        'titel'        => $row['titel'],
        'text'         => $row['text'],
        'bild'         => $row['bild'],
        'button_aktiv' => (bool)$row['button_aktiv'],
        'button_text'  => $row['button_text'],
        'button_link'  => $row['button_link'],
        // Wird als Cache-Kennung genutzt: ändert sich der Inhalt, zeigt sich
        // das Popup auch innerhalb der Sperrfrist erneut (z.B. neues Angebot).
        'version'      => $row['updated_at'],
    ]]);
    exit;
}

if (!$isAdmin) { echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']); exit; }

// ─── ADMIN: Aktuelle Einstellungen abrufen (fürs Formular) ───────────
if ($action === 'get_admin') {
    $result = $mysqli->query("SELECT * FROM popup_settings WHERE id = 1");
    $row = $result ? $result->fetch_assoc() : null;
    echo json_encode(['ok' => true, 'popup' => $row]);
    exit;
}

// ─── ADMIN: Einstellungen speichern (inkl. optionalem Bild-Upload) ───
if ($action === 'save') {
    $aktiv       = !empty($_POST['aktiv']) ? 1 : 0;
    $titel       = trim($_POST['titel'] ?? '');
    $text        = trim($_POST['text'] ?? '');
    $buttonAktiv = !empty($_POST['button_aktiv']) ? 1 : 0;
    $buttonText  = trim($_POST['button_text'] ?? '');
    $buttonLink  = trim($_POST['button_link'] ?? '');
    $removeImage = !empty($_POST['remove_image']);

    // Bestehendes Bild ermitteln, um es ggf. zu ersetzen/löschen
    $current = $mysqli->query("SELECT bild FROM popup_settings WHERE id = 1")->fetch_assoc();
    $bildPath = $current['bild'] ?? null;

    if ($removeImage && $bildPath) {
        $oldPath = __DIR__ . '/' . $bildPath;
        if (is_file($oldPath)) @unlink($oldPath);
        $bildPath = null;
    }

    if (!empty($_FILES['bild']['tmp_name']) && $_FILES['bild']['error'] === 0) {
        $allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = finfo_file($finfo, $_FILES['bild']['tmp_name']);
        finfo_close($finfo);

        if (!in_array($mimeType, $allowedTypes, true)) {
            echo json_encode(['ok' => false, 'error' => 'Nur JPG, PNG oder WEBP erlaubt']);
            exit;
        }
        if ($_FILES['bild']['size'] > 8 * 1024 * 1024) {
            echo json_encode(['ok' => false, 'error' => 'Bild zu groß – maximal 8 MB erlaubt']);
            exit;
        }

        $uploadDir = __DIR__ . '/popup-images';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        // Alte Datei löschen, falls ein neues Bild ein vorheriges ersetzt
        if ($bildPath) {
            $oldPath = __DIR__ . '/' . $bildPath;
            if (is_file($oldPath)) @unlink($oldPath);
        }

        // Proportional auf max. 900px Breite verkleinern (kein Zuschnitt, damit
        // sowohl Quer- als auch Hochformat-Angebotsgrafiken gut aussehen).
        switch ($mimeType) {
            case 'image/jpeg': $src = imagecreatefromjpeg($_FILES['bild']['tmp_name']); break;
            case 'image/png':  $src = imagecreatefrompng($_FILES['bild']['tmp_name']); break;
            case 'image/webp': $src = imagecreatefromwebp($_FILES['bild']['tmp_name']); break;
            default: $src = false;
        }
        if (!$src) {
            echo json_encode(['ok' => false, 'error' => 'Bild konnte nicht verarbeitet werden']);
            exit;
        }

        $origW = imagesx($src);
        $origH = imagesy($src);
        $maxW = 900;
        $maxH = 900;
        $scale = min(1, $maxW / $origW, $maxH / $origH);
        $newW = max(1, (int)round($origW * $scale));
        $newH = max(1, (int)round($origH * $scale));

        $dest = imagecreatetruecolor($newW, $newH);
        // Transparenz für PNG erhalten
        imagealphablending($dest, false);
        imagesavealpha($dest, true);
        $transparent = imagecolorallocatealpha($dest, 0, 0, 0, 127);
        imagefilledrectangle($dest, 0, 0, $newW, $newH, $transparent);
        imagecopyresampled($dest, $src, 0, 0, 0, 0, $newW, $newH, $origW, $origH);

        $safeName = 'popup_' . time() . '_' . bin2hex(random_bytes(4)) . '.png';
        $destPath = $uploadDir . '/' . $safeName;
        imagepng($dest, $destPath, 8);
        imagedestroy($src);
        imagedestroy($dest);

        $bildPath = 'popup-images/' . $safeName;
    }

    $stmt = $mysqli->prepare("
        UPDATE popup_settings
        SET aktiv=?, titel=?, text=?, bild=?, button_aktiv=?, button_text=?, button_link=?
        WHERE id = 1
    ");
    $stmt->bind_param('isssiss', $aktiv, $titel, $text, $bildPath, $buttonAktiv, $buttonText, $buttonLink);
    $stmt->execute();
    $stmt->close();

    echo json_encode(['ok' => true, 'bild' => $bildPath]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
