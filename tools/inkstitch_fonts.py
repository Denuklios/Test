#!/usr/bin/env python3
"""
Wandelt Stickschriften aus der Ink/Stitch-Schriftsammlung (github.com/inkstitch/embroidery-fonts)
in das StickStudio-Format um (js/inkfonts/*.js).

Es werden nur die Schriftdaten (Satinsäulen, Füllungen, Laufstiche) übernommen, kein Ink/Stitch-Programmcode.
Jede Schrift behält ihre eigene Lizenz (OFL, CC-BY-SA oder gemeinfrei); die LICENSE-Dateien werden mitkopiert.

Aufruf:  python3 tools/inkstitch_fonts.py <pfad/zu/embroidery-fonts/src> <ausgabeordner-js> <ausgabeordner-lizenzen> font1 font2 ...
Benötigt: pip install svgelements
"""
import json
import math
import os
import re
import shutil
import sys
import xml.etree.ElementTree as ET

from svgelements import Matrix, Path, Move, Close, Line

NS = {
    'svg': 'http://www.w3.org/2000/svg',
    'inkscape': 'http://www.inkscape.org/namespaces/inkscape',
    'inkstitch': 'http://inkstitch.org/namespace',
}
INK = '{%s}' % NS['inkstitch']
LABEL = '{%s}label' % NS['inkscape']
PX2MM = 25.4 / 96.0


def parse_style(el):
    st = {}
    for k in ('fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'display', 'visibility'):
        if el.get(k) is not None:
            st[k] = el.get(k)
    for part in (el.get('style') or '').split(';'):
        if ':' in part:
            k, v = part.split(':', 1)
            st[k.strip()] = v.strip()
    return st


def unit_px(v):
    m = re.match(r'^\s*([-\d.eE+]+)\s*([a-z%]*)', v or '')
    if not m:
        return None
    n, u = float(m.group(1)), m.group(2)
    return n * {'': 1, 'px': 1, 'mm': 96 / 25.4, 'cm': 960 / 25.4, 'in': 96, 'pt': 96 / 72}.get(u, 1)


def flatten(subpath, step):
    """Unterpfad -> Liste von Punkten (px)."""
    pts = []
    for seg in subpath:
        if isinstance(seg, Move):
            pts.append((seg.end.x, seg.end.y))
            continue
        if isinstance(seg, Close):
            if pts and (abs(pts[-1][0] - pts[0][0]) > 1e-6 or abs(pts[-1][1] - pts[0][1]) > 1e-6):
                pts.append(pts[0])
            continue
        if isinstance(seg, Line):
            pts.append((seg.end.x, seg.end.y))
            continue
        # Länge grob schätzen (Mittel aus Sehne und Kontrollpolygon) – reicht für die Unterteilung
        ctrl = [seg.start] + [getattr(seg, k) for k in ('control', 'control1', 'control2') if getattr(seg, k, None) is not None] + [seg.end]
        net = sum(math.hypot(ctrl[i].x - ctrl[i - 1].x, ctrl[i].y - ctrl[i - 1].y) for i in range(1, len(ctrl)))
        L = (net + math.hypot(seg.end.x - seg.start.x, seg.end.y - seg.start.y)) / 2 if len(ctrl) > 2 else net
        if L <= 0:
            L = 1
        n = max(2, int(math.ceil(L / step)))
        for i in range(1, n + 1):
            p = seg.point(i / n)
            pts.append((p.x, p.y))
    out = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 1e-4:
            out.append(p)
    return out


def rdp(pts, eps):
    """Ramer-Douglas-Peucker (Toleranz in px)."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        md, mi = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if l2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
                d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > md:
                md, mi = d, i
        if md > eps and mi > 0:
            keep[mi] = True
            stack.append((a, mi))
            stack.append((mi, b))
    return [p for p, k in zip(pts, keep) if k]


def plen(pl):
    return sum(math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]) for i in range(1, len(pl)))


def cum(pl):
    c = [0.0]
    for i in range(1, len(pl)):
        c.append(c[-1] + math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]))
    return c


def point_at(pl, cl, s):
    if s <= 0:
        return pl[0]
    for i in range(1, len(pl)):
        if cl[i] >= s:
            d = cl[i] - cl[i - 1]
            t = (s - cl[i - 1]) / d if d > 0 else 0
            return (pl[i - 1][0] + (pl[i][0] - pl[i - 1][0]) * t, pl[i - 1][1] + (pl[i][1] - pl[i - 1][1]) * t)
    return pl[-1]


def seg_hit(a, b, c, d):
    den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
    if abs(den) < 1e-12:
        return None
    t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den
    u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
    if 0 <= t <= 1 and 0 <= u <= 1:
        return t, u
    return None


def hit_arc(rail, cl, rung):
    """Bogenlänge auf der Schiene, an der die Querlinie sie schneidet (oder None)."""
    best = None
    for i in range(1, len(rail)):
        for j in range(1, len(rung)):
            h = seg_hit(rail[i - 1], rail[i], rung[j - 1], rung[j])
            if h:
                s = cl[i - 1] + (cl[i] - cl[i - 1]) * h[0]
                if best is None or s < best:
                    best = s
    return best


def corner_arcs(pl, cl, deg=35):
    res = []
    lim = math.cos(math.radians(deg))
    for i in range(1, len(pl) - 1):
        ax, ay = pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]
        bx, by = pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]
        la, lb = math.hypot(ax, ay), math.hypot(bx, by)
        if la > 1e-9 and lb > 1e-9 and (ax * bx + ay * by) / (la * lb) < lim:
            res.append(cl[i])
    return res


def rotate_closed(pl, s):
    """Geschlossene Polylinie so drehen, dass sie bei Bogenlänge s beginnt."""
    cl = cum(pl)
    p0 = point_at(pl, cl, s)
    k = next(i for i in range(len(cl)) if cl[i] >= s)
    body = pl[k:-1] + pl[:k]
    return [p0] + body + [p0]


def satin_pairs(subs, attrs):
    """Satinsäule (Schienen + Querlinien) -> Punktpaare für Säule A."""
    subs = [s for s in subs if len(s) >= 2]
    if len(subs) < 2:
        return None
    # Querlinien kreuzen zwei andere Unterpfade, Kanten kreuzen sich nicht gegenseitig
    def crosses(a, b):
        for i in range(1, len(a)):
            for j in range(1, len(b)):
                if seg_hit(a[i - 1], a[i], b[j - 1], b[j]):
                    return True
        return False
    if len(subs) > 2:
        cnt = [sum(1 for j in range(len(subs)) if j != i and crosses(subs[i], subs[j])) for i in range(len(subs))]
        rails = [i for i in range(len(subs)) if cnt[i] < 2]
        if len(rails) != 2:
            rails = sorted(range(len(subs)), key=lambda i: -plen(subs[i]))[:2]
    else:
        rails = [0, 1]
    ri = sorted(rails)
    L, R = subs[ri[0]], subs[ri[1]]
    rungs = [subs[i] for i in range(len(subs)) if i not in ri]
    rev = attrs.get('reverse_rails', 'automatic')
    if rev in ('first', 'both'):
        L = L[::-1]
    if rev in ('second', 'both'):
        R = R[::-1]
    if rev in ('automatic', 'none', None, ''):
        same = math.dist(L[0], R[0]) + math.dist(L[-1], R[-1])
        cross = math.dist(L[0], R[-1]) + math.dist(L[-1], R[0])
        closed = math.dist(L[0], L[-1]) < 1e-3 and math.dist(R[0], R[-1]) < 1e-3
        if not closed and cross < same:
            R = R[::-1]
    closedL = math.dist(L[0], L[-1]) < 1e-3
    closedR = math.dist(R[0], R[-1]) < 1e-3
    cL, cR = cum(L), cum(R)
    hits = []
    for r in rungs:
        a, b = hit_arc(L, cL, r), hit_arc(R, cR, r)
        if a is not None and b is not None:
            hits.append((a, b))
    if closedL and closedR:
        # Ringe: Richtung angleichen und an der ersten Querlinie beginnen lassen
        def area(p):
            return sum(p[i - 1][0] * p[i][1] - p[i][0] * p[i - 1][1] for i in range(1, len(p)))
        if (area(L) > 0) != (area(R) > 0):
            R = R[::-1]
            cR = cum(R)
            hits = []
            for r in rungs:
                a, b = hit_arc(L, cL, r), hit_arc(R, cR, r)
                if a is not None and b is not None:
                    hits.append((a, b))
        if hits:
            a0, b0 = hits[0]
            L, R = rotate_closed(L, a0), rotate_closed(R, b0)
        else:
            # ohne Querlinie: zweite Schiene am nächsten Punkt beginnen lassen
            j = min(range(len(R) - 1), key=lambda i: math.dist(R[i], L[0]))
            R = R[j:-1] + R[:j] + [R[j]]
        cL, cR = cum(L), cum(R)
        hits = []
        for r in rungs:
            a, b = hit_arc(L, cL, r), hit_arc(R, cR, r)
            if a is not None and b is not None:
                hits.append((a, b))
    lL, lR = cL[-1], cR[-1]
    if lL < 1e-3 or lR < 1e-3:
        return None
    st = [(0.0, 0.0)]
    for a, b in sorted(hits):
        if a > st[-1][0] + 0.05 and b > st[-1][1] + 0.05 and a < lL - 0.05 and b < lR - 0.05:
            st.append((a, b))
    st.append((lL, lR))
    cornL, cornR = corner_arcs(L, cL), corner_arcs(R, cR)
    step = 1.6 / PX2MM  # etwa 1,6 mm
    pairs = []
    for k in range(1, len(st)):
        (a0, b0), (a1, b1) = st[k - 1], st[k]
        n = max(1, int(math.ceil(max(a1 - a0, b1 - b0) / step)))
        fr = {i / n: True for i in range(0, n + 1)}
        for c in cornL:
            if a0 < c < a1:
                fr[(c - a0) / (a1 - a0)] = False
        for c in cornR:
            if b0 < c < b1:
                fr[(c - b0) / (b1 - b0)] = False
        keys = sorted(fr)
        # zu dicht beieinander liegende Zwischenpunkte entfernen
        filt = []
        for f in keys:
            if filt and (f - filt[-1]) * max(a1 - a0, b1 - b0) < 0.25 / PX2MM:
                if not fr[f]:
                    filt[-1] = f
                continue
            filt.append(f)
        for f in filt:
            if k > 1 and f == 0:
                continue
            pa = point_at(L, cL, a0 + (a1 - a0) * f)
            pb = point_at(R, cR, b0 + (b1 - b0) * f)
            curve = fr.get(f, False) and 0 < f < 1
            pairs.append((pa, pb, curve))
    return pairs


def num(attrs, key, default):
    try:
        return float(attrs.get(key, default))
    except (TypeError, ValueError):
        return default


def truthy(attrs, key, default=False):
    v = attrs.get(key)
    if v is None:
        return default
    return str(v).lower() in ('true', '1', 'yes')


def kern_table(pairs, glyphs, k):
    """Nur Paare aus vorhandenen Zeichen mit spürbarer Wirkung (>= 0,05 mm) behalten."""
    res = {}
    for key, v in pairs.items():
        if ' ' in key and len(key) == 3:
            a, b = key[0], key[2]
        elif len(key) == 2:
            a, b = key[0], key[1]
        else:
            continue
        if a in glyphs and b in glyphs and abs(v * k) >= 0.05:
            res[a + b] = round(v * k, 2)
    return res


def norm_color(c):
    c = (c or '').strip().lower()
    return {'black': '#000000', '#000': '#000000', 'white': '#ffffff', '#fff': '#ffffff'}.get(c, c)


def convert_font(src_dir, font_id):
    meta = json.load(open(os.path.join(src_dir, font_id, 'font.json'), encoding='utf-8'))
    tree = ET.parse(os.path.join(src_dir, font_id, 'ltr.svg'))
    root = tree.getroot()
    # Benutzer-Einheit -> px
    scale = 1.0
    vb = (root.get('viewBox') or '').replace(',', ' ').split()
    w = unit_px(root.get('width'))
    if len(vb) == 4 and w:
        scale = w / float(vb[2])
    base = Matrix('scale(%f)' % scale)
    glyphs = {}
    colors = set()
    skipped = {}

    def walk(el, mat, glyph, inh):
        tr = el.get('transform')
        m = Matrix(tr) * mat if tr else mat
        st = dict(inh)
        st.update(parse_style(el))
        tag = el.tag.split('}')[-1]
        lab = el.get(LABEL) or ''
        if tag == 'g' and lab.startswith('GlyphLayer-'):
            glyph = lab[len('GlyphLayer-'):]
            st.pop('display', None)
            glyphs.setdefault(glyph, [])
        if st.get('display') == 'none' and not (tag == 'g' and lab.startswith('GlyphLayer-')):
            return
        if tag == 'path' and glyph is not None and el.get('d'):
            attrs = {k[len(INK):]: v for k, v in el.attrib.items() if k.startswith(INK)}
            p = Path(el.get('d')) * m
            p.reify()  # Transformation wirklich auf die Punkte anwenden
            subs = [rdp(flatten(sp, 0.6), 0.02 / PX2MM) for sp in p.as_subpaths()]
            subs = [s for s in subs if len(s) >= 2]
            if subs:
                glyphs[glyph].append((st, attrs, subs))
        elif tag in ('rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'use', 'text'):
            skipped[tag] = skipped.get(tag, 0) + 1
        for ch in el:
            walk(ch, m, glyph, st)

    walk(root, base, None, {})

    def mm(p, baseline):
        return [round(p[0] * PX2MM, 2), round((p[1] - baseline) * PX2MM, 2)]

    # Grundlinie: unterster Punkt flacher Buchstaben (Median)
    bottoms = []
    for ch in 'HEFILTKNMZxzniml':
        if ch in glyphs and glyphs[ch]:
            bottoms.append(max(pt[1] for (_, _, subs) in glyphs[ch] for s in subs for pt in s))
    bottoms.sort()
    baseline = bottoms[len(bottoms) // 2] if bottoms else 0.0

    out = {}
    advs = {}
    hadv = meta.get('horiz_adv_x') or {}
    hdef = meta.get('horiz_adv_x_default')
    for name, elems in glyphs.items():
        if len(name) != 1 or not elems:
            continue
        right = max(pt[0] for (_, _, subs) in elems for sp in subs for pt in sp)
        # wie Ink/Stitch: eigene Angabe, sonst Vorgabe, sonst rechte Kante des Zeichens
        advs[name] = hadv.get(name, hdef if hdef is not None else right)
    stats = {'colA': 0, 'fill': 0, 'run': 0, 'colC': 0}
    for name, elems in glyphs.items():
        if len(name) != 1 or not elems:
            continue
        objs = []
        for st, attrs, subs in elems:
            stroke = (st.get('stroke') or 'none').lower()
            fill = (st.get('fill') or 'none').lower()
            if truthy(attrs, 'satin_column'):
                pairs = satin_pairs(subs, attrs)
                if not pairs:
                    continue
                colors.add(norm_color(stroke))
                ul = []
                if truthy(attrs, 'center_walk_underlay'):
                    ul.append('center')
                if truthy(attrs, 'contour_underlay'):
                    ul.append('edge')
                if truthy(attrs, 'zigzag_underlay'):
                    ul.append('zigzag')
                pts, cs = [], ''
                for pa, pb, c in pairs:
                    pts += mm(pa, baseline) + mm(pb, baseline)
                    cs += '1' if c else '0'
                objs.append({
                    't': 'colA', 'p': pts, 'c': cs,
                    'pr': {
                        'spacing': num(attrs, 'zigzag_spacing_mm', 0.4),
                        'pull': num(attrs, 'pull_compensation_mm', 0),
                        'underlay': '+'.join(ul) or 'none',
                        'split': num(attrs, 'max_stitch_length_mm', 0) or 0,
                    },
                })
                stats['colA'] += 1
            elif fill not in ('none', 'transparent', ''):
                colors.add(norm_color(fill))
                rings = []
                for s in subs:
                    if len(s) < 3:
                        continue
                    if math.dist(s[0], s[-1]) > 1e-3:
                        s = s + [s[0]]
                    rings.append(s[:-1])
                if not rings:
                    continue

                def area(r):
                    return abs(sum(r[i - 1][0] * r[i][1] - r[i][0] * r[i - 1][1] for i in range(len(r)))) / 2
                rings.sort(key=lambda r: -area(r))
                objs.append({
                    't': 'fill',
                    'r': [[c for p in r for c in mm(p, baseline)] for r in rings],
                    'pr': {
                        'angle': -num(attrs, 'angle', 0),
                        'spacing': num(attrs, 'row_spacing_mm', 0.25),
                        'len': num(attrs, 'max_stitch_length_mm', 3.0),
                        'underlay': 'tatami' if truthy(attrs, 'fill_underlay', True) else 'none',
                        'pull': 0,
                    },
                })
                stats['fill'] += 1
            elif stroke not in ('none', 'transparent', ''):
                colors.add(norm_color(stroke))
                dashed = (st.get('stroke-dasharray') or 'none') != 'none'
                sw = (unit_px(st.get('stroke-width') or '1') or 1) * PX2MM
                for s in subs:
                    if not dashed and sw >= 0.8:
                        objs.append({'t': 'colC', 'p': [c for p in s for c in mm(p, baseline)],
                                     'pr': {'width': round(sw, 2), 'spacing': 0.4, 'pull': 0.1, 'underlay': 'center', 'split': 0}})
                        stats['colC'] += 1
                    else:
                        rep = int(num(attrs, 'bean_stitch_repeats', 0) or 0)
                        s = rdp(s, 0.05 / PX2MM)
                        objs.append({'t': 'run', 'p': [c for p in s for c in mm(p, baseline)],
                                     'pr': {'len': num(attrs, 'running_stitch_length_mm', 2.5),
                                            'style': 'triple' if rep >= 1 else 'single'}})
                        stats['run'] += 1
        if objs:
            out[name] = objs

    k = PX2MM
    lic = open(os.path.join(src_dir, font_id, 'LICENSE'), encoding='utf-8', errors='ignore').read()
    L = lic.lower()
    license = 'OFL-1.1' if 'open font license' in L else 'CC-BY-SA' if 'by-sa' in L else 'gemeinfrei' if 'public domain' in L else 'siehe LICENSE'
    font = {
        'id': font_id,
        'name': meta.get('name', font_id),
        'description': meta.get('description', ''),
        'keywords': meta.get('keywords', []),
        'license': license,
        'size': meta.get('size'),
        'leading': round(meta.get('leading', 100) * k, 3),
        'adv': {c: round(v * k, 3) for c, v in advs.items()},
        'advDefault': round((meta.get('horiz_adv_x_default') or 40) * k, 3),
        'space': round((meta.get('horiz_adv_x_space') or 20) * k, 3),
        'kern': kern_table(meta.get('kerning_pairs', {}), out, k),
        'glyphs': out,
    }
    return font, stats, colors, skipped


def main():
    src, out_js, out_lic = sys.argv[1:4]
    ids = sys.argv[4:]
    os.makedirs(out_js, exist_ok=True)
    os.makedirs(out_lic, exist_ok=True)
    index = []
    for fid in ids:
        font, stats, colors, skipped = convert_font(src, fid)
        multi = len({c for c in colors if c not in ('none',)}) > 1
        print(f"{fid}: {len(font['glyphs'])} Zeichen {stats} Farben={sorted(colors)} {'MEHRFARBIG ' if multi else ''}übersprungen={skipped}")
        js = '/* Stickschrift "%s" aus der Ink/Stitch-Schriftsammlung, Lizenz: %s (siehe fonts/inkstitch/%s/LICENSE). Erzeugt mit tools/inkstitch_fonts.py */\n' % (font['name'], font['license'], fid)
        js += 'HW.registerInkFont(%s);\n' % json.dumps(font, ensure_ascii=False, separators=(',', ':'))
        open(os.path.join(out_js, fid + '.js'), 'w', encoding='utf-8').write(js)
        os.makedirs(os.path.join(out_lic, fid), exist_ok=True)
        shutil.copy(os.path.join(src, fid, 'LICENSE'), os.path.join(out_lic, fid, 'LICENSE'))
        index.append({'id': fid, 'name': font['name'], 'license': font['license'], 'size': font['size'],
                      'keywords': font['keywords'], 'chars': ''.join(sorted(font['glyphs'].keys()))})
    idx = '/* Verzeichnis der eingebauten Ink/Stitch-Stickschriften. Erzeugt mit tools/inkstitch_fonts.py */\n'
    idx += '(function (g) { const HW = (g.HW = g.HW || {}); HW.INKFONT_INDEX = %s; })(typeof window !== "undefined" ? window : globalThis);\n' % json.dumps(index, ensure_ascii=False)
    open(os.path.join(out_js, 'index.js'), 'w', encoding='utf-8').write(idx)


if __name__ == '__main__':
    main()
