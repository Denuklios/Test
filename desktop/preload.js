/* Brücke zwischen Programmfenster und Hauptprozess: Lizenzfenster, USB-Auswahl, Lizenz-Hinweise. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  license: {
    info: () => ipcRenderer.invoke('license:info'),
    activate: (key) => ipcRenderer.invoke('license:activate', key),
    offline: (key, code) => ipcRenderer.invoke('license:offline', key, code),
    check: () => ipcRenderer.invoke('license:check'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
    continue: () => ipcRenderer.invoke('license:continue'),
    open: () => ipcRenderer.invoke('license:open'),
    buy: () => ipcRenderer.send('license:buy'),
    renew: () => ipcRenderer.send('license:renew'),
  },
});

// ---- Auswahl des USB-Anschlusses (ersetzt die Liste, die Chrome sonst selbst zeigt)
let box = null, ports = [];
function render() {
  if (!box) return;
  const list = box.querySelector('.dk-list');
  list.innerHTML = '';
  if (!ports.length) list.innerHTML = '<div class="dk-empty">Kein Anschluss gefunden. Maschine einschalten und das USB-Kabel (Datenkabel) einstecken – die Liste aktualisiert sich von selbst.</div>';
  for (const p of ports) {
    const b = document.createElement('button');
    const usb = /ch34|cp210|ftdi|usb/i.test(p.name);
    b.innerHTML = `<b></b><span></span>`;
    b.querySelector('b').textContent = p.name;
    b.querySelector('span').textContent = (p.port && p.port !== p.name ? p.port : '') + (p.vid ? ` · ${(+p.vid).toString(16).padStart(4, '0')}:${(+p.pid).toString(16).padStart(4, '0')}` : '');
    if (usb) b.className = 'dk-likely';
    b.onclick = () => close(p.id);
    list.appendChild(b);
  }
}
function close(id) {
  ipcRenderer.send('serial:chosen', id || '');
  if (box) box.remove();
  box = null;
}
ipcRenderer.on('serial:choose', (e, list) => {
  ports = list;
  if (box) box.remove();
  box = document.createElement('div');
  box.className = 'dk-serial';
  box.innerHTML = `<style>
    .dk-serial{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif}
    .dk-serial .dk-box{background:#fff;color:#1b2129;border-radius:10px;padding:16px 18px;width:min(460px,92vw);box-shadow:0 16px 48px rgba(0,0,0,.35)}
    .dk-serial h2{margin:0 0 10px;font-size:16px}.dk-serial .dk-list{display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto}
    .dk-serial .dk-list button{text-align:left;padding:8px 10px;border:1px solid #d6dadf;border-radius:7px;background:#f6f7f8;cursor:pointer;display:flex;flex-direction:column}
    .dk-serial .dk-list button:hover{border-color:#2f6fb0}.dk-serial .dk-list button span{color:#67707b;font-size:12px}
    .dk-serial .dk-likely{border-color:#2f6fb0 !important;background:#e2edf8 !important}.dk-serial .dk-empty{color:#67707b;padding:8px 0}
    .dk-serial .dk-row{display:flex;justify-content:flex-end;margin-top:12px}.dk-serial .dk-row button{padding:6px 14px;border:1px solid #d6dadf;border-radius:6px;background:#eef0f2;cursor:pointer}
  </style><div class="dk-box"><h2>Anschluss der Maschine wählen</h2><div class="dk-list"></div><div class="dk-row"><button class="dk-cancel">Abbrechen</button></div></div>`;
  box.querySelector('.dk-cancel').onclick = () => close('');
  document.body.appendChild(box);
  render();
});
ipcRenderer.on('serial:added', (e, p) => { if (!ports.some((q) => q.id === p.id)) { ports.push(p); render(); } });
ipcRenderer.on('serial:removed', (e, id) => { ports = ports.filter((q) => q.id !== id); render(); });

// ---- Lizenz-Hinweis im Programmfenster (z. B. Prüfung seit Langem nicht möglich)
ipcRenderer.on('license-warning', (e, text) => {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:99998;background:#fff4e5;color:#663c00;border:1px solid #f0b46b;border-radius:8px;padding:8px 14px;font:13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.15);max-width:80vw';
  d.textContent = text;
  const x = document.createElement('button');
  x.textContent = '✕';
  x.style.cssText = 'margin-left:10px;border:0;background:none;cursor:pointer';
  x.onclick = () => d.remove();
  d.appendChild(x);
  document.body.appendChild(d);
});
