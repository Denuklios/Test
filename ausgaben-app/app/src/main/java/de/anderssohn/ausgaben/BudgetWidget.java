package de.anderssohn.ausgaben;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.Calendar;
import java.util.Currency;
import java.util.Locale;

/** Homescreen-Widget: freies Geld, pro Tag, Schnellknöpfe Betrag / Foto / Hochladen. */
public class BudgetWidget extends AppWidgetProvider {

    static final String PREFS = "widget";
    static final String ACTION_PREFIX = "de.anderssohn.ausgaben.WIDGET_";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, BudgetWidget.class));
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    private static PendingIntent open(Context ctx, String action, int req) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction(action == null ? Intent.ACTION_MAIN : ACTION_PREFIX + action);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static RemoteViews build(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_budget);
        v.setOnClickPendingIntent(R.id.w_info, open(ctx, null, 0));
        v.setOnClickPendingIntent(R.id.w_amount, open(ctx, "amount", 1));
        v.setOnClickPendingIntent(R.id.w_photo, open(ctx, "photo", 2));
        v.setOnClickPendingIntent(R.id.w_upload, open(ctx, "upload", 3));
        String json = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", null);
        if (json == null) return v;
        try {
            JSONObject o = new JSONObject(json);
            NumberFormat nf = NumberFormat.getCurrencyInstance(Locale.GERMANY);
            try { nf.setCurrency(Currency.getInstance(o.optString("currency", "EUR"))); } catch (Exception ignored) { }
            double free = o.getDouble("free");
            String end = o.getString("end"); // YYYY-MM-DD
            Calendar today = Calendar.getInstance();
            Calendar e = Calendar.getInstance();
            e.set(Integer.parseInt(end.substring(0, 4)), Integer.parseInt(end.substring(5, 7)) - 1, Integer.parseInt(end.substring(8, 10)), 23, 59);
            long days = (e.getTimeInMillis() - today.getTimeInMillis()) / 86400000L + 1;
            v.setTextViewText(R.id.w_free, (free < 0 ? "−" : "") + nf.format(Math.abs(free)));
            v.setTextColor(R.id.w_free, free < 0 ? 0xFFFECACA : 0xFFFFFFFF);
            if (days < 1) {
                v.setTextViewText(R.id.w_label, "Neuer Monat");
                v.setTextViewText(R.id.w_sub, "App öffnen zum Aktualisieren");
            } else {
                v.setTextViewText(R.id.w_label, "Noch frei · " + o.optString("label", ""));
                v.setTextViewText(R.id.w_sub, nf.format(Math.max(0, free) / days) + " pro Tag · noch " + days + (days == 1 ? " Tag" : " Tage"));
            }
        } catch (Exception ignored) { }
        return v;
    }
}
