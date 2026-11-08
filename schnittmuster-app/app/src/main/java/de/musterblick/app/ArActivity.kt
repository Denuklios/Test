package de.musterblick.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.*
import android.os.Bundle
import android.util.Size
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import java.util.concurrent.Executors
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * Live camera view: finds the printed marker sheet on the fabric and draws the pattern at true size next to it.
 * The pattern is anchored to the sheet, so it stays put on the fabric while the phone moves.
 */
class ArActivity : ComponentActivity() {
    private lateinit var preview: PreviewView
    private lateinit var overlay: ArOverlay
    private lateinit var status: TextView
    private val analysisExec = Executors.newSingleThreadExecutor()
    private var camera: androidx.camera.core.Camera? = null
    private var torch = false

    private val perm = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) startCamera() else { Toast.makeText(this, "Kamera-Erlaubnis wird benötigt", Toast.LENGTH_LONG).show(); finish() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Ui.initCv()
        val p = PatternStore.load(this, intent.getStringExtra("id") ?: "") ?: return finish()
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = FrameLayout(this)
        preview = PreviewView(this).apply { scaleType = PreviewView.ScaleType.FILL_CENTER; implementationMode = PreviewView.ImplementationMode.COMPATIBLE }
        root.addView(preview)
        overlay = ArOverlay(this, p)
        root.addView(overlay)
        status = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 15f; setBackgroundColor(Color.argb(170, 47, 74, 58))
            val d = Ui.dp(context, 10); setPadding(d, d + Ui.dp(context, 18), d, d)
            text = "Marker-Blatt suchen …"
        }
        root.addView(status, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; setBackgroundColor(Color.argb(110, 0, 0, 0))
            val d = Ui.dp(context, 6); setPadding(d, d, d, d + Ui.dp(context, 16))
        }
        fun btn(t: String, f: (android.widget.Button) -> Unit) = com.google.android.material.button.MaterialButton(this).apply {
            text = t; isAllCaps = false; textSize = 13f; setOnClickListener { f(this) }
            cornerRadius = Ui.dp(context, 22); minHeight = Ui.dp(context, 48)
            backgroundTintList = android.content.res.ColorStateList.valueOf(Color.argb(200, 47, 74, 58)); setTextColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = Ui.dp(context, 6) }
        }
        bar.addView(btn("Drehen 90°") { overlay.angle += Math.PI / 2; overlay.invalidate() })
        bar.addView(btn("Spiegeln") { overlay.mirrored = !overlay.mirrored; overlay.invalidate() })
        bar.addView(btn("Sperren") { b -> overlay.locked = !overlay.locked; b.text = if (overlay.locked) "Entsperren" else "Sperren" })
        bar.addView(btn("Licht") { torch = !torch; camera?.cameraControl?.enableTorch(torch) })
        root.addView(bar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        setContentView(root)
        Toast.makeText(this, "Muster mit einem Finger verschieben, mit zwei Fingern drehen. Dann „Sperren“.", Toast.LENGTH_LONG).show()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) startCamera()
        else perm.launch(Manifest.permission.CAMERA)
    }

    private fun startCamera() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            val provider = future.get()
            val selector = ResolutionSelector.Builder()
                .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                .setResolutionStrategy(ResolutionStrategy(Size(1280, 960), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
                .build()
            val prev = Preview.Builder().setResolutionSelector(selector).build().also { it.surfaceProvider = preview.surfaceProvider }
            val analysis = ImageAnalysis.Builder().setResolutionSelector(selector)
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(analysisExec, Analyzer())
            provider.unbindAll()
            camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, prev, analysis)
        }, ContextCompat.getMainExecutor(this))
    }

    private inner class Analyzer : ImageAnalysis.Analyzer {
        private var buf = ByteArray(0)
        private var misses = 0
        override fun analyze(image: ImageProxy) {
            try {
                val w = image.width; val h = image.height
                val plane = image.planes[0]
                val bb = plane.buffer; val rs = plane.rowStride
                if (buf.size != w * h) buf = ByteArray(w * h)
                if (rs == w) { bb.rewind(); bb.get(buf, 0, w * h) }
                else for (y in 0 until h) { bb.position(y * rs); bb.get(buf, y * w, w) }
                val raw = Mat(h, w, CvType.CV_8UC1); raw.put(0, 0, buf)
                val rot = image.imageInfo.rotationDegrees
                val gray = if (rot == 0) raw else Mat().also {
                    Core.rotate(raw, it, when (rot) { 90 -> Core.ROTATE_90_CLOCKWISE; 180 -> Core.ROTATE_180; else -> Core.ROTATE_90_COUNTERCLOCKWISE })
                    raw.release()
                }
                val det = Board.detect(gray)
                val iw = gray.cols(); val ih = gray.rows()
                gray.release()
                if (det != null) misses = 0 else misses++
                runOnUiThread {
                    if (det != null) {
                        overlay.update(det.h, iw, ih)
                        status.text = if (det.markerCount >= 3) "Marker erkannt (${det.markerCount}/6) – Muster liegt fest" + (if (overlay.locked) " · gesperrt" else "")
                        else "Nur ${det.markerCount}/6 Marker sichtbar – etwas weiter weg halten"
                    } else if (misses > 12) {
                        overlay.update(null, iw, ih)
                        status.text = "Marker-Blatt suchen … (ganz ins Bild bringen, gutes Licht)"
                    }
                }
            } finally { image.close() }
        }
    }
}

class ArOverlay(ctx: Context, private val p: Pattern) : View(ctx) {
    private var h: DoubleArray? = null
    private var iw = 1; private var ih = 1
    var tx = Board.W + 30 + (p.maxX - p.minX) / 2
    var ty = Board.H / 2
    var angle = 0.0
    var mirrored = false
    var locked = false
    private val cutBg = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.BLACK; strokeWidth = 10f; strokeJoin = Paint.Join.ROUND }
    private val cut = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(255, 225, 0); strokeWidth = 5f; strokeJoin = Paint.Join.ROUND }
    private val seam = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(0, 230, 255); strokeWidth = 3f; pathEffect = DashPathEffect(floatArrayOf(16f, 10f), 0f) }
    private val sheet = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.argb(160, 120, 255, 120); strokeWidth = 3f }

    fun update(newH: DoubleArray?, w: Int, hh: Int) {
        iw = w; ih = hh
        val cur = h
        h = when {
            newH == null -> null
            cur == null -> newH
            else -> DoubleArray(9) { cur[it] * 0.45 + newH[it] * 0.55 } // light smoothing against jitter
        }
        invalidate()
    }

    private fun scale() = max(width / iw.toDouble(), height / ih.toDouble())
    private fun offX() = (width - iw * scale()) / 2
    private fun offY() = (height - ih * scale()) / 2

    private fun boardToView(b: Pt, hm: DoubleArray): Pt {
        val i = Homo.apply(hm, b.x, b.y); val s = scale()
        return Pt(i.x * s + offX(), i.y * s + offY())
    }
    private fun viewToBoard(x: Float, y: Float, hm: DoubleArray): Pt {
        val s = scale()
        return Homo.apply(Homo.inv(hm), (x - offX()) / s, (y - offY()) / s)
    }
    private fun place(q: Pt): Pt {
        val x = if (mirrored) -q.x else q.x
        val c = cos(angle); val s = sin(angle)
        return Pt(tx + x * c - q.y * s, ty + x * s + q.y * c)
    }

    override fun onDraw(c: Canvas) {
        val hm = h ?: return
        fun path(pts: List<Pt>) = Path().apply {
            pts.forEachIndexed { i, q -> val v = boardToView(place(q), hm); if (i == 0) moveTo(v.x.toFloat(), v.y.toFloat()) else lineTo(v.x.toFloat(), v.y.toFloat()) }
            close()
        }
        val sh = Path().apply {
            listOf(Pt(0.0, 0.0), Pt(Board.W, 0.0), Pt(Board.W, Board.H), Pt(0.0, Board.H)).forEachIndexed { i, q ->
                val v = boardToView(q, hm); if (i == 0) moveTo(v.x.toFloat(), v.y.toFloat()) else lineTo(v.x.toFloat(), v.y.toFloat())
            }; close()
        }
        c.drawPath(sh, sheet)
        val cp = path(p.cut)
        c.drawPath(cp, cutBg); c.drawPath(cp, cut)
        c.drawPath(path(p.seam), seam)
    }

    private var last: Pt? = null
    private var lastAngle: Double? = null

    override fun onTouchEvent(e: MotionEvent): Boolean {
        val hm = h ?: return true
        if (locked) return true
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> { last = viewToBoard(e.x, e.y, hm); lastAngle = null }
            MotionEvent.ACTION_POINTER_DOWN -> { lastAngle = twoFingerAngle(e); last = null }
            MotionEvent.ACTION_MOVE -> {
                if (e.pointerCount >= 2) {
                    val a = twoFingerAngle(e)
                    lastAngle?.let { angle += a - it }
                    lastAngle = a
                } else {
                    val b = viewToBoard(e.x, e.y, hm)
                    last?.let { tx += b.x - it.x; ty += b.y - it.y }
                    last = b
                }
                invalidate()
            }
            MotionEvent.ACTION_POINTER_UP -> { last = null; lastAngle = null }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { last = null; lastAngle = null }
        }
        return true
    }

    private fun twoFingerAngle(e: MotionEvent) = atan2((e.getY(1) - e.getY(0)).toDouble(), (e.getX(1) - e.getX(0)).toDouble())
}
