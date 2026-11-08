package de.musterblick.app

import android.content.Context
import android.content.res.ColorStateList
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
import com.google.android.material.button.MaterialButton
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import org.opencv.android.Utils
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

enum class Tool { SELECT, PLUS, MINUS, RECT }

class EditorActivity : ComponentActivity() {
    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var view: EditView
    private lateinit var status: TextView
    private lateinit var smooth: SeekBar
    private lateinit var sym: CompoundButton
    private lateinit var allowance: EditText
    private lateinit var heightEt: EditText
    private lateinit var name: EditText
    private lateinit var tools: MaterialButtonToggleGroup
    private val toolButtons = mutableMapOf<Tool, MaterialButton>()
    private var prep: Prepared? = null
    private var candidates: List<Mat> = emptyList()
    private var mlAll: List<Mat> = emptyList()
    private var edgesAll: List<Mat> = emptyList()
    private var mask: Mat? = null
    private var hints: Mat? = null
    private var outlinePx: List<Pt> = emptyList()
    private var outlineMm: List<Pt>? = null
    private var result: PatternBuilder.Result? = null
    private var buildToken = 0
    private var busy = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Ui.initCv()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val head = Ui.header(this, "Schnittmuster aus Foto")
        root.addView(head)
        status = TextView(this).apply {
            text = "Foto wird geladen …"; textSize = 14f; setTextColor(Ui.PINE); setBackgroundColor(Ui.PINE_SOFT)
            setPadding(Ui.dp(context, 16), Ui.dp(context, 10), Ui.dp(context, 16), Ui.dp(context, 10))
        }
        root.addView(status)
        view = EditView(this)
        root.addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val panel = Ui.column(this, 12).apply { setBackgroundColor(Color.WHITE) }
        tools = MaterialButtonToggleGroup(this).apply { isSingleSelection = true; isSelectionRequired = true }
        val checkedText = ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(Color.WHITE, Ui.PINE))
        val checkedBg = ColorStateList(arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()), intArrayOf(Ui.PINE, Color.WHITE))
        listOf(Tool.SELECT to "Auswählen", Tool.PLUS to "+ Motiv", Tool.MINUS to "− Weg", Tool.RECT to "Rahmen").forEach { (t, label) ->
            val b = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
                id = View.generateViewId(); text = label; isAllCaps = false; textSize = 13.5f; maxLines = 1
                setPadding(Ui.dp(context, 2), 0, Ui.dp(context, 2), 0); insetTop = 0; insetBottom = 0; minHeight = Ui.dp(context, 46)
                setTextColor(checkedText); backgroundTintList = checkedBg; strokeColor = ColorStateList.valueOf(Ui.LINE)
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
        sym = MaterialSwitch(this).apply { text = "Symmetrisch "; setTextColor(Ui.INK); textSize = 14f }
        r1.addView(sym)
        panel.addView(r1, Ui.lp(top = Ui.dp(this, 4)))
        fun field(hint: String, et: EditText) = TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedDenseStyle).apply {
            this.hint = hint; boxStrokeColor = Ui.PINE; hintTextColor = ColorStateList.valueOf(Ui.PINE)
            val r = Ui.dpf(context, 12f); setBoxCornerRadii(r, r, r, r)
            addView(et)
        }
        heightEt = TextInputEditText(this).apply { inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        allowance = TextInputEditText(this).apply { setText("10"); inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL }
        name = TextInputEditText(this).apply { setText("Muster " + SimpleDateFormat("dd.MM. HH:mm", Locale.GERMANY).format(Date())); isSingleLine = true }
        val r2 = Ui.row(this)
        r2.addView(Ui.weighted(field("Höhe fertig (cm)", heightEt), 1f))
        r2.addView(Ui.weighted(field("Nahtzugabe (mm)", allowance), 1f, 0))
        panel.addView(r2, Ui.lp(top = Ui.dp(this, 4)))
        panel.addView(field("Name", name), Ui.lp(top = Ui.dp(this, 6)))
        panel.addView(Ui.button(this, "Schnittmuster speichern", Ui.Kind.PRIMARY, R.drawable.ic_check) { save() })
        root.addView(panel)
        Ui.insets(root, head, panel)
        setContentView(root)
        setTool(Tool.SELECT, announce = false)

        view.listener = object : EditView.Listener {
            override fun onTap(x: Double, y: Double) = selectAt(x, y)
            override fun onRect(r: RectF) = runRect(r)
            override fun onStroke(x0: Double, y0: Double, x1: Double, y1: Double, plus: Boolean) = stroke(x0, y0, x1, y1, plus)
            override fun onStrokeEnd() = applyHints()
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
        busy = true
        worker.execute {
            try {
                val p = Segment.shrink(Segment.prepare(Segment.loadBitmap(this, uri)))
                runOnUiThread { prep = p; view.setImage(p.bitmap); status.text = "Motiv wird gesucht …" }
                // candidates: ML Kit subjects (if Google's module is available) + regions with strong outlines
                val all = runCatching { Segment.mlSubjects(p.bitmap) }.getOrElse { emptyList() }
                val ml = all.filter { Segment.plausible(it) }
                val edges = runCatching { Segment.edgeCandidates(p) }.getOrElse { emptyList() }
                val scored = ml.map { it to Segment.score(it) * 1.5 } + edges.map { it to Segment.score(it) }
                val ranked = scored.sortedByDescending { it.second }.map { it.first }
                val best = ranked.firstOrNull()
                val m = when {
                    best == null -> Segment.grabCut(p, null)
                    best in ml -> best.clone()
                    else -> Segment.refineSeed(p, best)
                }
                val top = ranked.take(8)
                val outlines = top.map { Segment.outlineOf(p, it) }
                runOnUiThread {
                    mlAll = all; edgesAll = edges
                    candidates = top
                    view.setCandidates(outlines)
                    setMask(m)
                    busy = false
                    status.text = "Motiv erkannt. Falsches Motiv? Lange auf den gewünschten Gegenstand drücken." +
                        (if (!p.hasScale) " Dann unten die Höhe in cm eingeben." else "")
                }
            } catch (e: Throwable) {
                runOnUiThread { busy = false; status.text = "Foto konnte nicht verarbeitet werden: ${e.message}" }
            }
        }
    }

    private fun setTool(t: Tool, announce: Boolean = true) {
        view.tool = t
        toolButtons[t]?.let { tools.check(it.id) }
        if (!announce) return
        status.text = when (t) {
            Tool.SELECT -> "Lange auf den Gegenstand drücken – er wird automatisch freigestellt."
            Tool.PLUS -> "Wische kurz über Teile, die zum Motiv gehören – die Ränder werden automatisch gesucht."
            Tool.MINUS -> "Wische kurz über Teile, die nicht dazugehören (Hand, Hintergrund, Nachbar-Teil)."
            Tool.RECT -> "Ziehe einen Rahmen um das Motiv – darin wird neu gesucht."
        }
    }

    private fun setMask(m: Mat, resetHints: Boolean = true) {
        mask?.release(); mask = m
        if (resetHints) { hints?.release(); hints = null; view.clearStrokes() }
        maskChanged()
    }

    private fun ensureHints(): Mat? {
        val p = prep ?: return null
        return hints ?: Mat.zeros(p.rgb.rows(), p.rgb.cols(), CvType.CV_8UC1).also { hints = it }
    }

    private fun selectAt(x: Double, y: Double) {
        val p = prep ?: return
        if (busy) return
        busy = true; status.text = "Gegenstand wird freigestellt …"
        view.pulse(x.toFloat(), y.toFloat())
        worker.execute {
            var m = runCatching { Segment.liftAt(p, mlAll, edgesAll, x, y) }.getOrNull()
            if (m == null) {
                // last resort: grow from the finger position
                val h = Mat.zeros(p.rgb.rows(), p.rgb.cols(), CvType.CV_8UC1)
                Imgproc.circle(h, Point(x, y), max(8, (max(h.cols(), h.rows()) * 0.03).toInt()), Scalar(1.0), -1)
                m = Segment.refineHints(p, null, h); h.release()
            }
            runOnUiThread {
                busy = false; view.pulse(null, null); setMask(m!!); view.flash()
                status.text = "Freigestellt. Fehlt etwas: „+ Motiv“ und kurz darüber wischen. Zu viel: „− Weg“."
            }
        }
    }

    private fun runRect(r: RectF) {
        val p = prep ?: return
        if (busy) return
        busy = true; status.text = "Motiv wird im Rahmen gesucht …"
        worker.execute {
            val m = Segment.grabCut(p, r)
            runOnUiThread { busy = false; setMask(m); status.text = "Mit „+ Motiv“ / „− Weg“ nachbessern, falls nötig." }
        }
    }

    private fun stroke(x0: Double, y0: Double, x1: Double, y1: Double, plus: Boolean) {
        val h = ensureHints() ?: return
        val th = max(6, (max(h.cols(), h.rows()) * 0.025).toInt())
        Imgproc.line(h, Point(x0, y0), Point(x1, y1), Scalar(if (plus) 1.0 else 2.0), th)
    }

    private fun applyHints() {
        val p = prep ?: return
        val h = hints ?: return
        if (busy) return
        busy = true; status.text = "Ränder werden neu gesucht …"
        val cur = mask?.clone()
        val hc = h.clone()
        worker.execute {
            val m = Segment.refineHints(p, cur, hc)
            cur?.release(); hc.release()
            runOnUiThread { busy = false; setMask(m, resetHints = false); status.text = "Aktualisiert. Weiter wischen oder speichern." }
        }
    }

    private fun maskChanged() {
        val m = mask ?: return
        val p = prep ?: return
        view.setTint(m)
        outlinePx = Segment.outlineOf(p, m)
        view.setOutline(outlinePx)
        if (outlinePx.size < 10) { outlineMm = null; result = null; view.setPreview(null, p, 1.0, 1.0); return }
        outlineMm = outlinePx.map { p.toMm(it.x, it.y) }
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
                status.text = "Fertige Größe: %.1f × %.1f cm · Nahtzugabe %.0f mm".format(w / 10, h / 10, al)
            }
        }
    }

    private fun save() {
        val r = result
        if (r == null) {
            val msg = if (outlineMm == null) "Noch kein Motiv erkannt" else "Bitte die fertige Höhe in cm eingeben"
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
            if (outlineMm != null) heightEt.requestFocus()
            return
        }
        val p = Pattern(UUID.randomUUID().toString(), name.text.toString().ifBlank { "Muster" }, r.seam, r.cut, (num(allowance) ?: 0.0))
        PatternStore.save(this, p)
        startActivity(android.content.Intent(this, PatternActivity::class.java).putExtra("id", p.id))
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        (candidates + mlAll + edgesAll).distinct().forEach { it.release() }; mask?.release(); hints?.release()
    }
}

/** Photo with the chosen motif (tinted + outline), other candidates (faint), brush strokes and pattern preview. */
class EditView(ctx: Context) : View(ctx) {
    interface Listener {
        fun onTap(x: Double, y: Double)
        fun onRect(r: RectF)
        fun onStroke(x0: Double, y0: Double, x1: Double, y1: Double, plus: Boolean)
        fun onStrokeEnd()
    }
    var listener: Listener? = null
    var tool = Tool.SELECT
    private var bmp: Bitmap? = null
    private var tint: Bitmap? = null
    private var others: List<Path> = emptyList()
    private var outline: Path? = null
    private val strokes = ArrayList<Pair<Path, Boolean>>()
    private var current: Path? = null
    private var rect: RectF? = null
    private var start: PointF? = null
    private var lastPt: PointF? = null
    private var downAt = 0L
    private var longFired = false
    private var pulseAt: PointF? = null
    private var pulseStart = 0L
    private var flashUntil = 0L
    private val pulseP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.WHITE }
    private val longPress = Runnable {
        val s = start ?: return@Runnable
        if (tool == Tool.SELECT) {
            longFired = true
            performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
            listener?.onTap(s.x.toDouble(), s.y.toDouble())
        }
    }

    fun pulse(x: Float?, y: Float?) { pulseAt = if (x == null || y == null) null else PointF(x, y); pulseStart = System.currentTimeMillis(); invalidate() }
    fun flash() { flashUntil = System.currentTimeMillis() + 700; invalidate() }
    private var seamPath: Path? = null
    private var cutPath: Path? = null
    private val m = Matrix()
    private val inv = Matrix()
    private val selP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(255, 200, 0); pathEffect = DashPathEffect(floatArrayOf(18f, 10f), 0f) }
    private val otherP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.argb(170, 255, 255, 255); pathEffect = DashPathEffect(floatArrayOf(10f, 10f), 0f) }
    private val outlineP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(255, 214, 0); strokeJoin = Paint.Join.ROUND }
    private val outlineBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.argb(160, 0, 0, 0); strokeJoin = Paint.Join.ROUND }
    private val cutP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(178, 58, 58); strokeJoin = Paint.Join.ROUND }
    private val cutBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.WHITE; strokeJoin = Paint.Join.ROUND }
    private val seamP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(20, 90, 200); pathEffect = DashPathEffect(floatArrayOf(14f, 8f), 0f) }
    private val plusP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.argb(170, 60, 200, 90); strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val minusP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.argb(170, 230, 50, 50); strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    private val tintP = Paint(Paint.FILTER_BITMAP_FLAG).apply { alpha = 90 }

    init { setBackgroundColor(Color.rgb(40, 36, 33)) }

    fun setImage(b: Bitmap) { bmp = b; invalidate() }

    private fun toPath(pts: List<Pt>) = Path().apply { pts.forEachIndexed { i, q -> if (i == 0) moveTo(q.x.toFloat(), q.y.toFloat()) else lineTo(q.x.toFloat(), q.y.toFloat()) }; close() }

    fun setCandidates(outlines: List<List<Pt>>) { others = outlines.filter { it.size > 2 }.map { toPath(it) }; invalidate() }
    fun setOutline(pts: List<Pt>) { outline = if (pts.size > 2) toPath(pts) else null; invalidate() }
    fun clearStrokes() { strokes.clear(); invalidate() }

    fun setTint(mask: Mat) {
        val rgba = Mat(mask.rows(), mask.cols(), CvType.CV_8UC4, Scalar(0.0, 0.0, 0.0, 0.0))
        rgba.setTo(Scalar(255.0, 200.0, 0.0, 255.0), mask)
        val b = tint?.takeIf { it.width == mask.cols() && it.height == mask.rows() } ?: Bitmap.createBitmap(mask.cols(), mask.rows(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(rgba, b); rgba.release()
        tint = b; invalidate()
    }

    fun setPreview(r: PatternBuilder.Result?, p: Prepared, scale: Double, pre: Double) {
        if (r == null) { seamPath = null; cutPath = null; invalidate(); return }
        fun toImg(pt: Pt): Pt = p.toPx(Pt((r.centre.x + pt.x / scale) / pre, (r.centre.y + pt.y / scale) / pre))
        seamPath = toPath(r.seam.map(::toImg)); cutPath = toPath(r.cut.map(::toImg))
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
        val brush = max(b.width, b.height) * 0.025f
        plusP.strokeWidth = brush; minusP.strokeWidth = brush
        strokes.forEach { (p, plus) -> c.drawPath(p, if (plus) plusP else minusP) }
        current?.let { c.drawPath(it, if (tool == Tool.PLUS) plusP else minusP) }
        if (cutPath != null) {
            cutBg.strokeWidth = 9f * k; cutP.strokeWidth = 5f * k; c.drawPath(cutPath!!, cutBg); c.drawPath(cutPath!!, cutP)
            seamPath?.let { seamP.strokeWidth = 3f * k; c.drawPath(it, seamP) }
        } else outline?.let { outlineBg.strokeWidth = 8f * k; outlineP.strokeWidth = 4f * k; c.drawPath(it, outlineBg); c.drawPath(it, outlineP) }
        rect?.let { selP.strokeWidth = 4f * k; c.drawRect(it, selP) }
        val now = System.currentTimeMillis()
        pulseAt?.let { p ->
            val t = ((now - pulseStart) % 900) / 900f
            val base = max(b.width, b.height) * 0.03f
            pulseP.strokeWidth = 4f * k; pulseP.alpha = (255 * (1 - t)).toInt()
            c.drawCircle(p.x, p.y, base * (1 + 2.5f * t), pulseP)
            pulseP.alpha = 255; c.drawCircle(p.x, p.y, base * 0.35f, pulseP)
            postInvalidateOnAnimation()
        }
        if (now < flashUntil) outline?.let {
            val a = (flashUntil - now) / 700f
            outlineP.alpha = 255; outlineBg.strokeWidth = (8f + 14f * a) * k; outlineBg.color = Color.argb((200 * a).toInt(), 255, 255, 255)
            c.drawPath(it, outlineBg); outlineBg.color = Color.argb(160, 0, 0, 0)
            postInvalidateOnAnimation()
        }
        c.restore()
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (bmp == null) return false
        val pts = floatArrayOf(e.x, e.y); inv.mapPoints(pts)
        val x = pts[0]; val y = pts[1]
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                start = PointF(x, y); lastPt = PointF(x, y); downAt = System.currentTimeMillis(); longFired = false
                if (tool == Tool.SELECT) postDelayed(longPress, 380)
                parent.requestDisallowInterceptTouchEvent(true)
                if (tool == Tool.PLUS || tool == Tool.MINUS) current = Path().apply { moveTo(x, y) }
            }
            MotionEvent.ACTION_MOVE -> when (tool) {
                Tool.SELECT -> start?.let { s -> if (Math.hypot((s.x - x).toDouble(), (s.y - y).toDouble()) * width / max(1, bmp!!.width) > 30) removeCallbacks(longPress) }
                Tool.RECT -> start?.let { s -> rect = RectF(min(s.x, x), min(s.y, y), max(s.x, x), max(s.y, y)); invalidate() }
                Tool.PLUS, Tool.MINUS -> lastPt?.let { l ->
                    listener?.onStroke(l.x.toDouble(), l.y.toDouble(), x.toDouble(), y.toDouble(), tool == Tool.PLUS)
                    current?.lineTo(x, y); lastPt = PointF(x, y); invalidate()
                }
                else -> {}
            }
            MotionEvent.ACTION_UP -> {
                when (tool) {
                    Tool.SELECT -> { removeCallbacks(longPress); if (!longFired && System.currentTimeMillis() - downAt < 380) listener?.onTap(x.toDouble(), y.toDouble()) }
                    Tool.RECT -> rect?.let { if (it.width() > 20 && it.height() > 20) listener?.onRect(it) }
                    Tool.PLUS, Tool.MINUS -> {
                        lastPt?.let { listener?.onStroke(it.x.toDouble(), it.y.toDouble(), x.toDouble(), y.toDouble(), tool == Tool.PLUS) }
                        current?.let { it.lineTo(x + 0.1f, y); strokes.add(it to (tool == Tool.PLUS)) }
                        current = null
                        listener?.onStrokeEnd()
                    }
                }
                rect = null; start = null; lastPt = null; invalidate()
            }
        }
        return true
    }
}
