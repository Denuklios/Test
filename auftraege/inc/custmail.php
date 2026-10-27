<?php
declare(strict_types=1);
require_once __DIR__ . '/archive.php';

/*
 * E-Mails an Kunden und Verfolgungslink: Angebot zum Unterschreiben, optional Versandmeldung,
 * Nachfrage eine Woche nach „Abgeholt/Versendet“ (mit Abmeldelink und optionalem Bewertungslink).
 */

const WF_CARRIERS = [
    'postnord' => ['PostNord', 'https://tracking.postnord.com/dk/?id={n}'],
    'gls' => ['GLS', 'https://gls-group.com/DK/da/find-pakke?match={n}'],
    'dao' => ['DAO', 'https://www.dao.as/privat/find-din-pakke?stregkode={n}'],
    'bring' => ['Bring', 'https://tracking.bring.dk/tracking/{n}'],
    'dhl' => ['DHL', 'https://www.dhl.com/de-de/home/sendungsverfolgung.html?tracking-id={n}'],
    'dpd' => ['DPD', 'https://tracking.dpd.de/status/de_DE/parcel/{n}'],
    'hermes' => ['Hermes', 'https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#{n}'],
    'ups' => ['UPS', 'https://www.ups.com/track?tracknum={n}'],
    'other' => ['', ''],
];

function wf_carrier_url(string $carrier, string $no): string
{
    $u = WF_CARRIERS[$carrier][1] ?? '';
    return $u !== '' && $no !== '' ? str_replace('{n}', rawurlencode($no), $u) : '';
}

/** Öffentliche Adresse der App (wird bei jedem angemeldeten Aufruf gemerkt, damit Mails aus dem Hintergrund richtige Links haben). */
function wf_public_base(PDO $db, bool $remember = false): string
{
    if ($remember && !empty($_SERVER['HTTP_HOST'])) {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
        $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
        $base = ($https ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . $dir . '/';
        if (wf_public_base($db) !== $base) {
            $db->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('public_base', ?)")->execute([$base]);
        }
        return $base;
    }
    return (string)($db->query("SELECT value FROM meta WHERE key = 'public_base'")->fetchColumn() ?: '');
}

function wf_track_token(PDO $db, int $orderId): string
{
    $st = $db->prepare('SELECT track_token FROM orders WHERE id = ?');
    $st->execute([$orderId]);
    $t = (string)($st->fetchColumn() ?: '');
    if ($t === '') {
        $t = bin2hex(random_bytes(24));
        $db->prepare('UPDATE orders SET track_token = ? WHERE id = ?')->execute([$t, $orderId]);
    }
    return $t;
}

function wf_track_url(PDO $db, int $orderId): string
{
    return wf_public_base($db) . 'verfolgen.php?t=' . wf_track_token($db, $orderId);
}

function wf_mail_settings(): array
{
    $co = wf_company();
    return ['offer' => (bool)($co['mail_offer'] ?? true), 'approved' => (bool)($co['mail_approved'] ?? true), 'shipped' => (bool)($co['mail_shipped'] ?? false), 'followup' => (bool)($co['mail_followup'] ?? true),
        'review_url' => (string)($co['review_url'] ?? ''), 'from' => trim((string)$co['email']), 'name' => trim((string)$co['name']) ?: 'Wunsch-Fabrik'];
}

/** Texte der Kundenmails je Sprache. Platzhalter in {geschweiften Klammern}. */
function wf_cm_text(string $lang): array
{
    $T = [
        'de' => [
            'buttons' => ['sign' => 'Angebot ansehen & unterschreiben', 'track' => 'Auftrag verfolgen', 'ship' => 'Sendung verfolgen', 'review' => 'Bewertung schreiben', 'unsub' => 'hier abmelden', 'conf' => 'Auftragsbestätigung ansehen'],
            'hello' => 'Hallo {name},', 'regards' => "Viele Grüße\n{owner}\n{company}",
            'offer_subj' => 'Ihr Angebot {nr} – bitte prüfen und unterschreiben',
            'offer_body' => "vielen Dank für Ihre Anfrage! Ihr Angebot „{title}“ ist fertig. Bitte prüfen Sie Motiv, Menge, Preis und Termin und bestätigen Sie es mit Ihrer Unterschrift:\n\n{sign}\n\nDer Link ist 30 Tage gültig. Erst mit Ihrer Unterschrift wird das Angebot zum verbindlichen Auftrag.\n\nDen aktuellen Stand Ihres Auftrags sehen Sie jederzeit hier:\n{track}",
            'appr_subj' => 'Danke für Ihre Freigabe – Auftrag {nr}',
            'appr_body' => "vielen Dank für Ihre Unterschrift! Ihr Auftrag „{title}“ ist damit freigegeben und wir legen los.{due}\n\nHier sehen Sie jederzeit, wie weit Ihr Auftrag ist – vom Material bis zum Versand, dort steht später auch die Sendungsnummer:\n{track}\n\nIhre unterschriebene Auftragsbestätigung zum Nachlesen und Drucken:\n{conf}",
            'appr_due' => "\n\nGeplante Fertigstellung: {d}",
            'offer_note' => 'Nach der Lieferung fragen wir einmal per E-Mail nach, ob alles passt. Wenn Sie das nicht möchten: {unsub}',
            'ship_subj' => 'Ihre Bestellung {nr} ist unterwegs',
            'ship_body' => "Ihre Bestellung „{title}“ ist heute verschickt worden.{tracking}\n\nStand und Sendungsnummer finden Sie auch hier:\n{track}",
            'ship_no' => "\n\nVersand mit {carrier}, Sendungsnummer: {no}\n{url}",
            'fu_subj' => ['Ist alles gut bei Ihnen angekommen?', 'Kurze Nachfrage zu Ihrer Bestellung {nr}', 'Wie gefällt Ihnen Ihr Auftrag „{title}“?'],
            'fu_open' => ['vor ein paar Tagen ist Ihre Bestellung „{title}“ auf den Weg gegangen.', 'Ihre Bestellung „{title}“ sollte inzwischen bei Ihnen sein.', 'es ist eine Woche her, dass Ihr Auftrag „{title}“ fertig geworden ist.'],
            'fu_mid' => ['Ist alles gut angekommen und sind Sie zufrieden?', 'Wir hoffen, alles ist so geworden, wie Sie es sich vorgestellt haben.', 'Passt alles – Farben, Größen, Platzierung?'],
            'fu_help' => ['Falls etwas nicht stimmt, antworten Sie einfach auf diese E-Mail – wir kümmern uns darum.', 'Sollte etwas nicht passen, melden Sie sich gern direkt bei uns, wir finden eine Lösung.', 'Wenn Ihnen etwas auffällt, schreiben Sie uns einfach zurück.'],
            'fu_review' => ['Wenn Sie zufrieden sind, freuen wir uns sehr über eine kurze Bewertung:', 'Hat es Ihnen gefallen? Eine kleine Bewertung hilft uns sehr:', 'Über ein paar Worte von Ihnen würden wir uns freuen:'],
            'fu_thanks' => ['Danke, dass Sie bei uns bestellt haben!', 'Vielen Dank für Ihr Vertrauen!', 'Danke für Ihren Auftrag!'],
            'unsub' => 'Sie erhalten diese Nachricht, weil Sie bei uns bestellt haben. Keine solchen E-Mails mehr: {unsub}',
        ],
        'da' => [
            'buttons' => ['sign' => 'Se tilbud & underskriv', 'track' => 'Følg ordren', 'ship' => 'Følg forsendelsen', 'review' => 'Skriv en anmeldelse', 'unsub' => 'afmeld her', 'conf' => 'Se ordrebekræftelsen'],
            'hello' => 'Hej {name},', 'regards' => "Venlig hilsen\n{owner}\n{company}",
            'offer_subj' => 'Dit tilbud {nr} – gennemse og underskriv',
            'offer_body' => "tak for din forespørgsel! Dit tilbud „{title}“ er klar. Tjek motiv, antal, pris og termin, og bekræft med din underskrift:\n\n{sign}\n\nLinket er gyldigt i 30 dage. Først med din underskrift bliver tilbuddet til en bindende ordre.\n\nDu kan altid følge din ordre her:\n{track}",
            'appr_subj' => 'Tak for din godkendelse – ordre {nr}',
            'appr_body' => "mange tak for din underskrift! Din ordre „{title}“ er nu godkendt, og vi går i gang.{due}\n\nHer kan du altid se, hvor langt din ordre er – fra materiale til forsendelse; senere står forsendelsesnummeret også dér:\n{track}\n\nDin underskrevne ordrebekræftelse til at læse og printe:\n{conf}",
            'appr_due' => "\n\nForventet færdig: {d}",
            'offer_note' => 'Efter leveringen spørger vi én gang pr. e-mail, om alt er i orden. Ønsker du ikke det: {unsub}',
            'ship_subj' => 'Din ordre {nr} er på vej',
            'ship_body' => "Din ordre „{title}“ er sendt i dag.{tracking}\n\nStatus og forsendelsesnummer finder du også her:\n{track}",
            'ship_no' => "\n\nSendt med {carrier}, forsendelsesnummer: {no}\n{url}",
            'fu_subj' => ['Er alt kommet godt frem?', 'Kort opfølgning på din ordre {nr}', 'Hvordan blev din ordre „{title}“?'],
            'fu_open' => ['for et par dage siden blev din ordre „{title}“ sendt af sted.', 'din ordre „{title}“ burde være hos dig nu.', 'det er en uge siden, din ordre „{title}“ blev færdig.'],
            'fu_mid' => ['Er alt kommet godt frem, og er du tilfreds?', 'Vi håber, alt er blevet, som du havde forestillet dig.', 'Passer det hele – farver, størrelser, placering?'],
            'fu_help' => ['Hvis noget ikke er i orden, så svar bare på denne e-mail – så tager vi os af det.', 'Passer noget ikke, så kontakt os gerne direkte, så finder vi en løsning.', 'Hvis du bemærker noget, så skriv bare tilbage.'],
            'fu_review' => ['Er du tilfreds, bliver vi rigtig glade for en kort anmeldelse:', 'Kunne du lide det? En lille anmeldelse hjælper os meget:', 'Vi bliver glade for et par ord fra dig:'],
            'fu_thanks' => ['Tak, fordi du handlede hos os!', 'Mange tak for din tillid!', 'Tak for din ordre!'],
            'unsub' => 'Du modtager denne besked, fordi du har handlet hos os. Ingen flere af denne slags e-mails: {unsub}',
        ],
        'en' => [
            'buttons' => ['sign' => 'View quote & sign', 'track' => 'Track order', 'ship' => 'Track shipment', 'review' => 'Write a review', 'unsub' => 'unsubscribe here', 'conf' => 'View order confirmation'],
            'hello' => 'Hello {name},', 'regards' => "Kind regards\n{owner}\n{company}",
            'offer_subj' => 'Your quote {nr} – please review and sign',
            'offer_body' => "thank you for your enquiry! Your quote \"{title}\" is ready. Please check design, quantity, price and date and confirm with your signature:\n\n{sign}\n\nThe link is valid for 30 days. Only your signature turns the quote into a binding order.\n\nYou can follow your order here at any time:\n{track}",
            'appr_subj' => 'Thank you for your approval – order {nr}',
            'appr_body' => "thank you for your signature! Your order \"{title}\" is now approved and we are getting started.{due}\n\nHere you can always see how far your order has come – from material to shipping; the tracking number will appear there later:\n{track}\n\nYour signed order confirmation to read and print:\n{conf}",
            'appr_due' => "\n\nPlanned completion: {d}",
            'offer_note' => 'After delivery we will ask once by e-mail whether everything is fine. If you do not want this: {unsub}',
            'ship_subj' => 'Your order {nr} is on its way',
            'ship_body' => "Your order \"{title}\" was shipped today.{tracking}\n\nStatus and tracking number are also available here:\n{track}",
            'ship_no' => "\n\nShipped with {carrier}, tracking number: {no}\n{url}",
            'fu_subj' => ['Did everything arrive safely?', 'A quick follow-up on your order {nr}', 'How do you like your order "{title}"?'],
            'fu_open' => ['a few days ago your order "{title}" was sent on its way.', 'your order "{title}" should have reached you by now.', 'it has been a week since your order "{title}" was completed.'],
            'fu_mid' => ['Did everything arrive safely and are you happy with it?', 'We hope everything turned out just as you imagined.', 'Is everything right – colours, sizes, placement?'],
            'fu_help' => ['If anything is not right, simply reply to this e-mail and we will take care of it.', 'Should anything be wrong, please get in touch and we will find a solution.', 'If you notice anything, just write back.'],
            'fu_review' => ['If you are happy, we would really appreciate a short review:', 'Did you like it? A small review helps us a lot:', 'We would be glad to hear a few words from you:'],
            'fu_thanks' => ['Thank you for ordering from us!', 'Many thanks for your trust!', 'Thank you for your order!'],
            'unsub' => 'You receive this message because you ordered from us. No more e-mails like this: {unsub}',
        ],
    ];
    return $T[$lang] ?? $T['en'];
}

function wf_cm_ctx(PDO $db, int $orderId): ?array
{
    $st = $db->prepare('SELECT o.*, c.name AS c_name, c.company AS c_company, c.email AS c_email, c.no_followup, c.anonymized_at, c.country, c.doc_lang
        FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ? AND o.deleted_at IS NULL');
    $st->execute([$orderId]);
    $o = $st->fetch();
    if (!$o || $o['anonymized_at'] || !wf_email_ok((string)$o['c_email'])) {
        $GLOBALS['wf_mail_err'] = 'Kunde hat keine gültige E-Mail-Adresse';
        return null;
    }
    $lang = wf_doc_lang_for(['doc_lang' => $o['doc_lang'], 'country' => $o['country']]);
    $co = wf_company();
    $track = wf_track_url($db, $orderId);
    $first = trim(explode(' ', trim((string)$o['c_name']))[0] ?? '');
    return ['o' => $o, 'lang' => $lang, 'T' => wf_cm_text($lang), 'track' => $track, 'unsub' => $track . '&abmelden=1',
        'vars' => ['{name}' => $first ?: (string)$o['c_company'], '{nr}' => $o['nr'], '{title}' => $o['title'], '{track}' => $track, '{unsub}' => $track . '&abmelden=1',
            '{owner}' => (string)($co['owner'] ?? ''), '{company}' => (string)$co['name']]];
}

/**
 * HTML-Fassung: Absätze, eine Zeile nur mit Link wird zum Knopf (Beschriftung je nach Ziel), Links im Text sind klickbar.
 */
function wf_cm_html(string $text, array $B, string $track): string
{
    $e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $label = function (string $u) use ($B, $track): string {
        if (str_contains($u, 'bestaetigung.php')) {
            return str_contains($u, '&signed=1') ? $B['conf'] : $B['sign'];
        }
        if (str_contains($u, '&abmelden=1')) {
            return '';
        }
        if ($u === $track) {
            return $B['track'];
        }
        return str_contains($u, 'verfolgen.php') ? $B['track'] : (preg_match('~g\.page|google\.|trustpilot|review~i', $u) ? $B['review'] : $B['ship']);
    };
    $out = '';
    foreach (preg_split("/\n{2,}/", trim($text)) as $para) {
        $lines = [];
        foreach (explode("\n", $para) as $ln) {
            $t = trim($ln);
            if (preg_match('~^https?://\S+$~', $t) && ($lb = $label($t)) !== '') {
                $lines[] = '<a href="' . $e($t) . '" style="display:inline-block;margin:6px 0;padding:12px 22px;border-radius:10px;background:#8B2BE2;background-image:linear-gradient(135deg,#8B2BE2,#A855F7);color:#ffffff;font-weight:600;text-decoration:none">' . $e($lb) . '</a>';
            } else {
                // Abmeldelink als kurzer Text statt langer Adresse
                $lines[] = preg_replace_callback('~https?://[^\s<]+~', fn($m) => '<a href="' . $m[0] . '" style="color:#7E22CE;word-break:break-all">'
                    . (str_contains($m[0], '&amp;abmelden=1') ? $e($B['unsub']) : $m[0]) . '</a>', $e($ln));
            }
        }
        $small = str_starts_with($para, '— ') || str_contains($para, '&abmelden=1');
        $out .= '<p style="margin:0 0 14px;' . ($small ? 'font-size:12px;color:#6b6479' : '') . '">' . implode('<br>', $lines) . '</p>';
    }
    return '<!doctype html><html><body style="margin:0;padding:0;background:#f1eef7"><div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f1a2b">'
        . '<div style="font-family:Georgia,serif;letter-spacing:4px;font-weight:bold;margin-bottom:18px">WUNSCH-<span style="color:#9333EA">FABRIK</span></div>'
        . '<div style="background:#ffffff;border:1px solid #e3dbf0;border-radius:14px;padding:22px">' . $out . '</div></div></body></html>';
}

function wf_cm_send(PDO $db, array $x, string $subject, string $body, string $what): bool
{
    $s = wf_mail_settings();
    if (!wf_email_ok($s['from'])) {
        $GLOBALS['wf_mail_err'] = 'In den Firmendaten fehlt die eigene E-Mail-Adresse (Absender)';
        return false;
    }
    if (wf_public_base($db) === '') {
        $GLOBALS['wf_mail_err'] = 'Adresse der App unbekannt – App einmal neu laden';
        return false;
    }
    $text = strtr($x['T']['hello'], $x['vars']) . "\n\n" . $body . "\n\n" . strtr($x['T']['regards'], $x['vars']);
    $ok = wf_mail($x['o']['c_email'], $s['from'], strtr($subject, $x['vars']), $text, [], $s['name'], wf_cm_html($text, $x['T']['buttons'], $x['track']));
    if ($ok) {
        $db->prepare('INSERT INTO status_log (order_id, user_name, what) VALUES (?,?,?)')->execute([(int)$x['o']['id'], 'System', 'mail:' . $what]);
    }
    return $ok;
}

/** Angebot zum Unterschreiben per Mail (Link mit Token, das nur jetzt im Klartext existiert). */
function wf_cm_offer(PDO $db, int $orderId, string $signUrl): bool
{
    $x = wf_cm_ctx($db, $orderId);
    if (!$x) {
        return false;
    }
    $body = strtr($x['T']['offer_body'], $x['vars'] + ['{sign}' => $signUrl]);
    if (wf_mail_settings()['followup'] && !$x['o']['no_followup']) {
        $body .= "\n\n" . strtr($x['T']['offer_note'], $x['vars']);
    }
    return wf_cm_send($db, $x, $x['T']['offer_subj'], $body, 'offer');
}

/** Nach der Unterschrift: Dank für die Freigabe + Verfolgungslink + Link zur unterschriebenen Bestätigung. */
function wf_cm_approved(PDO $db, int $orderId, string $confUrl): bool
{
    if (!wf_mail_settings()['approved']) {
        return false;
    }
    $x = wf_cm_ctx($db, $orderId);
    if (!$x) {
        return false;
    }
    $due = $x['o']['due_date'] ? strtr($x['T']['appr_due'], ['{d}' => wf_doc_date($x['o']['due_date'], $x['lang'])]) : '';
    return wf_cm_send($db, $x, $x['T']['appr_subj'], strtr($x['T']['appr_body'], $x['vars'] + ['{due}' => $due, '{conf}' => $confUrl . '&signed=1']), 'approved');
}

function wf_cm_shipped(PDO $db, int $orderId): bool
{
    $x = wf_cm_ctx($db, $orderId);
    if (!$x) {
        return false;
    }
    $o = $x['o'];
    $trk = $o['tracking_no'] !== '' ? strtr($x['T']['ship_no'], ['{carrier}' => WF_CARRIERS[$o['carrier']][0] ?? '', '{no}' => $o['tracking_no'], '{url}' => wf_carrier_url((string)$o['carrier'], (string)$o['tracking_no'])]) : '';
    return wf_cm_send($db, $x, $x['T']['ship_subj'], strtr($x['T']['ship_body'], $x['vars'] + ['{tracking}' => rtrim($trk)]), 'shipped');
}

/** Nachfrage-Mail mit wechselnden Sätzen (je Auftrag fest). null = nicht möglich (keine E-Mail, abgemeldet). */
function wf_cm_followup(PDO $db, int $orderId): ?bool
{
    $x = wf_cm_ctx($db, $orderId);
    if (!$x || $x['o']['no_followup']) {
        return null;
    }
    $T = $x['T'];
    $seed = crc32('wf' . $orderId);
    $pick = function (string $k, int $i) use ($T, $seed): string {
        $list = $T[$k];
        return $list[($seed >> ($i * 3)) % count($list)];
    };
    $review = wf_mail_settings()['review_url'];
    $parts = [$pick('fu_open', 0) . ' ' . $pick('fu_mid', 1), $pick('fu_help', 2)];
    if ($review !== '') {
        $parts[] = $pick('fu_review', 3) . "\n" . $review;
    }
    $parts[] = $pick('fu_thanks', 4);
    $body = strtr(implode("\n\n", $parts), $x['vars']);
    $sent = wf_cm_send($db, $x, $pick('fu_subj', 5), $body . "\n\n— \n" . strtr($T['unsub'], $x['vars']), 'followup');
    return $sent;
}

/** Status „Abgeholt/Versendet“ gesetzt oder verlassen: Zeitpunkt merken (Basis der Nachfrage), Versandmail. */
function wf_cm_status(PDO $db, int $orderId, string $old, string $new): void
{
    if ($new === 'delivered' && $old !== 'delivered') {
        $db->prepare("UPDATE orders SET shipped_at = datetime('now') WHERE id = ?")->execute([$orderId]);
        $st = $db->prepare('SELECT ship_mode FROM orders WHERE id = ?');
        $st->execute([$orderId]);
        if ($st->fetchColumn() === 'ship' && wf_mail_settings()['shipped']) {
            wf_cm_shipped($db, $orderId);
        }
    } elseif ($old === 'delivered' && $new !== 'delivered') {
        $db->prepare('UPDATE orders SET shipped_at = NULL WHERE id = ? AND followup_at IS NULL')->execute([$orderId]);
    }
}

/** Fällige Nachfrage-Mails (7 Tage nach Abgeholt/Versendet, höchstens 30 Tage zurück). */
function wf_cm_run(PDO $db, int $limit = 5): int
{
    if (!wf_mail_settings()['followup']) {
        return 0;
    }
    $st = $db->prepare("SELECT id FROM orders WHERE status = 'delivered' AND deleted_at IS NULL AND followup_at IS NULL AND shipped_at IS NOT NULL
        AND shipped_at <= datetime('now', '-7 days') AND shipped_at >= datetime('now', '-30 days') ORDER BY shipped_at LIMIT ?");
    $st->execute([$limit]);
    $n = 0;
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $ok = wf_cm_followup($db, (int)$id);
        if ($ok === false) {
            continue;   // Versand fehlgeschlagen: beim nächsten Durchlauf erneut
        }
        // gesendet oder nicht möglich (keine E-Mail, abgemeldet): erledigt
        $db->prepare("UPDATE orders SET followup_at = ? WHERE id = ?")->execute([$ok ? date('Y-m-d H:i:s') : 'skip', (int)$id]);
        $n += $ok ? 1 : 0;
    }
    return $n;
}
