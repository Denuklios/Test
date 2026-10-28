<?php
/**
 * Wunsch-Fabrik.dk – Produkte API
 * Öffentlich: Produktliste abrufen
 * Admin (eingeloggt): Produkte anlegen, bearbeiten, löschen, Bilder hochladen
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

$action = $_REQUEST['action'] ?? 'list';
$isAdmin = wf_admin_can('shop', $mysqli);

// ─── ÖFFENTLICH: Shop-Status abfragen ───────────────────────────────
if ($action === 'shop_status') {
    $result = $mysqli->query("SELECT published FROM shop_settings WHERE id = 1");
    $row = $result->fetch_assoc();
    echo json_encode(['ok' => true, 'published' => (bool)($row['published'] ?? 0)]);
    exit;
}

// ─── ÖFFENTLICH: Aktive Produkte abrufen ────────────────────────────
if ($action === 'list') {
    $result = $mysqli->query("
        SELECT id, name, category, description, price, price_unit, price_from, image, badge, info
        FROM products
        WHERE active = 1
        ORDER BY sort_order ASC, created_at DESC
    ");
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $row['price'] = (float)$row['price'];
        $row['price_from'] = (bool)$row['price_from'];
        $rows[] = $row;
    }
    echo json_encode(['ok' => true, 'products' => $rows]);
    exit;
}

// ─── ALLE FOLGENDEN AKTIONEN BENÖTIGEN ADMIN-LOGIN ──────────────────
if (!$isAdmin) {
    echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']);
    exit;
}

// ─── ADMIN: Alle Produkte (auch inaktive) ───────────────────────────
if ($action === 'list_all') {
    $result = $mysqli->query("SELECT * FROM products ORDER BY sort_order ASC, created_at DESC");
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $row['price'] = (float)$row['price'];
        $row['price_from'] = (bool)$row['price_from'];
        $row['active'] = (bool)$row['active'];
        $rows[] = $row;
    }
    echo json_encode(['ok' => true, 'products' => $rows]);
    exit;
}

// ─── ADMIN: Produkt speichern (neu oder bearbeiten) ─────────────────
if ($action === 'save') {
    $id          = (int)($_POST['id'] ?? 0);
    $name        = trim($_POST['name'] ?? '');
    $category    = trim($_POST['category'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $price       = (float)($_POST['price'] ?? 0);
    $priceUnit   = trim($_POST['price_unit'] ?? 'DKK/Stück');
    $priceFrom   = !empty($_POST['price_from']) ? 1 : 0;
    $badge       = trim($_POST['badge'] ?? '');
    $info        = trim($_POST['info'] ?? '');
    $active      = !empty($_POST['active']) ? 1 : 0;
    $sortOrder   = (int)($_POST['sort_order'] ?? 0);

    if (!$name || !$category) {
        echo json_encode(['ok' => false, 'error' => 'Name und Kategorie sind erforderlich']);
        exit;
    }

    $now = date('Y-m-d H:i:s');

    // Bild-Upload verarbeiten
    $imagePath = trim($_POST['existing_image'] ?? '');
    if (!empty($_FILES['image']['tmp_name']) && $_FILES['image']['error'] === 0) {
        $allowedExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
        $origName = $_FILES['image']['name'];
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
        if (in_array($ext, $allowedExt, true)) {
            $uploadDir = __DIR__ . '/product-images';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }
            $safeName = 'prod_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
            $destPath = $uploadDir . '/' . $safeName;
            if (move_uploaded_file($_FILES['image']['tmp_name'], $destPath)) {
                $imagePath = 'product-images/' . $safeName;
            }
        }
    }

    if ($id > 0) {
        // Update
        $stmt = $mysqli->prepare("
            UPDATE products SET
                updated_at = ?, name = ?, category = ?, description = ?, price = ?,
                price_unit = ?, price_from = ?, image = ?, badge = ?, info = ?,
                active = ?, sort_order = ?
            WHERE id = ?
        ");
        $stmt->bind_param(
            'sssssssssssii',
            $now, $name, $category, $description, $price,
            $priceUnit, $priceFrom, $imagePath, $badge, $info,
            $active, $sortOrder, $id
        );
        $stmt->execute();
        $stmt->close();
        echo json_encode(['ok' => true, 'id' => $id]);
    } else {
        // Insert
        $stmt = $mysqli->prepare("
            INSERT INTO products
            (created_at, updated_at, name, category, description, price, price_unit, price_from, image, badge, info, active, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->bind_param(
            'ssssssssssssi',
            $now, $now, $name, $category, $description, $price,
            $priceUnit, $priceFrom, $imagePath, $badge, $info, $active, $sortOrder
        );
        $stmt->execute();
        $newId = $mysqli->insert_id;
        $stmt->close();
        echo json_encode(['ok' => true, 'id' => $newId]);
    }
    exit;
}

// ─── ADMIN: Produkt löschen ──────────────────────────────────────────
if ($action === 'delete') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) {
        echo json_encode(['ok' => false, 'error' => 'Ungültige ID']);
        exit;
    }

    // Bild mitlöschen falls vorhanden
    $stmt = $mysqli->prepare("SELECT image FROM products WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($row && $row['image']) {
        $path = __DIR__ . '/' . $row['image'];
        if (is_file($path)) @unlink($path);
    }

    $stmt = $mysqli->prepare("DELETE FROM products WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Aktiv/Inaktiv umschalten ─────────────────────────────────
if ($action === 'toggle_active') {
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) {
        echo json_encode(['ok' => false, 'error' => 'Ungültige ID']);
        exit;
    }
    $mysqli->query("UPDATE products SET active = 1 - active WHERE id = " . $id);
    echo json_encode(['ok' => true]);
    exit;
}

// ─── ADMIN: Shop veröffentlichen / verstecken ───────────────────────
if ($action === 'set_shop_status') {
    $published = !empty($_POST['published']) ? 1 : 0;
    $now = date('Y-m-d H:i:s');
    $stmt = $mysqli->prepare("UPDATE shop_settings SET published = ?, updated_at = ? WHERE id = 1");
    $stmt->bind_param('is', $published, $now);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true, 'published' => (bool)$published]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
