"""Kleines Auswahlbild (eine Ansicht mit dem Foto-Hintergrund) aus Foto und Maske: python3 vorschaubild.py <ziel-ohne-endung> [ansicht]"""
import sys
import numpy as np
from PIL import Image
base = sys.argv[1]; k = int(sys.argv[2]) if len(sys.argv) > 2 else 0
im = Image.open(base + '.jpg').convert('RGB'); m = Image.open(base + '-m.png').convert('L')
a = np.asarray(m) > 128
cols = np.nonzero(a.any(0))[0]
runs, st, prev = [], cols[0], cols[0]
for c in cols[1:]:
    if c - prev > 12: runs.append((st, prev)); st = c
    prev = c
runs.append((st, prev))
x0, x1 = runs[k]
rows = np.nonzero(a[:, x0:x1 + 1].any(1))[0]; y0, y1 = rows[0], rows[-1]
side = int(max(x1 - x0, y1 - y0) * 1.1); cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
# Originalfoto mit seinem grauen Hintergrund; Nachbaransichten mit der Hintergrundfarbe überdecken
arr = np.asarray(im).copy()
bgc = np.median(np.concatenate([arr[:6].reshape(-1, 3), arr[-6:].reshape(-1, 3)]), axis=0).astype(np.uint8)
arr[:, :max(0, x0 - 6)] = bgc; arr[:, x1 + 7:] = bgc
src = Image.fromarray(arr)
pad = Image.new('RGB', (im.width + 2 * side, im.height + 2 * side), tuple(int(v) for v in bgc)); pad.paste(src, (side, side))
canvas = pad.crop((cx + side // 2, cy + side // 2, cx + side + side // 2, cy + side + side // 2))
canvas.resize((200, 200), Image.LANCZOS).save(base + '-t.jpg', quality=85)
print(base, len(runs), 'Ansichten')
