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
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(Ui.header(this, p.name, "Schnittmuster"))
        val col = Ui.column(this)
        val pc = Ui.card(this)
        pc.addView(PatternView(this, p))
        col.addView(pc, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        val chips = com.google.android.material.chip.ChipGroup(this).apply { setPadding(0, Ui.dp(context, 10), 0, Ui.dp(context, 2)) }
        chips.addView(Ui.chip(this, "Fertig %.1f × %.1f cm".format(p.seamWidth / 10, p.seamHeight / 10)))
        chips.addView(Ui.chip(this, "Zuschnitt %.1f × %.1f cm".format((p.maxX - p.minX) / 10, (p.maxY - p.minY) / 10)))
        chips.addView(Ui.chip(this, "Nahtzugabe %.0f mm".format(p.allowanceMm)))
        col.addView(chips)
        col.addView(Ui.button(this, "Auf Stoff projizieren", Ui.Kind.PRIMARY, R.drawable.ic_ar) {
            startActivity(Intent(this, ArActivity::class.java).putExtra("id", p.id))
        })
        val r = Ui.row(this)
        r.addView(Ui.weighted(Ui.button(this, "PDF drucken", Ui.Kind.TONAL, R.drawable.ic_print) {
            Executors.newSingleThreadExecutor().execute {
                val f = Pdf.pattern(this, p)
                runOnUiThread { Ui.sharePdf(this, f) }
            }
        }, 1.4f))
        r.addView(Ui.weighted(Ui.button(this, "Löschen", Ui.Kind.DANGER, R.drawable.ic_delete) {
            if (!armed) { armed = true; Toast.makeText(this, "Zum Löschen nochmal tippen", Toast.LENGTH_SHORT).show() }
            else { PatternStore.delete(this, p.id); finish() }
        }, 1f, 0))
        col.addView(r)
        root.addView(col, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)
    }
}
/** Pattern preview on a 1 cm grid. */
class PatternView(ctx: Context, private val p: Pattern, private val thumb: Boolean = false) : View(ctx) {
    private val grid = Paint().apply { color = Color.rgb(238, 232, 224); strokeWidth = 1f }
    private val grid10 = Paint().apply { color = Color.rgb(200, 186, 170); strokeWidth = 2f }
    private val cut = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Ui.PINE; strokeWidth = if (thumb) 3f else 5f; strokeJoin = Paint.Join.ROUND }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(40, 178, 58, 58) }
    private val seam = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(178, 58, 58); strokeWidth = 3f; pathEffect = DashPathEffect(floatArrayOf(14f, 8f), 0f) }

    override fun onDraw(c: Canvas) {
        val w = p.maxX - p.minX; val h = p.maxY - p.minY
        val padPx = if (thumb) 12 else 48
        val s = (min((width - padPx) / w, (height - padPx) / h)).toFloat()
        if (thumb) { c.drawColor(Ui.LINEN) }
        val ox = width / 2f - ((p.minX + p.maxX) / 2).toFloat() * s
        val oy = height / 2f - ((p.minY + p.maxY) / 2).toFloat() * s
        if (!thumb) {
        var x = (ox % (10 * s)); var i = 0
        val startCm = -(ox / (10 * s)).toInt()
        while (x < width) { c.drawLine(x, 0f, x, height.toFloat(), if ((startCm + i) % 10 == 0) grid10 else grid); x += 10 * s; i++ }
        var y = (oy % (10 * s)); i = 0
        val startCmY = -(oy / (10 * s)).toInt()
        while (y < height) { c.drawLine(0f, y, width.toFloat(), y, if ((startCmY + i) % 10 == 0) grid10 else grid); y += 10 * s; i++ }
        }
        fun path(pts: List<Pt>) = Path().apply { pts.forEachIndexed { k, q -> val a = (ox + q.x * s).toFloat(); val b = (oy + q.y * s).toFloat(); if (k == 0) moveTo(a, b) else lineTo(a, b) }; close() }
        val cp = path(p.cut)
        c.drawPath(cp, fill); c.drawPath(cp, cut); c.drawPath(path(p.seam), seam)
    }
}
