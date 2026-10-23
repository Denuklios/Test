package de.obdwerkstatt.ui;

import android.content.Context;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;

import java.util.ArrayList;
import java.util.List;

import de.obdwerkstatt.core.ObdApi;
import de.obdwerkstatt.core.PidTable;
import de.obdwerkstatt.core.VinDecoder;

public final class InfoScreen extends Screen {
    private LinearLayout results;
    private boolean readOnce;

    @Override
    public String title() {
        return "Fahrzeugdaten";
    }

    @Override
    protected View create() {
        Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);
        page.addView(Ui.primary(c, "Fahrzeugdaten lesen", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                read();
            }
        }));
        results = Ui.vbox(c);
        Ui.add(page, results, 8);
        return h[0];
    }

    @Override
    public void onShow() {
        if (!readOnce && Session.connected()) read();
    }

    private void read() {
        if (!act.requireConnection()) return;
        readOnce = true;
        new Job<List<String[]>>() {
            @Override
            public List<String[]> run() throws Exception {
                ObdApi api = Session.api();
                List<String[]> out = new ArrayList<String[]>();
                progress("Fahrgestellnummer …");
                String vin = null;
                try {
                    vin = api.readVin();
                } catch (Exception ignored) {
                }
                Session.vin = vin;
                out.add(new String[]{"#", "Fahrzeug"});
                out.add(new String[]{"Fahrgestellnummer (FIN)", vin == null ? "nicht verfügbar" : vin});
                if (vin != null) {
                    out.add(new String[]{"Hersteller (laut FIN)", VinDecoder.manufacturer(vin)});
                    out.add(new String[]{"Modelljahr (Stelle 10)", VinDecoder.modelYear(vin)});
                }
                boolean[] sup = api.supportedPids();
                int[][] pids = {{0x1C}, {0x51}, {0xA6}, {0x21}, {0x4D}, {0x31}, {0x4E}, {0x30}, {0x1F}, {0x42}};
                for (int[] p : pids) {
                    if (!sup[p[0]]) continue;
                    int[] d = api.readPid(p[0]);
                    if (d != null) out.add(new String[]{PidTable.name(p[0]), PidTable.format(p[0], d)});
                }
                progress("Steuergerätedaten …");
                out.add(new String[]{"#", "Steuergeräte"});
                addAll(out, "Steuergerätename", safe(api, 0x0A));
                addAll(out, "Kalibrierungs-ID", safe(api, 0x04));
                addAll(out, "Prüfsumme (CVN)", safe(api, 0x06));
                out.add(new String[]{"#", "Adapter & Verbindung"});
                out.add(new String[]{"Adapter", Session.elm.version});
                out.add(new String[]{"Protokoll", Session.elm.protocolDesc});
                out.add(new String[]{"Verbindung", Session.transport.describe()});
                try {
                    String v = api.voltage();
                    Session.lastVoltage = v;
                    out.add(new String[]{"Batteriespannung (am Adapter)", v});
                } catch (Exception ignored) {
                }
                int n = 0;
                for (boolean b : sup) if (b) n++;
                out.add(new String[]{"Unterstützte Messwerte (Modus 01)", String.valueOf(n)});
                return out;
            }

            @Override
            public void done(List<String[]> rows) {
                results.removeAllViews();
                LinearLayout card = null;
                for (String[] r : rows) {
                    if (r[0].equals("#")) {
                        Ui.add(results, Ui.section(act, r[1]), 14);
                        card = Ui.card(act);
                        Ui.add(results, card, 6);
                    } else if (card != null) {
                        card.addView(Ui.kv(act, r[0], r[1]));
                    }
                }
            }
        }.start(act, "Lese Fahrzeugdaten …");
    }

    private static List<String> safe(ObdApi api, int pid) {
        try {
            return api.readInfoText(pid);
        } catch (Exception e) {
            return new ArrayList<String>();
        }
    }

    private static void addAll(List<String[]> out, String label, List<String> vals) {
        if (vals.isEmpty()) out.add(new String[]{label, "nicht verfügbar"});
        for (String v : vals) out.add(new String[]{label, v});
    }
}
