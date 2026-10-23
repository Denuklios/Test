package de.wunschfabrik.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.RemoteInput;
import android.bluetooth.BluetoothAdapter;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Icon;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.AudioManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.service.notification.StatusBarNotification;
import android.text.InputType;
import android.text.TextUtils;
import android.text.format.DateUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/**
 * Eigener Schnellbereich im Wunsch-Fabrik-Stil: wird auf dem Startbildschirm von oben heruntergezogen.
 * Schalter (WLAN, Bluetooth, Taschenlampe …), Helligkeit, Lautstärke und die Benachrichtigungen.
 */
public final class QuickPanel implements NotificationHub.Listener {
    private final Activity act;
    private final float density;
    private final FrameLayout root;
    private final ScrollView scroll;
    private final LinearLayout content;
    private final TextView battery;
    private final List<Toggle> toggles = new ArrayList<>();
    private final SeekBar brightness;
    private final SeekBar volume;
    private final LinearLayout notifBox;
    private final TextView clearAll;
    private final CameraManager camera;
    private String torchId;
    private boolean torchOn;
    private boolean open;
    private final Runnable onClosed;

    /** Ein runder Schalter mit Beschriftung. */
    private final class Toggle {
        final LinearLayout view;
        final TextView icon, label, state;
        final GradientDrawable bg;
        Toggle(String glyph, String name) {
            view = new LinearLayout(act);
            view.setOrientation(LinearLayout.VERTICAL);
            view.setGravity(Gravity.CENTER_HORIZONTAL);
            view.setPadding(0, dp(6), 0, dp(6));
            icon = new TextView(act);
            icon.setText(glyph);
            icon.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
            icon.setGravity(Gravity.CENTER);
            bg = new GradientDrawable();
            bg.setShape(GradientDrawable.OVAL);
            icon.setBackground(bg);
            view.addView(icon, new LinearLayout.LayoutParams(dp(54), dp(54)));
            label = text(12, WfStyle.TEXT);
            label.setText(name);
            label.setGravity(Gravity.CENTER);
            label.setSingleLine(true);
            label.setEllipsize(TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.topMargin = dp(6);
            view.addView(label, lp);
            state = text(10, WfStyle.MUTED);
            state.setGravity(Gravity.CENTER);
            state.setSingleLine(true);
            view.addView(state, new LinearLayout.LayoutParams(-1, -2));
        }

        void set(boolean on, String stateText) {
            if (on) {
                bg.setColors(new int[]{WfStyle.P1, WfStyle.P2});
                bg.setOrientation(GradientDrawable.Orientation.TL_BR);
                bg.setStroke(0, 0);
                icon.setTextColor(Color.WHITE);
            } else {
                bg.setColors(new int[]{WfStyle.SURFACE3, WfStyle.SURFACE3});
                bg.setStroke(Math.max(1, dp(1)), WfStyle.LINE);
                icon.setTextColor(WfStyle.P3);
            }
            state.setText(stateText);
        }
    }

    public QuickPanel(Activity a, Runnable onClosed) {
        act = a;
        this.onClosed = onClosed;
        density = a.getResources().getDisplayMetrics().density;
        camera = (CameraManager) a.getSystemService(Context.CAMERA_SERVICE);

        root = new FrameLayout(a);
        root.setVisibility(View.GONE);
        root.setClickable(true);
        scroll = new ScrollView(a);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        root.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        content = new LinearLayout(a);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content, new FrameLayout.LayoutParams(-1, -2));

        // Kopf: Uhr, Datum, Akku, Zahnrad
        LinearLayout head = new LinearLayout(a);
        head.setGravity(Gravity.BOTTOM);
        LinearLayout left = new LinearLayout(a);
        left.setOrientation(LinearLayout.VERTICAL);
        TextClock clock = new TextClock(a);
        clock.setFormat24Hour("HH:mm");
        clock.setFormat12Hour("h:mm");
        clock.setTypeface(WfStyle.head(a));
        clock.setTextColor(WfStyle.TEXT);
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 44);
        clock.setIncludeFontPadding(false);
        left.addView(clock);
        TextClock date = new TextClock(a);
        date.setFormat24Hour("EEEE, d. MMMM");
        date.setFormat12Hour("EEEE, d. MMMM");
        date.setTypeface(WfStyle.bodyMedium(a));
        date.setTextColor(WfStyle.MUTED);
        date.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        date.setLetterSpacing(0.14f);
        date.setAllCaps(true);
        left.addView(date);
        head.addView(left, new LinearLayout.LayoutParams(0, -2, 1f));
        battery = text(13, WfStyle.MUTED);
        battery.setPadding(0, 0, dp(12), dp(4));
        head.addView(battery);
        TextView gear = chip("⚙");
        gear.setContentDescription("Einstellungen");
        gear.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { start(new Intent(Settings.ACTION_SETTINGS)); }
        });
        head.addView(gear, new LinearLayout.LayoutParams(dp(44), dp(44)));
        content.addView(head);

        // Schalter: zwei Reihen à vier
        String[][] defs = {
                {"📶", "WLAN"}, {"⇅", "Internet"}, {"ᛒ", "Bluetooth"}, {"🔦", "Taschenlampe"},
                {"☾", "Nicht stören"}, {"✈", "Flugmodus"}, {"⌖", "Standort"}, {"⟳", "Drehen"},
        };
        LinearLayout card = new LinearLayout(a);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(WfStyle.card(dp(20), density));
        card.setPadding(dp(6), dp(10), dp(6), dp(10));
        LinearLayout row = null;
        for (int i = 0; i < defs.length; i++) {
            if (i % 4 == 0) { row = new LinearLayout(a); card.addView(row); }
            final Toggle t = new Toggle(defs[i][0], defs[i][1]);
            final int idx = i;
            t.view.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { onToggle(idx); }
            });
            toggles.add(t);
            row.addView(t.view, new LinearLayout.LayoutParams(0, -2, 1f));
        }
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(-1, -2);
        clp.topMargin = dp(18);
        content.addView(card, clp);

        // Regler
        LinearLayout sliders = new LinearLayout(a);
        sliders.setOrientation(LinearLayout.VERTICAL);
        sliders.setBackground(WfStyle.card(dp(20), density));
        sliders.setPadding(dp(14), dp(8), dp(14), dp(8));
        brightness = slider(sliders, "☀", 255);
        volume = slider(sliders, "♪", 15);
        brightness.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean user) { if (user) setBrightness(p); }
            @Override public void onStartTrackingTouch(SeekBar s) {
                if (!Settings.System.canWrite(act)) askWriteSettings("die Helligkeit");
            }
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
        volume.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean user) {
                if (user) audio().setStreamVolume(AudioManager.STREAM_MUSIC, p, 0);
            }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-1, -2);
        slp.topMargin = dp(12);
        content.addView(sliders, slp);

        // Benachrichtigungen
        LinearLayout nh = new LinearLayout(a);
        nh.setGravity(Gravity.CENTER_VERTICAL);
        TextView eb = text(11, WfStyle.P2);
        eb.setTypeface(WfStyle.bodyMedium(a));
        eb.setLetterSpacing(0.3f);
        eb.setAllCaps(true);
        eb.setText("Benachrichtigungen");
        nh.addView(eb, new LinearLayout.LayoutParams(0, -2, 1f));
        clearAll = text(13, WfStyle.P3);
        clearAll.setText("Alle löschen");
        clearAll.setPadding(dp(12), dp(10), dp(4), dp(10));
        clearAll.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { NotificationHub.dismissAll(); }
        });
        nh.addView(clearAll);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(-1, -2);
        nlp.topMargin = dp(18);
        nlp.leftMargin = dp(4);
        content.addView(nh, nlp);
        notifBox = new LinearLayout(a);
        notifBox.setOrientation(LinearLayout.VERTICAL);
        content.addView(notifBox, new LinearLayout.LayoutParams(-1, -2));

        content.addView(new View(a), new LinearLayout.LayoutParams(-1, 0, 1f));
        TextView handle = text(13, WfStyle.MUTED);
        handle.setText("︿  Schließen");
        handle.setGravity(Gravity.CENTER);
        handle.setPadding(0, dp(14), 0, dp(14));
        handle.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { close(true); }
        });
        content.addView(handle, new LinearLayout.LayoutParams(-1, -2));

        try {
            for (String id : camera.getCameraIdList()) {
                Boolean flash = camera.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (flash != null && flash) { torchId = id; break; }
            }
            camera.registerTorchCallback(new CameraManager.TorchCallback() {
                @Override public void onTorchModeChanged(String id, boolean enabled) {
                    if (id.equals(torchId)) { torchOn = enabled; if (open) refreshToggles(); }
                }
            }, null);
        } catch (Exception ignored) { }
    }

    public View view() { return root; }
    public boolean isOpen() { return open; }

    public void setInsets(int left, int top, int right, int bottom) {
        content.setPadding(dp(16) + left, top + dp(16), dp(16) + right, bottom);
    }

    public void setBackground(Drawable d) { root.setBackground(d); }

    /** Darf eine Wischgeste nach oben den Bereich schließen? Nur wenn unten angekommen. */
    public boolean atBottom() { return !scroll.canScrollVertically(1); }

    // ---------- Öffnen/Schließen ----------

    public void open() {
        if (open) return;
        open = true;
        NotificationHub.addListener(this);
        refresh();
        root.animate().cancel();
        root.setVisibility(View.VISIBLE);
        root.setAlpha(0f);
        root.setTranslationY(-dp(120));
        scroll.scrollTo(0, 0);
        root.animate().alpha(1f).translationY(0).setDuration(220).setListener(null).start();
    }

    public void close(boolean animate) {
        if (!open) return;
        open = false;
        NotificationHub.removeListener(this);
        root.animate().cancel();
        if (!animate) {
            root.setVisibility(View.GONE);
        } else {
            root.animate().alpha(0f).translationY(-dp(120)).setDuration(180)
                    .setListener(new android.animation.AnimatorListenerAdapter() {
                        @Override public void onAnimationEnd(android.animation.Animator an) {
                            if (!open) root.setVisibility(View.GONE);
                        }
                    }).start();
        }
        onClosed.run();
    }

    public void refresh() {
        refreshToggles();
        refreshSliders();
        refreshBattery();
        onNotificationsChanged();
    }

    // ---------- Schalter ----------

    private void refreshToggles() {
        WifiManager wifi = (WifiManager) act.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        boolean wifiOn = false;
        try { wifiOn = wifi != null && wifi.isWifiEnabled(); } catch (Exception ignored) { }
        toggles.get(0).set(wifiOn, wifiOn ? "an" : "aus");

        android.net.ConnectivityManager cm = (android.net.ConnectivityManager) act.getSystemService(Context.CONNECTIVITY_SERVICE);
        android.net.NetworkInfo ni = null;
        try { ni = cm.getActiveNetworkInfo(); } catch (Exception ignored) { }
        boolean online = ni != null && ni.isConnected();
        String type = !online ? "offline" : ni.getType() == android.net.ConnectivityManager.TYPE_WIFI ? "über WLAN"
                : ni.getType() == android.net.ConnectivityManager.TYPE_MOBILE ? "mobil" : "verbunden";
        toggles.get(1).set(online, type);

        boolean bt = false;
        try { BluetoothAdapter ad = BluetoothAdapter.getDefaultAdapter(); bt = ad != null && ad.isEnabled(); } catch (Exception ignored) { }
        toggles.get(2).set(bt, bt ? "an" : "aus");

        toggles.get(3).set(torchOn, torchId == null ? "fehlt" : torchOn ? "an" : "aus");

        NotificationManager nm = (NotificationManager) act.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean dnd = nm.getCurrentInterruptionFilter() > NotificationManager.INTERRUPTION_FILTER_ALL;
        toggles.get(4).set(dnd, dnd ? "an" : "aus");

        boolean plane = Settings.Global.getInt(act.getContentResolver(), Settings.Global.AIRPLANE_MODE_ON, 0) != 0;
        toggles.get(5).set(plane, plane ? "an" : "aus");

        @SuppressWarnings("deprecation")
        boolean loc = Settings.Secure.getInt(act.getContentResolver(), Settings.Secure.LOCATION_MODE, 0) != 0;
        toggles.get(6).set(loc, loc ? "an" : "aus");

        boolean rot = Settings.System.getInt(act.getContentResolver(), Settings.System.ACCELEROMETER_ROTATION, 0) != 0;
        toggles.get(7).set(rot, rot ? "automatisch" : "gesperrt");
    }

    private void onToggle(int i) {
        switch (i) {
            case 0: panelOr("android.settings.panel.action.WIFI", Settings.ACTION_WIFI_SETTINGS); break;
            case 1: panelOr("android.settings.panel.action.INTERNET_CONNECTIVITY", Settings.ACTION_WIRELESS_SETTINGS); break;
            case 2: start(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)); break;
            case 3:
                if (torchId == null) break;
                try { camera.setTorchMode(torchId, !torchOn); } catch (CameraAccessException | RuntimeException e) {
                    Toast.makeText(act, "Taschenlampe gerade nicht verfügbar", Toast.LENGTH_SHORT).show();
                }
                break;
            case 4: toggleDnd(); break;
            case 5: start(new Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS)); break;
            case 6: start(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)); break;
            case 7:
                if (!Settings.System.canWrite(act)) { askWriteSettings("das automatische Drehen"); break; }
                boolean rot = Settings.System.getInt(act.getContentResolver(), Settings.System.ACCELEROMETER_ROTATION, 0) != 0;
                Settings.System.putInt(act.getContentResolver(), Settings.System.ACCELEROMETER_ROTATION, rot ? 0 : 1);
                break;
        }
        root.postDelayed(new Runnable() { @Override public void run() { if (open) refreshToggles(); } }, 400);
    }

    /** WLAN/Internet: ab Android 10 das kleine System-Fenster, sonst die Einstellungsseite. */
    private void panelOr(String panel, String fallback) {
        if (Build.VERSION.SDK_INT >= 29) {
            try { act.startActivity(new Intent(panel)); return; } catch (ActivityNotFoundException ignored) { }
        }
        start(new Intent(fallback));
    }

    private void toggleDnd() {
        NotificationManager nm = (NotificationManager) act.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean on = nm.getCurrentInterruptionFilter() > NotificationManager.INTERRUPTION_FILTER_ALL;
        if (NotificationHub.setDoNotDisturb(!on)) return;
        if (nm.isNotificationPolicyAccessGranted()) {
            nm.setInterruptionFilter(on ? NotificationManager.INTERRUPTION_FILTER_ALL : NotificationManager.INTERRUPTION_FILTER_PRIORITY);
            return;
        }
        Toast.makeText(act, "Dafür bitte zuerst den Zugriff auf Benachrichtigungen erlauben", Toast.LENGTH_LONG).show();
        start(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
    }

    private void askWriteSettings(String what) {
        new AlertDialog.Builder(act)
                .setTitle("Erlaubnis nötig")
                .setMessage("Damit der WF Launcher " + what + " ändern kann, bitte auf der nächsten Seite "
                        + "„Systemeinstellungen ändern“ für WF Launcher einschalten.")
                .setPositiveButton("Weiter", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        start(new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + act.getPackageName())));
                    }
                })
                .setNegativeButton("Abbrechen", null)
                .show();
    }

    // ---------- Regler ----------

    private SeekBar slider(LinearLayout parent, String glyph, int max) {
        LinearLayout row = new LinearLayout(act);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView g = text(18, WfStyle.P3);
        g.setText(glyph);
        g.setGravity(Gravity.CENTER);
        row.addView(g, new LinearLayout.LayoutParams(dp(30), dp(44)));
        SeekBar s = new SeekBar(act);
        s.setMax(max);
        s.setProgressTintList(ColorStateList.valueOf(WfStyle.P2));
        s.setProgressBackgroundTintList(ColorStateList.valueOf(WfStyle.SURFACE3));
        s.setThumbTintList(ColorStateList.valueOf(WfStyle.P3));
        row.addView(s, new LinearLayout.LayoutParams(0, dp(44), 1f));
        parent.addView(row);
        return s;
    }

    private void refreshSliders() {
        brightness.setProgress(Settings.System.getInt(act.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, 128));
        AudioManager am = audio();
        volume.setMax(am.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        volume.setProgress(am.getStreamVolume(AudioManager.STREAM_MUSIC));
    }

    private void setBrightness(int v) {
        if (!Settings.System.canWrite(act)) return;
        try {
            Settings.System.putInt(act.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS_MODE,
                    Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
            Settings.System.putInt(act.getContentResolver(), Settings.System.SCREEN_BRIGHTNESS, Math.max(1, v));
        } catch (Exception ignored) { }
    }

    private AudioManager audio() { return (AudioManager) act.getSystemService(Context.AUDIO_SERVICE); }

    private void refreshBattery() {
        Intent b = act.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (b == null) { battery.setText(""); return; }
        int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int status = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL;
        int pct = scale > 0 ? Math.round(level * 100f / scale) : level;
        battery.setText((charging ? "⚡ " : "🔋 ") + pct + " %");
    }

    // ---------- Benachrichtigungen ----------

    @Override public void onNotificationsChanged() {
        if (!open) return;
        notifBox.removeAllViews();
        if (!NotificationHub.isAllowed(act)) {
            clearAll.setVisibility(View.GONE);
            notifBox.addView(permissionCard());
            return;
        }
        List<StatusBarNotification> list = NotificationHub.current();
        boolean anyClearable = false;
        for (StatusBarNotification s : list) if (s.isClearable()) anyClearable = true;
        clearAll.setVisibility(anyClearable ? View.VISIBLE : View.GONE);
        if (list.isEmpty()) {
            TextView none = text(14, WfStyle.MUTED);
            none.setText(NotificationHub.connected() ? "Keine Benachrichtigungen" : "Verbinde …");
            none.setGravity(Gravity.CENTER);
            none.setPadding(0, dp(24), 0, dp(24));
            notifBox.addView(none);
            return;
        }
        for (StatusBarNotification s : list) {
            View card = notificationCard(s);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.topMargin = dp(8);
            notifBox.addView(card, lp);
        }
    }

    private View permissionCard() {
        LinearLayout c = new LinearLayout(act);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setBackground(WfStyle.card(dp(16), density));
        c.setPadding(dp(16), dp(14), dp(16), dp(14));
        TextView t = text(14, WfStyle.TEXT);
        t.setText("Damit deine Nachrichten hier erscheinen, braucht der WF Launcher den Zugriff auf Benachrichtigungen.\n\n"
                + "Ist der Schalter dort ausgegraut („Eingeschränkte Einstellung“), zuerst über „App-Info“ → ⋮ oben rechts → "
                + "„Eingeschränkte Einstellungen zulassen“ freischalten.");
        c.addView(t);
        LinearLayout buttons = new LinearLayout(act);
        buttons.setPadding(0, dp(12), 0, 0);
        TextView allow = primaryButton("Zugriff erlauben");
        allow.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { start(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")); }
        });
        buttons.addView(allow, new LinearLayout.LayoutParams(0, dp(44), 1f));
        TextView info = chip("App-Info");
        info.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        info.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                start(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + act.getPackageName())));
            }
        });
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(0, dp(44), 1f);
        ilp.leftMargin = dp(10);
        buttons.addView(info, ilp);
        c.addView(buttons);
        return c;
    }

    private View notificationCard(final StatusBarNotification s) {
        final Notification n = s.getNotification();
        final LinearLayout card = new LinearLayout(act);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(WfStyle.card(dp(16), density));
        card.setPadding(dp(14), dp(12), dp(14), dp(12));

        LinearLayout top = new LinearLayout(act);
        top.setGravity(Gravity.CENTER_VERTICAL);
        ImageView small = new ImageView(act);
        Drawable si = load(n.getSmallIcon(), s.getPackageName());
        if (si != null) {
            si.mutate().setTint(n.color != 0 && n.color != Color.BLACK ? n.color : WfStyle.P3);
            small.setImageDrawable(si);
        }
        top.addView(small, new LinearLayout.LayoutParams(dp(16), dp(16)));
        TextView app = text(12, WfStyle.MUTED);
        app.setText(appName(s.getPackageName()) + "  ·  "
                + DateUtils.getRelativeTimeSpanString(s.getPostTime(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS));
        app.setSingleLine(true);
        app.setEllipsize(TextUtils.TruncateAt.END);
        app.setPadding(dp(8), 0, 0, 0);
        top.addView(app, new LinearLayout.LayoutParams(0, -2, 1f));
        card.addView(top);

        LinearLayout mid = new LinearLayout(act);
        mid.setPadding(0, dp(8), 0, 0);
        LinearLayout texts = new LinearLayout(act);
        texts.setOrientation(LinearLayout.VERTICAL);
        CharSequence title = NotificationHub.title(n);
        if (!TextUtils.isEmpty(title)) {
            TextView tt = text(15, WfStyle.TEXT);
            tt.setTypeface(WfStyle.bodyMedium(act));
            tt.setText(title);
            tt.setSingleLine(true);
            tt.setEllipsize(TextUtils.TruncateAt.END);
            texts.addView(tt);
        }
        CharSequence body = NotificationHub.body(n);
        if (!TextUtils.isEmpty(body)) {
            TextView bt = text(14, WfStyle.MUTED);
            bt.setText(body);
            bt.setMaxLines(4);
            bt.setEllipsize(TextUtils.TruncateAt.END);
            texts.addView(bt);
        }
        mid.addView(texts, new LinearLayout.LayoutParams(0, -2, 1f));
        Drawable large = load(n.getLargeIcon(), s.getPackageName());
        if (large != null) {
            ImageView li = new ImageView(act);
            li.setImageDrawable(large);
            li.setScaleType(ImageView.ScaleType.CENTER_CROP);
            li.setClipToOutline(true);
            GradientDrawable round = new GradientDrawable();
            round.setCornerRadius(dp(10));
            li.setBackground(round);
            LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(dp(40), dp(40));
            llp.leftMargin = dp(10);
            mid.addView(li, llp);
        }
        card.addView(mid);

        // Aktionen (z. B. „Antworten“, „Als gelesen markieren“)
        if (n.actions != null && n.actions.length > 0) {
            LinearLayout acts = new LinearLayout(act);
            acts.setPadding(0, dp(6), 0, 0);
            final LinearLayout replyBox = new LinearLayout(act);
            replyBox.setVisibility(View.GONE);
            int shown = 0;
            for (final Notification.Action a : n.actions) {
                if (shown >= 3 || a.actionIntent == null) continue;
                shown++;
                TextView b = text(13, WfStyle.P3);
                b.setTypeface(WfStyle.bodyMedium(act));
                b.setText(a.title);
                b.setAllCaps(true);
                b.setLetterSpacing(0.06f);
                b.setPadding(0, dp(10), dp(18), dp(4));
                final RemoteInput[] inputs = a.getRemoteInputs();
                b.setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View v) {
                        if (inputs != null && inputs.length > 0) showReply(replyBox, a, inputs);
                        else sendAction(a, null);
                    }
                });
                acts.addView(b);
            }
            card.addView(acts);
            card.addView(replyBox);
        }

        card.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (n.contentIntent != null) {
                    try { Compat.sendPending(act, n.contentIntent, null); } catch (Exception ignored) { }
                    if ((n.flags & Notification.FLAG_AUTO_CANCEL) != 0) NotificationHub.dismiss(s);
                    close(false);
                }
            }
        });
        if (s.isClearable()) enableSwipe(card, s);
        return card;
    }

    private void showReply(LinearLayout box, final Notification.Action a, final RemoteInput[] inputs) {
        box.removeAllViews();
        box.setVisibility(View.VISIBLE);
        box.setPadding(0, dp(8), 0, 0);
        box.setGravity(Gravity.CENTER_VERTICAL);
        final EditText in = new EditText(act);
        in.setHint("Antwort …");
        in.setHintTextColor(WfStyle.FAINT);
        in.setTextColor(WfStyle.TEXT);
        in.setTypeface(WfStyle.body(act));
        in.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        in.setImeOptions(EditorInfo.IME_ACTION_SEND);
        GradientDrawable g = new GradientDrawable();
        g.setColor(WfStyle.INPUT);
        g.setCornerRadius(dp(12));
        g.setStroke(Math.max(1, dp(1)), WfStyle.P2);
        in.setBackground(g);
        in.setPadding(dp(12), 0, dp(12), 0);
        box.addView(in, new LinearLayout.LayoutParams(0, dp(44), 1f));
        TextView send = primaryButton("➤");
        View.OnClickListener doSend = new View.OnClickListener() {
            @Override public void onClick(View v) {
                String txt = in.getText().toString().trim();
                if (txt.isEmpty()) return;
                Bundle results = new Bundle();
                for (RemoteInput r : inputs) results.putCharSequence(r.getResultKey(), txt);
                Intent fill = new Intent();
                RemoteInput.addResultsToIntent(inputs, fill, results);
                sendAction(a, fill);
                Toast.makeText(act, "Gesendet", Toast.LENGTH_SHORT).show();
                hideKeyboard(in);
            }
        };
        send.setOnClickListener(doSend);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(44), dp(44));
        lp.leftMargin = dp(8);
        box.addView(send, lp);
        in.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override public boolean onEditorAction(TextView v, int id, android.view.KeyEvent e) { doSend.onClick(v); return true; }
        });
        in.requestFocus();
        ((android.view.inputmethod.InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE))
                .showSoftInput(in, 0);
    }

    private void sendAction(Notification.Action a, Intent fill) {
        try { Compat.sendPending(act, a.actionIntent, fill); } catch (Exception e) {
            Toast.makeText(act, "Ging nicht – bitte in der App selbst", Toast.LENGTH_SHORT).show();
        }
    }

    private void hideKeyboard(View v) {
        ((android.view.inputmethod.InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE))
                .hideSoftInputFromWindow(v.getWindowToken(), 0);
    }

    /** Karte zur Seite wischen = Benachrichtigung löschen. */
    private void enableSwipe(final View card, final StatusBarNotification s) {
        final int slop = ViewConfiguration.get(act).getScaledTouchSlop();
        card.setOnTouchListener(new View.OnTouchListener() {
            float downX, downY;
            boolean dragging;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = e.getRawX(); downY = e.getRawY(); dragging = false;
                        return false; // Klick/Langklick weiter erlauben
                    case MotionEvent.ACTION_MOVE: {
                        float dx = e.getRawX() - downX, dy = e.getRawY() - downY;
                        if (!dragging && Math.abs(dx) > slop && Math.abs(dx) > Math.abs(dy) * 1.5f) {
                            dragging = true;
                            v.getParent().requestDisallowInterceptTouchEvent(true);
                            v.setPressed(false);
                            v.cancelLongPress();
                        }
                        if (dragging) {
                            v.setTranslationX(dx);
                            v.setAlpha(1f - Math.min(1f, Math.abs(dx) / v.getWidth()));
                            return true;
                        }
                        return false;
                    }
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (!dragging) return false;
                        float dx = e.getRawX() - downX;
                        if (Math.abs(dx) > v.getWidth() / 3f && e.getActionMasked() == MotionEvent.ACTION_UP) {
                            v.animate().translationX(Math.signum(dx) * v.getWidth()).alpha(0f).setDuration(150)
                                    .withEndAction(new Runnable() { @Override public void run() { NotificationHub.dismiss(s); } })
                                    .start();
                        } else {
                            v.animate().translationX(0).alpha(1f).setDuration(150).start();
                        }
                        dragging = false;
                        return true;
                }
                return false;
            }
        });
    }

    private Drawable load(Icon icon, String pkg) {
        if (icon == null) return null;
        try { return icon.loadDrawable(act.createPackageContext(pkg, 0)); } catch (Exception e) {
            try { return icon.loadDrawable(act); } catch (Exception e2) { return null; }
        }
    }

    private String appName(String pkg) {
        PackageManager pm = act.getPackageManager();
        try {
            ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(ai).toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    // ---------- Helfer ----------

    private int dp(float v) { return (int) (v * density + 0.5f); }

    private TextView text(float sp, int color) {
        TextView t = new TextView(act);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(WfStyle.body(act));
        return t;
    }

    private TextView chip(String s) {
        TextView t = text(18, WfStyle.P3);
        t.setText(s);
        t.setGravity(Gravity.CENTER);
        GradientDrawable g = new GradientDrawable();
        g.setColor(WfStyle.SURFACE3);
        g.setCornerRadius(dp(12));
        g.setStroke(Math.max(1, dp(1)), WfStyle.LINE_STRONG);
        t.setBackground(g);
        return t;
    }

    private TextView primaryButton(String s) {
        TextView t = text(14, Color.WHITE);
        t.setTypeface(WfStyle.bodyMedium(act));
        t.setText(s);
        t.setGravity(Gravity.CENTER);
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{WfStyle.P1, WfStyle.P2});
        g.setCornerRadius(dp(12));
        t.setBackground(g);
        return t;
    }

    private void start(Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            act.startActivity(i);
        } catch (ActivityNotFoundException | SecurityException e) {
            Toast.makeText(act, "Diese Einstellung gibt es auf dem Handy nicht", Toast.LENGTH_SHORT).show();
        }
    }
}
