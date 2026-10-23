package de.obdwerkstatt.ui;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.content.res.ColorStateList;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Kleine Helfer für die programmatisch aufgebaute Oberfläche. */
public final class Ui {
    private Ui() {
    }

    public static final int BG = Color.rgb(0x12, 0x14, 0x18);
    public static final int CARD = Color.rgb(0x1E, 0x22, 0x28);
    public static final int CARD2 = Color.rgb(0x27, 0x2C, 0x34);
    public static final int ACCENT = Color.rgb(0xFF, 0x98, 0x00);
    public static final int RED = Color.rgb(0xEF, 0x53, 0x50);
    public static final int GREEN = Color.rgb(0x66, 0xBB, 0x6A);
    public static final int YELLOW = Color.rgb(0xFF, 0xCA, 0x28);
    public static final int TEXT = Color.rgb(0xEC, 0xEF, 0xF1);
    public static final int TEXT2 = Color.rgb(0x90, 0xA4, 0xAE);

    public static int dp(Context c, float v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    public static GradientDrawable rounded(Context c, int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(c, radiusDp));
        return g;
    }

    public static LinearLayout vbox(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    public static LinearLayout hbox(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    /** Scrollbarer Seiteninhalt mit Innenabstand. */
    public static LinearLayout page(Context c, ScrollView[] holder) {
        ScrollView sv = new ScrollView(c);
        sv.setFillViewport(true);
        LinearLayout l = vbox(c);
        int p = dp(c, 12);
        l.setPadding(p, p, p, dp(c, 24));
        sv.addView(l, new ViewGroup.LayoutParams(-1, -2));
        holder[0] = sv;
        return l;
    }

    public static LinearLayout card(Context c) {
        LinearLayout l = vbox(c);
        l.setBackground(rounded(c, CARD, 12));
        int p = dp(c, 14);
        l.setPadding(p, p, p, p);
        return l;
    }

    public static LinearLayout.LayoutParams gap(Context c, float topDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2);
        lp.topMargin = dp(c, topDp);
        return lp;
    }

    public static void add(LinearLayout parent, View v, float topDp) {
        parent.addView(v, gap(parent.getContext(), topDp));
    }

    public static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    public static TextView title(Context c, String s) {
        return text(c, s, 18, TEXT, true);
    }

    public static TextView body(Context c, String s) {
        return text(c, s, 15, TEXT, false);
    }

    public static TextView hint(Context c, String s) {
        return text(c, s, 13, TEXT2, false);
    }

    public static TextView section(Context c, String s) {
        TextView t = text(c, s.toUpperCase(), 12, ACCENT, true);
        t.setLetterSpacing(0.08f);
        return t;
    }

    public static Button button(Context c, String label, int color, View.OnClickListener l) {
        Button b = new Button(c);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(15);
        b.setTextColor(color == ACCENT || color == YELLOW ? Color.BLACK : TEXT);
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), rounded(c, color, 10), null));
        b.setMinHeight(dp(c, 48));
        int p = dp(c, 12);
        b.setPadding(p, 0, p, 0);
        b.setStateListAnimator(null);
        b.setOnClickListener(l);
        return b;
    }

    public static Button primary(Context c, String label, View.OnClickListener l) {
        return button(c, label, ACCENT, l);
    }

    public static Button secondary(Context c, String label, View.OnClickListener l) {
        return button(c, label, CARD2, l);
    }

    /** Zwei Elemente nebeneinander mit gleicher Breite. */
    public static LinearLayout row(Context c, View... views) {
        LinearLayout r = hbox(c);
        for (int i = 0; i < views.length; i++) {
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1);
            if (i > 0) lp.leftMargin = dp(c, 8);
            r.addView(views[i], lp);
        }
        return r;
    }

    /** Zeile "Bezeichnung …… Wert". */
    public static LinearLayout kv(Context c, String k, String v) {
        LinearLayout r = hbox(c);
        r.setPadding(0, dp(c, 5), 0, dp(c, 5));
        TextView kt = text(c, k, 14, TEXT2, false);
        TextView vt = text(c, v, 14, TEXT, true);
        vt.setGravity(Gravity.END);
        vt.setTextIsSelectable(true);
        r.addView(kt, new LinearLayout.LayoutParams(0, -2, 1));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, -2, 1.2f);
        lp.leftMargin = dp(c, 8);
        r.addView(vt, lp);
        return r;
    }

    public static View divider(Context c) {
        View v = new View(c);
        v.setBackgroundColor(0x22FFFFFF);
        v.setLayoutParams(new LinearLayout.LayoutParams(-1, Math.max(1, dp(c, 1) / 2)));
        return v;
    }

    /** Farbiger Punkt / Abzeichen. */
    public static TextView badge(Context c, String s, int color) {
        TextView t = text(c, s, 12, color == YELLOW || color == ACCENT ? Color.BLACK : Color.WHITE, true);
        t.setBackground(rounded(c, color, 8));
        int p = dp(c, 6);
        t.setPadding(p, dp(c, 2), p, dp(c, 2));
        return t;
    }
}
