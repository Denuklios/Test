// Integrationstest SMTP-Versand (Postfach wie send.one.com) gegen einen nachgebauten Mailserver.
// Aufruf: node auftraege/tests/smtp.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-smtp-'));
const PORT = 8079, B = `http://127.0.0.1:${PORT}`, SPORT = 2525;

// Mini-SMTP: AUTH LOGIN mit info@wunsch-fabrik.dk / geheim
const got = [];
const smtp = createServer((sock) => {
  let step = 'cmd', buf = '', user = '', msg = { rcpt: [] };
  sock.write('220 test ESMTP\r\n');
  sock.on('data', (d) => {
    buf += d.toString();
    if (step === 'data') {
      const end = buf.indexOf('\r\n.\r\n');
      if (end < 0) return;
      msg.data = buf.slice(0, end); buf = buf.slice(end + 5); step = 'cmd'; got.push(msg); msg = { rcpt: [] };
      sock.write('250 queued\r\n');
    }
    let i;
    while (step !== 'data' && (i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (step === 'user') { user = Buffer.from(line, 'base64').toString(); step = 'pass'; sock.write('334 UGFzc3dvcmQ6\r\n'); continue; }
      if (step === 'pass') { const ok = user === 'info@wunsch-fabrik.dk' && Buffer.from(line, 'base64').toString() === 'geheim'; step = 'cmd'; sock.write(ok ? '235 ok\r\n' : '535 auth failed\r\n'); continue; }
      if (/^EHLO/i.test(line)) sock.write('250-test\r\n250 AUTH LOGIN\r\n');
      else if (/^AUTH LOGIN/i.test(line)) { step = 'user'; sock.write('334 VXNlcm5hbWU6\r\n'); }
      else if (/^MAIL FROM/i.test(line)) { msg.from = line; sock.write('250 ok\r\n'); }
      else if (/^RCPT TO/i.test(line)) { msg.rcpt.push(line); sock.write('250 ok\r\n'); }
      else if (/^DATA/i.test(line)) { step = 'data'; sock.write('354 go\r\n'); }
      else if (/^QUIT/i.test(line)) { sock.end('221 bye\r\n'); }
      else sock.write('500 ?\r\n');
    }
  });
}).listen(SPORT);

const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { env: { ...process.env, WF_TEST_DATA_DIR: data, WF_OFFLINE: '1' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
let cookie = '', csrf = '';
async function call(a, { params = {}, body } = {}) {
  const h = { cookie };
  const opt = { headers: h };
  if (body) { opt.method = 'POST'; h['content-type'] = 'application/json'; h['x-csrf-token'] = csrf; opt.body = JSON.stringify(body); }
  const r = await fetch(`${B}/api.php?${new URLSearchParams({ a, ...params })}`, opt);
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.message); process.exitCode = 1; });

try {
  const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
  csrf = (await call('me')).j.csrf;
  await call('company_save', { body: { name: 'Wunsch-Fabrik', owner: 'Robert', email: 'info@wunsch-fabrik.dk', moms_registered: true } });

  await ok('SMTP speichern: Passwort nie zurück an den Browser, leer = behalten', async () => {
    const r = (await call('smtp_save', { body: { host: '127.0.0.1', port: SPORT, user: 'info@wunsch-fabrik.dk', pass: 'geheim' } })).j;
    assert.equal(r.smtp.pass_set, true); assert.equal(r.smtp.pass, undefined);
    const ci = (await call('cron_info')).j;
    assert.equal(ci.smtp.user, 'info@wunsch-fabrik.dk'); assert.equal(JSON.stringify(ci).includes('geheim'), false);
    assert.equal(JSON.stringify((await call('me')).j).includes('geheim'), false);
    await call('smtp_save', { body: { host: '127.0.0.1', port: SPORT, user: 'info@wunsch-fabrik.dk', pass: '' } });
  });

  await ok('Probe-Mail über SMTP: Anmeldung, Absender, Empfänger, Inhalt mit HTML-Knopf', async () => {
    const r = (await call('mail_test', { body: { to: 'robert@example.dk' } })).j;
    assert.equal(r.via, 'smtp', JSON.stringify(r));
    const m = got.at(-1);
    assert.equal(m.from, 'MAIL FROM:<info@wunsch-fabrik.dk>'); assert.deepEqual(m.rcpt, ['RCPT TO:<robert@example.dk>']);
    assert.ok(m.data.includes('To: robert@example.dk') && m.data.includes('Content-Type: text/html'));
  });

  await ok('Angebotsmail über SMTP beim Kunden', async () => {
    const cid = (await call('customer_save', { body: { name: 'Erika Muster', email: 'erika@example.de', country: 'DE' } })).j.id;
    const o = (await call('order_save', { body: { customer_id: cid, title: 'Caps', qty: 2, price: 100, currency: 'DKK', pay_status: 'open', items: [{ name: 'Cap', qty: 2, price: 50, processes: [] }] } })).j.order;
    const r = (await call('confirm_create', { body: { order_id: o.id, email: true } })).j;
    assert.equal(r.mailed, true); assert.equal(got.at(-1).rcpt[0], 'RCPT TO:<erika@example.de>');
  });

  await ok('Falsches Passwort: verständlicher Grund statt stiller Fehler', async () => {
    await call('smtp_save', { body: { host: '127.0.0.1', port: SPORT, user: 'info@wunsch-fabrik.dk', pass: 'falsch' } });
    const r = await call('mail_test', { body: { to: 'robert@example.dk' } });
    assert.equal(r.status, 502); assert.match(r.j.detail, /Anmeldung fehlgeschlagen/);
    assert.match((await call('cron_info')).j.mail_error, /Anmeldung fehlgeschlagen/);
  });

  await ok('Kunde ohne E-Mail / ohne Absender: Grund wird genannt', async () => {
    const cid = (await call('customer_save', { body: { name: 'Ohne Mail', country: 'DK' } })).j.id;
    const o = (await call('order_save', { body: { customer_id: cid, title: 'X', qty: 1, price: 1, currency: 'DKK', pay_status: 'open', items: [{ name: 'X', qty: 1, price: 1, processes: [] }] } })).j.order;
    const r = (await call('confirm_create', { body: { order_id: o.id, email: true } })).j;
    assert.equal(r.mailed, false); assert.match(r.mail_error, /keine gültige E-Mail/);
    await call('smtp_save', { body: { host: '' } });
    assert.equal((await call('cron_info')).j.smtp, null);
  });
} finally {
  srv.kill(); smtp.close();
  rmSync(data, { recursive: true, force: true });
  console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER siehe oben' : ''}`);
}
