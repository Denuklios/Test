// Alle eingebauten Stickschriften: Satinsäulen müssen quer über die Säule laufen
// (früher wurden bei Schlaufen – z. B. Chopin A/C – Schienen falsch gepaart und die Schlaufe zugestickt)
global.window = global;
['geometry', 'stitchgen', 'inkfont'].forEach((m) => require('../js/' + m + '.js'));
const fs = require('fs'), path = require('path'), G = HW.geo;
const dir = path.join(__dirname, '../js/stickfonts');
for (const f of fs.readdirSync(dir)) if (f !== 'index.js') require(path.join(dir, f));
let fail = 0, cols = 0;
const bad = [];
for (const font of Object.values(HW.INKFONTS)) {
  for (const ch of Object.keys(font.glyphs)) {
    HW.layoutInkText(font, { text: ch, height: 20 }).objects.forEach((o) => {
      if (o.type !== 'colA') return;
      cols++;
      const L = [], R = [];
      for (let k = 0; k + 1 < o.points.length; k += 2) { L.push(o.points[k]); R.push(o.points[k + 1]); }
      const rl = G.buildPath(R, false).pts;
      let wrong = 0;
      L.forEach((a, k) => {
        const pd = G.dist(a, R[k]);
        let nd = Infinity;
        for (let i = 1; i < rl.length; i++) nd = Math.min(nd, G.distToSeg(a, rl[i - 1], rl[i]).d);
        if (pd > 3 && pd > 3 * Math.max(nd, 0.5)) wrong++;
      });
      // mehr als die Hälfte der Paare quer über die Form = Säule falsch gepaart
      if (wrong > L.length * 0.5 && wrong >= 3) bad.push(`${font.id} "${ch}" (${wrong}/${L.length})`);
    });
  }
}
if (bad.length) { fail++; console.log('FEHLER: falsch gepaarte Satinsäulen:', bad.join(', ')); }
else console.log(`ok ${cols} Satinsäulen in ${Object.keys(HW.INKFONTS).length} Schriften richtig gepaart`);
process.exit(fail ? 1 : 0);
