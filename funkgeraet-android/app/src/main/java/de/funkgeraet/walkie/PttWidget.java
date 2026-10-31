package de.funkgeraet.walkie;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Widget für den Startbildschirm: einmal tippen = senden, nochmal tippen = fertig.
 * (Widgets können kein „Gedrückthalten“ erkennen – daher Tippen zum Ein-/Ausschalten.)
 */
public class PttWidget extends AppWidgetProvider {
    public static final String ACTION_TOGGLE = "de.funkgeraet.walkie.TOGGLE";
    public static final String ACTION_OFF = "de.funkgeraet.walkie.OFF";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        updateAll(c);
    }

    static PendingIntent toggleIntent(Context c) {
        Intent i = new Intent(c, ActionReceiver.class).setAction(ACTION_TOGGLE);
        return PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static PendingIntent offIntent(Context c) {
        Intent i = new Intent(c, ActionReceiver.class).setAction(ACTION_OFF);
        return PendingIntent.getBroadcast(c, 2, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    public static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, PttWidget.class));
        if (ids == null || ids.length == 0) return;

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        RadioService s = RadioService.instance;
        String big, small, footer;
        int color;
        boolean active = false;
        PendingIntent click;
        if (s == null) {
            big = "AUS"; small = "tippen = einschalten"; footer = "Funkgerät";
            color = Art.GREY;
            Intent open = new Intent(c, MainActivity.class).putExtra(MainActivity.EXTRA_AUTOSTART, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            click = PendingIntent.getActivity(c, 3, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        } else {
            click = toggleIntent(c);
            String sp = s.speakerName();
            footer = "CH " + s.channel + (s.connected ? " · " + (s.members.size() + 1) + " online" : "");
            if (s.talking) {
                big = "SENDET"; small = "tippen = fertig"; color = Art.RED; active = true;
            } else if (!s.connected) {
                big = "VERBINDE"; small = "bitte warten"; color = Art.AMBER;
            } else if (sp != null) {
                big = "EMPFANG"; small = sp; color = Art.GREEN; active = true;
            } else {
                big = "SPRECHEN"; small = "tippen = senden"; color = Art.CYAN;
            }
        }
        v.setImageViewBitmap(R.id.w_img, Art.widget(color, active, big, small, footer));
        v.setOnClickPendingIntent(R.id.w_root, click);
        m.updateAppWidget(ids, v);
    }
}
