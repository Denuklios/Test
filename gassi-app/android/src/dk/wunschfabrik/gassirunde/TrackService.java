package dk.wunschfabrik.gassirunde;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.CookieManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Zeichnet den Spaziergang per GPS auf – als Vordergrund-Dienst, also auch bei ausgeschaltetem Bildschirm.
 * Solange die App nicht sichtbar ist, übernimmt der Dienst außerdem:
 *  - Position teilen (wenn eingeschaltet),
 *  - Warnung, wenn jemand mit „Bitte Abstand“ näher als 150 m ist,
 *  - Benachrichtigung, wenn jemand winkt.
 * Ist die App sichtbar, macht das die Oberfläche selbst.
 */
public class TrackService extends Service {
    static final String ACTION_START = "start";
    static final String ACTION_STOP = "stop";
    private static final String CH_TRACK = "track";
    private static final String CH_ALERT = "alert";
    private static final int ID_TRACK = 1;
    private static final int WARN_RADIUS = 150;

    static volatile boolean running = false;
    static volatile double startedAt = 0;
    static volatile boolean shareLive = true;
    static volatile String status = "neutral";
    private static final List<double[]> fixes = new ArrayList<>(); // lat, lng, Genauigkeit, Zeit (ms)

    private LocationManager lm;
    private PowerManager.WakeLock wake;
    private HandlerThread netThread;
    private Handler net;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private double meters = 0;
    private double[] lastGood;
    private final Map<String, Long> warned = new HashMap<>();
    private long lastSent = 0;

    static synchronized String fixesSince(int index) {
        JSONArray a = new JSONArray();
        try {
            for (int i = Math.max(0, index); i < fixes.size(); i++) {
                double[] f = fixes.get(i);
                a.put(new JSONArray().put(f[0]).put(f[1]).put(f[2]).put(f[3]));
            }
        } catch (Exception e) { /* JSON-Fehler kann bei Zahlen nicht auftreten */ }
        return a.toString();
    }

    private static synchronized void addFix(double[] f) { fixes.add(f); }
    private static synchronized double[] lastFix() { return fixes.isEmpty() ? null : fixes.get(fixes.size() - 1); }

    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location l) {
            double[] f = {l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? l.getAccuracy() : 99, l.getTime()};
            addFix(f);
            // grobe Strecke nur für die Benachrichtigung (die genaue Rechnung macht die Oberfläche)
            if (f[2] <= 35) {
                if (lastGood != null) {
                    float[] d = new float[1];
                    Location.distanceBetween(lastGood[0], lastGood[1], f[0], f[1], d);
                    if (d[0] >= 3 && d[0] < 200) meters += d[0];
                }
                lastGood = f;
            }
        }
        @Override public void onStatusChanged(String p, int s, Bundle b) {}
        @Override public void onProviderEnabled(String p) {}
        @Override public void onProviderDisabled(String p) {}
    };

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) { stopTracking(); return START_NOT_STICKY; }
        if (!running) startTracking();
        return START_STICKY;
    }

    private void startTracking() {
        channels(this);
        Notification n = trackNotification("Aufnahme läuft …");
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID_TRACK, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(ID_TRACK, n);

        synchronized (TrackService.class) { fixes.clear(); }
        meters = 0; lastGood = null; warned.clear();
        startedAt = System.currentTimeMillis();
        running = true;

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gassirunde:track");
        wake.acquire(6 * 3600 * 1000L); // höchstens 6 Stunden

        lm = (LocationManager) getSystemService(LOCATION_SERVICE);
        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, listener, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException e) {
            stopTracking();
            return;
        }

        netThread = new HandlerThread("gassi-net");
        netThread.start();
        net = new Handler(netThread.getLooper());
        net.postDelayed(tick, 5000);
    }

    private void stopTracking() {
        running = false;
        if (lm != null) lm.removeUpdates(listener);
        if (net != null) { net.removeCallbacksAndMessages(null); netThread.quitSafely(); net = null; }
        if (wake != null && wake.isHeld()) wake.release();
        // Live-Position sofort entfernen
        new Thread(() -> request("DELETE", "live", "{}")).start();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        stopSelf();
    }

    /** Alle 10 Sekunden: Benachrichtigung aktualisieren; im Hintergrund teilen, warnen, Winken zustellen. */
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            long ms = System.currentTimeMillis() - (long) startedAt;
            ui.post(() -> notifyTrack(String.format(Locale.GERMANY, "%.2f km · %s", meters / 1000, duration(ms))));
            if (!MainActivity.visible) background();
            if (net != null) net.postDelayed(this, 10000);
        }
    };

    private void background() {
        double[] f = lastFix();
        long now = System.currentTimeMillis();
        if (shareLive && f != null && now - lastSent > 9000) {
            lastSent = now;
            request("POST", "live", String.format(Locale.US, "{\"status\":\"%s\",\"lat\":%.6f,\"lng\":%.6f}", status, f[0], f[1]));
        }
        String body = request("GET", "live/poll", null);
        if (body == null) return;
        try {
            JSONObject o = new JSONObject(body);
            JSONArray people = o.optJSONArray("people");
            if (f != null && people != null) {
                for (int i = 0; i < people.length(); i++) {
                    JSONObject p = people.getJSONObject(i);
                    if (!"abstand".equals(p.optString("status"))) continue;
                    float[] d = new float[1];
                    Location.distanceBetween(f[0], f[1], p.getDouble("lat"), p.getDouble("lng"), d);
                    String id = p.optString("id");
                    Long last = warned.get(id);
                    if (d[0] < WARN_RADIUS && (last == null || now - last > 3 * 60 * 1000)) {
                        warned.put(id, now);
                        String who = p.optString("name") + (p.optString("dog").isEmpty() ? "" : " mit " + p.optString("dog"));
                        alert(id.hashCode(), "Bitte Abstand halten", who + " bittet um Abstand und ist " + Math.round(d[0] / 10) * 10 + " m entfernt.");
                    }
                }
            }
            JSONArray waves = o.optJSONArray("waves");
            if (waves != null) {
                for (int i = 0; i < waves.length(); i++) {
                    JSONObject w = waves.getJSONObject(i);
                    String who = w.optString("fromName") + (w.optString("fromDog").isEmpty() ? "" : " mit " + w.optString("fromDog"));
                    alert(("wave" + w.optString("from")).hashCode(), who + " winkt dir", w.optString("text"));
                }
            }
        } catch (Exception e) { /* unerwartete Antwort: beim nächsten Mal wieder */ }
    }

    /** Anfrage an api.php mit dem Anmelde-Cookie der App. */
    private String request(String method, String path, String json) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(MainActivity.BASE + "api.php?p=" + path).openConnection();
            c.setRequestMethod(method);
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            String cookie = CookieManager.getInstance().getCookie(MainActivity.BASE);
            if (cookie != null) c.setRequestProperty("Cookie", cookie);
            c.setRequestProperty("Content-Type", "application/json");
            if (json != null) {
                c.setDoOutput(true);
                try (OutputStream os = c.getOutputStream()) { os.write(json.getBytes(StandardCharsets.UTF_8)); }
            }
            if (c.getResponseCode() != 200) return null;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                return b.toString("UTF-8");
            }
        } catch (Exception e) {
            return null; // kein Netz: nicht schlimm, die Aufnahme läuft weiter
        } finally {
            if (c != null) c.disconnect();
        }
    }

    // ---------- Benachrichtigungen ----------

    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        NotificationChannel t = new NotificationChannel(CH_TRACK, "Spaziergang aufzeichnen", NotificationManager.IMPORTANCE_LOW);
        t.setShowBadge(false);
        nm.createNotificationChannel(t);
        NotificationChannel a = new NotificationChannel(CH_ALERT, "Begegnungen und Winken", NotificationManager.IMPORTANCE_HIGH);
        a.enableVibration(true);
        nm.createNotificationChannel(a);
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification trackNotification(String text) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_TRACK) : new Notification.Builder(this);
        return b.setSmallIcon(R.drawable.ic_paw)
                .setContentTitle("Spaziergang läuft")
                .setContentText(text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openApp())
                .build();
    }

    private void notifyTrack(String text) {
        if (!running) return;
        getSystemService(NotificationManager.class).notify(ID_TRACK, trackNotification(text));
    }

    private void alert(int id, String title, String text) {
        ui.post(() -> {
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_ALERT) : new Notification.Builder(this);
            b.setSmallIcon(R.drawable.ic_paw).setContentTitle(title).setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(text))
                    .setAutoCancel(true).setContentIntent(openApp());
            if (Build.VERSION.SDK_INT < 26) b.setDefaults(Notification.DEFAULT_ALL).setPriority(Notification.PRIORITY_HIGH);
            getSystemService(NotificationManager.class).notify(1000 + (id & 0xffff), b.build());
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(new long[]{0, 250, 150, 250}, -1));
                else v.vibrate(500);
            }
        });
    }

    private static String duration(long ms) {
        long s = ms / 1000;
        return s >= 3600 ? String.format(Locale.GERMANY, "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
                : String.format(Locale.GERMANY, "%02d:%02d", s / 60, s % 60);
    }

    @Override public void onDestroy() { running = false; super.onDestroy(); }
}
