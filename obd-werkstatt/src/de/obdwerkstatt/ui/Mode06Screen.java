package de.obdwerkstatt.ui;

import android.content.Context;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;

import java.util.List;
import java.util.Locale;

import de.obdwerkstatt.core.EcuNames;
import de.obdwerkstatt.core.Mode06Names;
import de.obdwerkstatt.core.ObdApi;

public final class Mode06Screen extends Screen {
    private LinearLayout results;

    @Override
    public String title() {
        return "Prüfergebnisse";
    }

    @Override
    protected View create() {
        Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);
        page.addView(Ui.primary(c, "Prüfergebnisse lesen (Modus 06)", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                read();
            }
        }));
        Ui.add(page, Ui.hint(c, "Ergebnisse der letzten Eigendiagnose: Lambdasonden, Katalysator, "
                + "Zündaussetzer je Zylinder u. a. – mit Grenzwerten. So lassen sich Probleme erkennen, bevor ein "
                + "Fehlercode gespeichert wird."), 10);
        results = Ui.vbox(c);
        Ui.add(page, results, 8);
        return h[0];
    }

    private void read() {
        if (!act.requireConnection()) return;
        new Job<List<ObdApi.TestResult>>() {
            @Override
            public List<ObdApi.TestResult> run() throws Exception {
                return Session.api().readMode06();
            }

            @Override
            public void done(List<ObdApi.TestResult> list) {
                render(list);
            }
        }.start(act, "Prüfergebnisse werden gelesen …");
    }

    private static String fmt(double v) {
        if (Math.abs(v - Math.rint(v)) < 1e-9) return String.valueOf((long) Math.rint(v));
        return String.format(Locale.GERMANY, "%.3f", v);
    }

    private void render(List<ObdApi.TestResult> list) {
        Context c = act;
        results.removeAllViews();
        if (list.isEmpty()) {
            results.addView(act.emptyText("Keine Prüfergebnisse verfügbar."));
            return;
        }
        int lastMid = -1;
        String lastEcu = null;
        LinearLayout card = null;
        for (ObdApi.TestResult r : list) {
            if (r.mid != lastMid || !r.ecu.equals(lastEcu)) {
                lastMid = r.mid;
                lastEcu = r.ecu;
                card = Ui.card(c);
                card.addView(Ui.text(c, Mode06Names.mid(r.mid), 16, Ui.TEXT, true));
                card.addView(Ui.hint(c, EcuNames.name(r.ecu)));
                Ui.add(results, card, 8);
            }
            LinearLayout row = Ui.hbox(c);
            row.setPadding(0, Ui.dp(c, 6), 0, 0);
            String u = Mode06Names.unit(r.uasid);
            LinearLayout texts = Ui.vbox(c);
            texts.addView(Ui.body(c, Mode06Names.tid(r.mid, r.tid)));
            texts.addView(Ui.hint(c, "Wert " + fmt(r.value) + " " + u + "   (Grenzen " + fmt(r.min) + " … " + fmt(r.max) + ")"));
            row.addView(texts, new LinearLayout.LayoutParams(0, -2, 1));
            row.addView(Ui.badge(c, r.passed() ? "OK" : "NICHT OK", r.passed() ? Ui.GREEN : Ui.RED));
            card.addView(row);
        }
    }
}
