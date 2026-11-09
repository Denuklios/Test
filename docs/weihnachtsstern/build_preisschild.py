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

# ================================================================ PRICE SIGN (A4)
def check(x, y, col=PINE):
    c.setFillColor(col); c.circle(x, y, 6, fill=1, stroke=0)
    c.setStrokeColor(white); c.setLineWidth(1.5); c.line(x - 3, y, x - .5, y - 2.5); c.line(x - .5, y - 2.5, x + 3.2, y + 2.5)

def sign():
    c.linearGradient(0, H, 0, 0, (HexColor("#D3132A"), HexColor("#8E0915")), extend=True)
    random.seed(11)
    for _ in range(70):
        snowflake(random.uniform(0, W), random.uniform(0, H), random.uniform(2.5, 8), alpha=random.uniform(.12, .4))
    logo(M - 6, H - 140, 100, hat=True)
    c.saveState(); c.translate(W - M - 190, H - 82); c.rotate(4)
    rrect(0, 0, 190, 32, 16, fill=GOLD)
    c.setFillColor(DRED); c.setFont("B", 13); c.drawCentredString(95, 11, "WEIHNACHTS-ANGEBOT")
    c.restoreState()
    sparkle(W - M - 4, H - 40, 9, white, .9); sparkle(W - M - 196, H - 110, 6, GOLD)

    # title tag
    c.saveState(); c.translate(W / 2 + 40, H - 190); c.rotate(-3)
    tw, th = 400, 86
    poly([(-tw / 2 + 4, -th / 2 - 6), (tw / 2 + 4, -th / 2 - 6), (tw / 2 + 4, th / 2 - 6), (-tw / 2 + 4, th / 2 - 6)], fill=DRED, alpha=.9)
    pts = [(-tw / 2, th / 2), (tw / 2, th / 2)]
    for i in range(7): pts.append((tw / 2 + (7 if i % 2 else 0), th / 2 - i * th / 6))
    pts.append((-tw / 2, -th / 2))
    for i in range(7): pts.append((-tw / 2 - (7 if i % 2 else 0), -th / 2 + i * th / 6))
    poly(pts, fill=white)
    c.setFillColor(RED); c.setFont("B", 36); c.drawCentredString(0, 4, "XXL-WEIHNACHTSSTERN")
    c.setFillColor(INK); c.setFont("B", 18); c.drawCentredString(0, -26, "Bausatz zum Selberbauen · ca. 2 × 2 m")
    c.restoreState()

    # hero image
    px, py, pw, ph = M, H - 480, W - 2 * M, 245
    c.saveState(); c.setFillColor(black); c.setFillAlpha(.25); c.roundRect(px + 3, py - 4, pw, ph, 18, fill=1, stroke=0); c.restoreState()
    place_cover("night", px, py, pw, ph, r=18)
    c.setStrokeColor(GOLD); c.setLineWidth(1.5); c.roundRect(px, py, pw, ph, 18, fill=0, stroke=1)

    # contents box
    y = py - 22
    bh = 182
    rrect(M, y - bh, W - 2 * M, bh, 14, fill=white)
    c.setFillColor(RED); c.setFont("B", 16); c.drawString(M + 18, y - 28, "Im Bausatz enthalten")
    sparkle(M + 190, y - 22, 5)
    items = [("5 ×", "Klappbock aus Holz", "ca. 80 cm hoch", "p_klappbock"),
             ("10 ×", "Winkelverbinder", "40×40×40 mm, 2 mm", "p_winkel"),
             ("60 ×", "Schrauben", "4,0 × 20 mm, Torx", "p_schraube"),
             ("1 ×", "Clusterlichterkette", "1200 LEDs · 23,98 m", "p_lichterkette")]
    cw = (W - 2 * M - 36 - 30) / 4
    for i, (q, n, note, img) in enumerate(items):
        x = M + 18 + i * (cw + 10)
        place(img, x + 6, y - 128, cw - 12, 76)
        rrect(x, y - 52, c.stringWidth(q, "B", 11) + 14, 17, 8.5, fill=RED)
        c.setFillColor(white); c.setFont("B", 11); c.drawString(x + 7, y - 47.5, q)
        c.setFillColor(INK); c.setFont("B", 11); c.drawCentredString(x + cw / 2, y - 144, n)
        c.setFillColor(GREY); c.setFont("R", 9); c.drawCentredString(x + cw / 2, y - 156, note)
    check(M + 24, y - bh + 14)
    c.setFillColor(INK); c.setFont("B", 10.5); c.drawString(M + 36, y - bh + 10, "Bauanleitung mit Schritt-für-Schritt-Bildern gratis dazu")
    y -= bh + 14

    # optional paint box
    oh = 96
    rrect(M, y - oh, W - 2 * M, oh, 14, fill=HexColor("#FFF4D6"), stroke=GOLD, lw=1.2)
    place("p_spraygroup", M + 12, y - oh + 8, 110, oh - 16, bg=(255, 244, 214))
    tx = M + 136
    c.setFillColor(DRED); c.setFont("B", 15); c.drawString(tx, y - 28, "Optional: Farbe nach Wunsch")
    para("<b>Color Spray Acryl, glänzend</b> – für den Stern werden <b>2 Dosen</b> benötigt.<br/>"
         "Preis je nach Farbe, nicht im Bausatzpreis enthalten.", tx, y - 38, W - M - tx - 14, size=11)
    # price burst overlapping image bottom-right
    bx, by = W - M - 95, py + 62
    poly(star_path(bx + 3, by - 4, 112, 96, rot=90, n=20), fill=black, alpha=.28)
    poly(star_path(bx, by, 112, 96, rot=90, n=20), fill=GOLD)
    c.setFillColor(white); c.circle(bx, by, 88, fill=1, stroke=0)
    c.setFillColor(INK); c.setFont("B", 13); c.drawCentredString(bx, by + 46, "Komplett-Bausatz")
    c.setFillColor(RED); c.setFont("B", 54); c.drawCentredString(bx - 8, by - 2, "58,")
    c.setFont("B", 26); c.drawString(bx + 30, by + 18, "00")
    c.setFont("B", 26); c.drawString(bx + 30, by - 4, "€")
    c.setFillColor(GREY); c.setFont("R", 11.5)
    t = "statt 61,87 € einzeln"
    c.drawCentredString(bx, by - 28, t)
    tw_ = c.stringWidth("61,87 €", "R", 11.5); tx0 = bx - c.stringWidth(t, "R", 11.5) / 2 + c.stringWidth("statt ", "R", 11.5)
    c.setStrokeColor(RED); c.setLineWidth(1.4); c.line(tx0 - 1, by - 24, tx0 + tw_ + 1, by - 24)
    rrect(bx - 58, by - 62, 116, 22, 11, fill=RED)
    c.setFillColor(white); c.setFont("B", 12); c.drawCentredString(bx, by - 55, "Du sparst 3,87 €")

    c.setFillColor(white); c.setFont("B", 13)
    c.drawCentredString(W / 2, 30, "Frag uns gern im Markt – wir beraten dich!")
    sparkle(M + 40, 34, 6, GOLD); sparkle(W - M - 40, 34, 6, GOLD)

sign(); c.showPage(); c.save(); print("ok")
