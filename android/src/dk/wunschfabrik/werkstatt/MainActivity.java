package dk.wunschfabrik.werkstatt;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Hülle der Werkstatt-App: zeigt die mitgelieferte Oberfläche (assets/www) unter einer festen Herkunft,
 * damit sie mit dem Server (api.php) sprechen darf. Kamera/Galerie für Fotos und Belege, Zurück-Taste, Links nach außen.
 */
public class MainActivity extends Activity {
    private static final String HOST = "app.wunsch-fabrik.local";
    private static final String ORIGIN = "https://" + HOST + "/";
    private static final int REQ_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("png", "image/png");
        MIME.put("woff2", "font/woff2");
        MIME.put("json", "application/json");
        MIME.put("svg", "image/svg+xml");
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " WFWerkstatt/" + BuildInfo.VERSION);

        web.addJavascriptInterface(new Native(), "WFNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath() == null || u.getPath().equals("/") ? "index.html" : u.getPath().substring(1);
                if (path.contains("..")) return notFound();
                try {
                    InputStream in = getAssets().open("www/" + path);
                    String ext = path.substring(path.lastIndexOf('.') + 1);
                    String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
                    WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text") || mime.endsWith("json") || mime.endsWith("javascript") ? "utf-8" : null, in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    r.setResponseHeaders(h);
                    return r;
                } catch (IOException e) {
                    return notFound();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // Telefon, Mail, Lieferanten-Links, Fotos in voller Größe, App-Update: außerhalb öffnen
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException e) {
                    // nichts, das den Link öffnen kann
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                cameraUri = null;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("image/*");
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                Intent cam = cameraIntent();
                Intent start;
                if (p.isCaptureEnabled() && cam != null) {
                    start = cam;                                   // „Foto aufnehmen“: direkt die Kamera
                } else {
                    start = Intent.createChooser(pick, null);      // „Aus Galerie“: Auswahl, Kamera als Zusatz
                    if (cam != null) start.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
                }
                try {
                    startActivityForResult(start, REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(ORIGIN + "index.html");
    }

    /** Kamera-Aufnahme in Bilder/Wunsch-Fabrik (ab Android 10 ohne Speicherrecht). */
    private Intent cameraIntent() {
        Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (cam.resolveActivity(getPackageManager()) == null) return null;
        ContentValues v = new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME, "WF_" + System.currentTimeMillis() + ".jpg");
        v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Wunsch-Fabrik");
        try {
            cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
        } catch (Exception e) {
            cameraUri = null;
        }
        if (cameraUri == null) return null;
        cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
        cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return cam;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != REQ_FILE || fileCallback == null) {
            super.onActivityResult(req, res, data);
            return;
        }
        Uri[] result = null;
        if (res == RESULT_OK) {
            List<Uri> list = new ArrayList<>();
            if (data != null && data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) list.add(data.getClipData().getItemAt(i).getUri());
            } else if (data != null && data.getData() != null) {
                list.add(data.getData());
            } else if (cameraUri != null) {
                list.add(cameraUri);
            }
            if (!list.isEmpty()) result = list.toArray(new Uri[0]);
        }
        if (result == null && cameraUri != null) {
            try { getContentResolver().delete(cameraUri, null, null); } catch (Exception e) { /* leer lassen */ }
        } else if (result != null && cameraUri != null && !result[0].equals(cameraUri)) {
            try { getContentResolver().delete(cameraUri, null, null); } catch (Exception e) { /* Galerie gewählt */ }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
        cameraUri = null;
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.WFBack ? String(window.WFBack()) : 'false'", (v) -> {
            if (v == null || !v.contains("true")) finish();
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    private static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", null);
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    /** Kleine Brücke für die Oberfläche. */
    private static class Native {
        @JavascriptInterface
        public String device() {
            return (Build.MANUFACTURER + " " + Build.MODEL).trim();
        }

        @JavascriptInterface
        public String version() {
            return BuildInfo.VERSION;
        }
    }
}
