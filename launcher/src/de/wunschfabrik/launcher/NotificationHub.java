package de.wunschfabrik.launcher;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Liest die Benachrichtigungen für den WF-Schnellbereich. Muss einmal unter
 * „Zugriff auf Benachrichtigungen“ erlaubt werden.
 */
public final class NotificationHub extends NotificationListenerService {
    public interface Listener { void onNotificationsChanged(); }

    private static NotificationHub instance;
    private static final List<Listener> listeners = new ArrayList<>();
    private static final Handler main = new Handler(Looper.getMainLooper());

    public static void addListener(Listener l) { if (!listeners.contains(l)) listeners.add(l); }
    public static void removeListener(Listener l) { listeners.remove(l); }

    private static void changed() {
        main.post(new Runnable() {
            @Override public void run() {
                for (Listener l : new ArrayList<>(listeners)) l.onNotificationsChanged();
            }
        });
    }

    @Override public void onListenerConnected() { instance = this; changed(); }
    /** Ab Android 7 vom System aufgerufen (android-23.jar kennt die Methode noch nicht). */
    public void onListenerDisconnected() { if (instance == this) instance = null; changed(); }
    @Override public void onDestroy() { if (instance == this) instance = null; super.onDestroy(); }
    @Override public void onNotificationPosted(StatusBarNotification sbn) { changed(); }
    @Override public void onNotificationRemoved(StatusBarNotification sbn) { changed(); }
    @Override public void onInterruptionFilterChanged(int f) { changed(); }

    /** Hat der Nutzer den Zugriff in den Einstellungen erlaubt? */
    public static boolean isAllowed(Context c) {
        String flat = Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
        if (flat == null) return false;
        ComponentName me = new ComponentName(c, NotificationHub.class);
        for (String s : flat.split(":")) {
            ComponentName cn = ComponentName.unflattenFromString(s);
            if (me.equals(cn)) return true;
        }
        return false;
    }

    public static boolean connected() { return instance != null; }

    /** Nur die Vollversion meldet den Dienst an (Play Protect blockiert ihn bei selbst installierten APKs). */
    public static boolean isDeclared(Context c) {
        try {
            c.getPackageManager().getServiceInfo(new ComponentName(c, NotificationHub.class), 0);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static CharSequence title(Notification n) {
        CharSequence t = n.extras.getCharSequence(Notification.EXTRA_TITLE_BIG);
        if (TextUtils.isEmpty(t)) t = n.extras.getCharSequence(Notification.EXTRA_TITLE);
        return t;
    }

    static CharSequence body(Notification n) {
        CharSequence t = n.extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (TextUtils.isEmpty(t)) t = n.extras.getCharSequence(Notification.EXTRA_TEXT);
        return t;
    }

    /** Sichtbare Benachrichtigungen: Laufendes (Musik, Navigation) zuerst, dann die neuesten. */
    public static List<StatusBarNotification> current() {
        List<StatusBarNotification> out = new ArrayList<>();
        NotificationHub hub = instance;
        if (hub == null) return out;
        StatusBarNotification[] all;
        try { all = hub.getActiveNotifications(); } catch (Exception e) { return out; }
        if (all == null) return out;
        Set<String> groupsWithChildren = new HashSet<>();
        for (StatusBarNotification s : all) {
            if ((s.getNotification().flags & Notification.FLAG_GROUP_SUMMARY) == 0 && s.getGroupKey() != null) {
                groupsWithChildren.add(s.getGroupKey());
            }
        }
        for (StatusBarNotification s : all) {
            Notification n = s.getNotification();
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0 && groupsWithChildren.contains(s.getGroupKey())) continue;
            if (TextUtils.isEmpty(title(n)) && TextUtils.isEmpty(body(n))) continue;
            out.add(s);
        }
        Collections.sort(out, new Comparator<StatusBarNotification>() {
            @Override public int compare(StatusBarNotification a, StatusBarNotification b) {
                boolean oa = a.isOngoing(), ob = b.isOngoing();
                if (oa != ob) return oa ? -1 : 1;
                return Long.compare(b.getPostTime(), a.getPostTime());
            }
        });
        return out;
    }

    public static void dismiss(StatusBarNotification s) {
        NotificationHub hub = instance;
        if (hub != null) try { hub.cancelNotification(s.getKey()); } catch (Exception ignored) { }
    }

    public static void dismissAll() {
        NotificationHub hub = instance;
        if (hub != null) try { hub.cancelAllNotifications(); } catch (Exception ignored) { }
    }

    /** „Nicht stören“ umschalten (nur Prioritäts-Benachrichtigungen ↔ alle). */
    public static boolean setDoNotDisturb(boolean on) {
        NotificationHub hub = instance;
        if (hub == null) return false;
        try {
            hub.requestInterruptionFilter(on ? INTERRUPTION_FILTER_PRIORITY : INTERRUPTION_FILTER_ALL);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
