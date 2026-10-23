package de.obdwerkstatt.ui;

import android.content.Context;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import de.obdwerkstatt.core.ObdApi;

public final class ReadinessScreen extends Screen {
    private LinearLayout results;
    private boolean readOnce;

    @Override
    public String title() {
        return "Readiness";
    }

    @Override
    protected View create() {
        Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);
        page.addView(Ui.primary(c, "Prüfbereitschaft lesen", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                read();
            }
        }));
        Ui.add(page, Ui.hint(c, "Readiness-Codes zeigen, ob die Eigendiagnosen seit dem letzten Fehlerlöschen "
                + "abgeschlossen wurden. Für AU/HU sollten alle unterstützten Tests abgeschlossen sein. "
                + "Nach dem Löschen sind sie erst nach einigen Fahrten (Kaltstart, Landstraße, Leerlauf) wieder fertig."), 10);
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
        new Job<ObdApi.Readiness>() {
            @Override
            public ObdApi.Readiness run() throws Exception {
                return Session.api().readiness();
            }

            @Override
            public void done(ObdApi.Readiness r) {
                Session.lastReadiness = r;
                render(r);
            }
        }.start(act, "Lese Prüfbereitschaft …");
    }

    private void render(ObdApi.Readiness r) {
        Context c = act;
        results.removeAllViews();
        if (r == null) {
            results.addView(act.emptyText("Fahrzeug liefert keine Readiness-Daten."));
            return;
        }
        LinearLayout head = Ui.card(c);
        TextView mil = Ui.title(c, r.mil ? "Motorkontrollleuchte AN" : "Motorkontrollleuchte aus");
        mil.setTextColor(r.mil ? Ui.RED : Ui.GREEN);
        head.addView(mil);
        int total = 0, done = 0;
        for (ObdApi.Monitor m : r.monitors) {
            if (!m.supported) continue;
            total++;
            if (m.complete) done++;
        }
        Ui.add(head, Ui.body(c, done + " von " + total + " Tests abgeschlossen  •  "
                + (r.diesel ? "Dieselmotor" : "Ottomotor") + "  •  " + r.dtcCount + " Fehler"), 4);
        TextView verdict = Ui.text(c, done == total ? "✓ Bereit für die Abgasuntersuchung"
                : "✗ Noch nicht alle Tests abgeschlossen", 15, done == total ? Ui.GREEN : Ui.YELLOW, true);
        Ui.add(head, verdict, 6);
        results.addView(head);

        LinearLayout list = Ui.card(c);
        for (ObdApi.Monitor m : r.monitors) {
            LinearLayout row = Ui.hbox(c);
            row.setPadding(0, Ui.dp(c, 7), 0, Ui.dp(c, 7));
            row.addView(Ui.body(c, m.name), new LinearLayout.LayoutParams(0, -2, 1));
            if (!m.supported) row.addView(Ui.badge(c, "nicht vorhanden", Ui.CARD2));
            else if (m.complete) row.addView(Ui.badge(c, "✓ fertig", Ui.GREEN));
            else row.addView(Ui.badge(c, "✗ offen", Ui.YELLOW));
            list.addView(row);
        }
        Ui.add(results, list, 8);
    }
}
