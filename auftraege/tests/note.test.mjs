// Notiz -> Auftragsfelder (feste Regeln, ohne Claude). Aufruf: node auftraege/tests/note.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-note-'));
const PORT = 8086, B = `http://127.0.0.1:${PORT}`;
import { createServer } from 'node:http';
let aiBody = null;
const mock = createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
  aiBody = JSON.parse(b);
  const out = { customer_name: 'Ole', customer_company: 'Padborg Fodbold', phone: '', email: '', title: '18 Trikots mit Nummern', qty: 18, article: 'Trikot rot',
    process_ids: [aiBody.output_config.format.schema.properties.process_ids.items.enum[2]], minutes_per_piece: 0, due_date: '2099-01-03', price_total: 0, deposit: 0, currency: 'DKK', description: 'Nummern 1-18 hinten, Flex weiß' };
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }] }));
}); }).listen(8085);
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { env: { ...process.env, WF_TEST_DATA_DIR: data, WF_OFFLINE: '1', WF_AI_URL: 'http://127.0.0.1:8085/' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
let cookie = '', csrf = '';
const call = async (a, body) => (await fetch(`${B}/api.php?a=${a}`, { method: body ? 'POST' : 'GET', headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined })).json();
let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.message); process.exitCode = 1; });
const wd = (d) => { const x = new Date(d + 'T00:00:00').getDay(); return x !== 0 && x !== 6; };
try {
  const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
  const me = await call('me'); csrf = me.csrf;
  const pid = (key) => +me.processes.find((p) => p.key === key).id;
  const jens = (await call('customer_save', { name: 'Jens Hansen', company: 'SIF Sønderborg', phone: '+45 22 33 44 55' })).id;
  const parse = async (text) => (await call('note_parse', { text })).note;

  await ok('Kunde vor Doppelpunkt, Telefon findet bestehenden Kunden, Menge/Artikel/Verfahren, „Ende November“', async () => {
    const n = await parse('Verein SIF: 25 Hoodies mit Stick\nLogo Brust links, Namen hinten\nbis Ende November\nTel 22334455');
    assert.equal(n.customer.id, jens); assert.equal(n.qty, 25); assert.equal(n.article, 'Hoodies'); assert.deepEqual(n.processes.map((p) => p.process_id), [pid('stick')]);
    assert.match(n.due_date, /-11-(2[6-9]|30)$/); assert.ok(wd(n.due_date)); assert.equal(n.title, '25 Hoodies – Sticken'); assert.doesNotMatch(n.description, /Tel/);
  });
  await ok('Beschriftete Zeilen, Stückpreis × Menge, Termin am Wochenende → Werktag', async () => {
    const n = await parse('Kunde: Maria Petersen\nTel: 40 12 34 56\n12 T-Shirts weiß DTF Druck vorne A4\nPreis: 150 kr pro Stück\nAbholung 14.11.');
    assert.equal(n.customer.name, 'Maria Petersen'); assert.equal(n.customer.id, null); assert.equal(n.customer.phone, '40 12 34 56');
    assert.equal(n.qty, 12); assert.equal(n.price, 1800); assert.deepEqual(n.processes.map((p) => p.process_id), [pid('dtf')]); assert.ok(wd(n.due_date));
  });
  await ok('Fließtext: Firma am Anfang, Minuten pro Stück, KW, Preis und Anzahlung', async () => {
    const n = await parse('Bauhaus Flensburg 30 Caps schwarz flock 10 min pro stück, fertig KW 47, 2.400 kr, Anzahlung 1000');
    assert.equal(n.customer.company, 'Bauhaus Flensburg'); assert.equal(n.qty, 30); assert.equal(n.article, 'Caps schwarz'); assert.equal(n.price, 2400); assert.equal(n.deposit, 1000);
    assert.deepEqual(n.processes, [{ process_id: pid('flex'), per_piece: 10 }]); assert.equal(new Date(n.due_date + 'T00:00:00').getDay(), 5, 'Freitag der KW');
  });
  await ok('Dänische Notiz: navn, antal, broderi, pris, fredag, e-mail', async () => {
    const n = await parse('Navn: Lars Nielsen\nlars@nielsen.dk\n15 polo med broderi på ryggen\npris: 3000 kr\nafhentning fredag');
    assert.equal(n.customer.name, 'Lars Nielsen'); assert.equal(n.customer.email, 'lars@nielsen.dk'); assert.equal(n.qty, 15); assert.equal(n.article, 'polo');
    assert.deepEqual(n.processes.map((p) => p.process_id), [pid('stick')]); assert.equal(n.price, 3000); assert.equal(new Date(n.due_date + 'T00:00:00').getDay(), 5);
  });
  await ok('Artikel vor der Menge, Gravur, Wochentag nicht als Artikel', async () => {
    const n = await parse('Hochzeit Schneidbretter gravieren 6 stk freitag');
    assert.equal(n.qty, 6); assert.equal(n.article, 'Schneidbretter'); assert.deepEqual(n.processes.map((p) => p.process_id), [pid('lasergravur')]); assert.equal(n.title, '6 Schneidbretter – Lasergravur');
  });
  await ok('Mit Claude-Schlüssel: Claude verteilt die Notiz, Regeln füllen Lücken, Termin nie am Wochenende', async () => {
    await call('ai_key_save', { key: 'sk-ant-test-0123456789abcdefghijkl' });
    const n = await parse('Ole, Padborg Fodbold, 18 trøjer rød med numre 1-18 (flex) til 3. januar 2099, tlf 50 60 70 80');
    assert.equal(n.source, 'ai'); assert.equal(n.title, '18 Trikots mit Nummern'); assert.equal(n.customer.company, 'Padborg Fodbold'); assert.equal(n.customer.phone, '50 60 70 80', 'Telefon aus den Regeln');
    assert.equal(n.due_date, '2099-01-05', '03.01.2099 ist ein Samstag → Montag'); assert.equal(n.processes.length, 1); assert.match(aiBody.messages[0].content[0].text, /18 trøjer/);
    await call('ai_key_save', { key: '' });
  });
} finally {
  srv.kill(); mock.close(); await new Promise((r) => setTimeout(r, 200)); rmSync(data, { recursive: true, force: true });
  console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER siehe oben' : ''}`);
}
