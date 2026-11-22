// Integrationstest der MCP-Schnittstelle der Preiskalkulation (admin/kalkulation/mcp.php).
// Läuft auf einer Kopie des Julekontor-Ordners mit leerer Datenbank. Aufruf: node julekontor/tests/mcp.test.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(join(tmpdir(), 'jk-mcp-'));
cpSync(src, root, { recursive: true, filter: (p) => !p.includes('/data/private/') && !p.endsWith('/tests') });
mkdirSync(join(root, 'data/private'), { recursive: true });
const hash = execFileSync('php', ['-r', 'echo password_hash("geheim123", PASSWORD_DEFAULT);']).toString();
writeFileSync(join(root, 'data/private/config.php'), `<?php return ['users' => [['email' => 'admin@example.com', 'name' => 'Test', 'role' => 'admin', 'hash' => '${hash}', 'created' => 'x']]];`);

const PORT = 8097, B = `http://127.0.0.1:${PORT}`;
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.stack); process.exitCode = 1; });
let url = '', rid = 0, cookie = '';
async function rpc(method, params, u = url) {
  const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) });
  return { status: r.status, j: await r.json().catch(() => null), r };
}
async function tool(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  assert.equal(r.status, 200);
  const t = r.j.result.content[0].text;
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { err: r.j.result.isError, d };
}
const M = `${B}/admin/kalkulation/mcp.php`;

try {
  await ok('Einrichtung: nur angemeldet, Schlüssel erzeugen', async () => {
    assert.equal((await fetch(M)).status, 401);
    const lp = await fetch(`${B}/admin/?p=login`); cookie = lp.headers.get('set-cookie').split(';')[0];
    const csrf0 = (await lp.text()).match(/name="csrf" value="([^"]+)"/)[1];
    const li = await fetch(`${B}/admin/?p=login`, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ csrf: csrf0, email: 'admin@example.com', password: 'geheim123' }) });
    const sc = li.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const page = await (await fetch(M, { headers: { cookie } })).text();
    assert.match(page, /kein Schlüssel/, page.slice(0, 300));
    const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
    const p2 = await (await fetch(M, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: `csrf=${csrf}&do=create` })).text();
    url = p2.match(/value="(http[^"]+\?k=[0-9a-f]{64})"/)[1];
  });
  await ok('Falscher Schlüssel: 401, richtiger: initialize ohne Cookie', async () => {
    assert.equal((await rpc('ping', {}, `${M}?k=${'1'.repeat(64)}`)).status, 401);
    const r = await rpc('initialize', { protocolVersion: '2025-03-26' });
    assert.equal(r.j.result.protocolVersion, '2025-03-26'); assert.equal(r.r.headers.get('set-cookie'), null);
    const t = await rpc('tools/list', {}); assert.ok(t.j.result.tools.length >= 15);
  });
  let band, kugel, form, pid;
  await ok('Material anlegen und Preis pro Einheit', async () => {
    band = (await tool('material_speichern', { name: 'Satinband rot', grp: 'Bänder', type: 'length', price: 20, pack: { length: 10, lengthUnit: 'm' } })).d.material;
    assert.equal(band.preis_pro_einheit, '2,00 kr. pro Meter');
    kugel = (await tool('material_speichern', { name: 'Holzkugel 20 mm', type: 'piece', price: 5, currency: 'EUR', pack: { count: 50 } })).d.material;
    form = (await tool('material_speichern', { name: 'Gießpulver', type: 'cast', price: 100, pack: { amount: 5, unit: 'kg', ratioP: 100, ratioW: 30 } })).d.material;
    const e = await tool('material_speichern', { name: 'x', type: 'kaputt' }); assert.equal(e.err, true);
    const ch = await tool('material_speichern', { id: band.id, price: 30 }); assert.equal(ch.d.material.name, 'Satinband rot'); assert.equal(ch.d.material.price, 30);
  });
  await ok('Projekt mit Anleitung anlegen, Preis wie kalk.js', async () => {
    const cat = (await tool('kategorie_speichern', { name: 'Anhänger' })).d.kategorie;
    const r = await tool('projekt_speichern', { name: 'Kugel-Anhänger', category_id: cat.id, batch: 10, minutes: 60, packaging: 2,
      notes: '1. Band 30 cm abschneiden\n2. Kugeln auffädeln\n3. Schleife binden',
      lines: [{ material_id: band.id, use: { a: 30, aUnit: 'cm', qty: 10 } }, { material_id: kugel.id, use: { a: 30 } }, { material_id: form.id, use: { a: 130, aUnit: 'g' } }] });
    assert.equal(r.err, false, JSON.stringify(r.d)); pid = r.d.projekt.id;
    const p = r.d.preis;
    // Band: 3 kr/m * 3 m = 9; Kugeln: 5 € * 7,46 / 50 * 30 = 22,38; Masse 130 g -> 100 g Pulver = 2 kr; Summe 33,38 / 10 = 3,338
    assert.equal(p.material_pro_stueck, 3.34);
    assert.equal(p.arbeitszeit_pro_stueck, 15);            // 60 Min * 150 kr / 10
    assert.equal(p.selbstkosten, 20.34);                    // 3,338 + 15 + 0 + 2
    // * 1,3 Aufschlag * 1,25 Moms = 33,05 -> aufrunden auf 5 = 35
    assert.equal(p.verkaufspreis, 35);
    assert.equal(r.d.materialliste.length, 3);
  });
  await ok('Teiländerung behält Felder, Übersicht, Nachbauen, Was-wäre-wenn', async () => {
    const r = await tool('projekt_speichern', { id: pid, status: 'fertig' });
    assert.equal(r.d.projekt.notes.startsWith('1. Band'), true); assert.equal(r.d.materialliste.length, 3); assert.equal(r.d.projekt.status, 'fertig');
    const u = await tool('uebersicht'); assert.equal(u.d.projekte[0].hat_anleitung, true); assert.equal(u.d.materialien.length, 3);
    const nb = await tool('nachbauen', { id: pid, stueck: 20 }); assert.equal(nb.d.arbeitszeit_minuten, 120); assert.equal(nb.d.bereitlegen[1].packungen, 2);
    const pb = await tool('preis_berechnen', { id: pid, aufschlag: 0 }); assert.equal(pb.d.was_waere_wenn.length, 7);
  });
  await ok('Stoppuhr, gebaut, Kopie, in die Kasse', async () => {
    assert.equal((await tool('stoppuhr', { id: pid, aktion: 'start' })).err, false);
    const st = await tool('stoppuhr', { id: pid, aktion: 'stop', uebernehmen: 'add' }); assert.equal(st.d.arbeitszeit_jetzt_minuten, 61);
    assert.equal((await tool('gebaut_eintragen', { id: pid, n: 5 })).d.schon_gebaut, 5);
    const k = await tool('projekt_kopieren', { id: pid }); assert.match(k.d.name, /Kopie/);
    const kasse = await tool('in_kasse_uebernehmen', { id: pid }); assert.equal(kasse.err, false, JSON.stringify(kasse.d)); assert.equal(kasse.d.neu_angelegt, true);
    const again = await tool('in_kasse_uebernehmen', { id: pid }); assert.equal(again.d.neu_angelegt, false);
    assert.equal((await tool('projekt_loeschen', { id: k.d.neue_id })).err, false);
    assert.equal((await tool('projekt_lesen', { id: k.d.neue_id })).err, true);
  });
  await ok('Einstellungen ändern nur angegebene Felder', async () => {
    const r = await tool('einstellungen_speichern', { markup: 50 }); assert.equal(r.d.einstellungen.markup, 50); assert.equal(r.d.einstellungen.wage, 150);
  });
  await ok('Sperren beendet den Zugang', async () => {
    const page = await (await fetch(M, { headers: { cookie } })).text();
    const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
    await fetch(M, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: `csrf=${csrf}&do=revoke` });
    assert.equal((await rpc('ping', {})).status, 401);
  });
} finally {
  srv.kill();
  rmSync(root, { recursive: true, force: true });
  console.log(`\n${passed} Tests bestanden`);
}
