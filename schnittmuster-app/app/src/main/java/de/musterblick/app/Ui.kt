package de.musterblick.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.FileProvider
import org.opencv.android.OpenCVLoader
import java.io.File

object Ui {
    private var cvReady = false
    fun initCv() { if (!cvReady) cvReady = OpenCVLoader.initLocal() }

    fun dp(ctx: Context, v: Int) = (v * ctx.resources.displayMetrics.density).toInt()

    fun column(ctx: Context) = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        val p = dp(ctx, 16); setPadding(p, p, p, p)
    }
    fun row(ctx: Context) = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }

    fun title(ctx: Context, s: String) = TextView(ctx).apply {
        text = s; textSize = 22f; setTypeface(typeface, Typeface.BOLD); setTextColor(Color.rgb(63, 49, 38))
        setPadding(0, dp(ctx, 4), 0, dp(ctx, 8))
    }
    fun label(ctx: Context, s: String, size: Float = 15f) = TextView(ctx).apply {
        text = s; textSize = size; setTextColor(Color.rgb(70, 60, 52)); setPadding(0, dp(ctx, 4), 0, dp(ctx, 4))
    }
    fun button(ctx: Context, s: String, primary: Boolean = false, onClick: () -> Unit) = Button(ctx).apply {
        text = s; isAllCaps = false; textSize = 16f
        if (primary) { setBackgroundColor(Color.rgb(178, 58, 58)); setTextColor(Color.WHITE) }
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(ctx, 6)
        }
    }
    fun weighted(v: android.view.View, w: Float = 1f) = v.apply {
        layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, w).apply { marginEnd = dp(context, 4) }
    }

    fun sharePdf(act: Activity, f: File) {
        val uri = FileProvider.getUriForFile(act, act.packageName + ".files", f)
        val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val send = Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val chooser = Intent.createChooser(send, "PDF drucken, speichern oder teilen").putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(view))
        act.startActivity(chooser)
    }
}
