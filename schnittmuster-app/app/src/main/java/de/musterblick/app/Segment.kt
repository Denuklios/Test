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

    /** Drops "subjects" that are really the background (huge, or touching three or more image edges). */
    fun plausible(m: Mat): Boolean {
        val area = Core.countNonZero(m).toDouble() / (m.rows() * m.cols())
        if (area > 0.7 || area < 0.002) return false
        val r = Imgproc.boundingRect(m)
        val touch = listOf(r.x <= 2, r.y <= 2, r.x + r.width >= m.cols() - 2, r.y + r.height >= m.rows() - 2).count { it }
        return touch < 3
    }

    /** How likely a region is "the main motif": big, compact, near the centre, not cut off by the edges. */
    fun score(m: Mat): Double {
        val area = Core.countNonZero(m).toDouble()
        if (area < 1) return 0.0
        val r = Imgproc.boundingRect(m)
        val cx = r.x + r.width / 2.0; val cy = r.y + r.height / 2.0
        val dist = Math.hypot((cx - m.cols() / 2.0) / m.cols(), (cy - m.rows() / 2.0) / m.rows())
        val touch = listOf(r.x <= 2, r.y <= 2, r.x + r.width >= m.cols() - 2, r.y + r.height >= m.rows() - 2).count { it }
        val cs = ArrayList<MatOfPoint>()
        Imgproc.findContours(m.clone(), cs, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)
        val c = cs.maxByOrNull { Imgproc.contourArea(it) } ?: return 0.0
        val hullIdx = MatOfInt(); Imgproc.convexHull(c, hullIdx)
        val pts = c.toArray(); val hull = MatOfPoint(*hullIdx.toArray().map { pts[it] }.toTypedArray())
        val solidity = Imgproc.contourArea(c) / max(1.0, Imgproc.contourArea(hull))
        return Math.sqrt(area) * solidity / (1 + 5 * dist) / (1 + 3 * touch)
    }

    /** Closed regions bounded by strong colour edges (works well for an object lying on a table or floor). */
    fun edgeCandidates(prep: Prepared): List<Mat> {
        val img = prep.rgb
        val s = min(1.0, 700.0 / max(img.cols(), img.rows()))
        val small = Mat(); Imgproc.resize(img, small, Size(0.0, 0.0), s, s, Imgproc.INTER_AREA)
        Imgproc.GaussianBlur(small, small, Size(0.0, 0.0), 1.5)
        val lab = Mat(); Imgproc.cvtColor(small, lab, Imgproc.COLOR_RGB2Lab)
        lab.convertTo(lab, CvType.CV_32F)
        val ch = ArrayList<Mat>(); Core.split(lab, ch)
        val g2 = Mat.zeros(small.size(), CvType.CV_32F)
        for (c in ch) {
            val gx = Mat(); val gy = Mat()
            Imgproc.Sobel(c, gx, CvType.CV_32F, 1, 0); Imgproc.Sobel(c, gy, CvType.CV_32F, 0, 1)
            Core.multiply(gx, gx, gx); Core.multiply(gy, gy, gy)
            Core.add(g2, gx, g2); Core.add(g2, gy, g2)
            gx.release(); gy.release(); c.release()
        }
        val n = g2.rows() * g2.cols()
        val arr = FloatArray(n); g2.get(0, 0, arr)
        val sorted = arr.copyOf(); sorted.sort()
        val thr = sorted[(n * 0.92).toInt()].toDouble()
        val e = Mat(); Imgproc.threshold(g2, e, thr, 255.0, Imgproc.THRESH_BINARY); e.convertTo(e, CvType.CV_8U)
        Imgproc.morphologyEx(e, e, Imgproc.MORPH_CLOSE, Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(7.0, 7.0)))
        val cs = ArrayList<MatOfPoint>()
        Imgproc.findContours(e, cs, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)
        val fill = Mat.zeros(small.size(), CvType.CV_8UC1)
        Imgproc.drawContours(fill, cs, -1, Scalar(255.0), -1)
        Imgproc.morphologyEx(fill, fill, Imgproc.MORPH_OPEN, Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(15.0, 15.0)))
        val labels = Mat(); val stats = Mat(); val cents = Mat()
        val count = Imgproc.connectedComponentsWithStats(fill, labels, stats, cents)
        val out = ArrayList<Mat>()
        val total = small.rows() * small.cols()
        for (i in 1 until count) {
            val a = stats.get(i, Imgproc.CC_STAT_AREA)[0]
            if (a < 0.003 * total || a > 0.6 * total) continue
            val m = Mat(); Core.compare(labels, Scalar(i.toDouble()), m, Core.CMP_EQ)
            val big = Mat(); Imgproc.resize(m, big, img.size(), 0.0, 0.0, Imgproc.INTER_LINEAR)
            Imgproc.threshold(big, big, 127.0, 255.0, Imgproc.THRESH_BINARY)
            m.release(); out.add(big)
        }
        listOf(small, lab, g2, e, fill, labels, stats, cents).forEach { it.release() }
        return out
    }

    /** Sharpens a rough region with GrabCut: inner part = object, wide ring around it = maybe background. */
    fun refineSeed(prep: Prepared, rough: Mat): Mat {
        val img = prep.rgb
        val s = min(1.0, 700.0 / max(img.cols(), img.rows()))
        val small = Mat(); Imgproc.resize(img, small, Size(0.0, 0.0), s, s, Imgproc.INTER_AREA)
        val fg = Mat(); Imgproc.resize(rough, fg, small.size(), 0.0, 0.0, Imgproc.INTER_NEAREST)
        val r = Imgproc.boundingRect(fg)
        val ring = max(8, (max(r.width, r.height) * 0.15).toInt()) or 1
        val gm = Mat(small.size(), CvType.CV_8UC1, Scalar(Imgproc.GC_BGD.toDouble()))
        val dil = Mat(); Imgproc.dilate(fg, dil, Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(ring * 2.0 + 1, ring * 2.0 + 1)))
        gm.setTo(Scalar(Imgproc.GC_PR_BGD.toDouble()), dil)
        gm.setTo(Scalar(Imgproc.GC_PR_FGD.toDouble()), fg)
        val er = Mat(); Imgproc.erode(fg, er, Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(ring.toDouble(), ring.toDouble())))
        gm.setTo(Scalar(Imgproc.GC_FGD.toDouble()), er)
        val res = runGrab(small, gm, 5)
        listOf(small, fg, dil, er, gm).forEach { it.release() }
        return keepBest(upscale(res, img.size()), rough)
    }

    /** Smart brush: user strokes (hint 1 = belongs to motif, 2 = does not) steer GrabCut. */
    fun refineHints(prep: Prepared, current: Mat?, hints: Mat): Mat {
        val img = prep.rgb
        val s = min(1.0, 700.0 / max(img.cols(), img.rows()))
        val small = Mat(); Imgproc.resize(img, small, Size(0.0, 0.0), s, s, Imgproc.INTER_AREA)
        val h = Mat(); Imgproc.resize(hints, h, small.size(), 0.0, 0.0, Imgproc.INTER_NEAREST)
        val gm = Mat(small.size(), CvType.CV_8UC1, Scalar(Imgproc.GC_PR_BGD.toDouble()))
        if (current != null) {
            val c = Mat(); Imgproc.resize(current, c, small.size(), 0.0, 0.0, Imgproc.INTER_NEAREST)
            gm.setTo(Scalar(Imgproc.GC_PR_FGD.toDouble()), c); c.release()
        }
        Imgproc.rectangle(gm, Point(0.0, 0.0), Point(small.cols() - 1.0, small.rows() - 1.0), Scalar(Imgproc.GC_BGD.toDouble()), 2)
        val one = Mat(); Core.compare(h, Scalar(1.0), one, Core.CMP_EQ)
        val two = Mat(); Core.compare(h, Scalar(2.0), two, Core.CMP_EQ)
        gm.setTo(Scalar(Imgproc.GC_FGD.toDouble()), one)
        gm.setTo(Scalar(Imgproc.GC_BGD.toDouble()), two)
        val res = runGrab(small, gm, 5)
        val big = upscale(res, img.size())
        val oneBig = Mat(); Core.compare(hints, Scalar(1.0), oneBig, Core.CMP_EQ)
        listOf(small, h, gm, one, two).forEach { it.release() }
        val out = keepBest(big, oneBig); oneBig.release()
        return out
    }

    private fun runGrab(small: Mat, gm: Mat, iters: Int): Mat {
        val bgd = Mat(); val fgd = Mat()
        val hasFg = Core.countNonZero(Mat().also { Core.compare(gm, Scalar(Imgproc.GC_PR_FGD.toDouble()), it, Core.CMP_EQ) }) +
            Core.countNonZero(Mat().also { Core.compare(gm, Scalar(Imgproc.GC_FGD.toDouble()), it, Core.CMP_EQ) })
        if (hasFg == 0) return Mat.zeros(small.size(), CvType.CV_8UC1)
        Imgproc.grabCut(small, gm, Rect(), bgd, fgd, iters, Imgproc.GC_INIT_WITH_MASK)
        val a = Mat(); val b = Mat()
        Core.compare(gm, Scalar(Imgproc.GC_FGD.toDouble()), a, Core.CMP_EQ)
        Core.compare(gm, Scalar(Imgproc.GC_PR_FGD.toDouble()), b, Core.CMP_EQ)
        Core.bitwise_or(a, b, a); b.release(); bgd.release(); fgd.release()
        return a
    }

    private fun upscale(m: Mat, size: Size): Mat {
        val big = Mat(); Imgproc.resize(m, big, size, 0.0, 0.0, Imgproc.INTER_LINEAR)
        Imgproc.threshold(big, big, 127.0, 255.0, Imgproc.THRESH_BINARY); m.release()
        return big
    }

    /** Keeps the connected region that overlaps the reference most (or the largest). */
    private fun keepBest(m: Mat, ref: Mat): Mat {
        val labels = Mat(); val stats = Mat(); val cents = Mat()
        val n = Imgproc.connectedComponentsWithStats(m, labels, stats, cents)
        if (n <= 2) { labels.release(); stats.release(); cents.release(); return m }
        var best = 1; var bestScore = -1.0
        for (i in 1 until n) {
            val comp = Mat(); Core.compare(labels, Scalar(i.toDouble()), comp, Core.CMP_EQ)
            val ov = Mat(); Core.bitwise_and(comp, ref, ov)
            val sc = Core.countNonZero(ov) * 10.0 + stats.get(i, Imgproc.CC_STAT_AREA)[0]
            if (sc > bestScore) { bestScore = sc; best = i }
            comp.release(); ov.release()
        }
        val out = Mat(); Core.compare(labels, Scalar(best.toDouble()), out, Core.CMP_EQ)
        listOf(m, labels, stats, cents).forEach { it.release() }
        return out
    }

    /** Like the sticker feature on iPhone/Samsung: find the object under the finger. */
    fun liftAt(prep: Prepared, mlAll: List<Mat>, edges: List<Mat>, x: Double, y: Double): Mat? {
        val xi = x.toInt(); val yi = y.toInt()
        fun hit(m: Mat) = xi in 0 until m.cols() && yi in 0 until m.rows() && m.get(yi, xi)[0] > 0
        fun nearHit(m: Mat): Boolean {
            if (hit(m)) return true
            val r = max(6, (max(m.cols(), m.rows()) * 0.02).toInt())
            val x0 = (xi - r).coerceAtLeast(0); val y0 = (yi - r).coerceAtLeast(0)
            val x1 = (xi + r).coerceAtMost(m.cols() - 1); val y1 = (yi + r).coerceAtMost(m.rows() - 1)
            if (x1 <= x0 || y1 <= y0) return false
            return Core.countNonZero(m.submat(y0, y1, x0, x1)) > 0
        }
        val bmp = prep.bitmap
        val total = bmp.width.toDouble() * bmp.height
        // 1) a subject in the whole picture under the finger
        val whole = mlAll.filter { hit(it) && plausible(it) }.minByOrNull { Core.countNonZero(it) }
        if (whole != null && Core.countNonZero(whole) < 0.15 * total) return whole.clone()
        // 2) zoom in around the finger and ask again; the result counts only if it is not cut off by the zoom window
        val side = (max(bmp.width, bmp.height) * 0.55).toInt().coerceAtMost(min(bmp.width, bmp.height))
        val cx = (xi - side / 2).coerceIn(0, bmp.width - side)
        val cy = (yi - side / 2).coerceIn(0, bmp.height - side)
        val crop = Bitmap.createBitmap(bmp, cx, cy, side, side)
        val subs = runCatching { mlSubjects(crop) }.getOrElse { emptyList() }
        val lx = xi - cx; val ly = yi - cy
        val inCrop = subs.filter { m -> lx in 0 until m.cols() && ly in 0 until m.rows() && m.get(ly, lx)[0] > 0 }.minByOrNull { Core.countNonZero(it) }
        if (inCrop != null) {
            val r = Imgproc.boundingRect(inCrop)
            val cut = (r.x <= 1 && cx > 0) || (r.y <= 1 && cy > 0) ||
                (r.x + r.width >= side - 1 && cx + side < bmp.width) || (r.y + r.height >= side - 1 && cy + side < bmp.height)
            if (!cut) {
                val full = Mat.zeros(bmp.height, bmp.width, CvType.CV_8UC1)
                inCrop.copyTo(full.submat(Rect(cx, cy, side, side)))
                subs.forEach { it.release() }
                return full
            }
        }
        subs.forEach { it.release() }
        if (whole != null) return whole.clone()
        // 3) a region with a closed outline under the finger
        edges.filter { nearHit(it) }.minByOrNull { Core.countNonZero(it) }?.let { return refineSeed(prep, it) }
        return null
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
