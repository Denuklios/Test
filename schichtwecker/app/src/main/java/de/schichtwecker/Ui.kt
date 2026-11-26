package de.schichtwecker

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView

/** Kleine Helfer, damit die Oberfläche ohne XML-Layouts auskommt. */
object Ui {
    const val BG = 0xFF0F1420.toInt()
    const val CARD = 0xFF1A2233.toInt()
    const val CARD2 = 0xFF232D42.toInt()
    const val ACCENT = 0xFFFFB547.toInt()
    const val TEXT = 0xFFF2F4F8.toInt()
    const val MUTED = 0xFF98A2B8.toInt()
    const val WARN = 0xFFFF7A6B.toInt()
    const val OK = 0xFF6BD49A.toInt()

    fun Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    fun rounded(color: Int, radius: Float, stroke: Int = 0, strokeColor: Int = 0) = GradientDrawable().apply {
        setColor(color); cornerRadius = radius
        if (stroke > 0) setStroke(stroke, strokeColor)
    }

    fun Context.vbox(pad: Int = 0) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(pad), dp(pad), dp(pad), dp(pad))
    }

    fun Context.hbox() = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
    }

    fun Context.card(color: Int = CARD) = vbox(16).apply {
        background = rounded(color, dp(18).toFloat())
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            .apply { bottomMargin = dp(12) }
    }

    fun Context.text(s: CharSequence, size: Float = 15f, color: Int = TEXT, bold: Boolean = false) = TextView(this).apply {
        text = s; textSize = size; setTextColor(color)
        if (bold) typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }

    fun Context.button(label: String, primary: Boolean = false, onClick: () -> Unit) = Button(this).apply {
        text = label; isAllCaps = false; textSize = 15f
        setTextColor(if (primary) BG else TEXT)
        background = rounded(if (primary) ACCENT else CARD2, dp(14).toFloat())
        setPadding(dp(16), dp(10), dp(16), dp(10))
        stateListAnimator = null
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(50)).apply { topMargin = dp(8) }
    }

    fun Context.switchRow(label: String, sub: String?, checked: Boolean, onChange: (Boolean) -> Unit): View {
        val row = hbox().apply { setPadding(0, dp(10), 0, dp(10)) }
        val col = vbox()
        col.addView(text(label, 16f))
        if (sub != null) col.addView(text(sub, 13f, MUTED))
        row.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val sw = Switch(this).apply { isChecked = checked; setOnCheckedChangeListener { _, v -> onChange(v) } }
        row.addView(sw)
        row.setOnClickListener { sw.toggle() }
        return row
    }

    /** Zeile mit Titel + aktuellem Wert, Klick öffnet Editor */
    fun Context.valueRow(label: String, value: String, onClick: () -> Unit): View {
        val row = hbox().apply { setPadding(0, dp(12), 0, dp(12)) }
        row.addView(text(label, 16f), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        row.addView(text(value, 15f, ACCENT).apply { gravity = Gravity.END; maxWidth = dp(190) })
        row.setOnClickListener { onClick() }
        return row
    }

    fun Context.section(title: String) = text(title.uppercase(), 12f, MUTED, bold = true).apply {
        letterSpacing = 0.08f; setPadding(dp(4), dp(18), 0, dp(8))
    }

    fun Context.divider() = View(this).apply {
        setBackgroundColor(Color.argb(30, 255, 255, 255))
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1)
    }
}
