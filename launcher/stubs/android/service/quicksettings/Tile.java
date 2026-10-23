package android.service.quicksettings;

import android.graphics.drawable.Icon;

/** Nur zum Kompilieren (API 24), siehe TileService. */
public final class Tile {
    public static final int STATE_UNAVAILABLE = 0;
    public static final int STATE_INACTIVE = 1;
    public static final int STATE_ACTIVE = 2;
    public void setState(int state) { throw new RuntimeException("Stub"); }
    public void setLabel(CharSequence label) { throw new RuntimeException("Stub"); }
    public void setIcon(Icon icon) { throw new RuntimeException("Stub"); }
    public void updateTile() { throw new RuntimeException("Stub"); }
}
