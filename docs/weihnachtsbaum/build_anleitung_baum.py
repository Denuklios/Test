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
c.setTitle("XXL-Weihnachtsbaum aus 6 Klappböcken – Bauanleitung")
c.setAuthor("Sonderpreis Baumarkt")
c.setSubject("Bauanleitung Weihnachtsbaum")

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
    c.drawString(M + 72, H - 58, "XXL-Weihnachtsbaum aus 6 Klappböcken")
    footer(pg)

def footer(pg):
    c.setStrokeColor(HexColor("#E3D3C7")); c.setLineWidth(0.6); c.line(M, 34, W - M, 34)
    c.setFont("R", 8.5); c.setFillColor(GREY)
    c.drawString(M, 22, "Sonderpreis Baumarkt · Bauanleitung XXL-Weihnachtsbaum")
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


# ================================================================ helpers for the tree
def bullets(items, x, y, w, col=RED, size=10.5, gap=5):
    h = 0
    for t in items:
        c.setFillColor(col); c.circle(x + 5, y - h - 6, 3.5, fill=1, stroke=0)
        h += para(t, x + 14, y - h, w - 14, size=size) + gap
    return h

def framed_photo(name, x, y, w, h, cap=None):
    """real photo, cover-cropped into a rounded frame; caption below"""
    place_cover(name, x, y - h, w, h, r=10)
    c.setStrokeColor(HexColor("#EAD9CC")); c.setLineWidth(.8); c.roundRect(x, y - h, w, h, 10, fill=0, stroke=1)
    if cap:
        return h + 4 + para(cap, x, y - h - 4, w, size=8.5, font="I", color=GREY)
    return h

def mark(x, y, letter, col):
    c.setFillColor(white); c.circle(x, y, 9.5, fill=1, stroke=0)
    c.setFillColor(col); c.circle(x, y, 8, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("B", 9.5); c.drawCentredString(x, y - 3.3, letter)

BLUE = HexColor("#1F5FA8")

# ================================================================ PAGE 1 — Cover
def cover():
    c.linearGradient(0, H, 0, 0, (HexColor("#D3132A"), HexColor("#8E0915")), extend=True)
    random.seed(4)
    for _ in range(60):
        snowflake(random.uniform(0, W), random.uniform(260, H), random.uniform(2.5, 8), alpha=random.uniform(.15, .45))
    for _ in range(40):
        c.setFillColor(white); c.setFillAlpha(random.uniform(.2, .6))
        c.circle(random.uniform(0, W), random.uniform(250, H), random.uniform(.6, 1.8), fill=1, stroke=0)
    c.setFillAlpha(1)
    logo(M, H - 160, 118, hat=True)
    c.saveState(); c.translate(W - M - 200, H - 95); c.rotate(4)
    rrect(0, 0, 200, 34, 17, fill=GOLD)
    c.setFillColor(DRED); c.setFont("B", 13); c.drawCentredString(100, 12, "WEIHNACHTS-BAUANLEITUNG")
    c.restoreState()
    sparkle(W - M - 10, H - 50, 9, white, .9); sparkle(W - M - 200, H - 120, 6, GOLD, 1)
    c.saveState(); c.translate(W / 2, H - 255); c.rotate(-4)
    tw, th = 470, 112
    poly([(-tw / 2 + 4, -th / 2 - 6), (tw / 2 + 4, -th / 2 - 6), (tw / 2 + 4, th / 2 - 6), (-tw / 2 + 4, th / 2 - 6)], fill=DRED, alpha=.9)
    pts = [(-tw / 2, th / 2), (tw / 2, th / 2)]
    for i in range(7): pts.append((tw / 2 + (8 if i % 2 else 0), th / 2 - i * th / 6))
    pts.append((-tw / 2, -th / 2))
    for i in range(7): pts.append((-tw / 2 - (8 if i % 2 else 0), -th / 2 + i * th / 6))
    poly(pts, fill=white)
    c.setFillColor(RED); c.setFont("B", 45); c.drawCentredString(0, 8, "XXL-WEIHNACHTSBAUM")
    c.setFont("B", 25); c.setFillColor(INK); c.drawCentredString(0, -32, "aus 6 Klappböcken – selbst gebaut")
    c.restoreState()
    px, py, pw, ph = M, 205, W - 2 * M, 330
    c.saveState(); c.setFillColor(black); c.setFillAlpha(.25); c.roundRect(px + 3, py - 4, pw, ph, 18, fill=1, stroke=0); c.restoreState()
    place_cover("tree_night", px, py, pw, ph, r=18)
    c.setStrokeColor(GOLD); c.setLineWidth(1.5); c.roundRect(px, py, pw, ph, 18, fill=0, stroke=1)
    bx_, by_ = px + pw - 62, py + ph - 52
    poly(star_path(bx_ + 2, by_ - 3, 62, 50, rot=90, n=16), fill=black, alpha=.25)
    poly(star_path(bx_, by_, 62, 50, rot=90, n=16), fill=GOLD)
    c.setFillColor(DRED); c.setFont("B", 12.5); c.drawCentredString(bx_, by_ + 10, "BAUSATZ")
    c.setFont("B", 10); c.drawCentredString(bx_, by_ - 3, "komplett zum")
    c.setFont("B", 15); c.drawCentredString(bx_, by_ - 19, "FESTPREIS")
    chips = [("Schwierigkeit", "Einfach"), ("Zeitaufwand", "ca. 1,5 Std.*"), ("Höhe", "knapp 2,40 m"), ("Helfer", "2 Personen")]
    cw = (W - 2 * M - 3 * 10) / 4
    for i, (k, v) in enumerate(chips):
        x = M + i * (cw + 10)
        rrect(x, 110, cw, 62, 12, fill=white)
        c.setFillColor(GREY); c.setFont("R", 9.5); c.drawCentredString(x + cw / 2, 150, k.upper())
        c.setFillColor(RED); c.setFont("B", 17); c.drawCentredString(x + cw / 2, 125, v)
    c.setFillColor(HexColor("#FFD9D9")); c.setFont("R", 8.5)
    c.drawString(M, 92, "* Schätzung, plus Trockenzeit der Farbe")
    c.setFillColor(white); c.setFont("B", 14)
    c.drawCentredString(W / 2, 55, "Schritt für Schritt zum leuchtenden Baum für Hof, Garten und Eingang")
    sparkle(M + 6, 60, 6, GOLD); sparkle(W - M - 6, 60, 6, GOLD)

# ================================================================ PAGE 2 — Material
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
        ("6 ×", "Klappbock aus Holz", "ca. 80 cm hoch", P_("p_klappbock")),
        ("18 ×", "Lochplatten, 4 Löcher", "6 × 60×15 mm · 12 × 80×15 mm", P_("plates")),
        ("60 ×", "Schrauben 4,0×20 mm", "Senkkopf, Torx TX20", P_("p_schraube")),
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
        ("ca. 50 ×", "Kabelbinder 2,5 × 200 mm", "schwarz, UV-beständig – zum Befestigen der Lichterkette", lambda x, yy, w, h: place("p_kabelbinder2", x + 20, yy + 38, w - 40, h - 58)),
        ("2 ×", "Color Spray Acryl, glänzend", "z. B. Grün wie im Bild – 1 Dose = 1–2 m²", lambda x, yy, w, h: place("p_spraygroup", x + 20, yy + 38, w - 40, h - 52)),
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
    bw = W - 2 * M
    items = [
        "<b>Platz:</b> ebener, fester Boden – der Baum wird knapp 2,40 m hoch.",
        "<b>Böcke prüfen:</b> Spreizen und Scharniere fest, kein Holz gerissen, alle 6 Böcke gleich groß.",
        "<b>Helfer und Leiter:</b> Zu zweit arbeiten. Für den obersten Bock eine stabile Trittleiter bereitstellen.",
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

# ================================================================ PAGE 3 — Overview + step 1
def page_overview():
    header("So baust du den Baum", 3)
    y = H - 110
    c.setFillColor(RED); c.setFont("B", 17); c.drawString(M, y - 15, "Der Plan auf einen Blick")
    y -= 30
    h = para("Der Baum besteht aus <b>3 Reihen</b>: unten 3 Böcke, in der Mitte 2, oben 1. "
             "Die Böcke der oberen Reihen stehen mit ihren Füßen auf den Auflagen der Böcke darunter. "
             "Verbunden wird nur mit zwei Sorten Lochplatten:", M, y, W - 2 * M, size=10.5)
    y -= h + 10
    ih = 330
    rrect(M, y - ih, W - 2 * M, ih, 12, fill=white, stroke=HexColor("#EAD9CC"), lw=.7)
    iw = 300
    mp = place("tree_front", M + 10, y - ih + 12, iw, ih - 24)
    mt = META["tree_front"]
    for k, uv in enumerate(mt["bocks"]):
        num_badge(*mp(*uv), k + 1, r=10)
    for uv in mt["A"]:
        x, yy = mp(*uv); mark(x, yy, "A", RED)
    for i, uv in enumerate(mt["B"]):
        x, yy = mp(*uv)
        if i == 1:
            mark(x - 9, yy + 2, "B", BLUE); mark(x + 9, yy + 2, "B", BLUE)
        else:
            mark(x, yy + 2, "B", BLUE)
    # legend
    lx = M + iw + 30; ly = y - 30; lw_ = W - M - lx - 14
    for letter, col, title, txt in (
        ("A", RED, "Lochplatte 60 × 15 mm – 6 Stück",
         "Waagerecht über zwei Beine, die sich berühren. Nur die <b>2 äußeren Löcher</b> verschrauben (links 1, rechts 1)."),
        ("B", BLUE, "Lochplatte 80 × 15 mm – 12 Stück",
         "Senkrecht am Fuß eines oberen Bocks: <b>2 Schrauben ins Bein, 2 in die Auflage</b> darunter. Alle 4 Löcher verschrauben."),
    ):
        mark(lx + 9, ly - 6, letter, col)
        c.setFillColor(col); c.setFont("B", 11); c.drawString(lx + 24, ly - 10, title)
        ly -= 18 + para(txt, lx + 24, ly - 16, lw_ - 24, size=9.8) + 14
    c.setStrokeColor(HexColor("#EAD9CC")); c.line(lx, ly + 4, W - M - 14, ly + 4)
    ly -= 10
    para("<b>Jede Markierung gilt doppelt:</b> eine Platte vorne und eine hinten am Baum.", lx, ly, lw_, size=9.8)
    ly -= 36
    para("<b>Zusammen:</b> 6 × A, 12 × B und 60 Schrauben 4,0 × 20 mm (6 × 2 + 12 × 4).", lx, ly, lw_, size=9.8)
    c.setFillColor(GREY); c.setFont("I", 8.5); c.drawString(lx, y - ih + 12, "Ansicht von vorne · Zahlen = Reihenfolge der Böcke")
    y -= ih + 26

    step_badge(M, y, 1, "Böcke vorbereiten")
    y -= 36
    h = bullets(["Alle 6 Böcke <b>ganz aufklappen</b>, bis die Spreizen gestreckt sind. So sind alle gleich weit offen.",
                 "<b>Optional lackieren:</b> am besten jetzt, solange die Böcke einzeln liegen – mit 2 Dosen Color Spray, z. B. Grün. "
                 "Draußen sprühen, Handschuhe tragen und gut trocknen lassen."], M, y, 320)
    place("p_spraygroup", W - M - 150, y - 110, 140, 112, bg=(255, 247, 238))

# ================================================================ PAGE 4 — Steps 2-3
def page_rows():
    header("So baust du den Baum", 4)
    y = H - 110
    step_badge(M, y, 2, "Untere Reihe: 3 Böcke")
    y -= 36
    tw = 300
    h = bullets(["3 Böcke <b>nebeneinander</b> stellen, alle Auflagen parallel und vorne bündig.",
                 "Die Füße benachbarter Böcke <b>berühren sich</b> unten (2 Stellen).",
                 "An jeder Stelle <b>vorne und hinten</b> eine Platte <b>A (60 × 15 mm)</b> waagerecht über beide Beine. "
                 "Nur die äußeren Löcher verschrauben.",
                 "<b>Ergebnis:</b> 4 Platten A, 8 Schrauben."], M, y, tw)
    place("tree_s1", M + tw + 14, y - 150, W - 2 * M - tw - 14, 150)
    y -= max(h, 150) + 10
    ph_w = 170
    hh = framed_photo("ph_boden", M, y, ph_w, 150, "Platte A am Fuß: 2 Schrauben, außen links und rechts")
    tip_box(M + ph_w + 14, y, W - 2 * M - ph_w - 14,
            "Erst alle 3 Böcke ausrichten, dann schrauben. Die Füße müssen <b>vorne und hinten</b> gleich dicht zusammenstehen, "
            "sonst steht die mittlere Reihe schief.", "Gerade ausrichten")
    y -= hh + 24

    step_badge(M, y, 3, "Mittlere Reihe: 2 Böcke")
    y -= 36
    h = bullets(["Die 2 Böcke <b>zu zweit</b> auf die Auflagen der unteren Reihe setzen. Jeder Fuß steht auf einer Auflage.",
                 "Jeden Fuß <b>vorne und hinten</b> mit einer Platte <b>B (80 × 15 mm)</b> senkrecht anschrauben: 2 Schrauben ins Bein, 2 in die Auflage.",
                 "In der Mitte treffen zwei Beine aufeinander: dort zusätzlich vorne und hinten eine Platte <b>A</b> waagerecht über beide Beine, nur außen verschraubt.",
                 "<b>Ergebnis:</b> 8 Platten B, 2 Platten A, 36 Schrauben."], M, y, tw)
    place("tree_s2", M + tw + 14, y - 200, W - 2 * M - tw - 14, 200)
    c.setFillColor(GREY); c.setFont("I", 8.5); c.drawString(M, y - max(h, 200) - 4, "Fotos zu Schritt 3 auf der nächsten Seite.")

# ================================================================ PAGE 5 — Step 3 details + step 4
def page_top():
    header("So baust du den Baum", 5)
    y = H - 110
    c.setFillColor(RED); c.setFont("B", 15); c.drawString(M, y - 14, "Schritt 3 im Detail")
    y -= 28
    pw2 = (W - 2 * M - 14) / 2
    h1 = framed_photo("ph_fuss", M, y, pw2, 230, "Außen: Platte B am Fuß – 2 Schrauben ins Bein, 2 in die Auflage")
    h2 = framed_photo("ph_mitte", M + pw2 + 14, y, pw2, 230, "Mitte: oben Platte A über beide Beine, unten Platte B an Bein und Auflage (leicht angebogen)")
    y -= max(h1, h2) + 24

    step_badge(M, y, 4, "Oben: der 6. Bock")
    y -= 36
    tw = 300
    h = bullets(["Den letzten Bock <b>zu zweit</b> auf die beiden mittleren Böcke setzen – mit stabiler Trittleiter.",
                 "Beide Füße wie in Schritt 3 vorne und hinten mit Platte <b>B</b> anschrauben.",
                 "<b>Ergebnis:</b> 4 Platten B, 16 Schrauben."], M, y, tw)
    place("tree_s3", M + tw + 14, y - 200, W - 2 * M - tw - 14, 200)
    tip_box(M, y - h - 10, tw,
            "Steht ein Bein etwas schräg zur Auflage, die Platte B vorsichtig <b>leicht anbiegen</b>, bis sie an Bein und Auflage flach anliegt – "
            "wie auf dem Foto der Mitte.", "Platte liegt nicht flach an?")

# ================================================================ PAGE 6 — Lights, safety, real photo
def page_tips():
    header("Leuchten lassen", 6)
    y = H - 110
    step_badge(M, y, 5, "Lichterkette anbringen")
    y -= 36
    tw = 270
    bullets(["Unten am <b>Stecker-Ende</b> beginnen.",
             "Die Clusterlichterkette in <b>waagerechten Runden</b> um den Baum führen, von unten nach oben – Abstand ca. 25–30 cm, das ergibt etwa 9 Runden.",
             "Optional alle 40–50 cm mit einem <b>Kabelbinder</b> (2,5 × 200 mm) befestigen, Enden kurz abschneiden.",
             "Stecker zur Außensteckdose führen."], M, y, tw)
    ih = 250
    iw = W - M - (M + tw + 14)
    place_cover("tree_night_p", M + tw + 14, y - ih, iw, ih, r=14)
    c.setStrokeColor(GOLD); c.setLineWidth(1.2); c.roundRect(M + tw + 14, y - ih, iw, ih, 14, fill=0, stroke=1)
    c.setFillColor(GREY); c.setFont("I", 8.5); c.drawString(M + tw + 14, y - ih - 12, "Beispiel: grün lackiert, mit Clusterlichterkette")
    y -= ih + 34

    c.setFillColor(RED); c.setFont("B", 15); c.drawString(M, y, "Sicherheit & Tipps")
    sparkle(M + 140, y + 5, 5)
    y -= 12
    tw2 = W - 2 * M
    tips_ = [
        ("Kippsicherung", "Knapp 2,40 m hoch, aber nur so tief wie ein Bock: <b>immer sichern</b> – Spanngurt an Wand oder Zaun oder Erdanker an den Füßen.", "!", RED),
        ("Strom", "Die Clusterlichterkette ist <b>IP44</b> (für außen). Auch die Verlängerung muss für außen zugelassen sein.", "!", RED),
        ("Arbeiten in der Höhe", "Den obersten Bock nur mit stabiler Trittleiter und zu zweit aufsetzen.", "!", RED),
        ("Wiederverwenden", "Nach Weihnachten die Platten abschrauben – die Böcke normal weiter nutzen.", "star", PINE),
        ("Farbe", "Tannengrün wirkt tagsüber wie ein echter Baum und leuchtet abends mit dem warmweißen Licht.", "star", PINE),
    ]
    yy = y
    for t, txt, ic, col in tips_:
        yy -= tip_box(M, yy, tw2, txt, t, col=col, icon=ic) + 8
    review_box(c, M, yy - 8, W - 2 * M, 84, RED, DRED, GOLD, INK, GREY, white, rrect, star_path, poly)

cover(); c.showPage()
page_material(); c.showPage()
page_overview(); c.showPage()
page_rows(); c.showPage()
page_top(); c.showPage()
page_tips(); c.showPage()
c.save()
print("ok")
