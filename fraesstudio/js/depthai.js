/* KI-Tiefenschätzung: aus einem Foto/Render eine Höhenkarte machen (Depth Anything V2 Small, ONNX Runtime Web).
   Die Laufzeit liegt in js/lib/ort/ und wird erst bei Bedarf geladen. Das Modell (ca. 27 MB) kommt
   1. vom eigenen Server (models/…, legt deploy/install.sh an), sonst
   2. aus dem Browser-Speicher (IndexedDB), sonst
   3. einmalig aus dem Internet (HuggingFace) – oder der Nutzer wählt die Datei von Hand. */
(function (g) {
  const FS = (g.FS = g.FS || {});
  const MODEL_URL = 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx';
  const LOCAL_URL = 'models/depth-anything-v2-small.onnx';
  const DB = 'fraesstudio', STORE = 'models', KEY = 'depth-anything-v2-small';
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
  let session = null, runtime = null;

  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Datei fehlt: ' + src));
    document.head.appendChild(s);
  });

  async function gunzipB64(b64) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    return new Response(new Blob([u]).stream().pipeThrough(ds)).arrayBuffer();
  }

  // ONNX Runtime laden (ein Thread – funktioniert ohne besondere Server-Kopfzeilen und auch per Doppelklick)
  function loadRuntime() {
    if (runtime) return runtime;
    runtime = (async () => {
      const base = new URL('js/lib/ort/', document.baseURI).href;
      if (!g.ort) await loadScript(base + 'ort.wasm.min.js');
      await loadScript(base + 'ort-wasm.gz.js');
      const ort = g.ort;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmBinary = await gunzipB64(g.__ORT_WASM_GZ);
      delete g.__ORT_WASM_GZ;
      if (location.protocol === 'file:') {
        // file:// darf keine Module nachladen -> Lade-Modul als Blob
        await loadScript(base + 'ort-glue.js');
        // import.meta.url wäre eine Blob-Adresse (taugt nicht als Basis) -> echte Dateiadresse einsetzen
        const glue = g.__ORT_GLUE.split('import.meta.url').join(JSON.stringify(base + 'ort-wasm-simd-threaded.mjs'));
        ort.env.wasm.wasmPaths = { mjs: URL.createObjectURL(new Blob([glue], { type: 'text/javascript' })) };
      } else ort.env.wasm.wasmPaths = { mjs: base + 'ort-wasm-simd-threaded.mjs' };
      return ort;
    })();
    runtime.catch(() => { runtime = null; });
    return runtime;
  }

  // ---------- Modell-Speicher im Browser ----------
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet() {
    try {
      const db = await idb();
      return await new Promise((res) => {
        const q = db.transaction(STORE).objectStore(STORE).get(KEY);
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }
  async function idbPut(buf) {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(buf, KEY);
        t.oncomplete = res;
        t.onerror = () => rej(t.error);
      });
      return true;
    } catch (e) { return false; }
  }

  async function download(url, onProgress) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Download fehlgeschlagen (' + r.status + ')');
    const total = +r.headers.get('content-length') || 0;
    if (!r.body || !total) return new Uint8Array(await r.arrayBuffer());
    const reader = r.body.getReader(), parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      if (onProgress) onProgress(got / total);
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  const onServer = () => location.protocol !== 'file:';
  async function serverHas() {
    if (!onServer()) return false;
    try { return (await fetch(LOCAL_URL, { method: 'HEAD' })).ok; } catch (e) { return false; }
  }

  /** Woher käme das Modell? 'browser' | 'server' | 'internet' */
  async function modelSource() {
    if (await idbGet()) return 'browser';
    return (await serverHas()) ? 'server' : 'internet';
  }

  // Reihenfolge: Browser-Speicher, eigener Server, Internet – danach im Browser merken
  async function getModel(onProgress) {
    const cached = await idbGet();
    if (cached) return new Uint8Array(cached);
    const buf = await download((await serverHas()) ? LOCAL_URL : MODEL_URL, onProgress);
    await idbPut(buf.buffer);
    return buf;
  }

  /** Modell von Hand setzen (Datei gewählt) */
  async function setModelFile(arrayBuffer) {
    session = null;
    await idbPut(arrayBuffer);
  }

  async function getSession(onStatus) {
    if (session) return session;
    onStatus && onStatus('KI wird geladen …', 0);
    const ort = await loadRuntime();
    const model = await getModel((p) => onStatus && onStatus(`KI-Modell wird heruntergeladen … ${Math.round(p * 100)} %`, p));
    onStatus && onStatus('KI wird vorbereitet …', 1);
    session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return session;
  }

  /**
   * Tiefe schätzen. img: HTMLImageElement/Canvas. Liefert {nx, ny, f32} mit 0 = hinten, 1 = vorne (hoch).
   * size: längere Seite in Pixeln für die KI (Vielfaches von 14; 518 ist die Trainingsgröße).
   */
  async function estimate(img, onStatus, size = 518) {
    const sess = await getSession(onStatus);
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const k = size / Math.max(iw, ih);
    const W = Math.max(14, Math.round((iw * k) / 14) * 14), H = Math.max(14, Math.round((ih * k) / 14) * 14);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff';
    x.fillRect(0, 0, W, H);
    x.drawImage(img, 0, 0, W, H);
    const px = x.getImageData(0, 0, W, H).data;
    const t = new Float32Array(3 * W * H);
    for (let i = 0; i < W * H; i++) for (let ch = 0; ch < 3; ch++) t[ch * W * H + i] = (px[i * 4 + ch] / 255 - MEAN[ch]) / STD[ch];
    onStatus && onStatus('KI berechnet die Tiefe …', 1);
    await new Promise((r) => setTimeout(r, 30));
    const ort = g.ort;
    const feeds = { [sess.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, H, W]) };
    const res = await sess.run(feeds);
    const out = res[sess.outputNames[0]];
    const dims = out.dims, oh = dims[dims.length - 2], ow = dims[dims.length - 1];
    const raw = out.data;
    // robust auf 0..1 normieren (1 % / 99 %)
    const sorted = Float32Array.from(raw).sort();
    const lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)] || lo + 1;
    const f32 = new Float32Array(ow * oh);
    for (let i = 0; i < f32.length; i++) f32[i] = Math.max(0, Math.min(1, (raw[i] - lo) / (hi - lo || 1)));
    return { nx: ow, ny: oh, f32 };
  }

  /** Höhenkarte auf neue Größe bringen (bilinear) */
  function resample(src, nx, ny) {
    const out = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const u = (i / Math.max(1, nx - 1)) * (src.nx - 1), v = (j / Math.max(1, ny - 1)) * (src.ny - 1);
      const i0 = Math.min(src.nx - 2, Math.floor(u)), j0 = Math.min(src.ny - 2, Math.floor(v));
      const fu = u - i0, fv = v - j0, d = src.f32, w = src.nx;
      out[j * nx + i] = (d[j0 * w + i0] * (1 - fu) + d[j0 * w + i0 + 1] * fu) * (1 - fv) + (d[(j0 + 1) * w + i0] * (1 - fu) + d[(j0 + 1) * w + i0 + 1] * fu) * fv;
    }
    return out;
  }

  /** Feine Details aus dem Bild (Helligkeit minus geglättete Helligkeit) zur Tiefe addieren */
  function addDetail(depth, lum, nx, ny, amount, radius = 3) {
    if (!(amount > 0)) return depth;
    let bl = lum;
    for (let r = 0; r < radius; r++) bl = FS.relief.blur(nx, ny, bl, 1);
    const out = new Float32Array(depth.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(1, depth[i] + amount * (lum[i] - bl[i])));
    return out;
  }

  FS.depthAI = { loadRuntime, estimate, modelSource, setModelFile, resample, addDetail, MODEL_URL, LOCAL_URL, reset: () => { session = null; } };
})(typeof window !== 'undefined' ? window : globalThis);
