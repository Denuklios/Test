<?php
/**
 * Wunsch-Fabrik.dk – Website-Haupttexte (Startbereich, Willkommens-Text,
 * Abschnitts-Überschriften, Kontakt)
 * DE ist der Master-Text, den der Kunde im Admin-Bereich bearbeitet.
 * Beim Speichern werden DA und EN automatisch per DeepL übersetzt
 * und mitgespeichert – index.html liest die Texte live aus der DB.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
session_start();
require_once __DIR__ . '/db.php';

$mysqli = wf_db_connect();
if (!$mysqli) { echo json_encode(['ok' => false, 'error' => 'DB error']); exit; }
wf_ensure_tables($mysqli);

$action = $_REQUEST['action'] ?? 'get';
$isAdmin = wf_admin_can('sitetexts', $mysqli);

// ─── DeepL-Konfiguration ────────────────────────────────────────────
// Key wird in db.php als Konstante WF_DEEPL_API_KEY hinterlegt.
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
        'text'         => $text,
        'target_lang'  => $targetLang, // 'DA' oder 'EN-GB'
        'source_lang'  => 'DE',
    ]));
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) return null;
    $data = json_decode($response, true);
    return $data['translations'][0]['text'] ?? null;
}

// ─── ÖFFENTLICH: Alle Texte abrufen (für index.html) ─────────────────
if ($action === 'get') {
    $result = $mysqli->query("SELECT text_key, content_de, content_da, content_en FROM site_texts");
    $texts = ['de' => [], 'da' => [], 'en' => []];
    while ($row = $result->fetch_assoc()) {
        $key = $row['text_key'];
        $texts['de'][$key] = $row['content_de'];
        $texts['da'][$key] = $row['content_da'] ?: $row['content_de'];
        $texts['en'][$key] = $row['content_en'] ?: $row['content_de'];
    }
    echo json_encode(['ok' => true, 'texts' => $texts]);
    exit;
}

if (!$isAdmin) { echo json_encode(['ok' => false, 'error' => 'Nicht angemeldet']); exit; }

// ─── ADMIN: Alle Texte gruppiert (für Bearbeitungsformular) ──────────
if ($action === 'list_all') {
    $result = $mysqli->query("SELECT * FROM site_texts ORDER BY group_key, id");
    $rows = [];
    while ($row = $result->fetch_assoc()) $rows[] = $row;
    echo json_encode(['ok' => true, 'texts' => $rows]);
    exit;
}

// ─── ADMIN: Alle Felder EINER Gruppe auf einmal speichern & übersetzen ───
// Erwartet POST-Feld "fields" als JSON: {"text_key": "neuer deutscher Text", ...}
if ($action === 'update_group') {
    $group = trim($_POST['group_key'] ?? '');
    $fieldsJson = $_POST['fields'] ?? '';
    $fields = json_decode($fieldsJson, true);

    if ($group === '' || !is_array($fields) || count($fields) === 0) {
        echo json_encode(['ok' => false, 'error' => 'Ungültige Anfrage']);
        exit;
    }

    $translationFailed = false;
    $updated = 0;

    foreach ($fields as $key => $contentDe) {
        $key = trim((string)$key);
        $contentDe = trim((string)$contentDe);
        if ($key === '') continue;

        $contentDa = wf_deepl_translate($contentDe, 'DA');
        $contentEn = wf_deepl_translate($contentDe, 'EN-GB');

        if ($contentDa === null || $contentEn === null) {
            $translationFailed = true;
            // Nur DE aktualisieren, DA/EN unangetastet lassen
            $stmt = $mysqli->prepare("UPDATE site_texts SET content_de=? WHERE text_key=? AND group_key=?");
            $stmt->bind_param('sss', $contentDe, $key, $group);
        } else {
            $stmt = $mysqli->prepare("UPDATE site_texts SET content_de=?, content_da=?, content_en=? WHERE text_key=? AND group_key=?");
            $stmt->bind_param('sssss', $contentDe, $contentDa, $contentEn, $key, $group);
        }
        $stmt->execute();
        $updated += $stmt->affected_rows >= 0 ? 1 : 0;
        $stmt->close();
    }

    $warning = $translationFailed
        ? 'Automatische Übersetzung nicht verfügbar – nur Deutsch wurde gespeichert. Dänisch/Englisch bleiben auf dem vorherigen Stand.'
        : null;

    echo json_encode(['ok' => true, 'updated' => $updated, 'warning' => $warning]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'Unbekannte Aktion']);
