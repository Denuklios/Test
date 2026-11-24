import sys, os, io, base64, json
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer

src = sys.argv[1]   # Ordner mit list.txt und *.ttf
dst = sys.argv[2]   # Zielordner für die verkleinerten TTF
os.makedirs(dst, exist_ok=True)
# Zeichen: ASCII, deutsch/dänisch/skandinavisch/französisch, Euro, Gedankenstrich, typogr. Anführungszeichen
text = ''.join(chr(c) for c in range(32, 127)) + 'ÄÖÜäöüßÆØÅæøåÉÈÊËéèêëÀÂàâÇçÎÏîïÔôÛûÙùÿŸÑñÓóÍíÚúÁá€–—„“”‚‘’«»…°§©®™•·×÷±²³½¼¾µ'
entries = []
for line in open(os.path.join(src, 'list.txt'), encoding='utf-8'):
    line = line.strip()
    if not line:
        continue
    name, cat, d, fn = line.split('|')
    path = os.path.join(src, name.replace(' ', '') + '.ttf')
    f = TTFont(path)
    if 'fvar' in f:
        axes = {a.axisTag: a for a in f['fvar'].axes}
        loc = {}
        for tag, a in axes.items():
            if tag == 'wght':
                loc[tag] = max(a.minValue, min(a.maxValue, 700 if a.maxValue >= 700 else a.maxValue))
            else:
                loc[tag] = a.defaultValue
        f = instancer.instantiateVariableFont(f, loc)
    opts = subset.Options()
    opts.layout_features = ['kern', 'liga']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    s = subset.Subsetter(opts)
    s.populate(text=text)
    s.subset(f)
    # alte kern-Tabelle (Format 0) wird vom Parser gelesen; GPOS-Kerning in kern umwandeln ist aufwendig -> belassen
    buf = io.BytesIO()
    f.save(buf)
    data = buf.getvalue()
    if 'glyf' not in TTFont(io.BytesIO(data)):
        print('SKIP (keine glyf-Tabelle)', name)
        continue
    open(os.path.join(dst, name.replace(' ', '') + '.ttf'), 'wb').write(data)
    entries.append({'name': name, 'cat': cat, 'data': base64.b64encode(data).decode()})
    print(f'{name:26s} {len(data)//1024:4d} KB')
out = ['/* Zusätzliche Schriften für FräsStudio (Google Fonts, SIL Open Font License 1.1 bzw. Apache 2.0, siehe fonts/LIZENZEN.txt).',
       '   Auf Latein-1 + Euro verkleinert, variable Schriften fett (700). Erzeugt mit tools/fonts_build.py. */',
       '(function (g) {', '  const HW = (g.HW = g.HW || {});', '  HW.FONTS = HW.FONTS || [];', '  HW.FONTS.push(']
out.append(',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries))
out += ['  );', "})(typeof window !== 'undefined' ? window : globalThis);", '']
open(sys.argv[3], 'w', encoding='utf-8').write('\n'.join(out))
print('gesamt', sum(len(e['data']) for e in entries) // 1024, 'KB base64')
