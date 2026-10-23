<?php
declare(strict_types=1);

/** Inhalt der Auftragsbestaetigung, wie er dem Kunden gezeigt und von ihm unterschrieben wird (eingefroren). */
function wf_confirm_snapshot(PDO $db, array $o, array $cust): array
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
        'processes' => $procs, 'files' => array_values(array_map(fn($f) => (int)$f['id'], array_filter($o['files'], fn($f) => str_starts_with($f['mime'], 'image/')))),
        'vat' => $scheme === 'novat' ? 'none' : ($scheme === 'eu_rc' ? 'rc' : ($scheme === 'export' ? 'export' : (wf_default_incl($scheme, $cust) ? 'incl' : 'excl'))),
        'created' => date('Y-m-d'),
    ];
}

function wf_confirm_text(string $lang): array
{
    $T = [
        'da' => ['title' => 'Ordrebekræftelse', 'intro' => 'Kontrollér venligst ordren og bekræft den med din underskrift.', 'order' => 'Ordre', 'qty' => 'Antal', 'article' => 'Vare',
            'process' => 'Metode', 'due' => 'Klar til afhentning/levering', 'price' => 'Pris', 'deposit' => 'Allerede betalt', 'files' => 'Motiv / skabelon',
            'vat_incl' => 'inkl. 25 % moms', 'vat_excl' => 'ekskl. moms', 'vat_rc' => 'uden moms (omvendt betalingspligt)', 'vat_export' => 'uden moms (eksport)', 'vat_none' => '',
            'name' => 'Dit navn', 'sign' => 'Underskrift (med finger eller mus)', 'clear' => 'Slet', 'accept' => 'Jeg bekræfter ordren på de nævnte betingelser, herunder motiv, antal, pris og tidspunkt.',
            'submit' => 'Bekræft bindende', 'done' => 'Tak! Ordren er bekræftet {d} af {n}.', 'invalid' => 'Linket er ugyldigt eller udløbet. Kontakt os venligst.',
            'need_name' => 'Skriv venligst dit navn.', 'need_sig' => 'Skriv venligst under.', 'need_accept' => 'Sæt venligst flueben.', 'error' => 'Der skete en fejl. Prøv igen.', 'pcs' => 'stk.'],
        'de' => ['title' => 'Auftragsbestätigung', 'intro' => 'Bitte prüfen Sie den Auftrag und bestätigen Sie ihn mit Ihrer Unterschrift.', 'order' => 'Auftrag', 'qty' => 'Menge', 'article' => 'Artikel',
            'process' => 'Verfahren', 'due' => 'Fertig zur Abholung/Lieferung', 'price' => 'Preis', 'deposit' => 'Bereits bezahlt', 'files' => 'Motiv / Vorlage',
            'vat_incl' => 'inkl. 25 % dänischer Moms', 'vat_excl' => 'zzgl. Moms', 'vat_rc' => 'ohne Moms (Reverse Charge)', 'vat_export' => 'ohne Moms (Export)', 'vat_none' => '',
            'name' => 'Ihr Name', 'sign' => 'Unterschrift (mit Finger oder Maus)', 'clear' => 'Löschen', 'accept' => 'Ich bestätige den Auftrag zu den genannten Bedingungen, einschließlich Motiv, Menge, Preis und Termin.',
            'submit' => 'Verbindlich bestätigen', 'done' => 'Vielen Dank! Der Auftrag wurde am {d} von {n} bestätigt.', 'invalid' => 'Der Link ist ungültig oder abgelaufen. Bitte kontaktieren Sie uns.',
            'need_name' => 'Bitte Namen eintragen.', 'need_sig' => 'Bitte unterschreiben.', 'need_accept' => 'Bitte Haken setzen.', 'error' => 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.', 'pcs' => 'Stk.'],
        'en' => ['title' => 'Order confirmation', 'intro' => 'Please check the order and confirm it with your signature.', 'order' => 'Order', 'qty' => 'Quantity', 'article' => 'Item',
            'process' => 'Method', 'due' => 'Ready for pick-up/delivery', 'price' => 'Price', 'deposit' => 'Already paid', 'files' => 'Design / artwork',
            'vat_incl' => 'incl. 25 % Danish VAT', 'vat_excl' => 'excl. VAT', 'vat_rc' => 'excl. VAT (reverse charge)', 'vat_export' => 'excl. VAT (export)', 'vat_none' => '',
            'name' => 'Your name', 'sign' => 'Signature (finger or mouse)', 'clear' => 'Clear', 'accept' => 'I confirm the order on the stated terms, including design, quantity, price and date.',
            'submit' => 'Confirm order', 'done' => 'Thank you! The order was confirmed on {d} by {n}.', 'invalid' => 'This link is invalid or has expired. Please contact us.',
            'need_name' => 'Please enter your name.', 'need_sig' => 'Please sign.', 'need_accept' => 'Please tick the box.', 'error' => 'Something went wrong. Please try again.', 'pcs' => 'pcs'],
    ];
    return $T[$lang] ?? $T['da'];
}
