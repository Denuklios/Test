package dk.wunschfabrik.werkstatt;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;

/**
 * „Schnell“-Modus: läuft mit einer stillen Anzeige in der Leiste und fragt jede Minute nach.
 * Braucht etwas mehr Akku als der normale Modus; Meldungen kommen dafür fast sofort.
 */
public class NotifyService extends Service {
    private static final long EVERY = 60 * 1000L;
    private HandlerThread thread;
    private Handler handler;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            Notifier.check(getApplicationContext());
            handler.postDelayed(this, EVERY);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        Notifier.channels(this);
        boolean da = Notifier.da(this);
        PendingIntent pi = PendingIntent.getActivity(this, 1, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder nb = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, Notifier.CH_SERVICE) : new Notification.Builder(this);
        Notification n = nb.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(da ? "Holder øje med nyt" : "Achtet auf Neues")
                .setContentText(da ? "Forespørgsler, mails, tilbud og betalinger kontrolleres hvert minut." : "Anfragen, Mails, Angebote und Zahlungen werden jede Minute geprüft.")
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(2, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(2, n);
        thread = new HandlerThread("wf-notify");
        thread.start();
        handler = new Handler(thread.getLooper());
        handler.post(tick);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (handler != null) handler.removeCallbacks(tick);
        if (thread != null) thread.quitSafely();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
