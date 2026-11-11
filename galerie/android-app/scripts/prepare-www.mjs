// Baut den Ordner www/ für die Android-App:
//  - kopiert die Galerie (index.html, css, js, Icon)
//  - schaltet auf "alles lokal" (js/config.js)
//  - lädt KI-Bibliotheken und -Modelle einmalig herunter (Zwischenspeicher .cache/) und legt sie in die App
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const webSrc = path.resolve(appDir, '..');
const www = path.join(appDir, 'www');
const cache = path.join(appDir, '.cache');

const FACE = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/';
const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/';
const HF = 'https://huggingface.co/';

// [Ziel in www/vendor, Quelle]
const DOWNLOADS = [
  ['face-api/face-api.esm.js', FACE + 'dist/face-api.esm.js'],
  ...['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model', 'face_expression_model'].flatMap((m) => [
    [`face-api/model/${m}-weights_manifest.json`, `${FACE}model/${m}-weights_manifest.json`],
    [`face-api/model/${m}.bin`, `${FACE}model/${m}.bin`],
  ]),
  ['transformers/transformers.min.js', TRANSFORMERS + 'transformers.min.js'],
  ['transformers/ort-wasm-simd-threaded.jsep.mjs', TRANSFORMERS + 'ort-wasm-simd-threaded.jsep.mjs'],
  ['transformers/ort-wasm-simd-threaded.jsep.wasm', TRANSFORMERS + 'ort-wasm-simd-threaded.jsep.wasm'],
  // Bildsuche (MobileCLIP): Bildmodell fp16, Textmodell 8-Bit
  ...['config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/vision_model_fp16.onnx', 'onnx/text_model_quantized.onnx']
    .map((f) => [`models/Xenova/mobileclip_s0/${f}`, `${HF}Xenova/mobileclip_s0/resolve/main/${f}`]),
  // Ausschneiden (SlimSAM)
  ...['config.json', 'preprocessor_config.json', 'onnx/vision_encoder_quantized.onnx', 'onnx/prompt_encoder_mask_decoder_quantized.onnx']
    .map((f) => [`models/Xenova/slimsam-77-uniform/${f}`, `${HF}Xenova/slimsam-77-uniform/resolve/main/${f}`]),
];

async function fetchCached(rel, url) {
  const file = path.join(cache, rel);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(file + '.part', buf);
      fs.renameSync(file + '.part', file);
      console.log(`  ↓ ${rel} (${(buf.length / 1e6).toFixed(1)} MB)`);
      return file;
    } catch (e) {
      console.warn(`  ! ${rel}: ${e.message} (Versuch ${attempt})`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw new Error('Download fehlgeschlagen: ' + url);
}

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (skip(a, e)) continue;
    e.isDirectory() ? copyDir(a, b, skip) : fs.copyFileSync(a, b);
  }
}

fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

// 1. Web-App kopieren
for (const f of ['icon.svg', 'manifest.webmanifest']) fs.copyFileSync(path.join(webSrc, f), path.join(www, f));
copyDir(path.join(webSrc, 'css'), path.join(www, 'css'));
copyDir(path.join(webSrc, 'js'), path.join(www, 'js'));
fs.writeFileSync(path.join(www, 'js/config.js'), '// Android-App: alle KI-Modelle liegen in der App\nexport const LOCAL = true;\n');

// 2. index.html: Capacitor-Brücke laden (für den Zugriff auf die Handy-Fotos)
let html = fs.readFileSync(path.join(webSrc, 'index.html'), 'utf8');
html = html.replace('<script type="module" src="js/app.js"></script>', '<script src="capacitor.js"></script>\n  <script type="module" src="js/app.js"></script>');
fs.writeFileSync(path.join(www, 'index.html'), html);
fs.copyFileSync(path.join(appDir, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(www, 'capacitor.js'));

// 3. KI-Bibliotheken und Modelle
console.log('KI-Modelle bereitstellen …');
let total = 0;
for (const [rel, url] of DOWNLOADS) {
  const src = await fetchCached(rel, url);
  const dst = path.join(www, 'vendor', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  total += fs.statSync(dst).size;
}
console.log(`Fertig: www/ (Modelle ${(total / 1e6).toFixed(0)} MB)`);
