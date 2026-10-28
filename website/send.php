<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$name    = strip_tags(trim($_POST['name'] ?? ''));
$email   = strip_tags(trim($_POST['email'] ?? ''));
$phone   = strip_tags(trim($_POST['phone'] ?? ''));
$qty     = strip_tags(trim($_POST['qty'] ?? ''));
$product = strip_tags(trim($_POST['product'] ?? ''));
$date    = strip_tags(trim($_POST['date'] ?? ''));
$message = strip_tags(trim($_POST['message'] ?? ''));
$lang    = strip_tags(trim($_POST['lang'] ?? 'de'));
if (!in_array($lang, ['de', 'da', 'en'], true)) $lang = 'de';

if (!$name || !$email || !$message || !$qty || !$product) {
    echo json_encode(['ok' => false, 'error' => 'Pflichtfelder fehlen']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo json_encode(['ok' => false, 'error' => 'Ungültige E-Mail-Adresse']);
    exit;
}

// ─── In Datenbank speichern ────────────────────────────────────────
$fileName = !empty($_FILES['file']['name']) ? basename($_FILES['file']['name']) : null;
$mysqli = wf_db_connect();
if ($mysqli) {
    wf_ensure_tables($mysqli);
    $now = date('Y-m-d H:i:s');
    $stmt = $mysqli->prepare("
        INSERT INTO inquiries (created_at, name, email, phone, product, qty, wish_date, message, file_name, lang, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    ");
    $stmt->bind_param('ssssssssss', $now, $name, $email, $phone, $product, $qty, $date, $message, $fileName, $lang);
    $stmt->execute();
    $stmt->close();
    $mysqli->close();
}

// ─── Eingangsbestätigung an den Kunden senden ───────────────────────
wf_send_customer_mail($email, $name, $lang, 'received');

$to      = 'hej@wunsch-fabrik.dk';
$subject = "🔔 Neue Anfrage ($product) von $name";
$headers = "From: hej@wunsch-fabrik.dk\r\n";
$headers .= "Reply-To: $email\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

$body  = "Neue Anfrage über wunsch-fabrik.dk\n";
$body .= "=====================================\n\n";
$body .= "Name:         $name\n";
$body .= "E-Mail:       $email\n";
if ($phone) $body .= "Telefon:      $phone\n";
$body .= "Produktart:   $product\n";
$body .= "Stückzahl:    $qty\n";
if ($date) $body .= "Wunschdatum:  $date\n";
$body .= "\nNachricht:\n$message\n";
$body .= "\n-------------------------------------\n";
$body .= "Im Admin-Bereich ansehen und bearbeiten:\n";
$body .= "https://www.wunsch-fabrik.dk/admin.html\n";

// Handle file attachment
$attachment = '';
if (!empty($_FILES['file']['tmp_name']) && $_FILES['file']['error'] === 0) {
    $fileSize = $_FILES['file']['size'];
    if ($fileSize <= 30 * 1024 * 1024) {
        $fileName = basename($_FILES['file']['name']);
        $fileData = chunk_split(base64_encode(file_get_contents($_FILES['file']['tmp_name'])));
        $fileType = $_FILES['file']['type'];
        $boundary = md5(time());

        $headers  = "From: hej@wunsch-fabrik.dk\r\n";
        $headers .= "Reply-To: $email\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: multipart/mixed; boundary=\"$boundary\"\r\n";

        $body_mime  = "--$boundary\r\n";
        $body_mime .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
        $body_mime .= $body . "\r\n";
        $body_mime .= "--$boundary\r\n";
        $body_mime .= "Content-Type: $fileType; name=\"$fileName\"\r\n";
        $body_mime .= "Content-Transfer-Encoding: base64\r\n";
        $body_mime .= "Content-Disposition: attachment; filename=\"$fileName\"\r\n\r\n";
        $body_mime .= $fileData . "\r\n";
        $body_mime .= "--$boundary--";
        $body = $body_mime;
    }
}

$sent = mail($to, $subject, $body, $headers);
echo json_encode(['ok' => $sent]);
