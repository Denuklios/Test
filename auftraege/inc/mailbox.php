<?php
declare(strict_types=1);

/**
 * Postfach im Auftragsprogramm: Mails per IMAP aus dem eigenen Postfach holen (z. B. imap.one.com),
 * per SMTP senden (Zugang aus den Einstellungen „Versandweg“) und eine Kopie in „Gesendet“ ablegen,
 * damit Handy/Webmail dasselbe sehen. Ohne PHP-IMAP-Erweiterung (fehlt bei vielen Hostern): eigener schlanker Client.
 *
 * Gespeichert wird in mail_msgs/mail_atts (Schema v22). Anhänge als Dateien unter uploads/.
 * Zuordnung: Kunde über die Mailadresse, Auftrag über eine Auftragsnummer im Betreff (z. B. 2026-0012).
 */

require_once __DIR__ . '/archive.php';

const WF_MAIL_MAX_BYTES = 20 * 1024 * 1024;    // größere Mails nur mit Kopfzeilen (Hinweis „im Webmail öffnen“)
const WF_MAIL_FIRST_DAYS = 30;                 // erster Abgleich: Mails der letzten 30 Tage
const WF_MAIL_BATCH = 25;                      // je Abgleich höchstens so viele neue Mails je Ordner

// ---------- Einstellungen ----------

/** IMAP-Zugang; ohne eigenes Passwort gilt das des Versandwegs (gleiches Postfach). */
function wf_imap_cfg(): ?array
{
    $raw = wf_db()->query("SELECT value FROM meta WHERE key = 'imap'")->fetchColumn();
    $c = $raw ? json_decode((string)$raw, true) : null;
    if (!is_array($c) || empty($c['host'])) {
        return null;
    }
    $smtp = wf_smtp_cfg() ?? [];
    $c['user'] = (string)($c['user'] ?? '') !== '' ? (string)$c['user'] : (string)($smtp['user'] ?? '');
    $c['pass'] = (string)($c['pass'] ?? '') !== '' ? (string)$c['pass'] : (string)($smtp['pass'] ?? '');
    $c['port'] = (int)($c['port'] ?? 993) ?: 993;
    return $c['user'] !== '' && $c['pass'] !== '' ? $c : null;
}

/** Eigene Absenderadresse: Firmen-E-Mail, sonst Benutzer des Postfachs. */
function wf_mail_from(): array
{
    $s = wf_mail_settings();
    $from = $s['from'];
    if (!wf_email_ok($from)) {
        $c = wf_imap_cfg() ?? wf_smtp_cfg() ?? [];
        $from = (string)($c['user'] ?? '');
    }
    return ['addr' => $from, 'name' => $s['name']];
}

function wf_mail_sig_key(array $user): string
{
    return 'mail_sig_u' . (int)($user['id'] ?? 0);
}

/** Signatur der angemeldeten Person (HTML); Vorschlag aus den Firmendaten, solange keine eigene gespeichert ist. */
function wf_mail_signature(PDO $db, array $user): array
{
    $q = $db->prepare('SELECT value FROM meta WHERE key = ?');
    $q->execute([wf_mail_sig_key($user)]);
    $v = $q->fetchColumn();
    if ($v !== false) {
        $j = json_decode((string)$v, true);
        return ['html' => (string)($j['html'] ?? ''), 'custom' => true];
    }
    $co = wf_company();
    $h = fn($x) => htmlspecialchars((string)$x, ENT_QUOTES, 'UTF-8');
    $lines = array_filter([
        '<b>' . $h($user['name'] ?? '') . '</b>',
        $h($co['name'] ?? ''),
        nl2br($h(trim((string)($co['street'] ?? '') . "\n" . trim(($co['zip'] ?? '') . ' ' . ($co['city'] ?? ''))))),
        !empty($co['phone']) ? 'Tel. ' . $h($co['phone']) : '',
        !empty($co['web']) ? '<a href="' . $h(preg_match('#^https?://#', (string)$co['web']) ? $co['web'] : 'https://' . $co['web']) . '">' . $h($co['web']) . '</a>' : '',
    ], fn($x) => trim(strip_tags($x)) !== '');
    return ['html' => '<p>Mit freundlichen Grüßen<br>' . implode('<br>', $lines) . '</p>', 'custom' => false];
}

// ---------- IMAP-Client ----------

final class WfImap
{
    /** @var resource */
    private $fp;
    private int $n = 0;
    public string $err = '';

    public function __construct(array $c)
    {
        $host = (string)$c['host'];
        $port = (int)($c['port'] ?? 993);
        $plain = getenv('WF_TEST_DATA_DIR') && $host === '127.0.0.1';   // nur Tests
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true, 'peer_name' => $host]]);
        $errno = 0;
        $errstr = '';
        $fp = @stream_socket_client(($plain || $port === 143 ? 'tcp://' : 'ssl://') . $host . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) {
            throw new RuntimeException("IMAP: keine Verbindung zu $host:$port ($errstr)");
        }
        $this->fp = $fp;
        stream_set_timeout($fp, 30);
        $g = (string)fgets($fp, 4096);
        if (!str_starts_with($g, '* OK') && !str_starts_with($g, '* PREAUTH')) {
            throw new RuntimeException('IMAP: unerwartete Begrüßung');
        }
        if ($port === 143 && !$plain) {
            [$ok] = $this->cmd('STARTTLS');
            if (!$ok || !@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('IMAP: STARTTLS fehlgeschlagen');
            }
        }
        [$ok, , $last] = $this->cmd('LOGIN', [(string)$c['user'], (string)$c['pass']]);
        if (!$ok) {
            throw new RuntimeException('IMAP: Anmeldung fehlgeschlagen (Benutzer/Passwort prüfen) ' . trim(substr($last, 0, 120)));
        }
    }

    public function __destruct()
    {
        if (is_resource($this->fp)) {
            @fwrite($this->fp, 'Z LOGOUT' . "\r\n");
            @fclose($this->fp);
        }
    }

    public static function q(string $s): string
    {
        return '"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $s) . '"';
    }

    /**
     * Befehl senden. $args werden als Literal {n} geschickt (sicher für Sonderzeichen in Passwörtern und für APPEND).
     * Rückgabe: [ok, Liste von Antworten [Zeile, Literale[]], letzte Zeile]
     */
    public function cmd(string $c, array $args = [], string $tail = ''): array
    {
        $tag = 'W' . (++$this->n);
        $line = $tag . ' ' . $c;
        if (!$args) {
            fwrite($this->fp, $line . ($tail !== '' ? ' ' . $tail : '') . "\r\n");
        } else {
            foreach ($args as $i => $a) {
                $lit = strlen($a);
                fwrite($this->fp, $line . ' {' . $lit . "}\r\n");
                $cont = (string)fgets($this->fp, 4096);
                if (!str_starts_with($cont, '+')) {
                    return [false, [], $cont];
                }
                fwrite($this->fp, $a);
                $line = '';
            }
            fwrite($this->fp, ($tail !== '' ? ' ' . $tail : '') . "\r\n");
        }
        $resp = [];
        while (true) {
            $l = fgets($this->fp, 65536);
            if ($l === false) {
                throw new RuntimeException('IMAP: Verbindung abgebrochen');
            }
            $cur = [$l, []];
            // Literale {n} am Zeilenende einlesen, danach geht die Zeile weiter
            while (preg_match('/\{(\d+)\}\r\n$/', $cur[0], $m)) {
                $len = (int)$m[1];
                $buf = '';
                while (strlen($buf) < $len) {
                    $chunk = fread($this->fp, min(65536, $len - strlen($buf)));
                    if ($chunk === false || $chunk === '') {
                        throw new RuntimeException('IMAP: Verbindung abgebrochen');
                    }
                    $buf .= $chunk;
                }
                $cur[1][] = $buf;
                $more = fgets($this->fp, 65536);
                if ($more === false) {
                    break;
                }
                $cur[0] .= "\x00" . $more;
            }
            if (str_starts_with($cur[0], $tag . ' ')) {
                return [(bool)preg_match('/^' . $tag . ' OK/i', $cur[0]), $resp, $cur[0]];
            }
            $resp[] = $cur;
        }
    }

    /** Ordner auswählen; liefert UIDVALIDITY. */
    public function select(string $box): int
    {
        [$ok, $resp, $last] = $this->cmd('SELECT ' . self::q($box));
        if (!$ok) {
            throw new RuntimeException('IMAP: Ordner ' . $box . ' nicht gefunden');
        }
        foreach ($resp as [$l]) {
            if (preg_match('/UIDVALIDITY (\d+)/i', $l, $m)) {
                return (int)$m[1];
            }
        }
        return 0;
    }

    /** @return int[] */
    public function search(string $crit): array
    {
        [$ok, $resp] = $this->cmd('UID SEARCH ' . $crit);
        $out = [];
        foreach ($resp as [$l]) {
            if (preg_match('/^\* SEARCH(.*)$/i', trim($l), $m)) {
                foreach (preg_split('/\s+/', trim($m[1])) ?: [] as $u) {
                    if ($u !== '' && ctype_digit($u)) {
                        $out[] = (int)$u;
                    }
                }
            }
        }
        sort($out);
        return $out;
    }

    /** Größe und Markierungen je UID. */
    public function sizes(array $uids): array
    {
        if (!$uids) {
            return [];
        }
        [, $resp] = $this->cmd('UID FETCH ' . implode(',', $uids) . ' (UID RFC822.SIZE FLAGS)');
        $out = [];
        foreach ($resp as [$l]) {
            if (preg_match('/UID (\d+)/i', $l, $u)) {
                preg_match('/RFC822\.SIZE (\d+)/i', $l, $sz);
                $out[(int)$u[1]] = ['size' => (int)($sz[1] ?? 0), 'seen' => stripos($l, '\\Seen') !== false];
            }
        }
        return $out;
    }

    public function fetch(int $uid, bool $headerOnly = false): ?string
    {
        [, $resp] = $this->cmd('UID FETCH ' . $uid . ' (BODY.PEEK[' . ($headerOnly ? 'HEADER' : '') . '])');
        foreach ($resp as [$l, $lits]) {
            if ($lits) {
                return $lits[0];
            }
        }
        return null;
    }

    public function setSeen(array $uids): void
    {
        if ($uids) {
            $this->cmd('UID STORE ' . implode(',', $uids) . ' +FLAGS.SILENT (\\Seen)');
        }
    }

    /** Ordner „Gesendet“ finden (Kennzeichen \Sent, sonst übliche Namen). */
    public function sentFolder(): string
    {
        [, $resp] = $this->cmd('LIST "" "*"');
        $names = [];
        foreach ($resp as [$l, $lits]) {
            if (!preg_match('/^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.*)$/i', trim(str_replace("\x00", '', $l)), $m)) {
                continue;
            }
            $name = $lits ? $lits[0] : trim($m[2], " \"");
            if (stripos($m[1], '\\Sent') !== false) {
                return $name;
            }
            $names[] = $name;
        }
        foreach ($names as $n) {
            if (preg_match('/^(INBOX[.\/])?(Sent|Sent Items|Sent Messages|Gesendet|Gesendete Elemente|Sendt|Sendte elementer)$/i', $n)) {
                return $n;
            }
        }
        return '';
    }

    public function append(string $box, string $msg): bool
    {
        [$ok] = $this->cmd('APPEND ' . self::q($box) . ' (\\Seen)', [str_replace(["\r\n", "\n"], ["\n", "\r\n"], $msg)]);
        return $ok;
    }
}

// ---------- MIME lesen ----------

function wf_mime_hdr(string $v): string
{
    $v = trim(preg_replace('/\r?\n[ \t]+/', ' ', $v) ?? $v);
    if (str_contains($v, '=?')) {
        $d = @iconv_mime_decode($v, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
        if ($d !== false) {
            $v = $d;
        }
    }
    return wf_mime_utf8($v, '');
}

function wf_mime_utf8(string $s, string $charset): string
{
    $cs = strtolower(trim($charset, " \"'"));
    if ($cs === '' || $cs === 'utf-8' || $cs === 'utf8' || $cs === 'us-ascii') {
        return mb_check_encoding($s, 'UTF-8') ? $s : mb_convert_encoding($s, 'UTF-8', 'Windows-1252');
    }
    if (in_array($cs, ['iso-8859-1', 'latin1', 'latin-1'], true)) {
        $cs = 'Windows-1252';
    }
    $r = @iconv($cs, 'UTF-8//IGNORE', $s);
    if ($r === false) {
        $r = @mb_convert_encoding($s, 'UTF-8', $cs) ?: '';
    }
    return $r;
}

/** Kopfzeilen in ein Array (Name klein → letzter Wert; 'received' etc. egal). */
function wf_mime_headers(string $raw): array
{
    $h = [];
    foreach (preg_split('/\r?\n(?![ \t])/', $raw) ?: [] as $line) {
        $p = strpos($line, ':');
        if ($p === false) {
            continue;
        }
        $k = strtolower(trim(substr($line, 0, $p)));
        if (!isset($h[$k])) {
            $h[$k] = substr($line, $p + 1);
        }
    }
    return $h;
}

/** "text/plain; charset=utf-8; name=..." → [Wert, Parameter] (inkl. RFC 2231 name*=UTF-8''…) */
function wf_mime_params(string $v): array
{
    $v = preg_replace('/\r?\n[ \t]+/', ' ', $v) ?? $v;
    $parts = preg_split('/;(?=(?:[^"]*"[^"]*")*[^"]*$)/', $v) ?: [];
    $main = strtolower(trim((string)array_shift($parts)));
    $p = [];
    $cont = [];
    foreach ($parts as $x) {
        if (!str_contains($x, '=')) {
            continue;
        }
        [$k, $val] = explode('=', $x, 2);
        $k = strtolower(trim($k));
        $val = trim($val);
        if (strlen($val) > 1 && $val[0] === '"' && str_ends_with($val, '"')) {
            $val = stripcslashes(substr($val, 1, -1));
        }
        if (preg_match('/^(.+?)\*(\d+)?\*?$/', $k, $m)) {
            $cont[$m[1]][(int)($m[2] ?? 0)] = [$val, str_ends_with($k, '*')];
            continue;
        }
        $p[$k] = $val;
    }
    foreach ($cont as $k => $pieces) {
        ksort($pieces);
        $s = '';
        $cs = '';
        foreach ($pieces as $i => [$val, $enc]) {
            if ($enc && $i === array_key_first($pieces) && preg_match("/^([^']*)'[^']*'(.*)$/", $val, $m)) {
                $cs = $m[1];
                $val = $m[2];
            }
            $s .= $enc ? rawurldecode($val) : $val;
        }
        $p[$k] = wf_mime_utf8($s, $cs);
    }
    foreach (['name', 'filename'] as $k) {
        if (isset($p[$k])) {
            $p[$k] = wf_mime_hdr($p[$k]);
        }
    }
    return [$main, $p];
}

function wf_mime_decode(string $body, string $cte): string
{
    $cte = strtolower(trim($cte));
    if ($cte === 'base64') {
        return (string)base64_decode(preg_replace('/[^A-Za-z0-9+\/=]/', '', $body) ?? '');
    }
    if ($cte === 'quoted-printable') {
        return quoted_printable_decode($body);
    }
    return $body;
}

/** Ganze Mail zerlegen: Kopf, Text, HTML, Anhänge. */
function wf_mime_parse(string $raw): array
{
    $out = ['headers' => [], 'text' => '', 'html' => '', 'atts' => []];
    $walk = function (string $part, int $depth) use (&$walk, &$out): void {
        $sp = preg_split('/\r?\n\r?\n/', $part, 2);
        $head = wf_mime_headers($sp[0] ?? '');
        $body = $sp[1] ?? '';
        if ($depth === 0) {
            $out['headers'] = $head;
        }
        [$type, $tp] = wf_mime_params($head['content-type'] ?? 'text/plain');
        [$disp, $dp] = wf_mime_params($head['content-disposition'] ?? '');
        if (str_starts_with($type, 'multipart/') && !empty($tp['boundary']) && $depth < 10) {
            $b = preg_quote($tp['boundary'], '/');
            $pieces = preg_split('/\r?\n?--' . $b . '(?:--)?[ \t]*\r?\n/', "\n" . $body) ?: [];
            array_shift($pieces);                          // Vorspann
            foreach ($pieces as $pc) {
                if (trim($pc) !== '' && !preg_match('/^--/', ltrim($pc))) {
                    $walk(preg_replace('/\r?\n--' . $b . '--.*$/s', '', $pc) ?? $pc, $depth + 1);
                }
            }
            return;
        }
        $data = wf_mime_decode($body, $head['content-transfer-encoding'] ?? '');
        $name = (string)($dp['filename'] ?? $tp['name'] ?? '');
        $cid = trim((string)($head['content-id'] ?? ''), " <>\r\n\t");
        $isAtt = $disp === 'attachment' || ($name !== '' && !in_array($type, ['text/plain', 'text/html'], true)) || ($cid !== '' && !str_starts_with($type, 'text/'));
        if (!$isAtt && $type === 'text/html' && $out['html'] === '') {
            $out['html'] = wf_mime_utf8($data, (string)($tp['charset'] ?? ''));
        } elseif (!$isAtt && $type === 'text/plain' && $out['text'] === '' && $disp !== 'attachment') {
            $out['text'] = wf_mime_utf8($data, (string)($tp['charset'] ?? ''));
        } elseif ($type === 'message/rfc822' || $isAtt || ($depth > 0 && !str_starts_with($type, 'text/'))) {
            if ($name === '') {
                $name = $type === 'message/rfc822' ? 'Nachricht.eml' : 'Anhang' . (str_starts_with($type, 'image/') ? '.' . substr($type, 6) : '');
            }
            $out['atts'][] = ['name' => mb_substr(preg_replace('/[\/\\\\\x00-\x1f]/u', '_', $name) ?? $name, 0, 180), 'mime' => $type ?: 'application/octet-stream',
                'data' => $data, 'cid' => $cid, 'inline' => $cid !== '' && $disp !== 'attachment'];
        }
    };
    $walk($raw, 0);
    return $out;
}

/** "Anna <a@b.dk>, b@c.de" → [[addr, name], …] */
function wf_mail_addrs(string $v): array
{
    $v = wf_mime_hdr($v);
    $out = [];
    foreach (preg_split('/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', $v) ?: [] as $p) {
        $p = trim($p);
        if ($p === '') {
            continue;
        }
        if (preg_match('/^(.*)<([^>]+)>\s*$/', $p, $m)) {
            $addr = trim($m[2]);
            $name = trim(trim($m[1]), " \"'");
        } else {
            $addr = trim($p, " <>\"'");
            $name = '';
        }
        if (filter_var($addr, FILTER_VALIDATE_EMAIL) || preg_match('/^[^@\s]+@[^@\s]+$/', $addr)) {
            $out[] = ['addr' => mb_strtolower($addr), 'name' => $name];
        }
    }
    return $out;
}

function wf_mail_ids(string $v): array
{
    preg_match_all('/<([^<>\s]+)>/', $v, $m);
    return $m[1];
}

/** HTML → lesbarer Text (Vorschau, Text-Teil beim Senden). */
function wf_html_text(string $html): string
{
    $h = preg_replace('#<(style|script|head)\b[^>]*>.*?</\1>#is', '', $html) ?? $html;
    $h = preg_replace('#<br\s*/?>#i', "\n", $h) ?? $h;
    $h = preg_replace('#</(p|div|tr|h[1-6]|blockquote|li)>#i', "\n", $h) ?? $h;
    $h = preg_replace('#<li\b[^>]*>#i', '• ', $h) ?? $h;
    $h = preg_replace_callback('#<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>#is', fn($m) => trim(strip_tags($m[2])) === $m[1] || str_starts_with($m[1], 'mailto:') ? $m[2] : $m[2] . ' (' . $m[1] . ')', $h) ?? $h;
    $t = html_entity_decode(strip_tags($h), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = preg_replace("/[ \t\x{00a0}]+/u", ' ', $t) ?? $t;
    $t = preg_replace("/ *\n */", "\n", $t) ?? $t;
    return trim(preg_replace("/\n{3,}/", "\n\n", $t) ?? $t);
}

// ---------- Speichern und Zuordnen ----------

function wf_mail_dir(): string
{
    $d = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/';
    if (!is_dir($d)) {
        @mkdir($d, 0775, true);
    }
    return $d;
}

/** Kunde zur Adresse und Auftrag zur Nummer im Betreff. */
function wf_mail_match(PDO $db, array $addrs, string $subject): array
{
    $cid = null;
    $q = $db->prepare('SELECT id FROM customers WHERE lower(trim(email)) = ? AND anonymized_at IS NULL ORDER BY id DESC LIMIT 1');
    foreach ($addrs as $a) {
        $q->execute([mb_strtolower($a)]);
        if ($x = $q->fetchColumn()) {
            $cid = (int)$x;
            break;
        }
    }
    $oid = null;
    if (preg_match('/\b(20\d\d-\d{3,5})\b/', $subject, $m)) {
        $o = $db->prepare('SELECT id, customer_id FROM orders WHERE nr = ? AND deleted_at IS NULL');
        $o->execute([$m[1]]);
        if ($r = $o->fetch()) {
            $oid = (int)$r['id'];
            $cid ??= $r['customer_id'] !== null ? (int)$r['customer_id'] : null;
        }
    }
    return [$cid, $oid];
}

/** Gesprächsfaden: erste Referenz, sonst In-Reply-To, sonst eigene Message-ID. Antworten erben den Faden der Vorgänger. */
function wf_mail_thread(PDO $db, string $msgId, string $inReplyTo, array $refs): string
{
    $cands = array_values(array_filter(array_merge($refs, [$inReplyTo])));
    if ($cands) {
        $q = $db->prepare('SELECT thread FROM mail_msgs WHERE message_id = ? AND thread <> "" LIMIT 1');
        foreach (array_reverse($cands) as $c) {
            $q->execute([$c]);
            if ($t = $q->fetchColumn()) {
                return (string)$t;
            }
        }
        return $cands[0];
    }
    return $msgId !== '' ? $msgId : bin2hex(random_bytes(8));
}

/** Rohe Mail speichern (aus IMAP oder nach dem Senden). Liefert die neue ID oder null, wenn schon vorhanden. */
function wf_mail_store(PDO $db, string $raw, string $folder, ?int $uid, bool $seen, bool $tooLarge = false, string $by = ''): ?int
{
    $p = wf_mime_parse($raw);
    $H = $p['headers'];
    $msgId = (wf_mail_ids((string)($H['message-id'] ?? ''))[0] ?? '');
    if ($msgId !== '') {
        $dup = $db->prepare('SELECT id FROM mail_msgs WHERE message_id = ? AND folder = ?');
        $dup->execute([$msgId, $folder]);
        if ($id = $dup->fetchColumn()) {
            if ($uid !== null) {
                $db->prepare('UPDATE mail_msgs SET uid = ? WHERE id = ? AND uid IS NULL')->execute([$uid, (int)$id]);
            }
            return null;
        }
    }
    $from = wf_mail_addrs((string)($H['from'] ?? ''))[0] ?? ['addr' => '', 'name' => ''];
    $to = wf_mail_addrs((string)($H['to'] ?? ''));
    $cc = wf_mail_addrs((string)($H['cc'] ?? ''));
    $subject = mb_substr(wf_mime_hdr((string)($H['subject'] ?? '')), 0, 500);
    $ts = strtotime(trim((string)($H['date'] ?? ''))) ?: time();
    $irt = wf_mail_ids((string)($H['in-reply-to'] ?? ''))[0] ?? '';
    $refs = wf_mail_ids((string)($H['references'] ?? ''));
    $text = $p['text'] !== '' ? $p['text'] : wf_html_text($p['html']);
    $snippet = mb_substr(trim(preg_replace('/\s+/u', ' ', $text) ?? ''), 0, 200);
    $other = $folder === 'in' ? [$from['addr']] : array_column($to, 'addr');
    [$cid, $oid] = wf_mail_match($db, $other, $subject);
    $realAtts = array_filter($p['atts'], fn($a) => !$a['inline']);
    $db->prepare('INSERT INTO mail_msgs (folder, uid, message_id, in_reply_to, refs, thread, from_addr, from_name, to_json, cc_json, subject, sent_at, snippet, body_html, body_text, has_att, seen, too_large, customer_id, order_id, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')->execute([
        $folder, $uid, $msgId, $irt, implode(' ', $refs), wf_mail_thread($db, $msgId, $irt, $refs), $from['addr'], mb_substr($from['name'], 0, 200),
        json_encode($to, JSON_UNESCAPED_UNICODE), json_encode($cc, JSON_UNESCAPED_UNICODE), $subject, gmdate('Y-m-d H:i:s', $ts), $snippet,
        $p['html'], $text, $realAtts ? 1 : 0, $seen ? 1 : 0, $tooLarge ? 1 : 0, $cid, $oid, $by]);
    $id = (int)$db->lastInsertId();
    $ins = $db->prepare('INSERT INTO mail_atts (msg_id, name, mime, size, cid, inline, stored_name) VALUES (?,?,?,?,?,?,?)');
    $dir = wf_mail_dir();
    foreach ($p['atts'] as $a) {
        $stored = 'm' . bin2hex(random_bytes(15)) . '.dat';
        if (@file_put_contents($dir . $stored, $a['data']) === false) {
            continue;
        }
        @chmod($dir . $stored, 0640);
        $ins->execute([$id, $a['name'], mb_substr($a['mime'], 0, 100), strlen($a['data']), mb_substr($a['cid'], 0, 200), $a['inline'] ? 1 : 0, $stored]);
    }
    if ($folder === 'in') {
        wf_mail_filter_ready($db);
        $row = ['id' => $id, 'from_addr' => $from['addr'], 'subject' => $subject, 'body_text' => $text, 'body_html' => $p['html'],
            'customer_id' => $cid, 'order_id' => $oid, 'in_reply_to' => $irt, 'refs' => implode(' ', $refs)];
        $junk = wf_mail_is_junk($db, $row, $H, $realAtts);
        if ($junk) {
            $db->prepare('UPDATE mail_msgs SET junk = 1 WHERE id = ?')->execute([$id]);
        } elseif ($realAtts) {
            // Bilder/Dateien vom Kunden an seinen Auftrag hängen: genannte Auftragsnummer, sonst sein einziger offener Auftrag
            $target = $oid;
            if (!$target && $cid) {
                $o = $db->prepare("SELECT id FROM orders WHERE customer_id = ? AND deleted_at IS NULL AND status NOT IN ('delivered', 'cancelled') ORDER BY id DESC LIMIT 2");
                $o->execute([$cid]);
                $open = $o->fetchAll(PDO::FETCH_COLUMN);
                $target = count($open) === 1 ? (int)$open[0] : null;
            }
            if ($target) {
                try {
                    wf_mail_atts_to_order($db, $id, (int)$target, null, true);
                } catch (Throwable $e) {
                    error_log('auftraege mail atts: ' . $e->getMessage());
                }
            }
        }
    }
    return $id;
}

// ---------- Filter: nur Kunden und Anfragen im Posteingang, Werbung & Co. nach „Aussortiert“ ----------

/** Spalte junk und Absender-Regeln anlegen; vorhandene Mails einmalig einsortieren. */
function wf_mail_filter_ready(PDO $db): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    if (!$db->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'mail_msgs'")->fetchColumn()) {
        return;
    }
    $cols = array_column($db->query('PRAGMA table_info(mail_msgs)')->fetchAll(), 'name');
    if (!in_array('junk', $cols, true)) {
        $db->exec('ALTER TABLE mail_msgs ADD COLUMN junk INTEGER NOT NULL DEFAULT 0');
    }
    $db->exec("CREATE TABLE IF NOT EXISTS mail_senders (addr TEXT PRIMARY KEY, rule TEXT NOT NULL CHECK (rule IN ('allow', 'block')))");
    if (!$db->query("SELECT 1 FROM meta WHERE key = 'mail_filter_v1'")->fetchColumn()) {
        $up = $db->prepare('UPDATE mail_msgs SET junk = ? WHERE id = ?');
        foreach ($db->query("SELECT * FROM mail_msgs WHERE folder = 'in'")->fetchAll() as $m) {
            $up->execute([wf_mail_is_junk($db, $m, null) ? 1 : 0, (int)$m['id']]);
        }
        $db->exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('mail_filter_v1', '1')");
    }
}

/**
 * Gehört eine eingehende Mail aussortiert? Durch kommen: erlaubte Absender, eigene Adressen, bekannte Kunden,
 * Antworten auf eigene Mails, Mails mit Anfrage-Wörtern oder Bildern/Dateien. Werbung (Abmelde-Link, Verteiler,
 * noreply …) und alles ohne Bezug wird aussortiert. $H = Kopfzeilen (beim Abholen), null = nur gespeicherte Felder.
 */
function wf_mail_is_junk(PDO $db, array $m, ?array $H, ?array $atts = null): bool
{
    $from = mb_strtolower(trim((string)($m['from_addr'] ?? '')));
    $dom = substr(strrchr($from, '@') ?: '', 1);
    $rule = $db->prepare('SELECT rule FROM mail_senders WHERE addr = ? OR addr = ?');
    $rule->execute([$from, '@' . $dom]);
    $r = $rule->fetchAll(PDO::FETCH_COLUMN);
    if (in_array('allow', $r, true)) {
        return false;
    }
    if (in_array('block', $r, true)) {
        return true;
    }
    if ($dom === 'wunsch-fabrik.dk') {
        return false;
    }
    if (!empty($m['customer_id']) || !empty($m['order_id'])) {
        return false;
    }
    // Antwort auf eine eigene Mail
    $ids = array_values(array_filter(array_merge(preg_split('/\s+/', (string)($m['refs'] ?? '')) ?: [], [(string)($m['in_reply_to'] ?? '')])));
    if ($ids) {
        $q = $db->prepare("SELECT 1 FROM mail_msgs WHERE folder = 'sent' AND message_id IN (" . implode(',', array_fill(0, count($ids), '?')) . ') LIMIT 1');
        $q->execute($ids);
        if ($q->fetchColumn()) {
            return false;
        }
    }
    // Massenmail / Automatik
    $bulk = false;
    if ($H !== null) {
        $prec = strtolower((string)($H['precedence'] ?? ''));
        $auto = strtolower(trim((string)($H['auto-submitted'] ?? '')));
        $bulk = !empty($H['list-unsubscribe']) || !empty($H['list-id']) || in_array($prec, ['bulk', 'list', 'junk'], true)
            || ($auto !== '' && $auto !== 'no') || stripos((string)($H['x-spam-flag'] ?? ''), 'yes') !== false
            || !empty($H['x-campaign']) || !empty($H['x-mailchimp-id']) || !empty($H['feedback-id']) || !empty($H['x-csa-complaints']);
    }
    $local = strstr($from, '@', true) ?: $from;
    if (preg_match('/^(no-?reply|do-?not-?reply|donotreply|newsletter|news|marketing|mailer-daemon|postmaster|bounce|notifications?|nyhedsbrev|kampagne|promo|offers?|deals?)\b/', $local)) {
        $bulk = true;
    }
    $txt = mb_strtolower((string)($m['subject'] ?? '') . "\n" . (string)($m['body_text'] ?? ''));
    $html = mb_strtolower((string)($m['body_html'] ?? ''));
    if (preg_match('/unsubscribe|abmelden|abbestellen|newsletter abbestellen|afmeld|frameld|opt-out|view (this email )?in (your )?browser|im browser (an)?sehen|vis i browser/u', $txt . ' ' . $html)) {
        $bulk = true;
    }
    if ($bulk) {
        return true;
    }
    if (preg_match('/angebot|anfrage|preis|kosten|bestell|auftrag|stick|druck|textil|t-?shirt|shirt|hoodie|pullover|pulli|polo|jacke|weste|arbeitskleidung|kleidung|logo|motiv|stück|menge|vereinskleidung|tasse|cap\b|kappe|tilbud|pris|forespørg|bestil|ordre|broderi|brodér|brodere|tryk|trøje|bluse|jakke|stk\b|antal/u', $txt)) {
        return false;
    }
    // Bilder oder Grafikdateien im Anhang (keine Signatur-Bildchen)
    if ($atts === null && !empty($m['id'])) {
        $a = $db->prepare('SELECT name, mime, size FROM mail_atts WHERE msg_id = ? AND inline = 0');
        $a->execute([(int)$m['id']]);
        $atts = $a->fetchAll();
    }
    foreach ($atts ?? [] as $a) {
        if (wf_mail_att_useful($a)) {
            return false;
        }
    }
    return true;
}

/** Anhang, der für einen Auftrag taugt (Bild, PDF, Vektor-/Grafikdatei), ohne kleine Signatur-Bildchen. */
function wf_mail_att_useful(array $a): bool
{
    $mime = strtolower((string)($a['mime'] ?? ''));
    $ext = strtolower(pathinfo((string)($a['name'] ?? ''), PATHINFO_EXTENSION));
    $size = (int)($a['size'] ?? strlen((string)($a['data'] ?? '')));
    if (str_starts_with($mime, 'image/')) {
        return $size >= 15000;
    }
    return $mime === 'application/pdf' || in_array($ext, ['pdf', 'ai', 'eps', 'svg', 'psd', 'cdr', 'tif', 'tiff', 'dst', 'pes', 'emb', 'zip'], true);
}

/** Anhänge einer Mail als Dateien an einen Auftrag hängen (ohne Doppelte). $only = nur diese Anhang-IDs. */
function wf_mail_atts_to_order(PDO $db, int $msgId, int $oid, ?array $only = null, bool $usefulOnly = false): int
{
    $st = $db->prepare('SELECT * FROM mail_atts WHERE msg_id = ? AND inline = 0 ORDER BY id');
    $st->execute([$msgId]);
    $dup = $db->prepare('SELECT 1 FROM order_files WHERE order_id = ? AND size = ? AND (original_name = ? OR ? = 1)');
    $ins = $db->prepare('INSERT INTO order_files (order_id, original_name, stored_name, mime, size) VALUES (?,?,?,?,?)');
    $up = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/';
    $n = 0;
    foreach ($st->fetchAll() as $a) {
        if (($only !== null && !in_array((int)$a['id'], $only, true)) || ($usefulOnly && !wf_mail_att_useful($a))) {
            continue;
        }
        $src = wf_mail_dir() . basename((string)$a['stored_name']);
        if (!is_file($src)) {
            continue;
        }
        $name = mb_substr(preg_replace('/[^\p{L}\p{N}._ ()-]/u', '_', (string)$a['name']) ?: 'datei', 0, 200);
        $size = (int)filesize($src);
        $dup->execute([$oid, $size, $name, $usefulOnly ? 1 : 0]);
        if ($dup->fetchColumn()) {
            continue;
        }
        $stored = bin2hex(random_bytes(16)) . '.dat';
        if (@copy($src, $up . $stored)) {
            $ins->execute([$oid, $name, $stored, (string)$a['mime'] ?: 'application/octet-stream', $size]);
            $n++;
        }
    }
    return $n;
}

// ---------- Abgleich ----------

/** Neue Mails aus Posteingang und Gesendet holen, Gelesen-Markierungen zurückschreiben. */
function wf_mail_sync(PDO $db, int $maxSeconds = 20): array
{
    $c = wf_imap_cfg();
    if (!$c) {
        return ['ok' => false, 'error' => 'imap_not_configured'];
    }
    // nicht zweimal gleichzeitig (Programm offen + Handy-App + Zeitplan)
    $lock = (int)($db->query("SELECT value FROM meta WHERE key = 'mail_sync_lock'")->fetchColumn() ?: 0);
    if ($lock > time() - 90) {
        return ['ok' => true, 'new' => 0, 'busy' => true];
    }
    $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('mail_sync_lock', ?)")->execute([(string)time()]);
    try {
        return wf_mail_sync_run($db, $c, $maxSeconds);
    } finally {
        $db->exec("DELETE FROM meta WHERE key = 'mail_sync_lock'");
    }
}

function wf_mail_sync_run(PDO $db, array $c, int $maxSeconds): array
{
    $t0 = microtime(true);
    $new = 0;
    try {
        $im = new WfImap($c);
        $state = json_decode((string)($db->query("SELECT value FROM meta WHERE key = 'mail_state'")->fetchColumn() ?: '{}'), true) ?: [];
        if (!isset($state['sent_box'])) {
            $state['sent_box'] = $im->sentFolder();
        }
        foreach (['in' => 'INBOX', 'sent' => (string)$state['sent_box']] as $folder => $box) {
            if ($box === '') {
                continue;
            }
            $uv = $im->select($box);
            $st = $state[$folder] ?? [];
            if (($st['uv'] ?? 0) !== $uv) {
                $st = ['uv' => $uv, 'last' => 0];
                $uids = $im->search('SINCE ' . date('d-M-Y', time() - WF_MAIL_FIRST_DAYS * 86400));
                $db->prepare('UPDATE mail_msgs SET uid = NULL WHERE folder = ?')->execute([$folder]);   // neue Zählung am Server
            } else {
                $uids = array_values(array_filter($im->search('UID ' . ((int)$st['last'] + 1) . ':*'), fn($u) => $u > (int)$st['last']));
            }
            // Gelesen-Markierungen aus der App ans Postfach geben
            if ($folder === 'in') {
                $seen = $db->query("SELECT uid FROM mail_msgs WHERE folder = 'in' AND seen = 1 AND seen_synced = 0 AND uid IS NOT NULL LIMIT 200")->fetchAll(PDO::FETCH_COLUMN);
                if ($seen) {
                    $im->setSeen(array_map('intval', $seen));
                    $db->exec("UPDATE mail_msgs SET seen_synced = 1 WHERE folder = 'in' AND seen = 1");
                }
            }
            // am Handy/im Webmail gelesene Mails auch hier als gelesen zeigen
            if ($folder === 'in') {
                $unseen = array_map('intval', $db->query("SELECT uid FROM mail_msgs WHERE folder = 'in' AND seen = 0 AND uid IS NOT NULL ORDER BY uid DESC LIMIT 200")->fetchAll(PDO::FETCH_COLUMN));
                if ($unseen) {
                    $mark = $db->prepare("UPDATE mail_msgs SET seen = 1 WHERE folder = 'in' AND uid = ?");
                    foreach ($im->sizes($unseen) as $u => $f) {
                        if ($f['seen']) {
                            $mark->execute([$u]);
                        }
                    }
                }
            }
            $batch = array_slice($uids, 0, WF_MAIL_BATCH);
            $info = $im->sizes($batch);
            foreach ($batch as $uid) {
                if (microtime(true) - $t0 > $maxSeconds) {
                    break 2;
                }
                $i = $info[$uid] ?? ['size' => 0, 'seen' => false];
                $big = $i['size'] > WF_MAIL_MAX_BYTES;
                $raw = $im->fetch($uid, $big);
                if ($raw !== null && wf_mail_store($db, $raw, $folder, $uid, $folder === 'sent' || $i['seen'], $big) !== null) {
                    $new++;
                }
                $st['last'] = max((int)$st['last'], $uid);
            }
            $state[$folder] = $st;
            $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('mail_state', ?)")->execute([json_encode($state)]);
        }
        $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('mail_sync_last', ?)")->execute([date('Y-m-d H:i:s')]);
        $db->exec("DELETE FROM meta WHERE key = 'mail_sync_error'");
        return ['ok' => true, 'new' => $new];
    } catch (Throwable $e) {
        $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('mail_sync_error', ?)")->execute([date('Y-m-d H:i:s') . ' · ' . $e->getMessage()]);
        return ['ok' => false, 'error' => 'imap', 'detail' => $e->getMessage(), 'new' => $new];
    }
}

// ---------- Anzeigen ----------

/**
 * HTML einer Mail für die Anzeige: Skripte, Formulare und Ereignisse raus, eingebettete Bilder (cid:) als data:-Adressen,
 * Bilder aus dem Netz nur auf Wunsch ($remote), sonst Platzhalter (schützt vor Lesebestätigungs-Pixeln).
 */
function wf_mail_safe_html(PDO $db, array $m, bool $remote): array
{
    $html = (string)$m['body_html'];
    if (trim($html) === '') {
        $html = '<div style="white-space:pre-wrap;font-family:inherit">' . htmlspecialchars((string)$m['body_text'], ENT_QUOTES, 'UTF-8') . '</div>';
        $html = preg_replace('#(https?://[^\s<]+)#', '<a href="$1">$1</a>', $html) ?? $html;
    }
    $atts = $db->prepare('SELECT * FROM mail_atts WHERE msg_id = ?');
    $atts->execute([(int)$m['id']]);
    $byCid = [];
    foreach ($atts->fetchAll() as $a) {
        if ($a['cid'] !== '') {
            $byCid[mb_strtolower($a['cid'])] = $a;
        }
    }
    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><html><body>' . $html . '</body></html>', LIBXML_NONET | LIBXML_NOWARNING | LIBXML_NOERROR);
    libxml_clear_errors();
    $remove = [];
    foreach (['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'base', 'link', 'meta', 'title', 'input', 'button', 'textarea', 'select'] as $tag) {
        foreach ($doc->getElementsByTagName($tag) as $n) {
            $remove[] = $n;
        }
    }
    foreach ($remove as $n) {
        $n->parentNode?->removeChild($n);
    }
    $blocked = 0;
    $dir = wf_mail_dir();
    $budget = 12 * 1024 * 1024;
    foreach ((new DOMXPath($doc))->query('//*') ?: [] as $el) {
        if (!$el instanceof DOMElement) {
            continue;
        }
        foreach (iterator_to_array($el->attributes) as $at) {
            $n = strtolower($at->nodeName);
            $v = trim((string)$at->nodeValue);
            if (str_starts_with($n, 'on') || (in_array($n, ['href', 'src', 'action', 'background', 'xlink:href'], true) && preg_match('/^\s*(javascript|vbscript|data:text)/i', $v))) {
                $el->removeAttribute($at->nodeName);
            }
        }
        if ($el->nodeName === 'a' && $el->hasAttribute('href')) {
            $el->setAttribute('target', '_blank');
            $el->setAttribute('rel', 'noopener noreferrer');
        }
        if ($el->nodeName === 'img' || $el->hasAttribute('background')) {
            $attr = $el->nodeName === 'img' ? 'src' : 'background';
            $src = trim($el->getAttribute($attr));
            if (stripos($src, 'cid:') === 0) {
                $a = $byCid[mb_strtolower(substr($src, 4))] ?? null;
                if ($a && $a['size'] <= $budget && str_starts_with((string)$a['mime'], 'image/')) {
                    $budget -= (int)$a['size'];
                    $el->setAttribute($attr, 'data:' . $a['mime'] . ';base64,' . base64_encode((string)@file_get_contents($dir . $a['stored_name'])));
                } else {
                    $el->removeAttribute($attr);
                }
            } elseif (preg_match('#^(https?:)?//#i', $src) && !$remote) {
                $el->setAttribute('data-blocked', '1');
                $el->removeAttribute($attr);
                $blocked++;
            }
        }
        // Hintergrundbilder in style="" ebenfalls sperren
        if (!$remote && $el->hasAttribute('style') && preg_match('/url\s*\(/i', $el->getAttribute('style'))) {
            $el->setAttribute('style', preg_replace('/url\s*\([^)]*\)/i', 'none', $el->getAttribute('style')) ?? '');
            $blocked++;
        }
    }
    // <style>-Blöcke: externe Bilder/Importe sperren
    foreach ($doc->getElementsByTagName('style') as $st) {
        $css = (string)$st->textContent;
        $css = preg_replace('/@import[^;]+;/i', '', $css) ?? $css;
        if (!$remote) {
            $css = preg_replace('/url\s*\(\s*["\']?(https?:)?\/\/[^)]*\)/i', 'none', $css, -1, $cnt) ?? $css;
            $blocked += $cnt;
        }
        $st->textContent = $css;
    }
    $body = $doc->getElementsByTagName('body')->item(0);
    $out = '';
    if ($body) {
        foreach ($body->childNodes as $ch) {
            $out .= $doc->saveHTML($ch);
        }
    }
    return ['html' => $out, 'blocked' => $blocked];
}

// ---------- Senden ----------

function wf_mail_hdr_enc(string $s): string
{
    return preg_match('/[^\x20-\x7e]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

function wf_mail_addr_hdr(array $list): string
{
    return implode(', ', array_map(fn($a) => ($a['name'] ?? '') !== '' ? wf_mail_hdr_enc('"' . str_replace(['"', "\r", "\n"], '', $a['name']) . '"') . ' <' . wf_email_ascii($a['addr']) . '>' : wf_email_ascii($a['addr']), $list));
}

/**
 * Mail zusammensetzen. $html: Inhalt inkl. Signatur/Zitat; eingebettete Bilder (data:) werden zu cid:-Teilen.
 * $files: [[name, mime, data]]. Liefert [rohe Mail, Message-ID].
 */
function wf_mail_build(array $from, array $to, array $cc, string $subject, string $html, array $files, string $inReplyTo = '', array $refs = []): array
{
    $domain = preg_replace('/[^a-z0-9.\-]/i', '', (string)(explode('@', $from['addr'])[1] ?? 'localhost')) ?: 'localhost';
    $msgId = bin2hex(random_bytes(12)) . '@' . $domain;
    $inline = [];
    $html = preg_replace_callback('#src=(["\'])data:(image/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)\1#i', function ($m) use (&$inline, $domain) {
        $cid = 'img' . count($inline) . '.' . bin2hex(random_bytes(6)) . '@' . $domain;
        $inline[] = ['cid' => $cid, 'mime' => strtolower($m[2]), 'data' => (string)base64_decode(preg_replace('/\s+/', '', $m[3]) ?? '')];
        return 'src="cid:' . $cid . '"';
    }, $html) ?? $html;
    $doc = '<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f1a2b">' . $html . '</body></html>';
    $text = wf_html_text($html);
    $b = fn(string $p) => $p . bin2hex(random_bytes(12));
    $alt = $b('alt');
    $part = "Content-Type: multipart/alternative; boundary=\"$alt\"\r\n\r\n"
        . "--$alt\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
        . "--$alt\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($doc)) . "--$alt--\r\n";
    if ($inline) {
        $rel = $b('rel');
        $p2 = "Content-Type: multipart/related; boundary=\"$rel\"\r\n\r\n--$rel\r\n" . $part;
        foreach ($inline as $i => $im) {
            $ext = explode('/', $im['mime'])[1] ?? 'png';
            $p2 .= "--$rel\r\nContent-Type: {$im['mime']}; name=\"bild$i.$ext\"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <{$im['cid']}>\r\nContent-Disposition: inline; filename=\"bild$i.$ext\"\r\n\r\n" . chunk_split(base64_encode($im['data']));
        }
        $part = $p2 . "--$rel--\r\n";
    }
    if ($files) {
        $mix = $b('mix');
        $p3 = "Content-Type: multipart/mixed; boundary=\"$mix\"\r\n\r\n--$mix\r\n" . $part;
        foreach ($files as $f) {
            $fn = str_replace(['"', "\r", "\n"], '', (string)$f['name']);
            $fnEnc = preg_match('/[^\x20-\x7e]/', $fn) ? "filename*=UTF-8''" . rawurlencode($fn) : 'filename="' . $fn . '"';
            $p3 .= "--$mix\r\nContent-Type: {$f['mime']}; name=\"" . wf_mail_hdr_enc($fn) . "\"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; $fnEnc\r\n\r\n" . chunk_split(base64_encode((string)$f['data']));
        }
        $part = $p3 . "--$mix--\r\n";
    }
    $hdr = 'Date: ' . date('r') . "\r\n"
        . 'From: ' . wf_mail_addr_hdr([$from]) . "\r\n"
        . 'To: ' . wf_mail_addr_hdr($to) . "\r\n"
        . ($cc ? 'Cc: ' . wf_mail_addr_hdr($cc) . "\r\n" : '')
        . 'Subject: ' . wf_mail_hdr_enc(str_replace(["\r", "\n"], ' ', $subject)) . "\r\n"
        . "Message-ID: <$msgId>\r\n"
        . ($inReplyTo !== '' ? "In-Reply-To: <$inReplyTo>\r\n" : '')
        . ($refs ? 'References: ' . implode(' ', array_map(fn($r) => "<$r>", array_slice($refs, -10))) . "\r\n" : '')
        . "MIME-Version: 1.0\r\nX-Mailer: Wunsch-Fabrik Auftraege\r\n";
    return [$hdr . $part, $msgId];
}

/** Senden über SMTP (alle Empfänger inkl. Bcc), sonst mail(). */
function wf_mail_transport(string $from, array $rcpts, string $raw): bool
{
    if ($dir = getenv('WF_MAIL_DIR')) {
        @mkdir($dir, 0775, true);
        return (bool)file_put_contents($dir . '/' . microtime(true) . '-postfach.eml', $raw);
    }
    $GLOBALS['wf_mail_err'] = '';
    $smtp = wf_smtp_cfg();
    if ($smtp) {
        return wf_smtp_send($smtp, $from, $rcpts, $raw);
    }
    [$head, $body] = preg_split('/\r\n\r\n/', $raw, 2) + [1 => ''];
    $subject = '';
    $keep = [];
    foreach (preg_split('/\r\n(?![ \t])/', $head) ?: [] as $l) {
        if (stripos($l, 'Subject:') === 0) {
            $subject = trim(substr($l, 8));
        } elseif (stripos($l, 'To:') !== 0) {
            $keep[] = $l;
        }
    }
    $ok = @mail(implode(', ', $rcpts), $subject, $body, implode("\r\n", $keep), '-f' . $from);
    if (!$ok) {
        $GLOBALS['wf_mail_err'] = 'mail(): vom Server abgelehnt';
    }
    return $ok;
}

/** Übersetzen mit DeepL (Schlüssel aus den Einstellungen oder aus db_config.php der Webseite). */
function wf_deepl_key(): string
{
    $k = (string)(wf_db()->query("SELECT value FROM meta WHERE key = 'deepl_key'")->fetchColumn() ?: '');
    if ($k !== '') {
        return $k;
    }
    $cfg = getenv('WF_SITE_DB_CONFIG') ?: dirname(__DIR__, 2) . '/db_config.php';
    if (!defined('WF_DEEPL_API_KEY') && is_file($cfg)) {
        try {
            require_once $cfg;
        } catch (Throwable $e) {
            return '';
        }
    }
    return defined('WF_DEEPL_API_KEY') ? (string)constant('WF_DEEPL_API_KEY') : '';
}

function wf_translate(string $html, string $target): ?string
{
    $key = wf_deepl_key();
    if ($key === '' || trim(strip_tags($html)) === '') {
        return $key === '' ? null : $html;
    }
    if (getenv('WF_OFFLINE')) {
        return '[' . $target . '] ' . $html;
    }
    $url = (str_ends_with($key, ':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com') . '/v2/translate';
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Authorization: DeepL-Auth-Key ' . $key, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode(['text' => [$html], 'target_lang' => $target, 'tag_handling' => 'html', 'preserve_formatting' => true])]);
    $r = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    $j = $code === 200 ? json_decode((string)$r, true) : null;
    if (!is_array($j) || !isset($j['translations'][0]['text'])) {
        $GLOBALS['wf_translate_err'] = $code === 456 ? 'quota' : ($code === 403 ? 'key' : 'http' . $code);
        return null;
    }
    return (string)$j['translations'][0]['text'];
}
