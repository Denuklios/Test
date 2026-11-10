<?php
/**
 * Wunsch-Fabrik.dk – Newsletter
 * Abonnenten mit Double-Opt-in, Newsletter in DE/DA/EN, Versand in kleinen Paketen
 * (angestoßen vom Besucherzähler und vom Admin-Bereich) und Entwürfe aus newsletter-plan/*.json.
 */

if (!function_exists('wf_nl_tables')) {

define('WF_NL_BASE', 'https://www.wunsch-fabrik.dk/');
define('WF_NL_FROM', 'hej@wunsch-fabrik.dk');
define('WF_NL_LANGS', ['de', 'da', 'en']);
define('WF_NL_BATCH', 25);          // Mails je Durchgang
define('WF_NL_PLAN_LEAD', 48);      // Stunden Vorlauf für Entwürfe aus Dateien (Zeit zum Prüfen/Stoppen)

function wf_nl_tables($mysqli) {
    static $done = false;
    if ($done) return;
    $done = true;
    $mysqli->query("CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL DEFAULT '',
        lang VARCHAR(5) NOT NULL DEFAULT 'de',
        status VARCHAR(14) NOT NULL DEFAULT 'pending',
        token CHAR(32) NOT NULL,
        source VARCHAR(30) NOT NULL DEFAULT '',
        consent_text VARCHAR(400) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL,
        confirmed_at DATETIME NULL,
        unsubscribed_at DATETIME NULL,
        INDEX idx_status (status), INDEX idx_token (token)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $mysqli->query("CREATE TABLE IF NOT EXISTS newsletters (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(190) NOT NULL DEFAULT '',
        subject_de VARCHAR(255) NOT NULL DEFAULT '', subject_da VARCHAR(255) NOT NULL DEFAULT '', subject_en VARCHAR(255) NOT NULL DEFAULT '',
        body_de MEDIUMTEXT NULL, body_da MEDIUMTEXT NULL, body_en MEDIUMTEXT NULL,
        status VARCHAR(12) NOT NULL DEFAULT 'draft',
        send_at DATETIME NULL,
        created_by VARCHAR(60) NOT NULL DEFAULT '',
        plan_key VARCHAR(100) NULL UNIQUE,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        sent_at DATETIME NULL,
        sent_count INT NOT NULL DEFAULT 0,
        fail_count INT NOT NULL DEFAULT 0,
        INDEX idx_status_send (status, send_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $mysqli->query("CREATE TABLE IF NOT EXISTS newsletter_log (
        newsletter_id INT NOT NULL,
        subscriber_id INT NOT NULL,
        sent_at DATETIME NOT NULL,
        ok TINYINT NOT NULL DEFAULT 1,
        PRIMARY KEY (newsletter_id, subscriber_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $mysqli->query("CREATE TABLE IF NOT EXISTS newsletter_rate (ip_hash CHAR(64) NOT NULL, at DATETIME NOT NULL, INDEX idx_ip_at (ip_hash, at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function wf_nl_lang($l) {
    return in_array($l, WF_NL_LANGS, true) ? $l : 'de';
}

function wf_nl_esc($s) {
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

/** Feste Texte (Bestätigung, Abmeldung, Fußzeile) je Sprache. */
function wf_nl_t($lang, $key) {
    static $T = [
        'de' => [
            'confirm_subject' => 'Bitte bestätige deine Newsletter-Anmeldung – Wunsch-Fabrik.dk',
            'confirm_body' => "Hallo{name},\n\ndu hast dich für den Newsletter von Wunsch-Fabrik.dk angemeldet. Bitte bestätige das mit einem Klick:\n\n{link}\n\nWir schreiben nur ein paar Mal im Jahr – zu Saisonstart, Aktionen und Weihnachten. Abmelden kannst du dich jederzeit über den Link in jeder Mail.\n\nWenn du dich nicht angemeldet hast, ignoriere diese Mail einfach – dann passiert nichts.\n\nLiebe Grüße\nDein Wunsch-Fabrik-Team",
            'confirm_btn' => 'Anmeldung bestätigen',
            'ok_title' => 'Danke – du bist angemeldet!',
            'ok_text' => 'Ab jetzt bekommst du unseren Newsletter. Abmelden geht jederzeit über den Link in jeder Mail.',
            'bad_title' => 'Link ungültig',
            'bad_text' => 'Dieser Link ist abgelaufen oder wurde schon benutzt.',
            'unsub_title' => 'Newsletter abbestellen',
            'unsub_text' => 'Möchtest du keine Newsletter mehr von uns bekommen?',
            'unsub_btn' => 'Ja, abmelden',
            'unsub_done' => 'Du bist abgemeldet und bekommst keine Newsletter mehr.',
            'back' => 'Zur Webseite',
            'foot' => 'Du bekommst diese Mail, weil du dich für den Newsletter von Wunsch-Fabrik.dk angemeldet hast.',
            'unsub_link' => 'Newsletter abbestellen',
            'browser' => 'Hallo',
        ],
        'da' => [
            'confirm_subject' => 'Bekræft venligst din tilmelding til nyhedsbrevet – Ønske-Fabrik.dk',
            'confirm_body' => "Hej{name},\n\ndu har tilmeldt dig nyhedsbrevet fra Ønske-Fabrik.dk. Bekræft venligst med et klik:\n\n{link}\n\nVi skriver kun et par gange om året – til sæsonstart, tilbud og jul. Du kan altid afmelde dig via linket i hver mail.\n\nHar du ikke tilmeldt dig, kan du bare ignorere denne mail – så sker der ingenting.\n\nMange hilsner\nDit Ønske-Fabrik team",
            'confirm_btn' => 'Bekræft tilmelding',
            'ok_title' => 'Tak – du er tilmeldt!',
            'ok_text' => 'Fra nu af får du vores nyhedsbrev. Du kan altid afmelde dig via linket i hver mail.',
            'bad_title' => 'Ugyldigt link',
            'bad_text' => 'Linket er udløbet eller allerede brugt.',
            'unsub_title' => 'Afmeld nyhedsbrev',
            'unsub_text' => 'Vil du ikke længere modtage nyhedsbreve fra os?',
            'unsub_btn' => 'Ja, afmeld',
            'unsub_done' => 'Du er afmeldt og modtager ikke flere nyhedsbreve.',
            'back' => 'Til hjemmesiden',
            'foot' => 'Du modtager denne mail, fordi du har tilmeldt dig nyhedsbrevet fra Ønske-Fabrik.dk.',
            'unsub_link' => 'Afmeld nyhedsbrev',
            'browser' => 'Hej',
        ],
        'en' => [
            'confirm_subject' => 'Please confirm your newsletter subscription – Wunsch-Fabrik.dk',
            'confirm_body' => "Hi{name},\n\nyou signed up for the Wunsch-Fabrik.dk newsletter. Please confirm with one click:\n\n{link}\n\nWe only write a few times a year – season starts, offers and Christmas. You can unsubscribe any time via the link in every email.\n\nIf you didn't sign up, simply ignore this email – nothing will happen.\n\nBest regards\nThe Wunsch-Fabrik Team",
            'confirm_btn' => 'Confirm subscription',
            'ok_title' => "Thanks – you're subscribed!",
            'ok_text' => 'From now on you will receive our newsletter. You can unsubscribe any time via the link in every email.',
            'bad_title' => 'Invalid link',
            'bad_text' => 'This link has expired or has already been used.',
            'unsub_title' => 'Unsubscribe',
            'unsub_text' => 'Would you like to stop receiving our newsletter?',
            'unsub_btn' => 'Yes, unsubscribe',
            'unsub_done' => "You're unsubscribed and won't receive any more newsletters.",
            'back' => 'Back to the website',
            'foot' => 'You receive this email because you subscribed to the Wunsch-Fabrik.dk newsletter.',
            'unsub_link' => 'Unsubscribe',
            'browser' => 'Hi',
        ],
    ];
    return $T[wf_nl_lang($lang)][$key] ?? $T['de'][$key] ?? '';
}

/** Einwilligungstext, der beim Abonnenten gespeichert wird (Nachweis). */
function wf_nl_consent_text($lang) {
    return [
        'de' => 'Ich möchte den Newsletter von Wunsch-Fabrik.dk per E-Mail erhalten (wenige Male im Jahr). Abmeldung jederzeit möglich.',
        'da' => 'Jeg vil gerne modtage nyhedsbrevet fra Ønske-Fabrik.dk på e-mail (få gange om året). Afmelding er altid mulig.',
        'en' => 'I would like to receive the Wunsch-Fabrik.dk newsletter by email (a few times a year). I can unsubscribe at any time.',
    ][wf_nl_lang($lang)];
}

/**
 * Einfache Textauszeichnung in Mail-HTML umwandeln:
 *   Leerzeile = neuer Absatz · "## Überschrift" · "**fett**" · "[Text](https://…)" · "- Aufzählung"
 *   "![](https://…bild.jpg)" = Bild · "[[Knopf-Text | https://…]]" = Knopf · {name} = Vorname/Name
 */
function wf_nl_markup($text, $name = '') {
    $text = wf_nl_name(str_replace("\r\n", "\n", (string)$text), $name);
    $inline = function ($s) {
        $s = wf_nl_esc($s);
        $s = preg_replace('/\*\*(.+?)\*\*/u', '<strong>$1</strong>', $s);
        $s = preg_replace_callback('/\[([^\]]+)\]\((https?:\/\/[^\s)]+|#[^\s)]*|[a-z0-9._\/-]+\.html[^\s)]*)\)/iu', function ($m) {
            $u = html_entity_decode($m[2], ENT_QUOTES, 'UTF-8');
            if (!preg_match('#^https?://#i', $u)) $u = WF_NL_BASE . ltrim($u, '/');
            return '<a href="' . wf_nl_esc($u) . '" style="color:#7e22ce;">' . $m[1] . '</a>';
        }, $s);
        return $s;
    };
    $out = '';
    foreach (preg_split("/\n{2,}/", trim($text)) as $block) {
        $block = trim($block);
        if ($block === '') continue;
        if (preg_match('/^!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)$/u', $block, $m)) {
            $out .= '<p style="margin:0 0 18px;"><img src="' . wf_nl_esc($m[1]) . '" alt="" width="560" style="width:100%;max-width:560px;height:auto;border-radius:10px;display:block;"></p>';
        } elseif (preg_match('/^\[\[\s*(.+?)\s*\|\s*(\S+?)\s*\]\]$/u', $block, $m)) {
            $u = preg_match('#^https?://#i', $m[2]) ? $m[2] : WF_NL_BASE . ltrim($m[2], '/');
            $out .= '<p style="margin:6px 0 22px;"><a href="' . wf_nl_esc($u) . '" style="display:inline-block;background:#7e22ce;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;">' . wf_nl_esc($m[1]) . '</a></p>';
        } elseif (preg_match('/^#{1,3}\s+(.+)$/u', $block, $m)) {
            $out .= '<h2 style="margin:8px 0 12px;font-family:Georgia,serif;font-size:22px;font-weight:normal;color:#1d1b22;">' . $inline($m[1]) . '</h2>';
        } elseif (preg_match('/^[-•*]\s/u', $block)) {
            $items = array_filter(array_map(fn($l) => preg_replace('/^[-•*]\s+/u', '', trim($l)), explode("\n", $block)), 'strlen');
            $out .= '<ul style="margin:0 0 18px;padding-left:20px;">' . implode('', array_map(fn($i) => '<li style="margin:0 0 6px;">' . $inline($i) . '</li>', $items)) . '</ul>';
        } else {
            $out .= '<p style="margin:0 0 16px;">' . nl2br($inline($block)) . '</p>';
        }
    }
    return $out;
}

/** {name} einsetzen; ohne Namen verschwindet der Platzhalter samt Leerzeichen („Hallo {name},“ → „Hallo,“). */
function wf_nl_name($text, $name) {
    $name = trim((string)$name);
    return $name === '' ? str_replace([' {name}', '{name}'], '', $text) : str_replace('{name}', $name, $text);
}

/** Klartext-Fassung (für Mailprogramme ohne HTML). */
function wf_nl_plain($text, $name = '') {
    $t = wf_nl_name(str_replace("\r\n", "\n", (string)$text), $name);
    $t = preg_replace('/^!\[[^\]]*\]\([^)]+\)$/mu', '', $t);
    $t = preg_replace('/\[\[\s*(.+?)\s*\|\s*(\S+?)\s*\]\]/u', '$1: $2', $t);
    $t = preg_replace('/\[([^\]]+)\]\(([^)]+)\)/u', '$1 ($2)', $t);
    $t = preg_replace('/\*\*(.+?)\*\*/u', '$1', $t);
    $t = preg_replace('/^#{1,3}\s+/mu', '', $t);
    return trim(preg_replace("/\n{3,}/", "\n\n", $t));
}

/** Betreff/Text für eine Sprache, mit Rückfall auf Deutsch. */
function wf_nl_part($nl, $lang) {
    $lang = wf_nl_lang($lang);
    $subj = trim((string)($nl['subject_' . $lang] ?? ''));
    $body = trim((string)($nl['body_' . $lang] ?? ''));
    if ($subj === '' || $body === '') {
        $lang = 'de';
        $subj = trim((string)$nl['subject_de']);
        $body = trim((string)$nl['body_de']);
    }
    return [$subj, $body, $lang];
}

/** Komplette Mail (HTML + Text) im Wunsch-Fabrik-Stil. */
function wf_nl_render($nl, $lang, $sub = null) {
    [$subj, $body, $lang] = wf_nl_part($nl, $lang);
    $name = $sub && trim((string)$sub['name']) !== '' ? trim((string)$sub['name']) : '';
    $unsub = $sub ? WF_NL_BASE . 'newsletter.php?a=unsub&t=' . $sub['token'] . '&l=' . $lang : WF_NL_BASE . 'newsletter.php?a=unsub&l=' . $lang;
    $brand = $lang === 'da' ? 'ØNSKE-FABRIK.DK' : 'WUNSCH-FABRIK.DK';
    $html = '<!doctype html><html lang="' . $lang . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . wf_nl_esc($subj) . '</title></head>'
        . '<body style="margin:0;padding:0;background:#f3f0f8;">'
        . '<div style="display:none;max-height:0;overflow:hidden;">' . wf_nl_esc(mb_substr(wf_nl_plain($body, $name), 0, 140)) . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0f8;"><tr><td align="center" style="padding:24px 12px;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">'
        . '<tr><td style="background:#0b0910;padding:22px 28px;"><img src="' . WF_NL_BASE . 'wf-logo-160.png" alt="WF" height="30" style="height:30px;vertical-align:middle;"> '
        . '<span style="color:#ffffff;font-family:Georgia,serif;font-size:18px;letter-spacing:2px;vertical-align:middle;margin-left:8px;">' . $brand . '</span></td></tr>'
        . '<tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#2a2733;">' . wf_nl_markup($body, $name) . '</td></tr>'
        . '<tr><td style="padding:18px 28px 26px;border-top:1px solid #eee8f5;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#7a7488;">'
        . wf_nl_esc(wf_nl_t($lang, 'foot')) . '<br>Wunsch-Fabrik.dk · Teglgård 1, Vilsbæk · 6330 Padborg · Danmark<br>'
        . '<a href="' . WF_NL_BASE . '" style="color:#7e22ce;">www.wunsch-fabrik.dk</a> · <a href="' . wf_nl_esc($unsub) . '" style="color:#7e22ce;">' . wf_nl_esc(wf_nl_t($lang, 'unsub_link')) . '</a>'
        . '</td></tr></table></td></tr></table></body></html>';
    $text = wf_nl_plain($body, $name) . "\n\n--\nWunsch-Fabrik.dk · Teglgård 1, Vilsbæk · 6330 Padborg\n" . wf_nl_t($lang, 'unsub_link') . ': ' . $unsub;
    return ['subject' => $subj, 'html' => $html, 'text' => $text, 'unsub' => $unsub, 'lang' => $lang];
}

/** Mail mit HTML- und Textteil sowie Abmelde-Kopfzeilen verschicken. */
function wf_nl_send_mail($to, $subject, $html, $text, $unsub = '') {
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
    $b = 'wfnl' . bin2hex(random_bytes(8));
    $headers = "From: Wunsch-Fabrik.dk <" . WF_NL_FROM . ">\r\n"
        . "Reply-To: " . WF_NL_FROM . "\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: multipart/alternative; boundary=\"$b\"\r\n";
    if ($unsub !== '') {
        $headers .= "List-Unsubscribe: <" . $unsub . ">, <mailto:" . WF_NL_FROM . "?subject=Abmelden>\r\n"
            . "List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n"
            . "Precedence: bulk\r\n";
    }
    $body = "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
        . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html))
        . "--$b--";
    $subj = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    if (getenv('WF_NL_TEST_DIR')) {   // Testbetrieb: Mail als Datei ablegen statt senden
        @file_put_contents(rtrim(getenv('WF_NL_TEST_DIR'), '/') . '/' . microtime(true) . '-' . preg_replace('/[^a-z0-9@._-]/i', '_', $to) . '.eml', "To: $to\r\nSubject: $subject\r\n$headers\r\n$body");
        return true;
    }
    return @mail($to, $subj, $body, $headers);
}

/** Anmeldung starten (Double-Opt-in): legt Abonnent an bzw. schickt die Bestätigung erneut. */
function wf_nl_subscribe($mysqli, $email, $name, $lang, $source) {
    wf_nl_tables($mysqli);
    $email = mb_strtolower(trim((string)$email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) return ['ok' => false, 'error' => 'email'];
    $lang = wf_nl_lang($lang);
    $name = mb_substr(trim((string)$name), 0, 120);
    $now = date('Y-m-d H:i:s');
    $st = $mysqli->prepare("SELECT * FROM newsletter_subscribers WHERE email = ?");
    $st->bind_param('s', $email);
    $st->execute();
    $row = $st->get_result()->fetch_assoc();
    $st->close();
    if ($row && $row['status'] === 'active') return ['ok' => true, 'already' => true];
    $token = bin2hex(random_bytes(16));
    $consent = wf_nl_consent_text($lang);
    if ($row) {
        $st = $mysqli->prepare("UPDATE newsletter_subscribers SET status = 'pending', token = ?, lang = ?, name = IF(? <> '', ?, name), source = ?, consent_text = ?, created_at = ?, unsubscribed_at = NULL WHERE id = ?");
        $id = (int)$row['id'];
        $st->bind_param('sssssssi', $token, $lang, $name, $name, $source, $consent, $now, $id);
    } else {
        $st = $mysqli->prepare("INSERT INTO newsletter_subscribers (email, name, lang, status, token, source, consent_text, created_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)");
        $st->bind_param('sssssss', $email, $name, $lang, $token, $source, $consent, $now);
    }
    $st->execute();
    $st->close();
    $link = WF_NL_BASE . 'newsletter.php?a=confirm&t=' . $token;
    $text = str_replace(['{name}', '{link}'], [$name !== '' ? ' ' . $name : '', $link], wf_nl_t($lang, 'confirm_body'));
    $html = '<!doctype html><html><body style="margin:0;padding:24px;background:#f3f0f8;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#2a2733;">'
        . '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;">'
        . nl2br(wf_nl_esc(str_replace("\n\n" . $link . "\n\n", "\n\n{BTN}\n\n", $text)))
        . '</div></body></html>';
    $html = str_replace('{BTN}', '<a href="' . wf_nl_esc($link) . '" style="display:inline-block;background:#7e22ce;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px;">' . wf_nl_esc(wf_nl_t($lang, 'confirm_btn')) . '</a>', $html);
    wf_nl_send_mail($email, wf_nl_t($lang, 'confirm_subject'), $html, $text);
    return ['ok' => true];
}

/** Entwürfe aus newsletter-plan/*.json übernehmen (von Claude vorbereitet). Liefert Anzahl neuer. */
function wf_nl_import_plans($mysqli) {
    $dir = __DIR__ . '/newsletter-plan';
    if (!is_dir($dir)) return 0;
    $n = 0;
    foreach (glob($dir . '/*.json') ?: [] as $f) {
        $j = json_decode((string)file_get_contents($f), true);
        $key = mb_substr(preg_replace('/[^a-z0-9._-]/i', '', (string)($j['key'] ?? basename($f, '.json'))), 0, 100);
        if (!is_array($j) || $key === '' || empty($j['subject']['de']) || empty($j['body']['de'])) continue;
        $st = $mysqli->prepare("SELECT 1 FROM newsletters WHERE plan_key = ?");
        $st->bind_param('s', $key);
        $st->execute();
        $exists = (bool)$st->get_result()->fetch_row();
        $st->close();
        if ($exists) continue;
        // Mindestens 48 Stunden Vorlauf, damit der Inhaber prüfen, ändern oder stoppen kann
        $want = strtotime((string)($j['send_at'] ?? '')) ?: 0;
        $sendAt = date('Y-m-d H:i:s', max($want, time() + WF_NL_PLAN_LEAD * 3600));
        $now = date('Y-m-d H:i:s');
        $title = mb_substr((string)($j['title'] ?? $j['subject']['de']), 0, 190);
        $by = 'Claude';
        $s = []; $b = [];
        foreach (WF_NL_LANGS as $l) { $s[$l] = mb_substr((string)($j['subject'][$l] ?? ''), 0, 255); $b[$l] = (string)($j['body'][$l] ?? ''); }
        $status = ($j['status'] ?? 'scheduled') === 'draft' ? 'draft' : 'scheduled';
        $st = $mysqli->prepare("INSERT INTO newsletters (title, subject_de, subject_da, subject_en, body_de, body_da, body_en, status, send_at, created_by, plan_key, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
        $st->bind_param('sssssssssssss', $title, $s['de'], $s['da'], $s['en'], $b['de'], $b['da'], $b['en'], $status, $sendAt, $by, $key, $now, $now);
        if ($st->execute()) {
            $n++;
            $when = date('d.m.Y \u\m H:i', strtotime($sendAt));
            $msg = "Hallo Robert,\n\nClaude hat einen neuen Newsletter für dich vorbereitet:\n\n„" . $title . "“\n" . ($status === 'scheduled' ? "Er geht automatisch am $when an alle Abonnenten raus.\n\nBis dahin kannst du ihn im Admin-Bereich unter „Newsletter“ ansehen, ändern oder stoppen:" : "Er liegt als Entwurf im Admin-Bereich unter „Newsletter“:") . "\n" . WF_NL_BASE . "admin.html\n\nViele Grüße\nDein Webseiten-System";
            wf_nl_send_mail(WF_NL_FROM, '📰 Neuer Newsletter geplant: ' . $title, '<pre style="font-family:Arial,sans-serif;font-size:15px;white-space:pre-wrap;">' . wf_nl_esc($msg) . '</pre>', $msg);
        }
        $st->close();
    }
    return $n;
}

/**
 * Ein Versand-Durchgang: Entwürfe aus Dateien übernehmen, fällige Newsletter starten und
 * höchstens WF_NL_BATCH Mails verschicken. Läuft nie doppelt gleichzeitig.
 */
function wf_nl_tick($mysqli, $max = WF_NL_BATCH) {
    wf_nl_tables($mysqli);
    $lock = $mysqli->query("SELECT GET_LOCK('wf_newsletter', 0) AS l");
    if (!$lock || !(int)$lock->fetch_assoc()['l']) return ['busy' => true];
    $sent = 0;
    try {
        // Dateien höchstens alle 10 Minuten prüfen
        $flag = sys_get_temp_dir() . '/wf_nl_plan_' . md5(__DIR__);
        if (!is_file($flag) || filemtime($flag) < time() - 600) {
            @touch($flag);
            wf_nl_import_plans($mysqli);
        }
        $mysqli->query("UPDATE newsletters SET status = 'sending' WHERE status = 'scheduled' AND send_at IS NOT NULL AND send_at <= NOW()");
        $res = $mysqli->query("SELECT * FROM newsletters WHERE status = 'sending' ORDER BY send_at, id LIMIT 1");
        $nl = $res ? $res->fetch_assoc() : null;
        if ($nl) {
            $id = (int)$nl['id'];
            $subs = $mysqli->query("SELECT s.* FROM newsletter_subscribers s LEFT JOIN newsletter_log l ON l.subscriber_id = s.id AND l.newsletter_id = $id
                WHERE s.status = 'active' AND l.subscriber_id IS NULL ORDER BY s.id LIMIT " . (int)$max)->fetch_all(MYSQLI_ASSOC);
            $log = $mysqli->prepare("INSERT IGNORE INTO newsletter_log (newsletter_id, subscriber_id, sent_at, ok) VALUES (?, ?, ?, ?)");
            foreach ($subs as $s) {
                $m = wf_nl_render($nl, $s['lang'], $s);
                $ok = wf_nl_send_mail($s['email'], $m['subject'], $m['html'], $m['text'], $m['unsub']) ? 1 : 0;
                $now = date('Y-m-d H:i:s');
                $sid = (int)$s['id'];
                $log->bind_param('iisi', $id, $sid, $now, $ok);
                $log->execute();
                $mysqli->query("UPDATE newsletters SET " . ($ok ? 'sent_count = sent_count + 1' : 'fail_count = fail_count + 1') . " WHERE id = $id");
                $sent++;
            }
            $log->close();
            if (count($subs) < $max) {
                $mysqli->query("UPDATE newsletters SET status = 'sent', sent_at = NOW() WHERE id = $id AND status = 'sending'");
            }
        }
    } finally {
        $mysqli->query("SELECT RELEASE_LOCK('wf_newsletter')");
    }
    return ['sent' => $sent];
}

/** Datenschutz: unbestätigte Anmeldungen nach 30 Tagen, Abgemeldete nach 30 Tagen löschen. */
function wf_nl_cleanup($mysqli) {
    wf_nl_tables($mysqli);
    $mysqli->query("DELETE FROM newsletter_subscribers WHERE status = 'pending' AND created_at < (NOW() - INTERVAL 30 DAY)");
    $mysqli->query("DELETE l FROM newsletter_log l JOIN newsletter_subscribers s ON s.id = l.subscriber_id WHERE s.status = 'unsubscribed' AND s.unsubscribed_at < (NOW() - INTERVAL 30 DAY)");
    $mysqli->query("DELETE FROM newsletter_subscribers WHERE status = 'unsubscribed' AND unsubscribed_at < (NOW() - INTERVAL 30 DAY)");
    $mysqli->query("DELETE FROM newsletter_rate WHERE at < (NOW() - INTERVAL 1 DAY)");
}


/** Datenschutzerklärung einmalig um den Newsletter-Abschnitt ergänzen (vor „WhatsApp“, sonst am Ende). */
function wf_nl_legal($mysqli) {
    $mysqli->query("CREATE TABLE IF NOT EXISTS wf_meta (k VARCHAR(64) PRIMARY KEY, v VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $r = $mysqli->query("SELECT v FROM wf_meta WHERE k = 'legal_newsletter'");
    if ($r && $r->num_rows) return;
    if (!$mysqli->query("SHOW TABLES LIKE 'legal_texts'")->num_rows) return;
    $add = [
        'de' => ["WhatsApp", "Newsletter\nWenn du unseren Newsletter bestellst, speichern wir deine E-Mail-Adresse, optional deinen Namen, deine Sprache sowie Zeitpunkt und Wortlaut deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Die Anmeldung wird erst wirksam, wenn du den Link in unserer Bestätigungsmail anklickst (Double-Opt-in). Wir schreiben wenige Male im Jahr über Angebote, Aktionen und Neuigkeiten. Abmelden kannst du dich jederzeit über den Link in jeder Mail oder per Mail an hej@wunsch-fabrik.dk. Unbestätigte Anmeldungen löschen wir nach 30 Tagen, abgemeldete Adressen 30 Tage nach der Abmeldung. Versendet wird über unser eigenes Postfach bei one.com; wir werten keine Öffnungen oder Klicks aus."],
        'da' => ["WhatsApp", "Nyhedsbrev\nHvis du tilmelder dig vores nyhedsbrev, gemmer vi din e-mailadresse, eventuelt dit navn, dit sprog samt tidspunkt og ordlyd for dit samtykke (art. 6, stk. 1, litra a, GDPR). Tilmeldingen træder først i kraft, når du klikker på linket i vores bekræftelsesmail (dobbelt opt-in). Vi skriver få gange om året om tilbud, kampagner og nyheder. Du kan altid afmelde dig via linket i hver mail eller ved at skrive til hej@wunsch-fabrik.dk. Ubekræftede tilmeldinger sletter vi efter 30 dage, afmeldte adresser 30 dage efter afmeldingen. Mails sendes via vores egen postkasse hos one.com; vi måler ikke åbninger eller klik."],
        'en' => ["WhatsApp", "Newsletter\nIf you subscribe to our newsletter, we store your email address, optionally your name, your language and the time and wording of your consent (Art. 6(1)(a) GDPR). Your subscription only becomes effective once you click the link in our confirmation email (double opt-in). We write a few times a year about offers, promotions and news. You can unsubscribe at any time via the link in every email or by writing to hej@wunsch-fabrik.dk. We delete unconfirmed sign-ups after 30 days and unsubscribed addresses 30 days after unsubscribing. Emails are sent from our own mailbox at one.com; we do not track opens or clicks."],
    ];
    $row = $mysqli->query("SELECT content_de, content_da, content_en FROM legal_texts WHERE type = 'datenschutz'");
    $row = $row ? $row->fetch_assoc() : null;
    if (!$row) return;
    foreach ($add as $l => [$before, $sec]) {
        $c = (string)$row['content_' . $l];
        if (stripos($c, $l === 'da' ? 'Nyhedsbrev' : 'Newsletter') !== false) continue;
        $pos = strpos($c, "\n\n" . $before . "\n");
        $c = $pos !== false ? substr($c, 0, $pos) . "\n\n" . $sec . substr($c, $pos) : rtrim($c) . "\n\n" . $sec;
        $st = $mysqli->prepare("UPDATE legal_texts SET content_$l = ? WHERE type = 'datenschutz'");
        $st->bind_param('s', $c);
        $st->execute();
        $st->close();
    }
    $mysqli->query("INSERT IGNORE INTO wf_meta (k, v) VALUES ('legal_newsletter', NOW())");
}

}
