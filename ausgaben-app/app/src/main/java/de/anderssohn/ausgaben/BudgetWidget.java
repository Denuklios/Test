package de.anderssohn.ausgaben;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.graphics.Typeface;
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
        if (json == null) { v.setImageViewBitmap(R.id.w_ring, ring(ctx, -1, "–")); return v; }
        try {
            JSONObject o = new JSONObject(json);
            NumberFormat nf = NumberFormat.getCurrencyInstance(Locale.GERMANY);
            try { nf.setCurrency(Currency.getInstance(o.optString("currency", "EUR"))); } catch (Exception ignored) { }
            double free = o.getDouble("free");
            double avail = o.optDouble("available", 0);
            String end = o.getString("end"); // YYYY-MM-DD
            Calendar today = Calendar.getInstance();
            Calendar e = Calendar.getInstance();
            e.set(Integer.parseInt(end.substring(0, 4)), Integer.parseInt(end.substring(5, 7)) - 1, Integer.parseInt(end.substring(8, 10)), 23, 59);
            long days = (e.getTimeInMillis() - today.getTimeInMillis()) / 86400000L + 1;

            double ratio = avail > 0 ? free / avail : (free > 0 ? 1 : 0);
            int pct = (int) Math.round(Math.max(0, Math.min(1, ratio)) * 100);
            v.setImageViewBitmap(R.id.w_ring, ring(ctx, free < 0 ? 0 : ratio, free < 0 ? "!" : pct + "%"));
            v.setTextViewText(R.id.w_free, (free < 0 ? "−" : "") + nf.format(Math.abs(free)));
            v.setTextColor(R.id.w_free, free < 0 ? 0xFFFCA5A5 : 0xFFFFFFFF);

            // Status: Geld pro restlichem Tag im Vergleich zum Durchschnitt des Monats
            String chip; int chipBg;
            if (free < 0) { chip = "Über Budget"; chipBg = R.drawable.chip_bad; }
            else if (ratio < 0.15) { chip = "Knapp"; chipBg = R.drawable.chip_warn; }
            else { chip = "Im Plan"; chipBg = R.drawable.chip_ok; }
            v.setTextViewText(R.id.w_chip, chip);
            v.setInt(R.id.w_chip, "setBackgroundResource", chipBg);

            if (days < 1) {
                v.setTextViewText(R.id.w_label, "NEUER MONAT");
                v.setTextViewText(R.id.w_sub, "Tippen zum Aktualisieren");
            } else {
                v.setTextViewText(R.id.w_label, o.optString("label", "").toUpperCase(Locale.GERMANY));
                String sub;
                NumberFormat nf0 = NumberFormat.getCurrencyInstance(Locale.GERMANY);
                try { nf0.setCurrency(nf.getCurrency()); } catch (Exception ignored) { }
                nf0.setMaximumFractionDigits(0); nf0.setMinimumFractionDigits(0);
                if (free < 0) sub = nf.format(-free) + " über Budget";
                else if (days == 1) sub = pct + " % von " + nf0.format(avail) + " übrig · letzter Tag";
                else sub = nf.format(free / days) + " pro Tag · noch " + days + " Tage";
                v.setTextViewText(R.id.w_sub, sub);
            }
        } catch (Exception ignored) { }
        return v;
    }

    /** Ring-Anzeige: Anteil des noch freien Geldes. ratio < 0 = keine Daten. */
    static Bitmap ring(Context ctx, double ratio, String center) {
        float d = ctx.getResources().getDisplayMetrics().density;
        int size = Math.round(76 * d);
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        float stroke = 8 * d, pad = stroke + 1 * d;
        RectF r = new RectF(pad, pad, size - pad, size - pad);

        Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(stroke);
        track.setColor(0x26FFFFFF);
        c.drawArc(r, 0, 360, false, track);

        int col1, col2;
        if (ratio >= 0 && ratio < 0.15) { col1 = 0xFFFBBF24; col2 = 0xFFF97316; }
        else { col1 = 0xFF5EEAD4; col2 = 0xFF34D399; }
        if (ratio == 0 && "!".equals(center)) { col1 = 0xFFF87171; col2 = 0xFFDC2626; }

        if (ratio > 0) {
            float sweep = (float) (Math.min(1, ratio) * 360);
            Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
            arc.setStyle(Paint.Style.STROKE);
            arc.setStrokeWidth(stroke);
            arc.setStrokeCap(Paint.Cap.ROUND);
            SweepGradient g = new SweepGradient(size / 2f, size / 2f, new int[]{col2, col1, col2}, new float[]{0f, 0.5f, 1f});
            android.graphics.Matrix m = new android.graphics.Matrix();
            m.setRotate(-90, size / 2f, size / 2f);
            g.setLocalMatrix(m);
            arc.setShader(g);
            // leichter Leuchteffekt
            Paint glow = new Paint(arc);
            glow.setStrokeWidth(stroke * 1.9f);
            glow.setAlpha(50);
            c.drawArc(r, -90, sweep, false, glow);
            c.drawArc(r, -90, sweep, false, arc);
        } else if ("!".equals(center)) {
            track.setColor(0xFFDC2626);
            c.drawArc(r, 0, 360, false, track);
        }

        Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
        t.setColor(Color.WHITE);
        t.setTextAlign(Paint.Align.CENTER);
        t.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
        t.setTextSize(center.length() > 3 ? 19 * d : 21 * d);
        float cy = size / 2f + (ratio >= 0 && !"!".equals(center) ? 2 * d : 7 * d);
        c.drawText(center, size / 2f, cy, t);
        if (ratio >= 0 && !"!".equals(center)) {
            Paint s = new Paint(Paint.ANTI_ALIAS_FLAG);
            s.setColor(0xB3E6FFFA);
            s.setTextAlign(Paint.Align.CENTER);
            s.setTextSize(9.5f * d);
            s.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            c.drawText("FREI", size / 2f, cy + 12 * d, s);
        }
        return bmp;
    }
}
