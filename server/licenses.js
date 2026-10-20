/* Kauf-Lizenzen für die Desktop-Programme (StickStudio, FräsStudio, LaserStudio).
   - Lizenzschlüssel wie „LSR-7K2QX-M9D4T-HB3WN-R8P6C“ (Prüfzeichen am Ende erkennt Tippfehler)
   - Aktivierung je Gerät (Standard: 2 Geräte je Lizenz), Prüfung „zwischendurch“: das Programm meldet sich
     regelmäßig und bekommt eine signierte Freigabe (Ed25519), die offline eine Weile gilt
   - Sperren (z. B. nach Erstattung), Geräte freigeben, Offline-Freischaltung für Rechner ohne Internet
   Der private Signaturschlüssel liegt nur auf dem Server (LICENSE_PRIVATE_KEY oder DATA_DIR/license-signing.pem). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PRODUCTS = {
  stick: { code: 'STK', name: 'StickStudio' },
  fraes: { code: 'FRS', name: 'FräsStudio' },
  laser: { code: 'LSR', name: 'LaserStudio' },
};
const DAY = 864e5;
const CHECK_DAYS = 7; // so oft fragt das Programm nach
const OFFLINE_DAYS = 30; // so lange gilt eine Freigabe ohne Internet
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32: ohne I, L, O, U

function checksum(body) {
  let s = 0;
  for (let i = 0; i < body.length; i++) s = (s * 31 + ALPHA.indexOf(body[i]) + 7 * (i + 1)) % 32;
  return ALPHA[s];
}
/** Neuer Schlüssel: PRODUKT-XXXXX-XXXXX-XXXXX-XXXXY (Y = Prüfzeichen), ca. 95 Bit Zufall */
function makeKey(product) {
  const code = PRODUCTS[product] ? PRODUCTS[product].code : String(product).toUpperCase().slice(0, 3);
  const bytes = crypto.randomBytes(19);
  let body = '';
  for (let i = 0; i < 19; i++) body += ALPHA[bytes[i] % 32];
  const full = body + checksum(code + body);
  return `${code}-${full.slice(0, 5)}-${full.slice(5, 10)}-${full.slice(10, 15)}-${full.slice(15, 20)}`;
}
/** Eingabe säubern (Leerzeichen, Kleinbuchstaben, O→0, I/L→1) und prüfen. Liefert den Schlüssel oder null. */
function normKey(input) {
  const s = String(input || '').toUpperCase().replace(/[\s_–—]+/g, '-').replace(/^-+|-+$/g, '');
  const m = /^([A-Z]{3})-?([0-9A-Z]{5})-?([0-9A-Z]{5})-?([0-9A-Z]{5})-?([0-9A-Z]{5})$/.exec(s);
  if (!m) return null;
  // verwechselbare Zeichen nur im Zufallsteil angleichen (das Kürzel „LSR“ enthält ein L)
  const fix = (x) => x.replace(/O/g, '0').replace(/[IL]/g, '1');
  [m[2], m[3], m[4], m[5]] = [fix(m[2]), fix(m[3]), fix(m[4]), fix(m[5])];
  const body = m[2] + m[3] + m[4] + m[5];
  if ([...body].some((c) => !ALPHA.includes(c))) return null;
  if (checksum(m[1] + body.slice(0, 19)) !== body[19]) return null;
  return `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}`;
}
const productOfKey = (key) => Object.keys(PRODUCTS).find((p) => key.startsWith(PRODUCTS[p].code + '-')) || null;

const b64u = (buf) => Buffer.from(buf).toString('base64url');
/** Freigabe signieren: base64url(JSON) + "." + base64url(Signatur) */
function signToken(privateKey, payload) {
  const body = b64u(JSON.stringify(payload));
  return body + '.' + b64u(crypto.sign(null, Buffer.from(body), privateKey));
}
/** Freigabe prüfen (auch im Desktop-Programm benutzt). Liefert die Nutzdaten oder null. */
function verifyToken(publicKey, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  try {
    if (!crypto.verify(null, Buffer.from(body), publicKey, Buffer.from(sig, 'base64url'))) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (e) { return null; }
}

function loadSigningKey(dataDir, env) {
  if (env.LICENSE_PRIVATE_KEY) return crypto.createPrivateKey(env.LICENSE_PRIVATE_KEY.replace(/\\n/g, '\n'));
  const file = env.LICENSE_KEY_FILE || path.join(dataDir, 'license-signing.pem');
  if (!fs.existsSync(file)) {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    console.log(`Neuer Lizenz-Signaturschlüssel angelegt: ${file} – öffentlichen Schlüssel in der Verwaltung („Kauf-Lizenzen“) in die Desktop-Programme übernehmen.`);
  }
  return crypto.createPrivateKey(fs.readFileSync(file, 'utf8'));
}

function init({ db, dataDir, env = process.env, now = Date.now, log = () => {} }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      product TEXT NOT NULL,                     -- stick | fraes | laser
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      max_devices INTEGER NOT NULL DEFAULT 2,
      revoked INTEGER NOT NULL DEFAULT 0,        -- Zeitpunkt der Sperre (0 = gültig)
      order_id TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      machine TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      first INTEGER NOT NULL,
      last INTEGER NOT NULL,
      UNIQUE(license_id, machine)
    );
    CREATE INDEX IF NOT EXISTS licenses_email ON licenses(email);
  `);
  const priv = loadSigningKey(dataDir, env);
  const pub = crypto.createPublicKey(priv);
  const publicPem = pub.export({ type: 'spki', format: 'pem' });

  const byKey = (key) => db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);
  const devices = (id) => db.prepare('SELECT * FROM activations WHERE license_id = ? ORDER BY last DESC').all(id);
  const fail = (code, error, message) => ({ ok: false, code, error, message });

  function grant(lic, machine, days) {
    const t = now();
    return signToken(priv, {
      v: 1, p: lic.product, k: crypto.createHash('sha256').update(lic.key).digest('hex').slice(0, 16), m: machine,
      n: lic.name || lic.email || '', iat: t, chk: t + CHECK_DAYS * DAY, exp: t + (days || OFFLINE_DAYS) * DAY,
    });
  }

  /** Aktivieren oder regelmäßig prüfen. b: {key, machine, product, label, version} */
  function activate(b, ip = '') {
    const key = normKey(b.key);
    if (!key) return fail(400, 'key', 'Der Lizenzschlüssel ist ungültig (Tippfehler?).');
    const machine = String(b.machine || '').slice(0, 128);
    if (!/^[0-9a-f]{32,64}$/.test(machine)) return fail(400, 'machine', 'Gerätekennung fehlt.');
    const lic = byKey(key);
    if (!lic) return fail(404, 'unknown', 'Diesen Lizenzschlüssel gibt es nicht.');
    if (b.product && lic.product !== b.product) return fail(400, 'product', `Dieser Schlüssel gilt für ${PRODUCTS[lic.product] ? PRODUCTS[lic.product].name : lic.product}.`);
    if (lic.revoked) return fail(403, 'revoked', 'Diese Lizenz wurde gesperrt. Bitte wende dich an den Verkäufer.');
    const have = devices(lic.id);
    const mine = have.find((a) => a.machine === machine);
    if (!mine && have.length >= lic.max_devices) {
      return fail(409, 'devices', `Die Lizenz ist schon auf ${have.length} Gerät(en) aktiviert (erlaubt: ${lic.max_devices}). Auf einem alten Gerät unter „Lizenz“ → „Dieses Gerät freigeben“ abmelden oder den Verkäufer fragen.`);
    }
    const t = now(), label = String(b.label || '').slice(0, 100), version = String(b.version || '').slice(0, 30);
    if (mine) db.prepare('UPDATE activations SET last = ?, label = ?, version = ?, ip = ? WHERE id = ?').run(t, label || mine.label, version, ip, mine.id);
    else { db.prepare('INSERT INTO activations(license_id, machine, label, version, ip, first, last) VALUES(?, ?, ?, ?, ?, ?, ?)').run(lic.id, machine, label, version, ip, t, t); log('lizenz-aktiviert', `${key} · ${label}`); }
    return { ok: true, token: grant(lic, machine), name: lic.name || lic.email, product: lic.product, devices: have.length + (mine ? 0 : 1), max: lic.max_devices };
  }

  function deactivate(b) {
    const key = normKey(b.key);
    const lic = key && byKey(key);
    if (!lic) return fail(404, 'unknown', 'Diesen Lizenzschlüssel gibt es nicht.');
    const r = db.prepare('DELETE FROM activations WHERE license_id = ? AND machine = ?').run(lic.id, String(b.machine || ''));
    if (r.changes) log('lizenz-freigegeben', key);
    return { ok: true };
  }

  function create({ product, name = '', email = '', max = 2, note = '', order = '' }) {
    if (!PRODUCTS[product]) throw Object.assign(new Error('Unbekanntes Programm'), { code: 400 });
    let key;
    do key = makeKey(product); while (byKey(key));
    db.prepare('INSERT INTO licenses(key, product, name, email, max_devices, note, order_id, created) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
      .run(key, product, String(name).slice(0, 200), String(email).slice(0, 200).toLowerCase(), Math.max(1, Math.min(50, max | 0 || 2)), String(note).slice(0, 2000), String(order).slice(0, 100), now());
    log('lizenz-neu', `${key} · ${email || name}`);
    return byKey(key);
  }

  function list(q = '') {
    const like = '%' + q + '%';
    return db.prepare(`SELECT l.*, (SELECT COUNT(*) FROM activations a WHERE a.license_id = l.id) AS used,
      (SELECT MAX(last) FROM activations a WHERE a.license_id = l.id) AS seen FROM licenses l
      WHERE l.key LIKE ? OR l.email LIKE ? OR l.name LIKE ? OR l.order_id LIKE ? ORDER BY l.created DESC LIMIT 500`).all(like, like, like, like);
  }

  function update(id, b) {
    const lic = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
    if (!lic) return null;
    const v = {
      name: b.name !== undefined ? String(b.name).slice(0, 200) : lic.name,
      email: b.email !== undefined ? String(b.email).slice(0, 200).toLowerCase() : lic.email,
      max: b.max !== undefined ? Math.max(1, Math.min(50, b.max | 0)) : lic.max_devices,
      note: b.note !== undefined ? String(b.note).slice(0, 2000) : lic.note,
      revoked: b.revoked !== undefined ? (b.revoked ? lic.revoked || now() : 0) : lic.revoked,
    };
    db.prepare('UPDATE licenses SET name = ?, email = ?, max_devices = ?, note = ?, revoked = ? WHERE id = ?').run(v.name, v.email, v.max, v.note, v.revoked, id);
    if (b.revoked !== undefined && !!b.revoked !== !!lic.revoked) log(b.revoked ? 'lizenz-gesperrt' : 'lizenz-entsperrt', lic.key);
    if (b.resetDevices) db.prepare('DELETE FROM activations WHERE license_id = ?').run(id);
    if (b.removeDevice) db.prepare('DELETE FROM activations WHERE license_id = ? AND id = ?').run(id, b.removeDevice | 0);
    return db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
  }

  /** Offline-Freischaltung für einen Rechner ohne Internet (Gerätecode aus dem Programm, gilt 'days' Tage) */
  function offlineGrant(id, machine, days = 365) {
    const lic = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id);
    if (!lic) return null;
    machine = String(machine || '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
    if (!/^[0-9a-f]{32,64}$/.test(machine)) throw Object.assign(new Error('Gerätecode ungültig'), { code: 400 });
    const t = now();
    const a = db.prepare('SELECT * FROM activations WHERE license_id = ? AND machine = ?').get(lic.id, machine);
    if (a) db.prepare('UPDATE activations SET last = ? WHERE id = ?').run(t, a.id);
    else db.prepare('INSERT INTO activations(license_id, machine, label, first, last) VALUES(?, ?, ?, ?, ?)').run(lic.id, machine, 'Offline-Freischaltung', t, t);
    log('lizenz-offline', lic.key);
    return grant(lic, machine, Math.max(1, Math.min(3650, days | 0)));
  }

  /** Lemon Squeezy: Einmalkauf (order_created) → Lizenz(en) anlegen. LICENSE_VARIANTS = "123:laser,456:fraes,789:stick" */
  function fromOrder(attrs, orderId) {
    const map = {};
    for (const part of String(env.LICENSE_VARIANTS || '').split(',')) { const [v, p] = part.split(':').map((x) => x && x.trim()); if (v && PRODUCTS[p]) map[v] = p; }
    const item = attrs.first_order_item || {};
    const product = map[String(item.variant_id || '')] || map[String(item.product_id || '')];
    if (!product) return [];
    if (db.prepare('SELECT 1 FROM licenses WHERE order_id = ?').get(String(orderId))) return []; // schon angelegt (Webhook doppelt)
    const qty = Math.max(1, Math.min(20, item.quantity | 0 || 1));
    const out = [];
    for (let i = 0; i < qty; i++) out.push(create({ product, name: attrs.user_name || '', email: attrs.user_email || '', order: String(orderId), note: 'Lemon Squeezy' }));
    return out;
  }
  const revokeOrder = (orderId) => db.prepare('UPDATE licenses SET revoked = ? WHERE order_id = ? AND revoked = 0').run(now(), String(orderId)).changes;

  return { PRODUCTS, publicPem, activate, deactivate, create, list, update, devices, offlineGrant, fromOrder, revokeOrder, byKey };
}

module.exports = { init, makeKey, normKey, productOfKey, signToken, verifyToken, PRODUCTS, CHECK_DAYS, OFFLINE_DAYS };
