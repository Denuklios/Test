// Lizenz im Desktop-Programm: Testzeit, Freischalten, regelmäßige Prüfung, offline, Sperre, Uhr zurückgestellt
// Läuft gegen den echten Lizenzteil des Servers (server/licenses.js) mit einer Speicher-Datenbank.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const SL = require('../server/licenses.js');
const DL = require('./license.js');

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER:', m); } else console.log('ok', m); };
const DAY = 864e5;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dlic-'));
  let t = Date.UTC(2026, 0, 1);
  const now = () => t;
  const server = SL.init({ db: new DatabaseSync(':memory:'), dataDir: tmp, env: {}, now });
  let online = true;
  // fetch-Attrappe: leitet an den Server-Teil weiter
  const fakeFetch = async (url, o) => {
    if (!online) throw new Error('offline');
    const b = JSON.parse(o.body), p = new URL(url).pathname;
    const r = p === '/api/license/deactivate' ? server.deactivate(b) : server.activate(b);
    return { ok: r.ok !== false, status: r.ok === false ? r.code : 200, json: async () => r };
  };
  const cfg = { product: 'laser', code: 'LSR', name: 'LaserStudio', server: 'https://lizenz.example', trialDays: 14, version: '1.0.0', publicKey: server.publicPem };
  const mk = (machine = 'a'.repeat(32), dir = path.join(tmp, 'u1')) => DL.create(cfg, dir, { now, fetch: fakeFetch, machine, trailFile: path.join(dir, 'spur') });

  let L = mk();
  let st = L.state();
  ok(st.status === 'trial' && st.daysLeft === 14, 'Erster Start: 14 Tage Test');
  t += 15 * DAY;
  ok(L.state().status === 'expired', 'Nach 15 Tagen: Testzeit vorbei');

  const lic = server.create({ product: 'laser', name: 'Max Muster', max: 1 });
  await L.activate('lsr ' + lic.key.slice(4).replace(/-/g, ' ').toLowerCase()).then(() => {}, (e) => ok(false, 'Aktivieren: ' + e.message));
  st = L.state();
  ok(st.status === 'licensed' && st.name === 'Max Muster', 'Freigeschaltet (Schlüssel mit Leerzeichen/Kleinbuchstaben)');
  let err = await L.activate('FRS-' + lic.key.slice(4)).catch((e) => e.message);
  ok(/kein Schlüssel für LaserStudio|Tippfehler/.test(err), 'Schlüssel eines anderen Programms abgelehnt: ' + err);

  // neu starten (Datei wird gelesen)
  L = mk();
  ok(L.state().status === 'licensed', 'Nach Neustart weiter freigeschaltet');

  // Prüfung fällig nach 7 Tagen, offline bis 30 Tage weiter nutzbar
  t += 8 * DAY;
  st = L.state();
  ok(st.status === 'licensed' && st.checkDue, 'Nach 8 Tagen: Prüfung fällig, Programm läuft');
  online = false;
  st = await L.check();
  ok(st.status === 'licensed', 'Offline: Prüfung schlägt still fehl, Lizenz gilt weiter');
  t += 25 * DAY;
  st = L.state();
  ok(st.status === 'offline', 'Über 30 Tage ohne Prüfung: gesperrt bis zur Verbindung');
  online = true;
  st = await L.check();
  ok(st.status === 'licensed' && !st.checkDue, 'Wieder online: Prüfung erneuert, entsperrt');

  // Zweites Gerät über der Grenze (max 1)
  const L2 = mk('b'.repeat(32), path.join(tmp, 'u2'));
  err = await L2.activate(lic.key).catch((e) => e.message);
  ok(/Gerät/.test(err), 'Zweites Gerät abgelehnt (Grenze 1)');
  await L.deactivate();
  ok(L.state().status === 'expired', 'Gerät 1 freigegeben → dort gesperrt (Testzeit war vorbei)');
  await L2.activate(lic.key);
  ok(L2.state().status === 'licensed', 'Gerät 2 jetzt freigeschaltet');

  // Freigabe auf fremdes Gerät kopieren
  const data = JSON.parse(fs.readFileSync(path.join(tmp, 'u2', 'lizenz.json'), 'utf8'));
  fs.mkdirSync(path.join(tmp, 'u3'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'u3', 'lizenz.json'), JSON.stringify(data));
  ok(mk('c'.repeat(32), path.join(tmp, 'u3')).state().status === 'invalid', 'Kopierte Lizenzdatei gilt auf anderem Gerät nicht');

  // Sperre durch den Verkäufer
  server.update(lic.id, { revoked: true });
  t += 8 * DAY;
  st = await L2.check();
  ok(st.status === 'revoked', 'Gesperrt bei der nächsten Prüfung');

  // Uhr zurückstellen
  const lic2 = server.create({ product: 'laser', name: 'Uhr', max: 2 });
  const L4 = mk('d'.repeat(32), path.join(tmp, 'u4'));
  await L4.activate(lic2.key);
  t += 2 * DAY; L4.state();
  t -= 5 * DAY;
  ok(L4.state().status === 'offline', 'Uhr zurückgestellt: Online-Prüfung nötig');
  t += 5 * DAY;

  // Testzeit lässt sich durch Löschen der Lizenzdatei nicht neu starten
  const dir5 = path.join(tmp, 'u5');
  const L5 = mk('e'.repeat(32), dir5);
  L5.state();
  t += 20 * DAY;
  fs.rmSync(path.join(dir5, 'lizenz.json'));
  ok(mk('e'.repeat(32), dir5).state().status === 'expired', 'Neuinstallation startet die Testzeit nicht neu');

  // Offline-Freischaltung
  const lic3 = server.create({ product: 'laser', name: 'Ohne Netz' });
  const code = server.offlineGrant(lic3.id, 'f'.repeat(32), 365);
  const L6 = mk('f'.repeat(32), path.join(tmp, 'u6'));
  ok(L6.offline(lic3.key, code).status === 'licensed', 'Offline-Freischaltcode angenommen');
  err = (() => { try { mk('a'.repeat(32), path.join(tmp, 'u7')).offline(lic3.key, code); return ''; } catch (e) { return e.message; } })();
  ok(/passt nicht/.test(err), 'Freischaltcode eines anderen Geräts abgelehnt');

  // Updates: neue Version nach Ablauf der Updates läuft nicht, alte schon; Verlängerung schaltet frei
  {
    const lic4 = server.create({ product: 'laser', name: 'Upd' });
    const dir8 = path.join(tmp, 'u8');
    const old = DL.create({ ...cfg, released: t }, dir8, { now, fetch: fakeFetch, machine: '9'.repeat(32), trailFile: path.join(dir8, 's') });
    await old.activate(lic4.key);
    ok(old.state().status === 'licensed' && old.state().updatesUntil > t, 'Version im Update-Zeitraum läuft');
    t += 400 * DAY;
    await old.check();
    ok(old.state().status === 'licensed', 'Nach 13 Monaten: bisherige Version läuft weiter');
    const neu = DL.create({ ...cfg, released: t - DAY }, dir8, { now, fetch: fakeFetch, machine: '9'.repeat(32), trailFile: path.join(dir8, 's') });
    st = neu.state();
    ok(st.status === 'updates' && /neuer als deine Updates/.test(st.message), 'Neue Version nach Ablauf der Updates: Hinweis statt Programm');
    server.update(lic4.id, { addYear: true });
    st = await neu.check();
    ok(st.status === 'licensed', 'Nach Verlängerung: „Jetzt prüfen“ schaltet die neue Version frei');
  }

  // Sprache der Meldungen: Standard Deutsch, sonst Englisch/Dänisch (auch die Meldungen vom Server)
  {
    const dir9 = path.join(tmp, 'u9');
    const da = DL.create(cfg, dir9, { now, fetch: fakeFetch, machine: '8'.repeat(32), trailFile: path.join(dir9, 's'), lang: 'da' });
    da.state();
    t += 20 * DAY;
    ok(da.lang === 'da' && /Prøveperioden er udløbet/.test(da.state().message), 'Dänisch: Testzeit abgelaufen');
    da.setLang('en');
    ok(/trial period has ended/.test(da.state().message), 'Englisch nach setLang');
    da.setLang('xx');
    ok(da.lang === 'en', 'Unbekannte Sprache wird ignoriert');
    da.setLang('da');
    err = await da.activate('LSR-' + lic.key.slice(4)).catch((e) => e.message);
    ok(/licens|nøgle/i.test(err), 'Dänische Meldung vom Server: ' + err);
    err = await da.activate('FRS-' + lic.key.slice(4)).catch((e) => e.message);
    ok(/ikke en nøgle til LaserStudio|tastefejl/.test(err), 'Dänisch: Schlüssel eines anderen Programms abgelehnt');
    ok(DL.mapLocale('de-AT') === 'de' && DL.mapLocale('da') === 'da' && DL.mapLocale('nb-NO') === 'da' && DL.mapLocale('fr-FR') === 'en' && DL.mapLocale('') === 'en', 'Systemsprache → de/da/en');
  }

  ok(/^[0-9a-f]{32}$/.test(DL.machineId('laser')), 'Gerätekennung dieses Rechners: ' + DL.machineId('laser'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fail ? `${fail} Fehler` : 'Alle Desktop-Lizenz-Tests bestanden.');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
