package de.wunschfabrik.launcher;

import android.app.ActivityOptions;
import android.content.Context;
import android.content.pm.LauncherActivityInfo;
import android.content.pm.LauncherApps;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.os.UserHandle;
import android.os.UserManager;
import android.view.View;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Lädt die installierten Apps im Hintergrund und meldet Änderungen (Installieren, Löschen, Update). */
public final class AppRepository {
    public interface Listener { void onAppsChanged(List<AppEntry> apps); }

    private final Context ctx;
    private final LauncherApps launcherApps;
    private final UserManager userManager;
    private final Prefs prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Listener listener;
    private final Map<String, Drawable> iconCache = new HashMap<>();
    private volatile int generation = 0;

    private final LauncherApps.Callback callback = new LauncherApps.Callback() {
        @Override public void onPackageRemoved(String p, UserHandle u) { reload(); }
        @Override public void onPackageAdded(String p, UserHandle u) { reload(); }
        @Override public void onPackageChanged(String p, UserHandle u) { invalidate(p); reload(); }
        @Override public void onPackagesAvailable(String[] p, UserHandle u, boolean r) { reload(); }
        @Override public void onPackagesUnavailable(String[] p, UserHandle u, boolean r) { reload(); }
    };

    public AppRepository(Context c, Prefs prefs, Listener l) {
        ctx = c.getApplicationContext();
        launcherApps = (LauncherApps) ctx.getSystemService(Context.LAUNCHER_APPS_SERVICE);
        userManager = (UserManager) ctx.getSystemService(Context.USER_SERVICE);
        this.prefs = prefs;
        listener = l;
    }

    public void start() { launcherApps.registerCallback(callback, main); reload(); }
    public void stop() { launcherApps.unregisterCallback(callback); }

    private synchronized void invalidate(String pkg) {
        List<String> drop = new ArrayList<>();
        for (String k : iconCache.keySet()) if (k.startsWith(pkg + "/")) drop.add(k);
        for (String k : drop) iconCache.remove(k);
    }

    public void reload() {
        final int gen = ++generation;
        new Thread(new Runnable() {
            @Override public void run() {
                final List<AppEntry> apps = load();
                main.post(new Runnable() {
                    @Override public void run() { if (gen == generation) listener.onAppsChanged(apps); }
                });
            }
        }, "apps").start();
    }

    private List<AppEntry> load() {
        List<AppEntry> out = new ArrayList<>();
        UserHandle me = Process.myUserHandle();
        String self = ctx.getPackageName();
        for (UserHandle user : userManager.getUserProfiles()) {
            List<LauncherActivityInfo> infos;
            try { infos = launcherApps.getActivityList(null, user); } catch (Exception e) { continue; }
            long serial = userManager.getSerialNumberForUser(user);
            for (LauncherActivityInfo info : infos) {
                if (info.getComponentName().getPackageName().equals(self) && user.equals(me)) continue;
                CharSequence label = info.getLabel();
                AppEntry e = new AppEntry(info.getComponentName(), user, serial,
                        label == null ? info.getComponentName().getPackageName() : label.toString(),
                        !user.equals(me));
                e.customLabel = prefs.customLabel(e.key);
                synchronized (this) {
                    e.icon = iconCache.get(e.key);
                    if (e.icon == null) {
                        try { e.icon = info.getBadgedIcon(0); } catch (Exception ex) { e.icon = null; }
                        if (e.icon != null) iconCache.put(e.key, e.icon);
                    }
                }
                out.add(e);
            }
        }
        final Collator col = Collator.getInstance(Locale.getDefault());
        col.setStrength(Collator.PRIMARY);
        Collections.sort(out, new Comparator<AppEntry>() {
            @Override public int compare(AppEntry a, AppEntry b) { return col.compare(a.label(), b.label()); }
        });
        return out;
    }

    public void launch(AppEntry e, View from) {
        Rect bounds = null;
        Bundle opts = null;
        if (from != null) {
            int[] loc = new int[2];
            from.getLocationOnScreen(loc);
            bounds = new Rect(loc[0], loc[1], loc[0] + from.getWidth(), loc[1] + from.getHeight());
            opts = ActivityOptions.makeScaleUpAnimation(from, 0, 0, from.getWidth(), from.getHeight()).toBundle();
        }
        launcherApps.startMainActivity(e.component, e.user, bounds, opts);
    }

    public void showAppInfo(AppEntry e) {
        launcherApps.startAppDetailsActivity(e.component, e.user, null, null);
    }
}
