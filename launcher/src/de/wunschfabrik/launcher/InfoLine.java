package de.wunschfabrik.launcher;

import android.Manifest;
import android.app.Activity;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.CalendarContract;
import android.text.TextUtils;
import android.text.format.DateFormat;
import android.util.TypedValue;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.Calendar;
import java.util.Locale;

/** Zeile unter Datum/Uhr: Wetter (Open-Meteo, ohne Konto) und nächster Termin aus dem Kalender. */
public final class InfoLine {
    private static final long WEATHER_MAX_AGE = 30 * 60000L;

    private final Activity act;
    private final Prefs prefs;
    private final LinearLayout box;
    private final TextView weather;
    private final TextView event;
    private final Handler main = new Handler(Looper.getMainLooper());
    private long eventId = -1, eventBegin, eventEnd;
    private boolean loadingWeather;

    public InfoLine(Activity a, Prefs p) {
        act = a;
        prefs = p;
        float d = a.getResources().getDisplayMetrics().density;
        box = new LinearLayout(a);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(0, (int) (10 * d), 0, 0);
        weather = line();
        event = line();
        box.addView(weather);
        box.addView(event);
        event.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { openEvent(); }
        });
    }

    private TextView line() {
        TextView t = new TextView(act);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        t.setTextColor(WfStyle.TEXT);
        t.setTypeface(WfStyle.body(act));
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setPadding(0, 2, 0, 2);
        t.setVisibility(View.GONE);
        return t;
    }

    public View view() { return box; }

    public void refresh() {
        refreshEvent();
        refreshWeather(false);
    }

    // ---------- Kalender ----------

    public static boolean hasCalendarPermission(Activity a) {
        return a.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    private void refreshEvent() {
        if (!prefs.showEvents() || !hasCalendarPermission(act)) { event.setVisibility(View.GONE); return; }
        long now = System.currentTimeMillis();
        Uri.Builder b = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, now);
        ContentUris.appendId(b, now + 36 * 3600000L);
        String[] cols = {CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.TITLE,
                CalendarContract.Instances.BEGIN, CalendarContract.Instances.END, CalendarContract.Instances.ALL_DAY};
        eventId = -1;
        try (Cursor c = act.getContentResolver().query(b.build(), cols,
                CalendarContract.Instances.END + " > ? AND " + CalendarContract.Instances.VISIBLE + " = 1",
                new String[]{String.valueOf(now)}, CalendarContract.Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext()) {
                if (c.getInt(4) == 1) continue; // ganztägige Termine überspringen (Geburtstage usw.)
                eventId = c.getLong(0);
                eventBegin = c.getLong(2);
                eventEnd = c.getLong(3);
                String title = c.getString(1);
                event.setText("📅  " + when(eventBegin) + "  " + (TextUtils.isEmpty(title) ? "Termin" : title));
                event.setVisibility(View.VISIBLE);
                return;
            }
        } catch (Exception ignored) { }
        event.setText("📅  Keine Termine bis morgen");
        event.setVisibility(View.VISIBLE);
    }

    private String when(long t) {
        Calendar now = Calendar.getInstance(), c = Calendar.getInstance();
        c.setTimeInMillis(t);
        String time = DateFormat.getTimeFormat(act).format(c.getTime());
        if (t <= now.getTimeInMillis()) return "jetzt";
        if (c.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR)) return time;
        return "morgen " + time;
    }

    private void openEvent() {
        try {
            if (eventId >= 0) {
                act.startActivity(new Intent(Intent.ACTION_VIEW, ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, eventId))
                        .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, eventBegin)
                        .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, eventEnd));
            } else {
                act.startActivity(Intent.makeMainSelectorActivity(Intent.ACTION_MAIN, Intent.CATEGORY_APP_CALENDAR)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
        } catch (Exception ignored) { }
    }

    // ---------- Wetter ----------

    public void refreshWeather(boolean force) {
        final String city = prefs.weatherCity();
        if (city.isEmpty()) { weather.setVisibility(View.GONE); return; }
        String cache = prefs.weatherCache();
        if (!cache.isEmpty()) { weather.setText(cache); weather.setVisibility(View.VISIBLE); }
        if (!force && System.currentTimeMillis() - prefs.weatherCacheTime() < WEATHER_MAX_AGE && !cache.isEmpty()) return;
        if (loadingWeather) return;
        loadingWeather = true;
        new Thread(new Runnable() {
            @Override public void run() {
                String result = null;
                try {
                    String coords = prefs.weatherCoords();
                    String name = city;
                    if (coords.isEmpty()) {
                        JSONObject g = new JSONObject(OrdersCard.get("https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name="
                                + URLEncoder.encode(city, "UTF-8")));
                        JSONObject r = g.getJSONArray("results").getJSONObject(0);
                        coords = r.getDouble("latitude") + "," + r.getDouble("longitude") + "," + r.getString("name");
                        prefs.setWeatherCoords(coords);
                    }
                    String[] c = coords.split(",", 3);
                    if (c.length == 3) name = c[2];
                    JSONObject w = new JSONObject(OrdersCard.get("https://api.open-meteo.com/v1/forecast?latitude=" + c[0]
                            + "&longitude=" + c[1] + "&current=temperature_2m,weather_code"
                            + "&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto"));
                    JSONObject cur = w.getJSONObject("current");
                    JSONObject day = w.getJSONObject("daily");
                    int code = cur.getInt("weather_code");
                    result = String.format(Locale.GERMAN, "%s  %d°  %s · %s  ↑%d° ↓%d°", Logic.weatherIcon(code),
                            Math.round(cur.getDouble("temperature_2m")), Logic.weatherText(code), name,
                            Math.round(day.getJSONArray("temperature_2m_max").getDouble(0)),
                            Math.round(day.getJSONArray("temperature_2m_min").getDouble(0)));
                    prefs.setWeatherCache(result);
                } catch (org.json.JSONException e) {
                    if (prefs.weatherCoords().isEmpty()) result = "🌡  Ort „" + city + "“ nicht gefunden";
                } catch (Exception ignored) {
                    // offline: alten Stand stehen lassen
                }
                final String text = result;
                main.post(new Runnable() {
                    @Override public void run() {
                        loadingWeather = false;
                        if (text != null) { weather.setText(text); weather.setVisibility(View.VISIBLE); }
                    }
                });
            }
        }, "weather").start();
    }
}
