package de.musterblick.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import org.opencv.core.*
import org.opencv.imgproc.Imgproc
import java.io.File
import java.util.UUID
import kotlin.math.*

data class Pt(val x: Double, val y: Double)

/** A pattern piece. All coordinates in millimetres, y pointing down, centred on (0,0). */
class Pattern(
    val id: String,
    var name: String,
    val seam: List<Pt>,
    val cut: List<Pt>,
    val allowanceMm: Double,
) {
    val minX get() = cut.minOf { it.x }
    val maxX get() = cut.maxOf { it.x }
    val minY get() = cut.minOf { it.y }
    val maxY get() = cut.maxOf { it.y }
    val seamWidth get() = seam.maxOf { it.x } - seam.minOf { it.x }
    val seamHeight get() = seam.maxOf { it.y } - seam.minOf { it.y }

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id); put("name", name); put("allowance", allowanceMm)
        put("seam", ptsToJson(seam)); put("cut", ptsToJson(cut))
    }

    companion object {
        fun fromJson(o: JSONObject) = Pattern(
            o.getString("id"), o.getString("name"),
            jsonToPts(o.getJSONArray("seam")), jsonToPts(o.getJSONArray("cut")),
            o.getDouble("allowance"),
        )
        private fun ptsToJson(p: List<Pt>) = JSONArray().apply {
            p.forEach { put(Math.round(it.x * 100) / 100.0); put(Math.round(it.y * 100) / 100.0) }
        }
        private fun jsonToPts(a: JSONArray) = (0 until a.length() / 2).map { Pt(a.getDouble(2 * it), a.getDouble(2 * it + 1)) }
    }
}

object PatternStore {
    private fun dir(ctx: Context) = File(ctx.filesDir, "patterns").apply { mkdirs() }
    fun list(ctx: Context): List<Pattern> = dir(ctx).listFiles { f -> f.name.endsWith(".json") }
        ?.sortedByDescending { it.lastModified() }
        ?.mapNotNull { runCatching { Pattern.fromJson(JSONObject(it.readText())) }.getOrNull() } ?: emptyList()
    fun load(ctx: Context, id: String): Pattern? = File(dir(ctx), "$id.json").takeIf { it.exists() }
        ?.let { runCatching { Pattern.fromJson(JSONObject(it.readText())) }.getOrNull() }
    fun save(ctx: Context, p: Pattern) = File(dir(ctx), "${p.id}.json").writeText(p.toJson().toString())
    fun delete(ctx: Context, id: String) = File(dir(ctx), "$id.json").delete()

    /** Adds the Christmas-tree cushion (45 cm) as a sample on first start. */
    fun ensureSample(ctx: Context) {
        val prefs = ctx.getSharedPreferences("app", 0)
        if (prefs.getBoolean("sample", false)) return
        val half = listOf(Pt(0.0, 0.0), Pt(220.0, 0.0), Pt(100.0, -180.0), Pt(175.0, -190.0), Pt(75.0, -320.0), Pt(130.0, -328.0), Pt(0.0, -480.0))
        val full = half.drop(1) + half.subList(1, half.size - 1).reversed().map { Pt(-it.x, it.y) }
        val res = PatternBuilder.build(full, smoothMm = 9.0, symmetric = true, allowanceMm = 10.0, targetHeightMm = 450.0)
        save(ctx, Pattern(UUID.randomUUID().toString(), "Beispiel: Tannenbaum-Kissen 45 cm", res.seam, res.cut, 10.0))
        prefs.edit().putBoolean("sample", true).apply()
    }
}

/** 3x3 homography helpers (row-major DoubleArray(9)). */
object Homo {
    fun apply(h: DoubleArray, x: Double, y: Double): Pt {
        val w = h[6] * x + h[7] * y + h[8]
        return Pt((h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w)
    }
    fun inv(m: DoubleArray): DoubleArray {
        val a = m[0]; val b = m[1]; val c = m[2]; val d = m[3]; val e = m[4]; val f = m[5]; val g = m[6]; val h = m[7]; val i = m[8]
        val A = e * i - f * h; val B = -(d * i - f * g); val C = d * h - e * g
        val det = a * A + b * B + c * C
        return doubleArrayOf(
            A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
            B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
            C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
        )
    }
    fun mul(a: DoubleArray, b: DoubleArray) = DoubleArray(9) { k ->
        val r = k / 3; val c = k % 3
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
    }
    fun normalized(h: DoubleArray) = DoubleArray(9) { h[it] / h[8] }
}

/**
 * Turns a raw outline into a clean pattern piece by working on a raster mask:
 * optional symmetry, smoothing, scaling to a target height and seam allowance (dilation).
 */
object PatternBuilder {
    class Result(val seam: List<Pt>, val cut: List<Pt>, val centre: Pt, val scale: Double)

    fun build(outline: List<Pt>, smoothMm: Double, symmetric: Boolean, allowanceMm: Double, targetHeightMm: Double?): Result {
        var r = buildOnce(outline, smoothMm, symmetric, allowanceMm, 1.0)
        if (targetHeightMm != null && targetHeightMm > 0) {
            // two passes: smoothing shrinks the shape a little, so rescale on the final seam height
            var s = targetHeightMm / (r.seam.maxOf { it.y } - r.seam.minOf { it.y })
            r = buildOnce(outline, smoothMm, symmetric, allowanceMm, s)
            s *= targetHeightMm / (r.seam.maxOf { it.y } - r.seam.minOf { it.y })
            r = buildOnce(outline, smoothMm, symmetric, allowanceMm, s)
        }
        return r
    }

    private fun buildOnce(outlineIn: List<Pt>, smoothMm: Double, symmetric: Boolean, allowanceMm: Double, scale: Double): Result {
        val cx0 = (outlineIn.minOf { it.x } + outlineIn.maxOf { it.x }) / 2
        val cy0 = (outlineIn.minOf { it.y } + outlineIn.maxOf { it.y }) / 2
        val outline = outlineIn.map { Pt((it.x - cx0) * scale, (it.y - cy0) * scale) }
        val bw = outline.maxOf { it.x } - outline.minOf { it.x }
        val bh = outline.maxOf { it.y } - outline.minOf { it.y }
        val margin = allowanceMm + smoothMm * 3 + 10
        val big = max(bw, bh) + 2 * margin
        val res = min(3.0, 3000.0 / big) // px per mm
        val w = ((bw + 2 * margin) * res).roundToInt()
        val h = ((bh + 2 * margin) * res).roundToInt()
        val ox = -outline.minOf { it.x } + margin
        val oy = -outline.minOf { it.y } + margin
        val toPx = { p: Pt -> Point((p.x + ox) * res, (p.y + oy) * res) }
        val fromPx = { p: Point -> Pt(p.x / res - ox, p.y / res - oy) }

        val mask = Mat.zeros(h, w, CvType.CV_8UC1)
        Imgproc.fillPoly(mask, listOf(MatOfPoint(*outline.map(toPx).toTypedArray())), Scalar(255.0), Imgproc.LINE_AA)

        if (symmetric) {
            // mirror around the vertical axis through the bounding-box centre and take the mean shape
            val axisPx = (0.0 + ox) * res
            val mm = Mat(); Imgproc.warpAffine(mask, mm, MatOfDouble(-1.0, 0.0, 2 * axisPx, 0.0, 1.0, 0.0).reshape(1, 2), mask.size())
            val a = Mat(); val b = Mat()
            Imgproc.GaussianBlur(mask, a, Size(0.0, 0.0), 1.5 * res)
            Imgproc.GaussianBlur(mm, b, Size(0.0, 0.0), 1.5 * res)
            Core.addWeighted(a, 0.5, b, 0.5, 0.0, mask)
            Imgproc.threshold(mask, mask, 127.0, 255.0, Imgproc.THRESH_BINARY)
            a.release(); b.release(); mm.release()
        }
        if (smoothMm > 0.2) {
            Imgproc.GaussianBlur(mask, mask, Size(0.0, 0.0), smoothMm * res)
            Imgproc.threshold(mask, mask, 127.0, 255.0, Imgproc.THRESH_BINARY)
        }
        val seamPx = largestContour(mask)
        val cutMask = Mat()
        val k = (2 * allowanceMm * res).roundToInt().coerceAtLeast(1) or 1
        if (allowanceMm > 0.05) {
            Imgproc.dilate(mask, cutMask, Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(k.toDouble(), k.toDouble())))
        } else mask.copyTo(cutMask)
        val cutPx = largestContour(cutMask)
        mask.release(); cutMask.release()

        var seam = simplify(seamPx, 0.25 * res).map(fromPx)
        var cut = simplify(cutPx, 0.25 * res).map(fromPx)
        val cx = (seam.minOf { it.x } + seam.maxOf { it.x }) / 2
        val cy = (seam.minOf { it.y } + seam.maxOf { it.y }) / 2
        seam = seam.map { Pt(it.x - cx, it.y - cy) }
        cut = cut.map { Pt(it.x - cx, it.y - cy) }
        return Result(seam, cut, Pt(cx0 + cx / scale, cy0 + cy / scale), scale)
    }

    private fun largestContour(mask: Mat): MatOfPoint {
        val cs = ArrayList<MatOfPoint>()
        Imgproc.findContours(mask.clone(), cs, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_NONE)
        return cs.maxByOrNull { Imgproc.contourArea(it) } ?: MatOfPoint()
    }

    private fun simplify(c: MatOfPoint, eps: Double): List<Point> {
        if (c.empty()) return emptyList()
        val f = MatOfPoint2f(*c.toArray()); val out = MatOfPoint2f()
        Imgproc.approxPolyDP(f, out, eps, true)
        return out.toArray().toList()
    }
}
