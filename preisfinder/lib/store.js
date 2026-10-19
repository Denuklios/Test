'use strict';
// Alle Daten in einer JSON-Datei (Einstellungen, Merkliste, Einkaufsliste, Preisverlauf, Meldungen).
const fs = require('fs');
const path = require('path');

const DEFAULTS = () => ({
  settings: { country: 'de', zip: '10115', radius: 15, stores: [], ntfyTopic: '', watchHours: 6, hideLoyalty: false },
  watch: [],       // { id, q, maxPrice, maxUnitPrice, stores, notified: [offerId], lastCheck, hits: [] }
  shopping: [],    // { id, text, store, price, currency, until, done }
  history: {},     // q -> { 'YYYY-MM-DD': { min, minUnit, base, store } }
  news: [],        // { at, watchId, q, offer }
});

function open(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'preisfinder.json');
  let data = DEFAULTS();
  if (fs.existsSync(file)) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const d = DEFAULTS();
    data = { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } };
  }
  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(flush, 200);
  }
  function flush() {
    clearTimeout(timer);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }
  return { data, save, flush, file };
}

module.exports = { open, DEFAULTS };
