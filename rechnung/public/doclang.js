/* Texte für die Rechnungsausgabe – Sprache kommt vom Kunden (de, da, en). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DocLang = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const T = {
    de: {
      colorLabel: 'Farbe', sizeLabel: 'Größe',
      order: 'Auftragsbestätigung', orderNumber: 'Auftragsnummer', orderDate: 'Datum', delivery: 'Liefertermin', validUntil: 'Gültig bis',
      orderIntro: 'Vielen Dank für Ihren Auftrag. Wir bestätigen ihn wie folgt:', orderTerms: 'Zahlungsbedingungen: zahlbar innerhalb von {days} Tagen nach Rechnungsstellung.',
      sigLine: 'Datum, Unterschrift Kunde', signedBy: 'Elektronisch unterschrieben von {name} am {date}', customerComment: 'Anmerkung des Kunden',
      signTitle: 'Auftrag bestätigen', signName: 'Ihr Name', signHere: 'Hier unterschreiben (mit dem Finger oder der Maus)', signClear: 'Löschen',
      signAccept: 'Ich bestätige diesen Auftrag verbindlich.', signComment: 'Anmerkung (optional)', signButton: 'Verbindlich unterschreiben',
      signDone: 'Vielen Dank! Der Auftrag ist unterschrieben. Sie können diese Seite drucken oder als PDF speichern.', signMissing: 'Bitte Namen eingeben, unterschreiben und bestätigen.',
      print: 'Drucken / PDF', signExpired: 'Dieses Angebot ist abgelaufen. Bitte kontaktieren Sie uns.', signAlready: 'Dieser Auftrag wurde bereits unterschrieben.',  notFound: 'Dieser Link ist ungültig oder nicht mehr aktiv.',
      orderMailSubject: 'Auftragsbestätigung {number} von {company} – bitte unterschreiben',
      orderMailBody: 'Guten Tag,\n\nvielen Dank für Ihren Auftrag. Bitte prüfen und unterschreiben Sie die Auftragsbestätigung Nr. {number} über {total} hier:\n{link}\n\nMit freundlichen Grüßen\n{company}',
      locale: 'de-DE', invoice: 'Rechnung', credit: 'Gutschrift', number: 'Rechnungsnummer', creditNumber: 'Gutschriftnummer',
      date: 'Rechnungsdatum', due: 'Fällig am', customerNo: 'Kundennummer', yourVat: 'Ihre USt-IdNr.', ourVat: 'CVR-Nr.',
      desc: 'Beschreibung', qty: 'Menge', unit: 'Einheit', price: 'Einzelpreis', discount: 'Rabatt', amount: 'Betrag',
      net: 'Zwischensumme (netto)', vat: 'MwSt.', total: 'Gesamtbetrag', vatInDKK: 'MwSt. in DKK (Kurs {rate})',
      payment: 'Zahlung', payText: 'Bitte überweisen Sie {total} bis zum {due} unter Angabe der Rechnungsnummer {number}.',
      creditText: 'Der Betrag wird Ihnen gutgeschrieben.', refersTo: 'Bezieht sich auf Rechnung Nr. {number}',
      bank: 'Bank', regKonto: 'Reg.-Nr./Konto', iban: 'IBAN', bic: 'BIC/SWIFT', fik: 'FI-Zahlung',
      rcServices: 'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge) gemäß Art. 196 MwStSystRL.',
      rcGoods: 'Steuerfreie innergemeinschaftliche Lieferung gemäß Art. 138 MwStSystRL.',
      export: 'Steuerfreie Ausfuhr / Leistung außerhalb der EU – keine dänische MwSt.',
      vatFree: 'MwSt.-frei', page: 'Seite', thanks: 'Vielen Dank für Ihren Auftrag!',
      mailSubject: '{doc} {number} von {company}',
      mailBody: 'Guten Tag,\n\nanbei erhalten Sie unsere {doc} Nr. {number} über {total}, fällig am {due}.\n\nMit freundlichen Grüßen\n{company}',
      reminder: 'Zahlungserinnerung', reminderText: 'Wir möchten Sie freundlich daran erinnern, dass die Rechnung Nr. {number} über {total} am {due} fällig war. Sollten Sie bereits bezahlt haben, betrachten Sie dieses Schreiben bitte als gegenstandslos.',
      units: { stk: 'Stk.', timer: 'Std.', dage: 'Tage', m: 'm', m2: 'm²', kg: 'kg', pakke: 'Paket', md: 'Monat', '': '' },
    },
    da: {
      colorLabel: 'Farve', sizeLabel: 'Størrelse',
      order: 'Ordrebekræftelse', orderNumber: 'Ordrenr.', orderDate: 'Dato', delivery: 'Leveringsdato', validUntil: 'Gyldig til',
      orderIntro: 'Tak for jeres ordre. Vi bekræfter den som følger:', orderTerms: 'Betalingsbetingelser: netto {days} dage efter fakturering.',
      sigLine: 'Dato, kundens underskrift', signedBy: 'Underskrevet elektronisk af {name} den {date}', customerComment: 'Kundens bemærkning',
      signTitle: 'Bekræft ordren', signName: 'Dit navn', signHere: 'Underskriv her (med fingeren eller musen)', signClear: 'Ryd',
      signAccept: 'Jeg bekræfter denne ordre som bindende.', signComment: 'Bemærkning (valgfri)', signButton: 'Underskriv bindende',
      signDone: 'Tak! Ordren er underskrevet. Du kan udskrive siden eller gemme den som PDF.', signMissing: 'Udfyld venligst navn, underskriv og bekræft.',
      print: 'Udskriv / PDF', signExpired: 'Tilbuddet er udløbet. Kontakt os venligst.', signAlready: 'Ordren er allerede underskrevet.',  notFound: 'Linket er ugyldigt eller ikke længere aktivt.',
      orderMailSubject: 'Ordrebekræftelse {number} fra {company} – underskriv venligst',
      orderMailBody: 'Hej,\n\nTak for jeres ordre. Gennemse og underskriv venligst ordrebekræftelse nr. {number} på {total} her:\n{link}\n\nMed venlig hilsen\n{company}',
      locale: 'da-DK', invoice: 'Faktura', credit: 'Kreditnota', number: 'Fakturanr.', creditNumber: 'Kreditnotanr.',
      date: 'Fakturadato', due: 'Forfaldsdato', customerNo: 'Kundenr.', yourVat: 'Jeres momsnr.', ourVat: 'CVR-nr.',
      desc: 'Beskrivelse', qty: 'Antal', unit: 'Enhed', price: 'Enhedspris', discount: 'Rabat', amount: 'Beløb',
      net: 'Subtotal (ekskl. moms)', vat: 'Moms', total: 'Total', vatInDKK: 'Moms i DKK (kurs {rate})',
      payment: 'Betaling', payText: 'Beløbet {total} bedes indbetalt senest {due}. Angiv venligst fakturanr. {number}.',
      creditText: 'Beløbet krediteres jeres konto.', refersTo: 'Vedrører faktura nr. {number}',
      bank: 'Bank', regKonto: 'Reg.nr./konto', iban: 'IBAN', bic: 'BIC/SWIFT', fik: 'FI-betaling',
      rcServices: 'Omvendt betalingspligt (reverse charge), jf. momssystemdirektivets art. 196.',
      rcGoods: 'Momsfri levering af varer til andet EU-land, jf. momssystemdirektivets art. 138.',
      export: 'Momsfri eksport / ydelse uden for EU.',
      vatFree: 'Momsfri', page: 'Side', thanks: 'Tak for handlen!',
      mailSubject: '{doc} {number} fra {company}',
      mailBody: 'Hej,\n\nHermed fremsendes {doc} nr. {number} på {total} med forfald {due}.\n\nMed venlig hilsen\n{company}',
      reminder: 'Betalingspåmindelse', reminderText: 'Vi skal venligst minde om, at faktura nr. {number} på {total} forfaldt til betaling {due}. Hvis I allerede har betalt, bedes I se bort fra denne påmindelse.',
      units: { stk: 'stk.', timer: 'timer', dage: 'dage', m: 'm', m2: 'm²', kg: 'kg', pakke: 'pakke', md: 'md.', '': '' },
    },
    en: {
      colorLabel: 'Colour', sizeLabel: 'Size',
      order: 'Order confirmation', orderNumber: 'Order no.', orderDate: 'Date', delivery: 'Delivery date', validUntil: 'Valid until',
      orderIntro: 'Thank you for your order. We confirm it as follows:', orderTerms: 'Payment terms: payable within {days} days of invoicing.',
      sigLine: 'Date, customer signature', signedBy: 'Signed electronically by {name} on {date}', customerComment: 'Customer comment',
      signTitle: 'Confirm the order', signName: 'Your name', signHere: 'Sign here (with your finger or mouse)', signClear: 'Clear',
      signAccept: 'I confirm this order as binding.', signComment: 'Comment (optional)', signButton: 'Sign and confirm',
      signDone: 'Thank you! The order has been signed. You can print this page or save it as PDF.', signMissing: 'Please enter your name, sign and confirm.',
      print: 'Print / PDF', signExpired: 'This offer has expired. Please contact us.', signAlready: 'This order has already been signed.',  notFound: 'This link is invalid or no longer active.',
      orderMailSubject: 'Order confirmation {number} from {company} – please sign',
      orderMailBody: 'Dear customer,\n\nThank you for your order. Please review and sign order confirmation no. {number} for {total} here:\n{link}\n\nKind regards\n{company}',
      locale: 'en-GB', invoice: 'Invoice', credit: 'Credit note', number: 'Invoice no.', creditNumber: 'Credit note no.',
      date: 'Invoice date', due: 'Due date', customerNo: 'Customer no.', yourVat: 'Your VAT no.', ourVat: 'VAT/CVR no.',
      desc: 'Description', qty: 'Qty', unit: 'Unit', price: 'Unit price', discount: 'Discount', amount: 'Amount',
      net: 'Subtotal (excl. VAT)', vat: 'VAT', total: 'Total', vatInDKK: 'VAT in DKK (rate {rate})',
      payment: 'Payment', payText: 'Please pay {total} by {due}, quoting invoice no. {number}.',
      creditText: 'The amount will be credited to your account.', refersTo: 'Relates to invoice no. {number}',
      bank: 'Bank', regKonto: 'Sort code/account', iban: 'IBAN', bic: 'BIC/SWIFT', fik: 'FI payment',
      rcServices: 'Reverse charge – Article 196 of Council Directive 2006/112/EC.',
      rcGoods: 'VAT-exempt intra-Community supply of goods – Article 138 of Council Directive 2006/112/EC.',
      export: 'VAT-exempt export / supply outside the EU.',
      vatFree: 'VAT exempt', page: 'Page', thanks: 'Thank you for your business!',
      mailSubject: '{doc} {number} from {company}',
      mailBody: 'Dear customer,\n\nPlease find attached our {doc} no. {number} for {total}, due on {due}.\n\nKind regards\n{company}',
      reminder: 'Payment reminder', reminderText: 'This is a friendly reminder that invoice no. {number} for {total} was due on {due}. If you have already paid, please disregard this reminder.',
      units: { stk: 'pcs', timer: 'hrs', dage: 'days', m: 'm', m2: 'm²', kg: 'kg', pakke: 'pack', md: 'month', '': '' },
    },
  };
  const COUNTRIES = {
    DK: { de: 'Dänemark', da: 'Danmark', en: 'Denmark' }, DE: { de: 'Deutschland', da: 'Tyskland', en: 'Germany' },
    SE: { de: 'Schweden', da: 'Sverige', en: 'Sweden' }, NO: { de: 'Norwegen', da: 'Norge', en: 'Norway' },
    NL: { de: 'Niederlande', da: 'Holland', en: 'Netherlands' }, AT: { de: 'Österreich', da: 'Østrig', en: 'Austria' },
    CH: { de: 'Schweiz', da: 'Schweiz', en: 'Switzerland' }, GB: { de: 'Großbritannien', da: 'Storbritannien', en: 'United Kingdom' },
    PL: { de: 'Polen', da: 'Polen', en: 'Poland' }, FR: { de: 'Frankreich', da: 'Frankrig', en: 'France' },
    BE: { de: 'Belgien', da: 'Belgien', en: 'Belgium' }, FI: { de: 'Finnland', da: 'Finland', en: 'Finland' },
    IT: { de: 'Italien', da: 'Italien', en: 'Italy' }, ES: { de: 'Spanien', da: 'Spanien', en: 'Spain' },
    US: { de: 'USA', da: 'USA', en: 'USA' },
  };
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
  const get = (lang) => T[lang] || T.da;
  const country = (code, lang) => COUNTRIES[code]?.[lang] || code;
  function money(cents, currency, lang) {
    return new Intl.NumberFormat(get(lang).locale, { style: 'currency', currency: currency || 'DKK' }).format((cents || 0) / 100);
  }
  function date(iso, lang) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return lang === 'en' ? `${d}/${m}/${y}` : `${d}.${m}.${y}`;
  }
  return { T, COUNTRIES, get, fill, country, money, date };
});
