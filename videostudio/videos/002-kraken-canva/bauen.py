#!/usr/bin/env python3
"""Kraken-Video, Variante mit Canva-Bildern (gleiches Skript wie 001)."""
import json
from pathlib import Path
basis = json.loads((Path(__file__).parent.parent / "001-kraken" / "projekt.json").read_text())
bilder = ["canva1", "canva2", "canva4", "canva3", "canva5", "canva6", "canva7"]
for sz, b in zip(basis["szenen"], bilder):
    sz["foto"] = f"bilder/{b}.png"
    sz["bild"] = ""
basis["datei"] = "kraken-3-herzen-canva"
basis["cover"] = {"titel": "Kraken haben <b>3&nbsp;Herzen</b>", "szene": 0, "nur_foto": True}
Path(__file__).with_name("projekt.json").write_text(json.dumps(basis, ensure_ascii=False, indent=1))
print("ok")
