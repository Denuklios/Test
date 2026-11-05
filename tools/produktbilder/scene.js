// 3D-Bilder für die Produktgruppen der Wunsch-Fabrik: einheitlicher Stil (weiches Studiolicht, Schatten, freigestellt).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const SIZE = 640;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

let font = null;
const fontReady = new Promise((ok) => new FontLoader().load('node_modules/three/examples/fonts/helvetiker_bold.typeface.json', (f) => { font = f; ok(); }));

// ---------- Materialien ----------
const P = {
  purple: '#7e22ce', violet: '#a855f7', lilac: '#e9d5ff', gold: '#f5b83d', navy: '#1e2a4a', white: '#f4f2f7', grey: '#4b4f5c',
  orange: '#ff7a1a', yellow: '#ffd23f', mint: '#7dd3c0', pink: '#f9a8d4', sky: '#93c5fd', red: '#e5484d', green: '#2f9e6b',
  wood: '#c98b52', woodDark: '#8a5a33', slate: '#2f3440', steel: '#c9ced6', cork: '#c9a06a', leather: '#8b4a2b', kraft: '#c8a06e',
};
const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: o.r ?? 0.55, metalness: o.m ?? 0, clearcoat: o.cc ?? 0.15, clearcoatRoughness: 0.4, sheen: o.sheen ?? 0, sheenColor: new THREE.Color(o.sheenColor || '#ffffff'), sheenRoughness: 0.6, transmission: o.tr ?? 0, thickness: o.th ?? 0, ior: o.ior ?? 1.5, transparent: !!o.tr || o.op !== undefined, opacity: o.op ?? 1, envMapIntensity: o.env ?? 1, side: o.side ?? THREE.FrontSide });
const fabric = (c) => { const sc = new THREE.Color(c).lerp(new THREE.Color('#ffffff'), 0.35); return mat(c, { r: 0.8, sheen: 0.5, sheenColor: '#' + sc.getHexString(), cc: 0, env: 0.55 }); };
const glossy = (c) => mat(c, { r: 0.25, cc: 0.8 });
const metal = (c, r = 0.25) => mat(c, { m: 1, r, cc: 0.3 });
const glass = (tint = '#ffffff') => mat(tint, { r: 0.05, tr: 1, th: 0.4, ior: 1.45, cc: 1, env: 1.2 });

// ---------- Geometrie-Helfer ----------
function extrude(shape, depth, bevel = 0.06, segs = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: segs, curveSegments: 48 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
function mesh(g, m, cast = true) { const x = new THREE.Mesh(g, m); x.castShadow = cast; x.receiveShadow = true; return x; }
function rbox(w, h, d, r, m, segs = 6) { return mesh(new RoundedBoxGeometry(w, h, d, segs, r), m); }
function lathe(points, m, segs = 96) { return mesh(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs), m); }
function text(str, size, depth, m, bevel = 0.012) {
  const g = new TextGeometry(str, { font, size, height: depth, curveSegments: 10, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3 });
  g.center(); return mesh(g, m);
}
function roundRectShape(w, h, r) {
  const s = new THREE.Shape(); const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function circleShape(r) { const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false); return s; }
function starShape(R, r, n = 5) { const s = new THREE.Shape(); for (let i = 0; i < n * 2; i++) { const a = Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r : R; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
function heartShape(k) {
  const s = new THREE.Shape(); s.moveTo(0, -0.9 * k);
  s.bezierCurveTo(-0.2 * k, -0.6 * k, -1.0 * k, -0.25 * k, -1.0 * k, 0.25 * k); s.bezierCurveTo(-1.0 * k, 0.75 * k, -0.35 * k, 0.95 * k, 0, 0.5 * k);
  s.bezierCurveTo(0.35 * k, 0.95 * k, 1.0 * k, 0.75 * k, 1.0 * k, 0.25 * k); s.bezierCurveTo(1.0 * k, -0.25 * k, 0.2 * k, -0.6 * k, 0, -0.9 * k); return s;
}
// Wunsch-Fabrik-Druck: kleines Emblem (Kreis + Stern), als „Veredelung“ auf vielen Produkten
function emblem(r, depth = 0.03, c1 = P.purple, c2 = P.gold) {
  const g = new THREE.Group();
  const disc = mesh(extrude(circleShape(r), depth, depth * 0.4, 3), glossy(c1)); g.add(disc);
  const st = mesh(extrude(starShape(r * 0.62, r * 0.28), depth, depth * 0.4, 3), glossy(c2)); st.position.z = depth * 0.9; g.add(st);
  return g;
}

// Hemd-Silhouette (Vorderseite), Werte in Einheiten ~ Breite 2
function shirtShape({ sleeve = 'short', body = 1.0, neck = 0.28, tank = false } = {}) {
  const s = new THREE.Shape();
  const sh = 0.62, bw = 0.62 * body, top = 0.95, bottom = -1.05;
  s.moveTo(-neck, top);
  s.quadraticCurveTo(0, top - 0.26, neck, top);
  if (tank) {
    s.lineTo(0.42, top); s.quadraticCurveTo(0.42, 0.35, bw, 0.18);
  } else {
    s.lineTo(sh, top - 0.08);
    if (sleeve === 'short') { s.lineTo(1.08, 0.48); s.lineTo(0.86, 0.18); s.lineTo(bw, 0.36); }
    else { s.lineTo(1.0, 0.3); s.lineTo(1.12, -0.85); s.lineTo(0.9, -0.88); s.lineTo(0.84, -0.05); s.lineTo(bw, 0.28); }
  }
  s.lineTo(bw, bottom + 0.06); s.quadraticCurveTo(bw, bottom, bw - 0.06, bottom); s.lineTo(-bw + 0.06, bottom); s.quadraticCurveTo(-bw, bottom, -bw, bottom + 0.06);
  if (tank) { s.lineTo(-bw, 0.18); s.quadraticCurveTo(-0.42, 0.35, -0.42, top); }
  else if (sleeve === 'short') { s.lineTo(-bw, 0.36); s.lineTo(-0.86, 0.18); s.lineTo(-1.08, 0.48); s.lineTo(-sh, top - 0.08); }
  else { s.lineTo(-bw, 0.28); s.lineTo(-0.84, -0.05); s.lineTo(-0.9, -0.88); s.lineTo(-1.12, -0.85); s.lineTo(-1.0, 0.3); s.lineTo(-sh, top - 0.08); }
  s.closePath(); return s;
}
function garment(opts, color, depth = 0.26) { return mesh(extrude(shirtShape(opts), depth, 0.13, 10), fabric(color)); }
function seam(points, color, r = 0.012) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(c, 64, r, 8, false), fabric(color), false);
}

// ---------- Modelle ----------
const M = {};
M.tshirt = () => { const g = new THREE.Group(); g.add(garment({ sleeve: 'short' }, P.navy)); const e = emblem(0.3); e.position.set(0, 0.15, 0.2); g.add(e);
  g.add(seam([[-0.28, 0.95, 0.2], [0, 0.72, 0.21], [0.28, 0.95, 0.2]], '#2a3a66', 0.025)); return g; };
M.polo = () => { const g = new THREE.Group(); g.add(garment({ sleeve: 'short' }, P.white));
  const collarL = new THREE.Shape(); collarL.moveTo(-0.02, 0.72); collarL.lineTo(-0.34, 0.98); collarL.lineTo(-0.36, 0.76); collarL.lineTo(-0.12, 0.6); collarL.closePath();
  const cl = mesh(extrude(collarL, 0.05, 0.03), fabric(P.purple)); cl.position.z = 0.17; g.add(cl);
  const cr = cl.clone(); cr.scale.x = -1; g.add(cr);
  const pl = rbox(0.14, 0.42, 0.05, 0.02, fabric('#ffffff')); pl.position.set(0, 0.46, 0.17); g.add(pl);
  for (let i = 0; i < 2; i++) { const b = mesh(new THREE.SphereGeometry(0.03, 16, 12), glossy(P.purple)); b.position.set(0, 0.55 - i * 0.16, 0.21); g.add(b); }
  const e = emblem(0.13); e.position.set(0.32, 0.3, 0.18); g.add(e); return g; };
M.hoodie = () => { const g = new THREE.Group(); g.add(garment({ sleeve: 'long', body: 1.06 }, P.purple, 0.26));
  const hood = mesh(new THREE.SphereGeometry(0.5, 48, 32), fabric('#6b1bb0')); hood.position.set(0, 0.92, -0.12); hood.scale.set(0.82, 0.62, 0.42); g.add(hood);
  const opening = mesh(new THREE.TorusGeometry(0.27, 0.07, 20, 64), fabric('#5c169a')); opening.position.set(0, 0.86, 0.12); opening.scale.set(1, 0.7, 0.6); g.add(opening);
  const pocket = new THREE.Shape(); pocket.moveTo(-0.42, -0.4); pocket.lineTo(0.42, -0.4); pocket.lineTo(0.32, -0.82); pocket.lineTo(-0.32, -0.82); pocket.closePath();
  const pk = mesh(extrude(pocket, 0.04, 0.025), fabric('#7a1fc9')); pk.position.z = 0.18; g.add(pk);
  for (const x of [-0.1, 0.1]) { g.add(seam([[x, 0.72, 0.2], [x * 1.1, 0.45, 0.24], [x * 1.2, 0.3, 0.24]], P.white, 0.016)); const tip = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 12), glossy(P.gold)); tip.position.set(x * 1.2, 0.27, 0.24); g.add(tip); }
  const e = emblem(0.2, 0.03, P.white, P.gold); e.position.set(0, 0.08, 0.2); g.add(e); return g; };
M.jacket = () => { const g = new THREE.Group(); g.add(garment({ tank: true, body: 1.08 }, P.grey, 0.28));
  g.add(seam([[0, 0.78, 0.22], [0, -1.02, 0.22]], '#c9ced6', 0.02));
  for (let i = 0; i < 5; i++) g.add(seam([[-0.66, 0.15 - i * 0.26, 0.2], [0, 0.12 - i * 0.26, 0.24], [0.66, 0.15 - i * 0.26, 0.2]], '#3a3e48', 0.012));
  const zp = rbox(0.06, 0.1, 0.04, 0.015, metal('#d9dde3')); zp.position.set(0, 0.62, 0.26); g.add(zp);
  const e = emblem(0.13, 0.025, P.purple, P.gold); e.position.set(-0.3, 0.42, 0.22); g.add(e); return g; };
M.workwear = () => { const g = new THREE.Group(); g.add(garment({ tank: true, body: 1.1 }, P.orange, 0.24));
  for (const y of [-0.35, -0.7]) { const st = rbox(1.34, 0.12, 0.03, 0.02, mat('#e9eef5', { m: 0.9, r: 0.15, cc: 1 })); st.position.set(0, y, 0.17); g.add(st); }
  g.add(seam([[0, 0.78, 0.17], [0, -1.02, 0.17]], '#c45a0c', 0.018));
  const pk = rbox(0.3, 0.26, 0.04, 0.03, fabric('#f06a0c')); pk.position.set(0.3, 0.12, 0.16); g.add(pk);
  const e = emblem(0.11); e.position.set(-0.3, 0.32, 0.17); g.add(e); return g; };
M.baby = () => { const g = new THREE.Group();
  const s = new THREE.Shape(); s.moveTo(-0.22, 0.85); s.quadraticCurveTo(0, 0.66, 0.22, 0.85); s.lineTo(0.5, 0.78); s.lineTo(0.88, 0.42); s.lineTo(0.66, 0.16); s.lineTo(0.5, 0.3);
  s.lineTo(0.52, -0.5); s.quadraticCurveTo(0.5, -0.78, 0.2, -0.92); s.lineTo(0.12, -1.02); s.lineTo(-0.12, -1.02); s.lineTo(-0.2, -0.92); s.quadraticCurveTo(-0.5, -0.78, -0.52, -0.5);
  s.lineTo(-0.5, 0.3); s.lineTo(-0.66, 0.16); s.lineTo(-0.88, 0.42); s.lineTo(-0.5, 0.78); s.closePath();
  g.add(mesh(extrude(s, 0.2, 0.08), fabric(P.sky)));
  for (const x of [-0.06, 0.06]) { const b = mesh(new THREE.SphereGeometry(0.03, 12, 10), glossy(P.white)); b.position.set(x, -0.95, 0.15); g.add(b); }
  const h = mesh(extrude(heartShape(0.18), 0.04, 0.02), glossy(P.pink)); h.position.set(0, 0.1, 0.16); g.add(h);
  const st = mesh(extrude(starShape(0.08, 0.035), 0.03, 0.01), glossy(P.yellow)); st.position.set(0.24, 0.42, 0.16); g.add(st); return g; };
M.sport = () => { const g = new THREE.Group(); g.add(garment({ tank: true, body: 1.0 }, P.red, 0.22));
  for (const x of [-0.6, 0.6]) { const sb = rbox(0.1, 1.2, 0.03, 0.02, fabric(P.white)); sb.position.set(x, -0.42, 0.15); g.add(sb); }
  const n = text('10', 0.5, 0.05, glossy(P.white)); n.position.set(0, -0.25, 0.18); g.add(n);
  const e = emblem(0.1, 0.02); e.position.set(0, 0.52, 0.16); g.add(e); return g; };
M.cap = () => { const g = new THREE.Group();
  const crown = mesh(new THREE.SphereGeometry(0.75, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), fabric(P.navy)); crown.scale.set(1, 0.82, 1); g.add(crown);
  const brimS = new THREE.Shape(); const N = 48;
  for (let i = 0; i <= N; i++) { const t = (i / N) * Math.PI; const x = Math.cos(t) * 0.8, y = Math.sin(t) * 1.45; i ? brimS.lineTo(x, y) : brimS.moveTo(x, y); }
  for (let i = N; i >= 0; i--) { const t = (i / N) * Math.PI; brimS.lineTo(Math.cos(t) * 0.74, Math.sin(t) * 0.74); }
  const brim = mesh(extrude(brimS, 0.05, 0.025), fabric('#16203a')); brim.rotation.x = Math.PI / 2 + 0.12; brim.position.set(0, 0.04, 0); g.add(brim);
  const bt = mesh(new THREE.SphereGeometry(0.07, 20, 14), fabric(P.purple)); bt.position.y = 0.62; g.add(bt);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const pts = []; for (let k = 0; k <= 12; k++) { const t = (k / 12) * (Math.PI / 2); pts.push([Math.cos(a) * Math.cos(t) * 0.752, Math.sin(t) * 0.62, Math.sin(a) * Math.cos(t) * 0.752]); } g.add(seam(pts, '#2b3a63', 0.008)); }
  const e = emblem(0.2, 0.03); e.position.set(0, 0.32, 0.66); e.rotation.x = -0.45; g.add(e);
  g.rotation.y = -0.6; return g; };
M.bag = () => { const g = new THREE.Group();
  const body = rbox(1.3, 1.45, 0.22, 0.06, fabric('#efe4cf')); body.position.y = -0.2; g.add(body);
  for (const x of [-0.3, 0.3]) { const h = mesh(new THREE.TorusGeometry(0.22, 0.035, 16, 48, Math.PI), fabric('#e2d3b6')); h.position.set(x, 0.52, 0); g.add(h); }
  const e = emblem(0.32, 0.03); e.position.set(0, -0.15, 0.13); g.add(e);
  g.add(seam([[-0.62, 0.42, 0.115], [0.62, 0.42, 0.115]], '#cdbb98', 0.01)); g.rotation.y = -0.35; return g; };
M.towel = () => { const g = new THREE.Group(); const cols = [P.lilac, P.mint, P.purple];
  cols.forEach((c, i) => { const t = rbox(1.5, 0.22, 1.0, 0.1, fabric(c)); t.position.y = -0.55 + i * 0.24; t.rotation.y = (i - 1) * 0.06; g.add(t); });
  const roll = mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.2, 48), fabric(P.white)); roll.rotation.z = Math.PI / 2; roll.position.set(0.1, 0.36, 0.1); g.add(roll);
  const sp = mesh(new THREE.TorusGeometry(0.13, 0.05, 16, 48), fabric('#e8e2f0')); sp.position.set(0.71, 0.36, 0.1); sp.rotation.y = Math.PI / 2; g.add(sp);
  const e = emblem(0.13, 0.02); e.position.set(-0.3, 0.06, 0.52); g.add(e); g.rotation.y = -0.45; return g; };
M.mug = () => { const g = new THREE.Group();
  g.add(lathe([[0, -0.75], [0.6, -0.75], [0.66, -0.68], [0.66, 0.7], [0.6, 0.75], [0.55, 0.7], [0.55, -0.62], [0, -0.62]], glossy(P.white)));
  const coffee = mesh(new THREE.CircleGeometry(0.55, 64), mat('#5a3420', { r: 0.2, cc: 1 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.55; g.add(coffee);
  const handle = mesh(new THREE.TorusGeometry(0.32, 0.075, 24, 64, Math.PI * 1.25), glossy(P.white)); handle.position.set(0.7, 0, 0); handle.rotation.z = -Math.PI * 0.62; g.add(handle);
  const band = mesh(new THREE.CylinderGeometry(0.665, 0.665, 0.2, 96, 1, true), glossy(P.purple)); band.position.y = -0.38; g.add(band);
  const e = emblem(0.22, 0.02); e.position.set(0, 0.12, 0.665); g.add(e); g.rotation.y = -0.7; return g; };
M.glass = () => { const g = new THREE.Group();
  const outer = [[0, -0.9], [0.32, -0.9], [0.35, -0.86], [0.08, -0.8], [0.05, -0.2], [0.12, -0.05], [0.48, 0.25], [0.55, 0.65], [0.53, 0.95]];
  const gl = lathe(outer, glass(), 96); gl.material.side = THREE.DoubleSide; g.add(gl);
  const wine = lathe([[0, 0.02], [0.3, 0.12], [0.45, 0.3], [0.49, 0.45], [0, 0.45]], mat('#8b1d3b', { r: 0.1, tr: 0.6, th: 0.8, cc: 1 }), 64); g.add(wine);
  const g2 = new THREE.Group();
  g2.add(lathe([[0, -0.9], [0.42, -0.9], [0.44, -0.85], [0.5, 0.75], [0.5, 0.8]], glass(), 96));
  const beer = lathe([[0, -0.84], [0.4, -0.84], [0.45, 0.45], [0, 0.45]], mat('#f2a51a', { r: 0.1, tr: 0.55, th: 1, cc: 1 }), 64); g2.add(beer);
  const foam = lathe([[0, 0.44], [0.46, 0.44], [0.48, 0.55], [0.38, 0.66], [0, 0.68]], fabric('#fff8e8'), 48); g2.add(foam);
  const eng = mesh(extrude(starShape(0.14, 0.06), 0.01, 0.004), mat('#ffffff', { r: 0.6, op: 0.55 })); eng.position.set(0, -0.2, 0.49); g2.add(eng);
  g.position.x = -0.42; g2.position.set(0.48, -0.06, 0.15); g2.scale.setScalar(0.9);
  const grp = new THREE.Group(); grp.add(g, g2); grp.rotation.y = -0.2; return grp; };
M.bottle = () => { const g = new THREE.Group();
  g.add(lathe([[0, -1], [0.36, -1], [0.4, -0.95], [0.4, 0.45], [0.32, 0.62], [0.2, 0.72], [0.2, 0.8]], metal(P.purple, 0.3)));
  const cap = lathe([[0, 0.78], [0.23, 0.78], [0.24, 0.98], [0.2, 1.04], [0, 1.04]], metal('#e6e8ec', 0.2)); g.add(cap);
  const loop = mesh(new THREE.TorusGeometry(0.11, 0.03, 12, 32), metal('#e6e8ec', 0.2)); loop.position.set(0, 1.08, 0); g.add(loop);
  const ring = mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.06, 64, 1, true), metal('#e6e8ec', 0.2)); ring.position.y = -0.7; g.add(ring);
  const e = emblem(0.16, 0.015, P.white, P.gold); e.position.set(0, -0.1, 0.405); g.add(e);
  const cup = new THREE.Group(); cup.add(lathe([[0, -0.6], [0.32, -0.6], [0.4, 0.3], [0.41, 0.32]], metal('#eceef2', 0.25)));
  const lid = lathe([[0, 0.3], [0.43, 0.3], [0.43, 0.38], [0.2, 0.46], [0, 0.46]], glossy(P.lilac)); cup.add(lid);
  cup.position.set(0.72, -0.4, 0.2); cup.scale.setScalar(0.85);
  const grp = new THREE.Group(); grp.add(g, cup); grp.rotation.y = -0.3; return grp; };
M.board = () => { const g = new THREE.Group();
  const s = roundRectShape(1.2, 1.7, 0.3); const hole = new THREE.Path(); hole.absarc(0, 0.62, 0.1, 0, Math.PI * 2, true); s.holes.push(hole);
  const b = mesh(extrude(s, 0.12, 0.04), mat(P.wood, { r: 0.7, cc: 0.2 })); g.add(b);
  for (let i = 0; i < 7; i++) g.add(seam([[-0.56, -0.7 + i * 0.2, 0.105], [0, -0.66 + i * 0.2 + (i % 2 ? 0.03 : -0.02), 0.105], [0.56, -0.7 + i * 0.2, 0.105]], '#b97c46', 0.006));
  const h = mesh(extrude(heartShape(0.22), 0.012, 0.006), mat(P.woodDark, { r: 0.9 })); h.position.set(0, -0.1, 0.1); g.add(h);
  const b2 = mesh(extrude(roundRectShape(1.0, 1.3, 0.45), 0.1, 0.035), mat('#e0b07a', { r: 0.7 })); b2.position.set(0.55, -0.25, -0.25); b2.rotation.z = -0.25; g.add(b2);
  g.rotation.set(-0.35, -0.45, 0.1); return g; };
M.sign = () => { const g = new THREE.Group();
  const b = rbox(1.9, 0.9, 0.1, 0.05, mat(P.wood, { r: 0.7 })); g.add(b);
  const t = text('HOME', 0.3, 0.02, mat(P.woodDark, { r: 0.9 })); t.position.set(0, 0.0, 0.06); g.add(t);
  const h = mesh(extrude(heartShape(0.08), 0.02, 0.008), glossy(P.red)); h.position.set(0.72, 0.25, 0.07); g.add(h);
  g.add(seam([[-0.7, 0.45, 0], [-0.3, 0.95, 0.02], [0.3, 0.95, 0.02], [0.7, 0.45, 0]], '#a77b4a', 0.02));
  for (const x of [-0.7, 0.7]) { const n = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 16), metal('#b8bcc4')); n.rotation.x = Math.PI / 2; n.position.set(x, 0.38, 0.06); g.add(n); }
  g.rotation.y = -0.35; return g; };
M.cnc = () => { const g = new THREE.Group();
  const gear = (R, teeth, d, m) => { const s = new THREE.Shape(); const r0 = R * 0.82; for (let i = 0; i < teeth * 2; i++) { const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2; const r = i % 2 ? r0 : R; if (!i) s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r); else s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r); s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r); } s.closePath(); const hh = new THREE.Path(); hh.absarc(0, 0, R * 0.28, 0, Math.PI * 2, true); s.holes.push(hh); return mesh(extrude(s, d, 0.015, 3), m); };
  const g1 = gear(0.85, 14, 0.2, mat(P.wood, { r: 0.65 })); g.add(g1);
  const g2 = gear(0.5, 10, 0.22, metal('#cfd4db', 0.3)); g2.position.set(1.05, -0.42, 0.05); g2.rotation.z = 0.15; g.add(g2);
  const g3 = gear(0.34, 8, 0.18, glossy(P.purple)); g3.position.set(0.85, 0.55, 0.08); g.add(g3);
  g.rotation.set(-0.5, -0.35, 0); g.position.x = -0.35; return g; };
M.acrylic = () => { const g = new THREE.Group();
  const block = rbox(1.2, 1.5, 0.22, 0.04, mat('#e8f4ff', { r: 0.03, tr: 1, th: 0.25, ior: 1.49, cc: 1 })); block.position.y = 0.1; g.add(block);
  const base = rbox(1.35, 0.18, 0.5, 0.05, mat('#1f1a2b', { r: 0.3, cc: 0.6 })); base.position.y = -0.73; g.add(base);
  const eng = mesh(extrude(starShape(0.4, 0.17), 0.012, 0.004), mat('#ffffff', { r: 0.4, op: 0.75 })); eng.position.set(0, 0.15, 0.12); g.add(eng);
  const glow = mesh(new THREE.BoxGeometry(1.1, 0.04, 0.15), mat(P.violet, { r: 0.3 })); glow.position.y = -0.63; g.add(glow);
  g.rotation.y = -0.45; return g; };
M.leather = () => { const g = new THREE.Group();
  const s = roundRectShape(0.7, 1.15, 0.2); const hh = new THREE.Path(); hh.absarc(0, 0.38, 0.08, 0, Math.PI * 2, true); s.holes.push(hh);
  const tag = mesh(extrude(s, 0.06, 0.025), mat(P.leather, { r: 0.6, cc: 0.3 })); tag.position.set(-0.45, 0.25, 0.1); tag.rotation.z = 0.18; g.add(tag);
  const st = mesh(extrude(starShape(0.16, 0.07), 0.01, 0.005), mat('#5e2f19', { r: 0.9 })); st.position.set(-0.49, 0.05, 0.15); st.rotation.z = 0.18; g.add(st);
  const ring = mesh(new THREE.TorusGeometry(0.2, 0.025, 16, 48), metal('#d7dbe1', 0.2)); ring.position.set(-0.55, 0.85, 0.1); ring.rotation.set(0.3, 0.6, 0); g.add(ring);
  const cork = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 64), mat(P.cork, { r: 0.95 })); cork.position.set(0.45, -0.5, -0.1); cork.rotation.x = 0.5; g.add(cork);
  const h = mesh(extrude(heartShape(0.2), 0.008, 0.004), mat('#8a6236', { r: 1 })); h.position.set(0.45, -0.47, -0.04); h.rotation.x = 0.5 - Math.PI / 2; g.add(h);
  return g; };
M.metal = () => { const g = new THREE.Group();
  const s = roundRectShape(1.6, 0.95, 0.45); const hh = new THREE.Path(); hh.absarc(-0.6, 0, 0.07, 0, Math.PI * 2, true); s.holes.push(hh);
  const tag = mesh(extrude(s, 0.05, 0.02), metal('#d5d9df', 0.18)); g.add(tag);
  const t = text('WF', 0.3, 0.008, metal('#7b818c', 0.5), 0.004); t.position.set(0.15, 0, 0.035); g.add(t);
  const pen = new THREE.Group(); pen.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 32), metal(P.purple, 0.25)));
  const tip = mesh(new THREE.ConeGeometry(0.06, 0.2, 32), metal('#e2e5ea', 0.15)); tip.position.y = -0.9; pen.add(tip);
  const clip = rbox(0.03, 0.5, 0.04, 0.01, metal('#e2e5ea', 0.15)); clip.position.set(0, 0.45, 0.07); pen.add(clip);
  pen.rotation.z = Math.PI / 2 - 0.35; pen.position.set(0.1, -0.75, 0.25); g.add(pen);
  g.rotation.set(-0.45, -0.3, 0); return g; };
M.slate = () => { const g = new THREE.Group();
  const s = new THREE.Shape(); const n = 14; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = 0.9 + (i % 3 ? 0.03 : -0.04); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath();
  const sl = mesh(extrude(s, 0.1, 0.02, 2), mat(P.slate, { r: 0.85 })); g.add(sl);
  const h = mesh(extrude(heartShape(0.35), 0.01, 0.004), mat('#b8bfcc', { r: 0.95 })); h.position.z = 0.07; g.add(h);
  const sl2 = sl.clone(); sl2.position.set(0.55, -0.35, -0.3); g.add(sl2);
  g.rotation.set(-0.6, -0.3, 0); return g; };
M.sticker = () => { const g = new THREE.Group();
  const roll = new THREE.Group(); const core = mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 64), glossy(P.purple)); roll.add(core);
  const inner = mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.12, 32), mat(P.kraft, { r: 0.9 })); roll.add(inner);
  roll.rotation.z = Math.PI / 2; roll.position.set(-0.2, 0.2, -0.2); g.add(roll);
  const sheet = mesh(new THREE.BoxGeometry(1.1, 0.012, 0.9), glossy(P.purple)); sheet.position.set(-0.2, -0.24, 0.45); g.add(sheet);
  const cols = [P.gold, P.mint, P.pink];
  cols.forEach((c, i) => { const st = mesh(extrude(i === 1 ? heartShape(0.16) : starShape(0.2, 0.09), 0.015, 0.006), glossy(c)); st.rotation.x = -Math.PI / 2; st.position.set(0.55 + i * 0.05, -0.2 + i * 0.03, 0.35 - i * 0.25); g.add(st); });
  const e = emblem(0.2, 0.015); e.rotation.x = -Math.PI / 2 + 0.25; e.position.set(0.2, -0.05, 0.75); g.add(e);
  g.rotation.y = -0.4; return g; };
M.photo = () => { const g = new THREE.Group();
  const frame = rbox(1.7, 1.3, 0.12, 0.04, mat(P.white, { r: 0.4, cc: 0.5 })); g.add(frame);
  const c = document.createElement('canvas'); c.width = 512; c.height = 384; const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 384); sky.addColorStop(0, '#a855f7'); sky.addColorStop(1, '#fbcfe8'); x.fillStyle = sky; x.fillRect(0, 0, 512, 384);
  x.fillStyle = '#fde68a'; x.beginPath(); x.arc(370, 120, 50, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5b21b6'; x.beginPath(); x.moveTo(0, 384); x.lineTo(150, 170); x.lineTo(280, 384); x.fill();
  x.fillStyle = '#7c3aed'; x.beginPath(); x.moveTo(170, 384); x.lineTo(330, 200); x.lineTo(512, 384); x.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const pic = mesh(new THREE.PlaneGeometry(1.45, 1.05), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, clearcoat: 1 })); pic.position.z = 0.065; g.add(pic);
  const stand = rbox(0.12, 1.0, 0.06, 0.02, mat(P.white, { r: 0.4 })); stand.position.set(0, -0.3, -0.35); stand.rotation.x = -0.45; g.add(stand);
  const pol = new THREE.Group(); pol.add(rbox(0.8, 0.95, 0.02, 0.01, mat('#fbfaf7', { r: 0.6 })));
  const pp = mesh(new THREE.PlaneGeometry(0.66, 0.66), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4 })); pp.position.set(0, 0.08, 0.012); pol.add(pp);
  pol.position.set(0.85, -0.5, 0.35); pol.rotation.set(-0.2, -0.2, -0.25); g.add(pol);
  g.rotation.y = -0.35; return g; };
M.promo = () => { const g = new THREE.Group();
  const pen = new THREE.Group(); pen.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 32), glossy(P.purple)));
  const tip = mesh(new THREE.ConeGeometry(0.07, 0.25, 32), metal('#dfe2e7', 0.2)); tip.position.y = -1.02; pen.add(tip);
  const clip = rbox(0.035, 0.55, 0.05, 0.012, metal('#dfe2e7', 0.2)); clip.position.set(0, 0.55, 0.08); pen.add(clip);
  const btn = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 24), metal('#dfe2e7', 0.2)); btn.position.y = 0.96; pen.add(btn);
  pen.rotation.z = 0.5; pen.position.set(-0.5, 0.05, 0); g.add(pen);
  const badge = new THREE.Group(); badge.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 64), glossy(P.gold)));
  const st = mesh(extrude(starShape(0.32, 0.14), 0.04, 0.015), glossy(P.purple)); st.rotation.x = -Math.PI / 2; st.position.y = 0.08; badge.add(st);
  badge.rotation.x = 1.15; badge.position.set(0.55, -0.15, 0.2); g.add(badge);
  const key = new THREE.Group(); key.add(rbox(0.5, 0.75, 0.08, 0.12, glossy(P.mint))); const kr = mesh(new THREE.TorusGeometry(0.14, 0.022, 12, 32), metal('#dfe2e7', 0.2)); kr.position.y = 0.5; key.add(kr);
  key.position.set(0.25, 0.65, -0.3); key.rotation.set(0.2, -0.3, 0.3); g.add(key);
  return g; };
M.patch = () => { const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 96), fabric(P.navy)); base.rotation.x = Math.PI / 2; g.add(base);
  const rim = mesh(new THREE.TorusGeometry(0.85, 0.06, 16, 96), fabric(P.gold)); g.add(rim);
  const st = mesh(extrude(starShape(0.48, 0.2), 0.06, 0.03), fabric(P.gold)); st.position.z = 0.04; g.add(st);
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; const d = mesh(new THREE.BoxGeometry(0.05, 0.012, 0.02), fabric('#d99b1a'), false); d.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.05); d.rotation.z = a + Math.PI / 2; g.add(d); }
  const p2 = new THREE.Group(); p2.add(mesh(extrude(roundRectShape(0.9, 0.6, 0.12), 0.06, 0.03), fabric(P.purple)));
  const t = text('WF', 0.22, 0.03, fabric(P.white), 0.008); t.position.z = 0.06; p2.add(t);
  p2.position.set(0.75, -0.65, 0.2); p2.rotation.z = -0.2; g.add(p2);
  g.rotation.set(-0.35, -0.35, 0); return g; };
M.transfer = () => { const g = new THREE.Group();
  const sheet = rbox(1.5, 1.9, 0.03, 0.02, mat('#f7f6fb', { r: 0.25, cc: 1 })); g.add(sheet);
  const items = [[-0.35, 0.45, 'star', P.purple], [0.35, 0.45, 'heart', P.red], [-0.35, -0.3, 'disc', P.gold], [0.35, -0.3, 'star', P.mint]];
  items.forEach(([x, y, k, c]) => { const sh = k === 'star' ? starShape(0.26, 0.11) : k === 'heart' ? heartShape(0.22) : circleShape(0.24); const m = mesh(extrude(sh, 0.01, 0.004), glossy(c)); m.position.set(x, y, 0.03); g.add(m); });
  const curl = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 32, 1, true, 0, Math.PI), mat('#e8e4f2', { r: 0.3, side: THREE.DoubleSide })); curl.rotation.set(0, 0, Math.PI / 4); curl.position.set(0.62, -0.82, 0.1); g.add(curl);
  const press = new THREE.Group(); press.add(rbox(0.9, 0.18, 0.7, 0.06, metal('#c9ced6', 0.3))); const hnd = rbox(0.18, 0.5, 0.18, 0.06, glossy(P.purple)); hnd.position.y = 0.32; press.add(hnd);
  press.position.set(0.75, 0.75, 0.45); press.rotation.set(0.4, -0.4, 0.15); g.add(press);
  g.rotation.set(-0.35, -0.3, 0); return g; };
M.hoop = () => { const g = new THREE.Group();
  const fab = mesh(new THREE.CircleGeometry(0.8, 96), fabric('#f3efe7')); g.add(fab);
  const ring = mesh(new THREE.TorusGeometry(0.82, 0.07, 20, 96), mat(P.wood, { r: 0.6 })); g.add(ring);
  const ring2 = mesh(new THREE.TorusGeometry(0.9, 0.05, 16, 96), mat('#b07440', { r: 0.6 })); g.add(ring2);
  const sc = rbox(0.12, 0.22, 0.16, 0.03, metal('#cfd3d9', 0.25)); sc.position.set(0, 0.98, 0); g.add(sc);
  const h = mesh(extrude(heartShape(0.3), 0.03, 0.015), fabric(P.purple)); h.position.set(-0.1, 0.05, 0.02); g.add(h);
  for (let i = 0; i < 3; i++) { const sp = new THREE.Group(); const c = [P.gold, P.mint, P.red][i];
    sp.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.42, 32), fabric(c))); for (const y of [-0.24, 0.24]) { const e = mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.06, 32), mat(P.wood, { r: 0.6 })); e.position.y = y; sp.add(e); }
    sp.position.set(0.95 + i * 0.12, -0.55 + i * 0.05, 0.35 - i * 0.45); g.add(sp); }
  const needle = mesh(new THREE.CylinderGeometry(0.012, 0.004, 0.9, 12), metal('#e5e8ec', 0.1)); needle.rotation.z = -0.8; needle.position.set(0.35, 0.35, 0.08); g.add(needle);
  g.add(seam([[0.06, 0.18, 0.05], [0.25, 0.3, 0.12], [0.5, 0.6, 0.08]], P.purple, 0.008));
  g.rotation.set(-0.25, -0.45, 0); g.position.x = -0.25; return g; };
M.digit = () => { const g = new THREE.Group();
  const tab = rbox(1.9, 1.35, 0.08, 0.1, mat('#1f1a2b', { r: 0.3, cc: 0.8 })); g.add(tab);
  const c = document.createElement('canvas'); c.width = 512; c.height = 360; const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 360); x.strokeStyle = '#e5e1ef'; x.lineWidth = 1; for (let i = 0; i < 512; i += 24) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 360); x.stroke(); } for (let i = 0; i < 360; i += 24) { x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke(); }
  x.strokeStyle = '#7e22ce'; x.lineWidth = 6; x.beginPath(); x.moveTo(130, 260); x.bezierCurveTo(140, 80, 380, 80, 380, 200); x.bezierCurveTo(380, 300, 240, 300, 250, 190); x.stroke();
  x.fillStyle = '#ffffff'; x.strokeStyle = '#7e22ce'; x.lineWidth = 4; for (const [px, py] of [[130, 260], [260, 95], [380, 200], [250, 190]]) { x.fillRect(px - 9, py - 9, 18, 18); x.strokeRect(px - 9, py - 9, 18, 18); }
  x.fillStyle = '#f5b83d'; x.font = 'bold 34px Arial'; x.fillText('.DST', 395, 335);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const scr = mesh(new THREE.PlaneGeometry(1.7, 1.15), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.2, clearcoat: 1, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.35 })); scr.position.z = 0.045; g.add(scr);
  const pen = new THREE.Group(); pen.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 24), glossy(P.purple))); const tp = mesh(new THREE.ConeGeometry(0.05, 0.16, 24), metal('#e2e5ea', 0.2)); tp.position.y = -0.73; pen.add(tp);
  pen.position.set(0.95, -0.25, 0.3); pen.rotation.z = 0.6; g.add(pen);
  g.rotation.set(-0.45, -0.3, 0); return g; };
M.ship = () => { const g = new THREE.Group();
  const box = rbox(1.5, 1.1, 1.2, 0.05, mat(P.kraft, { r: 0.85 })); g.add(box);
  const tape = rbox(0.32, 0.02, 1.22, 0.01, mat('#a46e3a', { r: 0.4, cc: 0.6 })); tape.position.y = 0.555; g.add(tape);
  const tape2 = rbox(0.32, 0.6, 0.02, 0.01, mat('#a46e3a', { r: 0.4, cc: 0.6 })); tape2.position.set(0, 0.27, 0.605); g.add(tape2);
  const lbl = rbox(0.55, 0.38, 0.02, 0.02, mat('#ffffff', { r: 0.5 })); lbl.position.set(0.42, -0.1, 0.605); g.add(lbl);
  for (let i = 0; i < 9; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.018 + (i % 3) * 0.008, 0.16, 0.005), mat('#1f1a2b')); bar.position.set(0.26 + i * 0.035, -0.18, 0.62); g.add(bar); }
  const e = emblem(0.08, 0.01); e.position.set(0.3, 0.0, 0.62); g.add(e);
  const b2 = rbox(0.8, 0.6, 0.7, 0.04, mat('#d7b384', { r: 0.85 })); b2.position.set(-0.95, -0.25, 0.35); b2.rotation.y = 0.3; g.add(b2);
  g.rotation.y = -0.55; return g; };
M.gift = () => { const g = new THREE.Group();
  const box = rbox(1.2, 1.0, 1.2, 0.06, glossy(P.purple)); g.add(box);
  const lid = rbox(1.32, 0.25, 1.32, 0.06, glossy('#8e2fe0')); lid.position.y = 0.55; g.add(lid);
  for (const r of [0, Math.PI / 2]) { const rb = rbox(0.18, 1.27, 1.34, 0.03, glossy(P.gold)); rb.rotation.y = r; g.add(rb); }
  for (const s of [-1, 1]) { const bow = mesh(new THREE.TorusGeometry(0.22, 0.07, 16, 48), glossy(P.gold)); bow.position.set(s * 0.22, 0.78, 0); bow.rotation.set(0, s * 0.4, s * 0.5); g.add(bow); }
  g.rotation.y = -0.6; return g; };

// ---------- Rendern ----------
async function renderOne(key) {
  await fontReady;
  const scene = new THREE.Scene(); scene.environment = envTex;
  const obj = M[key]();
  if (['tshirt','polo','hoodie','jacket','workwear','baby','sport'].includes(key)) {
    // Aufdrucke/Nähte auf die Vorderseite des (dicken) Stoffs setzen
    obj.updateMatrixWorld(true);
    const front = new THREE.Box3().setFromObject(obj.children[0]).max.z;
    obj.children.slice(1).forEach((c) => { if (c.position.z < -0.05) return; const bz = new THREE.Box3().setFromObject(c); const d = front - bz.min.z - 0.004; if (d > 0) c.position.z += d; });
    obj.rotation.set(-0.12, -0.42, 0);
  }
  scene.add(obj);
  // Größe angleichen und auf den Boden stellen
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const k = 2.2 / Math.max(size.x, size.y, size.z * 0.9);
  obj.scale.multiplyScalar(k); obj.position.sub(ctr.multiplyScalar(k));
  const b2 = new THREE.Box3().setFromObject(obj); obj.position.y -= b2.min.y + 0.0; const floorY = 0;
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const midY = (b2.max.y - b2.min.y) / 2;
  cam.position.set(0, midY + 2.2, 6.4); cam.lookAt(0, midY * 0.92, 0);
  const key1 = new THREE.DirectionalLight('#ffffff', 2.2); key1.position.set(-2.2, 8, 3.2); key1.castShadow = true;
  key1.shadow.mapSize.set(2048, 2048); key1.shadow.camera.left = -3; key1.shadow.camera.right = 3; key1.shadow.camera.top = 3; key1.shadow.camera.bottom = -3; key1.shadow.radius = 8; key1.shadow.bias = -0.0005;
  scene.add(key1);
  const rim = new THREE.DirectionalLight('#e9d5ff', 1.2); rim.position.set(4, 3, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight('#ffffff', '#d8cbe8', 0.6));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.16 })); floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; floor.receiveShadow = true; scene.add(floor);
  // weicher Kontaktschatten direkt unter dem Objekt
  const sc = document.createElement('canvas'); sc.width = sc.height = 128; const cx = sc.getContext('2d'); const gr = cx.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(40,20,70,0.45)'); gr.addColorStop(1, 'rgba(40,20,70,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 128);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(2.4, (b2.max.x - b2.min.x) * 1.15), Math.max(1.4, (b2.max.z - b2.min.z) * 1.2)), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = floorY + 0.002; scene.add(blob);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/png');
}
window.WF3D = { keys: Object.keys(M), renderOne };
window.WF3D_READY = true;
