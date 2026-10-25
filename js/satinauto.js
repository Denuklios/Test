/* Drehende Satinsäulen aus Flächen: Skelett (Mittellinie) -> Breite je Stelle -> Säule-A-Objekte.
   Wird für Schriften und beim Auto-Digitalisieren verwendet. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  /* ---------- Abstandstransformation (exakt, Felzenszwalb) ---------- */
  function edt1d(f, n) {
    const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    let k = 0;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s;
      do {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s <= z[k]) k--; else break;
      } while (k >= 0);
      k++;
      v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
    return d;
  }
  // Abstand jedes Vordergrundpixels zum nächsten Hintergrund (in Pixeln)
  function distanceTransform(mask, w, h) {
    const INF = 1e12;
    const tmp = new Float64Array(w * h);
    const col = new Float64Array(h);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) col[y] = mask[y * w + x] ? INF : 0;
      const d = edt1d(col, h);
      for (let y = 0; y < h; y++) tmp[y * w + x] = d[y];
    }
    const out = new Float32Array(w * h);
    const row = new Float64Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) row[x] = tmp[y * w + x];
      const d = edt1d(row, w);
      for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
    }
    return out;
  }

  /* ---------- Skelett (Zhang-Suen-Verdünnung) ---------- */
  function thin(mask, w, h) {
    const m = new Uint8Array(mask);
    for (let x = 0; x < w; x++) { m[x] = 0; m[(h - 1) * w + x] = 0; }
    for (let y = 0; y < h; y++) { m[y * w] = 0; m[y * w + w - 1] = 0; }
    let changed = true;
    const del = [];
    while (changed) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (let y = 1; y < h - 1; y++)
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (!m[i]) continue;
            const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1], p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
            const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (B < 2 || B > 6) continue;
            const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
            let A = 0;
            for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
            if (A !== 1) continue;
            if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
            del.push(i);
          }
        if (del.length) { changed = true; for (const i of del) m[i] = 0; }
      }
    }
    return m;
  }

  /* ---------- Skelett -> Pfade ---------- */
  const OFF4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const OFF8 = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

  function skeletonPaths(sk, w, h, dt) {
    const nb = (i) => {
      const x = i % w, y = (i / w) | 0, r = [];
      for (const [dx, dy] of OFF8) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && sk[yy * w + xx]) r.push(yy * w + xx);
      }
      return r;
    };
    const is4 = (a, b) => Math.abs((a % w) - (b % w)) + Math.abs(((a / w) | 0) - ((b / w) | 0)) === 1;
    const pix = [];
    for (let i = 0; i < w * h; i++) if (sk[i]) pix.push(i);
    // Knoten: Endpunkte und Verzweigungen (Kreuzungszahl)
    const cluster = new Map();
    const kind = new Map();
    for (const i of pix) {
      const x = i % w, y = (i / w) | 0;
      const ring = OFF8.map(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < w && yy < h && sk[yy * w + xx] ? 1 : 0; });
      let cn = 0;
      for (let k = 0; k < 8; k++) if (!ring[k] && ring[(k + 1) % 8]) cn++;
      const deg = ring.reduce((a, b) => a + b, 0);
      if (deg === 0) continue;
      if (cn >= 3) kind.set(i, 'j');
      else if (cn === 1 && deg <= 2) kind.set(i, 'e');
    }
    // benachbarte Verzweigungspixel zu einem Knoten zusammenfassen
    let cid = 0;
    for (const [i, k] of kind) {
      if (cluster.has(i)) continue;
      const id = cid++;
      const st = [i];
      cluster.set(i, id);
      while (st.length) {
        const q = st.pop();
        if (k !== 'j') continue;
        for (const n of nb(q)) if (kind.get(n) === 'j' && !cluster.has(n)) { cluster.set(n, id); st.push(n); }
      }
    }
    const visited = new Uint8Array(w * h);
    const branches = [];
    const pairSeen = new Set();
    const walk = (s, q) => {
      const path = [s, q];
      let prev = s, cur = q;
      const startC = cluster.get(s);
      while (!cluster.has(cur)) {
        visited[cur] = 1;
        let cand = nb(cur).filter((c) => c !== prev && !path.includes(c) && (cluster.has(c) ? !(cluster.get(c) === startC && path.length < 4) : !visited[c]));
        if (!cand.length) {
          const back = nb(cur).filter((c) => c !== prev && cluster.get(c) === startC);
          if (back.length && path.length >= 4) { path.push(back[0]); cur = back[0]; break; }
          break;
        }
        const nodeC = cand.filter((c) => cluster.has(c));
        const c4 = cand.filter((c) => is4(cur, c) && !cluster.has(c));
        const nxt = nodeC.length ? nodeC[0] : c4.length ? c4[0] : cand[0];
        prev = cur; cur = nxt;
        path.push(cur);
      }
      return { px: path, a: startC, b: cluster.has(cur) ? cluster.get(cur) : -1 };
    };
    for (const [s] of cluster) {
      for (const q of nb(s)) {
        if (cluster.has(q)) {
          const ca = cluster.get(s), cb = cluster.get(q);
          if (ca === cb) continue;
          const key = Math.min(s, q) + ':' + Math.max(s, q);
          if (pairSeen.has(key)) continue;
          pairSeen.add(key);
          branches.push({ px: [s, q], a: ca, b: cb });
        } else if (!visited[q]) branches.push(walk(s, q));
      }
    }
    // Ringe ohne Knoten (z. B. "o")
    for (const i of pix) {
      if (visited[i] || cluster.has(i) || !nb(i).length) continue;
      const path = [i];
      visited[i] = 1;
      let prev = -1, cur = i;
      for (;;) {
        const cand = nb(cur).filter((c) => c !== prev && !visited[c]);
        if (!cand.length) break;
        const c4 = cand.filter((c) => is4(cur, c));
        const nxt = c4.length ? c4[0] : cand[0];
        visited[nxt] = 1;
        path.push(nxt);
        prev = cur; cur = nxt;
      }
      if (path.length < 3) continue;
      const closed = nb(cur).includes(i) && path.length > 6;
      branches.push({ px: path, a: -1, b: -1, closed });
    }
    return { branches, cluster, nodeKind: kind, dtAt: (i) => dt[i] };
  }

  function pxLen(px, w) {
    let L = 0;
    for (let i = 1; i < px.length; i++) L += Math.hypot((px[i] % w) - (px[i - 1] % w), ((px[i] / w) | 0) - ((px[i - 1] / w) | 0));
    return L;
  }

  // Seitenäste entfernen und Äste durch Knoten zu durchgehenden Strichen verbinden
  function simplifyGraph(br, w, dt, clusterPix) {
    let branches = br.slice();
    const ends = () => {
      const m = new Map();
      branches.forEach((b, bi) => {
        if (b.closed) return;
        if (b.a >= 0) { if (!m.has(b.a)) m.set(b.a, []); m.get(b.a).push([bi, 'a']); }
        if (b.b >= 0) { if (!m.has(b.b)) m.set(b.b, []); m.get(b.b).push([bi, 'b']); }
      });
      return m;
    };
    // 1) Sporne abschneiden
    for (let pass = 0; pass < 4; pass++) {
      const m = ends();
      const deg = (c) => (c >= 0 && m.has(c) ? m.get(c).length : 0);
      let removed = false;
      branches = branches.filter((b) => {
        if (b.closed) return true;
        const da = deg(b.a), db = deg(b.b);
        const freeA = da <= 1, freeB = db <= 1;
        if (freeA === freeB) return true;
        const jc = freeA ? b.b : b.a;
        const jr = Math.max(...(clusterPix.get(jc) || [0]).map((p) => dt[p] || 0));
        if (pxLen(b.px, w) < jr * 1.6 + 2) { removed = true; return false; }
        return true;
      });
      if (!removed) break;
    }
    // 1b) Gabeln an breiten Strichenden: zwei kurze freie Äste an einem Knoten -> beide weg, Knoten wird freies Ende
    const freed = new Set();
    {
      const m = ends();
      const deg = (c) => (c >= 0 && m.has(c) ? m.get(c).length : 0);
      const drop = new Set();
      for (const [c, list] of m) {
        if (list.length !== 3) continue;
        const jr = Math.max(...(clusterPix.get(c) || [0]).map((p) => dt[p] || 0));
        const short = list.filter(([bi, e]) => {
          const b = branches[bi], other = e === 'a' ? b.b : b.a;
          return deg(other) <= 1 && pxLen(b.px, w) < jr * 3.2 + 3;
        });
        if (short.length === 2) { short.forEach(([bi]) => drop.add(bi)); freed.add(c); }
      }
      branches = branches.filter((_, i) => !drop.has(i));
    }
    // 2) Durch Knoten verbinden
    const dirAt = (b, end) => {
      const px = end === 'a' ? b.px : b.px.slice().reverse();
      const k = Math.min(px.length - 1, Math.max(3, Math.round((dt[px[0]] || 2) * 1.5)));
      const dx = (px[k] % w) - (px[0] % w), dy = ((px[k] / w) | 0) - ((px[0] / w) | 0);
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    };
    for (let guard = 0; guard < 500; guard++) {
      const m = ends();
      let did = false;
      for (const list of m.values()) {
        if (list.length < 2) continue;
        let best = null, bd = list.length === 2 ? 2 : -0.55;
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            const [bi, ei] = list[i], [bj, ej] = list[j];
            const di = dirAt(branches[bi], ei), dj = dirAt(branches[bj], ej);
            const dot = di.x * dj.x + di.y * dj.y;
            if (dot < bd) { bd = dot; best = [list[i], list[j]]; }
          }
        if (!best) continue;
        const [[bi, ei], [bj, ej]] = best;
        if (bi === bj) { branches[bi].closed = true; branches[bi].a = branches[bi].b = -1; did = true; break; }
        const A = branches[bi], B = branches[bj];
        const pa = ei === 'b' ? A.px : A.px.slice().reverse();
        const pb = ej === 'a' ? B.px : B.px.slice().reverse();
        const na = ei === 'b' ? A.a : A.b, nb2 = ej === 'a' ? B.b : B.a;
        const merged = { px: pa.concat(pb.slice(1)), a: na, b: nb2, junction: (A.junction || 0) + 1 };
        branches = branches.filter((_, k) => k !== bi && k !== bj);
        branches.push(merged);
        did = true;
        break;
      }
      if (!did) break;
    }
    return { branches, freed };
  }

  /* ---------- Strahl gegen Umriss ---------- */
  function rayDist(p, d, rings, maxLen) {
    let best = maxLen;
    for (const r of rings)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[j], b = r[i];
        const ex = b.x - a.x, ey = b.y - a.y;
        const den = d.x * ey - d.y * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
        const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
        if (t > 1e-6 && t < best && u >= 0 && u <= 1) best = t;
      }
    return best;
  }

  function smoothPts(pts, win, closed) {
    const n = pts.length, h = Math.floor(win / 2);
    return pts.map((p, i) => {
      if (!closed && (i < 1 || i > n - 2)) return p;
      let sx = 0, sy = 0, c = 0;
      for (let k = -h; k <= h; k++) {
        let j = i + k;
        if (closed) j = (j + n) % n; else if (j < 0 || j >= n) continue;
        sx += pts[j].x; sy += pts[j].y; c++;
      }
      return { x: sx / c, y: sy / c };
    });
  }

  /**
   * Fläche -> Säulen.
   * mask/w/h: Pixelmaske der Region, mm: mm pro Pixel, org: {x,y} Ursprung in mm, rings: Umriss+Löcher in mm.
   * Rückgabe: {columns: [[{x,y,c},...]], widths: [mm...]} oder null, wenn die Form dafür ungeeignet ist.
   */
  /* ---------- Bereiche: jedem Strich gehört der Teil der Fläche, der ihm am nächsten liegt ---------- */
  function regionLabels(mask, w, h, seeds) {
    const n = w * h, INF = 1e9;
    const dist = new Float64Array(n).fill(INF), lab = new Int16Array(n).fill(-1);
    let hk = [], hv = [];
    const push = (k, v) => {
      let i = hk.length; hk.push(k); hv.push(v);
      while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
      hk[i] = k; hv[i] = v;
    };
    const pop = () => {
      const rk = hk[0], rv = hv[0], k = hk.pop(), v = hv.pop(), n2 = hk.length;
      if (n2) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1; if (c >= n2) break;
          if (c + 1 < n2 && hk[c + 1] < hk[c]) c++;
          if (hk[c] >= k) break;
          hk[i] = hk[c]; hv[i] = hv[c]; i = c;
        }
        hk[i] = k; hv[i] = v;
      }
      return [rk, rv];
    };
    seeds.forEach((px, li) => { for (const i of px) if (mask[i] && dist[i] > 0) { dist[i] = 0; lab[i] = li; push(0, i); } });
    const D = 1.41421356;
    while (hk.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      const x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of OFF8) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!mask[j]) continue;
        const nd = d + (dx && dy ? D : 1);
        if (nd < dist[j]) { dist[j] = nd; lab[j] = lab[i]; push(nd, j); }
      }
    }
    return lab;
  }

  // Umriss eines Bereichs (mm) aus der Labelkarte
  function regionRings(lab, li, w, h, mm, org) {
    const SC = HW.scan;
    if (!SC) return null;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lab[y * w + x] === li) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - 3); y0 = Math.max(0, y0 - 3); x1 = Math.min(w - 1, x1 + 3); y1 = Math.min(h - 1, y1 + 3);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, f = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) f[y * cw + x] = lab[(y + y0) * w + x + x0] === li ? 1 : 0;
    const fb = SC.blur(f, cw, ch, 0.7);
    const co = { mm, ox: org.x + x0 * mm, oy: org.y + y0 * mm, sigma: 0.06, corner: 55, step: 0.1 };
    const rs = SC.contours(fb, cw, ch, 0.5).map((r) => SC.cleanRing(r, co).dense).filter((r) => r.length >= 4);
    return rs.length ? rs : null;
  }

  function shapeToColumns(mask, w, h, mm, org, rings, opts = {}) {
    const dt = distanceTransform(mask, w, h);
    const sk = thin(mask, w, h);
    const g0 = skeletonPaths(sk, w, h, dt);
    const clusterPix = new Map();
    for (const [p, c] of g0.cluster) { if (!clusterPix.has(c)) clusterPix.set(c, []); clusterPix.get(c).push(p); }
    const { branches, freed } = simplifyGraph(g0.branches, w, dt, clusterPix);
    const freeEnd = (c) => c < 0 || freed.has(c) || g0.nodeKind.get((clusterPix.get(c) || [])[0]) === 'e';
    const toMM = (i) => ({ x: org.x + ((i % w) + 0.5) * mm, y: org.y + (((i / w) | 0) + 0.5) * mm });
    const step = 0.4;
    const columns = [], widths = [];
    const jobs = [];
    const rAt = (p) => {
      const x = Math.max(0, Math.min(w - 1, Math.floor((p.x - org.x) / mm))), y = Math.max(0, Math.min(h - 1, Math.floor((p.y - org.y) / mm)));
      return Math.max(0.3, dt[y * w + x] * mm);
    };
    const tangents = (arr) => arr.map((p, i) => {
      const k = 2;
      const a = arr[Math.max(0, i - k)], c = arr[Math.min(arr.length - 1, i + k)];
      const l = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      return { x: (c.x - a.x) / l, y: (c.y - a.y) / l };
    });
    for (const b of branches) {
      if (b.px.length < 2) continue;
      const closed = !!b.closed;
      let pts = smoothPts(b.px.map(toMM), 7, closed);
      pts = smoothPts(pts, 5, closed);
      if (closed) pts = pts.concat([pts[0]]);
      pts = G.resample(pts, step, 181);
      if (pts.length < 2) continue;
      const pieces = [];
      {
        const T = tangents(pts);
        let start = 0;
        for (let i = 3; i < pts.length - 3; i++) {
          const r = rAt(pts[i]);
          const k = Math.max(3, Math.ceil((r * 1.2) / step));
          if (i - k < start + 2 || i + k > pts.length - 1) continue;
          const a = T[i - k], c = T[i + k];
          const ang = Math.acos(Math.max(-1, Math.min(1, a.x * c.x + a.y * c.y)));
          // echte Ecke: Richtungsänderung konzentriert sich auf eine Stelle
          // (bei gleichmäßigen Bögen verdoppelt sich der Winkel mit dem doppelten Fenster)
          const k2 = Math.min(i, pts.length - 1 - i, 2 * k);
          const a2 = T[i - k2], c2 = T[i + k2];
          const ang2 = Math.acos(Math.max(-1, Math.min(1, a2.x * c2.x + a2.y * c2.y)));
          const sharp = k2 < 2 * k ? ang > (75 * Math.PI) / 180 : ang > 0.72 * ang2;
          if (ang > (60 * Math.PI) / 180 && sharp) {
            // lokales Maximum suchen
            let bi = i, bAng = ang;
            for (let j = i + 1; j < Math.min(pts.length - k, i + k); j++) {
              const a2 = T[j - k], c2 = T[j + k];
              const an = Math.acos(Math.max(-1, Math.min(1, a2.x * c2.x + a2.y * c2.y)));
              if (an > bAng) { bAng = an; bi = j; }
            }
            pieces.push({ pts: pts.slice(start, bi + 1), sa: start === 0 ? 'orig' : 'split', sb: 'split' });
            start = bi;
            i = bi + k;
          }
        }
        pieces.push({ pts: pts.slice(start), sa: start === 0 ? 'orig' : 'split', sb: 'orig' });
        if (pieces.length > 1 && closed) {
          // Naht des Rings an die erste Ecke legen
          const f = pieces.shift(), l = pieces.pop();
          pieces.push({ pts: l.pts.concat(f.pts.slice(1)), sa: 'split', sb: 'split' });
        }
      }
      for (const pc of pieces) {
        if (pc.pts.length < 2) continue;
        jobs.push({ P: pc.pts, closed: closed && pieces.length === 1 });
      }
    }
    if (jobs.length > 1) {
      // kurze Stummel (Skelettgabeln an Ecken) gehören zum Nachbarn: Fläche wird von dessen Säule mit abgedeckt
      const lens = jobs.map((jb) => { let L = 0; for (let k = 1; k < jb.P.length; k++) L += G.dist(jb.P[k - 1], jb.P[k]); return L; });
      const rM = jobs.map((jb) => { const rs = jb.P.map(rAt).sort((x, y) => x - y); return rs[Math.floor(rs.length / 2)]; });
      const keepJ = jobs.filter((jb, i) => jb.closed || lens[i] >= rM[i] * 2.2);
      if (keepJ.length && keepJ.length < jobs.length) { jobs.length = 0; keepJ.forEach((j) => jobs.push(j)); }
    }
    // Phase 2: Bereiche bestimmen (jeder Strich bekommt nur „seine“ Fläche -> keine Überlappungen)
    let labs = null;
    if (opts.regions !== false && HW.scan && jobs.length > 1) {
      const seeds = jobs.map((jb) => {
        const px = [];
        const P = jb.P;
        for (let k = 0; k < P.length; k++) {
          const q = k ? P[k - 1] : P[k], n = Math.max(1, Math.ceil(G.dist(q, P[k]) / (mm * 0.5)));
          for (let t = 1; t <= n; t++) {
            const x = Math.floor(((q.x + (P[k].x - q.x) * (t / n)) - org.x) / mm), y = Math.floor(((q.y + (P[k].y - q.y) * (t / n)) - org.y) / mm);
            if (x >= 0 && y >= 0 && x < w && y < h) px.push(y * w + x);
          }
        }
        return px;
      });
      labs = regionLabels(mask, w, h, seeds);
    }
    for (let ji = 0; ji < jobs.length; ji++) {
      const { closed } = jobs[ji];
      let P = jobs[ji].P;
      const jr = labs ? regionRings(labs, ji, w, h, mm, org) : null;
      const rg = jr || rings;
      const inside = (p) => G.pointInRings(p, rg);
      {
        const extendA = !closed, extendB = !closed;
        const extend = (arr, atStart) => {
          const T = tangents(arr);
          const i = atStart ? 0 : arr.length - 1;
          const t = atStart ? { x: -T[i].x, y: -T[i].y } : T[i];
          const p0 = arr[i];
          const lim = rAt(p0) * 3 + 0.5;
          let d = 0;
          while (d < lim && inside({ x: p0.x + t.x * (d + 0.1), y: p0.y + t.y * (d + 0.1) })) d += 0.1;
          const add = [];
          for (let s = step; s < d - 0.1; s += step) add.push({ x: p0.x + t.x * s, y: p0.y + t.y * s });
          if (d > 0.25) add.push({ x: p0.x + t.x * (d - 0.12), y: p0.y + t.y * (d - 0.12) });
          return atStart ? add.reverse().concat(arr) : arr.concat(add);
        };
        const rRef = (() => { const rs = P.map(rAt).sort((x, y) => x - y); return rs[Math.floor(rs.length / 2)]; })();
        if (extendA) P = extend(P, true);
        if (extendB) P = extend(P, false);
        if (P.length < 2) continue;
        const T = tangents(P);
        // Breiten links/rechts
        let W = P.map((p, i) => {
          const n = { x: -T[i].y, y: T[i].x };
          const r = rAt(p), lim = Math.max(r, rRef) * 1.35 + 0.2;
          const wl = rayDist(p, n, rg, lim), wr = rayDist(p, { x: -n.x, y: -n.y }, rg, lim);
          return { wl: wl >= lim ? r : wl, wr: wr >= lim ? r : wr, n };
        });
        W = W.map((x, i) => {
          let sl = 0, sr = 0, c = 0;
          for (let k = -2; k <= 2; k++) { const y = W[i + k]; if (y) { sl += y.wl; sr += y.wr; c++; } }
          return { ...x, wl: Math.min(x.wl, (sl / c) * 1.15), wr: Math.min(x.wr, (sr / c) * 1.15) };
        });
        // Stationen (Punktpaare) wählen
        const st = [0];
        let acc = 0, lastT = T[0], lastW = W[0].wl + W[0].wr;
        for (let i = 1; i < P.length - 1; i++) {
          acc += G.dist(P[i - 1], P[i]);
          const turn = Math.acos(Math.max(-1, Math.min(1, T[i].x * lastT.x + T[i].y * lastT.y)));
          const wi = W[i].wl + W[i].wr;
          if (acc >= (opts.station || 1.4) || turn > ((opts.turnDeg || 8) * Math.PI) / 180 || Math.abs(wi - lastW) > Math.max(0.3, lastW * 0.22)) {
            if (acc >= 0.5) { st.push(i); acc = 0; lastT = T[i]; lastW = wi; }
          }
        }
        st.push(P.length - 1);
        const col = [];
        st.forEach((i, k) => {
          const p = P[i], ww = W[i];
          const c = k > 0 && k < st.length - 1;
          col.push({ x: p.x + ww.n.x * ww.wl, y: p.y + ww.n.y * ww.wl, c }, { x: p.x - ww.n.x * ww.wr, y: p.y - ww.n.y * ww.wr, c });
          widths.push(ww.wl + ww.wr);
        });
        if (!closed && col.length >= 6 && opts.endCut !== false) {
          const reach = Math.max(rRef * 3, 1);
          const fix = (iPrev, iEnd, tdir) => {
            for (const side of [0, 1]) {
              const q = col[iPrev * 2 + side], nrm = W[st[iPrev]].n, sg = side ? 1 : -1;
              // minimal ins Innere versetzt starten, dann entlang der Tangente bis zur Bereichsgrenze
              const o = { x: q.x + nrm.x * sg * 0.03, y: q.y + nrm.y * sg * 0.03 };
              const d = rayDist(o, tdir, rg, reach);
              if (d < reach && d > 0.02) col[iEnd * 2 + side] = { x: q.x + tdir.x * d, y: q.y + tdir.y * d, c: false };
            }
          };
          const m = st.length - 1;
          fix(m - 1, m, T[P.length - 1]);
          fix(1, 0, { x: -T[0].x, y: -T[0].y });
        }
        if (col.length >= 4) columns.push(col);
      }
    }
    if (!columns.length) return null;
    return { columns, widths };
  }

  // Säule A umdrehen (Paare in umgekehrter Reihenfolge)
  function reverseColA(pts) {
    const out = [];
    for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);
    return out;
  }

  // Säulen so sortieren und drehen, dass die Wege kurz werden
  function orderColumns(cols, start) {
    const res = [];
    let cur = start;
    const rest = cols.slice();
    while (rest.length) {
      let bi = 0, rev = false, bd = Infinity;
      rest.forEach((c, i) => {
        const s = G.lerp(c[0], c[1], 0.5), e = G.lerp(c[c.length - 2], c[c.length - 1], 0.5);
        const ds = cur ? G.dist(cur, s) : s.x, de = cur ? G.dist(cur, e) : e.x;
        if (ds < bd) { bd = ds; bi = i; rev = false; }
        if (de < bd) { bd = de; bi = i; rev = true; }
      });
      let c = rest.splice(bi, 1)[0];
      if (rev) c = reverseColA(c);
      res.push(c);
      cur = G.lerp(c[c.length - 2], c[c.length - 1], 0.5);
    }
    return res;
  }

  HW.satinauto = { distanceTransform, thin, shapeToColumns, reverseColA, orderColumns, rayDist };
})(typeof window !== 'undefined' ? window : globalThis);
