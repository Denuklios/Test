<?php
/**
 * Kundenmails zu Website-Anfragen. Wird von db.php (Webseite/Admin) und vom Auftragsprogramm (auftraege/) eingebunden.
 * Enthält nur diese eine Funktion, damit sie sich mit beiden Programmen verträgt.
 */
if (!function_exists('wf_send_customer_mail')) {
/**
 * Sendet eine E-Mail an den Kunden, je nach Sprache und Anlass
 * (Eingangsbestätigung, in Bearbeitung, erledigt).
 */
function wf_send_customer_mail($toEmail, $toName, $lang, $type) {
    $lang = in_array($lang, ['de', 'da', 'en'], true) ? $lang : 'de';

    $texts = [
        'received' => [
            'de' => [
                'subject' => 'Wir haben deine Anfrage erhalten – Wunsch-Fabrik.dk',
                'body' => "Hallo {name},\n\nvielen Dank für deine Anfrage bei Wunsch-Fabrik.dk! Wir haben deine Nachricht erhalten und melden uns schnellstmöglich bei dir.\n\nLiebe Grüße\nDein Wunsch-Fabrik-Team",
            ],
            'da' => [
                'subject' => 'Vi har modtaget din forespørgsel – Wunsch-Fabrik.dk',
                'body' => "Hej {name},\n\ntak for din forespørgsel hos Wunsch-Fabrik.dk! Vi har modtaget din besked og vender tilbage til dig hurtigst muligt.\n\nMange hilsner\nDit Wunsch-Fabrik team",
            ],
            'en' => [
                'subject' => "We've received your enquiry – Wunsch-Fabrik.dk",
                'body' => "Hi {name},\n\nthank you for reaching out to Wunsch-Fabrik.dk! We've received your message and will get back to you as soon as possible.\n\nBest regards\nThe Wunsch-Fabrik Team",
            ],
        ],
        'in_progress' => [
            'de' => [
                'subject' => 'Dein Auftrag ist in Bearbeitung – Wunsch-Fabrik.dk',
                'body' => "Hallo {name},\n\ngute Nachrichten: Wir haben mit der Bearbeitung deines Auftrags begonnen! Sobald alles fertig ist, melden wir uns wieder bei dir.\n\nLiebe Grüße\nDein Wunsch-Fabrik-Team",
            ],
            'da' => [
                'subject' => 'Din bestilling er under behandling – Wunsch-Fabrik.dk',
                'body' => "Hej {name},\n\ngode nyheder: Vi er begyndt at behandle din bestilling! Så snart alt er færdigt, hører du fra os igen.\n\nMange hilsner\nDit Wunsch-Fabrik team",
            ],
            'en' => [
                'subject' => 'Your order is now in progress – Wunsch-Fabrik.dk',
                'body' => "Hi {name},\n\ngood news: we've started working on your order! We'll be in touch again as soon as it's ready.\n\nBest regards\nThe Wunsch-Fabrik Team",
            ],
        ],
        'done' => [
            'de' => [
                'subject' => 'Dein Auftrag ist fertig – Wunsch-Fabrik.dk',
                'body' => "Hallo {name},\n\ndein Auftrag ist fertiggestellt und wird zeitnah versendet bzw. zur Abholung bereitgestellt! Wir hoffen, du freust dich genauso wie wir über das Ergebnis.\n\nLiebe Grüße\nDein Wunsch-Fabrik-Team",
            ],
            'da' => [
                'subject' => 'Din bestilling er færdig – Wunsch-Fabrik.dk',
                'body' => "Hej {name},\n\ndin bestilling er nu færdig og bliver afsendt eller klargjort til afhentning meget snart! Vi håber, du bliver lige så glad for resultatet som os.\n\nMange hilsner\nDit Wunsch-Fabrik team",
            ],
            'en' => [
                'subject' => 'Your order is complete – Wunsch-Fabrik.dk',
                'body' => "Hi {name},\n\nyour order is now complete and will be shipped or ready for pickup shortly! We hope you're as happy with the result as we are.\n\nBest regards\nThe Wunsch-Fabrik Team",
            ],
        ],
    ];

    if (!isset($texts[$type][$lang])) return false;

    $subject = $texts[$type][$lang]['subject'];
    $body = str_replace('{name}', $toName, $texts[$type][$lang]['body']);

    // Hinweis auf den Newsletter (freiwillige Anmeldung mit Bestätigungsmail), außer wer schon angemeldet ist
    $already = false;
    if (function_exists('wf_db_connect') && ($m = wf_db_connect())) {
        $r = @$m->query("SELECT status FROM newsletter_subscribers WHERE email = '" . $m->real_escape_string(mb_strtolower(trim((string)$toEmail))) . "'");
        $already = $r && ($row = $r->fetch_assoc()) && $row['status'] === 'active';
    }
    if (!$already) {
        $line = ['de' => '📰 Ideen, Aktionen und Neues aus der Werkstatt – ein paar Mal im Jahr per Mail. Lust darauf? Newsletter abonnieren:',
                 'da' => '📰 Idéer, kampagner og nyt fra værkstedet – et par gange om året på mail. Lyst? Tilmeld nyhedsbrevet:',
                 'en' => '📰 Ideas, offers and news from the workshop – a few times a year by email. Interested? Subscribe:'][$lang];
        $body .= "\n\n— " . $line . "\nhttps://www.wunsch-fabrik.dk/newsletter.php?" . http_build_query(['a' => 'join', 'l' => $lang, 'e' => $toEmail, 'n' => $toName]);
    }

    $headers  = "From: Wunsch-Fabrik.dk <hej@wunsch-fabrik.dk>\r\n";
    $headers .= "Reply-To: hej@wunsch-fabrik.dk\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    return @mail($toEmail, $subject, $body, $headers);
}
}
