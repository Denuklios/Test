'use strict';
/* Telnet-Brücke zur Fräse (Port 23) für die Desktop-Version – gleiche Schnittstelle wie /api/cnc/* im StickStudio-Server.
   Lauscht nur auf 127.0.0.1; Ziel nur im eigenen Netz. Bei Verlust des Fensters: Not-Aus (Soft-Reset 0x18). */
const net = require('net');
const dns = require('dns').promises;
const crypto = require('crypto');

const sessions = new Map();

function privateIp(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const [a, b] = [+m[1], +m[2]];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
async function target(host, port) {
  host = String(host || '').trim();
  port = +port || 23;
  if (port !== 23) throw Object.assign(new Error('Port nicht erlaubt (nur Telnet 23).'), { code: 400 });
  if (!/^[A-Za-z0-9.-]{1,100}$/.test(host)) throw Object.assign(new Error('Adresse ungültig.'), { code: 400 });
  let ip = host;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    try { ip = (await dns.lookup(host, { family: 4 })).address; } catch (e) { throw Object.assign(new Error('Name „' + host + '“ wurde nicht gefunden.'), { code: 400 }); }
  }
  if (!privateIp(ip)) throw Object.assign(new Error('Nur Adressen im eigenen Netz sind erlaubt (192.168.x.x, 10.x.x.x, 172.16–31.x.x).'), { code: 400 });
  return { ip, port };
}
function close(sess, reason, estop) {
  if (!sess || sess.closed) return;
  sess.closed = true;
  clearTimeout(sess.grace); clearInterval(sess.beat);
  try { if (estop && sess.sock.writable) sess.sock.write(Buffer.from([0x18])); } catch (e) { /* weg */ }
  for (const r of sess.clients) { try { r.write(`data: ${JSON.stringify({ c: 1, m: reason || '' })}\n\n`); r.end(); } catch (e) { /* weg */ } }
  setTimeout(() => { try { sess.sock.destroy(); } catch (e) { /* weg */ } }, estop ? 150 : 0);
  sessions.delete(sess.id);
}
function open(host, port) {
  return new Promise((resolve, reject) => {
    for (const s of sessions.values()) close(s, 'neue Verbindung');
    const sock = net.connect({ host, port });
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 10000);
    const sess = { id: crypto.randomBytes(12).toString('hex'), sock, clients: new Set(), pending: [], closed: false };
    const timer = setTimeout(() => { sock.destroy(); reject(Object.assign(new Error('Die Maschine antwortet nicht (Zeitüberschreitung). Ist sie an, im WLAN und Telnet aktiv?'), { code: 502 })); }, 6000);
    sock.once('connect', () => {
      clearTimeout(timer);
      sessions.set(sess.id, sess);
      sess.beat = setInterval(() => { for (const r of sess.clients) r.write(': ping\n\n'); }, 15000);
      sess.grace = setTimeout(() => { if (!sess.clients.size) close(sess, 'kein Fenster verbunden'); }, 15000);
      resolve(sess);
    });
    sock.on('data', (buf) => {
      const msg = `data: ${JSON.stringify({ d: buf.toString('latin1') })}\n\n`;
      if (sess.clients.size) for (const r of sess.clients) r.write(msg); else if (sess.pending.length < 200) sess.pending.push(msg);
    });
    sock.on('error', (e) => {
      clearTimeout(timer);
      if (!sess.closed && sessions.has(sess.id)) close(sess, 'Fehler: ' + e.code);
      else reject(Object.assign(new Error({ ECONNREFUSED: 'Verbindung abgelehnt – ist Telnet an der Maschine aktiv (Port 23)?', EHOSTUNREACH: 'Maschine nicht erreichbar.', ENETUNREACH: 'Netz nicht erreichbar.', ETIMEDOUT: 'Zeitüberschreitung.' }[e.code] || 'Verbindungsfehler: ' + e.code), { code: 502 }));
    });
    sock.on('close', () => close(sess, 'Maschine hat die Verbindung beendet'));
  });
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
function body(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('zu groß')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Behandelt /api/cnc/*; true, wenn die Anfrage bearbeitet wurde */
async function handle(req, res, url) {
  const p = url.pathname, m = req.method;
  if (!p.startsWith('/api/cnc/')) return false;
  if (req.headers['x-requested-with'] !== 'StickStudio' && p !== '/api/cnc/stream') return json(res, 403, { error: 'Nicht erlaubt.' }), true;
  if (p === '/api/cnc/config' && m === 'GET') return json(res, 200, { enabled: true, host: '', port: 23 }), true;
  if (p === '/api/cnc/open' && m === 'POST') {
    try {
      const b = JSON.parse((await body(req, 4096)).toString() || '{}');
      const t = await target(b.host, b.port);
      const sess = await open(t.ip, t.port);
      json(res, 200, { id: sess.id });
    } catch (e) { json(res, e.code >= 400 && e.code < 600 ? e.code : 502, { error: e.message }); }
    return true;
  }
  const sess = sessions.get(String(url.searchParams.get('id') || ''));
  if (!sess) return json(res, 404, { error: 'Keine Verbindung (mehr).' }), true;
  if (p === '/api/cnc/stream' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify({ o: 1 })}\n\n`);
    for (const msg of sess.pending.splice(0)) res.write(msg);
    sess.clients.add(res);
    clearTimeout(sess.grace);
    res.on('close', () => {
      sess.clients.delete(res);
      if (!sess.clients.size && !sess.closed) sess.grace = setTimeout(() => { if (!sess.clients.size) close(sess, 'Fenster getrennt', true); }, 3000);
    });
    return true;
  }
  if (p === '/api/cnc/send' && m === 'POST') {
    const b = await body(req, 8192);
    if (sess.closed || !sess.sock.writable) return json(res, 410, { error: 'Verbindung beendet.' }), true;
    sess.sock.write(b);
    res.writeHead(204); res.end();
    return true;
  }
  if (p === '/api/cnc/close' && m === 'POST') { close(sess, 'Trennen'); return json(res, 200, { ok: true }), true; }
  return json(res, 404, { error: 'not found' }), true;
}
function closeAll(estop) { for (const s of [...sessions.values()]) close(s, 'Programm beendet', estop); }

module.exports = { handle, closeAll, privateIp };
