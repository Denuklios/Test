// Integrationstest Postfach: Abruf per IMAP (Test-Server), Zuordnung zum Kunden, sichere Anzeige, Antworten mit Anhang
// und eingebettetem Bild, Kopie in „Gesendet“, Gelesen-Markierung zurück ans Postfach, Übersetzen (offline), Signatur.
// Aufruf: node auftraege/tests/mailbox.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-mb-'));
const box = join(data, 'imap'); mkdirSync(box);
const mails = join(data, 'mails');
const PORT = 8096, IPORT = 8143, B = `http://127.0.0.1:${PORT}`;

const png = readFileSync(join(root, 'icons/icon-192.png')).toString('base64');
const eml = (lines) => lines.join('\r\n');
writeFileSync(join(box, '1.eml'), eml([
  'From: =?UTF-8?Q?S=C3=B8ren_Kunde?= <Soeren@Kunde.DK>', 'To: hej@wunsch-fabrik.dk', 'Subject: Hoodies mit Logo', 'Message-ID: <q1@kunde.dk>',
  'Date: Mon, 02 Nov 2026 09:00:00 +0100', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="X"', '',
  '--X', 'Content-Type: multipart/related; boundary="R"', '',
  '--R', 'Content-Type: text/html; charset=utf-8', '', '<p>Hej, hier mein Logo <img src="cid:logo1"></p><img src="https://tracker.example/p.gif"><script>alert(1)</script>',
  '--R', 'Content-Type: image/png', 'Content-ID: <logo1>', 'Content-Transfer-Encoding: base64', '', png, '--R--',
  '--X', 'Content-Type: application/pdf; name="Skizze.pdf"', 'Content-Disposition: attachment; filename="Skizze.pdf"', 'Content-Transfer-Encoding: base64', '', 'JVBERi0xLjQK', '--X--', '']));
writeFileSync(join(box, '2.eml'), eml(['From: Newsletter <news@shop.example>', 'To: hej@wunsch-fabrik.dk', 'Subject: Angebot der Woche', 'Message-ID: <n1@shop>',
  'Date: Mon, 02 Nov 2026 10:00:00 +0100', 'Content-Type: text/plain; charset=iso-8859-1', 'Content-Transfer-Encoding: quoted-printable', '', 'Sch=F6ne Gr=FC=DFe', '']));

const imap = spawn('python3', [join(root, 'tests/fake_imap.py'), String(IPORT), box], { stdio: 'ignore' });
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { env: { ...process.env, WF_TEST_DATA_DIR: data, WF_OFFLINE: '1', WF_MAIL_DIR: mails }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let cookie = '', csrf = '';
async function call(a, { params = {}, body, form } = {}) {
  const h = { cookie };
  const opt = { headers: h };
  if (body) { opt.method = 'POST'; h['content-type'] = 'application/json'; h['x-csrf-token'] = csrf; opt.body = JSON.stringify(body); }
  if (form) { opt.method = 'POST'; h['x-csrf-token'] = csrf; opt.body = form; }
  const r = await fetch(`${B}/api.php?${new URLSearchParams({ a, ...params })}`, opt);
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  return { status: r.status, j, r };
}
let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.stack || e.message); process.exitCode = 1; });
const imapLog = () => JSON.parse(readFileSync(join(box, 'imap-log.json'), 'utf8'));

try {
  const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
  csrf = (await call('me')).j.csrf;
  let cust;
  await ok('ohne Einrichtung: Abruf meldet fehlendes Postfach', async () => {
    assert.equal((await call('mail_sync')).j.not_configured, true);
    assert.equal((await call('mail_status')).j.configured, false);
  });
  await ok('Einrichten und Verbindung testen', async () => {
    cust = (await call('customer_save', { body: { name: 'Søren Kunde', email: 'soeren@kunde.dk', currency: 'DKK' } })).j.id;
    const r = await call('mail_settings_save', { body: { host: '127.0.0.1', port: IPORT, user: 'hej@wunsch-fabrik.dk', pass: 'geheim"pass', same_pass: 0, deepl_key: 'test:fx' } });
    assert.equal(r.j.ok, true); assert.equal(r.j.tested, true, r.j.detail);
    const st = (await call('mail_status')).j; assert.equal(st.configured, true); assert.equal(st.deepl, true); assert.equal(st.imap.own_pass, true);
  });
  let m1;
  await ok('Abruf: 2 neue Mails, Kunde zugeordnet, Newsletter aussortiert, Ordner Gesendet erkannt', async () => {
    const r = (await call('mail_sync')).j;
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.new, 2); assert.equal(r.unread, 1, 'Aussortiertes zählt nicht als ungelesen');
    assert.equal((await call('mail_sync')).j.new, 0, 'nichts doppelt');
    const list = (await call('mail_list', { params: { folder: 'in' } })).j.mails;
    assert.equal(list.length, 1, 'nur die Kundenmail im Posteingang');
    m1 = list.find((m) => m.subject === 'Hoodies mit Logo');
    assert.equal(m1.from_name, 'Søren Kunde'); assert.equal(m1.from_addr, 'soeren@kunde.dk'); assert.equal(+m1.customer_id, cust); assert.equal(+m1.has_att, 1);
    const junk = (await call('mail_list', { params: { folder: 'junk' } })).j.mails;
    assert.equal(junk.length, 1); assert.equal(junk[0].from_addr, 'news@shop.example');
    assert.equal(junk[0].snippet, 'Schöne Grüße', 'Zeichensatz umgewandelt');
    // Absender durchlassen und wieder aussortieren
    await call('mail_junk', { body: { id: junk[0].id, junk: 0 } });
    assert.equal((await call('mail_list', { params: { folder: 'in' } })).j.mails.length, 2);
    await call('mail_junk', { body: { id: junk[0].id, junk: 1 } });
    assert.equal((await call('mail_list', { params: { folder: 'in' } })).j.mails.length, 1);
    assert.equal((await call('mail_status')).j.sent_box, 'Sent');
    assert.equal((await call('mail_list', { params: { folder: 'all', customer_id: cust } })).j.mails.length, 1, 'Mails je Kunde');
  });
  await ok('Lesen: Skript und Tracking-Pixel weg, eingebettetes Bild da, Anhang ladbar, gelesen', async () => {
    const r = (await call('mail_get', { params: { id: m1.id } })).j;
    assert.ok(!/script/i.test(r.mail.html)); assert.match(r.mail.html, /data:image\/png;base64/); assert.ok(!/tracker\.example/.test(r.mail.html)); assert.equal(r.mail.blocked, 1);
    assert.match((await call('mail_get', { params: { id: m1.id, remote: 1 } })).j.mail.html, /tracker\.example/, 'auf Wunsch mit Bildern');
    const pdf = r.atts.find((a) => a.name === 'Skizze.pdf'); assert.ok(pdf);
    const f = await fetch(`${B}/api.php?a=mail_att&id=${pdf.id}`, { headers: { cookie } });
    assert.equal(f.headers.get('content-type'), 'application/pdf'); assert.equal((await f.text()).slice(0, 5), '%PDF-');
    assert.equal((await call('mail_unread')).j.unread, 0);
  });
  await ok('Antworten mit Anhang und eingefügtem Bild: Versand, Kopie in Gesendet, gleicher Verlauf', async () => {
    await call('mail_sig_save', { body: { html: '<p>Viele Grüße<br><b>Robert</b></p>' } });
    assert.match((await call('mail_status')).j.signature.html, /Robert/);
    const fd = new FormData();
    fd.append('data', JSON.stringify({ to: '"Søren Kunde" <soeren@kunde.dk>', cc: 'kollege@wunsch-fabrik.dk', bcc: 'archiv@wunsch-fabrik.dk', subject: 'AW: Hoodies mit Logo',
      html: `<p>Hej Søren, anbei das Angebot.</p><img src="data:image/png;base64,${png}"><br><div class="wf-sig"><p>Viele Grüße</p></div>`, reply_id: m1.id, customer_id: cust }));
    fd.append('files[]', new Blob(['%PDF-1.4 Angebot']), 'Angebot Æøå.pdf');
    const r = await call('mail_send', { form: fd });
    assert.equal(r.j.ok, true, JSON.stringify(r.j)); assert.equal(r.j.copied, true, 'Kopie in Gesendet');
    const raw = readdirSync(mails).map((f) => readFileSync(join(mails, f), 'utf8')).join('\n');
    assert.match(raw, /In-Reply-To: <q1@kunde\.dk>/); assert.match(raw, /Content-ID: <img0\./); assert.match(raw, /filename\*=UTF-8''Angebot%20%C3%86%C3%B8%C3%A5\.pdf/);
    assert.ok(!/^Bcc:/m.test(raw), 'Bcc nicht im Kopf');
    const sent = imapLog().Sent; assert.equal(sent.length, 1); assert.deepEqual(sent[0].flags, ['\\Seen']);
    const g = (await call('mail_get', { params: { id: r.j.id } })).j;
    assert.equal(g.mail.folder, 'sent'); assert.equal(+g.mail.customer_id, cust); assert.equal(g.thread.length, 2, 'Antwort im selben Verlauf');
    assert.equal(g.atts.filter((a) => !+a.inline).length, 1);
  });
  await ok('Abgleich: Kopie aus Gesendet nicht doppelt, Gelesen-Markierung am Postfach', async () => {
    const r = (await call('mail_sync')).j; assert.equal(r.new, 0, JSON.stringify(r));
    assert.equal((await call('mail_list', { params: { folder: 'sent' } })).j.mails.length, 1);
    assert.ok(imapLog().INBOX.find((m) => m.uid === 1).flags.includes('\\Seen'), 'gelesen zurückgeschrieben');
  });
  await ok('Archivieren, Suche, Kunde umhängen', async () => {
    const news = (await call('mail_list', { params: { folder: 'junk', q: 'Woche' } })).j.mails[0];
    await call('mail_update', { body: { id: news.id, archived: 1 } });
    assert.equal((await call('mail_list', { params: { folder: 'in' } })).j.mails.length, 1);
    assert.equal((await call('mail_list', { params: { folder: 'archived' } })).j.mails.length, 1);
    await call('mail_update', { body: { id: news.id, customer_id: cust } });
    assert.equal((await call('mail_list', { params: { folder: 'all', customer_id: cust } })).j.mails.length, 3);
  });
  await ok('Löschen: Mail kommt am Server in den Papierkorb, ist hier weg und kommt beim Abruf nicht wieder', async () => {
    const news = (await call('mail_list', { params: { folder: 'archived' } })).j.mails[0];
    const r = (await call('mail_delete', { body: { ids: [news.id] } })).j;
    assert.equal(r.deleted, 1); assert.equal(r.warn, '');
    const log = imapLog();
    assert.equal(log.INBOX.length, 1, 'Posteingang am Server ohne die Mail'); assert.equal(log.Trash.length, 1, 'im Papierkorb');
    assert.equal((await call('mail_list', { params: { folder: 'archived' } })).j.mails.length, 0);
    assert.equal((await call('mail_get', { params: { id: news.id } })).j.error, 'not_found');
    assert.equal((await call('mail_sync')).j.new, 0, 'nicht wieder abgeholt');
  });
  await ok('Handy-App: neue Mail wird gemeldet und lässt sich öffnen', async () => {
    const c = await call('app_token_create', { body: { name: 'Robert Handy' } });
    const pr = await (await fetch(`${B}/api.php?a=app_pair`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c.j.code }) })).json();
    const H = { 'x-app-token': pr.token };
    const ev0 = await (await fetch(`${B}/api.php?a=app_events`, { headers: H })).json();
    assert.match(ev0.cursor, /mail:\d+/);
    // neue Mail im Postfach (Test-Server liest den Ordner nur beim Start: direkt eintragen wie nach einem Abruf)
    const { execFileSync } = await import('node:child_process');
    execFileSync('php', ['-r', `$db = new PDO('sqlite:${data}/auftraege.sqlite'); $db->exec("INSERT INTO mail_msgs (folder, uid, message_id, from_addr, from_name, subject, snippet, body_text, seen) VALUES ('in', 99, 'neu@x', 'lise@kunde.dk', 'Lise', 'Neue Bestellung', 'Hej', 'Hej, wir brauchen 10 Shirts.', 0)");`]);
    const ev1 = await (await fetch(`${B}/api.php?a=app_events&cursor=${encodeURIComponent(ev0.cursor)}`, { headers: H })).json();
    const m = ev1.events.find((e) => e.kind === 'mail');
    assert.ok(m, JSON.stringify(ev1)); assert.equal(m.title, 'Lise'); assert.equal(m.text, 'Neue Bestellung'); assert.match(m.open, /^mail:\d+$/);
    const g = await (await fetch(`${B}/api.php?a=app_mail&id=${m.id}`, { headers: H })).json();
    assert.equal(g.mail.body_text, 'Hej, wir brauchen 10 Shirts.');
    assert.equal((await fetch(`${B}/api.php?a=mail_list`, { headers: H })).status, 403, 'volles Postfach nicht für die Handy-App');
  });
  await ok('Übersetzen (offline: Kennzeichnung), ungültige Zielsprache, falsche Adresse', async () => {
    const r = (await call('mail_translate', { body: { html: '<p>Hallo</p>', target: 'da' } })).j;
    assert.equal(r.html, '<p>[DA] Hallo</p>');
    // gemischte Mail: nur der dänische Teil wird ins Deutsche übersetzt, Bild bleibt
    const mix = (await call('mail_translate', { body: { html: '<p>Vi glæder os til at se dig</p><p>Wir freuen uns</p><img src="data:image/png;base64,AAAA">', target: 'de' } })).j;
    assert.equal(mix.html, '<p>[DE] Vi glæder os til at se dig</p><p>Wir freuen uns</p><img src="data:image/png;base64,AAAA">');
    assert.equal(mix.same, false);
    assert.equal((await call('mail_translate', { body: { html: '<p>Schon deutsch</p>', target: 'de' } })).j.same, true);
    assert.equal((await call('mail_translate', { body: { html: 'x', target: 'fr' } })).j.error, 'bad_input');
    const fd = new FormData(); fd.append('data', JSON.stringify({ to: 'kein-gueltiger', subject: 'x', html: 'x' }));
    assert.equal((await call('mail_send', { form: fd })).j.error, 'mail_no_to');
    const fd2 = new FormData(); fd2.append('data', JSON.stringify({ to: 'a@b', subject: 'x', html: 'x' }));
    assert.equal((await call('mail_send', { form: fd2 })).j.error, 'mail_bad_addr');
  });
} finally {
  srv.kill(); imap.kill(); rmSync(data, { recursive: true, force: true });
  console.log(`${passed} Tests bestanden`);
}
