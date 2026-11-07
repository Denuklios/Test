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
export function dogScore(attrs = {}, { tempC = null, dogAge = 'erwachsen', km = null } = {}) {
  const shade = Math.max(0, Math.min(100, attrs.shade ?? 50));
  const crossings = Math.max(0, attrs.crossings ?? 0);
  const parts = [
    { key: 'water', label: 'Wasser unterwegs', pts: attrs.water ? 20 : 0, max: 20 },
    { key: 'shade', label: 'Schatten', pts: Math.round(shade * 0.25), max: 25 },
    { key: 'surface', label: LABELS.surface[attrs.surface] || 'Untergrund unbekannt', pts: SURFACE_PTS[attrs.surface] ?? 10, max: 20 },
    { key: 'crossings', label: crossings === 0 ? 'Keine Straßen zu queren' : `${crossings} Straße${crossings > 1 ? 'n' : ''} zu queren`, pts: Math.max(0, 15 - crossings * 5), max: 15 },
    { key: 'leash', label: LABELS.leash[attrs.leash] || 'Leinenregel unbekannt', pts: LEASH_PTS[attrs.leash] ?? 5, max: 10 },
    { key: 'bins', label: attrs.bins ? 'Mülleimer für Kotbeutel' : 'Keine Mülleimer bekannt', pts: attrs.bins ? 10 : 0, max: 10 },
  ];
  const warnings = [];
  if (tempC != null && tempC >= 25) {
    if (attrs.surface === 'asphalt') warnings.push(`Bei ${Math.round(tempC)} °C wird Asphalt heiß. Mach den Handrücken-Test: 7 Sekunden auf den Boden legen.`);
    if (!attrs.water) warnings.push('Kein Wasser unterwegs. Nimm eine Trinkflasche für den Hund mit.');
    if (shade < 50) warnings.push('Wenig Schatten. Lieber früh morgens oder abends gehen.');
  }
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
    fit += (route.attrs.shade - 50) / 5;
    if (route.attrs.shade >= 80) reasons.push('viel Schatten bei der Hitze');
  }
  const avg = averageRating(route.ratings);
  if (avg != null) { fit += (avg - 3) * 3; if (avg >= 4.5) reasons.push(`von anderen mit ${avg.toFixed(1)} Sternen bewertet`); }
  return { fit: Math.max(0, Math.min(100, Math.round(fit))), minutes, reasons };
}

// ---------- Anzeige ----------

export function formatKm(m) {
  const km = m / 1000;
  return km < 10 ? km.toFixed(2).replace('.', ',') : km.toFixed(1).replace('.', ',');
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
  { id: 'demo-luna', name: 'Luna', dog: 'Kira', status: 'offen', route: 'grunewaldsee', speed: 1.2, offset: 300 },
  { id: 'demo-max', name: 'Max', dog: 'Bruno', status: 'abstand', route: 'grunewaldsee', speed: 1.1, offset: 2600, reverse: true },
  { id: 'demo-sabine', name: 'Sabine', dog: 'Emma', status: 'neutral', route: 'tiergarten', speed: 1.3, offset: 900 },
  { id: 'demo-tom', name: 'Tom', dog: 'Rocky', status: 'abstand', route: 'tiergarten', speed: 1.0, offset: 2500 },
  { id: 'demo-jana', name: 'Jana', dog: 'Paul', status: 'offen', route: 'friedrichshain', speed: 1.2, offset: 400 },
];

/** Position eines Demo-Spaziergängers zum Zeitpunkt `now` (ms). */
export function demoWalkerPosition(walker, route, now) {
  const len = pathLength(route.points);
  let d = (walker.offset + (now / 1000) * walker.speed) % len;
  if (walker.reverse) d = len - d;
  return pointAlong(route.points, d);
}
