import math, random
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import Color, HexColor, white, black
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

import sys
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from review import review_box
OUT = sys.argv[1]
LOGO = sys.argv[2]

F = "/usr/share/fonts/truetype/crosextra/"
pdfmetrics.registerFont(TTFont("R", F + "Carlito-Regular.ttf"))
pdfmetrics.registerFont(TTFont("B", F + "Carlito-Bold.ttf"))
pdfmetrics.registerFont(TTFont("I", F + "Carlito-Italic.ttf"))
pdfmetrics.registerFont(TTFont("BI", F + "Carlito-BoldItalic.ttf"))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily("R", normal="R", bold="B", italic="I", boldItalic="BI")

W, H = A4
RED = HexColor("#C90C20")
DRED = HexColor("#8E0915")
NIGHT = HexColor("#3B0409")
GOLD = HexColor("#E7B03C")
DGOLD = HexColor("#B98318")
CREAM = HexColor("#FFF7EE")
PINE = HexColor("#1E5B3A")
INK = HexColor("#2B1A1A")
GREY = HexColor("#6E6262")
LGREY = HexColor("#EFE6DE")
WOOD = (0.86, 0.67, 0.43)
WOODC = HexColor("#D9A86C")
WOODD = HexColor("#9C6B35")
STEEL = HexColor("#9AA3AD")

c = canvas.Canvas(OUT, pagesize=A4)
c.setTitle("Preisschild XXL-Weihnachtsstern")
c.setAuthor("Sonderpreis Baumarkt")
c.setSubject("Bauanleitung Weihnachtsstern")

M = 40  # margin

# ---------------------------------------------------------------- helpers
def para(text, x, y, w, size=10.5, font="R", color=INK, lead=None, align=0):
    st = ParagraphStyle("p", fontName=font, fontSize=size, leading=lead or size * 1.35,
                        textColor=color, alignment=align)
    p = Paragraph(text, st)
    _, h = p.wrap(w, 1000)
    p.drawOn(c, x, y - h)
    return h

def rrect(x, y, w, h, r, fill=None, stroke=None, lw=1):
    if fill is not None: c.setFillColor(fill)
    if stroke is not None:
        c.setStrokeColor(stroke); c.setLineWidth(lw)
    c.roundRect(x, y, w, h, r, fill=1 if fill is not None else 0, stroke=1 if stroke is not None else 0)

def poly(pts, fill=None, stroke=None, lw=0.6, alpha=None):
    p = c.beginPath(); p.moveTo(*pts[0])
    for q in pts[1:]: p.lineTo(*q)
    p.close()
    c.saveState()
    if alpha is not None: c.setFillAlpha(alpha)
    if fill is not None: c.setFillColor(fill)
    if stroke is not None: c.setStrokeColor(stroke); c.setLineWidth(lw)
    c.drawPath(p, fill=1 if fill is not None else 0, stroke=1 if stroke is not None else 0)
    c.restoreState()

def star_path(cx, cy, R, r, rot=90, n=5):
    pts = []
    for k in range(2 * n):
        a = math.radians(rot + k * 180 / n)
        rr = R if k % 2 == 0 else r
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts

def snowflake(x, y, s, col=white, alpha=0.5, lw=0.8):
    c.saveState(); c.setStrokeColor(col); c.setStrokeAlpha(alpha); c.setLineWidth(lw); c.setLineCap(1)
    for k in range(6):
        a = math.radians(k * 60 + 90)
        ex, ey = x + s * math.cos(a), y + s * math.sin(a)
        c.line(x, y, ex, ey)
        for f in (0.55,):
            mx, my = x + s * f * math.cos(a), y + s * f * math.sin(a)
            for d in (-40, 40):
                b = a + math.radians(d)
                c.line(mx, my, mx + s * .32 * math.cos(b), my + s * .32 * math.sin(b))
    c.restoreState()

def sparkle(x, y, s, col=GOLD, alpha=1):
    pts = []
    for k in range(8):
        a = math.radians(90 + k * 45)
        rr = s if k % 2 == 0 else s * 0.22
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    poly(pts, fill=col, alpha=alpha)

def glow(x, y, r, col, steps=7, amax=0.35):
    c.saveState(); c.setFillColor(col)
    for i in range(steps):
        rr = r * (1 - i / steps)
        c.setFillAlpha(amax / steps * 1.4)
        c.circle(x, y, rr, fill=1, stroke=0)
    c.restoreState()

def bulb(x, y, s=2.2, col=HexColor("#FFE9A8")):
    glow(x, y, s * 4.5, HexColor("#FFC94D"), amax=0.5)
    c.setFillColor(col); c.circle(x, y, s, fill=1, stroke=0)
    c.setFillColor(white); c.circle(x - s * .3, y + s * .3, s * .4, fill=1, stroke=0)

def santa_hat(x, y, s, angle=-28):
    """x,y = center of hat brim; s = brim width"""
    c.saveState(); c.translate(x, y); c.rotate(angle)
    # shadow
    c.setFillColor(black); c.setFillAlpha(0.18)
    p = c.beginPath(); p.moveTo(-s*.42+3, s*.05-3); p.curveTo(-s*.25, s*.9, s*.2, s*1.05, s*.62+3, s*.7-3)
    p.lineTo(s*.42+3, s*.05-3); p.close(); c.drawPath(p, fill=1, stroke=0)
    c.setFillAlpha(1)
    # body
    c.setFillColor(HexColor("#E0142B")); c.setStrokeColor(DRED); c.setLineWidth(1)
    p = c.beginPath(); p.moveTo(-s * .42, s * .05)
    p.curveTo(-s * .25, s * .95, s * .25, s * 1.1, s * .66, s * .72)
    p.curveTo(s * .55, s * .55, s * .45, s * .3, s * .42, s * .05); p.close()
    c.drawPath(p, fill=1, stroke=1)
    # highlight
    c.setFillColor(white); c.setFillAlpha(0.18)
    p = c.beginPath(); p.moveTo(-s * .3, s * .12); p.curveTo(-s * .15, s * .7, s * .1, s * .85, s * .35, s * .82)
    p.curveTo(s*.05, s*.7, -s*.1, s*.45, -s*.12, s*.12); p.close(); c.drawPath(p, fill=1, stroke=0)
    c.setFillAlpha(1)
    # brim
    c.setFillColor(white); c.setStrokeColor(HexColor("#D9D0CB")); c.setLineWidth(.8)
    c.roundRect(-s * .52, -s * .1, s * 1.04, s * .25, s * .12, fill=1, stroke=1)
    # pompom
    c.circle(s * .68, s * .7, s * .13, fill=1, stroke=1)
    c.restoreState()

def logo(x, y, s, hat=True):
    c.saveState()
    c.setFillColor(black); c.setFillAlpha(0.22)
    c.rect(x + 3, y - 3, s, s, fill=1, stroke=0)
    c.restoreState()
    c.drawImage(LOGO, x, y, s, s)
    if hat:
        santa_hat(x + s * 0.93, y + s * 0.95, s * 0.5, angle=-24)

def wood_bar(p, q, w, base=WOODC, edge=WOODD, shadow=True):
    dx, dy = q[0] - p[0], q[1] - p[1]; L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
    nx, ny = -uy * w / 2, ux * w / 2
    pts = [(p[0] + nx, p[1] + ny), (q[0] + nx, q[1] + ny), (q[0] - nx, q[1] - ny), (p[0] - nx, p[1] - ny)]
    if shadow:
        poly([(a + 2, b - 2) for a, b in pts], fill=black, alpha=0.15)
    poly(pts, fill=base, stroke=edge, lw=0.7)
    c.saveState(); c.setStrokeColor(edge); c.setStrokeAlpha(0.35); c.setLineWidth(0.35)
    for f in (-0.22, 0.15):
        c.line(p[0] + nx * f * 2 + ux * 4, p[1] + ny * f * 2 + uy * 4, q[0] + nx * f * 2 - ux * 4, q[1] + ny * f * 2 - uy * 4)
    c.restoreState()

# ---------------------------------------------------------------- isometric engine
C30, S30 = math.cos(math.radians(30)), 0.5
VIEW = (-1, -1, 1)
LIGHT = (-0.35, -0.55, 0.76)

def iso(pt, ox, oy, s):
    x, y, z = pt
    return (ox + (x - y) * C30 * s, oy + (x + y) * S30 * s + z * s)

def vsub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def vadd(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def vmul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def norm(a):
    l = math.sqrt(dot(a, a)); return (a[0] / l, a[1] / l, a[2] / l)

def beam(A, B, u, v, col=WOOD, segs=1, edge=(0.45, 0.3, 0.15)):
    """box from A to B with half-cross-section vectors u, v. returns list of faces"""
    faces = []
    for i in range(segs):
        a = vadd(A, vmul(vsub(B, A), i / segs)); b = vadd(A, vmul(vsub(B, A), (i + 1) / segs))
        corners = {}
        for e, P in ((0, a), (1, b)):
            for su in (-1, 1):
                for sv in (-1, 1):
                    corners[(e, su, sv)] = vadd(vadd(P, vmul(u, su)), vmul(v, sv))
        center = vmul(vadd(a, b), 0.5)
        quads = [
            [corners[(0, -1, -1)], corners[(0, 1, -1)], corners[(0, 1, 1)], corners[(0, -1, 1)]],
            [corners[(1, -1, -1)], corners[(1, 1, -1)], corners[(1, 1, 1)], corners[(1, -1, 1)]],
        ]
        for su in (-1, 1):
            quads.append([corners[(0, su, -1)], corners[(1, su, -1)], corners[(1, su, 1)], corners[(0, su, 1)]])
        for sv in (-1, 1):
            quads.append([corners[(0, -1, sv)], corners[(1, -1, sv)], corners[(1, 1, sv)], corners[(0, 1, sv)]])
        for q in quads:
            n = norm(cross(vsub(q[1], q[0]), vsub(q[3], q[0])))
            fc = vmul(vadd(vadd(q[0], q[1]), vadd(q[2], q[3])), .25)
            if dot(n, vsub(fc, center)) < 0: n = vmul(n, -1)
            if dot(n, VIEW) <= 1e-6: continue
            faces.append((q, n, col, edge))
    return faces

def render(faces, ox, oy, s, lw=0.5):
    def depth(f):
        q = f[0]; cx = sum(p[0] for p in q) / 4; cy = sum(p[1] for p in q) / 4; cz = sum(p[2] for p in q) / 4
        return -cx - cy + cz * 1.0
    for q, n, col, edge in sorted(faces, key=depth):
        sh = 0.62 + 0.42 * max(0, dot(n, norm(LIGHT)))
        fc = Color(min(1, col[0] * sh), min(1, col[1] * sh), min(1, col[2] * sh))
        poly([iso(p, ox, oy, s) for p in q], fill=fc, stroke=fc, lw=0.5)

def perp_xy(d):
    return (-d[1], d[0], 0)

def frame_beams(P, Q, Hh, t, rungs=(0.25, 0.62), col=WOOD, segs=6):
    """A sawhorse frame lying on its side: bottom stile P->Q at z=0, top stile at z=Hh-t, vertical rungs."""
    d = norm(vsub(Q, P)); n = perp_xy(d)
    f = []
    up = (0, 0, t / 2)
    f += beam(vadd(P, up), vadd(Q, up), vmul(n, t / 2), (0, 0, t / 2), col, segs)
    top = (0, 0, Hh - t / 2)
    f += beam(vadd(P, top), vadd(Q, top), vmul(n, t / 2), (0, 0, t / 2), col, segs)
    L = math.dist(P, Q)
    for r in rungs:
        m = vadd(P, vmul(d, L * r))
        f += beam(vadd(m, (0, 0, t)), vadd(m, (0, 0, Hh - t)), vmul(d, t * .4), vmul(n, t * .35), col, 3)
    return f

def star_geom(R):
    r = R * 0.382
    tips = [(R * math.cos(math.radians(90 + 72 * k)), R * math.sin(math.radians(90 + 72 * k)), 0) for k in range(5)]
    inner = [(r * math.cos(math.radians(126 + 72 * k)), r * math.sin(math.radians(126 + 72 * k)), 0) for k in range(5)]
    return tips, inner

def shorten(P, Q, by):
    d = norm(vsub(Q, P)); return vsub(Q, vmul(d, by))


# ---------------------------------------------------------------- 3D render images
import json, os
from PIL import Image as PILImage
IMGDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "r3d", "out")
META = json.load(open(os.path.join(IMGDIR, "meta.json")))
_prep = {}
def prep(name, pad=12):
    if name in _prep: return _prep[name]
    im = PILImage.open(os.path.join(IMGDIR, name + ".png")).convert("RGBA")
    W0, H0 = im.size
    a = im.split()[3].point(lambda v: 255 if v > 10 else 0)
    bb = a.getbbox() or (0, 0, W0, H0)
    bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(W0, bb[2] + pad), min(H0, bb[3] + pad))
    _prep[name] = (im.crop(bb), bb, (W0, H0))
    return _prep[name]

DPI = 200
def _jpeg(img_rgba, dw, dh, bg, key):
    """flatten onto the page background and store as a print-sized JPEG (keeps the PDF small)"""
    tw = max(1, int(dw / 72 * DPI)); th = max(1, int(dh / 72 * DPI))
    flat = PILImage.new("RGB", img_rgba.size, bg); flat.paste(img_rgba, (0, 0), img_rgba)
    if tw < flat.size[0]: flat = flat.resize((tw, th), PILImage.LANCZOS)
    out = os.path.join(IMGDIR, f"{key}_{bg[0]}{bg[1]}{bg[2]}_{tw}.jpg")
    flat.save(out, quality=84, optimize=True, progressive=True)
    return out

def place(name, x, y, w, h, align="c", bg=(255, 255, 255)):
    """contain-fit render/photo into box (x,y = bottom-left). returns mapper of normalized orig coords."""
    img, bb, (W0, H0) = prep(name)
    cw, ch = bb[2] - bb[0], bb[3] - bb[1]
    sc = min(w / cw, h / ch)
    dw, dh = cw * sc, ch * sc
    dx = x + (w - dw) / 2 if align == "c" else (x if align == "l" else x + w - dw)
    dy = y + (h - dh) / 2
    c.drawImage(_jpeg(img, dw, dh, bg, name), dx, dy, dw, dh)
    def m(u, v):
        px, py = u * W0 - bb[0], v * H0 - bb[1]
        return (dx + px * sc, dy + dh - py * sc)
    return m

def place_cover(name, x, y, w, h, r=14):
    im = PILImage.open(os.path.join(IMGDIR, name + ".png")).convert("RGB")
    iw, ih = im.size
    sc = max(w / iw, h / ih)
    dw, dh = iw * sc, ih * sc
    tw = int(dw / 72 * DPI)
    if tw < iw: im = im.resize((tw, int(ih * tw / iw)), PILImage.LANCZOS)
    path = os.path.join(IMGDIR, f"{name}_{tw}.jpg"); im.save(path, quality=84, optimize=True, progressive=True)
    c.saveState()
    p = c.beginPath(); p.roundRect(x, y, w, h, r); c.clipPath(p, stroke=0)
    c.drawImage(path, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
    c.restoreState()

def num_badge(x, y, n, r=10):
    c.setFillColor(black); c.setFillAlpha(.2); c.circle(x + 1, y - 1.5, r, fill=1, stroke=0); c.setFillAlpha(1)
    c.setFillColor(RED); c.circle(x, y, r, fill=1, stroke=0)
    c.setStrokeColor(white); c.setLineWidth(1.6); c.circle(x, y, r, fill=0, stroke=1)
    c.setFillColor(white); c.setFont("B", r * 1.2); c.drawCentredString(x, y - r * 0.42, str(n))

def gold_ring(x, y, r=9):
    c.setStrokeColor(white); c.setLineWidth(4); c.circle(x, y, r, fill=0, stroke=1)
    c.setStrokeColor(GOLD); c.setLineWidth(2.2); c.setDash(3, 2); c.circle(x, y, r, fill=0, stroke=1); c.setDash()

# ---------------------------------------------------------------- page frame
def page_bg():
    c.setFillColor(CREAM); c.rect(0, 0, W, H, fill=1, stroke=0)

def header(title, pg):
    page_bg()
    hh = 78
    c.setFillColor(RED); c.rect(0, H - hh, W, hh, fill=1, stroke=0)
    # scalloped snow edge
    c.setFillColor(white)
    for i in range(0, int(W) + 20, 18):
        c.circle(i, H - hh, 6, fill=1, stroke=0)
    c.setFillColor(RED); c.rect(0, H - hh + 2, W, hh, fill=1, stroke=0)
    random.seed(pg)
    for _ in range(14):
        snowflake(random.uniform(150, W - 20), random.uniform(H - hh + 10, H - 8), random.uniform(3, 7), alpha=0.28)
    logo(M, H - hh + 10, 56, hat=True)
    c.setFillColor(white); c.setFont("B", 22); c.drawString(M + 72, H - 42, title)
    c.setFont("R", 10.5); c.setFillColor(HexColor("#FFD9D9"))
    c.drawString(M + 72, H - 58, "XXL-Weihnachtsstern aus 5 Klappböcken")
    footer(pg)

def footer(pg):
    c.setStrokeColor(HexColor("#E3D3C7")); c.setLineWidth(0.6); c.line(M, 34, W - M, 34)
    c.setFont("R", 8.5); c.setFillColor(GREY)
    c.drawString(M, 22, "Sonderpreis Baumarkt · Bauanleitung XXL-Weihnachtsstern")
    c.drawRightString(W - M, 22, f"Seite {pg}")
    sparkle(W / 2, 25, 5, GOLD)

def step_badge(x, y, n, title):
    c.setFillColor(RED); c.circle(x + 15, y - 13, 15, fill=1, stroke=0)
    c.setStrokeColor(GOLD); c.setLineWidth(1.5); c.circle(x + 15, y - 13, 15, fill=0, stroke=1)
    c.setFillColor(white); c.setFont("B", 16); c.drawCentredString(x + 15, y - 18.5, str(n))
    c.setFillColor(RED); c.setFont("B", 17); c.drawString(x + 40, y - 19, title)

def tip_box(x, y, w, text, title="Tipp", col=PINE, icon="star"):
    h = para(text, x + 34, y - 8 - 14, w - 44, size=9.5) + 30
    rrect(x, y - h, w, h, 8, fill=Color(col.red, col.green, col.blue, 0.08), stroke=col, lw=0.8)
    c.setFillColor(col); c.circle(x + 17, y - 17, 9, fill=1, stroke=0)
    if icon == "star":
        poly(star_path(x + 17, y - 17, 6, 2.5), fill=white)
    else:
        c.setFillColor(white); c.setFont("B", 13); c.drawCentredString(x + 17, y - 21.5, "!")
    c.setFillColor(col); c.setFont("B", 10.5); c.drawString(x + 34, y - 20, title)
    para(text, x + 34, y - 8 - 14, w - 44, size=9.5)
    return h

def caption(x, y, w, text):
    return para(text, x, y, w, size=8.5, font="I", color=GREY)

# ================================================================ PRICE SIGN (A4) – Weihnachtskugel
FIR1, FIR2, FIR3 = HexColor("#1F5E34"), HexColor("#2E7A44"), HexColor("#14472A")

def needle_branch(x0, y0, length, ang, scale=1.0, seed=0, snow=True):
    rnd = random.Random(seed)
    a = math.radians(ang)
    pts = []
    for i in range(41):
        t = i / 40
        bend = math.sin(t * math.pi) * 0.12 * length * (1 if seed % 2 else -1)
        x = x0 + math.cos(a) * length * t - math.sin(a) * bend
        y = y0 + math.sin(a) * length * t + math.cos(a) * bend
        pts.append((x, y, t))
    c.saveState(); c.setLineCap(1)
    c.setStrokeColor(HexColor("#5A3A1E")); c.setLineWidth(2.2 * scale)
    for i in range(40): c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
    for layer, col, lw in ((0, FIR3, 2.0), (1, FIR1, 1.7), (2, FIR2, 1.3)):
        c.setStrokeColor(col); c.setLineWidth(lw * scale)
        for i in range(0, 40):
            x, y, t = pts[i]
            nl = (20 - 11 * t) * scale * (1 - layer * 0.12)
            for side in (-1, 1):
                for k in range(2):
                    da = a + side * math.radians(48 + rnd.uniform(-12, 12)) + math.radians(rnd.uniform(-8, 8))
                    ox, oy = rnd.uniform(-1.5, 1.5), rnd.uniform(-1.5, 1.5)
                    c.line(x + ox, y + oy, x + ox + math.cos(da) * nl, y + oy + math.sin(da) * nl)
    if snow:
        c.setFillColor(white)
        for i in range(0, 40, 2):
            x, y, t = pts[i]
            c.setFillAlpha(rnd.uniform(.5, .9))
            c.circle(x + rnd.uniform(-6, 6) * scale, y + rnd.uniform(0, 6) * scale, rnd.uniform(1.0, 2.6) * scale, fill=1, stroke=0)
    c.restoreState()

def berries(x, y, s=1.0):
    for dx, dy in ((0, 0), (6, 3), (3, -5)):
        c.setFillColor(HexColor("#B0101E")); c.circle(x + dx * s, y + dy * s, 4.2 * s, fill=1, stroke=0)
        c.setFillColor(white); c.setFillAlpha(.6); c.circle(x + dx * s - 1.3 * s, y + dy * s + 1.3 * s, 1.2 * s, fill=1, stroke=0); c.setFillAlpha(1)

def holly(x, y, ang, s=1.0):
    c.saveState(); c.translate(x, y); c.rotate(ang)
    p = c.beginPath(); p.moveTo(0, 0)
    for i in range(1, 6):
        t = i / 5; p.lineTo(28 * s * t, (8 if i % 2 else 4) * s * math.sin(t * math.pi) + 2 * s)
    for i in range(5, -1, -1):
        t = i / 5; p.lineTo(28 * s * t, -(8 if i % 2 else 4) * s * math.sin(t * math.pi) + 2 * s)
    c.setFillColor(HexColor("#1B5A30")); c.setStrokeColor(HexColor("#0E3A1E")); c.setLineWidth(.6)
    c.drawPath(p, fill=1, stroke=1); c.restoreState()

def bokeh(n, seed, ymin, ymax):
    rnd = random.Random(seed)
    c.saveState()
    for _ in range(n):
        col = rnd.choice([GOLD, HexColor("#FFE7A6"), white])
        c.setFillColor(col); c.setFillAlpha(rnd.uniform(.05, .16))
        c.circle(rnd.uniform(0, W), rnd.uniform(ymin, ymax), rnd.uniform(6, 22), fill=1, stroke=0)
    c.restoreState()

def ornament(cx, cy, R, base, light, dark, glossy=True):
    c.saveState()
    c.setFillColor(black); c.setFillAlpha(.35); c.circle(cx + R * .05, cy - R * .07, R, fill=1, stroke=0)
    c.restoreState()
    c.saveState()
    p = c.beginPath(); p.circle(cx, cy, R); c.clipPath(p, stroke=0)
    c.radialGradient(cx - R * .35, cy + R * .38, R * 1.55, (light, base, dark), (0, .45, 1), extend=True)
    if glossy:
        c.setFillColor(white); c.setFillAlpha(.13 if R > 100 else .22)
        c.ellipse(cx - R * .9, cy + R * .05, cx - R * .45, cy + R * .7, fill=1, stroke=0)
        c.setFillAlpha(.45); c.circle(cx - R * .66, cy + R * .48, R * .045, fill=1, stroke=0)
        c.setFillAlpha(.12); c.ellipse(cx + R * .2, cy - R * .95, cx + R * .9, cy - R * .55, fill=1, stroke=0)
    c.restoreState()
    # cap
    cw, ch = R * .34, R * .17
    c.setFillColor(HexColor("#8A6A1E")); c.roundRect(cx - cw / 2, cy + R - ch * .35, cw, ch, 2, fill=1, stroke=0)
    c.saveState(); p = c.beginPath(); p.roundRect(cx - cw / 2, cy + R - ch * .35, cw, ch, 2); c.clipPath(p, stroke=0)
    c.linearGradient(cx - cw / 2, 0, cx + cw / 2, 0, (HexColor("#9C7A22"), HexColor("#F6D77A"), HexColor("#B8901F")), extend=False)
    c.setStrokeColor(HexColor("#7A5C14")); c.setLineWidth(.6)
    for i in range(1, 7):
        xx = cx - cw / 2 + i * cw / 7; c.line(xx, cy + R - ch * .35, xx, cy + R + ch * .65)
    c.restoreState()
    c.setStrokeColor(GOLD); c.setLineWidth(max(1.2, R * .02))
    c.circle(cx, cy + R + ch * .65 + R * .05, R * .05, fill=0, stroke=1)
    return cy + R + ch * .65 + R * .1

def bow(x, y, s=1.0):
    c.saveState(); c.translate(x, y)
    for side in (-1, 1):
        c.saveState(); c.scale(side, 1)
        p = c.beginPath(); p.moveTo(0, 0)
        p.curveTo(20 * s, 22 * s, 46 * s, 18 * s, 44 * s, 0); p.curveTo(46 * s, -16 * s, 20 * s, -18 * s, 0, 0)
        c.setFillColor(HexColor("#C8961E")); c.setStrokeColor(HexColor("#8A6410")); c.setLineWidth(.8); c.drawPath(p, fill=1, stroke=1)
        p = c.beginPath(); p.moveTo(0, 0); p.curveTo(16 * s, 12 * s, 34 * s, 10 * s, 36 * s, 1 * s); p.lineTo(0, 0)
        c.setFillColor(HexColor("#F2CC63")); c.drawPath(p, fill=1, stroke=0)
        p = c.beginPath(); p.moveTo(2 * s, -2 * s); p.lineTo(26 * s, -44 * s); p.lineTo(18 * s, -40 * s); p.lineTo(12 * s, -48 * s); p.lineTo(-2 * s, -4 * s); p.close()
        c.setFillColor(HexColor("#B8861A")); c.drawPath(p, fill=1, stroke=0)
        c.restoreState()
    c.setFillColor(HexColor("#E0B040")); c.setStrokeColor(HexColor("#8A6410")); c.roundRect(-7 * s, -7 * s, 14 * s, 14 * s, 4 * s, fill=1, stroke=1)
    c.restoreState()

def strike_text(txt, strike, x, y, font, size, col):
    c.setFillColor(col); c.setFont(font, size)
    w = c.stringWidth(txt, font, size); x0 = x - w / 2
    c.drawString(x0, y, txt)
    i = txt.index(strike); sx = x0 + c.stringWidth(txt[:i], font, size); sw = c.stringWidth(strike, font, size)
    c.setStrokeColor(GOLD); c.setLineWidth(1.6); c.line(sx - 1, y + size * .33, sx + sw + 1, y + size * .33)

def sign():
    c.linearGradient(0, H, 0, 0, (HexColor("#0E3F29"), HexColor("#082A1A"), HexColor("#05170E")), (0, .55, 1), extend=True)
    bokeh(60, 21, 0, H)
    random.seed(12)
    for _ in range(55):
        snowflake(random.uniform(0, W), random.uniform(0, H), random.uniform(2.5, 7), alpha=random.uniform(.12, .35))
    for _ in range(80):
        c.setFillColor(white); c.setFillAlpha(random.uniform(.3, .8))
        c.circle(random.uniform(0, W), random.uniform(0, H), random.uniform(.5, 1.6), fill=1, stroke=0)
    c.setFillAlpha(1)

    BX, BY, BR = W / 2, 432, 212
    top_hook = BY + BR + 52
    # strings of side ornaments + main ribbon
    c.setStrokeColor(GOLD); c.setLineWidth(1.2)
    c.line(78, H - 70, 78, 612); c.line(520, H - 60, 520, 586)
    c.setStrokeColor(HexColor("#C8961E")); c.setLineWidth(5); c.line(BX, H - 92, BX, top_hook - 12)
    c.setStrokeColor(HexColor("#F2CC63")); c.setLineWidth(1.4); c.line(BX - 1.2, H - 92, BX - 1.2, top_hook - 12)

    # garland on top
    for i, (x, ang, L, sc) in enumerate([(-30, -12, 230, 1.15), (120, 8, 210, 1.05), (250, -4, 200, 1.1), (380, 10, 210, 1.05),
                                          (W + 30, 192, 230, 1.15), (470, 185, 200, 1.0), (180, -18, 170, .95), (330, 196, 180, .95)]):
        needle_branch(x, H - 30 - (i % 3) * 12, L, ang, sc, seed=i + 3)
    for x, y, a in ((150, H - 52, -30), (420, H - 46, 210), (300, H - 62, -80)):
        holly(x, y, a); holly(x, y, a + 60); berries(x, y)
    bow(BX, H - 88, 1.1)

    # side ornaments
    ornament(78, 572, 36, HexColor("#D9A62A"), HexColor("#FFF0B0"), HexColor("#7A5A10"))
    ornament(520, 548, 34, HexColor("#C9CED6"), white, HexColor("#5E6670"))

    # main bauble
    ornament(BX, BY, BR, HexColor("#C8102A"), HexColor("#FF5A6A"), HexColor("#5C0510"))
    # gold decorative bands
    for yy, amp in ((BY + 88, 6), (BY - 108, 6)):
        half = math.sqrt(BR * BR - (yy - BY) ** 2) - 6
        c.setStrokeColor(GOLD); c.setLineWidth(2)
        p = c.beginPath(); p.moveTo(BX - half, yy)
        for i in range(1, 61):
            x = BX - half + 2 * half * i / 60; p.lineTo(x, yy + amp * math.sin(i / 60 * math.pi * 10))
        c.drawPath(p, fill=0, stroke=1)
        for i in range(0, 11):
            x = BX - half + 2 * half * (i + .25) / 10.5
            c.setFillColor(HexColor("#FFE7A6")); c.circle(x, yy + amp * math.sin((i + .25) / 10.5 * math.pi * 10) , 1.8, fill=1, stroke=0)

    # content inside bauble
    glow(BX, BY + 156, 26, GOLD, amax=.5)
    poly(star_path(BX, BY + 156, 17, 7), fill=GOLD)
    c.setFillColor(white); c.setFont("B", 27); c.drawCentredString(BX, BY + 113, "XXL-WEIHNACHTSSTERN")
    c.setFillColor(HexColor("#FFD9D9")); c.setFont("B", 12.5); c.drawCentredString(BX, BY + 98 - 3, "")
    c.setFont("R", 12.5); c.drawCentredString(BX, BY + 66, "Bausatz zum Selberbauen · ca. 2 × 2 m")
    c.setFillColor(GOLD); c.setFont("B", 13); c.drawCentredString(BX, BY + 38, "KOMPLETT-BAUSATZ NUR")
    # price
    c.setFillColor(black); c.setFillAlpha(.25); c.setFont("B", 104); c.drawRightString(BX + 34 + 3, BY - 50 - 3, "58,"); c.setFillAlpha(1)
    c.setFillColor(white); c.setFont("B", 104); c.drawRightString(BX + 34, BY - 50, "58,")
    c.setFont("B", 46); c.drawString(BX + 38, BY + 4, "00")
    c.setFont("B", 42); c.drawString(BX + 40, BY - 46, "€")
    strike_text("statt 61,87 € einzeln", "61,87 €", BX, BY - 82, "R", 14, HexColor("#FFE3E3"))
    # savings pill
    rrect(BX - 72, BY - 146, 144, 26, 13, fill=GOLD)
    c.setFillColor(DRED); c.setFont("B", 13.5); c.drawCentredString(BX, BY - 137.5, "Du sparst 3,87 €")
    c.setFillColor(white); c.setFont("B", 10.5); c.drawCentredString(BX, BY - 162, "Im Set:")
    c.setFont("R", 10.5)
    c.drawCentredString(BX, BY - 176, "5 Klappböcke · 10 Winkelverbinder")
    c.drawCentredString(BX, BY - 190, "60 Schrauben · Lichterkette 1200 LEDs")

    # logo on top (over strings/garland)
    lx, ly, ls = M - 8, H - 182, 86
    c.saveState(); c.setFillColor(black); c.setFillAlpha(.3); c.roundRect(lx - 7 + 3, ly - 7 - 3, ls + 14, ls + 14, 6, fill=1, stroke=0); c.restoreState()
    c.setFillColor(white); c.roundRect(lx - 7, ly - 7, ls + 14, ls + 14, 6, fill=1, stroke=0)
    c.drawImage(LOGO, lx, ly, ls, ls)

    # optional paint panel
    py, ph = 92, 104
    rrect(M, py, W - 2 * M, ph, 16, fill=HexColor("#FFF7EA"), stroke=GOLD, lw=1.5)
    place("p_spraygroup", M + 14, py + 8, 110, ph - 16, bg=(255, 247, 234))
    tx = M + 140
    c.setFillColor(RED); c.setFont("B", 16); c.drawString(tx, py + ph - 30, "Optional: Farbe nach Wunsch")
    para("<b>Color Spray Acryl, glänzend</b> – für den Stern werden <b>2 Dosen</b> benötigt. "
         "Preis je nach Farbe, nicht im Bausatzpreis enthalten.", tx, py + ph - 40, W - M - tx - 16, size=11)
    for x, y, a in ((W - M - 6, py + ph + 4, 160), (M + 6, py + ph + 4, 20)):
        needle_branch(x, y, 90, a, .7, seed=int(x), snow=True)
    berries(W - M - 40, py + ph + 10, .9); berries(M + 36, py + ph + 10, .9)
    c.setFillColor(white); c.setFont("B", 14)
    c.drawCentredString(W / 2, 52, "Frag uns gern im Markt – wir beraten dich!")
    sparkle(M + 40, 56, 6, GOLD); sparkle(W - M - 40, 56, 6, GOLD)

sign(); c.showPage(); c.save(); print("ok")
