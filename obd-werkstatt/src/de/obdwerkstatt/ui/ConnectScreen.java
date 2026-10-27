package de.obdwerkstatt.ui;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import de.obdwerkstatt.core.DemoTransport;
import de.obdwerkstatt.core.Elm327;

@SuppressLint("MissingPermission")
public final class ConnectScreen extends Screen {
    private LinearLayout list;
    private TextView protoView;
    private BluetoothLeScanner scanner;
    private ScanCallback scanCb;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public String title() {
        return "Verbinden";
    }

    @Override
    protected View create() {
        final Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);

        page.addView(Ui.section(c, "Adapter wählen"));
        Ui.add(page, Ui.row(c,
                Ui.primary(c, "Bluetooth", new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        showClassic();
                    }
                }),
                Ui.secondary(c, "Bluetooth LE", new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        startBleScan();
                    }
                })), 8);
        Ui.add(page, Ui.row(c,
                Ui.secondary(c, "WLAN-Adapter", new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        askWifi();
                    }
                }),
                Ui.secondary(c, "Demo (ohne Auto)", new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        rememberLast("demo", "", "Demo");
                        act.connect(new DemoTransport(), 0);
                    }
                })), 8);

        protoView = Ui.hint(c, "");
        protoView.setPadding(0, Ui.dp(c, 6), 0, Ui.dp(c, 6));
        protoView.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                chooseProtocol();
            }
        });
        Ui.add(page, protoView, 10);
        updateProto();

        list = Ui.vbox(c);
        Ui.add(page, list, 8);

        Ui.add(page, Ui.hint(c, "Tipps:\n• Klassische Bluetooth-Adapter (die meisten ELM327) zuerst in den "
                + "Android-Bluetooth-Einstellungen koppeln, PIN meist 1234 oder 0000.\n"
                + "• Adapter mit „BLE“ oder „4.0“ (z. B. Vgate iCar Pro BLE, OBDLink CX) über „Bluetooth LE“ suchen – "
                + "ohne Kopplung.\n• WLAN-Adapter: mit dem WLAN des Adapters verbinden, meist 192.168.0.10 Port 35000."), 16);
        Ui.add(page, Ui.secondary(c, "Bluetooth-Einstellungen öffnen", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                act.startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            }
        }), 10);
        return h[0];
    }

    private int protocol() {
        return act.prefs().getInt("protocol", 0);
    }

    private void updateProto() {
        protoView.setText("Protokoll: " + Elm327.PROTOCOLS[protocol()] + "  (antippen zum Ändern)");
    }

    private void chooseProtocol() {
        new AlertDialog.Builder(act).setTitle("OBD-Protokoll")
                .setSingleChoiceItems(Elm327.PROTOCOLS, protocol(), new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        act.prefs().edit().putInt("protocol", which).apply();
                        updateProto();
                        d.dismiss();
                    }
                }).show();
    }

    // ---------------------------------------------------------------- Bluetooth klassisch

    private static String[] btPermissions(boolean scan) {
        if (Build.VERSION.SDK_INT >= 31) {
            return scan ? new String[]{"android.permission.BLUETOOTH_SCAN", "android.permission.BLUETOOTH_CONNECT",
                    Manifest.permission.ACCESS_FINE_LOCATION}
                    : new String[]{"android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_SCAN"};
        }
        return scan ? new String[]{Manifest.permission.ACCESS_FINE_LOCATION} : new String[0];
    }

    private BluetoothAdapter adapter() {
        BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
        if (a == null) {
            act.alert("Kein Bluetooth", "Dieses Gerät hat kein Bluetooth.");
            return null;
        }
        if (!a.isEnabled()) {
            try {
                act.startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE));
            } catch (Exception e) {
                act.alert("Bluetooth aus", "Bitte Bluetooth einschalten.");
            }
            return null;
        }
        return a;
    }

    private void showClassic() {
        stopScan();
        act.withPermissions(btPermissions(false), new Runnable() {
            @Override
            public void run() {
                BluetoothAdapter a = adapter();
                if (a == null) return;
                Set<BluetoothDevice> bonded = a.getBondedDevices();
                List<BluetoothDevice> devs = new ArrayList<BluetoothDevice>(bonded);
                // OBD-typische Namen nach oben
                List<BluetoothDevice> sorted = new ArrayList<BluetoothDevice>();
                for (BluetoothDevice d : devs) if (looksLikeObd(d.getName())) sorted.add(d);
                for (BluetoothDevice d : devs) if (!looksLikeObd(d.getName())) sorted.add(d);
                list.removeAllViews();
                list.addView(Ui.section(act, "Gekoppelte Geräte"));
                if (sorted.isEmpty()) {
                    list.addView(act.emptyText("Keine gekoppelten Geräte. Bitte den Adapter zuerst in den "
                            + "Bluetooth-Einstellungen koppeln."));
                }
                for (final BluetoothDevice d : sorted) {
                    Ui.add(list, deviceRow(d.getName(), d.getAddress(), looksLikeObd(d.getName()), new View.OnClickListener() {
                        @Override
                        public void onClick(View v) {
                            rememberLast("bt", d.getAddress(), name(d));
                            act.connect(new Transports.Classic(d), protocol());
                        }
                    }), 8);
                }
            }
        });
    }

    private static String name(BluetoothDevice d) {
        String n = d.getName();
        return n == null || n.isEmpty() ? d.getAddress() : n;
    }

    static boolean looksLikeObd(String n) {
        if (n == null) return false;
        String u = n.toUpperCase();
        return u.contains("OBD") || u.contains("ELM") || u.contains("V-LINK") || u.contains("VLINK")
                || u.contains("VGATE") || u.contains("ICAR") || u.contains("KONNWEI") || u.contains("VEEPEAK")
                || u.contains("CAN") || u.contains("CARISTA") || u.contains("LELINK") || u.contains("IOS-VLINK");
    }

    private View deviceRow(String name, String addr, boolean obd, View.OnClickListener l) {
        Context c = act;
        LinearLayout r = Ui.card(c);
        LinearLayout top = Ui.hbox(c);
        TextView t = Ui.text(c, name == null || name.isEmpty() ? "(ohne Namen)" : name, 16, Ui.TEXT, true);
        top.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
        if (obd) top.addView(Ui.badge(c, "OBD", Ui.ACCENT));
        r.addView(top);
        r.addView(Ui.hint(c, addr));
        r.setClickable(true);
        r.setForeground(c.getDrawable(android.R.drawable.list_selector_background));
        r.setOnClickListener(l);
        return r;
    }

    // ---------------------------------------------------------------- Bluetooth LE

    private void startBleScan() {
        act.withPermissions(btPermissions(true), new Runnable() {
            @Override
            public void run() {
                BluetoothAdapter a = adapter();
                if (a == null) return;
                scanner = a.getBluetoothLeScanner();
                if (scanner == null) {
                    act.alert("Bluetooth LE", "Bluetooth LE ist nicht verfügbar.");
                    return;
                }
                stopScan();
                final Map<String, BluetoothDevice> found = new LinkedHashMap<String, BluetoothDevice>();
                list.removeAllViews();
                list.addView(Ui.section(act, "Suche Bluetooth-LE-Geräte …"));
                final LinearLayout results = Ui.vbox(act);
                list.addView(results);
                scanCb = new ScanCallback() {
                    @Override
                    public void onScanResult(int type, ScanResult r) {
                        final BluetoothDevice d = r.getDevice();
                        if (found.containsKey(d.getAddress())) return;
                        String n = d.getName();
                        if (n == null && r.getScanRecord() != null) n = r.getScanRecord().getDeviceName();
                        if (n == null) return; // namenlose Geräte (Kopfhörer, Tracker …) ausblenden
                        found.put(d.getAddress(), d);
                        final String fn = n;
                        View row = deviceRow(n, d.getAddress(), looksLikeObd(n), new View.OnClickListener() {
                            @Override
                            public void onClick(View v) {
                                stopScan();
                                rememberLast("ble", d.getAddress(), fn);
                                act.connect(new Transports.Ble(act, d), protocol());
                            }
                        });
                        if (looksLikeObd(n)) results.addView(row, 0, Ui.gap(act, 8));
                        else Ui.add(results, row, 8);
                    }

                    @Override
                    public void onScanFailed(int errorCode) {
                        act.alert("Suche fehlgeschlagen", "Bluetooth-LE-Suche fehlgeschlagen (Code " + errorCode
                                + "). Ist der Standort eingeschaltet?");
                    }
                };
                scanner.startScan(scanCb);
                handler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (scanCb != null) {
                            stopScan();
                            if (list.getChildCount() > 0 && list.getChildAt(0) instanceof TextView) {
                                ((TextView) list.getChildAt(0)).setText(found.isEmpty()
                                        ? "Keine BLE-Geräte gefunden" : "Gefundene Geräte");
                            }
                        }
                    }
                }, 12000);
            }
        });
    }

    private void stopScan() {
        if (scanner != null && scanCb != null) {
            try {
                scanner.stopScan(scanCb);
            } catch (Exception ignored) {
            }
        }
        scanCb = null;
    }

    @Override
    public void onHide() {
        stopScan();
    }

    // ---------------------------------------------------------------- WLAN

    private void askWifi() {
        stopScan();
        final EditText e = new EditText(act);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        e.setText(act.prefs().getString("wifi", "192.168.0.10:35000"));
        LinearLayout box = Ui.vbox(act);
        box.addView(Ui.hint(act, "Adresse:Port des WLAN-Adapters"));
        box.addView(e);
        int p = Ui.dp(act, 20);
        box.setPadding(p, p / 2, p, 0);
        new AlertDialog.Builder(act).setTitle("WLAN-Adapter").setView(box)
                .setPositiveButton("Verbinden", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        String s = e.getText().toString().trim();
                        act.prefs().edit().putString("wifi", s).apply();
                        connectWifi(act, s, protocol());
                    }
                }).setNegativeButton("Abbrechen", null).show();
    }

    private static void connectWifi(MainActivity act, String s, int proto) {
        String host = s;
        int port = 35000;
        int i = s.lastIndexOf(':');
        if (i > 0) {
            host = s.substring(0, i);
            try {
                port = Integer.parseInt(s.substring(i + 1));
            } catch (NumberFormatException ignored) {
            }
        }
        act.prefs().edit().putString("last_type", "wifi").putString("last_addr", s)
                .putString("last_label", "WLAN").apply();
        act.connect(new Transports.Wifi(host, port), proto);
    }

    // ---------------------------------------------------------------- Letztes Gerät

    private void rememberLast(String type, String addr, String label) {
        act.prefs().edit().putString("last_type", type).putString("last_addr", addr)
                .putString("last_label", label).apply();
    }

    static void reconnectLast(final MainActivity act) {
        final String type = act.prefs().getString("last_type", "");
        final String addr = act.prefs().getString("last_addr", "");
        final int proto = act.prefs().getInt("protocol", 0);
        if (type.equals("demo")) {
            act.connect(new DemoTransport(), 0);
            return;
        }
        if (type.equals("wifi")) {
            connectWifi(act, addr, proto);
            return;
        }
        act.withPermissions(btPermissions(false), new Runnable() {
            @Override
            public void run() {
                BluetoothAdapter a = BluetoothAdapter.getDefaultAdapter();
                if (a == null || !a.isEnabled()) {
                    act.alert("Bluetooth aus", "Bitte Bluetooth einschalten.");
                    return;
                }
                BluetoothDevice d;
                try {
                    d = a.getRemoteDevice(addr);
                } catch (IllegalArgumentException e) {
                    act.push(new ConnectScreen());
                    return;
                }
                if (type.equals("ble")) act.connect(new Transports.Ble(act, d), proto);
                else act.connect(new Transports.Classic(d), proto);
            }
        });
    }
}
