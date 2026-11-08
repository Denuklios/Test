package de.musterblick.app

import android.content.Context
import android.graphics.*
import android.graphics.pdf.PdfDocument
import org.opencv.android.Utils
import org.opencv.core.Mat
import org.opencv.objdetect.Objdetect
import java.io.File
import kotlin.math.ceil

object Pdf {
    private const val PT = 72.0f / 25.4f // points per mm

    private fun paint(color: Int, widthMm: Float, dash: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color; style = Paint.Style.STROKE; strokeWidth = widthMm
        strokeJoin = Paint.Join.ROUND
        if (dash) pathEffect = DashPathEffect(floatArrayOf(2.5f, 1.5f), 0f)
    }
    private fun text(sizeMm: Float, bold: Boolean = false, color: Int = Color.BLACK) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color; textSize = sizeMm
        typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }
    private fun path(pts: List<Pt>, dx: Double, dy: Double) = Path().apply {
        pts.forEachIndexed { i, p -> if (i == 0) moveTo((p.x + dx).toFloat(), (p.y + dy).toFloat()) else lineTo((p.x + dx).toFloat(), (p.y + dy).toFloat()) }
        close()
    }

    /** Marker sheet to print at 100 %. */
    fun markerSheet(ctx: Context): File {
        val doc = PdfDocument()
        val page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
        val c = page.canvas
        c.scale(PT, PT)
        val nearest = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
        for ((id, tl) in Board.markers) {
            val m = Mat()
            Objdetect.generateImageMarker(Board.dictionary, id, 240, m)
            val bmp = Bitmap.createBitmap(240, 240, Bitmap.Config.ARGB_8888)
            Utils.matToBitmap(m, bmp); m.release()
            c.drawBitmap(bmp, null, RectF(tl.x.toFloat(), tl.y.toFloat(), (tl.x + Board.S).toFloat(), (tl.y + Board.S).toFloat()), nearest)
        }
        val t = text(6f, true)
        c.drawText("MusterBlick Marker-Blatt", 62f, 30f, t)
        val s = text(3.6f)
        listOf(
            "Mit 100 % / Tatsächliche Größe drucken.",
            "Blatt flach auf den Stoff legen (am besten",
            "auf Pappe kleben, damit es sich nicht wellt).",
            "Marker nicht knicken oder abdecken.",
        ).forEachIndexed { i, l -> c.drawText(l, 62f, 42f + i * 5.5f, s) }
        // control ruler 100 mm
        val y = 175f
        val rp = paint(Color.BLACK, 0.5f)
        c.drawLine(55f, y, 155f, y, rp)
        for (i in 0..10) c.drawLine(55f + i * 10, y - (if (i % 5 == 0) 4 else 2), 55f + i * 10, y, rp)
        c.drawText("Kontrolle: diese Linie muss genau 10 cm lang sein", 55f, y + 7f, s)
        c.drawText("Muster wird neben dem Blatt angezeigt – Blatt bleibt beim", 55f, 215f, s)
        c.drawText("Abzeichnen liegen und darf nicht verrutschen.", 55f, 220.5f, s)
        doc.finishPage(page)
        return write(ctx, doc, "MusterBlick-Marker-Blatt.pdf")
    }

    /** Pattern at 1:1 split onto A4 pages, with an info page first. */
    fun pattern(ctx: Context, p: Pattern): File {
        val margin = 10.0
        val pad = 6.0
        val w = p.maxX - p.minX + 2 * pad
        val h = p.maxY - p.minY + 2 * pad
        fun count(pw: Double, ph: Double) = Pair(ceil(w / (pw - 2 * margin)).toInt(), ceil(h / (ph - 2 * margin)).toInt())
        val portrait = count(210.0, 297.0)
        val landscape = count(297.0, 210.0)
        val land = landscape.first * landscape.second < portrait.first * portrait.second
        val pw = if (land) 297.0 else 210.0
        val ph = if (land) 210.0 else 297.0
        val (cols, rows) = if (land) landscape else portrait
        val uw = pw - 2 * margin
        val uh = ph - 2 * margin
        val dx = -p.minX + pad
        val dy = -p.minY + pad
        val doc = PdfDocument()
        val cutP = paint(Color.BLACK, 0.6f)
        val seamP = paint(Color.DKGRAY, 0.3f, true)
        val frameP = paint(Color.GRAY, 0.2f)
        val small = text(3f, color = Color.DKGRAY)

        // info page
        run {
            val page = doc.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
            val c = page.canvas; c.scale(PT, PT)
            c.drawText(p.name, 15f, 25f, text(7f, true))
            val info = listOf(
                "Fertige Größe (Nählinie): %.1f x %.1f cm".format(p.seamWidth / 10, p.seamHeight / 10),
                "Zuschnitt inkl. %.0f mm Nahtzugabe: %.1f x %.1f cm".format(p.allowanceMm, (p.maxX - p.minX) / 10, (p.maxY - p.minY) / 10),
                "Durchgezogene Linie = Schnittlinie, gestrichelt = Nählinie.",
                "Mit 100 % / Tatsächliche Größe drucken, Kontrollquadrat messen.",
                "Seiten nach dem Plan unten anordnen: weißen Rand rechts und unten",
                "bis zur Rahmenlinie abschneiden und an die nächste Seite kleben.",
                "Seiten: $cols x $rows (${if (land) "A4 quer" else "A4 hoch"})",
            )
            info.forEachIndexed { i, l -> c.drawText(l, 15f, 38f + i * 6.5f, text(4f)) }
            c.drawRect(15f, 90f, 65f, 140f, paint(Color.BLACK, 0.4f))
            c.drawText("5 x 5 cm", 30f, 117f, text(4f))
            // overview map
            val mapW = 120f; val mapH = 150f
            val sc = minOf(mapW / (cols * uw).toFloat(), mapH / (rows * uh).toFloat())
            c.save(); c.translate(75f, 95f); c.scale(sc, sc)
            c.drawPath(path(p.cut, dx, dy), paint(Color.BLACK, 0.8f / sc))
            for (r in 0 until rows) for (cc in 0 until cols) {
                c.drawRect((cc * uw).toFloat(), (r * uh).toFloat(), ((cc + 1) * uw).toFloat(), ((r + 1) * uh).toFloat(), paint(Color.GRAY, 0.4f / sc))
                c.drawText("${'A' + r}${cc + 1}", (cc * uw + 5).toFloat(), (r * uh + 5 + 6 / sc).toFloat(), text(6f / sc, true, Color.rgb(178, 58, 58)))
            }
            c.restore()
            doc.finishPage(page)
        }
        var n = 2
        for (r in 0 until rows) for (cc in 0 until cols) {
            val page = doc.startPage(PdfDocument.PageInfo.Builder((pw * PT).toInt(), (ph * PT).toInt(), n++).create())
            val c = page.canvas; c.scale(PT, PT)
            val fx = margin.toFloat(); val fy = margin.toFloat()
            c.save()
            c.clipRect(fx, fy, (fx + uw).toFloat(), (fy + uh).toFloat())
            c.translate((margin - cc * uw).toFloat(), (margin - r * uh).toFloat())
            c.drawPath(path(p.seam, dx, dy), seamP)
            c.drawPath(path(p.cut, dx, dy), cutP)
            c.restore()
            c.drawRect(fx, fy, (fx + uw).toFloat(), (fy + uh).toFloat(), frameP)
            val label = "${'A' + r}${cc + 1}"
            c.drawText("$label  ·  ${p.name}", fx, fy - 3f, small)
            if (cc < cols - 1) c.drawText("rechts: ${'A' + r}${cc + 2}", (fx + uw - 25).toFloat(), (fy + uh / 2).toFloat(), small)
            if (r < rows - 1) c.drawText("unten: ${'A' + r + 1}${cc + 1}", (fx + uw / 2 - 10).toFloat(), (fy + uh - 2).toFloat(), small)
            c.drawText(label, fx + 3f, fy + 10f, text(8f, true, Color.argb(90, 178, 58, 58)))
            doc.finishPage(page)
        }
        val safe = p.name.replace(Regex("[^A-Za-z0-9ÄÖÜäöüß_-]+"), "_").take(40)
        return write(ctx, doc, "Schnittmuster_$safe.pdf")
    }

    private fun write(ctx: Context, doc: PdfDocument, name: String): File {
        val dir = File(ctx.cacheDir, "pdf").apply { mkdirs() }
        val f = File(dir, name)
        f.outputStream().use { doc.writeTo(it) }
        doc.close()
        return f
    }
}
