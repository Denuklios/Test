// Gegenstände entfernen: Auswahl (antippen mit KI oder malen) und KI-Füllung (LaMa) in voller Auflösung
import { inpaint512, samEncode, samDecode, warmup } from './ai.js';

const TINT = [255, 40, 70];

export class Remover {
  /**
   * opts: { maskC (Canvas über der Vorschau), getBase(), getPreview(), commit(newBase), toast, busy, onChange }
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.mode = 'tap';
    this.brush = 36;
    this.grow = 6;
    this.objects = [];
    this.strokes = []; // [{erase, size, pts:[{x,y}]}]
    this.samFor = null;
    this.mctx = this.maskC.getContext('2d', { willReadFrequently: true });
    this.bind();
  }

  get hasMask() { return this.objects.length > 0 || this.strokes.some((s) => !s.erase); }

  invalidate() { this.objects = []; this.strokes = []; this.samFor = null; this.render(); }

  setSize(w, h) {
    if (this.maskC.width !== w || this.maskC.height !== h) { this.maskC.width = w; this.maskC.height = h; this.invalidate(); }
  }

  pos(e) {
    const r = this.maskC.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * this.maskC.width, y: (e.clientY - r.top) / r.height * this.maskC.height, k: this.maskC.width / r.width };
  }

  bind() {
    const c = this.maskC;
    let down = null, holdT = null, stroke = null;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = this.pos(e);
      down = { ...p, t: performance.now(), moved: false };
      if (this.mode === 'tap') {
        holdT = setTimeout(() => { if (down && !down.moved) { down.done = true; this.tap(p.x, p.y, 0); } }, 550);
      } else {
        stroke = { erase: this.mode === 'rub', size: this.brush * p.k, pts: [p] };
        this.strokes.push(stroke);
        this.render();
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (!down) return;
      const p = this.pos(e);
      if (Math.hypot(p.x - down.x, p.y - down.y) > 8 * p.k) down.moved = true;
      if (stroke) { stroke.pts.push(p); this.render(); }
    });
    const up = () => {
      clearTimeout(holdT);
      if (down && this.mode === 'tap' && !down.moved && !down.done) this.tap(down.x, down.y, 1);
      down = null; stroke = null;
      this.onChange?.();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', () => { clearTimeout(holdT); down = null; stroke = null; });
  }

  async ensureSam() {
    const prev = this.getPreview();
    if (this.samFor === prev) return;
    this.busy('KI analysiert das Bild …');
    try {
      await samEncode(prev);
      this.samFor = prev;
    } finally { this.busy(false); }
  }

  /** label 1: Gegenstand an dieser Stelle auswählen; 0: Stelle aus der letzten Auswahl herausnehmen */
  async tap(x, y, label) {
    try {
      await this.ensureSam();
      let obj;
      if (label === 0) {
        obj = this.objects[this.objects.length - 1];
        if (!obj) { this.toast('Erst etwas antippen – lange drücken nimmt dann Stellen wieder heraus'); return; }
        obj.points.push([x, y, 0]);
      } else {
        // Tippen in eine bestehende Auswahl erweitert diese, sonst neuer Gegenstand
        obj = { points: [[x, y, 1]] };
        this.objects.push(obj);
      }
      const r = await samDecode(obj.points);
      const prev = this.getPreview();
      const W = prev.width, H = prev.height;
      obj.variants = r.masks.map((m, i) => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x2 = c.getContext('2d', { willReadFrequently: true });
        x2.imageSmoothingEnabled = true;
        x2.drawImage(m, 0, 0, r.cropW, r.cropH, 0, 0, W, H);
        const id = x2.getImageData(0, 0, W, H); const d = id.data;
        let area = 0;
        for (let j = 0; j < d.length; j += 4) {
          const on = d[j] > 128; area += on;
          d[j] = TINT[0]; d[j + 1] = TINT[1]; d[j + 2] = TINT[2]; d[j + 3] = on ? 255 : 0;
        }
        x2.putImageData(id, 0, 0);
        return { c, area, score: r.scores[i] };
      }).filter((v) => v.area > 0).sort((a, b) => a.area - b.area);
      if (!obj.variants.length) { this.objects.pop(); this.toast('Hier wurde nichts erkannt – etwas anders antippen oder malen'); this.render(); return; }
      // Bewertung + lieber den ganzen Gegenstand als nur ein Teilstück
      const best = Math.max(...obj.variants.map((v) => v.score));
      let pick = 0;
      obj.variants.forEach((v, i) => { if (v.score >= best - 0.04) pick = i; });
      // nicht fast das ganze Bild auswählen
      while (pick > 0 && obj.variants[pick].area > W * H * 0.6) pick--;
      obj.pick = pick;
      this.render();
      this.onChange?.();
    } catch (e) {
      this.toast('Antippen geht gerade nicht (' + e.message + ') – bitte mit dem Pinsel malen');
      this.mode = 'pen';
      this.onChange?.();
    }
  }

  /** letzte Auswahl größer/kleiner (nächster KI-Vorschlag) */
  resize(dir) {
    const o = this.objects[this.objects.length - 1];
    if (!o) return;
    const n = Math.max(0, Math.min(o.variants.length - 1, o.pick + dir));
    if (n === o.pick) { this.toast(dir > 0 ? 'Größer geht nicht – zusätzlich antippen oder malen' : 'Kleiner geht nicht – lange drücken nimmt Stellen heraus'); return; }
    o.pick = n; this.render();
  }

  undoSelection() {
    if (this.strokes.length && (!this.objects.length || this.lastWasStroke)) this.strokes.pop();
    else this.objects.pop();
    this.render(); this.onChange?.();
  }

  /** Maske zeichnen (rot, halbtransparent über der Vorschau) */
  render() {
    const x = this.mctx, W = this.maskC.width, H = this.maskC.height;
    x.clearRect(0, 0, W, H);
    for (const o of this.objects) if (o.variants) x.drawImage(o.variants[o.pick].c, 0, 0);
    for (const s of this.strokes) {
      x.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      x.strokeStyle = x.fillStyle = `rgb(${TINT})`;
      x.lineCap = x.lineJoin = 'round'; x.lineWidth = s.size;
      x.beginPath();
      if (s.pts.length === 1) { x.arc(s.pts[0].x, s.pts[0].y, s.size / 2, 0, Math.PI * 2); x.fill(); }
      else { x.moveTo(s.pts[0].x, s.pts[0].y); for (const p of s.pts) x.lineTo(p.x, p.y); x.stroke(); }
    }
    x.globalCompositeOperation = 'source-over';
    this.lastWasStroke = this.strokes.length > 0;
  }

  /** binäre Maske (Vorschau-Größe), um "grow" Pixel erweitert */
  maskData(grow) {
    const W = this.maskC.width, H = this.maskC.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (grow > 0) x.filter = `blur(${grow / 2}px)`;
    x.drawImage(this.maskC, 0, 0);
    if (grow > 0) { x.filter = 'none'; x.drawImage(c, 0, 0); } // zweimal → kräftiger
    const d = x.getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > (grow > 0 ? 6 : 100) ? 1 : 0;
    return { m, W, H };
  }

  /** zusammenhängende Bereiche → Rechtecke (überlappende werden zusammengelegt) */
  regions({ m, W, H }) {
    const lab = new Int32Array(W * H);
    const boxes = [];
    const stack = new Int32Array(W * H);
    for (let i = 0; i < m.length; i++) {
      if (!m[i] || lab[i]) continue;
      let sp = 0; stack[sp++] = i; lab[i] = boxes.length + 1;
      const b = { x0: W, y0: H, x1: 0, y1: 0, n: 0 };
      while (sp) {
        const j = stack[--sp]; const x = j % W, y = (j / W) | 0;
        b.n++; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
        const nb = [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1];
        for (const q of nb) if (q >= 0 && m[q] && !lab[q]) { lab[q] = lab[i]; stack[sp++] = q; }
      }
      if (b.n > 3) boxes.push(b);
    }
    // Bereiche mit ihrer Umgebung zusammenfassen, wenn sie nah beieinander liegen
    let merged = true;
    const pad = (b) => Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.6 + 10;
    while (merged) {
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length && !merged; j++) {
        const a = boxes[i], b = boxes[j], pa = pad(a), pb = pad(b);
        if (a.x0 - pa <= b.x1 + pb && b.x0 - pb <= a.x1 + pa && a.y0 - pa <= b.y1 + pb && b.y0 - pb <= a.y1 + pa) {
          boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n };
          boxes.splice(j, 1); merged = true;
        }
      }
    }
    return boxes;
  }

  async remove() {
    if (!this.hasMask) { this.toast('Erst den Gegenstand antippen oder übermalen'); return; }
    const base = this.getBase();
    const BW = base.width, BH = base.height;
    const md = this.maskData(this.grow);
    const boxes = this.regions(md);
    if (!boxes.length) return;
    const k = BW / md.W;
    // Maske in voller Auflösung (weich skaliert)
    const mfull = document.createElement('canvas'); mfull.width = md.W; mfull.height = md.H;
    {
      const x = mfull.getContext('2d'); const id = x.createImageData(md.W, md.H);
      for (let i = 0; i < md.m.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = md.m[i] ? 255 : 0; }
      x.putImageData(id, 0, 0);
    }
    const out = document.createElement('canvas'); out.width = BW; out.height = BH;
    const octx = out.getContext('2d', { willReadFrequently: true });
    octx.drawImage(base, 0, 0);
    this.busy('KI entfernt den Gegenstand …', 0);
    await warmup('lama');
    try {
      for (let bi = 0; bi < boxes.length; bi++) {
        const b = boxes[bi];
        // Ausschnitt mit viel Umgebung (Quadrat), damit die KI weiß, was dahin gehört
        const bx0 = b.x0 * k, by0 = b.y0 * k, bw = (b.x1 - b.x0 + 1) * k, bh = (b.y1 - b.y0 + 1) * k;
        let s = Math.max(bw, bh) * 2.2 + 48 * k;
        s = Math.max(s, Math.min(512, Math.min(BW, BH)));
        const sw = Math.min(BW, s), sh = Math.min(BH, s);
        let cx0 = Math.round(bx0 + bw / 2 - sw / 2), cy0 = Math.round(by0 + bh / 2 - sh / 2);
        cx0 = Math.max(0, Math.min(BW - sw, cx0)); cy0 = Math.max(0, Math.min(BH - sh, cy0));
        const cw = Math.round(sw), ch = Math.round(sh);
        const img512 = document.createElement('canvas'); img512.width = img512.height = 512;
        const ix = img512.getContext('2d'); ix.imageSmoothingQuality = 'high';
        ix.drawImage(out, cx0, cy0, cw, ch, 0, 0, 512, 512);
        const m512 = document.createElement('canvas'); m512.width = m512.height = 512;
        const mx = m512.getContext('2d', { willReadFrequently: true });
        mx.fillStyle = '#000'; mx.fillRect(0, 0, 512, 512);
        mx.drawImage(mfull, cx0 / k, cy0 / k, cw / k, ch / k, 0, 0, 512, 512);
        { // Maske hart machen, weiß = Loch
          const id = mx.getImageData(0, 0, 512, 512); const d = id.data;
          for (let i = 0; i < d.length; i += 4) { const on = d[i] > 100; d[i] = d[i + 1] = d[i + 2] = on ? 255 : 0; d[i + 3] = 255; }
          mx.putImageData(id, 0, 0);
        }
        let res;
        try { res = await inpaint512(img512, m512); }
        catch (e) { this.toast('KI nicht verfügbar – einfache Füllung'); res = await patchFill(img512, m512); }
        this.busy(null, (bi + 0.8) / boxes.length);
        // zurück in Originalgröße, Körnung angleichen, weich einsetzen
        const patch = document.createElement('canvas'); patch.width = cw; patch.height = ch;
        const px = patch.getContext('2d', { willReadFrequently: true });
        px.imageSmoothingQuality = 'high';
        px.drawImage(res, 0, 0, 512, 512, 0, 0, cw, ch);
        const up = Math.max(cw, ch) / 512;
        const hole = document.createElement('canvas'); hole.width = cw; hole.height = ch;
        const hx = hole.getContext('2d', { willReadFrequently: true });
        hx.drawImage(mfull, cx0 / k, cy0 / k, cw / k, ch / k, 0, 0, cw, ch);
        if (up > 1.15) addGrain(px, hx, octx, cx0, cy0, cw, ch, up);
        // weiche Kante
        const feather = document.createElement('canvas'); feather.width = cw; feather.height = ch;
        const fx = feather.getContext('2d');
        fx.filter = `blur(${Math.max(1.5, 1.2 * k)}px)`;
        fx.drawImage(hole, 0, 0); fx.drawImage(hole, 0, 0);
        px.globalCompositeOperation = 'destination-in';
        px.drawImage(feather, 0, 0);
        octx.drawImage(patch, cx0, cy0);
        this.busy(null, (bi + 1) / boxes.length);
      }
      this.commit(out);
      this.invalidate();
    } finally { this.busy(false); }
  }
}

/** Feine Körnung/Struktur der Umgebung auf die (hochskalierte) Füllung übertragen, damit sie nicht weich wirkt */
function addGrain(px, hx, octx, cx0, cy0, cw, ch, up) {
  const P = px.getImageData(0, 0, cw, ch), M = hx.getImageData(0, 0, cw, ch).data;
  const O = octx.getImageData(cx0, cy0, cw, ch).data;
  // Rauschen der Umgebung messen (Abweichung vom Nachbar-Mittel), nur außerhalb des Lochs
  let s = 0, n = 0;
  for (let y = 1; y < ch - 1; y += 2) for (let x = 1; x < cw - 1; x += 2) {
    const i = y * cw + x;
    if (M[i * 4 + 3] > 10) continue;
    for (let c = 0; c < 3; c++) {
      const v = O[i * 4 + c], avg = (O[(i - 1) * 4 + c] + O[(i + 1) * 4 + c] + O[(i - cw) * 4 + c] + O[(i + cw) * 4 + c]) / 4;
      s += (v - avg) * (v - avg); n++;
    }
  }
  const sd = Math.min(12, Math.sqrt(s / Math.max(1, n)) * 0.75);
  if (sd < 0.5) return;
  const d = P.data;
  for (let i = 0; i < cw * ch; i++) {
    if (M[i * 4 + 3] < 10) continue;
    // helligkeitsgleiches Rauschen + etwas Farbrauschen
    const g = gauss() * sd;
    for (let c = 0; c < 3; c++) d[i * 4 + c] = d[i * 4 + c] + g + gauss() * sd * 0.25;
  }
  px.putImageData(P, 0, 0);
}
let spare = null;
function gauss() {
  if (spare != null) { const v = spare; spare = null; return v; }
  let u, v, s;
  do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
  const f = Math.sqrt(-2 * Math.log(s) / s);
  spare = v * f; return u * f;
}

/** Ersatz ohne KI (Flicken aus der Umgebung) */
async function patchFill(img512, m512) {
  const id = img512.getContext('2d').getImageData(0, 0, 512, 512);
  const md = m512.getContext('2d').getImageData(0, 0, 512, 512).data;
  const mask = new Uint8Array(512 * 512);
  for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4] > 127 ? 1 : 0;
  const data = await new Promise((res, rej) => {
    const w = new Worker(new URL('./inpaint-worker.js', import.meta.url));
    w.onmessage = (e) => { if (e.data.done) { res(e.data.data); w.terminate(); } };
    w.onerror = (e) => { rej(new Error(e.message)); w.terminate(); };
    w.postMessage({ w: 512, h: 512, data: id.data, mask }, [id.data.buffer]);
  });
  const c = document.createElement('canvas'); c.width = c.height = 512;
  c.getContext('2d').putImageData(new ImageData(data, 512, 512), 0, 0);
  return c;
}
