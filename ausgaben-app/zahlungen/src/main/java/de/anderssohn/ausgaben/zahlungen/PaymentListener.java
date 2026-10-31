package de.anderssohn.ausgaben.zahlungen;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/** Liest Zahlungs-Benachrichtigungen (Google Wallet, Banking-Apps) und meldet sie an die Haupt-App. */
public class PaymentListener extends NotificationListenerService {

    static final String MAIN = "de.anderssohn.ausgaben";
    private double lastAmount = -1;
    private long lastTime = 0;

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (!PaymentParser.watched(pkg)) return;
            Bundle ex = sbn.getNotification().extras;
            if (ex == null) return;
            CharSequence t = ex.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence big = ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            CharSequence tx = big != null ? big : ex.getCharSequence(Notification.EXTRA_TEXT);
            PaymentParser.Result r = PaymentParser.parse(pkg, t == null ? "" : t.toString(), tx == null ? "" : tx.toString());
            if (r == null) return;
            long now = System.currentTimeMillis();
            if (Math.abs(r.amount - lastAmount) < 0.005 && now - lastTime < 10 * 60 * 1000) return;
            lastAmount = r.amount; lastTime = now;

            Intent i = new Intent("de.anderssohn.ausgaben.PAYMENT");
            i.setComponent(new ComponentName(MAIN, MAIN + ".PaymentReceiver"));
            i.addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES);
            i.putExtra("amount", r.amount).putExtra("merchant", r.merchant)
             .putExtra("app", appName(pkg)).putExtra("time", now);
            sendBroadcast(i, "de.anderssohn.ausgaben.permission.ZAHLUNG");
            getSharedPreferences("stat", MODE_PRIVATE).edit()
                    .putString("last", String.format(java.util.Locale.GERMANY, "%.2f € %s", r.amount, r.merchant))
                    .putLong("lastTime", now).apply();
        } catch (Exception ignored) { }
    }

    static String appName(String pkg) {
        if (pkg.contains("wallet") || pkg.contains("paisa")) return "Google Wallet";
        if (pkg.contains("spay") || pkg.contains("samsungpay")) return "Samsung Wallet";
        if (pkg.contains("paypal")) return "PayPal";
        if (pkg.contains("mobilepay")) return "MobilePay";
        if (pkg.contains("curve")) return "Curve";
        return "Banking-App";
    }
}
