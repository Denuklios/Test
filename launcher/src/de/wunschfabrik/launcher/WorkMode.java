package de.wunschfabrik.launcher;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.Calendar;

/**
 * Arbeits- und Feierabend-Modus. Zu den Wechselzeiten weckt ein Alarm diesen Empfänger,
 * der bei Bedarf „Nicht stören“ umschaltet – auch wenn der Launcher gerade nicht offen ist.
 */
public final class WorkMode extends BroadcastReceiver {
    public static final int OFF = 0, WORK = 1, FREE = 2;

    /** Aktueller Modus: OFF wenn ausgeschaltet, sonst WORK oder FREE (Handumschaltung hat Vorrang bis zum nächsten Wechsel). */
    public static int current(Context c, Prefs p) {
        if (!p.workModeEnabled()) return OFF;
        if (p.workOverride() != 0 && System.currentTimeMillis() < p.workOverrideUntil()) return p.workOverride();
        return scheduled(p) ? WORK : FREE;
    }

    static boolean scheduled(Prefs p) {
        Calendar cal = Calendar.getInstance();
        return Logic.isWorkTime(dayIndex(cal), minute(cal), p.workStart(), p.workEnd(), p.workDays());
    }

    static int dayIndex(Calendar cal) { return (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7; } // Montag = 0
    static int minute(Calendar cal) { return cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE); }

    /** Zeitpunkt (ms) des nächsten planmäßigen Wechsels, oder 0. */
    public static long nextChange(Prefs p) {
        Calendar cal = Calendar.getInstance();
        int m = Logic.minutesToNextChange(dayIndex(cal), minute(cal), p.workStart(), p.workEnd(), p.workDays());
        if (m < 0) return 0;
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis() + m * 60000L;
    }

    /** Von Hand umschalten – gilt bis zum nächsten planmäßigen Wechsel. */
    public static void toggle(Context c, Prefs p) {
        int now = current(c, p);
        if (now == OFF) return;
        long until = nextChange(p);
        if (until == 0) until = System.currentTimeMillis() + 12 * 3600000L;
        p.setWorkOverride(now == WORK ? FREE : WORK, until);
        apply(c, p);
    }

    /** Nicht stören setzen und den nächsten Alarm planen. */
    public static void apply(Context c, Prefs p) {
        schedule(c, p);
        if (!p.workModeEnabled() || !p.dndAfterHours()) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (!nm.isNotificationPolicyAccessGranted()) return;
        boolean free = current(c, p) == FREE;
        int filter = nm.getCurrentInterruptionFilter();
        try {
            if (free && filter == NotificationManager.INTERRUPTION_FILTER_ALL) {
                nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY);
                p.setDndSetByUs(true);
            } else if (!free && p.dndSetByUs()) {
                // Nur ausschalten, was wir selbst eingeschaltet haben.
                if (filter == NotificationManager.INTERRUPTION_FILTER_PRIORITY) {
                    nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL);
                }
                p.setDndSetByUs(false);
            }
        } catch (SecurityException ignored) { }
    }

    private static void schedule(Context c, Prefs p) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, new Intent(c, WorkMode.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        am.cancel(pi);
        if (!p.workModeEnabled()) return;
        long next = nextChange(p);
        if (p.workOverride() != 0 && p.workOverrideUntil() > System.currentTimeMillis()) {
            next = next == 0 ? p.workOverrideUntil() : Math.min(next, p.workOverrideUntil());
        }
        if (next == 0) return;
        // Ungenauer Alarm (ohne Sonderrecht) – ein paar Minuten Abweichung sind egal.
        am.setWindow(AlarmManager.RTC_WAKEUP, next, 5 * 60000L, pi);
    }

    @Override public void onReceive(Context c, Intent intent) {
        Prefs p = new Prefs(c);
        if (p.workOverride() != 0 && System.currentTimeMillis() >= p.workOverrideUntil() - 60000L) {
            p.setWorkOverride(0, 0);
        }
        apply(c, p);
    }
}
