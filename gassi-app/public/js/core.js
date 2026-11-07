// Gemeinsame Logik für App (Browser) und Server (Node). Keine Abhängigkeiten.

const R = 6371000; // Erdradius in Metern
const rad = (d) => (d * Math.PI) / 180;

/** Entfernung zweier Punkte [lat, lng] in Metern. */
export function distance(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Länge eines Weges in Metern. */
export function pathLength(points) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += distance(points[i - 1], points[i]);
  return m;
}

/** Punkt, der `meters` Meter entlang des Weges liegt (für Simulation und Demo-Spaziergänger). */
export function pointAlong(points, meters) {
  if (points.length === 0) return null;
  let left = Math.max(0, meters);
  for (let i = 1; i < points.length; i++) {
    const seg = distance(points[i - 1], points[i]);
    if (left <= seg && seg > 0) {
      const t = left / seg;
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ];
    }
    left -= seg;
  }
  return points[points.length - 1].slice();
}

/**
 * Schneidet Anfang und Ende eines Weges um `meters` ab, damit die eigene
 * Haustür nicht in einer geteilten Runde auftaucht.
 */
export function trimEnds(points, meters) {
  if (meters <= 0 || points.length < 2) return points.slice();
  const total = pathLength(points);
  if (total <= meters * 2 + 50) return []; // zu kurz – nichts Sinnvolles übrig
  const cut = (pts) => {
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      walked += distance(pts[i - 1], pts[i]);
      if (walked >= meters) return pts.slice(i);
    }
    return [];
  };
  return cut(cut(points).reverse()).reverse();
}

/** Minimale Entfernung eines Punktes zu irgendeinem Punkt des Weges (grob, reicht für Live-Zählung). */
export function distanceToPath(p, points) {
  let best = Infinity;
  for (const q of points) best = Math.min(best, distance(p, q));
  return best;
}

/** Filtert GPS-Ausreißer: ungenaue Messungen und unrealistische Sprünge. */
export function acceptFix(prev, fix, { maxAccuracy = 35, maxSpeed = 4.5 } = {}) {
  if (fix.accuracy != null && fix.accuracy > maxAccuracy) return false;
  if (!prev) return true;
  const d = distance([prev.lat, prev.lng], [fix.lat, fix.lng]);
  const dt = Math.max(0.5, (fix.time - prev.time) / 1000);
  if (d / dt > maxSpeed) return false; // schneller als lockeres Joggen
  return d >= 3; // Stillstand nicht als Weg zählen
}

// ---------- Hund & Runde ----------

/** Rassen für die Auswahlliste (alphabetisch; Mischling und „Andere“ stehen in der Oberfläche oben/unten). */
export const DOG_BREEDS = [
  'Australian Shepherd', 'Beagle', 'Berner Sennenhund', 'Bernhardiner', 'Bolonka Zwetna', 'Border Collie', 'Boxer',
  'Cavalier King Charles Spaniel', 'Chihuahua', 'Cocker Spaniel', 'Collie', 'Coton de Tuléar', 'Dackel', 'Dalmatiner',
  'Dänisch-Schwedischer Hofhund', 'Deutsch Drahthaar', 'Deutsch Kurzhaar', 'Deutscher Schäferhund', 'Dobermann',
  'Englische Bulldogge', 'Eurasier', 'Französische Bulldogge', 'Golden Retriever', 'Goldendoodle', 'Havaneser',
  'Herdenschutzhund', 'Hovawart', 'Husky', 'Jack Russell Terrier', 'Labradoodle', 'Labrador Retriever', 'Landseer',
  'Leonberger', 'Magyar Vizsla', 'Malinois', 'Malteser', 'Mops', 'Neufundländer', 'Parson Russell Terrier', 'Pinscher',
  'Podenco', 'Pudel', 'Rhodesian Ridgeback', 'Riesenschnauzer', 'Rottweiler', 'Schnauzer', 'Shetland Sheepdog',
  'Shiba Inu', 'Shih Tzu', 'Spitz', 'Staffordshire Terrier', 'Weimaraner', 'West Highland White Terrier', 'Whippet',
  'Windhund', 'Yorkshire Terrier', 'Zwergpinscher', 'Zwergpudel', 'Zwergschnauzer', 'Zwergspitz',
];
/** Kurznasige Rassen: überhitzen schnell. */
const BRACHY = ['Mops', 'Französische Bulldogge', 'Englische Bulldogge', 'Shih Tzu', 'Boxer', 'Cavalier King Charles Spaniel'];
/** Kurznasig? Auch für Mischungen wie „Mischling (Mops × Beagle)“. */
export const isBrachy = (breed = '') => BRACHY.some((b) => breed.includes(b));

/** Rassenangabe zusammensetzen bzw. zerlegen: „Mischling (Labrador Retriever × Pudel)“. */
export function composeBreed(main, mix1 = '', mix2 = '') {
  if (main !== 'Mischling') return main || '';
  const parts = [mix1, mix2].filter(Boolean);
  return parts.length ? `Mischling (${parts.join(' × ')})` : 'Mischling';
}
export function splitBreed(breed = '') {
  const m = breed.match(/^Mischling(?: \((.+?)(?: × (.+))?\))?$/);
  if (!m) return { main: breed, mix1: '', mix2: '' };
  return { main: 'Mischling', mix1: m[1] || '', mix2: m[2] || '' };
}

/** Altersgruppe aus Jahren (null = unbekannt → erwachsen). */
export function ageGroup(years) {
  if (years === null || years === undefined || years === '') return 'erwachsen';
  if (years < 1) return 'welpe';
  return years >= 8 ? 'senior' : 'erwachsen';
}

/** „Labrador Retriever · 4 Jahre“ – leer, wenn nichts angegeben. */
export function dogInfo(breed, years) {
  const parts = [];
  if (breed) parts.push(breed);
  if (years !== null && years !== undefined && years !== '') parts.push(years < 1 ? 'unter 1 Jahr' : `${years} ${years === 1 ? 'Jahr' : 'Jahre'}`);
  return parts.join(' · ');
}

/** Gesprochene Sprachen (für Begegnungen im Grenzland). */
export const SPOKEN = { de: ['🇩🇪', 'Deutsch'], da: ['🇩🇰', 'Dansk'], en: ['🇬🇧', 'English'] };
export const cleanLangs = (list) => [...new Set((Array.isArray(list) ? list : []).filter((x) => SPOKEN[x]))];
export const langFlags = (list) => cleanLangs(list).map((x) => SPOKEN[x][0]).join(' ');
export const langNames = (list) => cleanLangs(list).map((x) => `${SPOKEN[x][0]} ${SPOKEN[x][1]}`).join(' · ');

export const PACE_KMH = { welpe: 2.8, erwachsen: 4.2, senior: 3.2 }; // inkl. Schnüffelpausen

export function estimateMinutes(km, dogAge = 'erwachsen') {
  return Math.round((km / (PACE_KMH[dogAge] || PACE_KMH.erwachsen)) * 60);
}

const SURFACE_PTS = { natur: 20, gemischt: 12, asphalt: 4 };
const LEASH_PTS = { frei: 10, teilweise: 6, pflicht: 3 };

export const LABELS = {
  surface: { natur: 'Wald- & Wiesenwege', gemischt: 'Gemischter Untergrund', asphalt: 'Viel Asphalt' },
  leash: { frei: 'Freilauf erlaubt', teilweise: 'Teilweise Leinenpflicht', pflicht: 'Leinenpflicht' },
};

/**
 * Hunde-Score 0–100 aus den Eigenschaften einer Runde, dazu Hinweise
 * passend zu Wetter und Hund.
 */
export function dogScore(attrs = {}, { tempC = null, dogAge = 'erwachsen', km = null, breed = '' } = {}) {
  // null/undefined = unbekannt (z. B. bei Runden aus OpenStreetMap): mittlere Punkte, ehrlich beschriftet
  const known = (v) => v !== null && v !== undefined;
  const shade = known(attrs.shade) ? Math.max(0, Math.min(100, attrs.shade)) : null;
  const crossings = known(attrs.crossings) ? Math.max(0, attrs.crossings) : null;
  const parts = [
    known(attrs.water)
      ? { key: 'water', label: attrs.water ? 'Wasser unterwegs' : 'Kein Wasser unterwegs', pts: attrs.water ? 20 : 0, max: 20 }
      : { key: 'water', label: 'Wasser: unbekannt', pts: 8, max: 20, unknown: true },
    shade !== null
      ? { key: 'shade', label: `Schatten (${shade} %)`, pts: Math.round(shade * 0.25), max: 25 }
      : { key: 'shade', label: 'Schatten: unbekannt', pts: 12, max: 25, unknown: true },
    { key: 'surface', label: LABELS.surface[attrs.surface] || 'Untergrund unbekannt', pts: SURFACE_PTS[attrs.surface] ?? 10, max: 20 },
    crossings !== null
      ? { key: 'crossings', label: crossings === 0 ? 'Keine Straßen zu queren' : `${crossings} Straße${crossings > 1 ? 'n' : ''} zu queren`, pts: Math.max(0, 15 - crossings * 5), max: 15 }
      : { key: 'crossings', label: 'Straßen: unbekannt', pts: 8, max: 15, unknown: true },
    { key: 'leash', label: LABELS.leash[attrs.leash] || 'Leinenregel: vor Ort prüfen', pts: LEASH_PTS[attrs.leash] ?? 5, max: 10, unknown: !LABELS.leash[attrs.leash] },
    known(attrs.bins)
      ? { key: 'bins', label: attrs.bins ? 'Mülleimer für Kotbeutel' : 'Keine Mülleimer bekannt', pts: attrs.bins ? 10 : 0, max: 10 }
      : { key: 'bins', label: 'Mülleimer: unbekannt', pts: 4, max: 10, unknown: true },
  ];
  const warnings = [];
  if (tempC != null && tempC >= 25) {
    if (attrs.surface === 'asphalt') warnings.push(`Bei ${Math.round(tempC)} °C wird Asphalt heiß. Mach den Handrücken-Test: 7 Sekunden auf den Boden legen.`);
    if (attrs.water !== true) warnings.push(attrs.water === false ? 'Kein Wasser unterwegs. Nimm eine Trinkflasche für den Hund mit.' : 'Ob es unterwegs Wasser gibt, ist nicht bekannt. Nimm eine Trinkflasche für den Hund mit.');
    if (shade !== null && shade < 50) warnings.push('Wenig Schatten. Lieber früh morgens oder abends gehen.');
  }
  if (tempC != null && tempC >= 21 && isBrachy(breed)) warnings.push('Kurznasige Hunde überhitzen schon ab etwa 21 °C. Kurze Runde im Schatten, Wasser mitnehmen, Pausen machen.');
  if (tempC != null && tempC <= 0 && attrs.surface === 'asphalt') warnings.push('Streusalz möglich. Pfoten nach der Runde abwaschen.');
  if (km != null && dogAge === 'welpe' && km > 2) warnings.push('Für Welpen ist die Runde lang. Plane Pausen ein oder kürze ab.');
  if (km != null && dogAge === 'senior' && km > 4) warnings.push('Für ältere Hunde eher lang. Achte auf Pausen.');
  const score = parts.reduce((s, p) => s + p.pts, 0);
  return { score, parts, warnings };
}

/** Belebtheit 0–100 zu einer Stunde, als Wort. */
export function busyLevel(value) {
  if (value < 20) return { key: 'ruhig', label: 'ruhig' };
  if (value < 50) return { key: 'maessig', label: 'mäßig besucht' };
  return { key: 'voll', label: 'viel los' };
}

/** Ruhigste Stunde zwischen 6 und 21 Uhr. */
export function quietestHour(busyness) {
  let best = 6;
  for (let h = 6; h <= 21; h++) if (busyness[h] < busyness[best]) best = h;
  return best;
}

export function averageRating(ratings = []) {
  if (!ratings.length) return null;
  return ratings.reduce((s, r) => s + r.stars, 0) / ratings.length;
}

/**
 * Passt die Runde zu den Wünschen? Liefert 0–100 und kurze Begründungen.
 * prefs: { minutes, dogAge, needWater, quiet, offLeash, tempC, hour, liveCount }
 */
export function matchRoute(route, prefs) {
  const reasons = [];
  const minutes = estimateMinutes(route.distanceKm, prefs.dogAge);
  const { score } = dogScore(route.attrs, { tempC: prefs.tempC, dogAge: prefs.dogAge, km: route.distanceKm });
  let fit = score * 0.5;

  const diff = Math.abs(minutes - prefs.minutes) / prefs.minutes;
  fit += Math.max(0, 25 - diff * 40);
  if (diff <= 0.25) reasons.push(`passt zu deinen ${prefs.minutes} Minuten (ca. ${minutes} Min.)`);

  if (prefs.needWater) {
    if (route.attrs.water) { fit += 10; reasons.push('Wasser zum Trinken und Planschen'); } else fit -= 15;
  }
  if (prefs.offLeash) {
    if (route.attrs.leash === 'frei') { fit += 10; reasons.push('Freilauf erlaubt'); } else if (route.attrs.leash === 'pflicht') fit -= 15;
  }
  const busy = route.busyness?.[prefs.hour] ?? 30;
  const live = prefs.liveCount ?? 0;
  if (prefs.quiet) {
    fit += Math.max(-15, 15 - busy / 4) - live * 4;
    if (busy < 20 && live === 0) reasons.push('jetzt gerade ruhig');
  }
  if (prefs.tempC != null && prefs.tempC >= 25) {
    fit += ((route.attrs.shade ?? 50) - 50) / 5;
    if (route.attrs.shade >= 80) reasons.push('viel Schatten bei der Hitze');
  }
  const avg = averageRating(route.ratings);
  if (avg != null) { fit += (avg - 3) * 3; if (avg >= 4.5) reasons.push(`von anderen mit ${avg.toFixed(1)} Sternen bewertet`); }
  return { fit: Math.max(0, Math.min(100, Math.round(fit))), minutes, reasons };
}

// ---------- Anzeige ----------

let DEC = ',';
/** Dezimalzeichen für die Anzeige (Englisch: Punkt). */
export function setDecimal(c) { DEC = c; }
export function formatKm(m) {
  const km = m / 1000;
  return (km < 10 ? km.toFixed(2) : km.toFixed(1)).replace('.', DEC);
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatDistanceShort(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${formatKm(m)} km`;
}

// ---------- Live-Status ----------

export const STATUS = {
  offen: { label: 'Offen für Gesellschaft', short: 'Gern zusammen' },
  neutral: { label: 'Einfach unterwegs', short: 'Unterwegs' },
  abstand: { label: 'Bitte Abstand', short: 'Bitte Abstand' },
};

/** Demo-Spaziergänger, damit die Live-Karte ohne echte Nutzer etwas zeigt. */
export const DEMO_WALKERS = [
  { id: 'demo-mette', name: 'Mette', dog: 'Bella', dogBreed: 'Labrador Retriever', dogYears: 4, languages: ['da', 'de'], status: 'offen', route: 'froeslev-hundeskov', speed: 1.2, offset: 300 },
  { id: 'demo-lars', name: 'Lars', dog: 'Rufus', dogBreed: 'Deutscher Schäferhund', dogYears: 7, languages: ['da'], status: 'abstand', route: 'froeslev-hundeskov', speed: 1.1, offset: 1800, reverse: true },
  { id: 'demo-sofie', name: 'Sofie', dog: 'Molly', dogBreed: 'Dackel', dogYears: 3, languages: ['de'], status: 'neutral', route: 'gendarmstien-kollund', speed: 1.3, offset: 900 },
  { id: 'demo-henrik', name: 'Henrik', dog: 'Bamse', dogBreed: 'Berner Sennenhund', dogYears: 9, languages: ['da', 'en'], status: 'abstand', route: 'gendarmstien-kollund', speed: 1.0, offset: 3200 },
  { id: 'demo-freja', name: 'Freja', dog: 'Luna', dogBreed: 'Border Collie', dogYears: 2, languages: ['da', 'de', 'en'], status: 'offen', route: 'hundeskov-torp', speed: 1.2, offset: 400 },
];

/** Position eines Demo-Spaziergängers zum Zeitpunkt `now` (ms). */
export function demoWalkerPosition(walker, route, now) {
  const len = pathLength(route.points);
  let d = (walker.offset + (now / 1000) * walker.speed) % len;
  if (walker.reverse) d = len - d;
  return pointAlong(route.points, d);
}
