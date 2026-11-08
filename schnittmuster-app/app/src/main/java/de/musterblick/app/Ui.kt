package de.musterblick.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.FileProvider
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import com.google.android.material.chip.Chip
import org.opencv.android.OpenCVLoader
import java.io.File

object Ui {
    val INK = Color.rgb(43, 38, 34)
    val MUTED = Color.rgb(110, 100, 91)
    val PINE = Color.rgb(47, 74, 58)
    val PINE_SOFT = Color.rgb(220, 230, 222)
    val BERRY = Color.rgb(178, 58, 58)
    val LINEN = Color.rgb(243, 238, 230)
    val LINE = Color.rgb(226, 218, 207)

    private var cvReady = false
    fun initCv() { if (!cvReady) cvReady = OpenCVLoader.initLocal() }

    fun dp(ctx: Context, v: Int) = (v * ctx.resources.displayMetrics.density).toInt()
    fun dpf(ctx: Context, v: Float) = v * ctx.resources.displayMetrics.density

    fun lp(w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.WRAP_CONTENT, top: Int = 0) =
        LinearLayout.LayoutParams(w, h).apply { topMargin = top }

    fun column(ctx: Context, pad: Int = 16) = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        val p = dp(ctx, pad); setPadding(p, p, p, p)
    }
    fun row(ctx: Context) = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }

    /** Coloured top bar with title, optional subtitle and back arrow. */
    fun header(act: Activity, title: String, subtitle: String? = null, back: Boolean = true): View {
        val bar = row(act).apply {
            setBackgroundColor(PINE)
            setPadding(dp(act, if (back) 6 else 20), dp(act, 14), dp(act, 20), dp(act, 16))
        }
        if (back) {
            bar.addView(ImageView(act).apply {
                setImageResource(R.drawable.ic_back); setColorFilter(Color.WHITE)
                val p = dp(act, 12); setPadding(p, p, p, p)
                setOnClickListener { act.finish() }
                contentDescription = "Zurück"
            }, LinearLayout.LayoutParams(dp(act, 48), dp(act, 48)))
        }
        val texts = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(TextView(act).apply {
            text = title; setTextColor(Color.WHITE); textSize = if (back) 20f else 28f
            typeface = Typeface.create("serif", Typeface.BOLD); maxLines = 1; ellipsize = android.text.TextUtils.TruncateAt.END
        })
        subtitle?.let { texts.addView(TextView(act).apply { text = it; setTextColor(Color.argb(210, 255, 255, 255)); textSize = 14f }) }
        bar.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        return bar
    }

    fun card(ctx: Context) = MaterialCardView(ctx).apply {
        radius = dpf(ctx, 20f); cardElevation = 0f
        strokeColor = LINE; strokeWidth = dp(ctx, 1)
        setCardBackgroundColor(Color.WHITE)
    }
    fun cardBody(ctx: Context, card: MaterialCardView) = column(ctx, 18).also { card.addView(it) }

    fun h2(ctx: Context, s: String) = TextView(ctx).apply {
        text = s; textSize = 19f; setTextColor(INK); typeface = Typeface.create("serif", Typeface.BOLD)
    }
    fun body(ctx: Context, s: String, size: Float = 14.5f) = TextView(ctx).apply {
        text = s; textSize = size; setTextColor(MUTED); setLineSpacing(0f, 1.15f)
        setPadding(0, dp(ctx, 4), 0, dp(ctx, 4))
    }
    fun section(ctx: Context, s: String) = TextView(ctx).apply {
        text = s.uppercase(); textSize = 12.5f; letterSpacing = 0.08f; setTextColor(MUTED); typeface = Typeface.DEFAULT_BOLD
        setPadding(dp(ctx, 4), dp(ctx, 22), 0, dp(ctx, 8))
    }

    enum class Kind { PRIMARY, TONAL, OUTLINE, DANGER }
    fun button(ctx: Context, s: String, kind: Kind = Kind.PRIMARY, icon: Int? = null, onClick: () -> Unit): MaterialButton {
        val attr = if (kind == Kind.OUTLINE || kind == Kind.DANGER) com.google.android.material.R.attr.materialButtonOutlinedStyle
                   else com.google.android.material.R.attr.materialButtonStyle
        return MaterialButton(ctx, null, attr).apply {
            text = s; isAllCaps = false; textSize = 15.5f
            minHeight = dp(ctx, 54); cornerRadius = dp(ctx, 16)
            icon?.let { setIconResource(it); iconPadding = dp(ctx, 8) }
            when (kind) {
                Kind.PRIMARY -> { backgroundTintList = ColorStateList.valueOf(BERRY); setTextColor(Color.WHITE); iconTint = ColorStateList.valueOf(Color.WHITE) }
                Kind.TONAL -> { backgroundTintList = ColorStateList.valueOf(PINE_SOFT); setTextColor(PINE); iconTint = ColorStateList.valueOf(PINE) }
                Kind.OUTLINE -> { setTextColor(PINE); iconTint = ColorStateList.valueOf(PINE); strokeColor = ColorStateList.valueOf(LINE) }
                Kind.DANGER -> { setTextColor(BERRY); iconTint = ColorStateList.valueOf(BERRY); strokeColor = ColorStateList.valueOf(Color.argb(80, 178, 58, 58)) }
            }
            setOnClickListener { onClick() }
            layoutParams = lp(top = dp(ctx, 8))
        }
    }
    fun weighted(v: View, w: Float = 1f, gap: Int = 8) = v.apply {
        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, w).apply { marginEnd = dp(context, gap) }
    }
    fun chip(ctx: Context, s: String) = Chip(ctx).apply {
        text = s; isClickable = false; chipBackgroundColor = ColorStateList.valueOf(PINE_SOFT); setTextColor(PINE)
        chipStrokeWidth = 0f; textSize = 13f
    }

    fun sharePdf(act: Activity, f: File) {
        val uri = FileProvider.getUriForFile(act, act.packageName + ".files", f)
        val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val send = Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val chooser = Intent.createChooser(send, "PDF drucken, speichern oder teilen").putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(view))
        act.startActivity(chooser)
    }
}
