/* Stickdateien schreiben und lesen – nur auf dem Server (DST, PES, JEF, EXP).
   Lädt dieselben Dateien wie die Offline-Version des Programms. */
'use strict';
const path = require('path');

const root = path.join(__dirname, '..');
globalThis.window = undefined;
for (const f of ['geometry', 'dst', 'dst_io', 'formats']) require(path.join(root, 'js', f + '.js'));
const HW = globalThis.HW;

const FORMATS = ['dst', 'pes', 'jef', 'exp'];
const MAX_CMDS = 3e6;

function cleanCmds(cmds) {
  if (!Array.isArray(cmds) || cmds.length > MAX_CMDS) throw new Error('Ungültige Stichdaten');
  const ok = new Set(['stitch', 'jump', 'trim', 'color']);
  return cmds.map((c) => {
    const x = +c.x, y = +c.y;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 5000 || Math.abs(y) > 5000 || !ok.has(c.cmd)) throw new Error('Ungültige Stichdaten');
    const o = { x, y, cmd: c.cmd };
    if (c.cmd === 'color') o.color = Math.max(0, Math.min(255, c.color | 0));
    if (c.cmd === 'jump' && c.float) o.float = true;
    if (c.obj !== undefined) o.obj = c.obj | 0;
    if (c.stop) o.stop = true;
    return o;
  });
}

function write(fmt, cmds, palette, opts = {}) {
  if (!FORMATS.includes(fmt)) throw new Error('Unbekanntes Format');
  const c = cleanCmds(cmds);
  const pal = (Array.isArray(palette) ? palette : []).slice(0, 256).map((p) => ({ hex: /^#[0-9a-f]{6}$/i.test(p && p.hex) ? p.hex : '#000000', name: String((p && p.name) || '').slice(0, 80) }));
  const name = String(opts.name || 'design').slice(0, 60);
  if (fmt === 'dst') {
    const s = opts.settings || {};
    return HW.dst.writeDST(c, name, { trimJumps: Math.max(1, Math.min(5, +s.trimJumps || 3)) });
  }
  return HW.formats.write(fmt, c, pal, { name, firstColor: Math.max(0, opts.firstColor | 0) });
}

function read(fmt, bytes) {
  if (fmt === 'dst') return { cmds: HW.dst.readDST(bytes), colors: [] };
  if (['pes', 'pec', 'jef', 'exp'].includes(fmt)) return HW.formats.read(fmt, bytes);
  throw new Error('Unbekanntes Format');
}

module.exports = { write, read, FORMATS };
