<?php
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once __DIR__ . '/db.php';

/**
 * Geheimer Schlüssel für die Rechenaufgabe (wird einmalig zufällig erzeugt und in der Datenbank gespeichert).
 */
function wf_form_secret($mysqli) {
    $mysqli->query("CREATE TABLE IF NOT EXISTS wf_meta (k VARCHAR(64) PRIMARY KEY, v VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $r = $mysqli->query("SELECT v FROM wf_meta WHERE k = 'form_secret'");
    if ($r && ($row = $r->fetch_assoc())) return $row['v'];
    $secret = bin2hex(random_bytes(32));
    $mysqli->query("INSERT IGNORE INTO wf_meta (k, v) VALUES ('form_secret', '$secret')");
    $r = $mysqli->query("SELECT v FROM wf_meta WHERE k = 'form_secret'");
    return ($r && ($row = $r->fetch_assoc())) ? $row['v'] : $secret;
}

// ─── Sicherheitsprüfung abholen (GET) ───────────────────────────────
// Unsichtbare Rechenarbeit (Proof-of-Work, Prinzip wie ALTCHA): Der Server denkt sich eine geheime Zahl aus
// und gibt nur deren SHA-256-Prüfsumme heraus. Der Browser probiert im Hintergrund alle Zahlen durch, bis er
// sie gefunden hat (ca. 1 Sekunde). Für einzelne Besucher unmerklich, für Spam-Programme mit tausenden
// Anfragen teuer. Signiert mit geheimem Schlüssel, 2 Stunden gültig, jeder Schein nur einmal verwendbar.
const WF_POW_MAX = 60000;
if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($_GET['action'] ?? '') === 'challenge') {
    $mysqli = wf_db_connect();
    if (!$mysqli) { echo json_encode(['ok' => false]); exit; }
    $salt = time() . '.' . bin2hex(random_bytes(8));
    $challenge = hash('sha256', $salt . random_int(0, WF_POW_MAX));
    $sig = hash_hmac('sha256', $salt . '|' . $challenge, wf_form_secret($mysqli));
    echo json_encode(['ok' => true, 'salt' => $salt, 'challenge' => $challenge, 'max' => WF_POW_MAX, 'sig' => $sig]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// ─── Spam-Schutz ────────────────────────────────────────────────────
// 1. Unsichtbares Feld ausgefüllt = Bot. Wir tun so, als wäre alles gut (Bot merkt nichts).
if (trim($_POST['website'] ?? '') !== '') {
    echo json_encode(['ok' => true]);
    exit;
}
// 2. Unsichtbare Rechenarbeit muss gelöst sein, frühestens 3 Sekunden nach dem Laden der Seite
$captchaOk = false;
$mysqliCheck = wf_db_connect();
$salt = (string)($_POST['pow_salt'] ?? '');
$challenge = (string)($_POST['pow_challenge'] ?? '');
$number = (string)($_POST['pow_number'] ?? '');
$sig = (string)($_POST['pow_sig'] ?? '');
if ($mysqliCheck && preg_match('/^(\d{10})\.([0-9a-f]{16})$/', $salt, $m) && preg_match('/^[0-9a-f]{64}$/', $challenge) && preg_match('/^[0-9a-f]{64}$/', $sig)
    && preg_match('/^\d{1,6}$/', $number) && (int)$number <= WF_POW_MAX) {
    $age = time() - (int)$m[1];
    $sigOk = hash_equals(hash_hmac('sha256', $salt . '|' . $challenge, wf_form_secret($mysqliCheck)), $sig);
    if ($age >= 3 && $age <= 7200 && $sigOk && hash_equals($challenge, hash('sha256', $salt . $number))) {
        // Jeder Schein nur einmal verwendbar
        $mysqliCheck->query("CREATE TABLE IF NOT EXISTS form_tokens_used (nonce CHAR(16) PRIMARY KEY, at DATETIME NOT NULL) ENGINE=InnoDB");
        $mysqliCheck->query("DELETE FROM form_tokens_used WHERE at < (NOW() - INTERVAL 1 DAY)");
        $stmt = $mysqliCheck->prepare("INSERT IGNORE INTO form_tokens_used (nonce, at) VALUES (?, NOW())");
        $stmt->bind_param('s', $m[2]);
        $stmt->execute();
        $captchaOk = $stmt->affected_rows === 1;
        $stmt->close();
    }
}
if (!$captchaOk) {
    echo json_encode(['ok' => false, 'error' => 'captcha']);
    exit;
}
// 3. Typischer Werbe-Spam: viele Links oder Links ohne sonstigen Inhalt
$msgRaw = (string)($_POST['message'] ?? '');
if (preg_match_all('#https?://|www\.#i', $msgRaw) > 2) {
    echo json_encode(['ok' => false, 'error' => 'links']);
    exit;
}

// Zeilenumbrüche aus Feldern entfernen, die in Mail-Kopfzeilen landen (Schutz vor Header-Injection)
function wf_one_line($s) { return trim(preg_replace('/[\r\n\t]+/', ' ', (string)$s)); }

$name    = wf_one_line(strip_tags(trim($_POST['name'] ?? '')));
$email   = strip_tags(trim($_POST['email'] ?? ''));
$phone   = strip_tags(trim($_POST['phone'] ?? ''));
$qty     = strip_tags(trim($_POST['qty'] ?? ''));
$product = wf_one_line(strip_tags(trim($_POST['product'] ?? '')));
$date    = strip_tags(trim($_POST['date'] ?? ''));
$message = strip_tags(trim($_POST['message'] ?? ''));
$lang    = strip_tags(trim($_POST['lang'] ?? 'de'));
if (!in_array($lang, ['de', 'da', 'en'], true)) $lang = 'de';

// Pflicht sind nur Name, E-Mail und Nachricht; Produkt und Menge sind freiwillig
if ($product === '') $product = 'Beratung';
if (!$name || !$email || !$message) {
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
    // Höchstens 5 Anfragen pro Stunde und IP-Adresse
    $mysqli->query("CREATE TABLE IF NOT EXISTS inquiry_rate (ip VARCHAR(64) NOT NULL, at DATETIME NOT NULL, INDEX idx_ip_at (ip, at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $mysqli->query("DELETE FROM inquiry_rate WHERE at < (NOW() - INTERVAL 1 DAY)");
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    $stmt = $mysqli->prepare("SELECT COUNT(*) AS c FROM inquiry_rate WHERE ip = ? AND at >= (NOW() - INTERVAL 1 HOUR)");
    $stmt->bind_param('s', $ip);
    $stmt->execute();
    $recent = (int)($stmt->get_result()->fetch_assoc()['c'] ?? 0);
    $stmt->close();
    if ($recent >= 5) {
        echo json_encode(['ok' => false, 'error' => 'Zu viele Anfragen in kurzer Zeit. Bitte später erneut versuchen oder per E-Mail an hej@wunsch-fabrik.dk schreiben.']);
        exit;
    }
    $stmt = $mysqli->prepare("INSERT INTO inquiry_rate (ip, at) VALUES (?, NOW())");
    $stmt->bind_param('s', $ip);
    $stmt->execute();
    $stmt->close();
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
