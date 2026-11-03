import math, random
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import Color, HexColor, white, black
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

import sys
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
c.setTitle("XXL-Weihnachtsstern aus 5 Klappböcken – Bauanleitung")
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
def prep(name, pad=12, maxw=1400):
    if name in _prep: return _prep[name]
    im = PILImage.open(os.path.join(IMGDIR, name + ".png")).convert("RGBA")
    W0, H0 = im.size
    a = im.split()[3].point(lambda v: 255 if v > 10 else 0)
    bb = a.getbbox() or (0, 0, W0, H0)
    bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(W0, bb[2] + pad), min(H0, bb[3] + pad))
    cr = im.crop(bb)
    sc = min(1, maxw / cr.size[0])
    if sc < 1: cr = cr.resize((int(cr.size[0] * sc), int(cr.size[1] * sc)), PILImage.LANCZOS)
    out = os.path.join(IMGDIR, name + "_c.png"); cr.save(out, optimize=True)
    _prep[name] = (out, bb, (W0, H0))
    return _prep[name]

def place(name, x, y, w, h, align="c"):
    """contain-fit transparent render into box (x,y = bottom-left). returns mapper of normalized orig coords."""
    path, bb, (W0, H0) = prep(name)
    cw, ch = bb[2] - bb[0], bb[3] - bb[1]
    sc = min(w / cw, h / ch)
    dw, dh = cw * sc, ch * sc
    dx = x + (w - dw) / 2 if align == "c" else (x if align == "l" else x + w - dw)
    dy = y + (h - dh) / 2
    c.drawImage(path, dx, dy, dw, dh, mask="auto")
    def m(u, v):
        px, py = u * W0 - bb[0], v * H0 - bb[1]
        return (dx + px * sc, dy + dh - py * sc)
    return m

def place_cover(name, x, y, w, h, r=14, quality=88):
    path = os.path.join(IMGDIR, name + ".jpg")
    if not os.path.exists(path):
        PILImage.open(os.path.join(IMGDIR, name + ".png")).convert("RGB").save(path, quality=quality)
    iw, ih = PILImage.open(path).size
    sc = max(w / iw, h / ih)
    dw, dh = iw * sc, ih * sc
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

# ================================================================ PAGE 1 — Cover
def cover():
    c.linearGradient(0, H, 0, 0, (HexColor("#D3132A"), HexColor("#8E0915")), extend=True)
    random.seed(3)
    for _ in range(60):
        snowflake(random.uniform(0, W), random.uniform(260, H), random.uniform(2.5, 8), alpha=random.uniform(.15, .45))
    for _ in range(40):
        c.setFillColor(white); c.setFillAlpha(random.uniform(.2, .6))
        c.circle(random.uniform(0, W), random.uniform(250, H), random.uniform(.6, 1.8), fill=1, stroke=0)
    c.setFillAlpha(1)

    logo(M, H - 160, 118, hat=True)

    # tag "Weihnachts-Bauanleitung"
    c.saveState(); c.translate(W - M - 200, H - 95); c.rotate(4)
    rrect(0, 0, 200, 34, 17, fill=GOLD)
    c.setFillColor(DRED); c.setFont("B", 13); c.drawCentredString(100, 12, "WEIHNACHTS-BAUANLEITUNG")
    c.restoreState()
    sparkle(W - M - 10, H - 50, 9, white, .9); sparkle(W - M - 200, H - 120, 6, GOLD, 1)

    # Title in "price tag" style like the logo
    c.saveState(); c.translate(W / 2, H - 255); c.rotate(-4)
    tw, th = 470, 112
    poly([(-tw / 2 + 4, -th / 2 - 6), (tw / 2 + 4, -th / 2 - 6), (tw / 2 + 4, th / 2 - 6), (-tw / 2 + 4, th / 2 - 6)], fill=DRED, alpha=.9)
    # zig-zag edges like a price label
    pts = []
    zz = 6
    pts.append((-tw / 2, th / 2)); pts.append((tw / 2, th / 2))
    for i in range(zz + 1):
        pts.append((tw / 2 + (8 if i % 2 else 0), th / 2 - i * th / zz))
    pts.append((-tw / 2, -th / 2))
    for i in range(zz + 1):
        pts.append((-tw / 2 - (8 if i % 2 else 0), -th / 2 + i * th / zz))
    poly(pts, fill=white)
    c.setFillColor(RED); c.setFont("B", 43); c.drawCentredString(0, 8, "XXL-WEIHNACHTSSTERN")
    c.setFont("B", 25); c.setFillColor(INK); c.drawCentredString(0, -32, "aus 5 Klappböcken – selbst gebaut")
    c.restoreState()

    # night scene panel (3D render)
    px, py, pw, ph = M, 205, W - 2 * M, 330
    c.saveState(); c.setFillColor(black); c.setFillAlpha(.25); c.roundRect(px + 3, py - 4, pw, ph, 18, fill=1, stroke=0); c.restoreState()
    place_cover("night", px, py, pw, ph, r=18)
    c.setStrokeColor(GOLD); c.setLineWidth(1.5); c.roundRect(px, py, pw, ph, 18, fill=0, stroke=1)
    bx_, by_ = px + pw - 62, py + ph - 52
    poly(star_path(bx_ + 2, by_ - 3, 62, 50, rot=90, n=16), fill=black, alpha=.25)
    poly(star_path(bx_, by_, 62, 50, rot=90, n=16), fill=GOLD)
    c.setFillColor(DRED); c.setFont("B", 12.5); c.drawCentredString(bx_, by_ + 10, "BAUSATZ")
    c.setFont("B", 10); c.drawCentredString(bx_, by_ - 3, "komplett zum")
    c.setFont("B", 15); c.drawCentredString(bx_, by_ - 19, "FESTPREIS")

    # info chips
    chips = [("Schwierigkeit", "Einfach"), ("Zeitaufwand", "ca. 1 Std.*"), ("Größe", "ca. 2 × 2 m**"), ("Helfer", "2 Personen")]
    cw = (W - 2 * M - 3 * 10) / 4
    for i, (k, v) in enumerate(chips):
        x = M + i * (cw + 10)
        rrect(x, 110, cw, 62, 12, fill=white)
        c.setFillColor(GREY); c.setFont("R", 9.5); c.drawCentredString(x + cw / 2, 150, k.upper())
        c.setFillColor(RED); c.setFont("B", 17); c.drawCentredString(x + cw / 2, 125, v)
    c.setFillColor(HexColor("#FFD9D9")); c.setFont("R", 8.5)
    c.drawString(M, 92, "* plus Trockenzeit der Farbe   ** bei Klappböcken mit ca. 80 cm Beinlänge")
    c.setFillColor(white); c.setFont("B", 14)
    c.drawCentredString(W / 2, 55, "Schritt für Schritt zum leuchtenden Hingucker für Garten, Hof und Hauswand")
    sparkle(M + 6, 60, 6, GOLD); sparkle(W - M - 6, 60, 6, GOLD)


def big_star_front(cx, cy, R, painted=None, lights=True, depth=True):
    """front view of standing star: 10 wooden bars with lights."""
    tips, inner = star_geom(R)
    t = R * 0.075
    col = painted or WOODC
    edge = WOODD if painted is None else HexColor("#C9BFB5")
    if depth:  # back frame peeks out slightly
        for k in range(5):
            T = (cx + tips[k][0] + 5, cy + tips[k][1] + 4)
            for I in (inner[(k - 1) % 5], inner[k]):
                wood_bar(T, (cx + I[0] + 5, cy + I[1] + 4), t, base=Color(col.red * .7, col.green * .7, col.blue * .7), edge=edge, shadow=False)
    for k in range(5):
        T = (cx + tips[k][0], cy + tips[k][1])
        for I in (inner[(k - 1) % 5], inner[k]):
            wood_bar(T, (cx + I[0], cy + I[1]), t, base=col, edge=edge, shadow=False)
        # hinge block at tip
        a = math.atan2(tips[k][1], tips[k][0])
        bx, by = T[0] - math.cos(a) * t * .6, T[1] - math.sin(a) * t * .6
        wood_bar((bx - math.sin(a) * t * .9, by + math.cos(a) * t * .9), (bx + math.sin(a) * t * .9, by - math.cos(a) * t * .9), t * 1.1, base=col, edge=edge, shadow=False)
    if lights:
        outline = []
        for k in range(5):
            outline += [tips[k], inner[k]]
        for i in range(10):
            a, b = outline[i], outline[(i + 1) % 10]
            n = 7
            for j in range(n):
                f = j / n
                x = cx + a[0] + (b[0] - a[0]) * f; y = cy + a[1] + (b[1] - a[1]) * f
                bulb(x, y, R * 0.017)
        # cable
        c.saveState(); c.setStrokeColor(HexColor("#1C3A25")); c.setLineWidth(.6)
        pts = [(cx + p[0], cy + p[1]) for p in outline] + [(cx + outline[0][0], cy + outline[0][1])]
        for i in range(10): c.line(*pts[i], *pts[i + 1])
        c.restoreState()

# ================================================================ PAGE 2 — Material
def icon_sawhorse(x, y, s):
    """iso standing sawhorse, (x,y) = ground anchor"""
    Lg, Wd, t = 1.0, 0.7, 0.07
    phi = math.radians(18)
    f = []
    top = (0, 0, Lg * math.cos(phi))
    for sgn in (-1, 1):
        foot_x = sgn * Lg * math.sin(phi)
        for yy in (0, Wd):
            f += beam((foot_x, yy, 0), (0, yy, top[2]), (0, t / 2, 0), (t / 2 * math.cos(phi), 0, t / 2 * math.sin(phi) * sgn * -1), WOOD, 4)
        for hh in (0.3, 0.62):
            xx = foot_x * (1 - hh); zz = top[2] * hh
            f += beam((xx, t, zz), (xx, Wd - t, zz), (t * .35, 0, 0), (0, 0, t * .35), WOOD, 3)
    f += beam((0, -t, top[2] + t * .5), (0, Wd + t, top[2] + t * .5), (t * .9, 0, 0), (0, 0, t * .5), (0.78, 0.58, 0.36), 3)
    render(f, x, y, s, lw=.4)

def icon_bracket(x, y, s):
    a = s
    pts = [(x, y), (x + a, y), (x + a, y + a * .32), (x + a * .32, y + a * .32), (x + a * .32, y + a), (x, y + a)]
    poly([(p[0] + 2, p[1] - 2) for p in pts], fill=black, alpha=.15)
    poly(pts, fill=STEEL, stroke=HexColor("#5E6670"), lw=.8)
    c.setFillColor(white)
    for hx, hy in ((.16, .5), (.16, .8), (.55, .16), (.82, .16)):
        c.setFillColor(HexColor("#3F454C")); c.circle(x + a * hx, y + a * hy, a * .055, fill=1, stroke=0)

def icon_screw(x, y, s):
    c.setFillColor(HexColor("#B9BEC4")); c.setStrokeColor(HexColor("#5E6670")); c.setLineWidth(.7)
    c.ellipse(x - s * .28, y + s * .9, x + s * .28, y + s * 1.02, fill=1, stroke=1)
    poly([(x - s * .08, y + s * .9), (x + s * .08, y + s * .9), (x + s * .08, y + s * .15), (x, y), (x - s * .08, y + s * .15)], fill=HexColor("#C5CAD0"), stroke=HexColor("#5E6670"))
    c.setStrokeColor(HexColor("#5E6670"))
    for i in range(7):
        yy = y + s * .2 + i * s * .1
        c.line(x - s * .1, yy, x + s * .1, yy + s * .05)
    c.setLineWidth(1.2); c.line(x - s * .12, y + s * .96, x + s * .12, y + s * .96)

def icon_lights(x, y, w):
    c.saveState(); c.setStrokeColor(HexColor("#1C3A25")); c.setLineWidth(1)
    p = c.beginPath(); p.moveTo(x, y + 18)
    for i in range(4):
        p.curveTo(x + w / 4 * i + w / 8, y - 2, x + w / 4 * i + w / 8, y - 2, x + w / 4 * (i + 1), y + 18)
    c.drawPath(p, stroke=1, fill=0); c.restoreState()
    for i in range(4):
        for f in (.3, .7):
            xx = x + w / 4 * (i + f); yy = y + 18 - 20 * math.sin(math.pi * f) * .75
            bulb(xx, yy - 3, 2.6)

def icon_spray(x, y, s, col=GOLD):
    rrect(x, y, s * .5, s * .8, 4, fill=col, stroke=DGOLD, lw=.8)
    c.setFillColor(white); c.setFillAlpha(.35); c.rect(x + s * .07, y + s * .08, s * .08, s * .64, fill=1, stroke=0); c.setFillAlpha(1)
    rrect(x + s * .08, y + s * .8, s * .34, s * .1, 2, fill=HexColor("#D9D2CC"), stroke=GREY, lw=.6)
    rrect(x + s * .15, y + s * .9, s * .2, s * .12, 2, fill=white, stroke=GREY, lw=.6)
    c.setFillColor(col)
    random.seed(4)
    for _ in range(18):
        a = random.uniform(-0.35, 0.35); d = random.uniform(s * .15, s * .55)
        c.setFillAlpha(random.uniform(.3, .8))
        c.circle(x + s * .38 + d * math.cos(a), y + s * .96 + d * math.sin(a), random.uniform(.6, 1.6), fill=1, stroke=0)
    c.setFillAlpha(1)

def icon_ties(x, y, s):
    c.saveState(); c.setLineWidth(2.2); c.setLineCap(1)
    for i, col in enumerate((INK, INK, RED)):
        c.setStrokeColor(col)
        c.line(x + i * 7, y, x + i * 7 + s * .25, y + s)
        c.setFillColor(col); c.rect(x + i * 7 - 2.5, y - 4, 5, 6, fill=1, stroke=0)
    c.restoreState()

def icon_drill(x, y, s):
    # handle
    poly([(x + s * .3, y), (x + s * .52, y), (x + s * .5, y + s * .45), (x + s * .3, y + s * .45)], fill=HexColor("#3A3A3A"))
    rrect(x + s * .2, y - s * .06, s * .42, s * .14, 3, fill=RED)
    # body
    rrect(x + s * .12, y + s * .42, s * .62, s * .26, 8, fill=RED, stroke=DRED, lw=.8)
    rrect(x + s * .74, y + s * .48, s * .1, s * .14, 2, fill=HexColor("#3A3A3A"))
    c.setFillColor(STEEL); c.rect(x + s * .84, y + s * .53, s * .2, s * .04, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("B", s * .1); c.drawString(x + s * .2, y + s * .52, "18V")

def icon_bits(x, y, s):
    for i in range(5):
        xx = x + i * s * .2
        rrect(xx, y, s * .14, s * .55, 2, fill=STEEL, stroke=HexColor("#5E6670"), lw=.6)
        poly([(xx, y + s * .55), (xx + s * .14, y + s * .55), (xx + s * .07, y + s * .72)], fill=HexColor("#C5CAD0"), stroke=HexColor("#5E6670"), lw=.6)
    rrect(x - 4, y - 8, s * 1.0, 10, 3, fill=HexColor("#3A3A3A"))

def icon_ruler(x, y, s):
    c.saveState(); c.translate(x, y); c.rotate(28)
    for i in range(3):
        c.saveState(); c.translate(0, i * 9)
        rrect(0, 0, s, 8, 1.5, fill=HexColor("#F2C230"), stroke=HexColor("#A07E10"), lw=.6)
        c.setStrokeColor(INK); c.setLineWidth(.4)
        for j in range(1, 14):
            c.line(j * s / 14, 8, j * s / 14, 8 - (4 if j % 5 == 0 else 2))
        c.restoreState()
    c.restoreState()

def icon_gloves(x, y, s):
    poly([(x, y), (x + s * .5, y), (x + s * .55, y + s * .55), (x + s * .62, y + s * .8), (x + s * .5, y + s * .82),
          (x + s * .45, y + s * .62), (x + s * .4, y + s * .95), (x + s * .3, y + s * .95), (x + s * .27, y + s * .65),
          (x + s * .18, y + s * .9), (x + s * .08, y + s * .88), (x + s * .1, y + s * .55), (x - s * .1, y + s * .5), (x - s * .05, y + s * .4)],
         fill=HexColor("#E7A33A"), stroke=HexColor("#9C6620"), lw=.7)
    rrect(x - 2, y - 6, s * .5 + 4, 9, 2, fill=PINE)

def card(x, y, w, h, qty, name, note, draw):
    c.saveState(); c.setFillColor(black); c.setFillAlpha(.06); c.roundRect(x + 2, y - h - 2, w, h, 10, fill=1, stroke=0); c.restoreState()
    rrect(x, y - h, w, h, 10, fill=white, stroke=HexColor("#EAD9CC"), lw=.7)
    draw(x, y - h, w, h)
    if qty:
        tw = c.stringWidth(qty, "B", 11) + 14
        rrect(x + 8, y - 24, tw, 17, 8.5, fill=RED)
        c.setFillColor(white); c.setFont("B", 11); c.drawString(x + 15, y - 19.5, qty)
    c.setFillColor(INK); c.setFont("B", 11.5); c.drawCentredString(x + w / 2, y - h + 24, name)
    c.setFillColor(GREY); c.setFont("R", 8.8); c.drawCentredString(x + w / 2, y - h + 11, note)

def page_material():
    header("Das brauchst du", 2)
    y = H - 108
    c.setFillColor(RED); c.setFont("B", 15); c.drawString(M, y, "Im Bausatz enthalten")
    sparkle(M + 160, y + 5, 5)
    rrect(W - M - 150, y - 4, 150, 20, 10, fill=GOLD)
    c.setFillColor(DRED); c.setFont("B", 10.5); c.drawCentredString(W - M - 75, y + 2, "Komplett zum Festpreis")
    y -= 10
    g = 10
    cw, ch = (W - 2 * M - 3 * g) / 4, 128
    P_ = lambda n: (lambda x, yy, w, h: place(n, x + 10, yy + 38, w - 20, h - 62))
    mats = [
        ("5 ×", "Klappbock aus Holz", "ca. 80 cm hoch", P_("p_klappbock")),
        ("10 ×", "Winkel 50×50×15 mm", "verzinkt, je 4 Löcher", P_("p_winkel")),
        ("40 ×", "Schrauben 4,0×20 mm", "Senkkopf, Torx TX20", P_("p_schraube")),
        ("1 ×", "Clusterlichterkette", "1200 LEDs · 23,98 m · IP44", P_("p_lichterkette")),
    ]
    for i, (q, n, note, d) in enumerate(mats):
        card(M + i * (cw + g), y, cw, ch, q, n, note, d)
    y -= ch + 30

    c.setFillColor(RED); c.setFont("B", 15); c.drawString(M, y, "Optional dazu")
    sparkle(M + 112, y + 5, 5)
    y -= 10
    cw2, ch2 = (W - 2 * M - 12) / 2, 140
    opts = [
        ("ca. 40 ×", "Kabelbinder 2,5 × 200 mm", "schwarz, UV-beständig – zum Befestigen der Lichterkette", lambda x, yy, w, h: place("p_kabelbinder2", x + 20, yy + 38, w - 40, h - 58)),
        ("4 ×", "Color Spray Acryl, glänzend", "z. B. Rot, Grün, Gelb oder Weiß – 1 Dose = 1–2 m²", lambda x, yy, w, h: place("p_spraygroup", x + 20, yy + 38, w - 40, h - 52)),
    ]
    for i, (q, n, note, d) in enumerate(opts):
        card(M + i * (cw2 + 12), y, cw2, ch2, q, n, note, d)
    y -= ch2 + 30

    c.setFillColor(RED); c.setFont("B", 15); c.drawString(M, y, "Werkzeug")
    sparkle(M + 76, y + 5, 5)
    y -= 10
    ch3 = 118
    tools = [
        ("Akkuschrauber", "mit Torx-Bit TX20", lambda x, yy, w, h: place("p_akkuschrauber", x + 20, yy + 36, w - 40, h - 48)),
        ("Einweghandschuhe Nitril", "GEBOL Black Nitril Eco – beim Sprühen tragen", lambda x, yy, w, h: place("p_handschuhe", x + 20, yy + 36, w - 40, h - 48)),
    ]
    for i, (n, note, d) in enumerate(tools):
        card(M + i * (cw2 + 12), y, cw2, ch3, None, n, note, d)
    y -= ch3 + 18

    # before you start
    bw = W - 2 * M
    items = [
        "<b>Platz:</b> eine ebene Fläche von ca. 3 × 3 m (Wiese, Hof oder Garage).",
        "<b>Böcke prüfen:</b> Spreizstangen und Scharniere fest, kein Holz gerissen, alle 5 Böcke gleich groß.",
        "<b>Helfer:</b> Zum Aufstellen sind zwei Personen nötig, der Stern ist groß und schwer.",
        "<b>Wetter:</b> Zum Lackieren trocken und möglichst über 10 °C.",
    ]
    hh = 34
    for it in items:
        hh += para(it, 0, -2000, bw - 50, size=10) + 5
    rrect(M, y - hh, bw, hh, 12, fill=HexColor("#FBEDEA"), stroke=RED, lw=.8)
    c.setFillColor(RED); c.setFont("B", 12.5); c.drawString(M + 16, y - 22, "Bevor du loslegst")
    yy = y - 32
    for it in items:
        c.setFillColor(white); c.setStrokeColor(RED); c.setLineWidth(1)
        c.roundRect(M + 16, yy - 11, 10, 10, 2, fill=1, stroke=1)
        yy -= para(it, M + 34, yy, bw - 50, size=10) + 5

# ================================================================ PAGE 3 — Steps 1-2
def lying_star_iso(ox, oy, s, R=1.37, Hh=0.45, t=0.065, badges=True, joints=True, col=WOOD):
    tips, inner = star_geom(R)
    faces = []
    for k in range(5):
        T = tips[k]
        for I in (inner[(k - 1) % 5], inner[k]):
            Q = shorten(T, I, t * 0.6)
            faces += frame_beams(T, Q, Hh, t, col=col, segs=8)
        # hinge board at tip
        d = norm(T); n = perp_xy(d)
        faces += beam(vadd(vsub(T, vmul(d, t * .3)), (0, 0, 0)), vadd(vsub(T, vmul(d, t * .3)), (0, 0, Hh)), vmul(d, t * .5), vmul(n, t * 1.6), (0.78, 0.58, 0.36), 3)
    render(faces, ox, oy, s, lw=.35)
    if joints:
        for I in inner:
            for z in (0, Hh):
                x, y = iso((I[0], I[1], z), ox, oy, s)
                c.setStrokeColor(GOLD); c.setLineWidth(2); c.setDash(3, 2)
                c.circle(x, y, 9, fill=0, stroke=1); c.setDash()
    if badges:
        for k in range(5):
            d = norm(tips[k])
            x, y = iso(vadd(tips[k], vmul(d, 0.22)), ox, oy, s)
            y += Hh * s * .5
            c.setFillColor(RED); c.circle(x, y, 10, fill=1, stroke=0)
            c.setStrokeColor(white); c.setLineWidth(1.5); c.circle(x, y, 10, fill=0, stroke=1)
            c.setFillColor(white); c.setFont("B", 12); c.drawCentredString(x, y - 4.2, str(k + 1))

def sawhorse_lying_iso(ox, oy, s):
    Lg, Wd, t = 1.0, 0.45, 0.065
    phi = math.radians(18)
    T = (0, 0, 0)
    faces = []
    for sgn in (-1, 1):
        a = math.radians(-90 + sgn * 18)
        I = (Lg * math.cos(a), Lg * math.sin(a), 0)
        faces += frame_beams(T, I, Wd, t, segs=6)
    faces += beam((0, t * .3, 0), (0, t * .3, Wd), (t * .5, 0, 0), (0, t * .5, 0), (0.78, 0.58, 0.36), 3)
    render(faces, ox, oy, s, lw=.4)

def page_steps12():
    header("So baust du den Stern", 3)
    y = H - 110
    step_badge(M, y, 1, "Böcke aufklappen und auf die Seite legen")
    y -= 36
    tw = 250
    h = para("Klappe jeden Bock ganz auf, bis die <b>Spreizstangen</b> (Metallstreben an der Seite) gerade sind. "
             "Lege ihn dann <b>auf die Seite</b>, sodass er von oben wie ein <b>„V“</b> aussieht. "
             "Die Spitze des V ist die Auflage oben, die zwei Fußenden zeigen nach innen.", M, y, tw, size=10.5)
    h += 10
    h += tip_box(M, y - h, tw, "Nimm <b>5 gleiche Böcke</b> und klappe jeden <b>ganz</b> auf (Spreizstangen gestreckt). "
                 "Dann öffnen sich alle gleich weit und der Stern wird automatisch gleichmäßig.", "Damit es gleichmäßig wird")
    # illustration: standing -> lying (3D renders)
    ix = M + tw + 14; iw = W - M - ix
    rrect(ix, y - 190, iw, 190, 12, fill=white, stroke=HexColor("#EAD9CC"), lw=.7)
    place("bock_standing", ix + 8, y - 165, 100, 150)
    c.setFillColor(GREY); c.setFont("B", 9); c.drawCentredString(ix + 58, y - 180, "aufgeklappt")
    ax = ix + 112
    poly([(ax, y - 84), (ax + 18, y - 84), (ax + 18, y - 76), (ax + 32, y - 90), (ax + 18, y - 104), (ax + 18, y - 96), (ax, y - 96)], fill=RED)
    c.setFillColor(RED); c.setFont("B", 8.5); c.drawCentredString(ax + 16, y - 116, "auf die")
    c.drawCentredString(ax + 16, y - 126, "Seite legen")
    place("bock_lying", ix + 150, y - 170, iw - 160, 160)
    c.setFillColor(GREY); c.setFont("B", 9); c.drawCentredString(ix + 150 + (iw - 160) / 2, y - 180, "liegend = eine Zacke (V)")
    y -= max(h, 190) + 26

    step_badge(M, y, 2, "Die 5 Böcke zum Stern legen")
    y -= 36
    h = para("Lege die 5 Böcke mit den <b>Spitzen nach außen</b> im Kreis auf den Boden. "
             "Jeder Bock bildet eine Zacke. Die <b>Fußenden</b> zweier Nachbarn stoßen aneinander. "
             "So entstehen <b>5 Verbindungsstellen</b> (gold markiert), an denen später geschraubt wird.", M, y, W - 2 * M, size=10.5)
    y -= h + 8
    ph = 330
    rrect(M, y - ph, W - 2 * M, ph, 12, fill=white, stroke=HexColor("#EAD9CC"), lw=.7)
    random.seed(5)
    for _ in range(8):
        snowflake(random.choice([random.uniform(M + 15, M + 70), random.uniform(W - M - 70, W - M - 15)]), random.uniform(y - ph + 60, y - 20), random.uniform(3, 6), col=HexColor("#E7C9C3"), alpha=.8)
    mp = place("star_lying", M + 60, y - ph + 14, W - 2 * M - 120, ph - 44)
    mt = META["star_lying"]
    for (u, v) in mt["joints"]:
        gold_ring(*mp(u, v), r=8)
    for k, (u, v) in enumerate(mt["tips"]):
        num_badge(*mp(u, v), k + 1, r=11)
    # legend
    lx, ly = M + 14, y - ph + 34
    c.setFillColor(RED); c.circle(lx + 7, ly + 4, 7, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("B", 8); c.drawCentredString(lx + 7, ly + 1.2, "1")
    c.setFillColor(INK); c.setFont("R", 9); c.drawString(lx + 18, ly + 1, "Klappbock 1–5")
    c.setStrokeColor(GOLD); c.setLineWidth(2); c.setDash(3, 2); c.circle(lx + 7, ly - 14, 6.5, fill=0, stroke=1); c.setDash()
    c.drawString(lx + 18, ly - 17, "Verbindungsstelle (oben und unten)")
    y -= ph + 6
    caption(M, y, W - 2 * M, "Ansicht schräg von oben. Die genaue Form hängt davon ab, wie weit deine Böcke aufgeklappt sind.")

# ================================================================ PAGE 4 — Steps 3-4
def dim_line(p, q, label, off=0, col=RED, offx=0):
    c.saveState(); c.setStrokeColor(col); c.setFillColor(col); c.setLineWidth(1)
    c.line(*p, *q)
    for a, b in ((p, q), (q, p)):
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        poly([a, (a[0] + 7 * math.cos(ang + .35), a[1] + 7 * math.sin(ang + .35)), (a[0] + 7 * math.cos(ang - .35), a[1] + 7 * math.sin(ang - .35))], fill=col)
    mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
    c.setFont("B", 9.5); w = c.stringWidth(label, "B", 9.5) + 8
    mx += offx
    rrect(mx - w / 2, my - 7 + off, w, 14, 7, fill=white, stroke=col, lw=.8)
    c.setFillColor(col); c.drawCentredString(mx, my - 3 + off, label)
    c.restoreState()

def page_steps34():
    header("So baust du den Stern", 4)
    y = H - 110
    step_badge(M, y, 3, "Ausrichten – noch nicht schrauben!")
    y -= 36
    tw = 255
    h = para("Richte erst alles aus, bevor du schraubst:", M, y, tw, size=10.5) + 6
    checks = ["Die Fußenden liegen an jeder Verbindungsstelle <b>sauber aneinander</b>.",
              "Jede <b>Spitze</b> ist gleich weit von der Mitte entfernt (bei 80 cm Beinen ca. <b>1,10 m</b>).",
              "Jede <b>Verbindungsstelle</b> ist gleich weit von der Mitte entfernt (ca. <b>42 cm</b>).",
              "Markiere die Mitte mit Kreide oder einem Stein, dann misst es sich leichter."]
    for i, t in enumerate(checks):
        c.setFillColor(PINE); c.circle(M + 7, y - h - 6, 6, fill=1, stroke=0)
        c.setStrokeColor(white); c.setLineWidth(1.4); c.line(M + 4, y - h - 6, M + 6.5, y - h - 8.5); c.line(M + 6.5, y - h - 8.5, M + 10, y - h - 3.5)
        h += para(t, M + 18, y - h, tw - 18, size=10.5) + 5
    # diagram top view with dimensions
    ix = M + tw + 14; iw = W - M - ix; ih = 215
    rrect(ix, y - ih, iw, ih, 12, fill=white, stroke=HexColor("#EAD9CC"), lw=.7)
    mp = place("star_top", ix + 10, y - ih + 22, iw - 20, ih - 30)
    mt = META["star_top"]
    ctr = mp(*mt["center"]); tp = mp(*mt["tips"][0]); inn = mp(*mt["inner"][2])
    cx = ix + iw / 2
    c.setFillColor(INK); c.circle(*ctr, 3, fill=1, stroke=0)
    dim_line(ctr, (tp[0], tp[1] - 4), "ca. 1,10 m", off=0)
    dim_line(ctr, inn, "ca. 42 cm", off=-(ctr[1] - inn[1]) / 2 - 20)
    for uv in mt["inner"]:
        gold_ring(*mp(*uv), r=7)
    c.setFillColor(GREY); c.setFont("I", 8.5); c.drawCentredString(cx, y - ih + 10, "Draufsicht · Maße bei ca. 80 cm Beinlänge")
    y -= max(h, ih) + 26

    step_badge(M, y, 4, "Mit Winkeln verschrauben")
    y -= 36
    h = para("An jede der 5 Verbindungsstellen kommen <b>2 Winkel (50 × 50 × 15 mm)</b>: einer an die <b>oberen</b> Beine, einer an die <b>unteren</b>. "
             "Sie sitzen <b>außen in der Ecke</b>, du musst den Stern also nicht umdrehen. Jeder Winkel bekommt <b>4 Schrauben 4,0 × 20 mm</b> (2 je Schenkel), zusammen 40 Stück.", M, y, W - 2 * M, size=10.5)
    y -= h + 8
    subs = [("A", "Winkel aufbiegen", "Auf ca. 108° aufbiegen, bis beide Schenkel flach am Holz liegen."),
            ("B", "Oben anschrauben", "Winkel mittig an die oberen Beine setzen und festschrauben."),
            ("C", "Unten anschrauben", "Genauso an den unteren Beinen, direkt über dem Boden.")]
    sw = (W - 2 * M - 2 * 10) / 3
    for i, (l, t1, t2) in enumerate(subs):
        x = M + i * (sw + 10)
        rrect(x, y - 52, sw, 52, 10, fill=HexColor("#FBEDEA"))
        c.setFillColor(RED); c.circle(x + 18, y - 26, 11, fill=1, stroke=0)
        c.setFillColor(white); c.setFont("B", 12); c.drawCentredString(x + 18, y - 30.5, l)
        c.setFillColor(INK); c.setFont("B", 10.5); c.drawString(x + 36, y - 20, t1)
        para(t2, x + 36, y - 25, sw - 44, size=9)
    y -= 64
    ih = 182
    rrect(M, y - ih, W - 2 * M, ih, 12, fill=white, stroke=HexColor("#EAD9CC"), lw=.7)
    # close-up
    lw_ = 300
    place("joint_close", M + 6, y - ih + 22, lw_, ih - 50)
    c.setFillColor(RED); c.setFont("B", 9.5); c.drawString(M + 14, y - 18, "Nahaufnahme: Winkel liegt vollflächig am Holz")
    c.setFillColor(GREY); c.setFont("I", 8.5); c.drawString(M + 14, y - ih + 10, "Winkel 50 × 50 × 15 mm, auf ca. 108° aufgebogen, Schrauben 4,0 × 20 mm")
    # divider
    c.setStrokeColor(HexColor("#EAD9CC")); c.setLineWidth(.7); c.line(M + lw_ + 14, y - 12, M + lw_ + 14, y - ih + 12)
    # overview with top/bottom labels
    ox_ = M + lw_ + 20; ow = W - M - ox_ - 6
    mp = place("joint", ox_, y - ih + 22, ow - 60, ih - 34)
    mt = META["joint"]
    for key, lab in (("top", "Winkel oben"), ("bottom", "Winkel unten")):
        x, yy = mp(*mt[key])
        c.setStrokeColor(RED); c.setLineWidth(1.2); c.circle(x, yy, 7, fill=0, stroke=1)
        c.setLineWidth(.9); c.line(x + 7, yy, W - M - 66, yy)
        c.setFillColor(RED); c.setFont("B", 9); c.drawString(W - M - 63, yy - 3, lab)
    c.setFillColor(GREY); c.setFont("I", 8.5); c.drawString(ox_ + 4, y - ih + 10, "Eine Verbindungsstelle von außen")
    y -= ih + 12
    tip_box(M, y, W - 2 * M, "Die Böcke treffen mit <b>ca. 108°</b> aufeinander, nicht mit 90°. Darum den Winkel im <b>Schraubstock</b> leicht aufbiegen. "
            "Tipp: erst einen Schenkel anschrauben, dann den zweiten flach ans Holz drücken und anschrauben.",
            "Warum aufbiegen?")

def joint_detail(ox, oy, s):
    tips, inner = star_geom(1.37)
    I = inner[3]
    Hh, t = 0.45, 0.07
    faces = []
    T_a, T_b = tips[3], tips[4]
    # legs from the joint outward, limited length
    legs = []
    for T in (T_a, T_b):
        d = norm(vsub(T, I))
        P = vadd(I, vmul(d, 0.04))
        Q = vadd(I, vmul(d, 0.55))
        legs.append((P, Q, d))
        faces += frame_beams(Q, P, Hh, t, rungs=(0.55,), segs=6)
    # recentre so joint is at origin
    faces = [([vsub(p, I) for p in q], n, col, e) for q, n, col, e in faces]
    render(faces, ox, oy, s, lw=.45)
    # bracket on top
    dA, dB = legs[0][2], legs[1][2]
    mid = norm(vadd(dA, dB))
    z = Hh
    # place L so its corner sits at the joint, arms 90° apart, symmetric around mid
    ang_mid = math.atan2(mid[1], mid[0])
    a1, a2 = ang_mid - math.pi / 4, ang_mid + math.pi / 4
    e1 = (math.cos(a1), math.sin(a1), 0); e2 = (math.cos(a2), math.sin(a2), 0)
    arm, wd = 0.2, 0.05
    base = vmul(mid, 0.035)
    n1 = vmul(perp_xy(e1), 1); n2 = vmul(perp_xy(e2), -1)
    corner = base
    pts3 = [vadd(corner, vmul(n1, -wd / 2)) if False else None]
    # outer L polygon (two rectangles drawn)
    for e, nvec in ((e1, perp_xy(e1)), (e2, perp_xy(e2))):
        q = [vadd(vadd(base, vmul(nvec, -wd / 2)), (0, 0, z + .004)),
             vadd(vadd(vadd(base, vmul(e, arm)), vmul(nvec, -wd / 2)), (0, 0, z + .004)),
             vadd(vadd(vadd(base, vmul(e, arm)), vmul(nvec, wd / 2)), (0, 0, z + .004)),
             vadd(vadd(base, vmul(nvec, wd / 2)), (0, 0, z + .004))]
        poly([iso(p, ox, oy, s) for p in q], fill=STEEL, stroke=HexColor("#5E6670"), lw=.8)
    for e in (e1, e2):
        for f in (0.45, 0.8):
            p = vadd(vadd(base, vmul(e, arm * f)), (0, 0, z + .004))
            x, y = iso(p, ox, oy, s)
            c.setFillColor(HexColor("#3F454C")); c.circle(x, y, 2.2, fill=1, stroke=0)
            c.setStrokeColor(white); c.setLineWidth(.6); c.line(x - 1.4, y, x + 1.4, y)
    # labels
    x, y = iso((0, 0, Hh + .02), ox, oy, s)
    c.setStrokeColor(RED); c.setLineWidth(.8); c.line(x + 4, y + 6, x + 60, y + 30)
    c.setFillColor(RED); c.setFont("B", 9.5); c.drawString(x + 62, y + 32, "Eckwinkel oben")
    c.setFillColor(INK); c.setFont("R", 8.5); c.drawString(x + 62, y + 21, "2 Schrauben je Schenkel")
    x, y = iso((0, 0, 0.02), ox, oy, s)
    c.setStrokeColor(RED); c.setDash(2, 2); c.circle(x, y, 10, fill=0, stroke=1); c.setDash()
    c.line(x - 10, y + 2, x - 50, y + 16)
    c.setFillColor(RED); c.setFont("B", 9.5); c.drawRightString(x - 52, y + 18, "Eckwinkel unten")
    c.setFillColor(INK); c.setFont("R", 8.5); c.drawRightString(x - 52, y + 7, "nach dem Umdrehen")

# ================================================================ PAGE 5 — Steps 5-6 + tips
def page_steps56():
    header("Fertig machen und schmücken", 5)
    y = H - 110
    step_badge(M, y, 5, "Lackieren (optional)")
    y -= 36
    tw = W - 2 * M - 130
    h = para("Wer mag, sprüht den Stern mit <b>Color Spray Acryl glänzend</b>, solange er noch flach liegt – z. B. in Rot. Der Stern hat ca. 4 m² Holzfläche, <b>4 Dosen</b> reichen für 1–2 Schichten.", M, y, tw, size=10.5) + 6
    for t in ["<b>Draußen</b> oder gut belüftet sprühen, <b>Nitril-Handschuhe</b> tragen, Boden mit Folie abdecken.",
              "Ca. <b>20–30 cm Abstand</b> halten, lieber <b>2 dünne Schichten</b> als eine dicke.",
              "<b>Gut trocknen lassen</b> (Angaben auf der Dose) – erst dann aufstellen."]:
        c.setFillColor(GOLD); c.circle(M + 5, y - h - 6, 3.5, fill=1, stroke=0)
        h += para(t, M + 14, y - h, tw - 14, size=10.5) + 4
    place("p_spray", W - M - 110, y - 112, 100, 116)
    y -= max(h, 112) + 22

    step_badge(M, y, 6, "Aufstellen und schmücken")
    y -= 36
    tw = 248
    h = 0
    for t in ["<b>Zu zweit aufrichten</b> und auf die zwei unteren Spitzen stellen.",
              "Lichterkette an den Kanten entlangführen und <b>alle 40–50 cm</b> befestigen, am besten mit Kabelbindern 2,5 × 200 mm (optional).",
              "Mit der <b>Clusterlichterkette (23,98 m)</b> schaffst du <b>vorne und hinten je eine Runde</b> (je ca. 8 m). Die restlichen ca. 8 m reichen als Zuleitung.",
              "Kabelbinder-Enden kurz abschneiden – das sieht ordentlicher aus.",
              "Den Stern <b>gegen Wind sichern</b> (siehe unten)."]:
        c.setFillColor(RED); c.circle(M + 5, y - h - 6, 3.5, fill=1, stroke=0)
        h += para(t, M + 14, y - h, tw - 14, size=10.5) + 5
    ix = M + tw + 14; iw = W - M - ix; ih = 236
    place_cover("night_sq", ix, y - ih, iw, ih, r=14)
    c.setStrokeColor(GOLD); c.setLineWidth(1.2); c.roundRect(ix, y - ih, iw, ih, 14, fill=0, stroke=1)
    c.setFillColor(GREY); c.setFont("I", 8.5); c.drawString(ix, y - ih - 12, "Beispiel: rot lackiert, mit Clusterlichterkette vorne und hinten")
    y -= max(h, ih) + 32

    # Tips
    c.setFillColor(RED); c.setFont("B", 15); c.drawString(M, y, "Sicherheit & Tipps")
    sparkle(M + 140, y + 5, 5)
    y -= 12
    bw = (W - 2 * M - 12) / 2
    tips_ = [
        ("Windsicherung", "Der Stern fängt viel Wind. Mit <b>Erdankern</b>, Spanngurt oder <b>Gewichten</b> sichern.", "!"),
        ("Strom", "Die Clusterlichterkette ist <b>IP44</b> (für außen). Auch die Verlängerung muss für außen zugelassen sein.", "!"),
        ("Wiederverwenden", "Nach Weihnachten Winkel abschrauben, die Böcke normal weiter nutzen.", "star"),
        ("Warum Rot glänzend?", "Glänzendes Rot spiegelt das warmweiße Licht und leuchtet auch tagsüber.", "star"),
    ]
    rowy = y
    hs = []
    for i, (t, txt, ic) in enumerate(tips_):
        col = RED if ic == "!" else PINE
        x = M + (i % 2) * (bw + 12)
        if i % 2 == 0 and i:
            rowy -= max(hs[-2:]) + 10
        hs.append(tip_box(x, rowy, bw, txt, t, col=col, icon=ic))
    y = rowy - max(hs[-2:]) - 14
    para("Quellen: Bauideen von Hornbach (hornbach.de/projekte/holzsterne-selber-bauen) und toom (toom.de, Projekt „Weihnachtsstern“). "
         "Zeit- und Maßangaben sind Richtwerte. Alle Abbildungen sind schematische Zeichnungen.", M, y, W - 2 * M, size=8, color=GREY, font="R")
    # festive end mark
    c.setFillColor(RED); c.setFont("B", 13); c.drawCentredString(W / 2, 46, "Viel Spaß beim Bauen und frohe Weihnachten!")


cover(); c.showPage()
page_material(); c.showPage()
page_steps12(); c.showPage()
page_steps34(); c.showPage()
page_steps56(); c.showPage()
c.save()
print("ok")
