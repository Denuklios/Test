package de.musterblick.app

import android.content.Context
import android.content.Intent
import android.graphics.*
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import java.util.concurrent.Executors
import kotlin.math.min

class PatternActivity : ComponentActivity() {
    private var armed = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Ui.initCv()
        val p = PatternStore.load(this, intent.getStringExtra("id") ?: "") ?: return finish()
        title = p.name
        val root = Ui.column(this)
        root.addView(Ui.label(this, "Fertig: %.1f x %.1f cm  ·  Zuschnitt: %.1f x %.1f cm  ·  Nahtzugabe %.0f mm".format(
            p.seamWidth / 10, p.seamHeight / 10, (p.maxX - p.minX) / 10, (p.maxY - p.minY) / 10, p.allowanceMm)))
        root.addView(PatternView(this, p), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(Ui.button(this, "Auf Stoff projizieren (Kamera)", true) {
            startActivity(Intent(this, ArActivity::class.java).putExtra("id", p.id))
        })
        root.addView(Ui.button(this, "PDF in Originalgröße (A4)") {
            Executors.newSingleThreadExecutor().execute {
                val f = Pdf.pattern(this, p)
                runOnUiThread { Ui.sharePdf(this, f) }
            }
        })
        root.addView(Ui.button(this, "Löschen") {
            if (!armed) { armed = true; Toast.makeText(this, "Zum Löschen nochmal tippen", Toast.LENGTH_SHORT).show() }
            else { PatternStore.delete(this, p.id); finish() }
        })
        setContentView(root)
    }
}

/** Pattern preview on a 1 cm grid. */
class PatternView(ctx: Context, private val p: Pattern) : View(ctx) {
    private val grid = Paint().apply { color = Color.rgb(225, 216, 205); strokeWidth = 1f }
    private val grid10 = Paint().apply { color = Color.rgb(200, 186, 170); strokeWidth = 2f }
    private val cut = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(63, 49, 38); strokeWidth = 5f }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(40, 178, 58, 58) }
    private val seam = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(178, 58, 58); strokeWidth = 3f; pathEffect = DashPathEffect(floatArrayOf(14f, 8f), 0f) }

    override fun onDraw(c: Canvas) {
        c.drawColor(Color.WHITE)
        val w = p.maxX - p.minX; val h = p.maxY - p.minY
        val s = (min((width - 40) / w, (height - 40) / h)).toFloat()
        val ox = width / 2f - ((p.minX + p.maxX) / 2).toFloat() * s
        val oy = height / 2f - ((p.minY + p.maxY) / 2).toFloat() * s
        var x = (ox % (10 * s)); var i = 0
        val startCm = -(ox / (10 * s)).toInt()
        while (x < width) { c.drawLine(x, 0f, x, height.toFloat(), if ((startCm + i) % 10 == 0) grid10 else grid); x += 10 * s; i++ }
        var y = (oy % (10 * s)); i = 0
        val startCmY = -(oy / (10 * s)).toInt()
        while (y < height) { c.drawLine(0f, y, width.toFloat(), y, if ((startCmY + i) % 10 == 0) grid10 else grid); y += 10 * s; i++ }
        fun path(pts: List<Pt>) = Path().apply { pts.forEachIndexed { k, q -> val a = (ox + q.x * s).toFloat(); val b = (oy + q.y * s).toFloat(); if (k == 0) moveTo(a, b) else lineTo(a, b) }; close() }
        val cp = path(p.cut)
        c.drawPath(cp, fill); c.drawPath(cp, cut); c.drawPath(path(p.seam), seam)
    }
}
