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
import android.view.MotionEvent;
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
    private Button power, ptt, widgetBtn, batteryBtn;
    private TextView status, display, people;
    private View setupBox, radioBox;
    private boolean autostart;

    @SuppressLint("ClickableViewAccessibility")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_main);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        name = findViewById(R.id.name);
        channel = findViewById(R.id.channel);
        server = findViewById(R.id.server);
        power = findViewById(R.id.power);
        ptt = findViewById(R.id.ptt);
        status = findViewById(R.id.status);
        display = findViewById(R.id.display);
        people = findViewById(R.id.people);
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
        power.setOnClickListener(v -> {
            if (RadioService.instance != null) RadioService.stop(this); else switchOn();
        });
        findViewById(R.id.share).setOnClickListener(v -> share());
        widgetBtn.setOnClickListener(v -> addWidget());
        batteryBtn.setOnClickListener(v -> askBattery());

        // Sprechtaste: gedrückt halten = senden
        ptt.setOnTouchListener((v, e) -> {
            RadioService s = RadioService.instance;
            if (s == null) return true;
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: v.setPressed(true); s.setTalking(true); return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL: v.setPressed(false); s.setTalking(false); return true;
                default: return true;
            }
        });

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
        RadioService s = RadioService.instance;
        if (s != null && ptt.isPressed()) { ptt.setPressed(false); s.setTalking(false); }
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
        status.postDelayed(this::onRadioChanged, 300);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code != REQ_PERM) return;
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            RadioService.start(this);
            status.postDelayed(this::onRadioChanged, 300);
        } else {
            Toast.makeText(this, "Ohne Mikrofon-Erlaubnis kann das Funkgerät nicht senden.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    public void onRadioChanged() {
        RadioService s = RadioService.instance;
        boolean on = s != null;
        setupBox.setVisibility(on ? View.GONE : View.VISIBLE);
        radioBox.setVisibility(on ? View.VISIBLE : View.GONE);
        power.setText(on ? "Funk ausschalten" : "Funk einschalten");
        power.setBackgroundResource(on ? R.drawable.btn_grey : R.drawable.btn_blue);

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        batteryBtn.setVisibility(pm.isIgnoringBatteryOptimizations(getPackageName()) ? View.GONE : View.VISIBLE);
        AppWidgetManager wm = AppWidgetManager.getInstance(this);
        int[] ids = wm.getAppWidgetIds(new ComponentName(this, PttWidget.class));
        widgetBtn.setVisibility(ids != null && ids.length > 0 ? View.GONE : View.VISIBLE);

        if (!on) return;
        ((TextView) findViewById(R.id.chan_label)).setText("Kanal: " + s.channel);
        status.setText(s.statusLine());
        status.setTextColor(s.connected ? 0xff7bd88f : 0xffffb74d);

        String sp = s.speakerName();
        if (s.talking) {
            display.setText("● Du sendest …");
            display.setBackgroundResource(R.drawable.display_tx);
        } else if (sp != null) {
            display.setText("🔊 " + sp + " spricht");
            display.setBackgroundResource(R.drawable.display_rx);
        } else {
            display.setText(s.connected ? "Bereit" : "Verbinde …");
            display.setBackgroundResource(R.drawable.display_idle);
        }
        ptt.setEnabled(s.connected);
        ptt.setAlpha(s.connected ? 1f : 0.45f);
        ptt.setBackgroundResource(s.talking ? R.drawable.ptt_on : R.drawable.ptt_off);

        StringBuilder sb = new StringBuilder("● ").append(s.name).append(" (du)");
        for (RadioService.Member m : s.members.values()) {
            sb.append("\n").append(m.talking ? "🔊 " : "● ").append(m.name.isEmpty() ? "Gerät" : m.name);
        }
        people.setText(sb);
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
