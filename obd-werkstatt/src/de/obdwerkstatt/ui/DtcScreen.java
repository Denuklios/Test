package de.obdwerkstatt.ui;

import android.content.Context;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

import de.obdwerkstatt.core.Dtc;
import de.obdwerkstatt.core.DtcDatabase;
import de.obdwerkstatt.core.EcuNames;
import de.obdwerkstatt.core.ObdApi;

public final class DtcScreen extends Screen {
    private LinearLayout results;
    private TextView summary;
    private boolean readOnce;

    @Override
    public String title() {
        return "Fehlerspeicher";
    }

    @Override
    protected View create() {
        Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);
        page.addView(Ui.row(c,
                Ui.primary(c, "Auslesen", new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        read();
                    }
                }),
                Ui.button(c, "Löschen", Ui.RED, new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        askClear();
                    }
                })));
        summary = Ui.body(c, "");
        Ui.add(page, summary, 14);
        results = Ui.vbox(c);
        Ui.add(page, results, 4);
        Ui.add(page, Ui.secondary(c, "Bericht teilen", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Report.share(act);
            }
        }), 16);
        Ui.add(page, Ui.hint(c, "Ausgelesen werden alle Steuergeräte, die über Standard-OBD antworten "
                + "(meist Motor und Getriebe). Fehler in ABS, Airbag usw. findest du unter „Steuergeräte“."), 12);
        render();
        return h[0];
    }

    @Override
    public void onShow() {
        if (!readOnce && Session.connected()) read();
    }

    private void read() {
        if (!act.requireConnection()) return;
        readOnce = true;
        new Job<Object[]>() {
            @Override
            public Object[] run() throws Exception {
                ObdApi api = Session.api();
                ObdApi.Readiness r = null;
                try {
                    r = api.readiness();
                } catch (Exception ignored) {
                }
                List<Dtc> d = api.readAllDtcs();
                return new Object[]{r, d};
            }

            @SuppressWarnings("unchecked")
            @Override
            public void done(Object[] res) {
                Session.lastReadiness = (ObdApi.Readiness) res[0];
                Session.lastDtcs = (List<Dtc>) res[1];
                render();
            }
        }.start(act, "Fehlerspeicher wird gelesen …");
    }

    private void askClear() {
        if (!act.requireConnection()) return;
        act.confirm("Fehlerspeicher löschen?",
                "Es werden alle gespeicherten und ausstehenden Fehler, Freeze-Frame-Daten und die "
                        + "Readiness-Tests aller OBD-Steuergeräte gelöscht. Die Motorkontrollleuchte geht aus.\n\n"
                        + "Fahrzeug muss stehen, Zündung an, Motor aus.\n\n"
                        + "Achtung: Danach ist das Fahrzeug erst nach einigen Fahrzyklen wieder AU-/HU-bereit.",
                "Löschen", new Runnable() {
                    @Override
                    public void run() {
                        new Job<String>() {
                            @Override
                            public String run() throws Exception {
                                return Session.api().clearDtcs();
                            }

                            @Override
                            public void done(String msg) {
                                act.alert("Fehler löschen", msg);
                                read();
                            }
                        }.start(act, "Fehler werden gelöscht …");
                    }
                });
    }

    private void render() {
        if (results == null) return;
        Context c = act;
        results.removeAllViews();
        List<Dtc> list = Session.lastDtcs;
        ObdApi.Readiness r = Session.lastReadiness;
        if (!readOnce && list.isEmpty()) {
            summary.setText("Noch nicht ausgelesen.");
            return;
        }
        StringBuilder sb = new StringBuilder();
        if (r != null) {
            sb.append(r.mil ? "Motorkontrollleuchte: AN" : "Motorkontrollleuchte: aus");
            sb.append("  •  ").append(r.dtcCount).append(" bestätigte Fehler gemeldet\n");
        }
        sb.append(list.isEmpty() ? "Keine Fehler gespeichert. ✓" : list.size() + " Fehlercode(s) gefunden");
        summary.setText(sb.toString());
        summary.setTextColor(list.isEmpty() ? Ui.GREEN : Ui.TEXT);
        String[] kinds = {ObdApi.STORED, ObdApi.PENDING, ObdApi.PERMANENT};
        String[] heads = {"Gespeicherte Fehler (Modus 03)", "Ausstehende Fehler (Modus 07)",
                "Permanente Fehler (Modus 0A, nicht löschbar)"};
        for (int k = 0; k < kinds.length; k++) {
            List<Dtc> part = new ArrayList<Dtc>();
            for (Dtc d : list) if (d.kind.equals(kinds[k])) part.add(d);
            if (part.isEmpty()) continue;
            Ui.add(results, Ui.section(c, heads[k] + " – " + part.size()), 16);
            for (Dtc d : part) Ui.add(results, dtcCard(act, d), 8);
        }
    }

    static View dtcCard(final MainActivity act, final Dtc d) {
        Context c = act;
        LinearLayout card = Ui.card(c);
        LinearLayout top = Ui.hbox(c);
        int color = d.kind.equals(ObdApi.PENDING) ? Ui.YELLOW : Ui.RED;
        TextView code = Ui.text(c, d.code, 20, color, true);
        top.addView(code, new LinearLayout.LayoutParams(0, -2, 1));
        top.addView(Ui.badge(c, EcuNames.name(d.ecu), Ui.CARD2));
        card.addView(top);
        Ui.add(card, Ui.body(c, d.description()), 4);
        if (!d.detail.isEmpty()) Ui.add(card, Ui.hint(c, d.detail), 2);
        card.setClickable(true);
        card.setForeground(c.getDrawable(android.R.drawable.list_selector_background));
        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                LinearLayout box = Ui.vbox(act);
                box.addView(Ui.kv(act, "Code", d.code));
                box.addView(Ui.kv(act, "Art", d.kind));
                box.addView(Ui.kv(act, "Steuergerät", EcuNames.name(d.ecu)));
                if (!d.detail.isEmpty()) box.addView(Ui.kv(act, "Status", d.detail));
                Ui.add(box, Ui.body(act, d.description()), 8);
                Ui.add(box, Ui.hint(act, "Bereich: " + DtcDatabase.category(d.code)), 8);
                Ui.add(box, Ui.hint(act, hint(d.code)), 8);
                act.showView(d.code, box);
            }
        });
        return card;
    }

    /** Allgemeine Bedeutung der Code-Stellen. */
    static String hint(String code) {
        String sys;
        switch (code.charAt(0)) {
            case 'P': sys = "P = Antrieb (Motor/Getriebe)"; break;
            case 'C': sys = "C = Fahrwerk"; break;
            case 'B': sys = "B = Karosserie"; break;
            default: sys = "U = Netzwerk/Kommunikation"; break;
        }
        String std = code.charAt(1) == '0' ? "0 = genormter Code (SAE/ISO)"
                : code.charAt(1) == '1' ? "1 = herstellerspezifischer Code" : code.charAt(1) + " = erweiterter Bereich";
        return sys + "\n" + std + "\nFür herstellerspezifische Codes ggf. Werkstattliteratur oder Herstellerdatenbank nutzen.";
    }
}
