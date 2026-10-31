/* Erkennungslogik: Beträge, Datumsangaben, Kassenbons, Kontoauszüge, Fixkosten.
   Läuft im Browser (global "P") und in Node (für Tests). */
(function (root) {
  'use strict';

  // ---------- Grundlagen ----------

  const AMOUNT_RE = /([+-]?)\s*(?:€|eur|dkk|kr\.?)?\s*(\d{1,3}(?:[.\s']\d{3})+|\d+)([.,]\d{2})(?!\d)\s*(-|€|eur|dkk|kr\.?|[ABCDE*]{1,2}\b|s\b|h\b)?/gi;

  /** "1.234,56" / "-12,30" / "12,30-" / "1,234.56" / "€ 9,99" -> Zahl (oder null) */
  function parseAmount(str) {
    if (str == null) return null;
    let s = String(str).trim();
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/€|eur|dkk|kr\.?|sek|chf|\s/gi, '');
    if (/^-/.test(s) || /-$/.test(s) || /^−/.test(s)) neg = true;
    s = s.replace(/^[+\-−]|[+\-−]$/g, '');
    if (/[sS]$/.test(s)) { neg = true; s = s.slice(0, -1); }
    if (/[hH]$/.test(s)) s = s.slice(0, -1);
    if (!/^[\d.,']+$/.test(s)) return null;
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    let dec = null;
    if (lastComma > -1 && lastDot > -1) dec = lastComma > lastDot ? ',' : '.';
    else if (lastComma > -1) dec = (s.length - lastComma - 1 <= 2) ? ',' : null;
    else if (lastDot > -1) dec = (s.length - lastDot - 1 <= 2 && (s.match(/\./g) || []).length === 1) ? '.' : null;
    let intPart = s, frac = '';
    if (dec) { const i = s.lastIndexOf(dec); intPart = s.slice(0, i); frac = s.slice(i + 1); }
    intPart = intPart.replace(/[.,']/g, '');
    if (!intPart && !frac) return null;
    const v = parseFloat((intPart || '0') + '.' + (frac || '0'));
    if (!isFinite(v)) return null;
    return Math.round((neg ? -v : v) * 100) / 100;
  }

  /** Alle Beträge mit 2 Nachkommastellen in einem Text finden. */
  function findAmounts(text) {
    const out = [];
    AMOUNT_RE.lastIndex = 0;
    let m;
    while ((m = AMOUNT_RE.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 1), m.index);
      if (/[\d.,]/.test(before)) continue;           // Teil einer längeren Zahl
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 1);
      if (/[.:\/]/.test(after) && /^\d/.test(text.slice(m.index + m[0].length + 1))) continue; // Uhrzeit/Datum
      let v = parseAmount(m[2] + m[3]);
      if (v == null) continue;
      const suf = (m[4] || '').toLowerCase();
      if (m[1] === '-' || suf === '-' || suf === 's') v = -Math.abs(v);
      out.push({ value: v, index: m.index, end: m.index + m[0].length, raw: m[0], signed: !!(m[1] || suf === '-' || suf === 's' || suf === 'h') });
    }
    return out;
  }

  const MONTHS = { jan: 1, januar: 1, january: 1, feb: 2, februar: 2, february: 2, mär: 3, mar: 3, märz: 3, maerz: 3, march: 3, marts: 3,
    apr: 4, april: 4, mai: 5, may: 5, maj: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, november: 11, dez: 12, dec: 12, dezember: 12, december: 12 };

  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(y, m, d) {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }

  /** Erstes Datum in einem Text -> "YYYY-MM-DD" */
  function parseDate(str, refYear) {
    if (!str) return null;
    const s = String(str);
    let m = s.match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d])/);
    if (m) return iso(+m[3], +m[2], +m[1]);
    m = s.match(/(?<!\d)(\d{1,2})\.\s?([A-Za-zäöüÄÖÜ]{3,9})\.?\s+(\d{4})/);
    if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    m = s.match(/(?<!\d)(\d{1,2})\s([a-zA-Zæøå]{3,9})\.?\s(\d{4})/);
    if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    if (refYear) {
      m = s.match(/^\s*(\d{1,2})\.(\d{1,2})\.?(?!\d)/);
      if (m) return iso(refYear, +m[2], +m[1]);
    }
    return null;
  }

  // ---------- Kategorien ----------

  const CATEGORIES = [
    { id: 'lebensmittel', name: 'Lebensmittel', icon: '🛒', color: '#4ADE80' },
    { id: 'drogerie', name: 'Drogerie & Haushalt', icon: '🧴', color: '#22D3EE' },
    { id: 'restaurant', name: 'Restaurant & Café', icon: '🍽️', color: '#FB923C' },
    { id: 'mobilitaet', name: 'Auto & Tanken', icon: '⛽', color: '#F87171' },
    { id: 'oepnv', name: 'Bus, Bahn & Reisen', icon: '🚆', color: '#C084FC' },
    { id: 'wohnen', name: 'Miete & Wohnen', icon: '🏠', color: '#FDA4AF' },
    { id: 'energie', name: 'Strom, Gas & Wasser', icon: '💡', color: '#FDE047' },
    { id: 'versicherung', name: 'Versicherungen', icon: '🛡️', color: '#60A5FA' },
    { id: 'abos', name: 'Abos & Streaming', icon: '📺', color: '#F472B6' },
    { id: 'telefon', name: 'Handy & Internet', icon: '📱', color: '#818CF8' },
    { id: 'online', name: 'Online-Shopping', icon: '📦', color: '#FBBF24' },
    { id: 'kleidung', name: 'Kleidung', icon: '👕', color: '#E879F9' },
    { id: 'gesundheit', name: 'Gesundheit', icon: '💊', color: '#34D399' },
    { id: 'freizeit', name: 'Freizeit & Hobby', icon: '🎉', color: '#A78BFA' },
    { id: 'kinder', name: 'Kinder & Tiere', icon: '🧸', color: '#FDBA74' },
    { id: 'kredit', name: 'Kredite & Sparen', icon: '🏦', color: '#7DD3FC' },
    { id: 'bar', name: 'Bargeld', icon: '💶', color: '#BEF264' },
    { id: 'sonstiges', name: 'Sonstiges', icon: '📌', color: '#94A3B8' },
    { id: 'einnahme', name: 'Einnahmen', icon: '💰', color: '#2DD4BF' }
  ];

  const CAT_RULES = [
    ['wohnen', /\b(miete|kaltmiete|warmmiete|nebenkosten|hausgeld|wohnungsbau|vermietung|hausverwaltung|wohnbau|leje|husleje|grundsteuer|vonovia|leg immobilien)\b/i],
    ['versicherung', /\b(versicherung|allianz|huk|huk-coburg|ergo\b|axa\b|generali|devk|signal iduna|r\+v|debeka|lvm|provinzial|cosmos|barmenia|zurich|gothaer|haftpflicht|hausrat|kfz-vers|tryg|topdanmark|alm\.? brand|codan|forsikring|krankenkasse|aok\b|tk\b|techniker|barmer|dak\b)\b/i],
    ['energie', /\b(stadtwerke|strom|gas\b|energie|vattenfall|eon\b|e\.on|enbw|rwe\b|yello|eprimo|lichtblick|ewe\b|wasserversorgung|abwasser|fernwärme|fernwaerme|ørsted|orsted|andel energi|norlys|ok el|rundfunk|ard zdf|beitragsservice)\b/i],
    ['abos', /\b(netflix|spotify|disney|amazon prime|prime video|dazn|sky\b|apple\.com|itunes|google \*|google play|youtube|audible|wow\b|rtl\+|joyn|paramount|viaplay|tv2 play|hbo|max\b|chatgpt|openai|microsoft|adobe|icloud|patreon|fitnessstudio|mcfit|fitx|clever fit|urban sports|abo\b|abonnement|mitgliedsbeitrag|beitrag)\b/i],
    ['telefon', /\b(telekom|vodafone|o2\b|telefonica|1&1|1und1|congstar|freenet|drillisch|aldi talk|lebara|lyca|klarmobil|mobilcom|unitymedia|pyur|tele2|telenor|telia|yousee|3 danmark|oister|cbb\b|internet|dsl\b)\b/i],
    ['kredit', /\b(kredit|darlehen|rate\b|tilgung|sparplan|sparkonto|depot|trade republic|scalable|comdirect sparplan|bausparkasse|bauspar|schwäbisch hall|wüstenrot|leasing|ratenkauf|santander consumer)\b/i],
    ['lebensmittel', /\b(rewe|edeka|e-center|marktkauf|lidl|aldi|netto|penny|kaufland|norma|globus|tegut|real\b|famila|combi|nahkauf|bäckerei|baeckerei|backshop|metzgerei|fleischerei|getränke|getraenke|føtex|foetex|bilka|rema ?1000|coop|kvickly|superbrugsen|dagli.?brugsen|meny|spar\b|løvbjerg|lovbjerg|365discount|fakta|irma|lagkagehuset|supermarkt|biomarkt|denns|alnatura|hit markt|wasgau|bünting|famila)\b/i],
    ['drogerie', /\b(dm[- ]drogerie|dm\b|rossmann|müller|mueller|budni|matas|normal\b|action\b|tedi|kik\b|woolworth|tiger\b|søstrene|sostrene|ikea|jysk|bauhaus|obi\b|hornbach|toom|hagebau|bauhaus|silvan|jem ?& ?fix)\b/i],
    ['restaurant', /\b(restaurant|ristorante|pizzeria|pizza|imbiss|döner|doener|kebab|café|cafe|coffee|starbucks|mcdonald|burger king|kfc|subway|lieferando|wolt|just eat|uber eats|bistro|gaststätte|kantine|sushi|bar\b|baeckerei cafe)\b/i],
    ['mobilitaet', /\b(aral|shell|esso|total|totalenergies|jet\b|agip|eni\b|avia|star tankstelle|tankstelle|q8|circle k|ok benzin|ingo|uno-x|f24|parkhaus|parken|easypark|apcoa|kfz|atu\b|werkstatt|tüv|tuev|dekra|autowäsche|waschstraße|adac)\b/i],
    ['oepnv', /\b(db vertrieb|deutsche bahn|db fernverkehr|bahn\b|flixbus|flixtrain|hvv|bvg|mvv|vrr|kvb|rmv|deutschlandticket|dsb\b|rejsekort|movia|ryanair|lufthansa|eurowings|easyjet|booking\.com|airbnb|hotel|taxi|uber\b|bolt\b|scandlines)\b/i],
    ['online', /\b(amazon|amzn|ebay|zalando|otto\b|temu|shein|aliexpress|wish\b|paypal|klarna|about you|mediamarkt|media markt|saturn|alternate|notebooksbilliger|etsy|wish\.com|bestellung|order)\b/i],
    ['kleidung', /\b(h&m|h & m|c&a|primark|zara|deichmann|snipes|new yorker|tk maxx|esprit|s\.oliver|bershka|reno\b|vero moda|only\b|jack ?& ?jones|decathlon|intersport|sportscheck|footlocker|kleidung|schuhe)\b/i],
    ['gesundheit', /\b(apotheke|apotek|arzt|zahnarzt|praxis|klinik|krankenhaus|optik|fielmann|apollo optik|physio|docmorris|shop apotheke|medikament|sanitätshaus)\b/i],
    ['freizeit', /\b(kino|cinema|cinemaxx|theater|museum|zoo|freizeitpark|eventim|ticketmaster|steam|playstation|xbox|nintendo|thalia|hugendubel|buchhandlung|spielwaren|sport|schwimmbad|bowling|konzert)\b/i],
    ['kinder', /\b(kita|kindergarten|tagesmutter|schule|fressnapf|futterhaus|zooplus|tierarzt|spielzeug|smyths|mytoys|baby)\b/i],
    ['bar', /\b(geldautomat|bargeld|atm\b|auszahlung|hævning|cash)\b/i],
    ['einnahme', /\b(gehalt|lohn|bezüge|bezuege|rente|kindergeld|arbeitslosengeld|bürgergeld|buergergeld|elterngeld|løn|loen|erstattung|rückerstattung|gutschrift|zinsen)\b/i]
  ];

  function guessCategory(text, isIncome) {
    const t = String(text || '');
    if (isIncome) return 'einnahme';
    for (const [id, re] of CAT_RULES) {
      if (id === 'einnahme') continue;
      if (re.test(t)) return id;
    }
    return 'sonstiges';
  }

  // ---------- Händlername vereinheitlichen ----------

  const NOISE = /\b(sepa|lastschrift|lastschr|basislastschrift|dauerauftrag|überweisung|ueberweisung|gutschrift|kartenzahlung|kartenumsatz|karte|girocard|debitk|debit|visa|mastercard|ecom|online|zahlung|einzug|folgelastschrift|erstlastschrift|ref|mandat|mandatsref|end-to-end|eref|mref|cred|svwz|abwa|iban|bic|kundennr|kd-nr|vertrag|vertragsnr|rechnung|rg|nr|gmbh|mbh|ag|se|kg|co|ohg|ug|e\.?k|inc|ltd|llc|bv|aps|a\/s|de|dk|eur|dkk|www|com|net|und|the|der|die|das|fuer|für|vom|bei|pp|paypal europe|europe|s\.a\.r\.l|et cie|sca|purchase|nets|dankort|mobilepay|apple pay|google pay|kontaktlos|pos|uhr|datum|beleg|terminal|filiale|fil)\b/gi;

  function normalizePayee(text) {
    let t = String(text || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
      .replace(/[a-z]{2}\d{2}[a-z0-9]{10,30}/g, ' ')     // IBAN
      .replace(/\d+/g, ' ')
      .replace(/[^a-z&+ ]+/g, ' ')
      .replace(NOISE, ' ');
    const words = t.split(/\s+/).filter(w => w.length >= 3);
    return words.slice(0, 2).join(' ');
  }

  // ---------- OCR-Zeilen ----------

  /** Erkannte Textzeilen (mit Position) zu Bildschirmzeilen zusammenfassen. */
  function ocrRows(ocr) {
    const all = [];
    (ocr.pages || []).forEach((page, pi) => {
      const lines = (page.lines || []).slice().filter(l => l.t && l.t.trim());
      if (!lines.length) return;
      const hs = lines.map(l => l.h).sort((a, b) => a - b);
      const medH = hs[Math.floor(hs.length / 2)] || 20;
      lines.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
      const rows = [];
      for (const l of lines) {
        const yc = l.y + l.h / 2;
        let best = null, bestD = Infinity;
        for (let i = Math.max(0, rows.length - 4); i < rows.length; i++) {
          const d = Math.abs(rows[i].yc - yc);
          if (d < bestD) { bestD = d; best = rows[i]; }
        }
        if (best && bestD < medH * 0.55) {
          best.cells.push(l);
          best.yc = (best.yc * (best.cells.length - 1) + yc) / best.cells.length;
        } else rows.push({ yc, cells: [l], page: pi });
      }
      rows.forEach(r => {
        r.cells.sort((a, b) => a.x - b.x);
        r.text = r.cells.map(c => c.t.trim()).join('  ');
        r.width = page.width;
        all.push(r);
      });
    });
    return all;
  }

  function ocrPlainText(ocr) { return ocrRows(ocr).map(r => r.text).join('\n'); }

  // ---------- Kassenbon / Bestellung ----------

  const TOTAL_RE = /(^|\b)(summe|gesamtsumme|gesamtbetrag|gesamt|endsumme|endbetrag|zu zahlen|zahlbetrag|rechnungsbetrag|bestellsumme|bestellwert|total|totalt|i alt|at betale|betalt|amount due|grand total|order total|summe eur|eur summe|betrag)\b/i;
  const SUBTOTAL_RE = /(zwischensumme|subtotal|sub total|summe artikel|warenwert|nettobetrag|netto\b|mwst|ust\b|steuer|moms|tax|vat|davon|inkl\.?|enthalten)/i;
  const PAYMENT_RE = /(\bbar\b|bargeld|gegeben|rückgeld|rueckgeld|zurück|wechselgeld|kreditkarte|ec[- ]?karte|girocard|karte\b|kartenzahlung|visa|mastercard|maestro|dankort|mobilepay|paypal|kontaktlos|terminal|trace|beleg|genehmigung|byttepenge|kontant|bonus|payback|punkte|coupon gesamt|treuepunkte|ersparnis|gespart|sie sparen|du sparst)/i;
  const SKIP_RE = /(tel\.?|telefon|fax|ust-?id|steuer-?nr|st\.?-?nr|www\.|http|uhr\b|kasse\s*\d|bon-?nr|bon\s*\d|beleg-?nr|filiale|markt\s*\d|öffnungszeiten|vielen dank|danke|cvr|kunde|bediener|bedient|mitarbeiter|tse|signatur|seriennr|transaktion|lieferung|lieferadresse|rechnungsadresse|versandadresse|bestellnummer|bestellt am|bestelldatum|zahlungsart|stk\.?\s*$)/i;
  const SHIPPING_RE = /(versand|lieferkosten|porto|fragt|shipping|delivery)/i;
  const DISCOUNT_RE = /(rabatt|nachlass|coupon|gutschein|aktion|preisvorteil|pfand\s*rück|leergut|pfandbon|rabat)/i;

  function cleanName(s) {
    return s.replace(AMOUNT_RE, ' ')
      .replace(/\b\d+\s*(x|stk\.?|st\.?)\s*$/i, '')
      .replace(/^\s*\d+\s*(x|stk\.?)\s+/i, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[^\wäöüÄÖÜæøåÆØÅ]+|[^\wäöüÄÖÜæøåÆØÅ)%]+$/g, '')
      .trim();
  }

  function isQtyLine(s) {
    return /^\s*[\d,.]+\s*(x|stk|st|kg|g|l|ml|×)\b/i.test(s) || /^\s*\d+\s*[x×]\s*[\d.,]+/.test(s) ||
      /^\s*[\d,]+\s*kg\s*x/i.test(s) || /€\s*\/\s*kg|eur\s*\/\s*kg|\/kg/i.test(s);
  }

  function parseReceipt(ocr, opts) {
    opts = opts || {};
    const rows = ocrRows(ocr);
    const text = rows.map(r => r.text).join('\n');
    const result = { merchant: '', date: null, total: null, items: [], rawText: text, category: 'sonstiges', totalFound: false };
    if (!rows.length) return result;

    // Händler: bekannte Kette oder erste sinnvolle Textzeile
    const known = text.match(/\b(REWE|EDEKA|E center|Marktkauf|LIDL|ALDI(?: SÜD| NORD)?|NETTO(?: Marken-Discount)?|PENNY|KAUFLAND|NORMA|GLOBUS|dm-drogerie markt|dm|ROSSMANN|Müller|IKEA|OBI|BAUHAUS|HORNBACH|ACTION|Føtex|Bilka|REMA 1000|Coop|Kvickly|SuperBrugsen|Meny|Lidl|Netto|Normal|Matas|Amazon|Zalando|Otto|eBay|Temu|SHEIN|MediaMarkt|Saturn|H&M|C&A|Primark|Deichmann|Decathlon|Apotheke|Aral|Shell|Esso|JET|TotalEnergies|Circle K|McDonald's|Burger King|Starbucks)\b/i);
    if (known) result.merchant = known[1];
    else if (opts.online) result.merchant = 'Online-Bestellung';
    else {
      for (const r of rows.slice(0, 6)) {
        const t = cleanName(r.text);
        if (t.length >= 3 && /[a-zäöüæøå]{3}/i.test(t) && !SKIP_RE.test(r.text) && !findAmounts(r.text).length && !parseDate(r.text)) {
          result.merchant = t.slice(0, 40); break;
        }
      }
    }

    // Datum
    for (const r of rows) {
      const d = parseDate(r.text);
      if (d) { result.date = d; break; }
    }

    // Gesamtsumme
    let totalIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i].text;
      if (TOTAL_RE.test(t) && !SUBTOTAL_RE.test(t) && !PAYMENT_RE.test(t)) {
        let am = findAmounts(t);
        if (!am.length && rows[i + 1] && !TOTAL_RE.test(rows[i + 1].text)) am = findAmounts(rows[i + 1].text);
        if (am.length) {
          const v = Math.abs(am[am.length - 1].value);
          if (v > 0) {
            // spätere, "stärkere" Summen (z. B. "Gesamtsumme" nach "Summe") überschreiben
            if (result.total == null || /gesamtsumme|zu zahlen|endbetrag|at betale|order total|grand total|bestellsumme|rechnungsbetrag/i.test(t) || v > result.total) {
              result.total = v; totalIdx = i; result.totalFound = true;
            }
          }
        }
      }
    }

    // Artikel (vor der Summe)
    const end = totalIdx > -1 ? totalIdx : rows.length;
    let pendingName = '';
    for (let i = 0; i < end; i++) {
      const r = rows[i];
      const t = r.text;
      if (SKIP_RE.test(t) || PAYMENT_RE.test(t) || SUBTOTAL_RE.test(t) || TOTAL_RE.test(t)) { pendingName = ''; continue; }
      if (parseDate(t) && cleanName(t.replace(/\d{1,2}[.:]\d{2}(:\d{2})?/g, '')).length < 4) { pendingName = ''; continue; }
      const am = findAmounts(t);
      if (!am.length) {
        const n = cleanName(t);
        if (n.length >= 2 && /[a-zäöüæøå]{2}/i.test(n)) pendingName = n;
        continue;
      }
      // Preis = letzter Betrag in der Zeile (rechte Spalte)
      const price = am[am.length - 1].value;
      let name = cleanName(t);
      if ((!name || name.length < 2 || isQtyLine(t)) && pendingName) name = pendingName;
      else if (isQtyLine(t) && !pendingName && result.items.length) {
        // Mengenzeile gehört zum vorigen Artikel: dessen Preis ersetzen
        const prev = result.items[result.items.length - 1];
        if (Math.abs(prev.price) <= Math.abs(price)) { prev.price = price; continue; }
      }
      pendingName = '';
      if (!name || !/[a-zäöüæøå]{2}/i.test(name)) continue;
      if (Math.abs(price) > 5000) continue;
      let p = price;
      if (DISCOUNT_RE.test(name) && p > 0) p = -p;
      if (SHIPPING_RE.test(name)) name = name; // Versand bleibt eigener Posten
      result.items.push({ name: name.slice(0, 60), price: Math.round(p * 100) / 100 });
    }

    // Plausibilität: ohne Summe -> größter Betrag bzw. Summe der Artikel
    const itemSum = Math.round(result.items.reduce((s, it) => s + it.price, 0) * 100) / 100;
    if (result.total == null) {
      if (result.items.length) result.total = itemSum;
      else {
        const all = rows.flatMap(r => findAmounts(r.text)).map(a => Math.abs(a.value));
        result.total = all.length ? Math.max(...all) : 0;
      }
    }
    // Online-Bestellung: Artikel mit identischem Wert wie Summe entfernen (Doppelungen)
    if (result.items.length > 1) {
      result.items = result.items.filter(it => !(Math.abs(it.price - result.total) < 0.005 && itemSum - it.price > 0.01 && Math.abs(itemSum - it.price - result.total) < 0.02));
    }
    result.itemSum = Math.round(result.items.reduce((s, it) => s + it.price, 0) * 100) / 100;
    result.category = guessCategory(result.merchant + ' ' + (opts.online ? 'online ' : '') + text.slice(0, 400));
    if (opts.online && result.category === 'sonstiges') result.category = 'online';
    return result;
  }

  // ---------- CSV ----------

  function splitCsv(text, delim) {
    const rows = []; let row = []; let cur = ''; let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c));
  }

  function detectDelimiter(text) {
    const sample = text.split(/\r?\n/).slice(0, 40).join('\n');
    let best = ';', bestScore = -1;
    for (const d of [';', ',', '\t', '|']) {
      const counts = sample.split('\n').map(l => l.split(d).length - 1).filter(n => n > 0);
      if (!counts.length) continue;
      const freq = {}; counts.forEach(n => freq[n] = (freq[n] || 0) + 1);
      const top = Math.max(...Object.values(freq));
      const mode = +Object.keys(freq).find(k => freq[k] === top);
      const score = top * Math.min(mode, 12);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  const H = {
    date: /^(buchungstag|buchungsdatum|buchung|datum|date|dato|bogført|bogfoert|booking date|transaktionsdatum|umsatztag|belegdatum)/i,
    valuta: /(valuta|wertstellung|value date|rentedato)/i,
    amount: /^(betrag|amount|beløb|beloeb|umsatz(?!typ|art|tag)|summe|wert(?!stellung))/i,
    debit: /^(soll|belastung|debit|ausgang|ausgabe|lastschrift|udbetaling|abgang)/i,
    credit: /^(haben|gutschrift|credit|eingang|einnahme|indbetaling|zugang)/i,
    sh: /^(s\/h|soll\/haben|vorzeichen)$/i,
    payee: /(empfänger|empfaenger|auftraggeber|begünstigt|beguenstigt|zahlungspflichtig|zahlungsbeteiligter|name|payee|partner|modtager|afsender|gegenseite|counterparty|händler|haendler)/i,
    purpose: /(verwendungszweck|beschreibung|tekst|text|description|reference|buchungstext|vorgang|umsatzart|transaktionstype|buchungsart|details|memo)/i,
    ignore: /(iban|bic|konto|saldo|kontostand|balance|währung|waehrung|currency|gläubiger|glaeubiger|mandat|kundenreferenz|bankleitzahl|blz|kategorie|status|^info$)/i
  };

  function parseCsvStatement(text) {
    const delim = detectDelimiter(text);
    const rows = splitCsv(text, delim);
    if (!rows.length) return [];
    let hi = -1;
    for (let i = 0; i < Math.min(rows.length, 40); i++) {
      const r = rows[i];
      if (r.length >= 3 && r.some(c => H.date.test(c) || H.valuta.test(c)) && r.some(c => H.amount.test(c) || H.debit.test(c) || H.credit.test(c))) { hi = i; break; }
    }
    let col = { date: -1, amount: -1, debit: -1, credit: -1, sh: -1, payee: [], purpose: [] };
    let dataRows;
    if (hi > -1) {
      const h = rows[hi];
      h.forEach((c, i) => {
        if (col.date < 0 && H.date.test(c)) col.date = i;
        else if (H.valuta.test(c)) { if (col.valuta == null) col.valuta = i; }
        else if (H.sh.test(c)) col.sh = i;
        else if (col.amount < 0 && H.amount.test(c) && !H.ignore.test(c)) col.amount = i;
        else if (col.debit < 0 && H.debit.test(c)) col.debit = i;
        else if (col.credit < 0 && H.credit.test(c)) col.credit = i;
        else if (H.ignore.test(c)) { /* nichts */ }
        else if (H.payee.test(c)) col.payee.push(i);
        else if (H.purpose.test(c)) col.purpose.push(i);
      });
      if (col.date < 0 && col.valuta != null) col.date = col.valuta;
      dataRows = rows.slice(hi + 1);
    } else {
      // ohne Überschrift: Spalten raten
      dataRows = rows;
      const n = Math.max(...rows.map(r => r.length));
      const score = (fn) => Array.from({ length: n }, (_, i) => rows.filter(r => fn(r[i] || '')).length);
      const ds = score(c => !!parseDate(c));
      const as = score(c => parseAmount(c) != null && !parseDate(c) && /[.,]\d{2}\s*-?$/.test(c));
      const ls = Array.from({ length: n }, (_, i) => rows.reduce((s, r) => s + ((r[i] || '').replace(/[\d.,\s-]/g, '').length), 0));
      col.date = ds.indexOf(Math.max(...ds));
      col.amount = as.indexOf(Math.max(...as));
      const order = ls.map((v, i) => [v, i]).filter(([, i]) => i !== col.date && i !== col.amount).sort((a, b) => b[0] - a[0]);
      if (order[0]) col.purpose.push(order[0][1]);
    }
    const out = [];
    let lastYear = new Date().getFullYear();
    for (const r of dataRows) {
      const date = parseDate(r[col.date] || '', lastYear);
      if (!date) continue;
      lastYear = +date.slice(0, 4);
      let amount = null;
      if (col.amount > -1) amount = parseAmount(r[col.amount]);
      if (amount == null && (col.debit > -1 || col.credit > -1)) {
        const d = parseAmount(r[col.debit] || ''), c = parseAmount(r[col.credit] || '');
        if (d) amount = -Math.abs(d); else if (c) amount = Math.abs(c);
      }
      if (amount == null || amount === 0) continue;
      if (col.sh > -1) { const s = (r[col.sh] || '').toUpperCase(); if (s === 'S') amount = -Math.abs(amount); if (s === 'H') amount = Math.abs(amount); }
      const payee = col.payee.map(i => r[i]).filter(Boolean).join(' ').trim();
      const purpose = col.purpose.map(i => r[i]).filter(Boolean).join(' ').trim();
      out.push({ date, amount, payee, text: (payee ? payee + ' – ' : '') + purpose });
    }
    return out;
  }

  // ---------- Kontoauszug als PDF/Bild (Texterkennung) ----------

  const BALANCE_RE = /(kontostand|saldo|alter stand|neuer stand|übertrag|uebertrag|summe soll|summe haben|anfangssaldo|endsaldo|primo|ultimo|zwischensaldo|seite \d|blatt \d|kontoauszug|iban|bic\b|dispositionskredit|zinssatz)/i;

  function parseOcrStatement(ocr) {
    const rows = ocrRows(ocr);
    // Spaltenköpfe für Soll/Haben suchen
    let debitX = null, creditX = null;
    for (const r of rows) {
      for (const c of r.cells) {
        if (/^(soll|belastung|ausgang|lastschrift|abgang|debit|udbetaling)$/i.test(c.t.trim())) debitX = c.x + c.w / 2;
        if (/^(haben|gutschrift|eingang|zugang|credit|indbetaling)$/i.test(c.t.trim())) creditX = c.x + c.w / 2;
      }
      if (debitX != null && creditX != null) break;
    }
    const out = [];
    let year = new Date().getFullYear();
    const yearHint = rows.map(r => r.text.match(/\b(20\d{2})\b/)).find(Boolean);
    if (yearHint) year = +yearHint[1];
    let cur = null;
    for (const r of rows) {
      const t = r.text;
      if (BALANCE_RE.test(t)) { cur = null; continue; }
      const startDate = t.match(/^\s*(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\.?)/) || t.match(/^\s*(\d{4}-\d{2}-\d{2})/);
      const date = startDate ? parseDate(startDate[1], year) : null;
      const am = findAmounts(t);
      if (date && am.length) {
        let a = am[am.length - 1];
        // Bei Spalten "Betrag | Saldo" ist der vorletzte Betrag der Umsatz
        if (am.length >= 2 && /saldo|balance/i.test(rows.map(x => x.text).join(' ').slice(0, 3000)) && !a.signed) a = am[am.length - 2];
        let v = a.value;
        if (!a.signed && debitX != null && creditX != null) {
          const cell = r.cells.find(c => c.t.includes(a.raw.trim().replace(/\s.*$/, '')) ) || r.cells[r.cells.length - 1];
          const xc = cell.x + cell.w / 2;
          v = Math.abs(xc - debitX) < Math.abs(xc - creditX) ? -Math.abs(v) : Math.abs(v);
        } else if (!a.signed) {
          v = /gehalt|lohn|gutschrift|rente|kindergeld|eingang|erstattung|løn|indbetaling/i.test(t) ? Math.abs(v) : -Math.abs(v);
        }
        let desc = t.replace(startDate[0], '').slice(0, a.index - startDate[0].length > 0 ? undefined : undefined);
        desc = desc.replace(AMOUNT_RE, ' ').replace(/^\s*\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\.?/, '').replace(/\s{2,}/g, ' ').trim();
        cur = { date, amount: v, payee: '', text: desc, lines: 1 };
        out.push(cur);
      } else if (cur && !am.length && cur.lines < 3 && t.trim().length > 2) {
        cur.text = (cur.text + ' ' + t.trim()).trim();
        cur.lines++;
      } else if (!date) {
        cur = cur && cur.lines < 3 ? cur : null;
      }
    }
    out.forEach(o => { delete o.lines; o.text = o.text.slice(0, 160); });
    return out;
  }

  function parseStatement(native) {
    if (!native) return [];
    if (native.type === 'text') {
      const t = native.text || '';
      if (/<\?xml|<Document|camt\.05/i.test(t)) return parseCamt(t);
      if (/^\s*:20:|:61:/m.test(t)) return parseMt940(t);
      return parseCsvStatement(t);
    }
    return parseOcrStatement(native);
  }

  /** CAMT.052/053 (XML-Export vieler Banken) */
  function parseCamt(xml) {
    const out = [];
    const entries = xml.split(/<Ntry>/).slice(1);
    for (const e of entries) {
      const amt = (e.match(/<Amt[^>]*>([\d.]+)<\/Amt>/) || [])[1];
      const cd = (e.match(/<CdtDbtInd>(\w+)<\/CdtDbtInd>/) || [])[1];
      const date = (e.match(/<BookgDt>\s*<Dt>([\d-]+)<\/Dt>/) || e.match(/<Dt>([\d-]+)<\/Dt>/) || [])[1];
      if (!amt || !date) continue;
      const nm = (cd === 'DBIT' ? (e.match(/<Cdtr>\s*(?:<Pty>\s*)?<Nm>([^<]+)<\/Nm>/) || []) : (e.match(/<Dbtr>\s*(?:<Pty>\s*)?<Nm>([^<]+)<\/Nm>/) || []))[1] || '';
      const ustrd = (e.match(/<Ustrd>([^<]+)<\/Ustrd>/g) || []).map(s => s.replace(/<\/?Ustrd>/g, '')).join(' ');
      const add = (e.match(/<AddtlNtryInf>([^<]+)</) || [])[1] || '';
      const v = parseFloat(amt) * (cd === 'DBIT' ? -1 : 1);
      out.push({ date: date.slice(0, 10), amount: Math.round(v * 100) / 100, payee: nm, text: (nm ? nm + ' – ' : '') + (ustrd || add) });
    }
    return out;
  }

  /** MT940 (älteres Bankformat) */
  function parseMt940(t) {
    const out = [];
    const parts = t.split(/\n:61:/).slice(1);
    for (const p of parts) {
      const m = p.match(/^(\d{2})(\d{2})(\d{2})(?:\d{4})?(R?[CD])[A-Z]?([\d,]+)/);
      if (!m) continue;
      const date = iso(2000 + +m[1], +m[2], +m[3]);
      let v = parseFloat(m[5].replace(',', '.'));
      if (m[4].endsWith('D')) v = -v;
      const info = (p.split(/\n:86:/)[1] || '').split(/\n:\d{2}[A-Z]?:/)[0].replace(/\?\d{2}/g, ' ').replace(/\s+/g, ' ').trim();
      const name = ((p.match(/\?32([^?]*)/) || [])[1] || '') + ((p.match(/\?33([^?]*)/) || [])[1] || '');
      out.push({ date, amount: Math.round(v * 100) / 100, payee: name.trim(), text: info.slice(0, 160) });
    }
    return out;
  }

  // ---------- Fixkosten erkennen ----------

  const RECURRING_HINT = /(miete|nebenkosten|hausgeld|versicherung|beitrag|abo|netflix|spotify|disney|dazn|sky\b|prime|apple\.com|icloud|google|youtube|audible|telekom|vodafone|o2\b|1&1|congstar|strom|gas\b|stadtwerke|energie|vattenfall|rundfunk|beitragsservice|fitness|mcfit|fitx|kredit|darlehen|rate\b|leasing|sparplan|dauerauftrag|kita|gez|husleje|forsikring|abonnement|mitglied)/i;

  function median(a) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

  /** Liefert Vorschläge für wiederkehrende Zahlungen aus einer Liste von Buchungen. */
  function detectRecurring(txs, existingKeys) {
    existingKeys = existingKeys || [];
    const groups = {};
    for (const t of txs) {
      const key = normalizePayee(t.payee || t.text);
      if (!key) continue;
      (groups[key] = groups[key] || []).push(t);
    }
    const out = [];
    for (const [key, list] of Object.entries(groups)) {
      if (existingKeys.some(k => k && (k === key || key.startsWith(k) || k.startsWith(key)))) continue;
      const months = new Set(list.map(t => t.date.slice(0, 7)));
      const amounts = list.map(t => t.amount);
      const med = median(amounts.map(Math.abs));
      const sameSign = amounts.every(a => Math.sign(a) === Math.sign(amounts[0]));
      const similar = amounts.every(a => Math.abs(Math.abs(a) - med) <= Math.max(2, med * 0.2));
      const hinted = RECURRING_HINT.test(list[0].text) || /dauerauftrag|lastschrift|gehalt|lohn/i.test(list[0].text);
      const income = amounts[0] > 0;
      let confidence = 0;
      if (months.size >= 2 && sameSign && similar) confidence = months.size >= 3 ? 3 : 2;
      else if (hinted && sameSign && (income ? /gehalt|lohn|rente|kindergeld|løn/i.test(list[0].text) : true)) confidence = 1;
      if (!confidence) continue;
      if (list.length > months.size * 2) continue; // mehrmals pro Monat = eher Einkauf als Fixkosten
      const days = list.map(t => +t.date.slice(8, 10));
      const last = list.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
      out.push({
        key,
        name: prettyName(last.payee || last.text),
        amount: Math.abs(last.amount),
        type: income ? 'income' : 'expense',
        day: Math.min(28, median(days)),
        category: guessCategory(last.text, income),
        confidence,
        count: list.length
      });
    }
    return out.sort((a, b) => b.confidence - a.confidence || b.amount - a.amount);
  }

  function prettyName(s) {
    let t = String(s || '').split(/ – |\s{2,}|\/\/| ref| eref| svwz|mref/i)[0];
    t = t.replace(/\b(sepa|lastschrift|basislastschrift|dauerauftrag|überweisung|kartenzahlung|folgelastschrift|erstlastschrift)\b/gi, '').replace(/\s+/g, ' ').trim();
    if (!t) t = String(s || '').slice(0, 30);
    t = t.slice(0, 40);
    return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s|-)\S/g, x => x.toUpperCase()) : t;
  }

  const api = { parseAmount, findAmounts, parseDate, CATEGORIES, guessCategory, normalizePayee, ocrRows, ocrPlainText,
    parseReceipt, splitCsv, detectDelimiter, parseCsvStatement, parseOcrStatement, parseStatement, parseCamt, parseMt940,
    detectRecurring, prettyName, iso };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.P = api;
})(this);
