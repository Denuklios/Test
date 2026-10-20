// Kauf-Lizenzen der Desktop-Programme: Schlüssel, Aktivierung, Geräte-Grenze, Sperre, Offline-Freischaltung, Kauf per Webhook
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-'));
process.env.DATA_DIR = tmp;
process.env.ADMIN_EMAIL = 'chef@example.com';
process.env.ADMIN_PASSWORD = 'admin-passwort-123';
process.env.GEOIP = 'off';
process.env.LEMONSQUEEZY_SECRET = 'ls-geheim';
process.env.LICENSE_VARIANTS = '111:laser, 222:fraes';
process.env.LICENSE_RENEW_VARIANTS = '333:laser';
process.env.LICENSE_RENEW_URLS = 'laser=https://shop.example/renew-laser';
delete process.env.SMTP_HOST;
delete process.env.LICENSE_PRIVATE_KEY;
const L = require('../server/licenses.js');
const { server, ensureAdmin, LIC, updateReminders } = require('../server/server.js');

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER:', m); } else console.log('ok', m); };

// Schlüssel: Format, Prüfzeichen, Tippfehler, Kleinschreibung
{
  const k = L.makeKey('laser');
  ok(/^LSR-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(k), 'Schlüsselformat ' + k);
  ok(L.normKey(k) === k && L.normKey(' ' + k.toLowerCase().replace(/-/g, ' ') + ' ') === k, 'Schlüssel: Leerzeichen und Kleinschreibung egal');
  const bad = k.slice(0, -1) + (k.endsWith('0') ? '1' : '0');
  ok(L.normKey(bad) === null, 'Tippfehler wird erkannt');
  let typos = 0;
  for (let i = 0; i < 200; i++) { const x = L.makeKey('stick'); const j = 4 + (i % 23); if (x[j] === '-') continue; const y = x.slice(0, j) + (x[j] === 'A' ? 'B' : 'A') + x.slice(j + 1); if (L.normKey(y)) typos++; }
  ok(typos < 15, `einzelne Tippfehler fast immer erkannt (${typos}/200 durchgerutscht)`);
  ok(L.productOfKey(k) === 'laser', 'Programm am Kürzel erkennbar');
}

(async () => {
  ensureAdmin();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (p, body, opts = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (opts.admin) { headers.Cookie = cookie; headers['X-Requested-With'] = 'StickStudio'; }
    const r = await fetch(base + p, { method: opts.method || (body === undefined ? 'GET' : 'POST'), headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    return { status: r.status, data: await r.json().catch(() => ({})), r };
  };
  // Admin anmelden
  const lr = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=chef%40example.com&password=admin-passwort-123', redirect: 'manual' });
  cookie = (lr.headers.getSetCookie()[0] || '').split(';')[0];
  ok(cookie.startsWith('sid='), 'Admin angemeldet');

  // Lizenz anlegen
  let r = await call('/api/admin/licenses', { product: 'laser', name: 'Max Muster', email: 'max@example.com', max: 2 }, { admin: true });
  ok(r.status === 200 && r.data.list.length === 1, 'Admin legt Lizenz an');
  const lic = r.data.list[0];
  r = await call('/api/admin/licenses', undefined, { admin: true });
  ok(r.data.publicKey.includes('PUBLIC KEY') && r.data.list.length === 1, 'Verwaltung zeigt Lizenzen und öffentlichen Schlüssel');
  const pub = crypto.createPublicKey(r.data.publicKey);

  // ohne Anmeldung: nicht an die Verwaltung
  r = await call('/api/admin/licenses');
  ok(r.status === 401, 'Lizenzliste nur für den Admin');

  // Aktivieren
  const m1 = crypto.randomBytes(16).toString('hex'), m2 = crypto.randomBytes(16).toString('hex'), m3 = crypto.randomBytes(16).toString('hex');
  r = await call('/api/license/activate', { key: lic.key.toLowerCase(), machine: m1, product: 'laser', label: 'Werkstatt-PC', version: '1.0.0' });
  ok(r.status === 200 && r.data.ok && r.data.name === 'Max Muster', 'Aktivierung auf Gerät 1');
  const tok = L.verifyToken(pub, r.data.token);
  ok(tok && tok.m === m1 && tok.p === 'laser' && tok.exp > tok.chk && tok.chk > Date.now(), 'Freigabe ist signiert und an das Gerät gebunden');
  ok(L.verifyToken(pub, r.data.token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))) === null, 'Veränderte Freigabe wird abgelehnt');
  const fake = crypto.generateKeyPairSync('ed25519').privateKey;
  ok(L.verifyToken(pub, L.signToken(fake, { ...tok, exp: tok.exp * 2 })) === null, 'Selbst gebaute Freigabe (fremder Schlüssel) wird abgelehnt');
  r = await call('/api/license/activate', { key: lic.key, machine: m1, product: 'stick' });
  ok(r.status === 400 && r.data.error === 'product', 'Schlüssel für anderes Programm abgelehnt');
  r = await call('/api/license/check', { key: lic.key, machine: m1, product: 'laser' });
  ok(r.status === 200, 'Regelmäßige Prüfung erneuert die Freigabe');
  r = await call('/api/license/activate', { key: lic.key, machine: m2, product: 'laser' });
  ok(r.status === 200 && r.data.devices === 2, 'Gerät 2');
  r = await call('/api/license/activate', { key: lic.key, machine: m3, product: 'laser' });
  ok(r.status === 409 && r.data.error === 'devices', 'Gerät 3 über der Grenze abgelehnt');
  r = await call('/api/license/deactivate', { key: lic.key, machine: m2 });
  r = await call('/api/license/activate', { key: lic.key, machine: m3, product: 'laser' });
  ok(r.status === 200, 'Nach Freigabe von Gerät 2 klappt Gerät 3');
  r = await call('/api/license/activate', { key: 'LSR-AAAAA-AAAAA-AAAAA-AAAAA', machine: m1 });
  ok(r.status === 400 && r.data.error === 'key', 'Falscher Schlüssel abgelehnt');

  // Sperren
  r = await call('/api/admin/licenses/' + lic.id, { revoked: true }, { admin: true });
  r = await call('/api/license/check', { key: lic.key, machine: m1, product: 'laser' });
  ok(r.status === 403 && r.data.error === 'revoked', 'Gesperrte Lizenz wird bei der nächsten Prüfung abgelehnt');
  await call('/api/admin/licenses/' + lic.id, { revoked: false, resetDevices: true }, { admin: true });
  r = await call('/api/admin/licenses/' + lic.id, undefined, { admin: true });
  ok(r.data.devices.length === 0 && !r.data.revoked, 'Entsperrt, Geräte zurückgesetzt');

  // Offline-Freischaltung
  r = await call(`/api/admin/licenses/${lic.id}/offline`, { machine: m1.toUpperCase(), days: 365 }, { admin: true });
  const off = L.verifyToken(pub, r.data.token);
  ok(off && off.m === m1 && off.exp - Date.now() > 360 * 864e5, 'Offline-Freischaltung für 365 Tage');

  // Kauf über Lemon Squeezy → Lizenz automatisch
  const hook = async (obj) => {
    const raw = JSON.stringify(obj);
    return fetch(base + '/api/webhook/lemonsqueezy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature': crypto.createHmac('sha256', 'ls-geheim').update(raw).digest('hex') }, body: raw });
  };
  const order = { meta: { event_name: 'order_created' }, data: { type: 'orders', id: '9001', attributes: { user_email: 'kaeufer@example.com', user_name: 'Erika Käufer', first_order_item: { variant_id: 222, quantity: 1 } } } };
  r = await hook(order);
  ok(r.status === 200, 'Webhook Kauf angenommen');
  await hook(order);
  r = await call('/api/admin/licenses?q=kaeufer', undefined, { admin: true });
  ok(r.data.list.length === 1 && r.data.list[0].product === 'fraes' && r.data.list[0].order_id === '9001', 'Kauf legt genau eine FräsStudio-Lizenz an (auch bei doppeltem Webhook)');
  const bought = r.data.list[0];
  r = await hook({ meta: { event_name: 'order_refunded' }, data: { type: 'orders', id: '9001', attributes: {} } });
  r = await call('/api/license/activate', { key: bought.key, machine: m1, product: 'fraes' });
  ok(r.status === 403, 'Nach Erstattung gesperrt');

  // Updates: 1 Jahr inklusive, Verlängerung per Kauf, Erinnerung
  {
    const l2 = LIC.create({ product: 'laser', name: 'Upd', email: 'upd@example.com' });
    const d1 = l2.updates_until - Date.now();
    ok(Math.abs(d1 - 365 * 864e5) < 6e4, 'Neue Lizenz: Updates 1 Jahr inklusive');
    r = await call('/api/license/activate', { key: l2.key, machine: m2, product: 'laser' });
    ok(L.verifyToken(pub, r.data.token).u === l2.updates_until, 'Freigabe enthält „Updates bis“');
    r = await hook({ meta: { event_name: 'order_created', custom_data: { license_key: l2.key } }, data: { type: 'orders', id: '7001', attributes: { user_email: 'irgendwer@example.com', first_order_item: { variant_id: 333, quantity: 1 } } } });
    const l2b = LIC.byKey(l2.key);
    ok(Math.abs(l2b.updates_until - l2.updates_until - 365 * 864e5) < 6e4, 'Verlängerung (Schlüssel aus dem Kauf-Link) verschiebt um 1 Jahr');
    await hook({ meta: { event_name: 'order_created', custom_data: { license_key: l2.key } }, data: { type: 'orders', id: '7001', attributes: { first_order_item: { variant_id: 333 } } } });
    ok(LIC.byKey(l2.key).updates_until === l2b.updates_until, 'Doppelter Webhook verlängert nicht zweimal');
    await hook({ meta: { event_name: 'order_created' }, data: { type: 'orders', id: '7002', attributes: { user_email: 'upd@example.com', first_order_item: { variant_id: 333 } } } });
    ok(LIC.byKey(l2.key).updates_until > l2b.updates_until, 'Verlängerung ohne Schlüssel: über die E-Mail gefunden');
    r = await call('/api/license/check', { key: l2.key, machine: m2, product: 'laser' });
    ok(L.verifyToken(pub, r.data.token).u === LIC.byKey(l2.key).updates_until, 'Nächste Prüfung liefert das neue Datum');
    const id2 = LIC.byKey(l2.key).id;
    await call('/api/admin/licenses/' + id2, { updatesUntil: Date.now() + 5 * 864e5 }, { admin: true });
    const before = (LIC.dueReminders(14) || []).length;
    await updateReminders();
    ok(before >= 1 && LIC.dueReminders(14).length === 0, 'Erinnerung vor Ende der Updates (einmal)');
    r = await call('/api/admin/licenses/' + id2, { addYear: true }, { admin: true });
    ok(r.data.updates_until > Date.now() + 360 * 864e5, 'Verwaltung: +1 Jahr Updates');
  }

  // Schlüssel bleibt nach Neustart gleich (Datei im Datenordner)
  ok(fs.existsSync(path.join(tmp, 'license-signing.pem')), 'Signaturschlüssel im Datenordner gespeichert');

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fail ? `${fail} Fehler` : 'Alle Lizenz-Tests bestanden.');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
