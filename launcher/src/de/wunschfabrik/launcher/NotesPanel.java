package de.wunschfabrik.launcher;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.text.InputType;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.format.DateUtils;
import android.text.style.ForegroundColorSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

/** Schnellnotizen: auf dem Startbildschirm nach links wischen. Eine Notiz wird mit einem Tipp zum neuen Auftrag. */
public final class NotesPanel {
    private final Activity act;
    private final Prefs prefs;
    private final float density;
    private final FrameLayout root;
    private final LinearLayout content;
    private final EditText input;
    private final TextView save;
    private final LinearLayout list;
    private final Runnable onClosed;
    private boolean open;
    private long editing = -1;

    public NotesPanel(Activity a, Prefs p, Runnable onClosed) {
        act = a;
        prefs = p;
        this.onClosed = onClosed;
        density = a.getResources().getDisplayMetrics().density;
        root = new FrameLayout(a);
        root.setVisibility(View.GONE);
        root.setClickable(true);
        ScrollView scroll = new ScrollView(a);
        scroll.setFillViewport(true);
        root.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        content = new LinearLayout(a);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content, new FrameLayout.LayoutParams(-1, -2));

        TextView eb = text(11, WfStyle.P2);
        eb.setTypeface(WfStyle.bodyMedium(a));
        eb.setLetterSpacing(0.3f);
        eb.setAllCaps(true);
        eb.setText("Wunsch-Fabrik");
        content.addView(eb);
        TextView h = text(32, WfStyle.TEXT);
        h.setTypeface(WfStyle.head(a));
        SpannableString hs = new SpannableString("Schnellnotiz");
        hs.setSpan(new ForegroundColorSpan(WfStyle.P2), 7, hs.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        h.setText(hs);
        content.addView(h);

        input = new EditText(a);
        input.setHint("Kunde, Motiv, Menge, Termin …");
        input.setHintTextColor(WfStyle.FAINT);
        input.setTextColor(WfStyle.TEXT);
        input.setTypeface(WfStyle.body(a));
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setMinLines(3);
        input.setGravity(Gravity.TOP);
        GradientDrawable ibg = new GradientDrawable();
        ibg.setColor(WfStyle.INPUT);
        ibg.setCornerRadius(dp(12));
        ibg.setStroke(Math.max(1, dp(1)), WfStyle.LINE_STRONG);
        input.setBackground(ibg);
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(-1, -2);
        ilp.topMargin = dp(14);
        content.addView(input, ilp);

        save = button("Speichern", true);
        save.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { saveInput(); }
        });
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(-1, dp(46));
        slp.topMargin = dp(10);
        content.addView(save, slp);

        list = new LinearLayout(a);
        list.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(-1, -2);
        llp.topMargin = dp(18);
        content.addView(list, llp);

        content.addView(new View(a), new LinearLayout.LayoutParams(-1, 0, 1f));
        TextView close = text(13, WfStyle.MUTED);
        close.setText("Nach rechts wischen oder hier tippen zum Schließen  ›");
        close.setGravity(Gravity.CENTER);
        close.setPadding(0, dp(14), 0, dp(14));
        close.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { close(true); }
        });
        content.addView(close);
    }

    public View view() { return root; }
    public boolean isOpen() { return open; }
    public void setBackground(Drawable d) { root.setBackground(d); }

    public void setInsets(int left, int top, int right, int bottom) {
        content.setPadding(dp(16) + left, top + dp(16), dp(16) + right, bottom);
    }

    public void open() {
        if (open) return;
        open = true;
        render();
        root.animate().cancel();
        root.setVisibility(View.VISIBLE);
        root.setAlpha(0f);
        root.setTranslationX(dp(120));
        root.animate().alpha(1f).translationX(0).setDuration(200).setListener(null).start();
    }

    public void close(boolean animate) {
        if (!open) return;
        open = false;
        hideKeyboard();
        root.animate().cancel();
        if (!animate) {
            root.setVisibility(View.GONE);
        } else {
            root.animate().alpha(0f).translationX(dp(120)).setDuration(170)
                    .setListener(new android.animation.AnimatorListenerAdapter() {
                        @Override public void onAnimationEnd(android.animation.Animator an) {
                            if (!open) root.setVisibility(View.GONE);
                        }
                    }).start();
        }
        onClosed.run();
    }

    // ---------- Daten ----------

    private JSONArray load() {
        try { return new JSONArray(prefs.notesJson()); } catch (Exception e) { return new JSONArray(); }
    }

    private void store(JSONArray a) { prefs.setNotesJson(a.toString()); }

    private void saveInput() {
        String t = input.getText().toString().trim();
        if (t.isEmpty()) return;
        JSONArray a = load();
        JSONArray out = new JSONArray();
        try {
            JSONObject n = new JSONObject();
            n.put("id", editing >= 0 ? editing : System.currentTimeMillis());
            n.put("text", t);
            n.put("ts", System.currentTimeMillis());
            out.put(n); // neueste zuerst
            for (int i = 0; i < a.length(); i++) if (a.getJSONObject(i).optLong("id") != editing) out.put(a.getJSONObject(i));
        } catch (Exception ignored) { }
        store(out);
        input.setText("");
        editing = -1;
        save.setText("Speichern");
        hideKeyboard();
        render();
    }

    private void delete(long id) {
        JSONArray a = load(), out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            JSONObject n = a.optJSONObject(i);
            if (n != null && n.optLong("id") != id) out.put(n);
        }
        store(out);
        render();
    }

    private void render() {
        list.removeAllViews();
        JSONArray a = load();
        if (a.length() == 0) {
            TextView t = text(14, WfStyle.MUTED);
            t.setText("Noch keine Notizen. Ideal für Anrufe: schnell notieren, später mit „→ Auftrag“ übernehmen.");
            list.addView(t);
            return;
        }
        for (int i = 0; i < a.length(); i++) {
            JSONObject n = a.optJSONObject(i);
            if (n == null) continue;
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
            lp.bottomMargin = dp(10);
            list.addView(card(n.optLong("id"), n.optString("text"), n.optLong("ts")), lp);
        }
    }

    private View card(final long id, final String txt, long ts) {
        LinearLayout c = new LinearLayout(act);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setBackground(WfStyle.card(dp(16), density));
        c.setPadding(dp(14), dp(12), dp(14), dp(6));
        TextView time = text(11, WfStyle.MUTED);
        time.setText(DateUtils.getRelativeTimeSpanString(ts, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS));
        c.addView(time);
        TextView body = text(15, WfStyle.TEXT);
        body.setText(txt);
        body.setPadding(0, dp(4), 0, dp(4));
        c.addView(body);
        LinearLayout actions = new LinearLayout(act);
        TextView toOrder = action("→ Auftrag");
        toOrder.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { toOrder(txt); }
        });
        actions.addView(toOrder);
        TextView share = action("Teilen");
        share.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                try {
                    act.startActivity(Intent.createChooser(new Intent(Intent.ACTION_SEND).setType("text/plain")
                            .putExtra(Intent.EXTRA_TEXT, txt), "Notiz teilen"));
                } catch (Exception ignored) { }
            }
        });
        actions.addView(share);
        TextView del = action("Löschen");
        del.setTextColor(0xFFF87171);
        del.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                new AlertDialog.Builder(act).setMessage("Notiz löschen?")
                        .setPositiveButton("Löschen", new DialogInterface.OnClickListener() {
                            @Override public void onClick(DialogInterface d, int w) { delete(id); }
                        })
                        .setNegativeButton("Abbrechen", null).show();
            }
        });
        actions.addView(del);
        c.addView(actions);
        c.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                editing = id;
                input.setText(txt);
                input.setSelection(txt.length());
                save.setText("Änderung speichern");
                input.requestFocus();
                ((InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(input, 0);
            }
        });
        return c;
    }

    /** Notiz an die Auftrags-App: sie legt Kunde (falls neu) und Auftrag an und öffnet ihn. Zusätzlich in der Zwischenablage (Rückfall). */
    private void toOrder(String txt) {
        ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("Notiz", txt));
        Toast.makeText(act, "Auftrag wird aus der Notiz angelegt …", Toast.LENGTH_SHORT).show();
        String base = Logic.displayBase(prefs.displayLink(), Tiles.AUFTRAEGE_URL);
        try {
            act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(Logic.noteOrderUrl(base, txt))).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception ignored) { }
    }

    // ---------- Helfer ----------

    private void hideKeyboard() {
        ((InputMethodManager) act.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(), 0);
        input.clearFocus();
    }

    private int dp(float v) { return (int) (v * density + 0.5f); }

    private TextView text(float sp, int color) {
        TextView t = new TextView(act);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(WfStyle.body(act));
        return t;
    }

    private TextView action(String s) {
        TextView t = text(13, WfStyle.P3);
        t.setTypeface(WfStyle.bodyMedium(act));
        t.setText(s);
        t.setPadding(0, dp(10), dp(20), dp(8));
        return t;
    }

    private TextView button(String s, boolean primary) {
        TextView t = text(15, primary ? Color.WHITE : WfStyle.TEXT);
        t.setTypeface(WfStyle.bodyMedium(act));
        t.setText(s);
        t.setGravity(Gravity.CENTER);
        GradientDrawable g = primary
                ? new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{WfStyle.P1, WfStyle.P2})
                : new GradientDrawable();
        if (!primary) { g.setColor(WfStyle.SURFACE3); g.setStroke(Math.max(1, dp(1)), WfStyle.LINE_STRONG); }
        g.setCornerRadius(dp(12));
        t.setBackground(g);
        return t;
    }
}
