/* Desktop-Hülle für StickStudio, FräsStudio und LaserStudio (Electron).
   Lädt das Programm aus app/, prüft die Lizenz (Testzeit, Freischaltung, regelmäßige Prüfung)
   und gibt dem Programm USB (Web Serial) und Kamera frei. */
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
const title = (st) => `${cfg.name}${st && st.status === 'licensed' && st.name ? ' – lizenziert für ' + st.name : st && st.status === 'trial' ? ` – Testversion (noch ${st.daysLeft} ${st.daysLeft === 1 ? 'Tag' : 'Tage'})` : ''}`;
const usable = (st) => st.status === 'licensed' || st.status === 'trial';

function showApp(st) {
  current = 'app';
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.setTitle(title(st));
}
function showLicense(reason) {
  current = 'license';
  win.loadFile(path.join(__dirname, 'license.html'), { query: { reason: reason || '' } });
  win.setTitle(`${cfg.name} – Lizenz`);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, show: false, backgroundColor: '#eef0f2',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('page-title-updated', (e) => e.preventDefault());
  // Links nach außen (Rechtstexte, Hilfe, Downloads von KI-Modellen) im normalen Browser öffnen
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  // Laufender Auftrag an der Maschine: Schließen nachfragen (das Programm setzt beforeunload)
  win.webContents.on('will-prevent-unload', (e) => {
    const c = dialog.showMessageBoxSync(win, { type: 'warning', buttons: ['Weiterarbeiten', 'Trotzdem schließen'], defaultId: 0, cancelId: 0, title: cfg.name, message: 'Es läuft noch ein Auftrag an der Maschine. Wirklich schließen?' });
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
  if (st.status === 'offline' && st.key) st = await lic.check();
  if (!win) return;
  if (current === 'app' && !usable(st)) {
    dialog.showMessageBox(win, { type: 'warning', title: cfg.name, message: st.message || 'Die Lizenz ist nicht mehr gültig.', detail: 'Ungespeicherte Arbeit bitte jetzt sichern. Das Lizenzfenster öffnet sich danach.', buttons: ['OK'] }).then(() => showLicense(st.status));
  } else if (current === 'app') {
    win.setTitle(title(st));
    // Prüfung lange fällig (offline): rechtzeitig vorwarnen
    if (st.status === 'licensed' && st.daysOffline <= 7 && st.checkDue) win.webContents.send('license-warning', `Die Lizenz konnte seit Längerem nicht online geprüft werden. Bitte innerhalb von ${st.daysOffline} Tag(en) mit dem Internet verbinden, sonst sperrt sich ${cfg.name}.`);
  }
}

// ---- Lizenzfenster ↔ Hauptprozess
ipcMain.handle('license:info', () => ({ ...lic.state(), product: cfg.product, name: cfg.name, code: cfg.code, machine: lic.machine, buyUrl: cfg.buyUrl || '', server: !!cfg.server, version: cfg.version, trialDays: cfg.trialDays }));
ipcMain.handle('license:activate', async (e, key) => { try { return { ok: true, state: await lic.activate(key) }; } catch (x) { return { ok: false, message: x.message }; } });
ipcMain.handle('license:offline', (e, key, code) => { try { return { ok: true, state: lic.offline(key, code) }; } catch (x) { return { ok: false, message: x.message }; } });
ipcMain.handle('license:check', async () => ({ ok: true, state: await lic.check() }));
ipcMain.handle('license:deactivate', async () => {
  const c = await dialog.showMessageBox(win, { type: 'question', buttons: ['Abbrechen', 'Freigeben'], defaultId: 0, cancelId: 0, title: cfg.name, message: 'Dieses Gerät abmelden?', detail: 'Danach kann der Schlüssel auf einem anderen Computer benutzt werden. Hier ist das Programm dann gesperrt, bis es wieder freigeschaltet wird.' });
  if (c.response !== 1) return { ok: false, cancelled: true };
  try { return { ok: true, state: await lic.deactivate() }; } catch (x) { return { ok: false, message: x.message }; }
});
ipcMain.handle('license:continue', () => { const st = lic.state(); if (usable(st)) showApp(st); return st; });
ipcMain.handle('license:open', () => showLicense());
ipcMain.on('license:buy', () => { if (cfg.buyUrl) shell.openExternal(cfg.buyUrl); });

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
    wc.send('serial:choose', ports.map((p) => ({ id: p.portId, name: p.displayName || p.portName, port: p.portName, vid: p.vendorId, pid: p.productId })));
  });
  ses.on('serial-port-added', (e, port, wc) => wc.send('serial:added', { id: port.portId, name: port.displayName || port.portName, port: port.portName }));
  ses.on('serial-port-removed', (e, port, wc) => wc.send('serial:removed', port.portId));
}

function setupMenu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: cfg.name, submenu: [{ role: 'about', label: `Über ${cfg.name}` }, { type: 'separator' }, { role: 'hide', label: 'Ausblenden' }, { role: 'quit', label: 'Beenden' }] }] : []),
    { label: 'Programm', submenu: [
      { label: 'Lizenz …', click: () => showLicense() },
      { label: 'Lizenz jetzt prüfen', click: async () => { const st = await lic.check(); dialog.showMessageBox(win, { type: usable(st) ? 'info' : 'warning', title: cfg.name, message: st.status === 'licensed' ? `Lizenz gültig${st.name ? ' für ' + st.name : ''}.` : st.status === 'trial' ? `Testversion: noch ${st.daysLeft} Tage.` : st.message || 'Keine gültige Lizenz.' }); if (!usable(st)) showLicense(st.status); } },
      { type: 'separator' },
      mac ? { role: 'close', label: 'Fenster schließen' } : { role: 'quit', label: 'Beenden' },
    ] },
    { label: 'Bearbeiten', submenu: [{ role: 'undo', label: 'Rückgängig' }, { role: 'redo', label: 'Wiederholen' }, { type: 'separator' }, { role: 'cut', label: 'Ausschneiden' }, { role: 'copy', label: 'Kopieren' }, { role: 'paste', label: 'Einfügen' }, { role: 'selectAll', label: 'Alles auswählen' }] },
    { label: 'Ansicht', submenu: [{ role: 'resetZoom', label: 'Originalgröße' }, { role: 'zoomIn', label: 'Größer' }, { role: 'zoomOut', label: 'Kleiner' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Vollbild' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }, { role: 'reload' }])] },
  ]));
}

app.whenReady().then(() => {
  lic = LIC.create(cfg, app.getPath('userData'));
  setupSession();
  setupMenu();
  createWindow();
  periodicCheck().catch(() => {});
  setInterval(() => periodicCheck().catch(() => {}), 3 * HOUR);
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
