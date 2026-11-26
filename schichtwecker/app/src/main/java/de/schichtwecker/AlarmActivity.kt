package de.schichtwecker

import android.app.Activity
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.EditText
import android.widget.LinearLayout
import de.schichtwecker.Ui.button
import de.schichtwecker.Ui.dp
import de.schichtwecker.Ui.text
import de.schichtwecker.Ui.vbox
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

/** Vollbild-Wecker über dem Sperrbildschirm. */
class AlarmActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())
    private val done = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) = finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true); setTurnScreenOn(true)
            getSystemService(KeyguardManager::class.java).requestDismissKeyguard(this, null)
        }
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )
        val f = IntentFilter(AlarmService.ACTION_DONE)
        registerReceiver(done, f, RECEIVER_NOT_EXPORTED)
        build()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        try { unregisterReceiver(done) } catch (_: Exception) {}
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        if (!AlarmService.running) finish()
    }

    @Deprecated("Zurück-Taste soll den Wecker nicht verschwinden lassen")
    override fun onBackPressed() { /* bewusst ignoriert */ }

    private fun build() {
        val p = Prefs(this)
        val root = vbox(28).apply { gravity = Gravity.CENTER_HORIZONTAL; setBackgroundColor(0xFF0B0F18.toInt()) }
        val clock = text("", 84f, Ui.TEXT).apply { gravity = Gravity.CENTER }
        val date = text("", 18f, Ui.MUTED).apply { gravity = Gravity.CENTER }
        fun tick() {
            clock.text = SimpleDateFormat("HH:mm", Locale.GERMANY).format(Date())
            date.text = SimpleDateFormat("EEEE, d. MMMM", Locale.GERMANY).format(Date())
            handler.postDelayed({ tick() }, 5000)
        }
        tick()
        root.addView(text("⏰", 48f).apply { gravity = Gravity.CENTER; setPadding(0, dp(40), 0, 0) })
        root.addView(clock); root.addView(date)

        val shift = Planner.plan(this).firstOrNull { it.key == p.snoozeCountKey }
        val label = shift?.let {
            val hm = SimpleDateFormat("HH:mm", Locale.GERMANY)
            "${it.type.name}\nBeginn ${hm.format(Date(it.start))} · in ${Text.duration(it.start - System.currentTimeMillis())}"
        } ?: "Aufstehen!"
        root.addView(text(label, 20f, Ui.ACCENT, bold = true).apply {
            gravity = Gravity.CENTER; setPadding(0, dp(24), 0, dp(32))
        })

        val spacer = LinearLayout(this)
        root.addView(spacer, LinearLayout.LayoutParams(1, 0, 1f))

        val left = p.snoozeMax - p.snoozeCount
        if (left > 0) {
            root.addView(button("Schlummern · ${p.snoozeMin} Min  (noch $left×)") {
                AlarmService.send(this, AlarmService.ACTION_SNOOZE); finish()
            }.apply { layoutParams = (layoutParams as LinearLayout.LayoutParams).apply { height = dp(72) }; textSize = 19f })
        }

        if (p.mathTask) {
            mathBox(root, p.mathCount)
        } else {
            root.addView(button("Wecker aus", primary = true) {
                AlarmService.send(this, AlarmService.ACTION_DISMISS); finish()
            }.apply { layoutParams = (layoutParams as LinearLayout.LayoutParams).apply { height = dp(72); topMargin = dp(16) }; textSize = 20f })
        }
        setContentView(root)
    }

    /** Rechenaufgaben, damit man wirklich wach ist (wie bei Alarmy / Sleep as Android). */
    private fun mathBox(root: LinearLayout, count: Int) {
        var solved = 0
        val box = vbox().apply { setPadding(0, dp(16), 0, 0) }
        val q = text("", 30f, Ui.TEXT, bold = true).apply { gravity = Gravity.CENTER }
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_SIGNED
            textSize = 26f; gravity = Gravity.CENTER; setTextColor(Ui.TEXT)
            background = Ui.rounded(Ui.CARD2, dp(14).toFloat()); setPadding(dp(12), dp(12), dp(12), dp(12))
        }
        val status = text("", 14f, Ui.MUTED).apply { gravity = Gravity.CENTER }
        var answer = 0
        fun next() {
            val a = Random.nextInt(12, 89); val b = Random.nextInt(11, 49)
            if (Random.nextBoolean()) { q.text = "$a + $b = ?"; answer = a + b }
            else { val c = Random.nextInt(3, 9); q.text = "$b × $c = ?"; answer = b * c }
            input.setText(""); status.text = "Aufgabe ${solved + 1} von $count"
        }
        next()
        box.addView(q)
        box.addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(10) })
        box.addView(status)
        box.addView(button("Prüfen & ausschalten", primary = true) {
            if (input.text.toString().trim().toIntOrNull() == answer) {
                solved++
                if (solved >= count) { AlarmService.send(this, AlarmService.ACTION_DISMISS); finish() } else next()
            } else { status.text = "Falsch – neue Aufgabe"; status.setTextColor(Ui.WARN); next() }
        }.apply { layoutParams = (layoutParams as LinearLayout.LayoutParams).apply { height = dp(64) } })
        root.addView(box)
    }
}
