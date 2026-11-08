"""Fertig freigestelltes PNG (transparenter Hintergrund, 1776 x 896) für den Konfigurator übernehmen.

Aufruf:  python3 aus_png.py <freigestellt.png|.webp> <ziel-ohne-endung> [hintergrund-grau 0-255]
Ergebnis: <ziel>.jpg (Produkt auf ruhigem, schattenlosem Grau) und <ziel>-m.png (Maske = Transparenz).
"""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
grey = int(sys.argv[3]) if len(sys.argv) > 3 else 218
im = Image.open(src).convert('RGBA')
a = np.asarray(im).astype(np.float32)
alpha = a[..., 3:4] / 255.0
rgb = a[..., :3] * alpha + grey * (1 - alpha)
Image.fromarray(rgb.round().clip(0, 255).astype(np.uint8)).save(dst + '.jpg', quality=90)
Image.fromarray(a[..., 3].astype(np.uint8), 'L').save(dst + '-m.png', optimize=True)
print(dst, im.size)
