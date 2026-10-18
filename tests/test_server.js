// Server: Registrierung, Anmeldung, Testversion, Lizenzsperre, Export auf dem Server, Admin, Rechtstexte, Schutz des Formatcodes
const path = require('path');
const fs = require('fs');
const os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stick-'));
process.env.DATA_DIR = tmp;
process.env.ADMIN_EMAIL = 'chef@example.com';
process.env.ADMIN_PASSWORD = 'admin-passwort-123';
process.env.PORT = '0';
process.env.TRUST_PROXY = '1';
process.env.GEOIP = 'off';
process.env.LEMONSQUEEZY_SECRET = 'ls-geheim';
delete process.env.LEMONSQUEEZY_API_KEY;
delete process.env.SMTP_HOST;
const { server, db, ensureAdmin, geo } = require('../server/server.js');

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER:', m); } else console.log('ok', m); };

(async () => {
  ensureAdmin();
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = {};
  const req = async (who, p, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (jar[who]) headers.Cookie = jar[who];
    const r = await fetch(base + p, { method: opts.method || 'GET', headers, body: opts.body, redirect: 'manual' });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of sc) { const m = /^sid=([^;]*)/.exec(c); if (m) jar[who] = m[1] ? 'sid=' + m[1] : ''; }
    return r;
  };
  const form = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
  const api = (who, p, method = 'GET', body) => req(who, p, { method, headers: { 'X-Requested-With': 'StickStudio', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

  // ohne Anmeldung: Programm und Code nicht erreichbar
  let r = await req('anon', '/');
  ok(r.status === 303 && r.headers.get('location').startsWith('/login'), 'ohne Anmeldung → Login-Seite');
  r = await req('anon', '/js/app.js');
  ok(r.status === 303, 'Programmcode ohne Anmeldung gesperrt');
  r = await req('anon', '/legal/impressum');
  ok(r.status === 200, 'Rechtstexte öffentlich');

  // Registrierung
  r = await req('kunde', '/register', form({ email: 'kunde@example.com', password: 'kurz', password2: 'kurz', accept: '1' }));
  ok(r.status === 400, 'zu kurzes Passwort abgelehnt');
  r = await req('kunde', '/register', form({ email: 'kunde@example.com', password: 'geheimes-passwort', password2: 'geheimes-passwort' }));
  ok(r.status === 400, 'ohne AGB-Zustimmung abgelehnt');
  r = await req('kunde', '/register', form({ email: 'kunde@example.com', password: 'geheimes-passwort', password2: 'geheimes-passwort', accept: '1', name: 'Stickerei Muster', lang: 'de' }));
  ok(r.status === 303 && jar.kunde, 'Registrierung meldet direkt an');
  r = await api('kunde', '/api/me');
  let me = (await r.json()).user;
  ok(me.license.trial && me.license.daysLeft === 14 && !me.license.viewOnly, `Testversion 14 Tage (${me.license.daysLeft})`);

  // Programmseite ohne Formatcode, Formatcode nicht abrufbar
  r = await req('kunde', '/');
  const html = await r.text();
  const built = fs.existsSync(path.join(__dirname, '..', 'dist', 'manifest.json'));
  const bundleSrc = (/src="(\/app\/app\.[0-9a-f]+\.js)"/.exec(html) || [])[1];
  ok(r.status === 200 && (built ? !!bundleSrc && !html.includes('js/app.js') : html.includes('js/online.js')) && !html.includes('dst_io.js') && !html.includes('formats.js'), 'Programmseite ohne Formatcode, mit Online-Anbindung' + (built ? ' (verschleierte Datei)' : ''));
  ok(r.headers.get('content-security-policy').includes("script-src 'self'"), 'Sicherheitsrichtlinie gesetzt');
  r = await req('kunde', '/js/dst_io.js');
  ok(r.status === 404, 'dst_io.js wird nicht ausgeliefert');
  r = await req('kunde', '/js/formats.js');
  ok(r.status === 404, 'formats.js wird nicht ausgeliefert');
  r = await req('kunde', '/js/app.js');
  if (built) {
    ok(r.status === 404, 'lesbarer Quelltext wird nicht ausgeliefert');
    r = await req('kunde', bundleSrc);
    const code = await r.text();
    ok(r.status === 200 && /lizenziert für Konto [0-9a-f]{16}/.test(code) && !code.includes('function removeOverlaps'), 'verschleierte Programmdatei mit Konto-Kennung');
    r = await req('anon', bundleSrc);
    ok(r.status === 303, 'Programmdatei ohne Anmeldung gesperrt');
  } else ok(r.status === 200, 'Programmcode angemeldet erreichbar');
  r = await req('kunde', '/js/../server/server.js');
  ok(r.status === 404 || r.status === 303, 'kein Zugriff auf Servercode');

  // Export auf dem Server
  const cmds = [{ x: 0, y: 0, cmd: 'jump' }, { x: 5, y: 0, cmd: 'stitch' }, { x: 5, y: 5, cmd: 'stitch' }, { x: 0, y: 5, cmd: 'stitch' }];
  r = await api('kunde', '/api/export', 'POST', { fmt: 'dst', cmds, palette: [{ hex: '#ff0000' }], name: 'Test' });
  const dst = new Uint8Array(await r.arrayBuffer());
  ok(r.status === 200 && dst.length > 512 && String.fromCharCode(...dst.slice(0, 3)) === 'LA:', `DST-Export (${dst.length} Bytes)`);
  r = await api('kunde', '/api/export', 'POST', { fmt: 'pes', cmds, palette: [{ hex: '#ff0000' }], name: 'Test' });
  const pes = new Uint8Array(await r.arrayBuffer());
  ok(r.status === 200 && String.fromCharCode(...pes.slice(0, 4)) === '#PES', 'PES-Export');
  r = await req('kunde', '/api/import?fmt=dst', { method: 'POST', headers: { 'X-Requested-With': 'StickStudio', 'Content-Type': 'application/octet-stream' }, body: dst });
  const imp = await r.json();
  ok(r.status === 200 && imp.cmds.filter((c) => c.cmd === 'stitch').length === 3, 'Import auf dem Server');
  r = await req('kunde', '/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok(r.status === 403, 'API ohne Schutz-Kopfzeile abgelehnt (fremde Seiten)');

  // Projekte
  r = await api('kunde', '/api/projects', 'POST', { name: 'Logo', tags: ['Verein'], data: '{"objects":[]}', stitches: 100 });
  const pid = (await r.json()).id;
  ok(r.status === 200 && pid, 'Projekt gespeichert');
  r = await api('kunde', '/api/projects');
  ok((await r.json()).length === 1, 'Projektliste');

  // Lizenz abgelaufen → nur ansehen
  db.prepare('UPDATE users SET trial_until = ? WHERE email = ?').run(Date.now() - 1000, 'kunde@example.com');
  r = await api('kunde', '/api/me');
  me = (await r.json()).user;
  ok(me.license.viewOnly, 'nach Ablauf: nur ansehen');
  r = await api('kunde', '/api/export', 'POST', { fmt: 'dst', cmds, palette: [] });
  ok(r.status === 402, 'Export nach Ablauf gesperrt');
  r = await api('kunde', '/api/projects/' + pid, 'PUT', { name: 'Logo', data: '{"objects":[]}' });
  ok(r.status === 402, 'Speichern nach Ablauf gesperrt');
  r = await api('kunde', '/api/projects/' + pid);
  ok(r.status === 200, 'Ansehen nach Ablauf erlaubt');

  // Admin
  r = await api('kunde', '/api/admin/users');
  ok(r.status === 403, 'Kunde kommt nicht in die Verwaltung');
  r = await req('admin', '/login', form({ email: 'chef@example.com', password: 'falsch-falsch' }));
  ok(r.status === 401, 'falsches Admin-Passwort abgelehnt');
  r = await req('admin', '/login', form({ email: 'chef@example.com', password: 'admin-passwort-123' }));
  ok(r.status === 303 && jar.admin, 'Admin-Anmeldung');
  r = await api('admin', '/api/admin/users?q=kunde');
  const list = await r.json();
  ok(list.length === 1 && list[0].license.viewOnly, 'Admin sieht Kunden mit abgelaufener Lizenz');
  r = await api('admin', `/api/admin/users/${list[0].id}/extend`, 'POST', { days: 365 });
  r = await api('kunde', '/api/me');
  me = (await r.json()).user;
  ok(!me.license.viewOnly && me.license.daysLeft >= 364, 'Lizenz um ein Jahr verlängert');
  r = await api('admin', '/api/admin/settings', 'POST', { company: 'Stickerei Test', street: 'Hauptstraße 1', trial_days: '30' });
  r = await req('anon', '/legal/impressum');
  const imp2 = await r.text();
  ok(imp2.includes('Stickerei Test'), 'Firmendaten erscheinen im Impressum');
  r = await req('anon', '/register?lang=en');
  ok((await r.text()).includes('30 days'), 'Testzeitraum aus den Einstellungen, englische Seite');
  r = await api('admin', `/api/admin/users/${list[0].id}`, 'POST', { blocked: true });
  r = await api('kunde', '/api/me');
  ok(r.status === 401, 'gesperrtes Konto abgemeldet');

  // Passwort-Reset-Link vom Admin
  db.prepare('UPDATE users SET blocked = 0 WHERE id = ?').run(list[0].id);
  r = await api('admin', `/api/admin/users/${list[0].id}/reset`, 'POST', {});
  const link = (await r.json()).link;
  const tok = new URL(link).searchParams.get('token');
  r = await req('anon', '/reset', form({ token: tok, password: 'neues-passwort-99', password2: 'neues-passwort-99' }));
  ok(r.status === 200, 'Passwort über Link neu gesetzt');
  // Länderdaten (Beispieldatei) und Anmeldung mit IP-Adresse
  fs.writeFileSync(path.join(tmp, 'geo.csv'), '203.0.113.0,203.0.113.255,DE\n198.51.100.0,198.51.100.255,FR\n2001:db8::,2001:db8::ffff,AT\n');
  geo.load(path.join(tmp, 'geo.csv'));
  const f2 = form({ email: 'kunde@example.com', password: 'neues-passwort-99' });
  r = await req('kunde2', '/login', { ...f2, headers: { ...f2.headers, 'X-Forwarded-For': '203.0.113.9' } });
  ok(r.status === 303, 'Anmeldung mit neuem Passwort');
  r = await api('admin', '/api/admin/users?q=kunde');
  const u2 = (await r.json())[0];
  ok(u2.last_ip === '203.0.113.9' && u2.last_country === 'DE' && u2.last_seen > 0, `letzte IP und Land gespeichert (${u2.last_ip} ${u2.last_country})`);
  ok(geo.lookup('198.51.100.7') === 'FR' && geo.lookup('::ffff:203.0.113.1') === 'DE' && geo.lookup('2001:db8::5') === 'AT' && geo.lookup('8.8.8.8') === '' && geo.isLocal('192.168.1.5'), 'Länderzuordnung IPv4 und IPv6');
  r = await api('admin', '/api/admin/stats');
  const st = await r.json();
  ok(st.byCountry.some((x) => x.c === 'DE') && st.active24h >= 1 && Array.isArray(st.daily) && st.geo.loaded, 'Statistik mit Ländern, Aktivität und Verlauf');
  r = await api('admin', '/api/admin/users.csv');
  const csv = await r.text();
  ok(r.status === 200 && csv.includes('Letzte IP') && csv.includes('203.0.113.9') && csv.includes('kunde@example.com'), 'Benutzerliste als CSV');
  r = await api('admin', '/api/admin/events?kind=login&q=203.0.113');
  const ev = await r.json();
  ok(ev.rows.length >= 1 && ev.rows.every((x) => x.kind === 'login') && ev.rows[0].info.includes('DE') && ev.kinds.length > 0, 'Protokoll mit Filter');
  r = await api('kunde2', '/api/admin/stats');
  ok(r.status === 403, 'Statistik nur für Admin');
  db.prepare("INSERT INTO events(user_id, kind, info, at) VALUES(NULL, 'login', 'alt', ?)").run(Date.now() - 400 * 864e5);
  r = await req('anon', '/reset', form({ token: tok, password: 'nochmal-passwort', password2: 'nochmal-passwort' }));
  ok(r.status === 400, 'Link nur einmal gültig');

  // Abo über Lemon Squeezy (Webhook mit Signatur)
  const crypto = require('crypto');
  const hook = async (body, secret = 'ls-geheim') => {
    const raw = JSON.stringify(body);
    return req('anon', '/api/webhook/lemonsqueezy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature': crypto.createHmac('sha256', secret).update(raw).digest('hex') }, body: raw });
  };
  const kid = db.prepare('SELECT id FROM users WHERE email = ?').get('kunde@example.com').id;
  db.prepare('UPDATE users SET license_until = 0, trial_until = 0 WHERE id = ?').run(kid);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString();
  r = await hook({ meta: { event_name: 'subscription_created', custom_data: { user_id: String(kid) } }, data: { type: 'subscriptions', id: '777', attributes: { status: 'active', renews_at: in30, user_email: 'kunde@example.com', urls: { customer_portal: 'https://shop.lemonsqueezy.com/billing?x=1' } } } }, 'falsch');
  ok(r.status === 401 || r.status === 503, 'Webhook mit falscher Signatur abgelehnt');
  r = await hook({ meta: { event_name: 'subscription_created', custom_data: { user_id: String(kid) } }, data: { type: 'subscriptions', id: '777', attributes: { status: 'active', renews_at: in30, user_email: 'kunde@example.com', urls: { customer_portal: 'https://shop.lemonsqueezy.com/billing?x=1' } } } });
  r = await api('kunde2', '/api/me');
  me = (await r.json()).user;
  ok(me.sub && me.sub.status === 'active' && !me.license.viewOnly && me.license.daysLeft >= 32, `Abo aktiv → Lizenz bis Verlängerung + Puffer (${me.license.daysLeft} Tage)`);
  const in10 = new Date(Date.now() + 10 * 864e5).toISOString();
  r = await hook({ meta: { event_name: 'subscription_cancelled' }, data: { type: 'subscriptions', id: '777', attributes: { status: 'cancelled', ends_at: in10, user_email: 'kunde@example.com' } } });
  me = (await (await api('kunde2', '/api/me')).json()).user;
  ok(me.sub.status === 'cancelled' && me.license.daysLeft === 10 && !me.license.viewOnly, 'gekündigt → Zugang bis Ende des bezahlten Zeitraums');
  r = await hook({ meta: { event_name: 'subscription_expired' }, data: { type: 'subscriptions', id: '777', attributes: { status: 'expired', user_email: 'kunde@example.com' } } });
  me = (await (await api('kunde2', '/api/me')).json()).user;
  ok(me.license.viewOnly, 'Abo abgelaufen → nur ansehen');

  // Kündigungsbutton (§ 312k BGB) – ohne Anmeldung erreichbar
  r = await req('anon', '/kuendigen');
  let txt = await r.text();
  ok(r.status === 200 && txt.includes('Jetzt kündigen') || txt.includes('Cancel now'), 'Kündigungsseite öffentlich');
  r = await req('anon', '/legal/agb');
  ok((await r.text()).includes('href="/kuendigen"'), 'Link „Verträge hier kündigen“ auf jeder Seite');
  r = await req('anon', '/kuendigen?lang=de', form({ kind: 'ordinary', when: 'next', name: 'Erika Muster', email: 'kunde@example.com' }));
  txt = await r.text();
  ok(r.status === 200 && txt.includes('Kündigung eingegangen') && txt.includes('Eingegangen am'), 'Kündigung mit Eingangsbestätigung');
  r = await req('anon', '/widerrufen?lang=de', form({ name: 'Erika Muster', email: 'kunde@example.com' }));
  ok(r.status === 200 && (await r.text()).includes('Widerruf eingegangen'), 'Widerrufsfunktion mit Eingangsbestätigung');
  r = await api('admin', '/api/admin/requests');
  const reqs = await r.json();
  ok(reqs.length === 2 && reqs.every((x) => x.status === 'open'), 'Kündigung und Widerruf in der Verwaltung offen');
  r = await api('admin', '/api/admin/stats');
  ok((await r.json()).openRequests === 2, 'Übersicht zählt offene Anfragen');

  // FräsStudio: nur angemeldet und vom Admin freigeschaltet
  r = await req('anon2', '/fraesstudio/');
  const nextC = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).find((c) => c.startsWith('next='));
  ok(r.status === 303 && r.headers.get('location').startsWith('/login') && nextC && nextC.includes('/fraesstudio/'), 'FräsStudio ohne Anmeldung → Login (merkt sich das Ziel)');
  r = await req('anon2', '/fraesstudio/js/cam.js');
  ok(r.status === 303, 'FräsStudio-Code ohne Anmeldung gesperrt');
  r = await req('kunde2', '/fraesstudio/');
  ok(r.status === 403, 'FräsStudio für Kunden ohne Freischaltung gesperrt');
  r = await req('kunde2', '/fraesstudio/js/cam.js');
  ok(r.status === 403, 'FräsStudio-Code für Kunden ohne Freischaltung gesperrt');
  r = await req('admin', '/fraesstudio');
  ok(r.status === 303 && r.headers.get('location') === '/fraesstudio/', '/fraesstudio → /fraesstudio/');
  r = await req('admin', '/fraesstudio/');
  const fhtml = await r.text();
  ok(r.status === 200 && fhtml.includes('FräsStudio') && /camera=\(self\)/.test(r.headers.get('permissions-policy')) && /serial=\(self\)/.test(r.headers.get('permissions-policy')), 'Admin öffnet FräsStudio (Kamera und USB erlaubt)');
  r = await req('admin', '/fraesstudio/js/core.js');
  ok(r.status === 200 && (r.headers.get('content-type') || '').startsWith('text/javascript'), 'FräsStudio-Dateien für Admin');
  r = await req('admin', '/fraesstudio/%2e%2e/server/db.js');
  ok(r.status === 404, 'kein Zugriff außerhalb des FräsStudio-Ordners');
  r = await req('admin', '/fraesstudio/tests/test_cam.js');
  ok(r.status === 404, 'FräsStudio-Tests werden nicht ausgeliefert');
  const fid = db.prepare('SELECT id FROM users WHERE email = ?').get('kunde@example.com').id;
  r = await api('admin', '/api/admin/users/' + fid, 'POST', { fraes: true });
  ok(r.status === 200, 'Admin schaltet FräsStudio für Kunden frei');
  r = await req('kunde2', '/fraesstudio/');
  ok(r.status === 200, 'freigeschalteter Kunde öffnet FräsStudio');
  r = await api('kunde2', '/api/me');
  ok((await r.json()).user.fraes === true, 'Konto zeigt FräsStudio-Zugang');
  r = await api('admin', '/api/admin/users/' + fid, 'POST', { fraes: false });
  r = await req('kunde2', '/fraesstudio/');
  ok(r.status === 403, 'Zugang wieder entzogen');
  // Anmeldung über die FräsStudio-Adresse führt dorthin zurück
  await req('anon3', '/fraesstudio/');
  jar.anon3 = (jar.anon3 ? jar.anon3 + '; ' : '') + 'next=/fraesstudio/';
  r = await req('anon3', '/login', form({ email: 'chef@example.com', password: 'admin-passwort-123' }));
  ok(r.status === 303 && r.headers.get('location') === '/fraesstudio/', 'nach Anmeldung zurück zu FräsStudio');

  // Konto löschen (DSGVO)
  r = await api('kunde2', '/api/account', 'DELETE', { password: 'neues-passwort-99' });
  ok(r.status === 200 && !db.prepare('SELECT * FROM users WHERE email = ?').get('kunde@example.com'), 'Konto gelöscht');
  ok(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n === 0, 'Designs mit gelöscht');

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
