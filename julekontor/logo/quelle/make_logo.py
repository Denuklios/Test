"""Julekontor-Logo als reine Vektorgrafik (Schrift in Pfade umgewandelt, transparenter Hintergrund)."""
import sys, math
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

D = sys.argv[1]
W, H = 1200, 860
CX = W / 2


class Font:
    def __init__(self, path):
        self.tt = TTFont(path)
        self.gs = self.tt.getGlyphSet()
        self.upem = self.tt['head'].unitsPerEm
        blob = hb.Blob.from_file_path(path)
        self.hbf = hb.Font(hb.Face(blob))
        self.order = self.tt.getGlyphOrder()

    def shape(self, text, track=0):
        buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
        hb.shape(self.hbf, buf, {"kern": True, "liga": True})
        out, x = [], 0
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            out.append((self.order[info.codepoint], x + pos.x_offset, pos.y_offset))
            x += pos.x_advance + track
        return out, x - track

    def path(self, text, size, cx, baseline, sx=1.0, sy=1.0, track=0, tweak=None):
        """Text zentriert auf cx. sx/sy strecken die Buchstaben (schmal und hoch wie im Original)."""
        glyphs, adv = self.shape(text, track)
        k = size / self.upem
        width = adv * k * sx
        x0 = cx - width / 2
        parts = []
        for i, (name, gx, gy) in enumerate(glyphs):
            pen = SVGPathPen(self.gs)
            dx, dy, s2 = 0, 0, 1.0
            if tweak and i in tweak:
                dx, dy, s2 = tweak[i]
            t = (k * sx * s2, 0, 0, -k * sy * s2, x0 + gx * k * sx + dx, baseline - gy * k * sy + dy)
            self.gs[name].draw(TransformPen(pen, t))
            parts.append(pen.getCommands())
        return " ".join(parts), width


main = Font(f"{D}/Elsie.ttf")
sub = Font(f"{D}/ElsieSwash.ttf")

# ---------- Schrift ----------
jk, jk_w = main.path("Julekontor", 290, CX + 6, 372, sx=0.70, sy=1.22, track=-4)
dan, _ = sub.path("Danmarks", 96, CX, 500, sx=0.95, sy=1.05)
gam, _ = sub.path("Gammeldags", 96, CX, 596, sx=0.95, sy=1.05)
jul, _ = sub.path("Julebutik", 96, CX, 692, sx=0.95, sy=1.05)


# ---------- Ornamente ----------
def spiral(cx, cy, r0, turns, start_ang, direction=1, steps=40):
    """Spirale nach innen als Punktliste."""
    pts = []
    n = int(steps * turns)
    for i in range(n + 1):
        t = i / n
        a = start_ang + direction * t * turns * 2 * math.pi
        r = r0 * (1 - 0.82 * t)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def smooth(pts):
    """Catmull-Rom durch die Punkte als kubische Bézierkurve."""
    d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i else pts[0]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d


def taper(pts, w0, w1):
    """Gefüllte Linie, deren Breite von w0 nach w1 verläuft (wie mit der Feder gezogen)."""
    left, right = [], []
    n = len(pts)
    for i, (x, y) in enumerate(pts):
        a = pts[max(i - 1, 0)]; b = pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        w = (w0 + (w1 - w0) * (i / (n - 1))) / 2
        left.append((x + nx * w, y + ny * w)); right.append((x - nx * w, y - ny * w))
    return smooth(left) + " L" + smooth(right[::-1])[1:] + " Z"


def bez(p0, p1, p2, p3, steps=40):
    return [((1-t)**3*p0[0] + 3*(1-t)**2*t*p1[0] + 3*(1-t)*t*t*p2[0] + t**3*p3[0],
             (1-t)**3*p0[1] + 3*(1-t)**2*t*p1[1] + 3*(1-t)*t*t*p2[1] + t**3*p3[1])
            for t in (i / steps for i in range(steps + 1))]


def scroll(curve, sp_r, sp_turns, sp_dir, w0, w1):
    """Bogen, der in eine Spirale ausläuft."""
    p_end = curve[-1]; p_prev = curve[-2]
    tang = math.atan2(p_end[1] - p_prev[1], p_end[0] - p_prev[0])
    ang = tang - sp_dir * math.pi / 2          # Mittelpunkt seitlich der Laufrichtung
    cx, cy = p_end[0] - sp_r * math.cos(ang), p_end[1] - sp_r * math.sin(ang)
    start = math.atan2(p_end[1] - cy, p_end[0] - cx)
    sp = spiral(cx, cy, sp_r, sp_turns, start, sp_dir)
    pts = curve + sp[1:]
    return taper(pts, w0, w1)


def mirror(d):
    return f'<path d="{d}" transform="translate({W},0) scale(-1,1)"/>'


orn = []
# oben: zwei große Bögen, die sich über dem k treffen und in Spiralen auslaufen
top = scroll(bez((CX, 112), (CX + 90, 30), (CX + 260, 40), (CX + 330, 96)), 26, 1.2, 1, 9, 2)
top2 = scroll(bez((CX + 60, 100), (CX + 140, 80), (CX + 190, 100), (CX + 205, 128)), 12, 1.1, 1, 4.5, 1.5)
top3 = scroll(bez((CX + 330, 96), (CX + 400, 140), (CX + 470, 132), (CX + 500, 110)), 10, 1.1, -1, 4, 1.5)
orn.append('<g transform="translate(0,-16)">')
for d in (top, top2, top3):
    orn += [f'<path d="{d}"/>', mirror(d)]
orn.append(f'<path d="M{CX},86 C{CX+12},100 {CX+12},112 {CX},126 C{CX-12},112 {CX-12},100 {CX},86 Z"/>')
orn.append('</g>')

# Mitte: lange Federstriche links und rechts von „Danmarks“, die in Spiralen enden
mid = scroll(bez((CX - 255, 452), (CX - 330, 436), (CX - 420, 440), (CX - 470, 470)), 22, 1.35, 1, 7, 1.5)
mid2 = scroll(bez((CX - 262, 466), (CX - 300, 480), (CX - 325, 505), (CX - 330, 535)), 12, 1.2, 1, 4.5, 1.3)
for d in (mid, mid2):
    orn += [f'<path d="{d}"/>', mirror(d)]
# Ranken neben „Gammeldags“ und „Julebutik“
side = scroll(bez((CX - 305, 582), (CX - 350, 570), (CX - 400, 572), (CX - 425, 596)), 14, 1.25, -1, 5, 1.4)
side2 = scroll(bez((CX - 238, 676), (CX - 290, 666), (CX - 345, 670), (CX - 365, 694)), 13, 1.25, -1, 5, 1.4)
for d in (side, side2):
    orn += [f'<path d="{d}"/>', mirror(d)]

# unten: symmetrisches Ornament unter „Julebutik“
bot = scroll(bez((CX, 744), (CX + 60, 718), (CX + 160, 722), (CX + 215, 752)), 18, 1.3, 1, 8, 1.5)
bot2 = scroll(bez((CX + 18, 754), (CX + 55, 772), (CX + 90, 786), (CX + 104, 770)), 8, 1.1, -1, 4, 1.2)
for d in (bot, bot2):
    orn += [f'<path d="{d}"/>', mirror(d)]
orn.append(f'<path d="M{CX},728 C{CX+10},740 {CX+10},750 {CX},762 C{CX-10},750 {CX-10},740 {CX},728 Z"/>')

orn_g = "\n    ".join(orn)


def letters(d, gold_w, dark_w, hi):
    return f'''<g>
    <path d="{d}" fill="none" stroke="url(#gold)" stroke-width="{gold_w}" stroke-linejoin="round"/>
    <path d="{d}" fill="none" stroke="#4a0709" stroke-width="{dark_w}" stroke-linejoin="round"/>
    <path d="{d}" fill="url(#red)"/>
    <path d="{d}" fill="none" stroke="#ffd8a3" stroke-opacity=".55" stroke-width="{hi}" transform="translate(-1.2,-1.6)" clip-path="url(#clip-{id(d)})"/>
    <clipPath id="clip-{id(d)}"><path d="{d}"/></clipPath>
  </g>'''


svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <title>Julekontor – Danmarks Gammeldags Julebutik</title>
  <defs>
    <linearGradient id="red" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d5362f"/><stop offset=".5" stop-color="#ad1219"/><stop offset="1" stop-color="#760a10"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7dd92"/><stop offset=".5" stop-color="#d4a24a"/><stop offset="1" stop-color="#9a6d22"/>
    </linearGradient>
    <linearGradient id="goldH" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3d27f"/><stop offset=".45" stop-color="#c8963e"/><stop offset="1" stop-color="#a97a2c"/>
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#3a0a06" flood-opacity=".35"/>
    </filter>
  </defs>
  <g fill="url(#goldH)" stroke="#7a5418" stroke-width=".8" stroke-opacity=".6" filter="url(#shadow)">
    {orn_g}
  </g>
  <g filter="url(#shadow)">
  {letters(jk, 11, 4, 2)}
  {letters(dan, 7, 2.6, 1.3)}
  {letters(gam, 7, 2.6, 1.3)}
  {letters(jul, 7, 2.6, 1.3)}
  </g>
</svg>
'''
open(f"{D}/julekontor-logo.svg", "w").write(svg)
print("Julekontor width", round(jk_w))
