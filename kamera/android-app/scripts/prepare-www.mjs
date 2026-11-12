// Baut den Ordner www/ für die Android-App: kopiert die Kamera-Oberfläche (index.html, css, js, vendor)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const webSrc = path.resolve(appDir, '..');
const www = path.join(appDir, 'www');

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const item of ['index.html', 'icon.svg', 'css', 'js', 'vendor']) {
  const src = path.join(webSrc, item);
  if (fs.existsSync(src)) fs.cpSync(src, path.join(www, item), { recursive: true });
}
// Capacitor-Brücke (Speichern in die Handy-Galerie, Teilen)
const indexFile = path.join(www, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
html = html.replace('<script type="module" src="js/app.js"></script>', '<script src="capacitor.js"></script>\n  <script type="module" src="js/app.js"></script>');
fs.writeFileSync(indexFile, html);
fs.copyFileSync(path.join(appDir, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(www, 'capacitor.js'));
console.log('www/ bereit');
