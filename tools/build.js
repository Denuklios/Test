/* Baut den Programmcode für die Online-Version zu EINER verschleierten Datei zusammen (dist/).
   Der Server liefert dann nur noch diese Datei aus – die lesbaren Quelltexte bleiben auf dem Server.
   Aufruf: npm run build   (einmalig vorher: npm install) */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { minify } = require('terser');
const Obfuscator = require('javascript-obfuscator');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

// Reine Daten (Schriften) bleiben eigene Dateien; Formatcode gehört nur auf den Server.
const DATA = new Set(['js/fonts.js', 'js/inkfonts/index.js']);
const SERVER_ONLY = new Set(['js/dst_io.js', 'js/formats.js']);

function sources() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const list = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map((m) => m[1]).filter((f) => !DATA.has(f) && !SERVER_ONLY.has(f));
  // Online-Anbindung direkt vor dem Programm
  list.splice(list.indexOf('js/app.js'), 0, 'js/online.js');
  return list;
}

async function build({ obfuscate = true } = {}) {
  const files = sources();
  const code = files.map((f) => `/* ${f} */\n` + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  const t0 = Date.now();
  const min = await minify(code, {
    ecma: 2020,
    compress: { passes: 2, drop_debugger: true },
    mangle: { toplevel: true },
    format: { comments: false },
  });
  let out = min.code;
  if (obfuscate) {
    out = Obfuscator.obfuscate(out, {
      compact: true,
      target: 'browser',
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false,
      stringArray: true,
      stringArrayThreshold: 0.75,
      stringArrayEncoding: [],
      stringArrayWrappersCount: 0,
      stringArrayCallsTransform: false,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      splitStrings: false,
      // bewusst aus: würden das Zeichnen und die Stichberechnung spürbar verlangsamen
      controlFlowFlattening: false,
      deadCodeInjection: false,
      selfDefending: false,
      debugProtection: false,
      transformObjectKeys: false,
      unicodeEscapeSequence: false,
    }).getObfuscatedCode();
  }
  const hash = crypto.createHash('sha256').update(out).digest('hex').slice(0, 12);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const name = `app.${hash}.js`;
  fs.writeFileSync(path.join(OUT, name), out);
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ bundle: name, data: [...DATA], files, built: new Date().toISOString() }, null, 1));
  console.log(`dist/${name}: ${(out.length / 1024).toFixed(0)} KB aus ${files.length} Dateien (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return name;
}

if (require.main === module) build({ obfuscate: !process.argv.includes('--no-obfuscate') }).catch((e) => { console.error(e); process.exit(1); });
module.exports = { build, sources, DATA };
