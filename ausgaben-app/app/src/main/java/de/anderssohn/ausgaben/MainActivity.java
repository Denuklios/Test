package de.anderssohn.ausgaben;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Hülle um die Web-Oberfläche (assets/www). Stellt der Oberfläche native
 * Funktionen bereit: Kamera, Bildauswahl, Texterkennung (ML Kit, offline),
 * Kontoauszug-Import (CSV/PDF/Bild) und Speichern/Laden von Sicherungen.
 */
public class MainActivity extends ComponentActivity {

    private WebView web;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextRecognizer recognizer;

    private String pendingId;          // Anfrage-ID, auf deren Antwort die Oberfläche wartet
    private String pendingSaveText;    // Inhalt, der gespeichert werden soll
    private Uri photoUri;
    private boolean pageReady = false;
    private Intent pendingShare;
    private String pendingWidget;

    private ActivityResultLauncher<Uri> takePicture;
    private ActivityResultLauncher<String> pickImages;
    private ActivityResultLauncher<String[]> pickStatement;
    private ActivityResultLauncher<String[]> pickBackup;
    private ActivityResultLauncher<String> saveJson;
    private ActivityResultLauncher<String> saveCsv;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        registerLaunchers();

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F1F5F4"));
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                return loader.shouldInterceptRequest(req.getUrl());
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingShare != null) { Intent i = pendingShare; pendingShare = null; handleShare(i); }
                if (pendingWidget != null) { String a = pendingWidget; pendingWidget = null; widgetAction(a); }
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript("window.handleBack ? window.handleBack() : false", v -> {
                    if (!"true".equals(v)) finish();
                });
            }
        });

        Intent i = getIntent();
        if (isShare(i)) pendingShare = i;
        String wa = widgetActionOf(i);
        if (wa != null) pendingWidget = wa;
    }

    private String widgetActionOf(Intent i) {
        if (i == null || i.getAction() == null || !i.getAction().startsWith(BudgetWidget.ACTION_PREFIX)) return null;
        return i.getAction().substring(BudgetWidget.ACTION_PREFIX.length());
    }

    private void widgetAction(String a) {
        js("window.Native && Native.onWidgetAction(" + JSONObject.quote(a) + ")");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (isShare(intent)) {
            if (pageReady) handleShare(intent); else pendingShare = intent;
        }
        String wa = widgetActionOf(intent);
        if (wa != null) { if (pageReady) widgetAction(wa); else pendingWidget = wa; }
    }

    private boolean isShare(Intent i) {
        if (i == null || i.getAction() == null) return false;
        String a = i.getAction();
        return Intent.ACTION_SEND.equals(a) || Intent.ACTION_SEND_MULTIPLE.equals(a) || Intent.ACTION_VIEW.equals(a);
    }

    private void handleShare(Intent i) {
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(i.getAction())) {
            ArrayList<Uri> l = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (l != null) uris.addAll(l);
        } else if (Intent.ACTION_VIEW.equals(i.getAction())) {
            if (i.getData() != null) uris.add(i.getData());
        } else {
            Uri u = i.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        }
        if (uris.isEmpty()) return;
        String type = i.getType() != null ? i.getType() : getContentResolver().getType(uris.get(0));
        final boolean isImage = type != null && type.startsWith("image/");
        worker.execute(() -> {
            try {
                JSONObject res = isImage ? ocrImages(uris) : readStatement(uris.get(0));
                res.put("shared", true);
                res.put("kind", isImage ? "receipt" : "statement");
                js("window.Native && Native.onShared(" + JSONObject.quote(res.toString()) + ")");
            } catch (Exception e) {
                toast("Datei konnte nicht gelesen werden: " + e.getMessage());
            }
        });
    }

    private void registerLaunchers() {
        takePicture = registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
            if (ok != null && ok && photoUri != null) {
                List<Uri> l = new ArrayList<>(); l.add(photoUri);
                runOcr(l);
            } else cancel();
        });
        pickImages = registerForActivityResult(new ActivityResultContracts.GetMultipleContents(), uris -> {
            if (uris == null || uris.isEmpty()) cancel(); else runOcr(uris);
        });
        pickStatement = registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
            if (uri == null) { cancel(); return; }
            final String id = pendingId;
            worker.execute(() -> {
                try { resolve(id, readStatement(uri)); }
                catch (Exception e) { reject(id, e); }
            });
        });
        pickBackup = registerForActivityResult(new ActivityResultContracts.OpenDocument(), uri -> {
            if (uri == null) { cancel(); return; }
            final String id = pendingId;
            worker.execute(() -> {
                try {
                    JSONObject o = new JSONObject();
                    o.put("text", decode(readBytes(uri)));
                    resolve(id, o);
                } catch (Exception e) { reject(id, e); }
            });
        });
        saveJson = registerForActivityResult(new ActivityResultContracts.CreateDocument("application/json"), this::writeDoc);
        saveCsv = registerForActivityResult(new ActivityResultContracts.CreateDocument("text/csv"), this::writeDoc);
    }

    private void writeDoc(Uri uri) {
        if (uri == null) { cancel(); return; }
        final String id = pendingId; final String text = pendingSaveText;
        worker.execute(() -> {
            try (OutputStream os = getContentResolver().openOutputStream(uri, "wt")) {
                // BOM, damit Excel Umlaute in CSV korrekt erkennt
                if (!text.startsWith("{")) os.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF});
                os.write(text.getBytes(StandardCharsets.UTF_8));
                resolve(id, new JSONObject().put("ok", true));
            } catch (Exception e) { reject(id, e); }
        });
    }

    private void runOcr(List<Uri> uris) {
        final String id = pendingId;
        worker.execute(() -> {
            try { resolve(id, ocrImages(uris)); }
            catch (Exception e) { reject(id, e); }
        });
    }

    // ---------- Texterkennung ----------

    private JSONObject ocrImages(List<Uri> uris) throws Exception {
        JSONArray pages = new JSONArray();
        for (Uri u : uris) {
            InputImage img = InputImage.fromFilePath(this, u);
            pages.put(pageJson(Tasks.await(recognizer.process(img)), img.getWidth(), img.getHeight()));
        }
        JSONObject o = new JSONObject();
        o.put("type", "ocr");
        o.put("pages", pages);
        return o;
    }

    private JSONObject pageJson(Text text, int w, int h) throws Exception {
        JSONArray lines = new JSONArray();
        for (Text.TextBlock b : text.getTextBlocks()) {
            for (Text.Line l : b.getLines()) {
                Rect r = l.getBoundingBox();
                if (r == null) continue;
                JSONObject o = new JSONObject();
                o.put("t", l.getText());
                o.put("x", r.left); o.put("y", r.top); o.put("w", r.width()); o.put("h", r.height());
                lines.put(o);
            }
        }
        JSONObject p = new JSONObject();
        p.put("width", w); p.put("height", h); p.put("lines", lines);
        return p;
    }

    // ---------- Kontoauszug ----------

    private JSONObject readStatement(Uri uri) throws Exception {
        String mime = getContentResolver().getType(uri);
        String name = uri.getLastPathSegment() != null ? uri.getLastPathSegment().toLowerCase() : "";
        if ((mime != null && mime.equals("application/pdf")) || name.endsWith(".pdf")) return ocrPdf(uri);
        if (mime != null && mime.startsWith("image/")) {
            List<Uri> l = new ArrayList<>(); l.add(uri);
            return ocrImages(l);
        }
        JSONObject o = new JSONObject();
        o.put("type", "text");
        o.put("text", decode(readBytes(uri)));
        return o;
    }

    private JSONObject ocrPdf(Uri uri) throws Exception {
        JSONArray pages = new JSONArray();
        try (ParcelFileDescriptor fd = getContentResolver().openFileDescriptor(uri, "r");
             PdfRenderer r = new PdfRenderer(fd)) {
            int n = Math.min(r.getPageCount(), 30);
            for (int i = 0; i < n; i++) {
                try (PdfRenderer.Page p = r.openPage(i)) {
                    float scale = 2200f / p.getWidth();
                    int w = Math.round(p.getWidth() * scale), h = Math.round(p.getHeight() * scale);
                    Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                    bmp.eraseColor(Color.WHITE);
                    p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    Text t = Tasks.await(recognizer.process(InputImage.fromBitmap(bmp, 0)));
                    pages.put(pageJson(t, w, h));
                    bmp.recycle();
                }
            }
        }
        JSONObject o = new JSONObject();
        o.put("type", "ocr");
        o.put("pages", pages);
        return o;
    }

    private byte[] readBytes(Uri uri) throws Exception {
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        }
    }

    /** UTF-8 versuchen, sonst Windows-1252 (viele deutsche Banken exportieren so). */
    private String decode(byte[] b) {
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(b)).toString().replace("﻿", "");
        } catch (CharacterCodingException e) {
            return new String(b, Charset.forName("windows-1252"));
        }
    }

    // ---------- Rückmeldung an die Oberfläche ----------

    private void resolve(String id, JSONObject o) {
        js("Native.resolve(" + JSONObject.quote(id) + "," + JSONObject.quote(o.toString()) + ")");
    }

    private void reject(String id, Exception e) {
        String msg = e.getMessage() != null ? e.getMessage() : e.toString();
        js("Native.reject(" + JSONObject.quote(id) + "," + JSONObject.quote(msg) + ")");
    }

    private void cancel() {
        js("Native.reject(" + JSONObject.quote(pendingId == null ? "" : pendingId) + ",'abgebrochen')");
    }

    private void js(String code) { main.post(() -> web.evaluateJavascript(code, null)); }

    private void toast(String m) { main.post(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show()); }

    private class Bridge {
        @JavascriptInterface
        public void takePhoto(String id) {
            pendingId = id;
            main.post(() -> {
                try {
                    File dir = new File(getCacheDir(), "photos");
                    dir.mkdirs();
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                    File f = new File(dir, "bon_" + System.currentTimeMillis() + ".jpg");
                    photoUri = FileProvider.getUriForFile(MainActivity.this, "de.anderssohn.ausgaben.files", f);
                    takePicture.launch(photoUri);
                } catch (Exception e) { reject(id, e); }
            });
        }

        @JavascriptInterface
        public void pickImages(String id) { pendingId = id; main.post(() -> pickImages.launch("image/*")); }

        @JavascriptInterface
        public void pickStatement(String id) {
            pendingId = id;
            main.post(() -> pickStatement.launch(new String[]{"text/csv", "text/comma-separated-values",
                    "text/plain", "application/pdf", "application/vnd.ms-excel", "image/*", "application/octet-stream"}));
        }

        @JavascriptInterface
        public void pickBackup(String id) {
            pendingId = id;
            main.post(() -> pickBackup.launch(new String[]{"application/json", "application/octet-stream", "text/plain"}));
        }

        @JavascriptInterface
        public void saveFile(String id, String fileName, String content) {
            pendingId = id; pendingSaveText = content;
            main.post(() -> {
                if (fileName.endsWith(".csv")) saveCsv.launch(fileName); else saveJson.launch(fileName);
            });
        }

        @JavascriptInterface
        public void updateWidget(String json) {
            getSharedPreferences(BudgetWidget.PREFS, MODE_PRIVATE).edit().putString("data", json).apply();
            BudgetWidget.updateAll(MainActivity.this);
        }

        @JavascriptInterface
        public void toast(String msg) { MainActivity.this.toast(msg); }
    }
}
