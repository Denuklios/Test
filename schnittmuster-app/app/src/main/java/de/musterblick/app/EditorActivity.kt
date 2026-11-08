package de.musterblick.app

import android.content.Context
import android.graphics.*
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.ComponentActivity
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

class EditorActivity : ComponentActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var view: EditView
    private lateinit var status: TextView
    private lateinit var smooth: SeekBar
    private lateinit var sym: CheckBox
    private lateinit var allowance: EditText
    private lateinit var heightEt: EditText
    private lateinit var name: EditText
    private var prep: Prepared? = null
    private var outlineMm: List<Pt>? = null
    private var result: PatternBuilder.Result? = null
    private var buildToken = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Ui.initCv()
        title = "Schnittmuster aus Foto"
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        status = Ui.label(this, "Foto wird geladen …").apply { setPadding(Ui.dp(context, 12), Ui.dp(context, 6), Ui.dp(context, 12), Ui.dp(context, 6)) }
        root.addView(status)
        view = EditView(this)
        root.addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val c = Ui.column(this).apply { setPadding(Ui.dp(context, 12), 0, Ui.dp(context, 12), Ui.dp(context, 8)) }
        c.addView(Ui.button(this, "Umriss erkennen", true) { detect() })
        val r1 = Ui.row(this)
        r1.addView(Ui.label(this, "Glätten"))
        smooth = SeekBar(this).apply { max = 25; progress = 3 }
        r1.addView(smooth, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        sym = CheckBox(this).apply { text = "Symmetrisch" }
        r1.addView(sym)
        c.addView(r1)
        val r2 = Ui.row(this)
        allowance = EditText(this).apply { hint = "Nahtzugabe mm"; setText("10"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        heightEt = EditText(this).apply { hint = "Höhe fertig cm (optional)"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        r2.addView(Ui.weighted(LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; addView(Ui.label(context, "Nahtzugabe (mm)", 12f)); addView(allowance) }))
        r2.addView(Ui.weighted(LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; addView(Ui.label(context, "Höhe fertig (cm)", 12f)); addView(heightEt) }))
        c.addView(r2)
        name = EditText(this).apply { setText("Muster " + SimpleDateFormat("dd.MM. HH:mm", Locale.GERMANY).format(Date())) }
        c.addView(name)
        c.addView(Ui.button(this, "Speichern") { save() })
        root.addView(c)
        setContentView(root)

        smooth.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(s: SeekBar?, p: Int, u: Boolean) = rebuild()
            override fun onStartTrackingTouch(s: SeekBar?) {}
            override fun onStopTrackingTouch(s: SeekBar?) {}
        })
        sym.setOnCheckedChangeListener { _, _ -> rebuild() }
        val tw = object : TextWatcher {
            override fun afterTextChanged(s: Editable?) = rebuild()
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        }
        allowance.addTextChangedListener(tw); heightEt.addTextChangedListener(tw)

        val uri = intent.data ?: return finish()
        worker.execute {
            try {
                val bmp = Segment.loadBitmap(this, uri)
                val p = Segment.prepare(bmp)
                runOnUiThread {
                    prep = p
                    view.setImage(p.bitmap)
                    status.text = if (p.hasScale)
                        "Marker-Blatt erkannt (${p.markerCount}/6), Bild entzerrt. Ziehe einen Rahmen um den Gegenstand und tippe „Umriss erkennen“."
                    else
                        "Kein Marker-Blatt gefunden – Maßstab unbekannt. Rahmen ziehen, „Umriss erkennen“, dann die fertige Höhe in cm eingeben."
                }
            } catch (e: Throwable) {
                runOnUiThread { status.text = "Foto konnte nicht geladen werden: ${e.message}" }
            }
        }
    }

    private fun detect() {
        val p = prep ?: return
        val rect = view.selection ?: RectF(p.bitmap.width * 0.05f, p.bitmap.height * 0.05f, p.bitmap.width * 0.95f, p.bitmap.height * 0.95f)
        status.text = "Umriss wird erkannt …"
        worker.execute {
            val px = runCatching { Segment.outline(p, rect) }.getOrDefault(emptyList())
            runOnUiThread {
                if (px.size < 10) {
                    status.text = "Kein Umriss gefunden. Rahmen enger ziehen; ein ruhiger, kontrastreicher Untergrund hilft."
                } else {
                    outlineMm = px.map { p.toMm(it.x, it.y) }
                    status.text = "Umriss erkannt. Glätten, Symmetrie und Nahtzugabe einstellen, dann speichern."
                    rebuild()
                }
            }
        }
    }

    private fun num(e: EditText) = e.text.toString().replace(',', '.').toDoubleOrNull()

    private fun rebuild() {
        val o = outlineMm ?: return
        val p = prep ?: return
        val token = ++buildToken
        val sm = smooth.progress.toDouble()
        val s = sym.isChecked
        val al = (num(allowance) ?: 0.0).coerceIn(0.0, 80.0)
        val hCm = num(heightEt)
        if (!p.hasScale && (hCm == null || hCm <= 0)) {
            result = null; view.setPreview(null, p, 1.0, 1.0)
            status.text = "Kein Marker-Blatt im Foto: bitte die fertige Höhe in cm eingeben."
            return
        }
        worker.execute {
            // without a marker the outline is in pixels: convert to mm using the requested height
            var pre = 1.0
            var outline = o
            if (!p.hasScale) {
                pre = hCm!! * 10 / (o.maxOf { it.y } - o.minOf { it.y })
                outline = o.map { Pt(it.x * pre, it.y * pre) }
            }
            val r = runCatching { PatternBuilder.build(outline, sm, s, al, hCm?.let { it * 10 }) }.getOrNull()
            runOnUiThread {
                if (token != buildToken || r == null) return@runOnUiThread
                result = r
                view.setPreview(r, p, r.scale, pre)
                val w = r.seam.maxOf { it.x } - r.seam.minOf { it.x }
                val h = r.seam.maxOf { it.y } - r.seam.minOf { it.y }
                status.text = "Fertige Größe: %.1f x %.1f cm  ·  Nahtzugabe %.0f mm".format(w / 10, h / 10, al)
            }
        }
    }

    private fun save() {
        val r = result
        if (r == null) { Toast.makeText(this, "Erst den Umriss erkennen" + (if (prep?.hasScale == false) " und die Höhe eingeben" else ""), Toast.LENGTH_LONG).show(); return }
        val p = Pattern(UUID.randomUUID().toString(), name.text.toString().ifBlank { "Muster" }, r.seam, r.cut, (num(allowance) ?: 0.0))
        PatternStore.save(this, p)
        startActivity(android.content.Intent(this, PatternActivity::class.java).putExtra("id", p.id))
        finish()
    }
}

/** Shows the (rectified) photo, lets the user drag a selection rectangle and overlays the pattern preview. */
class EditView(ctx: Context) : View(ctx) {
    private var bmp: Bitmap? = null
    var selection: RectF? = null
    private var start: PointF? = null
    private var seamPath: Path? = null
    private var cutPath: Path? = null
    private val m = Matrix()
    private val inv = Matrix()
    private val selP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 4f; color = Color.rgb(255, 200, 0); pathEffect = DashPathEffect(floatArrayOf(18f, 10f), 0f) }
    private val cutP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 6f; color = Color.rgb(178, 58, 58) }
    private val cutBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 11f; color = Color.WHITE }
    private val seamP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 3f; color = Color.rgb(20, 90, 200); pathEffect = DashPathEffect(floatArrayOf(14f, 8f), 0f) }

    init { setBackgroundColor(Color.rgb(40, 36, 33)) }

    fun setImage(b: Bitmap) { bmp = b; requestLayout(); invalidate() }

    fun setPreview(r: PatternBuilder.Result?, p: Prepared, scale: Double, pre: Double) {
        if (r == null) { seamPath = null; cutPath = null; invalidate(); return }
        val s = scale
        // pattern coordinates are centred and scaled; map back into image px around the original centre
        fun toImg(pt: Pt): Pt {
            val mm = Pt((r.centre.x + pt.x / s) / pre, (r.centre.y + pt.y / s) / pre)
            return p.toPx(mm)
        }
        fun path(pts: List<Pt>) = Path().apply { pts.forEachIndexed { i, q -> val a = toImg(q); if (i == 0) moveTo(a.x.toFloat(), a.y.toFloat()) else lineTo(a.x.toFloat(), a.y.toFloat()) }; close() }
        seamPath = path(r.seam); cutPath = path(r.cut)
        invalidate()
    }

    override fun onDraw(c: Canvas) {
        val b = bmp ?: return
        val sc = min(width / b.width.toFloat(), height / b.height.toFloat())
        m.reset(); m.postScale(sc, sc); m.postTranslate((width - b.width * sc) / 2, (height - b.height * sc) / 2)
        m.invert(inv)
        c.drawBitmap(b, m, Paint(Paint.FILTER_BITMAP_FLAG))
        c.save(); c.concat(m)
        val k = 1 / sc
        cutPath?.let { cutBg.strokeWidth = 11f * k; cutP.strokeWidth = 6f * k; c.drawPath(it, cutBg); c.drawPath(it, cutP) }
        seamPath?.let { seamP.strokeWidth = 3f * k; c.drawPath(it, seamP) }
        selection?.let { selP.strokeWidth = 4f * k; c.drawRect(it, selP) }
        c.restore()
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (bmp == null) return false
        val pts = floatArrayOf(e.x, e.y); inv.mapPoints(pts)
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> { start = PointF(pts[0], pts[1]); parent.requestDisallowInterceptTouchEvent(true) }
            MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP -> start?.let { s ->
                selection = RectF(min(s.x, pts[0]), min(s.y, pts[1]), max(s.x, pts[0]), max(s.y, pts[1]))
                invalidate()
            }
        }
        return true
    }
}
