#!/usr/bin/env python3
"""Erzeugt projekt.json für das Video „Kraken haben 3 Herzen“."""
import json
from pathlib import Path

D = "#22142e"      # Konturfarbe
K = "#ff7d8f"      # Krake
K2 = "#e85d74"     # Krake dunkel
H = "#ff3355"      # Herz
B = "#3fa9ff"      # Blau

def tentakel(d, verz, extra=""):
    return (f'<g data-a="draw" data-d="{verz}" data-l="0.7" {extra}>'
            f'<path d="{d}" fill="none" stroke="{D}" stroke-width="50" stroke-linecap="round" data-fill="0"/>'
            f'<path d="{d}" fill="none" stroke="{K}" stroke-width="34" stroke-linecap="round" data-fill="0"/></g>')

ARME = [
    "M340 500 C290 580 230 600 210 680 C200 730 250 750 275 715",
    "M375 520 C350 610 330 670 345 740 C355 790 400 785 400 750",
    "M420 530 C420 620 410 700 440 760 C460 800 500 780 485 745",
    "M480 530 C495 620 520 690 560 740 C590 775 625 745 600 715",
    "M525 520 C560 600 600 640 640 690 C670 725 705 700 680 670",
    "M560 500 C620 560 690 560 730 610 C755 645 725 680 700 650",
    "M320 470 C250 500 190 480 150 530 C125 565 160 595 180 570",
]

def krake(verz=0.0, augen="normal", armd=None, mund=True):
    arme = "".join(tentakel(a, verz + 0.15 + i * 0.06) for i, a in enumerate(armd or ARME))
    kopf = (f'<g data-a="pop" data-d="{verz}" data-l="0.55">'
            f'<path d="M290 400 C280 200 620 200 610 400 C605 480 560 535 450 535 C340 535 295 480 290 400Z" fill="{K}" stroke="{D}" stroke-width="12"/>'
            f'<ellipse cx="380" cy="300" rx="28" ry="18" fill="{K2}"/><ellipse cx="530" cy="280" rx="20" ry="14" fill="{K2}"/><ellipse cx="560" cy="350" rx="14" ry="10" fill="{K2}"/>'
            f'<path d="M345 335 C352 305 372 290 395 286" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" opacity=".5"/>')
    if augen == "muede":
        kopf += (f'<path d="M370 420 Q395 440 420 420" fill="none" stroke="{D}" stroke-width="12" stroke-linecap="round"/>'
                 f'<path d="M480 420 Q505 440 530 420" fill="none" stroke="{D}" stroke-width="12" stroke-linecap="round"/>')
    else:
        kopf += (f'<circle cx="395" cy="420" r="34" fill="#fff" stroke="{D}" stroke-width="10"/><circle cx="403" cy="425" r="16" fill="{D}"/><circle cx="409" cy="418" r="5" fill="#fff"/>'
                 f'<circle cx="505" cy="420" r="34" fill="#fff" stroke="{D}" stroke-width="10"/><circle cx="513" cy="425" r="16" fill="{D}"/><circle cx="519" cy="418" r="5" fill="#fff"/>')
    if mund:
        kopf += f'<path d="M430 480 Q450 500 470 480" fill="none" stroke="{D}" stroke-width="10" stroke-linecap="round"/>'
    kopf += '</g>'
    return arme + kopf

def herz(x, y, s, verz, art="federn puls", farbe=H):
    return (f'<g transform="translate({x} {y}) scale({s})"><g data-a="{art}" data-d="{verz}" data-l="0.8">'
            f'<path d="M0 30 C-10 -10 -70 -15 -70 30 C-70 70 -20 95 0 120 C20 95 70 70 70 30 C70 -15 10 -10 0 30Z" fill="{farbe}" stroke="{D}" stroke-width="{10/s:.1f}"/>'
            f'<path d="M-45 20 C-45 5 -30 0 -22 5" fill="none" stroke="#fff" stroke-width="{9/s:.1f}" stroke-linecap="round" opacity=".6"/></g></g>')

def zahl(x, y, txt, verz, farbe="#ffd23f", gr=120):
    return (f'<g data-a="federn" data-d="{verz}"><text x="{x}" y="{y}" text-anchor="middle" font-family="Titel" font-size="{gr}" '
            f'fill="{farbe}" stroke="{D}" stroke-width="14" paint-order="stroke">{txt}</text></g>')

def svg(inhalt):
    return f'<svg viewBox="0 0 900 900" xmlns="http://www.w3.org/2000/svg">{inhalt}</svg>'

szenen = []

# 1 Hook
szenen.append({
    "kopf": "Kraken haben <b>3&nbsp;Herzen</b>",
    "text": "Kraken haben drei Herzen, blaues Blut und quasi neun Gehirne. Und das ist noch nicht mal das Verrückteste.",
    "bild": svg(
        f'<g data-a="schweben" data-d="0">{krake(0.0)}</g>'
        + herz(250, 90, 0.75, 0.9) + herz(450, 40, 0.9, 1.1) + herz(650, 90, 0.75, 1.3)
        + f'<g data-a="pop wackeln" data-d="2.1"><path d="M780 340 C780 340 720 420 720 460 C720 495 748 520 780 520 C812 520 840 495 840 460 C840 420 780 340 780 340Z" fill="{B}" stroke="{D}" stroke-width="10"/></g>'
        + zahl(120, 470, "9", 2.9, gr=110)
    ),
})

# 2 Drei Herzen erklärt
szenen.append({
    "kopf": "2 für die <b>Kiemen</b>",
    "text": "Zwei der Herzen pumpen das Blut nur durch die Kiemen. Das dritte versorgt den ganzen restlichen Körper.",
    "bild": svg(
        f'<g data-a="fade" data-d="0" data-l="0.5"><path d="M250 420 C230 170 670 170 650 420 C640 560 560 640 450 640 C340 640 260 560 250 420Z" fill="{K}" fill-opacity=".25" stroke="{K}" stroke-width="10" stroke-dasharray="20 18"/></g>'
        + f'<g data-a="draw" data-d="0.4" data-l="0.6"><path d="M200 520 C160 500 150 440 190 410 M180 560 C130 560 110 600 140 640" fill="none" stroke="#9be7ff" stroke-width="18" stroke-linecap="round"/></g>'
        + f'<g data-a="draw" data-d="0.5" data-l="0.6"><path d="M700 520 C740 500 750 440 710 410 M720 560 C770 560 790 600 760 640" fill="none" stroke="#9be7ff" stroke-width="18" stroke-linecap="round"/></g>'
        + herz(250, 450, 0.6, 0.8) + herz(650, 450, 0.6, 1.0)
        + herz(450, 330, 1.05, 3.0)
        + f'<g data-a="draw" data-d="3.6" data-l="0.8"><path d="M450 480 L450 700 M450 600 L330 760 M450 600 L570 760" fill="none" stroke="{H}" stroke-width="16" stroke-linecap="round"/></g>'
        + f'<g data-a="pop" data-d="4.2"><circle cx="330" cy="770" r="26" fill="{H}" stroke="{D}" stroke-width="8"/><circle cx="450" cy="715" r="26" fill="{H}" stroke="{D}" stroke-width="8"/><circle cx="570" cy="770" r="26" fill="{H}" stroke="{D}" stroke-width="8"/></g>'
        + zahl(250, 260, "1", 0.9, gr=90) + zahl(650, 260, "2", 1.1, gr=90) + zahl(450, 230, "3", 3.1, gr=100)
    ),
})

# 3 Herz stoppt beim Schwimmen
szenen.append({
    "kopf": "Herz <b>aus!</b>",
    "text": "Und jetzt kommt's: Wenn ein Krake schwimmt, hört sein Hauptherz einfach auf zu schlagen.",
    "bild": svg(
        f'<g data-a="fade" data-d="0"><rect x="70" y="120" width="760" height="420" rx="40" fill="#0b1626" stroke="{D}" stroke-width="12"/>'
        + "".join(f'<line x1="{70+i*76}" y1="130" x2="{70+i*76}" y2="530" stroke="#1d3b2c" stroke-width="3"/>' for i in range(1, 10))
        + '</g>'
        + f'<g data-a="draw" data-d="0.4" data-l="2.6"><path d="M90 330 L210 330 L240 250 L275 420 L305 330 L400 330 L430 240 L465 430 L495 330 L560 330 L810 330" fill="none" stroke="#39ff8a" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/></g>'
        + f'<g data-a="pop" data-d="3.0"><circle cx="690" cy="330" r="22" fill="#39ff8a"/></g>'
        + herz(450, 600, 1.1, 0.2, art="pop")
        + f'<g data-a="pop" data-d="3.3"><circle cx="600" cy="640" r="70" fill="#ffd23f" stroke="{D}" stroke-width="10"/>'
          f'<rect x="575" y="605" width="16" height="70" rx="5" fill="{D}"/><rect x="610" y="605" width="16" height="70" rx="5" fill="{D}"/></g>'
    ),
})

# 4 Krabbeln statt Schwimmen
szenen.append({
    "kopf": "Lieber <b>krabbeln</b>",
    "text": "Deshalb krabbeln Kraken lieber über den Meeresboden. Schwimmen ist für sie richtig anstrengend.",
    "bild": svg(
        f'<g data-a="hoch" data-d="0"><path d="M0 760 C150 720 300 780 450 750 C600 720 750 780 900 740 L900 900 L0 900Z" fill="#c9a66b" stroke="{D}" stroke-width="10"/>'
        f'<ellipse cx="140" cy="760" rx="80" ry="45" fill="#7c8a99" stroke="{D}" stroke-width="10"/><ellipse cx="780" cy="750" rx="60" ry="36" fill="#7c8a99" stroke="{D}" stroke-width="10"/></g>'
        + f'<g data-a="draw" data-d="0.3" data-l="0.8"><path d="M120 720 C100 640 150 600 120 520 M800 710 C830 640 780 600 810 520" fill="none" stroke="#2fbf71" stroke-width="16" stroke-linecap="round"/></g>'
        + f'<g transform="translate(0 120)"><g data-a="rechts" data-d="0.2" data-l="1.2"><g data-a="wackeln" data-d="1.4">{krake(0.3, augen="muede")}</g></g></g>'
        + f'<g data-a="pop" data-d="2.4"><path d="M650 300 C650 300 625 340 625 355 C625 370 637 380 650 380 C663 380 675 370 675 355 C675 340 650 300 650 300Z" fill="#9be7ff" stroke="{D}" stroke-width="7"/></g>'
        + f'<g data-a="pop" data-d="2.7"><path d="M700 360 C700 360 680 390 680 402 C680 414 689 421 700 421 C711 421 720 414 720 402 C720 390 700 360 700 360Z" fill="#9be7ff" stroke="{D}" stroke-width="7"/></g>'
    ),
})

# 5 Blaues Blut
szenen.append({
    "kopf": "Warum <b>blau?</b>",
    "text": "Ihr Blut ist blau, weil es Sauerstoff mit Kupfer statt mit Eisen transportiert. Das funktioniert besser im kalten Wasser.",
    "bild": svg(
        f'<g data-a="federn" data-d="0.1"><path d="M450 90 C450 90 270 330 270 450 C270 560 350 640 450 640 C550 640 630 560 630 450 C630 330 450 90 450 90Z" fill="{B}" stroke="{D}" stroke-width="14"/>'
        f'<path d="M340 440 C340 380 370 330 395 300" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" opacity=".55"/></g>'
        + f'<g data-a="pop" data-d="1.8"><rect x="90" y="560" width="250" height="250" rx="26" fill="#d9822b" stroke="{D}" stroke-width="12"/>'
          f'<text x="215" y="720" text-anchor="middle" font-family="Titel" font-size="130" fill="#fff">Cu</text>'
          f'<text x="215" y="785" text-anchor="middle" font-family="Kraft" font-size="34" fill="#fff">KUPFER</text></g>'
        + f'<g data-a="pop" data-d="2.4"><rect x="560" y="560" width="250" height="250" rx="26" fill="#8e2b2b" stroke="{D}" stroke-width="12" opacity=".8"/>'
          f'<text x="685" y="720" text-anchor="middle" font-family="Titel" font-size="130" fill="#fff">Fe</text>'
          f'<text x="685" y="785" text-anchor="middle" font-family="Kraft" font-size="34" fill="#fff">EISEN</text></g>'
        + f'<g data-a="draw" data-d="2.9" data-l="0.4"><path d="M575 575 L795 795 M795 575 L575 795" fill="none" stroke="#ff3355" stroke-width="26" stroke-linecap="round"/></g>'
        + f'<g data-a="pop" data-d="2.2"><circle cx="215" cy="500" r="48" fill="#2fbf71" stroke="{D}" stroke-width="10"/></g>'
        + f'<g data-a="draw" data-d="2.5" data-l="0.35"><path d="M192 500 L210 520 L242 482" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></g>'
    ),
})

# 6 Neun Gehirne
gehirn = lambda x, y, s, d: (f'<g transform="translate({x} {y}) scale({s})"><g data-a="federn" data-d="{d}">'
    f'<path d="M-40 10 C-60 10 -62 -20 -45 -28 C-50 -50 -20 -60 -8 -45 C0 -62 30 -58 32 -38 C55 -42 62 -12 45 -2 C60 15 40 38 22 30 C10 45 -20 42 -25 28 C-45 35 -55 20 -40 10Z" fill="#ffb3d1" stroke="{D}" stroke-width="{8/s:.1f}"/>'
    f'<path d="M-25 -10 C-15 -20 0 -5 10 -18 M-10 15 C0 5 15 20 25 8" fill="none" stroke="{D}" stroke-width="{5/s:.1f}" stroke-linecap="round"/></g></g>')
ends = [(275, 715), (400, 750), (485, 745), (600, 715), (680, 670), (700, 650), (180, 570), (130, 640)]
szenen.append({
    "kopf": "Jeder Arm <b>denkt mit</b>",
    "text": "Und die neun Gehirne? Eins im Kopf und ein eigenes Nervenzentrum in jedem der acht Arme. Zwei Drittel ihrer Nervenzellen stecken in den Armen.",
    "bild": svg(
        krake(0.0, armd=ARME + ["M300 440 C230 440 170 500 140 600 C125 650 165 665 175 630"])
        + gehirn(450, 120, 1.3, 1.0)
        + "".join(gehirn(x, y + 50, 0.75, 2.4 + i * 0.25) for i, (x, y) in enumerate([(275, 715), (400, 750), (485, 745), (600, 715), (680, 670), (720, 600), (180, 560), (160, 650)]))
        + zahl(820, 200, "2/3", 6.0, gr=100)
    ),
})

# 7 CTA
szenen.append({
    "kopf": "Mehr <b>Fakten?</b>",
    "text": "Folg mir für mehr verrückte Fakten aus der Tierwelt!",
    "min_dauer": 3.2,
    "bild": svg(
        f'<g transform="translate(0 40)"><g data-a="schweben">{krake(0.0)}</g></g>'
        + f'<g data-a="pop" data-d="0.8"><rect x="220" y="60" width="460" height="130" rx="65" fill="#ff3355" stroke="{D}" stroke-width="12"/>'
          f'<text x="450" y="152" text-anchor="middle" font-family="Titel" font-size="84" fill="#fff">FOLGEN</text></g>'
        + f'<g data-a="federn wackeln" data-d="1.3"><path d="M760 140 C760 90 800 70 820 70 C840 70 880 90 880 140 L880 190 L900 215 L740 215 L760 190Z" fill="#ffd23f" stroke="{D}" stroke-width="10"/><circle cx="820" cy="232" r="16" fill="#ffd23f" stroke="{D}" stroke-width="8"/></g>'
        + herz(110, 120, 0.8, 1.6)
    ),
})

projekt = {
    "titel": "Kraken haben 3 Herzen",
    "datei": "kraken-3-herzen",
    "stimme": "de-DE-ConradNeural",
    "tempo": "+10%",
    "stil": {"bg1": "#041a30", "bg2": "#0b4f78", "akzent": "#ffd23f", "text": "#ffffff", "form": "#9be7ff"},
    "cover": {"titel": "Kraken haben <b>3&nbsp;Herzen</b>", "szene": 0},
    "szenen": szenen,
}
Path(__file__).with_name("projekt.json").write_text(json.dumps(projekt, ensure_ascii=False, indent=1))
print("projekt.json geschrieben,", len(szenen), "Szenen")
