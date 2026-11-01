package de.funkgeraet.walkie;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Random;

public class MainActivity extends Activity implements RadioService.UiListener {
    public static final String EXTRA_AUTOSTART = "autostart";
    private static final int REQ_PERM = 1;

    private EditText name, channel, server;
    private Button power, widgetBtn, batteryBtn;
    private RadioView radio;
    private View setupBox, radioBox;
    private boolean autostart;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_main);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        // Android 15 zeichnet unter Status- und Navigationsleiste: Platz dafür freihalten
        View root = findViewById(R.id.root);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.displayCutout());
                top = i.top; bottom = i.bottom;
            } else { top = insets.getSystemWindowInsetTop(); bottom = insets.getSystemWindowInsetBottom(); }
            v.setPadding(0, top, 0, bottom);
            return insets;
        });

        name = findViewById(R.id.name);
        channel = findViewById(R.id.channel);
        server = findViewById(R.id.server);
        power = findViewById(R.id.power);
        radio = findViewById(R.id.radio);
        setupBox = findViewById(R.id.setup_box);
        radioBox = findViewById(R.id.radio_box);
        widgetBtn = findViewById(R.id.add_widget);
        batteryBtn = findViewById(R.id.battery);

        SharedPreferences p = prefs();
        name.setText(p.getString("name", ""));
        channel.setText(p.getString("channel", ""));
        server.setText(p.getString("server", RadioService.DEFAULT_SERVER));

        findViewById(R.id.random).setOnClickListener(v -> channel.setText(randomChannel()));
        findViewById(R.id.server_toggle).setOnClickListener(v ->
            server.setVisibility(server.getVisibility() == View.VISIBLE ? View.GONE : View.VISIBLE));
        power.setOnClickListener(v -> switchOn());
        findViewById(R.id.off).setOnClickListener(v -> { RadioService.stop(this); radioBox.postDelayed(this::onRadioChanged, 100); });
        findViewById(R.id.share).setOnClickListener(v -> share());
        widgetBtn.setOnClickListener(v -> addWidget());
        findViewById(R.id.extras).setOnClickListener(v -> showExtras());
        batteryBtn.setOnClickListener(v -> askBattery());

        autostart = getIntent().getBooleanExtra(EXTRA_AUTOSTART, false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getBooleanExtra(EXTRA_AUTOSTART, false) && RadioService.instance == null) switchOn();
    }

    @Override
    protected void onResume() {
        super.onResume();
        RadioService.ui = this;
        if (autostart) {
            autostart = false;
            if (RadioService.instance == null && !name.getText().toString().trim().isEmpty()
                && !channel.getText().toString().trim().isEmpty()) switchOn();
        }
        onRadioChanged();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (RadioService.ui == this) RadioService.ui = null;
        // Wer die App verlässt, während er die Taste hält, soll nicht weiter senden.
        radio.release();
    }

    private SharedPreferences prefs() { return getSharedPreferences("funk", MODE_PRIVATE); }

    private void switchOn() {
        String n = name.getText().toString().trim();
        String ch = channel.getText().toString().trim();
        if (n.isEmpty()) { name.setError("Bitte Namen eingeben"); name.requestFocus(); return; }
        if (ch.length() < 3) { channel.setError("Mindestens 3 Zeichen"); channel.requestFocus(); return; }
        prefs().edit().putString("name", n).putString("channel", ch)
            .putString("server", server.getText().toString().trim()).apply();

        boolean needMic = checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED;
        boolean needNotif = Build.VERSION.SDK_INT >= 33
            && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED;
        if (needMic || needNotif) {
            if (Build.VERSION.SDK_INT >= 33)
                requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS }, REQ_PERM);
            else requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQ_PERM);
            return;
        }
        RadioService.start(this);
        radioBox.postDelayed(this::onRadioChanged, 300);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code != REQ_PERM) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            RadioService.start(this);
            radioBox.postDelayed(this::onRadioChanged, 300);
        } else {
            Toast.makeText(this, "Ohne Mikrofon-Erlaubnis kann das Funkgerät nicht senden.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onRadioChanged() {
        boolean on = RadioService.instance != null;
        setupBox.setVisibility(on ? View.GONE : View.VISIBLE);
        radioBox.setVisibility(on ? View.VISIBLE : View.GONE);

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        int bat = pm.isIgnoringBatteryOptimizations(getPackageName()) ? View.GONE : View.VISIBLE;
        batteryBtn.setVisibility(bat);
        AppWidgetManager wm = AppWidgetManager.getInstance(this);
        int[] ids = wm.getAppWidgetIds(new ComponentName(this, PttWidget.class));
        int wid = ids != null && ids.length > 0 ? View.GONE : View.VISIBLE;
        widgetBtn.setVisibility(wid);
        radio.invalidate();
    }

    /* ---------- Extras ---------- */

    private void showExtras() {
        RadioService s = RadioService.instance;
        if (s == null) return;
        android.app.Dialog d = new android.app.Dialog(this);
        d.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE);
        View v = getLayoutInflater().inflate(R.layout.dialog_extras, null);
        d.setContentView(v);
        if (d.getWindow() != null) {
            d.getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
            d.getWindow().setLayout((int) (getResources().getDisplayMetrics().widthPixels * 0.94f),
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
            d.getWindow().setDimAmount(0.75f);
        }
        SharedPreferences p = prefs();

        v.findViewById(R.id.x_ring).setOnClickListener(x -> { s.sendRing(); d.dismiss(); });

        EditText morse = v.findViewById(R.id.x_morse);
        Runnable doMorse = () -> {
            if (s.sendMorse(morse.getText().toString())) d.dismiss();
            else Toast.makeText(this, "Nur Buchstaben, Ziffern und . , ? ! / @ = + -", Toast.LENGTH_SHORT).show();
        };
        v.findViewById(R.id.x_morse_send).setOnClickListener(x -> doMorse.run());
        morse.setOnEditorActionListener((tv, id, ev) -> { doMorse.run(); return true; });
        android.widget.LinearLayout quick = v.findViewById(R.id.x_morse_quick);
        for (String q : new String[] { "SOS", "OK", "KOMME", "HILFE" }) {
            TextView c = chip(q);
            c.setOnClickListener(x -> { if (s.sendMorse(q)) d.dismiss(); });
            quick.addView(c, chipParams(quick));
        }

        // Stimme
        android.widget.LinearLayout v1 = v.findViewById(R.id.x_voice1), v2 = v.findViewById(R.id.x_voice2);
        String[] voiceIcons = { "🎙", "📻", "🤖", "🐭", "👹", "🏔" };
        java.util.List<TextView> voices = new java.util.ArrayList<>();
        for (int i = 0; i < VoiceFx.NAMES.length; i++) {
            final int idx = i;
            TextView c = chip(voiceIcons[i] + " " + VoiceFx.NAMES[i]);
            voices.add(c);
            c.setOnClickListener(x -> {
                p.edit().putInt("voiceFx", idx).apply();
                s.reloadSettings();
                for (TextView o : voices) o.setSelected(o == c);
            });
            (i < 3 ? v1 : v2).addView(c, chipParams(i < 3 ? v1 : v2));
            c.setSelected(i == s.voiceFx);
        }

        // Roger-Ton (tippen = Probe hören)
        android.widget.LinearLayout r1 = v.findViewById(R.id.x_roger1), r2 = v.findViewById(R.id.x_roger2);
        java.util.List<TextView> rogers = new java.util.ArrayList<>();
        for (int i = 0; i < Sfx.ROGER_NAMES.length; i++) {
            final int idx = i;
            TextView c = chip(Sfx.ROGER_NAMES[i]);
            rogers.add(c);
            c.setOnClickListener(x -> {
                p.edit().putInt("roger", idx).apply();
                s.reloadSettings();
                for (TextView o : rogers) o.setSelected(o == c);
                s.previewRoger(idx);
            });
            (i < 3 ? r1 : r2).addView(c, chipParams(i < 3 ? r1 : r2));
            c.setSelected(i == s.rogerStyle);
        }

        android.widget.Switch st = v.findViewById(R.id.x_static), to = v.findViewById(R.id.x_torch);
        st.setChecked(s.staticNoise);
        to.setChecked(s.torch);
        st.setOnCheckedChangeListener((b, on) -> { p.edit().putBoolean("static", on).apply(); s.reloadSettings(); });
        to.setOnCheckedChangeListener((b, on) -> { p.edit().putBoolean("torch", on).apply(); s.reloadSettings(); });

        Button w = v.findViewById(R.id.x_widget), bat = v.findViewById(R.id.x_battery);
        w.setVisibility(widgetBtn.getVisibility());
        bat.setVisibility(batteryBtn.getVisibility());
        w.setOnClickListener(x -> addWidget());
        bat.setOnClickListener(x -> askBattery());
        v.findViewById(R.id.x_close).setOnClickListener(x -> d.dismiss());
        d.show();
    }

    private TextView chip(String text) {
        TextView c = new TextView(this);
        c.setText(text);
        c.setTextColor(0xffd6e6f5);
        c.setTextSize(14);
        c.setGravity(android.view.Gravity.CENTER);
        c.setSingleLine(true);
        c.setBackgroundResource(R.drawable.chip);
        int pad = (int) (8 * getResources().getDisplayMetrics().density);
        c.setPadding(pad, pad, pad, pad);
        return c;
    }

    private android.widget.LinearLayout.LayoutParams chipParams(android.widget.LinearLayout row) {
        android.widget.LinearLayout.LayoutParams lp = new android.widget.LinearLayout.LayoutParams(0,
            (int) (42 * getResources().getDisplayMetrics().density), 1);
        if (row.getChildCount() > 0) lp.setMarginStart((int) (8 * getResources().getDisplayMetrics().density));
        return lp;
    }

    private void share() {
        RadioService s = RadioService.instance;
        String ch = s != null ? s.channel : channel.getText().toString().trim();
        Intent i = new Intent(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_TEXT, "Komm in mein Funkgerät! Kanal: " + ch
                + "\n(App „Funkgerät“ öffnen, Kanal genau so eintippen, Funk einschalten.)");
        startActivity(Intent.createChooser(i, "Kanal teilen"));
    }

    private void addWidget() {
        AppWidgetManager wm = AppWidgetManager.getInstance(this);
        if (Build.VERSION.SDK_INT >= 26 && wm.isRequestPinAppWidgetSupported()) {
            wm.requestPinAppWidget(new ComponentName(this, PttWidget.class), null, null);
        } else {
            Toast.makeText(this, "Startbildschirm lange drücken → Widgets → Funkgerät", Toast.LENGTH_LONG).show();
        }
    }

    @SuppressLint("BatteryLife")
    private void askBattery() {
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
        }
    }

    private static String randomChannel() {
        String[] w = { "falke", "adler", "fuchs", "wolf", "luchs", "otter", "biber", "dachs", "eule", "hirsch", "kranich", "marder" };
        Random r = new Random();
        return w[r.nextInt(w.length)] + "-" + (1000 + r.nextInt(9000));
    }
}
