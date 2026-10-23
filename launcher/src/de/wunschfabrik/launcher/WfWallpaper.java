package de.wunschfabrik.launcher;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.util.DisplayMetrics;
import android.view.WindowManager;

/**
 * Hintergrundbild fürs ganze Handy: schwarz, violetter Schimmer, WF-Logo.
 * Android 12+ (auch Nothing OS) leitet daraus die Systemfarben ab – Schnellzugriff, Einstellungen, Tastatur werden violett.
 */
public final class WfWallpaper {
    private WfWallpaper() {}

    public static Bitmap create(Context c) {
        DisplayMetrics dm = new DisplayMetrics();
        ((WindowManager) c.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(dm);
        int w = Math.min(dm.widthPixels, dm.heightPixels);
        int h = Math.max(dm.widthPixels, dm.heightPixels);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        cv.drawColor(WfStyle.BG);

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        // Großer Schimmer oben rechts (wie die Auftrags-App), kleinerer unten links.
        p.setShader(new RadialGradient(w * 0.85f, -h * 0.05f, h * 0.6f, 0x998B2BE2, 0x00090909, Shader.TileMode.CLAMP));
        cv.drawRect(0, 0, w, h, p);
        p.setShader(new RadialGradient(w * 0.1f, h * 1.02f, h * 0.45f, 0x66A855F7, 0x00090909, Shader.TileMode.CLAMP));
        cv.drawRect(0, 0, w, h, p);
        p.setShader(null);

        Bitmap logo = BitmapFactory.decodeResource(c.getResources(), R.drawable.wf_logo);
        if (logo != null) {
            float lw = w * 0.42f;
            float lh = lw * logo.getHeight() / logo.getWidth();
            float cx = w / 2f, cy = h * 0.46f;
            Paint lp = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            lp.setAlpha(235);
            cv.drawBitmap(logo, null, new RectF(cx - lw / 2, cy - lh / 2, cx + lw / 2, cy + lh / 2), lp);
            logo.recycle();
        }
        return bmp;
    }
}
