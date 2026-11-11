// Web-Worker für die "smarte Suche": MobileCLIP wandelt Bilder und Suchtexte in Vektoren um.
// Läuft komplett im Browser; das Modell (~66 MB) wird beim ersten Mal geladen und dann zwischengespeichert.
// ?local=1 → Bibliothek und Modell liegen in der App (Android), sonst einmalig aus dem Internet
const LOCAL = new URLSearchParams(self.location.search).get('local') === '1';
const VENDOR = new URL('../vendor/', self.location.href).href;
const MODEL = 'Xenova/mobileclip_s0';
let T; // transformers.js

async function lib() {
  if (!T) {
    T = await import(LOCAL ? VENDOR + 'transformers/transformers.min.js' : 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js');
    T.env.useBrowserCache = !LOCAL;
    if (LOCAL) {
      T.env.allowRemoteModels = false;
      T.env.allowLocalModels = true;
      T.env.localModelPath = VENDOR + 'models/';
      T.env.backends.onnx.wasm.wasmPaths = VENDOR + 'transformers/';
    } else {
      T.env.allowLocalModels = false;
    }
  }
  return T;
}

let ready;
let tokenizer, textModel, processor, visionModel;

function progress(p) {
  if (p.status === 'progress' && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
}

function init() {
  if (!ready) {
    ready = (async () => {
      const { AutoTokenizer, AutoProcessor, CLIPVisionModelWithProjection, CLIPTextModelWithProjection } = await lib();
      // Hinweis: Das Bildmodell in 8-Bit liefert unbrauchbare Ergebnisse – daher fp16 (23 MB) + Textmodell 8-Bit (43 MB)
      const opts = { progress_callback: progress, device: 'wasm' };
      [tokenizer, processor] = await Promise.all([
        AutoTokenizer.from_pretrained(MODEL, { progress_callback: progress }),
        AutoProcessor.from_pretrained(MODEL, { progress_callback: progress }),
      ]);
      [visionModel, textModel] = await Promise.all([
        CLIPVisionModelWithProjection.from_pretrained(MODEL, { ...opts, dtype: 'fp16' }),
        CLIPTextModelWithProjection.from_pretrained(MODEL, { ...opts, dtype: 'q8' }),
      ]);
    })();
  }
  return ready;
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    await init();
    if (type === 'init') return postMessage({ id, type: 'ready' });
    if (type === 'image') {
      const image = await T.RawImage.fromBlob(e.data.blob);
      const inputs = await processor(image);
      const { image_embeds } = await visionModel(inputs);
      const vec = new Float32Array(image_embeds.normalize(2, -1).data);
      postMessage({ id, type: 'result', vec }, [vec.buffer]);
    } else if (type === 'text') {
      const inputs = tokenizer(e.data.texts, { padding: 'max_length', truncation: true });
      const { text_embeds } = await textModel(inputs);
      const norm = text_embeds.normalize(2, -1);
      const dim = norm.dims[1];
      const all = new Float32Array(norm.data);
      const vecs = e.data.texts.map((_, i) => all.slice(i * dim, (i + 1) * dim));
      postMessage({ id, type: 'result', vecs });
    }
  } catch (err) {
    postMessage({ id, type: 'error', error: String(err?.message || err) });
  }
};
