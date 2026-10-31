package de.funkgeraet.walkie;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Nimmt Tipps auf Widget und Benachrichtigung entgegen (nicht von außen erreichbar). */
public class ActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        RadioService s = RadioService.instance;
        if (PttWidget.ACTION_TOGGLE.equals(intent.getAction())) {
            if (s != null) s.toggleTalk();
        } else if (PttWidget.ACTION_OFF.equals(intent.getAction())) {
            if (s != null) s.shutdown();
        }
        PttWidget.updateAll(c);
    }
}
