package de.wunschfabrik.launcher;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Alle Einstellungen des Launchers. */
public final class Prefs {
    private static final String SEP = "\n";
    private final SharedPreferences sp;

    public Prefs(Context c) {
        sp = c.getSharedPreferences("launcher", Context.MODE_PRIVATE);
    }

    public List<String> favorites() {
        String s = sp.getString("favorites", "");
        return s.isEmpty() ? new ArrayList<String>() : new ArrayList<>(Arrays.asList(s.split(SEP)));
    }

    public void setFavorites(List<String> keys) {
        StringBuilder b = new StringBuilder();
        for (String k : keys) { if (b.length() > 0) b.append(SEP); b.append(k); }
        sp.edit().putString("favorites", b.toString()).apply();
    }

    public boolean favoritesInitialized() { return sp.getBoolean("favorites_init", false); }
    public void setFavoritesInitialized() { sp.edit().putBoolean("favorites_init", true).apply(); }

    public Set<String> hidden() { return new HashSet<>(sp.getStringSet("hidden", new HashSet<String>())); }
    public void setHidden(Set<String> keys) { sp.edit().putStringSet("hidden", new HashSet<>(keys)).apply(); }

    public String customLabel(String key) { return sp.getString("label:" + key, null); }
    public void setCustomLabel(String key, String label) {
        if (label == null || label.trim().isEmpty()) sp.edit().remove("label:" + key).apply();
        else sp.edit().putString("label:" + key, label.trim()).apply();
    }

    public int columns() { return sp.getInt("columns", 4); }
    public void setColumns(int c) { sp.edit().putInt("columns", c).apply(); }

    public int iconSizeDp() { return sp.getInt("icon_size", 52); }
    public void setIconSizeDp(int dp) { sp.edit().putInt("icon_size", dp).apply(); }

    public boolean showClock() { return sp.getBoolean("show_clock", true); }
    public void setShowClock(boolean b) { sp.edit().putBoolean("show_clock", b).apply(); }

    public boolean showLabels() { return sp.getBoolean("show_labels", true); }
    public void setShowLabels(boolean b) { sp.edit().putBoolean("show_labels", b).apply(); }

    public boolean keyboardOnDrawer() { return sp.getBoolean("keyboard_drawer", false); }
    public void setKeyboardOnDrawer(boolean b) { sp.edit().putBoolean("keyboard_drawer", b).apply(); }

    /** true = Wunsch-Fabrik-Hintergrund, false = Hintergrundbild des Handys. */
    public boolean wfBackground() { return sp.getBoolean("wf_background", true); }
    public void setWfBackground(boolean b) { sp.edit().putBoolean("wf_background", b).apply(); }

    public static final int SWIPE_WF_PANEL = 0, SWIPE_SYSTEM = 1, SWIPE_NOTHING = 2;
    /** Nach unten wischen: 0 = WF-Schnellbereich, 1 = Android-Bereich, 2 = nichts. */
    public int swipeDown() { return sp.getInt("swipe_down", SWIPE_WF_PANEL); }
    public void setSwipeDown(int m) { sp.edit().putInt("swipe_down", m).apply(); }

    // ---------- Aufträge heute (Link der Werkstatt-Anzeige) ----------

    public String displayLink() { return sp.getString("display_link", ""); }
    public void setDisplayLink(String s) { sp.edit().putString("display_link", s == null ? "" : s.trim()).apply(); }

    // ---------- Termine und Wetter ----------

    public boolean showEvents() { return sp.getBoolean("show_events", false); }
    public void setShowEvents(boolean b) { sp.edit().putBoolean("show_events", b).apply(); }

    public String weatherCity() { return sp.getString("weather_city", ""); }
    public void setWeatherCity(String s) {
        sp.edit().putString("weather_city", s == null ? "" : s.trim()).remove("weather_coords")
                .remove("weather_cache").apply();
    }
    public String weatherCache() { return sp.getString("weather_cache", ""); }
    public long weatherCacheTime() { return sp.getLong("weather_cache_at", 0); }
    public void setWeatherCache(String s) {
        sp.edit().putString("weather_cache", s).putLong("weather_cache_at", System.currentTimeMillis()).apply();
    }
    public String weatherCoords() { return sp.getString("weather_coords", ""); }
    public void setWeatherCoords(String s) { sp.edit().putString("weather_coords", s).apply(); }

    // ---------- Arbeits- und Feierabend-Modus ----------

    public boolean workModeEnabled() { return sp.getBoolean("work_enabled", false); }
    public void setWorkModeEnabled(boolean b) { sp.edit().putBoolean("work_enabled", b).apply(); }

    /** Minuten seit Mitternacht. */
    public int workStart() { return sp.getInt("work_start", 8 * 60); }
    public int workEnd() { return sp.getInt("work_end", 16 * 60); }
    public void setWorkTimes(int start, int end) { sp.edit().putInt("work_start", start).putInt("work_end", end).apply(); }

    /** Bit 0 = Montag … Bit 6 = Sonntag. Standard Mo–Fr. */
    public int workDays() { return sp.getInt("work_days", 0x1F); }
    public void setWorkDays(int mask) { sp.edit().putInt("work_days", mask).apply(); }

    public Set<String> workApps() { return new HashSet<>(sp.getStringSet("work_apps", new HashSet<String>())); }
    public void setWorkApps(Set<String> keys) { sp.edit().putStringSet("work_apps", new HashSet<>(keys)).apply(); }

    public boolean hideWorkAfterHours() { return sp.getBoolean("work_hide", true); }
    public void setHideWorkAfterHours(boolean b) { sp.edit().putBoolean("work_hide", b).apply(); }

    public boolean dndAfterHours() { return sp.getBoolean("work_dnd", false); }
    public void setDndAfterHours(boolean b) { sp.edit().putBoolean("work_dnd", b).apply(); }

    /** Von Hand umgeschaltet: gilt bis zum nächsten planmäßigen Wechsel. 0 = keine, 1 = Arbeit, 2 = Feierabend. */
    public int workOverride() { return sp.getInt("work_override", 0); }
    public long workOverrideUntil() { return sp.getLong("work_override_until", 0); }
    public void setWorkOverride(int mode, long until) {
        sp.edit().putInt("work_override", mode).putLong("work_override_until", until).apply();
    }

    /** Hat der Launcher „Nicht stören“ selbst eingeschaltet? Dann darf er es morgens auch wieder ausschalten. */
    public boolean dndSetByUs() { return sp.getBoolean("work_dnd_ours", false); }
    public void setDndSetByUs(boolean b) { sp.edit().putBoolean("work_dnd_ours", b).apply(); }

    // ---------- Ordner und Notizen (JSON) ----------

    public String foldersJson() { return sp.getString("folders", "{}"); }
    public void setFoldersJson(String s) { sp.edit().putString("folders", s).apply(); }

    public String notesJson() { return sp.getString("notes", "[]"); }
    public void setNotesJson(String s) { sp.edit().putString("notes", s).apply(); }
}
