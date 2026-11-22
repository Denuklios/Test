<?php
declare(strict_types=1);

/** Inhalt der Auftragsbestaetigung, wie er dem Kunden gezeigt und von ihm unterschrieben wird (eingefroren). */
function wf_confirm_snapshot(PDO $db, array $o, array $cust, string $lang = 'da', int $days = 30): array
{
    $co = wf_company();
    $scheme = wf_scheme_auto($co, $cust);
    $procs = [];
    foreach ($o['processes'] as $p) {
        $pt = $db->query('SELECT name_de, name_da FROM process_types WHERE id = ' . (int)$p['process_id'])->fetch();
        if ($pt) {
            $procs[] = ['de' => $pt['name_de'], 'da' => $pt['name_da']];
        }
    }
    return [
        'seller' => array_intersect_key($co, array_flip(['name', 'street', 'zip', 'city', 'cvr', 'email', 'phone', 'web'])),
        'customer' => ['name' => $cust['name'], 'company' => $cust['company'], 'address' => $cust['address'], 'email' => $cust['email'], 'phone' => $cust['phone']],
        'nr' => $o['nr'], 'title' => $o['title'], 'description' => $o['description'], 'article' => $o['article'], 'qty' => (int)$o['qty'],
        'price' => (float)$o['price'], 'deposit' => (float)$o['deposit'], 'currency' => $o['currency'], 'due_date' => $o['due_date'],
        'processes' => $procs,
        // Positionen mit Rabatt, damit der Kunde sieht, was er wofür bekommt
        'items' => array_map(function ($it) use ($lang) {
            $g = (float)$it['qty'] * (float)$it['price'];
            $d = (float)($it['disc'] ?? 0);
            $off = ($it['disc_type'] ?? 'pct') === 'abs' ? min($d, $g) : round($g * min($d, 100) / 100, 2);
            return ['name' => wf_item_desc($it, $lang), 'qty' => (int)$it['qty'], 'price' => (float)$it['price'], 'disc' => $d, 'disc_type' => ($it['disc_type'] ?? 'pct') === 'abs' ? 'abs' : 'pct',
                'gross' => round($g, 2), 'off' => round($off, 2), 'total' => round($g - $off, 2)];
        }, $o['items'] ?? []),
        'files' => array_values(array_map(fn($f) => (int)$f['id'], array_filter($o['files'], fn($f) => str_starts_with($f['mime'], 'image/')))),
        'vat' => $scheme === 'novat' ? 'none' : ($scheme === 'eu_rc' ? 'rc' : ($scheme === 'export' ? 'export' : (wf_default_incl($scheme, $cust) ? 'incl' : 'excl'))),
        'created' => date('Y-m-d'),
        'valid_until' => date('Y-m-d', strtotime("+$days days")),
        'consumer' => empty($cust['is_business']),
        'terms' => wf_confirm_terms($co, $lang, empty($cust['is_business'])),
    ];
}

/** Standard-Bedingungen je Sprache. Zeilen mit [Firma] gelten nur für Firmenkunden, [Privat] nur für Privatkunden. */
function wf_terms_default(string $lang): string
{
    $T = [
        'de' => "Zahlung: Rechnung bei Abholung bzw. Lieferung, zahlbar innerhalb von {pay_days} Tagen. Bei größeren Aufträgen kann eine Anzahlung vereinbart werden.\n"
            . "Motive und Rechte: Der Kunde versichert, dass er die Rechte an allen gelieferten Logos, Bildern, Texten und Namen besitzt, und stellt Wunsch-Fabrik von Ansprüchen Dritter frei.\n"
            . "Farben und Ausführung: Kleine Abweichungen in Farbe, Größe und Position gegenüber Bildschirm oder Muster sind technisch bedingt und kein Mangel. Stickfarben werden dem Garnsortiment angenähert.\n"
            . "Vom Kunden gestellte Textilien: Für Materialfehler oder Ungeeignetheit für das Verfahren wird nicht gehaftet. Bitte 1–2 Ersatzteile einplanen.\n"
            . "Termin: unter Vorbehalt rechtzeitiger Freigabe und Materiallieferung. Abholung nach Absprache.\n"
            . "[Firma] Mengen: Bei Serien sind Mehr- oder Minderlieferungen bis 3 % (mind. 1 Stück) möglich und werden nach Stück abgerechnet.\n"
            . "[Firma] Reklamationen bitte innerhalb von 8 Tagen nach Erhalt und vor Gebrauch oder Wäsche melden.\n"
            . "[Privat] Es gelten die gesetzlichen Reklamationsrechte. Mängel bitte möglichst bald nach Erhalt melden.",
        'da' => "Betaling: Faktura ved afhentning eller levering, betales inden {pay_days} dage. Ved større ordrer kan der aftales forudbetaling.\n"
            . "Motiver og rettigheder: Kunden indestår for at have rettighederne til alle leverede logoer, billeder, tekster og navne og holder Ønske-Fabrik skadesløs over for krav fra tredjemand.\n"
            . "Farver og udførelse: Mindre afvigelser i farve, størrelse og placering i forhold til skærm eller prøve er teknisk betingede og ikke en mangel. Broderifarver tilpasses trådsortimentet.\n"
            . "Kundens egne tekstiler: Der hæftes ikke for materialefejl eller manglende egnethed til metoden. Beregn venligst 1–2 ekstra stk.\n"
            . "Tidspunkt: under forudsætning af rettidig godkendelse og materialelevering. Afhentning efter aftale.\n"
            . "[Firma] Antal: Ved serier kan der leveres op til 3 % (mindst 1 stk.) mere eller mindre, som afregnes pr. stk.\n"
            . "[Firma] Reklamationer skal meddeles inden 8 dage efter modtagelse og før brug eller vask.\n"
            . "[Privat] Købelovens regler om reklamation gælder. Meld venligst mangler hurtigst muligt efter modtagelse.",
        'en' => "Payment: invoice on pick-up or delivery, payable within {pay_days} days. A deposit may be agreed for larger orders.\n"
            . "Designs and rights: The customer warrants holding the rights to all supplied logos, images, texts and names and indemnifies Wunsch-Fabrik against third-party claims.\n"
            . "Colours and finish: Minor deviations in colour, size and position compared to screen or sample are technical and not a defect. Embroidery colours are matched to the thread range.\n"
            . "Customer-supplied textiles: No liability for material defects or unsuitability for the process. Please allow 1–2 spare items.\n"
            . "Date: subject to timely approval and material delivery. Pick-up by arrangement.\n"
            . "[Firma] Quantities: For series, over- or under-delivery of up to 3 % (min. 1 item) may occur and is charged per item.\n"
            . "[Firma] Complaints must be made within 8 days of receipt and before use or washing.\n"
            . "[Privat] Statutory consumer rights apply. Please report defects as soon as possible after receipt.",
    ];
    return $T[$lang] ?? $T['da'];
}

/** Bedingungen für diesen Kunden (eigene Texte aus den Firmendaten, sonst Standard), als Liste. */
function wf_confirm_terms(array $co, string $lang, bool $consumer): array
{
    $txt = trim((string)($co['terms_' . $lang] ?? '')) ?: wf_terms_default($lang);
    $out = [];
    foreach (preg_split('/\r?\n/', strtr($txt, ['{pay_days}' => (string)(int)$co['pay_days']])) ?: [] as $l) {
        $l = trim($l);
        if ($l === '') {
            continue;
        }
        if (preg_match('/^\[(firma|privat)\]\s*/iu', $l, $m)) {
            if ((strtolower($m[1]) === 'privat') !== $consumer) {
                continue;
            }
            $l = trim(substr($l, strlen($m[0])));
        }
        $out[] = $l;
    }
    return $out;
}

function wf_confirm_text(string $lang): array
{
    $T = [
        'da' => ['offer' => 'Tilbud', 'offer_nr' => 'Tilbud', 'valid' => 'Tilbuddet gælder til {d}.', 'intro_offer' => 'Kontrollér venligst tilbuddet. Med din underskrift accepterer du det bindende – så er det en ordre.',
            'intro_done' => 'Tak for din ordre! Denne bekræftelse kan altid åbnes igen via dette link.', 'print' => 'Udskriv / gem som PDF', 'customer' => 'Kunde', 'terms' => 'Betingelser',
            'withdrawal' => 'Fortrydelsesret: Da varerne fremstilles efter dine specifikationer eller tydeligt personliggøres, gælder fortrydelsesretten ikke (forbrugeraftalelovens § 18, stk. 2, nr. 3).',
            'signed_by' => 'Underskrevet', 'title' => 'Ordrebekræftelse', 'intro' => 'Kontrollér venligst ordren og bekræft den med din underskrift.', 'order' => 'Ordre', 'qty' => 'Antal', 'article' => 'Vare',
            'process' => 'Metode', 'due' => 'Klar til afhentning/levering', 'price' => 'Pris', 'deposit' => 'Allerede betalt', 'item' => 'Produkt', 'unit_price' => 'Stk.-pris', 'disc' => 'Rabat', 'line_sum' => 'Beløb', 'before_disc' => 'Pris før rabat', 'disc_total' => 'Din rabat', 'files' => 'Motiv / skabelon',
            'vat_incl' => 'inkl. 25 % moms', 'vat_excl' => 'ekskl. moms', 'vat_rc' => 'uden moms (omvendt betalingspligt)', 'vat_export' => 'uden moms (eksport)', 'vat_none' => '',
            'name' => 'Dit navn', 'sign' => 'Underskrift (med finger eller mus)', 'clear' => 'Slet', 'accept' => 'Jeg accepterer tilbuddet bindende, herunder motiv, antal, pris, tidspunkt og betingelserne ovenfor.',
            'submit' => 'Accepter tilbuddet bindende', 'done' => 'Tak! Ordren er bekræftet {d} af {n}.', 'invalid' => 'Linket er ugyldigt eller udløbet. Kontakt os venligst.',
            'need_name' => 'Skriv venligst dit navn.', 'need_sig' => 'Skriv venligst under.', 'need_accept' => 'Sæt venligst flueben.', 'error' => 'Der skete en fejl. Prøv igen.', 'pcs' => 'stk.'],
        'de' => ['offer' => 'Angebot', 'offer_nr' => 'Angebot', 'valid' => 'Das Angebot gilt bis {d}.', 'intro_offer' => 'Bitte prüfen Sie das Angebot. Mit Ihrer Unterschrift nehmen Sie es verbindlich an – damit wird es zum Auftrag.',
            'intro_done' => 'Vielen Dank für Ihren Auftrag! Diese Bestätigung können Sie jederzeit über diesen Link wieder öffnen.', 'print' => 'Drucken / als PDF speichern', 'customer' => 'Kunde', 'terms' => 'Bedingungen',
            'withdrawal' => 'Widerrufsrecht: Da die Ware nach Ihren Vorgaben angefertigt bzw. eindeutig personalisiert wird, besteht kein Widerrufsrecht (dän. Verbrauchervertragsgesetz, forbrugeraftaleloven § 18 Abs. 2 Nr. 3).',
            'signed_by' => 'Unterschrieben', 'title' => 'Auftragsbestätigung', 'intro' => 'Bitte prüfen Sie den Auftrag und bestätigen Sie ihn mit Ihrer Unterschrift.', 'order' => 'Auftrag', 'qty' => 'Menge', 'article' => 'Artikel',
            'process' => 'Verfahren', 'due' => 'Fertig zur Abholung/Lieferung', 'price' => 'Preis', 'deposit' => 'Bereits bezahlt', 'item' => 'Produkt', 'unit_price' => 'Einzelpreis', 'disc' => 'Rabatt', 'line_sum' => 'Betrag', 'before_disc' => 'Preis vor Rabatt', 'disc_total' => 'Ihr Rabatt', 'files' => 'Motiv / Vorlage',
            'vat_incl' => 'inkl. 25 % dänischer Moms', 'vat_excl' => 'zzgl. Moms', 'vat_rc' => 'ohne Moms (Reverse Charge)', 'vat_export' => 'ohne Moms (Export)', 'vat_none' => '',
            'name' => 'Ihr Name', 'sign' => 'Unterschrift (mit Finger oder Maus)', 'clear' => 'Löschen', 'accept' => 'Ich nehme das Angebot verbindlich an, einschließlich Motiv, Menge, Preis, Termin und der Bedingungen oben.',
            'submit' => 'Angebot verbindlich annehmen', 'done' => 'Vielen Dank! Der Auftrag wurde am {d} von {n} bestätigt.', 'invalid' => 'Der Link ist ungültig oder abgelaufen. Bitte kontaktieren Sie uns.',
            'need_name' => 'Bitte Namen eintragen.', 'need_sig' => 'Bitte unterschreiben.', 'need_accept' => 'Bitte Haken setzen.', 'error' => 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.', 'pcs' => 'Stk.'],
        'en' => ['offer' => 'Quotation', 'offer_nr' => 'Quotation', 'valid' => 'This offer is valid until {d}.', 'intro_offer' => 'Please check the offer. By signing, you accept it bindingly – it then becomes an order.',
            'intro_done' => 'Thank you for your order! You can open this confirmation again at any time via this link.', 'print' => 'Print / save as PDF', 'customer' => 'Customer', 'terms' => 'Terms',
            'withdrawal' => 'Right of withdrawal: As the goods are made to your specifications or clearly personalised, there is no right of withdrawal (Danish Consumer Contracts Act, § 18(2)(3)).',
            'signed_by' => 'Signed', 'title' => 'Order confirmation', 'intro' => 'Please check the order and confirm it with your signature.', 'order' => 'Order', 'qty' => 'Quantity', 'article' => 'Item',
            'process' => 'Method', 'due' => 'Ready for pick-up/delivery', 'price' => 'Price', 'deposit' => 'Already paid', 'item' => 'Product', 'unit_price' => 'Unit price', 'disc' => 'Discount', 'line_sum' => 'Amount', 'before_disc' => 'Price before discount', 'disc_total' => 'Your discount', 'files' => 'Design / artwork',
            'vat_incl' => 'incl. 25 % Danish VAT', 'vat_excl' => 'excl. VAT', 'vat_rc' => 'excl. VAT (reverse charge)', 'vat_export' => 'excl. VAT (export)', 'vat_none' => '',
            'name' => 'Your name', 'sign' => 'Signature (finger or mouse)', 'clear' => 'Clear', 'accept' => 'I bindingly accept the offer, including design, quantity, price, date and the terms above.',
            'submit' => 'Accept offer', 'done' => 'Thank you! The order was confirmed on {d} by {n}.', 'invalid' => 'This link is invalid or has expired. Please contact us.',
            'need_name' => 'Please enter your name.', 'need_sig' => 'Please sign.', 'need_accept' => 'Please tick the box.', 'error' => 'Something went wrong. Please try again.', 'pcs' => 'pcs'],
    ];
    return $T[$lang] ?? $T['da'];
}
