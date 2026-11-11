// Web-Worker zum Freistellen: SlimSAM ("Segment Anything") findet das Objekt unter dem Finger.
// ?local=1 → Bibliothek und Modell liegen in der App (Android), sonst einmalig aus dem Internet
const Q = new URLSearchParams(self.location.search);
const LOCAL = Q.get('local') === '1';
const DTYPE = 'q8'; // 14 MB, liefert gleich gute Masken wie fp16
const VENDOR = new URL('../vendor/', self.location.href).href;
const MODEL = 'Xenova/slimsam-77-uniform';
let T, model, processor, ready;
let current = null; // { id, inputs, embeddings }

async function init() {
  if (!ready) {
    ready = (async () => {
      T = await import(LOCAL ? VENDOR + 'transformers/transformers.min.js' : 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js');
      T.env.useBrowserCache = !LOCAL;
      if (LOCAL) {
        T.env.allowRemoteModels = false;
        T.env.allowLocalModels = true;
        T.env.localModelPath = VENDOR + 'models/';
        T.env.backends.onnx.wasm.wasmPaths = VENDOR + 'transformers/';
      } else T.env.allowLocalModels = false;
      const progress_callback = (p) => { if (p.status === 'progress' && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); };
      [model, processor] = await Promise.all([
        T.SamModel.from_pretrained(MODEL, { dtype: DTYPE, device: 'wasm', progress_callback }),
        T.AutoProcessor.from_pretrained(MODEL, { progress_callback }),
      ]);
    })();
  }
  return ready;
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    await init();
    if (type === 'image') {
      // Bild einmal "verstehen" (dauert etwas), danach ist jeder Fingertipp schnell
      const image = await T.RawImage.fromBlob(e.data.blob);
      const inputs = await processor(image);
      const embeddings = await model.get_image_embeddings(inputs);
      current = { key: e.data.key, inputs, embeddings };
      postMessage({ id, type: 'result' });
    } else if (type === 'point') {
      if (!current) throw new Error('Kein Bild geladen');
      const [h, w] = current.inputs.reshaped_input_sizes[0];
      const pts = e.data.points; // [[x, y, label]] relativ 0..1, label 1 = gehört dazu, 0 = gehört nicht dazu
      const input_points = new T.Tensor('float32', pts.flatMap(([x, y]) => [x * w, y * h]), [1, 1, pts.length, 2]);
      const input_labels = new T.Tensor('int64', pts.map((p) => BigInt(p[2] ?? 1)), [1, 1, pts.length]);
      const out = await model({ ...current.embeddings, input_points, input_labels });
      const masks = await processor.post_process_masks(out.pred_masks, current.inputs.original_sizes, current.inputs.reshaped_input_sizes);
      const scores = [...out.iou_scores.data];
      const m = masks[0];
      const [, n, H, W] = m.dims;
      // alle Vorschläge (klein → groß) zurückgeben; die App lässt zwischen ihnen wechseln
      const planes = [];
      for (let k = 0; k < n; k++) {
        const plane = new Uint8Array(W * H);
        let area = 0;
        for (let i = 0, o = k * W * H; i < W * H; i++) if (m.data[o + i]) { plane[i] = 255; area++; }
        planes.push({ mask: plane, score: scores[k], area });
      }
      planes.sort((a, b) => a.area - b.area);
      postMessage({ id, type: 'result', masks: planes, w: W, h: H }, planes.map((p) => p.mask.buffer));
    }
  } catch (err) {
    postMessage({ id, type: 'error', error: String(err?.message || err) });
  }
};
