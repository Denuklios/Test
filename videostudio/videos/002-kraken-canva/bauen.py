#!/usr/bin/env python3
"""Kraken-Video mit Canva-Bildern und wortgenauen Effekten darüber."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "engine"))
from effekte import *  # noqa

basis = json.loads((Path(__file__).parent.parent / "001-kraken" / "projekt.json").read_text())
bilder = ["canva1", "canva2", "canva4", "canva3", "canva5", "canva6", "canva7"]

ueber = [
    # 1 Hook: „drei Herzen, blaues Blut und quasi neun Gehirne“
    leuchten(385, 630, 55, ROT, wort="herzen")
    + leuchten(533, 579, 60, ROT, wort="herzen", plus=0.15)
    + leuchten(680, 633, 55, ROT, wort="herzen", plus=0.3)
    + leuchten(890, 868, 45, "#5ec8ff", wort="blaues")
    + schild(540, 1390, "9 GEHIRNE", groesse=60, wort="gehirne"),

    # 2 „Zwei der Herzen … durch die Kiemen. Das dritte versorgt den ganzen restlichen Körper.“
    kreis(445, 501, 62, wort="zwei") + kreis(767, 501, 62, wort="zwei", plus=0.2)
    + pfeil(420, 590, 330, 700, biegung=-0.3, wort="kiemen") + pfeil(790, 590, 880, 700, biegung=0.3, wort="kiemen")
    + leuchten(605, 518, 85, ROT, wort="dritte")
    + pfeil(605, 640, 605, 1150, biegung=0.0, wort="körper") + pfeil(560, 640, 330, 1100, biegung=0.15, wort="körper", plus=0.15)
    + pfeil(650, 640, 880, 1100, biegung=-0.15, wort="körper", plus=0.3),

    # 3 „Wenn ein Krake schwimmt, hört sein Hauptherz einfach auf zu schlagen.“
    tempo_linien(250, 980, wort="schwimmt")
    + ekg(830, 880, 130, wort="hauptherz", flach_ab="schlagen")
    + kreis(880, 890, 140, 125, ROT, wort="schlagen")
    + schild(800, 1110, "STOP", ROT, WEISS, wort="schlagen", plus=0.2),

    # 4 „Deshalb krabbeln Kraken lieber über den Meeresboden. Schwimmen ist … richtig anstrengend.“
    pfeil(160, 1420, 920, 1400, biegung=-0.08, wort="krabbeln", gestrichelt=True)
    + tropfen(700, 820, 34, wort="anstrengend") + tropfen(770, 760, 26, wort="anstrengend", plus=0.2),

    # 5 „Ihr Blut ist blau, weil es Sauerstoff mit Kupfer statt mit Eisen transportiert.“
    leuchten(570, 540, 120, "#5ec8ff", wort="blau")
    + kreis(836, 650, 110, wort="kupfer") + schild(760, 830, "Cu", "#d9822b", WEISS, wort="kupfer", plus=0.2)
    + schild(920, 830, "Fe", "#8e2b2b", WEISS, wort="eisen") + durchstreichen(920, 830, 55, wort="eisen", plus=0.25),

    # 6 „Eins im Kopf und ein eigenes Nervenzentrum in jedem der acht Arme. Zwei Drittel …“
    leuchten(540, 470, 120, "#ff7ad9", wort="kopf")
    + "".join(sonar(x, y, 45, "#ff7ad9", wort="nervenzentrum", plus=i * 0.18)
              for i, (x, y) in enumerate([(184, 296), (144, 700), (850, 544), (840, 914),
                                          (200, 1054), (780, 1060), (680, 1260), (304, 1520)]))
    + schild(820, 1450, "2/3", wort="drittel"),

    # 7 „Folg mir für mehr verrückte Fakten aus der Tierwelt!“
    leuchten(830, 700, 70, ROT, wort="folg") + kreis(920, 1090, 95, wort="mehr")
    + pfeil(560, 1420, 850, 1170, biegung=0.25, wort="fakten"),
]

for sz, b, u in zip(basis["szenen"], bilder, ueber):
    sz["foto"] = f"bilder/{b}.png"
    sz["bild"] = ""
    sz["ueber"] = u
basis["datei"] = "kraken-3-herzen-canva"
basis["cover"] = {"titel": "Kraken haben <b>3&nbsp;Herzen</b>", "szene": 0}
Path(__file__).with_name("projekt.json").write_text(json.dumps(basis, ensure_ascii=False, indent=1))
print("ok")
