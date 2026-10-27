package de.obdwerkstatt.ui;

import android.content.Context;
import android.graphics.Typeface;
import android.view.View;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import de.obdwerkstatt.core.AdapterTest;

/** Liest alle Informationen und Fähigkeiten des OBD-Adapters aus. */
public final class AdapterScreen extends Screen {
    private LinearLayout results;
    private CheckBox withVehicle;
    private AdapterTest last;

    @Override
    public String title() {
        return "Adapter-Test";
    }

    @Override
    protected View create() {
        Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);
        page.addView(Ui.primary(c, "Adapter-Test starten", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                run();
            }
        }));
        withVehicle = new CheckBox(c);
        withVehicle.setText("Auch alle Fahrzeugprotokolle testen (dauert bis zu 2 Minuten)");
        withVehicle.setTextColor(Ui.TEXT);
        withVehicle.setChecked(true);
        Ui.add(page, withVehicle, 8);
        Ui.add(page, Ui.hint(c, "Ermittelt Typ und Version des Adapters, ob es ein Nachbau ist, die Spannung, "
                + "die Antwortzeit und welche Befehle er beherrscht – und damit, welche Funktionen der App möglich "
                + "sind. Der Bericht enthält ein vollständiges Befehlsprotokoll zur Fehlersuche."), 6);
        results = Ui.vbox(c);
        Ui.add(page, results, 12);
        return h[0];
    }

    private void run() {
        if (!act.requireConnection()) return;
        final boolean vehicle = withVehicle.isChecked();
        new Job<AdapterTest>() {
            @Override
            public AdapterTest run() throws Exception {
                final AdapterTest t = new AdapterTest(Session.elm);
                t.run(vehicle, new AdapterTest.Progress() {
                    @Override
                    public void update(String text) {
                        progress(text);
                    }

                    @Override
                    public boolean cancelled() {
                        return isCancelled();
                    }
                });
                return t;
            }

            @Override
            public void done(AdapterTest t) {
                last = t;
                render();
            }

            @Override
            public void failed(Exception e) {
                super.failed(e);
                if (Session.elm != null) {
                    results.removeAllViews();
                    results.addView(protocolButton(Session.elm.transcript()));
                }
            }
        }.start(act, "Adapter-Test läuft …");
    }

    private void render() {
        Context c = act;
        results.removeAllViews();
        LinearLayout head = Ui.card(c);
        head.addView(Ui.title(c, "Ergebnis"));
        Ui.add(head, Ui.body(c, last.verdict), 4);
        results.addView(head);

        LinearLayout list = Ui.card(c);
        int[] colors = {Ui.GREEN, Ui.YELLOW, Ui.RED, Ui.TEXT2};
        String[] marks = {"✓", "!", "✗", "•"};
        for (AdapterTest.Row r : last.rows) {
            LinearLayout row = Ui.hbox(c);
            row.setPadding(0, Ui.dp(c, 5), 0, Ui.dp(c, 5));
            TextView m = Ui.text(c, marks[r.status], 16, colors[r.status], true);
            m.setMinWidth(Ui.dp(c, 22));
            row.addView(m);
            LinearLayout tv = Ui.vbox(c);
            tv.addView(Ui.hint(c, r.name));
            TextView val = Ui.text(c, r.value, 14, r.status == AdapterTest.FAIL ? Ui.RED : Ui.TEXT, true);
            val.setTextIsSelectable(true);
            tv.addView(val);
            row.addView(tv, new LinearLayout.LayoutParams(0, -2, 1));
            list.addView(row);
        }
        Ui.add(results, list, 8);
        Ui.add(results, Ui.primary(c, "Bericht teilen", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                act.share("OBD-Adapter-Test", last.report());
            }
        }), 12);
        Ui.add(results, protocolButton(Session.elm == null ? "" : Session.elm.transcript()), 8);
    }

    private View protocolButton(final String transcript) {
        return Ui.secondary(act, "Befehlsprotokoll anzeigen", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                TextView t = Ui.text(act, transcript.isEmpty() ? "(leer)" : transcript, 11, Ui.TEXT, false);
                t.setTypeface(Typeface.MONOSPACE);
                t.setTextIsSelectable(true);
                act.showView("Befehlsprotokoll", t);
            }
        });
    }
}
