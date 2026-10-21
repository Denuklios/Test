/* Lizenz im Desktop-Programm (Hauptprozess):
   - Testzeitraum ab dem ersten Start
   - Freischalten mit Lizenzschlüssel (einmal online), danach regelmäßige Prüfung im Hintergrund
   - signierte Freigabe vom Server (Ed25519), an dieses Gerät gebunden, gilt offline bis zu 30 Tage
   - Offline-Freischaltung per Code vom Verkäufer (für Rechner ohne Internet)
   - Updates: Die Freigabe enthält „Updates bis“. Ist diese Programmversion später erschienen (cfg.released),
     läuft sie nicht – ältere Versionen laufen weiter. Nach einer Verlängerung reicht „Jetzt prüfen“. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const DAY = 864e5;

/** Meldungen in Deutsch, Englisch und Dänisch (Standard: Deutsch) */
const LOCALE = { de: 'de-DE', en: 'en-GB', da: 'da-DK' };
const MSG = {
  de: {
    revoked: 'Diese Lizenz wurde gesperrt.',
    invalid: 'Die Freischaltung passt nicht zu diesem Gerät. Bitte neu freischalten.',
    rollback: 'Die Uhr des Computers wurde zurückgestellt. Bitte einmal mit dem Internet verbinden.',
    offline: 'Die Lizenz muss wieder geprüft werden. Bitte den Computer mit dem Internet verbinden.',
    updates: (v, rel, upd) => `Diese Version (${v} vom ${rel}) ist neuer als deine Updates (inklusive bis ${upd}). Verlängere die Updates oder nutze deine bisherige Version weiter – die läuft für immer.`,
    expired: 'Die Testzeit ist abgelaufen. Bitte gib deinen Lizenzschlüssel ein.',
    noServer: 'Kein Lizenzserver eingestellt.',
    unreachable: 'Der Lizenzserver ist nicht erreichbar. Bitte Internetverbindung prüfen.',
    error: (n) => 'Fehler ' + n,
    badKey: 'Der Schlüssel ist nicht vollständig oder enthält einen Tippfehler.',
    wrongProduct: (name, code) => `Das ist kein Schlüssel für ${name} (er muss mit ${code}- beginnen).`,
    badAnswer: 'Die Antwort des Lizenzservers ist ungültig.',
    needInternet: 'Zum Freigeben wird das Internet gebraucht.',
    keyFirst: 'Bitte zuerst den Lizenzschlüssel eintragen.',
    codeMismatch: 'Der Freischaltcode passt nicht zu diesem Gerät.',
  },
  en: {
    revoked: 'This license has been revoked.',
    invalid: 'The activation does not match this device. Please activate again.',
    rollback: 'The computer clock was set back. Please connect to the internet once.',
    offline: 'The license needs to be checked again. Please connect the computer to the internet.',
    updates: (v, rel, upd) => `This version (${v} from ${rel}) is newer than your updates (included until ${upd}). Extend your updates or keep using your previous version – it runs forever.`,
    expired: 'The trial period has ended. Please enter your license key.',
    noServer: 'No license server configured.',
    unreachable: 'The license server cannot be reached. Please check your internet connection.',
    error: (n) => 'Error ' + n,
    badKey: 'The key is incomplete or contains a typo.',
    wrongProduct: (name, code) => `This is not a key for ${name} (it must start with ${code}-).`,
    badAnswer: 'The response from the license server is invalid.',
    needInternet: 'Releasing this device requires an internet connection.',
    keyFirst: 'Please enter the license key first.',
    codeMismatch: 'The activation code does not match this device.',
  },
  da: {
    revoked: 'Denne licens er blevet spærret.',
    invalid: 'Aktiveringen passer ikke til denne enhed. Aktivér venligst igen.',
    rollback: 'Computerens ur er blevet stillet tilbage. Forbind venligst til internettet én gang.',
    offline: 'Licensen skal kontrolleres igen. Forbind venligst computeren til internettet.',
    updates: (v, rel, upd) => `Denne version (${v} fra ${rel}) er nyere end dine opdateringer (inkluderet til og med ${upd}). Forlæng opdateringerne, eller brug fortsat din tidligere version – den kører for altid.`,
    expired: 'Prøveperioden er udløbet. Indtast venligst din licensnøgle.',
    noServer: 'Der er ikke angivet nogen licensserver.',
    unreachable: 'Licensserveren kan ikke nås. Kontrollér venligst internetforbindelsen.',
    error: (n) => 'Fejl ' + n,
    badKey: 'Nøglen er ufuldstændig eller indeholder en tastefejl.',
    wrongProduct: (name, code) => `Dette er ikke en nøgle til ${name} (den skal begynde med ${code}-).`,
    badAnswer: 'Svaret fra licensserveren er ugyldigt.',
    needInternet: 'Det kræver internet at frigive enheden.',
    keyFirst: 'Indtast venligst licensnøglen først.',
    codeMismatch: 'Aktiveringskoden passer ikke til denne enhed.',
  },
};
/** Systemsprache (z. B. app.getLocale()) → de | en | da */
const mapLocale = (loc) => { const n = String(loc || '').toLowerCase(); return n.startsWith('de') ? 'de' : /^(da|nb|nn|no)\b/.test(n) ? 'da' : 'en'; };

/** Gerätekennung: stabile ID des Betriebssystems (nicht die Netzwerkkarte, die wechselt bei VPN/WLAN) */
function machineId(appSalt) {
  let raw = '';
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true });
      raw = (/MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out) || [])[1] || '';
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' });
      raw = (/"IOPlatformUUID" = "([^"]+)"/.exec(out) || [])[1] || '';
    } else {
      for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) { try { raw = fs.readFileSync(f, 'utf8').trim(); if (raw) break; } catch (e) { /* weiter */ } }
    }
  } catch (e) { raw = ''; }
  if (!raw) raw = [os.hostname(), os.platform(), os.arch(), (os.cpus()[0] || {}).model, Math.round(os.totalmem() / 2 ** 30)].join('|');
  return crypto.createHash('sha256').update(appSalt + '|' + raw).digest('hex').slice(0, 32);
}

/** Lizenzschlüssel prüfen (Format und Prüfzeichen) – gleiche Regeln wie auf dem Server */
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function checksum(body) {
  let s = 0;
  for (let i = 0; i < body.length; i++) s = (s * 31 + ALPHA.indexOf(body[i]) + 7 * (i + 1)) % 32;
  return ALPHA[s];
}
function normKey(input) {
  const s = String(input || '').toUpperCase().replace(/[\s_–—]+/g, '-').replace(/^-+|-+$/g, '');
  const m = /^([A-Z]{3})-?([0-9A-Z]{5})-?([0-9A-Z]{5})-?([0-9A-Z]{5})-?([0-9A-Z]{5})$/.exec(s);
  if (!m) return null;
  const fix = (x) => x.replace(/O/g, '0').replace(/[IL]/g, '1');
  const parts = [fix(m[2]), fix(m[3]), fix(m[4]), fix(m[5])];
  const body = parts.join('');
  if ([...body].some((c) => !ALPHA.includes(c)) || checksum(m[1] + body.slice(0, 19)) !== body[19]) return null;
  return [m[1], ...parts].join('-');
}

function verifyToken(publicKey, token) {
  const [body, sig] = String(token || '').trim().split('.');
  if (!body || !sig) return null;
  try {
    if (!crypto.verify(null, Buffer.from(body), publicKey, Buffer.from(sig, 'base64url'))) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (e) { return null; }
}

/**
 * cfg: {product, code, name, server, trialDays, version, publicKey}
 * dir: Ordner für die Lizenzdatei (app.getPath('userData'))
 * opts.fetch / opts.now für Tests, opts.lang: 'de' | 'en' | 'da' (Standard 'de'; später mit setLang änderbar)
 */
function create(cfg, dir, opts = {}) {
  const now = opts.now || (() => Date.now());
  let lang = MSG[opts.lang] ? opts.lang : 'de';
  const M = () => MSG[lang];
  const fmt = (ms) => new Date(ms).toLocaleDateString(LOCALE[lang]);
  const doFetch = opts.fetch || ((...a) => fetch(...a));
  const pub = crypto.createPublicKey(cfg.publicKey);
  const machine = opts.machine || machineId(cfg.product);
  const file = path.join(dir, 'lizenz.json');
  // zweite Spur für den Testzeitraum (Neuinstallation setzt ihn nicht zurück)
  const trailFile = opts.trailFile || path.join(os.homedir(), `.${cfg.product}studio-${machine.slice(0, 8)}`);

  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; } };
  const write = (d) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(d, null, 1)); };
  let data = read();

  function firstRun() {
    let t = data.first || 0;
    try { const x = +fs.readFileSync(trailFile, 'utf8'); if (x > 0 && (!t || x < t)) t = x; } catch (e) { /* keine Spur */ }
    if (!t) t = now();
    if (data.first !== t) { data.first = t; write(data); }
    try { fs.writeFileSync(trailFile, String(t)); } catch (e) { /* egal */ }
    return t;
  }

  /** Aktueller Zustand: licensed | trial | expired | offline (Prüfung überfällig) | updates (Version neuer als die Updates) | revoked | invalid */
  function state() {
    const t = now();
    // Uhr zurückgestellt? Dann gilt der Testzeitraum als abgelaufen und die Freigabe muss online erneuert werden
    const rollback = data.lastSeen && t < data.lastSeen - DAY;
    if (!rollback && (!data.lastSeen || t > data.lastSeen)) { data.lastSeen = t; write(data); }
    if (data.revoked) return { status: 'revoked', key: data.key, message: data.message || M().revoked };
    if (data.key && data.token) {
      const tok = verifyToken(pub, data.token);
      if (!tok || tok.m !== machine || tok.p !== cfg.product) return { status: 'invalid', key: data.key, message: M().invalid };
      if (rollback) return { status: 'offline', key: data.key, name: tok.n, message: M().rollback };
      if (t > tok.exp) return { status: 'offline', key: data.key, name: tok.n, message: M().offline };
      const updatesUntil = tok.u || 0;
      if (updatesUntil && cfg.released && cfg.released > updatesUntil) {
        return { status: 'updates', key: data.key, name: tok.n, updatesUntil, released: cfg.released, checkDue: t > tok.chk,
          message: M().updates(cfg.version, fmt(cfg.released), fmt(updatesUntil)) };
      }
      return { status: 'licensed', key: data.key, name: tok.n, updatesUntil, checkDue: t > tok.chk, until: tok.exp, daysOffline: Math.max(0, Math.ceil((tok.exp - t) / DAY)), lastCheck: data.lastCheck || tok.iat };
    }
    const first = firstRun();
    const left = Math.ceil((first + (cfg.trialDays || 14) * DAY - t) / DAY);
    if (left > 0 && !rollback) return { status: 'trial', daysLeft: left };
    return { status: 'expired', message: M().expired };
  }

  async function call(pathname, body) {
    if (!cfg.server) throw Object.assign(new Error(M().noServer), { offline: true });
    body = { ...body, lang };
    let r;
    try {
      r = await doFetch(cfg.server.replace(/\/$/, '') + pathname, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    } catch (e) { throw Object.assign(new Error(M().unreachable), { offline: true }); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw Object.assign(new Error(d.message || M().error(r.status)), { status: r.status, error: d.error });
    return d;
  }
  const label = () => `${os.hostname()} (${{ win32: 'Windows', darwin: 'Mac', linux: 'Linux' }[process.platform] || process.platform})`;

  /** Mit Schlüssel freischalten */
  async function activate(input) {
    const key = normKey(input);
    if (!key) throw new Error(M().badKey);
    if (!key.startsWith(cfg.code + '-')) throw new Error(M().wrongProduct(cfg.name, cfg.code));
    const d = await call('/api/license/activate', { key, machine, product: cfg.product, label: label(), version: cfg.version });
    const tok = verifyToken(pub, d.token);
    if (!tok || tok.m !== machine) throw new Error(M().badAnswer);
    data = { ...data, key, token: d.token, revoked: false, message: '', lastCheck: now() };
    write(data);
    return state();
  }

  /** Regelmäßige Prüfung (still im Hintergrund). Liefert den neuen Zustand. */
  async function check() {
    if (!data.key || !data.token) return state();
    try {
      const d = await call('/api/license/check', { key: data.key, machine, product: cfg.product, label: label(), version: cfg.version });
      if (verifyToken(pub, d.token)) { data.token = d.token; data.lastCheck = now(); data.lastSeen = now(); write(data); }
    } catch (e) {
      if (!e.offline && ['revoked', 'unknown', 'product'].includes(e.error)) { data.revoked = true; data.message = e.message; write(data); }
      else if (!e.offline && e.error === 'devices') { data.token = ''; write(data); }
      // offline: die bisherige Freigabe gilt weiter bis zu ihrem Ablauf
    }
    return state();
  }

  /** Dieses Gerät abmelden (für den Umzug auf einen neuen Rechner) */
  async function deactivate() {
    if (data.key) { try { await call('/api/license/deactivate', { key: data.key, machine }); } catch (e) { if (!e.offline) throw e; throw new Error(M().needInternet); } }
    data = { first: data.first, lastSeen: data.lastSeen };
    write(data);
    return state();
  }

  /** Offline-Freischaltcode (vom Verkäufer, passend zum Gerätecode) eintragen */
  function offline(key, code) {
    const k = normKey(key);
    const tok = verifyToken(pub, code);
    if (!k || !k.startsWith(cfg.code + '-')) throw new Error(M().keyFirst);
    if (!tok || tok.m !== machine || tok.p !== cfg.product) throw new Error(M().codeMismatch);
    data = { ...data, key: k, token: String(code).trim(), revoked: false, message: '', lastCheck: now() };
    write(data);
    return state();
  }

  /** Sprache der Meldungen wechseln (de | en | da) */
  const setLang = (l) => { if (MSG[l]) lang = l; return lang; };
  return { state, activate, check, deactivate, offline, machine, normKey, setLang, get lang() { return lang; } };
}

module.exports = { create, machineId, normKey, verifyToken, mapLocale, MSG, LOCALE };
