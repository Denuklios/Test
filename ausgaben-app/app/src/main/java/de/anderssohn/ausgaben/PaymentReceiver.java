package de.anderssohn.ausgaben;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Nimmt Zahlungen von der Helfer-App „AusgabenKompass Zahlungen“ entgegen.
 * Nur Apps mit derselben Signatur dürfen senden (Berechtigung mit protectionLevel=signature).
 */
public class PaymentReceiver extends BroadcastReceiver {

    static final String ACTION = "de.anderssohn.ausgaben.PAYMENT";
    static final String PREFS = "payments";
    static final String HELPER = "de.anderssohn.ausgaben.zahlungen";

    @Override
    public void onReceive(Context ctx, Intent i) {
        if (!ACTION.equals(i.getAction())) return;
        try {
            double amount = i.getDoubleExtra("amount", 0);
            if (amount <= 0 || amount > 10000) return;
            store(ctx, amount, i.getStringExtra("merchant"), i.getStringExtra("app"), i.getLongExtra("time", System.currentTimeMillis()));
        } catch (Exception ignored) { }
    }

    static synchronized void store(Context ctx, double amount, String merchant, String app, long time) throws Exception {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        JSONArray recent = new JSONArray(sp.getString("recent", "[]"));
        JSONArray keep = new JSONArray();
        for (int k = 0; k < recent.length(); k++) {
            JSONObject o = recent.getJSONObject(k);
            if (now - o.getLong("t") > 10 * 60 * 1000) continue;
            if (Math.abs(o.getDouble("a") - amount) < 0.005) return; // schon erfasst
            keep.put(o);
        }
        keep.put(new JSONObject().put("t", now).put("a", amount));
        JSONArray q = new JSONArray(sp.getString("queue", "[]"));
        q.put(new JSONObject().put("amount", amount).put("merchant", merchant == null ? "" : merchant)
                .put("app", app == null ? "Handy" : app)
                .put("date", new SimpleDateFormat("yyyy-MM-dd", Locale.GERMANY).format(new Date(time)))
                .put("time", time));
        sp.edit().putString("recent", keep.toString()).putString("queue", q.toString()).apply();

        // Widget sofort anpassen
        SharedPreferences wp = ctx.getSharedPreferences(BudgetWidget.PREFS, Context.MODE_PRIVATE);
        String w = wp.getString("data", null);
        if (w != null) {
            JSONObject o = new JSONObject(w);
            o.put("free", Math.round((o.getDouble("free") - amount) * 100) / 100.0);
            o.put("spent", Math.round((o.optDouble("spent", 0) + amount) * 100) / 100.0);
            wp.edit().putString("data", o.toString()).apply();
            BudgetWidget.updateAll(ctx);
        }
    }

    static String take(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String q = sp.getString("queue", "[]");
        sp.edit().putString("queue", "[]").apply();
        return q;
    }
}
