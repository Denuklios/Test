<?php
declare(strict_types=1);

/** Texte auf Rechnung/Kreditnota je Belegsprache. */
function wf_doc_text(string $lang): array
{
    $T = [
        'da' => [
            'invoice' => 'Faktura', 'credit' => 'Kreditnota', 'draft' => 'KLADDE – ikke gyldig faktura',
            'number' => 'Fakturanr.', 'credit_number' => 'Kreditnotanr.', 'date' => 'Fakturadato', 'credit_date' => 'Dato',
            'delivery' => 'Leveringsdato', 'due' => 'Forfaldsdato', 'customer_no' => 'Kundenr.', 'refers' => 'Kreditering af faktura nr. {n} af {d}',
            'cvr' => 'CVR-nr.', 'own_vat' => '', 'vat_id' => 'Momsnr.', 'cust_cvr' => 'CVR-nr.',
            'desc' => 'Beskrivelse', 'qty' => 'Antal', 'unit' => 'Enhed', 'price' => 'Stk.-pris', 'disc' => 'Rabat', 'disc_total' => 'Rabat i alt', 'amount' => 'Beløb',
            'net' => 'Subtotal ekskl. moms', 'vat' => 'Moms {p} %', 'vat0' => 'Moms 0 %', 'total' => 'I alt', 'total_credit' => 'Krediteret i alt',
            'incl_note' => 'Priserne er inkl. moms.', 'vat_dkk' => 'Momsbeløb i DKK: {v} (kurs {r} pr. {d}, {s})',
            'rc_services' => 'Omvendt betalingspligt – køber afregner momsen (momsdirektivets art. 196).',
            'rc_goods' => 'Momsfri levering af varer til andet EU-land, jf. momslovens § 34, stk. 1, nr. 1 (momsdirektivets art. 138).',
            'export' => 'Momsfri eksport til land uden for EU, jf. momslovens § 34.',
            'novat' => 'Virksomheden er ikke momsregistreret. Der er ikke beregnet moms.',
            'pay_title' => 'Betaling', 'pay_text' => 'Beløbet bedes indbetalt senest {d} med angivelse af fakturanr. {n}.',
            'bank' => 'Bank', 'reg' => 'Reg.nr.', 'acc' => 'Kontonr.', 'iban' => 'IBAN', 'bic' => 'BIC/SWIFT',
            'to' => 'Kunde', 'thanks' => 'Tak for din ordre!', 'credit_text' => 'Beløbet modregnes eller tilbagebetales.',
            'units' => ['stk' => 'stk.', 'timer' => 'timer', 'dage' => 'dage', 'm' => 'm', 'm2' => 'm²', 'kg' => 'kg', 'pakke' => 'pakke', 'md' => 'md.'],
        ],
        'de' => [
            'invoice' => 'Rechnung', 'credit' => 'Gutschrift (Kreditnota)', 'draft' => 'ENTWURF – keine gültige Rechnung',
            'number' => 'Rechnungsnr.', 'credit_number' => 'Gutschriftsnr.', 'date' => 'Rechnungsdatum', 'credit_date' => 'Datum',
            'delivery' => 'Lieferdatum', 'due' => 'Fällig am', 'customer_no' => 'Kundennr.', 'refers' => 'Korrektur zur Rechnung Nr. {n} vom {d}',
            'cvr' => 'CVR-Nr.', 'own_vat' => 'USt-IdNr.', 'vat_id' => 'USt-IdNr.', 'cust_cvr' => 'CVR-Nr.',
            'desc' => 'Beschreibung', 'qty' => 'Menge', 'unit' => 'Einheit', 'price' => 'Einzelpreis', 'disc' => 'Rabatt', 'disc_total' => 'Rabatt gesamt', 'amount' => 'Betrag',
            'net' => 'Zwischensumme netto', 'vat' => 'Moms (MwSt.) {p} %', 'vat0' => 'MwSt. 0 %', 'total' => 'Gesamtbetrag', 'total_credit' => 'Gutschrift gesamt',
            'incl_note' => 'Die Preise enthalten die dänische Moms (25 %).', 'vat_dkk' => 'Moms in DKK: {v} (Kurs {r} vom {d}, {s})',
            'rc_services' => 'Steuerschuldnerschaft des Leistungsempfängers – Omvendt betalingspligt (Reverse Charge, Art. 196 MwStSystRL).',
            'rc_goods' => 'Steuerfreie innergemeinschaftliche Lieferung – Momsfri levering til andet EU-land (Art. 138 MwStSystRL; § 34 Abs. 1 Nr. 1 dän. Momslov).',
            'export' => 'Steuerfreie Ausfuhrlieferung in ein Land außerhalb der EU.',
            'novat' => 'Das Unternehmen ist nicht für die Moms (MwSt.) registriert. Es wird keine Moms berechnet.',
            'pay_title' => 'Zahlung', 'pay_text' => 'Bitte überweisen Sie den Betrag bis {d} unter Angabe der Rechnungsnr. {n}.',
            'bank' => 'Bank', 'reg' => 'Reg.-Nr.', 'acc' => 'Konto-Nr.', 'iban' => 'IBAN', 'bic' => 'BIC/SWIFT',
            'to' => 'Kunde', 'thanks' => 'Vielen Dank für Ihren Auftrag!', 'credit_text' => 'Der Betrag wird verrechnet oder erstattet.',
            'units' => ['stk' => 'Stk.', 'timer' => 'Std.', 'dage' => 'Tage', 'm' => 'm', 'm2' => 'm²', 'kg' => 'kg', 'pakke' => 'Paket', 'md' => 'Mon.'],
        ],
        'en' => [
            'invoice' => 'Invoice', 'credit' => 'Credit note', 'draft' => 'DRAFT – not a valid invoice',
            'number' => 'Invoice no.', 'credit_number' => 'Credit note no.', 'date' => 'Invoice date', 'credit_date' => 'Date',
            'delivery' => 'Delivery date', 'due' => 'Due date', 'customer_no' => 'Customer no.', 'refers' => 'Credit for invoice no. {n} dated {d}',
            'cvr' => 'CVR no.', 'own_vat' => 'VAT no.', 'vat_id' => 'VAT no.', 'cust_cvr' => 'CVR no.',
            'desc' => 'Description', 'qty' => 'Qty', 'unit' => 'Unit', 'price' => 'Unit price', 'disc' => 'Discount', 'disc_total' => 'Total discount', 'amount' => 'Amount',
            'net' => 'Subtotal excl. VAT', 'vat' => 'VAT {p} %', 'vat0' => 'VAT 0 %', 'total' => 'Total', 'total_credit' => 'Total credited',
            'incl_note' => 'Prices include Danish VAT (25 %).', 'vat_dkk' => 'VAT amount in DKK: {v} (rate {r} as of {d}, {s})',
            'rc_services' => 'Reverse charge – Omvendt betalingspligt: VAT to be accounted for by the recipient (Art. 196 VAT Directive).',
            'rc_goods' => 'VAT-exempt intra-Community supply of goods – Momsfri levering til andet EU-land (Art. 138 VAT Directive).',
            'export' => 'VAT-exempt export outside the EU.',
            'novat' => 'The business is not VAT registered. No VAT has been charged.',
            'pay_title' => 'Payment', 'pay_text' => 'Please pay by {d} quoting invoice no. {n}.',
            'bank' => 'Bank', 'reg' => 'Reg. no.', 'acc' => 'Account no.', 'iban' => 'IBAN', 'bic' => 'BIC/SWIFT',
            'to' => 'Customer', 'thanks' => 'Thank you for your order!', 'credit_text' => 'The amount will be offset or refunded.',
            'units' => ['stk' => 'pcs', 'timer' => 'hours', 'dage' => 'days', 'm' => 'm', 'm2' => 'm²', 'kg' => 'kg', 'pakke' => 'pack', 'md' => 'months'],
        ],
    ];
    return $T[$lang] ?? $T['da'];
}

function wf_doc_money(int $cents, string $cur, string $lang): string
{
    $s = number_format(abs($cents) / 100, 2, $lang === 'en' ? '.' : ',', $lang === 'en' ? ',' : '.');
    return ($cents < 0 ? '-' : '') . $s . ' ' . $cur;
}
function wf_doc_date(?string $d, string $lang): string
{
    if (!$d) {
        return '';
    }
    [$y, $m, $dd] = explode('-', $d);
    return $lang === 'en' ? "$dd/$m/$y" : "$dd.$m.$y";
}
function wf_doc_num(float $v, string $lang): string
{
    $s = rtrim(rtrim(number_format($v, 3, $lang === 'en' ? '.' : ',', ''), '0'), '.,');
    return $s === '' ? '0' : $s;
}
