package android.service.quicksettings;

import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

/**
 * Nur zum Kompilieren: android-23.jar aus Debian kennt TileService (API 24) noch nicht.
 * Wird nicht in die APK gepackt – auf dem Handy gilt die echte Klasse.
 */
public class TileService extends Service {
    public static final String ACTION_QS_TILE = "android.service.quicksettings.action.QS_TILE";
    public void onTileAdded() {}
    public void onTileRemoved() {}
    public void onStartListening() {}
    public void onStopListening() {}
    public void onClick() {}
    public final Tile getQsTile() { throw new RuntimeException("Stub"); }
    public final void startActivityAndCollapse(Intent intent) { throw new RuntimeException("Stub"); }
    public final void startActivityAndCollapse(PendingIntent pendingIntent) { throw new RuntimeException("Stub"); }
    public final boolean isLocked() { throw new RuntimeException("Stub"); }
    public final void unlockAndRun(Runnable r) { throw new RuntimeException("Stub"); }
    @Override public IBinder onBind(Intent intent) { throw new RuntimeException("Stub"); }
}
