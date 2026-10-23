package de.obdwerkstatt.ui;

import android.content.Context;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;

import java.util.List;

import de.obdwerkstatt.core.DtcDatabase;
import de.obdwerkstatt.core.ObdApi;
import de.obdwerkstatt.core.PidTable;

public final class FreezeScreen extends Screen {
    private LinearLayout results;
    private boolean readOnce;

    @Override
    public String title() {
        return "Freeze Frame";
    }

    @Override
    protected View create() {
        Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);
        page.addView(Ui.primary(c, "Freeze Frame lesen", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                read();
            }
        }));
        Ui.add(page, Ui.hint(c, "Momentaufnahme der Betriebsdaten in dem Moment, in dem der Fehler gespeichert "
                + "wurde (Modus 02). Hilft, Fehlerbedingungen nachzustellen."), 10);
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
        new Job<List<ObdApi.FreezeValue>>() {
            @Override
            public List<ObdApi.FreezeValue> run() throws Exception {
                return Session.api().readFreezeFrame();
            }

            @Override
            public void done(List<ObdApi.FreezeValue> list) {
                results.removeAllViews();
                if (list.isEmpty()) {
                    results.addView(act.emptyText("Keine Freeze-Frame-Daten gespeichert."));
                    return;
                }
                LinearLayout card = Ui.card(act);
                for (ObdApi.FreezeValue v : list) {
                    if (v.pid == 0x02) {
                        card.addView(Ui.kv(act, "Auslösender Fehler", v.value));
                        if (v.value.length() == 5) card.addView(Ui.hint(act, DtcDatabase.describe(v.value)));
                        card.addView(Ui.divider(act));
                    } else {
                        card.addView(Ui.kv(act, PidTable.name(v.pid), v.value));
                    }
                }
                results.addView(card);
            }
        }.start(act, "Freeze Frame wird gelesen …");
    }
}
