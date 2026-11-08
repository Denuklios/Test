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
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import java.util.concurrent.TimeUnit
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

    /** Scales the prepared image down to a working size (all editing happens in this pixel space). */
    fun shrink(p: Prepared, maxSide: Int = 1400): Prepared {
        val s = min(1.0, maxSide.toDouble() / max(p.bitmap.width, p.bitmap.height))
        if (s >= 1.0) return p
        val w = (p.bitmap.width * s).roundToInt(); val h = (p.bitmap.height * s).roundToInt()
        val bmp = Bitmap.createScaledBitmap(p.bitmap, w, h, true)
        val rgb = Mat(); Imgproc.resize(p.rgb, rgb, Size(w.toDouble(), h.toDouble()), 0.0, 0.0, Imgproc.INTER_AREA)
        p.rgb.release()
        return Prepared(bmp, rgb, p.pxPerMm * s, p.minX, p.minY, p.markerCount)
    }

    /** On-device "main subject" detection (ML Kit). One 0/255 mask per subject, in image pixels. */
    fun mlSubjects(bmp: Bitmap): List<Mat> {
        val opts = SubjectSegmenterOptions.Builder()
            .enableMultipleSubjects(SubjectSegmenterOptions.SubjectResultOptions.Builder().enableConfidenceMask().build())
            .build()
        val seg = SubjectSegmentation.getClient(opts)
        try {
            val res = Tasks.await(seg.process(InputImage.fromBitmap(bmp, 0)), 60, TimeUnit.SECONDS)
            return res.subjects.mapNotNull { sub ->
                val fb = sub.confidenceMask ?: return@mapNotNull null
                fb.rewind()
                val n = sub.width * sub.height
                val bytes = ByteArray(n)
                for (i in 0 until n) bytes[i] = if (fb.get() > 0.5f) 255.toByte() else 0
                val part = Mat(sub.height, sub.width, CvType.CV_8UC1); part.put(0, 0, bytes)
                val full = Mat.zeros(bmp.height, bmp.width, CvType.CV_8UC1)
                val r = Rect(sub.startX, sub.startY, min(sub.width, bmp.width - sub.startX), min(sub.height, bmp.height - sub.startY))
                part.submat(Rect(0, 0, r.width, r.height)).copyTo(full.submat(r))
                part.release()
                if (Core.countNonZero(full) < 100) { full.release(); null } else full
            }
        } finally { seg.close() }
    }

    /** Picks the subject that best covers the centre of the picture. */
    fun pickCentral(masks: List<Mat>): Int {
        if (masks.isEmpty()) return -1
        return masks.indices.maxByOrNull { i ->
            val m = masks[i]
            val c = m.submat(Rect(m.cols() / 4, m.rows() / 4, m.cols() / 2, m.rows() / 2))
            Core.countNonZero(c) * 3.0 + Core.countNonZero(m)
        } ?: -1
    }

    fun indexAt(masks: List<Mat>, x: Double, y: Double): Int {
        val xi = x.toInt(); val yi = y.toInt()
        masks.forEachIndexed { i, m ->
            if (xi in 0 until m.cols() && yi in 0 until m.rows() && m.get(yi, xi)[0] > 0) return i
        }
        return -1
    }

    /** Fallback without ML Kit: GrabCut, by default on the central 80 % of the picture. */
    fun grabCut(prep: Prepared, rect: android.graphics.RectF?): Mat {
        val img = prep.rgb
        val rr = rect ?: android.graphics.RectF(img.cols() * 0.1f, img.rows() * 0.1f, img.cols() * 0.9f, img.rows() * 0.9f)
        val scale = min(1.0, 700.0 / max(img.cols(), img.rows()))
        val small = Mat(); Imgproc.resize(img, small, Size(0.0, 0.0), scale, scale, Imgproc.INTER_AREA)
        val mask = Mat(small.size(), CvType.CV_8UC1, Scalar(Imgproc.GC_BGD.toDouble()))
        val r = Rect(
            Point((rr.left * scale).toDouble().coerceIn(1.0, small.cols() - 2.0), (rr.top * scale).toDouble().coerceIn(1.0, small.rows() - 2.0)),
            Point((rr.right * scale).toDouble().coerceIn(2.0, small.cols() - 1.0), (rr.bottom * scale).toDouble().coerceIn(2.0, small.rows() - 1.0)),
        )
        Imgproc.rectangle(mask, r.tl(), r.br(), Scalar(Imgproc.GC_PR_FGD.toDouble()), -1)
        // the centre of the selection is very likely the object
        val cx = (r.x + r.width / 2).toDouble(); val cy = (r.y + r.height / 2).toDouble()
        Imgproc.ellipse(mask, Point(cx, cy), Size(r.width * 0.12, r.height * 0.12), 0.0, 0.0, 360.0, Scalar(Imgproc.GC_FGD.toDouble()), -1)
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
        val big = Mat(); Imgproc.resize(fg, big, img.size(), 0.0, 0.0, Imgproc.INTER_LINEAR)
        Imgproc.threshold(big, big, 127.0, 255.0, Imgproc.THRESH_BINARY)
        listOf(small, mask, bgd, fgd, fg1, fg2, fg).forEach { it.release() }
        return big
    }

    /** Removes the marker sheet from a mask and returns the outline of the largest region (image px). */
    fun outlineOf(prep: Prepared, mask: Mat): List<Pt> {
        val m = mask.clone()
        if (prep.hasScale) {
            val a = prep.toPx(Pt(-5.0, -5.0)); val b = prep.toPx(Pt(Board.W + 5, Board.H + 5))
            Imgproc.rectangle(m, Point(a.x, a.y), Point(b.x, b.y), Scalar(0.0), -1)
        }
        val ker = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(5.0, 5.0))
        Imgproc.morphologyEx(m, m, Imgproc.MORPH_CLOSE, ker)
        Imgproc.morphologyEx(m, m, Imgproc.MORPH_OPEN, ker)
        val cs = ArrayList<MatOfPoint>()
        Imgproc.findContours(m, cs, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_NONE)
        m.release()
        val best = cs.maxByOrNull { Imgproc.contourArea(it) } ?: return emptyList()
        if (Imgproc.contourArea(best) < 150) return emptyList()
        return best.toArray().map { Pt(it.x, it.y) }
    }
}
