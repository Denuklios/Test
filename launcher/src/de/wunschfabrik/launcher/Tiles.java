package de.wunschfabrik.launcher;

import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** Eigene Kacheln für den Android-Schnellzugriff (von oben herunterziehen → Stift → Kacheln hinzufügen). */
public final class Tiles {
    private Tiles() {}

    public static final String AUFTRAEGE_URL = "https://wunsch-fabrik.dk/auftraege/";

    /** Alle Kacheln mit Name und Symbol – für „Kacheln hinzufügen“ in den Einstellungen. */
    public static final Class<?>[] ALL = {Auftraege.class, NeuerAuftrag.class, Kalender.class, AlleApps.class};
    public static final String[] LABELS = {"Aufträge", "Neuer Auftrag", "WF-Kalender", "Alle Apps"};
    public static final int[] ICONS = {R.drawable.tile_auftrag, R.drawable.tile_plus, R.drawable.tile_kalender, R.drawable.tile_apps};

    static Intent web(String url) {
        return new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    /** Gemeinsame Basis: Kachel ist immer „aktiv“ (violett) und startet beim Antippen etwas. */
    public abstract static class Base extends TileService {
        abstract Intent intent();

        @Override public void onStartListening() {
            Tile t = getQsTile();
            if (t == null) return;
            t.setState(Tile.STATE_ACTIVE);
            t.updateTile();
        }

        @Override public void onClick() {
            final Intent i = intent();
            if (isLocked()) {
                unlockAndRun(new Runnable() { @Override public void run() { open(i); } });
            } else {
                open(i);
            }
        }

        private void open(Intent i) {
            try {
                if (Build.VERSION.SDK_INT >= 34) {
                    // Ab Android 14 nur noch mit PendingIntent erlaubt.
                    startActivityAndCollapse(PendingIntent.getActivity(this, 0, i,
                            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
                } else {
                    startActivityAndCollapse(i);
                }
            } catch (Exception e) {
                try { startActivity(i); } catch (Exception ignored) { }
            }
        }
    }

    public static final class Auftraege extends Base {
        @Override Intent intent() { return web(AUFTRAEGE_URL); }
    }

    public static final class NeuerAuftrag extends Base {
        @Override Intent intent() { return web(AUFTRAEGE_URL + "index.php#/new"); }
    }

    public static final class Kalender extends Base {
        @Override Intent intent() { return web(AUFTRAEGE_URL + "index.php#/calendar"); }
    }

    public static final class AlleApps extends Base {
        @Override Intent intent() {
            return new Intent(this, MainActivity.class)
                    .setAction(MainActivity.ACTION_OPEN_APPS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        }
    }

    public static ComponentName component(Context c, int i) { return new ComponentName(c, ALL[i]); }
}
