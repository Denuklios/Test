package de.wunschfabrik.launcher;

import android.app.ActivityOptions;
import android.app.PendingIntent;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.concurrent.Executor;

/** Neuere Android-Funktionen, die android-23.jar noch nicht kennt – per Reflection. */
public final class Compat {
    private Compat() {}

    /**
     * PendingIntent einer anderen App starten (Benachrichtigung antippen, Antworten).
     * Ab Android 14 muss der Absender ausdrücklich erlauben, dass dabei eine Activity startet.
     */
    public static void sendPending(Context c, PendingIntent pi, Intent fillIn) throws PendingIntent.CanceledException {
        Bundle opts = null;
        if (Build.VERSION.SDK_INT >= 34) {
            try {
                ActivityOptions o = ActivityOptions.makeBasic();
                Method m = ActivityOptions.class.getMethod("setPendingIntentBackgroundActivityStartMode", int.class);
                m.invoke(o, 1); // MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                opts = o.toBundle();
            } catch (Exception ignored) { }
        }
        pi.send(c, 0, fillIn, null, null, null, opts);
    }

    /** Hintergrundbild für Startbildschirm und (ab Android 7) Sperrbildschirm setzen. */
    public static void setWallpaper(Context c, Bitmap bmp) throws Exception {
        WallpaperManager wm = WallpaperManager.getInstance(c);
        if (Build.VERSION.SDK_INT >= 24) {
            try {
                Method m = WallpaperManager.class.getMethod("setBitmap", Bitmap.class, Rect.class, boolean.class, int.class);
                m.invoke(wm, bmp, null, true, 1 | 2); // FLAG_SYSTEM | FLAG_LOCK
                return;
            } catch (NoSuchMethodException ignored) { }
        }
        wm.setBitmap(bmp);
    }

    public interface Result { void done(boolean added); }

    /** Ab Android 13: System fragt „Kachel hinzufügen?“. Liefert false, wenn das nicht geht. */
    public static boolean requestAddTile(Context c, ComponentName tile, CharSequence label, int iconRes,
                                         final Result result) {
        if (Build.VERSION.SDK_INT < 33) return false;
        try {
            Object sbm = c.getSystemService("statusbar");
            Class<?> consumer = Class.forName("java.util.function.Consumer");
            Method m = sbm.getClass().getMethod("requestAddTileService", ComponentName.class, CharSequence.class,
                    Icon.class, Executor.class, consumer);
            final android.os.Handler main = new android.os.Handler(c.getMainLooper());
            Executor ex = new Executor() {
                @Override public void execute(Runnable r) { main.post(r); }
            };
            Object cb = Proxy.newProxyInstance(consumer.getClassLoader(), new Class<?>[]{consumer}, new InvocationHandler() {
                @Override public Object invoke(Object proxy, Method method, Object[] args) {
                    if ("accept".equals(method.getName())) {
                        int code = args[0] instanceof Integer ? (Integer) args[0] : -1;
                        // 1 = schon vorhanden, 2 = hinzugefügt
                        result.done(code == 1 || code == 2);
                        return null;
                    }
                    if ("hashCode".equals(method.getName())) return System.identityHashCode(proxy);
                    if ("equals".equals(method.getName())) return proxy == args[0];
                    if ("toString".equals(method.getName())) return "TileResult";
                    return null;
                }
            });
            m.invoke(sbm, tile, label, Icon.createWithResource(c, iconRes), ex, cb);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
