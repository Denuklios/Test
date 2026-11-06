"""Produktfotos für den Konfigurator vorbereiten.

Aufruf:  python3 freistellen.py <quelle.png> <ziel-ohne-endung> [schwelle] [kante] ["x,y;x,y" Öffnungen] [schatten] [-] [glätten] [bodenschatten-px]
Ergebnis: <ziel>.jpg (Foto) und <ziel>-m.png (Maske: weiß = Produkt, schwarz = Hintergrund).

Der Hintergrund darf hellgrau sein. Er wird als sanfter Verlauf aus den Bildrändern geschätzt; alles, was
vom Rand her erreichbar ist und fast dieselbe Helligkeit hat, gilt als Hintergrund. Große eingeschlossene
Hintergrundflächen (z. B. die Öffnung hinten an der Kappe oder das Loch im Tassenhenkel) werden ebenfalls entfernt.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

src, dst = sys.argv[1], sys.argv[2]
T = float(sys.argv[3]) if len(sys.argv) > 3 else 8.0
G = float(sys.argv[4]) if len(sys.argv) > 4 else 4.0
TD = float(sys.argv[6]) if len(sys.argv) > 6 else T
HELL = len(sys.argv) > 7 and sys.argv[7] == 'hell'
OPEN = int(sys.argv[8]) if len(sys.argv) > 8 else 1
BODEN = int(sys.argv[9]) if len(sys.argv) > 9 else 0
SEEDS = [tuple(int(v) for v in p.split(',')) for p in (sys.argv[5].split(';') if len(sys.argv) > 5 and sys.argv[5] else [])]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
h, w, _ = a.shape
L = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
chroma = a.max(axis=2) - a.min(axis=2)

# Hintergrund als Ebene L = c0 + c1*x + c2*y + c3*x*y aus einem 6-px-Randstreifen schätzen
b = 6
yy, xx = np.mgrid[0:h, 0:w]
edge = np.zeros((h, w), bool); edge[:b] = edge[-b:] = True; edge[:, :b] = edge[:, -b:] = True
X = np.stack([np.ones(edge.sum()), xx[edge] / w, yy[edge] / h, (xx[edge] / w) * (yy[edge] / h)], 1)
coef, *_ = np.linalg.lstsq(X, L[edge], rcond=None)
bg = coef[0] + coef[1] * xx / w + coef[2] * yy / h + coef[3] * (xx / w) * (yy / h)
d = L - bg

# Kanten des Produkts als Wand: über sie hinweg darf der Hintergrund nicht „auslaufen“
g = np.hypot(ndi.sobel(ndi.gaussian_filter(L, 1.0), 0), ndi.sobel(ndi.gaussian_filter(L, 1.0), 1))
wall = ndi.binary_dilation(g > G, iterations=1)
# Bodenschatten (dunkler als der Hintergrund) bis TD mit entfernen
cand = (d <= T) & (d >= -TD) & (chroma <= 10) & ~wall
lab, n = ndi.label(cand)
border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
bgmask = np.isin(lab, border[border > 0])
# Wandpixel direkt am Hintergrund, die selbst hintergrundfarbig sind, gehören auch dazu
bgmask |= ndi.binary_dilation(bgmask, iterations=2) & (np.abs(d) <= T * 0.5) & (chroma <= 10)
# eingeschlossene Öffnungen (Kappe hinten, Tassenhenkel): Startpunkte von Hand
for sx, sy in SEEDS:
    lab2, _ = ndi.label((np.abs(d) <= T) & ~wall)
    k = lab2[sy, sx]
    if k:
        bgmask |= lab2 == k
fg = ~bgmask
# Krümel entfernen, kleine Löcher schließen
fg = ndi.binary_opening(fg, iterations=OPEN)  # dünne Säume (z. B. Bodenschatten) entfernen
lab3, n3 = ndi.label(fg)
if n3:
    sizes = ndi.sum(np.ones_like(lab3), lab3, index=np.arange(1, n3 + 1))
    fg = np.isin(lab3, np.nonzero(sizes >= 800)[0] + 1)
holes = ndi.binary_fill_holes(fg) & ~fg
lab4, n4 = ndi.label(holes)
if n4:
    sizes = ndi.sum(np.ones_like(lab4), lab4, index=np.arange(1, n4 + 1))
    fg |= np.isin(lab4, np.nonzero(sizes < 400)[0] + 1)
if HELL:
    # Helles Produkt auf grauem Grund (Kappe): Produkt = heller als der Grund oder sehr dunkel (Schirm-Unterseite).
    # Der Bodenschatten liegt dazwischen (etwas dunkler als der Grund) und bleibt draußen.
    br = (d > 2) | (d < -46)
    br = ndi.binary_closing(br, iterations=2)
    lab5, n5 = ndi.label(br)
    if n5:
        sizes = ndi.sum(np.ones_like(lab5), lab5, index=np.arange(1, n5 + 1))
        br = np.isin(lab5, np.nonzero(sizes >= 5000)[0] + 1)
    br = ndi.binary_fill_holes(br)
    fg = ndi.gaussian_filter(br.astype(np.float32), 1.5) > 0.5
if BODEN:
    # Bodenschatten unten am Produkt nicht mitfärben: je Spalte von unten nach oben alles abtragen, was weder
    # heller als der Grund (Produkt) noch sehr dunkel (Unterseite des Schirms) ist.
    for x in range(w):
        ys = np.nonzero(fg[:, x])[0]
        if not len(ys):
            continue
        y = ys[-1]
        k = 0
        while y >= 0 and fg[y, x] and k < BODEN and -46 <= d[y, x] <= 2:
            fg[y, x] = False; y -= 1; k += 1
    # Umriss glätten (Zacken vom spaltenweisen Abtragen weg)
    fg = ndi.gaussian_filter(fg.astype(np.float32), 2.0) > 0.5
m = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
m.save(dst + '-m.png', optimize=True)
im.save(dst + '.jpg', quality=90, optimize=True, progressive=True)
print(dst, 'Produktanteil', round(fg.mean() * 100, 1), '%')
