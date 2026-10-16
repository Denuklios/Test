/* Kleidungsvorlagen aus Fotos (Maße in mm; Bezugspunkt = Kragen bzw. Schirmnaht)
   HW.garments.render(art, ansicht, {color, size}) → { canvas, ppm, ox, oy, anchors, collarY, refs, ... } */
(function (g) {
  'use strict';
  const HW = (g.HW = g.HW || {});
  const A = HW.GARMENT_ASSETS || {};
  const KIND = { tshirt: 'T-Shirt', polo: 'Polo', hoodie: 'Hoodie', cap: 'Kappe' };
  const VIEW_NAMES = { front: 'Vorne', back: 'Hinten', left: 'Seite links', right: 'Seite rechts' };
  const VIEW_LIST = { tshirt: ['front', 'back', 'left', 'right'], polo: ['front', 'back', 'left', 'right'], hoodie: ['front', 'back', 'left', 'right'], cap: ['front', 'left', 'right'] };
  const SIZES = { S: [0.91, 0.95], M: [0.955, 0.975], L: [1, 1], XL: [1.05, 1.025], XXL: [1.1, 1.05] };
  // Platzierungen: [Name, x, y] in mm ab Bezugspunkt (x + = rechts im Bild, y + = nach unten)
  const T = {
    'tshirt.front': { brustL: ['Brust links (am Träger)', 95, 75], brustR: ['Brust rechts', -95, 75], mitte: ['Brust Mitte', 0, 100], bauch: ['Bauch Mitte', 0, 300], aermelL: ['Ärmel links (am Träger)', 255, 110] },
    'tshirt.back': { nacken: ['Nacken (unter dem Kragen)', 0, 35], rueckenOben: ['Rücken oben Mitte', 0, 85], rueckenMitte: ['Rücken Mitte', 0, 200], rueckenGross: ['Rücken groß', 0, 260] },
    side: { aermel: ['Ärmel', 0, 110], seite: ['Seite (Körpermitte)', 0, 320] },
    'polo.front': { brustL: ['Brust links (am Träger)', 100, 95], brustR: ['Brust rechts', -100, 95], mitte: ['Brust Mitte (unter Leiste)', 0, 190], aermelL: ['Ärmel links', 265, 110] },
    'polo.back': { nacken: ['Nacken', 0, 40], rueckenOben: ['Rücken oben Mitte', 0, 100], rueckenMitte: ['Rücken Mitte', 0, 210] },
    'hoodie.front': { brustL: ['Brust links (am Träger)', 100, 95], brustR: ['Brust rechts', -100, 95], mitte: ['Brust Mitte', 0, 150] },
    'hoodie.back': { unterKapuze: ['Rücken oben (unter der Kapuze)', 0, 60], rueckenMitte: ['Rücken Mitte', 0, 200] },
    'hoodie.side': { aermel: ['Ärmel oben', 0, 150], aermelUnten: ['Ärmel unten', 0, 300] },
    'cap.front': { mitte: ['Front Mitte', 0, -48], links: ['Front links', 50, -48], rechts: ['Front rechts', -50, -48], hoch: ['Front hoch', 0, -68] },
    'cap.right': { seite: ['Seite rechts', 0, 0], vorne: ['Seite vorn', 55, 0] },
    'cap.left': { seite: ['Seite links', 0, 0], vorne: ['Seite vorn', -55, 0] },
  };
  const spotsFor = (kind, view) => T[kind + '.' + view] || (kind === 'tshirt' || kind === 'polo' ? T.side : null) || T[kind + '.side'] || {};
  // Bilder laden (Daten stehen als Data-URL in garment_assets.js)
  const api = { KIND, VIEW_NAMES, VIEW_LIST, SIZES, onload: null };
  for (const a of Object.values(A)) { a.img = new Image(); a.img.onload = () => { a.ok = true; if (api.onload) api.onload(); }; a.img.src = a.src; }
  const cache = new Map();
  api.render = function (kind, view, opt = {}) {
    const color = (opt.color || '#ffffff').toLowerCase(), size = opt.size && SIZES[opt.size] ? opt.size : 'L';
    const a = A[kind + '.' + view]; if (!a || !a.ok) return null;
    const key = [kind, view, color, size].join('|');
    if (cache.has(key)) return cache.get(key);
    const [fx, fy] = kind === 'cap' ? [1, 1] : SIZES[size];
    const c = document.createElement('canvas'); c.width = Math.round(a.w * fx); c.height = Math.round(a.h * fy);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(a.img, 0, 0, c.width, c.height);
    if (color !== '#ffffff') {
      // Weißes Foto einfärben: Stofflicht und -schatten bleiben erhalten, Umriss bleibt
      x.globalCompositeOperation = 'multiply'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(a.img, 0, 0, c.width, c.height);
      x.globalCompositeOperation = 'source-over';
    }
    const anchors = {};
    for (const [k, p] of Object.entries(spotsFor(kind, view))) anchors[k] = [p[0], p[1] * fx, p[2] * fy];
    const res = { canvas: c, ppm: 1 / a.mm, ox: a.ref[0] * fx, oy: a.ref[1] * fy, anchors, collarY: 0, refs: { center: view === 'front' || view === 'back' }, fx, fy, size };
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    cache.set(key, res);
    return res;
  };
  HW.garments = api;
})(typeof window !== 'undefined' ? window : globalThis);
