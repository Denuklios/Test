import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distance, pathLength, pointAlong, trimEnds, acceptFix, dogScore, matchRoute,
  estimateMinutes, formatKm, formatDuration, quietestHour,
} from '../public/js/core.js';

// Ein gerader Weg nach Norden: 0,001° Breite ≈ 111 m
const line = Array.from({ length: 11 }, (_, i) => [52.5 + i * 0.001, 13.4]);

test('distance: 0,001° Breite sind rund 111 m', () => {
  assert.ok(Math.abs(distance([52.5, 13.4], [52.501, 13.4]) - 111.2) < 0.5);
});

test('pathLength summiert die Abschnitte', () => {
  assert.ok(Math.abs(pathLength(line) - 1112) < 3);
});

test('pointAlong findet die Mitte', () => {
  const p = pointAlong(line, pathLength(line) / 2);
  assert.ok(Math.abs(p[0] - 52.505) < 1e-6);
});

test('trimEnds entfernt Anfang und Ende (Haustür-Schutz)', () => {
  const t = trimEnds(line, 200);
  assert.ok(distance(line[0], t[0]) >= 200);
  assert.ok(distance(line.at(-1), t.at(-1)) >= 200);
  assert.ok(pathLength(t) < pathLength(line) - 400);
});

test('trimEnds liefert nichts, wenn die Runde zu kurz ist', () => {
  assert.deepEqual(trimEnds(line.slice(0, 3), 200), []);
});

test('acceptFix verwirft ungenaue Messungen, Sprünge und Stillstand', () => {
  const a = { lat: 52.5, lng: 13.4, accuracy: 5, time: 0 };
  assert.equal(acceptFix(null, a), true);
  assert.equal(acceptFix(a, { ...a, accuracy: 80, lat: 52.5001, time: 5000 }), false); // ungenau
  assert.equal(acceptFix(a, { ...a, lat: 52.51, time: 5000 }), false); // 1,1 km in 5 s
  assert.equal(acceptFix(a, { ...a, lat: 52.500005, time: 5000 }), false); // < 3 m
  assert.equal(acceptFix(a, { ...a, lat: 52.5001, time: 8000 }), true); // 11 m in 8 s
});

test('dogScore: ideale Runde 100 Punkte, Warnungen bei Hitze auf Asphalt', () => {
  const ideal = dogScore({ water: true, shade: 100, surface: 'natur', crossings: 0, leash: 'frei', bins: true });
  assert.equal(ideal.score, 100);
  const hot = dogScore({ water: false, shade: 20, surface: 'asphalt', crossings: 3, leash: 'pflicht', bins: false }, { tempC: 30 });
  assert.ok(hot.score < 30);
  assert.equal(hot.warnings.length, 3);
});

test('matchRoute bevorzugt bei Hitze und Wasserwunsch die schattige Runde mit Wasser', () => {
  const busy = new Array(24).fill(10);
  const wald = { distanceKm: 3, attrs: { water: true, shade: 90, surface: 'natur', crossings: 0, leash: 'frei', bins: true }, busyness: busy, ratings: [] };
  const stadt = { distanceKm: 3, attrs: { water: false, shade: 30, surface: 'asphalt', crossings: 3, leash: 'pflicht', bins: true }, busyness: busy, ratings: [] };
  const prefs = { minutes: 40, dogAge: 'erwachsen', needWater: true, quiet: false, offLeash: false, tempC: 28, hour: 10 };
  assert.ok(matchRoute(wald, prefs).fit > matchRoute(stadt, prefs).fit + 30);
});

test('Anzeige-Helfer', () => {
  assert.equal(formatKm(4312), '4,31');
  assert.equal(formatDuration(65_000), '01:05');
  assert.equal(formatDuration(3_725_000), '1:02:05');
  assert.equal(estimateMinutes(4.2, 'erwachsen'), 60);
  const b = new Array(24).fill(50); b[7] = 5;
  assert.equal(quietestHour(b), 7);
});
