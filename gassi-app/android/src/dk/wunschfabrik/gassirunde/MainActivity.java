package dk.wunschfabrik.gassirunde;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
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
 * Gassirunde-App: Die Oberfläche steckt in der App (assets/www) und wird unter der Adresse des Servers
 * angezeigt. So sind Oberfläche und api.php „dieselbe Seite“ und das Anmelde-Cookie funktioniert ganz normal.
 * Nur api.php, Kartenkacheln und Updates kommen aus dem Internet.
 *
 * GPS kommt nicht aus dem Browser, sondern aus TrackService: Der zeichnet als Vordergrund-Dienst auch bei
 * ausgeschaltetem Bildschirm weiter auf. Die Oberfläche holt sich die Punkte über window.GassiNative ab.
 */
public class MainActivity extends Activity {
    static final String HOST = "www.wunsch-fabrik.dk";
    static final String BASE_PATH = "/gassi-ljv0zkx2/";
    static final String BASE = "https://" + HOST + BASE_PATH;

    private static final int REQ_TRACK = 1;
    private static final int REQ_GEO = 2;

    static volatile boolean visible = false;

    private WebView web;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("png", "image/png");
        MIME.put("svg", "image/svg+xml");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " Gassirunde/" + BuildInfo.VERSION);
        // Große Systemschrift: mitgehen, aber höchstens bis 115 %, sonst passt die Oberfläche nicht mehr aufs Handy
        int zoom = Math.round(getResources().getConfiguration().fontScale * 100);
        s.setTextZoom(Math.max(85, Math.min(115, zoom)));
        CookieManager.getInstance().setAcceptCookie(true);

        web.addJavascriptInterface(new Bridge(), "GassiNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String path = u.getPath();
                if (!HOST.equals(u.getHost()) || path == null || !path.startsWith(BASE_PATH)) return null;
                if (!"GET".equals(req.getMethod())) return null;
                String rel = path.substring(BASE_PATH.length());
                if (rel.isEmpty()) rel = "index.html";
                if (rel.contains("..")) return null;
                try {
                    InputStream in = getAssets().open("www/" + rel); // mitgelieferte Datei
                    String ext = rel.substring(rel.lastIndexOf('.') + 1);
                    String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
                    boolean text = mime.startsWith("text") || mime.contains("json") || mime.contains("javascript");
                    WebResourceResponse r = new WebResourceResponse(mime, text ? "utf-8" : null, in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    r.setResponseHeaders(h);
                    return r;
                } catch (IOException e) {
                    return null; // nicht in der App (z. B. api.php, app/version.json): aus dem Internet
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost()) && u.getPath() != null && u.getPath().startsWith(BASE_PATH)
                        && !u.getPath().endsWith(".apk")) return false;
                openExternal(u);
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (hasLocation()) { cb.invoke(origin, true, false); return; }
                geoOrigin = origin;
                geoCallback = cb;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_GEO);
            }
        });

        if (state != null) web.restoreState(state);
        else web.loadUrl(BASE + "index.html");
    }

    @Override protected void onResume() { super.onResume(); visible = true; js("window.__gassiResume && window.__gassiResume()"); }
    @Override protected void onPause() { super.onPause(); visible = false; CookieManager.getInstance().flush(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__gassiBack ? window.__gassiBack() : false", v -> {
            if (!"true".equals(v)) moveTaskToBack(true); // App bleibt im Hintergrund, Aufnahme läuft weiter
        });
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void js(String code) { if (web != null) web.post(() -> web.evaluateJavascript(code, null)); }

    private void openExternal(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* nichts zum Öffnen */ }
    }

    private void startTracking() {
        Intent i = new Intent(this, TrackService.class).setAction(TrackService.ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        boolean loc = hasLocation();
        if (code == REQ_TRACK) {
            if (loc) startTracking();
            js("window.__gassiNativeStart && window.__gassiNativeStart(" + loc + ")");
        } else if (code == REQ_GEO && geoCallback != null) {
            geoCallback.invoke(geoOrigin, loc, false);
            geoCallback = null;
        }
    }

    /** Schnittstelle für die Oberfläche: window.GassiNative */
    private class Bridge {
        @JavascriptInterface public String version() { return BuildInfo.VERSION; }

        /** Startet die Aufnahme. false = erst Berechtigung nötig; Ergebnis kommt dann über __gassiNativeStart(ok). */
        @JavascriptInterface public boolean start() {
            List<String> need = new ArrayList<>();
            if (!hasLocation()) { need.add(Manifest.permission.ACCESS_FINE_LOCATION); need.add(Manifest.permission.ACCESS_COARSE_LOCATION); }
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                need.add(Manifest.permission.POST_NOTIFICATIONS);
            if (!hasLocation()) {
                runOnUiThread(() -> requestPermissions(need.toArray(new String[0]), REQ_TRACK));
                return false;
            }
            if (!need.isEmpty()) runOnUiThread(() -> requestPermissions(need.toArray(new String[0]), 99)); // Benachrichtigungen: freiwillig
            startTracking();
            return true;
        }

        @JavascriptInterface public void stop() {
            startService(new Intent(MainActivity.this, TrackService.class).setAction(TrackService.ACTION_STOP));
        }

        @JavascriptInterface public boolean isRecording() { return TrackService.running; }
        @JavascriptInterface public double startedAt() { return TrackService.startedAt; }
        @JavascriptInterface public String fixesSince(int index) { return TrackService.fixesSince(index); }

        /** Ob und mit welchem Status die Position im Hintergrund geteilt wird. */
        @JavascriptInterface public void setLive(boolean share, String status) {
            TrackService.shareLive = share;
            TrackService.status = status == null ? "neutral" : status;
        }

        @JavascriptInterface public void openExternal(String url) { MainActivity.this.openExternal(Uri.parse(url)); }
    }
}
