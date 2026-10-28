<?php
/**
 * Wunsch-Fabrik.dk – Auftragsbestätigung mit digitaler Unterschrift
 * ------------------------------------------------------------------
 * Endpunkte (action):
 *   create   – legt einen neuen Auftrag an, gibt Token + Link zurück (Admin)
 *   list     – listet alle Aufträge (Admin)
 *   get      – lädt einen Auftrag per Token (öffentlich, für Kundenseite)
 *   sign     – speichert die Unterschrift des Kunden (öffentlich), erzeugt PDF
 *              und verschickt es per Mail an Kunde + hej@wunsch-fabrik.dk
 *   delete   – löscht einen Auftrag (Admin)
 *
 * Benötigt fpdf.php im selben Verzeichnis (reines PHP, keine Erweiterung nötig).
 */

header('Content-Type: application/json; charset=utf-8');
// Sitzung nur fortsetzen, wenn schon eine besteht (Admin angemeldet) – Besucher bekommen kein Cookie
if (isset($_COOKIE[session_name()])) {
    session_start();
}
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/fpdf.php';

$mysqli = wf_db_connect();
if (!$mysqli) {
    echo json_encode(['ok' => false, 'error' => 'DB connection failed']);
    exit;
}
wf_ensure_tables($mysqli);

// ─── Tabelle für Aufträge sicherstellen ───────────────────────────
$mysqli->query("
    CREATE TABLE IF NOT EXISTS auftraege (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        token         VARCHAR(64)  NOT NULL UNIQUE,
        kunde_name    VARCHAR(255) NOT NULL,
        kunde_email   VARCHAR(255) DEFAULT '',
        titel         VARCHAR(255) NOT NULL,
        inhalt        MEDIUMTEXT   NOT NULL,
        betrag        VARCHAR(64)  DEFAULT '',
        status        VARCHAR(20)  NOT NULL DEFAULT 'offen',
        signatur      MEDIUMTEXT   DEFAULT NULL,
        signatur_name VARCHAR(255) DEFAULT '',
        signed_ip     VARCHAR(64)  DEFAULT '',
        vorschaubild  VARCHAR(255) DEFAULT NULL,
        sprache       VARCHAR(5)   NOT NULL DEFAULT 'de',
        created_at    DATETIME     NOT NULL,
        signed_at     DATETIME     DEFAULT NULL,
        INDEX idx_token (token),
        INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");
// Nachträgliche Migration, falls Tabelle schon vor diesem Update existierte
$col = $mysqli->query("SHOW COLUMNS FROM auftraege LIKE 'vorschaubild'");
if ($col && $col->num_rows === 0) {
    $mysqli->query("ALTER TABLE auftraege ADD COLUMN vorschaubild VARCHAR(255) DEFAULT NULL AFTER signed_ip");
}
$col = $mysqli->query("SHOW COLUMNS FROM auftraege LIKE 'sprache'");
if ($col && $col->num_rows === 0) {
    $mysqli->query("ALTER TABLE auftraege ADD COLUMN sprache VARCHAR(5) NOT NULL DEFAULT 'de' AFTER vorschaubild");
}

$action = $_REQUEST['action'] ?? '';

// ─── Helfer ───────────────────────────────────────────────────────
function client_ip() {
    return $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
}
function base_url() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host   = $_SERVER['HTTP_HOST'] ?? 'www.wunsch-fabrik.dk';
    return $scheme . '://' . $host;
}

// DeepL-Übersetzung für Titel/Inhalt des Auftrags. Nutzt denselben API-Key wie
// die Rechtstexte-Funktion (WF_DEEPL_API_KEY, definiert in db.php).
function wf_deepl_translate($text, $targetLang) {
    if (!defined('WF_DEEPL_API_KEY') || WF_DEEPL_API_KEY === '') {
        return null; // Kein Key hinterlegt – Übersetzung überspringen
    }
    if (trim($text) === '') return '';

    $ch = curl_init('https://api-free.deepl.com/v2/translate');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: DeepL-Auth-Key ' . WF_DEEPL_API_KEY,
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'text'        => $text,
        'target_lang' => $targetLang, // 'DA' oder 'EN-GB'
        'source_lang' => 'DE',
    ]));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) return null;
    $data = json_decode($response, true);
    return $data['translations'][0]['text'] ?? null;
}

// Feste Labels/Überschriften in allen 3 Sprachen – kein API-Call nötig, da fest hinterlegt.
function wf_auftrag_labels($lang) {
    $labels = [
        'de' => [
            'auftragsbestaetigung' => 'Auftragsbestätigung',
            'kunde' => 'KUNDE',
            'betrag' => 'BETRAG',
            'auftragsdetails' => 'AUFTRAGSDETAILS',
            'entwurf_vorschau' => 'ENTWURF / VORSCHAU',
            'digitale_unterschrift' => 'DIGITALE UNTERSCHRIFT',
            'unterzeichnet_von' => 'Unterzeichnet von',
            'datum' => 'Datum',
            'uhr' => 'Uhr',
            'footer' => 'Diese Auftragsbestätigung wurde digital erstellt und ist rechtsgültig unterzeichnet.',
            'slogan' => 'Damit Dein Wunsch kein Wunsch bleiben muss.',
        ],
        'da' => [
            'auftragsbestaetigung' => 'Ordrebekræftelse',
            'kunde' => 'KUNDE',
            'betrag' => 'BELØB',
            'auftragsdetails' => 'ORDREOPLYSNINGER',
            'entwurf_vorschau' => 'DESIGN / FORHÅNDSVISNING',
            'digitale_unterschrift' => 'DIGITAL UNDERSKRIFT',
            'unterzeichnet_von' => 'Underskrevet af',
            'datum' => 'Dato',
            'uhr' => '',
            'footer' => 'Denne ordrebekræftelse er oprettet digitalt og er retsgyldigt underskrevet.',
            'slogan' => 'Så dit ønske ikke behøver at forblive et ønske.',
        ],
        'en' => [
            'auftragsbestaetigung' => 'Order Confirmation',
            'kunde' => 'CUSTOMER',
            'betrag' => 'AMOUNT',
            'auftragsdetails' => 'ORDER DETAILS',
            'entwurf_vorschau' => 'DESIGN / PREVIEW',
            'digitale_unterschrift' => 'DIGITAL SIGNATURE',
            'unterzeichnet_von' => 'Signed by',
            'datum' => 'Date',
            'uhr' => '',
            'footer' => 'This order confirmation was created digitally and is legally signed.',
            'slogan' => 'So your wish doesn\'t have to stay a wish.',
        ],
    ];
    return $labels[$lang] ?? $labels['de'];
}

// Ersetzt Umlaute/Sonderzeichen, die FPDFs Standard-Kodierung (Windows-1252)
// nicht abdeckt, damit nichts als "?" oder Kästchen im PDF landet.
function pdf_txt($text) {
    return @iconv('UTF-8', 'Windows-1252//TRANSLIT', $text) ?: $text;
}

// Baut aus einem Auftrags-Datensatz ein fertiges PDF und gibt den
// Rohinhalt als String zurück (nicht auf Platte gespeichert).
function build_auftrag_pdf($a) {
    // Website-Farbschema: dunkles Lila #8B2BE2 (139,43,226) und helleres Lila #A855F7 (168,85,247)
    $lang = $a['sprache'] ?? 'de';
    $L = wf_auftrag_labels($lang);

    $pdf = new FPDF('P', 'mm', 'A4');
    $pdf->SetAutoPageBreak(true, 20);
    $pdf->AddPage();

    // ─── KOPFBAND: farbige Leiste über die volle Seitenbreite ─────
    $pdf->SetFillColor(250, 247, 255); // sehr helles Lila-Weiß
    $pdf->Rect(0, 0, 210, 38, 'F');

    $logoPath = __DIR__ . '/wf-logo-pdf.png';
    if (!is_file($logoPath)) $logoPath = __DIR__ . '/wf-logo.png';
    if (is_file($logoPath)) {
        $logoInfo = @getimagesize($logoPath);
        if ($logoInfo) {
            $logoH = 15;
            $logoW = $logoH * ($logoInfo[0] / $logoInfo[1]);
            $pdf->Image($logoPath, 12, 9, $logoW, $logoH, 'PNG');
        }
    } else {
        $pdf->SetXY(12, 10);
        $pdf->SetFont('Arial', 'B', 16);
        $pdf->SetTextColor(139, 43, 226);
        $pdf->Cell(0, 10, pdf_txt('Wunsch-Fabrik.dk / Ønske-Fabrik.dk'), 0, 1);
    }

    // Kontaktzeile rechtsbündig neben dem Logo
    $pdf->SetXY(90, 11);
    $pdf->SetFont('Arial', '', 8.5);
    $pdf->SetTextColor(110, 100, 125);
    $pdf->MultiCell(88, 4.2, pdf_txt("Teglgard 1, 6330 Padborg\nhej@wunsch-fabrik.dk  -  www.wunsch-fabrik.dk"), 0, 'R');

    $pdf->SetXY(12, 26);
    $pdf->SetFont('Arial', 'I', 9);
    $pdf->SetTextColor(168, 85, 247);
    $pdf->Cell(0, 6, pdf_txt($L['slogan']), 0, 1);

    // ─── Einfache Trennlinie unter dem Kopfbereich ───
    $pdf->SetDrawColor(168, 85, 247);
    $pdf->SetLineWidth(0.6);
    $pdf->Line(10, 38, 200, 38);

    $pdf->SetY(48);

    // Titel
    $pdf->SetFont('Arial', 'B', 16);
    $pdf->SetTextColor(139, 43, 226);
    $pdf->MultiCell(0, 8, pdf_txt($L['auftragsbestaetigung']));
    $pdf->SetFont('Arial', '', 12);
    $pdf->SetTextColor(90, 90, 90);
    $pdf->MultiCell(0, 6, pdf_txt($a['titel']));
    $pdf->Ln(4);

    // ─── INFO-KARTE: echtes Zwei-Spalten-Layout, Betrag als großer Block rechts ───
    $cardY = $pdf->GetY();
    $cardH = 24;
    $hasBetrag = !empty($a['betrag']);
    $splitX = $hasBetrag ? 140 : 200;

    $pdf->SetFillColor(248, 246, 252);
    $pdf->SetDrawColor(228, 218, 245);
    $pdf->SetLineWidth(0.3);
    $pdf->Rect(10, $cardY, 190, $cardH, 'DF');
    if ($hasBetrag) {
        // Vertikale Trennlinie zwischen Kunde- und Betrag-Spalte
        $pdf->Line($splitX, $cardY + 3, $splitX, $cardY + $cardH - 3);
    }

    $pdf->SetXY(15, $cardY + 5);
    $pdf->SetFont('Arial', 'B', 8.5);
    $pdf->SetTextColor(168, 85, 247);
    $pdf->Cell($splitX - 20, 5, pdf_txt($L['kunde']), 0, 1);
    $pdf->SetX(15);
    $pdf->SetFont('Arial', '', 11);
    $pdf->SetTextColor(30, 30, 30);
    $pdf->Cell($splitX - 20, 6, pdf_txt($a['kunde_name']), 0, 1);
    if (!empty($a['kunde_email'])) {
        $pdf->SetX(15);
        $pdf->SetFont('Arial', '', 9);
        $pdf->SetTextColor(120, 120, 120);
        $pdf->Cell($splitX - 20, 5, pdf_txt($a['kunde_email']), 0, 1);
    }

    if ($hasBetrag) {
        $pdf->SetXY($splitX + 8, $cardY + 5);
        $pdf->SetFont('Arial', 'B', 8.5);
        $pdf->SetTextColor(168, 85, 247);
        $pdf->Cell(190 - $splitX - 16, 5, pdf_txt($L['betrag']), 0, 1);
        $pdf->SetXY($splitX + 8, $cardY + 11);
        $pdf->SetFont('Arial', 'B', 15);
        $pdf->SetTextColor(139, 43, 226);
        $pdf->Cell(190 - $splitX - 16, 8, pdf_txt($a['betrag']), 0, 1);
    }

    $pdf->SetY($cardY + $cardH + 8);

    // Auftragsdetails
    $pdf->SetFont('Arial', 'B', 10);
    $pdf->SetTextColor(168, 85, 247);
    $pdf->Cell(0, 6, pdf_txt($L['auftragsdetails']), 0, 1);
    $pdf->SetFont('Arial', '', 11);
    $pdf->SetTextColor(30, 30, 30);
    $pdf->MultiCell(0, 6, pdf_txt($a['inhalt']));
    $pdf->Ln(4);

    // Vorschaubild (Entwurf), falls vorhanden
    if (!empty($a['vorschaubild'])) {
        $imgPath = __DIR__ . '/' . $a['vorschaubild'];
        if (is_file($imgPath)) {
            $pdf->SetFont('Arial', 'B', 10);
            $pdf->SetTextColor(168, 85, 247);
            $pdf->Cell(0, 6, pdf_txt($L['entwurf_vorschau']), 0, 1);
            $pdf->Ln(2);
            $imgInfo = @getimagesize($imgPath);
            if ($imgInfo) {
                $maxW = 150;
                $wMm = $maxW;
                $hMm = $maxW * ($imgInfo[1] / $imgInfo[0]);
                if ($pdf->GetY() + $hMm > 265) { $pdf->AddPage(); }
                // Dezenter Rahmen um das Vorschaubild
                $frameY = $pdf->GetY();
                $pdf->SetDrawColor(228, 218, 245);
                $pdf->SetLineWidth(0.4);
                $pdf->Rect(10 - 1, $frameY - 1, $wMm + 2, $hMm + 2);
                $pdf->Image($imgPath, 10, $frameY, $wMm, $hMm);
                $pdf->Ln($hMm + 6);
            }
        }
    }

    // Unterschrift
    if (!empty($a['signatur'])) {
        if ($pdf->GetY() > 230) { $pdf->AddPage(); }
        $pdf->SetDrawColor(168, 85, 247);
        $pdf->SetLineWidth(0.4);
        $pdf->Line(10, $pdf->GetY(), 200, $pdf->GetY());
        $pdf->Ln(6);

        $pdf->SetFont('Arial', 'B', 10);
        $pdf->SetTextColor(168, 85, 247);
        $pdf->Cell(0, 6, pdf_txt($L['digitale_unterschrift']), 0, 1);
        $pdf->Ln(2);

        // Data-URL in temporäre PNG-Datei umwandeln (FPDF braucht einen Dateipfad)
        $sigData = $a['signatur'];
        if (strpos($sigData, 'data:image/png;base64,') === 0) {
            $raw = base64_decode(substr($sigData, strlen('data:image/png;base64,')));
            $tmpSig = tempnam(sys_get_temp_dir(), 'sig') . '.png';
            file_put_contents($tmpSig, $raw);
            $sigInfo = @getimagesize($tmpSig);
            if ($sigInfo) {
                $wMm = 75;
                $hMm = $wMm * ($sigInfo[1] / $sigInfo[0]);
                if ($pdf->GetY() + $hMm > 265) { $pdf->AddPage(); }
                // Kleine Unterschriftskarte mit Boden-Linie (wie ein Unterschriftsfeld auf Papier)
                $sigY = $pdf->GetY();
                $pdf->Image($tmpSig, 10, $sigY, $wMm, $hMm, 'PNG');
                $pdf->SetDrawColor(168, 85, 247);
                $pdf->SetLineWidth(0.3);
                $pdf->Line(10, $sigY + $hMm + 1, 10 + $wMm, $sigY + $hMm + 1);
                $pdf->Ln($hMm + 4);
            }
            @unlink($tmpSig);
        }

        $pdf->SetFont('Arial', '', 10);
        $pdf->SetTextColor(80, 80, 80);
        $pdf->Cell(0, 6, pdf_txt($L['unterzeichnet_von'] . ': ' . ($a['signatur_name'] ?: $a['kunde_name'])), 0, 1);
        if (!empty($a['signed_at'])) {
            $d = new DateTime($a['signed_at']);
            $datumText = $L['datum'] . ': ' . $d->format('d.m.Y H:i') . ($L['uhr'] ? ' ' . $L['uhr'] : '');
            $pdf->Cell(0, 6, pdf_txt($datumText), 0, 1);
        }
    }

    // Fußzeile direkt im Anschluss an den Inhalt (vermeidet unnötige leere Folgeseiten,
    // die durch SetY(-20) nach einem automatischen Seitenumbruch entstehen könnten)
    $pdf->Ln(10);
    $pdf->SetFont('Arial', 'I', 8);
    $pdf->SetTextColor(150, 150, 150);
    $pdf->Cell(0, 6, pdf_txt($L['footer']), 0, 0, 'C');

    return $pdf->Output('S'); // 'S' = als String zurückgeben, nicht speichern/ausgeben
}

// Verschickt eine Mail mit PDF-Anhang (reines PHP mail(), kein externes Paket nötig)
function send_mail_with_pdf($to, $subject, $bodyText, $pdfContent, $pdfFilename) {
    $boundary = md5(uniqid((string)time()));
    $fromHeader = "From: Wunsch-Fabrik.dk <hej@wunsch-fabrik.dk>\r\n";

    $headers  = $fromHeader;
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: multipart/mixed; boundary=\"$boundary\"\r\n";

    $body  = "--$boundary\r\n";
    $body .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $body .= $bodyText . "\r\n\r\n";

    $body .= "--$boundary\r\n";
    $body .= "Content-Type: application/pdf; name=\"$pdfFilename\"\r\n";
    $body .= "Content-Transfer-Encoding: base64\r\n";
    $body .= "Content-Disposition: attachment; filename=\"$pdfFilename\"\r\n\r\n";
    $body .= chunk_split(base64_encode($pdfContent)) . "\r\n";
    $body .= "--$boundary--";

    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
}

// Anlegen, Auflisten und Löschen nur für angemeldete Mitarbeiter mit Recht "Aufträge".
// Kunden-Aufrufe (get, sign, pdf) laufen weiter über den geheimen Token im Link.
if (in_array($action, ['create', 'list', 'delete'], true) && !wf_admin_can('auftraege', $mysqli)) {
    echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']);
    exit;
}

switch ($action) {

    // ─── Neuen Auftrag anlegen (Admin) ────────────────────────────
    case 'create': {
        $name   = trim($_POST['kunde_name']  ?? '');
        $email  = trim($_POST['kunde_email'] ?? '');
        $titel  = trim($_POST['titel']       ?? '');
        $inhalt = trim($_POST['inhalt']      ?? '');
        $betrag = trim($_POST['betrag']      ?? '');
        $sprache = trim($_POST['sprache']    ?? 'de');
        if (!in_array($sprache, ['de', 'da', 'en'], true)) $sprache = 'de';

        if ($name === '' || $titel === '' || $inhalt === '') {
            echo json_encode(['ok' => false, 'error' => 'Name, Titel und Inhalt sind Pflicht.']);
            exit;
        }

        // ─── Automatische Übersetzung, falls Dänisch oder Englisch gewählt ───
        // Der Admin schreibt immer auf Deutsch; DeepL übersetzt Titel + Inhalt
        // in dem Moment, in dem der Auftrag angelegt wird. Schlägt die Übersetzung
        // fehl (kein Key, API-Fehler), wird der deutsche Originaltext verwendet,
        // damit der Auftrag trotzdem erstellt werden kann.
        if ($sprache !== 'de') {
            $targetLang = $sprache === 'da' ? 'DA' : 'EN-GB';
            $titelUebersetzt = wf_deepl_translate($titel, $targetLang);
            $inhaltUebersetzt = wf_deepl_translate($inhalt, $targetLang);
            if ($titelUebersetzt !== null) $titel = $titelUebersetzt;
            if ($inhaltUebersetzt !== null) $inhalt = $inhaltUebersetzt;
        }

        // ─── Optionales Vorschaubild (Entwurf/Design) ─────────────
        $vorschaubild = null;
        if (!empty($_FILES['vorschaubild']['tmp_name']) && $_FILES['vorschaubild']['error'] === 0) {
            $allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mimeType = finfo_file($finfo, $_FILES['vorschaubild']['tmp_name']);
            finfo_close($finfo);

            if (in_array($mimeType, $allowedTypes, true) && $_FILES['vorschaubild']['size'] <= 8 * 1024 * 1024) {
                $uploadDir = __DIR__ . '/auftrag-vorschau';
                if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
                $ext = $mimeType === 'image/png' ? 'png' : ($mimeType === 'image/webp' ? 'webp' : 'jpg');
                $safeName = 'av_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
                if (move_uploaded_file($_FILES['vorschaubild']['tmp_name'], $uploadDir . '/' . $safeName)) {
                    $vorschaubild = 'auftrag-vorschau/' . $safeName;
                }
            }
        }

        $token = bin2hex(random_bytes(16)); // 32 Zeichen, nicht erratbar
        $now   = date('Y-m-d H:i:s');

        $stmt = $mysqli->prepare("
            INSERT INTO auftraege (token, kunde_name, kunde_email, titel, inhalt, betrag, vorschaubild, sprache, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offen', ?)
        ");
        $stmt->bind_param('sssssssss', $token, $name, $email, $titel, $inhalt, $betrag, $vorschaubild, $sprache, $now);

        if ($stmt->execute()) {
            $link = base_url() . '/auftrag.html?t=' . $token;
            echo json_encode([
                'ok'    => true,
                'id'    => $stmt->insert_id,
                'token' => $token,
                'link'  => $link
            ]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'DB insert failed']);
        }
        $stmt->close();
        break;
    }

    // ─── Alle Aufträge auflisten (Admin) ──────────────────────────
    case 'list': {
        $res = $mysqli->query("
            SELECT id, token, kunde_name, kunde_email, titel, betrag, status, created_at, signed_at, signatur_name, vorschaubild, sprache
            FROM auftraege ORDER BY created_at DESC
        ");
        $rows = [];
        while ($r = $res->fetch_assoc()) {
            $r['link'] = base_url() . '/auftrag.html?t=' . $r['token'];
            $rows[] = $r;
        }
        echo json_encode(['ok' => true, 'auftraege' => $rows]);
        break;
    }

    // ─── Einzelnen Auftrag per Token laden (öffentlich) ───────────
    case 'get': {
        $token = trim($_REQUEST['token'] ?? '');
        if ($token === '') { echo json_encode(['ok' => false, 'error' => 'Kein Token']); exit; }

        $stmt = $mysqli->prepare("
            SELECT kunde_name, kunde_email, titel, inhalt, betrag, status,
                   signatur, signatur_name, created_at, signed_at, vorschaubild, sprache
            FROM auftraege WHERE token = ? LIMIT 1
        ");
        $stmt->bind_param('s', $token);
        $stmt->execute();
        $res = $stmt->get_result();
        if ($row = $res->fetch_assoc()) {
            echo json_encode(['ok' => true, 'auftrag' => $row]);
        } else {
            echo json_encode(['ok' => false, 'error' => 'Auftrag nicht gefunden']);
        }
        $stmt->close();
        break;
    }

    // ─── Unterschrift speichern (öffentlich) ──────────────────────
    case 'sign': {
        $token   = trim($_POST['token'] ?? '');
        $sigData = $_POST['signatur'] ?? '';       // Data-URL (PNG base64)
        $sigName = trim($_POST['signatur_name'] ?? '');

        if ($token === '' || $sigData === '' || $sigName === '') {
            echo json_encode(['ok' => false, 'error' => 'Unterschrift und Name sind Pflicht.']);
            exit;
        }
        // Nur PNG-Data-URLs erlauben, Größe begrenzen (~2 MB)
        if (strpos($sigData, 'data:image/png;base64,') !== 0 || strlen($sigData) > 2600000) {
            echo json_encode(['ok' => false, 'error' => 'Ungültige Unterschrift.']);
            exit;
        }

        // Nur unterschreiben, wenn noch offen
        $chk = $mysqli->prepare("SELECT status FROM auftraege WHERE token = ? LIMIT 1");
        $chk->bind_param('s', $token);
        $chk->execute();
        $r = $chk->get_result()->fetch_assoc();
        $chk->close();
        if (!$r) { echo json_encode(['ok' => false, 'error' => 'Auftrag nicht gefunden']); exit; }
        if ($r['status'] === 'bestaetigt') {
            echo json_encode(['ok' => false, 'error' => 'Auftrag wurde bereits bestätigt.']);
            exit;
        }

        $now = date('Y-m-d H:i:s');
        $ip  = client_ip();
        $stmt = $mysqli->prepare("
            UPDATE auftraege
            SET signatur = ?, signatur_name = ?, signed_ip = ?, signed_at = ?, status = 'bestaetigt'
            WHERE token = ?
        ");
        $stmt->bind_param('sssss', $sigData, $sigName, $ip, $now, $token);
        if ($stmt->execute()) {
            echo json_encode(['ok' => true, 'signed_at' => $now]);

            // ─── PDF erzeugen und per Mail verschicken (Kunde + Admin) ───
            // Läuft NACH der Response an den Kunden, damit die Bestätigung
            // im Browser nicht wartet, falls der Mailversand mal langsam ist.
            if (function_exists('fastcgi_finish_request')) {
                fastcgi_finish_request();
            }
            try {
                $full = $mysqli->prepare("SELECT * FROM auftraege WHERE token = ? LIMIT 1");
                $full->bind_param('s', $token);
                $full->execute();
                $auftrag = $full->get_result()->fetch_assoc();
                $full->close();

                if ($auftrag) {
                    $pdfContent = build_auftrag_pdf($auftrag);
                    $pdfFilename = 'Auftragsbestaetigung_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $auftrag['titel']) . '.pdf';

                    $bodyKunde = "Hallo " . $auftrag['kunde_name'] . ",\n\n"
                        . "vielen Dank für Ihre Bestätigung! Im Anhang finden Sie Ihre Auftragsbestätigung als PDF.\n\n"
                        . "Wunsch-Fabrik.dk / Ønske-Fabrik.dk\n"
                        . "Teglgård 1, 6330 Padborg\n"
                        . "hej@wunsch-fabrik.dk";

                    if (!empty($auftrag['kunde_email'])) {
                        send_mail_with_pdf($auftrag['kunde_email'], 'Ihre Auftragsbestätigung – ' . $auftrag['titel'], $bodyKunde, $pdfContent, $pdfFilename);
                    }

                    $bodyAdmin = "Auftrag wurde soeben vom Kunden bestätigt.\n\n"
                        . "Kunde: " . $auftrag['kunde_name'] . "\n"
                        . "Titel: " . $auftrag['titel'] . "\n"
                        . "Bestätigt am: " . $now;
                    send_mail_with_pdf('hej@wunsch-fabrik.dk', '✓ Auftrag bestätigt – ' . $auftrag['titel'], $bodyAdmin, $pdfContent, $pdfFilename);
                }
            } catch (\Throwable $e) {
                // Mailversand darf die Bestätigung selbst nicht gefährden – wird stillschweigend übersprungen,
                // die Bestätigung in der Datenbank ist bereits erfolgt.
            }
        } else {
            echo json_encode(['ok' => false, 'error' => 'Speichern fehlgeschlagen']);
        }
        $stmt->close();
        break;
    }

    // ─── Auftrag löschen (Admin) ──────────────────────────────────
    case 'delete': {
        $id = intval($_POST['id'] ?? 0);
        if ($id <= 0) { echo json_encode(['ok' => false, 'error' => 'Ungültige ID']); exit; }
        $stmt = $mysqli->prepare("DELETE FROM auftraege WHERE id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        echo json_encode(['ok' => true]);
        $stmt->close();
        break;
    }

    // ─── PDF direkt herunterladen (Admin oder Kunde per Token) ────
    // Funktioniert auch VOR der Unterschrift (z.B. um eine Vorabversion
    // mit Entwurfsbild zu verschicken/auszudrucken).
    case 'pdf': {
        $token = trim($_REQUEST['token'] ?? '');
        if ($token === '') { http_response_code(400); echo 'Kein Token angegeben.'; exit; }

        $stmt = $mysqli->prepare("SELECT * FROM auftraege WHERE token = ? LIMIT 1");
        $stmt->bind_param('s', $token);
        $stmt->execute();
        $auftrag = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$auftrag) { http_response_code(404); echo 'Auftrag nicht gefunden.'; exit; }

        $pdfContent = build_auftrag_pdf($auftrag);
        $filename = 'Auftrag_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $auftrag['titel']) . '.pdf';

        header('Content-Type: application/pdf');
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($pdfContent));
        echo $pdfContent;
        exit;
    }

    default:
        echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
}

$mysqli->close();
