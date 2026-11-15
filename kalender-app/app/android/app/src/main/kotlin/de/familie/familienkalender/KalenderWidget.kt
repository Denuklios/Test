package de.familie.familienkalender

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Bundle
import android.text.TextPaint
import android.text.TextUtils
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit
import java.time.temporal.IsoFields
import kotlin.math.max
import kotlin.math.min

/** Einstellungen eines einzelnen Widgets (jedes Widget kann anders aussehen). */
data class WidgetCfg(
    var view: String = "day",          // day | week | month | list
    var people: MutableSet<String>? = null, // null = alle
    var general: Boolean = true,      // Termine ohne Person („Allgemein“)
    var birthdays: Boolean = true,
    var theme: String = "light",      // light | dark | glass
    var big: Boolean = false,
) {
    fun toJson(): String = JSONObject().apply {
        put("view", view); put("general", general); put("birthdays", birthdays); put("theme", theme); put("big", big)
        if (people != null) put("people", JSONArray(people!!.toList()))
    }.toString()

    companion object {
        fun load(ctx: Context, id: Int): WidgetCfg {
            val s = ctx.getSharedPreferences(KalenderWidget.PREFS, Context.MODE_PRIVATE).getString("cfg_$id", null) ?: return WidgetCfg()
            return try {
                val j = JSONObject(s)
                WidgetCfg(
                    view = j.optString("view", "day"),
                    people = j.optJSONArray("people")?.let { a -> (0 until a.length()).map { a.optString(it) }.toMutableSet() },
                    general = j.optBoolean("general", true),
                    birthdays = j.optBoolean("birthdays", true),
                    theme = j.optString("theme", "light"),
                    big = j.optBoolean("big", false),
                )
            } catch (_: Exception) { WidgetCfg() }
        }

        fun save(ctx: Context, id: Int, c: WidgetCfg) {
            ctx.getSharedPreferences(KalenderWidget.PREFS, Context.MODE_PRIVATE).edit().putString("cfg_$id", c.toJson()).apply()
        }
    }
}

class WOcc(val title: String, val start: LocalDateTime, val end: LocalDateTime, val allDay: Boolean,
           val first: LocalDate, val last: LocalDate, val colors: IntArray, val birthday: Boolean, val vacation: Boolean) {
    fun covers(d: LocalDate) = !d.isBefore(first) && !d.isAfter(last)
    val timed get() = !allDay && !birthday && first == last
}

/** Kalenderdaten fürs Widget: schreibt die App, Änderungen anderer mischt der Hintergrund-Abruf ein. */
object WidgetData {
    private fun file(ctx: Context) = File(ctx.filesDir, "widget.json")

    fun save(ctx: Context, json: String) {
        val f = file(ctx)
        val tmp = File(f.path + ".tmp")
        tmp.writeText(json)
        tmp.renameTo(f)
    }

    fun load(ctx: Context): JSONObject? = try {
        val f = file(ctx)
        if (f.exists()) JSONObject(f.readText()) else null
    } catch (_: Exception) { null }

    /** Vom Server geholte, geänderte Termine übernehmen (App muss dafür nicht offen sein). */
    fun merge(ctx: Context, changed: JSONArray) {
        val d = load(ctx) ?: return
        val evs = d.optJSONArray("events") ?: JSONArray()
        val byId = LinkedHashMap<String, JSONObject>()
        for (i in 0 until evs.length()) evs.optJSONObject(i)?.let { byId[it.optString("id")] = it }
        val memberColors = HashMap<String, Int>()
        d.optJSONArray("members")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { memberColors[it.optString("id")] = it.optInt("color") } }
        val bday = d.optInt("bday", 0xFFFF5722.toInt())
        for (i in 0 until changed.length()) {
            val e = changed.optJSONObject(i) ?: continue
            val id = e.optString("id")
            if (e.optBoolean("deleted")) { byId.remove(id); continue }
            val old = byId[id]
            val people = peopleOf(e)
            val cols = JSONArray()
            when {
                e.optString("kind") == "birthday" -> cols.put(bday)
                !e.isNull("color") && e.optLong("color", 0) != 0L -> cols.put(e.optLong("color").toInt())
                old != null && old.optJSONArray("_c") != null && peopleOf(old) == people -> {
                    val oc = old.optJSONArray("_c")!!; for (k in 0 until oc.length()) cols.put(oc.optInt(k))
                }
                else -> { people.mapNotNull { memberColors[it] }.distinct().forEach { cols.put(it) }; if (cols.length() == 0) cols.put(0xFF26A69A.toInt()) }
            }
            val slim = JSONObject()
            for (k in listOf("id", "title", "start", "end", "allDay", "ownerId", "participants", "kind", "repeat", "repeatUntil", "birthYear", "interval", "exdates")) {
                if (e.has(k)) slim.put(k, e.get(k))
            }
            slim.put("_c", cols)
            byId[id] = slim
        }
        d.put("events", JSONArray(byId.values.toList()))
        save(ctx, d.toString())
    }

    fun peopleOf(e: JSONObject): List<String> {
        val l = mutableListOf<String>()
        e.optString("ownerId").takeIf { it.isNotEmpty() }?.let { l.add(it) }
        e.optJSONArray("participants")?.let { a -> for (i in 0 until a.length()) a.optString(i).takeIf { it.isNotEmpty() && it !in l }?.let { l.add(it) } }
        return l
    }

    private fun parse(s: String?): LocalDateTime? {
        if (s.isNullOrEmpty() || s == "null" || s.length < 10) return null
        return try {
            val d = LocalDate.parse(s.substring(0, 10))
            if (s.length >= 16) d.atTime(s.substring(11, 13).toInt(), s.substring(14, 16).toInt()) else d.atStartOfDay()
        } catch (_: Exception) { null }
    }

    /** Alle sichtbaren Vorkommen im Zeitraum, wie in der App (inkl. Wiederholungen, Abstand, ausgelassene Tage). */
    fun occurrences(d: JSONObject, cfg: WidgetCfg, from: LocalDate, to: LocalDate): List<WOcc> {
        val names = HashMap<String, String>()
        d.optJSONArray("members")?.let { a -> for (i in 0 until a.length()) a.optJSONObject(i)?.let { names[it.optString("id")] = it.optString("name") } }
        val res = mutableListOf<WOcc>()
        val evs = d.optJSONArray("events") ?: return res
        for (i in 0 until evs.length()) {
            val e = evs.optJSONObject(i) ?: continue
            if (e.optBoolean("deleted")) continue
            val kind = e.optString("kind", "normal")
            val birthday = kind == "birthday"
            val people = peopleOf(e)
            val visible = when {
                birthday -> cfg.birthdays
                people.isEmpty() -> cfg.general
                cfg.people == null -> true
                else -> people.any { it in cfg.people!! }
            }
            if (!visible) continue
            val s0 = parse(e.optString("start")) ?: continue
            val e0 = parse(e.optString("end")) ?: s0
            val allDay = e.optBoolean("allDay") || birthday
            val spanDays = ChronoUnit.DAYS.between(s0.toLocalDate(), e0.toLocalDate()).coerceAtLeast(0)
            val dur = ChronoUnit.MINUTES.between(s0, e0).coerceAtLeast(0)
            val ca = e.optJSONArray("_c")
            val colors = if (ca != null && ca.length() > 0) IntArray(ca.length()) { ca.optInt(it) } else intArrayOf(0xFF26A69A.toInt())
            val vacation = kind == "vacation"
            val title = e.optString("title")
            fun mk(s: LocalDateTime): WOcc {
                val en = if (allDay) s.toLocalDate().plusDays(spanDays).atStartOfDay() else s.plusMinutes(dur)
                val first = s.toLocalDate()
                var last = if (allDay) en.toLocalDate() else {
                    val x = if (en.isAfter(s) && en.hour == 0 && en.minute == 0) en.minusMinutes(1) else en
                    x.toLocalDate()
                }
                if (last.isBefore(first)) last = first
                val t = when {
                    birthday -> {
                        val by = e.optInt("birthYear", 0)
                        val age = if (by > 0) s.year - by else 0
                        "🎂 $title" + (if (age > 0) " ($age)" else "")
                    }
                    vacation -> {
                        val n = people.mapNotNull { names[it] }.filter { it.isNotEmpty() }.joinToString(", ")
                        val tt = title.ifBlank { "Urlaub" }
                        "🌴 " + (if (n.isEmpty()) tt else "$n: $tt")
                    }
                    else -> title
                }
                return WOcc(t, s, en, allDay, first, last, colors, birthday, vacation)
            }
            var repeat = if (birthday) "yearly" else e.optString("repeat", "none")
            var iv = if (birthday) 1 else e.optInt("interval", 1)
            if (repeat == "biweekly") { repeat = "weekly"; iv = 2 }
            if (iv < 1) iv = 1
            if (repeat == "none" || repeat.isEmpty()) {
                val o = mk(s0)
                if (!o.last.isBefore(from) && !o.first.isAfter(to)) res.add(o)
                continue
            }
            val skip = HashSet<String>()
            e.optJSONArray("exdates")?.let { a -> for (k in 0 until a.length()) skip.add(a.optString(k)) }
            val until = parse(e.optString("repeatUntil"))?.toLocalDate()
            fun nth(n: Long): LocalDateTime = when (repeat) {
                "daily" -> s0.plusDays(n * iv)
                "weekly" -> s0.plusWeeks(n * iv)
                "monthly" -> s0.plusMonths(n * iv) // kürzt automatisch auf das Monatsende
                else -> s0.plusYears(n * iv)
            }
            var n = 0L
            val daysTo = ChronoUnit.DAYS.between(s0.toLocalDate(), from) - spanDays - 2
            if (daysTo > 0) n = when (repeat) {
                "daily" -> daysTo / iv
                "weekly" -> daysTo / (7 * iv)
                "monthly" -> daysTo / (31 * iv)
                else -> daysTo / (366 * iv)
            }
            var guard = 0
            while (guard++ < 2000) {
                val s = nth(n++)
                if (s.toLocalDate().isAfter(to)) break
                if (until != null && s.toLocalDate().isAfter(until)) break
                if (s.toLocalDate().toString() in skip) continue
                val o = mk(s)
                if (!o.last.isBefore(from)) res.add(o)
            }
        }
        fun rank(o: WOcc) = if (o.vacation) 0 else if (o.birthday) 1 else if (o.allDay || o.last != o.first) 2 else 3
        res.sortWith(compareBy<WOcc> { it.first }.thenBy { rank(it) }
            .thenByDescending { ChronoUnit.DAYS.between(it.first, it.last) }.thenBy { it.start })
        return res
    }

    class Hol(val label: String, val free: Boolean)

    fun holidays(d: JSONObject): Map<LocalDate, List<Hol>> {
        val m = HashMap<LocalDate, MutableList<Hol>>()
        d.optJSONArray("hol")?.let { a ->
            for (i in 0 until a.length()) {
                val h = a.optJSONObject(i) ?: continue
                try { m.getOrPut(LocalDate.parse(h.optString("d"))) { mutableListOf() }.add(Hol(h.optString("l"), h.optBoolean("f"))) } catch (_: Exception) {}
            }
        }
        return m
    }
}

class KalenderWidget : AppWidgetProvider() {
    companion object {
        const val PREFS = "kalender_widget"

        fun updateAll(ctx: Context) {
            val m = AppWidgetManager.getInstance(ctx)
            val ids = m.getAppWidgetIds(ComponentName(ctx, KalenderWidget::class.java))
            for (id in ids) update(ctx, m, id)
        }

        fun update(ctx: Context, m: AppWidgetManager, id: Int) {
            val rv = RemoteViews(ctx.packageName, R.layout.widget_kalender)
            try {
                val o = m.getAppWidgetOptions(id)
                val dm = ctx.resources.displayMetrics
                val portrait = ctx.resources.configuration.orientation != android.content.res.Configuration.ORIENTATION_LANDSCAPE
                var wDp = (if (portrait) o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) else o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH)).toFloat()
                var hDp = (if (portrait) o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) else o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT)).toFloat()
                if (wDp < 40) wDp = 300f
                if (hDp < 40) hDp = 200f
                var s = dm.density
                // Speichergrenze für Widget-Bilder einhalten
                val maxPx = 1_600_000f
                if (wDp * s * hDp * s > maxPx) s = kotlin.math.sqrt(maxPx / (wDp * hDp))
                val bmp = WidgetPainter(ctx, WidgetCfg.load(ctx, id), WidgetData.load(ctx), s, dm.scaledDensity / dm.density)
                    .draw((wDp * s).toInt(), (hDp * s).toInt())
                rv.setImageViewBitmap(R.id.widget_img, bmp)
            } catch (e: Exception) {
                android.util.Log.e("KalenderWidget", "draw", e)
            }
            val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            rv.setOnClickPendingIntent(R.id.widget_img, open)
            val cfg = PendingIntent.getActivity(ctx, 1000 + id,
                Intent(ctx, WidgetConfigActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            rv.setOnClickPendingIntent(R.id.widget_cfg, cfg)
            m.updateAppWidget(id, rv)
        }
    }

    override fun onUpdate(ctx: Context, m: AppWidgetManager, ids: IntArray) {
        for (id in ids) update(ctx, m, id)
    }

    override fun onAppWidgetOptionsChanged(ctx: Context, m: AppWidgetManager, id: Int, newOptions: Bundle) {
        update(ctx, m, id)
    }

    override fun onDeleted(ctx: Context, ids: IntArray) {
        val e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
        for (id in ids) e.remove("cfg_$id")
        e.apply()
    }
}

/** Zeichnet das Widget als Bild – so sieht es überall gleich aus, egal welcher Startbildschirm. */
class WidgetPainter(val ctx: Context, val cfg: WidgetCfg, val data: JSONObject?, val s: Float, fontScale: Float) {
    private val today = LocalDate.now()
    private val f = (if (cfg.big) 1.25f else 1f) * fontScale.coerceIn(0.85f, 1.3f)
    private val bg: Int
    private val fg: Int
    private val sub: Int
    private val line: Int
    private val todayBg: Int
    private val red = 0xFFE53935.toInt()

    init {
        when (cfg.theme) {
            "dark" -> { bg = 0xF0202124.toInt(); fg = Color.WHITE; sub = 0xFFB0B0B0.toInt(); line = 0x33FFFFFF; todayBg = 0x553F8EF5 }
            "glass" -> { bg = 0x66000000; fg = Color.WHITE; sub = 0xFFE0E0E0.toInt(); line = 0x33FFFFFF; todayBg = 0x553F8EF5 }
            else -> { bg = 0xF7FFFFFF.toInt(); fg = 0xFF202124.toInt(); sub = 0xFF6B6B6B.toInt(); line = 0x22000000; todayBg = 0xFFBBDEFB.toInt() }
        }
    }

    private fun dp(v: Float) = v * s
    private fun tp(sizeSp: Float, color: Int, bold: Boolean = false) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = dp(sizeSp * f); this.color = color; typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

    private fun ellip(t: String, p: TextPaint, w: Float) = if (w <= 0) "" else TextUtils.ellipsize(t, p, w, TextUtils.TruncateAt.END).toString()
    private fun clip(t: String, p: TextPaint, w: Float): String {
        if (w <= 0) return ""
        val n = p.breakText(t, true, w, null)
        return t.substring(0, n)
    }

    private fun readable(colors: IntArray): Int {
        val c = colors[0]
        val l = (0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c)) / 255
        return if (l > 0.68) 0xFF202124.toInt() else Color.WHITE
    }

    private fun fillColors(c: Canvas, r: RectF, colors: IntArray, radius: Float, alpha: Int = 255) {
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        if (colors.size == 1) {
            p.color = colors[0]; p.alpha = alpha
            c.drawRoundRect(r, radius, radius, p); return
        }
        c.save()
        val path = android.graphics.Path().apply { addRoundRect(r, radius, radius, android.graphics.Path.Direction.CW) }
        c.clipPath(path)
        val w = r.width() / colors.size
        colors.forEachIndexed { i, col -> p.color = col; p.alpha = alpha; c.drawRect(r.left + i * w, r.top, r.left + (i + 1) * w + 1, r.bottom, p) }
        c.restore()
    }

    private val wd = arrayOf("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
    private val mon = arrayOf("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember")
    private fun hhmm(t: LocalDateTime) = "%02d:%02d".format(t.hour, t.minute)

    fun draw(w: Int, h: Int): Bitmap {
        val bmp = Bitmap.createBitmap(max(w, 10), max(h, 10), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = bg }
        c.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), dp(18f), dp(18f), p)
        if (data == null) {
            val t = tp(14f, fg)
            c.drawText("Bitte Familienkalender einmal öffnen", dp(14f), h / 2f, t)
            return bmp
        }
        val headH = dp(30f * f)
        val title = when (cfg.view) {
            "week" -> {
                val mo = today.with(DayOfWeek.MONDAY)
                "KW ${today.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)} · ${mo.dayOfMonth}.${mo.monthValue}.–${mo.plusDays(6).dayOfMonth}.${mo.plusDays(6).monthValue}."
            }
            "month" -> "${mon[today.monthValue - 1]} ${today.year}"
            "list" -> "Nächste Termine"
            else -> "${wd[today.dayOfWeek.value - 1]}., ${today.dayOfMonth}. ${mon[today.monthValue - 1]}"
        }
        val tpH = tp(15f, fg, true)
        // rechts bleibt Platz für das Zahnrad
        c.drawText(ellip(title, tpH, w - dp(14f) - dp(40f)), dp(14f), headH * 0.5f + dp(5f * f) + dp(4f), tpH)
        val area = RectF(dp(8f), headH + dp(4f), w - dp(8f), h - dp(8f))
        when (cfg.view) {
            "week" -> drawWeek(c, area)
            "month" -> drawMonth(c, area)
            "list" -> drawAgenda(c, area, 60, false)
            else -> drawAgenda(c, area, 1, true)
        }
        return bmp
    }

    // ---------- Tag / Liste ----------
    private fun drawAgenda(c: Canvas, a: RectF, days: Int, dayMode: Boolean) {
        val hol = WidgetData.holidays(data!!)
        val occ = WidgetData.occurrences(data, cfg, today, today.plusDays(if (dayMode) 7 else days.toLong()))
        val rowH = dp(24f * f)
        val headH = dp(20f * f)
        var y = a.top
        val tTitle = tp(13.5f, fg)
        val tTime = tp(12f, sub)
        val tDay = tp(12f, sub, true)
        var d = today
        var shownDays = 0
        val lastDay = today.plusDays(if (dayMode) 7 else days.toLong())
        var anything = false
        while (!d.isAfter(lastDay) && y + rowH <= a.bottom) {
            val list = occ.filter { it.covers(d) }
            val h = hol[d]?.filter { it.free }.orEmpty()
            val isToday = d == today
            if (list.isNotEmpty() || h.isNotEmpty() || (dayMode && isToday)) {
                // Im Tagesmodus: heute immer, danach nur so viel wie Platz ist (morgen, übermorgen …)
                if (dayMode && !isToday && shownDays >= 1 && y + headH + rowH > a.bottom) break
                if (!(dayMode && isToday)) {
                    val label = when (ChronoUnit.DAYS.between(today, d)) {
                        0L -> "Heute"; 1L -> "Morgen"
                        else -> "${wd[d.dayOfWeek.value - 1]}., ${d.dayOfMonth}.${d.monthValue}."
                    } + (if (h.isNotEmpty()) " · " + h.joinToString(", ") { it.label } else "")
                    if (y + headH + (if (list.isEmpty()) 0f else rowH) > a.bottom) break
                    tDay.color = if (h.isNotEmpty() || d.dayOfWeek == DayOfWeek.SUNDAY) red else sub
                    c.drawText(ellip(label, tDay, a.width()), a.left + dp(4f), y + headH * 0.72f, tDay)
                    y += headH
                } else if (h.isNotEmpty()) {
                    tDay.color = red
                    c.drawText(ellip(h.joinToString(", ") { it.label }, tDay, a.width()), a.left + dp(4f), y + headH * 0.72f, tDay)
                    y += headH
                }
                if (dayMode && isToday && list.isEmpty()) {
                    c.drawText("Heute keine Termine", a.left + dp(4f), y + rowH * 0.7f, tp(13.5f, sub))
                    y += rowH
                }
                for (o in list) {
                    if (y + rowH > a.bottom) break
                    val r = RectF(a.left + dp(2f), y + dp(3f), a.left + dp(7f), y + rowH - dp(3f))
                    fillColors(c, r, o.colors, dp(2.5f), if (o.vacation) 140 else 255)
                    val time = when {
                        o.timed -> hhmm(o.start)
                        o.first != o.last && !o.allDay && d == o.first -> "ab " + hhmm(o.start)
                        o.first != o.last && !o.allDay && d == o.last -> "bis " + hhmm(o.end)
                        else -> ""
                    }
                    var x = a.left + dp(13f)
                    if (time.isNotEmpty()) {
                        c.drawText(time, x, y + rowH * 0.68f, tTime)
                        x += tTime.measureText("00:00") + dp(8f)
                    }
                    c.drawText(ellip(o.title, tTitle, a.right - x), x, y + rowH * 0.68f, tTitle)
                    y += rowH
                    anything = true
                }
                shownDays++
            }
            d = d.plusDays(1)
        }
        if (!dayMode && !anything) c.drawText("Keine Termine", a.left + dp(4f), a.top + rowH * 0.7f, tp(13.5f, sub))
    }

    // ---------- Woche ----------
    private fun drawWeek(c: Canvas, a: RectF) {
        val hol = WidgetData.holidays(data!!)
        val mo = today.with(DayOfWeek.MONDAY)
        val occ = WidgetData.occurrences(data, cfg, mo, mo.plusDays(6))
        val rowH = a.height() / 7
        val labW = dp(44f * f)
        val pillH = min(rowH - dp(4f), dp(20f * f))
        val tLab = tp(12.5f, fg, true)
        val tNum = tp(12.5f, fg)
        val tPill = tp(11.5f, Color.WHITE, true)
        val lp = Paint().apply { color = line }
        for (i in 0 until 7) {
            val d = mo.plusDays(i.toLong())
            val top = a.top + i * rowH
            if (d == today) c.drawRoundRect(RectF(a.left, top + dp(1f), a.right, top + rowH - dp(1f)), dp(6f), dp(6f), Paint(Paint.ANTI_ALIAS_FLAG).apply { color = todayBg })
            if (i > 0) c.drawRect(a.left + dp(4f), top, a.right - dp(4f), top + max(1f, dp(0.6f)), lp)
            val free = d.dayOfWeek == DayOfWeek.SUNDAY || hol[d].orEmpty().any { it.free }
            tLab.color = if (free) red else fg; tNum.color = tLab.color
            val baseY = top + rowH / 2 + dp(4.5f * f)
            c.drawText(wd[i], a.left + dp(4f), baseY, tLab)
            c.drawText("${d.dayOfMonth}", a.left + dp(4f) + tLab.measureText("Mo "), baseY, tNum)
            val list = occ.filter { it.covers(d) }
            var x = a.left + labW
            if (list.any { it.birthday }) {
                c.drawText("🎂", x, baseY, tp(12f, fg)); x += dp(18f * f)
            }
            val events = list.filter { !it.birthday }
            val lines = max(1, ((rowH - dp(2f)) / (pillH + dp(2f))).toInt())
            var lineNo = 0
            var py = top + (rowH - (min(lines, max(1, events.size)) * (pillH + dp(2f)) - dp(2f))) / 2
            if (events.isEmpty()) {
                val h = hol[d].orEmpty().firstOrNull()
                if (h != null) c.drawText(ellip(h.label, tp(11.5f, if (h.free) red else sub), a.right - x), x, baseY, tp(11.5f, if (h.free) red else sub))
                continue
            }
            val startX = x
            for ((k, o) in events.withIndex()) {
                val text = (if (o.timed) hhmm(o.start) + " " else "") + o.title
                val remaining = events.size - k
                var pw = min(tPill.measureText(text) + dp(10f), dp(130f * f))
                if (x + pw > a.right - dp(2f)) {
                    if (lineNo + 1 < lines) { lineNo++; py += pillH + dp(2f); x = startX }
                }
                val room = a.right - dp(2f) - x
                if (room < dp(14f)) break
                // Letzte Zeile, aber noch mehr Termine: lieber kleine Würfel als abgeschnitten
                if (lineNo == lines - 1 && remaining > 1 && pw > room - remaining * dp(12f)) {
                    val cube = min(pillH, dp(12f))
                    var cx = x
                    for (r in events.drop(k)) {
                        if (cx + cube > a.right - dp(2f)) break
                        fillColors(c, RectF(cx, py + (pillH - cube) / 2, cx + cube, py + (pillH + cube) / 2), r.colors, dp(3f), if (r.vacation) 140 else 255)
                        cx += cube + dp(3f)
                    }
                    break
                }
                pw = min(pw, room)
                val r = RectF(x, py, x + pw, py + pillH)
                fillColors(c, r, o.colors, dp(5f), if (o.vacation) 140 else 255)
                tPill.color = if (o.vacation) fg else readable(o.colors)
                c.drawText(clip(text, tPill, pw - dp(8f)), x + dp(4f), py + pillH / 2 + dp(4f * f), tPill)
                x += pw + dp(3f)
            }
        }
    }

    // ---------- Monat ----------
    private fun drawMonth(c: Canvas, a: RectF) {
        val hol = WidgetData.holidays(data!!)
        val first = today.withDayOfMonth(1)
        val gridStart = first.with(DayOfWeek.MONDAY)
        val lastOfMonth = first.plusMonths(1).minusDays(1)
        val weeks = ((ChronoUnit.DAYS.between(gridStart, lastOfMonth) / 7) + 1).toInt()
        val occ = WidgetData.occurrences(data, cfg, gridStart, gridStart.plusDays(weeks * 7L - 1))
        val headH = dp(16f * f)
        val tHead = tp(10.5f, sub, true)
        val cw = a.width() / 7
        for (i in 0 until 7) {
            tHead.color = if (i == 6) red else sub
            val t = wd[i]
            c.drawText(t, a.left + i * cw + (cw - tHead.measureText(t)) / 2, a.top + headH * 0.75f, tHead)
        }
        val rh = (a.height() - headH) / weeks
        val lp = Paint().apply { color = line }
        val tNum = tp(11f, fg)
        val numH = dp(14f * f)
        val tBar = tp(10f, Color.WHITE, true)
        for (w in 0 until weeks) {
            val top = a.top + headH + w * rh
            val ws = gridStart.plusDays(w * 7L)
            c.drawRect(a.left, top, a.right, top + max(1f, dp(0.6f)), lp)
            val birthdayCols = HashSet<Int>()
            // Balken je Woche mit Spuren wie in der App
            class Bar(val s: Int, val e: Int, val o: WOcc?, val text: String, val colors: IntArray, val txtColor: Int?) { var lane = 0 }
            val bars = mutableListOf<Bar>()
            for (o in occ) {
                if (o.last.isBefore(ws) || o.first.isAfter(ws.plusDays(6))) continue
                val sc = if (o.first.isBefore(ws)) 0 else ChronoUnit.DAYS.between(ws, o.first).toInt()
                val ec = if (o.last.isAfter(ws.plusDays(6))) 6 else ChronoUnit.DAYS.between(ws, o.last).toInt()
                if (o.birthday) { birthdayCols.add(sc); continue }
                bars.add(Bar(sc, ec, o, o.title, o.colors, null))
            }
            for (i in 0 until 7) hol[ws.plusDays(i.toLong())].orEmpty().filter { it.free }.forEach {
                bars.add(Bar(i, i, null, it.label, intArrayOf(0xFF64B5F6.toInt()), Color.WHITE))
            }
            val lanes = mutableListOf<BooleanArray>()
            for (b in bars) {
                var l = 0
                while (true) {
                    if (l >= lanes.size) lanes.add(BooleanArray(7))
                    if ((b.s..b.e).none { lanes[l][it] }) break
                    l++
                }
                for (k in b.s..b.e) lanes[l][k] = true
                b.lane = l
            }
            val availH = rh - numH - dp(2f)
            val gap = dp(1.5f)
            val barH = if (lanes.isEmpty()) dp(14f) else ((availH / lanes.size) - gap).coerceIn(dp(9f), dp(15f * f))
            val maxLanes = max(1, ((availH + dp(0.5f)) / (barH + gap)).toInt())
            val cubeLane = maxLanes - 1
            val cubeDay = BooleanArray(7)
            for (b in bars) if (b.lane > cubeLane) for (k in b.s..b.e) cubeDay[k] = true
            val asCube = HashSet<Bar>()
            var changed = true
            while (changed) {
                changed = false
                for (b in bars) {
                    if (b.lane != cubeLane || b in asCube) continue
                    if ((b.s..b.e).any { cubeDay[it] }) {
                        asCube.add(b)
                        for (k in b.s..b.e) if (!cubeDay[k]) { cubeDay[k] = true; changed = true }
                    }
                }
            }
            // Tageszahlen
            for (i in 0 until 7) {
                val d = ws.plusDays(i.toLong())
                val x0 = a.left + i * cw
                if (d == today) c.drawRoundRect(RectF(x0 + dp(1f), top + dp(1f), x0 + cw - dp(1f), top + rh - dp(1f)), dp(5f), dp(5f), Paint(Paint.ANTI_ALIAS_FLAG).apply { color = todayBg })
                val inMonth = d.monthValue == today.monthValue
                val free = d.dayOfWeek == DayOfWeek.SUNDAY || hol[d].orEmpty().any { it.free }
                tNum.color = if (free) red else fg
                tNum.alpha = if (inMonth) 255 else 90
                tNum.typeface = if (d == today) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
                val t = "${d.dayOfMonth}"
                c.drawText(t, x0 + cw - dp(3f) - tNum.measureText(t), top + numH * 0.82f, tNum)
                if (i in birthdayCols) c.drawText("🎂", x0 + dp(2f), top + numH * 0.82f, tp(9.5f, fg))
            }
            val showText = barH >= dp(9.5f)
            tBar.textSize = min(dp(10f * f), barH * 0.78f)
            for (b in bars) {
                if (b.lane > cubeLane || b in asCube) continue
                val r = RectF(a.left + b.s * cw + dp(1.5f), top + numH + b.lane * (barH + gap), a.left + (b.e + 1) * cw - dp(1.5f), top + numH + b.lane * (barH + gap) + barH)
                fillColors(c, r, b.colors, dp(3f), if (b.o?.vacation == true) 140 else 255)
                if (showText) {
                    tBar.color = b.txtColor ?: if (b.o?.vacation == true) fg else readable(b.colors)
                    c.drawText(clip(b.text, tBar, r.width() - dp(4f)), r.left + dp(2f), r.top + barH / 2 + tBar.textSize * 0.36f, tBar)
                }
            }
            val cube = min(barH, dp(9f))
            for (i in 0 until 7) {
                if (!cubeDay[i]) continue
                var cx = a.left + i * cw + dp(2f)
                var cy = top + numH + cubeLane * (barH + gap) + (barH - cube) / 2
                for (b in bars) {
                    if (!(b.lane > cubeLane || b in asCube) || i !in b.s..b.e) continue
                    if (cx + cube > a.left + (i + 1) * cw - dp(1f)) { cx = a.left + i * cw + dp(2f); cy += cube + dp(2f) }
                    if (cy + cube > top + rh) break
                    fillColors(c, RectF(cx, cy, cx + cube, cy + cube), b.colors, dp(2f))
                    cx += cube + dp(2f)
                }
            }
        }
    }
}
