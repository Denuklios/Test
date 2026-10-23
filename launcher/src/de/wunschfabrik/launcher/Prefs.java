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
}
