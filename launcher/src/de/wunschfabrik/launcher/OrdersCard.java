package de.wunschfabrik.launcher;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Karte „Heute“ auf dem Startbildschirm: Aufträge aus der Wunsch-Fabrik-App, gelesen über den
 * geheimen Link der Werkstatt-Anzeige (keine Kontaktdaten, keine Preise).
 */
public final class OrdersCard {
    private static final int MAX_ROWS = 3;
    private static final long REFRESH_MS = 5 * 60000L;
    private static final Map<String, String> STATUS = new HashMap<>();
    private static final Map<String, Integer> STATUS_COLOR = new HashMap<>();
    static {
        String[][] s = {
                {"inquiry", "Angefragt", "#9d94ad"}, {"approval", "Freigabe", "#38bdf8"},
                {"material", "Material bestellt", "#f59e0b"}, {"production", "In Produktion", "#A855F7"},
                {"done", "Fertig", "#34d399"}, {"delivered", "Abgeholt", "#6b6479"},
        };
        for (String[] r : s) { STATUS.put(r[0], r[1]); STATUS_COLOR.put(r[0], Color.parseColor(r[2])); }
    }

    private final Activity act;
    private final Prefs prefs;
    private final float density;
    private final LinearLayout card;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final LruCache<String, Bitmap> thumbs = new LruCache<>(24);
    private long lastLoad;
    private int generation;

    public OrdersCard(Activity a, Prefs p) {
        act = a;
        prefs = p;
        density = a.getResources().getDisplayMetrics().density;
        card = new LinearLayout(a);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(WfStyle.card(dp(16), density));
        card.setPadding(dp(14), dp(12), dp(14), dp(10));
        card.setVisibility(View.GONE);
        card.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openApp(""); }
        });
    }

    public View view() { return card; }

    private String base() { return Logic.displayBase(prefs.displayLink(), Tiles.AUFTRAEGE_URL); }

    private void openApp(String hash) {
        try {
            act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(base() + (hash.isEmpty() ? "" : "index.php" + hash)))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) { }
    }

    /** Beim Zurückkehren zum Startbildschirm aufrufen; lädt höchstens alle 5 Minuten neu. */
    public void refresh(boolean force) {
        final String token = Logic.displayToken(prefs.displayLink());
        if (token == null) { card.setVisibility(View.GONE); return; }
        if (!force && System.currentTimeMillis() - lastLoad < REFRESH_MS) return;
        lastLoad = System.currentTimeMillis();
        final int gen = ++generation;
        final String api = base() + "display_api.php?full=1&t=" + token;
        if (card.getChildCount() == 0) showMessage("Lade Aufträge …");
        new Thread(new Runnable() {
            @Override public void run() {
                String err = null;
                JSONObject data = null;
                try {
                    data = new JSONObject(get(api));
                    if (!data.optBoolean("ok")) err = "Link ungültig oder gesperrt – in den Launcher-Einstellungen neu eintragen";
                } catch (java.io.FileNotFoundException | SecurityException e) {
                    err = "Link ungültig oder gesperrt – in den Launcher-Einstellungen neu eintragen";
                } catch (Exception e) {
                    err = "Aufträge gerade nicht erreichbar";
                }
                final String error = err;
                final JSONObject d = data;
                main.post(new Runnable() {
                    @Override public void run() {
                        if (gen != generation) return;
                        if (error != null) { lastLoad = 0; showMessage(error); } else render(d, token);
                    }
                });
            }
        }, "orders").start();
    }

    static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(10000);
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            int code = c.getResponseCode();
            if (code == 403) throw new SecurityException("403");
            if (code >= 400) throw new java.io.IOException("HTTP " + code);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    private void showMessage(String msg) {
        card.removeAllViews();
        card.setVisibility(View.VISIBLE);
        card.addView(header(null));
        TextView t = text(13, WfStyle.MUTED);
        t.setText(msg);
        t.setPadding(0, dp(6), 0, dp(4));
        card.addView(t);
    }

    private View header(String right) {
        LinearLayout h = new LinearLayout(act);
        h.setGravity(Gravity.CENTER_VERTICAL);
        TextView eb = text(11, WfStyle.P2);
        eb.setTypeface(WfStyle.bodyMedium(act));
        eb.setLetterSpacing(0.3f);
        eb.setAllCaps(true);
        eb.setText("Heute in der Werkstatt");
        h.addView(eb, new LinearLayout.LayoutParams(0, -2, 1f));
        if (right != null) {
            TextView r = text(12, WfStyle.MUTED);
            r.setText(right);
            h.addView(r);
        }
        return h;
    }

    private void render(JSONObject d, String token) {
        String today = d.optString("today");
        Map<String, String> procName = new HashMap<>();
        Map<String, Integer> procColor = new HashMap<>();
        JSONArray procs = d.optJSONArray("processes");
        if (procs != null) for (int i = 0; i < procs.length(); i++) {
            JSONObject p = procs.optJSONObject(i);
            procName.put(p.optString("key"), p.optString("name_de"));
            try { procColor.put(p.optString("key"), Color.parseColor(p.optString("color"))); } catch (Exception ignored) { }
        }
        // Heute geplant oder heute abzugeben, dazu Überfälliges
        List<JSONObject> rows = new ArrayList<>();
        JSONArray orders = d.optJSONArray("orders");
        if (orders != null) for (int i = 0; i < orders.length(); i++) {
            JSONObject o = orders.optJSONObject(i);
            if (o == null || "done".equals(o.optString("status"))) continue;
            boolean planned = today.equals(o.optString("plan_date"));
            boolean due = today.equals(o.optString("due_date"));
            if (planned || due || o.optBoolean("overdue")) rows.add(o);
        }
        card.removeAllViews();
        card.setVisibility(View.VISIBLE);
        card.addView(header(rows.isEmpty() ? null : rows.size() == 1 ? "1 Auftrag" : rows.size() + " Aufträge"));
        if (rows.isEmpty()) {
            TextView t = text(13, WfStyle.MUTED);
            t.setText("Heute nichts geplant 🎉");
            t.setPadding(0, dp(6), 0, dp(4));
            card.addView(t);
            return;
        }
        for (int i = 0; i < Math.min(MAX_ROWS, rows.size()); i++) card.addView(row(rows.get(i), today, token, procName, procColor));
        if (rows.size() > MAX_ROWS) {
            TextView more = text(12, WfStyle.P3);
            more.setText("+ " + (rows.size() - MAX_ROWS) + " weitere");
            more.setPadding(0, dp(6), 0, 0);
            card.addView(more);
        }
    }

    private View row(final JSONObject o, String today, String token, Map<String, String> procName, Map<String, Integer> procColor) {
        LinearLayout r = new LinearLayout(act);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(0, dp(8), 0, 0);

        final ImageView th = new ImageView(act);
        th.setScaleType(ImageView.ScaleType.CENTER_CROP);
        th.setClipToOutline(true);
        GradientDrawable tbg = new GradientDrawable();
        tbg.setCornerRadius(dp(8));
        tbg.setColor(WfStyle.SURFACE3);
        th.setBackground(tbg);
        r.addView(th, new LinearLayout.LayoutParams(dp(40), dp(40)));
        if (!o.isNull("thumb")) loadThumb(base() + "display_api.php?t=" + token + "&file=" + o.optInt("thumb"), th);

        LinearLayout texts = new LinearLayout(act);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.setPadding(dp(10), 0, dp(8), 0);
        String start = o.isNull("start") ? "" : o.optString("start");
        String end = o.isNull("end") ? "" : o.optString("end");
        String when;
        if (o.optBoolean("overdue")) when = "überfällig";
        else if (!today.equals(o.optString("plan_date")) && today.equals(o.optString("due_date"))) when = "Abgabe heute";
        else when = start.isEmpty() ? "heute" : start + (end.isEmpty() ? "" : "–" + end);
        TextView t1 = text(14, WfStyle.TEXT);
        t1.setTypeface(WfStyle.bodyMedium(act));
        String title = o.optString("title");
        String qty = o.optInt("qty") > 0 ? o.optInt("qty") + " × " : "";
        t1.setText(when + "  ·  " + qty + (TextUtils.isEmpty(title) ? "Auftrag" : title));
        t1.setSingleLine(true);
        t1.setEllipsize(TextUtils.TruncateAt.END);
        if (o.optBoolean("overdue")) t1.setTextColor(0xFFF87171);
        texts.addView(t1);
        StringBuilder sub = new StringBuilder(o.optString("customer"));
        JSONArray ps = o.optJSONArray("processes");
        if (ps != null) for (int i = 0; i < ps.length(); i++) {
            String n = procName.get(ps.optString(i));
            if (n != null) sub.append(sub.length() > 0 ? " · " : "").append(n);
        }
        TextView t2 = text(12, WfStyle.MUTED);
        t2.setText(sub);
        t2.setSingleLine(true);
        t2.setEllipsize(TextUtils.TruncateAt.END);
        texts.addView(t2);
        r.addView(texts, new LinearLayout.LayoutParams(0, -2, 1f));

        String st = o.optString("status");
        TextView pill = text(10, Color.WHITE);
        pill.setText(STATUS.containsKey(st) ? STATUS.get(st) : st);
        pill.setPadding(dp(8), dp(3), dp(8), dp(3));
        GradientDrawable pbg = new GradientDrawable();
        pbg.setCornerRadius(dp(10));
        int col = STATUS_COLOR.containsKey(st) ? STATUS_COLOR.get(st) : WfStyle.MUTED;
        pbg.setColor((col & 0x00FFFFFF) | 0x40000000);
        pbg.setStroke(Math.max(1, dp(1)), col);
        pill.setBackground(pbg);
        r.addView(pill);

        r.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openApp(""); }
        });
        return r;
    }

    private void loadThumb(final String url, final ImageView into) {
        Bitmap cached = thumbs.get(url);
        if (cached != null) { into.setImageBitmap(cached); return; }
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(10000);
                    BitmapFactory.Options opt = new BitmapFactory.Options();
                    opt.inSampleSize = 2;
                    final Bitmap b = BitmapFactory.decodeStream(c.getInputStream(), null, opt);
                    c.disconnect();
                    if (b == null) return;
                    thumbs.put(url, b);
                    main.post(new Runnable() { @Override public void run() { into.setImageBitmap(b); } });
                } catch (Exception ignored) { }
            }
        }, "thumb").start();
    }

    private int dp(float v) { return (int) (v * density + 0.5f); }

    private TextView text(float sp, int color) {
        TextView t = new TextView(act);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(WfStyle.body(act));
        return t;
    }
}
