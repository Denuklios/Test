package dk.wunschfabrik.werkstatt;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Nach dem Einschalten des Handys bzw. nach einem App-Update die Benachrichtigungen wieder starten. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            Notifier.channels(c);
            Notifier.apply(c);
        }
    }
}
