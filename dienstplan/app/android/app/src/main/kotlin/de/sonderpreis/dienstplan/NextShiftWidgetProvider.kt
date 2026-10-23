package de.sonderpreis.dienstplan

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.res.ColorStateList
import android.graphics.Color
import android.os.Build
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetPlugin
import es.antonborri.home_widget.HomeWidgetProvider
import org.json.JSONArray
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Home-Screen-Widget „Nächster Dienst“.
 * Die App legt die kommenden Dienste als Liste ab; das Widget wählt selbst den aktuellen bzw.
 * nächsten aus. So stimmt die Anzeige auch offline und nach Mitternacht.
 */
class NextShiftWidgetProvider : HomeWidgetProvider() {

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == Intent.ACTION_TIME_CHANGED || intent.action == Intent.ACTION_DATE_CHANGED) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, NextShiftWidgetProvider::class.java))
            onUpdate(context, mgr, ids, HomeWidgetPlugin.getData(context))
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray, widgetData: SharedPreferences) {
        for (id in appWidgetIds) {
            appWidgetManager.updateAppWidget(id, build(context, widgetData))
        }
    }

    private fun build(context: Context, data: SharedPreferences): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.next_shift_widget)
        val open = Intent(context, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP }
        v.setOnClickPendingIntent(
            R.id.widget_root,
            PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )

        when (data.getString("state", "logout")) {
            "admin" -> return text(v, "Dienstplan", "Admin-Konto", "Antippen zum Planen", null)
            "logout" -> return text(v, "Dienstplan", "App öffnen zum Anmelden", "", null)
        }

        val now = System.currentTimeMillis()
        val list = try { JSONArray(data.getString("shifts", "[]")) } catch (e: Exception) { JSONArray() }
        for (i in 0 until list.length()) {
            val o = list.getJSONObject(i)
            val start = o.optLong("start")
            val end = o.optLong("end")
            if (end <= now) continue
            val color = try { Color.parseColor(o.optString("color", "#94a3b8")) } catch (e: Exception) { Color.GRAY }
            val running = start <= now
            v.setTextViewText(R.id.widget_label, if (running) "JETZT IM DIENST" else "NÄCHSTER DIENST")
            val note = o.optString("note", "")
            val sub = when {
                running -> "noch " + duration(end - now)
                else -> listOfNotNull(relativeDay(start), countdown(start - now), note.ifEmpty { null }).joinToString(" · ")
            }
            return text(v, o.optString("name"), o.optString("day") + "  " + o.optString("time"), sub, color)
        }
        return text(v, "Kein Dienst", "in den nächsten Wochen", "", null)
    }

    private fun text(v: RemoteViews, title: String, time: String, sub: String, color: Int?): RemoteViews {
        v.setTextViewText(R.id.widget_title, title)
        v.setTextViewText(R.id.widget_time, time)
        v.setTextViewText(R.id.widget_sub, sub)
        val c = color ?: Color.parseColor("#E8590C")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            v.setColorStateList(R.id.widget_bar, "setImageTintList", ColorStateList.valueOf(c))
        } else {
            v.setInt(R.id.widget_bar, "setColorFilter", c)
        }
        return v
    }

    private fun relativeDay(start: Long): String? {
        val today = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
        val day = Calendar.getInstance().apply { timeInMillis = start; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
        val diff = Math.round((day.timeInMillis - today.timeInMillis) / 86400000.0).toInt()
        return when (diff) {
            0 -> "Heute"
            1 -> "Morgen"
            2 -> "Übermorgen"
            else -> null
        }
    }

    private fun countdown(ms: Long): String = "in " + duration(ms)

    private fun duration(ms: Long): String {
        val mins = TimeUnit.MILLISECONDS.toMinutes(ms + 59_999)
        if (mins < 60) return "$mins Min."
        val h = mins / 60
        if (h < 24) return if (mins % 60 == 0L) "$h Std." else "$h Std. ${mins % 60} Min."
        val d = h / 24
        return if (d == 1L) "1 Tag" else "$d Tagen"
    }
}
