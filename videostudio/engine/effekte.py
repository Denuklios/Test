"""Animierte Effekte, die über ein Szenenbild (1080×1920) gelegt werden.

Jeder Effekt startet, wenn ein bestimmtes Wort gesprochen wird (wort="herzen";
n=2 für das zweite Vorkommen; plus=0.3 verschiebt um Sekunden). Ohne wort startet er bei d Sekunden.
Koordinaten sind Bildpixel im 1080×1920-Bild.

Beispiel in bauen.py:
    import sys; sys.path.insert(0, "../../engine"); from effekte import *
    szene["ueber"] = leuchten(380, 630, 70, wort="herzen") + pfeil(300, 900, 600, 1100, wort="körper")
"""
import math

GELB = "#ffd23f"
ROT = "#ff3355"
WEISS = "#ffffff"
DUNKEL = "#14101f"


def _zeit(wort=None, n=None, plus=0.0, d=0.0, aus=None, aus_wort=None):
    a = f' data-wort="{wort}"' if wort else f' data-d="{d}"'
    if n:
        a += f' data-n="{n}"'
    if plus:
        a += f' data-plus="{plus}"'
    if aus is not None:
        a += f' data-aus="{aus}"'
    if aus_wort:
        a += f' data-aus-wort="{aus_wort}"'
    return a


def leuchten(x, y, r, farbe=GELB, **z):
    """Weiches, blinkendes Leuchten hinter/auf einem Objekt plus Sonar-Ring."""
    gid = f"gl{int(x)}{int(y)}"
    return (f'<defs><radialGradient id="{gid}"><stop offset="0" stop-color="{farbe}" stop-opacity=".85"/>'
            f'<stop offset=".55" stop-color="{farbe}" stop-opacity=".35"/><stop offset="1" stop-color="{farbe}" stop-opacity="0"/></radialGradient></defs>'
            f'<g data-a="pop blink" data-l="0.35"{_zeit(**z)}><circle cx="{x}" cy="{y}" r="{r*1.6}" fill="url(#{gid})" style="mix-blend-mode:screen"/></g>'
            + sonar(x, y, r, farbe, **z))


def sonar(x, y, r, farbe=GELB, breite=8, **z):
    """Ringe, die sich wie ein Herzschlag/Radar nach außen ausbreiten."""
    return (f'<g data-a="sonar"{_zeit(**z)}><circle cx="{x}" cy="{y}" r="{r*1.3}" fill="none" stroke="{farbe}" stroke-width="{breite}"/></g>')


def kreis(x, y, rx, ry=None, farbe=GELB, breite=12, **z):
    """Handgezeichneter Kreis, der sich um ein Objekt zieht, danach leicht pulsiert."""
    ry = ry or rx
    d = (f"M{x - rx*0.2:.0f} {y - ry:.0f} C{x + rx*0.9:.0f} {y - ry*1.05:.0f} {x + rx*1.1:.0f} {y + ry*0.9:.0f} {x:.0f} {y + ry:.0f} "
         f"C{x - rx*1.1:.0f} {y + ry*1.05:.0f} {x - rx*1.1:.0f} {y - ry*0.8:.0f} {x + rx*0.25:.0f} {y - ry*1.08:.0f}")
    return (f'<g data-a="draw" data-l="0.55"{_zeit(**z)}><path d="{d}" fill="none" stroke="{DUNKEL}" stroke-width="{breite+10}" stroke-linecap="round" data-fill="0" opacity=".55"/>'
            f'<path d="{d}" fill="none" stroke="{farbe}" stroke-width="{breite}" stroke-linecap="round" data-fill="0"/></g>')


def pfeil(x1, y1, x2, y2, biegung=0.25, farbe=GELB, breite=14, gestrichelt=False, **z):
    """Pfeil, der sich von (x1,y1) nach (x2,y2) zeichnet; Spitze erscheint am Ende."""
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    cx, cy = mx - dy * biegung, my + dx * biegung
    w = math.atan2(y2 - cy, x2 - cx)
    s = breite * 2.6
    p1 = (x2 - s * math.cos(w - 0.5), y2 - s * math.sin(w - 0.5))
    p2 = (x2 - s * math.cos(w + 0.5), y2 - s * math.sin(w + 0.5))
    linie = f"M{x1:.0f} {y1:.0f} Q{cx:.0f} {cy:.0f} {x2:.0f} {y2:.0f}"
    spitze = f"M{p1[0]:.0f} {p1[1]:.0f} L{x2:.0f} {y2:.0f} L{p2[0]:.0f} {p2[1]:.0f}"
    strich = ' stroke-dasharray="1 30"' if gestrichelt else ""
    zs = dict(z)
    zs["plus"] = zs.get("plus", 0) + 0.45
    out = f'<g data-a="draw" data-l="0.5"{_zeit(**z)}>'
    out += f'<path d="{linie}" fill="none" stroke="{DUNKEL}" stroke-width="{breite+10}" stroke-linecap="round" data-fill="0" opacity=".5"/>'
    out += f'<path d="{linie}" fill="none" stroke="{farbe}" stroke-width="{breite}" stroke-linecap="round" data-fill="0"/></g>'
    out += (f'<g data-a="pop"{_zeit(**zs)}><path d="{spitze}" fill="none" stroke="{DUNKEL}" stroke-width="{breite+10}" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>'
            f'<path d="{spitze}" fill="none" stroke="{farbe}" stroke-width="{breite}" stroke-linecap="round" stroke-linejoin="round"/></g>')
    if gestrichelt:
        out = out.replace('data-fill="0"/>', f'data-fill="0"{strich}/>', 2)
    return out


def schild(x, y, text, farbe=GELB, textfarbe=DUNKEL, groesse=70, **z):
    """Schild mit kurzem Text, das hineinfedert (z. B. „Cu“, „2/3“, „×9“)."""
    b = max(groesse * 1.4, len(text) * groesse * 0.62 + groesse * 0.9)
    h = groesse * 1.45
    return (f'<g data-a="federn"{_zeit(**z)}><rect x="{x-b/2:.0f}" y="{y-h/2:.0f}" width="{b:.0f}" height="{h:.0f}" rx="{h/2:.0f}" fill="{farbe}" stroke="{DUNKEL}" stroke-width="8"/>'
            f'<text x="{x}" y="{y + groesse*0.36:.0f}" text-anchor="middle" font-family="Titel" font-size="{groesse}" fill="{textfarbe}">{text}</text></g>')


def durchstreichen(x, y, r, farbe=ROT, **z):
    """Rotes X über einem Objekt."""
    d = f"M{x-r} {y-r} L{x+r} {y+r} M{x+r} {y-r} L{x-r} {y+r}"
    return (f'<g data-a="draw" data-l="0.35"{_zeit(**z)}><path d="{d}" fill="none" stroke="{DUNKEL}" stroke-width="34" stroke-linecap="round" data-fill="0" opacity=".5"/>'
            f'<path d="{d}" fill="none" stroke="{farbe}" stroke-width="22" stroke-linecap="round" data-fill="0"/></g>')


def ekg(x, y, breite, farbe="#39ff8a", flach_ab=None, **z):
    """Herzschlag-Linie, die sich zeichnet; mit flach_ab (Wort) wird sie danach zur Nulllinie."""
    s = breite / 10
    d = (f"M{x} {y} l{s*1.5} 0 l{s*0.6} {-s*2.2} l{s*0.7} {s*4} l{s*0.6} {-s*1.8} l{s*1.2} 0 "
         f"l{s*0.6} {-s*2.2} l{s*0.7} {s*4} l{s*0.6} {-s*1.8} l{s*2.5} 0")
    aus = {"aus_wort": flach_ab} if flach_ab else {}
    out = f'<g data-a="draw" data-l="1.2"{_zeit(**z, **aus)}><path d="{d}" fill="none" stroke="{farbe}" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" data-fill="0"/></g>'
    if flach_ab:
        out += (f'<g data-a="breit" data-l="0.5"{_zeit(wort=flach_ab)}><path d="M{x} {y} h{breite}" stroke="{farbe}" stroke-width="9" stroke-linecap="round"/></g>')
    return out


def tropfen(x, y, groesse=40, farbe="#9be7ff", **z):
    """Schweißtropfen, der auftaucht und leicht wackelt."""
    g = groesse
    d = f"M{x} {y-g} C{x} {y-g} {x-g*0.7} {y-g*0.1} {x-g*0.7} {y+g*0.3} C{x-g*0.7} {y+g*0.75} {x-g*0.35} {y+g} {x} {y+g} C{x+g*0.35} {y+g} {x+g*0.7} {y+g*0.75} {x+g*0.7} {y+g*0.3} C{x+g*0.7} {y-g*0.1} {x} {y-g} {x} {y-g}Z"
    return f'<g data-a="pop wackeln"{_zeit(**z)}><path d="{d}" fill="{farbe}" stroke="{DUNKEL}" stroke-width="7"/></g>'


def tempo_linien(x, y, laenge=220, anzahl=3, abstand=60, farbe=WEISS, **z):
    """Geschwindigkeits-Striche (Bewegung nach rechts), die nacheinander erscheinen."""
    out = ""
    for i in range(anzahl):
        zz = dict(z)
        zz["plus"] = zz.get("plus", 0) + i * 0.12
        yy = y + (i - (anzahl - 1) / 2) * abstand
        ll = laenge * (1 - 0.2 * abs(i - (anzahl - 1) / 2))
        out += f'<g data-a="breit links" data-l="0.4"{_zeit(**zz)}><path d="M{x-ll} {yy} h{ll}" stroke="{farbe}" stroke-width="12" stroke-linecap="round" opacity=".85"/></g>'
    return out
