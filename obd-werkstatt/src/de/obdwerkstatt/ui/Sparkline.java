package de.obdwerkstatt.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/** Kleiner Verlaufsgraph der letzten Messwerte. */
public final class Sparkline extends View {
    private final double[] values = new double[120];
    private int count, head;
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();

    public Sparkline(Context c) {
        super(c);
        line.setColor(Ui.ACCENT);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(Ui.dp(c, 1.6f));
        line.setStrokeJoin(Paint.Join.ROUND);
        fill.setColor(0x33FF9800);
        fill.setStyle(Paint.Style.FILL);
    }

    public void add(double v) {
        values[head] = v;
        head = (head + 1) % values.length;
        if (count < values.length) count++;
        invalidate();
    }

    public void clear() {
        count = 0;
        head = 0;
        invalidate();
    }

    private double at(int i) {
        int start = (head - count + values.length) % values.length;
        return values[(start + i) % values.length];
    }

    @Override
    protected void onDraw(Canvas c) {
        if (count < 2) return;
        double min = Double.MAX_VALUE, max = -Double.MAX_VALUE;
        for (int i = 0; i < count; i++) {
            min = Math.min(min, at(i));
            max = Math.max(max, at(i));
        }
        if (max - min < 1e-6) {
            max += 1;
            min -= 1;
        }
        float w = getWidth(), h = getHeight();
        float pad = line.getStrokeWidth();
        path.reset();
        for (int i = 0; i < count; i++) {
            float x = w * i / (values.length - 1);
            float y = (float) (h - pad - (at(i) - min) / (max - min) * (h - 2 * pad));
            if (i == 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        }
        c.drawPath(path, line);
        path.lineTo(w * (count - 1) / (values.length - 1), h);
        path.lineTo(0, h);
        path.close();
        c.drawPath(path, fill);
    }
}
