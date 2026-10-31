package de.funkgeraet.walkie;

import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.SweepGradient;
import android.graphics.Typeface;

/** Gemeinsame Zeichenroutinen: leuchtender Sprechknopf (App und Widget). */
public final class Art {
    public static final int CYAN = 0xff00e5ff, RED = 0xffff3b3b, GREEN = 0xff39ff88, AMBER = 0xffffb300, GREY = 0xff6b7a90;

    private static final Paint P = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
    private static final Paint T = new Paint(Paint.ANTI_ALIAS_FLAG);
    private static final RectF R = new RectF();

    public static int alpha(int c, float a) {
        return (Math.max(0, Math.min(255, (int) (a * 255))) << 24) | (c & 0xffffff);
    }

    public static int mix(int a, int b, float t) {
        return Color.rgb((int) (Color.red(a) + (Color.red(b) - Color.red(a)) * t),
            (int) (Color.green(a) + (Color.green(b) - Color.green(a)) * t),
            (int) (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t));
    }

    /**
     * Zeichnet den runden Sprechknopf.
     * @param phase  Animationsphase 0..1 (Wellenringe)
     * @param level  Lautstärke 0..1 (Leuchtskala am Rand)
     * @param active Wellenringe zeigen (Senden/Empfang)
     */
    public static void orb(Canvas c, float cx, float cy, float r, int color, float phase, float level,
                           boolean active, float pulse, String label, String sub) {
        P.reset(); P.setAntiAlias(true); P.setDither(true);

        // 1) großer Lichthof
        float glowR = r * (1.55f + 0.08f * pulse + 0.25f * level);
        P.setShader(new RadialGradient(cx, cy, glowR,
            new int[] { alpha(color, 0.55f + 0.25f * level), alpha(color, 0.18f), alpha(color, 0f) },
            new float[] { 0.45f, 0.7f, 1f }, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, glowR, P);
        P.setShader(null);

        // 2) Wellenringe
        if (active) {
            P.setStyle(Paint.Style.STROKE);
            for (int i = 0; i < 4; i++) {
                float t = (phase + i / 4f) % 1f;
                P.setStrokeWidth(r * 0.035f * (1 - t) + 1);
                P.setColor(alpha(color, 0.7f * (1 - t) * (1 - t)));
                c.drawCircle(cx, cy, r * (1.02f + t * 0.75f), P);
            }
            P.setStyle(Paint.Style.FILL);
        }

        // 3) Metallring (Lünette)
        P.setShader(new SweepGradient(cx, cy,
            new int[] { 0xff3a4250, 0xffc9d3e0, 0xff4a5262, 0xff1c222c, 0xffaab4c4, 0xff3a4250, 0xffe8eef6, 0xff3a4250 }, null));
        c.drawCircle(cx, cy, r, P);
        P.setShader(null);
        P.setColor(0xff0b0f16);
        c.drawCircle(cx, cy, r * 0.9f, P);

        // 4) Leuchtskala (60 Striche), Anzahl leuchtender Striche = Lautstärke
        P.setStrokeCap(Paint.Cap.ROUND);
        P.setStrokeWidth(Math.max(2f, r * 0.022f));
        int lit = active ? (int) (60 * Math.max(level, 0.04f)) : 0;
        for (int i = 0; i < 60; i++) {
            double a = Math.toRadians(-90 + i * 6);
            float r1 = r * 0.82f, r2 = r * (i % 5 == 0 ? 0.74f : 0.77f);
            boolean on = i < lit || (!active && i % 5 == 0);
            P.setColor(on ? alpha(color, active ? 1f : 0.45f) : 0x22ffffff);
            c.drawLine(cx + (float) Math.cos(a) * r1, cy + (float) Math.sin(a) * r1,
                cx + (float) Math.cos(a) * r2, cy + (float) Math.sin(a) * r2, P);
        }

        // 5) Kern: leuchtende Kuppel
        float cr = r * 0.66f * (1 + 0.02f * pulse);
        int dark = mix(color, Color.BLACK, 0.78f), mid = mix(color, Color.BLACK, 0.35f), light = mix(color, Color.WHITE, 0.35f);
        P.setShader(new RadialGradient(cx - cr * 0.25f, cy - cr * 0.35f, cr * 1.35f,
            new int[] { light, color, mid, dark }, new float[] { 0f, 0.3f, 0.7f, 1f }, Shader.TileMode.CLAMP));
        c.drawCircle(cx, cy, cr, P);
        P.setShader(null);
        // Innenrand
        P.setStyle(Paint.Style.STROKE);
        P.setStrokeWidth(r * 0.025f);
        P.setColor(alpha(mix(color, Color.WHITE, 0.5f), 0.8f));
        c.drawCircle(cx, cy, cr, P);
        P.setStyle(Paint.Style.FILL);
        // Glanzlicht
        P.setShader(new LinearGradient(0, cy - cr, 0, cy, 0x66ffffff, 0x00ffffff, Shader.TileMode.CLAMP));
        R.set(cx - cr * 0.72f, cy - cr * 0.93f, cx + cr * 0.72f, cy - cr * 0.05f);
        c.drawOval(R, P);
        P.setShader(null);

        // 6) Beschriftung
        T.reset(); T.setAntiAlias(true);
        T.setTextAlign(Paint.Align.CENTER);
        T.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        T.setColor(Color.WHITE);
        T.setLetterSpacing(0.08f);
        float size = r * 0.2f;
        T.setTextSize(size);
        while (T.measureText(label) > cr * 1.7f && size > 8) { size -= 1; T.setTextSize(size); }
        T.setShadowLayer(r * 0.08f, 0, 0, alpha(mix(color, Color.WHITE, 0.3f), 1f));
        c.drawText(label, cx, cy + size * (sub == null ? 0.35f : 0.1f), T);
        if (sub != null) {
            T.setTypeface(Typeface.DEFAULT);
            T.setLetterSpacing(0.04f);
            float s2 = r * 0.085f;
            T.setTextSize(s2);
            while (T.measureText(sub) > cr * 1.75f && s2 > 7) { s2 -= 1; T.setTextSize(s2); }
            T.setShadowLayer(r * 0.04f, 0, 0, Color.BLACK);
            T.setColor(0xe6ffffff);
            c.drawText(sub, cx, cy + size * 0.1f + s2 * 1.9f, T);
        }
        T.clearShadowLayer();
    }

    /** Bild für das Startbildschirm-Widget. */
    public static Bitmap widget(int color, boolean active, String label, String sub, String footer) {
        int s = 360;
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        P.reset(); P.setAntiAlias(true);
        // Glas-Panel
        R.set(6, 6, s - 6, s - 6);
        P.setShader(new LinearGradient(0, 0, 0, s, 0xf2161d29, 0xf2080b11, Shader.TileMode.CLAMP));
        c.drawRoundRect(R, 54, 54, P);
        P.setShader(new RadialGradient(s / 2f, s * 0.45f, s * 0.6f, alpha(color, 0.22f), alpha(color, 0f), Shader.TileMode.CLAMP));
        c.drawRoundRect(R, 54, 54, P);
        P.setShader(null);
        P.setStyle(Paint.Style.STROKE);
        P.setStrokeWidth(5);
        P.setMaskFilter(new BlurMaskFilter(8, BlurMaskFilter.Blur.SOLID));
        P.setColor(alpha(color, 0.85f));
        c.drawRoundRect(R, 54, 54, P);
        P.setMaskFilter(null);
        P.setStyle(Paint.Style.FILL);

        orb(c, s / 2f, s * 0.45f, s * 0.29f, color, 0.15f, active ? 0.75f : 0f, active, 0, label, sub);

        T.reset(); T.setAntiAlias(true);
        T.setTextAlign(Paint.Align.CENTER);
        T.setTypeface(Typeface.MONOSPACE);
        T.setLetterSpacing(0.12f);
        T.setTextSize(24);
        T.setColor(alpha(color, 0.95f));
        T.setShadowLayer(10, 0, 0, color);
        String f = footer.toUpperCase();
        while (T.measureText(f) > s - 50 && T.getTextSize() > 12) T.setTextSize(T.getTextSize() - 1);
        c.drawText(f, s / 2f, s - 30, T);
        T.clearShadowLayer();
        return b;
    }
}
