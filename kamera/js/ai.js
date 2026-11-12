// KI-Werkzeuge: Gegenstände entfernen (LaMa) und Gegenstand antippen (SlimSAM).
// Im Handy läuft die KI nativ (schnell, alle Prozessorkerne); im Browser (zum Testen) über onnxruntime-web.
const cap = window.capacitorExports;
const isNative = !!cap?.Capacitor?.isNativePlatform?.();
const Ai = isNative ? cap.registerPlugin('Ai') : null;

const b64 = (canvas, type = 'image/png', q) => canvas.toDataURL(type, q).split(',')[1];
const loadImg = (b) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + b; });

/* ---------- Browser-Ersatz ---------- */
let ortP = null;
const sessions = {};
async function ort() {
  if (!ortP) ortP = import('../vendor/ort/ort.wasm.min.mjs').then((m) => {
    m.env.logLevel = 'error';
    m.env.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
    m.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    return m;
  });
  return ortP;
}
async function session(name) {
  const o = await ort();
  if (!sessions[name]) sessions[name] = o.InferenceSession.create(new URL(`../models/${name}`, import.meta.url).href, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return sessions[name];
}

export async function warmup(model) {
  try {
    if (Ai) await Ai.warmup({ model });
    else if (model === 'lama') await session('lama.onnx');
    else { await session('sam_encoder.onnx'); await session('sam_decoder.onnx'); }
    return true;
  } catch (e) { console.warn(e); return false; }
}

/** img512, mask512: Canvas 512×512 (Maske: weiß = entfernen) → Canvas 512×512 */
export async function inpaint512(img512, mask512) {
  const out = document.createElement('canvas'); out.width = out.height = 512;
  if (Ai) {
    const r = await Ai.inpaint({ image: b64(img512), mask: b64(mask512) });
    out.getContext('2d').drawImage(await loadImg(r.image), 0, 0);
    return out;
  }
  const o = await ort();
  const s = await session('lama.onnx');
  const S = 512, N = S * S;
  const id = img512.getContext('2d').getImageData(0, 0, S, S).data;
  const md = mask512.getContext('2d').getImageData(0, 0, S, S).data;
  const image = new Float32Array(3 * N), mask = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const h = md[i * 4] > 127 ? 1 : 0; mask[i] = h;
    const k = (1 - h) / 255;
    image[i] = id[i * 4] * k; image[N + i] = id[i * 4 + 1] * k; image[2 * N + i] = id[i * 4 + 2] * k;
  }
  const res = await s.run({ image: new o.Tensor('float32', image, [1, 3, S, S]), mask: new o.Tensor('float32', mask, [1, 1, S, S]) });
  const d = res.output.data;
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < N; i++) { img.data[i * 4] = d[i]; img.data[i * 4 + 1] = d[N + i]; img.data[i * 4 + 2] = d[2 * N + i]; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return out;
}

/* ---------- Antippen (Segment Anything) ---------- */
let samWeb = null; // {emb, pos, scale, rw, rh}
/** Bild (Canvas) einmalig analysieren */
export async function samEncode(canvas) {
  if (Ai) { await Ai.samEncode({ image: b64(canvas, 'image/jpeg', 0.92) }); return; }
  const o = await ort();
  const enc = await session('sam_encoder.onnx');
  await session('sam_decoder.onnx');
  const W = canvas.width, H = canvas.height, scale = 1024 / Math.max(W, H);
  const rw = Math.round(W * scale), rh = Math.round(H * scale);
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const x = c.getContext('2d'); x.drawImage(canvas, 0, 0, rw, rh);
  const d = x.getImageData(0, 0, 1024, 1024).data;
  const N = 1024 * 1024, px = new Float32Array(3 * N);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let y = 0; y < rh; y++) for (let xx = 0; xx < rw; xx++) {
    const i = y * 1024 + xx;
    for (let ch = 0; ch < 3; ch++) px[ch * N + i] = (d[i * 4 + ch] / 255 - mean[ch]) / std[ch];
  }
  const r = await enc.run({ pixel_values: new o.Tensor('float32', px, [1, 3, 1024, 1024]) });
  samWeb = { emb: r.image_embeddings, pos: r.image_positional_embeddings, scale, rw, rh };
}

/**
 * points: [[x, y, label]] in Koordinaten des analysierten Bildes.
 * → {masks: [Canvas …] (Graustufen, 128 = Grenze; deckt (cropW × cropH) ab), scores, cropW, cropH}
 */
export async function samDecode(points) {
  if (Ai) {
    const r = await Ai.samDecode({ points });
    const masks = [];
    for (const m of r.masks) {
      const im = await loadImg(m);
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      c.getContext('2d').drawImage(im, 0, 0); masks.push(c);
    }
    return { masks, scores: r.scores, cropW: r.cropW, cropH: r.cropH };
  }
  const o = await ort();
  const dec = await session('sam_decoder.onnx');
  const n = points.length;
  const pts = new Float32Array(n * 2), lab = new BigInt64Array(n);
  points.forEach(([x, y, l], i) => { pts[i * 2] = x * samWeb.scale; pts[i * 2 + 1] = y * samWeb.scale; lab[i] = BigInt(l); });
  const r = await dec.run({
    input_points: new o.Tensor('float32', pts, [1, 1, n, 2]),
    input_labels: new o.Tensor('int64', lab, [1, 1, n]),
    image_embeddings: samWeb.emb, image_positional_embeddings: samWeb.pos,
  });
  const md = r.pred_masks.data, sc = r.iou_scores.data;
  const mw = Math.ceil(samWeb.rw / 4), mh = Math.ceil(samWeb.rh / 4);
  const masks = [];
  for (let k = 0; k < 3; k++) {
    const c = document.createElement('canvas'); c.width = mw; c.height = mh;
    const cx = c.getContext('2d'); const id = cx.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
      const g = Math.max(0, Math.min(255, Math.round(128 + md[k * 65536 + y * 256 + x] * 24)));
      const j = (y * mw + x) * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = g; id.data[j + 3] = 255;
    }
    cx.putImageData(id, 0, 0); masks.push(c);
  }
  return { masks, scores: [...sc], cropW: samWeb.rw / 4, cropH: samWeb.rh / 4 };
}
