package de.musterblick.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import org.opencv.android.Utils
import org.opencv.core.*
import org.opencv.imgproc.Imgproc
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Photo loaded and, if the marker sheet is visible, rectified to a top-down view. */
class Prepared(
    val bitmap: Bitmap,       // image shown to the user (rectified if marker found)
    val rgb: Mat,             // same image as RGB Mat
    val pxPerMm: Double,      // 1.0 when no marker (units are pixels)
    val minX: Double, val minY: Double, // board-mm at pixel (0,0)
    val markerCount: Int,
) {
    val hasScale get() = markerCount > 0
    fun toMm(x: Double, y: Double) = Pt(x / pxPerMm + minX, y / pxPerMm + minY)
    fun toPx(p: Pt) = Pt((p.x - minX) * pxPerMm, (p.y - minY) * pxPerMm)
}

object Segment {
    fun loadBitmap(ctx: Context, uri: Uri, maxSide: Int = 2600): Bitmap {
        val cr = ctx.contentResolver
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        cr.openInputStream(uri)!!.use { BitmapFactory.decodeStream(it, null, o) }
        var sample = 1
        while (max(o.outWidth, o.outHeight) / sample > maxSide) sample *= 2
        val bmp = cr.openInputStream(uri)!!.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 })
        }!!
        val rot = runCatching {
            cr.openInputStream(uri)!!.use { ExifInterface(it).rotationDegrees }
        }.getOrDefault(0)
        return if (rot == 0) bmp else Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rot.toFloat()) }, true)
    }

    fun prepare(src: Bitmap): Prepared {
        val rgba = Mat(); Utils.bitmapToMat(src, rgba)
        val rgb = Mat(); Imgproc.cvtColor(rgba, rgb, Imgproc.COLOR_RGBA2RGB); rgba.release()
        val gray = Mat(); Imgproc.cvtColor(rgb, gray, Imgproc.COLOR_RGB2GRAY)
        val det = Board.detect(gray); gray.release()
        if (det == null) return Prepared(src, rgb, 1.0, 0.0, 0.0, 0)

        val inv = Homo.inv(det.h)
        val w = rgb.cols().toDouble(); val h = rgb.rows().toDouble()
        val lim = 1500.0
        val cs = listOf(Pt(0.0, 0.0), Pt(w, 0.0), Pt(w, h), Pt(0.0, h)).map {
            val p = Homo.apply(inv, it.x, it.y)
            Pt(p.x.coerceIn(-lim, Board.W + lim), p.y.coerceIn(-lim, Board.H + lim))
        }
        val minX = cs.minOf { it.x }; val maxX = cs.maxOf { it.x }
        val minY = cs.minOf { it.y }; val maxY = cs.maxOf { it.y }
        val k = min(3.0, 2800.0 / max(maxX - minX, maxY - minY))
        val t = doubleArrayOf(k, 0.0, -k * minX, 0.0, k, -k * minY, 0.0, 0.0, 1.0)
        val m = Homo.mul(t, inv)
        val mm = Mat(3, 3, CvType.CV_64F); mm.put(0, 0, *m)
        val out = Mat()
        val size = Size(((maxX - minX) * k).roundToInt().toDouble(), ((maxY - minY) * k).roundToInt().toDouble())
        Imgproc.warpPerspective(rgb, out, mm, size, Imgproc.INTER_LINEAR, Core.BORDER_CONSTANT, Scalar(255.0, 255.0, 255.0))
        rgb.release(); mm.release()
        val bmp = Bitmap.createBitmap(out.cols(), out.rows(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(out, bmp)
        return Prepared(bmp, out, k, minX, minY, det.markerCount)
    }

    /** GrabCut inside the user rectangle; the marker sheet is always background. Returns outline in image px. */
    fun outline(prep: Prepared, rect: android.graphics.RectF): List<Pt> {
        val img = prep.rgb
        val scale = min(1.0, 900.0 / max(img.cols(), img.rows()))
        val small = Mat(); Imgproc.resize(img, small, Size(0.0, 0.0), scale, scale, Imgproc.INTER_AREA)
        val mask = Mat(small.size(), CvType.CV_8UC1, Scalar(Imgproc.GC_BGD.toDouble()))
        val r = Rect(
            Point((rect.left * scale).toDouble().coerceIn(1.0, small.cols() - 2.0), (rect.top * scale).toDouble().coerceIn(1.0, small.rows() - 2.0)),
            Point((rect.right * scale).toDouble().coerceIn(2.0, small.cols() - 1.0), (rect.bottom * scale).toDouble().coerceIn(2.0, small.rows() - 1.0)),
        )
        Imgproc.rectangle(mask, r.tl(), r.br(), Scalar(Imgproc.GC_PR_FGD.toDouble()), -1)
        if (prep.hasScale) {
            val a = prep.toPx(Pt(-5.0, -5.0)); val b = prep.toPx(Pt(Board.W + 5, Board.H + 5))
            Imgproc.rectangle(mask, Point(a.x * scale, a.y * scale), Point(b.x * scale, b.y * scale), Scalar(Imgproc.GC_BGD.toDouble()), -1)
        }
        val bgd = Mat(); val fgd = Mat()
        Imgproc.grabCut(small, mask, r, bgd, fgd, 6, Imgproc.GC_INIT_WITH_MASK)
        val fg1 = Mat(); val fg2 = Mat()
        Core.compare(mask, Scalar(Imgproc.GC_FGD.toDouble()), fg1, Core.CMP_EQ)
        Core.compare(mask, Scalar(Imgproc.GC_PR_FGD.toDouble()), fg2, Core.CMP_EQ)
        val fg = Mat(); Core.bitwise_or(fg1, fg2, fg)
        val ker = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(7.0, 7.0))
        Imgproc.morphologyEx(fg, fg, Imgproc.MORPH_CLOSE, ker)
        Imgproc.morphologyEx(fg, fg, Imgproc.MORPH_OPEN, ker)
        val cs = ArrayList<MatOfPoint>()
        Imgproc.findContours(fg, cs, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_NONE)
        listOf(small, mask, bgd, fgd, fg1, fg2, fg).forEach { it.release() }
        val best = cs.maxByOrNull { Imgproc.contourArea(it) } ?: return emptyList()
        if (Imgproc.contourArea(best) < 200) return emptyList()
        return best.toArray().map { Pt(it.x / scale, it.y / scale) }
    }
}
