package de.obdwerkstatt.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

import de.obdwerkstatt.core.Elm327;
import de.obdwerkstatt.core.ObdApi;
import de.obdwerkstatt.core.Transport;

public class MainActivity extends Activity {
    private final List<Screen> stack = new ArrayList<Screen>();
    private FrameLayout content;
    private TextView titleView, backView, statusView;
    private Runnable pendingPermissionAction;
    private String pendingSaveContent;
    private static final int REQ_PERM = 1;
    private static final int REQ_SAVE = 2;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        LinearLayout root = Ui.vbox(this);
        root.setBackgroundColor(Ui.BG);

        LinearLayout bar = Ui.hbox(this);
        bar.setBackgroundColor(Ui.CARD);
        int p = Ui.dp(this, 8);
        bar.setPadding(p, p, p * 2, p);
        bar.setMinimumHeight(Ui.dp(this, 56));
        backView = Ui.text(this, "‹", 30, Ui.TEXT, false);
        backView.setPadding(p, 0, p * 2, Ui.dp(this, 4));
        backView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                onBackPressed();
            }
        });
        bar.addView(backView);
        titleView = Ui.text(this, "", 19, Ui.TEXT, true);
        titleView.setSingleLine(true);
        titleView.setPadding(p, 0, 0, 0);
        bar.addView(titleView, new LinearLayout.LayoutParams(0, -2, 1));
        statusView = Ui.badge(this, "", Ui.RED);
        statusView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!(top() instanceof ConnectScreen)) push(new ConnectScreen());
            }
        });
        bar.addView(statusView);
        root.addView(bar, new LinearLayout.LayoutParams(-1, -2));

        content = new FrameLayout(this);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);

        push(new HomeScreen());
        updateStatus();
    }

    // ---------------------------------------------------------------- Navigation

    Screen top() {
        return stack.isEmpty() ? null : stack.get(stack.size() - 1);
    }

    public void push(Screen s) {
        Screen old = top();
        if (old != null) old.onHide();
        stack.add(s);
        show(s);
    }

    /** Ersetzt die oberste Seite. */
    public void replace(Screen s) {
        Screen old = top();
        if (old != null) {
            old.onHide();
            stack.remove(stack.size() - 1);
        }
        stack.add(s);
        show(s);
    }

    public void pop() {
        if (stack.size() <= 1) return;
        Screen old = stack.remove(stack.size() - 1);
        old.onHide();
        show(top());
    }

    public void popToHome() {
        while (stack.size() > 1) {
            Screen old = stack.remove(stack.size() - 1);
            old.onHide();
        }
        show(top());
    }

    private void show(Screen s) {
        content.removeAllViews();
        View v = s.view(this);
        if (v.getParent() != null) ((FrameLayout) v.getParent()).removeView(v);
        content.addView(v, new FrameLayout.LayoutParams(-1, -1));
        titleView.setText(s.title());
        backView.setVisibility(stack.size() > 1 ? View.VISIBLE : View.GONE);
        s.onShow();
    }

    @Override
    public void onBackPressed() {
        if (stack.size() > 1) pop();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (isFinishing()) {
            Screen s = top();
            if (s != null) s.onHide();
            Session.disconnect();
        }
    }

    // ---------------------------------------------------------------- Verbindung

    public void updateStatus() {
        boolean c = Session.connected();
        boolean adapterOnly = c && Session.elm != null && !Session.elm.vehicleOk;
        statusView.setText(adapterOnly ? "Nur Adapter" : c ? "Verbunden" : "Getrennt");
        statusView.setTextColor(adapterOnly ? android.graphics.Color.BLACK : android.graphics.Color.WHITE);
        statusView.setBackground(Ui.rounded(this, adapterOnly ? Ui.YELLOW : c ? Ui.GREEN : Ui.RED, 8));
    }

    public void connectionChanged() {
        updateStatus();
        for (Screen s : stack) s.onConnectionChanged();
    }

    /** Baut die Verbindung zum Adapter auf und initialisiert ihn. */
    public void connect(final Transport t, final int protocol) {
        if (Session.transport != null) Session.disconnect();
        new Job<String>() {
            @Override
            public String run() throws Exception {
                if (!(t instanceof Transports.Classic)) return open(t);
                // Klassisches Bluetooth: mehrere Verbindungsarten probieren, danach Bluetooth LE
                final Transports.Classic c = (Transports.Classic) t;
                StringBuilder log = new StringBuilder();
                Exception last = null;
                int first = prefs().getInt("bt_mode", 0);
                for (int i = 0; i < Transports.Classic.MODES.length && !isCancelled(); i++) {
                    int mode = i == 0 ? first : (i <= first ? i - 1 : i);
                    String label = "Bluetooth " + Transports.Classic.MODES[mode];
                    progress("Versuch " + (i + 1) + ": " + label + " …");
                    try {
                        String r = open(new Transports.Classic(c.device, mode));
                        prefs().edit().putInt("bt_mode", mode).apply();
                        return r;
                    } catch (Elm327.VehicleError e) {
                        // Bluetooth und Adapter funktionieren – weitere Verbindungsarten bringen nichts
                        prefs().edit().putInt("bt_mode", mode).apply();
                        throw e;
                    } catch (Elm327.NoResponse e) {
                        log.append("• ").append(label).append(": ").append(e.getMessage()).append('\n');
                        last = e;
                        if (!e.silent) throw new IOException(log.toString());
                    } catch (Exception e) {
                        log.append("• ").append(label).append(": ").append(e.getMessage()).append('\n');
                        last = e;
                    }
                }
                // Dual-Mode-Adapter: Daten nur über Bluetooth LE (oft mit eigener Adresse)
                java.util.List<android.bluetooth.BluetoothDevice> cands = new java.util.ArrayList<android.bluetooth.BluetoothDevice>();
                cands.add(c.device);
                if (!isCancelled()) {
                    progress("Suche den Adapter über Bluetooth LE …");
                    for (android.bluetooth.BluetoothDevice d : Transports.scanObdBle(6000, c.device.getName())) {
                        if (!d.getAddress().equals(c.device.getAddress())) cands.add(d);
                    }
                }
                for (android.bluetooth.BluetoothDevice d : cands) {
                    if (isCancelled()) break;
                    String label = "Bluetooth LE " + (d.getName() == null ? "" : d.getName() + " ") + "(" + d.getAddress() + ")";
                    progress("Versuch: " + label + " …");
                    try {
                        String r = open(new Transports.Ble(MainActivity.this, d));
                        prefs().edit().putString("last_type", "ble").putString("last_addr", d.getAddress()).apply();
                        return r;
                    } catch (Exception e) {
                        log.append("• ").append(label).append(": ").append(e.getMessage()).append('\n');
                        last = e;
                    }
                }
                if (cands.size() == 1) log.append("• Bluetooth-LE-Suche: kein weiteres OBD-Gerät gefunden\n");
                throw new IOException("Alle Verbindungsversuche erfolglos:\n" + log
                        + "\nBitte prüfen: Funktioniert der Adapter mit einer anderen App (z. B. Car Scanner)? "
                        + "Ist das Handy evtl. mit einem anderen Gerät (zweites Handy, Radio) am Adapter verbunden? "
                        + "Adapter abziehen, 10 s warten, wieder einstecken.", last);
            }

            private String vehicleMessage;

            private String open(Transport tr) throws Exception {
                progress("Verbinde mit " + tr.describe() + " …");
                tr.open();
                try {
                    Elm327 elm = new Elm327(tr);
                    try {
                        elm.init(protocol, new Elm327.Log() {
                            @Override
                            public void line(String s) {
                                progress(s);
                            }
                        });
                    } catch (Elm327.VehicleError ve) {
                        // Adapter funktioniert – Verbindung halten, damit Adapter-Test und Terminal nutzbar sind
                        vehicleMessage = ve.getMessage();
                    }
                    ObdApi api = new ObdApi(elm);
                    Session.transport = tr;
                    Session.elm = elm;
                    Session.api = api;
                    if (!elm.vehicleOk) return "!";
                    progress("Lese unterstützte Messwerte …");
                    api.supportedPids();
                    try {
                        Session.lastVoltage = api.voltage();
                    } catch (Exception ignored) {
                    }
                    return elm.protocolDesc;
                } catch (Exception e) {
                    Session.disconnect();
                    tr.close();
                    throw e;
                }
            }

            @Override
            public void done(String proto) {
                connectionChanged();
                popToHome();
                if ("!".equals(proto)) {
                    new AlertDialog.Builder(MainActivity.this).setTitle("Adapter verbunden – Fahrzeug antwortet nicht")
                            .setMessage(vehicleMessage + "\n\nMit dem Adapter-Test lässt sich prüfen, was der Adapter kann.")
                            .setPositiveButton("Adapter-Test", new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface d, int w) {
                                    push(new AdapterScreen());
                                }
                            })
                            .setNegativeButton("OK", null).show();
                    return;
                }
                toast("Verbunden – " + proto);
            }

            @Override
            public void failed(Exception e) {
                connectionChanged();
                alert("Verbindung fehlgeschlagen", e.getMessage());
            }
        }.start(this, "Verbinde …");
    }

    public void disconnect() {
        Session.disconnect();
        connectionChanged();
        toast("Verbindung getrennt");
    }

    /** Prüft, ob verbunden; zeigt sonst einen Hinweis. */
    public boolean requireConnection() {
        if (Session.connected()) return true;
        confirm("Nicht verbunden", "Bitte zuerst mit dem OBD-Adapter verbinden.", "Verbinden", new Runnable() {
            @Override
            public void run() {
                push(new ConnectScreen());
            }
        });
        return false;
    }

    // ---------------------------------------------------------------- Dialoge

    public void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    public void alert(String title, String msg) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this).setTitle(title).setMessage(msg).setPositiveButton("OK", null).show();
    }

    public void confirm(String title, String msg, String yes, final Runnable action) {
        new AlertDialog.Builder(this).setTitle(title).setMessage(msg)
                .setPositiveButton(yes, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        action.run();
                    }
                })
                .setNegativeButton("Abbrechen", null).show();
    }

    /** Dialog mit beliebigem Inhalt (scrollbar). */
    public void showView(String title, View v) {
        android.widget.ScrollView sv = new android.widget.ScrollView(this);
        int p = Ui.dp(this, 20);
        v.setPadding(p, Ui.dp(this, 8), p, 0);
        sv.addView(v);
        new AlertDialog.Builder(this).setTitle(title).setView(sv).setPositiveButton("Schließen", null).show();
    }

    // ---------------------------------------------------------------- Berechtigungen

    public void withPermissions(String[] perms, Runnable action) {
        if (Build.VERSION.SDK_INT < 23) {
            action.run();
            return;
        }
        List<String> missing = new ArrayList<String>();
        for (String p : perms) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (missing.isEmpty()) {
            action.run();
            return;
        }
        pendingPermissionAction = action;
        requestPermissions(missing.toArray(new String[0]), REQ_PERM);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code != REQ_PERM) return;
        boolean ok = true;
        for (int r : results) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
        Runnable a = pendingPermissionAction;
        pendingPermissionAction = null;
        if (ok && a != null) a.run();
        else if (!ok) alert("Berechtigung fehlt",
                "Ohne Bluetooth-Berechtigung kann die App keine Verbindung zum Adapter aufbauen. "
                        + "Die Berechtigung kann in den Android-Einstellungen unter Apps → OBD Werkstatt erteilt werden.");
    }

    // ---------------------------------------------------------------- Teilen / Speichern

    public void share(String subject, String text) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_SUBJECT, subject);
        i.putExtra(Intent.EXTRA_TEXT, text);
        startActivity(Intent.createChooser(i, "Teilen"));
    }

    /** Lässt den Nutzer einen Speicherort wählen und schreibt den Text dorthin. */
    public void saveDocument(String fileName, String mime, String text) {
        pendingSaveContent = text;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, fileName);
        try {
            startActivityForResult(i, REQ_SAVE);
        } catch (Exception e) {
            share(fileName, text);
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_SAVE) return;
        String text = pendingSaveContent;
        pendingSaveContent = null;
        if (res != RESULT_OK || data == null || data.getData() == null || text == null) return;
        Uri uri = data.getData();
        try {
            OutputStream os = getContentResolver().openOutputStream(uri);
            os.write(text.getBytes("UTF-8"));
            os.close();
            toast("Gespeichert");
        } catch (Exception e) {
            alert("Speichern fehlgeschlagen", e.getMessage());
        }
    }

    public SharedPreferences prefs() {
        return getSharedPreferences("obd", Context.MODE_PRIVATE);
    }

    /** Zentrierter Platzhaltertext. */
    public TextView emptyText(String s) {
        TextView t = Ui.hint(this, s);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, Ui.dp(this, 24), 0, Ui.dp(this, 24));
        return t;
    }
}
