package de.obdwerkstatt.ui;

import android.content.Context;
import android.graphics.Typeface;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

public final class TerminalScreen extends Screen {
    private TextView log;
    private ScrollView logScroll;
    private EditText input;

    @Override
    public String title() {
        return "Terminal";
    }

    @Override
    protected View create() {
        Context c = act;
        LinearLayout page = Ui.vbox(c);
        int p = Ui.dp(c, 12);
        page.setPadding(p, p, p, p);

        HorizontalScrollView hs = new HorizontalScrollView(c);
        hs.setHorizontalScrollBarEnabled(false);
        LinearLayout chips = Ui.hbox(c);
        String[] quick = {"ATI", "ATRV", "ATDP", "0100", "010C", "03", "07", "0902", "ATZ"};
        for (final String q : quick) {
            View b = Ui.secondary(c, q, new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    send(q);
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
            lp.rightMargin = Ui.dp(c, 6);
            chips.addView(b, lp);
        }
        hs.addView(chips);
        page.addView(hs);

        logScroll = new ScrollView(c);
        log = Ui.text(c, "Befehle werden direkt an den ELM327 gesendet (AT-Befehle oder OBD-Hex, z. B. 010C).\n"
                + "Vorsicht mit Schreib-/Löschdiensten (04, 14, 2E, 31) – nur wenn du weißt, was sie bewirken.\n", 13, Ui.TEXT, false);
        log.setTypeface(Typeface.MONOSPACE);
        log.setTextIsSelectable(true);
        log.setBackground(Ui.rounded(c, Ui.CARD, 10));
        log.setPadding(p, p, p, p);
        logScroll.addView(log);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, 0, 1);
        lp.topMargin = Ui.dp(c, 8);
        page.addView(logScroll, lp);

        LinearLayout bottom = Ui.hbox(c);
        input = new EditText(c);
        input.setSingleLine(true);
        input.setHint("Befehl, z. B. 010C");
        input.setTextColor(Ui.TEXT);
        input.setHintTextColor(Ui.TEXT2);
        input.setTypeface(Typeface.MONOSPACE);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
                | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        input.setImeOptions(EditorInfo.IME_ACTION_SEND);
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView v, int id, KeyEvent e) {
                sendInput();
                return true;
            }
        });
        bottom.addView(input, new LinearLayout.LayoutParams(0, -2, 1));
        View sendBtn = Ui.primary(c, "Senden", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                sendInput();
            }
        });
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(-2, -2);
        blp.leftMargin = Ui.dp(c, 8);
        bottom.addView(sendBtn, blp);
        Ui.add(page, bottom, 8);
        return page;
    }

    private void sendInput() {
        String s = input.getText().toString().trim();
        if (s.isEmpty()) return;
        input.setText("");
        send(s);
    }

    private void append(String s) {
        log.append(s);
        logScroll.post(new Runnable() {
            @Override
            public void run() {
                logScroll.fullScroll(View.FOCUS_DOWN);
            }
        });
    }

    private void send(final String cmd) {
        if (!act.requireConnection()) return;
        append("\n> " + cmd + "\n");
        new Job<String>() {
            @Override
            public String run() throws Exception {
                String r = Session.elm.raw(cmd, 10000).replace("\r\r", "\r").replace('\r', '\n').trim();
                String u = cmd.toUpperCase().replace(" ", "");
                if (u.equals("ATZ") || u.equals("ATD") || u.equals("ATWS")) {
                    // App-Grundeinstellungen (Header an usw.) wiederherstellen
                    Session.elm.restore();
                    r += "\n(App-Einstellungen wiederhergestellt)";
                }
                return r;
            }

            @Override
            public void done(String r) {
                append(r + "\n");
            }

            @Override
            public void failed(Exception e) {
                append("Fehler: " + e.getMessage() + "\n");
            }
        }.start(act, null);
    }
}
