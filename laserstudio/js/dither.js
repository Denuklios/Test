/* LaserStudio – Bildbearbeitung für die Gravur: Helligkeit/Kontrast/Gamma und Rastermodi
   (Schwelle, Raster, Floyd-Steinberg, Atkinson, Jarvis, Stucki, Zeitungsdruck, Skizze, Graustufen).
   Raster: Float32Array, 0 = schwarz … 1 = weiß. Ergebnis: Float32Array „Schwärzung“ 0 … 1 (1 = volle Leistung). */
(function (g) {
  const FS = (g.FS = g.FS || {});

  const MODES = {
    threshold: 'Schwelle (nur Schwarz/Weiß)',
    ordered: 'Raster (geordnet, Bayer)',
    floyd: 'Floyd-Steinberg (weich)',
    atkinson: 'Atkinson (kontrastreich)',
    jarvis: 'Jarvis (beste Fotos)',
    stucki: 'Stucki (Fotos, schneller)',
    newsprint: 'Zeitungsdruck (Punkte)',
    sketch: 'Skizze (nur Kanten)',
    grayscale: 'Graustufen (Leistung je Pixel)',
  };

  /** Helligkeit b (-1..1), Kontrast c (-1..1), Gamma (0.2..5), Umkehren, Schärfen (0..2) – direkt im Raster. */
  function adjust(f, nx, ny, o = {}) {
    const b = o.bright || 0, c = o.contrast || 0, gm = o.gamma || 1, inv = !!o.invert;
    const k = c >= 0 ? 1 / Math.max(0.01, 1 - c) : 1 + c;
    if (o.sharpen > 0) sharpen(f, nx, ny, o.sharpen);
    for (let i = 0; i < f.length; i++) {
      let v = f[i];
      if (v < 0) continue; // außerhalb des Bildes
      v = (v - 0.5) * k + 0.5 + b;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      if (gm !== 1) v = Math.pow(v, gm);
      if (inv) v = 1 - v;
      f[i] = v;
    }
    return f;
  }

  function sharpen(f, nx, ny, amt) {
    const src = Float32Array.from(f);
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const p = j * nx + i;
      if (src[p] < 0) continue;
      const n = [src[p - 1], src[p + 1], src[p - nx], src[p + nx]];
      if (n.some((v) => v < 0)) continue;
      const lap = 4 * src[p] - n[0] - n[1] - n[2] - n[3];
      f[p] = Math.max(0, Math.min(1, src[p] + amt * lap));
    }
  }

  // Fehlerverteilung: [dx, dy, Gewicht]
  const KERNELS = {
    floyd: { d: 16, k: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
    atkinson: { d: 8, k: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]], lossy: true },
    jarvis: { d: 48, k: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
    stucki: { d: 42, k: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]] },
  };

  function diffuse(f, nx, ny, ker) {
    const a = Float32Array.from(f), out = new Float32Array(f.length);
    for (let j = 0; j < ny; j++) {
      // Schlangenlinie: jede zweite Zeile rückwärts – verhindert Schlieren
      const rev = j & 1;
      for (let ii = 0; ii < nx; ii++) {
        const i = rev ? nx - 1 - ii : ii, p = j * nx + i;
        if (f[p] < 0) continue;
        const v = a[p], q = v < 0.5 ? 0 : 1, e = v - q;
        out[p] = 1 - q;
        for (const [dx, dy, w] of ker.k) {
          const x = rev ? i - dx : i + dx, y = j + dy;
          if (x < 0 || x >= nx || y >= ny) continue;
          const t = y * nx + x;
          if (f[t] >= 0) a[t] += (e * w) / ker.d;
        }
      }
    }
    return out;
  }

  const BAYER8 = (() => {
    const m = [[0, 2], [3, 1]];
    let cur = m;
    for (let s = 2; s < 8; s *= 2) {
      const n = [];
      for (let y = 0; y < s * 2; y++) { n.push([]); for (let x = 0; x < s * 2; x++) n[y].push(4 * cur[y % s][x % s] + m[(y / s) | 0][(x / s) | 0]); }
      cur = n;
    }
    return cur.map((r) => r.map((v) => (v + 0.5) / 64));
  })();

  /** Rastermodus anwenden. o.cell = Punktgröße für Zeitungsdruck (in Pixeln), o.threshold 0..1 */
  function apply(f, nx, ny, mode, o = {}) {
    const out = new Float32Array(f.length);
    const th = o.threshold == null ? 0.5 : o.threshold;
    switch (mode) {
      case 'grayscale':
        for (let i = 0; i < f.length; i++) out[i] = f[i] < 0 ? 0 : 1 - f[i];
        return out;
      case 'threshold':
        for (let i = 0; i < f.length; i++) out[i] = f[i] >= 0 && f[i] < th ? 1 : 0;
        return out;
      case 'ordered':
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const p = j * nx + i; out[p] = f[p] >= 0 && f[p] < BAYER8[j & 7][i & 7] ? 1 : 0; }
        return out;
      case 'newsprint': {
        // Gedrehtes Punktraster (45°): Punktgröße wächst mit der Schwärzung
        const cell = Math.max(3, o.cell || 6), c = Math.SQRT1_2;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const p = j * nx + i;
          if (f[p] < 0) continue;
          const u = (i * c + j * c) / cell, v = (-i * c + j * c) / cell;
          const du = u - Math.floor(u) - 0.5, dv = v - Math.floor(v) - 0.5;
          const d = Math.sqrt(du * du + dv * dv) / Math.SQRT1_2; // 0 Mitte … 1 Ecke
          out[p] = d * d < 1 - f[p] ? 1 : 0;
        }
        return out;
      }
      case 'sketch': {
        // Kanten mit Sobel, dann Schwelle
        const at = (i, j) => { i = Math.max(0, Math.min(nx - 1, i)); j = Math.max(0, Math.min(ny - 1, j)); const v = f[j * nx + i]; return v < 0 ? 1 : v; };
        const lim = (1 - th) * 1.2 + 0.05;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const p = j * nx + i;
          if (f[p] < 0) continue;
          const gx = at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i - 1, j) - at(i - 1, j + 1);
          const gy = at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i, j - 1) - at(i + 1, j - 1);
          out[p] = Math.hypot(gx, gy) > lim ? 1 : 0;
        }
        return out;
      }
      default:
        return diffuse(f, nx, ny, KERNELS[mode] || KERNELS.jarvis);
    }
  }

  /** Graustufen aus RGBA (Durchsichtiges = weiß) */
  function grayFromRGBA(rgba, n) {
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rgba[i * 4 + 3] / 255;
      f[i] = ((0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255) * a + (1 - a);
    }
    return f;
  }

  FS.dither = { MODES, adjust, apply, grayFromRGBA, BAYER8 };
  if (typeof module !== 'undefined') module.exports = FS;
})(typeof window !== 'undefined' ? window : globalThis);
