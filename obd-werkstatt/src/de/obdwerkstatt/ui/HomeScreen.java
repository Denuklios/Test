package de.obdwerkstatt.ui;

import android.content.Context;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public final class HomeScreen extends Screen {
    private TextView connTitle, connInfo;
    private LinearLayout connButtons;

    @Override
    public String title() {
        return "OBD Werkstatt";
    }

    @Override
    protected View create() {
        final Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);

        LinearLayout card = Ui.card(c);
        connTitle = Ui.title(c, "");
        connInfo = Ui.hint(c, "");
        card.addView(connTitle);
        Ui.add(card, connInfo, 4);
        connButtons = Ui.hbox(c);
        Ui.add(card, connButtons, 12);
        page.addView(card);

        Ui.add(page, Ui.section(c, "Diagnose"), 20);
        addTiles(page, new Object[][]{
                {"Fehlerspeicher", "Lesen & löschen", new DtcScreen()},
                {"Live-Daten", "Messwerte & Aufzeichnung", new LiveScreen()},
                {"Freeze Frame", "Umgebungsdaten zum Fehler", new FreezeScreen()},
                {"Readiness", "Prüfbereitschaft (AU/HU)", new ReadinessScreen()},
        });
        Ui.add(page, Ui.section(c, "Werkstatt"), 20);
        addTiles(page, new Object[][]{
                {"Steuergeräte", "ABS, Airbag … (UDS-Scan)", new ModulesScreen()},
                {"Fahrzeugdaten", "FIN, Kalibrierung, km", new InfoScreen()},
                {"Prüfergebnisse", "Modus 06, Aussetzer", new Mode06Screen()},
                {"Terminal", "Eigene Befehle senden", new TerminalScreen()},
        });
        Ui.add(page, Ui.section(c, "Werkzeuge"), 20);
        addTiles(page, new Object[][]{
                {"Adapter-Test", "Was kann mein OBD-Stecker?", new AdapterScreen()},
                {"Fehlercode-Suche", "Code nachschlagen", new LookupScreen()},
                {"Bericht", "Diagnosebericht teilen", null},
        });
        Ui.add(page, Ui.hint(c, "Hinweis: Fehler nur bei stehendem Fahrzeug und Zündung an (Motor aus) löschen. "
                + "Nach dem Löschen sind die Readiness-Tests zurückgesetzt."), 20);
        refresh();
        return h[0];
    }

    private void addTiles(LinearLayout page, Object[][] items) {
        Context c = act;
        for (int i = 0; i < items.length; i += 2) {
            View a = tile(items[i]);
            View b = i + 1 < items.length ? tile(items[i + 1]) : new View(c);
            Ui.add(page, Ui.row(c, a, b), 8);
        }
    }

    private View tile(final Object[] item) {
        Context c = act;
        LinearLayout t = Ui.card(c);
        t.setMinimumHeight(Ui.dp(c, 84));
        t.setGravity(Gravity.CENTER_VERTICAL);
        t.addView(Ui.text(c, (String) item[0], 16, Ui.TEXT, true));
        Ui.add(t, Ui.hint(c, (String) item[1]), 2);
        t.setClickable(true);
        t.setForeground(c.getDrawable(android.R.drawable.list_selector_background));
        t.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (item[2] == null) {
                    Report.share(act);
                    return;
                }
                Screen s = (Screen) item[2];
                act.push(s);
            }
        });
        return t;
    }

    private void refresh() {
        if (connTitle == null) return;
        Context c = act;
        connButtons.removeAllViews();
        if (Session.connected()) {
            boolean adapterOnly = Session.elm != null && !Session.elm.vehicleOk;
            connTitle.setText(adapterOnly ? "● Nur Adapter verbunden" : "● Verbunden");
            connTitle.setTextColor(adapterOnly ? Ui.YELLOW : Ui.GREEN);
            StringBuilder sb = new StringBuilder();
            sb.append(Session.transport.describe());
            if (Session.elm != null && !Session.elm.vehicleOk) {
                sb.append("\nDas Fahrzeug antwortet nicht – Zündung an? Adapter-Test und Terminal sind nutzbar.");
            } else if (Session.elm != null) {
                sb.append("\nProtokoll: ").append(Session.elm.protocolDesc);
                sb.append("\nAdapter: ").append(Session.elm.version);
            }
            if (Session.lastVoltage != null) sb.append("\nBatteriespannung: ").append(Session.lastVoltage);
            connInfo.setText(sb.toString());
            connButtons.addView(Ui.secondary(c, "Trennen", new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    act.disconnect();
                }
            }));
        } else {
            connTitle.setText("○ Nicht verbunden");
            connTitle.setTextColor(Ui.TEXT);
            connInfo.setText("OBD-Adapter in die Diagnosebuchse stecken (meist unter dem Lenkrad), "
                    + "Zündung einschalten und verbinden.");
            final String last = act.prefs().getString("last_label", null);
            View connect = Ui.primary(c, "Verbinden", new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    act.push(new ConnectScreen());
                }
            });
            if (last != null) {
                View quick = Ui.secondary(c, "Erneut: " + last, new View.OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        ConnectScreen.reconnectLast(act);
                    }
                });
                connButtons.addView(Ui.row(c, connect, quick), new LinearLayout.LayoutParams(-1, -2));
            } else {
                connButtons.addView(connect, new LinearLayout.LayoutParams(-1, -2));
            }
        }
    }

    @Override
    public void onShow() {
        refresh();
    }

    @Override
    public void onConnectionChanged() {
        refresh();
    }
}
