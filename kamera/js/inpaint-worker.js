// Gegenstände entfernen: inhaltsbasiertes Füllen (mehrstufiges PatchMatch).
// Eingabe: {w, h, data (RGBA), mask (1 = entfernen)}; Ausgabe: gefülltes RGBA.
const P = 3; // Flicken-Radius (7×7)

function downsample(img, w, h) {
  const W = Math.max(1, w >> 1), H = Math.max(1, h >> 1);
  const out = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const xx = Math.min(w - 1, 2 * x + i), yy = Math.min(h - 1, 2 * y + j);
        s += img[(yy * w + xx) * 3 + c];
      }
      out[(y * W + x) * 3 + c] = s / 4;
    }
  }
  return { img: out, w: W, h: H };
}
function downMask(m, w, h) {
  const W = Math.max(1, w >> 1), H = Math.max(1, h >> 1);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let any = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const xx = Math.min(w - 1, 2 * x + i), yy = Math.min(h - 1, 2 * y + j);
      any |= m[yy * w + xx];
    }
    out[y * W + x] = any;
  }
  return out;
}

/** Löcher grob füllen (von außen nach innen mitteln) */
function diffuseFill(img, mask, w, h) {
  const m = mask.slice();
  let left = m.reduce((a, v) => a + v, 0);
  let guard = 0;
  while (left > 0 && guard++ < 4000) {
    const next = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!m[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const xx = x + k, yy = y + j;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (m[q]) continue;
        r += img[q * 3]; g += img[q * 3 + 1]; b += img[q * 3 + 2]; n++;
      }
      if (n) next.push([i, r / n, g / n, b / n]);
    }
    if (!next.length) break;
    for (const [i, r, g, b] of next) { img[i * 3] = r; img[i * 3 + 1] = g; img[i * 3 + 2] = b; m[i] = 0; left--; }
  }
}

function solveLevel(img, mask, w, h, iters, nnfInit) {
  // gültige Quellen: Flicken komplett außerhalb der Maske
  const valid = new Uint8Array(w * h);
  const srcList = [];
  for (let y = P; y < h - P; y++) for (let x = P; x < w - P; x++) {
    let ok = 1;
    for (let j = -P; j <= P && ok; j++) for (let i = -P; i <= P; i++) if (mask[(y + j) * w + x + i]) { ok = 0; break; }
    if (ok) { valid[y * w + x] = 1; srcList.push(y * w + x); }
  }
  if (!srcList.length) return;
  // Ziele: Pixel, deren Flicken die Maske berührt
  const tgt = new Uint8Array(w * h);
  const tgtList = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    for (let j = -P; j <= P; j++) for (let i = -P; i <= P; i++) {
      const xx = x + i, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const q = yy * w + xx;
      if (!tgt[q]) { tgt[q] = 1; tgtList.push(q); }
    }
  }
  const nnf = new Int32Array(w * h).fill(-1);
  const cost = new Float32Array(w * h).fill(Infinity);

  const dist = (p, q, limit) => {
    const px = p % w, py = (p / w) | 0, qx = q % w, qy = (q / w) | 0;
    let d = 0, n = 0;
    for (let j = -P; j <= P; j++) {
      const ay = py + j; if (ay < 0 || ay >= h) continue;
      const by = qy + j;
      for (let i = -P; i <= P; i++) {
        const ax = px + i; if (ax < 0 || ax >= w) continue;
        const a = (ay * w + ax) * 3, b = (by * w + qx + i) * 3;
        const dr = img[a] - img[b], dg = img[a + 1] - img[b + 1], db = img[a + 2] - img[b + 2];
        d += dr * dr + dg * dg + db * db; n++;
      }
      if (d > limit * n * 1.5 && n > 14) return Infinity;
    }
    return d / Math.max(1, n);
  };
  const tryMatch = (p, q) => {
    if (q < 0 || !valid[q] || q === nnf[p]) return;
    const d = dist(p, q, cost[p]);
    if (d < cost[p]) { cost[p] = d; nnf[p] = q; }
  };

  for (const p of tgtList) {
    const init = nnfInit ? nnfInit(p) : -1;
    nnf[p] = init >= 0 && valid[init] ? init : srcList[(Math.random() * srcList.length) | 0];
    cost[p] = dist(p, nnf[p], Infinity);
  }

  for (let it = 0; it < iters; it++) {
    for (let pass = 0; pass < 2; pass++) {
      const fwd = pass === 0;
      const list = fwd ? tgtList : tgtList.slice().reverse();
      const s = fwd ? 1 : -1;
      for (const p of list) {
        const x = p % w, y = (p / w) | 0;
        // Weitergeben von Nachbarn
        if (x - s >= 0 && x - s < w && tgt[p - s] && nnf[p - s] >= 0) tryMatch(p, nnf[p - s] + s);
        if (y - s >= 0 && y - s < h && tgt[p - s * w] && nnf[p - s * w] >= 0) tryMatch(p, nnf[p - s * w] + s * w);
        // Zufallssuche mit kleiner werdendem Radius
        let r = Math.max(w, h);
        const bx = nnf[p] % w, by = (nnf[p] / w) | 0;
        while (r >= 1) {
          const qx = Math.round(bx + (Math.random() * 2 - 1) * r), qy = Math.round(by + (Math.random() * 2 - 1) * r);
          if (qx >= 0 && qy >= 0 && qx < w && qy < h) tryMatch(p, qy * w + qx);
          r >>= 1;
        }
        // ab und zu ganz zufällig (findet entfernte gute Stellen)
        tryMatch(p, srcList[(Math.random() * srcList.length) | 0]);
      }
    }
    // Abstimmen: Lochpixel = gewichteter Mittelwert aller überdeckenden Flicken
    let sigma = 0, ns = 0;
    for (const p of tgtList) if (isFinite(cost[p])) { sigma += cost[p]; ns++; }
    sigma = Math.max(1, sigma / Math.max(1, ns));
    const acc = new Float32Array(w * h * 4);
    for (const p of tgtList) {
      const q = nnf[p]; if (q < 0) continue;
      const wgt = Math.exp(-cost[p] / (2 * sigma));
      const px = p % w, py = (p / w) | 0, qx = q % w, qy = (q / w) | 0;
      for (let j = -P; j <= P; j++) {
        const ay = py + j; if (ay < 0 || ay >= h) continue;
        for (let i = -P; i <= P; i++) {
          const ax = px + i; if (ax < 0 || ax >= w) continue;
          const a = ay * w + ax;
          if (!mask[a]) continue;
          const b = ((qy + j) * w + qx + i) * 3;
          acc[a * 4] += img[b] * wgt; acc[a * 4 + 1] += img[b + 1] * wgt; acc[a * 4 + 2] += img[b + 2] * wgt; acc[a * 4 + 3] += wgt;
        }
      }
    }
    for (let a = 0; a < w * h; a++) {
      if (!mask[a] || acc[a * 4 + 3] <= 0) continue;
      const k = acc[a * 4 + 3];
      img[a * 3] = acc[a * 4] / k; img[a * 3 + 1] = acc[a * 4 + 1] / k; img[a * 3 + 2] = acc[a * 4 + 2] / k;
    }
  }
  return nnf;
}

self.onmessage = (e) => {
  const { w, h, data, mask } = e.data;
  const base = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) { base[i * 3] = data[i * 4]; base[i * 3 + 1] = data[i * 4 + 1]; base[i * 3 + 2] = data[i * 4 + 2]; }
  // Pyramide
  const levels = [{ img: base, mask, w, h }];
  while (levels.length < 8) {
    const L = levels[levels.length - 1];
    if (Math.min(L.w, L.h) < 40) break;
    let holes = 0; for (let i = 0; i < L.mask.length; i++) holes += L.mask[i];
    if (holes < 30) break;
    const d = downsample(L.img, L.w, L.h);
    levels.push({ img: d.img, mask: downMask(L.mask, L.w, L.h), w: d.w, h: d.h });
  }
  const top = levels[levels.length - 1];
  diffuseFill(top.img, top.mask, top.w, top.h);
  let prevNnf = null, prevW = 0;
  for (let li = levels.length - 1; li >= 0; li--) {
    const L = levels[li];
    if (li < levels.length - 1) {
      // Ergebnis der gröberen Stufe hochskalieren
      const C = levels[li + 1];
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const i = y * L.w + x;
        if (!L.mask[i]) continue;
        const cx = Math.min(C.w - 1, x >> 1), cy = Math.min(C.h - 1, y >> 1);
        const c = (cy * C.w + cx) * 3;
        L.img[i * 3] = C.img[c]; L.img[i * 3 + 1] = C.img[c + 1]; L.img[i * 3 + 2] = C.img[c + 2];
      }
    }
    const pn = prevNnf, pw = prevW, lw = L.w;
    const init = pn ? (p) => {
      const x = p % lw, y = (p / lw) | 0;
      const cp = (y >> 1) * pw + (x >> 1);
      const q = pn[cp];
      if (q == null || q < 0) return -1;
      return (((q / pw) | 0) * 2 + (y & 1)) * lw + (q % pw) * 2 + (x & 1);
    } : null;
    const iters = li === levels.length - 1 ? 6 : li === 0 ? 2 : 4;
    prevNnf = solveLevel(L.img, L.mask, L.w, L.h, iters, init) || null;
    prevW = L.w;
    self.postMessage({ progress: 1 - li / levels.length });
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = base[i * 3]; out[i * 4 + 1] = base[i * 3 + 1]; out[i * 4 + 2] = base[i * 3 + 2]; out[i * 4 + 3] = 255;
  }
  self.postMessage({ done: true, data: out }, [out.buffer]);
};
