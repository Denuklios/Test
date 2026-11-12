// Baut den Ordner www/ für die Android-App: kopiert die Kamera-Oberfläche (index.html, css, js, vendor)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const webSrc = path.resolve(appDir, '..');
const www = path.join(appDir, 'www');
const cache = path.join(appDir, '.cache');

// KI-Modelle (einmalig herunterladen, liegen danach in .cache/)
const MODELS = [
  // LaMa (Gegenstände entfernen), Gewichte 8-Bit gespeichert, Rechnung in voller Genauigkeit – Apache-2.0
  ['lama.onnx', 'https://huggingface.co/opencv/inpainting_lama/resolve/main/inpainting_lama_2025jan.onnx'],
  // SlimSAM (Gegenstand antippen) – Apache-2.0
  ['sam_encoder.onnx', 'https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder_quantized.onnx'],
  ['sam_decoder.onnx', 'https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/prompt_encoder_mask_decoder_quantized.onnx'],
];
async function fetchCached(name, url) {
  const file = path.join(cache, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  fs.mkdirSync(cache, { recursive: true });
  console.log('Lade', name, '…');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  fs.writeFileSync(file + '.tmp', Buffer.from(await res.arrayBuffer()));
  fs.renameSync(file + '.tmp', file);
  return file;
}

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const item of ['index.html', 'icon.svg', 'css', 'js', 'vendor']) {
  const src = path.join(webSrc, item);
  // vendor/ort (Browser-KI) wird in der App nicht gebraucht – dort rechnet Android selbst
  if (fs.existsSync(src)) fs.cpSync(src, path.join(www, item), { recursive: true, filter: (f) => !f.includes(path.join('vendor', 'ort')) });
}
fs.mkdirSync(path.join(www, 'models'), { recursive: true });
for (const [name, url] of MODELS) fs.copyFileSync(await fetchCached(name, url), path.join(www, 'models', name));
// Capacitor-Brücke (Speichern in die Handy-Galerie, Teilen)
const indexFile = path.join(www, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
html = html.replace('<script type="module" src="js/app.js"></script>', '<script src="capacitor.js"></script>\n  <script type="module" src="js/app.js"></script>');
fs.writeFileSync(indexFile, html);
fs.copyFileSync(path.join(appDir, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(www, 'capacitor.js'));
console.log('www/ bereit');
