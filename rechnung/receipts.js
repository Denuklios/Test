/* Belegerkennung: Foto oder PDF eines Belegs → Art (Ausgabe/Einnahme), Betrag, Moms, bezahlt/offen.
   Nutzt Claude (Anthropic) über das offizielle SDK. Schlüssel: ANTHROPIC_API_KEY oder in den Einstellungen. */
'use strict';
let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk').default; } catch { /* Paket nicht installiert → nur manuelle Erfassung */ }

// Genau: großes Modell (ca. 3–6 Cent pro Beleg). Günstig: kleines Modell (ca. 0,1 Cent pro Beleg).
const MODELS = { precise: 'claude-opus-5-5', cheap: 'claude-haiku-5-5' };
const CATEGORIES = require('./public/fradrag').names;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['docType', 'counterparty', 'counterpartyVatId', 'counterpartyCountry', 'documentNumber', 'date', 'dueDate', 'currency', 'total', 'vat', 'isPaid', 'paymentMethod', 'category', 'euPurchase', 'description', 'confident', 'notes'],
  properties: {
    docType: { type: 'string', enum: ['expense', 'income', 'other'], description: 'expense = wir haben etwas gekauft/bezahlen müssen; income = wir haben etwas verkauft/Geld bekommen; other = kein Buchungsbeleg' },
    counterparty: { type: 'string', description: 'Name des Geschäfts/Lieferanten (bei Ausgabe) bzw. des Kunden/Zahlers (bei Einnahme)' },
    counterpartyVatId: { type: 'string', description: 'CVR-/USt-IdNr. der Gegenseite, sonst leer' },
    counterpartyCountry: { type: 'string', description: 'ISO-Ländercode der Gegenseite (DK, DE, ...), sonst leer' },
    documentNumber: { type: 'string', description: 'Rechnungs-/Bon-/Kvitteringsnummer, sonst leer' },
    date: { type: 'string', description: 'Belegdatum YYYY-MM-DD' },
    dueDate: { type: 'string', description: 'Fälligkeitsdatum YYYY-MM-DD wenn unbezahlt, sonst leer' },
    currency: { type: 'string', description: 'ISO-Währung, z. B. DKK oder EUR' },
    total: { type: 'string', description: 'Gesamtbetrag inkl. Moms als Dezimalzahl mit Punkt, z. B. 1249.50' },
    vat: { type: 'string', description: 'enthaltene Moms/MwSt. als Dezimalzahl mit Punkt, 0 wenn keine' },
    isPaid: { type: 'boolean', description: 'true, wenn der Beleg zeigt, dass bereits bezahlt wurde (Kassenbon, Kartenzahlung, "Betalt", MobilePay, Quittung)' },
    paymentMethod: { type: 'string', enum: ['card', 'cash', 'mobilepay', 'bank_transfer', 'unpaid', 'unknown'] },
    category: { type: 'string', enum: CATEGORIES },
    euPurchase: { type: 'string', enum: ['', 'goods', 'services'], description: 'goods/services nur bei Einkauf von einer Firma aus einem anderen EU-Land OHNE Moms (Reverse Charge / innergemeinschaftliche Lieferung); sonst leer' },
    description: { type: 'string', description: 'kurze Beschreibung auf Deutsch, was gekauft/verkauft wurde (max. 80 Zeichen)' },
    confident: { type: 'boolean', description: 'true nur wenn Art, Datum, Gesamtbetrag und Moms eindeutig lesbar sind' },
    notes: { type: 'string', description: 'auf Deutsch: was unklar oder unleserlich ist; sonst leer' },
  },
};

function prompt(company) {
  return `Du liest Buchhaltungsbelege für eine dänische Firma aus.
Unsere Firma: ${company.name || '(unbekannt)'}${company.cvr ? `, CVR ${company.cvr}` : ''}. Heute ist ${new Date().toISOString().slice(0, 10)}.

Bestimme:
- docType: Ist der Beleg eine Ausgabe (wir kaufen/bezahlen) oder eine Einnahme (wir verkaufen/bekommen Geld, z. B. unsere eigene Rechnung, Auszahlung einer Plattform, Quittung über Bareinnahme)? Wenn unser Firmenname oder unsere CVR als Aussteller/Verkäufer steht, ist es eine Einnahme. Kein Beleg (z. B. Foto ohne Beträge) → other.
- Beträge exakt vom Beleg (Gesamtbetrag inkl. Moms und die enthaltene Moms). Dänische Belege: "Moms udgør", "heraf moms", "Moms 25%". Deutsche: "MwSt", "USt". Steht nur der Nettobetrag + 25 % dabei, rechne die Moms aus. Dänisches Zahlenformat 1.234,50 = 1234.50.
- isPaid: Kassenbons, Kvitteringer, "Betalt", "Dankort", "Visa", "MobilePay", "Kontant" → bezahlt. Eine Faktura/Rechnung mit Zahlungsfrist, "Forfaldsdato", "Betalingsbetingelser", "bitte überweisen" → nicht bezahlt (paymentMethod unpaid, dueDate setzen).
- euPurchase nur, wenn eine Firma aus einem anderen EU-Land ohne Moms berechnet (Reverse Charge, "Steuerschuldnerschaft des Leistungsempfängers", "omvendt betalingspligt").
- Kategorie so genau wie möglich wählen: Restaurant/Café mit Gästen → "Bewirtung (25 % abziehbar)"; Tankstelle/Laden-Strom → "Tanken/Laden Pkw"; Hotel → "Hotel (Geschäftsreise)"; Zug/Flug/Bus → "Reise (Zug, Bus, Flug)"; Parkhaus, Storebælt, Fähre → "Parken/Brücke/Fähre"; Handy-/Internetrechnung → "Telefon/Internet (auch privat)"; PC/Bildschirm/Drucker → "Computer/IT"; Garn, Stoffe, Holz, Rohlinge → "Material/Waren"; Werkzeug, Fräser, Maschinen → "Werkzeug/Maschinen"; Versicherung → "Versicherung (Firma)"; Pakete/Porto → "Versand".
Das Foto kann schief, gedreht oder schlecht belichtet sein. Erfinde nichts: Unleserliches leer lassen, confident=false und in notes erklären.`;
}

function enabled(apiKey) { return !!(Anthropic && apiKey); }

/* mode: 'auto' (erst günstig, bei unsicherem Ergebnis genau), 'cheap' oder 'precise'.
   Das Ergebnis enthält model = welches Modell zuletzt gelesen hat. */
async function extract({ buffer, mime, company, apiKey, mode = 'auto' }) {
  if (!Anthropic) throw new Error('Das Paket für die Belegerkennung fehlt. Bitte im Ordner rechnung einmal „npm install“ ausführen (das Startskript macht das automatisch).');
  if (!apiKey) throw new Error('Kein API-Schlüssel für die Belegerkennung eingetragen.');
  const data = buffer.toString('base64');
  let source;
  if (mime === 'application/pdf') source = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  else if (IMAGE_TYPES.includes(mime)) source = { type: 'image', source: { type: 'base64', media_type: mime, data } };
  else throw new Error('Dateiformat wird nicht unterstützt (bitte JPG, PNG oder PDF).');

  const client = new Anthropic({ apiKey });
  const content = [source, { type: 'text', text: prompt(company) }];
  if (mode === 'precise') return { ...(await ask(client, 'precise', content)), model: MODELS.precise };
  let first;
  try { first = await ask(client, 'cheap', content); }
  catch (err) { if (mode === 'cheap' || err.auth) throw err; } // bei „automatisch“ springt das genaue Modell ein
  if (first && (mode === 'cheap' || first.confident)) return { ...first, model: MODELS.cheap };
  return { ...(await ask(client, 'precise', content)), model: MODELS.precise, retried: true };
}

async function ask(client, kind, content) {
  let response;
  try {
    // Das große Modell bekommt die automatische Ausweichlösung bei einer Ablehnung, das kleine unterstützt sie nicht
    const extra = kind === 'precise' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
    response = await client.beta.messages.create({
      model: MODELS[kind],
      max_tokens: 16000,
      ...extra,
      output_config: { effort: kind === 'precise' ? 'medium' : 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw Object.assign(new Error('Der API-Schlüssel ist ungültig.'), { auth: true });
    if (err instanceof Anthropic.RateLimitError) throw new Error('Zu viele Anfragen – bitte gleich noch einmal versuchen.');
    if (err instanceof Anthropic.BadRequestError) throw new Error('Der Beleg konnte nicht gelesen werden: ' + err.message);
    if (err instanceof Anthropic.APIError) throw new Error(`Erkennungsdienst meldet Fehler ${err.status}.`);
    throw new Error('Erkennungsdienst nicht erreichbar: ' + err.message);
  }
  if (response.stop_reason === 'refusal') throw new Error('Der Beleg wurde von der Erkennung abgelehnt – bitte von Hand erfassen.');
  if (response.stop_reason === 'max_tokens') throw new Error('Die Erkennung wurde abgebrochen – bitte erneut versuchen.');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(text); } catch { throw new Error('Die Erkennung hat keine lesbare Antwort geliefert.'); }
}

// Schlüssel testen, ohne etwas zu bezahlen (es wird nur die Modellliste abgefragt)
async function check(apiKey) {
  if (!Anthropic) throw new Error('Das Paket für die Belegerkennung fehlt (im Ordner rechnung „npm install“ ausführen).');
  if (!apiKey) throw new Error('Es ist kein Schlüssel eingetragen.');
  try { await new Anthropic({ apiKey }).models.list({ limit: 1 }); return true; }
  catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('Der Schlüssel wird abgelehnt (ungültig, abgeschnitten oder gelöscht). Bitte in der Anthropic-Konsole (platform.claude.com → API Keys) einen neuen erzeugen und komplett kopieren.');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('Der Schlüssel hat keine Berechtigung.');
    throw new Error('Anthropic ist nicht erreichbar: ' + String(err.message).slice(0, 100));
  }
}

module.exports = { check, extract, enabled, CATEGORIES, IMAGE_TYPES, SCHEMA, MODELS, available: () => !!Anthropic };
