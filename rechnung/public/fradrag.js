/* Abzüge (Fradrag): Kategorien mit Moms- und Steueranteil, Sätze 2025/2026 und Übersicht aller Abzugsmöglichkeiten
   für kleine Firmen in Dänemark. Stand der Recherche: Oktober 2026 – keine Steuerberatung, mit dem revisor abstimmen. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fradrag = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Ausgaben-Kategorien. vat/tax = abziehbarer Anteil in Prozent; ein Text verweist auf eine eigene Angabe
     unter „Abzüge → Deine Angaben“ (z. B. Anteil Arbeitszimmer). info = kurzer Hinweis im Ausgaben-Formular. */
  const CATEGORIES = [
    { name: 'Material/Waren', vat: 100, tax: 100, group: 'Werkstatt & Maschinen', info: 'Garn, Stoffe, Holz, Rohlinge usw. – voll absetzbar.' },
    { name: 'Werkzeug/Maschinen', vat: 100, tax: 100, group: 'Werkstatt & Maschinen', info: 'Bis 36.000 kr. netto (2026) sofort absetzbar, darüber über Jahre abschreiben (max. 25 % pro Jahr).' },
    { name: 'Computer/IT', vat: 100, tax: 100, group: 'Büro & Kommunikation', info: 'PC, Bildschirm, Drucker. Bis 36.000 kr. netto (2026) sofort absetzbar; zusammengehörige Teile zählen zusammen.' },
    { name: 'Software/Abos', vat: 100, tax: 100, group: 'Büro & Kommunikation', info: 'Programme, Cloud, Webseite, Domain. Bei Anbietern aus dem Ausland ohne Moms: als EU-/Ausland-Einkauf markieren.' },
    { name: 'Büro', vat: 100, tax: 100, group: 'Büro & Kommunikation', info: 'Papier, Druckerpatronen, Porto, Büromöbel.' },
    { name: 'Telefon (nur Firma)', vat: 100, tax: 100, group: 'Büro & Kommunikation', info: 'Eigenes Firmenhandy bzw. eigener Vertrag nur für die Firma: Moms und Steuer voll.' },
    { name: 'Telefon/Internet (auch privat)', vat: 'phoneShare', tax: 100, group: 'Büro & Kommunikation', info: 'Gemischte Nutzung: nur der Firmenanteil der Moms ist abziehbar (Standard 50 %, unter Abzüge → Deine Angaben änderbar).' },
    { name: 'Miete Werkstatt/Büro', vat: 100, tax: 100, group: 'Werkstatt & Maschinen', info: 'Gemietete Räume nur für die Firma. Moms nur, wenn der Vermieter Moms berechnet.' },
    { name: 'Strom/Wasser/Heizung (Werkstatt mit eigenem Zähler)', vat: 100, tax: 100, group: 'Werkstatt & Maschinen', info: 'Mit eigenem Zähler (bimåler) für die Werkstatt: voll absetzbar. Zählerstände 1× im Jahr notieren.' },
    { name: 'Strom/Heizung Wohnung (Anteil Arbeitszimmer)', vat: 0, tax: 'homeOfficeShare', group: 'Büro & Kommunikation', info: 'Nur wenn ein Raum ausschließlich für die Firma genutzt wird – Anteil nach Fläche. Keine Moms. Streng geprüft!' },
    { name: 'Fahrzeug Transporter (gelbe Kennzeichen)', vat: 100, tax: 100, group: 'Fahrzeug', info: 'Varebil auf gelben Kennzeichen, nur für die Firma: Moms und Steuer voll (Kauf, Reparatur, Versicherung, Steuer).' },
    { name: 'Fahrzeug Pkw (weiße Kennzeichen)', vat: 0, tax: 'carShare', group: 'Fahrzeug', info: 'Personbil: nie Moms. Steuerlich nur der Firmenanteil laut Fahrtenbuch – oder statt Kosten das Kilometergeld nutzen.' },
    { name: 'Tanken/Laden Transporter', vat: 100, tax: 100, group: 'Fahrzeug', info: 'Diesel/Benzin/Strom für den Transporter auf gelben Kennzeichen: voll.' },
    { name: 'Tanken/Laden Pkw', vat: 0, tax: 'carShare', group: 'Fahrzeug', info: 'Pkw (weiße Kennzeichen): keine Moms. Wer Kilometergeld nutzt, bucht Tanken NICHT zusätzlich.' },
    { name: 'Parken/Brücke/Fähre', vat: 100, tax: 100, group: 'Fahrzeug', info: 'Geschäftlich. Moms nur beim Transporter auf gelben Kennzeichen abziehen – beim Pkw den Moms-Anteil auf 0 % setzen.' },
    { name: 'Werbung', vat: 100, tax: 100, group: 'Kunden & Werbung', info: 'Anzeigen, Flyer, Schilder, Messestand, Social-Media-Werbung – voll absetzbar.' },
    { name: 'Werbegeschenke (unter 100 kr. mit Logo)', vat: 100, tax: 100, group: 'Kunden & Werbung', info: 'Unter 100 kr. ohne Moms UND mit Firmenname/Logo, an mehrere Kunden: voll absetzbar.' },
    { name: 'Geschenke an Kunden', vat: 0, tax: 25, group: 'Kunden & Werbung', info: 'Andere Geschenke an Geschäftspartner sind Repräsentation: keine Moms, steuerlich nur 25 %.' },
    { name: 'Bewirtung (25 % abziehbar)', vat: 25, tax: 25, group: 'Kunden & Werbung', info: 'Restaurant/Essen mit Kunden: 25 % der Moms und 25 % der Kosten. Auf dem Beleg notieren: mit wem und warum.' },
    { name: 'Hotel (Geschäftsreise)', vat: 100, tax: 100, group: 'Reisen', info: 'Übernachtung auf Geschäftsreise: Moms voll (nur Übernachtung, Essen im Hotel = Bewirtung).' },
    { name: 'Reise (Zug, Bus, Flug)', vat: 100, tax: 100, group: 'Reisen', info: 'Fahrkarten haben meist keine Moms – dann einfach 0 als Moms-Betrag eintragen.' },
    { name: 'Kurse/Weiterbildung', vat: 100, tax: 100, group: 'Weiterbildung & Verbände', info: 'Kurse, die dein jetziges Geschäft betreffen (z. B. Sticken, CNC, Buchhaltung).' },
    { name: 'Fachliteratur/Zeitschriften', vat: 100, tax: 100, group: 'Weiterbildung & Verbände', info: 'Fachbücher, Fachzeitschriften, Vorlagen.' },
    { name: 'Mitgliedschaft Branchenverband', vat: 100, tax: 100, group: 'Weiterbildung & Verbände', info: 'Branchen- oder Arbeitgeberverband der Firma. (Gewerkschaft/A-kasse: privat in der Steuererklärung.)' },
    { name: 'Arbeitskleidung (Logo/Schutz)', vat: 100, tax: 100, group: 'Werkstatt & Maschinen', info: 'Nur Kleidung mit Firmenlogo oder Schutzkleidung – normale Kleidung ist privat.' },
    { name: 'Versand', vat: 100, tax: 100, group: 'Kunden & Werbung', info: 'Porto, Pakete, Verpackung.' },
    { name: 'Versicherung (Firma)', vat: 0, tax: 100, group: 'Versicherung & Beratung', info: 'Betriebs-, Haftpflicht-, Maschinenversicherung. Versicherungen haben keine Moms.' },
    { name: 'Revisor/Beratung', vat: 100, tax: 100, group: 'Versicherung & Beratung', info: 'Steuerberater, Anwalt, Buchhaltungsprogramm.' },
    { name: 'Bankgebühren', vat: 0, tax: 100, group: 'Versicherung & Beratung', info: 'Kontogebühren (Lunar), Kartengebühren, Zahlungsanbieter. Keine Moms.' },
    { name: 'Kilometergeld/Reisepauschalen', vat: 0, tax: 100, group: 'Fahrzeug', info: 'Auszahlung von Kilometergeld (laut Fahrtenbuch) bzw. Reisepauschalen an dich. Keine Moms.' },
    { name: 'Diverse', vat: 100, tax: 100, group: 'Sonstiges', info: '' },
  ];
  // frühere Namen weiterhin verstehen
  const ALIASES = { 'Telefon/Internet': 'Telefon/Internet (auch privat)', 'Fahrzeug/Benzin': 'Tanken/Laden Pkw', 'Strom/Wasser/Heizung': 'Strom/Wasser/Heizung (Werkstatt mit eigenem Zähler)', 'Miete': 'Miete Werkstatt/Büro', 'Versicherung': 'Versicherung (Firma)' };
  const byName = (n) => CATEGORIES.find((c) => c.name === n) || CATEGORIES.find((c) => c.name === ALIASES[n]) || CATEGORIES.find((c) => c.name === 'Diverse');

  // Standardwerte der eigenen Angaben
  const DEFAULTS = { legalForm: 'aps', homeOfficeShare: 0, phoneShare: 50, carShare: 0, taxRate: 22 };
  const pct = (v, s) => (typeof v === 'string' ? Math.max(0, Math.min(100, Number(s?.[v] ?? DEFAULTS[v]) || 0)) : v);
  function shares(category, settings) {
    const c = byName(category);
    return { vat: pct(c.vat, settings), tax: pct(c.tax, settings) };
  }

  /* Sätze je Jahr (Quellen siehe CATALOG) */
  const RATES = {
    2025: { kmLow: 3.81, kmHigh: 2.23, kmLimit: 20000, smallAsset: 34400, food: 597, lodging: 256, pension: 65500, union: 7000 },
    2026: { kmLow: 3.94, kmHigh: 2.28, kmLimit: 20000, smallAsset: 36000, food: 625, lodging: 268, pension: 68700, union: 7000 },
  };
  const rates = (year) => RATES[year] || RATES[Math.max(...Object.keys(RATES).map(Number).filter((y) => y <= year))] || RATES[2026];
  // Kilometergeld in Øre für die gefahrenen km eines Jahres
  function mileage(km, year) {
    const r = rates(year);
    const low = Math.min(km, r.kmLimit), high = Math.max(0, km - r.kmLimit);
    return Math.round((low * r.kmLow + high * r.kmHigh) * 100);
  }

  const SKAT = (p) => `https://skat.dk${p}`;
  /* Übersicht aller Abzugsmöglichkeiten. forms: für welche Rechtsform (enkelt = Einzelunternehmen, aps = ApS/IVS) */
  const CATALOG = [
    { id: 'material', group: 'Werkstatt & Maschinen', title: 'Material und Waren', dk: 'Varekøb', tax: '100 %', vat: '100 %', cats: ['Material/Waren'],
      how: 'Jeden Einkauf als Beleg fotografieren. Einkäufe aus anderen EU-Ländern ohne Moms als „EU-Einkauf“ markieren.' },
    { id: 'machines', group: 'Werkstatt & Maschinen', title: 'Maschinen und Werkzeug (Stickmaschine, Fräse, Werkzeug)', dk: 'Driftsmidler / småaktiver', tax: '100 % (bis 36.000 kr. sofort, sonst Abschreibung)', vat: '100 %', cats: ['Werkzeug/Maschinen', 'Computer/IT'],
      how: 'Bis 36.000 kr. ohne Moms (2026; 2025: 34.400 kr.) sofort absetzbar (straksafskrivning). Teurere Maschinen kommen in den Abschreibungs-„Topf“ (saldo) und werden mit bis zu 25 % pro Jahr abgesetzt – das macht der revisor im Jahresabschluss. Teile, die nur zusammen funktionieren, zählen zusammen.',
      sources: [{ label: 'Skattestyrelsen: Straksafskrivning (Juridisk vejledning)', url: 'https://info.skat.dk/data.aspx?oid=2060787' }, { label: 'Skatteministeriet: Satser Afskrivningsloven', url: 'https://svmn.dk/tal-og-metode/satser/satser-og-beloebsgraenser-i-lovgivningen/afskrivningsloven' }] },
    { id: 'workshop', group: 'Werkstatt & Maschinen', title: 'Werkstatt mit eigenem Stromzähler', dk: 'Bimåler / erhvervslokale', tax: '100 %', vat: '100 %', cats: ['Strom/Wasser/Heizung (Werkstatt mit eigenem Zähler)', 'Miete Werkstatt/Büro'],
      how: 'Am stärksten ist eine Werkstatt, die räumlich getrennt ist (eigener Eingang, z. B. Garage/Nebengebäude) und einen eigenen Zwischenzähler (bimåler) hat. Dann sind Strom, Heizung und Moms darauf voll absetzbar. Zählerstand am 1.1. und 31.12. fotografieren.',
      warn: 'Elafgift 2026 und 2027: Die Stromsteuer ist auf 0,8 Øre/kWh gesenkt. Eine Erstattung für Maschinenstrom (procesenergi) lohnt sich in diesen zwei Jahren kaum noch.',
      sources: [{ label: 'skat.dk: Lavere elafgift 2026 og 2027', url: SKAT('/erhverv/afgifter-paa-varer-og-ydelser-punktafgifter/nyhedsbrev-afgifter/midlertidig-nedsaettelse-af-elafgiften-i-2026-og-2027') }] },
    { id: 'homeoffice', group: 'Büro & Kommunikation', title: 'Arbeitszimmer / Werkstatt in der Wohnung', dk: 'Arbejdsværelse i hjemmet', tax: 'Anteil nach Fläche – nur unter strengen Bedingungen', vat: '0 %', cats: ['Strom/Heizung Wohnung (Anteil Arbeitszimmer)'], forms: ['enkelt'],
      how: 'Nur wenn der Raum ausschließlich für die Firma genutzt wird, als Arbeitsraum eingerichtet ist, getrennt von den Wohnräumen liegt (am besten eigener Eingang) und dein Hauptarbeitsplatz ist. Dann den Flächenanteil (z. B. 15 m² von 120 m² = 12,5 %) von Strom, Heizung, Wasser und Miete absetzen. Anteil unter „Deine Angaben“ eintragen.',
      warn: 'Skattestyrelsen erkennt das selten an – Beweislast liegt bei dir. Fotos vom Raum, Grundriss und Flächen aufheben. Bei ApS stattdessen eine Miete von der Firma an dich nur nach Absprache mit dem revisor.',
      sources: [{ label: 'Skattestyrelsen: Fradrag for arbejdsværelse', url: 'https://info.skat.dk/data.aspx?oid=2083512' }] },
    { id: 'it', group: 'Büro & Kommunikation', title: 'Computer, Software, Webseite', dk: 'IT-udstyr og software', tax: '100 %', vat: '100 %', cats: ['Computer/IT', 'Software/Abos'],
      how: 'PC, Bildschirm, Drucker, Programme, Cloud, Domain, Webhosting, Server. Ausländische Abos ohne Moms (z. B. aus den USA/Irland) als „EU-/Ausland-Einkauf Dienstleistung“ buchen – dann wird die Moms richtig in Rubrik A gemeldet und gleich wieder abgezogen.' },
    { id: 'phone', group: 'Büro & Kommunikation', title: 'Telefon und Internet', dk: 'Telefon og internet', tax: '100 % (Firmenanteil)', vat: '100 % nur Firma, sonst Firmenanteil (meist 50 %)', cats: ['Telefon (nur Firma)', 'Telefon/Internet (auch privat)'],
      how: 'Reines Firmenhandy/-abo: Moms und Kosten voll. Wird privat mitgenutzt: nur der Firmenanteil der Moms (Standard hier 50 %).',
      warn: 'Zahlt die ApS dein privat mitgenutztes Telefon, wird „fri telefon“ bei dir versteuert: 3.500 kr. im Jahr 2026.',
      sources: [{ label: 'Skattestyrelsen: Arbejdsværelse, kontorhold, telefon og computer', url: 'https://info.skat.dk/data.aspx?oid=2061773' }] },
    { id: 'office', group: 'Büro & Kommunikation', title: 'Büromaterial, Porto, Versand', dk: 'Kontorartikler, porto', tax: '100 %', vat: '100 %', cats: ['Büro', 'Versand'], how: 'Belege fotografieren – fertig.' },
    { id: 'van', group: 'Fahrzeug', title: 'Transporter auf gelben Kennzeichen', dk: 'Varebil på gule plader', tax: '100 %', vat: '100 %', cats: ['Fahrzeug Transporter (gelbe Kennzeichen)', 'Tanken/Laden Transporter'],
      how: 'Kauf, Leasing, Diesel/Strom, Reparatur, Versicherung, Parken: alles mit voller Moms und voll steuerlich absetzbar, wenn der Wagen nur für die Firma fährt.',
      warn: 'Private Fahrten mit dem Transporter sind grundsätzlich nicht erlaubt (Ausnahmen nur mit Genehmigung). Fahrtenbuch führen.',
      sources: [{ label: 'Übersicht Varebil/Firmenbil (clientflow)', url: 'https://clientflow.nu/da/hub/guides/varebil-og-koersel-i-opstarten' }] },
    { id: 'mileage', group: 'Fahrzeug', title: 'Privatauto für Firmenfahrten: Kilometergeld', dk: 'Kørselsgodtgørelse / kørselsfradrag', tax: '3,94 kr./km (bis 20.000 km), danach 2,28 kr./km (2026)', vat: '0 %', cats: [],
      how: 'Firmenfahrten mit dem privaten Auto unten im Fahrtenbuch eintragen (Datum, Ziel mit Adresse, Zweck, km). ApS: Die Firma zahlt dir das Kilometergeld steuerfrei aus (Überweisung + Fahrtenbuch als Beleg). Einzelunternehmen: Der Betrag ist eine Betriebsausgabe. Tankquittungen vom Privatauto dann NICHT zusätzlich buchen.',
      warn: 'Fahrten von zu Hause zur festen Werkstatt sind keine Firmenfahrten (dafür gibt es privat den kørselsfradrag ab 25 km).',
      sources: [{ label: 'Satser 2026 (Redmark)', url: 'https://redmark.dk/nyheder/skat/2026-satser-for-koerselsfradrag-og-skattefri-koerselsgodtgoerelse/' }, { label: 'Satser 2026 (Martinsen)', url: 'https://martinsen.dk/faglig-viden/skat/satser-for-skattefri-koerselsgodtgoerelse-2026/' }] },
    { id: 'car', group: 'Fahrzeug', title: 'Pkw (weiße Kennzeichen) in der Firma', dk: 'Personbil', tax: 'Firmenanteil laut Fahrtenbuch', vat: '0 %', cats: ['Fahrzeug Pkw (weiße Kennzeichen)', 'Tanken/Laden Pkw'],
      how: 'Für Pkw gibt es nie Moms-Abzug. Steuerlich entweder die echten Kosten × Firmenanteil (Anteil unter „Deine Angaben“) oder einfacher das Kilometergeld – nicht beides.',
      warn: 'Gehört ein Pkw der ApS und darfst du ihn privat nutzen, wird „fri bil“ teuer versteuert. Vorher mit dem revisor rechnen.' },
    { id: 'parking', group: 'Fahrzeug', title: 'Parken, Brücke, Fähre', dk: 'Parkering, bro, færge', tax: '100 % (geschäftlich)', vat: 'nur beim Transporter', cats: ['Parken/Brücke/Fähre'], how: 'Geschäftliche Fahrten. Beim Pkw den Moms-Anteil auf 0 % setzen.' },
    { id: 'ads', group: 'Kunden & Werbung', title: 'Werbung und Marketing', dk: 'Reklame', tax: '100 %', vat: '100 %', cats: ['Werbung'], how: 'Anzeigen (Facebook, Google), Flyer, Visitenkarten, Schilder, Autobeschriftung, Messen, Muster für Kunden.' },
    { id: 'gifts', group: 'Kunden & Werbung', title: 'Werbegeschenke und Geschenke an Kunden', dk: 'Reklamegaver / repræsentationsgaver', tax: 'unter 100 kr. mit Logo: 100 %, sonst 25 %', vat: 'unter 100 kr. mit Logo: 100 %, sonst 0 %', cats: ['Werbegeschenke (unter 100 kr. mit Logo)', 'Geschenke an Kunden'],
      how: 'Kleine Werbegeschenke (unter 100 kr. ohne Moms, mit Firmenname/Logo, an mehrere Kunden – z. B. bestickte Kappen als Probe) sind Werbung. Alles andere (Wein, Pralinen, Geschenkkörbe) ist Repräsentation.',
      sources: [{ label: 'Billy: Gaver til forretningsforbindelser', url: 'https://www.billy.dk/support/article/gaver-forretningsforbindelser/' }] },
    { id: 'meals', group: 'Kunden & Werbung', title: 'Bewirtung von Kunden', dk: 'Repræsentation', tax: '25 %', vat: '25 %', cats: ['Bewirtung (25 % abziehbar)'],
      how: 'Essen/Getränke mit Kunden oder Geschäftspartnern. Auf dem Beleg notieren, mit wem und warum. Essen nur für dich allein im Alltag ist privat.',
      sources: [{ label: 'Juridisk vejledning: Repræsentation (LL § 8, stk. 4)', url: 'https://tax.dk/jv-2025-1/cc/C_C_2_2_2_5_4.htm' }] },
    { id: 'travel', group: 'Reisen', title: 'Geschäftsreisen (Hotel, Fahrkarten, Verpflegung)', dk: 'Rejseudgifter', tax: '100 %', vat: 'Hotel 100 %, Essen 25 %, Fahrkarten meist ohne Moms', cats: ['Hotel (Geschäftsreise)', 'Reise (Zug, Bus, Flug)'],
      how: 'Messen, Lieferanten- oder Kundenbesuche mit Übernachtung. ApS: Die Firma kann dir für Reisen mit Übernachtung steuerfreie Pauschalen zahlen: 625 kr. pro Tag für Verpflegung und 268 kr. pro Nacht für Unterkunft (2026), mit Reiseabrechnung.',
      sources: [{ label: 'Skattestyrelsen: Skattefri rejsegodtgørelse 2026', url: 'https://info.skat.dk/data.aspx?oid=2460063' }] },
    { id: 'courses', group: 'Weiterbildung & Verbände', title: 'Kurse, Fachbücher, Branchenverband', dk: 'Kurser, faglitteratur, kontingenter', tax: '100 % (für das jetzige Geschäft)', vat: '100 %', cats: ['Kurse/Weiterbildung', 'Fachliteratur/Zeitschriften', 'Mitgliedschaft Branchenverband'],
      how: 'Weiterbildung, die dein bestehendes Geschäft betrifft (Sticken, CNC, Buchhaltung, Marketing). Eine Ausbildung für einen ganz neuen Beruf ist privat.' },
    { id: 'clothes', group: 'Werkstatt & Maschinen', title: 'Arbeitskleidung', dk: 'Arbejdstøj', tax: '100 %', vat: '100 %', cats: ['Arbeitskleidung (Logo/Schutz)'], how: 'Nur mit deutlichem Firmenlogo oder echte Schutzkleidung (Sicherheitsschuhe, Gehörschutz, Schutzbrille an der Fräse).' },
    { id: 'insurance', group: 'Versicherung & Beratung', title: 'Versicherungen, revisor, Bank', dk: 'Forsikring, revisor, gebyrer', tax: '100 %', vat: 'Versicherung/Bank 0 %, revisor 100 %', cats: ['Versicherung (Firma)', 'Revisor/Beratung', 'Bankgebühren'], how: 'Betriebshaftpflicht, Maschinenversicherung, Steuerberatung, Buchhaltungsprogramm, Lunar-Gebühren, Kartengebühren.' },
    { id: 'pension', group: 'Privat in der Steuererklärung', title: 'Ratepension (Altersvorsorge)', dk: 'Ratepension', tax: 'bis 68.700 kr. im Jahr 2026 (2025: 65.500 kr.)', vat: '–', cats: [], private: true,
      how: 'Einzahlungen in eine Ratepension senken dein steuerpflichtiges Einkommen. Selbstständige können zusätzlich bis 30 % des Gewinns einzahlen. Dazu kommt ein Extra-Pensionsabzug (12 % bzw. 32 % auf bis zu 87.800 kr.).',
      sources: [{ label: 'skat.dk: Fradrag for indbetalinger til pension 2026', url: SKAT('/borger/pension-og-efterloen/fradrag-for-indbetalinger-til-pension') }] },
    { id: 'union', group: 'Privat in der Steuererklärung', title: 'A-kasse und Gewerkschaft', dk: 'A-kasse og fagforening', tax: 'A-kasse voll, Gewerkschaft bis 7.000 kr.', vat: '–', cats: [], private: true,
      how: 'Wird meist automatisch an SKAT gemeldet. In der Forskudsopgørelse prüfen (Felder 439 und 458).',
      sources: [{ label: 'skat.dk: A-kasse og fagforening', url: SKAT('/borger/unge-og-studerende/a-kasse/a-kasse-eller-fagforening') }] },
    { id: 'commute', group: 'Privat in der Steuererklärung', title: 'Weg zur festen Werkstatt (über 24 km pro Strecke)', dk: 'Kørselsfradrag (befordringsfradrag)', tax: 'ab 25 km pro Tag hin und zurück', vat: '–', cats: [], private: true,
      how: 'Liegt die feste Werkstatt weit weg von zu Hause, gibt es den normalen Pendlerabzug in der Steuererklärung.',
      sources: [{ label: 'skat.dk: Beregn dit kørselsfradrag', url: SKAT('/borger/fradrag/koerselsfradrag/beregn-dit-koerselsfradrag') }] },
    { id: 'structure', group: 'Privat in der Steuererklärung', title: 'Steuer sparen über die Unternehmensform', dk: 'Virksomhedsordningen / ApS', tax: 'je nach Gewinn', vat: '–', cats: [], private: true,
      how: 'Einzelunternehmen können die Virksomhedsordning nutzen (Gewinn in der Firma lassen, niedriger besteuert). Bei einer ApS: Gehalt und Dividende geschickt aufteilen. Das lohnt sich ab einem gewissen Gewinn – einmal im Jahr mit dem revisor durchrechnen.' },
  ];

  const LEGAL_FORMS = { enkelt: 'Einzelunternehmen (Enkeltmandsvirksomhed)', aps: 'ApS / Kapitalgesellschaft', is: 'I/S (Personengesellschaft)' };

  return { CATEGORIES, ALIASES, byName, DEFAULTS, shares, RATES, rates, mileage, CATALOG, LEGAL_FORMS, names: CATEGORIES.map((c) => c.name) };
});
