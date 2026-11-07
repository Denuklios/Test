// Erzeugt public/data/demo-routes.json: echte Fußwege (OSRM-Fußgänger-Routing
// auf OpenStreetMap-Daten) durch vorgegebene Wegpunkte, jeweils als Rundweg.
// Aufruf: node tools/build-demo-routes.mjs
import { writeFile } from 'node:fs/promises';

const ROUTES = [
  { id: 'grunewaldsee', name: 'Grunewaldsee-Runde', area: 'Berlin-Grunewald',
    description: 'Klassiker im Hundeauslaufgebiet: einmal um den See, viele Badestellen für den Hund.',
    wp: [[52.4706, 13.2627], [52.4790, 13.2628], [52.4775, 13.2705], [52.4700, 13.2690]],
    attrs: { water: true, shade: 80, surface: 'natur', crossings: 0, leash: 'frei', bins: true },
    busy: 'wochenende' },
  { id: 'tiergarten', name: 'Tiergarten am Neuen See', area: 'Berlin-Tiergarten',
    description: 'Zentrale Runde durch den Park, gut mit der S-Bahn erreichbar. Leinenpflicht.',
    wp: [[52.5108, 13.3445], [52.5150, 13.3505], [52.5150, 13.3640], [52.5110, 13.3600]],
    attrs: { water: true, shade: 70, surface: 'gemischt', crossings: 2, leash: 'pflicht', bins: true },
    busy: 'stadt' },
  { id: 'schlachtensee', name: 'Schlachtensee-Rundweg', area: 'Berlin-Zehlendorf',
    description: 'Ufer-Rundweg, ruhig am frühen Morgen. Badestellen für Hunde gesperrt.',
    wp: [[52.4398, 13.2163], [52.4446, 13.2055], [52.4420, 13.1985], [52.4368, 13.2160]],
    attrs: { water: true, shade: 85, surface: 'natur', crossings: 0, leash: 'pflicht', bins: true },
    busy: 'wochenende' },
  { id: 'krumme-lanke', name: 'Krumme Lanke kurz', area: 'Berlin-Zehlendorf',
    description: 'Kurze Runde für Welpen und ältere Hunde, flach und schattig.',
    wp: [[52.4445, 13.2290], [52.4478, 13.2245], [52.4415, 13.2330]],
    attrs: { water: true, shade: 90, surface: 'natur', crossings: 0, leash: 'teilweise', bins: false },
    busy: 'ruhig' },
  { id: 'teufelsberg', name: 'Waldrunde Teufelsberg', area: 'Berlin-Grunewald',
    description: 'Hügelige Waldwege, im Sommer angenehm kühl. Kein Wasser unterwegs.',
    wp: [[52.4985, 13.2405], [52.5010, 13.2470], [52.4950, 13.2525], [52.4940, 13.2440]],
    attrs: { water: false, shade: 95, surface: 'natur', crossings: 1, leash: 'teilweise', bins: false },
    busy: 'ruhig' },
  { id: 'friedrichshain', name: 'Volkspark Friedrichshain', area: 'Berlin-Friedrichshain',
    description: 'Stadtpark mit vielen Hundebegegnungen. Viel Asphalt, im Sommer heiß.',
    wp: [[52.5282, 13.4322], [52.5272, 13.4400], [52.5232, 13.4372], [52.5250, 13.4300]],
    attrs: { water: false, shade: 45, surface: 'asphalt', crossings: 3, leash: 'pflicht', bins: true },
    busy: 'stadt' },
];

// Typische Belebtheit (0–100) je Stunde, als Startwert bis echte Daten da sind.
const PROFILES = {
  stadt:      [2,1,1,1,2,8,25,45,40,30,30,35,40,35,30,35,50,70,75,60,40,20,10,5],
  wochenende: [1,1,1,1,1,4,12,25,35,45,60,70,75,70,65,65,60,55,45,30,15,8,4,2],
  ruhig:      [1,1,1,1,1,3,10,18,20,18,15,15,18,15,14,15,22,30,28,20,10,5,2,1],
};

const out = [];
for (const r of ROUTES) {
  const pts = [...r.wp, r.wp[0]].map(([la, ln]) => `${ln},${la}`).join(';');
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${pts}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${r.id}: HTTP ${res.status}`);
  const json = await res.json();
  const g = json.routes[0];
  const points = g.geometry.coordinates.map(([ln, la]) => [+la.toFixed(6), +ln.toFixed(6)]);
  out.push({
    id: r.id, name: r.name, area: r.area, description: r.description,
    source: 'vorgefertigt', author: 'Gassi-Team',
    points, distanceKm: +(g.distance / 1000).toFixed(2),
    attrs: r.attrs, busyness: PROFILES[r.busy], ratings: [],
  });
  console.log(r.id, (g.distance / 1000).toFixed(2), 'km', points.length, 'Punkte');
}
await writeFile(new URL('../public/data/demo-routes.json', import.meta.url), JSON.stringify(out));
