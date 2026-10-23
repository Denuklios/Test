package de.obdwerkstatt.ui;

import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import de.obdwerkstatt.core.Hex;
import de.obdwerkstatt.core.ObdApi;
import de.obdwerkstatt.core.PidTable;

public final class LiveScreen extends Screen {
    private static final int[] DEFAULT = {0x0C, 0x0D, 0x05, 0x04, 0x11, 0x0F, 0x10, 0x42, 0x0B, 0x5C};

    private final List<Integer> selected = new ArrayList<Integer>();
    private final List<TextView> valueViews = new ArrayList<TextView>();
    private final List<Sparkline> graphs = new ArrayList<Sparkline>();
    private LinearLayout grid;
    private Button startBtn, recBtn;
    private TextView rateView;
    private volatile boolean running;
    private Job<Void> loop;
    private StringBuilder csv;
    private long recStart;

    @Override
    public String title() {
        return "Live-Daten";
    }

    @Override
    protected View create() {
        Context c = act;
        ScrollView[] h = new ScrollView[1];
        LinearLayout page = Ui.page(c, h);
        startBtn = Ui.primary(c, "Start", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (running) stop();
                else start();
            }
        });
        page.addView(Ui.row(c, startBtn, Ui.secondary(c, "Messwerte wählen", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                choose();
            }
        })));
        recBtn = Ui.secondary(c, "● Aufzeichnen (CSV)", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleRecording();
            }
        });
        Ui.add(page, recBtn, 8);
        rateView = Ui.hint(c, "");
        Ui.add(page, rateView, 8);
        grid = Ui.vbox(c);
        Ui.add(page, grid, 4);
        loadSelection();
        buildTiles();
        return h[0];
    }

    private void loadSelection() {
        selected.clear();
        String s = act.prefs().getString("live_pids", null);
        if (s != null && !s.isEmpty()) {
            for (String p : s.split(",")) {
                try {
                    selected.add(Hex.parse(p));
                } catch (NumberFormatException ignored) {
                }
            }
        } else {
            for (int p : DEFAULT) selected.add(p);
        }
    }

    private void saveSelection() {
        StringBuilder sb = new StringBuilder();
        for (int p : selected) {
            if (sb.length() > 0) sb.append(',');
            sb.append(Hex.b(p));
        }
        act.prefs().edit().putString("live_pids", sb.toString()).apply();
    }

    /** Nur unterstützte PIDs anzeigen, wenn bekannt. */
    private List<Integer> effective() {
        List<Integer> r = new ArrayList<Integer>();
        boolean[] sup = null;
        try {
            if (Session.connected()) sup = Session.api().cachedSupported();
        } catch (Exception ignored) {
        }
        for (int p : selected) if (sup == null || sup[p]) r.add(p);
        return r;
    }

    private void buildTiles() {
        Context c = act;
        grid.removeAllViews();
        valueViews.clear();
        graphs.clear();
        final List<Integer> pids = effective();
        if (pids.isEmpty()) {
            grid.addView(act.emptyText("Keine Messwerte gewählt oder vom Fahrzeug unterstützt."));
        }
        LinearLayout row = null;
        for (int i = 0; i < pids.size(); i++) {
            int pid = pids.get(i);
            LinearLayout tile = Ui.card(c);
            tile.addView(Ui.hint(c, PidTable.name(pid)));
            TextView v = Ui.text(c, "–", 24, Ui.TEXT, true);
            v.setSingleLine(true);
            Ui.add(tile, v, 2);
            Sparkline g = new Sparkline(c);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, Ui.dp(c, 36));
            lp.topMargin = Ui.dp(c, 6);
            tile.addView(g, lp);
            if (!PidTable.numeric(pid)) g.setVisibility(View.GONE);
            valueViews.add(v);
            graphs.add(g);
            if (i % 2 == 0) {
                row = Ui.hbox(c);
                row.setBaselineAligned(false);
                Ui.add(grid, row, 8);
            }
            LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, -1, 1);
            if (i % 2 == 1) tlp.leftMargin = Ui.dp(c, 8);
            row.addView(tile, tlp);
            if (i == pids.size() - 1 && i % 2 == 0) row.addView(new View(c), withMargin(c));
        }
    }

    private static LinearLayout.LayoutParams withMargin(Context c) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
        lp.leftMargin = Ui.dp(c, 8);
        return lp;
    }

    private void choose() {
        boolean[] sup = null;
        try {
            if (Session.connected()) sup = Session.api().cachedSupported();
        } catch (Exception ignored) {
        }
        final List<Integer> options = new ArrayList<Integer>();
        for (int p = 1; p < 256; p++) {
            if (!PidTable.known(p) || p == 0x01 || p == 0x02 || p == 0x13 || p == 0x1D || p == 0x41) continue;
            if (sup != null && !sup[p]) continue;
            options.add(p);
        }
        String[] labels = new String[options.size()];
        final boolean[] checked = new boolean[options.size()];
        for (int i = 0; i < options.size(); i++) {
            int p = options.get(i);
            labels[i] = PidTable.name(p) + (PidTable.unit(p).isEmpty() ? "" : " [" + PidTable.unit(p) + "]");
            checked[i] = selected.contains(p);
        }
        new AlertDialog.Builder(act)
                .setTitle(sup == null ? "Messwerte (nicht verbunden: alle)" : "Unterstützte Messwerte")
                .setMultiChoiceItems(labels, checked, new DialogInterface.OnMultiChoiceClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int which, boolean isChecked) {
                        checked[which] = isChecked;
                    }
                })
                .setPositiveButton("Übernehmen", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface d, int w) {
                        boolean wasRunning = running;
                        stop();
                        selected.clear();
                        for (int i = 0; i < options.size(); i++) if (checked[i]) selected.add(options.get(i));
                        saveSelection();
                        buildTiles();
                        if (wasRunning) start();
                    }
                })
                .setNegativeButton("Abbrechen", null).show();
    }

    private void start() {
        if (!act.requireConnection()) return;
        buildTiles();
        final List<Integer> pids = effective();
        if (pids.isEmpty()) return;
        running = true;
        startBtn.setText("Stopp");
        loop = new Job<Void>() {
            @Override
            public Void run() throws Exception {
                ObdApi api = Session.api();
                long t0 = System.currentTimeMillis();
                int cycles = 0;
                while (running && !isCancelled()) {
                    final String[] texts = new String[pids.size()];
                    final Double[] vals = new Double[pids.size()];
                    for (int i = 0; i < pids.size() && running; i++) {
                        int pid = pids.get(i);
                        int[] d = api.readPid(pid);
                        texts[i] = d == null ? "keine Daten" : PidTable.format(pid, d);
                        vals[i] = d == null ? null : PidTable.value(pid, d);
                    }
                    cycles++;
                    final double hz = cycles * 1000.0 / Math.max(1, System.currentTimeMillis() - t0);
                    record(pids, vals, texts);
                    act.runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            update(texts, vals, hz, pids.size());
                        }
                    });
                }
                return null;
            }

            @Override
            public void done(Void v) {
                if (loop != this) return;
                running = false;
                startBtn.setText("Start");
            }

            @Override
            public void failed(Exception e) {
                if (loop != this) return;
                running = false;
                startBtn.setText("Start");
                super.failed(e);
            }
        };
        loop.start(act, null);
    }

    private void update(String[] texts, Double[] vals, double hz, int n) {
        for (int i = 0; i < texts.length && i < valueViews.size(); i++) {
            if (texts[i] == null) continue;
            valueViews.get(i).setText(texts[i]);
            if (vals[i] != null) graphs.get(i).add(vals[i]);
        }
        String rec = csv != null ? "  •  Aufzeichnung läuft (" + (System.currentTimeMillis() - recStart) / 1000 + " s)" : "";
        rateView.setText(String.format(Locale.GERMANY, "%.1f Aktualisierungen/s bei %d Messwerten", hz, n) + rec);
    }

    private void stop() {
        running = false;
        if (loop != null) loop.cancel();
        if (startBtn != null) startBtn.setText("Start");
    }

    // ---------------------------------------------------------------- CSV-Aufzeichnung

    private synchronized void record(List<Integer> pids, Double[] vals, String[] texts) {
        if (csv == null) return;
        if (csv.length() == 0) {
            csv.append("Zeit_s");
            for (int p : pids) csv.append(';').append(PidTable.name(p)).append(" [").append(PidTable.unit(p)).append(']');
            csv.append('\n');
        }
        csv.append(String.format(Locale.GERMANY, "%.2f", (System.currentTimeMillis() - recStart) / 1000.0));
        for (int i = 0; i < pids.size(); i++) {
            csv.append(';');
            if (vals[i] != null) csv.append(PidTable.formatNumber(pids.get(i), vals[i]));
            else if (texts[i] != null) csv.append(texts[i].replace(';', ','));
        }
        csv.append('\n');
        if (csv.length() > 20_000_000) csv = null; // Schutz vor Speicherüberlauf
    }

    private void toggleRecording() {
        if (csv == null) {
            synchronized (this) {
                csv = new StringBuilder();
                recStart = System.currentTimeMillis();
            }
            recBtn.setText("■ Aufzeichnung beenden & speichern");
            recBtn.setBackground(Ui.rounded(act, Ui.RED, 10));
            if (!running) start();
        } else {
            String data;
            synchronized (this) {
                data = csv.toString();
                csv = null;
            }
            recBtn.setText("● Aufzeichnen (CSV)");
            recBtn.setBackground(Ui.rounded(act, Ui.CARD2, 10));
            if (data.isEmpty()) return;
            String name = "obd-log-" + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.GERMANY).format(new Date()) + ".csv";
            act.saveDocument(name, "text/csv", data);
        }
    }

    @Override
    public void onShow() {
        buildTiles();
    }

    @Override
    public void onHide() {
        stop();
    }

    @Override
    public void onConnectionChanged() {
        if (!Session.connected()) stop();
    }
}
