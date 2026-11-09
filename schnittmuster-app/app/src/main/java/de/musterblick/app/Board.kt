package de.musterblick.app

import org.opencv.calib3d.Calib3d
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.objdetect.ArucoDetector
import org.opencv.objdetect.DetectorParameters
import org.opencv.objdetect.Objdetect

/**
 * Printed marker sheets (millimetres, origin top-left, y down). Each sheet uses its own marker IDs,
 * so the app knows from the IDs which sheet lies in the picture.
 */
object Board {
    class Sheet(val name: String, val w: Double, val h: Double, val size: Double, val markers: Map<Int, Pt>)

    val A4 = Sheet("A4", 210.0, 297.0, 40.0, mapOf(
        0 to Pt(15.0, 15.0), 1 to Pt(155.0, 15.0),
        4 to Pt(15.0, 128.5), 5 to Pt(155.0, 128.5),
        2 to Pt(15.0, 242.0), 3 to Pt(155.0, 242.0),
    ))
    val SQUARE = Sheet("10 × 10 cm", 100.0, 100.0, 36.0, mapOf(
        10 to Pt(8.0, 8.0), 11 to Pt(56.0, 8.0),
        12 to Pt(8.0, 56.0), 13 to Pt(56.0, 56.0),
    ))
    val STRIP = Sheet("Streifen 15 × 4 cm", 150.0, 40.0, 28.0, mapOf(
        20 to Pt(6.0, 6.0), 21 to Pt(61.0, 6.0), 22 to Pt(116.0, 6.0),
    ))
    val sheets = listOf(A4, SQUARE, STRIP)

    val dictionary by lazy { Objdetect.getPredefinedDictionary(Objdetect.DICT_4X4_50) }
    private val detector by lazy {
        val p = DetectorParameters()
        p.set_cornerRefinementMethod(Objdetect.CORNER_REFINE_SUBPIX)
        ArucoDetector(dictionary, p)
    }

    /** h maps sheet millimetres -> image pixels. */
    class Detection(val h: DoubleArray, val markerCount: Int, val sheet: Sheet)

    @Synchronized
    fun detect(gray: Mat): Detection? {
        val corners = ArrayList<Mat>()
        val ids = Mat()
        detector.detectMarkers(gray, corners, ids)
        val found = corners.indices.map { ids.get(it, 0)[0].toInt() to corners[it] }
        ids.release()
        // the sheet with the most visible markers wins
        val sheet = sheets.maxByOrNull { s -> found.count { it.first in s.markers } }
        val use = if (sheet == null) emptyList() else found.filter { it.first in sheet.markers }
        if (sheet == null || use.isEmpty()) { corners.forEach { it.release() }; return null }
        val obj = ArrayList<Point>()
        val img = ArrayList<Point>()
        val sz = sheet.size
        for ((id, c) in use) {
            val tl = sheet.markers.getValue(id)
            val o = listOf(Pt(tl.x, tl.y), Pt(tl.x + sz, tl.y), Pt(tl.x + sz, tl.y + sz), Pt(tl.x, tl.y + sz))
            for (k in 0 until 4) {
                val v = c.get(0, k)
                img.add(Point(v[0], v[1])); obj.add(Point(o[k].x, o[k].y))
            }
        }
        corners.forEach { it.release() }
        val src = MatOfPoint2f(*obj.toTypedArray())
        val dst = MatOfPoint2f(*img.toTypedArray())
        val hm = Calib3d.findHomography(src, dst, if (use.size >= 3) Calib3d.RANSAC else 0, 4.0)
        src.release(); dst.release()
        if (hm.empty()) return null
        val a = DoubleArray(9); hm.get(0, 0, a); hm.release()
        return Detection(Homo.normalized(a), use.size, sheet)
    }
}
