import sys, os, io, base64, json
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer

src = sys.argv[1]   # Ordner mit list.txt und *.ttf
dst = sys.argv[2]   # Zielordner für die verkleinerten TTF
os.makedirs(dst, exist_ok=True)
# Zeichen: ASCII, deutsch/dänisch/skandinavisch/französisch, Euro, Gedankenstrich, typogr. Anführungszeichen
text = ''.join(chr(c) for c in range(32, 127)) + 'ÄÖÜäöüßÆØÅæøåÉÈÊËéèêëÀÂàâÇçÎÏîïÔôÛûÙùÿŸÑñÓóÍíÚúÁá€–—„“”‚‘’«»…°§©®™•·×÷±²³½¼¾µ'
def gpos_kerning(f):
    """Paar-Abstände (XAdvance) der kern-Lookups aus GPOS als {(links, rechts): Wert} in Glyphennamen."""
    if 'GPOS' not in f:
        return {}
    g = f['GPOS'].table
    if not g.FeatureList or not g.LookupList:
        return {}
    idx = set()
    for fr in g.FeatureList.FeatureRecord:
        if fr.FeatureTag == 'kern':
            idx.update(fr.Feature.LookupListIndex)
    order = f.getGlyphOrder()
    out = {}
    for li in sorted(idx):
        lk = g.LookupList.Lookup[li]
        seen = set()
        for st in lk.SubTable:
            if lk.LookupType == 9:
                st = st.ExtSubTable
            if getattr(st, 'LookupType', 2) != 2 and lk.LookupType not in (2, 9):
                continue
            if not hasattr(st, 'Format'):
                continue
            cov = st.Coverage.glyphs
            if st.Format == 1:
                for i, left in enumerate(cov):
                    for rec in st.PairSet[i].PairValueRecord:
                        v = getattr(rec.Value1, 'XAdvance', 0) if rec.Value1 else 0
                        key = (left, rec.SecondGlyph)
                        if v and key not in seen:
                            seen.add(key); out[key] = out.get(key, 0) + v
            elif st.Format == 2:
                c1 = st.ClassDef1.classDefs; c2 = st.ClassDef2.classDefs
                for left in cov:
                    r1 = st.Class1Record[c1.get(left, 0)]
                    for right in order:
                        rec = r1.Class2Record[c2.get(right, 0)]
                        v = getattr(rec.Value1, 'XAdvance', 0) if rec.Value1 else 0
                        key = (left, right)
                        if v and key not in seen:
                            seen.add(key); out[key] = out.get(key, 0) + v
    # nur Paare aus Buchstaben, Ziffern und häufigen Satzzeichen, und nur spürbare Abstände (≥ 1 % der Schrifthöhe)
    keep = set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÄÖÜäöüßÆØÅæøå0123456789.,;:-!?\'"„“”‚‘’')
    rev = {}
    for cp, gn in f.getBestCmap().items():
        rev.setdefault(gn, chr(cp))
    upm = f['head'].unitsPerEm
    return {k: max(-32768, min(32767, int(v))) for k, v in out.items()
            if v and abs(v) >= upm * 0.01 and rev.get(k[0]) in keep and rev.get(k[1]) in keep}

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
    # FräsStudio liest nur die alte kern-Tabelle: Paar-Kerning aus GPOS dorthin übertragen
    if 'kern' not in f:
        pairs = gpos_kerning(f)
        if pairs:
            from fontTools.ttLib import newTable
            from fontTools.ttLib.tables._k_e_r_n import KernTable_format_0
            kt = newTable('kern'); kt.version = 0; kt.kernTables = []
            items = sorted(pairs.items())
            for i in range(0, len(items), 10000):
                st = KernTable_format_0(); st.version = 0; st.coverage = 1; st.format = 0; st.apple = False; st.tupleIndex = None
                st.kernTable = dict(items[i:i + 10000])
                kt.kernTables.append(st)
            f['kern'] = kt
            print(f'   {len(pairs)} Kerning-Paare aus GPOS')
    buf = io.BytesIO()
    f.save(buf)
    data = buf.getvalue()
    if 'glyf' not in TTFont(io.BytesIO(data)):
        print('SKIP (keine glyf-Tabelle)', name)
        continue
    open(os.path.join(dst, name.replace(' ', '') + '.ttf'), 'wb').write(data)
    entries.append({'name': name, 'cat': cat, 'data': base64.b64encode(data).decode()})
    print(f'{name:26s} {len(data)//1024:4d} KB')
out = ['/* Schriften für FräsStudio (Google Fonts, SIL Open Font License 1.1 bzw. Apache 2.0, siehe fonts/LIZENZEN.txt).',
       '   Auf Latein-1 + Euro verkleinert, variable Schriften fett (700), Unterschneidung (Kerning) aus GPOS in die kern-Tabelle übernommen.',
       '   Erzeugt mit tools/fonts_build.py aus fonts/quellen.txt. */',
       '(function (g) {', '  const HW = (g.HW = g.HW || {});', '  HW.FONTS = [']
out.append(',\n'.join('    ' + json.dumps(e, ensure_ascii=False) for e in entries))
out += ['  ];', "})(typeof window !== 'undefined' ? window : globalThis);", '']
open(sys.argv[3], 'w', encoding='utf-8').write('\n'.join(out))
print('gesamt', sum(len(e['data']) for e in entries) // 1024, 'KB base64')
