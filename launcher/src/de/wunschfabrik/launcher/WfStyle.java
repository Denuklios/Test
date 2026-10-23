package de.wunschfabrik.launcher;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;

/** Farben und Schriften wie in der Wunsch-Fabrik-Auftrags-App (auftraege/assets/app.css). */
public final class WfStyle {
    private WfStyle() {}

    public static final int BG = 0xFF090909;
    public static final int SURFACE = 0xFF100E14;
    public static final int SURFACE2 = 0xFF17131F;
    public static final int SURFACE3 = 0xFF1F1A2B;
    public static final int INPUT = 0xFF0C0A11;
    public static final int NAV = 0xF50D0B12;
    public static final int LINE = 0x38A855F7;
    public static final int LINE_STRONG = 0x80A855F7;
    public static final int P1 = 0xFF8B2BE2;
    public static final int P2 = 0xFFA855F7;
    public static final int P3 = 0xFFC9A0FF;
    public static final int TEXT = 0xFFEFEAF6;
    public static final int MUTED = 0xFF9D94AD;
    public static final int FAINT = 0xFF6B6479;

    private static Typeface head, body, bodyMedium;

    /** Cormorant Garamond 600 – Überschriften und Uhr. */
    public static Typeface head(Context c) {
        if (head == null) head = load(c, "fonts/cormorant_600.ttf", Typeface.SERIF);
        return head;
    }

    /** Outfit 400 – Fließtext. */
    public static Typeface body(Context c) {
        if (body == null) body = load(c, "fonts/outfit_400.ttf", Typeface.SANS_SERIF);
        return body;
    }

    /** Outfit 500 – Beschriftungen. */
    public static Typeface bodyMedium(Context c) {
        if (bodyMedium == null) bodyMedium = load(c, "fonts/outfit_500.ttf", Typeface.SANS_SERIF);
        return bodyMedium;
    }

    private static Typeface load(Context c, String path, Typeface fallback) {
        try { return Typeface.createFromAsset(c.getAssets(), path); } catch (Exception e) { return fallback; }
    }

    /** Karte: Verlauf surface2→surface mit violetter Linie. */
    public static GradientDrawable card(float radiusPx, float density) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{SURFACE2, SURFACE});
        g.setCornerRadius(radiusPx);
        g.setStroke(Math.max(1, (int) density), LINE);
        return g;
    }

    /** Runder Knopf mit Verlauf p1→p2 wie der „+“-Knopf der Auftrags-App. */
    public static GradientDrawable fab() {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{P1, P2});
        g.setShape(GradientDrawable.OVAL);
        return g;
    }

    /** Hintergrund: fast schwarz mit violettem Schimmer oben rechts. */
    public static Drawable background(int width, int height) {
        GradientDrawable base = new GradientDrawable();
        base.setColor(BG);
        GradientDrawable glow = new GradientDrawable();
        glow.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        glow.setColors(new int[]{0x338B2BE2, 0x00090909});
        glow.setGradientCenter(0.85f, 0f);
        glow.setGradientRadius(Math.max(width, height) * 0.75f);
        return new LayerDrawable(new Drawable[]{base, glow});
    }
}
