package de.obdwerkstatt.ui;

import android.content.Context;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;

import java.util.List;

import de.obdwerkstatt.core.Dtc;
import de.obdwerkstatt.core.DtcDatabase;

public final class LookupScreen extends Screen {
    private LinearLayout results;

    @Override
    public String title() {
        return "Fehlercode-Suche";
    }

    @Override
    protected View create() {
        Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);
        final EditText q = new EditText(c);
        q.setHint("Code (P0301) oder Stichwort (Lambda)");
        q.setTextColor(Ui.TEXT);
        q.setHintTextColor(Ui.TEXT2);
        q.setSingleLine(true);
        q.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        page.addView(q);
        results = Ui.vbox(c);
        Ui.add(page, results, 8);
        q.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int a, int b, int d) {
            }

            @Override
            public void onTextChanged(CharSequence s, int a, int b, int d) {
            }

            @Override
            public void afterTextChanged(Editable e) {
                search(e.toString());
            }
        });
        results.addView(act.emptyText("Die eingebaute Datenbank enthält die genormten Codes (P0xxx, P2xxx, U0xxx …). "
                + "Herstellerspezifische Codes werden ihrem Bereich zugeordnet."));
        return h[0];
    }

    private void search(String s) {
        results.removeAllViews();
        String t = s.trim().toUpperCase();
        if (t.isEmpty()) return;
        if (t.matches("[PCBU][0-9A-F]{4}")) {
            Ui.add(results, DtcScreen.dtcCard(act, new Dtc(t, "", "Suche", "")), 0);
            Ui.add(results, Ui.hint(act, DtcScreen.hint(t)), 8);
            return;
        }
        List<String> hits = DtcDatabase.search(s);
        int n = 0;
        for (String code : hits) {
            if (n++ >= 60) break;
            LinearLayout card = Ui.card(act);
            card.addView(Ui.text(act, code, 16, Ui.ACCENT, true));
            card.addView(Ui.body(act, DtcDatabase.lookup(code)));
            Ui.add(results, card, 6);
        }
        if (hits.isEmpty()) results.addView(act.emptyText("Nichts gefunden."));
        else if (hits.size() > 60) results.addView(act.emptyText("… und " + (hits.size() - 60) + " weitere"));
    }
}
