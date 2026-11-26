package de.schichtwecker

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import java.util.Calendar
import java.util.TimeZone

data class CalendarInfo(val id: Long, val name: String, val account: String, val color: Int)

/** Eine erkannte Schicht mit allen daraus berechneten Zeiten. */
data class PlannedShift(
    val key: String,
    val title: String,
    val type: ShiftType,
    val start: Long,
    val end: Long,
    val alarmAt: Long?,
    val silentFrom: Long?,
    val silentTo: Long?,
    val skipped: Boolean,
)

object Planner {

    fun hasCalendarPermission(ctx: Context) =
        ctx.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED

    fun calendars(ctx: Context): List<CalendarInfo> {
        if (!hasCalendarPermission(ctx)) return emptyList()
        val out = mutableListOf<CalendarInfo>()
        ctx.contentResolver.query(
            CalendarContract.Calendars.CONTENT_URI,
            arrayOf(
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.CALENDAR_COLOR,
            ), null, null, null
        )?.use { c ->
            while (c.moveToNext()) out += CalendarInfo(c.getLong(0), c.getString(1) ?: "?", c.getString(2) ?: "", c.getInt(3))
        }
        return out
    }

    /** Welche Schichtart passt zum Titel? Erste passende gewinnt. */
    fun match(title: String, types: List<ShiftType>): ShiftType? {
        val t = Text.norm(title)
        val words = t.split(Regex("[^a-z0-9]+")).filter { it.isNotEmpty() }
        for (type in types) {
            for (k in type.keywordList()) {
                if (t == k || words.contains(k)) return type
                if (k.length >= 3 && t.contains(k)) return type
            }
        }
        return null
    }

    /** Rohtermin aus einer Quelle */
    data class Raw(val key: String, val title: String, val begin: Long, val end: Long, val allDay: Boolean, val source: String)

    /** Alle Termine aus Familienkalender und (optional) Handy-Kalender */
    fun rawEvents(ctx: Context, from: Long, to: Long): List<Raw> {
        val out = mutableListOf<Raw>()
        for (o in Familienkalender.occurrences(ctx, from, to))
            out += Raw("fk_${o.id}_${o.start}", o.title, o.start, o.end, o.allDay, "Familienkalender")
        if (Prefs(ctx).useDeviceCalendar && hasCalendarPermission(ctx)) out += deviceEvents(ctx, from, to)
        return out.sortedBy { it.begin }
    }

    private fun deviceEvents(ctx: Context, from: Long, to: Long): List<Raw> {
        val cals = Prefs(ctx).calendarIds
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon().let {
            ContentUris.appendId(it, from); ContentUris.appendId(it, to); it.build()
        }
        val out = mutableListOf<Raw>()
        try {
            ctx.contentResolver.query(
                uri,
                arrayOf(
                    CalendarContract.Instances.EVENT_ID,
                    CalendarContract.Instances.BEGIN,
                    CalendarContract.Instances.END,
                    CalendarContract.Instances.TITLE,
                    CalendarContract.Instances.ALL_DAY,
                    CalendarContract.Instances.CALENDAR_ID,
                    CalendarContract.Instances.STATUS,
                ), null, null, CalendarContract.Instances.BEGIN + " ASC"
            )?.use { c ->
                while (c.moveToNext()) {
                    if (cals.isNotEmpty() && c.getLong(5).toString() !in cals) continue
                    if (!c.isNull(6) && c.getInt(6) == CalendarContract.Instances.STATUS_CANCELED) continue
                    val title = c.getString(3) ?: continue
                    var begin = c.getLong(1)
                    val allDay = c.getInt(4) == 1
                    if (allDay) {
                        // Ganztägig: Datum steht in UTC
                        val utc = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = begin }
                        begin = Calendar.getInstance().apply {
                            clear(); set(utc.get(Calendar.YEAR), utc.get(Calendar.MONTH), utc.get(Calendar.DAY_OF_MONTH))
                        }.timeInMillis
                    }
                    out += Raw("${c.getLong(0)}_${c.getLong(1)}", title, begin, c.getLong(2), allDay, "Handy-Kalender")
                }
            }
        } catch (_: SecurityException) {}
        return out
    }

    fun plan(ctx: Context, now: Long = System.currentTimeMillis()): List<PlannedShift> {
        val p = Prefs(ctx)
        val types = p.shiftTypes
        val skipped = p.skipped
        val from = now - 24 * 3600_000L
        val to = now + p.lookaheadDays * 24 * 3600_000L
        val result = mutableListOf<PlannedShift>()
        for (r in rawEvents(ctx, from, to)) {
            val type = match(r.title, types) ?: continue
            var begin = r.begin
            var end = r.end
            if (r.allDay) {
                val day = startOfDay(r.begin)
                begin = atMinute(day, type.startMin)
                end = atMinute(day, type.endMin)
                if (end <= begin) end = atMinute(startOfDay(day + 30 * 3600_000L), type.endMin)
            }
            if (end < now) continue
            val alarmAt = if (type.alarmOn) alarmTime(type, begin) else null
            val silentFrom = if (type.silentOn) begin - p.silentBeforeMin * 60_000L else null
            val silentTo = if (type.silentOn) end + p.silentAfterMin * 60_000L else null
            result += PlannedShift(r.key, r.title, type, begin, end, alarmAt, silentFrom, silentTo, r.key in skipped)
        }
        return result.distinctBy { it.key }.sortedBy { it.start }
    }

    fun alarmTime(type: ShiftType, begin: Long): Long {
        if (!type.fixedTime) return begin - type.offsetMin * 60_000L
        val day = startOfDay(begin)
        var t = atMinute(day, type.fixedMinOfDay)
        if (t > begin) t = atMinute(startOfDay(day - 2 * 3600_000L), type.fixedMinOfDay)
        return t
    }

    fun startOfDay(t: Long): Long = Calendar.getInstance().apply {
        timeInMillis = t
        set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    /** Uhrzeit an einem Tag, robust gegen Zeitumstellung. */
    fun atMinute(dayStart: Long, minOfDay: Int): Long = Calendar.getInstance().apply {
        timeInMillis = dayStart
        set(Calendar.HOUR_OF_DAY, minOfDay / 60); set(Calendar.MINUTE, minOfDay % 60)
        set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
}
