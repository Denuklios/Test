'use strict';
/* FräsStudio Desktop: kleines Electron-Gehäuse um die Web-Anwendung.
   - liefert die Dateien über http://127.0.0.1:<Port> aus (sicherer Kontext: USB/Kamera funktionieren)
   - eingebaute Telnet-Brücke für WLAN (/api/cnc/*)
   - USB-Auswahldialog für Web Serial */
const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const bridge = require('./bridge');

const WWW = [path.join(process.resourcesPath || '', 'www'), path.join(__dirname, '..', 'fraesstudio')].find((d) => fs.existsSync(path.join(d, 'index.html')));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.gz': 'application/gzip' };
let server, origin, win;

function serve() {
  return new Promise((resolve) => {
    server = http.createServer(async (req, res) => {
      try {
        const host = String(req.headers.host || '');
        if (host !== '127.0.0.1:' + server.address().port) { res.writeHead(403); return res.end('Forbidden'); } // gegen DNS-Rebinding
        const url = new URL(req.url, 'http://x');
        if (await bridge.handle(req, res, url)) return;
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
        let rel = decodeURIComponent(url.pathname);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = path.normalize(path.join(WWW, rel));
        if (!file.startsWith(WWW + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        fs.createReadStream(file).pipe(res);
      } catch (e) { res.writeHead(500); res.end('Fehler'); }
    });
    server.listen(0, '127.0.0.1', () => { origin = 'http://127.0.0.1:' + server.address().port; resolve(); });
  });
}

function setupSession() {
  const ses = session.defaultSession;
  const ok = new Set(['serial', 'media', 'clipboard-sanitized-write', 'fullscreen']);
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(ok.has(perm) && wc.getURL().startsWith(origin)));
  ses.setPermissionCheckHandler((wc, perm) => ok.has(perm));
  ses.setDevicePermissionHandler((d) => d.deviceType === 'serial');
  ses.on('select-serial-port', async (e, ports, wc, cb) => {
    e.preventDefault();
    if (!ports.length) { cb(''); dialog.showMessageBox(win, { type: 'info', message: 'Keine Fräse per USB gefunden.', detail: 'Kabel anstecken, Maschine einschalten und es erneut versuchen. Unter Windows ggf. den CH340-Treiber installieren.' }); return; }
    if (ports.length === 1) return cb(ports[0].portId);
    const label = (p) => [p.displayName || p.portName, p.portName].filter(Boolean).join(' – ');
    const r = await dialog.showMessageBox(win, { type: 'question', message: 'Welcher USB-Anschluss ist die Fräse?', buttons: [...ports.map(label), 'Abbrechen'], cancelId: ports.length });
    cb(r.response < ports.length ? ports[r.response].portId : '');
  });
  // Speichern-Dialog für Downloads (G-Code, SVG, Projekt) kommt von Electron selbst
}

function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 900, minHeight: 600, title: 'FräsStudio', backgroundColor: '#1b1d22', autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false } });
  win.loadURL(origin + '/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url) && !url.startsWith(origin)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on('close', (e) => {
    // laufender Auftrag? Die Web-Anwendung meldet das über FS.grbl.job
    win.webContents.executeJavaScript('!!(window.FS && FS.grbl && FS.grbl.job)').then((run) => {
      if (run && !win.forceClose) {
        const c = dialog.showMessageBoxSync(win, { type: 'warning', message: 'Die Fräse läuft noch.', detail: 'Beim Beenden wird die Verbindung getrennt und die Maschine gestoppt (Not-Aus).', buttons: ['Weiter fräsen', 'Beenden und stoppen'], defaultId: 0, cancelId: 0 });
        if (c === 1) { win.forceClose = true; win.close(); }
      } else { win.forceClose = true; win.close(); }
    }).catch(() => { win.forceClose = true; win.close(); });
    if (!win.forceClose) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
}

function menu() {
  const t = [
    { label: 'Datei', submenu: [{ role: 'quit', label: 'Beenden' }] },
    { label: 'Ansicht', submenu: [{ role: 'reload', label: 'Neu laden' }, { role: 'togglefullscreen', label: 'Vollbild' }, { role: 'zoomIn', label: 'Vergrößern' }, { role: 'zoomOut', label: 'Verkleinern' }, { role: 'resetZoom', label: 'Zoom zurücksetzen' }, { type: 'separator' }, { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' }] },
    { label: 'Hilfe', submenu: [{ label: 'Über FräsStudio', click: () => dialog.showMessageBox(win, { message: 'FräsStudio ' + app.getVersion(), detail: 'CAD + CAM + Maschinensteuerung für die Twotrees TTC450 (GRBL).' }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.commandLine.appendSwitch('enable-features', 'WebSerial');
  app.whenReady().then(async () => {
    if (!WWW) { dialog.showErrorBox('FräsStudio', 'Programmdateien nicht gefunden.'); return app.quit(); }
    await serve(); setupSession(); menu(); createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { bridge.closeAll(true); try { server.close(); } catch (e) { /* zu */ } });
}
