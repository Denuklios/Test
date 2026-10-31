package de.anderssohn.ausgaben;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Liest Zahlungs-Benachrichtigungen (Google Wallet, Banking-Apps) und merkt sie für die App vor. */
public class PaymentListener extends NotificationListenerService {

    static final String PREFS = "payments";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (!PaymentParser.watched(pkg)) return;
            Bundle ex = sbn.getNotification().extras;
            if (ex == null) return;
            CharSequence t = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence big = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence tx = big != null ? big : ex.getCharSequence(Notification.EXTRA_TEXT);
            PaymentParser.Result r = PaymentParser.parse(pkg, t == null ? "" : t.toString(), tx == null ? "" : tx.toString());
            if (r == null) return;
            store(this, r, pkg);
        } catch (Exception ignored) { }
    }

    static synchronized void store(Context ctx, PaymentParser.Result r, String pkg) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
        long now = System.currentTimeMillis();
        // Doppelt? (Wallet und Bank melden oft dieselbe Zahlung, Benachrichtigungen werden aktualisiert)
        JSONArray recent = new JSONArray(sp.getString("recent", "[]"));
        JSONArray keep = new JSONArray();
        for (int i = 0; i < recent.length(); i++) {
            JSONObject o = recent.getJSONObject(i);
            if (now - o.getLong("t") > 10 * 60 * 1000) continue;
            if (Math.abs(o.getDouble("a") - r.amount) < 0.005) return;
            keep.put(o);
        }
        keep.put(new JSONObject().put("t", now).put("a", r.amount));

        JSONArray q = new JSONArray(sp.getString("queue", "[]"));
        q.put(new JSONObject()
                .put("amount", r.amount).put("merchant", r.merchant).put("app", appName(pkg))
                .put("date", new SimpleDateFormat("yyyy-MM-dd", Locale.GERMANY).format(new Date(now)))
                .put("time", now));
        sp.edit().putString("recent", keep.toString()).putString("queue", q.toString()).apply();

        // Widget sofort anpassen, auch ohne die App zu öffnen
        SharedPreferences wp = ctx.getSharedPreferences(BudgetWidget.PREFS, MODE_PRIVATE);
        String w = wp.getString("data", null);
        if (w != null) {
            JSONObject o = new JSONObject(w);
            o.put("free", Math.round((o.getDouble("free") - r.amount) * 100) / 100.0);
            o.put("spent", Math.round((o.optDouble("spent", 0) + r.amount) * 100) / 100.0);
            wp.edit().putString("data", o.toString()).apply();
            BudgetWidget.updateAll(ctx);
        }
    }

    static String appName(String pkg) {
        if (pkg.contains("wallet") || pkg.contains("paisa")) return "Google Wallet";
        if (pkg.contains("spay") || pkg.contains("samsungpay")) return "Samsung Wallet";
        if (pkg.contains("paypal")) return "PayPal";
        if (pkg.contains("mobilepay")) return "MobilePay";
        if (pkg.contains("curve")) return "Curve";
        return "Banking-App";
    }

    static String take(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
        String q = sp.getString("queue", "[]");
        sp.edit().putString("queue", "[]").apply();
        return q;
    }
}
