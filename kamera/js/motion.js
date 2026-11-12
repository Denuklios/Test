// Bildanalyse auf kleinen Graustufen-Bildern: Helligkeit/Farbe (Auto-Modus),
// Verschiebung zwischen zwei Bildern (Panorama), Punktverfolgung (Punkt fixieren).

export class Probe {
  constructor(width = 160) {
    this.w = width;
    this.c = document.createElement('canvas');
    this.ctx = this.c.getContext('2d', { willReadFrequently: true });
  }
  /** Quelle verkleinert einlesen → {gray, rgba, w, h} */
  grab(src, sw, sh, crop = null) {
    const w = this.w, h = Math.max(2, Math.round(w * (crop ? crop.h : sh) / (crop ? crop.w : sw)));
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    if (crop) this.ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    else this.ctx.drawImage(src, 0, 0, w, h);
    const rgba = this.ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114;
    return { gray, rgba, w, h };
  }
}

/** Auto-Tonwert und Auto-Weißabgleich aus einem kleinen Bild */
export function autoStats(f, { wb = true, levels = true } = {}) {
  const hist = new Uint32Array(256);
  let r = 0, g = 0, b = 0, n = 0;
  const d = f.rgba;
  for (let i = 0; i < f.gray.length; i++) {
    const L = f.gray[i] | 0;
    hist[L]++;
    // nur mittlere Töne für den Weißabgleich (keine Lichter/Schatten)
    if (L > 40 && L < 220) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; n++; }
  }
  const total = f.gray.length;
  const pct = (p) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * p) return i; } return 255; };
  let lo = pct(0.005) / 255, hi = pct(0.995) / 255;
  const mean = f.gray.reduce((a, v) => a + v, 0) / total / 255;
  lo = Math.min(lo, 0.12); hi = Math.max(hi, 0.75);
  let gain = [1, 1, 1];
  if (wb && n > 50) {
    r /= n; g /= n; b /= n;
    const avg = (r + g + b) / 3;
    // nur sanft korrigieren (Graue-Welt-Annahme, begrenzt)
    gain = [r, g, b].map((v) => Math.min(1.25, Math.max(0.8, Math.pow(avg / Math.max(v, 1), 0.6))));
  }
  return { levels: levels ? [lo * 0.8, 1 - (1 - hi) * 0.8] : [0, 1], gain, mean, hist };
}

/** Glättet Auto-Werte über die Zeit (kein Flackern) */
export function smoothAuto(prev, next, k = 0.12) {
  if (!prev) return next;
  const mix = (a, b) => a + (b - a) * k;
  return {
    levels: [mix(prev.levels[0], next.levels[0]), mix(prev.levels[1], next.levels[1])],
    gain: prev.gain.map((v, i) => mix(v, next.gain[i])),
    mean: next.mean, hist: next.hist,
  };
}

/**
 * Verschiebung von b gegenüber a (Blockvergleich + Feinanteil).
 * Ergebnis: um wie viele Pixel sich der Bildinhalt bewegt hat.
 */
export function estimateShift(a, b, w, h, rx = 24, ry = 10) {
  const m = 6; // Randabstand
  let best = Infinity, bx = 0, by = 0;
  const cost = new Map();
  const score = (dx, dy) => {
    let s = 0, cnt = 0;
    const x0 = Math.max(m, m - dx), x1 = Math.min(w - m, w - m - dx);
    const y0 = Math.max(m, m - dy), y1 = Math.min(h - m, h - m - dy);
    for (let y = y0; y < y1; y += 2) {
      const ra = y * w, rb = (y + dy) * w + dx;
      for (let x = x0; x < x1; x += 2) { s += Math.abs(a[ra + x] - b[rb + x]); cnt++; }
    }
    return cnt > 50 ? s / cnt : Infinity;
  };
  // grob, dann fein
  for (let dy = -ry; dy <= ry; dy += 2) for (let dx = -rx; dx <= rx; dx += 2) {
    const s = score(dx, dy); cost.set(dx + ',' + dy, s);
    if (s < best) { best = s; bx = dx; by = dy; }
  }
  const cx = bx, cy = by;
  for (let dy = cy - 1; dy <= cy + 1; dy++) for (let dx = cx - 1; dx <= cx + 1; dx++) {
    const s = cost.get(dx + ',' + dy) ?? score(dx, dy); cost.set(dx + ',' + dy, s);
    if (s < best) { best = s; bx = dx; by = dy; }
  }
  // Parabel für Subpixel
  const get = (dx, dy) => cost.get(dx + ',' + dy) ?? score(dx, dy);
  const sub = (l, c, r) => { const d = l - 2 * c + r; return d > 0 ? 0.5 * (l - r) / d : 0; };
  const fx = sub(get(bx - 1, by), best, get(bx + 1, by));
  const fy = sub(get(bx, by - 1), best, get(bx, by + 1));
  // a[x] entspricht b[x+dx] → der Bildinhalt hat sich um (dx, dy) bewegt
  return { dx: bx + Math.max(-0.5, Math.min(0.5, fx)), dy: by + Math.max(-0.5, Math.min(0.5, fy)), err: best };
}

/** Verfolgt einen Bildpunkt von Bild zu Bild (Vorlagenvergleich, normierte Korrelation) */
export class PointTracker {
  constructor() { this.active = false; }
  start(f, x, y) {
    this.w = f.w; this.h = f.h;
    this.r = Math.round(f.w * 0.05) + 3;     // Vorlagen-Radius
    this.search = Math.round(f.w * 0.09) + 4; // Suchbereich
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.tpl = this.cut(f.gray, x, y);
    this.base = this.tpl.slice();
    this.active = !!this.tpl;
    this.conf = 1; this.lost = 0;
  }
  cut(g, x, y) {
    const r = this.r, n = 2 * r + 1, t = new Float32Array(n * n);
    const xi = Math.round(x), yi = Math.round(y);
    if (xi - r < 0 || yi - r < 0 || xi + r >= this.w || yi + r >= this.h) return null;
    for (let j = -r, k = 0; j <= r; j++) for (let i = -r; i <= r; i++, k++) t[k] = g[(yi + j) * this.w + xi + i];
    return t;
  }
  ncc(g, cx, cy) {
    const r = this.r, t = this.tpl;
    if (cx - r < 0 || cy - r < 0 || cx + r >= this.w || cy + r >= this.h) return -1;
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
    for (let j = -r, k = 0; j <= r; j += 1) {
      const row = (cy + j) * this.w + cx;
      for (let i = -r; i <= r; i += 1, k++) {
        if ((i + j) & 1) continue; // Schachbrett-Abtastung (schneller)
        const a = t[k], b = g[row + i];
        sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++;
      }
    }
    const va = saa - sa * sa / n, vb = sbb - sb * sb / n;
    if (va < 1 || vb < 1) return 0;
    return (sab - sa * sb / n) / Math.sqrt(va * vb);
  }
  update(f) {
    if (!this.active || f.w !== this.w) return null;
    const px = Math.round(this.x + this.vx), py = Math.round(this.y + this.vy);
    let best = -2, bx = px, by = py;
    const S = this.search;
    for (let dy = -S; dy <= S; dy += 2) for (let dx = -S; dx <= S; dx += 2) {
      const s = this.ncc(f.gray, px + dx, py + dy);
      if (s > best) { best = s; bx = px + dx; by = py + dy; }
    }
    const cx = bx, cy = by;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const s = this.ncc(f.gray, cx + dx, cy + dy);
      if (s > best) { best = s; bx = cx + dx; by = cy + dy; }
    }
    this.conf = best;
    if (best < 0.45) {
      // Punkt (vorübergehend) verloren: Position halten
      this.lost++;
      this.vx *= 0.5; this.vy *= 0.5;
      return { x: this.x, y: this.y, conf: best, lost: true };
    }
    this.lost = 0;
    this.vx = (bx - this.x) * 0.6 + this.vx * 0.4;
    this.vy = (by - this.y) * 0.6 + this.vy * 0.4;
    this.x = bx; this.y = by;
    // Vorlage langsam anpassen (Licht/Perspektive ändern sich), aber am Original "verankert"
    const cur = this.cut(f.gray, bx, by);
    if (cur && best > 0.7) for (let i = 0; i < cur.length; i++) this.tpl[i] = this.tpl[i] * 0.85 + (cur[i] * 0.7 + this.base[i] * 0.3) * 0.15;
    return { x: bx, y: by, conf: best, lost: false };
  }
  stop() { this.active = false; }
}
