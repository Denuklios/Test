// Server: Registrierung, Anmeldung, Testversion, Lizenzsperre, Export auf dem Server, Admin, Rechtstexte, Schutz des Formatcodes
const path = require('path');
const fs = require('fs');
const os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stick-'));
process.env.DATA_DIR = tmp;
process.env.ADMIN_EMAIL = 'chef@example.com';
process.env.ADMIN_PASSWORD = 'admin-passwort-123';
process.env.PORT = '0';
delete process.env.SMTP_HOST;
const { server, db, ensureAdmin } = require('../server/server.js');

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
  ok(r.status === 200 && html.includes('js/online.js') && !html.includes('dst_io.js') && !html.includes('formats.js'), 'Programmseite ohne Formatcode, mit Online-Anbindung');
  ok(r.headers.get('content-security-policy').includes("script-src 'self'"), 'Sicherheitsrichtlinie gesetzt');
  r = await req('kunde', '/js/dst_io.js');
  ok(r.status === 404, 'dst_io.js wird nicht ausgeliefert');
  r = await req('kunde', '/js/formats.js');
  ok(r.status === 404, 'formats.js wird nicht ausgeliefert');
  r = await req('kunde', '/js/app.js');
  ok(r.status === 200, 'Programmcode angemeldet erreichbar');
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
  r = await req('kunde2', '/login', form({ email: 'kunde@example.com', password: 'neues-passwort-99' }));
  ok(r.status === 303, 'Anmeldung mit neuem Passwort');
  r = await req('anon', '/reset', form({ token: tok, password: 'nochmal-passwort', password2: 'nochmal-passwort' }));
  ok(r.status === 400, 'Link nur einmal gültig');

  // Konto löschen (DSGVO)
  r = await api('kunde2', '/api/account', 'DELETE', { password: 'neues-passwort-99' });
  ok(r.status === 200 && !db.prepare('SELECT * FROM users WHERE email = ?').get('kunde@example.com'), 'Konto gelöscht');
  ok(db.prepare('SELECT COUNT(*) AS n FROM projects').get().n === 0, 'Designs mit gelöscht');

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
