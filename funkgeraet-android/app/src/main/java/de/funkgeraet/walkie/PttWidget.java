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
        String big, small;
        int bg;
        PendingIntent click;
        if (s == null) {
            big = "Funk AUS";
            small = "Tippen zum Einschalten";
            bg = R.drawable.widget_off;
            Intent open = new Intent(c, MainActivity.class).putExtra(MainActivity.EXTRA_AUTOSTART, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            click = PendingIntent.getActivity(c, 3, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        } else {
            click = toggleIntent(c);
            String sp = s.speakerName();
            if (s.talking) {
                big = "SENDET";
                small = "Tippen = fertig";
                bg = R.drawable.widget_tx;
            } else if (!s.connected) {
                big = "Verbinde …";
                small = "Kanal " + s.channel;
                bg = R.drawable.widget_off;
            } else if (sp != null) {
                big = sp;
                small = "spricht …";
                bg = R.drawable.widget_rx;
            } else {
                big = "SPRECHEN";
                small = s.statusLine();
                bg = R.drawable.widget_ready;
            }
        }
        v.setTextViewText(R.id.w_big, big);
        v.setTextViewText(R.id.w_small, small);
        v.setInt(R.id.w_root, "setBackgroundResource", bg);
        v.setOnClickPendingIntent(R.id.w_root, click);
        m.updateAppWidget(ids, v);
    }
}
