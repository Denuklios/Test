package de.anderssohn.ausgaben.zahlungen;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Einfache Statusseite: Zugriff erlauben, Hilfe bei „Eingeschränkte Einstellung“, zur Haupt-App. */
public class MainActivity extends Activity {

    private LinearLayout box;
    private float d;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        d = getResources().getDisplayMetrics().density;
        getWindow().setStatusBarColor(0xFF08191D);
        getWindow().setNavigationBarColor(0xFF08191D);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(0xFF08191D);
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(px(22), px(28), px(22), px(28));
        sv.addView(box);
        setContentView(sv);
    }

    @Override
    protected void onResume() { super.onResume(); build(); }

    private int px(int v) { return Math.round(v * d); }

    private boolean active() {
        String s = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return s != null && s.contains(getPackageName());
    }

    private boolean mainInstalled() {
        try { getPackageManager().getPackageInfo(PaymentListener.MAIN, 0); return true; } catch (Exception e) { return false; }
    }

    private TextView text(String t, int sp, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(t); v.setTextSize(sp); v.setTextColor(color);
        if (bold) v.setTypeface(Typeface.DEFAULT_BOLD);
        v.setLineSpacing(0, 1.2f);
        v.setPadding(0, px(6), 0, px(6));
        box.addView(v);
        return v;
    }

    private void button(String t, boolean primary, Runnable r) {
        Button bt = new Button(this);
        bt.setText(t); bt.setAllCaps(false); bt.setTextSize(16); bt.setTypeface(Typeface.DEFAULT_BOLD);
        bt.setTextColor(Color.WHITE);
        GradientDrawable g = primary
                ? new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xFF2DD4BF, 0xFF0D9488})
                : new GradientDrawable();
        if (!primary) g.setColor(0x22FFFFFF);
        g.setCornerRadius(px(14));
        bt.setBackground(g);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, px(54));
        lp.topMargin = px(10);
        box.addView(bt, lp);
        bt.setOnClickListener(v -> r.run());
    }

    private void build() {
        box.removeAllViews();
        boolean on = active();
        text("AusgabenKompass Zahlungen", 24, Color.WHITE, true);
        TextView st = text(on ? "●  Aktiv – Handyzahlungen werden erfasst" : "●  Noch nicht aktiv", 16, on ? 0xFF34D399 : 0xFFFBBF24, true);
        st.setGravity(Gravity.START);
        text("Wenn du mit dem Handy bezahlst (Google Wallet, Samsung Wallet) oder deine Banking-App eine Zahlung meldet, "
                + "erkennt diese Helfer-App Händler und Betrag und gibt sie an den AusgabenKompass weiter. "
                + "Gelesen werden nur Benachrichtigungen von Wallet- und Banking-Apps. Nichts verlässt dein Handy.", 15, 0xFFCDE7E3, false);
        if (!mainInstalled()) text("Hinweis: Die Haupt-App „AusgabenKompass“ ist noch nicht installiert.", 15, 0xFFFCA5A5, true);
        String last = getSharedPreferences("stat", MODE_PRIVATE).getString("last", null);
        if (last != null) text("Zuletzt erkannt: " + last, 14, 0xFF8FB3AE, false);

        if (!on) {
            button("Zugriff erlauben", true, () -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
            text("\nGeht der Schalter nicht an („Eingeschränkte Einstellung“)?", 15, Color.WHITE, true);
            text("1. Auf „App-Info öffnen“ tippen\n2. Oben rechts auf ⋮ tippen → „Eingeschränkte Einstellungen zulassen“\n3. Zurück und erneut „Zugriff erlauben“", 15, 0xFFCDE7E3, false);
            button("App-Info öffnen", false, () -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))));
        }
        if (mainInstalled()) button("AusgabenKompass öffnen", !on ? false : true, () -> {
            Intent i = getPackageManager().getLaunchIntentForPackage(PaymentListener.MAIN);
            if (i != null) startActivity(i);
        });
    }
}
