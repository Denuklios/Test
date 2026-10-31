package de.funkgeraet.walkie;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

/** Das gezeichnete Funkgerät: LCD-Display mit Oszilloskop, leuchtender Sprechknopf, Teilnehmer-LEDs. */
public class RadioView extends View {
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
    private final Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rect = new RectF();
    private final Path path = new Path();
    private final float[] history = new float[90];
    private int histPos;
    private long lastSample;
    private float smoothLevel, colorMix, pressAnim;
    private int shownColor = Art.CYAN;
    private boolean pressed;
    private final float dp;
    private Shader bgShader, vignette;
    private final long t0 = SystemClock.elapsedRealtime();

    public RadioView(Context c, AttributeSet a) {
        super(c, a);
        dp = getResources().getDisplayMetrics().density;
        // Weichzeichner (Leuchten) kann die Grafikkarte erst ab Android 9
        if (android.os.Build.VERSION.SDK_INT < 28) setLayerType(LAYER_TYPE_SOFTWARE, null);
    }

    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        bgShader = new LinearGradient(0, 0, 0, h, new int[] { 0xff070a10, 0xff0d1420, 0xff05070b }, null, Shader.TileMode.CLAMP);
        vignette = new RadialGradient(w / 2f, h * 0.55f, Math.max(w, h) * 0.75f, 0x00000000, 0xcc000000, Shader.TileMode.CLAMP);
    }

    private float orbX() { return getWidth() / 2f; }
    private float orbY() { return getHeight() * 0.6f; }
    private float orbR() { return Math.min(getWidth() * 0.33f, getHeight() * 0.19f); }

    @SuppressLint("ClickableViewAccessibility")
    @Override
    public boolean onTouchEvent(MotionEvent e) {
        RadioService s = RadioService.instance;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                float dx = e.getX() - orbX(), dy = e.getY() - orbY();
                if (s != null && Math.hypot(dx, dy) < orbR() * 1.25f) {
                    pressed = true;
                    performHapticFeedback(HAPTIC_FEEDBACK_ENABLED);
                    s.setTalking(true);
                    return true;
                }
                return false;
            }
            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (pressed) { pressed = false; if (s != null) s.setTalking(false); }
                return true;
            default:
                return true;
        }
    }

    public void release() {
        RadioService s = RadioService.instance;
        if (pressed) { pressed = false; if (s != null) s.setTalking(false); }
    }

    @Override
    protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight();
        float time = (SystemClock.elapsedRealtime() - t0) / 1000f;
        RadioService s = RadioService.instance;

        boolean connected = s != null && s.connected;
        boolean tx = s != null && s.talking;
        String sp = s == null ? null : s.speakerName();
        boolean rx = !tx && sp != null;
        int target = tx ? Art.RED : rx ? Art.GREEN : connected ? Art.CYAN : Art.AMBER;
        if (target != shownColor) { colorMix += 0.12f; if (colorMix >= 1) { shownColor = target; colorMix = 0; } }
        int color = colorMix > 0 ? Art.mix(shownColor, target, colorMix) : shownColor;

        float lvl = s == null ? 0 : s.currentLevel();
        smoothLevel += (lvl - smoothLevel) * (lvl > smoothLevel ? 0.5f : 0.12f);
        long now = SystemClock.elapsedRealtime();
        if (now - lastSample > 33) { history[histPos] = smoothLevel; histPos = (histPos + 1) % history.length; lastSample = now; }
        pressAnim += ((pressed || tx ? 1 : 0) - pressAnim) * 0.25f;

        // ---------- Hintergrund ----------
        p.reset(); p.setAntiAlias(true);
        p.setShader(bgShader);
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);
        // Raster
        p.setColor(Art.alpha(color, 0.06f));
        p.setStrokeWidth(1);
        float grid = 28 * dp;
        float off = (time * 6 * dp) % grid;
        for (float x = -grid + off; x < w; x += grid) c.drawLine(x, 0, x, h, p);
        for (float y = -grid + off; y < h; y += grid) c.drawLine(0, y, w, y, p);
        // Lichtschein hinter dem Knopf
        p.setShader(new RadialGradient(orbX(), orbY(), orbR() * 3.2f, Art.alpha(color, 0.18f + 0.2f * smoothLevel), 0, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(vignette);
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);

        // ---------- Kopfzeile ----------
        float pad = 18 * dp;
        t.reset(); t.setAntiAlias(true);
        t.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        t.setLetterSpacing(0.35f);
        t.setTextSize(12 * dp);
        t.setColor(0xccdbe6f5);
        c.drawText("FUNKGERÄT", pad, pad + 10 * dp, t);
        // LED
        float blink = connected ? (0.55f + 0.45f * (float) Math.sin(time * (tx || rx ? 14 : 3))) : (time % 1 < 0.5f ? 1 : 0.2f);
        float ledX = w - pad - 6 * dp, ledY = pad + 6 * dp;
        p.setShader(new RadialGradient(ledX, ledY, 16 * dp, Art.alpha(color, 0.7f * blink), 0, Shader.TileMode.CLAMP));
        c.drawCircle(ledX, ledY, 16 * dp, p);
        p.setShader(null);
        p.setColor(Art.alpha(Art.mix(color, Color.WHITE, 0.3f), 0.4f + 0.6f * blink));
        c.drawCircle(ledX, ledY, 5 * dp, p);
        // Empfangsbalken
        int members = s == null ? 0 : s.members.size();
        int bars = !connected ? 0 : Math.min(5, 2 + members);
        for (int i = 0; i < 5; i++) {
            float bx = ledX - 26 * dp - (4 - i) * 7 * dp, bh = (4 + i * 3) * dp;
            p.setColor(i < bars ? Art.alpha(color, 0.95f) : 0x33ffffff);
            rect.set(bx, ledY + 6 * dp - bh, bx + 4.5f * dp, ledY + 6 * dp);
            c.drawRoundRect(rect, 1.5f * dp, 1.5f * dp, p);
        }

        // ---------- LCD-Display ----------
        float lx = pad, ly = pad + 26 * dp, lw = w - 2 * pad, lh = Math.min(h * 0.27f, 200 * dp);
        rect.set(lx, ly, lx + lw, ly + lh);
        // Gehäuserahmen
        p.setShader(new LinearGradient(0, ly, 0, ly + lh, 0xff2a3240, 0xff10141b, Shader.TileMode.CLAMP));
        c.drawRoundRect(rect, 18 * dp, 18 * dp, p);
        rect.inset(5 * dp, 5 * dp);
        p.setShader(new LinearGradient(0, rect.top, 0, rect.bottom,
            Art.mix(color, 0xff000000, 0.86f), Art.mix(color, 0xff000000, 0.94f), Shader.TileMode.CLAMP));
        c.drawRoundRect(rect, 14 * dp, 14 * dp, p);
        p.setShader(null);
        // Leuchtrand
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(1.5f * dp);
        p.setMaskFilter(new BlurMaskFilter(6 * dp, BlurMaskFilter.Blur.SOLID));
        p.setColor(Art.alpha(color, 0.55f));
        c.drawRoundRect(rect, 14 * dp, 14 * dp, p);
        p.setMaskFilter(null);
        p.setStyle(Paint.Style.FILL);

        c.save();
        c.clipRect(rect);
        float ix = rect.left + 14 * dp, iw = rect.width() - 28 * dp;
        // Zeile 1: Kanal
        t.reset(); t.setAntiAlias(true);
        t.setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD));
        t.setTextSize(11 * dp);
        t.setLetterSpacing(0.15f);
        t.setColor(Art.alpha(color, 0.7f));
        c.drawText("CH", ix, rect.top + 22 * dp, t);
        String chan = s == null ? "" : s.channel.toUpperCase();
        t.setTextSize(20 * dp);
        t.setLetterSpacing(0.08f);
        while (t.measureText(chan) > iw - 90 * dp && t.getTextSize() > 10 * dp) t.setTextSize(t.getTextSize() - dp);
        t.setColor(Art.mix(color, Color.WHITE, 0.45f));
        t.setShadowLayer(8 * dp, 0, 0, color);
        c.drawText(chan, ix + 28 * dp, rect.top + 24 * dp, t);
        // Modus-Kästchen rechts
        String mode = tx ? "TX" : rx ? "RX" : connected ? "STBY" : "SYNC";
        t.setTextSize(12 * dp);
        t.setLetterSpacing(0.1f);
        float mw = t.measureText(mode) + 14 * dp;
        RectF mr = new RectF(rect.right - 14 * dp - mw, rect.top + 9 * dp, rect.right - 14 * dp, rect.top + 29 * dp);
        p.setColor(tx || rx ? Art.alpha(color, 0.9f) : Art.alpha(color, 0.18f));
        c.drawRoundRect(mr, 4 * dp, 4 * dp, p);
        t.clearShadowLayer();
        t.setColor(tx || rx ? Color.BLACK : Art.mix(color, Color.WHITE, 0.3f));
        t.setTextAlign(Paint.Align.CENTER);
        c.drawText(mode, mr.centerX(), mr.bottom - 5.5f * dp, t);
        t.setTextAlign(Paint.Align.LEFT);

        // Zeile 2: Zustand
        String line = s == null ? "AUS" : tx ? "● DU SENDEST" : rx ? "◄ " + sp.toUpperCase() + " SPRICHT" : s.statusLine().toUpperCase();
        t.setTextSize(15 * dp);
        t.setLetterSpacing(0.06f);
        while (t.measureText(line) > iw && t.getTextSize() > 9 * dp) t.setTextSize(t.getTextSize() - dp);
        t.setColor(Art.mix(color, Color.WHITE, 0.25f));
        t.setShadowLayer(6 * dp, 0, 0, color);
        boolean show = !(tx || rx) || (time * 2.2f) % 1 < 0.78f;
        if (show) c.drawText(line, ix, rect.top + 50 * dp, t);
        t.clearShadowLayer();

        // Oszilloskop
        float oTop = rect.top + 60 * dp, oBot = rect.bottom - 10 * dp, oMid = (oTop + oBot) / 2, oAmp = (oBot - oTop) / 2;
        p.setColor(Art.alpha(color, 0.12f));
        p.setStrokeWidth(1);
        for (int i = 1; i < 8; i++) { float gx = ix + iw * i / 8f; c.drawLine(gx, oTop, gx, oBot, p); }
        c.drawLine(ix, oMid, ix + iw, oMid, p);
        path.reset();
        int n = 160;
        for (int i = 0; i <= n; i++) {
            float fx = i / (float) n;
            int hi = (histPos + (int) (fx * (history.length - 1))) % history.length;
            float a = history[hi] + 0.04f;
            float y = oMid + (float) (Math.sin(fx * 46 + time * 18) * 0.65 + Math.sin(fx * 113 - time * 31) * 0.35) * a * oAmp;
            if (i == 0) path.moveTo(ix + fx * iw, y); else path.lineTo(ix + fx * iw, y);
        }
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setStrokeWidth(5 * dp);
        p.setColor(Art.alpha(color, 0.25f));
        p.setMaskFilter(new BlurMaskFilter(5 * dp, BlurMaskFilter.Blur.NORMAL));
        c.drawPath(path, p);
        p.setMaskFilter(null);
        p.setStrokeWidth(1.8f * dp);
        p.setColor(Art.mix(color, Color.WHITE, 0.35f));
        c.drawPath(path, p);
        p.setStyle(Paint.Style.FILL);
        // Abtastlinien
        p.setColor(0x22000000);
        for (float y = rect.top; y < rect.bottom; y += 3 * dp) c.drawRect(rect.left, y, rect.right, y + dp, p);
        // Glanz
        p.setShader(new LinearGradient(0, rect.top, 0, rect.top + rect.height() * 0.45f, 0x18ffffff, 0x00ffffff, Shader.TileMode.CLAMP));
        c.drawRect(rect, p);
        p.setShader(null);
        c.restore();

        // ---------- Sprechknopf ----------
        float r = orbR() * (1 - 0.04f * pressAnim);
        String label = s == null ? "AUS" : tx ? "SENDET" : rx ? "EMPFANG" : connected ? "SPRECHEN" : "VERBINDE";
        String sub = s == null ? null : tx ? "loslassen = fertig" : rx ? sp : connected ? "gedrückt halten" : "bitte warten …";
        float phase = (time * (tx ? 0.9f : 0.6f)) % 1f;
        float pulse = (float) Math.sin(time * 2.4f) * 0.5f + 0.5f;
        Art.orb(c, orbX(), orbY(), r, color, phase, tx || rx ? Math.max(smoothLevel, 0.08f) : 0f, tx || rx, pulse, label, sub);

        // ---------- Teilnehmer ----------
        List<String> names = new ArrayList<>();
        List<Boolean> talk = new ArrayList<>();
        if (s != null) {
            names.add(s.name + " (du)"); talk.add(tx);
            for (RadioService.Member m : s.members.values()) { names.add(m.name.isEmpty() ? "Gerät" : m.name); talk.add(m.talking); }
        }
        float chipY = orbY() + orbR() * 1.55f;
        t.reset(); t.setAntiAlias(true);
        t.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        t.setTextSize(13 * dp);
        float cx = pad, chH = 30 * dp;
        float rowW = 0;
        // Zeilen zentrieren: erst Breiten sammeln
        List<float[]> rows = new ArrayList<>();
        float[] cur = new float[] { 0, 0, 0 }; // start index, count, width
        for (int i = 0; i < names.size(); i++) {
            float cw = t.measureText(names.get(i)) + 36 * dp;
            if (cur[1] > 0 && cur[2] + cw > w - 2 * pad) { rows.add(cur); cur = new float[] { i, 0, 0 }; }
            cur[1]++; cur[2] += cw + 8 * dp;
        }
        if (cur[1] > 0) rows.add(cur);
        float y = chipY;
        for (float[] row : rows) {
            cx = (w - (row[2] - 8 * dp)) / 2f;
            for (int i = (int) row[0]; i < row[0] + row[1]; i++) {
                String nm = names.get(i);
                boolean on = talk.get(i);
                int cc = i == 0 ? (tx ? Art.RED : Art.CYAN) : on ? Art.GREEN : 0xff8fa3bf;
                float cw = t.measureText(nm) + 36 * dp;
                rect.set(cx, y, cx + cw, y + chH);
                p.setColor(on ? Art.alpha(cc, 0.22f) : 0x1effffff);
                c.drawRoundRect(rect, chH / 2, chH / 2, p);
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(dp);
                p.setColor(Art.alpha(cc, on ? 0.9f : 0.35f));
                c.drawRoundRect(rect, chH / 2, chH / 2, p);
                p.setStyle(Paint.Style.FILL);
                float led = on ? 0.6f + 0.4f * (float) Math.sin(time * 12) : 1f;
                if (on) {
                    p.setShader(new RadialGradient(cx + 15 * dp, y + chH / 2, 10 * dp, Art.alpha(cc, 0.8f), 0, Shader.TileMode.CLAMP));
                    c.drawCircle(cx + 15 * dp, y + chH / 2, 10 * dp, p);
                    p.setShader(null);
                }
                p.setColor(Art.alpha(cc, led));
                c.drawCircle(cx + 15 * dp, y + chH / 2, 4 * dp, p);
                t.setColor(on ? Color.WHITE : 0xffd6dde8);
                c.drawText(nm, cx + 26 * dp, y + chH / 2 + 4.5f * dp, t);
                cx += cw + 8 * dp;
            }
            y += chH + 8 * dp;
        }

        if (isShown()) postInvalidateOnAnimation();
    }
}
