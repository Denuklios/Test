package de.obdwerkstatt.ui;

import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import de.obdwerkstatt.core.Dtc;
import de.obdwerkstatt.core.ObdApi;

public final class ModulesScreen extends Screen {
    private LinearLayout results;
    private List<ObdApi.Module> modules = new ArrayList<ObdApi.Module>();

    @Override
    public String title() {
        return "Steuergeräte";
    }

    @Override
    protected View create() {
        Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);
        page.addView(Ui.row(c,
                Ui.primary(c, "Schnellscan", new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        scan(false);
                    }
                }),
                Ui.secondary(c, "Vollscan", new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        scan(true);
                    }
                })));
        Ui.add(page, Ui.hint(c, "Sucht alle erreichbaren Steuergeräte (Motor, Getriebe, ABS/ESP, Airbag, "
                + "Kombiinstrument …) über UDS/KWP2000 auf CAN. Schnellscan prüft bekannte Adressen gängiger "
                + "Hersteller (ca. 20 s), Vollscan alle Adressen (ca. 1 min).\n"
                + "Hinweis: Manche Fahrzeuge (z. B. mit Diagnose-Gateway/Security, viele Stellantis ab 2018) "
                + "sperren den Zugriff auf weitere Steuergeräte."), 10);
        results = Ui.vbox(c);
        Ui.add(page, results, 8);
        render();
        return h[0];
    }

    private void scan(final boolean full) {
        if (!act.requireConnection()) return;
        new Job<List<ObdApi.Module>>() {
            @Override
            public List<ObdApi.Module> run() throws Exception {
                return Session.api().scanModules(full, new ObdApi.Progress() {
                    @Override
                    public void update(String text, int done, int total) {
                        progress(text + "\n" + (total == 0 ? 0 : done * 100 / total) + " %");
                    }

                    @Override
                    public boolean cancelled() {
                        return isCancelled();
                    }
                });
            }

            @Override
            public void done(List<ObdApi.Module> list) {
                modules = list;
                render();
            }
        }.start(act, "Steuergeräte werden gesucht …");
    }

    private void render() {
        Context c = act;
        results.removeAllViews();
        if (modules.isEmpty()) {
            results.addView(act.emptyText("Noch keine Steuergeräte gefunden. Scan starten."));
            return;
        }
        results.addView(Ui.section(c, modules.size() + " Steuergeräte gefunden – antippen für Aktionen"));
        for (final ObdApi.Module m : modules) {
            LinearLayout card = Ui.card(c);
            card.addView(Ui.text(c, m.name.isEmpty() ? "Steuergerät" : m.name, 16, Ui.TEXT, true));
            card.addView(Ui.hint(c, m.label()));
            card.setClickable(true);
            card.setForeground(c.getDrawable(android.R.drawable.list_selector_background));
            card.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    actions(m);
                }
            });
            Ui.add(results, card, 8);
        }
    }

    private void actions(final ObdApi.Module m) {
        String[] items = {"Fehlerspeicher lesen", "Fehlerspeicher löschen", "Identifikation lesen"};
        new AlertDialog.Builder(act).setTitle(m.name.isEmpty() ? "Steuergerät 0x" + m.request : m.name)
                .setItems(items, new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which) {
                        if (which == 0) readDtcs(m);
                        else if (which == 1) clear(m);
                        else ident(m);
                    }
                }).show();
    }

    private void readDtcs(final ObdApi.Module m) {
        if (!act.requireConnection()) return;
        new Job<List<Dtc>>() {
            @Override
            public List<Dtc> run() throws Exception {
                return Session.api().moduleDtcs(m);
            }

            @Override
            public void done(List<Dtc> list) {
                LinearLayout box = Ui.vbox(act);
                if (list.isEmpty()) {
                    TextView t = Ui.body(act, "Keine Fehler gespeichert. ✓");
                    t.setTextColor(Ui.GREEN);
                    box.addView(t);
                }
                for (Dtc d : list) Ui.add(box, DtcScreen.dtcCard(act, d), 8);
                act.showView(m.name.isEmpty() ? "Fehler 0x" + m.request : m.name, box);
            }
        }.start(act, "Fehlerspeicher wird gelesen …");
    }

    private void clear(final ObdApi.Module m) {
        if (!act.requireConnection()) return;
        act.confirm("Fehlerspeicher löschen?", "Fehlerspeicher von „" + (m.name.isEmpty() ? "0x" + m.request : m.name)
                + "“ löschen? Zündung an, Motor aus. Ursache vorher beheben – sonst kommt der Fehler wieder.", "Löschen",
                new Runnable() {
                    @Override
                    public void run() {
                        new Job<String>() {
                            @Override
                            public String run() throws Exception {
                                return Session.api().moduleClear(m);
                            }

                            @Override
                            public void done(String msg) {
                                act.alert("Fehler löschen", msg);
                            }
                        }.start(act, "Fehlerspeicher wird gelöscht …");
                    }
                });
    }

    private void ident(final ObdApi.Module m) {
        if (!act.requireConnection()) return;
        new Job<Map<String, String>>() {
            @Override
            public Map<String, String> run() throws Exception {
                return Session.api().moduleIdent(m);
            }

            @Override
            public void done(Map<String, String> map) {
                LinearLayout box = Ui.vbox(act);
                if (map.isEmpty()) box.addView(Ui.body(act, "Keine Identifikationsdaten verfügbar."));
                for (Map.Entry<String, String> e : map.entrySet()) box.addView(Ui.kv(act, e.getKey(), e.getValue()));
                box.addView(Ui.kv(act, "Anfrage-/Antwort-ID", m.ext ? "29 Bit, 0x" + m.request : "0x" + m.request + " / 0x" + m.response));
                act.showView("Identifikation", box);
            }
        }.start(act, "Identifikation wird gelesen …");
    }
}
