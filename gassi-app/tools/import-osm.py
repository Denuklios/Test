#!/usr/bin/env python3
"""
Importiert Runden aus OpenStreetMap (offene Daten, Lizenz ODbL – Quellenangabe in der App).

1. Hundeauslaufflächen und Hundewälder (leisure=dog_park) in ganz Deutschland und im
   dänischen Grenzland: die Runde führt am Rand der Fläche entlang.
2. Rundwanderwege (route=hiking/foot) in der Region Aabenraa – Padborg – Flensburg –
   Schleswig – Kropp. Für sie wird der Hunde-Score aus der Karte berechnet:
   Schatten = Anteil der Strecke im Wald, Wasser = See, Bach oder Förde in der Nähe.

Ergebnis: public/data/osm/<zelle>.json (Zellen von 0,5° × 0,5°) und public/data/osm/index.json.
Aufruf: python3 tools/import-osm.py   (dauert einige Minuten, fragt einen Overpass-Server ab)
"""
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = os.environ.get('OVERPASS', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter')
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'data', 'osm')
REGION = (54.30, 8.80, 55.15, 10.10)  # S, W, N, E – Heimatregion mit Wanderwegen und Score
COUNTRY = (47.2, 5.8, 55.2, 15.1)     # Deutschland (mit Rand)

BUSY_QUIET = [1, 1, 1, 1, 1, 3, 10, 18, 20, 18, 15, 15, 18, 15, 14, 15, 22, 30, 28, 20, 10, 5, 2, 1]
BUSY_PARK = [1, 1, 1, 1, 2, 6, 18, 35, 38, 30, 28, 30, 32, 28, 26, 30, 42, 55, 55, 40, 22, 10, 4, 2]


CACHE = os.environ.get('OSM_CACHE', os.path.expanduser('~/.cache/gassi-osm'))
PAUSE = float(os.environ.get('OSM_PAUSE', '3'))
BUDGET = float(os.environ.get('OSM_BUDGET_MIN', '0')) * 60  # 0 = unbegrenzt
T0 = time.time()
HOME = (54.92, 9.40)  # Vilsbæk: Hundeflächen in der Nähe zuerst


def out_of_time():
    return BUDGET and time.time() - T0 > BUDGET


def overpass(query, tries=3, fatal=True):
    """Overpass-Abfrage mit Zwischenspeicher. fatal=False: None bei Fehlschlag (dann kleiner teilen)."""
    import hashlib
    os.makedirs(CACHE, exist_ok=True)
    cf = os.path.join(CACHE, hashlib.sha1(query.encode()).hexdigest() + '.json')
    if os.path.exists(cf):
        with open(cf) as fh:
            return json.load(fh)
    data = urllib.parse.urlencode({'data': query}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(ENDPOINT, data=data, headers={'User-Agent': 'gassirunde-import/1.0'})
            with urllib.request.urlopen(req, timeout=300) as r:
                res = json.load(r)
            if 'runtime error' in res.get('remark', ''):
                raise RuntimeError(res['remark'][:80])
            with open(cf, 'w') as fh:
                json.dump(res, fh)
            time.sleep(PAUSE)  # Spiegelserver schonen
            return res
        except urllib.error.HTTPError as e:
            # 504/429 kurz nach dem Absenden: Server bremst – länger warten; sonst ist die Abfrage zu groß
            print('  Overpass-Fehler:', e, file=sys.stderr)
            time.sleep(60 if e.code in (429, 504) else 5)
        except Exception as e:
            print('  Overpass-Fehler:', e, file=sys.stderr)
            time.sleep(10 * (i + 1))
    if fatal:
        raise SystemExit('Overpass nicht erreichbar')
    return None


def tiled(template, box, depth=0):
    """Abfrage für ein Rechteck; schlägt sie fehl, in vier Teile teilen (bis zu 3-mal)."""
    S, W, N, E = box
    res = overpass(template.format(bb=f'{S},{W},{N},{E}'), tries=2, fatal=depth >= 3)
    if res is not None:
        return res['elements']
    mlat, mlon = (S + N) / 2, (W + E) / 2
    out = []
    for sub in ((S, W, mlat, mlon), (S, mlon, mlat, E), (mlat, W, N, mlon), (mlat, mlon, N, E)):
        out += tiled(template, sub, depth + 1)
    return out


def grid(box, dlat, dlon):
    S, W, N, E = box
    lat = S
    while lat < N - 1e-9:
        lon = W
        while lon < E - 1e-9:
            yield (round(lat, 4), round(lon, 4), round(min(lat + dlat, N), 4), round(min(lon + dlon, E), 4))
            lon += dlon
        lat += dlat


# ---------- Geometrie ----------

def dist(a, b):
    r = math.pi / 180
    h = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def length(pts):
    return sum(dist(pts[i - 1], pts[i]) for i in range(1, len(pts)))


def simplify(pts, tol=6.0):
    """Douglas-Peucker in Metern (flache Näherung, reicht für kurze Strecken)."""
    if len(pts) < 3:
        return pts
    lat0 = math.radians(pts[0][0])
    xy = [((p[1]) * 111320 * math.cos(lat0), p[0] * 110540) for p in pts]

    def rec(i, j, keep):
        ax, ay = xy[i]; bx, by = xy[j]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        best, idx = 0, None
        for k in range(i + 1, j):
            px, py = xy[k]
            t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
            d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > best:
                best, idx = d, k
        if idx is not None and best > tol:
            rec(i, idx, keep); keep.add(idx); rec(idx, j, keep)

    keep = {0, len(pts) - 1}
    rec(0, len(pts) - 1, keep)
    return [pts[k] for k in sorted(keep)]


def resample(pts, step=60):
    """Punkte etwa alle `step` Meter (für die Score-Berechnung)."""
    out = [pts[0]]
    acc = 0
    for i in range(1, len(pts)):
        acc += dist(pts[i - 1], pts[i])
        if acc >= step:
            out.append(pts[i]); acc = 0
    return out


def bbox(pts):
    la = [p[0] for p in pts]; lo = [p[1] for p in pts]
    return (min(la), min(lo), max(la), max(lo))


def inside(p, poly):
    y, x = p
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        yi, xi = poly[i]; yj, xj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi:
            c = not c
        j = i
    return c


def geom(el):
    return [(round(g['lat'], 6), round(g['lon'], 6)) for g in el.get('geometry', []) if g]


def join_ways(members):
    """Wege einer Relation zu einer Linie zusammensetzen (Richtung bei Bedarf umdrehen)."""
    parts = [geom(m) for m in members if m.get('type') == 'way' and m.get('geometry') and m.get('role', '') in ('', 'forward', 'backward', 'main')]
    parts = [p for p in parts if len(p) >= 2]
    if not parts:
        return []
    line = list(parts[0])
    for p in parts[1:]:
        ends = [(dist(line[-1], p[0]), 'ok'), (dist(line[-1], p[-1]), 'rev'), (dist(line[0], p[-1]), 'pre'), (dist(line[0], p[0]), 'prerev')]
        d, how = min(ends)
        if d > 400:  # Lücke: Wegstück passt nicht – Relation ist nicht durchgehend
            return []
        if how == 'ok': line += p[1:]
        elif how == 'rev': line += p[::-1][1:]
        elif how == 'pre': line = p[:-1] + line
        else: line = p[::-1][:-1] + line
    return line


# ---------- Orte für Namen ----------

class Places:
    def __init__(self):
        self.items = []

    def add(self, elements):
        for e in elements:
            if e.get('tags', {}).get('name') and 'lat' in e:
                self.items.append((e['lat'], e['lon'], e['tags']['name'], e['tags'].get('place')))

    def near(self, p):
        best, name = 1e18, ''
        for la, lo, n, kind in self.items:
            if abs(la - p[0]) > 0.15 or abs(lo - p[1]) > 0.25:
                continue
            d = dist(p, (la, lo)) * (0.6 if kind in ('city', 'town') else 1)
            if d < best:
                best, name = d, n
        return name


# ---------- 1. Hundeflächen ----------

def dog_parks(places):
    routes = []
    seen = set()
    boxes = sorted(grid(COUNTRY, 1.0, 1.2), key=lambda b: dist(HOME, ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)))
    skipped = 0
    for box in boxes:
        if out_of_time():
            skipped += 1
            continue
        els = tiled('[out:json][timeout:90];(way["leisure"="dog_park"]({bb});relation["leisure"="dog_park"]({bb}););out geom tags;'
                    'node["place"~"^(city|town|village|suburb)$"]({bb});out tags;', box)
        places.add([e for e in els if e['type'] == 'node'])
        n = 0
        for e in els:
            if e['type'] == 'node' or (e['type'], e['id']) in seen:
                continue
            seen.add((e['type'], e['id']))
            if e['type'] == 'way':
                ring = geom(e)
            else:
                outers = [geom(m) for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
                ring = max(outers, key=len) if outers else []
            if len(ring) < 4:
                continue
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            if length(ring) < 120:  # winzige Fläche: keine Runde
                continue
            routes.append({'el': e, 'ring': simplify(ring, 4)})
            n += 1
        print(f'  Hundeflächen {box}: {n}', file=sys.stderr)
    if skipped:
        print(f'  Zeitbudget erreicht: {skipped} Kacheln beim nächsten Lauf (Zwischenspeicher)', file=sys.stderr)
    out = []
    for r in routes:
        e, ring = r['el'], r['ring']
        t = e.get('tags', {})
        c = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
        town = places.near(c)
        name = t.get('name') or (('Hundewald' if any(k in (t.get('description', '') + t.get('note', '')).lower() for k in ('wald', 'skov')) else 'Hundeauslauf') + (f' {town}' if town else ''))
        woody = any(k in (name + t.get('description', '')).lower() for k in ('wald', 'skov', 'forst', 'holz'))
        fenced = t.get('barrier') == 'fence' or t.get('fenced') == 'yes'
        km = round(length(ring) / 1000, 2)
        desc = 'Hundeauslauffläche aus OpenStreetMap' + (' (eingezäunt)' if fenced else '') + '. Die Runde führt am Rand der Fläche entlang. Regeln bitte vor Ort prüfen.'
        out.append({
            'id': f"osm-{e['type'][0]}{e['id']}", 'name': name[:60], 'area': town, 'description': desc,
            'source': 'osm', 'kind': 'hundeauslauf', 'author': 'OpenStreetMap', 'points': [list(p) for p in ring], 'distanceKm': km,
            'attrs': {'water': None, 'shade': 85 if woody else None, 'surface': 'natur', 'crossings': 0, 'leash': 'frei', 'bins': None},
            'busyness': BUSY_PARK,
        })
    return out


# ---------- 2. Rundwanderwege mit berechnetem Score ----------

def region_routes(places):
    S, W, N, E = REGION
    bb = f'{S},{W},{N},{E}'
    print('Wanderwege der Region …', file=sys.stderr)
    rel = {'elements': []}
    ids = set()
    for box in grid(REGION, 0.45, 0.65):
        for e in tiled('[out:json][timeout:90];relation["route"~"^(hiking|foot)$"]({bb});out geom tags;', box):
            if e['id'] not in ids:
                ids.add(e['id']); rel['elements'].append(e)
    print(f'  {len(ids)} Wanderwege. Wald und Wasser der Region …', file=sys.stderr)
    nature = {'elements': []}
    water = {'elements': []}
    for box in grid(REGION, 0.2, 0.3):
        nature['elements'] += tiled('[out:json][timeout:90];(way["landuse"="forest"]({bb});way["natural"="wood"]({bb});'
                                    'relation["landuse"="forest"]({bb});relation["natural"="wood"]({bb}););out geom;', box)
        water['elements'] += tiled('[out:json][timeout:90];(way["natural"="water"]({bb});way["waterway"~"^(river|stream|canal)$"]({bb});'
                                   'way["natural"="coastline"]({bb}););out geom;', box)
    print(f'  {len(nature["elements"])} Waldflächen, {len(water["elements"])} Gewässer', file=sys.stderr)
    places.add(tiled('[out:json][timeout:90];node["place"~"^(city|town|village|suburb|hamlet)$"]({bb});out tags;', REGION))

    forests = []
    for e in nature['elements']:
        rings = [geom(e)] if e['type'] == 'way' else [geom(m) for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
        for r in rings:
            if len(r) >= 4:
                forests.append((bbox(r), r))
    wpts = []  # Wasser als Punktwolke (alle ~40 m)
    for e in water['elements']:
        g = geom(e)
        if len(g) >= 2:
            wpts += resample(g, 40)
    wgrid = {}
    for p in wpts:
        wgrid.setdefault((int(p[0] * 200), int(p[1] * 120)), []).append(p)

    def near_water(p, maxd=60):
        gy, gx = int(p[0] * 200), int(p[1] * 120)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for q in wgrid.get((gy + dy, gx + dx), []):
                    if dist(p, q) < maxd:
                        return True
        return False

    def in_forest(p):
        for (s, w, n, e), poly in forests:
            if s <= p[0] <= n and w <= p[1] <= e and inside(p, poly):
                return True
        return False

    out = []
    for e in rel['elements']:
        t = e.get('tags', {})
        line = join_ways(e.get('members', []))
        if len(line) < 5:
            continue
        L = length(line)
        loop = dist(line[0], line[-1]) < 300 or t.get('roundtrip') == 'yes'
        if loop and not (1500 <= L <= 14000):
            continue
        if not loop:
            if not (1000 <= L <= 6000):
                continue
            line = line + line[::-1][1:]  # hin und zurück
        samples = resample(line, 60)
        shade = round(100 * sum(1 for p in samples if in_forest(p)) / max(1, len(samples)))
        water_hits = sum(1 for p in samples if near_water(p))
        pts = simplify(line, 6)
        town = places.near(pts[0])
        name = t.get('name') or t.get('ref') or f'Rundweg {town}'
        km = round(length(line) / 1000, 2)
        desc = (f"{'Rundweg' if loop else 'Wanderweg, hin und zurück'} aus OpenStreetMap"
                + (f" ({t['operator']})" if t.get('operator') else '')
                + f". {shade} % der Strecke im Wald"
                + (', mit Wasser in der Nähe.' if water_hits else '.')
                + ' Leinenregeln bitte vor Ort prüfen.')
        out.append({
            'id': f"osm-r{e['id']}", 'name': name[:60], 'area': town, 'description': desc,
            'source': 'osm', 'kind': 'wanderweg', 'author': 'OpenStreetMap', 'points': [list(p) for p in pts], 'distanceKm': km,
            'attrs': {'water': water_hits >= 2, 'shade': shade, 'surface': 'natur' if shade >= 50 else 'gemischt',
                      'crossings': None, 'leash': None, 'bins': None},
            'busyness': BUSY_QUIET,
        })
    print(f'  Rundwege: {len(out)} von {len(rel["elements"])}', file=sys.stderr)
    return out


def main():
    places = Places()
    routes = region_routes(places) + dog_parks(places)
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.json'):
            os.remove(os.path.join(OUT, f))
    cells = {}
    for r in routes:
        la, lo = r['points'][0]
        cells.setdefault(f'{math.floor(la * 2)}_{math.floor(lo * 2)}', []).append(r)
    for k, v in cells.items():
        with open(os.path.join(OUT, k + '.json'), 'w') as fh:
            json.dump(v, fh, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump({'cells': sorted(cells), 'count': len(routes), 'date': time.strftime('%Y-%m-%d'), 'license': 'ODbL, © OpenStreetMap-Mitwirkende'}, fh)
    print(f'Fertig: {len(routes)} Runden in {len(cells)} Zellen', file=sys.stderr)


if __name__ == '__main__':
    main()
