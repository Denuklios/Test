<?php
declare(strict_types=1);
require_once __DIR__ . '/tax.php';
require_once __DIR__ . '/docrender.php';

/*
 * Archiv bei Dritten: festgeschriebene Rechnungen/Kreditnotas, gebuchte Belege und eine wöchentliche Komplettsicherung
 * gehen per E-Mail an ein externes Postfach (z. B. Gmail = Google-Cloud). Warteschlange mit Wiederholung bei Fehlern.
 */

function wf_archive_cfg(): array
{
    $co = wf_company();
    $c = ['to' => trim((string)($co['archive_email'] ?? '')), 'from' => trim((string)($co['archive_from'] ?? '')) ?: trim((string)$co['email']),
        'drive_url' => trim((string)($co['drive_url'] ?? '')), 'drive_secret' => (string)($co['drive_secret'] ?? '')];
    // Google Drive (Apps-Script-Web-App) hat Vorrang, sonst E-Mail
    $c['mode'] = $c['drive_url'] !== '' && $c['drive_secret'] !== '' ? 'drive' : ($c['to'] !== '' && $c['from'] !== '' ? 'mail' : '');
    return $c;
}

/** Datei-Upload in den Drive-Ordner über das Apps Script des Kunden (Google leitet per 302 auf die Antwort um). */
function wf_drive_post(array $cfg, string $folder, string $subject, string $text, array $files): bool
{
    $payload = json_encode(['secret' => $cfg['drive_secret'], 'folder' => $folder, 'subject' => $subject, 'text' => $text,
        'files' => array_map(fn($f) => ['name' => $f['name'], 'mime' => $f['mime'], 'data' => base64_encode($f['data'])], $files)], JSON_UNESCAPED_UNICODE);
    $ch = curl_init($cfg['drive_url']);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 120, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 4]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $r = is_string($raw) ? json_decode($raw, true) : null;
    return $code >= 200 && $code < 300 && is_array($r) && !empty($r['ok']);
}

function wf_archive_send(array $cfg, array $m): bool
{
    if ($cfg['mode'] === 'drive') {
        return wf_drive_post($cfg, $m['folder'] ?? '', $m['subject'], $m['text'], $m['files']);
    }
    return $cfg['mode'] === 'mail' && wf_mail($cfg['to'], $cfg['from'], $m['subject'], $m['text'], $m['files']);
}

/** Apps Script zum Einfügen unter script.google.com (Geheimwort schon eingesetzt). */
function wf_drive_script(string $secret): string
{
    return <<<JS
// Wunsch-Fabrik Archiv -> Google Drive. Einfügen unter script.google.com, dann: Bereitstellen > Neue Bereitstellung > Web-App,
// "Ausführen als: Ich", "Zugriff: Jeder". Die angezeigte URL (endet auf /exec) in der Auftrags-App eintragen.
const SECRET = '$secret';
const ROOT = 'Wunsch-Fabrik Archiv';

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.secret !== SECRET) return out({ ok: false, error: 'secret' });
  let dir = folder(DriveApp.getRootFolder(), ROOT);
  String(d.folder || '').split('/').filter(String).forEach(function (p) { dir = folder(dir, p); });
  const files = d.files || [];
  files.forEach(function (f) { dir.createFile(Utilities.newBlob(Utilities.base64Decode(f.data), f.mime, f.name)); });
  if (d.text) dir.createFile(String(d.subject || 'Info').replace(/[\\/:*?"<>|]/g, '_') + '.txt', d.text, MimeType.PLAIN_TEXT);
  return out({ ok: true, saved: files.length });
}

function folder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
JS;
}

function wf_archive_queue(PDO $db, string $type, string $ref): void
{
    if (wf_archive_cfg()['mode'] === '') {
        return;
    }
    $db->prepare('INSERT OR IGNORE INTO archive_queue (type, ref) VALUES (?, ?)')->execute([$type, $ref]);
}

/** E-Mail mit Anhängen (MIME). Tests: WF_MAIL_DIR schreibt .eml-Dateien statt zu senden. */
function wf_mail(string $to, string $from, string $subject, string $text, array $files, string $fromName = 'Wunsch-Fabrik Archiv'): bool
{
    $b = 'wf' . bin2hex(random_bytes(12));
    $enc = fn(string $s) => '=?UTF-8?B?' . base64_encode($s) . '?=';
    $body = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text)) . "\r\n";
    foreach ($files as $f) {
        $body .= "--$b\r\nContent-Type: {$f['mime']}; name=\"{$f['name']}\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"{$f['name']}\"\r\n\r\n"
            . chunk_split(base64_encode($f['data'])) . "\r\n";
    }
    $body .= "--$b--\r\n";
    $headers = 'From: ' . $enc(str_replace(["\r", "\n"], '', $fromName)) . " <$from>\r\nReply-To: $from\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=\"$b\"\r\nX-Mailer: Wunsch-Fabrik Auftraege";
    if ($dir = getenv('WF_MAIL_DIR')) {
        @mkdir($dir, 0775, true);
        return (bool)file_put_contents($dir . '/' . microtime(true) . '-' . preg_replace('/\W+/', '_', $subject) . '.eml', "To: $to\r\nSubject: " . $enc($subject) . "\r\n$headers\r\n\r\n$body");
    }
    return @mail($to, $enc($subject), $body, $headers, '-f' . $from);
}

/** Inhalt einer Archiv-Mail. */
function wf_archive_build(PDO $db, array $q): ?array
{
    $co = wf_company();
    $dir = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/';
    if ($q['type'] === 'invoice') {
        $i = wf_inv_load($db, (int)$q['ref']);
        if (!$i || $i['status'] !== 'final') {
            return null;
        }
        $kind = $i['type'] === 'credit' ? 'Kreditnota' : 'Faktura';
        $C = $i['customer_snap'];
        $html = wf_doc_html($db, $i, null, true);
        $csv = wf_csv(['Nr', 'Type', 'Dato', 'Forfald', 'Kunde', 'Momsnr', 'Valuta', 'Netto', 'Moms', 'I alt', 'Netto DKK', 'Moms DKK', 'Kontrolsum'],
            [[$i['number'], $kind, $i['issue_date'], $i['due_date'], $C['company'] ?: $C['name'], $C['vat_id'] ?? '', $i['currency'], wf_kr((int)$i['net']), wf_kr((int)$i['vat']), wf_kr((int)$i['total']), wf_kr((int)$i['net_dkk']), wf_kr((int)$i['vat_dkk']), $i['hash']]]);
        return ['folder' => ($i['type'] === 'credit' ? 'Kreditnotaer' : 'Fakturaer') . '/' . substr($i['issue_date'], 0, 4),
            'subject' => sprintf('[WF-Archiv] %s %d · %s · %s', $kind, $i['number'], $i['issue_date'], $C['company'] ?: $C['name']),
            'text' => "$kind {$i['number']} vom {$i['issue_date']} an " . ($C['company'] ?: $C['name']) . "\nBetrag: " . wf_kr((int)$i['total']) . " {$i['currency']}\nKontrollsumme: {$i['hash']}\n\nAutomatische Archivkopie (Bogføringsloven: 5 Jahre aufbewahren). Anhang im Browser öffnen, als PDF druckbar.",
            'files' => [['name' => "$kind-{$i['number']}.html", 'mime' => 'text/html', 'data' => $html], ['name' => "$kind-{$i['number']}.csv", 'mime' => 'text/csv', 'data' => $csv]]];
    }
    if ($q['type'] === 'expense') {
        $e = wf_exp_load($db, (int)$q['ref']);
        if (!$e || $e['status'] !== 'final') {
            return null;
        }
        $files = [];
        if ($e['file_stored'] && is_file($dir . $e['file_stored'])) {
            $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'application/pdf' => 'pdf'][$e['file_mime']] ?? 'dat';
            $files[] = ['name' => sprintf('Bilag-%04d.%s', $e['number'], $ext), 'mime' => $e['file_mime'], 'data' => (string)file_get_contents($dir . $e['file_stored'])];
        }
        $cat = wf_exp_categories()[$e['category']][1] ?? $e['category'];
        return ['folder' => 'Bilag/' . substr($e['date'], 0, 4), 'subject' => sprintf('[WF-Archiv] Bilag %d · %s · %s · %s kr.', $e['number'], $e['date'], $e['supplier'], wf_kr((int)$e['gross_dkk'])),
            'text' => "Bilag {$e['number']} vom {$e['date']}\nLieferant: {$e['supplier']}\nKategorie: $cat\nBetrag: " . wf_kr((int)$e['gross']) . " {$e['currency']} (" . wf_kr((int)$e['gross_dkk']) . " DKK)\nAbziehbare Moms: " . wf_kr((int)$e['deduct_dkk']) . " DKK\n"
                . ($e['no_receipt'] ? "Kein Beleg: {$e['no_receipt']}\n" : '') . "Kontrollsumme: {$e['hash']}\n\nAutomatische Archivkopie (5 Jahre aufbewahren).",
            'files' => $files];
    }
    if ($q['type'] === 'backup') {
        $tmp = tempnam(sys_get_temp_dir(), 'wfa') . '.sqlite';
        $db->exec("VACUUM INTO '" . str_replace("'", "''", $tmp) . "'");
        $data = (string)gzencode((string)file_get_contents($tmp), 9);
        @unlink($tmp);
        $chk = wf_journal_verify($db);
        return ['folder' => 'Sikkerhedskopi', 'subject' => '[WF-Archiv] Wochensicherung ' . date('Y-m-d') . ' · ' . $co['name'],
            'text' => 'Komplette Datenbank (Aufträge, Kunden, Rechnungen, Ausgaben, Journal) vom ' . date('Y-m-d H:i') . ".\nPrüfkette: " . ($chk['ok'] ? 'OK' : 'ABWEICHUNG: ' . implode(', ', $chk['problems']))
                . "\n\nWiederherstellen: Datei entpacken (.gz) und als data/auftraege.sqlite einsetzen. Belegfotos kommen einzeln mit jedem Bilag.",
            'files' => [['name' => 'auftraege-' . date('Y-m-d') . '.sqlite.gz', 'mime' => 'application/gzip', 'data' => $data]]];
    }
    return null;
}

/** Offene Einträge senden (höchstens $limit), wöchentliche Sicherung einplanen. */
function wf_archive_run(PDO $db, int $limit = 5): array
{
    $cfg = wf_archive_cfg();
    if ($cfg['mode'] === '') {
        return ['sent' => 0, 'failed' => 0];
    }
    $last = (string)($db->query("SELECT value FROM meta WHERE key = 'archive_last_backup'")->fetchColumn() ?: '');
    if ($last === '' || $last < date('Y-m-d', strtotime('-7 days'))) {
        wf_archive_queue($db, 'backup', date('Y-m-d'));
    }
    $sent = 0;
    $failed = 0;
    $st = $db->prepare("SELECT * FROM archive_queue WHERE sent_at IS NULL AND attempts < 10 AND (attempts = 0 OR created_at < datetime('now', '-' || (attempts * 10) || ' minutes')) ORDER BY id LIMIT ?");
    $st->execute([$limit]);
    foreach ($st->fetchAll() as $q) {
        $m = wf_archive_build($db, $q);
        if (!$m) {
            $db->prepare("UPDATE archive_queue SET sent_at = datetime('now'), last_error = 'übersprungen' WHERE id = ?")->execute([$q['id']]);
            continue;
        }
        $ok = wf_archive_send($cfg, $m);
        if ($ok) {
            $db->prepare("UPDATE archive_queue SET sent_at = datetime('now'), attempts = attempts + 1, last_error = '' WHERE id = ?")->execute([$q['id']]);
            if ($q['type'] === 'backup') {
                $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('archive_last_backup', ?)")->execute([date('Y-m-d')]);
            }
            $sent++;
        } else {
            $db->prepare("UPDATE archive_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?")->execute([$cfg['mode'] === 'drive' ? 'Drive-Upload fehlgeschlagen' : 'mail() fehlgeschlagen', $q['id']]);
            $failed++;
        }
    }
    return ['sent' => $sent, 'failed' => $failed];
}

function wf_archive_status(PDO $db): array
{
    $r = $db->query("SELECT SUM(sent_at IS NOT NULL) AS sent, SUM(sent_at IS NULL) AS open, SUM(sent_at IS NULL AND attempts >= 3) AS failing,
                     MAX(sent_at) AS last_sent FROM archive_queue")->fetch();
    $err = (string)($db->query("SELECT last_error FROM archive_queue WHERE sent_at IS NULL AND last_error <> '' ORDER BY id DESC LIMIT 1")->fetchColumn() ?: '');
    return ['sent' => (int)$r['sent'], 'open' => (int)$r['open'], 'failing' => (int)$r['failing'], 'last_sent' => $r['last_sent'], 'last_error' => $err,
        'last_backup' => (string)($db->query("SELECT value FROM meta WHERE key = 'archive_last_backup'")->fetchColumn() ?: '')]
        + array_diff_key(wf_archive_cfg(), ['drive_secret' => 1]);
}
