package de.musterblick.app

import org.opencv.calib3d.Calib3d
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.objdetect.ArucoDetector
import org.opencv.objdetect.DetectorParameters
import org.opencv.objdetect.Objdetect

/**
 * The printed marker sheet (A4 portrait, millimetres, origin top-left, y down).
 * Six ArUco markers so tracking keeps working when a hand or fabric covers some of them.
 */
object Board {
    const val W = 210.0
    const val H = 297.0
    const val S = 40.0
    val markers = mapOf(
        0 to Pt(15.0, 15.0), 1 to Pt(155.0, 15.0),
        4 to Pt(15.0, 128.5), 5 to Pt(155.0, 128.5),
        2 to Pt(15.0, 242.0), 3 to Pt(155.0, 242.0),
    )
    val dictionary by lazy { Objdetect.getPredefinedDictionary(Objdetect.DICT_4X4_50) }
    private val detector by lazy {
        val p = DetectorParameters()
        p.set_cornerRefinementMethod(Objdetect.CORNER_REFINE_SUBPIX)
        ArucoDetector(dictionary, p)
    }

    /** h maps board millimetres -> image pixels. */
    class Detection(val h: DoubleArray, val markerCount: Int)

    @Synchronized
    fun detect(gray: Mat): Detection? {
        val corners = ArrayList<Mat>()
        val ids = Mat()
        detector.detectMarkers(gray, corners, ids)
        val obj = ArrayList<Point>()
        val img = ArrayList<Point>()
        var n = 0
        for (i in corners.indices) {
            val id = ids.get(i, 0)[0].toInt()
            val tl = markers[id]
            if (tl != null) {
                n++
                val o = listOf(Pt(tl.x, tl.y), Pt(tl.x + S, tl.y), Pt(tl.x + S, tl.y + S), Pt(tl.x, tl.y + S))
                for (k in 0 until 4) {
                    val v = corners[i].get(0, k)
                    img.add(Point(v[0], v[1])); obj.add(Point(o[k].x, o[k].y))
                }
            }
            corners[i].release()
        }
        ids.release()
        if (n == 0) return null
        val src = MatOfPoint2f(*obj.toTypedArray())
        val dst = MatOfPoint2f(*img.toTypedArray())
        val hm = Calib3d.findHomography(src, dst, if (n >= 3) Calib3d.RANSAC else 0, 4.0)
        src.release(); dst.release()
        if (hm.empty()) return null
        val a = DoubleArray(9); hm.get(0, 0, a); hm.release()
        return Detection(Homo.normalized(a), n)
    }
}
