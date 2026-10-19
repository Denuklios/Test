/* Erklärhilfe: dänische Begriffe in der Oberfläche bekommen eine deutsche Übersetzung mit Erklärung
   (Maus darüber halten, auf dem Handy antippen). Gilt nur im Programm, nicht für Kunden und nicht im Ausdruck. */
(function () {
  'use strict';
  const G = {
    // Moms und SKAT
    'Moms': 'Dänische Mehrwertsteuer (MwSt.), normalerweise 25 %',
    'moms': 'Dänische Mehrwertsteuer (MwSt.), normalerweise 25 %',
    'Salgsmoms': 'Umsatzsteuer: die Moms auf deine Verkäufe, die du an SKAT abführst',
    'Købsmoms': 'Vorsteuer: die Moms auf deine Einkäufe, die du von der Zahllast abziehen darfst',
    'Momstilsvar': 'Zahllast: Salgsmoms minus Købsmoms. Diesen Betrag zahlst du an SKAT (oder bekommst ihn zurück, wenn er negativ ist)',
    'Momsangivelse': 'Umsatzsteuer-Voranmeldung: die Moms-Meldung für eine Periode',
    'Momsindberetning': 'Moms-Meldung an SKAT (Menüpunkt in TastSelv Erhverv)',
    'Indberet moms': '„Moms melden“ – Menüpunkt in TastSelv Erhverv',
    'Nulindberet': 'Nullmeldung: wenn es in der Periode keine Umsätze gab',
    'Godkend': '„Genehmigen“ – damit schickst du die Meldung endgültig ab',
    'Momsperiode': 'Abrechnungszeitraum für die Moms (Halbjahr, Quartal oder Monat)',
    'TastSelv Erhverv': 'Online-Portal von SKAT für Firmen (ähnlich wie ELSTER in Deutschland)',
    'TastSelv-Kode': 'Altes Passwort für TastSelv – damit kann man keine Moms melden, nur mit MitID',
    'SKAT': 'Dänische Steuerbehörde (offiziell: Skattestyrelsen)',
    'Skattestyrelsen': 'Dänische Steuerbehörde',
    'Skattekonto': 'Steuerkonto deiner Firma bei SKAT – dorthin zahlst du den Momstilsvar',
    'Rubrik A – varer': 'Feld A Waren: Wert der Wareneinkäufe aus anderen EU-Ländern ohne Moms (innergemeinschaftlicher Erwerb)',
    'Rubrik A – ydelser': 'Feld A Dienstleistungen: Wert der Dienstleistungen, die du aus anderen EU-Ländern ohne Moms eingekauft hast',
    'Rubrik B – varer (indberettes til EU-salg uden moms)': 'Feld B Waren: steuerfreie Warenlieferungen an Firmen in anderen EU-Ländern – werden auch in der Zusammenfassenden Meldung (EU-salg uden moms) gemeldet',
    'Rubrik B – varer (indberettes ikke til EU-salg uden moms)': 'Feld B Waren ohne Zusammenfassende Meldung, z. B. Montage/Installation in einem anderen EU-Land',
    'Rubrik B – ydelser': 'Feld B Dienstleistungen: Leistungen an Firmen in anderen EU-Ländern (Reverse Charge)',
    'Rubrik A': 'Feld A: Einkäufe aus anderen EU-Ländern ohne Moms',
    'Rubrik B': 'Feld B: Verkäufe an Firmen in anderen EU-Ländern ohne Moms',
    'Rubrik C': 'Feld C: sonstige Verkäufe ohne dänische Moms, z. B. Export außerhalb der EU',
    'Moms af varekøb i udlandet (både EU og lande uden for EU)': 'Moms auf Wareneinkäufe aus dem Ausland (EU und Nicht-EU) – die Erwerbsmoms, die du selbst berechnest und gleichzeitig als Købsmoms abziehst',
    'Moms af ydelseskøb i udlandet med omvendt betalingspligt': 'Moms auf Dienstleistungen aus dem Ausland mit Reverse Charge – selbst berechnet und gleichzeitig als Købsmoms abziehbar',
    'EU-salg uden moms': 'Zusammenfassende Meldung (ZM): Liste deiner Verkäufe an Firmen in anderen EU-Ländern',
    'Listesystemet': 'Meldesystem von SKAT für „EU-salg uden moms“ (Zusammenfassende Meldung)',
    'omvendt betalingspligt': 'Reverse Charge: nicht du, sondern der Kunde schuldet die Mehrwertsteuer',
    'Omvendt betalingspligt': 'Reverse Charge: nicht du, sondern der Kunde schuldet die Mehrwertsteuer',
    'NemVirksomhed': 'Schnittstelle von SKAT, über die zugelassene Buchhaltungsprogramme die Moms-Meldung vorbereiten dürfen',
    'ML § 13': 'Momsloven § 13: Paragraf im dänischen Moms-Gesetz über steuerbefreite Leistungen (z. B. Gesundheit, Unterricht)',
    // Firma, Register, Gesetz
    'CVR': 'Dänische Firmennummer (8 Ziffern) aus dem zentralen Unternehmensregister – gleichzeitig die Moms-Nummer',
    'CVR-Nr.': 'Dänische Firmennummer (8 Ziffern) aus dem zentralen Unternehmensregister – gleichzeitig die Moms-Nummer',
    'CVR-nr.': 'Dänische Firmennummer (8 Ziffern) aus dem zentralen Unternehmensregister – gleichzeitig die Moms-Nummer',
    'Momsart': 'Art der Moms auf der Rechnung (25 %, Reverse Charge oder Export)',
    'CVR-Register': 'Zentrales dänisches Unternehmensregister (wie das Handelsregister)',
    'Erhvervsstyrelsen': 'Dänische Unternehmensbehörde – führt das CVR-Register',
    'System-til-system adgang til CVR-data': '„System-zu-System-Zugang zu CVR-Daten“ – kostenloser direkter Datenzugang zum CVR-Register für Programme',
    'Bogføringsloven': 'Dänisches Buchführungsgesetz (Aufbewahrung 5 Jahre, digitale Buchführung)',
    'revisor': 'Steuerberater / Wirtschaftsprüfer',
    'MitID': 'Dänische digitale Identität zum Einloggen bei Behörden und Banken',
    'MitID Erhverv': 'MitID für Firmen – Login für Mitarbeiter und Inhaber im Namen der Firma',
    'Nationalbanken': 'Danmarks Nationalbank – die dänische Zentralbank (offizielle Wechselkurse)',
    // Bank und Zahlung
    'Reg.-Nr.': 'Registreringsnummer: 4-stellige Bankleitzahl der dänischen Bankfiliale',
    'FI-Kreditornummer': 'Nummer für dänische Zahlungsformulare (FI-Kort / +71), bekommst du von deiner Bank',
    'EAN-Nr.': 'Nummer für elektronische Rechnungen an dänische Behörden und öffentliche Stellen',
    'Dankort': 'Dänische Debitkarte',
    'MobilePay': 'Dänische Bezahl-App fürs Handy',
    'Øre': '1/100 dänische Krone (wie Cent)',
    // Abzüge
    'straksafskrivning': 'Sofortabschreibung: Anschaffungen bis 36.000 kr. netto (2026) sofort als Ausgabe absetzen',
    'saldo': 'Abschreibungs-„Topf“ für teure Maschinen: jedes Jahr bis zu 25 % des Restwerts absetzbar',
    'bimåler': 'Zwischenzähler: eigener Stromzähler nur für die Werkstatt',
    'procesenergi': 'Strom für Maschinen in der Produktion (nicht für Licht/Heizung) – dafür gab es eine Erstattung der Stromsteuer',
    'Elafgift': 'Dänische Stromsteuer – 2026 und 2027 auf 0,8 Øre/kWh gesenkt',
    'fri telefon': 'Wenn die Firma dein privat mitgenutztes Telefon bezahlt, wird ein fester Betrag versteuert (3.500 kr. im Jahr 2026)',
    'fri bil': 'Privatnutzung eines Firmen-Pkw – wird hoch versteuert',
    'Selskabsskat': 'Körperschaftsteuer der ApS: 22 %',
    'Virksomhedsordning': 'Steuermodell für Einzelunternehmen: Gewinn in der Firma lassen und niedriger versteuern',
    'Virksomhedsordningen': 'Steuermodell für Einzelunternehmen: Gewinn in der Firma lassen und niedriger versteuern',
    'Ratepension': 'Altersvorsorge mit Steuerabzug (2026 bis 68.700 kr. im Jahr)',
    'A-kasse': 'Arbeitslosenkasse – Beitrag voll in der Steuererklärung absetzbar',
    'kørselsfradrag': 'Pendlerpauschale in der privaten Steuererklärung (Weg zur festen Arbeitsstätte ab 25 km)',
    'Forskudsopgørelse': 'Vorläufige Steuerberechnung bei SKAT für das laufende Jahr – dort trägt man erwartete Abzüge ein',
    'Enkeltmandsvirksomhed': 'Einzelunternehmen',
    'ApS': 'Anpartsselskab – dänische GmbH',
    // Dokumente
    'Kvittering': 'Quittung / Kassenbon',
    'Kvitteringer': 'Quittungen / Kassenbons',
    'Faktura': 'Rechnung',
    'Kreditnota': 'Gutschrift',
    'Ordrebekræftelse': 'Auftragsbestätigung',
    'Forfaldsdato': 'Fälligkeitsdatum',
    'Betalingsbetingelser': 'Zahlungsbedingungen',
  };

  // Beschriftungen der dänischen Dokumente automatisch aus den Rechnungstexten übernehmen (z. B. „Fakturanr.“ → „Rechnungsnummer“)
  if (window.DocLang) {
    const da = DocLang.T.da, de = DocLang.T.de;
    for (const k of Object.keys(da)) {
      const v = da[k], d = de[k];
      if (typeof v === 'string' && typeof d === 'string' && v !== d && v.length <= 40 && !v.includes('{') && !G[v]) G[v] = d;
    }
  }

  const terms = Object.keys(G).sort((a, b) => b.length - a.length);
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = `(?<![\\p{L}\\d])(${terms.map(escRe).join('|')})(?![\\p{L}\\d])`;
  const test = new RegExp(pattern, 'u');
  const SKIP = 'script,style,textarea,select,option,input,abbr,.no-dk,code';

  function explain(root) {
    if (!root) return;
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && !n.parentElement.closest(SKIP) && test.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const parts = n.nodeValue.split(new RegExp(pattern, 'u'));
      const frag = document.createDocumentFragment();
      parts.forEach((p, i) => {
        if (!p) return;
        if (i % 2 === 1) {
          const a = document.createElement('abbr');
          a.className = 'dk';
          a.title = G[p];
          a.textContent = p;
          frag.appendChild(a);
        } else frag.appendChild(document.createTextNode(p));
      });
      n.replaceWith(frag);
    }
  }

  // automatisch nach jeder Änderung der Seite bzw. eines Fensters
  let busy = false;
  const run = () => {
    if (busy) return;
    busy = true;
    requestAnimationFrame(() => {
      obs.disconnect();
      explain(document.getElementById('main'));
      explain(document.getElementById('modal-body'));
      watch();
      busy = false;
    });
  };
  const obs = new MutationObserver(run);
  const watch = () => {
    for (const id of ['main', 'modal-body']) { const el = document.getElementById(id); if (el) obs.observe(el, { childList: true, subtree: true }); }
  };
  document.addEventListener('DOMContentLoaded', () => { watch(); run(); });
  if (document.readyState !== 'loading') { watch(); run(); }

  // Handy: Antippen zeigt die Erklärung (dort gibt es kein „Maus darüber“)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('abbr.dk');
    if (!a || !window.matchMedia('(hover: none)').matches) return;
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = `${a.textContent}: ${a.title}`;
    t.className = 'toast';
    clearTimeout(t._dk); t._dk = setTimeout(() => t.classList.add('hidden'), 5000);
  });

  window.DkHelp = { explain, glossary: G };
})();
