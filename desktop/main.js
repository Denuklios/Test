/* Desktop-Hülle für StickStudio, FräsStudio und LaserStudio (Electron).
   Lädt das Programm aus app/, prüft die Lizenz (Testzeit, Freischaltung, regelmäßige Prüfung)
   und gibt dem Programm USB (Web Serial) und Kamera frei.
   Sprache (Deutsch/Englisch/Dänisch): die im Programm gewählte (localStorage '<produkt>studio.lang'), sonst die des Systems. */
'use strict';
const { app, BrowserWindow, Menu, session, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const LIC = require('./license.js');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'product.json'), 'utf8'));
cfg.publicKey = fs.readFileSync(path.join(__dirname, 'license-public.pem'), 'utf8');
cfg.version = app.getVersion();
const HOUR = 36e5;

if (!app.requestSingleInstanceLock()) app.quit();

let win = null, lic = null, current = null, serialPick = null;

/* ---- Sprache ---- */
const LANGS = ['de', 'en', 'da'];
const LANG_KEY = `${cfg.product}studio.lang`; // so speichert das Programm (js/i18n.js) die gewählte Sprache
const T = {
  de: {
    licensedFor: (n) => ' – lizenziert für ' + n, trialTitle: (d) => ` – Testversion (noch ${d} ${d === 1 ? 'Tag' : 'Tage'})`, licenseTitle: 'Lizenz',
    keepWorking: 'Weiterarbeiten', closeAnyway: 'Trotzdem schließen', jobRunning: 'Es läuft noch ein Auftrag an der Maschine. Wirklich schließen?',
    notValid: 'Die Lizenz ist nicht mehr gültig.', saveNow: 'Ungespeicherte Arbeit bitte jetzt sichern. Das Lizenzfenster öffnet sich danach.',
    offlineWarn: (d, n) => `Die Lizenz konnte seit Längerem nicht online geprüft werden. Bitte innerhalb von ${d} Tag(en) mit dem Internet verbinden, sonst sperrt sich ${n}.`,
    cancel: 'Abbrechen', release: 'Freigeben', releaseQ: 'Dieses Gerät abmelden?', releaseDetail: 'Danach kann der Schlüssel auf einem anderen Computer benutzt werden. Hier ist das Programm dann gesperrt, bis es wieder freigeschaltet wird.',
    valid: (n) => `Lizenz gültig${n ? ' für ' + n : ''}.`, trialLeft: (d) => `Testversion: noch ${d} ${d === 1 ? 'Tag' : 'Tage'}.`, noLicense: 'Keine gültige Lizenz.',
    about: (n) => `Über ${n}`, hide: 'Ausblenden', quit: 'Beenden', program: 'Programm', license: 'Lizenz …', checkNow: 'Lizenz jetzt prüfen', closeWin: 'Fenster schließen',
    edit: 'Bearbeiten', undo: 'Rückgängig', redo: 'Wiederholen', cut: 'Ausschneiden', copy: 'Kopieren', paste: 'Einfügen', selectAll: 'Alles auswählen',
    view: 'Ansicht', resetZoom: 'Originalgröße', zoomIn: 'Größer', zoomOut: 'Kleiner', fullscreen: 'Vollbild', language: 'Sprache',
  },
  en: {
    licensedFor: (n) => ' – licensed to ' + n, trialTitle: (d) => ` – Trial (${d} ${d === 1 ? 'day' : 'days'} left)`, licenseTitle: 'License',
    keepWorking: 'Keep working', closeAnyway: 'Close anyway', jobRunning: 'A job is still running on the machine. Close anyway?',
    notValid: 'The license is no longer valid.', saveNow: 'Please save any unsaved work now. The license window opens afterwards.',
    offlineWarn: (d, n) => `The license has not been checked online for a while. Please connect to the internet within ${d} day(s), otherwise ${n} will lock.`,
    cancel: 'Cancel', release: 'Release', releaseQ: 'Sign out this device?', releaseDetail: 'The key can then be used on another computer. The program will be locked here until it is activated again.',
    valid: (n) => `License valid${n ? ' for ' + n : ''}.`, trialLeft: (d) => `Trial: ${d} ${d === 1 ? 'day' : 'days'} left.`, noLicense: 'No valid license.',
    about: (n) => `About ${n}`, hide: 'Hide', quit: 'Quit', program: 'Program', license: 'License …', checkNow: 'Check license now', closeWin: 'Close window',
    edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select all',
    view: 'View', resetZoom: 'Actual size', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fullscreen: 'Full screen', language: 'Language',
  },
  da: {
    licensedFor: (n) => ' – licenseret til ' + n, trialTitle: (d) => ` – prøveversion (${d} ${d === 1 ? 'dag' : 'dage'} tilbage)`, licenseTitle: 'Licens',
    keepWorking: 'Arbejd videre', closeAnyway: 'Luk alligevel', jobRunning: 'Der kører stadig et job på maskinen. Vil du virkelig lukke?',
    notValid: 'Licensen er ikke længere gyldig.', saveNow: 'Gem venligst dit arbejde nu. Derefter åbner licensvinduet.',
    offlineWarn: (d, n) => `Licensen har længe ikke kunnet kontrolleres online. Forbind venligst til internettet inden for ${d} dag(e), ellers låser ${n} sig.`,
    cancel: 'Annuller', release: 'Frigiv', releaseQ: 'Log denne enhed af?', releaseDetail: 'Derefter kan nøglen bruges på en anden computer. Her er programmet så låst, indtil det aktiveres igen.',
    valid: (n) => `Licensen er gyldig${n ? ' for ' + n : ''}.`, trialLeft: (d) => `Prøveversion: ${d} ${d === 1 ? 'dag' : 'dage'} tilbage.`, noLicense: 'Ingen gyldig licens.',
    about: (n) => `Om ${n}`, hide: 'Skjul', quit: 'Afslut', program: 'Program', license: 'Licens …', checkNow: 'Kontrollér licens nu', closeWin: 'Luk vindue',
    edit: 'Rediger', undo: 'Fortryd', redo: 'Gentag', cut: 'Klip', copy: 'Kopiér', paste: 'Sæt ind', selectAll: 'Vælg alt',
    view: 'Vis', resetZoom: 'Faktisk størrelse', zoomIn: 'Zoom ind', zoomOut: 'Zoom ud', fullscreen: 'Fuld skærm', language: 'Sprog',
  },
};
const langFile = () => path.join(app.getPath('userData'), 'sprache.json');
let lang = 'de';
function initLang() {
  let saved = '';
  try { saved = JSON.parse(fs.readFileSync(langFile(), 'utf8')).lang; } catch (e) { /* noch nie gewählt */ }
  lang = LANGS.includes(saved) ? saved : LIC.mapLocale(app.getLocale());
}
const t = () => T[lang];
/** Sprache wechseln: Menü, Fenstertitel und Lizenzmeldungen folgen; toPage: auch das Programm umschalten */
function setLang(l, toPage) {
  if (!LANGS.includes(l)) return lang;
  if (toPage && win) {
    const js = `try { localStorage.setItem(${JSON.stringify(LANG_KEY)}, ${JSON.stringify(l)}); } catch (e) {} if (window.HW && HW.i18n && HW.i18n.lang !== ${JSON.stringify(l)}) HW.i18n.setLang(${JSON.stringify(l)});`;
    win.webContents.executeJavaScript(js, true).catch(() => {});
  }
  if (l === lang) return lang;
  lang = l;
  if (lic) lic.setLang(l);
  try { fs.writeFileSync(langFile(), JSON.stringify({ lang: l })); } catch (e) { /* egal */ }
  setupMenu();
  if (win && lic) win.setTitle(current === 'license' ? `${cfg.name} – ${t().licenseTitle}` : title(lic.state()));
  if (win && current === 'license') win.webContents.send('desktop:lang', l);
  return lang;
}
// Kauf-Links: Sprache mitgeben, damit die Lizenz-E-Mail in der richtigen Sprache kommt (Lemon Squeezy: checkout[custom][lang])
function withLang(url) {
  try { const u = new URL(url); if (/lemonsqueezy\.com$/.test(u.hostname)) u.searchParams.set('checkout[custom][lang]', lang); return u; } catch (e) { return null; }
}

const title = (st) => `${cfg.name}${st && st.status === 'licensed' && st.name ? t().licensedFor(st.name) : st && st.status === 'trial' ? t().trialTitle(st.daysLeft) : ''}`;
const usable = (st) => st.status === 'licensed' || st.status === 'trial';

function showApp(st) {
  current = 'app';
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.setTitle(title(st));
}
function showLicense(reason) {
  current = 'license';
  win.loadFile(path.join(__dirname, 'license.html'), { query: { reason: reason || '' } });
  win.setTitle(`${cfg.name} – ${t().licenseTitle}`);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#eef0f2',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('page-title-updated', (e) => e.preventDefault());
  // Sprache des Programms übernehmen (gespeichert von js/i18n.js); Wechsel im Programm meldet preload.js
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`(() => { try { return localStorage.getItem(${JSON.stringify(LANG_KEY)}) || ''; } catch (e) { return ''; } })()`, true)
      .then((l) => { if (LANGS.includes(l)) setLang(l); else if (current === 'license') setLang(lang, true); }).catch(() => {});
  });
  // Links nach außen (Rechtstexte, Hilfe, Downloads von KI-Modellen) im normalen Browser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // Laufender Auftrag an der Maschine: Schließen nachfragen (das Programm setzt beforeunload)
  win.webContents.on('will-prevent-unload', (e) => {
    const c = dialog.showMessageBoxSync(win, { type: 'warning', buttons: [t().keepWorking, t().closeAnyway], defaultId: 0, cancelId: 0, title: cfg.name, message: t().jobRunning });
    if (c === 1) e.preventDefault();
  });
  const st = lic.state();
  if (usable(st) && !(st.status === 'trial' && shouldNagTrial())) showApp(st); else showLicense();
}

// In der Testzeit beim Start nach dem Schlüssel fragen (höchstens einmal am Tag)
function shouldNagTrial() {
  const f = path.join(app.getPath('userData'), 'hinweis.json');
  let last = 0;
  try { last = JSON.parse(fs.readFileSync(f, 'utf8')).t || 0; } catch (e) { /* nie */ }
  if (Date.now() - last < 20 * HOUR) return false;
  try { fs.writeFileSync(f, JSON.stringify({ t: Date.now() })); } catch (e) { /* egal */ }
  return true;
}

// Prüfung „zwischendurch“: beim Start und alle 3 Stunden, online sobald fällig
async function periodicCheck() {
  let st = lic.state();
  if (st.status === 'licensed' && st.checkDue) st = await lic.check();
  if ((st.status === 'offline' || st.status === 'updates') && st.key) st = await lic.check();
  if (!win) return;
  if (current === 'app' && !usable(st)) {
    dialog.showMessageBox(win, { type: 'warning', title: cfg.name, message: st.message || t().notValid, detail: t().saveNow, buttons: ['OK'] }).then(() => showLicense(st.status));
  } else if (current === 'app') {
    win.setTitle(title(st));
    // Prüfung lange fällig (offline): rechtzeitig vorwarnen
    if (st.status === 'licensed' && st.daysOffline <= 7 && st.checkDue) win.webContents.send('license-warning', t().offlineWarn(st.daysOffline, cfg.name), lang);
  }
}

// ---- Lizenzfenster ↔ Hauptprozess
ipcMain.handle('license:info', () => { const st = lic.state(); return { ...st, holder: st.name || '', product: cfg.product, name: cfg.name, code: cfg.code, machine: lic.machine, buyUrl: cfg.buyUrl || '', renewUrl: cfg.renewUrl || '', server: !!cfg.server, version: cfg.version, released: cfg.released, trialDays: cfg.trialDays, lang }; });
ipcMain.handle('desktop:setLang', (e, l) => setLang(l, true));
// Sprachwechsel im Programm (preload.js beobachtet <html lang>)
ipcMain.on('desktop:pageLang', (e, l) => { if (current === 'app') setLang(l); });
ipcMain.handle('license:activate', async (e, key) => { try { return { ok: true, state: await lic.activate(key) }; } catch (x) { return { ok: false, message: x.message }; } });
ipcMain.handle('license:offline', (e, key, code) => { try { return { ok: true, state: lic.offline(key, code) }; } catch (x) { return { ok: false, message: x.message }; } });
ipcMain.handle('license:check', async () => ({ ok: true, state: await lic.check() }));
ipcMain.handle('license:deactivate', async () => {
  const c = await dialog.showMessageBox(win, { type: 'question', buttons: [t().cancel, t().release], defaultId: 0, cancelId: 0, title: cfg.name, message: t().releaseQ, detail: t().releaseDetail });
  if (c.response !== 1) return { ok: false, cancelled: true };
  try { return { ok: true, state: await lic.deactivate() }; } catch (x) { return { ok: false, message: x.message }; }
});
ipcMain.handle('license:continue', () => { const st = lic.state(); if (usable(st)) showApp(st); return st; });
ipcMain.handle('license:open', () => showLicense());
ipcMain.on('license:buy', () => { if (cfg.buyUrl) shell.openExternal(String(withLang(cfg.buyUrl) || cfg.buyUrl)); });
// Update-Verlängerung kaufen: Schlüssel geht mit, damit der Server die richtige Lizenz verlängert
ipcMain.on('license:renew', () => {
  if (!cfg.renewUrl) return;
  try { const u = withLang(cfg.renewUrl) || new URL(cfg.renewUrl); const st = lic.state(); if (st.key) u.searchParams.set('checkout[custom][license_key]', st.key); shell.openExternal(u.toString()); } catch (e) { shell.openExternal(cfg.renewUrl); }
});

// ---- USB-Anschluss wählen (Web Serial): Liste geht an das Programmfenster, die Auswahl kommt zurück
ipcMain.on('serial:chosen', (e, id) => { if (serialPick) { serialPick(id || ''); serialPick = null; } });

function setupSession() {
  const ses = session.defaultSession;
  const allowed = new Set(['media', 'serial', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen']);
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.has(perm)));
  ses.setPermissionCheckHandler((wc, perm) => allowed.has(perm));
  ses.setDevicePermissionHandler((d) => d.deviceType === 'serial');
  ses.on('select-serial-port', (event, ports, wc, callback) => {
    event.preventDefault();
    serialPick = callback;
    wc.send('serial:choose', ports.map((p) => ({ id: p.portId, name: p.displayName || p.portName, port: p.portName, vid: p.vendorId, pid: p.productId })), lang);
  });
  ses.on('serial-port-added', (e, port, wc) => wc.send('serial:added', { id: port.portId, name: port.displayName || port.portName, port: port.portName }));
  ses.on('serial-port-removed', (e, port, wc) => wc.send('serial:removed', port.portId));
}

function setupMenu() {
  const mac = process.platform === 'darwin';
  const x = t();
  const checkNow = async () => {
    const st = await lic.check();
    dialog.showMessageBox(win, { type: usable(st) ? 'info' : 'warning', title: cfg.name, message: st.status === 'licensed' ? t().valid(st.name) : st.status === 'trial' ? t().trialLeft(st.daysLeft) : st.message || t().noLicense });
    if (!usable(st)) showLicense(st.status);
  };
  const langItem = (l, label) => ({ label, type: 'radio', checked: lang === l, click: () => setLang(l, true) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: cfg.name, submenu: [{ role: 'about', label: x.about(cfg.name) }, { type: 'separator' }, { role: 'hide', label: x.hide }, { role: 'quit', label: x.quit }] }] : []),
    { label: x.program, submenu: [
      { label: x.license, click: () => showLicense() },
      { label: x.checkNow, click: checkNow },
      { type: 'separator' },
      mac ? { role: 'close', label: x.closeWin } : { role: 'quit', label: x.quit },
    ] },
    { label: x.edit, submenu: [{ role: 'undo', label: x.undo }, { role: 'redo', label: x.redo }, { type: 'separator' }, { role: 'cut', label: x.cut }, { role: 'copy', label: x.copy }, { role: 'paste', label: x.paste }, { role: 'selectAll', label: x.selectAll }] },
    { label: x.view, submenu: [{ role: 'resetZoom', label: x.resetZoom }, { role: 'zoomIn', label: x.zoomIn }, { role: 'zoomOut', label: x.zoomOut }, { type: 'separator' }, { role: 'togglefullscreen', label: x.fullscreen },
      { type: 'separator' }, { label: x.language, submenu: [langItem('de', 'Deutsch'), langItem('en', 'English'), langItem('da', 'Dansk')] },
      ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }, { role: 'reload' }])] },
  ]));
}

app.whenReady().then(() => {
  initLang();
  lic = LIC.create(cfg, app.getPath('userData'), { lang });
  setupSession();
  setupMenu();
  createWindow();
  periodicCheck().catch(() => {});
  setInterval(() => periodicCheck().catch(() => {}), 3 * HOUR);
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
