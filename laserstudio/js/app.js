/* LaserStudio – Bedienoberfläche: Entwerfen (Ebenen nach Farbe), Vorschau, Lasern, Kamera. */
(function () {
  'use strict';
  const { geo, M, poly, util, shapes: SH, laser: LZ, lib: LIB } = FS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = util.fmt;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  // ---------------------------------------------------------------- Zustand
  function newDoc() {
    const l = LZ.makeLayer(LZ.COLORS[0], { mode: 'line', name: 'Schneiden', speed: 300, power: 100 });
    return { v: 1, app: 'laserstudio', name: 'Unbenannt', objects: [], layers: [l], cur: l.id, thick: 3, job: { start: 'absolute', anchor: 'll' } };
  }
  const S = {
    doc: newDoc(), sel: [], mode: 'design', tool: 'select', selLayer: null,
    view: { s: 2, ox: 100, oy: 500 },
    snap: store.get('ls.snap', true),
    undo: [], redo: [], clip: null,
    draw: null, drag: null, hover: null, nodeSel: null,
    machine: null, grbl: null, job: null, jogStep: 10,
    plan: null, cursor: null, snapMark: null,
  };
  const cam = { stream: null, video: null, on: false, img: null, timer: null, fc: null,
    cal: Object.assign({ deviceId: '', world: null, img: null, k1: 0, opacity: 0.8, live: true, camH: 400 }, store.get('ls.cam', {})) };
  function loadMachine() {
    const m = store.get('ls.machine', { id: 'mecpowx5pro' });
    S.machine = Object.assign({}, LIB.MACHINES[m.id] || LIB.MACHINES.mecpowx5pro, m);
  }
  loadMachine();

  // Bilddaten nicht in jeden Rückgängig-Schritt kopieren
  const assets = new Map();
  const serial = (doc, full) => JSON.stringify(doc, (k, v) => {
    if (k === 'px' && v && v.data) { assets.set(v.id, v); return full ? v : { id: v.id, ref: true }; }
    return v;
  });
  const revive = (json) => {
    const d = JSON.parse(json);
    for (const o of d.objects || []) if (o.px) {
      if (o.px.ref) o.px = assets.get(o.px.id);
      else { if (!o.px.id) o.px.id = util.uid(); if (assets.has(o.px.id)) o.px = assets.get(o.px.id); else assets.set(o.px.id, o.px); }
    }
    return d;
  };

  const gcache = new WeakMap();
  const geom = (o) => { let c = gcache.get(o); if (!c) { c = SH.lines(o); gcache.set(o, c); } return c; };
  const touch = (o) => { gcache.delete(o); };
  const objBox = (o) => { const ls = geom(o); return ls.length ? geo.bounds(ls.map((l) => l.pts)) : null; };
  const boxOf = (objs) => {
    let b = null;
    for (const o of objs) {
      const q = objBox(o);
      if (!q) continue;
      b = b ? { x0: Math.min(b.x0, q.x0), y0: Math.min(b.y0, q.y0), x1: Math.max(b.x1, q.x1), y1: Math.max(b.y1, q.y1) } : { ...q };
    }
    if (b) { b.w = b.x1 - b.x0; b.h = b.y1 - b.y0; }
    return b;
  };
  const selObjs = () => S.sel.map((id) => S.doc.objects.find((o) => o.id === id)).filter(Boolean);
  const objById = (id) => S.doc.objects.find((o) => o.id === id);

  // ---------------------------------------------------------------- Ebenen
  const layerById = (id) => S.doc.layers.find((l) => l.id === id);
  const layerOf = (o) => layerById(o.layer) || S.doc.layers[0];
  const curLayer = () => layerById(S.doc.cur) || S.doc.layers[0];
  const usedLayers = () => S.doc.layers.filter((l) => S.doc.objects.some((o) => o.layer === l.id) || l.id === S.doc.cur);
  const outputObjs = () => S.doc.objects.filter((o) => !o.hidden && layerOf(o).output);
  function layerForColor(color, props) {
    let l = S.doc.layers.find((q) => q.color === color);
    if (!l) {
      const idx = LZ.COLORS.indexOf(color);
      l = LZ.makeLayer(color, Object.assign({ name: idx >= 0 ? `Ebene ${idx + 1}` : 'Ebene' }, props || {}));
      S.doc.layers.push(l);
    }
    return l;
  }
  // Nächste Palettenfarbe zu einer beliebigen Farbe (für SVG-Import)
  function nearestColor(hex) {
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = rgb(hex);
    let best = LZ.COLORS[0], bd = Infinity;
    for (const c of LZ.COLORS) { const b = rgb(c), d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; if (d < bd) { bd = d; best = c; } }
    return best;
  }
  const layerLabel = (l) => l.name || `Ebene ${LZ.COLORS.indexOf(l.color) + 1}`;
  const layerSummary = (l) => (l.mode === 'line' ? `${l.speed} mm/min · ${l.power} %${l.passes > 1 ? ' · ' + l.passes + '×' : ''}` : `${l.speed} · ${l.power} % · ${fmt(l.interval, 2)} mm`);

  // ---------------------------------------------------------------- Rückgängig / Speichern
  function snapshot() {
    S.undo.push(serial(S.doc));
    if (S.undo.length > 60) S.undo.shift();
    S.redo = [];
  }
  let saveTimer = null;
  function changed() {
    S.plan = null;
    pv.reset();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (!store.set('ls.doc', JSON.parse(serial(S.doc, true)))) store.set('ls.doc', null); }, 800);
    renderSide();
    redraw();
    updUndo();
  }
  function restore(json) {
    S.doc = revive(json);
    S.sel = S.sel.filter((id) => objById(id));
    changed();
  }
  const undo = () => { if (!S.undo.length) { status('Nichts mehr rückgängig zu machen.'); return; } S.redo.push(serial(S.doc)); restore(S.undo.pop()); status('Rückgängig'); };
  const redo = () => { if (!S.redo.length) { status('Nichts zum Wiederholen.'); return; } S.undo.push(serial(S.doc)); restore(S.redo.pop()); status('Wiederholt'); };
  function updUndo() {
    const u = $('#undoBtn'), r = $('#redoBtn');
    if (u) { u.disabled = !S.undo.length; u.title = `Rückgängig (Strg+Z)${S.undo.length ? ' – ' + S.undo.length + ' Schritt(e)' : ''}`; }
    if (r) { r.disabled = !S.redo.length; r.title = `Wiederholen (Strg+Y)${S.redo.length ? ' – ' + S.redo.length + ' Schritt(e)' : ''}`; }
  }

  // ---------------------------------------------------------------- Kleinkram
  let statusTimer;
  function status(msg, warn) {
    const el = $('#status');
    el.innerHTML = warn ? `<span class="warn">${esc(msg)}</span>` : esc(msg);
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { el.textContent = ''; }, 6000);
  }
  function hint(t) { $('#hint').innerHTML = t || ''; }

  function modal(title, html, buttons = [{ label: 'OK', primary: true }], opts = {}) {
    return new Promise((resolve) => {
      $('#modalTitle').textContent = title;
      $('#modalBody').innerHTML = html;
      $('#modal .box').classList.toggle('wide', !!opts.wide);
      const bb = $('#modalBtns');
      bb.innerHTML = '';
      const close = (v) => { $('#modal').classList.add('hidden'); document.removeEventListener('keydown', key, true); if (opts.onClose) opts.onClose(); resolve(v); };
      buttons.forEach((b) => {
        const el = document.createElement('button');
        el.textContent = b.label;
        if (b.primary) el.className = 'primary';
        if (b.danger) el.className = 'danger';
        el.onclick = () => { if (b.onClick && b.onClick() === false) return; close(b.value !== undefined ? b.value : b.label); };
        bb.appendChild(el);
      });
      const key = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(null); }
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !opts.noEnter) { const p = bb.querySelector('.primary'); if (p) { e.preventDefault(); e.stopPropagation(); p.click(); } }
      };
      document.addEventListener('keydown', key, true);
      $('#modal').classList.remove('hidden');
      if (opts.onOpen) opts.onOpen($('#modalBody'));
      const f = $('#modalBody input:not([type=checkbox]):not([type=range]), #modalBody textarea');
      if (f && !opts.noFocus) setTimeout(() => f.focus(), 30);
    });
  }
  const confirmBox = (title, text, yes = 'Ja', danger) => modal(title, `<p>${text}</p>`, [{ label: 'Abbrechen', value: false }, { label: yes, value: true, primary: !danger, danger }]);

  function download(name, data, type = 'text/plain') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function pickFile(accept, as = 'text') {
    return new Promise((resolve) => {
      const inp = $('#fileIn');
      inp.value = '';
      inp.accept = accept;
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return resolve(null);
        const r = new FileReader();
        r.onload = () => resolve({ name: f.name, data: r.result, file: f });
        r.onerror = () => resolve(null);
        if (as === 'buffer') r.readAsArrayBuffer(f); else if (as === 'url') r.readAsDataURL(f); else r.readAsText(f);
      };
      inp.click();
    });
  }
  const loadImage = (url) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Bild konnte nicht geladen werden')); im.src = url; });
  function imagePixels(img, maxPx) {
    const iw = img.width || img.videoWidth, ih = img.height || img.videoHeight;
    const k = Math.min(1, maxPx / Math.max(iw, ih));
    const w = Math.max(2, Math.round(iw * k)), h = Math.max(2, Math.round(ih * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); // Durchsichtiges = weiß
    x.drawImage(img, 0, 0, w, h);
    return { w, h, data: x.getImageData(0, 0, w, h).data };
  }
  const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : d; };
  const field = (label, html, unit) => `<div class="field"><label>${label}</label>${unit ? `<div class="unit" data-u="${unit}">${html}</div>` : html}</div>`;
  const inputN = (id, v, step = 0.1, extra = '') => `<input id="${id}" type="number" step="${step}" value="${+(+v).toFixed(4)}" ${extra}>`;
  const val = (id) => num($('#' + id).value);
  const anchorPicker = (cur) => ['ul', 'uc', 'ur', 'cl', 'c', 'cr', 'll', 'lc', 'lr'].map((k) => `<button data-a="${k}" class="${k === cur ? 'active' : ''}" title="${anchorText(k)}"></button>`).join('');
  const anchorText = (z) => ({ ll: 'links unten', lc: 'unten Mitte', lr: 'rechts unten', cl: 'links Mitte', c: 'Mitte', cr: 'rechts Mitte', ul: 'links oben', uc: 'oben Mitte', ur: 'rechts oben' }[z || 'll']);

  // ---------------------------------------------------------------- Ansicht
  const cv = $('#cv'), ctx2 = cv.getContext('2d');
  const w2s = (p) => ({ x: S.view.ox + p.x * S.view.s, y: S.view.oy - p.y * S.view.s });
  const s2w = (x, y) => ({ x: (x - S.view.ox) / S.view.s, y: (S.view.oy - y) / S.view.s });
  function fit(box) {
    const m = S.machine;
    const b = box || boxOf(S.doc.objects);
    const x0 = Math.min(0, b ? b.x0 : 0), y0 = Math.min(0, b ? b.y0 : 0), x1 = Math.max(m.w, b ? b.x1 : 0), y1 = Math.max(m.h, b ? b.y1 : 0);
    const W = cv.clientWidth, H = cv.clientHeight, pad = 46;
    S.view.s = Math.min((W - 2 * pad) / Math.max(1, x1 - x0), (H - 2 * pad - 30) / Math.max(1, y1 - y0));
    S.view.ox = (W - (x1 - x0) * S.view.s) / 2 - x0 * S.view.s;
    S.view.oy = H - (H - 30 - (y1 - y0) * S.view.s) / 2 + y0 * S.view.s;
    redraw();
  }
  function zoomAt(f, sx, sy) {
    const p = s2w(sx, sy);
    S.view.s = util.clamp(S.view.s * f, 0.05, 400);
    S.view.ox = sx - p.x * S.view.s;
    S.view.oy = sy + p.y * S.view.s;
    redraw();
  }
  function panView(dx, dy) { S.view.ox += dx; S.view.oy += dy; redraw(); }

  let raf = 0;
  function redraw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw2d(); }); }
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    const dark = g('--bg').startsWith('#1');
    colors = { dark, text: g('--text'), accent: g('--accent'), line: g('--line'), muted: g('--muted'), stage: g('--stage'), bed: dark ? '#23272d' : '#fbfbfa', grid: dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)', gridMajor: dark ? 'rgba(255,255,255,.13)' : 'rgba(0,0,0,.13)' };
  }
  readColors();

  // Bilder: Graustufen-Leinwand je Bilddatensatz, gerasterte Vorschau je Einstellung
  const imgCanvas = new Map();
  function grayCanvas(px) {
    let c = imgCanvas.get(px.id);
    if (c) return c;
    const g8 = LZ.decodePx(px);
    c = document.createElement('canvas');
    c.width = px.w; c.height = px.h;
    const x = c.getContext('2d'), id = x.createImageData(px.w, px.h);
    for (let i = 0; i < g8.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g8[i]; id.data[i * 4 + 3] = 255; }
    x.putImageData(id, 0, 0);
    imgCanvas.set(px.id, c);
    return c;
  }
  const ditherCache = new Map();
  function ditherCanvas(o) {
    const step = Math.max(layerOf(o).interval, Math.max(o.w, o.h) / 700);
    const key = o.px.id + JSON.stringify(o.img) + step + o.w + o.h + o.tf.join(',');
    let c = ditherCache.get(o.id);
    if (c && c.key === key) return c;
    const r = LZ.processImage(o, step);
    const cvs = document.createElement('canvas');
    cvs.width = r.nx; cvs.height = r.ny;
    const x = cvs.getContext('2d'), id = x.createImageData(r.nx, r.ny);
    for (let i = 0; i < r.dark.length; i++) {
      if (r.f[i] < 0) continue;
      const v = 255 - r.dark[i] * 255;
      id.data[i * 4] = v; id.data[i * 4 + 1] = v * 0.93; id.data[i * 4 + 2] = v * 0.85; id.data[i * 4 + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    c = { key, cvs, x0: r.x0, y1: r.y1, w: r.nx * step, h: r.ny * step };
    ditherCache.set(o.id, c);
    return c;
  }
  function drawImageObj(x, o, alpha) {
    const dpr = window.devicePixelRatio || 1;
    x.save();
    x.globalAlpha = alpha;
    if (o.img && o.img.preview) {
      const d = ditherCanvas(o), p = w2s({ x: d.x0, y: d.y1 });
      x.imageSmoothingEnabled = false;
      x.drawImage(d.cvs, p.x, p.y, d.w * S.view.s, d.h * S.view.s);
    } else {
      const P = [o.w / o.px.w, 0, 0, -o.h / o.px.h, -o.w / 2, o.h / 2];
      const T = M.mul([S.view.s, 0, 0, -S.view.s, S.view.ox, S.view.oy], M.mul(o.tf, P));
      x.setTransform(dpr * T[0], dpr * T[1], dpr * T[2], dpr * T[3], dpr * T[4], dpr * T[5]);
      if (o.img && o.img.invert) x.filter = 'invert(1)';
      x.drawImage(grayCanvas(o.px), 0, 0);
    }
    x.restore();
  }

  function pathOf(lines, closedOnly) {
    const p = new Path2D();
    for (const l of lines) {
      if (closedOnly && !l.closed) continue;
      l.pts.forEach((q, i) => { const s = w2s(q); i ? p.lineTo(s.x, s.y) : p.moveTo(s.x, s.y); });
      if (l.closed) p.closePath();
    }
    return p;
  }
  const hexA = (hex, a) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; };

  function draw2d() {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = ctx2;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const m = S.machine, s = S.view.s;
    // Arbeitsbereich
    const a = w2s({ x: 0, y: 0 }), b = w2s({ x: m.w, y: m.h });
    x.fillStyle = S.mode === 'preview' && $('#pvMat').checked ? (colors.dark ? '#5c4a35' : '#e9d3ad') : colors.bed;
    x.shadowColor = 'rgba(0,0,0,.2)'; x.shadowBlur = 10; x.shadowOffsetY = 3;
    x.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
    x.shadowColor = 'transparent';
    if (cam.on && cam.img) {
      x.globalAlpha = cam.cal.opacity;
      x.imageSmoothingQuality = 'high';
      x.drawImage(cam.img, a.x, b.y, b.x - a.x, a.y - b.y);
      x.globalAlpha = 1;
    }
    // Raster (nur auf dem Arbeitsbereich)
    const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
    const minor = steps.find((q) => q * s >= 9) || 100;
    const major = minor * (minor === 2 || minor === 20 ? 5 : minor === 5 || minor === 50 ? 2 : 10);
    x.save();
    x.beginPath(); x.rect(a.x, b.y, b.x - a.x, a.y - b.y); x.clip();
    x.lineWidth = 1;
    const tl = s2w(0, 0), br = s2w(W, H);
    for (let gx = Math.max(0, Math.floor(tl.x / minor) * minor); gx <= Math.min(m.w, br.x); gx += minor) {
      const p = w2s({ x: gx, y: 0 }).x;
      x.strokeStyle = Math.abs(gx / major - Math.round(gx / major)) < 1e-6 ? colors.gridMajor : colors.grid;
      x.beginPath(); x.moveTo(Math.round(p) + 0.5, b.y); x.lineTo(Math.round(p) + 0.5, a.y); x.stroke();
    }
    for (let gy = Math.max(0, Math.floor(br.y / minor) * minor); gy <= Math.min(m.h, tl.y); gy += minor) {
      const p = w2s({ x: 0, y: gy }).y;
      x.strokeStyle = Math.abs(gy / major - Math.round(gy / major)) < 1e-6 ? colors.gridMajor : colors.grid;
      x.beginPath(); x.moveTo(a.x, Math.round(p) + 0.5); x.lineTo(b.x, Math.round(p) + 0.5); x.stroke();
    }
    x.restore();
    x.strokeStyle = colors.muted; x.globalAlpha = 0.6;
    x.strokeRect(a.x + 0.5, b.y + 0.5, b.x - a.x, a.y - b.y);
    x.globalAlpha = 1;
    // Lineale
    x.fillStyle = colors.muted;
    x.font = '10px system-ui';
    for (let gx = Math.ceil(Math.max(0, tl.x) / major) * major; gx <= Math.min(m.w, br.x); gx += major) { const p = w2s({ x: gx, y: 0 }); x.fillText(fmt(gx, 1), p.x + 2, Math.min(H - 4, a.y + 12)); }
    for (let gy = Math.ceil(Math.max(0, br.y) / major) * major; gy <= Math.min(m.h, tl.y); gy += major) { const p = w2s({ x: 0, y: gy }); x.fillText(fmt(gy, 1), Math.max(2, a.x - 26), p.y + 3); }
    x.fillText(`${m.name.split(' (')[0]} · ${m.w} × ${m.h} mm`, a.x + 4, b.y - 6);
    // Maschinen-Nullpunkt
    const oc = { ll: { x: 0, y: 0 }, ul: { x: 0, y: m.h }, ur: { x: m.w, y: m.h }, lr: { x: m.w, y: 0 } }[m.origin || 'll'];
    const op = w2s(oc);
    x.fillStyle = '#e8590c'; x.beginPath(); x.arc(op.x, op.y, 4, 0, Math.PI * 2); x.fill();

    if (S.mode === 'preview') { drawPreview(x); drawOverlayCommon(x); return; }

    // Objekte
    const selSet = new Set(S.sel);
    for (const o of S.doc.objects) {
      if (o.hidden) continue;
      const l = layerOf(o);
      if (!l.show) continue;
      const ls = geom(o);
      const sel = selSet.has(o.id), hov = S.hover === o.id;
      if (o.kind === 'image') drawImageObj(x, o, l.output ? 1 : 0.4);
      const P = pathOf(ls);
      if (o.kind !== 'image' && (l.mode === 'fill' || l.mode === 'offset' || l.mode === 'image') && ls.some((q) => q.closed)) {
        x.fillStyle = hexA(l.color, sel ? 0.35 : 0.18);
        x.fill(pathOf(ls, true), 'evenodd');
      } else if (sel && ls.some((q) => q.closed)) {
        x.fillStyle = hexA(l.color, 0.12);
        x.fill(pathOf(ls, true), 'evenodd');
      }
      x.lineWidth = sel ? 2.2 : hov ? 2 : 1.3;
      x.strokeStyle = l.color;
      x.globalAlpha = l.output ? 1 : 0.45;
      if (sel) { x.setLineDash([5, 3]); }
      if (o.kind !== 'image' || sel || hov) x.stroke(P);
      x.setLineDash([]);
      x.globalAlpha = 1;
    }
    if (S.mode === 'laser') drawLaser(x);
    // Auswahlrahmen
    if (S.mode === 'design' && S.tool === 'select' && S.sel.length) {
      const bb = boxOf(selObjs());
      if (bb) {
        const p0 = w2s({ x: bb.x0, y: bb.y1 }), p1 = w2s({ x: bb.x1, y: bb.y0 });
        x.setLineDash([4, 3]); x.strokeStyle = colors.accent; x.lineWidth = 1;
        x.strokeRect(p0.x - 0.5, p0.y - 0.5, p1.x - p0.x + 1, p1.y - p0.y + 1);
        x.setLineDash([]);
        for (const h of handles(bb)) {
          x.fillStyle = '#fff'; x.strokeStyle = colors.accent; x.lineWidth = 1.5;
          if (h.k === 'rot') { x.beginPath(); x.moveTo((p0.x + p1.x) / 2, p0.y); x.lineTo(h.x, h.y); x.stroke(); x.beginPath(); x.arc(h.x, h.y, 5, 0, Math.PI * 2); x.fill(); x.stroke(); }
          else { x.fillRect(h.x - 4, h.y - 4, 8, 8); x.strokeRect(h.x - 4, h.y - 4, 8, 8); }
        }
        x.fillStyle = colors.accent; x.font = '11px system-ui';
        x.fillText(`${fmt(bb.w)} × ${fmt(bb.h)} mm`, p0.x, p1.y + 16);
      }
    }
    if (S.mode === 'design' && S.tool === 'node') {
      for (const o of selObjs()) {
        if (o.kind !== 'path') continue;
        o.nodes.forEach((n, i) => {
          const p = w2s(M.apply(o.tf, n));
          const on = S.nodeSel && S.nodeSel.id === o.id && S.nodeSel.i === i;
          x.fillStyle = on ? colors.accent : '#fff'; x.strokeStyle = colors.accent; x.lineWidth = 1.5;
          x.beginPath();
          if (n.c) x.arc(p.x, p.y, 4.5, 0, Math.PI * 2); else x.rect(p.x - 4, p.y - 4, 8, 8);
          x.fill(); x.stroke();
        });
      }
    }
    drawInProgress(x);
    drawOverlayCommon(x);
  }
  function drawOverlayCommon(x) {
    if (S.snapMark) {
      const p = w2s(S.snapMark);
      x.strokeStyle = '#e8590c'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(p.x, p.y, 6, 0, Math.PI * 2); x.stroke();
    }
    // Laserposition immer zeigen, wenn verbunden
    if (S.grbl && S.grbl.connected) {
      const p = w2s(laserWorldPos());
      x.strokeStyle = '#e03131'; x.lineWidth = 2;
      x.beginPath(); x.arc(p.x, p.y, 7, 0, Math.PI * 2); x.moveTo(p.x - 12, p.y); x.lineTo(p.x + 12, p.y); x.moveTo(p.x, p.y - 12); x.lineTo(p.x, p.y + 12); x.stroke();
      if (pointerOn) { x.fillStyle = 'rgba(255,40,40,.8)'; x.beginPath(); x.arc(p.x, p.y, 3, 0, Math.PI * 2); x.fill(); }
    }
  }

  function drawInProgress(x) {
    const d = S.draw;
    if (d && d.kind === 'line' && d.nodes.length) {
      const pts = d.nodes.concat(S.cursor ? [{ ...S.cursor, c: d.nextCurve }] : []);
      const pl = geo.buildPath(pts, false);
      x.strokeStyle = curLayer().color; x.lineWidth = 1.5;
      x.beginPath();
      pl.forEach((q, i) => { const p = w2s(q); i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); });
      x.stroke();
      d.nodes.forEach((n, i) => {
        const p = w2s(n);
        x.fillStyle = i === 0 ? '#e8590c' : '#fff'; x.strokeStyle = colors.accent;
        x.beginPath(); if (n.c) x.arc(p.x, p.y, 4, 0, Math.PI * 2); else x.rect(p.x - 3.5, p.y - 3.5, 7, 7);
        x.fill(); x.stroke();
      });
    }
    if (d && d.kind === 'box' && d.a && d.b) {
      const o = shapeFromBox(d);
      if (o) { x.strokeStyle = curLayer().color; x.lineWidth = 1.5; x.setLineDash([5, 3]); x.stroke(pathOf(SH.lines(o))); x.setLineDash([]); }
      const bb = { w: Math.abs(d.b.x - d.a.x), h: Math.abs(d.b.y - d.a.y) };
      const p = w2s(d.b);
      x.fillStyle = colors.accent; x.font = '11px system-ui';
      x.fillText(d.tool === 'polygon' || d.tool === 'star' ? `r = ${fmt(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y))} mm` : `${fmt(bb.w)} × ${fmt(bb.h)} mm`, p.x + 10, p.y - 8);
    }
    if (d && d.kind === 'measure' && d.a && d.b) {
      const p = w2s(d.a), q = w2s(d.b);
      x.strokeStyle = '#e8590c'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke();
      const L = geo.dist(d.a, d.b), ang = (Math.atan2(d.b.y - d.a.y, d.b.x - d.a.x) * 180) / Math.PI;
      x.fillStyle = '#e8590c'; x.font = 'bold 12px system-ui';
      x.fillText(`${fmt(L)} mm  (ΔX ${fmt(d.b.x - d.a.x)}, ΔY ${fmt(d.b.y - d.a.y)}, ${fmt(ang, 1)}°)`, q.x + 10, q.y - 8);
    }
    if (S.drag && S.drag.kind === 'band') {
      const p = w2s(S.drag.a), q = w2s(S.drag.b);
      x.fillStyle = hexA('#c4501a', 0.1); x.strokeStyle = colors.accent; x.setLineDash([4, 3]);
      x.fillRect(p.x, p.y, q.x - p.x, q.y - p.y); x.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
      x.setLineDash([]);
    }
  }

  // ---------------------------------------------------------------- Auswahl / Transformationen
  function handles(bb) {
    const p0 = w2s({ x: bb.x0, y: bb.y1 }), p1 = w2s({ x: bb.x1, y: bb.y0 });
    const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
    return [
      { k: 'nw', x: p0.x, y: p0.y }, { k: 'n', x: mx, y: p0.y }, { k: 'ne', x: p1.x, y: p0.y },
      { k: 'w', x: p0.x, y: my }, { k: 'e', x: p1.x, y: my },
      { k: 'sw', x: p0.x, y: p1.y }, { k: 's', x: mx, y: p1.y }, { k: 'se', x: p1.x, y: p1.y },
      { k: 'rot', x: mx, y: p0.y - 24 },
    ];
  }
  const axisAligned = (m) => Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9;
  function applyM(o, m) {
    if (o.kind === 'path') { o.nodes = o.nodes.map((n) => ({ ...M.apply(M.mul(m, o.tf), n), c: n.c })); o.tf = M.id(); }
    else if (o.kind === 'poly') { o.lines = o.lines.map((l) => ({ pts: l.pts.map((p) => M.apply(M.mul(m, o.tf), p)), closed: l.closed })); o.tf = M.id(); }
    else o.tf = M.mul(m, o.tf);
    touch(o);
  }
  function translateObj(o, dx, dy) { applyM(o, M.translate(dx, dy)); }
  function scaleObj(o, sx, sy, cx, cy) {
    if ((o.kind === 'rect' || o.kind === 'ellipse' || o.kind === 'image') && axisAligned(o.tf)) {
      const t = o.tf;
      if (o.kind === 'rect' || o.kind === 'image') { o.w *= Math.abs(sx * t[0]); o.h *= Math.abs(sy * t[3]); }
      else { o.rx *= Math.abs(sx * t[0]); o.ry *= Math.abs(sy * t[3]); }
      o.tf = [Math.sign(sx * t[0]) || 1, 0, 0, Math.sign(sy * t[3]) || 1, cx + (t[4] - cx) * sx, cy + (t[5] - cy) * sy];
      touch(o);
      return;
    }
    applyM(o, M.scale(sx, sy, cx, cy));
  }
  function rotateSel(ang, c) {
    const objs = selObjs();
    const bb = boxOf(objs);
    const cc = c || { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
    for (const o of objs) applyM(o, M.rotate(ang, cc.x, cc.y));
    return true;
  }

  function hitTest(p) {
    const tol = 5 / S.view.s;
    for (let i = S.doc.objects.length - 1; i >= 0; i--) {
      const o = S.doc.objects[i];
      if (o.hidden || o.locked || !layerOf(o).show) continue;
      const b = objBox(o);
      if (!b || p.x < b.x0 - tol || p.x > b.x1 + tol || p.y < b.y0 - tol || p.y > b.y1 + tol) continue;
      if (hitObj(o, p, tol)) return o;
    }
    return null;
  }
  function hitObj(o, p, tol) {
    const ls = geom(o);
    for (const l of ls) {
      const pts = l.pts;
      for (let i = 1; i < pts.length; i++) if (geo.segDist(p, pts[i - 1], pts[i]) < tol) return true;
      if (l.closed && pts.length > 2 && geo.segDist(p, pts[pts.length - 1], pts[0]) < tol) return true;
    }
    if (o.kind === 'image') return true;
    let inside = false;
    for (const l of ls) if (l.closed && geo.pointInPoly(p, l.pts)) inside = !inside;
    return inside;
  }

  function snapPt(p, exclude) {
    S.snapMark = null;
    const tol = 8 / S.view.s;
    let best = null, bd = tol;
    const cand = (q) => { const d = geo.dist(p, q); if (d < bd) { bd = d; best = q; } };
    const m = S.machine;
    [{ x: 0, y: 0 }, { x: m.w, y: 0 }, { x: 0, y: m.h }, { x: m.w, y: m.h }, { x: m.w / 2, y: m.h / 2 }].forEach(cand);
    for (const o of S.doc.objects) {
      if (o.hidden || (exclude && exclude.has(o.id))) continue;
      const b = objBox(o);
      if (!b || p.x < b.x0 - tol || p.x > b.x1 + tol || p.y < b.y0 - tol || p.y > b.y1 + tol) continue;
      [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x0, y: b.y1 }, { x: b.x1, y: b.y1 }, { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }].forEach(cand);
      if (o.kind === 'path') o.nodes.forEach((n) => cand(M.apply(o.tf, n)));
    }
    if (best) { S.snapMark = best; return { x: best.x, y: best.y }; }
    if (S.snap) {
      const g = S.view.s > 6 ? 0.5 : S.view.s > 2.5 ? 1 : S.view.s > 1 ? 5 : 10;
      return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
    }
    return p;
  }

  // ---------------------------------------------------------------- Zeichenwerkzeuge
  const TOOL_HINTS = {
    select: 'Klicken = auswählen, Umschalt = mehrere, ziehen = verschieben. Farbe oben anklicken = Ebene zuweisen. Ansicht verschieben: Leertaste halten oder zwei Finger.',
    node: 'Punkt ziehen = verschieben · Doppelklick auf die Linie = Punkt einfügen · Leertaste = Ecke/Kurve · Entf = Punkt löschen',
    line: '<b>Linksklick</b> = Eckpunkt · <b>Rechtsklick</b> = Kurvenpunkt · Klick auf den ersten Punkt schließt · <b>Enter</b> = fertig · Rücktaste = letzter Punkt weg',
    rect: 'Rechteck aufziehen · Umschalt = Quadrat · Alt = von der Mitte aus',
    ellipse: 'Ellipse aufziehen · Umschalt = Kreis · Alt = von der Mitte aus',
    polygon: 'Von der Mitte aus aufziehen · Umschalt = gerade ausrichten',
    star: 'Von der Mitte aus aufziehen · Umschalt = gerade ausrichten',
    text: 'Klicken, wo der Text beginnen soll',
    measure: 'Ziehen, um Abstand und Winkel zu messen',
  };
  function setTool(t) {
    if (S.draw && S.draw.kind === 'line' && S.draw.nodes.length > 1) finishLine(false);
    S.draw = null;
    S.tool = t;
    S.nodeSel = null;
    $$('#toolbox [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    cv.className = t === 'select' || t === 'node' ? 'select' : '';
    hint(TOOL_HINTS[t]);
    redraw();
  }

  function shapeFromBox(d) {
    const { a, b } = d;
    if (!a || !b) return null;
    if (d.tool === 'polygon' || d.tool === 'star') {
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      if (r < 0.01) return null;
      const ang = d.shift ? 0 : Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
      const o = SH.make(d.tool, d.tool === 'star' ? { n: 5, r, inner: 0.45 } : { n: 6, r });
      o.tf = M.mul(M.translate(a.x, a.y), M.rotate(ang));
      return o;
    }
    let w = b.x - a.x, h = b.y - a.y;
    if (d.shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    let cx = a.x + w / 2, cy = a.y + h / 2;
    if (d.alt) { cx = a.x; cy = a.y; w *= 2; h *= 2; }
    if (Math.abs(w) < 0.01 || Math.abs(h) < 0.01) return null;
    const o = d.tool === 'rect' ? SH.make('rect', { w: Math.abs(w), h: Math.abs(h), r: 0 }) : SH.make('ellipse', { rx: Math.abs(w) / 2, ry: Math.abs(h) / 2 });
    o.tf = M.translate(cx, cy);
    return o;
  }

  function addObjects(objs, select = true) {
    snapshot();
    for (const o of objs) if (!o.layer || !layerById(o.layer)) o.layer = curLayer().id;
    S.doc.objects.push(...objs);
    if (select) S.sel = objs.map((o) => o.id);
    changed();
  }

  function finishLine(close) {
    const d = S.draw;
    if (!d || d.nodes.length < 2) { S.draw = null; redraw(); return; }
    const o = SH.make('path', { nodes: d.nodes.map((n) => ({ x: n.x, y: n.y, c: !!n.c })), closed: !!close && d.nodes.length > 2 });
    S.draw = null;
    addObjects([o]);
  }

  // ---------------------------------------------------------------- Maus
  let spaceDown = false, overCanvas = false, lastMouse = null;
  let wheelZoom = store.get('ls.wheelZoom', false);
  const setSpace = (on) => {
    spaceDown = on;
    cv.classList.toggle('pan', on);
    if (on && document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  };
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerenter', () => { overCanvas = true; });
  cv.addEventListener('pointerleave', () => { overCanvas = false; lastMouse = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey || (wheelZoom && !e.shiftKey)) {
      zoomAt(Math.exp(-dy * (e.ctrlKey && !wheelZoom && Math.abs(dy) < 50 ? 0.006 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
      return;
    }
    if (e.shiftKey && !dx) S.view.ox -= dy;
    else { S.view.ox -= dx; S.view.oy -= dy; }
    redraw();
  }, { passive: false });

  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const raw = s2w(sx, sy);
    cv.setPointerCapture(e.pointerId);
    if (document.activeElement && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName)) document.activeElement.blur();
    if (e.button === 1 || spaceDown || (e.button === 2 && S.tool !== 'line')) {
      S.drag = { kind: 'pan', sx, sy, ox: S.view.ox, oy: S.view.oy };
      cv.classList.add('pan');
      return;
    }
    if (S.mode === 'laser' && e.button === 0 && e.altKey && S.grbl && S.grbl.connected) { moveLaserTo(raw); return; }
    if (S.mode !== 'design') { S.drag = { kind: 'pan', sx, sy, ox: S.view.ox, oy: S.view.oy }; return; }
    const t = S.tool;
    if (t === 'select') {
      const bb = S.sel.length ? boxOf(selObjs()) : null;
      if (bb) {
        const h = handles(bb).find((q) => Math.abs(q.x - sx) < 7 && Math.abs(q.y - sy) < 7);
        if (h) { snapshot(); S.drag = { kind: h.k === 'rot' ? 'rotate' : 'scale', h: h.k, bb, start: raw, orig: serial({ objects: selObjs() }), moved: false }; return; }
      }
      const o = hitTest(raw);
      if (o) {
        if (e.shiftKey) toggleSel(o.id);
        else if (!S.sel.includes(o.id)) S.sel = [o.id];
        selectLayerOfSel();
        renderSide();
        if (S.sel.includes(o.id)) S.drag = { kind: 'move', start: raw, last: raw, moved: false, bb: boxOf(selObjs()) };
      } else {
        if (!e.shiftKey) S.sel = [];
        S.drag = { kind: 'band', a: raw, b: raw, add: e.shiftKey };
        renderSide();
      }
      redraw();
      return;
    }
    if (t === 'node') {
      const tol = 7 / S.view.s;
      for (const o of selObjs()) {
        if (o.kind !== 'path') continue;
        const i = o.nodes.findIndex((n) => geo.dist(M.apply(o.tf, n), raw) < tol);
        if (i >= 0) { snapshot(); S.nodeSel = { id: o.id, i }; S.drag = { kind: 'node', id: o.id, i }; redraw(); return; }
      }
      const o = hitTest(raw);
      S.sel = o ? [o.id] : [];
      S.nodeSel = null;
      if (o && o.kind !== 'path') status('Punkte bearbeiten geht bei Linienzügen. Für Formen: Anordnen → In Kurve umwandeln.');
      renderSide(); redraw();
      return;
    }
    const p = snapPt(raw);
    if (t === 'line') {
      if (!S.draw) S.draw = { kind: 'line', nodes: [] };
      const d = S.draw;
      if (d.nodes.length > 2 && geo.dist(w2s(p), w2s(d.nodes[0])) < 9) { finishLine(true); return; }
      d.nodes.push({ x: p.x, y: p.y, c: e.button === 2 });
      redraw();
      return;
    }
    if (t === 'rect' || t === 'ellipse' || t === 'polygon' || t === 'star') { S.draw = { kind: 'box', tool: t, a: p, b: p }; return; }
    if (t === 'measure') { S.draw = { kind: 'measure', a: p, b: p }; return; }
    if (t === 'text') textDialog(null, p);
  });

  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const raw = s2w(sx, sy);
    $('#coords').textContent = `X ${fmt(raw.x)}  Y ${fmt(raw.y)} mm`;
    const lm = lastMouse;
    lastMouse = { sx, sy };
    if (spaceDown && !S.drag && lm && e.pointerType !== 'touch') { S.view.ox += sx - lm.sx; S.view.oy += sy - lm.sy; redraw(); return; }
    const d = S.drag;
    if (d && d.kind === 'pan') { S.view.ox = d.ox + sx - d.sx; S.view.oy = d.oy + sy - d.sy; redraw(); return; }
    if (S.mode !== 'design') return;
    if (d && d.kind === 'move') {
      const off = { x: d.bb.x0 - d.start.x, y: d.bb.y0 - d.start.y };
      const sp = snapPt({ x: raw.x + off.x, y: raw.y + off.y }, new Set(S.sel));
      const p = { x: sp.x - off.x, y: sp.y - off.y };
      if (e.shiftKey) { if (Math.abs(p.x - d.start.x) > Math.abs(p.y - d.start.y)) p.y = d.start.y; else p.x = d.start.x; }
      const dx = p.x - d.last.x, dy = p.y - d.last.y;
      if (Math.abs(dx) + Math.abs(dy) > 1e-9) {
        if (!d.moved) { snapshot(); d.moved = true; }
        for (const o of selObjs()) translateObj(o, dx, dy);
        d.last = p;
        renderProps();
        redraw();
      }
      return;
    }
    if (d && (d.kind === 'scale' || d.kind === 'rotate')) {
      const objs = JSON.parse(d.orig).objects;
      for (const src of objs) {
        const o = objById(src.id);
        if (!o) continue;
        const px = o.px;
        Object.keys(o).forEach((k) => delete o[k]);
        Object.assign(o, src);
        if (px) o.px = px;
        touch(o);
      }
      const bb = d.bb;
      if (d.kind === 'rotate') {
        const c = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
        let ang = Math.atan2(raw.y - c.y, raw.x - c.x) - Math.atan2(d.start.y - c.y, d.start.x - c.x);
        if (e.shiftKey) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
        rotateSel(ang, c);
        hint(`Drehen: ${fmt((ang * 180) / Math.PI, 1)}°  (Umschalt = 15°-Schritte)`);
      } else {
        const h = d.h;
        const ax = h.includes('w') ? bb.x1 : h.includes('e') ? bb.x0 : (bb.x0 + bb.x1) / 2;
        const ay = h.includes('n') ? bb.y0 : h.includes('s') ? bb.y1 : (bb.y0 + bb.y1) / 2;
        const p = snapPt(raw, new Set(S.sel));
        let sx2 = h.includes('w') || h.includes('e') ? (p.x - ax) / ((h.includes('w') ? bb.x0 : bb.x1) - ax) : 1;
        let sy2 = h.includes('n') || h.includes('s') ? (p.y - ay) / ((h.includes('n') ? bb.y1 : bb.y0) - ay) : 1;
        const corner = h.length === 2;
        if (corner && !e.shiftKey) { const m = Math.abs(sx2) > Math.abs(sy2) ? sx2 : sy2; sx2 = sy2 = m; }
        if (!isFinite(sx2) || Math.abs(sx2) < 1e-3) sx2 = 1e-3;
        if (!isFinite(sy2) || Math.abs(sy2) < 1e-3) sy2 = 1e-3;
        for (const o of selObjs()) scaleObj(o, sx2, sy2, ax, ay);
      }
      d.moved = true;
      renderProps();
      redraw();
      return;
    }
    if (d && d.kind === 'node') {
      const o = objById(d.id);
      const p = snapPt(raw, new Set());
      const lp = M.apply(M.inv(o.tf), p);
      o.nodes[d.i].x = lp.x; o.nodes[d.i].y = lp.y;
      touch(o);
      redraw();
      return;
    }
    if (d && d.kind === 'band') { d.b = raw; redraw(); return; }
    if (S.draw && (S.draw.kind === 'box' || S.draw.kind === 'measure')) {
      S.draw.b = snapPt(raw);
      S.draw.shift = e.shiftKey; S.draw.alt = e.altKey;
      redraw();
      return;
    }
    if (['line', 'rect', 'ellipse', 'polygon', 'star', 'text', 'measure'].includes(S.tool)) {
      S.cursor = snapPt(raw);
      redraw();
      return;
    }
    const o = hitTest(raw);
    const h = o ? o.id : null;
    if (h !== S.hover) { S.hover = h; redraw(); }
  });

  cv.addEventListener('pointerup', () => {
    const d = S.drag;
    S.drag = null;
    cv.classList.remove('pan');
    S.snapMark = null;
    if (d && d.kind === 'band') {
      const x0 = Math.min(d.a.x, d.b.x), x1 = Math.max(d.a.x, d.b.x), y0 = Math.min(d.a.y, d.b.y), y1 = Math.max(d.a.y, d.b.y);
      if (x1 - x0 > 0.01 || y1 - y0 > 0.01) {
        const ids = S.doc.objects.filter((o) => { const b = objBox(o); return !o.hidden && layerOf(o).show && b && b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1; }).map((o) => o.id);
        S.sel = d.add ? [...new Set([...S.sel, ...ids])] : ids;
        selectLayerOfSel();
      }
      renderSide();
    }
    if (d && (d.kind === 'move' || d.kind === 'scale' || d.kind === 'rotate')) {
      if (d.moved) changed(); else if (d.kind !== 'move') S.undo.pop();
      hint(TOOL_HINTS[S.tool]);
    }
    if (d && d.kind === 'node') changed();
    if (S.draw && S.draw.kind === 'box') {
      const o = shapeFromBox(S.draw);
      S.draw = null;
      if (o) { addObjects([o]); setTool('select'); }
    }
    redraw();
  });

  cv.addEventListener('dblclick', (e) => {
    if (S.mode !== 'design') return;
    const r = cv.getBoundingClientRect();
    const raw = s2w(e.clientX - r.left, e.clientY - r.top);
    if (S.tool === 'line' && S.draw) { S.draw.nodes.pop(); finishLine(false); return; }
    if (S.tool === 'node') {
      const o = selObjs().find((q) => q.kind === 'path');
      if (!o) return;
      let bi = -1, bd = Infinity;
      const n = o.nodes.length, segs = o.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = M.apply(o.tf, o.nodes[i]), b = M.apply(o.tf, o.nodes[(i + 1) % n]);
        const dd = geo.segDist(raw, a, b);
        if (dd < bd) { bd = dd; bi = i; }
      }
      if (bi >= 0 && bd < 15 / S.view.s) {
        snapshot();
        const lp = M.apply(M.inv(o.tf), raw);
        o.nodes.splice(bi + 1, 0, { x: lp.x, y: lp.y, c: o.nodes[bi].c || o.nodes[(bi + 1) % n].c });
        S.nodeSel = { id: o.id, i: bi + 1 };
        touch(o);
        changed();
      }
      return;
    }
    if (S.tool === 'select') {
      const o = hitTest(raw);
      if (o && o.kind === 'text') textDialog(o);
      else if (o && o.kind === 'image') imageDialog(o);
      else if (o && o.kind === 'path') setTool('node');
    }
  });

  function toggleSel(id) { S.sel = S.sel.includes(id) ? S.sel.filter((x) => x !== id) : [...S.sel, id]; }
  function selectLayerOfSel() {
    const ls = [...new Set(selObjs().map((o) => o.layer))];
    if (ls.length === 1) S.selLayer = ls[0];
  }

  // ---------------------------------------------------------------- Text
  function textDialog(o, at) {
    const fonts = FS.ttf.names();
    const t = o || { text: 'Text', font: store.get('ls.lastFont', fonts[0]), size: 20, align: 'left', spacing: 0, lineHeight: 1.2, arc: 0 };
    const html = `
      ${field('Text', `<textarea id="tText" rows="3">${esc(t.text)}</textarea>`)}
      ${field('Schrift', `<select id="tFont">${fonts.map((f) => `<option ${f === t.font ? 'selected' : ''}>${f}</option>`).join('')}</select>`)}
      ${field('Schriftgröße', inputN('tSize', t.size, 0.5, 'min="1"'), 'mm')}
      ${field('Zeichenabstand', inputN('tSpacing', t.spacing || 0, 0.1), 'mm')}
      ${field('Zeilenabstand', inputN('tLine', t.lineHeight || 1.2, 0.05), '×')}
      ${field('Ausrichtung', `<select id="tAlign"><option value="left">links</option><option value="center">mittig</option><option value="right">rechts</option></select>`)}
      ${field('Im Bogen <span class="muted small">(Radius; 0 = gerade, negativ = nach unten)</span>', inputN('tArc', t.arc || 0, 5), 'mm')}
      <canvas id="tPrev" width="540" height="130"></canvas>
      <p class="muted small">Die Schriftgröße ist die Höhe des Schriftrahmens (Großbuchstaben sind etwa 70 % davon). Mehrere Zeilen mit Enter. Text im Bogen passt z. B. auf runde Untersetzer oder Schilder.</p>`;
    const read = () => ({ text: $('#tText').value, font: $('#tFont').value, size: Math.max(1, val('tSize')), spacing: val('tSpacing'), lineHeight: val('tLine') || 1.2, align: $('#tAlign').value, arc: val('tArc') });
    const prev = () => {
      const c = $('#tPrev');
      if (!c) return;
      const x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      const tmp = SH.make('text', read());
      const ls = SH.lines(tmp);
      if (!ls.length) return;
      const b = geo.bounds(ls.map((l) => l.pts));
      const k = Math.min((c.width - 20) / Math.max(1, b.w), (c.height - 20) / Math.max(1, b.h));
      x.fillStyle = '#333';
      x.beginPath();
      for (const l of ls) l.pts.forEach((p, i) => { const X = 10 + (p.x - b.x0) * k, Y = c.height - 10 - (p.y - b.y0) * k; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
      x.fill('evenodd');
    };
    modal(o ? 'Text bearbeiten' : 'Text einfügen', html, [{ label: 'Abbrechen', value: null }, { label: o ? 'Übernehmen' : 'Einfügen', primary: true, value: 'ok' }], {
      onOpen: (body) => { $('#tAlign').value = t.align || 'left'; body.addEventListener('input', prev); prev(); },
    }).then((r) => {
      if (r !== 'ok') return;
      const v = read();
      store.set('ls.lastFont', v.font);
      if (o) { snapshot(); Object.assign(o, v); touch(o); changed(); }
      else {
        const n = SH.make('text', { ...v, name: 'Text: ' + v.text.split('\n')[0].slice(0, 20) });
        n.tf = M.translate(at.x, at.y);
        addObjects([n]);
        setTool('select');
      }
    });
  }

  // ---------------------------------------------------------------- Farbpalette (Ebenen)
  function renderPalette() {
    const used = new Set(S.doc.objects.map((o) => (layerById(o.layer) || {}).color));
    $('#palette').innerHTML = LZ.COLORS.map((c, i) => `<button data-color="${c}" style="background:${c}" class="${curLayer().color === c ? 'cur' : ''} ${used.has(c) ? 'used' : ''}" title="Ebene ${i + 1}${used.has(c) ? ' (benutzt)' : ''}"></button>`).join('');
  }
  $('#palette').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b || S.mode !== 'design') return;
    snapshot();
    const isNew = !S.doc.layers.some((l) => l.color === b.dataset.color);
    const objs = selObjs();
    const anyImg = objs.some((o) => o.kind === 'image');
    const l = layerForColor(b.dataset.color, isNew && anyImg && objs.every((o) => o.kind === 'image') ? { mode: 'image', speed: 3000, power: 40 } : null);
    if (objs.length) { for (const o of objs) o.layer = l.id; status(`${objs.length} Objekt(e) → ${layerLabel(l)}`); }
    else status(`Neue Objekte kommen in ${layerLabel(l)}.`);
    S.doc.cur = l.id;
    S.selLayer = l.id;
    changed();
  });

  // ---------------------------------------------------------------- Seitenleiste: Entwerfen
  function renderSide() {
    renderPalette();
    $('#machBtn').textContent = `▣ ${S.machine.name.split(' (')[0]}`;
    if (S.mode === 'design') { renderLayers(); renderLayerEdit(); renderProps(); renderObjList(); }
    if (S.mode === 'preview') renderPreviewSide();
    if (S.mode === 'laser') renderLaserSide();
  }
  function renderLayers() {
    const ls = usedLayers();
    if (!S.selLayer || !ls.some((l) => l.id === S.selLayer)) S.selLayer = (ls[0] || curLayer()).id;
    $('#layerlist').innerHTML = ls.map((l, i) => {
      const n = S.doc.objects.filter((o) => o.layer === l.id).length;
      return `<div class="lay ${l.id === S.selLayer ? 'sel' : ''} ${l.output ? '' : 'off'}" data-l="${l.id}">
        <span class="sw" style="background:${l.color}"></span>
        <span class="n">${esc(layerLabel(l))} <small>${LZ.MODES[l.mode]}${n ? '' : ' · leer'}</small><br><small>${layerSummary(l)}</small></span>
        <button data-lup="${l.id}" title="Früher lasern" ${i ? '' : 'disabled'}>▲</button>
        <button data-lout="${l.id}" title="${l.output ? 'Wird gelasert – klicken zum Ausschließen' : 'Wird nicht gelasert'}">${l.output ? '◉' : '○'}</button>
        <button data-lshow="${l.id}" title="Ein-/Ausblenden">${l.show ? '●' : '◌'}</button></div>`;
    }).join('') || '<div class="empty">Noch keine Ebenen.</div>';
  }
  $('#layerlist').addEventListener('click', (e) => {
    const up = e.target.closest('[data-lup]'), out = e.target.closest('[data-lout]'), sh = e.target.closest('[data-lshow]');
    if (up) {
      snapshot();
      const ls = usedLayers(), i = ls.findIndex((l) => l.id === up.dataset.lup);
      if (i > 0) { const a = S.doc.layers.indexOf(ls[i - 1]), b = S.doc.layers.indexOf(ls[i]); [S.doc.layers[a], S.doc.layers[b]] = [S.doc.layers[b], S.doc.layers[a]]; }
      changed(); return;
    }
    if (out) { snapshot(); const l = layerById(out.dataset.lout); l.output = !l.output; changed(); return; }
    if (sh) { const l = layerById(sh.dataset.lshow); l.show = !l.show; changed(); return; }
    const row = e.target.closest('[data-l]');
    if (!row) return;
    S.selLayer = row.dataset.l;
    S.doc.cur = row.dataset.l;
    renderSide();
  });
  $('#layerlist').addEventListener('dblclick', (e) => {
    const row = e.target.closest('[data-l]');
    if (!row) return;
    S.sel = S.doc.objects.filter((o) => o.layer === row.dataset.l).map((o) => o.id);
    renderSide(); redraw();
  });

  function renderLayerEdit() {
    const l = layerById(S.selLayer);
    const el = $('#layeredit');
    if (!l) { el.innerHTML = ''; return; }
    const dpi = Math.round(25.4 / Math.max(0.01, l.interval));
    const isFill = l.mode === 'fill' || l.mode === 'offset' || l.mode === 'image';
    el.innerHTML = `<div class="lhead"><span class="sw" style="background:${l.color}"></span><input id="lName" value="${esc(layerLabel(l))}" title="Name der Ebene"></div>
      <div class="modepick">${Object.entries(LZ.MODES).map(([k, v]) => `<button data-lmode="${k}" class="${l.mode === k ? 'active' : ''}" title="${esc(LZ.MODE_HELP[k])}">${v}</button>`).join('')}</div>
      <div class="grid2 wide2">
        ${field('Geschwindigkeit', inputN('lSpeed', l.speed, 10, 'min="1"'), 'mm/min')}
        ${field('Leistung', inputN('lPower', l.power, 1, 'min="0" max="100"'), '%')}
        ${l.mode === 'image' ? field('Min. Leistung (Graustufen)', inputN('lMin', l.minPower || 0, 1, 'min="0" max="100"'), '%') : ''}
        ${field('Durchgänge', inputN('lPasses', l.passes, 1, 'min="1"'), '×')}
        ${isFill ? field('Zeilenabstand', inputN('lInt', l.interval, 0.01, 'min="0.02"'), 'mm') : ''}
        ${l.mode === 'fill' ? field('Winkel', inputN('lAng', l.angle || 0, 5), '°') : ''}
        ${isFill && l.mode !== 'offset' ? field('Überfahrt', inputN('lOver', l.overscan, 0.5, 'min="0"'), 'mm') : ''}
        ${l.passes > 1 ? field('Z tiefer je Durchgang', inputN('lZ', l.zStep || 0, 0.1, 'min="0"'), 'mm') : ''}
        ${l.mode === 'line' ? field('Schnittspalt', inputN('lKerf', l.kerf || 0, 0.01, 'min="0"'), 'mm') + field('Haltestege', inputN('lTabs', l.tabs || 0, 1, 'min="0"'), 'Stück') : ''}
        ${l.mode === 'line' && l.tabs > 0 ? field('Stegbreite', inputN('lTabW', l.tabSize || 0.6, 0.1, 'min="0.1"'), 'mm') : ''}
      </div>
      ${isFill ? `<div class="muted small">${dpi} DPI${l.mode === 'image' ? ' · Rastermodus: Doppelklick aufs Bild' : ''}</div>` : ''}
      <label class="check"><input type="checkbox" id="lAir" ${l.air ? 'checked' : ''}> Luftunterstützung (M8)</label>
      ${l.mode === 'fill' ? `<label class="check"><input type="checkbox" id="lCross" ${l.cross ? 'checked' : ''}> Kreuzschraffur (2. Durchgang um 90° gedreht)</label>` : ''}
      ${isFill && l.mode !== 'offset' ? `<label class="check"><input type="checkbox" id="lBidir" ${l.bidir ? 'checked' : ''}> in beide Richtungen</label>` : ''}
      <label class="check"><input type="checkbox" id="lConst" ${l.constant ? 'checked' : ''}> feste Leistung (M3) statt angepasst an die Geschwindigkeit (M4)</label>
      <div class="row"><button data-cmd="materialLib" class="wide">Material wählen…</button><button data-cmd="materialTest">Testraster…</button></div>
      ${l.speed > S.machine.maxSpeed ? `<div class="warnbox">Schneller als die Maschine kann (${S.machine.maxSpeed} mm/min).</div>` : ''}`;
  }
  $('#layeredit').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lmode]');
    if (!b) return;
    const l = layerById(S.selLayer);
    snapshot();
    const was = l.mode;
    l.mode = b.dataset.lmode;
    // sinnvolle Startwerte beim Wechsel zwischen Schneiden und Gravieren
    if (was === 'line' && l.mode !== 'line') { l.speed = 3000; l.power = 40; l.air = false; }
    if (was !== 'line' && l.mode === 'line') { l.speed = 300; l.power = 90; l.air = true; }
    changed();
  });
  $('#layeredit').addEventListener('change', (e) => {
    const l = layerById(S.selLayer);
    if (!l) return;
    snapshot();
    const id = e.target.id;
    const map = { lSpeed: ['speed', 1, 1e6], lPower: ['power', 0, 100], lMin: ['minPower', 0, 100], lPasses: ['passes', 1, 999], lInt: ['interval', 0.01, 10], lAng: ['angle', -360, 360], lOver: ['overscan', 0, 50], lZ: ['zStep', 0, 50], lKerf: ['kerf', 0, 2], lTabs: ['tabs', 0, 50], lTabW: ['tabSize', 0.05, 20] };
    if (map[id]) { const [k, a, b] = map[id]; l[k] = util.clamp(val(id), a, b); if (k === 'passes' || k === 'tabs') l[k] = Math.round(l[k]); }
    if (id === 'lName') l.name = e.target.value.trim();
    if (id === 'lAir') l.air = e.target.checked;
    if (id === 'lCross') l.cross = e.target.checked;
    if (id === 'lBidir') l.bidir = e.target.checked;
    if (id === 'lConst') l.constant = e.target.checked;
    changed();
  });

  function renderObjList() {
    const el = $('#objlist');
    $('#objCount').textContent = S.doc.objects.length ? `(${S.doc.objects.length})` : '';
    if (!S.doc.objects.length) { el.innerHTML = '<div class="empty">Noch nichts gezeichnet.<br>Links ein Werkzeug wählen, ein Bild oder eine SVG-Datei hineinziehen.</div>'; return; }
    const icon = { path: '✎', rect: '▭', ellipse: '◯', polygon: '⬡', star: '☆', text: 'A', poly: '⇪', image: '▦' };
    el.innerHTML = S.doc.objects.slice().reverse().map((o) => {
      const b = objBox(o), l = layerOf(o);
      return `<div class="obj ${S.sel.includes(o.id) ? 'sel' : ''}" data-id="${o.id}"><span class="k" style="color:${l.color}">${icon[o.kind] || '•'}</span><span class="n">${esc(o.name)}${o.ovr ? ` <small class="muted">${o.ovr.power} % · ${o.ovr.speed}</small>` : ''}</span><span class="c">${b ? fmt(b.w, 1) + '×' + fmt(b.h, 1) : ''}</span><button class="eye" data-eye="${o.id}" title="Ein-/Ausblenden">${o.hidden ? '◌' : '●'}</button></div>`;
    }).join('');
  }
  $('#objlist').addEventListener('click', (e) => {
    const eye = e.target.closest('[data-eye]');
    if (eye) { const o = objById(eye.dataset.eye); snapshot(); o.hidden = !o.hidden; changed(); return; }
    const row = e.target.closest('.obj');
    if (!row) return;
    if (e.shiftKey || e.ctrlKey) toggleSel(row.dataset.id); else S.sel = [row.dataset.id];
    selectLayerOfSel();
    renderSide(); redraw();
  });
  $('#objlist').addEventListener('dblclick', (e) => {
    const row = e.target.closest('.obj');
    if (!row) return;
    const o = objById(row.dataset.id);
    const n = prompt('Name:', o.name);
    if (n) { snapshot(); o.name = n; changed(); }
  });

  function renderProps() {
    const el = $('#props');
    const objs = selObjs();
    $('#propsTitle').textContent = objs.length > 1 ? `${objs.length} ausgewählt` : objs[0] ? objs[0].name : '';
    if (!objs.length) { el.innerHTML = '<div class="muted small">Nichts ausgewählt. Klicke ein Objekt an, um Größe und Lage einzugeben.</div>'; return; }
    const b = boxOf(objs);
    if (!b) { el.innerHTML = ''; return; }
    let html = `<div class="grid2">
      ${field('X', inputN('pX', b.x0, 0.1), 'mm')}${field('Y', inputN('pY', b.y0, 0.1), 'mm')}
      ${field('B', inputN('pW', b.w, 0.1, 'min="0.01"'), 'mm')}${field('H', inputN('pH', b.h, 0.1, 'min="0.01"'), 'mm')}
    </div>
    <label class="check"><input type="checkbox" id="pLock" ${store.get('ls.lockAspect', true) ? 'checked' : ''}> Seitenverhältnis beibehalten</label>
    <div class="row">
      <input id="pRot" type="number" step="1" value="90" style="width:62px" title="Winkel in Grad"><button data-cmd="rotBy">° drehen</button>
      <button data-cmd="mirrorH" title="Waagrecht spiegeln">⇋</button><button data-cmd="mirrorV" title="Senkrecht spiegeln">⇵</button>
      <button data-cmd="centerArea" title="In die Mitte des Arbeitsbereichs">⊕</button>
    </div>`;
    const o = objs.length === 1 ? objs[0] : null;
    if (o) {
      if (o.kind === 'rect') html += field('Eckenradius', inputN('kR', o.r || 0, 0.5, 'min="0"'), 'mm');
      if (o.kind === 'polygon' || o.kind === 'star') html += field('Ecken', inputN('kN', o.n, 1, 'min="3" max="64"'));
      if (o.kind === 'star') html += field('Innenradius', inputN('kI', Math.round((o.inner || 0.5) * 100), 1, 'min="5" max="95"'), '%');
      if (o.kind === 'path') html += `<label class="check"><input type="checkbox" id="kClosed" ${o.closed ? 'checked' : ''}> geschlossen</label>`;
      if (o.kind === 'text') html += `<div class="row"><button data-cmd="editText" class="wide">Text bearbeiten…</button></div>`;
      if (o.kind === 'image') html += `<div class="row"><button data-cmd="imageSettings" class="wide">Bild einstellen…</button><button data-cmd="traceSelected">Nachzeichnen</button></div>
        <label class="check"><input type="checkbox" id="kPrev" ${o.img && o.img.preview ? 'checked' : ''}> gerastert anzeigen (so wird es gelasert)</label>`;
    }
    if (objs.some((q) => q.ovr)) html += `<div class="row"><button data-cmd="clearOvr" class="wide" title="Eigene Leistung/Geschwindigkeit entfernen, Werte der Ebene nutzen">Werte der Ebene nutzen</button></div>`;
    html += `<div class="row"><button data-cmd="duplicate">Duplizieren</button><button data-cmd="delete">Löschen</button><button data-cmd="selectLayerOfSel" class="wide">Ebene zeigen</button></div>`;
    el.innerHTML = html;
  }
  $('#props').addEventListener('change', (e) => {
    const objs = selObjs();
    if (!objs.length) return;
    const id = e.target.id;
    if (id === 'pLock') { store.set('ls.lockAspect', e.target.checked); return; }
    if (id === 'pRot') return;
    snapshot();
    const b = boxOf(objs);
    const o = objs[0];
    if (id === 'pX' || id === 'pY') { for (const q of objs) translateObj(q, id === 'pX' ? val('pX') - b.x0 : 0, id === 'pY' ? val('pY') - b.y0 : 0); }
    if (id === 'pW' || id === 'pH') {
      const lock = $('#pLock').checked;
      let sx = id === 'pW' ? Math.max(0.01, val('pW')) / b.w : 1, sy = id === 'pH' ? Math.max(0.01, val('pH')) / b.h : 1;
      if (lock) { if (id === 'pW') sy = sx; else sx = sy; }
      if (!isFinite(sx) || sx <= 0) sx = 1;
      if (!isFinite(sy) || sy <= 0) sy = 1;
      for (const q of objs) scaleObj(q, sx, sy, b.x0, b.y0);
    }
    if (id === 'kR') o.r = Math.max(0, val('kR'));
    if (id === 'kN') o.n = util.clamp(Math.round(val('kN')), 3, 64);
    if (id === 'kI') o.inner = util.clamp(val('kI'), 5, 95) / 100;
    if (id === 'kClosed') o.closed = e.target.checked;
    if (id === 'kPrev') { o.img = Object.assign({}, o.img, { preview: e.target.checked }); }
    objs.forEach(touch);
    changed();
  });

  // ---------------------------------------------------------------- Befehle
  const cmds = {
    new: () => confirmBox('Neues Projekt', 'Die aktuelle Zeichnung wird verworfen (vorher speichern?).', 'Neu anfangen').then((ok) => { if (!ok) return; S.doc = newDoc(); S.sel = []; S.undo = []; S.redo = []; changed(); fit(); setMode('design'); }),
    open: openProject,
    save: saveProject,
    example: loadExample,
    importVector, importImage, importTrace, importFsp,
    exportGcode, exportSvg,
    openGcode: () => { setMode('laser'); loadJobFile(); },
    undo, redo,
    copy() { const o = selObjs(); if (o.length) { S.clip = serial({ objects: o }); status(`${o.length} Objekt(e) kopiert`); } },
    paste() {
      if (!S.clip) return;
      const objs = revive(S.clip).objects.map((o) => ({ ...o, id: util.uid() }));
      objs.forEach((o) => translateObj(o, 5, -5));
      addObjects(objs);
      S.clip = serial({ objects: objs });
    },
    duplicate() {
      const src = selObjs();
      if (!src.length) return;
      const objs = revive(serial({ objects: src })).objects.map((o) => ({ ...o, id: util.uid(), name: o.name }));
      objs.forEach((o) => translateObj(o, 5, -5));
      addObjects(objs);
    },
    delete() {
      if (S.tool === 'node' && S.nodeSel) {
        const o = objById(S.nodeSel.id);
        if (o && o.nodes.length > 2) { snapshot(); o.nodes.splice(S.nodeSel.i, 1); S.nodeSel = null; touch(o); changed(); }
        return;
      }
      if (!S.sel.length) return;
      snapshot();
      const del = new Set(S.sel);
      S.doc.objects = S.doc.objects.filter((o) => !del.has(o.id));
      S.sel = [];
      changed();
    },
    selectAll() { S.sel = S.doc.objects.filter((o) => !o.hidden && layerOf(o).show).map((o) => o.id); renderSide(); redraw(); },
    selectLayer() { S.sel = S.doc.objects.filter((o) => o.layer === S.selLayer).map((o) => o.id); renderSide(); redraw(); },
    selectLayerOfSel() { selectLayerOfSel(); renderSide(); },
    clearOvr() { snapshot(); for (const o of selObjs()) delete o.ovr; changed(); },
    machineSettings, materialLib, materialTest: materialTestDialog,
    alignLeft: () => align('l'), alignRight: () => align('r'), alignTop: () => align('t'), alignBottom: () => align('b'),
    alignCenterH: () => align('ch'), alignCenterV: () => align('cv'),
    centerArea() {
      const objs = selObjs().length ? selObjs() : S.doc.objects;
      const b = boxOf(objs);
      if (!b) return;
      snapshot();
      for (const o of objs) translateObj(o, S.machine.w / 2 - (b.x0 + b.x1) / 2, S.machine.h / 2 - (b.y0 + b.y1) / 2);
      changed();
    },
    mirrorH: () => mirror(-1, 1), mirrorV: () => mirror(1, -1),
    rot90() { if (!S.sel.length) return; snapshot(); rotateSel(-Math.PI / 2); changed(); },
    rotBy() { if (!S.sel.length) return; snapshot(); rotateSel((-val('pRot') * Math.PI) / 180); changed(); },
    union: () => boolOp('union'), subtract: () => boolOp('difference'), intersect: () => boolOp('intersection'),
    offset: offsetDialog, array: arrayDialog,
    toPath, toLines, breakApart,
    editText() { const o = selObjs()[0]; if (o && o.kind === 'text') textDialog(o); },
    imageSettings() { const o = selObjs().find((q) => q.kind === 'image'); if (o) imageDialog(o); else status('Bitte zuerst ein Bild auswählen.', true); },
    traceSelected() { const o = selObjs().find((q) => q.kind === 'image'); if (o) traceImageObj(o); else status('Bitte zuerst ein Bild auswählen.', true); },
    fit: () => fit(),
    zoomIn: () => zoomAt(1.25, cv.clientWidth / 2, cv.clientHeight / 2),
    zoomOut: () => zoomAt(0.8, cv.clientWidth / 2, cv.clientHeight / 2),
    panLeft: () => panView(80, 0), panRight: () => panView(-80, 0), panUp: () => panView(0, 80), panDown: () => panView(0, -80),
    toggleWheel() {
      wheelZoom = !wheelZoom;
      store.set('ls.wheelZoom', wheelZoom);
      status(wheelZoom ? 'Mausrad = Zoom. Verschieben: Leertaste halten, Umschalt + Rad oder mittlere Maustaste.' : 'Mausrad / zwei Finger = verschieben, Strg + Rad bzw. Spreizen = Zoom.');
    },
    toggleSnap() { S.snap = !S.snap; store.set('ls.snap', S.snap); updateSnapInfo(); },
    toggleTheme() {
      const r = document.documentElement;
      const dark = getComputedStyle(r).getPropertyValue('--bg').trim().startsWith('#1');
      r.dataset.theme = dark ? 'light' : 'dark';
      store.set('ls.theme', r.dataset.theme);
      readColors(); redraw();
    },
    help: helpDialog, welcome: welcomeDialog, tips: tipsDialog, about: aboutDialog,
  };
  function updateSnapInfo() { $('#snapInfo').textContent = S.snap ? 'Raster fangen: an (G)' : 'Raster fangen: aus (G)'; }

  function align(how) {
    const objs = selObjs();
    if (!objs.length) return;
    const ref = objs.length > 1 ? boxOf(objs) : { x0: 0, y0: 0, x1: S.machine.w, y1: S.machine.h };
    snapshot();
    for (const o of objs) {
      const b = objBox(o);
      let dx = 0, dy = 0;
      if (how === 'l') dx = ref.x0 - b.x0; if (how === 'r') dx = ref.x1 - b.x1;
      if (how === 'b') dy = ref.y0 - b.y0; if (how === 't') dy = ref.y1 - b.y1;
      if (how === 'ch') dx = (ref.x0 + ref.x1) / 2 - (b.x0 + b.x1) / 2;
      if (how === 'cv') dy = (ref.y0 + ref.y1) / 2 - (b.y0 + b.y1) / 2;
      translateObj(o, dx, dy);
    }
    changed();
  }
  function mirror(sx, sy) {
    const objs = selObjs();
    if (!objs.length) return;
    const b = boxOf(objs);
    snapshot();
    for (const o of objs) scaleObj(o, sx, sy, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    changed();
  }
  const regionOf = (o) => poly.clip(SH.rings([o]), null, 'union', 'evenodd');
  function boolOp(kind) {
    const objs = selObjs().filter((o) => o.kind !== 'image');
    if (objs.length < 2) { status('Bitte mindestens zwei geschlossene Formen auswählen.', true); return; }
    let res;
    if (kind === 'union') res = poly.clip(objs.flatMap(regionOf), null, 'union', 'nonzero');
    else if (kind === 'difference') res = poly.clip(regionOf(objs[0]), poly.clip(objs.slice(1).flatMap(regionOf), null, 'union', 'nonzero'), 'difference', 'nonzero');
    else { res = regionOf(objs[0]); for (const o of objs.slice(1)) res = poly.clip(res, regionOf(o), 'intersection', 'nonzero'); }
    snapshot();
    const del = new Set(objs.map((o) => o.id));
    const layer = objs[0].layer;
    S.doc.objects = S.doc.objects.filter((o) => !del.has(o.id));
    if (!res.length) { S.sel = []; changed(); status('Ergebnis ist leer.', true); return; }
    const n = SH.make('poly', { name: { union: 'Vereinigung', difference: 'Differenz', intersection: 'Schnittmenge' }[kind], layer, lines: res.map((pts) => ({ pts, closed: true })) });
    S.doc.objects.push(n);
    S.sel = [n.id];
    changed();
  }
  function toPath() {
    const objs = selObjs();
    if (!objs.length) return;
    snapshot();
    let n = 0;
    for (const o of objs) {
      let nodes = null;
      if (o.kind === 'rect' && !(o.r > 0)) nodes = SH.localLines(o)[0].pts.map((p) => ({ ...M.apply(o.tf, p), c: false }));
      else if (o.kind === 'polygon' || o.kind === 'star') nodes = SH.localLines(o)[0].pts.map((p) => ({ ...M.apply(o.tf, p), c: false }));
      else if (o.kind === 'ellipse') {
        nodes = [];
        for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; nodes.push({ ...M.apply(o.tf, { x: o.rx * Math.cos(a), y: o.ry * Math.sin(a) }), c: true }); }
      } else if (o.kind === 'poly' && o.lines.length === 1 && o.lines[0].pts.length <= 400) {
        nodes = geo.simplify(o.lines[0].closed ? o.lines[0].pts.concat([o.lines[0].pts[0]]) : o.lines[0].pts, 0.01).map((p) => ({ x: p.x, y: p.y, c: false }));
        if (o.lines[0].closed) nodes.pop();
      } else if (o.kind === 'rect') nodes = geo.simplify(SH.lines(o)[0].pts, 0.005).map((p) => ({ x: p.x, y: p.y, c: false }));
      if (!nodes) continue;
      const closed = o.kind !== 'poly' || o.lines[0].closed;
      Object.keys(o).forEach((k) => { if (!['id', 'name', 'layer'].includes(k)) delete o[k]; });
      Object.assign(o, { kind: 'path', tf: M.id(), nodes, closed });
      touch(o);
      n++;
    }
    if (!n) { S.undo.pop(); status('Diese Objekte lassen sich nicht in Kurven umwandeln (Text: zuerst „In Linien umwandeln“).', true); return; }
    changed();
    setTool('node');
  }
  function toLines() {
    const objs = selObjs().filter((o) => o.kind !== 'image' && o.kind !== 'poly');
    if (!objs.length) return;
    snapshot();
    for (const o of objs) {
      const p = SH.toPoly(o);
      Object.keys(o).forEach((k) => { if (!['id', 'name', 'layer', 'ovr'].includes(k)) delete o[k]; });
      Object.assign(o, { kind: 'poly', tf: M.id(), lines: p.lines });
      touch(o);
    }
    changed();
  }
  function breakApart() {
    const objs = selObjs().filter((o) => o.kind === 'poly' || o.kind === 'text');
    if (!objs.length) { status('Auseinandernehmen geht bei importierten Linien und Text.', true); return; }
    snapshot();
    const add = [], del = new Set();
    for (const o of objs) {
      const ls = geom(o);
      const shapes = poly.nest(ls.filter((l) => l.closed).map((l) => l.pts));
      shapes.forEach((s, i) => add.push(SH.make('poly', { name: `${o.name} ${i + 1}`, layer: o.layer, lines: [s.outer, ...s.holes].map((pts) => ({ pts, closed: true })) })));
      ls.filter((l) => !l.closed).forEach((l, i) => add.push(SH.make('poly', { name: `${o.name} Linie ${i + 1}`, layer: o.layer, lines: [{ pts: l.pts, closed: false }] })));
      del.add(o.id);
    }
    S.doc.objects = S.doc.objects.filter((o) => !del.has(o.id)).concat(add);
    S.sel = add.map((o) => o.id);
    changed();
    status(`${add.length} Teile`);
  }

  function offsetDialog() {
    const objs = selObjs().filter((o) => o.kind !== 'image');
    if (!objs.length) { status('Bitte Formen auswählen.', true); return; }
    modal('Versatz', `${field('Abstand (+ außen, − innen)', inputN('oD', 2, 0.1), 'mm')}
      ${field('Ecken', `<select id="oJ"><option value="round">rund</option><option value="miter">spitz</option><option value="square">abgeschrägt</option></select>`)}
      <p class="muted small">Erzeugt eine neue Umrisslinie mit festem Abstand, z. B. einen Rand um Text, der dann ausgeschnitten wird (Aufkleber, Anhänger).</p>`,
    [{ label: 'Abbrechen', value: null }, { label: 'Erzeugen', primary: true, value: 'ok' }]).then((r) => {
      if (r !== 'ok') return;
      const d = val('oD'), j = $('#oJ') ? $('#oJ').value : 'round';
      const res = poly.offset(poly.clip(objs.flatMap(regionOf), null, 'union', 'nonzero'), d, j);
      if (!res.length) { status('Ergebnis ist leer – Abstand zu groß?', true); return; }
      addObjects([SH.make('poly', { name: `Versatz ${fmt(d)} mm`, lines: res.map((pts) => ({ pts, closed: true })) })]);
    });
  }
  // Letzte Zahl in einem Text um k erhöhen (führende Nullen bleiben): „Nr. 007“ → „Nr. 008“
  const bumpNumber = (s, k) => {
    const m = /(\d+)(?!.*\d)/s.exec(s);
    if (!m) return s + ' ' + (1 + k);
    const v = String(+m[1] + k).padStart(m[1].length, '0');
    return s.slice(0, m.index) + v + s.slice(m.index + m[1].length);
  };
  function arrayDialog() {
    const objs = selObjs();
    if (!objs.length) { status('Bitte etwas auswählen.', true); return; }
    const b = boxOf(objs);
    const hasText = objs.some((o) => o.kind === 'text');
    modal('Mehrfach anordnen', `<div class="grid2">${field('Spalten', inputN('aC', 3, 1, 'min="1"'))}${field('Zeilen', inputN('aR', 1, 1, 'min="1"'))}</div>
      ${field('Abstand waagrecht (Mitte zu Mitte)', inputN('aX', +(b.w + 5).toFixed(2), 0.5), 'mm')}
      ${field('Abstand senkrecht (Mitte zu Mitte)', inputN('aY', +(b.h + 5).toFixed(2), 0.5), 'mm')}
      ${hasText ? `<label class="check"><input type="checkbox" id="aNum" checked> Seriennummern: letzte Zahl im Text bei jeder Kopie um 1 erhöhen</label>` : ''}`,
    [{ label: 'Abbrechen', value: null }, { label: 'Anordnen', primary: true, value: 'ok' }]).then((r) => {
      if (r !== 'ok') return;
      const C = Math.max(1, Math.round(val('aC'))), R = Math.max(1, Math.round(val('aR'))), dx = val('aX'), dy = val('aY');
      const numbering = $('#aNum') && $('#aNum').checked;
      const add = [];
      let k = 0;
      for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
        if (!i && !j) continue;
        k++;
        const cp = revive(serial({ objects: objs })).objects.map((o) => ({ ...o, id: util.uid() }));
        cp.forEach((o) => {
          translateObj(o, i * dx, -j * dy);
          if (numbering && o.kind === 'text') { o.text = bumpNumber(o.text, k); o.name = 'Text: ' + o.text.split('\n')[0].slice(0, 20); }
        });
        add.push(...cp);
      }
      addObjects(add, false);
      S.sel = S.sel.concat(add.map((o) => o.id));
      renderSide();
      status(`${add.length} Kopien erzeugt`);
    });
  }

  // ---------------------------------------------------------------- Maschine / Material
  function machineSettings() {
    const m = S.machine;
    const html = `${field('Maschine', `<select id="mmId">${Object.values(LIB.MACHINES).map((x) => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
      <div class="grid2">
        ${field('Breite X', inputN('mmW', m.w, 1), 'mm')}${field('Tiefe Y', inputN('mmH', m.h, 1), 'mm')}
        ${field('Laser', inputN('mmWatt', m.watt || 10, 1), 'W')}
        ${field('S max ($30)', inputN('mmS', m.sMax, 1), '')}
        ${field('Max. Geschw.', inputN('mmV', m.maxSpeed, 100), 'mm/min')}
        ${field('Eilgang', inputN('mmR', m.rapid, 100), 'mm/min')}
        ${field('Beschleun.', inputN('mmA', m.accel, 100), 'mm/s²')}
        ${field('Baudrate', inputN('mmB', m.baud, 1), '')}
      </div>
      ${field('Art', `<select id="mmT"><option value="diode" ${m.type !== 'co2' ? 'selected' : ''}>Diodenlaser</option><option value="co2" ${m.type === 'co2' ? 'selected' : ''}>CO2-Laser</option></select>`)}
      <div class="field"><label>Nullpunkt der Maschine<br><span class="muted small">Ecke, an der die Referenzfahrt endet</span></label>
        <div class="zeropick" id="mmO">${['ul', 'ur', 'll', 'lr'].map((k) => `<button data-o="${k}" class="${(m.origin || 'll') === k ? 'active' : ''}" title="${anchorText(k)}"></button>`).join('')}</div></div>
      <p class="muted small">Die Laserleistung (optische Watt) rechnet die Materialbibliothek um. „S max“ muss zu <code>$30</code> der Steuerung passen – „Prüfen“ im Schritt Lasern liest es aus.</p>`;
    let origin = m.origin || 'll';
    modal('Maschine', html, [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen', primary: true, value: 'ok' }], {
      onOpen: (b) => {
        $('#mmO', b).style.gridTemplateColumns = 'repeat(2, 34px)'; $('#mmO', b).style.gridTemplateRows = 'repeat(2, 26px)';
        $('#mmO', b).addEventListener('click', (e) => { const bt = e.target.closest('[data-o]'); if (!bt) return; e.preventDefault(); origin = bt.dataset.o; $$('#mmO button', b).forEach((x) => x.classList.toggle('active', x === bt)); });
        $('#mmId', b).addEventListener('change', (e) => {
          const p = LIB.MACHINES[e.target.value];
          [['mmW', 'w'], ['mmH', 'h'], ['mmWatt', 'watt'], ['mmS', 'sMax'], ['mmV', 'maxSpeed'], ['mmR', 'rapid'], ['mmA', 'accel'], ['mmB', 'baud'], ['mmT', 'type']].forEach(([i, k]) => { $('#' + i).value = p[k]; });
          origin = p.origin; $$('#mmO button', b).forEach((x) => x.classList.toggle('active', x.dataset.o === origin));
        });
      },
    }).then((r) => {
      if (r !== 'ok') return;
      const v = { id: $('#mmId').value, w: val('mmW'), h: val('mmH'), watt: val('mmWatt'), sMax: val('mmS'), maxSpeed: val('mmV'), rapid: val('mmR'), accel: val('mmA'), baud: val('mmB'), type: $('#mmT').value, origin };
      store.set('ls.machine', v);
      loadMachine();
      changed(); fit();
    });
  }

  function myMaterials() { return store.get('ls.mylib', []); }
  function materialLib() {
    const l = layerById(S.selLayer) || curLayer();
    const list = () => myMaterials().map((m) => ({ ...m, mine: true })).concat(LIB.MATERIALS.map((m) => LIB.scaled(m, S.machine)));
    let cur = null;
    const rows = () => list().map((m) => `<tr data-m="${m.id}" class="${cur === m.id ? 'sel' : ''}"><td>${esc(m.mat)}${m.mine ? ' <small class="muted">(eigene)</small>' : ''}</td><td>${esc(m.job)}</td><td class="num">${m.speed} mm/min</td><td class="num">${m.power} %</td><td class="num">${m.mode === 'line' ? (m.passes || 1) + '×' : fmt(m.interval || 0.1, 2) + ' mm'}</td></tr>`).join('');
    const html = `<p class="small">Startwerte für <b>${esc(S.machine.name)}</b> (${S.machine.watt || 10} W). Jedes Holz und jeder Laser ist anders: vorher einen <b>Materialtest</b> machen.</p>
      <div style="max-height:52vh;overflow:auto"><table class="mattable"><thead><tr><th>Material</th><th>Arbeit</th><th>Geschw.</th><th>Leistung</th><th></th></tr></thead><tbody id="mlRows">${rows()}</tbody></table></div>
      <div id="mlNote" class="muted small"></div>
      <div class="row"><button id="mlSave">Ebene „${esc(layerLabel(l))}“ als eigenes Material speichern…</button><button id="mlDel">Eigenes löschen</button></div>`;
    return modal('Materialbibliothek', html, [{ label: 'Schließen', value: null }, { label: 'Auf Ebene anwenden', primary: true, value: 'ok' }], {
      wide: true, noFocus: true,
      onOpen: (b) => {
        b.addEventListener('click', (e) => {
          const tr = e.target.closest('[data-m]');
          if (tr) { cur = tr.dataset.m; $('#mlRows').innerHTML = rows(); const m = list().find((q) => q.id === cur); $('#mlNote').textContent = m && m.note ? m.note : ''; }
          if (e.target.id === 'mlSave') {
            const name = prompt('Name des Materials (z. B. „Birke 4 mm“):', '');
            if (!name) return;
            const mine = myMaterials();
            mine.unshift({ id: 'my' + util.uid(), mat: name, job: LZ.MODES[l.mode], mode: l.mode, speed: l.speed, power: l.power, passes: l.passes, interval: l.interval, air: l.air, minPower: l.minPower });
            store.set('ls.mylib', mine);
            $('#mlRows').innerHTML = rows();
          }
          if (e.target.id === 'mlDel' && cur && cur.startsWith('my')) { store.set('ls.mylib', myMaterials().filter((m) => m.id !== cur)); cur = null; $('#mlRows').innerHTML = rows(); }
        });
        b.addEventListener('dblclick', (e) => { if (e.target.closest('[data-m]')) $('#modalBtns .primary').click(); });
      },
    }).then((r) => {
      if (r !== 'ok' || !cur) return;
      const m = list().find((q) => q.id === cur);
      snapshot();
      Object.assign(l, { mode: m.mode, speed: m.speed, power: m.power, passes: m.passes || 1, interval: m.interval || l.interval, air: !!m.air, minPower: m.minPower || 0 });
      if (!l.name || /^Ebene \d+$/.test(l.name)) l.name = `${m.mat} – ${m.job}`;
      changed();
      status(`Ebene „${layerLabel(l)}“: ${m.speed} mm/min, ${m.power} %`);
    });
  }

  function materialTestDialog() {
    const strong = (S.machine.watt || 10) > 20; // starke Laser (z. B. 33 W): schneller testen, kleinere Leistungen
    const p = store.get('ls.mtest', { cols: 6, rows: 5, pMin: strong ? 10 : 20, pMax: strong ? 80 : 100, vMin: strong ? 1500 : 600, vMax: strong ? 12000 : 4000, cell: 8, gap: 2, mode: 'fill', interval: 0.1, labels: true });
    const html = `<p class="small">Ein Raster aus Feldern: nach rechts steigt die <b>Leistung</b>, nach unten sinkt die <b>Geschwindigkeit</b>. Danach das schönste Feld aussuchen und die Werte in die Ebene eintragen.</p>
      <div class="grid2">
        ${field('Spalten', inputN('mtC', p.cols, 1, 'min="1" max="20"'))}${field('Zeilen', inputN('mtR', p.rows, 1, 'min="1" max="20"'))}
        ${field('Leistung von', inputN('mtP0', p.pMin, 1), '%')}${field('bis', inputN('mtP1', p.pMax, 1), '%')}
        ${field('Geschw. von', inputN('mtV0', p.vMin, 50), 'mm/min')}${field('bis', inputN('mtV1', p.vMax, 50), 'mm/min')}
        ${field('Feldgröße', inputN('mtS', p.cell, 1, 'min="2"'), 'mm')}${field('Abstand', inputN('mtG', p.gap, 0.5, 'min="0"'), 'mm')}
      </div>
      ${field('Art', `<select id="mtM"><option value="fill" ${p.mode === 'fill' ? 'selected' : ''}>Füllen (Gravur)</option><option value="line" ${p.mode === 'line' ? 'selected' : ''}>Linie (Schnitt/Ritzen)</option></select>`)}
      ${field('Zeilenabstand', inputN('mtI', p.interval, 0.01, 'min="0.02"'), 'mm')}
      <label class="check"><input type="checkbox" id="mtL" ${p.labels ? 'checked' : ''}> Beschriftung mitlasern</label>
      <p id="mtInfo" class="muted small"></p>`;
    const read = () => ({ cols: Math.round(val('mtC')), rows: Math.round(val('mtR')), pMin: val('mtP0'), pMax: val('mtP1'), vMin: val('mtV0'), vMax: val('mtV1'), cell: Math.max(2, val('mtS')), gap: Math.max(0, val('mtG')), mode: $('#mtM').value, interval: Math.max(0.02, val('mtI')), labels: $('#mtL').checked });
    const info = () => {
      const o = read();
      const t = LZ.materialTest({ ...o, font: FS.ttf.names()[0] });
      const pl = LZ.plan({ objects: t.objects, layers: t.layers }, { machine: S.machine });
      $('#mtInfo').textContent = `${o.cols * o.rows} Felder · Größe ca. ${fmt(pl.bounds ? pl.bounds.w : 0, 0)} × ${fmt(pl.bounds ? pl.bounds.h : 0, 0)} mm · Laufzeit ≈ ${LZ.fmtTime(pl.time.sec)}`;
    };
    let tmr = 0;
    modal('Materialtest', html, [{ label: 'Abbrechen', value: null }, { label: 'Erzeugen', primary: true, value: 'ok' }], {
      onOpen: (b) => { b.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(info, 250); }); info(); },
    }).then((r) => {
      if (r !== 'ok') return;
      const o = read();
      store.set('ls.mtest', o);
      const t = LZ.materialTest({ ...o, font: FS.ttf.names()[0], x: 10, y: 10 });
      snapshot();
      // eigene Farben suchen, damit vorhandene Ebenen unberührt bleiben
      const free = LZ.COLORS.filter((c) => !S.doc.layers.some((l) => l.color === c && S.doc.objects.some((q) => q.layer === l.id)));
      t.layers.forEach((l, i) => {
        const old = S.doc.layers.find((q) => q.color === (free[free.length - 1 - i] || l.color));
        l.color = free[free.length - 1 - i] || l.color;
        if (old) S.doc.layers = S.doc.layers.filter((q) => q !== old);
        S.doc.layers.unshift(l);
      });
      const b = boxOf(t.objects);
      t.objects.forEach((q) => translateObj(q, S.machine.w / 2 - (b.x0 + b.x1) / 2, S.machine.h / 2 - (b.y0 + b.y1) / 2));
      S.doc.objects.push(...t.objects);
      S.sel = t.objects.map((q) => q.id);
      changed();
      status('Materialtest erzeugt. Mit dem Rahmen prüfen, ob er aufs Material passt, dann lasern.');
    });
  }

  // ---------------------------------------------------------------- Dateien
  function saveProject() {
    const name = (S.doc.name || 'Projekt').replace(/[^\wäöüÄÖÜß\- ]+/g, '_');
    download(name + '.lsp', serial(S.doc, true), 'application/json');
    status('Projekt gespeichert: ' + name + '.lsp');
  }
  async function openProject() {
    const f = await pickFile('.lsp,.json,.svg,.dxf,.nc,.gcode,.gc,.tap,.ngc,.fsp,image/*');
    if (f) openDropped(f.file);
  }
  const readAs = (file, as) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (as === 'buffer') r.readAsArrayBuffer(file); else if (as === 'url') r.readAsDataURL(file); else r.readAsText(file);
  });
  async function openDropped(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (file.type.startsWith('image/') && ext !== 'svg') {
      const data = await readAs(file, 'url');
      const r = await modal('Bild verwenden als …', `<p>Was soll aus <b>${esc(file.name)}</b> werden?</p>
        <p class="small"><b>Gravieren:</b> Foto oder Logo Pixel für Pixel lasern (Rastermodus wählbar).<br><b>Nachzeichnen:</b> die dunklen Flächen werden zu Linien (zum Schneiden oder Füllen).</p>`,
      [{ label: 'Abbrechen', value: null }, { label: 'Nachzeichnen', value: 'trace' }, { label: 'Gravieren', primary: true, value: 'img' }]);
      if (r === 'img') importImage({ name: file.name, data });
      if (r === 'trace') importTrace({ name: file.name, data });
      return;
    }
    if (ext === 'svg' || ext === 'dxf') return importVectorText(file.name, await readAs(file, 'text'));
    if (['nc', 'gcode', 'gc', 'tap', 'ngc'].includes(ext)) { setMode('laser'); setJob(await readAs(file, 'text'), file.name, null); return; }
    if (ext === 'fsp') return importFspText(file.name, await readAs(file, 'text'));
    if (ext === 'lsp' || ext === 'json') return openProjectText(file.name, await readAs(file, 'text'));
    status('Dieser Dateityp wird nicht unterstützt: .' + ext, true);
  }
  function openProjectText(name, text) {
    try {
      const d = revive(text);
      if (!d.objects || !d.layers) {
        if (d.stock && d.objects) return importFspText(name, text);
        throw new Error('Keine LaserStudio-Datei');
      }
      d.job = d.job || { start: 'absolute', anchor: 'll' };
      S.undo = []; S.redo = []; S.sel = [];
      S.doc = d;
      changed(); fit();
      status('Geöffnet: ' + name);
    } catch (e) { modal('Fehler', `<p>Die Datei konnte nicht geöffnet werden: ${esc(e.message)}</p>`); }
  }
  async function importFsp() {
    const f = await pickFile('.fsp,.json');
    if (f) importFspText(f.name, f.data);
  }
  // Zeichnung aus einem FräsStudio-Projekt übernehmen (Formen und Text; 3D-Reliefs nicht)
  function importFspText(name, text) {
    try {
      const d = JSON.parse(text);
      const objs = (d.objects || []).filter((o) => o.kind !== 'relief').map((o) => ({ ...o, id: util.uid(), layer: curLayer().id }));
      if (!objs.length) throw new Error('Keine Zeichnung gefunden');
      addObjects(objs);
      setMode('design');
      fit();
      status(`${objs.length} Objekte aus ${name} übernommen (Ebene ${layerLabel(curLayer())}).`);
    } catch (e) { modal('Import fehlgeschlagen', `<p>${esc(e.message)}</p>`); }
  }
  async function importVector() {
    const f = await pickFile('.svg,.dxf');
    if (f) importVectorText(f.name, f.data);
  }
  function importVectorText(name, text) {
    try {
      const ext = name.split('.').pop().toLowerCase();
      const lines = ext === 'dxf' ? FS.importers.parseDXF(text) : FS.importers.parseSVG(text);
      if (!lines.length) throw new Error('Keine Linien gefunden');
      snapshot();
      // SVG-Farben → Ebenen (nächste Palettenfarbe), wie in LightBurn
      const groups = new Map();
      for (const l of lines) {
        const c = l.color && ext === 'svg' ? nearestColor(l.color) : curLayer().color;
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c).push({ pts: l.pts, closed: l.closed });
      }
      const base = name.replace(/\.[^.]+$/, '');
      const objs = [...groups.entries()].map(([c, ls]) => SH.make('poly', { name: groups.size > 1 ? `${base} (${LZ.COLORS.indexOf(c) + 1})` : base, lines: ls, layer: layerForColor(c).id }));
      const b = geo.bounds(lines.map((l) => l.pts));
      const fitsArea = b.x0 >= -0.01 && b.y0 >= -0.01 && b.x1 <= S.machine.w && b.y1 <= S.machine.h;
      if (!fitsArea) objs.forEach((o) => translateObj(o, S.machine.w / 2 - (b.x0 + b.x1) / 2, S.machine.h / 2 - (b.y0 + b.y1) / 2));
      S.doc.objects.push(...objs);
      S.sel = objs.map((o) => o.id);
      changed();
      setMode('design');
      const open = lines.filter((l) => !l.closed).length;
      status(`Importiert: ${lines.length} Linienzüge in ${groups.size} Ebene(n) (${fmt(b.w)} × ${fmt(b.h)} mm)${open ? `, davon ${open} offen` : ''}.`);
      fit();
    } catch (e) { modal('Import fehlgeschlagen', `<p>${esc(e.message)}</p>`); }
  }

  // Bild zum Gravieren: Graustufen (max. 2000 px) speichern, Breite in mm
  async function importImage(given) {
    const f = given || (await pickFile('image/*', 'url'));
    if (!f) return;
    const img = await loadImage(f.data).catch(() => null);
    if (!img) { modal('Fehler', '<p>Das Bild konnte nicht gelesen werden.</p>'); return; }
    addImageFromSource(img, f.name.replace(/\.[^.]+$/, ''), Math.min(100, S.machine.w * 0.6));
  }
  function addImageFromSource(src, name, wmm, pos, layer) {
    const px = imagePixels(src, 2000);
    const g8 = new Uint8Array(px.w * px.h);
    const gray = FS.dither.grayFromRGBA(px.data, px.w * px.h);
    for (let i = 0; i < g8.length; i++) g8[i] = Math.round(gray[i] * 255);
    const pxd = LZ.encodePx(px.w, px.h, g8);
    assets.set(pxd.id, pxd);
    const hmm = (wmm * px.h) / px.w;
    // Bild in eine Bild-Ebene legen (vorhandene nehmen oder neue Farbe)
    let l = layer || S.doc.layers.find((q) => q.mode === 'image' && q.output);
    if (!l) {
      const free = LZ.COLORS.find((c) => !S.doc.layers.some((q) => q.color === c)) || LZ.COLORS[5];
      l = LZ.makeLayer(free, { mode: 'image', name: 'Bild', speed: 3000, power: 40, interval: 0.1, air: false });
      S.doc.layers.push(l);
    }
    const o = SH.make('image', { name, w: wmm, h: hmm, px: pxd, img: { mode: 'jarvis', bright: 0, contrast: 0, gamma: 1, invert: false, threshold: 0.5, cell: 6, sharpen: 0 }, layer: l.id });
    o.tf = M.translate(pos ? pos.x : S.machine.w / 2, pos ? pos.y : S.machine.h / 2);
    addObjects([o]);
    S.selLayer = l.id;
    setMode('design');
    renderSide();
    return o;
  }

  function imageDialog(o) {
    const im0 = Object.assign({ mode: 'jarvis', bright: 0, contrast: 0, gamma: 1, invert: false, threshold: 0.5, cell: 6, sharpen: 0 }, o.img);
    const l = layerOf(o);
    const html = `<div class="imgprev"><div><canvas id="imO"></canvas><div class="cap">Original</div></div><div><canvas id="imD"></canvas><div class="cap" id="imCap">So wird es gelasert</div></div></div>
      ${field('Rastermodus', `<select id="imMode">${Object.entries(FS.dither.MODES).map(([k, v]) => `<option value="${k}" ${k === im0.mode ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
      ${field('Helligkeit', `<input id="imB" type="range" min="-0.5" max="0.5" step="0.01" value="${im0.bright}">`)}
      ${field('Kontrast', `<input id="imC" type="range" min="-0.8" max="0.8" step="0.01" value="${im0.contrast}">`)}
      ${field('Gamma <span class="muted small">(Mitteltöne)</span>', `<input id="imG" type="range" min="0.3" max="3" step="0.05" value="${im0.gamma}">`)}
      ${field('Schärfen', `<input id="imSh" type="range" min="0" max="1.5" step="0.05" value="${im0.sharpen || 0}">`)}
      <div id="imThRow">${field('Schwelle', `<input id="imT" type="range" min="0.05" max="0.95" step="0.01" value="${im0.threshold}">`)}</div>
      <div id="imCellRow">${field('Punktgröße', `<input id="imCell" type="range" min="3" max="16" step="1" value="${im0.cell}">`)}</div>
      <label class="check"><input type="checkbox" id="imInv" ${im0.invert ? 'checked' : ''}> umkehren (Negativ – z. B. für Schiefer, eloxiertes Alu, dunkles Material)</label>
      <p class="muted small">Ebene „${esc(layerLabel(l))}“: ${fmt(l.interval, 2)} mm Zeilenabstand (${Math.round(25.4 / l.interval)} DPI), ${l.speed} mm/min, ${l.power} %${l.mode === 'image' && l.minPower ? `, Min. ${l.minPower} %` : ''}. Graustufen nutzt die Leistung zwischen Min. und Max.</p>`;
    const read = () => ({ mode: $('#imMode').value, bright: val('imB'), contrast: val('imC'), gamma: val('imG'), sharpen: val('imSh'), threshold: val('imT'), cell: Math.round(val('imCell')), invert: $('#imInv').checked, preview: im0.preview });
    let tmr = 0;
    const render = () => {
      const im = read();
      $('#imThRow').classList.toggle('hidden', !['threshold', 'sketch'].includes(im.mode));
      $('#imCellRow').classList.toggle('hidden', im.mode !== 'newsprint');
      const co = $('#imO'), cd = $('#imD');
      const step = Math.max(l.interval, Math.max(o.w, o.h) / 360);
      const tmp = { ...o, img: im, tf: [1, 0, 0, 1, 0, 0] };
      const r = LZ.processImage(tmp, step);
      for (const c of [co, cd]) { c.width = r.nx; c.height = r.ny; }
      const xo = co.getContext('2d'), xd = cd.getContext('2d');
      const io = xo.createImageData(r.nx, r.ny), id = xd.createImageData(r.nx, r.ny);
      const raw = LZ.sampleImage(tmp, step);
      for (let i = 0; i < r.dark.length; i++) {
        const g = raw.f[i] < 0 ? 255 : raw.f[i] * 255, v = 255 - r.dark[i] * 255;
        io.data.set([g, g, g, 255], i * 4); id.data.set([v, v * 0.93, v * 0.85, 255], i * 4);
      }
      xo.putImageData(io, 0, 0); xd.putImageData(id, 0, 0);
      $('#imCap').textContent = `So wird es gelasert (Vorschau ${fmt(step, 2)} mm je Punkt)`;
    };
    modal('Bild einstellen', html, [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen', primary: true, value: 'ok' }], {
      wide: true, noFocus: true,
      onOpen: (b) => { b.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(render, 60); }); render(); },
    }).then((r) => {
      if (r !== 'ok') return;
      snapshot();
      o.img = read();
      changed();
    });
  }

  async function importTrace(given) {
    const f = given || (await pickFile('image/*', 'url'));
    if (!f) return;
    const img = await loadImage(f.data).catch((e) => { modal('Fehler', esc(e.message)); });
    if (!img) return;
    traceDialog(imagePixels(img, 900), img, f.name.replace(/\.[^.]+$/, ''), Math.min(150, S.machine.w * 0.5), null);
  }
  function traceImageObj(o) {
    const g8 = LZ.decodePx(o.px), k = Math.min(1, 900 / Math.max(o.px.w, o.px.h));
    const w = Math.max(2, Math.round(o.px.w * k)), h = Math.max(2, Math.round(o.px.h * k));
    const data = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const g = g8[Math.min(o.px.h - 1, Math.floor(j / k)) * o.px.w + Math.min(o.px.w - 1, Math.floor(i / k))]; data.set([g, g, g, 255], (j * w + i) * 4); }
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
    traceDialog({ w, h, data }, c, o.name + ' Umriss', o.w, o);
  }
  /** Nachzeichnen: px = {w,h,data RGBA}. place: Bild-Objekt (Umriss liegt genau darauf) oder {area} (Kamera) oder null (Mitte) */
  async function traceDialog(px, img, name, wmm, place) {
    const html = `<canvas id="trPrev" width="560" height="320"></canvas>
      ${field('Schwelle', `<input id="trTh" type="range" min="1" max="254" value="128">`)}
      <label class="check"><input type="checkbox" id="trInv"> umkehren (helle Bereiche werden zur Form)</label>
      ${place ? '' : field('Breite', inputN('trW', wmm.toFixed(0), 1, 'min="1"'), 'mm')}
      ${field('Glätten', `<input id="trSm" type="range" min="0" max="3" step="0.1" value="0.7">`)}
      ${place && place.area ? field('Rand außen herum', inputN('trOff', 0, 0.5), 'mm') : ''}
      <p id="trInfo" class="muted small"></p>`;
    let rings = [];
    const W = () => (place ? wmm : val('trW') || 100);
    const prev = () => {
      rings = FS.importers.traceImage(px.data, px.w, px.h, W(), val('trTh'), $('#trInv').checked, val('trSm'));
      const c = $('#trPrev'), x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      const k = Math.min(c.width / px.w, c.height / px.h);
      x.globalAlpha = 0.35; x.drawImage(img, 0, 0, px.w * k, px.h * k); x.globalAlpha = 1;
      const mm = W() / px.w;
      x.fillStyle = 'rgba(196,80,26,.35)'; x.strokeStyle = '#c4501a';
      x.beginPath();
      for (const r of rings) r.forEach((p, i) => { const X = (p.x / mm) * k, Y = (px.h - p.y / mm) * k; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
      x.fill('evenodd'); x.stroke();
      $('#trInfo').textContent = `${rings.length} Umrisse, ${fmt(W())} × ${fmt((W() * px.h) / px.w)} mm`;
    };
    const r = await modal('Nachzeichnen', html, [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen', primary: true, value: 'ok' }], { onOpen: (b) => { b.addEventListener('input', prev); prev(); }, noFocus: true });
    if (r !== 'ok' || !rings.length) return;
    let lines = rings;
    if (place && place.area && val('trOff')) lines = poly.offset(poly.clip(rings, null, 'union', 'evenodd'), val('trOff'));
    const o = SH.make('poly', { name, lines: lines.map((pts) => ({ pts, closed: true })) });
    const hmm = (W() * px.h) / px.w;
    if (place && place.area) translateObj(o, place.area.x0, place.area.y0);
    else if (place) applyM(o, M.mul(place.tf, M.translate(-place.w / 2, -place.h / 2)));
    else translateObj(o, S.machine.w / 2 - W() / 2, S.machine.h / 2 - hmm / 2);
    const lineLayer = S.doc.layers.find((q) => q.mode === 'line') || curLayer();
    o.layer = lineLayer.id;
    addObjects([o]);
    setMode('design');
  }

  function exportSvg() {
    const m = S.machine;
    let body = '';
    for (const o of S.doc.objects) {
      if (o.hidden) continue;
      const col = layerOf(o).color;
      if (o.kind === 'image') {
        const c = document.createElement('canvas'), g = grayCanvas(o.px);
        c.width = g.width; c.height = g.height; c.getContext('2d').drawImage(g, 0, 0);
        const t = M.mul([1, 0, 0, -1, 0, m.h], M.mul(o.tf, [o.w / o.px.w, 0, 0, -o.h / o.px.h, -o.w / 2, o.h / 2]));
        body += `<image transform="matrix(${t.map((v) => v.toFixed(5)).join(' ')})" width="${o.px.w}" height="${o.px.h}" href="${c.toDataURL('image/png')}"/>\n`;
        continue;
      }
      const d = geom(o).map((l) => l.pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(3)} ${(m.h - p.y).toFixed(3)}`).join('') + (l.closed ? 'Z' : '')).join('');
      body += `<path d="${d}" fill="none" stroke="${col}" stroke-width="0.2"/>\n`;
    }
    download((S.doc.name || 'Zeichnung') + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${m.w}mm" height="${m.h}mm" viewBox="0 0 ${m.w} ${m.h}">\n${body}</svg>\n`, 'image/svg+xml');
  }

  // ---------------------------------------------------------------- Auftrag berechnen
  function getPlan() {
    if (S.plan) return S.plan;
    S.plan = LZ.plan(S.doc, { machine: S.machine, start: { x: 0, y: 0 } });
    S.plan.box = boxOf(outputObjs());
    return S.plan;
  }
  function withBusy(text, fn) {
    const busy = $('#busy');
    $('#busy span').textContent = text;
    busy.classList.remove('hidden');
    return new Promise((resolve) => setTimeout(() => { try { resolve(fn()); } catch (e) { modal('Fehler beim Berechnen', `<p>${esc(e.message)}</p>`); resolve(null); } finally { busy.classList.add('hidden'); } }, 30));
  }
  const jobOpts = () => ({ start: S.doc.job.start, anchor: S.doc.job.anchor, box: getPlan().box, name: S.doc.name });
  function checkPlan(pl) {
    const w = pl.warnings.slice();
    const m = S.machine;
    if (S.doc.job.start === 'absolute' && pl.bounds && (pl.bounds.x0 < -0.01 || pl.bounds.y0 < -0.01 || pl.bounds.x1 > m.w + 0.01 || pl.bounds.y1 > m.h + 0.01)) w.push(`Der Auftrag (mit Überfahrt) ragt über den Arbeitsbereich ${m.w} × ${m.h} mm hinaus. Objekte verschieben oder die Überfahrt verkleinern.`);
    for (const l of S.doc.layers) if (l.output && S.doc.objects.some((o) => o.layer === l.id) && l.speed > m.maxSpeed) w.push(`Ebene ${layerLabel(l)}: ${l.speed} mm/min ist schneller als die Maschine (${m.maxSpeed}).`);
    return w;
  }
  async function buildGcode() {
    if (!outputObjs().length) { status('Nichts zu lasern: keine sichtbaren Objekte in aktiven Ebenen.', true); return null; }
    return withBusy('Laserbahnen werden berechnet …', () => {
      const pl = getPlan();
      return { pl, text: LZ.gcode(pl, S.doc, jobOpts(), S.machine) };
    });
  }
  async function exportGcode() {
    const r = await buildGcode();
    if (!r) return;
    const w = checkPlan(r.pl);
    if (w.length && !(await confirmBox('Hinweise', w.map(esc).join('<br>'), 'Trotzdem speichern'))) return;
    download((S.doc.name || 'Laser').replace(/[^\wäöüÄÖÜß\- ]+/g, '_') + '.gcode', r.text);
    status(`G-Code gespeichert · Laufzeit ≈ ${LZ.fmtTime(r.pl.time.sec)}`);
  }

  // ---------------------------------------------------------------- Vorschau
  const pv = {
    k: 0, t: 0, playing: false, off: null, key: '', drawn: 0, last: null, tCum: null,
    reset() { this.k = 0; this.t = 0; this.playing = false; this.off = null; this.drawn = 0; this.tCum = null; this.full = false; },
  };
  function enterPreview() {
    if (!outputObjs().length) { $('#pvInfo').textContent = 'Nichts zu lasern.'; redraw(); return; }
    withBusy('Laserbahnen werden berechnet …', () => {
      const pl = getPlan();
      pv.tCum = LZ.cumTimes(pl.moves, S.machine);
      if (!pv.full && !pv.playing) { pv.k = pl.moves.length; pv.full = true; }
      renderPreviewSide();
      redraw();
    });
  }
  function renderPreviewSide() {
    const pl = S.plan;
    if (!pl) { $('#pvInfo').textContent = ''; return; }
    const tot = pl.time.sec, cur = pv.tCum && pv.k ? pv.tCum[Math.min(pv.k, pl.moves.length) - 1] : 0;
    $('#pvBar').style.width = (tot ? (100 * cur) / tot : 0).toFixed(1) + '%';
    $('#pvInfo').innerHTML = `Laufzeit ≈ <b>${LZ.fmtTime(tot)}</b> · Brennweg ${fmt(pl.time.burn / 1000, 2)} m${pl.bounds ? ` · ${fmt(pl.bounds.w, 1)} × ${fmt(pl.bounds.h, 1)} mm (mit Überfahrt)` : ''}${pv.playing || pv.k < pl.moves.length ? `<br>Stand: ${LZ.fmtTime(cur)}` : ''}`;
    $('#pvLayers').innerHTML = pl.blocks.map((b) => {
      const t = pv.tCum ? pv.tCum[Math.max(0, b.to - 1)] - (b.from ? pv.tCum[b.from - 1] : 0) : 0;
      return `<div class="pvlay"><span class="sw" style="background:${b.layer.color}"></span><span class="n">${esc(layerLabel(b.layer))} · ${LZ.MODES[b.layer.mode]}</span><span class="muted">${LZ.fmtTime(t)}</span></div>`;
    }).join('') || '<div class="empty">Keine aktiven Ebenen mit Objekten.</div>';
    const w = checkPlan(pl);
    $('#pvWarn').innerHTML = w.map((x) => `<div class="warnbox">${esc(x)}</div>`).join('');
  }
  // Bewegungen a..b auf eine Zeichenfläche (Bildschirmkoordinaten) malen
  function paintMoves(x, list, a, b, opt) {
    const s = S.view.s;
    const pl = S.plan;
    const widthAt = (i) => {
      const blk = pl && pl.blocks.find((q) => i >= q.from && i < q.to);
      return blk && blk.layer.mode !== 'line' ? Math.max(1, blk.layer.interval * s) : Math.max(1, 0.15 * s);
    };
    let p = null;
    for (let i = a - 1; i >= 0; i--) if (list[i].x !== undefined) { p = list[i]; break; }
    let bucket = -1, w = widthAt(a);
    x.lineCap = 'butt';
    const flush = () => { if (bucket >= 0) x.stroke(); };
    for (let i = a; i < b; i++) {
      const m = list[i];
      if (m.x === undefined) { if (m.begin) { flush(); bucket = -1; w = widthAt(i + 1); } continue; }
      if (!p) { p = m; continue; }
      const k = m.rapid ? -2 : m.s > 0 ? Math.min(10, Math.ceil(m.s * 10)) : -3;
      if (k === -3 || (k === -2 && !opt.rapid)) { p = m; continue; }
      if (k !== bucket) {
        flush();
        bucket = k;
        x.beginPath();
        if (k === -2) { x.strokeStyle = 'rgba(224,49,49,.35)'; x.lineWidth = 0.8; x.setLineDash([3, 4]); }
        else { x.setLineDash([]); x.strokeStyle = `rgba(55,32,14,${0.25 + 0.075 * k})`; x.lineWidth = w; }
      }
      const P = w2s(p), Q = w2s(m);
      x.moveTo(P.x, P.y); x.lineTo(Q.x, Q.y);
      p = m;
    }
    flush();
    x.setLineDash([]);
  }
  function drawPreview(x) {
    const pl = S.plan;
    if (!pl) return;
    const list = pl.moves;
    const dpr = window.devicePixelRatio || 1;
    const key = [S.view.s, S.view.ox, S.view.oy, cv.width, cv.height, $('#pvRapid').checked].join('|');
    if (!pv.off || pv.key !== key || pv.drawn > pv.k) {
      pv.off = pv.off || document.createElement('canvas');
      pv.off.width = cv.width; pv.off.height = cv.height;
      pv.key = key; pv.drawn = 0;
    }
    const ox = pv.off.getContext('2d');
    ox.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (pv.k > pv.drawn) { paintMoves(ox, list, pv.drawn, pv.k, { rapid: $('#pvRapid').checked }); pv.drawn = pv.k; }
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.drawImage(pv.off, 0, 0);
    x.restore();
    // Laserkopf
    if (pv.k > 0 && pv.k < list.length) {
      let m = null;
      for (let i = pv.k - 1; i >= 0; i--) if (list[i].x !== undefined) { m = list[i]; break; }
      if (m) {
        const p = w2s(m);
        x.strokeStyle = '#e03131'; x.lineWidth = 2;
        x.beginPath(); x.arc(p.x, p.y, 6, 0, Math.PI * 2); x.stroke();
        if (m.s > 0) { x.fillStyle = 'rgba(255,60,20,.85)'; x.beginPath(); x.arc(p.x, p.y, 3, 0, Math.PI * 2); x.fill(); }
      }
    }
  }
  let pvRaf = 0, pvT0 = 0;
  function pvStep(ts) {
    if (!pv.playing || S.mode !== 'preview' || !S.plan) { pvRaf = 0; return; }
    const dt = pvT0 ? (ts - pvT0) / 1000 : 0;
    pvT0 = ts;
    const sp = +$('#pvSpeed').value;
    const factor = Math.pow(10, (sp / 100) * 3.3); // 1× … 2000×
    pv.t += dt * factor;
    const t = pv.tCum;
    let k = pv.k;
    while (k < t.length && t[k] <= pv.t) k++;
    pv.k = k;
    if (k >= t.length) { pv.playing = false; $('#pvPlay').textContent = '▶ Abspielen'; }
    renderPreviewSide();
    redraw();
    pvRaf = requestAnimationFrame(pvStep);
  }
  $('#pvPlay').onclick = () => {
    if (!S.plan) return;
    if (pv.playing) { pv.playing = false; $('#pvPlay').textContent = '▶ Abspielen'; return; }
    if (pv.k >= S.plan.moves.length) { pv.k = 0; pv.t = 0; pv.drawn = 0; pv.off = null; }
    pv.t = pv.k ? pv.tCum[pv.k - 1] : 0;
    pv.playing = true; pvT0 = 0;
    $('#pvPlay').textContent = '⏸ Anhalten';
    if (!pvRaf) pvRaf = requestAnimationFrame(pvStep);
  };
  $('#pvEnd').onclick = () => { if (!S.plan) return; pv.playing = false; $('#pvPlay').textContent = '▶ Abspielen'; pv.k = S.plan.moves.length; renderPreviewSide(); redraw(); };
  $('#pvReset').onclick = () => { pv.playing = false; $('#pvPlay').textContent = '▶ Abspielen'; pv.k = 0; pv.t = 0; pv.off = null; renderPreviewSide(); redraw(); };
  $('#pvRapid').onchange = () => { pv.off = null; redraw(); };
  $('#pvMat').onchange = () => redraw();

  // ---------------------------------------------------------------- Lasern
  let alarmHinted = false, pointerOn = false, laserChecked = false;
  function machineInit() {
    if (S.grbl) return;
    const g = (S.grbl = new FS.Grbl());
    g.on('connect', () => {
      alarmHinted = false;
      $('#mConnect').textContent = 'Trennen'; $('#mConnect').classList.remove('primary');
      log(`Verbunden (${{ usb: 'USB' + (g.baud ? ', ' + g.baud + ' Baud' : ''), bridge: 'WLAN über den Server', ws: 'WLAN direkt' }[g.kind] || g.kind}).`, 'info');
      updConn();
      if (!laserChecked) setTimeout(() => checkSettings(true), 600);
    });
    g.on('disconnect', (lost) => {
      pointerOn = false; $('#mPointer').classList.remove('primary');
      $('#mConnect').textContent = 'Verbinden …'; $('#mConnect').classList.add('primary');
      log(lost ? 'Verbindung verloren.' : 'Getrennt.', lost ? 'err' : 'info'); updConn();
      if (lost && !g.job) status('Verbindung zum Laser verloren.', true);
    });
    g.on('status', (st) => {
      const el = $('#mState');
      const names = { Idle: 'Bereit', Run: 'Läuft', Hold: 'Angehalten', Jog: 'Verfährt', Alarm: 'ALARM – entsperren', Door: 'Tür/Deckel offen', Check: 'Prüfmodus', Home: 'Referenzfahrt', Sleep: 'Ruhezustand', Getrennt: 'Getrennt' };
      el.textContent = names[st.state] || st.state;
      el.className = 'state ' + st.state;
      $('#droX').textContent = fmt3(st.wpos.x); $('#droY').textContent = fmt3(st.wpos.y);
      $('#ovF').textContent = st.ov[0] + ' %'; $('#ovS').textContent = st.ov[2] + ' %';
      updConn();
      if (st.state === 'Alarm' && !alarmHinted) { alarmHinted = true; log('Der Laser steht im Alarm (nach dem Einschalten oft normal): „Entsperren“ ($X) oder „Home“ ($H) drücken.', 'err'); }
      redraw();
    });
    g.on('log', (l, cls) => log(l, cls));
    g.on('alarm', (code, txt) => { modal('Alarm ' + code, `<p>${esc(txt || 'Die Maschine meldet einen Alarm.')}</p><p>Mit <b>Entsperren</b> ($X) oder <b>Home</b> geht es weiter. Prüfe vorher, ob alles frei ist.</p>`); });
    g.on('progress', (j) => jobUi(j));
    g.on('jobdone', (j) => {
      jobUi(null);
      S.runStart = null;
      if (j.frame) return;
      if (j.lost) modal('Verbindung während des Auftrags verloren', `<p>Die Verbindung ist abgebrochen, während „${esc(j.name)}“ lief (Zeile ${j.acked} von ${j.total}).</p><p><b>Bitte am Laser prüfen</b>, ob er noch brennt – im Zweifel Not-Aus oder Netzschalter. Danach neu verbinden und den Startpunkt prüfen.</p>`);
      else if (!j.aborted) { modal('Fertig', `<p>Auftrag „${esc(j.name)}“ abgeschlossen in ${LZ.fmtTime((Date.now() - j.start) / 1000)}.${j.errors ? ` <b>${j.errors} Fehlermeldung(en)</b> – siehe Konsole.` : ''}</p><p class="muted small">Material erst herausnehmen, wenn kein Rauch mehr aufsteigt.</p>`); }
    });
  }
  const fmt3 = (v) => (Math.round(v * 1000) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  function updConn() {
    const st = S.grbl ? S.grbl.status.state : 'Getrennt';
    const d = $('#connDot');
    d.className = !S.grbl || !S.grbl.connected ? '' : st === 'Alarm' ? 'alarm' : st === 'Run' || st === 'Jog' || st === 'Hold' ? 'run' : 'on';
    d.title = S.grbl && S.grbl.connected ? 'Laser: ' + st : 'Laser nicht verbunden';
  }
  function log(line, cls) {
    const c = $('#console');
    const div = document.createElement('div');
    div.className = cls || '';
    div.textContent = (cls === 'out' ? '> ' : '') + line;
    c.appendChild(div);
    while (c.childNodes.length > 400) c.removeChild(c.firstChild);
    c.scrollTop = c.scrollHeight;
  }
  const need = () => {
    if (!S.grbl || !S.grbl.connected) { status('Bitte zuerst den Laser verbinden.', true); return false; }
    return true;
  };
  // Laserposition (Arbeitskoordinaten) → Zeichnung
  function laserWorldPos() {
    const wp = S.grbl.status.wpos, st = S.runStart || S.doc.job.start, m = S.machine;
    const running = S.grbl.job && !S.grbl.job.frame;
    if (st === 'absolute') {
      const o = m.origin || 'll';
      return { x: o === 'ur' || o === 'lr' ? m.w - wp.x : wp.x, y: o === 'ul' || o === 'ur' ? m.h - wp.y : wp.y };
    }
    const b = (S.plan && S.plan.box) || boxOf(outputObjs()) || { x0: 0, y0: 0, x1: 0, y1: 0 };
    const [ax, ay] = LZ.ANCHORS[S.doc.job.anchor || 'll'];
    const A = { x: b.x0 + (b.x1 - b.x0) * ax, y: b.y0 + (b.y1 - b.y0) * ay };
    // „ab aktueller Position“: im Leerlauf steht der Laser per Definition am Bezugspunkt
    if (st === 'current' && !running && !(S.grbl.job && S.grbl.job.frame)) return A;
    return { x: A.x + wp.x, y: A.y + wp.y };
  }
  function moveLaserTo(p) {
    if (S.doc.job.start !== 'absolute') { status('Klick-zum-Fahren geht nur bei „Start: Arbeitsbereich (absolut)“.', true); return; }
    const q = LZ.mapper({ start: 'absolute' }, S.machine)(p);
    S.grbl.command(`G90 G0 X${q.x.toFixed(2)} Y${q.y.toFixed(2)}`).catch(() => {});
  }
  $('#mConnect').onclick = async () => {
    machineInit();
    if (S.grbl.connected) { if (S.grbl.job && !(await confirmBox('Trennen?', 'Ein Auftrag läuft. Wirklich trennen?', 'Trennen', true))) return; S.grbl.disconnect(); return; }
    connectDialog();
  };
  $('#mWifi').onclick = () => { machineInit(); wifiAssistant(); };
  $('#mCheck').onclick = () => { machineInit(); checkSettings(false); };

  async function connectDialog() {
    const env = FS.Grbl.env();
    const saved = Object.assign({ kind: 'usb', host: '', baud: 'auto' }, store.get('ls.conn', {}));
    let cfg = { enabled: false, host: '' };
    if (env.server) { try { const r = await fetch('/api/cnc/config', { headers: { 'X-Requested-With': 'StickStudio' } }); if (r.ok) cfg = await r.json(); } catch (e) { /* ohne Server */ } }
    const can = { usb: env.serial, bridge: env.server && cfg.enabled, ws: env.direct };
    const why = {
      usb: !env.secure ? 'Geht nicht auf unverschlüsselten (http://) Seiten – LaserStudio per Doppelklick oder über https öffnen.' : 'Nur in Chrome oder Edge am Computer.',
      bridge: 'Nur wenn LaserStudio über einen eigenen Server mit WLAN-Brücke geöffnet ist.',
      ws: 'Geht nicht von einer https-Seite aus.',
    };
    if (!can[saved.kind]) saved.kind = can.usb ? 'usb' : can.bridge ? 'bridge' : can.ws ? 'ws' : 'usb';
    if (!saved.host && cfg.host) saved.host = cfg.host;
    const row = (k, title, text) => `<label class="connopt ${can[k] ? '' : 'off'}"><input type="radio" name="ck" value="${k}" ${saved.kind === k ? 'checked' : ''} ${can[k] ? '' : 'disabled'}><span><b>${title}</b><br><span class="muted small">${can[k] ? text : esc(why[k])}</span></span></label>`;
    const html = `
      ${row('usb', 'USB-Kabel', 'Am sichersten. Laser per USB am Computer und eingeschaltet. Es erscheint eine Liste der Anschlüsse – den des Lasers wählen (oft „USB-SERIAL CH340“ oder „CP210x“).')}
      ${row('bridge', 'WLAN über den Server', 'Der eigene Server im Heimnetz verbindet sich per Telnet (Port 23) mit dem Laser. Not-Aus bei Verbindungsabbruch.')}
      ${row('ws', 'WLAN direkt (experimentell)', 'Für Laser mit ESP32-Steuerung (GRBL-ESP32 / FluidNC): direkt aus dem Browser per WebSocket.')}
      <div id="cnWifi" class="${saved.kind === 'usb' ? 'hidden' : ''}">
        ${field('IP-Adresse des Lasers', `<input id="cnHost" value="${esc(saved.host || '')}" placeholder="z. B. 192.168.1.50  (oder IP:Port)" autocomplete="off">`)}
      </div>
      <div id="cnUsb" class="${saved.kind === 'usb' ? '' : 'hidden'}">
        ${field('Baudrate', `<select id="cnBaud">${['auto', 115200, 250000, 921600, 57600, 9600].map((b) => `<option value="${b}" ${String(saved.baud) === String(b) ? 'selected' : ''}>${b === 'auto' ? 'automatisch erkennen' : b}</option>`).join('')}</select>`)}
      </div>
      <p class="muted small">Nur ein Programm kann den Laser gleichzeitig nutzen: LightBurn, LaserGRBL o. ä. vorher schließen. Laser mit eigener Firmware (Ruida, Trocen, xTool-Protokoll) sprechen kein GRBL – dafür G-Code bzw. SVG speichern und dort laden.</p>`;
    let pick = null;
    const r = await modal('Mit dem Laser verbinden', html, [
      { label: 'Abbrechen', value: null },
      { label: 'Verbinden', primary: true, value: 'go', onClick: () => {
        const kind = ($('input[name=ck]:checked') || {}).value;
        if (!kind) return false;
        pick = { kind, host: $('#cnHost') ? $('#cnHost').value.trim() : '', baud: $('#cnBaud') ? $('#cnBaud').value : 'auto' };
        if (kind !== 'usb' && !pick.host) { status('Bitte die IP-Adresse eintragen.', true); $('#cnHost').focus(); return false; }
      } },
    ], { wide: true, noFocus: true, onOpen: (b) => b.addEventListener('change', (e) => {
      if (e.target.name !== 'ck') return;
      $('#cnWifi').classList.toggle('hidden', e.target.value === 'usb');
      $('#cnUsb').classList.toggle('hidden', e.target.value !== 'usb');
    }) });
    if (r !== 'go' || !pick) return;
    store.set('ls.conn', pick);
    const busy = $('#busy'), bt = $('#busy span');
    busy.classList.remove('hidden');
    bt.textContent = pick.kind === 'usb' ? 'Anschluss wählen, dann Verbinden …' : 'Verbinde mit dem Laser …';
    try {
      const hp = /^(.+):(\d{1,5})$/.exec(pick.host);
      await S.grbl.connect(pick.kind === 'usb' ? { kind: 'usb', baud: pick.baud, first: S.machine.baud } : { kind: pick.kind, host: hp ? hp[1] : pick.host, port: hp ? +hp[2] : 23 });
    } catch (e) {
      busy.classList.add('hidden');
      if (e.cancelled && !e.html) return;
      modal('Verbindung fehlgeschlagen', `<p><b>${esc(e.message)}</b></p>${e.html || ''}<p class="muted small">Die Konsole unten zeigt weitere Meldungen.</p>`, [{ label: 'Nochmal versuchen', primary: true, value: 'again' }, { label: 'Schließen', value: 'x' }], { wide: true }).then((a) => { if (a === 'again') connectDialog(); });
      log('Verbindung fehlgeschlagen: ' + e.message, 'err');
      return;
    } finally { busy.classList.add('hidden'); }
  }

  async function wifiAssistant() {
    if (!S.grbl || !S.grbl.connected) {
      modal('WLAN des Lasers einrichten', `<p>Dazu den Laser bitte zuerst per <b>USB</b> verbinden („Verbinden …“ → USB-Kabel).</p><p class="muted small">Geht nur bei Steuerungen mit ESP32 (GRBL-ESP32, z. B. MKS DLC32). Alternativ am Display oder im Webbrowser der Steuerung einrichten.</p>`);
      return;
    }
    const html = `${field('Name des WLANs (SSID)', `<input id="wfS" autocomplete="off">`)}
      ${field('Passwort', `<input id="wfP" type="password" autocomplete="off">`)}
      <label class="check"><input type="checkbox" id="wfT" checked> Telnet einschalten (Port 23)</label>
      <label class="check"><input type="checkbox" id="wfR" checked> Danach neu starten</label>
      <p class="muted small">Gesendet werden die GRBL-ESP32-Einstellungen <code>$Radio/Mode=STA</code>, <code>$Sta/SSID</code>, <code>$Sta/Password</code>, <code>$Telnet/Enable=ON</code>. Kennt die Firmware sie nicht, meldet die Konsole „$-Befehl unbekannt“.</p>
      <div class="row"><button id="wfIp">IP-Adresse anzeigen</button></div><div id="wfOut" class="muted"></div>`;
    let wf = null;
    const r = await modal('WLAN des Lasers einrichten', html, [{ label: 'Schließen', value: null }, { label: 'Einrichten', primary: true, value: 'go', onClick: () => {
      const ssid = $('#wfS').value.trim(), pw = $('#wfP').value;
      if (!ssid) { status('Bitte den WLAN-Namen eintragen.', true); return false; }
      if (/[\r\n]/.test(ssid + pw)) { status('Name und Passwort dürfen keine Zeilenumbrüche enthalten.', true); return false; }
      wf = { ssid, pw, telnet: $('#wfT').checked, restart: $('#wfR').checked };
    } }], { noFocus: true, onOpen: (b) => {
      $('#wfIp', b).addEventListener('click', async (e) => {
        e.preventDefault();
        const out = $('#wfOut'); out.textContent = 'Frage den Laser …';
        const lines = await S.grbl.ask('[ESP111]');
        const ip = lines.join(' ').match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
        out.innerHTML = ip ? `IP-Adresse: <b>${esc(ip[0])}</b>` : (lines.length ? esc(lines.join(' · ')) : 'Keine Antwort – evtl. kennt die Firmware [ESP111] nicht. Schau in der Geräteliste deines Routers.');
      });
    } });
    if (r !== 'go' || !wf) return;
    const list = ['$Radio/Mode=STA', `$Sta/SSID=${wf.ssid}`, `$Sta/Password=${wf.pw}`];
    if (wf.telnet) list.push('$Telnet/Enable=ON');
    for (const c of list) {
      try { await S.grbl.command(c); } catch (e) { modal('WLAN einrichten fehlgeschlagen', `<p>Bei <code>${esc(c.startsWith('$Sta/Password') ? '$Sta/Password=…' : c)}</code> kam: <b>${esc(e.message)}</b></p>`); return; }
    }
    if (wf.restart) { S.grbl.command('$System/Control=RESTART').catch(() => {}); modal('WLAN eingerichtet', `<p>Der Laser startet neu und meldet sich im WLAN <b>${esc(wf.ssid)}</b> an. Danach per USB „WLAN“ → „IP-Adresse anzeigen“ oder im Router nachsehen.</p>`); }
  }

  /** $$ lesen: Lasermodus ($32), S-Max ($30), Verfahrwege ($130/$131), Höchstgeschwindigkeit ($110), Beschleunigung ($120) */
  async function checkSettings(auto) {
    if (!S.grbl || !S.grbl.connected) { if (!auto) need(); return; }
    const lines = await S.grbl.ask('$$', 3000);
    const v = {};
    for (const l of lines) { const m = /^\$(\d+)=([-\d.]+)/.exec(l); if (m) v[+m[1]] = +m[2]; }
    if (!Object.keys(v).length) { if (!auto) modal('Einstellungen', '<p>Die Steuerung hat keine $$-Liste geliefert (evtl. FluidNC oder läuft gerade ein Auftrag). Lasermodus und S-Max bitte im Handbuch der Steuerung prüfen.</p>'); return; }
    laserChecked = true;
    const m = S.machine, issues = [];
    if (v[32] !== undefined && v[32] !== 1) issues.push(`<li><b>Lasermodus ist aus</b> ($32=${v[32]}). Dann hält der Laser an jeder Ecke kurz an und brennt Punkte ein. <button id="ckLaser" class="primary">Lasermodus einschalten ($32=1)</button></li>`);
    if (v[30] !== undefined && v[30] !== m.sMax) issues.push(`<li>S-Max der Steuerung ist <b>${v[30]}</b>, eingestellt ist ${m.sMax}. Die Leistung stimmt sonst nicht. <button id="ckS">${v[30]} übernehmen</button></li>`);
    const tw = v[130], th = v[131];
    if (tw && th && (Math.abs(tw - m.w) > 1 || Math.abs(th - m.h) > 1)) issues.push(`<li>Verfahrweg laut Steuerung: <b>${tw} × ${th} mm</b> (eingestellt ${m.w} × ${m.h}). <button id="ckA">Übernehmen</button></li>`);
    if (v[110] && v[110] < m.maxSpeed) issues.push(`<li>Höchstgeschwindigkeit X laut Steuerung: <b>${v[110]} mm/min</b>. <button id="ckV">Übernehmen</button></li>`);
    if (!issues.length) { if (!auto) modal('Einstellungen geprüft', `<p>Alles passt: Lasermodus an${v[30] !== undefined ? `, S-Max ${v[30]}` : ''}${tw ? `, Arbeitsbereich ${tw} × ${th} mm` : ''}.</p>`); else log('Einstellungen geprüft: Lasermodus an.', 'info'); return; }
    modal('Einstellungen der Steuerung', `<ul>${issues.join('')}</ul><p class="muted small">Gelesen mit <code>$$</code>. Änderungen an der Steuerung bleiben gespeichert.</p>`, [{ label: 'Schließen', primary: true }], {
      wide: true, onOpen: (b) => b.addEventListener('click', async (e) => {
        const save = (p) => { const cur = store.get('ls.machine', { id: m.id }); store.set('ls.machine', Object.assign(cur, p)); loadMachine(); changed(); };
        if (e.target.id === 'ckLaser') { e.target.disabled = true; try { await S.grbl.command('$32=1'); e.target.textContent = 'Eingeschaltet ✓'; } catch (x) { e.target.textContent = 'Fehler: ' + x.message; } }
        if (e.target.id === 'ckS') { save({ sMax: v[30] }); e.target.textContent = 'Übernommen ✓'; e.target.disabled = true; }
        if (e.target.id === 'ckA') { save({ w: tw, h: th }); fit(); e.target.textContent = 'Übernommen ✓'; e.target.disabled = true; }
        if (e.target.id === 'ckV') { save({ maxSpeed: v[110], rapid: v[110] }); e.target.textContent = 'Übernommen ✓'; e.target.disabled = true; }
      }),
    });
  }

  $$('[data-zero]').forEach((b) => b.addEventListener('click', () => {
    if (!need()) return;
    const ax = b.dataset.zero.split('').map((a) => a + '0').join(' ');
    S.grbl.command('G10 L20 P1 ' + ax).then(() => status('Nullpunkt gesetzt: ' + ax)).catch(() => {});
  }));
  $('#mGoZero').onclick = () => { if (need()) S.grbl.command('G90 G0 X0 Y0').catch(() => {}); };
  $$('[data-jog]').forEach((b) => b.addEventListener('click', () => {
    if (!need()) return;
    const [dx, dy] = b.dataset.jog.split(',').map(Number);
    S.grbl.jog(dx * S.jogStep, dy * S.jogStep, 0, val('jogFeed') || 3000);
  }));
  $('#jogStop').onclick = () => S.grbl && S.grbl.jogCancel();
  $('#jogSteps').addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    S.jogStep = +b.dataset.step;
    $$('#jogSteps button').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('#mHome').onclick = () => need() && S.grbl.command('$H').catch(() => {});
  $('#mUnlock').onclick = () => need() && S.grbl.command('$X').catch(() => {});
  const sVal = (pct) => Math.round((util.clamp(pct, 0, 100) / 100) * S.machine.sMax);
  $('#mPointer').onclick = () => {
    if (!need()) return;
    pointerOn = !pointerOn;
    // im Lasermodus brennt M3 nur bei G1 – „G1 F…“ ohne Weg schaltet ihn ein, ohne zu fahren
    if (pointerOn) { S.grbl.command(`M3 S${Math.max(1, sVal(1))}`).then(() => S.grbl.command('G1 F1000')).catch(() => {}); status('Zielpunkt an (1 %). Nicht in den Strahl schauen – Schutzbrille!'); }
    else S.grbl.command('M5 S0').then(() => S.grbl.command('G0')).catch(() => {});
    $('#mPointer').classList.toggle('primary', pointerOn);
    redraw();
  };
  $('#mPulse').onclick = async () => {
    if (!need()) return;
    const p = util.clamp(val('mPulsePow') || 10, 1, 100);
    if (p > 20 && !(await confirmBox('Testpuls', `Testpuls mit ${p} % Leistung für 0,1 s abgeben?`, 'Puls'))) return;
    S.grbl.command(`M3 S${sVal(p)}`).then(() => S.grbl.command('G1 F1000')).then(() => S.grbl.command('G4 P0.1')).then(() => S.grbl.command('M5 S0')).then(() => S.grbl.command('G0')).catch(() => {});
  };

  // Start und Bezugspunkt
  $('#anchorPick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    S.doc.job.anchor = b.dataset.a;
    $$('#anchorPick button').forEach((x) => x.classList.toggle('active', x === b));
    changed();
  });
  $('#jobStart').onchange = (e) => { S.doc.job.start = e.target.value; renderLaserSide(); changed(); };
  function renderLaserSide() {
    $('#machName').textContent = S.machine.name;
    $('#jobStart').value = S.doc.job.start;
    $('#anchorPick').innerHTML = anchorPicker(S.doc.job.anchor);
    $('#anchorRow').classList.toggle('hidden', S.doc.job.start === 'absolute');
  }

  async function frame(kind) {
    if (!need()) return;
    if (S.grbl.job) { status('Es läuft schon ein Auftrag.', true); return; }
    const objs = outputObjs();
    if (!objs.length) { status('Nichts zum Umfahren.', true); return; }
    getPlan();
    let pts;
    if (kind === 'rect') { const b = boxOf(objs); pts = [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }]; }
    else pts = LZ.hull(objs.flatMap((o) => geom(o).flatMap((l) => l.pts.filter((_, i) => i % Math.max(1, Math.floor(l.pts.length / 200)) === 0))));
    const pw = $('#frameLaser').checked ? util.clamp(val('framePow'), 0, 10) : 0;
    const gc = LZ.frameGcode(pts, jobOpts(), S.machine, { power: pw, speed: Math.min(S.machine.maxSpeed, 3000) });
    S.runStart = S.doc.job.start;
    try { S.grbl.startJob(gc, 'Rahmen'); S.grbl.job.frame = true; } catch (e) { status(e.message, true); }
  }
  $('#frameRect').onclick = () => frame('rect');
  $('#frameHull').onclick = () => frame('hull');

  function setJob(text, name, plan) {
    S.job = { text, name, plan, moves: plan ? null : LZ.parseGcode(text, S.machine.sMax) };
    $('#jobName').textContent = name;
    $('#jobInfo').textContent = `${text.split('\n').filter((l) => l.trim()).length} Zeilen${plan ? ' · Laufzeit ≈ ' + LZ.fmtTime(plan.time.sec) : ''}`;
    if (S.mode === 'laser') redraw();
  }
  async function loadJobFile() {
    const f = await pickFile('.nc,.gcode,.gc,.tap,.ngc,.txt');
    if (f) setJob(f.data, f.name, null);
  }
  $('#jobFromFile').onclick = loadJobFile;
  $('#jobFromProject').onclick = async () => {
    const r = await buildGcode();
    if (!r) return;
    const w = checkPlan(r.pl);
    if (w.length) modal('Hinweise zum Auftrag', w.map((x) => `<div class="warnbox">${esc(x)}</div>`).join(''));
    setJob(r.text, S.doc.name || 'Projekt', r.pl);
  };
  $('#jobGo').onclick = async () => {
    if (!need()) return;
    if (!S.job) { status('Zuerst „Projekt senden“ oder eine Datei laden.', true); return; }
    if (S.grbl.job) { S.grbl.resumeJob(); return; }
    if (S.grbl.status.state === 'Alarm') { status('Der Laser ist im Alarm – zuerst entsperren.', true); return; }
    if (S.job.plan && S.job.plan !== S.plan) { status('Die Zeichnung wurde geändert – bitte „Projekt senden“ erneut drücken.', true); return; }
    const st = S.doc.job.start;
    const ok = await modal('Vor dem Start prüfen', `<ul>
      <li><b>Schutzbrille</b> für die Wellenlänge deines Lasers auf – auch Zuschauer.</li>
      <li>Fokus eingestellt (Fokusabstand zum Material)?</li>
      <li>Absaugung bzw. Lüftung an, Luftunterstützung bereit?</li>
      <li>Material liegt flach und ${st === 'absolute' ? 'an der richtigen Stelle (Rahmen fahren!)' : st === 'current' ? `der Laser steht über dem Bezugspunkt (${anchorText(S.doc.job.anchor)})` : `der Nullpunkt liegt am Bezugspunkt (${anchorText(S.doc.job.anchor)})`}?</li>
      <li>Feuerlöscher griffbereit, <b>nie unbeaufsichtigt lasern</b>.</li></ul>`,
    [{ label: 'Abbrechen', value: false }, { label: '▶ Jetzt lasern', primary: true, value: true }]);
    if (!ok) return;
    if (pointerOn) $('#mPointer').click();
    S.runStart = S.job.plan ? st : 'absolute';
    try { S.grbl.startJob(S.job.text, S.job.name); } catch (e) { status(e.message, true); }
  };
  $('#jobPause').onclick = () => {
    if (!S.grbl || !S.grbl.job) return;
    if (S.grbl.job.paused) S.grbl.resumeJob(); else S.grbl.pauseJob();
  };
  $('#jobStop').onclick = async () => {
    if (!S.grbl || !S.grbl.job) { if (S.grbl && S.grbl.connected) { S.grbl.realtime('!'); S.grbl.command('M5 S0').catch(() => {}); } return; }
    if (S.grbl.job.frame) { S.grbl.stopJob(true); return; }
    if (await confirmBox('Auftrag abbrechen?', 'Der Laser hält sofort an, schaltet ab und wird zurückgesetzt.', 'Abbrechen', true)) S.grbl.stopJob();
  };
  $$('[data-ov]').forEach((b) => b.addEventListener('click', () => {
    if (!need()) return;
    const map = { 'f-': '\x92', f0: '\x90', 'f+': '\x91', 's-': '\x9B', s0: '\x99', 's+': '\x9A' };
    S.grbl.realtime(map[b.dataset.ov]);
  }));
  function jobUi(j) {
    const bar = $('#jobBar');
    if (!j) { bar.style.width = '0'; $('#jobPause').textContent = '⏸ Pause'; $('#jobGo').disabled = false; updConn(); redraw(); return; }
    const frac = j.total ? j.acked / j.total : 0;
    bar.style.width = (100 * frac).toFixed(1) + '%';
    const el = (Date.now() - j.start) / 1000;
    const tot = S.job && S.job.plan ? S.job.plan.time.sec : 0;
    const eta = tot ? Math.max(0, tot * (1 - frac)) : frac > 0.02 ? (el / frac) * (1 - frac) : 0;
    if (!j.frame) $('#jobInfo').textContent = `${Math.round(frac * 100)} % · ${LZ.fmtTime(el)} vergangen${eta ? ' · noch ≈ ' + LZ.fmtTime(eta) : ''}${j.paused ? ' · Pause' : ''}`;
    $('#jobPause').textContent = j.paused ? '▶ Weiter' : '⏸ Pause';
    $('#jobGo').disabled = !j.paused;
    redraw();
  }
  $('#consoleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#consoleIn').value.trim();
    if (!v || !need()) return;
    if (v === '?' || v === '!' || v === '~') S.grbl.realtime(v); else S.grbl.command(v).catch(() => {});
    $('#consoleIn').value = '';
  });
  function drawLaser(x) {
    if (!S.job) return;
    const j = S.grbl && S.grbl.job && !S.grbl.job.frame ? S.grbl.job : null;
    if (S.job.plan) {
      const list = S.job.plan.moves;
      const done = j ? Math.floor((j.acked / Math.max(1, j.total)) * list.length) : 0;
      x.save(); x.globalAlpha = 0.55; paintMoves(x, list, 0, list.length, { rapid: false }); x.restore();
      if (done > 1) { x.save(); x.globalCompositeOperation = 'source-over'; paintMoves(x, list, 0, done, { rapid: false }); x.restore(); }
      return;
    }
    // geladene Datei: absolute Maschinenkoordinaten
    const mv = S.job.moves, m = S.machine, o = m.origin || 'll';
    const toW = (p) => ({ x: o === 'ur' || o === 'lr' ? m.w - p.x : p.x, y: o === 'ul' || o === 'ur' ? m.h - p.y : p.y });
    x.strokeStyle = 'rgba(55,32,14,.7)'; x.lineWidth = 1;
    x.beginPath();
    for (let i = 1; i < mv.length; i++) { if (mv[i].rapid || !mv[i].s) continue; const a = w2s(toW(mv[i - 1])), b = w2s(toW(mv[i])); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); }
    x.stroke();
  }

  // ---------------------------------------------------------------- Kamera
  function camVideo() {
    if (!cam.video) { cam.video = document.createElement('video'); cam.video.muted = true; cam.video.playsInline = true; }
    return cam.video;
  }
  async function camStart(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Dieser Browser erlaubt keinen Kamerazugriff. Bitte Chrome oder Edge verwenden.');
    camStop();
    const c = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    if (deviceId) c.deviceId = { ideal: deviceId };
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: c, audio: false });
    const v = camVideo();
    v.srcObject = cam.stream;
    await v.play();
    const tr = cam.stream.getVideoTracks()[0];
    const set = tr && tr.getSettings ? tr.getSettings() : {};
    if (set.deviceId) cam.cal.deviceId = set.deviceId;
  }
  function camStop() { if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop()); cam.stream = null; }
  function camFrame() {
    const v = cam.video;
    if (!v || !v.videoWidth) return null;
    const k = Math.min(1, 1600 / v.videoWidth);
    const w = Math.round(v.videoWidth * k), h = Math.round(v.videoHeight * k);
    if (!cam.fc) cam.fc = document.createElement('canvas');
    cam.fc.width = w; cam.fc.height = h;
    const x = cam.fc.getContext('2d', { willReadFrequently: true });
    x.drawImage(v, 0, 0, w, h);
    return { data: x.getImageData(0, 0, w, h).data, w, h };
  }
  const camAspect = () => (cam.video && cam.video.videoWidth ? cam.video.videoWidth / cam.video.videoHeight : 16 / 9);
  const camPts = (raw, k1) => raw.map((p) => FS.camera.undistort(p, k1, camAspect()));
  const calOk = () => cam.cal.world && cam.cal.img && cam.cal.img.length === 4;
  // Lage des Materials über der Ausrichtungsebene: Materialstärke (bei Ausrichtung auf der Auflage)
  const camLift = () => {
    const w = cam.cal.world;
    const c = { x: w.reduce((s, p) => s + p.x, 0) / 4, y: w.reduce((s, p) => s + p.y, 0) / 4 };
    return S.doc.thick > 0 ? { c, camH: cam.cal.camH || 400, t: S.doc.thick - (cam.cal.alignH || 0) } : null;
  };
  /** Kamerabild auf den Arbeitsbereich entzerren; area optional (Ausschnitt) */
  function camWarp(res, area) {
    const fr = camFrame();
    if (!fr || !calOk()) return null;
    const m = S.machine;
    return FS.camera.warpArea(fr, cam.cal.world, camPts(cam.cal.img, cam.cal.k1), area || { x0: 0, y0: 0, w: m.w, h: m.h }, res, cam.cal.k1, camLift());
  }
  function camUpdate() {
    if (!cam.on || !calOk()) return;
    const m = S.machine;
    const w = camWarp(Math.min(3, 1000 / Math.max(m.w, m.h)));
    if (!w) return;
    if (!cam.img) cam.img = document.createElement('canvas');
    cam.img.width = w.w; cam.img.height = w.h;
    cam.img.getContext('2d').putImageData(new ImageData(w.data, w.w, w.h), 0, 0);
    redraw();
  }
  function camLoop() {
    clearInterval(cam.timer);
    cam.timer = null;
    if (cam.on && cam.cal.live) cam.timer = setInterval(() => { if (S.mode !== 'preview' && $('#modal').classList.contains('hidden')) camUpdate(); }, 600);
  }
  async function camShow(on) {
    if (on && !calOk()) { cameraDialog(); return; }
    cam.on = on;
    $('#camBar').classList.toggle('hidden', !on);
    if (on) {
      if (!cam.stream) {
        try { await camStart(cam.cal.deviceId); } catch (e) { cam.on = false; $('#camBar').classList.add('hidden'); modal('Kamera nicht verfügbar', `<p>${esc(e.message)}</p>`); return; }
      }
      $('#camOpacity').value = Math.round(cam.cal.opacity * 100);
      $('#camLive').checked = cam.cal.live;
      setTimeout(camUpdate, 400);
      camLoop();
    } else { clearInterval(cam.timer); camStop(); cam.img = null; redraw(); }
  }
  const saveCam = () => store.set('ls.cam', cam.cal);
  $('#camOpacity').addEventListener('input', (e) => { cam.cal.opacity = e.target.value / 100; saveCam(); redraw(); });
  $('#camLive').addEventListener('change', (e) => { cam.cal.live = e.target.checked; saveCam(); camLoop(); camUpdate(); });
  $('#camShot').onclick = () => camUpdate();

  const markPoints = (inset) => { const m = S.machine; return [{ x: inset, y: inset }, { x: m.w - inset, y: inset }, { x: m.w - inset, y: m.h - inset }, { x: inset, y: m.h - inset }]; };
  async function cameraDialog() {
    try { await camStart(cam.cal.deviceId); } catch (e) {
      modal('Kamera nicht verfügbar', `<p>${esc(e.message)}</p><p>Tipps: USB-Kamera anschließen, im Browser den Kamerazugriff erlauben (Schloss-Symbol neben der Adresse) und andere Programme schließen, die die Kamera benutzen (auch LightBurn).</p>`);
      return;
    }
    let devices = [];
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (e) { /* ohne Liste */ }
    const m = S.machine;
    let world = cam.cal.world ? cam.cal.world.map((p) => ({ ...p })) : markPoints(30);
    let raw = cam.cal.img ? cam.cal.img.map((p) => ({ ...p })) : [];
    let k1 = cam.cal.k1 || 0, open = true, dragI = -1;
    const worldTable = () => world.map((p, i) => `<tr><td>${i + 1}</td><td><input class="cmWX" data-i="${i}" type="number" step="0.5" value="${p.x}"></td><td><input class="cmWY" data-i="${i}" type="number" step="0.5" value="${p.y}"></td></tr>`).join('');
    const html = `${devices.length > 1 ? field('Kamera', `<select id="cmDev">${devices.map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === cam.cal.deviceId ? 'selected' : ''}>${esc(d.label || 'Kamera ' + (i + 1))}</option>`).join('')}</select>`) : ''}
      <div class="camstep" id="cmStep"></div>
      <div class="camwrap" id="cmWrap"><canvas id="cmOver"></canvas></div>
      <div class="grid2">${field('Linsenkorrektur', `<input id="cmK" type="range" min="-0.5" max="0.5" step="0.01" value="${k1}">`)}${field('Deckkraft', `<input id="cmO" type="range" min="10" max="100" value="${Math.round(cam.cal.opacity * 100)}">`)}</div>
      <details ${cam.cal.world ? '' : 'open'}><summary><b>So geht das Ausrichten</b> (wie in LightBurn, aber ohne Neu-Ausrichten bei anderem Material)</summary>
        <ol class="small">
          <li>Kamera fest über dem Laser montieren (Deckel oder Gestell), so dass sie den ganzen Arbeitsbereich sieht.</li>
          <li>Ein Stück Pappe oder Sperrholz flach auf die Auflage legen und <b>„Marken brennen“</b>: Der Laser brennt 4 Kreuze an bekannten Stellen.</li>
          <li>Im Kamerabild die 4 Kreuzmitten in der Reihenfolge 1–4 anklicken (Punkte lassen sich ziehen). Das blaue Raster muss auf den Kreuzen liegen – sind die Linien gebogen, die <b>Linsenkorrektur</b> verstellen.</li>
          <li>Kamerahöhe eintragen. Danach stimmt das Bild auch bei dickerem Material: Die Materialstärke steht unten in der Leiste.</li>
        </ol></details>
      <div class="grid2">
        ${field('Kamerahöhe über der Auflage', inputN('cmH', cam.cal.camH || 400, 5, 'min="50"'), 'mm')}
        ${field('Dicke der Pappe beim Ausrichten', inputN('cmAH', cam.cal.alignH || 0, 0.5, 'min="0"'), 'mm')}
        ${field('Abstand der Marken vom Rand', inputN('cmIn', 30, 5, 'min="5"'), 'mm')}
        ${field('Leistung Marken', inputN('cmMP', 30, 5, 'min="1" max="100"'), '%')}
      </div>
      <div class="row"><button id="cmBurn" class="primary">Marken brennen</button><button id="cmMarks">Marken-Positionen setzen</button><button id="cmCorners">Ecken des Arbeitsbereichs</button><button id="cmReset">Punkte neu anklicken</button></div>
      <details><summary class="muted small">Bezugspunkte von Hand (mm)</summary><table class="ptable"><thead><tr><th></th><th>X</th><th>Y</th></tr></thead><tbody id="cmWorld">${worldTable()}</tbody></table></details>`;
    const toCanvas = (p, c) => ({ x: p.x * c.width, y: p.y * c.height });
    const overlay = () => {
      const c = $('#cmOver');
      if (!open || !c) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(c.clientWidth * dpr)) { c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr); }
      const x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      if (raw.length === 4) {
        const H = FS.camera.homography(world, camPts(raw, k1));
        if (H) {
          const P = (mx, my) => { const q = FS.camera.applyH(H, { x: mx, y: my }); const d = FS.camera.distort(q.x, q.y, k1, camAspect()); return toCanvas(d, c); };
          x.strokeStyle = 'rgba(80,200,255,.85)'; x.lineWidth = 1.2 * dpr;
          const line = (a, b, n = 40) => { x.beginPath(); for (let i = 0; i <= n; i++) { const t = i / n, p = P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); } x.stroke(); };
          const step = Math.max(m.w, m.h) > 500 ? 100 : 50;
          for (let gx = 0; gx <= m.w + 1e-6; gx += step) line({ x: gx, y: 0 }, { x: gx, y: m.h });
          for (let gy = 0; gy <= m.h + 1e-6; gy += step) line({ x: 0, y: gy }, { x: m.w, y: gy });
          x.strokeStyle = '#ffd43b'; x.lineWidth = 2.5 * dpr;
          line({ x: 0, y: 0 }, { x: m.w, y: 0 }); line({ x: m.w, y: 0 }, { x: m.w, y: m.h }); line({ x: m.w, y: m.h }, { x: 0, y: m.h }); line({ x: 0, y: m.h }, { x: 0, y: 0 });
          // erwartete Kreuze
          x.strokeStyle = '#51cf66'; x.lineWidth = 1.5 * dpr;
          for (const w of world) { line({ x: w.x - 6, y: w.y }, { x: w.x + 6, y: w.y }, 2); line({ x: w.x, y: w.y - 6 }, { x: w.x, y: w.y + 6 }, 2); }
        }
      }
      raw.forEach((p, i) => {
        const q = toCanvas(p, c);
        x.strokeStyle = '#fff'; x.lineWidth = 2 * dpr;
        x.beginPath(); x.moveTo(q.x - 9 * dpr, q.y); x.lineTo(q.x + 9 * dpr, q.y); x.moveTo(q.x, q.y - 9 * dpr); x.lineTo(q.x, q.y + 9 * dpr); x.stroke();
        x.strokeStyle = '#e8590c'; x.lineWidth = 1 * dpr; x.stroke();
        x.fillStyle = '#fff'; x.font = `bold ${12 * dpr}px system-ui`; x.fillText(String(i + 1), q.x + 10 * dpr, q.y - 8 * dpr);
      });
      const names = world.map((p) => `X ${fmt(p.x)} / Y ${fmt(p.y)}`);
      $('#cmStep').textContent = raw.length < 4 ? `Klicke Punkt ${raw.length + 1} von 4 an: Kreuz bei ${names[raw.length]} mm (1 = vorne links, 2 = vorne rechts, 3 = hinten rechts, 4 = hinten links)` : 'Ausgerichtet – Punkte bei Bedarf verschieben. Das Raster sollte auf dem Arbeitsbereich liegen.';
      requestAnimationFrame(overlay);
    };
    const r = await modal('Kamera einrichten', html, [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen und einblenden', primary: true, value: 'ok' }], {
      wide: true, noFocus: true,
      onOpen: (body) => {
        const wrap = $('#cmWrap', body), c = $('#cmOver', body);
        wrap.insertBefore(camVideo(), c);
        const pos = (e) => { const r2 = c.getBoundingClientRect(); return { x: (e.clientX - r2.left) / r2.width, y: (e.clientY - r2.top) / r2.height }; };
        c.addEventListener('pointerdown', (e) => {
          const p = pos(e), r2 = c.getBoundingClientRect();
          dragI = raw.findIndex((q) => Math.hypot((q.x - p.x) * r2.width, (q.y - p.y) * r2.height) < 14);
          if (dragI < 0 && raw.length < 4) raw.push(p);
          if (dragI >= 0) c.setPointerCapture(e.pointerId);
        });
        c.addEventListener('pointermove', (e) => { if (dragI >= 0) raw[dragI] = pos(e); });
        c.addEventListener('pointerup', () => { dragI = -1; });
        $('#cmReset', body).onclick = () => { raw = []; };
        $('#cmK', body).oninput = (e) => { k1 = +e.target.value; };
        $('#cmMarks', body).onclick = () => { world = markPoints(Math.max(5, val('cmIn'))); $('#cmWorld').innerHTML = worldTable(); };
        $('#cmCorners', body).onclick = () => { world = markPoints(0); $('#cmWorld').innerHTML = worldTable(); };
        $('#cmWorld', body).addEventListener('change', (e) => { const i = +e.target.dataset.i; if (e.target.classList.contains('cmWX')) world[i].x = num(e.target.value); else world[i].y = num(e.target.value); });
        $('#cmBurn', body).onclick = () => {
          if (!S.grbl || !S.grbl.connected) { status('Zum Brennen zuerst den Laser verbinden (Schritt 3 „Lasern“). Oder die Kreuze selbst lasern: Marken-Positionen = Abstand vom Rand.', true); return; }
          world = markPoints(Math.max(5, val('cmIn')));
          $('#cmWorld').innerHTML = worldTable();
          const mk = LZ.alignMarks(world, 12);
          mk.layers[0].power = util.clamp(val('cmMP'), 1, 100);
          const pl = LZ.plan({ objects: mk.objects, layers: mk.layers });
          const gc = LZ.gcode(pl, { layers: mk.layers }, { start: 'absolute', name: 'Kamera-Marken' }, S.machine);
          S.runStart = 'absolute';
          try { S.grbl.startJob(gc, 'Kamera-Marken'); status('Marken werden gebrannt … danach im Bild anklicken.'); } catch (e) { status(e.message, true); }
        };
        const dev = $('#cmDev', body);
        if (dev) dev.onchange = async () => { try { await camStart(dev.value); } catch (e) { status(e.message, true); } };
        overlay();
      },
    });
    open = false;
    if (r !== 'ok' || raw.length < 4) { if (!cam.on) camStop(); if (r === 'ok') status('Bitte alle 4 Punkte anklicken.', true); return; }
    Object.assign(cam.cal, { world, img: raw, k1, opacity: val('cmO') / 100 || cam.cal.opacity, camH: Math.max(50, val('cmH')), alignH: Math.max(0, val('cmAH')) });
    saveCam();
    cam.on = false;
    camShow(true);
    status('Kamera ausgerichtet. Materialstärke unten rechts prüfen – davon hängt die genaue Lage im Bild ab.');
  }

  async function needCam() {
    if (!calOk()) { cameraDialog(); return false; }
    if (!cam.stream) { try { await camStart(cam.cal.deviceId); await new Promise((r) => setTimeout(r, 500)); } catch (e) { modal('Kamera nicht verfügbar', `<p>${esc(e.message)}</p>`); return false; } }
    return true;
  }
  // Umriss eines Teils auf der Auflage aus dem Kamerabild erkennen (z. B. um ein vorhandenes Werkstück auszuschneiden oder zu umranden)
  async function camTrace() {
    if (!(await needCam())) return;
    const m = S.machine, res = Math.min(4, 1200 / Math.max(m.w, m.h));
    const w = camWarp(res);
    if (!w) { status('Kein Kamerabild.', true); return; }
    const c = document.createElement('canvas'); c.width = w.w; c.height = w.h;
    c.getContext('2d').putImageData(new ImageData(w.data, w.w, w.h), 0, 0);
    // Durchsichtiges (außerhalb des Kamerabildes) als weiß werten
    const px = { w: w.w, h: w.h, data: w.data };
    traceDialog(px, c, 'Kamera-Umriss', m.w, { area: { x0: 0, y0: 0 } });
  }
  async function camSnapshot() {
    if (!(await needCam())) return;
    const m = S.machine, res = Math.min(5, 2000 / Math.max(m.w, m.h));
    const w = camWarp(res);
    if (!w) { status('Kein Kamerabild.', true); return; }
    const c = document.createElement('canvas'); c.width = w.w; c.height = w.h;
    c.getContext('2d').putImageData(new ImageData(w.data, w.w, w.h), 0, 0);
    // eigene, ausgeschaltete Ebene: das Kamerabild dient nur als Vorlage
    let l = S.doc.layers.find((q) => q.name === 'Kamerabild');
    if (!l) {
      const free = LZ.COLORS.slice().reverse().find((col) => !S.doc.layers.some((q) => q.color === col)) || LZ.COLORS[11];
      l = LZ.makeLayer(free, { mode: 'image', name: 'Kamerabild', output: false, air: false });
      S.doc.layers.push(l);
    }
    l.output = false;
    addImageFromSource(c, 'Kamerabild', m.w, { x: m.w / 2, y: m.h / 2 }, l);
    status('Kamerabild liegt als Bild im Arbeitsbereich (Ebene ist ausgeschaltet, wird also nicht gelasert). Zum Nachzeichnen: Werkzeuge → Ausgewähltes Bild nachzeichnen.');
  }
  cmds.camera = cameraDialog;
  cmds.toggleCam = () => camShow(!cam.on);
  cmds.camTrace = camTrace;
  cmds.camSnapshot = camSnapshot;

  // Materialstärke in der Statusleiste (für Kamera-Höhenausgleich und als Hinweis zum Fokus)
  {
    const sp = document.createElement('span');
    sp.innerHTML = 'Material <input id="thick" type="number" step="0.5" min="0" style="width:52px"> mm';
    sp.title = 'Materialstärke – damit das Kamerabild auch bei dickem Material genau passt';
    $('#snapInfo').before(sp);
    $('#thick').addEventListener('change', (e) => { S.doc.thick = Math.max(0, num(e.target.value)); changed(); camUpdate(); });
  }

  // Dateien auf das Fenster ziehen
  {
    const stage = $('#stage');
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    stage.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; $('#dropHint').classList.remove('hidden'); });
    stage.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    stage.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('#dropHint').classList.add('hidden'); } });
    stage.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      $('#dropHint').classList.add('hidden');
      const file = e.dataTransfer.files[0];
      if (file) openDropped(file);
    });
  }

  // ---------------------------------------------------------------- Modi
  function setMode(m) {
    if (S.mode === m) { renderSide(); return; }
    if (S.draw && S.draw.kind === 'line' && S.draw.nodes.length > 1) finishLine(false);
    S.draw = null;
    S.mode = m;
    $$('#modes button').forEach((b) => b.classList.toggle('active', b.dataset.mode === m));
    $$('.pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== m));
    $('#toolbox').classList.toggle('hidden', m !== 'design');
    $('#palette').classList.toggle('hidden', m !== 'design');
    pv.playing = false; $('#pvPlay').textContent = '▶ Abspielen';
    if (m === 'design') hint(TOOL_HINTS[S.tool]);
    if (m === 'preview') { hint(''); enterPreview(); }
    if (m === 'laser') { hint('Alt + Klick in die Zeichnung fährt den Laser dorthin (bei „Start: Arbeitsbereich“).'); machineInit(); }
    renderSide();
    requestAnimationFrame(() => redraw());
  }
  $$('#modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-mode-go]');
    if (go) { setMode(go.dataset.modeGo); return; }
    const c = e.target.closest('[data-cmd]');
    if (c && cmds[c.dataset.cmd]) { $$('.menu').forEach((m) => m.classList.remove('open')); cmds[c.dataset.cmd](); return; }
    const t = e.target.closest('[data-tool]');
    if (t) { setTool(t.dataset.tool); return; }
    const mb = e.target.closest('.menu > button');
    $$('.menu').forEach((m) => { if (!mb || m !== mb.parentElement) m.classList.remove('open'); });
    if (mb) mb.parentElement.classList.toggle('open');
  });
  $$('.menu > button').forEach((b) => b.addEventListener('mouseenter', () => {
    if ($$('.menu.open').length && !b.parentElement.classList.contains('open')) { $$('.menu').forEach((m) => m.classList.remove('open')); b.parentElement.classList.add('open'); }
  }));

  // ---------------------------------------------------------------- Tastatur
  document.addEventListener('keydown', (e) => {
    if (!$('#modal').classList.contains('hidden')) return;
    const tag = e.target.tagName;
    if (e.key === ' ' && overCanvas && tag !== 'TEXTAREA' && !(tag === 'INPUT' && e.target.type === 'text') && !(S.mode === 'design' && S.tool === 'node' && S.nodeSel)) {
      e.preventDefault();
      if (!spaceDown) setSpace(true);
      return;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl) {
      const map = { z: 'undo', y: 'redo', c: 'copy', v: 'paste', d: 'duplicate', a: 'selectAll', s: 'save', o: 'open', e: 'exportGcode', i: 'importVector', n: 'new' };
      const c = map[k.toLowerCase()];
      if (c) { e.preventDefault(); if (k.toLowerCase() === 'z' && e.shiftKey) redo(); else cmds[c](); }
      return;
    }
    if (k === 'F1') { e.preventDefault(); helpDialog(); return; }
    if (['1', '2', '3'].includes(k) && !(S.draw && S.draw.kind === 'line')) { setMode(['design', 'preview', 'laser'][+k - 1]); return; }
    if (k === ' ' && S.mode !== 'design') { e.preventDefault(); if (!spaceDown) setSpace(true); return; }
    if (S.mode === 'laser') {
      const jog = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
      if (jog && S.grbl && S.grbl.connected && !S.grbl.job) { e.preventDefault(); S.grbl.jog(jog[0] * S.jogStep, jog[1] * S.jogStep, 0, val('jogFeed') || 3000); }
      if (k === 'f' || k === 'F') fit();
      if (k === 'c' || k === 'C') cmds.toggleCam();
      return;
    }
    if (S.mode === 'preview') {
      if (k === 'f' || k === 'F') fit();
      if (k === '+') cmds.zoomIn();
      if (k === '-') cmds.zoomOut();
      return;
    }
    if (k === ' ') {
      e.preventDefault();
      if (S.tool === 'node' && S.nodeSel) { const o = objById(S.nodeSel.id); snapshot(); o.nodes[S.nodeSel.i].c = !o.nodes[S.nodeSel.i].c; touch(o); changed(); }
      else if (!spaceDown) setSpace(true);
      return;
    }
    if (k === 'Escape') {
      if (S.draw) { S.draw = null; redraw(); return; }
      if (S.tool !== 'select') setTool('select'); else { S.sel = []; renderSide(); redraw(); }
      return;
    }
    if (k === 'Enter' && S.draw && S.draw.kind === 'line') { finishLine(false); return; }
    if (k === 'Backspace' && S.draw && S.draw.kind === 'line') { e.preventDefault(); S.draw.nodes.pop(); if (!S.draw.nodes.length) S.draw = null; redraw(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); cmds.delete(); return; }
    if (k === 'f' || k === 'F') { fit(); return; }
    if (k === 'c' || k === 'C') { cmds.toggleCam(); return; }
    if (k === '+') { cmds.zoomIn(); return; }
    if (k === '-') { cmds.zoomOut(); return; }
    if (k.startsWith('Arrow') && S.sel.length) {
      e.preventDefault();
      const st = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[k];
      snapshot();
      for (const o of selObjs()) translateObj(o, d[0], d[1]);
      changed();
      return;
    }
    const tools = { v: 'select', r: 'node', l: 'line', q: 'rect', k: 'ellipse', p: 'polygon', s: 'star', t: 'text', m: 'measure' };
    if (tools[k.toLowerCase()]) { setTool(tools[k.toLowerCase()]); return; }
    if (k === 'g' || k === 'G') cmds.toggleSnap();
  });
  document.addEventListener('keyup', (e) => { if (e.key === ' ' && spaceDown) { e.preventDefault(); setSpace(false); } });
  window.addEventListener('blur', () => { if (spaceDown) setSpace(false); });

  // ---------------------------------------------------------------- Hilfe
  function helpDialog() {
    modal('Kurzanleitung', `
      <div class="welcome three">
        <div><i>1</i><b>Entwerfen</b>Zeichnen, Text, SVG/DXF/Bilder. Farbe oben = Ebene mit eigener Leistung und Geschwindigkeit.</div>
        <div><i>2</i><b>Vorschau</b>So brennt es: abspielen, Laufzeit, Warnungen.</div>
        <div><i>3</i><b>Lasern</b>Verbinden, Rahmen fahren, starten – oder G-Code speichern.</div>
      </div>
      <table class="help">
        <tr><td>Farbe oben anklicken</td><td>Auswahl in diese Ebene legen · ohne Auswahl: neue Objekte kommen dorthin</td></tr>
        <tr><td>Ebene: Linie / Füllen / Versatz / Bild</td><td>Schneiden bzw. Ritzen · Flächen gravieren · Umrisslinien nach innen · Fotos</td></tr>
        <tr><td>Doppelklick</td><td>Text bearbeiten · Bild einstellen (Rastermodus) · Ebene: alle Objekte darin wählen</td></tr>
        <tr><td>Linksklick / Rechtsklick</td><td>Linienwerkzeug: Eckpunkt / Kurvenpunkt</td></tr>
        <tr><td>V R L Q K P S T M</td><td>Auswahl, Umformen, Linie, Rechteck, Kreis, Vieleck, Stern, Text, Messen</td></tr>
        <tr><td>Pfeiltasten</td><td>Verschieben 1 mm (Umschalt 10 mm, Alt 0,1 mm) · in „Lasern“: Laser verfahren</td></tr>
        <tr><td>Leertaste halten / zwei Finger</td><td>Ansicht verschieben · Strg + Rad oder Spreizen = Zoom</td></tr>
        <tr><td>F · G · C</td><td>Alles zeigen · Raster fangen · Kamerabild ein/aus</td></tr>
        <tr><td>Alt + Klick (Lasern)</td><td>Laser an diese Stelle fahren</td></tr>
        <tr><td>1 2 3</td><td>Arbeitsschritt wechseln</td></tr>
        <tr><td>Strg+Z/Y/C/V/D/A/S/O/E/I</td><td>Rückgängig, Wiederholen, Kopieren, Einfügen, Duplizieren, Alles, Speichern, Öffnen, G-Code, Importieren</td></tr>
      </table>`, [{ label: 'Tipps zum Lasern', value: 'tips' }, { label: 'Schließen', primary: true }], { wide: true }).then((r) => { if (r === 'tips') tipsDialog(); });
  }
  function tipsDialog() {
    modal('Tipps zum Lasern', `<ul>
      <li><b>Erst testen:</b> Werkzeuge → Materialtest. Das Feld mit dem schönsten Ergebnis zeigt Leistung und Geschwindigkeit für die Ebene.</li>
      <li><b>Schneiden:</b> Ebene „Linie“, langsam mit hoher Leistung, lieber 2–3 Durchgänge als einen sehr langsamen. Luftunterstützung an, Wabenbett oder Abstandshalter unterlegen. Bei dickem Holz „Z je Durchgang“ nutzen, wenn der Laser eine Z-Achse hat.</li>
      <li><b>Teile, die nicht herausfallen sollen:</b> „Stege“ an der Ebene einstellen (z. B. 4 Stege à 0,6 mm).</li>
      <li><b>Passgenau (Steckverbindungen, Einlagen):</b> „Spalt“ = Breite des Schnitts (meist 0,1–0,2 mm). Außenkonturen werden um die Hälfte größer, Löcher kleiner.</li>
      <li><b>Gravieren:</b> Ebene „Füllen“, Zeilenabstand 0,08–0,12 mm. Überfahrt verhindert dunkle Ränder. Kreuzschraffur für gleichmäßige, dunkle Flächen.</li>
      <li><b>Fotos:</b> Rastermodus „Jarvis“ oder „Stucki“, 0,1 mm (254 DPI) für Holz. Helle Hölzer (Ahorn, Pappel) sind am schönsten. Bei Schiefer und eloxiertem Alu das Bild <b>umkehren</b>.</li>
      <li><b>Reihenfolge:</b> Ebenen oben in der Liste werden zuerst gelasert – also erst gravieren, dann schneiden (▲ verschiebt).</li>
      <li><b>Lasermodus:</b> GRBL braucht <code>$32=1</code>, sonst brennt der Laser an jeder Ecke Punkte ein. „Prüfen“ im Schritt Lasern stellt das ein.</li>
      <li><b>Kamera:</b> Einmal mit Marken ausrichten. Danach nur noch die Materialstärke unten eintragen – das Bild passt dann auch bei dickem Material.</li>
      <li><b>Sicherheit:</b> Schutzbrille für die Wellenlänge, nie unbeaufsichtigt, Feuerlöscher griffbereit. Kein PVC/Vinyl lasern (giftiges Chlorgas).</li>
    </ul>`, [{ label: 'Schließen', primary: true }], { wide: true });
  }
  function aboutDialog() {
    modal('Über LaserStudio', `<p><b>LaserStudio</b>: Entwerfen, Vorschau und Lasern in einem Programm, im Browser, ohne Installation. Für GRBL-Laser (Diodenlaser, CO2 mit GRBL-Steuerung).</p>
      <p class="small">Ideen übernommen aus LightBurn (Ebenen nach Farbe, Materialtest, Kamera, Rahmen, Startpositionen), LaserGRBL (Rastermodi, Lasersteuerung), xTool Creative Space (Materialbibliothek, Umriss aus dem Kamerabild) und Rayforge (Schnittspalt, Wegoptimierung). Der Programmcode ist eigenständig geschrieben.</p>
      <p class="small muted">Polygonberechnung: Clipper von Angus Johnson (Boost Software License). Schriften: SIL Open Font License (siehe js/lib/LIZENZEN.txt).</p>
      <p class="small warnbox">Lasern ist gefährlich: Augenschäden, Brand, giftige Dämpfe. Schutzbrille tragen und nie unbeaufsichtigt lasern.</p>`);
  }
  function welcomeDialog() {
    modal('Willkommen bei LaserStudio', `<p>Zeichnen, Bilder vorbereiten und direkt lasern – mit Kamera, Materialtest und Materialbibliothek.</p>
      <div class="welcome three">
        <div><i>1</i><b>Entwerfen</b>Formen, Text im Bogen, SVG/DXF, Fotos. Farben = Ebenen.</div>
        <div><i>2</i><b>Vorschau</b>Sehen, was gebrannt wird, mit Laufzeit</div>
        <div><i>3</i><b>Lasern</b>GRBL-Laser per USB oder WLAN, Rahmen, Kamera</div>
      </div>
      <p class="small muted">Zuerst unter <b>Bearbeiten → Maschine</b> deinen Laser einstellen (Größe, Leistung).</p>`,
    [{ label: 'Maschine einstellen', value: 'mach' }, { label: 'Beispiel ansehen', value: 'ex' }, { label: 'Leeres Projekt', primary: true, value: 'new' }], { wide: true }).then((r) => {
      store.set('ls.welcomed', true);
      if (r === 'ex') loadExample();
      if (r === 'mach') machineSettings();
    });
  }

  // Beispiel: Untersetzer mit Text im Bogen (gravieren), Stern (füllen), Ausschneiden mit Stegen
  function loadExample() {
    const d = newDoc();
    d.name = 'Beispiel Untersetzer';
    const m = S.machine, cx = m.w / 2, cy = m.h / 2;
    const cut = d.layers[0];
    Object.assign(cut, { name: 'Ausschneiden', speed: 300, power: 100, passes: 2, tabs: 3, tabSize: 0.6 });
    const fill = LZ.makeLayer(LZ.COLORS[1], { mode: 'fill', name: 'Gravur', speed: 3000, power: 40, interval: 0.1 });
    const score = LZ.makeLayer(LZ.COLORS[2], { mode: 'line', name: 'Ritzen', speed: 1500, power: 40, air: false });
    d.layers = [fill, score, cut];
    const disk = SH.make('ellipse', { name: 'Untersetzer', rx: 45, ry: 45, layer: cut.id }); disk.tf = M.translate(cx, cy);
    const ring = SH.make('ellipse', { name: 'Zierring', rx: 41, ry: 41, layer: score.id }); ring.tf = M.translate(cx, cy);
    const star = SH.make('star', { name: 'Stern', n: 5, r: 14, inner: 0.45, layer: fill.id }); star.tf = M.translate(cx, cy - 4);
    const txt = SH.make('text', { name: 'Text: Werkstatt', text: 'WERKSTATT', font: 'Bebas Neue', size: 11, align: 'center', spacing: 0.6, lineHeight: 1.2, arc: 30, layer: fill.id });
    const tb = geo.bounds(SH.lines(txt).map((l) => l.pts));
    txt.tf = M.translate(cx - (tb.x0 + tb.x1) / 2, cy + 16 - tb.y0);
    d.objects.push(disk, ring, star, txt);
    S.doc = d; S.sel = []; S.undo = []; S.redo = []; S.selLayer = fill.id;
    changed(); fit();
    setMode('design');
    status('Beispiel geladen. Taste 2 zeigt die Vorschau.');
  }

  // ---------------------------------------------------------------- Start
  const th = store.get('ls.theme', null);
  if (th) document.documentElement.dataset.theme = th;
  readColors();
  const saved = store.get('ls.doc', null);
  if (saved && saved.objects && saved.layers) {
    try { S.doc = revive(JSON.stringify(saved)); S.doc.job = S.doc.job || { start: 'absolute', anchor: 'll' }; } catch (e) { S.doc = newDoc(); }
  }
  $('#thick').value = S.doc.thick || 0;
  new ResizeObserver(() => { pv.off = null; redraw(); }).observe(cv);
  updateSnapInfo();
  setTool('select');
  renderSide();
  renderLaserSide();
  requestAnimationFrame(() => { fit(); if (!store.get('ls.welcomed', false)) welcomeDialog(); });
  window.addEventListener('beforeunload', (e) => { if (S.grbl && S.grbl.job) { e.preventDefault(); e.returnValue = ''; } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); redraw(); });
  FS.app = { S, cmds, setMode, getPlan };
})();
