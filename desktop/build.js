/* Baut ein Desktop-Programm mit Installer.
   Aufruf:  node build.js laser            (Installer für das aktuelle Betriebssystem)
            node build.js laser --win      (Windows-Installer, geht auch unter Linux)
            node build.js laser --linux --win --mac
            node build.js laser --dir      (nur den Programmordner out/laser vorbereiten, ohne Installer)
            node build.js laser --plain    (ohne Verschleierung, zum Testen)
   Einstellungen: settings.json (Lizenzserver, Kauf-Link, Version), products.json (Programme). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const args = process.argv.slice(2);
const product = args.find((a) => !a.startsWith('--'));
const flag = (f) => args.includes('--' + f);
const products = JSON.parse(fs.readFileSync(path.join(HERE, 'products.json'), 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(HERE, 'settings.json'), 'utf8'));
const P = products[product];
if (!P) { console.error(`Programm angeben: ${Object.keys(products).join(', ')}`); process.exit(1); }
const SRC = path.resolve(HERE, P.src);
const OUT = path.join(HERE, 'out', product);
const APP = path.join(OUT, 'app');

function copy(from, to) {
  const st = fs.statSync(from);
  if (st.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const f of fs.readdirSync(from)) if (!['tests', 'models', 'node_modules', '.DS_Store'].includes(f)) copy(path.join(from, f), path.join(to, f));
  } else { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
}

/** Programmcode zu einer verschleierten Datei zusammenfassen (wie bei der Online-Version). Daten-Dateien bleiben einzeln. */
async function bundle() {
  const htmlFile = path.join(APP, 'index.html');
  let html = fs.readFileSync(htmlFile, 'utf8');
  const isData = (f) => P.data.some((d) => (d.endsWith('/') ? f.startsWith(d) : f === d));
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>\s*/g)];
  const code = scripts.filter((m) => !isData(m[1])).map((m) => m[1]);
  if (!code.length) return;
  const src = code.map((f) => `/* ${f} */\n` + fs.readFileSync(path.join(APP, f), 'utf8')).join('\n;\n');
  let out = src;
  if (!flag('plain')) {
    const { minify } = require('terser');
    const Obfuscator = require('javascript-obfuscator');
    out = (await minify(src, { ecma: 2020, compress: { passes: 2, drop_debugger: true }, mangle: { toplevel: true }, format: { comments: false } })).code;
    out = Obfuscator.obfuscate(out, {
      compact: true, target: 'browser', identifierNamesGenerator: 'hexadecimal', renameGlobals: false,
      stringArray: true, stringArrayThreshold: 0.75, stringArrayRotate: true, stringArrayShuffle: true,
      // bewusst aus: würden Zeichnen und Berechnen spürbar verlangsamen
      controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, debugProtection: false,
    }).getObfuscatedCode();
  }
  const name = `js/app.${crypto.createHash('sha256').update(out).digest('hex').slice(0, 10)}.js`;
  fs.writeFileSync(path.join(APP, name), out);
  // alle Code-Dateien durch die eine Datei ersetzen (an der Stelle der ersten), Daten-Dateien bleiben in ihrer Reihenfolge
  let first = true;
  html = html.replace(/<script src="([^"]+)"><\/script>(\s*)/g, (all, f, ws) => {
    if (isData(f)) return all;
    if (first) { first = false; return `<script src="${name}"></script>${ws}`; }
    return '';
  });
  // die gebündelte Datei muss nach den Daten-Dateien laufen, die vor ihr standen → ans Ende der Datenblöcke stellen
  const tag = `<script src="${name}"></script>`;
  html = html.replace(tag + '\n', '').replace(tag, '');
  html = html.replace(/(<\/body>)/, `${tag}\n$1`);
  fs.writeFileSync(htmlFile, html);
  for (const f of code) fs.rmSync(path.join(APP, f), { force: true });
  console.log(`Programmcode gebündelt${flag('plain') ? '' : ' und verschleiert'}: ${code.length} Dateien → ${name} (${Math.round(out.length / 1024)} kB)`);
}

async function main() {
  console.log(`=== ${P.name} ${settings.version} ===`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });
  for (const f of P.files) {
    const from = path.join(SRC, f);
    if (!fs.existsSync(from)) { console.warn('fehlt: ' + f); continue; }
    copy(from, path.join(APP, f));
  }
  await bundle();
  // Hülle und Lizenz
  for (const f of ['main.js', 'preload.js', 'license.js', 'license.html', 'license.css', 'license-ui.js', 'license-public.pem']) fs.copyFileSync(path.join(HERE, f), path.join(OUT, f));
  fs.copyFileSync(path.join(HERE, 'icons', product + '.png'), path.join(OUT, 'icon.png'));
  if (process.env.LICENSE_SERVER) settings.licenseServer = process.env.LICENSE_SERVER;
  if (!settings.licenseServer) console.warn('Hinweis: In settings.json ist kein „licenseServer“ eingetragen – Freischalten geht dann nur offline mit Freischaltcode.');
  fs.writeFileSync(path.join(OUT, 'product.json'), JSON.stringify({ product, code: P.code, name: P.name, server: settings.licenseServer || '', buyUrl: (settings.buyUrl || {})[product] || '', trialDays: settings.trialDays || 14 }, null, 1));
  const electronVersion = require('electron/package.json').version;
  const pkg = { name: product + 'studio', productName: P.name, version: settings.version, description: P.description, main: 'main.js', author: settings.publisher || P.name, homepage: settings.homepage || undefined, license: 'UNLICENSED' };
  fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify(pkg, null, 1));
  if (flag('dir') && !flag('pack')) { console.log('Programmordner: ' + OUT); return; }

  const builder = require('electron-builder');
  const targets = [];
  if (flag('win')) targets.push(...builder.Platform.WINDOWS.createTarget());
  const plat = [];
  if (flag('win')) plat.push(builder.Platform.WINDOWS);
  if (flag('mac')) plat.push(builder.Platform.MAC);
  if (flag('linux')) plat.push(builder.Platform.LINUX);
  if (!plat.length) plat.push(builder.Platform.current());
  const config = {
    appId: P.appId, productName: P.name, electronVersion, copyright: settings.copyright || undefined, asar: true, compression: 'maximum',
    directories: { output: path.join(HERE, 'dist'), app: OUT, buildResources: OUT },
    files: ['**/*'],
    artifactName: `${product}studio-\${version}-\${os}-\${arch}.\${ext}`,
    win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: path.join(OUT, 'icon.png'), signAndEditExecutable: process.platform === 'win32' || !!process.env.WINE_OK },
    nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: P.name, uninstallDisplayName: P.name, language: '1031' },
    mac: { target: [{ target: 'dmg', arch: ['universal'] }], category: 'public.app-category.graphics-design', icon: path.join(OUT, 'icon.png') },
    linux: { target: [{ target: 'AppImage', arch: ['x64'] }], category: 'Graphics', icon: path.join(OUT, 'icon.png'), maintainer: settings.publisher || P.name, synopsis: P.description },
    publish: null,
  };
  for (const p of plat) {
    await builder.build({ targets: p.createTarget(), config, projectDir: OUT });
  }
  console.log('Fertig. Installer liegen in ' + path.join(HERE, 'dist'));
}
main().catch((e) => { console.error(e); process.exit(1); });
