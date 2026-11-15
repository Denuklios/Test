package de.familie.familienkalender

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView

/** Hier stellt man ein, wie das Widget aussieht: Tag, Woche, Monat oder Liste – und wessen Termine. */
class WidgetConfigActivity : Activity() {
    private var id = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        id = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

        val cfg = WidgetCfg.load(this, id)
        val data = WidgetData.load(this)
        val me = data?.optString("me").orEmpty()
        val members = mutableListOf<Triple<String, String, Int>>()
        data?.optJSONArray("members")?.let { a ->
            for (i in 0 until a.length()) a.optJSONObject(i)?.let {
                if (!it.optBoolean("deleted")) members.add(Triple(it.optString("id"), it.optString("name"), it.optInt("color")))
            }
        }

        val d = resources.displayMetrics.density
        fun px(v: Int) = (v * d).toInt()
        val accent = 0xFF1976D2.toInt()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(px(20), px(20), px(20), px(20)); setBackgroundColor(Color.WHITE) }
        fun head(t: String) = root.addView(TextView(this).apply {
            text = t; textSize = 17f; setTextColor(0xFF202124.toInt()); setTypeface(typeface, android.graphics.Typeface.BOLD); setPadding(0, px(16), 0, px(6))
        })
        fun radios(options: List<Pair<String, String>>, selected: String): RadioGroup {
            val g = RadioGroup(this)
            for ((k, label) in options) g.addView(RadioButton(this).apply {
                text = label; textSize = 16f; tag = k; id = View_generateId(); buttonTintList = ColorStateList.valueOf(accent)
                setTextColor(0xFF202124.toInt()); isChecked = k == selected; minHeight = px(44)
            })
            root.addView(g)
            return g
        }
        fun RadioGroup.value(): String? = (0 until childCount).map { getChildAt(it) as RadioButton }.firstOrNull { it.isChecked }?.tag as String?

        root.addView(TextView(this).apply { text = "Kalender-Widget einrichten"; textSize = 22f; setTextColor(0xFF202124.toInt()); setTypeface(typeface, android.graphics.Typeface.BOLD) })

        head("Ansicht")
        val view = radios(listOf("day" to "Tag (heute, danach morgen …)", "week" to "Woche", "month" to "Monat", "list" to "Nächste Termine (Liste)"), cfg.view)

        head("Wessen Termine?")
        val boxes = mutableListOf<Pair<String, CheckBox>>()
        if (members.isEmpty()) {
            root.addView(TextView(this).apply { text = "Bitte zuerst den Familienkalender einmal öffnen, dann erscheinen hier alle Personen."; textSize = 15f; setTextColor(0xFF6B6B6B.toInt()) })
        }
        val quick = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        for (m in members) {
            val cb = CheckBox(this).apply {
                text = m.second + if (m.first == me) " (ich)" else ""; textSize = 16f; minHeight = px(44)
                buttonTintList = ColorStateList.valueOf(m.third); setTextColor(0xFF202124.toInt())
                isChecked = cfg.people == null || m.first in cfg.people!!
            }
            boxes.add(m.first to cb)
            root.addView(cb)
        }
        val general = CheckBox(this).apply { text = "Allgemeine Termine (Müll, Ferien …)"; textSize = 16f; minHeight = px(44); isChecked = cfg.general; buttonTintList = ColorStateList.valueOf(0xFF26A69A.toInt()); setTextColor(0xFF202124.toInt()) }
        val bdays = CheckBox(this).apply { text = "Geburtstage"; textSize = 16f; minHeight = px(44); isChecked = cfg.birthdays; buttonTintList = ColorStateList.valueOf(0xFFFF5722.toInt()); setTextColor(0xFF202124.toInt()) }
        root.addView(general); root.addView(bdays)
        fun qb(t: String, on: () -> Unit) = quick.addView(Button(this).apply {
            text = t; isAllCaps = false; textSize = 15f; setOnClickListener { on() }
        }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginEnd = px(8) })
        if (members.isNotEmpty()) {
            if (me.isNotEmpty()) qb("Nur ich") { boxes.forEach { (k, cb) -> cb.isChecked = k == me } }
            qb("Alle") { boxes.forEach { it.second.isChecked = true }; general.isChecked = true; bdays.isChecked = true }
            root.addView(quick)
        }

        head("Aussehen")
        val theme = radios(listOf("light" to "Hell", "dark" to "Dunkel", "glass" to "Durchsichtig"), cfg.theme)
        head("Schrift")
        val size = radios(listOf("normal" to "Normal", "big" to "Groß"), if (cfg.big) "big" else "normal")

        val done = Button(this).apply {
            text = "Fertig"; textSize = 18f; isAllCaps = false; setTextColor(Color.WHITE)
            background = GradientDrawable().apply { setColor(accent); cornerRadius = px(24).toFloat() }
            setOnClickListener {
                val c = WidgetCfg(
                    view = view.value() ?: "day",
                    people = if (boxes.isEmpty() || boxes.all { it.second.isChecked }) null else boxes.filter { it.second.isChecked }.map { it.first }.toMutableSet(),
                    general = general.isChecked,
                    birthdays = bdays.isChecked,
                    theme = theme.value() ?: "light",
                    big = size.value() == "big",
                )
                WidgetCfg.save(this@WidgetConfigActivity, this@WidgetConfigActivity.id, c)
                KalenderWidget.update(this@WidgetConfigActivity, AppWidgetManager.getInstance(this@WidgetConfigActivity), this@WidgetConfigActivity.id)
                setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, this@WidgetConfigActivity.id))
                finish()
            }
        }
        root.addView(done, LinearLayout.LayoutParams(MATCH_PARENT, px(52)).apply { topMargin = px(24) })
        root.gravity = Gravity.START
        setContentView(ScrollView(this).apply { setBackgroundColor(Color.WHITE); addView(root) })
    }

    @Suppress("FunctionName")
    private fun View_generateId() = android.view.View.generateViewId()
}
