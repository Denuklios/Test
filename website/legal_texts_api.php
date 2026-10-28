<?php
/**
 * Wunsch-Fabrik.dk – Rechtstexte (Impressum, AGB, Datenschutz)
 * DE ist der Master-Text, den der Kunde im Admin-Bereich bearbeitet.
 * Beim Speichern werden DA und EN automatisch per DeepL übersetzt
 * und mitgespeichert – die öffentliche Seite liest nur aus der DB.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
session_start();
require_once __DIR__ . '/db.php';

$mysqli = wf_db_connect();
if (!$mysqli) { echo json_encode(['ok' => false, 'error' => 'DB error']); exit; }
wf_ensure_tables($mysqli);

$action = $_REQUEST['action'] ?? 'get';
$isAdmin = wf_admin_can('legal', $mysqli);

// ─── DeepL-Konfiguration ────────────────────────────────────────────
// Key wird in db.php als Konstante WF_DEEPL_API_KEY hinterlegt.
// Seit November 2025 verlangt DeepL Authentifizierung per HTTP-Header
// statt per auth_key im Request-Body (alte Methode gibt sonst 403/Fehlermeldung).
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
        'target_lang' => $targetLang, // 'DA' oder 'EN'
        'source_lang' => 'DE',
    ]));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) return null;
    $data = json_decode($response, true);
    return $data['translations'][0]['text'] ?? null;
}

// ─── ÖFFENTLICH: Text abrufen (für index.html) ───────────────────────
if ($action === 'get') {
    $result = $mysqli->query("SELECT type, title_de, content_de, title_da, content_da, title_en, content_en FROM legal_texts");
    $texts = [];
    while ($row = $result->fetch_assoc()) {
        $texts[$row['type']] = [
            'de' => ['title' => $row['title_de'], 'content' => $row['content_de']],
            'da' => ['title' => $row['title_da'] ?: $row['title_de'], 'content' => $row['content_da'] ?: $row['content_de']],
            'en' => ['title' => $row['title_en'] ?: $row['title_de'], 'content' => $row['content_en'] ?: $row['content_de']],
        ];
    }
    echo json_encode(['ok' => true, 'texts' => $texts]);
    exit;
}

if (!$isAdmin) { echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']); exit; }

// ─── ADMIN: Alle Texte (Rohdaten, für Bearbeitungsformular) ──────────
if ($action === 'list_all') {
    $result = $mysqli->query("SELECT * FROM legal_texts ORDER BY FIELD(type, 'impressum', 'agb', 'datenschutz')");
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    echo json_encode(['ok' => true, 'texts' => $rows]);
    exit;
}

// ─── ADMIN: Text aktualisieren (löst automatische Übersetzung aus) ───
if ($action === 'update') {
    $type = trim($_POST['type'] ?? '');
    $titleDe = trim($_POST['title_de'] ?? '');
    $contentDe = $_POST['content_de'] ?? '';

    if (!in_array($type, ['impressum', 'agb', 'datenschutz'], true)) {
        echo json_encode(['ok' => false, 'error' => 'Ungültiger Typ']);
        exit;
    }
    if ($titleDe === '' || trim($contentDe) === '') {
        echo json_encode(['ok' => false, 'error' => 'Titel und Text dürfen nicht leer sein']);
        exit;
    }

    $translationWarning = null;

    $titleDa = wf_deepl_translate($titleDe, 'DA');
    $contentDa = wf_deepl_translate($contentDe, 'DA');
    $titleEn = wf_deepl_translate($titleDe, 'EN-GB');
    $contentEn = wf_deepl_translate($contentDe, 'EN-GB');

    if ($titleDa === null || $contentDa === null || $titleEn === null || $contentEn === null) {
        $translationWarning = 'Automatische Übersetzung nicht verfügbar – nur Deutsch wurde gespeichert. Dänisch/Englisch bleiben auf dem vorherigen Stand.';
    }

    if ($translationWarning !== null) {
        // Nur DE aktualisieren, DA/EN unangetastet lassen
        $stmt = $mysqli->prepare("UPDATE legal_texts SET title_de=?, content_de=? WHERE type=?");
        $stmt->bind_param('sss', $titleDe, $contentDe, $type);
    } else {
        $stmt = $mysqli->prepare("UPDATE legal_texts SET title_de=?, content_de=?, title_da=?, content_da=?, title_en=?, content_en=? WHERE type=?");
        $stmt->bind_param('sssssss', $titleDe, $contentDe, $titleDa, $contentDa, $titleEn, $contentEn, $type);
    }
    $stmt->execute();
    $stmt->close();

    echo json_encode(['ok' => true, 'warning' => $translationWarning]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
