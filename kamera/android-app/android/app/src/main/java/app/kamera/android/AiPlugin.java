package app.kamera.android;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * KI auf dem Handy:
 *  - LaMa: Gegenstände entfernen (Bild 512×512 + Maske → gefülltes Bild)
 *  - SlimSAM: Gegenstand antippen → genaue Umriss-Maske
 */
@CapacitorPlugin(name = "Ai")
public class AiPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private OrtEnvironment env;
    private OrtSession lama, samEnc, samDec;
    private OnnxTensor samEmb, samPos;
    private int samW, samH, samRw, samRh;
    private float samScale;

    private File modelFile(String name) throws Exception {
        File f = new File(getContext().getFilesDir(), "models/" + name);
        String asset = "public/models/" + name;
        long size;
        try (InputStream probe = getContext().getAssets().open(asset)) { size = probe.available(); }
        if (f.exists() && f.length() > 0 && (size <= 0 || f.length() == size)) return f;
        f.getParentFile().mkdirs();
        File tmp = new File(f.getPath() + ".tmp");
        try (InputStream in = getContext().getAssets().open(asset); OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[1 << 20];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        if (!tmp.renameTo(f)) throw new Exception("Modell konnte nicht vorbereitet werden");
        return f;
    }

    private OrtSession open(String name) throws Exception {
        if (env == null) env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions o = new OrtSession.SessionOptions();
        int cores = Math.max(1, Math.min(6, Runtime.getRuntime().availableProcessors()));
        o.setIntraOpNumThreads(cores);
        o.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        return env.createSession(modelFile(name).getAbsolutePath(), o);
    }

    private static Bitmap decode(String b64) {
        byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
        BitmapFactory.Options opt = new BitmapFactory.Options();
        opt.inPreferredConfig = Bitmap.Config.ARGB_8888;
        opt.inScaled = false;
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opt);
    }

    private static String png(Bitmap b) {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, bos);
        return Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
    }

    /** Modelle vorab laden (beim Öffnen des Werkzeugs), damit es danach schnell geht */
    @PluginMethod
    public void warmup(PluginCall call) {
        String which = call.getString("model", "lama");
        worker.execute(() -> {
            try {
                if ("lama".equals(which) && lama == null) lama = open("lama.onnx");
                if ("sam".equals(which)) {
                    if (samEnc == null) samEnc = open("sam_encoder.onnx");
                    if (samDec == null) samDec = open("sam_decoder.onnx");
                }
                call.resolve();
            } catch (Throwable e) {
                call.reject("KI-Modell konnte nicht geladen werden: " + e.getMessage());
            }
        });
    }

    /** image: PNG 512×512, mask: PNG 512×512 (weiß = entfernen) → PNG 512×512 */
    @PluginMethod
    public void inpaint(PluginCall call) {
        String img = call.getString("image"), msk = call.getString("mask");
        if (img == null || msk == null) { call.reject("Bild oder Maske fehlt"); return; }
        worker.execute(() -> {
            try {
                if (lama == null) lama = open("lama.onnx");
                Bitmap bi = decode(img), bm = decode(msk);
                final int S = 512;
                if (bi.getWidth() != S || bi.getHeight() != S) bi = Bitmap.createScaledBitmap(bi, S, S, true);
                if (bm.getWidth() != S || bm.getHeight() != S) bm = Bitmap.createScaledBitmap(bm, S, S, false);
                int[] px = new int[S * S], mp = new int[S * S];
                bi.getPixels(px, 0, S, 0, 0, S, S);
                bm.getPixels(mp, 0, S, 0, 0, S, S);
                float[] image = new float[3 * S * S], mask = new float[S * S];
                for (int i = 0; i < S * S; i++) {
                    int m = mp[i];
                    float hole = ((m >> 16) & 255) > 127 ? 1f : 0f;
                    mask[i] = hole;
                    int c = px[i];
                    float k = 1f - hole; // Lochbereich wird ausgestanzt
                    image[i] = ((c >> 16) & 255) / 255f * k;
                    image[S * S + i] = ((c >> 8) & 255) / 255f * k;
                    image[2 * S * S + i] = (c & 255) / 255f * k;
                }
                Map<String, OnnxTensor> in = new HashMap<>();
                in.put("image", OnnxTensor.createTensor(env, FloatBuffer.wrap(image), new long[]{1, 3, S, S}));
                in.put("mask", OnnxTensor.createTensor(env, FloatBuffer.wrap(mask), new long[]{1, 1, S, S}));
                long t0 = System.currentTimeMillis();
                float[] out;
                try (OrtSession.Result r = lama.run(in)) {
                    OnnxTensor o = (OnnxTensor) r.get(0);
                    FloatBuffer fb = o.getFloatBuffer();
                    out = new float[fb.remaining()];
                    fb.get(out);
                }
                for (OnnxTensor t : in.values()) t.close();
                int[] res = new int[S * S];
                for (int i = 0; i < S * S; i++) {
                    int r = clamp(out[i]), g = clamp(out[S * S + i]), b = clamp(out[2 * S * S + i]);
                    res[i] = 0xFF000000 | (r << 16) | (g << 8) | b;
                }
                Bitmap ob = Bitmap.createBitmap(res, S, S, Bitmap.Config.ARGB_8888);
                JSObject ret = new JSObject();
                ret.put("image", png(ob));
                ret.put("ms", System.currentTimeMillis() - t0);
                call.resolve(ret);
            } catch (Throwable e) {
                call.reject("KI-Entfernen fehlgeschlagen: " + e.getMessage());
            }
        });
    }

    private static int clamp(float v) { int i = Math.round(v); return i < 0 ? 0 : Math.min(255, i); }

    /** Bild für das Antippen vorbereiten (einmal pro Bild) */
    @PluginMethod
    public void samEncode(PluginCall call) {
        String img = call.getString("image");
        if (img == null) { call.reject("Bild fehlt"); return; }
        worker.execute(() -> {
            try {
                if (samEnc == null) samEnc = open("sam_encoder.onnx");
                if (samDec == null) samDec = open("sam_decoder.onnx");
                Bitmap b = decode(img);
                samW = b.getWidth(); samH = b.getHeight();
                samScale = 1024f / Math.max(samW, samH);
                samRw = Math.round(samW * samScale); samRh = Math.round(samH * samScale);
                Bitmap r = Bitmap.createBitmap(1024, 1024, Bitmap.Config.ARGB_8888);
                Canvas cv = new Canvas(r);
                Paint p = new Paint(Paint.FILTER_BITMAP_FLAG);
                cv.drawBitmap(b, new Rect(0, 0, samW, samH), new Rect(0, 0, samRw, samRh), p);
                int[] px = new int[1024 * 1024];
                r.getPixels(px, 0, 1024, 0, 0, 1024, 1024);
                float[] mean = {0.485f, 0.456f, 0.406f}, std = {0.229f, 0.224f, 0.225f};
                float[] in = new float[3 * 1024 * 1024];
                for (int y = 0; y < 1024; y++) for (int x = 0; x < 1024; x++) {
                    int i = y * 1024 + x;
                    if (x >= samRw || y >= samRh) continue; // Auffüllung = 0
                    int c = px[i];
                    in[i] = (((c >> 16) & 255) / 255f - mean[0]) / std[0];
                    in[1024 * 1024 + i] = (((c >> 8) & 255) / 255f - mean[1]) / std[1];
                    in[2 * 1024 * 1024 + i] = ((c & 255) / 255f - mean[2]) / std[2];
                }
                if (samEmb != null) { samEmb.close(); samPos.close(); }
                Map<String, OnnxTensor> inputs = new HashMap<>();
                inputs.put("pixel_values", OnnxTensor.createTensor(env, FloatBuffer.wrap(in), new long[]{1, 3, 1024, 1024}));
                try (OrtSession.Result res = samEnc.run(inputs)) {
                    float[] e = copy((OnnxTensor) res.get(0)), q = copy((OnnxTensor) res.get(1));
                    samEmb = OnnxTensor.createTensor(env, FloatBuffer.wrap(e), new long[]{1, 256, 64, 64});
                    samPos = OnnxTensor.createTensor(env, FloatBuffer.wrap(q), new long[]{1, 256, 64, 64});
                }
                inputs.get("pixel_values").close();
                call.resolve();
            } catch (Throwable e) {
                call.reject("Bild-Analyse fehlgeschlagen: " + e.getMessage());
            }
        });
    }

    private static float[] copy(OnnxTensor t) {
        FloatBuffer fb = t.getFloatBuffer();
        float[] a = new float[fb.remaining()];
        fb.get(a);
        return a;
    }

    /**
     * points: [[x, y, label], …] in Bildkoordinaten (label 1 = gehört dazu, 0 = gehört nicht dazu)
     * → 3 Masken-Vorschläge als Graustufen (128 = Grenze), Größe ≈ Bild/4, plus Bewertungen
     */
    @PluginMethod
    public void samDecode(PluginCall call) {
        JSArray pts = call.getArray("points");
        worker.execute(() -> {
            try {
                if (samEmb == null) throw new Exception("Bild nicht vorbereitet");
                int n = pts.length();
                float[] p = new float[n * 2];
                long[] l = new long[n];
                for (int i = 0; i < n; i++) {
                    org.json.JSONArray a = pts.getJSONArray(i);
                    p[i * 2] = (float) a.getDouble(0) * samScale;
                    p[i * 2 + 1] = (float) a.getDouble(1) * samScale;
                    l[i] = a.getLong(2);
                }
                Map<String, OnnxTensor> in = new HashMap<>();
                in.put("input_points", OnnxTensor.createTensor(env, FloatBuffer.wrap(p), new long[]{1, 1, n, 2}));
                in.put("input_labels", OnnxTensor.createTensor(env, LongBuffer.wrap(l), new long[]{1, 1, n}));
                in.put("image_embeddings", samEmb);
                in.put("image_positional_embeddings", samPos);
                float[] iou, masks;
                try (OrtSession.Result r = samDec.run(in)) {
                    iou = copy((OnnxTensor) r.get(0));
                    masks = copy((OnnxTensor) r.get(1));
                }
                in.get("input_points").close();
                in.get("input_labels").close();
                // 256×256 gehört zum aufgefüllten 1024er-Quadrat → nur den Bildbereich ausschneiden
                int mw = (int) Math.ceil(samRw / 4.0), mh = (int) Math.ceil(samRh / 4.0);
                JSArray outMasks = new JSArray();
                JSArray scores = new JSArray();
                for (int k = 0; k < 3; k++) {
                    int[] pix = new int[mw * mh];
                    for (int y = 0; y < mh; y++) for (int x = 0; x < mw; x++) {
                        float v = masks[k * 256 * 256 + y * 256 + x];
                        int g = Math.max(0, Math.min(255, Math.round(128 + v * 24)));
                        pix[y * mw + x] = 0xFF000000 | (g << 16) | (g << 8) | g;
                    }
                    outMasks.put(png(Bitmap.createBitmap(pix, mw, mh, Bitmap.Config.ARGB_8888)));
                    scores.put(iou[k]);
                }
                JSObject ret = new JSObject();
                ret.put("masks", outMasks);
                ret.put("scores", scores);
                ret.put("cropW", samRw / 4.0);
                ret.put("cropH", samRh / 4.0);
                call.resolve(ret);
            } catch (Throwable e) {
                call.reject("Auswahl fehlgeschlagen: " + e.getMessage());
            }
        });
    }
}
