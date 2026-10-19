/* Materialabtrag simulieren: Höhenkarte des Werkstücks, Werkzeug wird entlang der Bahnen "gestempelt". */
(function (g) {
  const FS = (g.FS = g.FS || {});

  function create(stock, cell) {
    const c = cell || Math.max(0.1, Math.sqrt((stock.w * stock.h) / 1.5e6));
    const nx = Math.max(2, Math.ceil(stock.w / c) + 1), ny = Math.max(2, Math.ceil(stock.h / c) + 1);
    return { nx, ny, cell: c, t: stock.t, h: new Float32Array(nx * ny), mi: 0, prev: null, version: 0, warnings: new Set(), fp: new Map() };
  }

  function reset(sim) { sim.h.fill(0); sim.mi = 0; sim.prev = null; sim.version++; sim.warnings.clear(); }

  function footprint(sim, tool) {
    const key = tool ? tool.id + ':' + tool.d + ':' + (tool.angle || 0) + ':' + tool.type : 'none';
    if (sim.fp.has(key)) return sim.fp.get(key);
    const t = tool || { type: 'flat', d: 3.175 };
    const prof = FS.tools.profile(t);
    const R = t.d / 2, rc = Math.ceil(R / sim.cell);
    const di = [], dj = [], dz = [];
    for (let j = -rc; j <= rc; j++) for (let i = -rc; i <= rc; i++) {
      const p = prof(Math.hypot(i * sim.cell, j * sim.cell));
      if (p !== Infinity) { di.push(i); dj.push(j); dz.push(p); }
    }
    const f = { di: Int32Array.from(di), dj: Int32Array.from(dj), dz: Float32Array.from(dz), R };
    sim.fp.set(key, f);
    return f;
  }

  function stamp(sim, fp, x, y, z) {
    const ci = Math.round(x / sim.cell), cj = Math.round(y / sim.cell);
    const { nx, ny, h } = sim;
    const floor = -sim.t;
    let hit = false;
    for (let k = 0; k < fp.di.length; k++) {
      const i = ci + fp.di[k], j = cj + fp.dj[k];
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const v = Math.max(floor, z + fp.dz[k]), idx = j * nx + i;
      if (v < h[idx] - 1e-6) { h[idx] = v; hit = true; }
    }
    return hit;
  }

  /** Bewegungen ab sim.mi abarbeiten, bis budget Stempel verbraucht sind. Liefert true, wenn fertig. */
  function run(sim, moves, defaultTool, budget = Infinity) {
    let used = 0;
    const tools = Array.isArray(defaultTool) ? null : defaultTool;
    while (sim.mi < moves.length && used < budget) {
      const m = moves[sim.mi];
      const p = sim.prev || { x: m.x, y: m.y, z: Math.max(m.z, 5) };
      const tool = m.tool || tools;
      if (!(p.z >= 0 && m.z >= 0)) {
        const fp = footprint(sim, tool);
        const L = Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z);
        const n = Math.max(1, Math.ceil(L / (sim.cell * 0.6)));
        for (let s = 1; s <= n; s++) {
          const t = s / n;
          const hit = stamp(sim, fp, p.x + (m.x - p.x) * t, p.y + (m.y - p.y) * t, p.z + (m.z - p.z) * t);
          if (hit && m.rapid && !(m.z > p.z && Math.hypot(m.x - p.x, m.y - p.y) < 1e-6)) sim.warnings.add('Eilgang (G0) durch Material – Sicherheitshöhe prüfen!');
        }
        used += n;
      }
      sim.prev = { x: m.x, y: m.y, z: m.z };
      sim.mi++;
    }
    sim.version++;
    return sim.mi >= moves.length;
  }

  function heightAt(sim, x, y) {
    const i = Math.round(x / sim.cell), j = Math.round(y / sim.cell);
    if (i < 0 || j < 0 || i >= sim.nx || j >= sim.ny) return null;
    return sim.h[j * sim.nx + i];
  }

  FS.sim = { create, reset, run, heightAt, footprint };
})(typeof window !== 'undefined' ? window : globalThis);
