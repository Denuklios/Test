package de.funkgeraet.walkie;

import android.content.Context;
import android.graphics.Canvas;
import android.os.SystemClock;
import android.util.AttributeSet;
import android.view.View;

/** Animierter Leuchtknopf als Blickfang auf dem Startbildschirm der App. */
public class OrbView extends View {
    private final long t0 = SystemClock.elapsedRealtime();

    public OrbView(Context c, AttributeSet a) {
        super(c, a);
        if (android.os.Build.VERSION.SDK_INT < 28) setLayerType(LAYER_TYPE_SOFTWARE, null);
    }

    @Override
    protected void onDraw(Canvas c) {
        float t = (SystemClock.elapsedRealtime() - t0) / 1000f;
        float r = Math.min(getWidth(), getHeight()) * 0.3f;
        float lvl = 0.35f + 0.3f * (float) Math.abs(Math.sin(t * 1.7) * Math.sin(t * 0.6));
        Art.orb(c, getWidth() / 2f, getHeight() / 2f, r, Art.CYAN, (t * 0.45f) % 1f, lvl, true,
            (float) Math.sin(t * 2.4f) * 0.5f + 0.5f, "FUNK", "Walkie-Talkie");
        if (isShown()) postInvalidateOnAnimation();
    }
}
