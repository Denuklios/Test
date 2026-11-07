// Erzeugt public/data/demo-routes.json: echte Fußwege (OSRM-Fußgänger-Routing
// auf OpenStreetMap-Daten) durch vorgegebene Wegpunkte, jeweils als Rundweg.
// Aufruf: node tools/build-demo-routes.mjs
import { writeFile } from 'node:fs/promises';

const ROUTES = [
  { id: 'hundeskov-torp', name: 'Hundeskov Torp Plantage', area: 'bei Uge, Aabenraa Kommune',
    description: 'Eingezäunter Hundewald: Hier darf der Hund frei laufen. Waldwege, viel Schatten.',
    wp: [[54.9755, 9.3661], [54.9785, 9.3610], [54.9790, 9.3720], [54.9725, 9.3730], [54.9720, 9.3630]],
    attrs: { water: false, shade: 90, surface: 'natur', crossings: 0, leash: 'frei', bins: true },
    busy: 'wochenende' },
  { id: 'froeslev-hundeskov', name: 'Frøslev Plantage mit Hundeskov', area: 'Fårhus bei Padborg',
    description: 'Große Plantage mit Heide und Wald, vorbei am Frøslevlejren. Im Hundeskov Freilauf, sonst an der Leine.',
    wp: [[54.8426, 9.3283], [54.8453, 9.3304], [54.8400, 9.3200], [54.8340, 9.3260], [54.8370, 9.3330]],
    attrs: { water: false, shade: 70, surface: 'natur', crossings: 1, leash: 'teilweise', bins: true },
    busy: 'wochenende' },
  { id: 'lyreskoven', name: 'Lyreskoven', area: 'Bov / Smedeby',
    description: 'Kleiner Wald mit Hundewald, gut für eine kurze Runde vor oder nach der Arbeit.',
    wp: [[54.8533, 9.3699], [54.8515, 9.3655], [54.8500, 9.3700], [54.8520, 9.3735]],
    attrs: { water: false, shade: 85, surface: 'natur', crossings: 0, leash: 'frei', bins: false },
    busy: 'ruhig' },
  { id: 'hostrup-soe', name: 'Wäldchen am Hostrup Sø', area: 'bei Kliplev',
    description: 'Kurzer Waldweg im Wäldchen am Westufer des Sees und zurück, nur wenige Minuten von Vilsbæk. Leine an.',
    wp: [[54.9663, 9.4105], [54.9621, 9.4191]], outAndBack: true,
    attrs: { water: false, shade: 85, surface: 'natur', crossings: 0, leash: 'pflicht', bins: false },
    busy: 'ruhig' },
  { id: 'gendarmstien-kollund', name: 'Gendarmstien an der Flensburger Förde', area: 'Kollund',
    description: 'Von Kollund Strand auf dem Gendarmstien am Wasser entlang bis Skomagerhuse und zurück. Hund an die Leine.',
    wp: [[54.8395, 9.4516], [54.8323, 9.4235]], outAndBack: true,
    attrs: { water: true, shade: 45, surface: 'gemischt', crossings: 0, leash: 'pflicht', bins: true },
    busy: 'stadt' },
  { id: 'bommerlund', name: 'Waldrunde Bommerlund Plantage', area: 'bei Gejlå',
    description: 'Ruhige Nadel- und Mischwald-Runde, die nächste große Waldrunde von Vilsbæk aus.',
    wp: [[54.8854, 9.3409], [54.8900, 9.3330], [54.8870, 9.3250], [54.8810, 9.3330]],
    attrs: { water: false, shade: 90, surface: 'natur', crossings: 0, leash: 'pflicht', bins: false },
    busy: 'ruhig' },
];

// Typische Belebtheit (0–100) je Stunde, als Startwert bis echte Daten da sind.
const PROFILES = {
  stadt:      [2,1,1,1,2,8,25,45,40,30,30,35,40,35,30,35,50,70,75,60,40,20,10,5],
  wochenende: [1,1,1,1,1,4,12,25,35,45,60,70,75,70,65,65,60,55,45,30,15,8,4,2],
  ruhig:      [1,1,1,1,1,3,10,18,20,18,15,15,18,15,14,15,22,30,28,20,10,5,2,1],
};

// Entfernt Stichwege (hin und gleich wieder zurück), die entstehen, wenn ein Wegpunkt neben dem Weg liegt.
function removeSpurs(pts, maxSpur = 900) {
  const d = (a, b) => {
    const R = 6371000, r = Math.PI / 180;
    const h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 1; i < pts.length - 1; i++) {
      let len = 0;
      for (let j = i + 1; j < pts.length - 1; j++) {
        len += d(pts[j - 1], pts[j]);
        if (len > maxSpur) break;
        if (j - i >= 2 && d(pts[i], pts[j]) < 4) { pts.splice(i + 1, j - i); changed = true; break outer; }
      }
    }
  }
  return pts;
}

function pathLen(p) {
  let m = 0;
  for (let i = 1; i < p.length; i++) {
    const R = 6371000, r = Math.PI / 180, a = p[i - 1], b = p[i];
    const h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
    m += 2 * R * Math.asin(Math.sqrt(h));
  }
  return m;
}

const out = [];
for (const r of ROUTES) {
  const way = r.outAndBack ? [...r.wp, ...r.wp.slice(0, -1).reverse()] : [...r.wp, r.wp[0]];
  const pts = way.map(([la, ln]) => `${ln},${la}`).join(';');
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${pts}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${r.id}: HTTP ${res.status}`);
  const json = await res.json();
  const g = json.routes[0];
  let points = g.geometry.coordinates.map(([ln, la]) => [+la.toFixed(6), +ln.toFixed(6)]);
  if (!r.outAndBack) points = removeSpurs(points);
  out.push({
    id: r.id, name: r.name, area: r.area, description: r.description,
    source: 'vorgefertigt', author: 'Gassi-Team',
    points, distanceKm: +(pathLen(points) / 1000).toFixed(2),
    attrs: r.attrs, busyness: PROFILES[r.busy], ratings: [],
  });
  console.log(r.id, (pathLen(points) / 1000).toFixed(2), 'km', points.length, 'Punkte');
}
await writeFile(new URL('../public/data/demo-routes.json', import.meta.url), JSON.stringify(out));
