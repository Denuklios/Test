/* FräsStudio – Bedienoberfläche: Entwerfen, Fräsbahnen, 3D-Vorschau, Fräsen. */
(function () {
  'use strict';
  const { geo, M, poly, util, shapes: SH, cam: CAM, tools: TL } = FS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = util.fmt;
  // Übersetzung (Deutsch → gewählte Sprache) für Texte, die nicht im DOM landen (Canvas, Eingabewerte, Dateinamen …)
  const tr = (s) => (window.HW && HW.i18n ? HW.i18n.t(s) : s);
  const loc = () => util.locale();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  const OP_COLORS = ['#2f6fb0', '#d9480f', '#2b8a3e', '#9c36b5', '#e67700', '#0c8599', '#c2255c', '#5c7cfa'];

  // ---------------------------------------------------------------- Zustand
  function newDoc(stock) {
    return {
      v: 1, name: tr('Unbenannt'),
      stock: Object.assign({ w: 300, h: 200, t: 18, material: 'weichholz', zeroXY: 'll', zeroZ: 'top', safeZ: 5 }, stock || {}),
      objects: [], ops: [],
      tools: util.deep(store.get('fs.tools', TL.DEFAULT_TOOLS)),
    };
  }
  const S = {
    doc: newDoc(), sel: [], mode: 'design', tool: 'select',
    view: { s: 2, ox: 100, oy: 500 },
    snap: store.get('fs.snap', true), showPathsDesign: false,
    undo: [], redo: [], clip: null,
    draw: null, drag: null, hover: null, nodeSel: null,
    selOp: null, results: new Map(), computing: false,
    machine: null, grbl: null, job: null, jobMoves: null, jogStep: 1,
    sim: null, simMoves: null, simPlaying: false, gc: null,
    cursor: null, snapMark: null,
  };
  const cam = { stream: null, video: null, on: false, img: null, timer: null, fc: null,
    cal: Object.assign({ deviceId: '', raw: null, k1: 0, opacity: 0.8, live: true }, store.get('fs.cam', {})) };
  function loadMachine() {
    const m = store.get('fs.machine', { id: 'ttc450' });
    S.machine = Object.assign({}, TL.MACHINES[m.id] || TL.MACHINES.ttc450, m);
  }
  loadMachine();
  // Neue Standardwerkzeuge (konische Kugelfräser) einmalig in eine schon gespeicherte Bibliothek übernehmen
  function addNewDefaultTools(list) {
    for (const t of TL.DEFAULT_TOOLS) if (t.type === 'taperball' && !list.some((x) => x.id === t.id)) list.push(util.deep(t));
    return list;
  }
  if (!store.get('fs.toolsV2', false)) {
    const lib = store.get('fs.tools', null);
    if (lib) store.set('fs.tools', addNewDefaultTools(lib));
    store.set('fs.toolsV2', true);
  }

  // Höhenbilder nicht in jeden Rückgängig-Schritt kopieren
  const assets = new Map();
  const serial = (doc, full) => JSON.stringify(doc, (k, v) => {
    if (k === 'hm' && v && v.data) { assets.set(v.id, v); return full ? v : { id: v.id, ref: true }; }
    return v;
  });
  const revive = (json) => {
    const d = JSON.parse(json);
    for (const o of d.objects) if (o.hm) {
      if (o.hm.ref) o.hm = assets.get(o.hm.id);
      else { if (!o.hm.id) o.hm.id = util.uid(); if (assets.has(o.hm.id)) o.hm = assets.get(o.hm.id); else assets.set(o.hm.id, o.hm); }
    }
    return d;
  };

  // Geometrie-Zwischenspeicher je Objekt
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

  // ---------------------------------------------------------------- Rückgängig / Speichern
  function snapshot() {
    S.undo.push(serial(S.doc));
    if (S.undo.length > 60) S.undo.shift();
    S.redo = [];
  }
  let saveTimer = null;
  function changed(opts = {}) {
    if (!opts.keepResults) S.results.forEach((v) => { v.stale = true; });
    S.gc = null;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (!store.set('fs.doc', JSON.parse(serial(S.doc, true)))) store.set('fs.doc', null); }, 800);
    renderSide();
    redraw();
    updUndo();
  }
  function restore(json) {
    S.doc = revive(json);
    S.sel = S.sel.filter((id) => objById(id));
    S.results.clear();
    changed();
  }
  const undo = () => { if (!S.undo.length) { status('Nichts mehr rückgängig zu machen.'); return; } S.redo.push(serial(S.doc)); restore(S.undo.pop()); status('Rückgängig'); afterHistory(); };
  const redo = () => { if (!S.redo.length) { status('Nichts zum Wiederholen.'); return; } S.undo.push(serial(S.doc)); restore(S.redo.pop()); status('Wiederholt'); afterHistory(); };
  function updUndo() {
    const u = $('#undoBtn'), r = $('#redoBtn');
    if (u) { u.disabled = !S.undo.length; u.title = `Rückgängig (Strg+Z)${S.undo.length ? ' – ' + S.undo.length + ' Schritt(e)' : ''}`; }
    if (r) { r.disabled = !S.redo.length; r.title = `Wiederholen (Strg+Y)${S.redo.length ? ' – ' + S.redo.length + ' Schritt(e)' : ''}`; }
  }
  // in der 3D-Vorschau nach Rückgängig das Ergebnis neu berechnen
  function afterHistory() { if (S.mode === 'sim') enterSim(); }

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
      // frisches Element, damit Listener früherer Dialoge nicht weiterlaufen
      const ob = $('#modalBody'), nb = ob.cloneNode(false); ob.replaceWith(nb); nb.innerHTML = html;
      $('#modal .box').classList.toggle('wide', !!opts.wide);
      const bb = $('#modalBtns');
      bb.innerHTML = '';
      const close = (v) => { $('#modal').classList.add('hidden'); document.removeEventListener('keydown', key, true); resolve(v); };
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
    const k = Math.min(1, maxPx / Math.max(img.width, img.height));
    const w = Math.max(2, Math.round(img.width * k)), h = Math.max(2, Math.round(img.height * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, w, h);
    return { w, h, data: x.getImageData(0, 0, w, h).data };
  }
  const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : d; };
  const field = (label, html, unit) => `<div class="field"><label>${label}</label>${unit ? `<div class="unit" data-u="${esc(tr(unit))}">${html}</div>` : html}</div>`;
  const inputN = (id, v, step = 0.1, extra = '') => `<input id="${id}" type="number" step="${step}" value="${+(+v).toFixed(4)}" ${extra}>`;
  const val = (id) => num($('#' + id).value);
  const material = () => TL.MATERIALS.find((m) => m.id === S.doc.stock.material) || TL.MATERIALS[0];

  // ---------------------------------------------------------------- Ansicht
  const cv = $('#cv'), ctx2 = cv.getContext('2d');
  const w2s = (p) => ({ x: S.view.ox + p.x * S.view.s, y: S.view.oy - p.y * S.view.s });
  const s2w = (x, y) => ({ x: (x - S.view.ox) / S.view.s, y: (S.view.oy - y) / S.view.s });
  function fit(box) {
    const st = S.doc.stock;
    const b = box || boxOf(S.doc.objects);
    const x0 = Math.min(0, b ? b.x0 : 0), y0 = Math.min(0, b ? b.y0 : 0), x1 = Math.max(st.w, b ? b.x1 : 0), y1 = Math.max(st.h, b ? b.y1 : 0);
    const W = cv.clientWidth, H = cv.clientHeight, pad = 50;
    S.view.s = Math.min((W - 2 * pad) / Math.max(1, x1 - x0), (H - 2 * pad) / Math.max(1, y1 - y0));
    S.view.ox = (W - (x1 - x0) * S.view.s) / 2 - x0 * S.view.s;
    S.view.oy = H - (H - (y1 - y0) * S.view.s) / 2 + y0 * S.view.s;
    redraw();
  }
  function zoomAt(f, sx, sy) {
    const p = s2w(sx, sy);
    S.view.s = util.clamp(S.view.s * f, 0.05, 400);
    S.view.ox = sx - p.x * S.view.s;
    S.view.oy = sy + p.y * S.view.s;
    redraw();
  }

  // Ansicht um Bildschirm-Pixel verschieben (Inhalt wandert mit) – 2D oder 3D
  function panView(dx, dy) {
    if (S.mode === 'sim') { if (view3d) view3d.pan(dx, dy); return; }
    S.view.ox += dx; S.view.oy += dy;
    redraw();
  }

  let raf = 0;
  function redraw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw2d(); }); }
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    const dark = g('--bg').startsWith('#1');
    colors = { dark, text: g('--text'), accent: g('--accent'), line: g('--line'), muted: g('--muted'), stage: g('--stage'), grid: dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.07)', gridMajor: dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.14)', obj: '#1b2129' }; // Linien liegen immer auf dem hellen Werkstück
  }
  readColors();

  const reliefImg = new WeakMap();
  function reliefCanvas(o) {
    let c = reliefImg.get(o.hm);
    if (c && c.inv === !!o.invert) return c.cv;
    const hm = FS.relief.decode(o);
    const k = Math.max(1, Math.ceil(Math.max(hm.nx, hm.ny) / 600));
    const w = Math.ceil(hm.nx / k), h = Math.ceil(hm.ny / k);
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const x = cvs.getContext('2d'), id = x.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let v = hm.data[Math.min(hm.ny - 1, j * k) * hm.nx + Math.min(hm.nx - 1, i * k)];
      if (o.invert) v = 1 - v;
      const q = (j * w + i) * 4, g = 40 + v * 200;
      id.data[q] = g * 1.0; id.data[q + 1] = g * 0.9; id.data[q + 2] = g * 0.75; id.data[q + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    reliefImg.set(o.hm, { cv: cvs, inv: !!o.invert });
    return cvs;
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

  function draw2d() {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const x = ctx2;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const st = S.doc.stock, s = S.view.s;
    // Maschinentisch
    const bed0 = w2s({ x: 0, y: 0 }), bed1 = w2s({ x: S.machine.w, y: S.machine.h });
    x.save();
    x.setLineDash([6, 5]);
    x.strokeStyle = colors.muted;
    x.globalAlpha = 0.5;
    x.strokeRect(bed0.x, bed1.y, bed1.x - bed0.x, bed0.y - bed1.y);
    x.restore();
    x.fillStyle = colors.muted;
    x.font = '11px system-ui';
    x.globalAlpha = 0.7;
    x.fillText(`${tr('Arbeitsbereich')} ${tr(S.machine.name).split(' (')[0]} ${S.machine.w} × ${S.machine.h} mm`, bed0.x + 4, bed1.y - 6);
    x.globalAlpha = 1;
    // Werkstück
    const a = w2s({ x: 0, y: 0 }), b = w2s({ x: st.w, y: st.h });
    x.fillStyle = material().color;
    x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = 10; x.shadowOffsetY = 3;
    x.fillRect(a.x, b.y, b.x - a.x, a.y - b.y);
    x.shadowColor = 'transparent';
    if (cam.on && cam.img) {
      x.globalAlpha = cam.cal.opacity;
      x.imageSmoothingQuality = 'high';
      x.drawImage(cam.img, a.x, b.y, b.x - a.x, a.y - b.y);
      x.globalAlpha = 1;
    }
    // Raster
    const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
    const minor = steps.find((q) => q * s >= 9) || 100;
    const major = minor * (minor === 2 || minor === 20 ? 5 : minor === 5 || minor === 50 ? 2 : 10);
    const tl = s2w(0, 0), br = s2w(W, H);
    x.lineWidth = 1;
    for (let gx = Math.floor(tl.x / minor) * minor; gx <= br.x; gx += minor) {
      const p = w2s({ x: gx, y: 0 }).x;
      x.strokeStyle = Math.abs(gx / major - Math.round(gx / major)) < 1e-6 ? colors.gridMajor : colors.grid;
      x.beginPath(); x.moveTo(Math.round(p) + 0.5, 0); x.lineTo(Math.round(p) + 0.5, H); x.stroke();
    }
    for (let gy = Math.floor(br.y / minor) * minor; gy <= tl.y; gy += minor) {
      const p = w2s({ x: 0, y: gy }).y;
      x.strokeStyle = Math.abs(gy / major - Math.round(gy / major)) < 1e-6 ? colors.gridMajor : colors.grid;
      x.beginPath(); x.moveTo(0, Math.round(p) + 0.5); x.lineTo(W, Math.round(p) + 0.5); x.stroke();
    }
    x.strokeStyle = 'rgba(0,0,0,.35)';
    x.strokeRect(a.x + 0.5, b.y + 0.5, b.x - a.x, a.y - b.y);
    // Lineal-Beschriftung
    x.fillStyle = colors.muted;
    x.font = '10px system-ui';
    for (let gx = Math.ceil(tl.x / major) * major; gx <= br.x; gx += major) { const p = w2s({ x: gx, y: 0 }); x.fillText(fmt(gx, 1), p.x + 2, 11); }
    for (let gy = Math.ceil(br.y / major) * major; gy <= tl.y; gy += major) { const p = w2s({ x: 0, y: gy }); x.fillText(fmt(gy, 1), 3, p.y - 2); }
    // Nullpunkt
    const O = FS.gcode.origin(st), op = w2s(O);
    x.strokeStyle = '#d9480f'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(op.x, op.y); x.lineTo(op.x + 26, op.y); x.stroke();
    x.strokeStyle = '#2b8a3e';
    x.beginPath(); x.moveTo(op.x, op.y); x.lineTo(op.x, op.y - 26); x.stroke();
    x.fillStyle = '#fff'; x.strokeStyle = '#333'; x.lineWidth = 1;
    x.beginPath(); x.arc(op.x, op.y, 4.5, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = '#d9480f'; x.font = 'bold 10px system-ui'; x.fillText('X', op.x + 28, op.y + 4);
    x.fillStyle = '#2b8a3e'; x.fillText('Y', op.x - 3, op.y - 29);

    // Objekte
    const selSet = new Set(S.sel);
    const opObjs = S.mode === 'cam' && S.selOp ? new Set((S.doc.ops.find((o) => o.id === S.selOp) || { objIds: [] }).objIds) : null;
    for (const o of S.doc.objects) {
      if (o.hidden) continue;
      const ls = geom(o);
      if (o.kind === 'relief') {
        const bb = objBox(o), p0 = w2s({ x: bb.x0, y: bb.y1 });
        x.globalAlpha = 0.92;
        x.drawImage(reliefCanvas(o), p0.x, p0.y, bb.w * s, bb.h * s);
        x.globalAlpha = 1;
      }
      const P = pathOf(ls);
      const sel = selSet.has(o.id), inOp = opObjs && opObjs.has(o.id), hov = S.hover === o.id;
      if (ls.some((l) => l.closed) && o.kind !== 'relief') {
        x.fillStyle = sel ? 'rgba(47,111,176,.22)' : inOp ? 'rgba(217,72,15,.18)' : 'rgba(30,40,50,.10)';
        x.fill(pathOf(ls, true), 'evenodd');
      }
      x.lineWidth = sel ? 2 : hov ? 2 : 1.3;
      x.strokeStyle = sel ? colors.accent : inOp ? '#d9480f' : hov ? colors.accent : colors.obj;
      x.stroke(P);
    }

    // Fräsbahnen
    if (S.mode === 'cam' || (S.mode === 'design' && S.showPathsDesign)) drawPaths(x);
    if (S.mode === 'machine') drawMachine(x);

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
    // Punkte bearbeiten
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
    if (S.snapMark) {
      const p = w2s(S.snapMark);
      x.strokeStyle = '#e8590c'; x.lineWidth = 1.5;
      x.beginPath(); x.arc(p.x, p.y, 6, 0, Math.PI * 2); x.stroke();
    }
  }

  function drawPaths(x) {
    const s = S.view.s;
    S.doc.ops.forEach((op, i) => {
      if (!op.enabled) return;
      const r = S.results.get(op.id);
      if (!r || !r.res) return;
      const col = OP_COLORS[i % OP_COLORS.length];
      const sel = S.selOp === op.id;
      const secs = [{ chains: r.res.chains, tool: r.res.tool }];
      if (r.res.clear) secs.push({ chains: r.res.clear.chains, tool: r.res.clear.tool });
      for (const sec of secs) {
        const is3d = op.type.startsWith('relief');
        const P = new Path2D();
        for (const ch of sec.chains) ch.pts.forEach((q, k) => { const p = w2s(q); k && !q.rapid ? P.lineTo(p.x, p.y) : P.moveTo(p.x, p.y); });
        let band = sec.tool.d;
        if (sec.tool.type === 'vbit') band = op.type === 'engrave' ? (sec.tool.tip || 0) + 2 * (op.depth || 0) * Math.tan(((sec.tool.angle || 60) * Math.PI) / 360) : 0;
        if (!is3d && S.mode === 'cam' && band > 0) {
          x.save();
          x.globalAlpha = sel ? 0.28 : 0.14;
          x.strokeStyle = col; x.lineCap = 'round'; x.lineJoin = 'round';
          x.lineWidth = Math.max(1, Math.min(band, sec.tool.d) * s);
          x.stroke(P);
          x.restore();
        }
        x.strokeStyle = col; x.globalAlpha = sel || S.mode === 'design' ? 0.95 : 0.6;
        x.lineWidth = is3d ? 0.6 : sel ? 1.4 : 1;
        x.stroke(P);
        x.globalAlpha = 1;
      }
      if (r.res.tabs) for (const [p, q] of r.res.tabs) {
        const a = w2s(p), b = w2s(q);
        x.strokeStyle = '#f08c00'; x.lineWidth = 5; x.lineCap = 'butt';
        x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
      }
    });
  }

  function drawInProgress(x) {
    const d = S.draw;
    if (d && d.kind === 'line' && d.nodes.length) {
      const pts = d.nodes.concat(S.cursor ? [{ ...S.cursor, c: d.nextCurve }] : []);
      const pl = geo.buildPath(pts, false);
      x.strokeStyle = colors.accent; x.lineWidth = 1.5;
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
      if (o) { x.strokeStyle = colors.accent; x.lineWidth = 1.5; x.setLineDash([5, 3]); x.stroke(pathOf(SH.lines(o))); x.setLineDash([]); }
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
      x.fillStyle = 'rgba(47,111,176,.1)'; x.strokeStyle = colors.accent; x.setLineDash([4, 3]);
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
    if ((o.kind === 'rect' || o.kind === 'ellipse' || o.kind === 'relief') && axisAligned(o.tf)) {
      const t = o.tf;
      if (o.kind === 'rect' || o.kind === 'relief') { o.w *= Math.abs(sx * t[0]); o.h *= Math.abs(sy * t[3]); }
      else { o.rx *= Math.abs(sx * t[0]); o.ry *= Math.abs(sy * t[3]); }
      o.tf = [Math.sign(sx * t[0]) || 1, 0, 0, Math.sign(sy * t[3]) || 1, cx + (t[4] - cx) * sx, cy + (t[5] - cy) * sy];
      touch(o);
      return;
    }
    applyM(o, M.scale(sx, sy, cx, cy));
  }
  function rotateSel(ang, c) {
    const objs = selObjs();
    if (objs.some((o) => o.kind === 'relief')) { status('3D-Reliefs lassen sich nicht drehen – bitte Bild vorher drehen.', true); return false; }
    const bb = boxOf(objs);
    const cc = c || { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
    for (const o of objs) applyM(o, M.rotate(ang, cc.x, cc.y));
    return true;
  }

  function hitTest(p) {
    const tol = 5 / S.view.s;
    for (let i = S.doc.objects.length - 1; i >= 0; i--) {
      const o = S.doc.objects[i];
      if (o.hidden || o.locked) continue;
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
    if (o.kind === 'relief') return true;
    let inside = false;
    for (const l of ls) if (l.closed && geo.pointInPoly(p, l.pts)) inside = !inside;
    return inside;
  }

  // Fangen: Raster und markante Punkte
  function snapPt(p, exclude) {
    S.snapMark = null;
    const tol = 8 / S.view.s;
    let best = null, bd = tol;
    const cand = (q) => { const d = geo.dist(p, q); if (d < bd) { bd = d; best = q; } };
    const st = S.doc.stock;
    [{ x: 0, y: 0 }, { x: st.w, y: 0 }, { x: 0, y: st.h }, { x: st.w, y: st.h }, { x: st.w / 2, y: st.h / 2 }, { x: st.w / 2, y: 0 }, { x: st.w / 2, y: st.h }, { x: 0, y: st.h / 2 }, { x: st.w, y: st.h / 2 }].forEach(cand);
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
    select: 'Klicken = auswählen, Umschalt = mehrere, ziehen = verschieben. Griffe: Größe, oben: drehen. Ansicht verschieben: Leertaste halten oder zwei Finger.',
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
    let { a, b } = d;
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
  // Ansicht verschieben wie in StickStudio: Leertaste halten (Maus bewegen oder ziehen), zwei Finger am Touchpad,
  // mittlere oder rechte Maustaste. Zoomen: Finger spreizen bzw. Strg + Mausrad (umschaltbar: Mausrad = Zoom).
  let spaceDown = false, overCanvas = false, lastMouse = null;
  let wheelZoom = store.get('fs.wheelZoom', false);
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
      // Spreizen am Touchpad liefert kleine Werte mit Strg -> etwas kräftiger
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
    // Eingabefelder verlassen, damit Tasten (Leertaste, Pfeile, Entf) wieder bei der Zeichnung ankommen
    if (document.activeElement && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement.tagName)) document.activeElement.blur();
    if (e.button === 1 || spaceDown || (e.button === 2 && S.tool !== 'line')) {
      S.drag = { kind: 'pan', sx, sy, ox: S.view.ox, oy: S.view.oy };
      cv.classList.add('pan');
      return;
    }
    if (S.mode !== 'design') {
      if (S.mode === 'cam' && e.button === 0) {
        const o = hitTest(raw);
        if (o) { if (e.shiftKey) toggleSel(o.id); else S.sel = [o.id]; }
        else if (!e.shiftKey) S.sel = [];
        renderSide(); redraw();
      } else S.drag = { kind: 'pan', sx, sy, ox: S.view.ox, oy: S.view.oy };
      return;
    }
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
    if (t === 'text') { textDialog(null, p); }
  });

  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const raw = s2w(sx, sy);
    $('#coords').textContent = `X ${fmt(raw.x)}  Y ${fmt(raw.y)} mm`;
    // Leertaste gehalten: Ansicht folgt der Maus, auch ohne Klick
    const lm = lastMouse;
    lastMouse = { sx, sy };
    if (spaceDown && !S.drag && lm && e.pointerType !== 'touch') { S.view.ox += sx - lm.sx; S.view.oy += sy - lm.sy; redraw(); return; }
    const d = S.drag;
    if (d && d.kind === 'pan') { S.view.ox = d.ox + sx - d.sx; S.view.oy = d.oy + sy - d.sy; redraw(); return; }
    if (S.mode !== 'design') { const o = hitTest(raw); const h = o ? o.id : null; if (h !== S.hover) { S.hover = h; redraw(); } return; }
    if (d && d.kind === 'move') {
      let p = raw;
      // Fangen über die Ecke der Auswahl
      const off = { x: d.bb.x0 - d.start.x, y: d.bb.y0 - d.start.y };
      const sp = snapPt({ x: raw.x + off.x, y: raw.y + off.y }, new Set(S.sel));
      p = { x: sp.x - off.x, y: sp.y - off.y };
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
      // Ausgangszustand wiederherstellen
      for (const src of objs) {
        const o = objById(src.id);
        if (!o) continue;
        const hm = o.hm;
        Object.keys(o).forEach((k) => delete o[k]);
        Object.assign(o, src);
        if (hm) o.hm = hm;
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
    if (S.tool === 'line' || S.tool === 'rect' || S.tool === 'ellipse' || S.tool === 'polygon' || S.tool === 'star' || S.tool === 'text' || S.tool === 'measure') {
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
        const ids = S.doc.objects.filter((o) => { const b = objBox(o); return !o.hidden && b && b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1; }).map((o) => o.id);
        S.sel = d.add ? [...new Set([...S.sel, ...ids])] : ids;
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
    if (S.draw && S.draw.kind === 'measure') { /* Messung bleibt sichtbar bis zum nächsten Klick */ }
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
      else if (o && o.kind === 'path') setTool('node');
    }
  });

  function toggleSel(id) { S.sel = S.sel.includes(id) ? S.sel.filter((x) => x !== id) : [...S.sel, id]; }

  // ---------------------------------------------------------------- Text
  function textDialog(o, at) {
    const fonts = FS.ttf.names();
    const t = o || { text: tr('Text'), font: store.get('fs.lastFont', fonts[0]), size: 20, align: 'left', spacing: 0, lineHeight: 1.2 };
    const html = `
      ${field('Text', `<textarea id="tText" rows="3">${esc(t.text)}</textarea>`)}
      ${field('Schrift', `<select id="tFont">${fonts.map((f) => `<option ${f === t.font ? 'selected' : ''}>${f}</option>`).join('')}</select>`)}
      ${field('Schriftgröße', inputN('tSize', t.size, 0.5, 'min="1"'), 'mm')}
      ${field('Zeichenabstand', inputN('tSpacing', t.spacing || 0, 0.1), 'mm')}
      ${field('Zeilenabstand', inputN('tLine', t.lineHeight || 1.2, 0.05), '×')}
      ${field('Ausrichtung', `<select id="tAlign"><option value="left">links</option><option value="center">mittig</option><option value="right">rechts</option></select>`)}
      <canvas id="tPrev" width="540" height="110"></canvas>
      <p class="muted small">Die Schriftgröße ist die Höhe des Schriftrahmens (Großbuchstaben sind etwa 70 % davon). Mehrere Zeilen mit Enter.</p>`;
    const read = () => ({ text: $('#tText').value, font: $('#tFont').value, size: Math.max(1, val('tSize')), spacing: val('tSpacing'), lineHeight: val('tLine') || 1.2, align: $('#tAlign').value });
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
      store.set('fs.lastFont', v.font);
      if (o) { snapshot(); Object.assign(o, v); touch(o); changed(); }
      else {
        const n = SH.make('text', { ...v, name: 'Text: ' + v.text.split('\n')[0].slice(0, 20) });
        n.tf = M.translate(at.x, at.y);
        addObjects([n]);
        setTool('select');
      }
    });
  }

  // ---------------------------------------------------------------- Seitenleiste: Entwerfen
  function renderSide() {
    renderStockInfo();
    if (S.mode === 'design') { renderProps(); renderObjList(); }
    if (S.mode === 'cam') renderCam();
    $('#stockBtn').textContent = `▣ ${fmt(S.doc.stock.w, 1)} × ${fmt(S.doc.stock.h, 1)} × ${fmt(S.doc.stock.t, 1)} mm · ${tr(material().name).split(' (')[0]}`;
  }
  function renderStockInfo() {
    const st = S.doc.stock;
    $('#stockInfo').innerHTML = `<div class="sw" style="background:${material().color}"></div>
      <div class="t"><b>${fmt(st.w, 1)} × ${fmt(st.h, 1)} mm</b>, Stärke ${fmt(st.t, 1)} mm<br><span class="muted">${esc(material().name)}</span></div>
      <button data-cmd="stock">Ändern</button>`;
  }
  function renderObjList() {
    const el = $('#objlist');
    $('#objCount').textContent = S.doc.objects.length ? `(${S.doc.objects.length})` : '';
    if (!S.doc.objects.length) { el.innerHTML = '<div class="empty">Noch nichts gezeichnet.<br>Links ein Werkzeug wählen oder eine Datei importieren.</div>'; return; }
    const icon = { path: '✎', rect: '▭', ellipse: '◯', polygon: '⬡', star: '☆', text: 'A', poly: '⇪', relief: '▦' };
    el.innerHTML = S.doc.objects.slice().reverse().map((o) => {
      const b = objBox(o);
      return `<div class="obj ${S.sel.includes(o.id) ? 'sel' : ''}" data-id="${o.id}"><span class="k">${icon[o.kind] || '•'}</span><span class="n">${esc(o.name)}</span><span class="c">${b ? fmt(b.w, 1) + '×' + fmt(b.h, 1) : ''}</span><button class="eye" data-eye="${o.id}" title="Ein-/Ausblenden">${o.hidden ? '◌' : '●'}</button></div>`;
    }).join('');
  }
  $('#objlist').addEventListener('click', (e) => {
    const eye = e.target.closest('[data-eye]');
    if (eye) { const o = objById(eye.dataset.eye); snapshot(); o.hidden = !o.hidden; changed(); return; }
    const row = e.target.closest('.obj');
    if (!row) return;
    if (e.shiftKey || e.ctrlKey) toggleSel(row.dataset.id); else S.sel = [row.dataset.id];
    renderSide(); redraw();
  });
  $('#objlist').addEventListener('dblclick', (e) => {
    const row = e.target.closest('.obj');
    if (!row) return;
    const o = objById(row.dataset.id);
    const n = prompt(tr('Name:'), o.name);
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
    <label class="check"><input type="checkbox" id="pLock" ${store.get('fs.lockAspect', true) ? 'checked' : ''}> Seitenverhältnis beibehalten</label>
    <div class="row">
      <input id="pRot" type="number" step="1" value="90" style="width:62px" title="Winkel in Grad"><button data-cmd="rotBy">° drehen</button>
      <button data-cmd="mirrorH" title="Waagrecht spiegeln">⇋</button><button data-cmd="mirrorV" title="Senkrecht spiegeln">⇵</button>
      <button data-cmd="centerStock" title="Auf Werkstück zentrieren">⊕</button>
    </div>`;
    const o = objs.length === 1 ? objs[0] : null;
    if (o) {
      if (o.kind === 'rect') html += field('Eckenradius', inputN('kR', o.r || 0, 0.5, 'min="0"'), 'mm');
      if (o.kind === 'polygon' || o.kind === 'star') html += field('Ecken', inputN('kN', o.n, 1, 'min="3" max="64"'));
      if (o.kind === 'star') html += field('Innenradius', inputN('kI', Math.round((o.inner || 0.5) * 100), 1, 'min="5" max="95"'), '%');
      if (o.kind === 'path') html += `<label class="check"><input type="checkbox" id="kClosed" ${o.closed ? 'checked' : ''}> geschlossen</label>`;
      if (o.kind === 'text') html += `<div class="row"><button data-cmd="editText" class="wide">Text bearbeiten…</button></div>`;
      if (o.kind === 'relief') {
        html += field('Relieftiefe', inputN('kD', o.depth, 0.5, 'min="0.1"'), 'mm');
        html += `<label class="check"><input type="checkbox" id="kInv" ${o.invert ? 'checked' : ''}> umkehren (dunkel = hoch)</label>`;
      }
    }
    html += `<div class="row"><button data-cmd="duplicate">Duplizieren</button><button data-cmd="delete">Löschen</button>${objs.length ? `<button data-mode-go="cam" class="wide">Fräsbahn ▶</button>` : ''}</div>`;
    el.innerHTML = html;
  }
  $('#props').addEventListener('change', (e) => {
    const objs = selObjs();
    if (!objs.length) return;
    const id = e.target.id;
    if (id === 'pLock') { store.set('fs.lockAspect', e.target.checked); return; }
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
    if (id === 'kD') o.depth = Math.max(0.1, val('kD'));
    if (id === 'kInv') o.invert = e.target.checked;
    objs.forEach(touch);
    changed();
  });

  // ---------------------------------------------------------------- Befehle
  const cmds = {
    new: () => stockDialog(true),
    open: openProject,
    save: saveProject,
    example: loadExample,
    importVector, importTrace, importRelief, importStl,
    exportGcode, exportSvg,
    openGcode: () => { setMode('machine'); loadJobFile(); },
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
      for (const op of S.doc.ops) op.objIds = op.objIds.filter((id) => !del.has(id));
      S.sel = [];
      changed();
    },
    selectAll() { S.sel = S.doc.objects.filter((o) => !o.hidden).map((o) => o.id); renderSide(); redraw(); },
    stock: () => stockDialog(false),
    toolLib: () => toolLibrary(),
    machineSettings,
    alignLeft: () => align('l'), alignRight: () => align('r'), alignTop: () => align('t'), alignBottom: () => align('b'),
    alignCenterH: () => align('ch'), alignCenterV: () => align('cv'),
    centerStock() {
      const objs = selObjs().length ? selObjs() : S.doc.objects;
      const b = boxOf(objs);
      if (!b) return;
      snapshot();
      for (const o of objs) translateObj(o, S.doc.stock.w / 2 - (b.x0 + b.x1) / 2, S.doc.stock.h / 2 - (b.y0 + b.y1) / 2);
      changed();
    },
    mirrorH: () => mirror(-1, 1), mirrorV: () => mirror(1, -1),
    rot90() { if (!S.sel.length) return; snapshot(); if (rotateSel(-Math.PI / 2)) changed(); else S.undo.pop(); },
    rotBy() { if (!S.sel.length) return; snapshot(); if (rotateSel((-val('pRot') * Math.PI) / 180)) changed(); else S.undo.pop(); },
    union: () => boolOp('union'), subtract: () => boolOp('difference'), intersect: () => boolOp('intersection'),
    offset: offsetDialog, array: arrayDialog,
    toPath, toLines, breakApart,
    editText() { const o = selObjs()[0]; if (o && o.kind === 'text') textDialog(o); },
    fit: () => (S.mode === 'sim' && view3d ? view3d.preset('iso') : fit()),
    zoomIn: () => (S.mode === 'sim' && view3d ? view3d.zoom(0.8) : zoomAt(1.25, cv.clientWidth / 2, cv.clientHeight / 2)),
    zoomOut: () => (S.mode === 'sim' && view3d ? view3d.zoom(1.25) : zoomAt(0.8, cv.clientWidth / 2, cv.clientHeight / 2)),
    panLeft: () => panView(80, 0), panRight: () => panView(-80, 0), panUp: () => panView(0, 80), panDown: () => panView(0, -80),
    toggleWheel() {
      wheelZoom = !wheelZoom;
      store.set('fs.wheelZoom', wheelZoom);
      if (view3d) view3d.wheelZoom = wheelZoom;
      status(wheelZoom ? 'Mausrad = Zoom. Verschieben: Leertaste halten, Umschalt + Rad oder mittlere Maustaste.' : 'Mausrad / zwei Finger = verschieben, Strg + Rad bzw. Spreizen = Zoom.');
    },
    toggleSnap() { S.snap = !S.snap; store.set('fs.snap', S.snap); updateSnapInfo(); },
    togglePaths() { S.showPathsDesign = !S.showPathsDesign; if (S.showPathsDesign) computeAll(); redraw(); },
    toggleTheme() {
      const r = document.documentElement;
      const dark = getComputedStyle(r).getPropertyValue('--bg').trim().startsWith('#1');
      r.dataset.theme = dark ? 'light' : 'dark';
      store.set('fs.theme', r.dataset.theme);
      readColors(); redraw(); if (view3d) view3d.dirty = true;
    },
    help: helpDialog, welcome: welcomeDialog, ttcTips, about: aboutDialog,
  };
  function updateSnapInfo() { $('#snapInfo').textContent = S.snap ? 'Raster fangen: an (G)' : 'Raster fangen: aus (G)'; }

  function align(how) {
    const objs = selObjs();
    if (!objs.length) return;
    const ref = objs.length > 1 ? boxOf(objs) : { x0: 0, y0: 0, x1: S.doc.stock.w, y1: S.doc.stock.h };
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
    const objs = selObjs().filter((o) => o.kind !== 'relief');
    if (objs.length < 2) { status('Bitte mindestens zwei geschlossene Formen auswählen.', true); return; }
    let res;
    if (kind === 'union') res = poly.clip(objs.flatMap(regionOf), null, 'union', 'nonzero');
    else if (kind === 'difference') res = poly.clip(regionOf(objs[0]), poly.clip(objs.slice(1).flatMap(regionOf), null, 'union', 'nonzero'), 'difference', 'nonzero');
    else { res = regionOf(objs[0]); for (const o of objs.slice(1)) res = poly.clip(res, regionOf(o), 'intersection', 'nonzero'); }
    snapshot();
    const del = new Set(objs.map((o) => o.id));
    S.doc.objects = S.doc.objects.filter((o) => !del.has(o.id));
    for (const op of S.doc.ops) op.objIds = op.objIds.filter((id) => !del.has(id));
    if (!res.length) { S.sel = []; changed(); status('Ergebnis ist leer.', true); return; }
    const n = SH.make('poly', { name: { union: 'Vereinigung', difference: 'Differenz', intersection: 'Schnittmenge' }[kind], lines: res.map((pts) => ({ pts, closed: true })) });
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
      Object.keys(o).forEach((k) => { if (!['id', 'name'].includes(k)) delete o[k]; });
      Object.assign(o, { kind: 'path', tf: M.id(), nodes, closed });
      touch(o);
      n++;
    }
    if (!n) { S.undo.pop(); status('Diese Objekte lassen sich nicht in Kurven umwandeln (Text: zuerst „In Linien umwandeln“).', true); return; }
    changed();
    setTool('node');
  }
  function toLines() {
    const objs = selObjs().filter((o) => o.kind !== 'relief' && o.kind !== 'poly');
    if (!objs.length) return;
    snapshot();
    for (const o of objs) {
      const p = SH.toPoly(o);
      Object.keys(o).forEach((k) => { if (!['id', 'name'].includes(k)) delete o[k]; });
      Object.assign(o, { kind: 'poly', tf: M.id(), lines: p.lines });
      touch(o);
    }
    changed();
  }
  function breakApart() {
    const objs = selObjs().filter((o) => o.kind === 'poly' || o.kind === 'text');
    if (!objs.length) { status('Auseinandernehmen geht bei importierten Linien und Text.', true); return; }
    snapshot();
    const add = [];
    const del = new Set();
    for (const o of objs) {
      const ls = geom(o);
      const shapes = poly.nest(ls.filter((l) => l.closed).map((l) => l.pts));
      shapes.forEach((s, i) => add.push(SH.make('poly', { name: `${o.name} ${i + 1}`, lines: [s.outer, ...s.holes].map((pts) => ({ pts, closed: true })) })));
      ls.filter((l) => !l.closed).forEach((l, i) => add.push(SH.make('poly', { name: `${o.name} Linie ${i + 1}`, lines: [{ pts: l.pts, closed: false }] })));
      del.add(o.id);
    }
    S.doc.objects = S.doc.objects.filter((o) => !del.has(o.id)).concat(add);
    for (const op of S.doc.ops) op.objIds = op.objIds.filter((id) => !del.has(id));
    S.sel = add.map((o) => o.id);
    changed();
    status(`${add.length} Teile`);
  }
  cmds.breakApart = breakApart;

  function offsetDialog() {
    const objs = selObjs().filter((o) => o.kind !== 'relief');
    if (!objs.length) { status('Bitte Formen auswählen.', true); return; }
    modal('Versatz', `${field('Abstand (+ außen, − innen)', inputN('oD', 2, 0.1), 'mm')}
      ${field('Ecken', `<select id="oJ"><option value="round">rund</option><option value="miter">spitz</option><option value="square">abgeschrägt</option></select>`)}
      <p class="muted small">Erzeugt eine neue Umrisslinie mit festem Abstand, z. B. für einen Rand um Text oder eine Einlegearbeit.</p>`,
    [{ label: 'Abbrechen', value: null }, { label: 'Erzeugen', primary: true, value: 'ok' }]).then((r) => {
      if (r !== 'ok') return;
      const d = val('oD'), j = $('#oJ') ? $('#oJ').value : 'round';
      const res = poly.offset(poly.clip(objs.flatMap(regionOf), null, 'union', 'nonzero'), d, j);
      if (!res.length) { status('Ergebnis ist leer – Abstand zu groß?', true); return; }
      addObjects([SH.make('poly', { name: `Versatz ${fmt(d)} mm`, lines: res.map((pts) => ({ pts, closed: true })) })]);
    });
  }
  function arrayDialog() {
    const objs = selObjs();
    if (!objs.length) { status('Bitte etwas auswählen.', true); return; }
    const b = boxOf(objs);
    modal('Mehrfach anordnen', `<div class="grid2">${field('Spalten', inputN('aC', 3, 1, 'min="1"'))}${field('Zeilen', inputN('aR', 1, 1, 'min="1"'))}</div>
      ${field('Abstand waagrecht (Mitte zu Mitte)', inputN('aX', +(b.w + 5).toFixed(2), 0.5), 'mm')}
      ${field('Abstand senkrecht (Mitte zu Mitte)', inputN('aY', +(b.h + 5).toFixed(2), 0.5), 'mm')}`,
    [{ label: 'Abbrechen', value: null }, { label: 'Anordnen', primary: true, value: 'ok' }]).then((r) => {
      if (r !== 'ok') return;
      const C = Math.max(1, Math.round(val('aC'))), R = Math.max(1, Math.round(val('aR'))), dx = val('aX'), dy = val('aY');
      const add = [];
      for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
        if (!i && !j) continue;
        const cp = revive(serial({ objects: objs })).objects.map((o) => ({ ...o, id: util.uid() }));
        cp.forEach((o) => translateObj(o, i * dx, -j * dy));
        add.push(...cp);
      }
      addObjects(add, false);
      S.sel = S.sel.concat(add.map((o) => o.id));
      renderSide();
      status(`${add.length} Kopien erzeugt`);
    });
  }

  // ---------------------------------------------------------------- Werkstück / Werkzeuge / Maschine
  function stockDialog(isNew) {
    const st = isNew ? newDoc().stock : S.doc.stock;
    const zero = st.zeroXY || 'll';
    const html = `
      ${isNew ? field('Projektname', `<input id="sName" value="${esc(tr('Unbenannt'))}">`) : ''}
      <div class="grid2">${field('Breite X', inputN('sW', st.w, 1, 'min="1"'), 'mm')}${field('Höhe Y', inputN('sH', st.h, 1, 'min="1"'), 'mm')}</div>
      ${field('Materialstärke Z', inputN('sT', st.t, 0.1, 'min="0.1"'), 'mm')}
      ${field('Material', `<select id="sM">${TL.MATERIALS.map((m) => `<option value="${m.id}" ${m.id === st.material ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`)}
      ${field('Sicherheitshöhe', inputN('sS', st.safeZ || 5, 0.5, 'min="1"'), 'mm')}
      <div class="field"><label>Nullpunkt X/Y<br><span class="muted small">Dort stellst du die Maschine auf X0 Y0</span></label>
        <div class="zeropick">${['ul', 'uc', 'ur', 'cl', 'c', 'cr', 'll', 'lc', 'lr'].map((k) => `<button data-z="${k}" class="${k === zero ? 'active' : ''}" title="${zeroText(k)}"></button>`).join('')}</div></div>
      ${field('Nullpunkt Z', `<select id="sZ"><option value="top" ${st.zeroZ !== 'bottom' ? 'selected' : ''}>Materialoberfläche (empfohlen)</option><option value="bottom" ${st.zeroZ === 'bottom' ? 'selected' : ''}>Maschinentisch / Opferplatte</option></select>`)}
      <div class="info">Arbeitsbereich der ${esc(tr(S.machine.name))}: ${S.machine.w} × ${S.machine.h} × ${S.machine.z} mm</div>`;
    let z = zero;
    modal(isNew ? 'Neues Projekt' : 'Werkstück einrichten', html, [{ label: 'Abbrechen', value: null }, { label: isNew ? 'Anlegen' : 'Übernehmen', primary: true, value: 'ok' }], {
      onOpen: (b) => b.querySelector('.zeropick').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        e.preventDefault();
        z = btn.dataset.z;
        $$('.zeropick button', b).forEach((x) => x.classList.toggle('active', x === btn));
      }),
    }).then((r) => {
      if (r !== 'ok') return;
      const ns = { w: Math.max(1, val('sW')), h: Math.max(1, val('sH')), t: Math.max(0.1, val('sT')), material: $('#sM').value, safeZ: Math.max(1, val('sS')), zeroXY: z, zeroZ: $('#sZ').value };
      if (ns.w > S.machine.w || ns.h > S.machine.h) status(`Achtung: Werkstück ist größer als der Arbeitsbereich (${S.machine.w} × ${S.machine.h} mm).`, true);
      snapshot();
      if (isNew) {
        const d = newDoc(ns);
        d.name = ($('#sName') && $('#sName').value) || tr('Unbenannt');
        S.doc = d; S.sel = []; S.results.clear(); S.undo = []; S.redo = [];
        changed(); fit();
        setMode('design');
      } else { Object.assign(S.doc.stock, ns); changed(); fit(); }
    });
  }

  function toolLibrary(selectId) {
    let cur = selectId || (S.doc.tools[0] && S.doc.tools[0].id);
    const list = () => S.doc.tools.map((t) => `<tr class="toolrow ${t.id === cur ? 'sel' : ''}" data-t="${t.id}"><td>${esc(t.name)}</td><td>${TL.TYPES[t.type]}</td><td>Ø ${fmt(t.d)}${t.type === 'vbit' ? ', ' + t.angle + '°' : t.type === 'taperball' ? ', Spitze Ø ' + fmt(t.tip) : ''}</td></tr>`).join('');
    const form = (t) => !t ? '' : `
      ${field('Name', `<input id="wN" value="${esc(tr(t.name))}">`)}
      ${field('Art', `<select id="wT">${Object.entries(TL.TYPES).map(([k, v]) => `<option value="${k}" ${k === t.type ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
      <div class="grid2">
        ${field('Ø', inputN('wD', t.d, 0.01, 'min="0.05"'), 'mm')}
        ${field('Schneiden', inputN('wF', t.flutes || 2, 1, 'min="1"'))}
        ${t.type === 'vbit' || t.type === 'taperball' ? field(t.type === 'taperball' ? 'Kegel gesamt' : 'Winkel', inputN('wA', t.angle || (t.type === 'taperball' ? 30 : 60), 1, 'min="1" max="170"'), '°') + field(t.type === 'taperball' ? 'Kugel-Ø Spitze' : 'Spitze', inputN('wTip', t.tip || (t.type === 'taperball' ? 0.5 : 0), 0.05, 'min="0"'), 'mm') : ''}
        ${field('Schn.-länge', inputN('wL', t.len || 10, 0.5), 'mm')}
        ${field('Drehzahl', inputN('wR', t.rpm, 100), 'U/min')}
        ${field('Vorschub', inputN('wFe', t.feed, 10), 'mm/min')}
        ${field('Eintauchen', inputN('wP', t.plunge, 10), 'mm/min')}
        ${field('Zustellung', inputN('wS', t.stepdown, 0.05), 'mm')}
        ${field('Überlappung', inputN('wO', t.stepover, 1), '%')}
      </div>
      <p class="muted small">Werte gelten für Weichholz und die 80-W-Spindel; Material und Spindelleistung (Maschine: ${esc(tr(S.machine.name))}) passen Vorschub, Zustellung und Drehzahl automatisch an. Höchstvorschub: ${S.machine.maxFeed} mm/min.</p>`;
    const render = () => {
      $('#tlList').innerHTML = list();
      $('#tlForm').innerHTML = form(S.doc.tools.find((t) => t.id === cur));
    };
    const readForm = () => {
      const t = S.doc.tools.find((x) => x.id === cur);
      if (!t || !$('#wN')) return;
      // Standardnamen bleiben deutsch gespeichert (Anzeige übersetzt) – nur echte Änderungen übernehmen
      const nm = $('#wN').value;
      Object.assign(t, { name: nm === tr(t.name) ? t.name : nm, type: $('#wT').value, d: Math.max(0.05, val('wD')), flutes: Math.max(1, val('wF')), len: val('wL'), rpm: val('wR'), feed: val('wFe'), plunge: val('wP'), stepdown: Math.max(0.01, val('wS')), stepover: util.clamp(val('wO'), 1, 100) });
      if ($('#wA')) { t.angle = util.clamp(val('wA'), 5, 170); t.tip = Math.max(0, val('wTip')); }
      if (t.type === 'vbit' && !t.angle) t.angle = 60;
      if (t.type === 'taperball') { t.angle = t.angle || 30; t.tip = Math.max(0.05, Math.min(t.d, t.tip || 0.5)); }
    };
    const html = `<div style="display:grid;grid-template-columns:1.1fr 1fr;gap:14px">
      <div><table><tbody id="tlList"></tbody></table>
        <div class="row"><button id="tlAdd">+ Neu</button><button id="tlDup">Kopieren</button><button id="tlDel">Löschen</button><button id="tlReset">Standard</button></div></div>
      <div id="tlForm"></div></div>`;
    return modal('Werkzeugbibliothek', html, [{ label: 'Schließen', primary: true, value: 'ok', onClick: () => { readForm(); } }], {
      wide: true, noFocus: true,
      onOpen: (b) => {
        render();
        b.addEventListener('click', (e) => {
          const row = e.target.closest('[data-t]');
          if (row) { readForm(); cur = row.dataset.t; render(); }
          if (e.target.id === 'tlAdd') { readForm(); const t = { ...util.deep(TL.DEFAULT_TOOLS[0]), id: 't' + util.uid(), name: tr('Neues Werkzeug') }; S.doc.tools.push(t); cur = t.id; render(); }
          if (e.target.id === 'tlDup') { readForm(); const s = S.doc.tools.find((t) => t.id === cur); if (s) { const t = { ...util.deep(s), id: 't' + util.uid(), name: tr(s.name) + tr(' (Kopie)') }; S.doc.tools.push(t); cur = t.id; render(); } }
          if (e.target.id === 'tlDel' && S.doc.tools.length > 1) {
            if (S.doc.ops.some((o) => o.toolId === cur)) { status('Werkzeug wird in einer Fräsbahn verwendet.', true); return; }
            S.doc.tools = S.doc.tools.filter((t) => t.id !== cur); cur = S.doc.tools[0].id; render();
          }
          if (e.target.id === 'tlReset') {
            const used = new Set(S.doc.ops.map((o) => o.toolId));
            S.doc.tools = util.deep(TL.DEFAULT_TOOLS).concat(S.doc.tools.filter((t) => used.has(t.id) && !TL.DEFAULT_TOOLS.some((d) => d.id === t.id)));
            cur = S.doc.tools[0].id; render();
          }
        });
        b.addEventListener('change', (e) => { if (e.target.id === 'wT') { readForm(); render(); } else { readForm(); $('#tlList').innerHTML = list(); } });
      },
    }).then(() => {
      readForm();
      store.set('fs.tools', S.doc.tools);
      changed();
    });
  }

  function machineSettings() {
    const m = S.machine;
    const html = `${field('Maschine', `<select id="mmId">${Object.values(TL.MACHINES).map((x) => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
      <div class="grid2">
        ${field('X', inputN('mmW', m.w, 1), 'mm')}${field('Y', inputN('mmH', m.h, 1), 'mm')}${field('Z', inputN('mmZ', m.z, 1), 'mm')}
        ${field('Leistung', inputN('mmP', m.power || 80, 10), 'W')}
        ${field('Min U/min', inputN('mmRn', m.minRpm || 0, 100), '')}
        ${field('Max U/min', inputN('mmR', m.maxRpm, 100), '')}
        ${field('S max ($30)', inputN('mmS', m.sMax, 1), '')}
        ${field('Max Vorschub', inputN('mmF', m.maxFeed, 10), 'mm/min')}
        ${field('Max Z', inputN('mmFZ', m.maxZFeed, 10), 'mm/min')}
        ${field('Eilgang', inputN('mmRa', m.rapid, 10), 'mm/min')}
        ${field('Baudrate', inputN('mmB', m.baud, 1), '')}
      </div>
      ${field('Drehzahl einstellen', `<select id="mmSp"><option value="pwm" ${m.spindle !== 'manual' ? 'selected' : ''}>vom Programm (S-Wert)</option><option value="manual" ${m.spindle === 'manual' ? 'selected' : ''}>von Hand am Drehregler</option></select>`)}
      ${field('Stufen am Drehregler', inputN('mmDi', m.dial || 6, 1, 'min="2" max="12"'))}
      <p class="muted small">Die Leistung bestimmt, wie stark FräsStudio Zustellung und Vorschub gegenüber der 80-W-Spindel erhöht (Vorschub bleibt auf den Höchstwert der Achsen begrenzt).
      Beim 800-W-Fräsmotor stellst du die Drehzahl am Drehregler ein – FräsStudio sagt dir für jedes Werkzeug die passende Stufe und schaltet den Motor nur ein und aus.
      Die TTC450 steuert die Spindel über S0 bis S1000 ($30=1000); mit „$$“ in der Konsole liest du die Einstellungen aus.</p>`;
    modal('Maschine', html, [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen', primary: true, value: 'ok' }], {
      onOpen: (b) => $('#mmId', b).addEventListener('change', (e) => {
        const p = TL.MACHINES[e.target.value];
        [['mmW', 'w'], ['mmH', 'h'], ['mmZ', 'z'], ['mmP', 'power'], ['mmRn', 'minRpm'], ['mmR', 'maxRpm'], ['mmS', 'sMax'], ['mmF', 'maxFeed'], ['mmFZ', 'maxZFeed'], ['mmRa', 'rapid'], ['mmB', 'baud'], ['mmSp', 'spindle']].forEach(([i, k]) => { $('#' + i).value = p[k]; });
        $('#mmDi').value = p.dial || 6;
      }),
    }).then((r) => {
      if (r !== 'ok') return;
      const v = { id: $('#mmId').value, w: val('mmW'), h: val('mmH'), z: val('mmZ'), power: val('mmP'), minRpm: val('mmRn'), maxRpm: val('mmR'), spindle: $('#mmSp').value, dial: Math.round(val('mmDi')), sMax: val('mmS'), maxFeed: val('mmF'), maxZFeed: val('mmFZ'), rapid: val('mmRa'), baud: val('mmB') };
      store.set('fs.machine', v);
      loadMachine();
      $('#machName').textContent = S.machine.name;
      changed();
    });
  }

  // ---------------------------------------------------------------- Dateien
  function saveProject() {
    const name = (S.doc.name || tr('Projekt')).replace(/[^\wäöüÄÖÜßæøåÆØÅ\- ]+/g, '_');
    download(name + '.fsp', serial(S.doc, true), 'application/json');
    status('Projekt gespeichert: ' + name + '.fsp');
  }
  async function openProject() {
    const f = await pickFile('.fsp,.json,.svg,.dxf,.nc,.gcode,.tap,.ngc,.stl,image/*');
    if (f) openDropped(f.file);
  }
  const readAs = (file, as) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (as === 'buffer') r.readAsArrayBuffer(file); else if (as === 'url') r.readAsDataURL(file); else r.readAsText(file);
  });
  // Datei öffnen – egal ob über „Öffnen“ oder per Ziehen und Ablegen
  async function openDropped(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (file.type.startsWith('image/') && ext !== 'svg') {
      const data = await readAs(file, 'url');
      const r = await modal('Bild verwenden als …', `<p>Was soll aus <b>${esc(file.name)}</b> werden?</p>
        <p class="small"><b>3D-Relief:</b> schwarz wird tief, grau dazwischen, weiß bleibt flach.<br><b>Umriss:</b> die dunklen Flächen werden zu Linien (für Kontur, Tasche, V-Carving).</p>`,
      [{ label: 'Abbrechen', value: null }, { label: 'Umriss nachzeichnen', value: 'trace' }, { label: '3D-Relief', primary: true, value: 'relief' }]);
      if (r === 'relief') importRelief({ name: file.name, data });
      if (r === 'trace') importTrace({ name: file.name, data });
      return;
    }
    if (ext === 'svg' || ext === 'dxf') return importVectorText(file.name, await readAs(file, 'text'));
    if (ext === 'stl') return importStl({ name: file.name, data: await readAs(file, 'buffer') });
    if (['nc', 'gcode', 'tap', 'ngc'].includes(ext)) { setMode('machine'); setJob(await readAs(file, 'text'), file.name); return; }
    if (ext === 'fsp' || ext === 'json') return openProjectText(file.name, await readAs(file, 'text'));
    status('Dieser Dateityp wird nicht unterstützt: .' + ext, true);
  }
  function openProjectText(name, text) {
    const f = { name, data: text };
    try {
      const d = revive(f.data);
      if (!d.objects || !d.stock) throw new Error('Keine FräsStudio-Datei');
      d.tools = d.tools || util.deep(TL.DEFAULT_TOOLS);
      S.undo = []; S.redo = []; S.sel = []; S.results.clear();
      S.doc = d;
      changed(); fit();
      status('Geöffnet: ' + f.name);
    } catch (e) { modal('Fehler', `<p>Die Datei konnte nicht geöffnet werden: ${esc(e.message)}</p>`); }
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
      const o = SH.make('poly', { name: name.replace(/\.[^.]+$/, ''), lines });
      const b = geo.bounds(lines.map((l) => l.pts));
      translateObj(o, S.doc.stock.w / 2 - (b.x0 + b.x1) / 2, S.doc.stock.h / 2 - (b.y0 + b.y1) / 2);
      addObjects([o]);
      setMode('design');
      const open = lines.filter((l) => !l.closed).length;
      status(`Importiert: ${lines.length} Linienzüge (${fmt(b.w)} × ${fmt(b.h)} mm)${open ? `, davon ${open} offen` : ''}. Zum Zerlegen: Anordnen → Auseinandernehmen.`);
      fit();
    } catch (e) { modal('Import fehlgeschlagen', `<p>${esc(e.message)}</p>`); }
  }

  async function importTrace(given) {
    const f = given || (await pickFile('image/*', 'url'));
    if (!f) return;
    const img = await loadImage(f.data).catch((e) => { modal('Fehler', esc(e.message)); });
    if (!img) return;
    const px = imagePixels(img, 900);
    const html = `<canvas id="trPrev" width="560" height="320"></canvas>
      ${field('Schwelle', `<input id="trTh" type="range" min="1" max="254" value="128">`)}
      <label class="check"><input type="checkbox" id="trInv"> umkehren (helle Bereiche werden zur Form)</label>
      ${field('Breite', inputN('trW', Math.min(150, S.doc.stock.w * 0.8).toFixed(0), 1, 'min="1"'), 'mm')}
      ${field('Glätten', `<input id="trSm" type="range" min="0" max="3" step="0.1" value="0.7">`)}
      <p id="trInfo" class="muted small"></p>`;
    let rings = [];
    const prev = () => {
      rings = FS.importers.traceImage(px.data, px.w, px.h, val('trW') || 100, val('trTh'), $('#trInv').checked, val('trSm'));
      const c = $('#trPrev'), x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      const k = Math.min(c.width / px.w, c.height / px.h);
      x.globalAlpha = 0.25; x.drawImage(img, 0, 0, px.w * k, px.h * k); x.globalAlpha = 1;
      const mm = (val('trW') || 100) / px.w;
      x.fillStyle = 'rgba(47,111,176,.35)'; x.strokeStyle = '#2f6fb0';
      x.beginPath();
      for (const r of rings) r.forEach((p, i) => { const X = (p.x / mm) * k, Y = (px.h - p.y / mm) * k; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
      x.fill('evenodd'); x.stroke();
      $('#trInfo').textContent = `${rings.length} Umrisse, ${fmt(val('trW'))} × ${fmt(((val('trW') || 100) * px.h) / px.w)} mm`;
    };
    const r = await modal('Bild nachzeichnen', html, [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen', primary: true, value: 'ok' }], { onOpen: (b) => { b.addEventListener('input', prev); prev(); }, noFocus: true });
    if (r !== 'ok' || !rings.length) return;
    const o = SH.make('poly', { name: f.name.replace(/\.[^.]+$/, ''), lines: rings.map((pts) => ({ pts, closed: true })) });
    const b = geo.bounds(rings);
    translateObj(o, S.doc.stock.w / 2 - (b.x0 + b.x1) / 2, S.doc.stock.h / 2 - (b.y0 + b.y1) / 2);
    addObjects([o]);
    setMode('design');
  }

  // Schwarz-Weiß-Bild -> 3D-Relief (schwarz = tief, grau = dazwischen, weiß = flach), mit 3D-Vorschau
  let relView = null, relCanvas = null;
  async function importRelief(given) {
    const f = given || (await pickFile('image/*', 'url'));
    if (!f) return;
    const img = await loadImage(f.data).catch(() => null);
    if (!img) { modal('Fehler', '<p>Das Bild konnte nicht gelesen werden.</p>'); return; }
    const asp = img.height / img.width;
    const st = S.doc.stock;
    const w0 = Math.max(10, Math.min(st.w * 0.8, (st.h * 0.8) / asp));
    let aiDepth = null, aiBusy = false;
    const html = `${field('Bildart', `<select id="rlMode"><option value="gray">Höhenbild / Graustufen (hell = hoch, dunkel = tief)</option><option value="ai">Foto oder Render – KI schätzt die Tiefe</option></select>`)}
      <div id="rlAi" class="hidden">
        <div class="info" id="rlAiInfo">Die KI erkennt aus Licht und Schatten, was vorne und hinten ist, und macht daraus eine Höhenkarte.</div>
        <div class="row"><button id="rlAiRun" class="primary">KI-Tiefe berechnen</button><button id="rlAiFile" title="Falls kein Internet: Modelldatei (depth-anything-v2-small, .onnx) von Hand wählen">Modelldatei wählen…</button></div>
        ${field('Feine Details aus dem Bild', `<input id="rlDet" type="range" min="0" max="1" step="0.05" value="0.3">`)}
      </div>
      <div class="relgrid"><div>
        <canvas id="rlPrev" width="320" height="${Math.round(320 * Math.min(1.4, asp))}"></canvas>
        <div class="graybar"></div><div class="graylbl" id="rlLbl"><span>schwarz = tief</span><span>grau = dazwischen</span><span>weiß = flach</span></div>
      </div><div id="rl3d"></div></div>
      <div class="grid2">${field('Breite', inputN('rlW', w0.toFixed(0), 1, 'min="1"'), 'mm')}${field('Höhe', inputN('rlH', (w0 * asp).toFixed(1), 1, 'min="1"'), 'mm')}</div>
      <div class="grid2">${field('Tiefe (tiefste Stelle)', inputN('rlD', Math.min(5, st.t * 0.6).toFixed(1), 0.5, 'min="0.1"'), 'mm')}
        ${field('Auflösung', `<select id="rlR"><option value="300">normal</option><option value="500" selected>fein</option><option value="800">sehr fein</option></select>`)}</div>
      ${field('Grautöne <span class="muted small">(links höher, rechts tiefer)</span>', `<input id="rlG" type="range" min="0.3" max="3" step="0.05" value="1">`)}
      ${field('Glätten', `<input id="rlS" type="range" min="0" max="6" value="1">`)}
      <label class="check"><input type="checkbox" id="rlI"> umkehren (weiß = tief, schwarz = flach)</label>
      <label class="check"><input type="checkbox" id="rlOps" checked> Fräsbahnen gleich anlegen (schruppen + schlichten)</label>
      <p id="rlInfo" class="muted small"></p>`;
    const aiMode = () => $('#rlMode') && $('#rlMode').value === 'ai';
    const heights = (maxPx) => {
      const px = imagePixels(img, maxPx);
      const sm = Math.round(val('rlS')) * (maxPx > 200 ? 1 : 0.5) | 0;
      let f32;
      if (aiMode() && aiDepth) {
        // KI-Tiefe auf Bildgröße bringen, feine Details aus der Helligkeit dazu, dann glätten
        const lum = FS.relief.heightsFromRGBA(px.data, px.w, px.h, 0);
        f32 = FS.depthAI.addDetail(FS.depthAI.resample(aiDepth, px.w, px.h), lum, px.w, px.h, val('rlDet') * 0.5, Math.max(1, Math.round(px.w / 150)));
        if (sm > 0) f32 = FS.relief.blur(px.w, px.h, f32, sm);
      } else f32 = FS.relief.heightsFromRGBA(px.data, px.w, px.h, sm);
      const gm = val('rlG') || 1, inv = $('#rlI').checked;
      for (let i = 0; i < f32.length; i++) { let v = Math.pow(Math.max(0, Math.min(1, f32[i])), gm); if (inv) v = 1 - v; f32[i] = v; }
      return { nx: px.w, ny: px.h, f32 };
    };
    let tmr = 0;
    const prev = () => {
      const c = $('#rlPrev');
      if (!c) return;
      const x = c.getContext('2d');
      x.filter = $('#rlI').checked ? 'invert(1)' : 'none';
      if (aiMode() && aiDepth) {
        // KI-Höhenkarte als Graustufenbild zeigen
        const hm = heights(320), id = x.createImageData(hm.nx, hm.ny);
        for (let i = 0; i < hm.f32.length; i++) { const v = hm.f32[i] * 255; id.data.set([v, v, v, 255], i * 4); }
        const t = document.createElement('canvas'); t.width = hm.nx; t.height = hm.ny; t.getContext('2d').putImageData(id, 0, 0);
        x.filter = 'none';
        x.drawImage(t, 0, 0, c.width, c.height);
      } else x.drawImage(img, 0, 0, c.width, c.height);
      $('#rlLbl').innerHTML = aiMode() ? '<span>hinten = tief</span><span>KI-Höhenkarte</span><span>vorne = hoch</span>' : '<span>schwarz = tief</span><span>grau = dazwischen</span><span>weiß = flach</span>';
      clearTimeout(tmr);
      tmr = setTimeout(() => {
        if (!relView || !$('#rl3d')) return;
        const hm = heights(160), depth = Math.max(0.1, val('rlD')), w = Math.max(1, val('rlW'));
        const cell = w / (hm.nx - 1);
        const h = new Float32Array(hm.nx * hm.ny);
        for (let j = 0; j < hm.ny; j++) for (let i = 0; i < hm.nx; i++) h[(hm.ny - 1 - j) * hm.nx + i] = -depth * (1 - hm.f32[j * hm.nx + i]);
        relView.setStock({ w: (hm.nx - 1) * cell, h: (hm.ny - 1) * cell, t: depth + Math.max(2, depth * 0.4) }, material().color);
        relView.setHeights({ nx: hm.nx, ny: hm.ny, cell, h });
        if (!relView.placed) { relView.preset('iso'); relView.cam.dist *= 0.75; relView.placed = true; }
      }, 120);
      $('#rlInfo').textContent = `Relief ${fmt(val('rlW'))} × ${fmt(val('rlH'))} mm, ${fmt(val('rlD'))} mm tief${val('rlD') > st.t ? ' – tiefer als das Material!' : ''}`;
    };
    const r = await modal('3D-Relief aus Bild', html, [{ label: 'Abbrechen', value: null }, { label: 'Erstellen', primary: true, value: 'ok' }], {
      wide: true,
      onOpen: (body) => {
        if (!relCanvas) { relCanvas = document.createElement('canvas'); relCanvas.id = 'relPrev3d'; }
        $('#rl3d', body).appendChild(relCanvas);
        if (!relView) { try { relView = new FS.View3D(relCanvas); } catch (e) { $('#rl3d', body).innerHTML = '<p class="muted small">3D-Vorschau nicht verfügbar (WebGL2).</p>'; } }
        if (relView) relView.placed = false;
        const aiInfo = (t, err) => { const el = $('#rlAiInfo'); if (el) { el.className = err ? 'errbox' : 'info'; el.innerHTML = t; } };
        const runAi = async () => {
          if (aiBusy) return;
          aiBusy = true;
          $('#rlAiRun').disabled = true;
          try {
            aiDepth = await FS.depthAI.estimate(img, (m) => aiInfo(esc(m)));
            aiInfo('Fertig. Die KI-Höhenkarte ist links zu sehen, rechts das 3D-Ergebnis. Mit „Feine Details“ kommen Strukturen (Haare, Fell) aus dem Bild dazu.');
            prev();
          } catch (e) {
            aiInfo(`Die KI konnte nicht geladen werden: ${esc(e.message)}<br>Ohne Internet: die Datei <b>model_quantized.onnx</b> von <a href="${FS.depthAI.MODEL_URL}" target="_blank" rel="noopener">HuggingFace (Depth Anything V2 Small)</a> laden und mit „Modelldatei wählen…“ öffnen.`, true);
          } finally { aiBusy = false; const b = $('#rlAiRun'); if (b) b.disabled = false; }
        };
        $('#rlMode', body).addEventListener('change', async () => {
          $('#rlAi').classList.toggle('hidden', !aiMode());
          if (aiMode() && !aiDepth) {
            const src = await FS.depthAI.modelSource();
            if (src === 'internet') aiInfo('Beim ersten Mal wird das KI-Modell geladen (ca. 27 MB, einmalig – danach auch ohne Internet). Dann „KI-Tiefe berechnen“ drücken.');
            else runAi();
          }
          prev();
        });
        $('#rlAiRun', body).addEventListener('click', (e) => { e.preventDefault(); runAi(); });
        $('#rlAiFile', body).addEventListener('click', async (e) => {
          e.preventDefault();
          const mf = await pickFile('.onnx', 'buffer');
          if (!mf) return;
          await FS.depthAI.setModelFile(mf.data);
          aiInfo(`Modell „${esc(mf.name)}“ gespeichert.`);
          runAi();
        });
        body.addEventListener('input', (e) => {
          if (e.target.id === 'rlW') $('#rlH').value = (val('rlW') * asp).toFixed(1);
          if (e.target.id === 'rlH') $('#rlW').value = (val('rlH') / asp).toFixed(1);
          prev();
        });
        prev();
      },
    });
    if (r !== 'ok') return;
    const hm = heights(+$('#rlR').value);
    if (aiMode() && !aiDepth) status('Hinweis: Die KI-Tiefe wurde nicht berechnet – das Relief nutzt die Helligkeit.', true);
    const w = Math.max(1, val('rlW')), depth = Math.max(0.1, val('rlD'));
    const o = FS.relief.makeRelief(f.name.replace(/\.[^.]+$/, ''), hm.nx, hm.ny, hm.f32, w, (w * hm.ny) / hm.nx, depth);
    assets.set(o.hm.id, o.hm);
    o.tf = M.translate(st.w / 2, st.h / 2);
    snapshot();
    S.doc.objects.push(o);
    S.sel = [o.id];
    if ($('#rlOps') ? $('#rlOps').checked : true) {
      const r1 = CAM.makeOp('relief_rough', [o.id], defaultTool('relief_rough'));
      const r2 = CAM.makeOp('relief_finish', [o.id], defaultTool('relief_finish'));
      r1.name = o.name + ' schruppen'; r2.name = o.name + ' schlichten';
      S.doc.ops.push(r1, r2);
      S.selOp = r2.id;
    }
    changed();
    setMode('design');
    status(depth > st.t ? 'Achtung: Relief ist tiefer als das Material.' : 'Relief erstellt. Taste 3 zeigt das Ergebnis in der 3D-Vorschau.', depth > st.t);
  }

  async function importStl(given) {
    const f = given || (await pickFile('.stl', 'buffer'));
    if (!f) return;
    let ras;
    try { ras = FS.importers.rasterSTL(FS.importers.parseSTL(f.data), 600); } catch (e) { modal('Fehler', `<p>${esc(e.message)}</p>`); return; }
    const k0 = Math.min(1, (S.doc.stock.w * 0.8) / ras.w, (S.doc.stock.h * 0.8) / ras.h);
    const html = `<p>Modell: ${fmt(ras.w)} × ${fmt(ras.h)} mm, Höhe ${fmt(ras.zr)} mm. Gefräst wird die Ansicht von oben.</p>
      <div class="grid2">${field('Breite', inputN('slW', (ras.w * k0).toFixed(1), 0.5), 'mm')}${field('Tiefe', inputN('slD', Math.min(ras.zr * k0, S.doc.stock.t).toFixed(2), 0.1), 'mm')}</div>
      <label class="check"><input type="checkbox" id="slK" checked> Tiefe im gleichen Maßstab wie die Breite</label>`;
    const r = await modal('3D-Modell als Relief', html, [{ label: 'Abbrechen', value: null }, { label: 'Erstellen', primary: true, value: 'ok' }], {
      onOpen: (b) => b.addEventListener('input', (e) => { if (e.target.id === 'slW' && $('#slK').checked) $('#slD').value = ((val('slW') / ras.w) * ras.zr).toFixed(2); }),
    });
    if (r !== 'ok') return;
    const w = Math.max(1, val('slW'));
    const o = FS.relief.makeRelief(f.name.replace(/\.[^.]+$/, ''), ras.nx, ras.ny, ras.f32, w, (w * ras.h) / ras.w, Math.max(0.1, val('slD')));
    assets.set(o.hm.id, o.hm);
    o.tf = M.translate(S.doc.stock.w / 2, S.doc.stock.h / 2);
    addObjects([o]);
    setMode('design');
    if (val('slD') > S.doc.stock.t) status('Achtung: Relief ist tiefer als das Material.', true);
  }

  function exportSvg() {
    const st = S.doc.stock;
    let body = '';
    for (const o of S.doc.objects) {
      if (o.hidden || o.kind === 'relief') continue;
      const d = geom(o).map((l) => l.pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(3)} ${(st.h - p.y).toFixed(3)}`).join('') + (l.closed ? 'Z' : '')).join('');
      body += `<path d="${d}" fill="none" stroke="#000" stroke-width="0.2"/>\n`;
    }
    download((S.doc.name || tr('Zeichnung')) + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${st.w}mm" height="${st.h}mm" viewBox="0 0 ${st.w} ${st.h}">\n${body}</svg>\n`, 'image/svg+xml');
  }

  // ---------------------------------------------------------------- Fräsbahnen
  const ctxCam = () => ({ objects: S.doc.objects, tools: S.doc.tools, stock: S.doc.stock, machine: S.machine });
  function opKey(op) {
    const objs = op.objIds.map(objById).filter(Boolean);
    const tool = S.doc.tools.find((t) => t.id === op.toolId);
    const extra = op.type === 'vcarve' && op.clearToolId ? S.doc.tools.find((t) => t.id === op.clearToolId)
      : op.type === 'relief_rest' && op.refToolId ? S.doc.tools.find((t) => t.id === op.refToolId) : null;
    return serial({ op, objs, tool, extra, st: S.doc.stock, m: [S.machine.maxFeed, S.machine.maxZFeed, S.machine.maxRpm] });
  }
  function resultFor(op) {
    const key = opKey(op);
    const c = S.results.get(op.id);
    if (c && c.key === key) return c;
    const res = CAM.compute(op, ctxCam());
    const gc = FS.gcode.build([res], { ...ctxCam(), name: S.doc.name });
    const r = { key, res, time: gc.time, stale: false };
    S.results.set(op.id, r);
    return r;
  }
  let computeToken = 0;
  function computeAll() {
    const tok = ++computeToken;
    const todo = S.doc.ops.filter((op) => { const c = S.results.get(op.id); return !c || c.key !== opKey(op); });
    if (!todo.length) { redraw(); return Promise.resolve(); }
    $('#busy').classList.remove('hidden');
    return new Promise((resolve) => {
      const step = () => {
        if (tok !== computeToken) return resolve();
        const op = todo.shift();
        if (op && S.doc.ops.includes(op)) resultFor(op);
        if (todo.length) setTimeout(step, 0);
        else { $('#busy').classList.add('hidden'); if (S.mode === 'cam') renderCam(); redraw(); resolve(); }
      };
      setTimeout(step, 10);
    });
  }

  function defaultTool(type) {
    const T = S.doc.tools;
    const pick = (f) => (T.find(f) || T[0]).id;
    if (type === 'vcarve' || type === 'engrave') return pick((t) => t.type === 'vbit' && t.angle >= 60);
    if (type === 'relief_finish') return pick((t) => t.type === 'ball');
    if (type === 'relief_rest') {
      const fine = T.filter((t) => t.type === 'taperball' || (t.type === 'ball' && t.d < 2)).sort((a, b) => TL.effD(a) - TL.effD(b));
      return (fine[0] || T[0]).id;
    }
    if (type === 'drill') return pick((t) => t.type === 'flat');
    if (type === 'face') return pick((t) => t.type === 'flat' && t.d >= 3);
    return pick((t) => t.type === 'flat' && Math.abs(t.d - 3.175) < 0.01);
  }
  function addOp(type) {
    const objs = selObjs();
    if (type !== 'face' && !objs.length) { status('Bitte zuerst in der Zeichnung auswählen, was gefräst werden soll.', true); return; }
    if (type.startsWith('relief') && !objs.some((o) => o.kind === 'relief')) { status('Für 3D-Bearbeitungen ein Relief auswählen (Datei → 3D-Relief aus Bild / STL).', true); return; }
    snapshot();
    const op = CAM.makeOp(type, type === 'face' ? [] : objs.map((o) => o.id), defaultTool(type));
    if (type === 'profile') { op.depth = +(S.doc.stock.t + 0.3).toFixed(2); op.tabs = true; op.tabHeight = Math.min(2, S.doc.stock.t / 3); }
    if (type === 'pocket') op.depth = Math.min(3, S.doc.stock.t / 2);
    if (type === 'drill') op.depth = +(S.doc.stock.t + 0.3).toFixed(2);
    if (type === 'relief_rest') {
      // Vergleich mit dem Werkzeug, mit dem dieses Relief geschlichtet wird
      const prev = S.doc.ops.filter((o) => (o.type === 'relief_finish' || o.type === 'relief_rough') && o.objIds.some((id) => op.objIds.includes(id))).pop();
      op.refToolId = prev ? prev.toolId : defaultTool('relief_finish');
    }
    const n = S.doc.ops.filter((o) => o.type === type).length;
    if (n) op.name += ' ' + (n + 1);
    S.doc.ops.push(op);
    S.selOp = op.id;
    changed();
    computeAll();
  }

  function renderCam() {
    const el = $('#oplist');
    if (!S.doc.ops.length) {
      el.innerHTML = '<div class="empty">Noch keine Fräsbahnen.<br><br>1. In der Zeichnung Objekte anklicken<br>2. Oben eine Bearbeitung wählen</div>';
      $('#opedit').innerHTML = '';
      $('#opSummary').textContent = '';
      $('#opEditPanel').classList.add('hidden');
      return;
    }
    let total = 0;
    el.innerHTML = S.doc.ops.map((op, i) => {
      const r = S.results.get(op.id);
      const t = S.doc.tools.find((x) => x.id === op.toolId);
      const fresh = r && r.key === opKey(op);
      if (op.enabled && fresh) total += r.time;
      const warn = fresh && r.res.warnings.length ? `<span class="w" title="${esc(r.res.warnings.map(tr).join('\n'))}">⚠</span>` : '';
      return `<div class="op ${op.id === S.selOp ? 'sel' : ''} ${op.enabled ? '' : 'off'}" data-op="${op.id}">
        <input type="checkbox" data-en="${op.id}" ${op.enabled ? 'checked' : ''} title="Ein/Aus">
        <span class="dot" style="background:${OP_COLORS[i % OP_COLORS.length]}"></span>
        <span class="n">${esc(op.name)}<br><span class="c">${esc(t ? t.name : '?')}</span></span>${warn}
        <span class="c">${fresh ? FS.gcode.fmtTime(r.time) : '…'}</span>
        <button class="x" data-up="${op.id}" title="Nach oben">▲</button><button class="x" data-del="${op.id}" title="Löschen">✕</button></div>`;
    }).join('');
    $('#opSummary').textContent = `Gesamt ≈ ${FS.gcode.fmtTime(total)}`;
    renderOpEdit();
  }

  $('#oplist').addEventListener('click', (e) => {
    const en = e.target.closest('[data-en]'), up = e.target.closest('[data-up]'), del = e.target.closest('[data-del]');
    if (en) { const op = S.doc.ops.find((o) => o.id === en.dataset.en); snapshot(); op.enabled = en.checked; changed({ keepResults: true }); return; }
    if (up) { const i = S.doc.ops.findIndex((o) => o.id === up.dataset.up); if (i > 0) { snapshot(); [S.doc.ops[i - 1], S.doc.ops[i]] = [S.doc.ops[i], S.doc.ops[i - 1]]; changed({ keepResults: true }); } return; }
    if (del) { snapshot(); S.doc.ops = S.doc.ops.filter((o) => o.id !== del.dataset.del); if (S.selOp === del.dataset.del) S.selOp = null; changed({ keepResults: true }); return; }
    const row = e.target.closest('.op');
    if (row) { S.selOp = row.dataset.op; const op = S.doc.ops.find((o) => o.id === S.selOp); S.sel = op.objIds.slice(); renderCam(); redraw(); }
  });

  function toolOptions(sel, filter) {
    return S.doc.tools.filter(filter || (() => true)).map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  }
  function renderOpEdit() {
    const op = S.doc.ops.find((o) => o.id === S.selOp);
    const panel = $('#opEditPanel');
    if (!op) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    const r = S.results.get(op.id);
    const tool = S.doc.tools.find((t) => t.id === op.toolId) || S.doc.tools[0];
    const auto = TL.cutParams(tool, S.doc.stock.material, S.machine);
    const sel = (id, opts, v) => `<select data-k="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(k) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const nIn = (k, v, step = 0.1, extra = '') => `<input data-k="${k}" type="number" step="${step}" value="${+(+v).toFixed(4)}" ${extra}>`;
    const chk = (k, v, label) => `<label class="check"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${label}</label>`;
    let h = `<h3>${esc(CAM.OP_TYPES[op.type])} <small>${op.objIds.length ? op.objIds.length + ' Objekt(e)' : op.type === 'face' ? 'ganzes Werkstück' : 'keine Objekte!'}</small></h3>`;
    h += field('Name', `<input data-k="name" value="${esc(tr(op.name))}">`);
    h += field('Werkzeug', `<select data-k="toolId">${toolOptions(op.toolId)}</select>`);
    const depthF = (label = 'Tiefe') => field(label, nIn('depth', op.depth, 0.1, 'min="0"'), 'mm');
    switch (op.type) {
      case 'profile':
        h += depthF();
        h += field('Seite', sel('side', [['outside', 'außen (Teil ausschneiden)'], ['inside', 'innen (Loch ausschneiden)'], ['on', 'auf der Linie']], op.side));
        h += field('Fräsrichtung', sel('direction', [['climb', 'Gleichlauf (sauberer)'], ['conventional', 'Gegenlauf']], op.direction));
        h += chk('tabs', op.tabs, 'Haltestege (Teil fällt nicht heraus)');
        if (op.tabs) h += `<div class="grid2">${field('Anzahl', nIn('tabCount', op.tabCount, 1, 'min="1"'))}${field('Breite', nIn('tabWidth', op.tabWidth, 0.5), 'mm')}${field('Höhe', nIn('tabHeight', op.tabHeight, 0.1), 'mm')}</div>`;
        h += chk('ramp', op.ramp, 'Schräg eintauchen (Rampe, schont Fräser)');
        h += `<div class="grid2">${field('Aufmaß', nIn('allowance', op.allowance, 0.05, 'min="0"'), 'mm')}</div>`;
        if (op.allowance > 0) h += chk('finishPass', op.finishPass, 'Schlichtgang auf Endmaß');
        break;
      case 'pocket':
        h += depthF();
        h += field('Strategie', sel('strategy', [['offset', 'konturparallel (Spirale)'], ['raster', 'Zeilen (Zickzack)']], op.strategy));
        if (op.strategy === 'raster') h += field('Zeilenwinkel', nIn('angle', op.angle, 5), '°');
        h += field('Fräsrichtung', sel('direction', [['climb', 'Gleichlauf'], ['conventional', 'Gegenlauf']], op.direction));
        h += field('Überlappung', nIn('stepover', op.stepover || tool.stepover, 1, 'min="5" max="95"'), '%');
        h += field('Aufmaß Rand', nIn('allowance', op.allowance, 0.05, 'min="0"'), 'mm');
        h += chk('ramp', op.ramp, 'Schräg eintauchen (Rampe)');
        break;
      case 'vcarve':
        h += field('Max. Tiefe (0 = ohne)', nIn('maxDepth', op.maxDepth, 0.1, 'min="0"'), 'mm');
        if (op.maxDepth > 0) h += field('Flache Böden ausräumen mit', `<select data-k="clearToolId"><option value="">dem V-Fräser</option>${toolOptions(op.clearToolId, (t) => t.type === 'flat')}</select>`);
        h += field('Genauigkeit', sel('step', [[0.4, 'grob (schnell)'], [0.2, 'normal'], [0.1, 'fein'], [0.05, 'sehr fein']], op.step));
        if (tool.type !== 'vbit') h += '<div class="warnbox">Bitte einen V-Fräser wählen.</div>';
        break;
      case 'engrave': h += depthF(); break;
      case 'drill':
        h += depthF();
        if (tool.type === 'drill') h += field('Entspänen alle', nIn('peck', op.peck, 0.5, 'min="0"'), 'mm');
        else h += '<p class="muted small">Mit Schaftfräser werden größere Löcher spiralförmig (Helix) gefräst.</p>';
        break;
      case 'face':
        h += depthF('Abtrag');
        h += field('Überstand am Rand', nIn('margin', op.margin, 0.5), 'mm');
        h += field('Überlappung', nIn('stepover', op.stepover || tool.stepover, 1, 'min="5" max="95"'), '%');
        break;
      case 'relief_rough':
        h += field('Aufmaß', nIn('allowance', op.allowance, 0.05, 'min="0"'), 'mm');
        h += field('Überlappung', nIn('stepover', op.stepover || tool.stepover, 1, 'min="5" max="95"'), '%');
        break;
      case 'relief_rest':
        h += field('Vorheriges Werkzeug', `<select data-k="refToolId">${toolOptions(op.refToolId, (t) => t.id !== op.toolId && t.type !== 'drill')}</select>`);
        h += field('Richtung', sel('angle', [[0, 'Zeilen in X'], [90, 'Zeilen in Y']], op.angle || 0));
        h += field('Überlappung', nIn('stepover', op.stepover || tool.stepover, 1, 'min="2" max="60"'), '%');
        h += field('Nur wo mehr Rest als', nIn('minRest', op.minRest || 0.05, 0.01, 'min="0.01"'), 'mm');
        h += '<p class="muted small">Der feine Fräser arbeitet nur dort, wo das vorherige Werkzeug nicht hinkam (enge Rillen, Haare, Augen). Erst schlichten, dann diese Bahn.</p>';
        break;
      case 'relief_finish':
        h += field('Richtung', sel('dir', [['x', 'Zeilen in X'], ['y', 'Zeilen in Y'], ['both', 'X und Y (feiner)']], op.both ? 'both' : op.angle === 90 ? 'y' : 'x'));
        h += field('Überlappung', nIn('stepover', op.stepover || tool.stepover, 1, 'min="2" max="60"'), '%');
        break;
    }
    h += `<details ${op.stepdown || op.feed || op.plunge || op.rpm || op.startDepth ? 'open' : ''}><summary class="muted">Schnittwerte (leer = automatisch)</summary>
      <div class="grid2">
        ${field('Zustellung', `<input data-k="stepdown" type="number" step="0.05" placeholder="${auto.stepdown}" value="${op.stepdown || ''}">`, 'mm')}
        ${field('Vorschub', `<input data-k="feed" type="number" step="10" placeholder="${auto.feed}" value="${op.feed || ''}">`, 'mm/min')}
        ${field('Eintauchen', `<input data-k="plunge" type="number" step="10" placeholder="${auto.plunge}" value="${op.plunge || ''}">`, 'mm/min')}
        ${field('Drehzahl', `<input data-k="rpm" type="number" step="100" placeholder="${auto.rpm}" value="${op.rpm || ''}">`, 'U/min')}
        ${field('Starttiefe', `<input data-k="startDepth" type="number" step="0.1" value="${op.startDepth || 0}">`, 'mm')}
      </div></details>`;
    if (op.type !== 'face') h += `<div class="row"><button data-act="assign" class="wide" title="Aktuelle Auswahl für diese Fräsbahn verwenden">Auswahl übernehmen (${S.sel.length})</button><button data-act="tools">Werkzeuge…</button></div>`;
    else h += `<div class="row"><button data-act="tools">Werkzeuge…</button></div>`;
    if (r && r.key === opKey(op)) {
      for (const w of r.res.warnings) h += `<div class="warnbox">${esc(w)}</div>`;
      h += `<p class="muted small">${tr('Dauer')} ≈ ${FS.gcode.fmtTime(r.time)} · ${tr('Vorschub')} ${r.res.cut.feed} mm/min · ${tr('Zustellung')} ${fmt(r.res.cut.stepdown)} mm · ${rpmText(r.res.cut.rpm)}</p>`;
    }
    $('#opedit').innerHTML = h;
  }
  $('#opedit').addEventListener('change', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const op = S.doc.ops.find((o) => o.id === S.selOp);
    if (!op) return;
    snapshot();
    const t = e.target;
    if (t.type === 'checkbox') op[k] = t.checked;
    else if (k === 'dir') { op.both = t.value === 'both'; op.angle = t.value === 'y' ? 90 : 0; }
    else if (t.type === 'number') op[k] = t.value === '' ? 0 : num(t.value);
    else if (k === 'step' || k === 'angle') op[k] = +t.value;
    else op[k] = t.value;
    if (k === 'toolId') { op.stepdown = 0; op.feed = 0; op.plunge = 0; op.rpm = 0; }
    changed({ keepResults: true });
    computeAll();
  });
  $('#opedit').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const op = S.doc.ops.find((o) => o.id === S.selOp);
    if (a.dataset.act === 'assign' && op) {
      if (!S.sel.length) { status('Erst in der Zeichnung Objekte auswählen.', true); return; }
      snapshot(); op.objIds = S.sel.slice(); changed({ keepResults: true }); computeAll();
    }
    if (a.dataset.act === 'tools') toolLibrary(op && op.toolId).then(() => computeAll());
  });
  $$('[data-addop]').forEach((b) => b.addEventListener('click', () => addOp(b.dataset.addop)));

  async function buildAll(filterTool) {
    await computeAll();
    const ops = S.doc.ops.filter((op) => op.enabled);
    const res = ops.map((op) => resultFor(op).res).filter((r) => !filterTool || r.tool.id === filterTool);
    return FS.gcode.build(res, { ...ctxCam(), name: S.doc.name });
  }

  async function exportGcode() {
    const ops = S.doc.ops.filter((o) => o.enabled);
    if (!ops.length) { status('Keine (aktiven) Fräsbahnen vorhanden.', true); setMode('cam'); return; }
    await computeAll();
    const toolIds = [...new Set(ops.flatMap((op) => { const r = resultFor(op).res; return [r.tool.id].concat(r.clear && r.clear.chains.length ? [r.clear.tool.id] : []); }))];
    const gc = await buildAll();
    const warns = ops.flatMap((op) => resultFor(op).res.warnings.map((w) => `${tr(op.name)}: ${tr(w)}`));
    let html = `<p>Laufzeit ≈ <b>${FS.gcode.fmtTime(gc.time)}</b> · ${FS.gcode.lineCount(gc.text)} Zeilen · ${toolIds.length} Werkzeug(e)</p>
      <div class="info">${tr('Nullpunkt')}: X/Y ${esc(tr(zeroText(S.doc.stock.zeroXY)))}, Z ${tr(S.doc.stock.zeroZ === 'bottom' ? 'auf der Tischoberfläche' : 'auf der Materialoberfläche')}.</div>`;
    if (warns.length) html += warns.map((w) => `<div class="warnbox">${esc(w)}</div>`).join('');
    if (toolIds.length > 1) html += `<label class="check"><input type="radio" name="gsplit" value="one" checked> Eine Datei – das Programm hält beim Werkzeugwechsel an (M0)</label>
      <label class="check"><input type="radio" name="gsplit" value="split"> Je Werkzeug eine eigene Datei (empfohlen für SD-Karte / Candle)</label>`;
    html += field('Dateiendung', `<select id="gExt"><option value="nc">.nc</option><option value="gcode">.gcode</option><option value="tap">.tap</option></select>`);
    const r = await modal('G-Code speichern', html, [{ label: 'Abbrechen', value: null }, { label: 'Speichern', primary: true, value: 'ok' }], { noFocus: true });
    if (r !== 'ok') return;
    const ext = $('#gExt').value;
    const base = (S.doc.name || tr('Projekt')).replace(/[^\w\-]+/g, '_');
    const split = $('input[name=gsplit]:checked') && $('input[name=gsplit]:checked').value === 'split';
    if (!split) download(`${base}.${ext}`, gc.text);
    else {
      let i = 1;
      for (const tid of toolIds) {
        const t = S.doc.tools.find((x) => x.id === tid);
        const res = ops.map((op) => resultFor(op).res).flatMap((rr) => {
          const out = [];
          if (rr.tool.id === tid) out.push({ ...rr, clear: null });
          if (rr.clear && rr.clear.tool.id === tid) out.push({ ...rr, chains: rr.clear.chains, tool: rr.clear.tool, cut: rr.clear.cut, clear: null, op: { ...rr.op, name: rr.op.name + ' Ausräumen' } });
          return out;
        });
        const g = FS.gcode.build(res, { ...ctxCam(), name: S.doc.name });
        download(`${base}_${i++}_${t.name.replace(/[^\w]+/g, '_').slice(0, 30)}.${ext}`, g.text);
      }
    }
    status('G-Code gespeichert.');
  }
  const rpmText = (rpm) => {
    const d = S.machine.spindle === 'manual' ? TL.dialFor(rpm, S.machine) : null;
    return d ? `${tr('Drehregler Stufe')} ${d.step} (≈ ${d.rpm.toLocaleString(loc())} ${tr('U/min')})` : `${rpm.toLocaleString(loc())} ${tr('U/min')}`;
  };
  const zeroText = (z) => ({ ll: 'links unten', lc: 'unten Mitte', lr: 'rechts unten', cl: 'links Mitte', c: 'Mitte', cr: 'rechts Mitte', ul: 'links oben', uc: 'oben Mitte', ur: 'rechts oben' }[z || 'll']);

  // ---------------------------------------------------------------- 3D-Vorschau
  let view3d = null;
  async function enterSim() {
    if (!view3d) {
      try { view3d = new FS.View3D($('#cv3d')); view3d.wheelZoom = wheelZoom; } catch (e) { modal('3D-Vorschau nicht möglich', `<p>${esc(e.message)}</p><p>Bitte einen aktuellen Chrome, Edge oder Firefox verwenden.</p>`); return; }
    }
    const gc = await buildAll();
    S.gc = gc;
    S.simMoves = gc.moves;
    S.sim = FS.sim.create(S.doc.stock);
    view3d.setStock(S.doc.stock, material().color);
    view3d.setHeights(S.sim);
    view3d.setPaths(gc.moves);
    view3d.progress = -1;
    view3d.setTool(null);
    if (!view3d.positioned) { view3d.preset('iso'); view3d.positioned = true; }
    S.simPlaying = false;
    $('#simPlay').textContent = '▶ Abspielen';
    const ops = S.doc.ops.filter((o) => o.enabled);
    $('#simOps').innerHTML = ops.length ? ops.map((op, i) => {
      const r = resultFor(op);
      return `<div class="op"><span class="dot" style="background:${OP_COLORS[S.doc.ops.indexOf(op) % OP_COLORS.length]}"></span><span class="n">${i + 1}. <!---->${esc(op.name)}<br><span class="c">${esc(r.res.tool.name)}</span></span><span class="c">${FS.gcode.fmtTime(r.time)}</span></div>`;
    }).join('') : '<div class="empty">Keine Fräsbahnen – zuerst im Schritt 2 anlegen.</div>';
    $('#simWarn').innerHTML = gc.toolChanges ? `<div class="info">${gc.toolChanges} Werkzeugwechsel – das Programm hält dort an.</div>` : '';
    simInfo();
  }
  function simInfo() {
    const n = S.simMoves ? S.simMoves.length : 0;
    const i = S.sim ? S.sim.mi : 0;
    $('#simBar').style.width = n ? `${(100 * i) / n}%` : '0';
    const warn = S.sim && S.sim.warnings.size ? [...S.sim.warnings].map((w) => `<div class="errbox">${esc(w)}</div>`).join('') : '';
    $('#simInfo').innerHTML = S.gc ? `Laufzeit ≈ ${FS.gcode.fmtTime(S.gc.time)} · ${n} Bewegungen${warn}` : '';
  }
  function simFrame() {
    if (!S.simPlaying || S.mode !== 'sim') return;
    const sp = val('simSpeed');
    const budget = Math.round(30 * Math.pow(1.09, sp));
    const done = FS.sim.run(S.sim, S.simMoves, null, budget);
    const m = S.simMoves[Math.max(0, S.sim.mi - 1)];
    if (m) {
      if (view3d.curTool !== m.tool) { view3d.setTool(m.tool); view3d.curTool = m.tool; }
      view3d.toolPos = m;
    }
    view3d.progress = S.sim.mi;
    view3d.setHeights(S.sim);
    simInfo();
    if (done) { S.simPlaying = false; $('#simPlay').textContent = '▶ Abspielen'; view3d.toolPos = null; view3d.dirty = true; status('Simulation fertig.'); return; }
    requestAnimationFrame(simFrame);
  }
  $('#simPlay').onclick = () => {
    if (!S.sim) return;
    if (S.sim.mi >= S.simMoves.length) { FS.sim.reset(S.sim); }
    S.simPlaying = !S.simPlaying;
    $('#simPlay').textContent = S.simPlaying ? '⏸ Pause' : '▶ Abspielen';
    if (S.simPlaying) requestAnimationFrame(simFrame);
  };
  $('#simEnd').onclick = () => {
    if (!S.sim) return;
    S.simPlaying = false;
    $('#simPlay').textContent = '▶ Abspielen';
    $('#busy').classList.remove('hidden');
    $('#busy span').textContent = 'Simuliere …';
    const step = () => {
      const done = FS.sim.run(S.sim, S.simMoves, null, 400000);
      view3d.progress = S.sim.mi;
      simInfo();
      if (!done) { setTimeout(step, 0); return; }
      view3d.setHeights(S.sim);
      view3d.toolPos = null;
      $('#busy').classList.add('hidden');
      $('#busy span').textContent = 'Fräsbahnen werden berechnet …';
    };
    setTimeout(step, 20);
  };
  $('#simReset').onclick = () => { if (!S.sim) return; S.simPlaying = false; $('#simPlay').textContent = '▶ Abspielen'; FS.sim.reset(S.sim); view3d.setHeights(S.sim); view3d.progress = -1; view3d.toolPos = null; simInfo(); };
  $('#simPaths').onchange = (e) => { if (view3d) { view3d.showPaths = e.target.checked; view3d.dirty = true; } };
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => view3d && view3d.preset(b.dataset.view)));

  // ---------------------------------------------------------------- Maschine
  let alarmHinted = false;
  function machineInit() {
    if (S.grbl) return;
    const g = (S.grbl = new FS.Grbl());
    g.on('connect', () => {
      alarmHinted = false;
      $('#mConnect').textContent = 'Trennen'; $('#mConnect').classList.remove('primary');
      log(`${tr('Verbunden')} (${{ usb: 'USB' + (g.baud ? ', ' + g.baud + ' Baud' : ''), bridge: tr('WLAN über den Server'), ws: tr('WLAN direkt') }[g.kind] || g.kind}).`, 'info');
      updConn();
    });
    g.on('disconnect', (lost) => {
      $('#mConnect').textContent = 'Verbinden …'; $('#mConnect').classList.add('primary');
      log(lost ? 'Verbindung verloren.' : 'Getrennt.', lost ? 'err' : 'info'); updConn();
      if (lost && !g.job) status('Verbindung zur Maschine verloren.', true);
    });
    g.on('status', (st) => {
      const el = $('#mState');
      const names = { Idle: 'Bereit', Run: 'Läuft', Hold: 'Angehalten', Jog: 'Verfährt', Alarm: 'ALARM – entsperren', Door: 'Tür offen', Check: 'Prüfmodus', Home: 'Referenzfahrt', Sleep: 'Ruhezustand', Getrennt: 'Getrennt' };
      el.textContent = names[st.state] || st.state;
      el.className = 'state ' + st.state;
      $('#droX').textContent = fmt3(st.wpos.x); $('#droY').textContent = fmt3(st.wpos.y); $('#droZ').textContent = fmt3(st.wpos.z);
      $('#ovF').textContent = st.ov[0] + ' %'; $('#ovS').textContent = st.ov[2] + ' %';
      updConn();
      if (st.state === 'Alarm' && !alarmHinted) { alarmHinted = true; log('Die Maschine steht im Alarm (nach dem Einschalten normal): „Entsperren“ ($X) oder „Referenzfahrt“ ($H) drücken.', 'err'); }
      if (S.mode === 'machine') redraw();
    });
    g.on('log', (l, cls) => log(l, cls));
    g.on('alarm', (code, txt) => { modal('Alarm ' + code, `<p>${esc(txt || 'Die Maschine meldet einen Alarm.')}</p><p>Mit <b>Entsperren</b> ($X) oder <b>Referenzfahrt</b> geht es weiter. Prüfe vorher, ob alles frei ist.</p>`); });
    g.on('progress', (j) => jobUi(j));
    g.on('jobdone', (j) => {
      jobUi(null);
      if (j.lost) modal('Verbindung während des Auftrags verloren', `<p>Die Verbindung zur Maschine ist abgebrochen, während „${esc(j.name)}“ lief (Zeile ${j.acked} von ${j.total}).</p><p><b>Bitte an der Maschine prüfen:</b> Die Spindel läuft evtl. noch. Im Zweifel den Not-Aus bzw. den Spindelschalter benutzen. Danach neu verbinden, Nullpunkt prüfen und ggf. neu starten.</p>`);
      else if (!j.aborted) modal('Fertig', `<p>Auftrag „${esc(j.name)}“ abgeschlossen in ${FS.gcode.fmtTime((Date.now() - j.start) / 1000)}.${j.errors ? ` <b>${j.errors} Fehlermeldung(en)</b> – siehe Konsole.` : ''}</p>`);
    });
    g.on('toolchange', (msg) => toolChangeDialog(msg));
  }
  const fmt3 = (v) => (Math.round(v * 1000) / 1000).toLocaleString(loc(), { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  function updConn() {
    const st = S.grbl ? S.grbl.status.state : 'Getrennt';
    const d = $('#connDot');
    d.className = !S.grbl || !S.grbl.connected ? '' : st === 'Alarm' ? 'alarm' : st === 'Run' || st === 'Jog' || st === 'Hold' ? 'run' : 'on';
    d.title = S.grbl && S.grbl.connected ? 'Maschine: ' + st : 'Maschine nicht verbunden';
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
    if (!S.grbl || !S.grbl.connected) { status('Bitte zuerst die Maschine verbinden.', true); return false; }
    return true;
  };
  $('#mConnect').onclick = async () => {
    machineInit();
    if (S.grbl.connected) { if (S.grbl.job && !(await confirmBox('Trennen?', 'Ein Auftrag läuft. Wirklich trennen?', 'Trennen', true))) return; S.grbl.disconnect(); return; }
    connectDialog();
  };
  $('#mWifi').onclick = () => { machineInit(); wifiAssistant(); };

  // ---- Verbindungsdialog: USB, WLAN über den Server, WLAN direkt
  async function connectDialog() {
    const env = FS.Grbl.env();
    const saved = Object.assign({ kind: 'usb', host: '', baud: 'auto' }, store.get('fs.conn', {}));
    let cfg = { enabled: false, host: '' };
    if (env.server) { try { const r = await fetch('/api/cnc/config', { headers: { 'X-Requested-With': 'StickStudio' } }); if (r.ok) cfg = await r.json(); } catch (e) { /* Seite ohne Server */ } }
    const can = {
      usb: env.serial,
      bridge: env.server && cfg.enabled,
      ws: env.direct,
    };
    const why = {
      usb: !env.secure ? 'Geht nicht auf unverschlüsselten (http://) Seiten – FräsStudio per Doppelklick oder über https öffnen.' : 'Nur in Chrome oder Edge am Computer.',
      bridge: !env.server ? 'Nur wenn FräsStudio über den StickStudio-Server geöffnet ist (https://…/fraesstudio/).' : 'Am Server abgeschaltet.',
      ws: 'Geht nicht von einer https-Seite aus. Nutze „WLAN über den Server“.',
    };
    if (!can[saved.kind]) saved.kind = can.usb ? 'usb' : can.bridge ? 'bridge' : can.ws ? 'ws' : 'usb';
    if (!saved.host && cfg.host) saved.host = cfg.host;
    const row = (k, title, text) => `<label class="connopt ${can[k] ? '' : 'off'}"><input type="radio" name="ck" value="${k}" ${saved.kind === k ? 'checked' : ''} ${can[k] ? '' : 'disabled'}><span><b>${title}</b><br><span class="muted small">${can[k] ? text : esc(why[k])}</span></span></label>`;
    const html = `
      ${row('usb', 'USB-Kabel', 'Am sichersten. Fräse per USB am Computer, Maschine eingeschaltet. Es erscheint eine Liste der Anschlüsse – den der Fräse wählen (meist „USB-SERIAL CH340“).')}
      ${row('bridge', 'WLAN über den Server', 'Empfohlen für WLAN. Der Server im Heimnetz verbindet sich per Telnet (Port 23) mit der Maschine. Sicher: Not-Aus bei Verbindungsabbruch.')}
      ${row('ws', 'WLAN direkt (experimentell)', 'Ohne Server, direkt aus dem Browser (WebSocket). Etwas träge, gut für Verfahren und kurze Aufträge.')}
      <div id="cnWifi" class="${saved.kind === 'usb' ? 'hidden' : ''}">
        ${field('IP-Adresse der Maschine', `<input id="cnHost" value="${esc(saved.host || '')}" placeholder="z. B. 192.168.1.50  (oder IP:Port)" autocomplete="off">`)}
        ${cfg.host ? `<p class="muted small">Am Server ist die Maschine ${esc(cfg.host)} eingestellt.</p>` : ''}
      </div>
      <div id="cnUsb" class="${saved.kind === 'usb' ? '' : 'hidden'}">
        ${field('Baudrate', `<select id="cnBaud">${['auto', 115200, 250000, 921600, 57600, 9600].map((b) => `<option value="${b}" ${String(saved.baud) === String(b) ? 'selected' : ''}>${b === 'auto' ? 'automatisch erkennen' : b}</option>`).join('')}</select>`)}
      </div>
      <details class="small"><summary class="muted">Wie kommt die TTC450 ins WLAN?</summary>
        <ol><li>Maschine per <b>USB</b> verbinden und unten auf <b>„WLAN“</b> drücken: Name und Passwort deines WLANs eintragen, „Einrichten“.</li>
        <li>Die Maschine startet neu und meldet sich im Router an. Die <b>IP-Adresse</b> zeigt „WLAN“ → „IP anzeigen“ (nach erneutem Verbinden per USB) oder die Geräteliste deines Routers.</li>
        <li>Hier die IP eintragen. Tipp: im Router für die Maschine eine <b>feste IP</b> vergeben.</li>
        <li>Ohne Einrichtung öffnet die Maschine ein eigenes WLAN <b>MKS_DLC</b> (Adresse 192.168.4.1) – dann mit dem Computer in dieses WLAN gehen und „WLAN direkt“ nutzen.</li></ol>
        <p>Firmware-Befehle können je nach Version abweichen; im Zweifel am Touch-Display oder im Webbrowser (<code>http://&lt;IP&gt;</code>) einrichten.</p></details>`;
    let pick = null;
    const r = await modal('Mit der Maschine verbinden', html, [
      { label: 'Abbrechen', value: null },
      { label: 'Verbinden', primary: true, value: 'go', onClick: () => {
        const kind = ($('input[name=ck]:checked') || {}).value;
        if (!kind) return false;
        pick = { kind, host: $('#cnHost') ? $('#cnHost').value.trim() : '', baud: $('#cnBaud') ? $('#cnBaud').value : 'auto' };
        if (kind !== 'usb' && !pick.host) { status('Bitte die IP-Adresse der Maschine eintragen.', true); $('#cnHost').focus(); return false; }
      } },
    ], { wide: true, noFocus: true, onOpen: (b) => b.addEventListener('change', (e) => {
      if (e.target.name !== 'ck') return;
      $('#cnWifi').classList.toggle('hidden', e.target.value === 'usb');
      $('#cnUsb').classList.toggle('hidden', e.target.value !== 'usb');
    }) });
    if (r !== 'go' || !pick) return;
    store.set('fs.conn', pick);
    const busy = $('#busy'), bt = $('#busy span');
    busy.classList.remove('hidden');
    bt.textContent = pick.kind === 'usb' ? 'Anschluss wählen, dann Verbinden …' : 'Verbinde mit der Maschine …';
    try {
      const hp = /^(.+):(\d{1,5})$/.exec(pick.host); // „192.168.1.50:23“ → Adresse und Port
      await S.grbl.connect(pick.kind === 'usb' ? { kind: 'usb', baud: pick.baud, first: S.machine.baud } : { kind: pick.kind, host: hp ? hp[1] : pick.host, port: hp ? +hp[2] : 23 });
    } catch (e) {
      busy.classList.add('hidden');
      if (e.cancelled && !e.html) return;
      modal('Verbindung fehlgeschlagen', `<p><b>${esc(e.message)}</b></p>${e.html || ''}<p class="muted small">Die Konsole unten zeigt weitere Meldungen.</p>`, [{ label: 'Hilfe: WLAN', value: 'w' }, { label: 'Nochmal versuchen', primary: true, value: 'again' }, { label: 'Schließen', value: 'x' }], { wide: true }).then((a) => { if (a === 'again') connectDialog(); if (a === 'w') wifiAssistant(); });
      log(tr('Verbindung fehlgeschlagen: ') + tr(e.message), 'err');
      return;
    } finally { busy.classList.add('hidden'); bt.textContent = 'Fräsbahnen werden berechnet …'; }
  }

  // ---- WLAN der Maschine einrichten (per USB) und IP-Adresse anzeigen
  async function wifiAssistant() {
    if (!S.grbl || !S.grbl.connected) {
      modal('WLAN der Maschine einrichten', `<p>Dazu die Maschine bitte zuerst per <b>USB</b> verbinden („Verbinden …“ → USB-Kabel).</p>
        <p class="muted small">Alternativ am Touch-Display einrichten oder im Webbrowser unter <code>http://192.168.4.1</code>, wenn du mit dem WLAN <b>MKS_DLC</b> der Maschine verbunden bist.</p>`);
      return;
    }
    const html = `${field('Name des WLANs (SSID)', `<input id="wfS" autocomplete="off">`)}
      ${field('Passwort', `<input id="wfP" type="password" autocomplete="off">`)}
      <label class="check"><input type="checkbox" id="wfT" checked> Telnet einschalten (Port 23, für „WLAN über den Server“)</label>
      <label class="check"><input type="checkbox" id="wfR" checked> Danach neu starten (nötig, damit das WLAN aktiv wird; die USB-Verbindung bricht kurz ab)</label>
      <p class="muted small">Gesendet werden die üblichen GRBL-ESP32-Einstellungen: <code>$Radio/Mode=STA</code>, <code>$Sta/SSID=…</code>, <code>$Sta/Password=…</code>, <code>$Telnet/Enable=ON</code>, <code>$System/Control=RESTART</code>. Erkennt deine Firmware sie nicht, meldet die Konsole „$-Befehl unbekannt“ – dann am Touch-Display einrichten.</p>
      <div class="row"><button id="wfIp">IP-Adresse der Maschine anzeigen</button></div><div id="wfOut" class="muted"></div>`;
    let wf = null;
    const r = await modal('WLAN der Maschine einrichten', html, [{ label: 'Schließen', value: null }, { label: 'Einrichten', primary: true, value: 'go', onClick: () => {
      const ssid = $('#wfS').value.trim(), pw = $('#wfP').value;
      if (!ssid) { status('Bitte den WLAN-Namen eintragen.', true); return false; }
      if (/[\r\n]/.test(ssid + pw)) { status('Name und Passwort dürfen keine Zeilenumbrüche enthalten.', true); return false; }
      wf = { ssid, pw, telnet: $('#wfT').checked, restart: $('#wfR').checked };
    } }], { noFocus: true, onOpen: (b) => {
      $('#wfIp', b).addEventListener('click', async (e) => {
        e.preventDefault();
        const out = $('#wfOut'); out.textContent = 'Frage die Maschine …';
        const lines = await S.grbl.ask('[ESP111]');
        const ip = lines.join(' ').match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
        out.innerHTML = ip ? `IP-Adresse: <b>${esc(ip[0])}</b>${ip[0].startsWith('192.168.4.') ? ' (eigenes WLAN der Maschine, noch nicht im Heim-WLAN)' : ''}` : (lines.length ? esc(lines.join(' · ')) : 'Keine Antwort – evtl. noch nicht im WLAN angemeldet oder die Firmware kennt [ESP111] nicht. Schau in der Geräteliste deines Routers.');
      });
    } });
    if (r !== 'go' || !wf) return;
    const cmds2 = ['$Radio/Mode=STA', `$Sta/SSID=${wf.ssid}`, `$Sta/Password=${wf.pw}`];
    if (wf.telnet) cmds2.push('$Telnet/Enable=ON');
    let bad = null;
    for (const c of cmds2) {
      try { await S.grbl.command(c); } catch (e) { bad = { c: c.startsWith('$Sta/Password') ? '$Sta/Password=…' : c, m: e.message }; break; }
    }
    if (bad) { modal('WLAN einrichten fehlgeschlagen', `<p>Bei <code>${esc(bad.c)}</code> kam: <b>${esc(bad.m)}</b></p><p>Diese Firmware kennt den Befehl evtl. nicht. WLAN dann am <b>Touch-Display</b> einrichten oder im Webbrowser unter <code>http://192.168.4.1</code> (nach Verbinden mit dem WLAN „MKS_DLC“).</p>`); return; }
    if (wf.restart) {
      log('Starte die Maschine neu …', 'info');
      S.grbl.command('$System/Control=RESTART').catch(() => {});
      modal('WLAN eingerichtet', `<p>Die Maschine startet neu und meldet sich im WLAN <b>${esc(wf.ssid)}</b> an (ca. 30 Sekunden). Die USB-Verbindung bricht dabei ab.</p>
        <p>Danach: Per USB neu verbinden → „WLAN“ → <b>IP-Adresse anzeigen</b>, oder in der Geräteliste deines Routers nachsehen. Diese IP dann bei „Verbinden“ → WLAN eintragen.</p>`);
    } else status('WLAN-Einstellungen gesendet. Maschine neu starten, damit sie wirken.');
  }

  $$('[data-zero]').forEach((b) => b.addEventListener('click', () => {
    if (!need()) return;
    const ax = b.dataset.zero.split('').map((a) => a + '0').join(' ');
    S.grbl.command('G10 L20 P1 ' + ax).then(() => status('Nullpunkt gesetzt: ' + ax)).catch(() => {});
  }));
  $('#mGoZero').onclick = () => {
    if (!need()) return;
    const z = S.doc.stock.safeZ || 5;
    S.grbl.command('G90 G0 Z' + z).then(() => S.grbl.command('G0 X0 Y0')).catch(() => {});
  };
  $$('[data-jog]').forEach((b) => b.addEventListener('click', () => {
    if (!need()) return;
    const [dx, dy, dz] = b.dataset.jog.split(',').map(Number);
    const st = S.jogStep, f = val('jogFeed') || 500;
    S.grbl.jog(dx * st, dy * st, dz * Math.min(st, 10), dz ? Math.min(f, S.machine.maxZFeed) : f);
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
  let spindleOn = false;
  $('#mSpindle').onclick = () => {
    if (!need()) return;
    spindleOn = !spindleOn;
    const manual = S.machine.spindle === 'manual';
    const s = manual ? S.machine.sMax : Math.round(Math.min(1, val('mRpm') / S.machine.maxRpm) * S.machine.sMax);
    S.grbl.command(spindleOn ? 'M3 S' + s : 'M5').catch(() => {});
    if (spindleOn && manual) status('Drehzahl am Drehregler des Fräsmotors einstellen.');
    $('#mSpindle').textContent = spindleOn ? 'Spindel aus' : 'Spindel an';
  };
  $('#mProbe').onclick = () => probeDialog();
  function probeDialog() {
    if (!need()) return Promise.resolve();
    const p = store.get('fs.probe', { plate: 0, travel: 25, feed: 60 });
    return modal('Z antasten', `<ol class="small"><li>Fräser über die Messplatte fahren (ca. 5–10 mm darüber).</li><li>Krokodilklemme am Fräser anbringen.</li><li>„Antasten“ drücken – die Spindel fährt langsam nach unten.</li></ol>
      ${field('Dicke der Messplatte', inputN('pbT', p.plate, 0.01), 'mm')}
      ${field('Max. Weg nach unten', inputN('pbD', p.travel, 1), 'mm')}
      ${field('Geschwindigkeit', inputN('pbF', p.feed, 5), 'mm/min')}
      <p class="muted small">Liegt die Platte auf dem Werkstück, wird Z=0 auf die Werkstückoberfläche gesetzt.</p>`,
    [{ label: 'Abbrechen', value: null }, { label: 'Antasten', primary: true, value: 'ok' }]).then(async (r) => {
      if (r !== 'ok') return;
      const v = { plate: val('pbT'), travel: Math.max(1, val('pbD')), feed: Math.max(5, val('pbF')) };
      store.set('fs.probe', v);
      try { await S.grbl.probeZ(v.plate, v.travel, v.feed); status('Z-Nullpunkt gesetzt. Klemme entfernen!'); log('Antasten erfolgreich.', 'info'); }
      catch (e) { modal('Antasten fehlgeschlagen', `<p>${esc(e.message)}</p>`); }
    });
  }
  // Werkzeugname aus dem G-Code-Kommentar (ASCII) wieder dem Werkzeug im Projekt zuordnen, damit er übersetzt angezeigt wird
  const gcTool = (n) => { const t = S.doc.tools.find((x) => FS.gcode.clean(x.name) === n.trim()); return t ? tr(t.name) : n; };
  const gcDial = (s) => { const m = /Stufe (\d+) = ca\. (\d+)/.exec(s || ''); return m ? `${tr('Stufe')} ${m[1]} (≈ ${(+m[2]).toLocaleString(loc())} ${tr('U/min')})` : s; };
  function toolChangeText(msg) {
    const m = /^(.*?) einsetzen(?: - (DREHREGLER Stufe \d+ = ca\. \d+ U\/min))? - Z neu nullen und fortsetzen$/.exec(msg);
    if (!m) return tr(msg);
    return `${tr('Werkzeug einsetzen:')} ${gcTool(m[1])}${m[2] ? ' – ' + tr('Drehregler') + ' ' + gcDial(m[2]) : ''} – ${tr('Z neu nullen und fortsetzen')}`;
  }
  function toolChangeDialog(msg) {
    modal('Werkzeugwechsel', `<p><b>${esc(toolChangeText(msg))}</b></p><ol><li>Spindel ist aus. Warten, bis sie stillsteht.</li><li>Werkzeug wechseln.</li><li>Z neu nullen (Antasten oder von Hand mit den Pfeilen und „Z0“).</li><li>„Weiter fräsen“ drücken.</li></ol>`,
      [{ label: 'Z antasten…', value: 'probe' }, { label: 'Auftrag abbrechen', value: 'stop', danger: true }, { label: 'Weiter fräsen', primary: true, value: 'go' }], { noEnter: true }).then(async (r) => {
      if (r === 'probe') { await probeDialog(); toolChangeDialog(msg); return; }
      if (r === 'stop') { S.grbl.stopJob(); return; }
      if (r === 'go') S.grbl.resumeJob();
      else toolChangeDialog(msg);
    });
  }
  function setJob(text, name) {
    S.job = { text, name, moves: FS.gcode.parse(text) };
    S.jobOrigin = null;
    $('#jobName').textContent = name;
    $('#jobInfo').textContent = `${FS.gcode.lineCount(text)} Zeilen`;
    if (S.mode === 'machine') { fit(); redraw(); }
  }
  async function loadJobFile() {
    const f = await pickFile('.nc,.gcode,.tap,.ngc,.txt');
    if (f) setJob(f.data, f.name);
  }
  $('#jobFromFile').onclick = loadJobFile;
  $('#jobFromProject').onclick = async () => {
    if (!S.doc.ops.some((o) => o.enabled)) { status('Das Projekt hat keine aktiven Fräsbahnen.', true); return; }
    const gc = await buildAll();
    setJob(gc.text, S.doc.name || tr('Projekt'));
    S.job.time = gc.time;
    S.jobOrigin = gc.origin;
    $('#jobInfo').textContent = `${FS.gcode.lineCount(gc.text)} Zeilen · Laufzeit ≈ ${FS.gcode.fmtTime(gc.time)}${gc.toolChanges ? ` · ${gc.toolChanges} Werkzeugwechsel` : ''}`;
  };
  $('#jobStart').onclick = async () => {
    if (!need()) return;
    if (!S.job) { status('Zuerst einen Auftrag laden (Projekt oder Datei).', true); return; }
    if (S.grbl.job) { S.grbl.resumeJob(); return; }
    if (S.grbl.status.state === 'Alarm') { status('Maschine ist im Alarm – zuerst entsperren.', true); return; }
    const firstTool = (S.job.text.match(/\n\((.*?) - (.*?)\)\r?\n(?:\(DREHREGLER[^\n]*\n)?M3/) || [])[2];
    const firstDial = (S.job.text.match(/\(DREHREGLER (Stufe \d+ = ca\. \d+ U\/min)\)/) || [])[1];
    const ok = await modal('Vor dem Start prüfen', `<ul>
      <li>Werkstück fest eingespannt, Spannmittel außerhalb der Fräsbahnen?</li>
      <li>Richtiges Werkzeug eingesetzt${firstTool ? `: <b>${esc(gcTool(firstTool))}</b>` : ''}?</li>
      ${firstDial ? `<li>Drehregler am Fräsmotor auf <b>${esc(gcDial(firstDial))}</b> gestellt und Motorschalter auf „Ein“ bzw. Steuerbox verbunden?</li>` : ''}
      <li>X/Y-Nullpunkt am richtigen Punkt (${esc(tr(zeroText(S.doc.stock.zeroXY)))}) und Z genullt?</li>
      <li>Schutzbrille, Absaugung, Hände weg von der Spindel.</li></ul>`,
    [{ label: 'Abbrechen', value: false }, { label: '▶ Jetzt fräsen', primary: true, value: true }]);
    if (!ok) return;
    try { S.grbl.startJob(S.job.text, S.job.name); } catch (e) { status(e.message, true); }
  };
  $('#jobPause').onclick = () => {
    if (!S.grbl || !S.grbl.job) return;
    if (S.grbl.job.paused) S.grbl.resumeJob(); else S.grbl.pauseJob();
  };
  $('#jobStop').onclick = async () => {
    if (!S.grbl || !S.grbl.job) { if (S.grbl && S.grbl.connected) S.grbl.realtime('!'); return; }
    if (await confirmBox('Auftrag abbrechen?', 'Die Maschine hält sofort an und wird zurückgesetzt. Danach Nullpunkt prüfen.', 'Abbrechen', true)) S.grbl.stopJob();
  };
  $$('[data-ov]').forEach((b) => b.addEventListener('click', () => {
    if (!need()) return;
    const map = { 'f-': '\x92', f0: '\x90', 'f+': '\x91', 's-': '\x9B', s0: '\x99', 's+': '\x9A' };
    S.grbl.realtime(map[b.dataset.ov]);
  }));
  function jobUi(j) {
    const bar = $('#jobBar');
    if (!j) { bar.style.width = '0'; $('#jobPause').textContent = '⏸ Pause'; $('#jobStart').disabled = false; updConn(); redraw(); return; }
    const frac = j.total ? j.acked / j.total : 0;
    bar.style.width = (100 * frac).toFixed(1) + '%';
    const el = (Date.now() - j.start) / 1000;
    const eta = S.job && S.job.time ? Math.max(0, S.job.time * (1 - frac)) : frac > 0.02 ? (el / frac) * (1 - frac) : 0;
    $('#jobInfo').textContent = `${Math.round(frac * 100)} % · Zeile ${j.acked}/${j.total} · ${FS.gcode.fmtTime(el)} vergangen${eta ? ' · noch ≈ ' + FS.gcode.fmtTime(eta) : ''}${j.waitIdle || j.pauseMsg && j.paused ? ' · wartet' : ''}`;
    $('#jobPause').textContent = j.paused ? '▶ Weiter' : '⏸ Pause';
    $('#jobStart').disabled = true;
    S.jobLine = j.acked;
    redraw();
  }
  $('#consoleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#consoleIn').value.trim();
    if (!v || !need()) return;
    if (v === '?' || v === '!' || v === '~') S.grbl.realtime(v); else S.grbl.command(v).catch(() => {});
    $('#consoleIn').value = '';
  });
  function drawMachine(x) {
    const st = S.doc.stock;
    const O = S.jobOrigin || FS.gcode.origin(st);
    if (S.job && S.job.moves.length) {
      const mv = S.job.moves;
      const done = S.grbl && S.grbl.job ? Math.floor((S.grbl.job.acked / Math.max(1, S.grbl.job.total)) * mv.length) : 0;
      const seg = (from, to, color, w, rapid) => {
        x.strokeStyle = color; x.lineWidth = w; x.setLineDash(rapid ? [3, 4] : []);
        x.beginPath();
        for (let i = Math.max(1, from); i < to; i++) {
          if (!!mv[i].rapid !== !!rapid) continue;
          const a = w2s({ x: mv[i - 1].x + O.x, y: mv[i - 1].y + O.y }), b = w2s({ x: mv[i].x + O.x, y: mv[i].y + O.y });
          x.moveTo(a.x, a.y); x.lineTo(b.x, b.y);
        }
        x.stroke(); x.setLineDash([]);
      };
      seg(0, mv.length, 'rgba(217,72,15,.35)', 1, true);
      seg(0, mv.length, 'rgba(47,111,176,.6)', 1);
      if (done > 1) seg(0, done, '#2b8a3e', 1.8);
    }
    if (S.grbl && S.grbl.connected) {
      const wp = S.grbl.status.wpos;
      const p = w2s({ x: wp.x + O.x, y: wp.y + O.y });
      x.strokeStyle = '#e8590c'; x.lineWidth = 2;
      x.beginPath(); x.arc(p.x, p.y, 7, 0, Math.PI * 2); x.moveTo(p.x - 12, p.y); x.lineTo(p.x + 12, p.y); x.moveTo(p.x, p.y - 12); x.lineTo(p.x, p.y + 12); x.stroke();
    }
  }

  // ---------------------------------------------------------------- Kamera (Webcam über der Fräse)
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
    const k = Math.min(1, 1280 / v.videoWidth);
    const w = Math.round(v.videoWidth * k), h = Math.round(v.videoHeight * k);
    if (!cam.fc) cam.fc = document.createElement('canvas');
    cam.fc.width = w; cam.fc.height = h;
    const x = cam.fc.getContext('2d', { willReadFrequently: true });
    x.drawImage(v, 0, 0, w, h);
    return { data: x.getImageData(0, 0, w, h).data, w, h };
  }
  const camAspect = () => (cam.video && cam.video.videoWidth ? cam.video.videoWidth / cam.video.videoHeight : 16 / 9);
  const camPts = (raw, k1) => raw.map((p) => FS.camera.undistort(p, k1, camAspect()));
  function camUpdate() {
    if (!cam.on || !cam.cal.raw || cam.cal.raw.length < 4) return;
    const fr = camFrame();
    if (!fr) return;
    const st = S.doc.stock;
    const res = Math.min(3, 900 / Math.max(st.w, st.h));
    const w = FS.camera.warp(fr, camPts(cam.cal.raw, cam.cal.k1), st, res, cam.cal.k1);
    if (!cam.img) cam.img = document.createElement('canvas');
    cam.img.width = w.w; cam.img.height = w.h;
    cam.img.getContext('2d').putImageData(new ImageData(w.data, w.w, w.h), 0, 0);
    redraw();
  }
  function camLoop() {
    clearInterval(cam.timer);
    cam.timer = null;
    if (cam.on && cam.cal.live) cam.timer = setInterval(() => { if (S.mode !== 'sim' && $('#modal').classList.contains('hidden')) camUpdate(); }, 500);
  }
  async function camShow(on) {
    if (on && (!cam.cal.raw || cam.cal.raw.length < 4)) { cameraDialog(); return; }
    cam.on = on;
    $('#camBar').classList.toggle('hidden', !on || S.mode === 'sim');
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
  $('#camOpacity').addEventListener('input', (e) => { cam.cal.opacity = e.target.value / 100; store.set('fs.cam', cam.cal); redraw(); });
  $('#camLive').addEventListener('change', (e) => { cam.cal.live = e.target.checked; store.set('fs.cam', cam.cal); camLoop(); camUpdate(); });

  async function cameraDialog() {
    try { await camStart(cam.cal.deviceId); } catch (e) {
      modal('Kamera nicht verfügbar', `<p>${esc(e.message)}</p><p>Tipps: USB-Webcam anschließen, im Browser den Kamerazugriff erlauben (Schloss-Symbol links neben der Adresse) und andere Programme schließen, die die Kamera benutzen.</p>`);
      return;
    }
    let devices = [];
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (e) { /* ohne Liste */ }
    const st = S.doc.stock;
    const names = ['links unten', 'rechts unten', 'rechts oben', 'links oben'];
    let raw = cam.cal.raw ? cam.cal.raw.map((p) => ({ ...p })) : [];
    let k1 = cam.cal.k1 || 0, open = true, dragI = -1;
    const html = `${devices.length > 1 ? field('Kamera', `<select id="cmDev">${devices.map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === cam.cal.deviceId ? 'selected' : ''}>${esc(d.label || 'Kamera ' + (i + 1))}</option>`).join('')}</select>`) : ''}
      <div class="camstep" id="cmStep"></div>
      <div class="camwrap" id="cmWrap"><canvas id="cmOver"></canvas></div>
      <div class="grid2">${field('Linsenkorrektur', `<input id="cmK" type="range" min="-0.4" max="0.4" step="0.01" value="${k1}">`)}${field('Deckkraft', `<input id="cmO" type="range" min="10" max="100" value="${Math.round(cam.cal.opacity * 100)}">`)}</div>
      <div class="row"><button id="cmReset">Ecken neu anklicken</button></div>
      <p class="muted small">Webcam fest über der Fräse montieren. Werkstück einspannen und im Bild seine 4 Ecken in der angezeigten Reihenfolge anklicken (Punkte lassen sich nachträglich ziehen).
      Das Raster (alle 50 mm) muss auf dem Werkstück liegen – sind die Kanten gebogen, die Linsenkorrektur verstellen. Maße aus „Werkstück einrichten“: ${fmt(st.w)} × ${fmt(st.h)} mm.</p>`;
    const toCanvas = (p, c) => ({ x: p.x * c.width, y: p.y * c.height });
    const overlay = () => {
      const c = $('#cmOver');
      if (!open || !c) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(c.clientWidth * dpr)) { c.width = Math.round(c.clientWidth * dpr); c.height = Math.round(c.clientHeight * dpr); }
      const x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      if (raw.length === 4) {
        const H = FS.camera.homography([{ x: 0, y: 0 }, { x: st.w, y: 0 }, { x: st.w, y: st.h }, { x: 0, y: st.h }], camPts(raw, k1));
        const P = (mx, my) => { const q = FS.camera.applyH(H, { x: mx, y: my }); const d = FS.camera.distort(q.x, q.y, k1, camAspect()); return toCanvas(d, c); };
        x.strokeStyle = 'rgba(80,200,255,.85)'; x.lineWidth = 1.5 * dpr;
        const line = (a, b, n = 40) => { x.beginPath(); for (let i = 0; i <= n; i++) { const t = i / n, p = P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y); } x.stroke(); };
        for (let gx = 0; gx <= st.w + 1e-6; gx += 50) line({ x: gx, y: 0 }, { x: gx, y: st.h });
        for (let gy = 0; gy <= st.h + 1e-6; gy += 50) line({ x: 0, y: gy }, { x: st.w, y: gy });
        x.strokeStyle = '#ffd43b'; x.lineWidth = 2.5 * dpr;
        line({ x: 0, y: 0 }, { x: st.w, y: 0 }); line({ x: st.w, y: 0 }, { x: st.w, y: st.h }); line({ x: st.w, y: st.h }, { x: 0, y: st.h }); line({ x: 0, y: st.h }, { x: 0, y: 0 });
      }
      raw.forEach((p, i) => {
        const q = toCanvas(p, c);
        x.fillStyle = '#e8590c'; x.strokeStyle = '#fff'; x.lineWidth = 2 * dpr;
        x.beginPath(); x.arc(q.x, q.y, 7 * dpr, 0, Math.PI * 2); x.fill(); x.stroke();
        x.fillStyle = '#fff'; x.font = `bold ${12 * dpr}px system-ui`; x.fillText(String(i + 1), q.x + 10 * dpr, q.y - 8 * dpr);
      });
      $('#cmStep').textContent = raw.length < 4 ? `Klicke die Ecke ${raw.length + 1} von 4 an: ${tr(names[raw.length])} (vom Werkstück aus gesehen, X nach rechts, Y nach hinten)` : 'Fertig ausgerichtet – Punkte bei Bedarf verschieben.';
      requestAnimationFrame(overlay);
    };
    const r = await modal('Kamera von oben', html, [{ label: 'Abbrechen', value: null }, { label: 'Übernehmen und einblenden', primary: true, value: 'ok' }], {
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
        const dev = $('#cmDev', body);
        if (dev) dev.onchange = async () => { try { await camStart(dev.value); } catch (e) { status(e.message, true); } };
        overlay();
      },
    });
    open = false;
    if (r !== 'ok' || raw.length < 4) { if (!cam.on) camStop(); if (r === 'ok') status('Bitte alle 4 Ecken anklicken.', true); return; }
    cam.cal.raw = raw; cam.cal.k1 = k1; cam.cal.opacity = val('cmO') / 100 || cam.cal.opacity;
    store.set('fs.cam', cam.cal);
    cam.on = false;
    camShow(true);
  }
  cmds.camera = cameraDialog;
  cmds.toggleCam = () => camShow(!cam.on);

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
    $('#cv').classList.toggle('hidden', m === 'sim');
    $('#cv3d').classList.toggle('hidden', m !== 'sim');
    $('#viewBtns').classList.toggle('sim', m === 'sim');
    $('#camBar').classList.toggle('hidden', !cam.on || m === 'sim');
    S.simPlaying = false;
    if (m === 'design') hint(TOOL_HINTS[S.tool]);
    if (m === 'cam') { hint('Objekte anklicken (Umschalt = mehrere) und rechts eine Bearbeitung wählen.'); if (!S.selOp && S.doc.ops.length) S.selOp = S.doc.ops[0].id; computeAll(); }
    if (m === 'sim') { hint(''); enterSim(); }
    if (m === 'machine') {
      hint(''); machineInit(); $('#machName').textContent = S.machine.name;
      $('#mRpm').classList.toggle('hidden', S.machine.spindle === 'manual');
      $('#mRpm').value = Math.min(S.machine.maxRpm, Math.max(S.machine.minRpm || 0, +$('#mRpm').value || S.machine.maxRpm));
    }
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
    // Leertaste über der Zeichenfläche verschiebt immer – auch wenn gerade ein Zahlenfeld aktiv ist
    if (e.key === ' ' && overCanvas && S.mode !== 'sim' && tag !== 'TEXTAREA' && !(tag === 'INPUT' && e.target.type === 'text')
        && !(S.mode === 'design' && S.tool === 'node' && S.nodeSel)) {
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
    if (['1', '2', '3', '4'].includes(k) && !(S.draw && S.draw.kind === 'line')) { setMode(['design', 'cam', 'sim', 'machine'][+k - 1]); return; }
    if (k === ' ' && S.mode !== 'design' && S.mode !== 'sim') { e.preventDefault(); if (!spaceDown) setSpace(true); return; }
    if (S.mode === 'sim') {
      const pv = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[k];
      if (pv) { e.preventDefault(); panView(pv[0], pv[1]); return; }
      if (k === '+') { cmds.zoomIn(); return; }
      if (k === '-') { cmds.zoomOut(); return; }
      if (k === 'f' || k === 'F') { cmds.fit(); return; }
      return;
    }
    if (S.mode === 'machine') {
      const jog = { ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0], ArrowUp: [0, 1, 0], ArrowDown: [0, -1, 0], PageUp: [0, 0, 1], PageDown: [0, 0, -1] }[k];
      if (jog && S.grbl && S.grbl.connected && !S.grbl.job) {
        e.preventDefault();
        const st = S.jogStep, f = val('jogFeed') || 500;
        S.grbl.jog(jog[0] * st, jog[1] * st, jog[2] * Math.min(st, 10), jog[2] ? Math.min(f, S.machine.maxZFeed) : f);
      }
      if (k === 'f' || k === 'F') fit();
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
    if (S.mode !== 'design') return;
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
      <div class="welcome">
        <div><i>1</i><b>Entwerfen</b>Werkstück einrichten, zeichnen oder SVG/DXF/Bild importieren.</div>
        <div><i>2</i><b>Fräsbahnen</b>Objekte wählen → Kontur, Tasche, V-Carving, Bohren, 3D …</div>
        <div><i>3</i><b>3D-Vorschau</b>Abtrag simulieren, Laufzeit prüfen.</div>
        <div><i>4</i><b>Fräsen</b>Per USB verbinden, Nullpunkt setzen, starten – oder G-Code auf SD-Karte.</div>
      </div>
      <table class="help">
        <tr><td>Linksklick / Rechtsklick</td><td>Linienwerkzeug: Eckpunkt / Kurvenpunkt</td></tr>
        <tr><td>Enter · Rücktaste · Esc</td><td>Linie fertig · letzten Punkt entfernen · abbrechen</td></tr>
        <tr><td>V R L Q K P S T M</td><td>Auswahl, Umformen, Linie, Rechteck, Kreis, Vieleck, Stern, Text, Messen</td></tr>
        <tr><td>Umschalt beim Aufziehen</td><td>Quadrat / Kreis · beim Drehen 15°-Schritte · bei Eckgriffen freies Skalieren</td></tr>
        <tr><td>Pfeiltasten</td><td>Verschieben 1 mm (Umschalt 10 mm, Alt 0,1 mm) · im Fräsen-Schritt: Maschine verfahren</td></tr>
        <tr><td>Leertaste halten</td><td>Ansicht verschieben – Maus bewegen oder ziehen</td></tr>
        <tr><td>Zwei Finger / Mausrad</td><td>Ansicht verschieben (Umschalt = waagrecht) · auch mittlere oder rechte Maustaste ziehen</td></tr>
        <tr><td>Finger spreizen / Strg + Rad</td><td>Zoomen (Ansicht → „Mausrad: Zoom/Verschieben“ stellt das Rad auf Zoom um)</td></tr>
        <tr><td>F · G · C</td><td>Alles zeigen · Raster fangen ein/aus · Kamerabild ein/aus</td></tr>
        <tr><td>Datei aufs Fenster ziehen</td><td>Bild (→ 3D-Relief oder Umriss), SVG, DXF, STL, G-Code, Projekt</td></tr>
        <tr><td>1 2 3 4</td><td>Arbeitsschritt wechseln</td></tr>
        <tr><td>↶ ↷ oben</td><td>Rückgängig / Wiederholen (auch Strg+Z / Strg+Y)</td></tr>
        <tr><td>3D-Vorschau</td><td>Links ziehen = drehen · Leertaste, zwei Finger, rechte Maustaste, Pfeiltasten oder Knöpfe unten rechts = verschieben</td></tr>
        <tr><td>Strg+Z/Y/C/V/D/A</td><td>Rückgängig, Wiederholen, Kopieren, Einfügen, Duplizieren, Alles</td></tr>
        <tr><td>Strg+S/O/E/I</td><td>Speichern, Öffnen, G-Code speichern, Importieren</td></tr>
      </table>`, [{ label: 'Tipps für die TTC450', value: 'tips' }, { label: 'Schließen', primary: true }], { wide: true }).then((r) => { if (r === 'tips') ttcTips(); });
  }
  function ttcTips() {
    modal('Tipps für die Twotrees TTC450', `<ul>
      <li><b>800-W-Fräsmotor:</b> Twotrees bietet einen 800-W-Satz (10.000–30.000 U/min, Drehregler, Steuerbox) für TTC450 und TTC450 Pro an. Unter <i>Bearbeiten → Maschine…</i> das Profil „800-W-Fräsmotor“ wählen: Zustellungen werden größer, die passende Reglerstufe steht bei jeder Fräsbahn und beim Werkzeugwechsel. Gehörschutz tragen – der Motor ist deutlich lauter.</li>
      <li><b>Spindel:</b> Die 80-W-Spindel mag kleine Zustellungen. Lieber mehrere flache Durchgänge (Voreinstellung 1 mm in Weichholz) als einen tiefen. Mit der 500-W-Spindel in „Maschine…“ das passende Profil wählen.</li>
      <li><b>Vorschub:</b> Bis etwa 800–1000 mm/min. In Hartholz und Acryl langsamer; das Material im Werkstück-Dialog passt die Werte an.</li>
      <li><b>Nullpunkt:</b> Fräse über die gewählte Ecke fahren (Pfeile), „X0“ und „Y0“ drücken. Z mit der Messplatte antasten oder mit einem Blatt Papier: Fräser absenken, bis das Papier gerade klemmt, dann „Z0“.</li>
      <li><b>Ausschneiden:</b> Kontur außen, Tiefe = Materialstärke + 0,3 mm, Haltestege an. Opferplatte unterlegen!</li>
      <li><b>Schrift:</b> V-Carving mit 60°- oder 90°-V-Fräser ergibt scharfe Ecken. Für feine Gravur der 30°-Stichel.</li>
      <li><b>3D-Relief:</b> Erst mit dem 3,175-mm-Schaftfräser schruppen (Aufmaß 0,5 mm), dann mit dem Kugelfräser schlichten (Überlappung 10–15 %). Für feine Details (Haare, Augen) danach „3D Rest“ mit einem konischen Kugelfräser (z. B. R0,25) – der arbeitet nur dort, wo der dicke Fräser nicht hinkam.</li>
      <li><b>Foto als Relief:</b> „Bild → 3D“, Bildart „Foto oder Render“: Die KI schätzt die Tiefe aus Licht und Schatten. Für Höhenbilder (Depth Maps) die Bildart „Höhenbild“ nehmen.</li>
      <li><b>Offline fräsen:</b> G-Code je Werkzeug speichern, auf die SD-Karte kopieren und am Display starten.</li>
      <li><b>Verbindung:</b> Chrome oder Edge verwenden. Falls die Maschine nicht erscheint: CH340-USB-Treiber installieren und Candle schließen.</li>
    </ul>`, [{ label: 'Schließen', primary: true }], { wide: true });
  }
  function aboutDialog() {
    modal('Über FräsStudio', `<p><b>FräsStudio</b> – CAD und CAM in einem Programm, im Browser, ohne Installation. Für GRBL-Fräsen wie die Twotrees TTC450.</p>
      <p class="small muted">Polygonberechnung: Clipper von Angus Johnson (Boost Software License). Schriften: SIL Open Font License (siehe js/lib/LIZENZEN.txt).</p>
      <p class="small warnbox">Fräsen ist gefährlich. Prüfe jede Fräsbahn in der 3D-Vorschau und bleibe während des Fräsens an der Maschine.</p>`);
  }
  function welcomeDialog() {
    modal('Willkommen bei FräsStudio', `<p>Zeichnen, Fräsbahnen berechnen und direkt fräsen – alles in einem Programm.</p>
      <div class="welcome">
        <div><i>1</i><b>Entwerfen</b>Formen, Text, Import von SVG, DXF und Bildern</div>
        <div><i>2</i><b>Fräsbahnen</b>Kontur, Tasche, V-Carving, Bohren, 3D-Relief</div>
        <div><i>3</i><b>3D-Vorschau</b>Sehen, was herauskommt – bevor Holz fliegt</div>
        <div><i>4</i><b>Fräsen</b>TTC450 per USB steuern oder G-Code speichern</div>
      </div>`, [{ label: 'Projekt öffnen…', value: 'open' }, { label: 'Beispiel ansehen', value: 'ex' }, { label: 'Neues Projekt', primary: true, value: 'new' }], { wide: true }).then((r) => {
      store.set('fs.welcomed', true);
      if (r === 'new') stockDialog(true);
      if (r === 'ex') loadExample();
      if (r === 'open') openProject();
    });
  }

  // Beispiel: Holzschild mit Schrift (V-Carving), Bohrungen und Ausschnitt mit Haltestegen
  function loadExample() {
    const d = newDoc({ w: 220, h: 120, t: 10, material: 'weichholz' });
    // Beispiel in der gewählten Sprache anlegen (auch die gefräste Schrift)
    d.name = tr('Beispiel Holzschild');
    const plate = SH.make('rect', { name: tr('Schild'), w: 200, h: 100, r: 12 });
    plate.tf = M.translate(110, 60);
    const word = tr('Werkstatt');
    const txt = SH.make('text', { name: tr('Text: ') + word, text: word, font: 'Alfa Slab One', size: 30, align: 'center', spacing: 0, lineHeight: 1.2 });
    const tb = geo.bounds(SH.lines(txt).map((l) => l.pts));
    txt.tf = M.translate(110 - (tb.x0 + tb.x1) / 2, 64 - (tb.y0 + tb.y1) / 2);
    const frame = SH.make('rect', { name: tr('Zierrahmen'), w: 176, h: 76, r: 8 });
    frame.tf = M.translate(110, 60);
    const h1 = SH.make('ellipse', { name: tr('Bohrung links'), rx: 2.5, ry: 2.5 }); h1.tf = M.translate(22, 60);
    const h2 = SH.make('ellipse', { name: tr('Bohrung rechts'), rx: 2.5, ry: 2.5 }); h2.tf = M.translate(198, 60);
    d.objects.push(plate, frame, txt, h1, h2);
    const v = CAM.makeOp('vcarve', [txt.id], 't6');
    v.maxDepth = 2.5; v.clearToolId = 't1';
    const e = CAM.makeOp('engrave', [frame.id], 't6'); e.depth = 1;
    const dr = CAM.makeOp('drill', [h1.id, h2.id], 't1'); dr.depth = 10.3; dr.name = tr('Bohrungen Ø 5');
    const p = CAM.makeOp('profile', [plate.id], 't1'); p.depth = 10.3; p.tabs = true; p.tabHeight = 2; p.name = tr('Ausschneiden');
    d.ops.push(e, v, dr, p); // gleiche Werkzeuge hintereinander: nur ein Wechsel
    S.doc = d; S.sel = []; S.results.clear(); S.undo = []; S.redo = []; S.selOp = v.id;
    changed(); fit();
    setMode('cam');
    status('Beispiel geladen. Schau dir die Fräsbahnen an und dann die 3D-Vorschau (Taste 3).');
  }

  // ---------------------------------------------------------------- Start
  // Über den StickStudio-Server geschützt aufgerufen: Konto und Abmelden anbieten
  if (/^https?:$/.test(location.protocol) && location.pathname.startsWith('/fraesstudio/')) {
    const box = document.createElement('span');
    box.className = 'acct';
    box.innerHTML = '<a class="tb" href="/account" title="Mein Konto">Konto</a><form method="post" action="/logout"><button class="tb" title="Abmelden">Abmelden</button></form>';
    $('#connDot').after(box);
  }
  const th = store.get('fs.theme', null);
  if (th) document.documentElement.dataset.theme = th;
  readColors();
  const saved = store.get('fs.doc', null);
  if (saved && saved.objects) {
    try { S.doc = revive(JSON.stringify(saved)); S.doc.tools = addNewDefaultTools(S.doc.tools || util.deep(TL.DEFAULT_TOOLS)); } catch (e) { S.doc = newDoc(); }
  }
  new ResizeObserver(() => redraw()).observe(cv);
  updateSnapInfo();
  setTool('select');
  renderSide();
  // Sprache: DOM-Texte übersetzt i18n.js selbst; was aus JS-Zustand entsteht, wird hier neu gezeichnet
  function langChanged() {
    $('#droX').textContent = fmt3(S.grbl ? S.grbl.status.wpos.x : 0);
    $('#droY').textContent = fmt3(S.grbl ? S.grbl.status.wpos.y : 0);
    $('#droZ').textContent = fmt3(S.grbl ? S.grbl.status.wpos.z : 0);
    $('[data-step="0.1"]').textContent = fmt(0.1, 1);
    renderSide(); if (S.mode !== 'cam') renderCam(); updUndo(); updConn(); redraw();
    if (S.mode === 'sim' && S.gc) simInfo();
  }
  if (window.HW && HW.i18n) {
    HW.i18n.listeners.push(langChanged);
    $$('[data-lang-btn]').forEach((b) => b.addEventListener('click', () => { b.blur(); HW.i18n.setLang(b.dataset.langBtn); }));
    HW.i18n.start();
    langChanged();
  }
  requestAnimationFrame(() => { fit(); if (!store.get('fs.welcomed', false)) welcomeDialog(); });
  window.addEventListener('beforeunload', (e) => { if (S.grbl && S.grbl.job) { e.preventDefault(); e.returnValue = ''; } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); redraw(); });
  FS.app = { S, cmds, setMode, computeAll, buildAll, view3d: () => view3d };
})();
