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
import org.opencv.android.Utils
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.Point
import org.opencv.core.Scalar
import org.opencv.imgproc.Imgproc
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

enum class Tool { SELECT, RECT, ERASE, ADD }

class EditorActivity : ComponentActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var view: EditView
    private lateinit var status: TextView
    private lateinit var smooth: SeekBar
    private lateinit var sym: CompoundButton
    private lateinit var allowance: EditText
    private lateinit var heightEt: EditText
    private lateinit var name: EditText
    private val toolButtons = mutableMapOf<Tool, com.google.android.material.button.MaterialButton>()
    private var prep: Prepared? = null
    private var subjects: List<Mat> = emptyList()
    private var mask: Mat? = null
    private var outlineMm: List<Pt>? = null
    private var result: PatternBuilder.Result? = null
    private var buildToken = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Ui.initCv()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(Ui.header(this, "Schnittmuster aus Foto"))
        status = TextView(this).apply {
            text = "Foto wird geladen …"; textSize = 14f; setTextColor(Ui.PINE)
            setBackgroundColor(Ui.PINE_SOFT)
            setPadding(Ui.dp(context, 16), Ui.dp(context, 10), Ui.dp(context, 16), Ui.dp(context, 10))
        }
        root.addView(status)
        view = EditView(this)
        root.addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val panel = Ui.column(this, 12).apply { setBackgroundColor(Color.WHITE) }
        val tools = com.google.android.material.button.MaterialButtonToggleGroup(this).apply { isSingleSelection = true; isSelectionRequired = true }
        listOf(Tool.SELECT to "Antippen", Tool.RECT to "Rahmen", Tool.ERASE to "Radieren", Tool.ADD to "Ergänzen").forEach { (t, label) ->
            val b = com.google.android.material.button.MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                id = View.generateViewId(); text = label; isAllCaps = false; textSize = 13f
                setTextColor(android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(Color.WHITE, Ui.PINE)))
                backgroundTintList = android.content.res.ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(Ui.PINE, Color.WHITE))
                strokeColor = android.content.res.ColorStateList.valueOf(Ui.LINE)
                setOnClickListener { setTool(t) }
            }
            toolButtons[t] = b
            tools.addView(b, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        panel.addView(tools, Ui.lp())
        val r1 = Ui.row(this)
        r1.addView(TextView(this).apply { text = "Glätten"; setTextColor(Ui.INK); textSize = 14f })
        smooth = SeekBar(this).apply { max = 25; progress = 4 }
        r1.addView(smooth, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        sym = com.google.android.material.materialswitch.MaterialSwitch(this).apply { text = "Symmetrisch"; setTextColor(Ui.INK) }
        r1.addView(sym)
        panel.addView(r1, Ui.lp(top = Ui.dp(this, 6)))
        fun field(hint: String, et: EditText) = com.google.android.material.textfield.TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedDenseStyle).apply {
            this.hint = hint; boxStrokeColor = Ui.PINE
            setBoxCornerRadii(Ui.dpf(context, 12f), Ui.dpf(context, 12f), Ui.dpf(context, 12f), Ui.dpf(context, 12f))
            addView(et)
        }
        allowance = com.google.android.material.textfield.TextInputEditText(this).apply { setText("10"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        heightEt = com.google.android.material.textfield.TextInputEditText(this).apply { inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        name = com.google.android.material.textfield.TextInputEditText(this).apply { setText("Muster " + SimpleDateFormat("dd.MM. HH:mm", Locale.GERMANY).format(Date())); isSingleLine = true }
        val r2 = Ui.row(this)
        r2.addView(Ui.weighted(field("Nahtzugabe mm", allowance), 0.9f))
        r2.addView(Ui.weighted(field("Höhe fertig cm", heightEt), 0.9f))
        r2.addView(Ui.weighted(field("Name", name), 1.5f, 0))
        panel.addView(r2, Ui.lp(top = Ui.dp(this, 6)))
        panel.addView(Ui.button(this, "Schnittmuster speichern", Ui.Kind.PRIMARY, R.drawable.ic_check) { save() })
        root.addView(panel)
        setContentView(root)
        setTool(Tool.SELECT)

        view.listener = object : EditView.Listener {
            override fun onTap(x: Double, y: Double) = selectAt(x, y)
            override fun onRect(r: RectF) = runGrabCut(r)
            override fun onStroke(x0: Double, y0: Double, x1: Double, y1: Double, add: Boolean) = paint(x0, y0, x1, y1, add)
            override fun onStrokeEnd() = maskChanged()
        }
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
                val p = Segment.shrink(Segment.prepare(Segment.loadBitmap(this, uri)))
                runOnUiThread { prep = p; view.setImage(p.bitmap); status.text = "Hauptmotiv wird gesucht …" }
                val subs = runCatching { Segment.mlSubjects(p.bitmap) }.getOrElse { emptyList() }
                val pick = Segment.pickCentral(subs)
                val m = if (pick >= 0) subs[pick].clone() else Segment.grabCut(p, null)
                runOnUiThread {
                    subjects = subs
                    view.setSubjects(subs.map { Segment.outlineOf(p, it) })
                    setMask(m)
                    val scaleTxt = if (p.hasScale) "Marker-Blatt erkannt, echte Größe bekannt." else "Ohne Marker-Blatt: bitte die fertige Höhe in cm eingeben."
                    status.text = (if (subs.size > 1) "${subs.size} Motive gefunden, das mittlere ist gewählt. Anderes Motiv: antippen. "
                    else if (subs.size == 1) "Hauptmotiv erkannt. " else "Motiv in der Bildmitte erkannt. ") + scaleTxt
                }
            } catch (e: Throwable) {
                runOnUiThread { status.text = "Foto konnte nicht verarbeitet werden: ${e.message}" }
            }
        }
    }

    private fun setTool(t: Tool) {
        view.tool = t
        toolButtons[t]?.let { (it.parent as? com.google.android.material.button.MaterialButtonToggleGroup)?.check(it.id) }
        status.text = when (t) {
            Tool.SELECT -> "Tippe auf das Motiv, aus dem das Schnittmuster werden soll."
            Tool.RECT -> "Ziehe einen Rahmen um das Motiv – es wird darin neu gesucht."
            Tool.ERASE -> "Mit dem Finger über Teile wischen, die nicht dazugehören (z. B. Hand)."
            Tool.ADD -> "Mit dem Finger Stellen ergänzen, die zum Motiv gehören."
        }
    }

    private fun setMask(m: Mat) {
        mask?.release(); mask = m
        maskChanged()
    }

    private fun selectAt(x: Double, y: Double) {
        val i = Segment.indexAt(subjects, x, y)
        if (i >= 0) setMask(subjects[i].clone())
        else {
            val p = prep ?: return
            val r = max(p.bitmap.width, p.bitmap.height) * 0.25f
            runGrabCut(RectF((x - r).toFloat(), (y - r).toFloat(), (x + r).toFloat(), (y + r).toFloat()))
        }
    }

    private fun runGrabCut(r: RectF) {
        val p = prep ?: return
        status.text = "Motiv wird im Rahmen gesucht …"
        worker.execute {
            // prefer an ML subject that lies mostly inside the rectangle
            val inside = subjects.indexOfFirst { m ->
                val cs = Segment.outlineOf(p, m); cs.isNotEmpty() &&
                    cs.count { r.contains(it.x.toFloat(), it.y.toFloat()) } > cs.size * 0.8
            }
            val m = if (inside >= 0) subjects[inside].clone() else Segment.grabCut(p, r)
            runOnUiThread { setMask(m); status.text = "Motiv übernommen. Mit Radieren/Ergänzen nachbessern." }
        }
    }

    private fun paint(x0: Double, y0: Double, x1: Double, y1: Double, add: Boolean) {
        val m = mask ?: return
        val th = max(6, (max(m.cols(), m.rows()) * 0.035).toInt())
        Imgproc.line(m, Point(x0, y0), Point(x1, y1), Scalar(if (add) 255.0 else 0.0), th)
        view.setTint(m)
    }

    private fun maskChanged() {
        val m = mask ?: return
        val p = prep ?: return
        view.setTint(m)
        val px = Segment.outlineOf(p, m)
        if (px.size < 10) { outlineMm = null; result = null; view.setPreview(null, p, 1.0, 1.0); return }
        outlineMm = px.map { p.toMm(it.x, it.y) }
        rebuild()
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
            status.text = "Kein Marker-Blatt im Foto: bitte unten die fertige Höhe in cm eingeben."
            return
        }
        worker.execute {
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
                status.text = "Fertige Größe: %.1f x %.1f cm · Nahtzugabe %.0f mm".format(w / 10, h / 10, al)
            }
        }
    }

    private fun save() {
        val r = result
        if (r == null) {
            Toast.makeText(this, if (prep?.hasScale == false) "Bitte die fertige Höhe in cm eingeben" else "Noch kein Umriss erkannt", Toast.LENGTH_LONG).show(); return
        }
        val p = Pattern(UUID.randomUUID().toString(), name.text.toString().ifBlank { "Muster" }, r.seam, r.cut, (num(allowance) ?: 0.0))
        PatternStore.save(this, p)
        startActivity(android.content.Intent(this, PatternActivity::class.java).putExtra("id", p.id))
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        subjects.forEach { it.release() }; mask?.release()
    }
}

/** Shows the photo, the selected subject (tinted), other subjects (faint) and the pattern preview. */
class EditView(ctx: Context) : View(ctx) {
    interface Listener {
        fun onTap(x: Double, y: Double)
        fun onRect(r: RectF)
        fun onStroke(x0: Double, y0: Double, x1: Double, y1: Double, add: Boolean)
        fun onStrokeEnd()
    }
    var listener: Listener? = null
    var tool = Tool.SELECT
    private var bmp: Bitmap? = null
    private var tint: Bitmap? = null
    private var others: List<Path> = emptyList()
    private var rect: RectF? = null
    private var start: PointF? = null
    private var lastPt: PointF? = null
    private var seamPath: Path? = null
    private var cutPath: Path? = null
    private val m = Matrix()
    private val inv = Matrix()
    private val selP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(255, 200, 0); pathEffect = DashPathEffect(floatArrayOf(18f, 10f), 0f) }
    private val otherP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.argb(200, 255, 255, 255); pathEffect = DashPathEffect(floatArrayOf(10f, 10f), 0f) }
    private val cutP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(178, 58, 58) }
    private val cutBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.WHITE }
    private val seamP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(20, 90, 200); pathEffect = DashPathEffect(floatArrayOf(14f, 8f), 0f) }
    private val tintP = Paint(Paint.FILTER_BITMAP_FLAG).apply { alpha = 110 }

    init { setBackgroundColor(Color.rgb(40, 36, 33)) }

    fun setImage(b: Bitmap) { bmp = b; invalidate() }

    fun setSubjects(outlines: List<List<Pt>>) {
        others = outlines.filter { it.isNotEmpty() }.map { pts -> Path().apply { pts.forEachIndexed { i, q -> if (i == 0) moveTo(q.x.toFloat(), q.y.toFloat()) else lineTo(q.x.toFloat(), q.y.toFloat()) }; close() } }
        invalidate()
    }

    fun setTint(mask: Mat) {
        val rgba = Mat(mask.rows(), mask.cols(), CvType.CV_8UC4, Scalar(0.0, 0.0, 0.0, 0.0))
        rgba.setTo(Scalar(255.0, 120.0, 40.0, 255.0), mask)
        val b = tint?.takeIf { it.width == mask.cols() && it.height == mask.rows() } ?: Bitmap.createBitmap(mask.cols(), mask.rows(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(rgba, b); rgba.release()
        tint = b; invalidate()
    }

    fun setPreview(r: PatternBuilder.Result?, p: Prepared, scale: Double, pre: Double) {
        if (r == null) { seamPath = null; cutPath = null; invalidate(); return }
        fun toImg(pt: Pt): Pt = p.toPx(Pt((r.centre.x + pt.x / scale) / pre, (r.centre.y + pt.y / scale) / pre))
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
        tint?.let { c.drawBitmap(it, m, tintP) }
        c.save(); c.concat(m)
        val k = 1 / sc
        otherP.strokeWidth = 2.5f * k; others.forEach { c.drawPath(it, otherP) }
        cutPath?.let { cutBg.strokeWidth = 9f * k; cutP.strokeWidth = 5f * k; c.drawPath(it, cutBg); c.drawPath(it, cutP) }
        seamPath?.let { seamP.strokeWidth = 3f * k; c.drawPath(it, seamP) }
        rect?.let { selP.strokeWidth = 4f * k; c.drawRect(it, selP) }
        c.restore()
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (bmp == null) return false
        val pts = floatArrayOf(e.x, e.y); inv.mapPoints(pts)
        val x = pts[0]; val y = pts[1]
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> { start = PointF(x, y); lastPt = PointF(x, y); parent.requestDisallowInterceptTouchEvent(true) }
            MotionEvent.ACTION_MOVE -> when (tool) {
                Tool.RECT -> start?.let { s -> rect = RectF(min(s.x, x), min(s.y, y), max(s.x, x), max(s.y, y)); invalidate() }
                Tool.ERASE, Tool.ADD -> lastPt?.let { l ->
                    listener?.onStroke(l.x.toDouble(), l.y.toDouble(), x.toDouble(), y.toDouble(), tool == Tool.ADD); lastPt = PointF(x, y)
                }
                else -> {}
            }
            MotionEvent.ACTION_UP -> {
                when (tool) {
                    Tool.SELECT -> listener?.onTap(x.toDouble(), y.toDouble())
                    Tool.RECT -> rect?.let { if (it.width() > 20 && it.height() > 20) listener?.onRect(it) }
                    Tool.ERASE, Tool.ADD -> { lastPt?.let { listener?.onStroke(it.x.toDouble(), it.y.toDouble(), x.toDouble(), y.toDouble(), tool == Tool.ADD) }; listener?.onStrokeEnd() }
                }
                rect = null; start = null; lastPt = null; invalidate()
            }
        }
        return true
    }
}
