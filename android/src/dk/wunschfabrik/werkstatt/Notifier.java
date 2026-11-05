package dk.wunschfabrik.werkstatt;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * Benachrichtigungen ohne Fremddienst: die App fragt den eigenen Server (api.php?a=app_events) nach Neuem.
 * Normal: Android-Hintergrundauftrag etwa alle 15 Minuten. Schnell: kleiner Dienst mit Anzeige in der Leiste, jede Minute.
 * Einstellungen liegen in SharedPreferences „wf_notify“ (Server, Schlüssel, Stand, gewünschte Arten, Modus, Sprache).
 */
final class Notifier {
    static final String PREFS = "wf_notify";
    static final String CH_EVENTS = "events";
    static final String CH_SERVICE = "service";
    static final int JOB_ID = 4711;
    private static final Object LOCK = new Object();

    private Notifier() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean da(Context c) {
        return "da".equals(prefs(c).getString("lang", "de"));
    }

    static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        boolean da = da(c);
        NotificationChannel ev = new NotificationChannel(CH_EVENTS, da ? "Nyt fra værkstedet" : "Neues aus der Werkstatt", NotificationManager.IMPORTANCE_HIGH);
        ev.setDescription(da ? "Forespørgsler, mails, underskrevne tilbud, betalinger" : "Anfragen, Mails, unterschriebene Angebote, Zahlungen");
        nm.createNotificationChannel(ev);
        NotificationChannel sv = new NotificationChannel(CH_SERVICE, da ? "Hurtig kontrol" : "Schnelle Prüfung", NotificationManager.IMPORTANCE_MIN);
        sv.setShowBadge(false);
        nm.createNotificationChannel(sv);
    }

    static boolean canNotify(Context c) {
        return Build.VERSION.SDK_INT < 33 || c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
    }

    /** Hintergrundabfrage passend zu den Einstellungen starten oder beenden. */
    static void apply(Context c) {
        SharedPreferences p = prefs(c);
        boolean on = !p.getString("token", "").isEmpty() && !p.getString("kinds", "").isEmpty();
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (on) {
            JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, NotifyJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(15 * 60 * 1000L)
                    .setPersisted(true)
                    .build();
            js.schedule(job);
        } else {
            js.cancel(JOB_ID);
        }
        Intent svc = new Intent(c, NotifyService.class);
        if (on && "fast".equals(p.getString("mode", "normal"))) {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(svc); else c.startService(svc);
        } else {
            c.stopService(svc);
        }
    }

    /** Einmal beim Server nachfragen und Neues anzeigen. Läuft im Hintergrund-Thread. */
    static void check(Context c) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(c);
            String server = p.getString("server", ""), token = p.getString("token", ""), kinds = "," + p.getString("kinds", "") + ",";
            if (server.isEmpty() || token.isEmpty()) return;
            String cursor = p.getString("cursor", "");
            HttpURLConnection con = null;
            try {
                String base = server.endsWith("/") ? server : server + "/";
                con = (HttpURLConnection) new URL(base + "api.php?a=app_events&cursor=" + URLEncoder.encode(cursor, "UTF-8")).openConnection();
                con.setConnectTimeout(10000);
                con.setReadTimeout(15000);
                con.setRequestProperty("X-App-Token", token);
                con.setRequestProperty("Accept", "application/json");
                if (con.getResponseCode() != 200) return;
                InputStream in = con.getInputStream();
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] b = new byte[8192];
                int n;
                while ((n = in.read(b)) > 0) buf.write(b, 0, n);
                JSONObject j = new JSONObject(buf.toString("UTF-8"));
                if (!j.optBoolean("ok")) return;
                JSONArray ev = j.optJSONArray("events");
                if (ev != null && !cursor.isEmpty() && canNotify(c)) {
                    for (int i = 0; i < ev.length(); i++) {
                        JSONObject e = ev.getJSONObject(i);
                        String kind = e.optString("kind");
                        if (kinds.contains("," + kind + ",")) show(c, e);
                    }
                }
                p.edit().putString("cursor", j.optString("cursor", cursor)).putLong("last_check", System.currentTimeMillis()).apply();
            } catch (Exception e) {
                // kein Netz oder Server nicht erreichbar: beim nächsten Mal
            } finally {
                if (con != null) con.disconnect();
            }
        }
    }

    private static void show(Context c, JSONObject e) {
        boolean da = da(c);
        String kind = e.optString("kind");
        String head;
        switch (kind) {
            case "inquiry": head = da ? "Ny forespørgsel" : "Neue Anfrage"; break;
            case "signed": head = da ? "Tilbud underskrevet" : "Angebot unterschrieben"; break;
            case "payment": head = da ? "Betaling modtaget" : "Zahlung eingegangen"; break;
            case "mail": head = da ? "Ny mail" : "Neue Mail"; break;
            default: head = da ? "Nyt" : "Neu";
        }
        String who = e.optString("title");
        String text = e.optString("text");
        Intent open = new Intent(c, MainActivity.class).putExtra("open", e.optString("open")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int id = (kind.hashCode() & 0xffff) * 100000 + (e.optInt("id") % 100000);
        PendingIntent pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH_EVENTS) : new Notification.Builder(c);
        nb.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(head + (who.isEmpty() ? "" : ": " + who))
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFF7E22CE)
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setCategory(Notification.CATEGORY_MESSAGE);
        if (Build.VERSION.SDK_INT < 26) nb.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        c.getSystemService(NotificationManager.class).notify(id, nb.build());
    }
}
