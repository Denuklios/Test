package app.mailwerk.mail

import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Ein Termin aus einer Kalender-Einladung (iCalendar / .ics, RFC 5545). */
data class IcsEvent(
    val uid: String,
    val summary: String,
    /** in der Zeitzone des Geräts */
    val start: LocalDateTime,
    /** bei ganztägig: letzter Tag (inklusive), wie im Familienkalender */
    val end: LocalDateTime,
    val allDay: Boolean,
    val location: String = "",
    val description: String = "",
    val organizer: String = "",
    /** REQUEST, PUBLISH, CANCEL, REPLY … (leer = keine Angabe) */
    val method: String = "",
    val cancelled: Boolean = false,
    val sequence: Int = 0,
    val recurrenceId: String = "",
    /** none, daily, weekly, biweekly, monthly, yearly (Begriffe des Familienkalenders) */
    val repeat: String = "none",
    val repeatUntil: LocalDate? = null,
    /** Wiederholung, die der Familienkalender nicht abbilden kann (Text für die Notiz) */
    val repeatNote: String = "",
    /** Erinnerungen in Minuten vor Beginn */
    val reminders: List<Int> = emptyList(),
) {
    /** Absage (ganzer Termin oder diese Person ausgeladen) */
    val isCancel get() = cancelled || method.equals("CANCEL", true)
    /** Antworten auf eigene Einladungen („Zugesagt“) sind keine neuen Termine */
    val isReply get() = method.equals("REPLY", true) || method.equals("COUNTER", true)
}

object Ics {
    private val dt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss")
    private val d = DateTimeFormatter.ofPattern("yyyyMMdd")

    /** Windows-Zeitzonennamen (Outlook / Exchange) -> IANA */
    private val windowsZones = mapOf(
        "w. europe standard time" to "Europe/Berlin", "central europe standard time" to "Europe/Budapest",
        "romance standard time" to "Europe/Paris", "central european standard time" to "Europe/Warsaw",
        "gmt standard time" to "Europe/London", "greenwich standard time" to "Atlantic/Reykjavik",
        "e. europe standard time" to "Europe/Chisinau", "fle standard time" to "Europe/Helsinki",
        "gtb standard time" to "Europe/Bucharest", "russian standard time" to "Europe/Moscow",
        "turkey standard time" to "Europe/Istanbul", "eastern standard time" to "America/New_York",
        "central standard time" to "America/Chicago", "mountain standard time" to "America/Denver",
        "pacific standard time" to "America/Los_Angeles", "utc" to "UTC", "coordinated universal time" to "UTC",
    )

    data class Prop(val name: String, val params: Map<String, String>, val value: String)

    /** Zeilen entfalten und in Eigenschaften zerlegen. */
    fun props(text: String): List<Prop> {
        val unfolded = text.replace("\r\n", "\n").replace("\r", "\n").replace(Regex("\n[ \t]"), "")
        return unfolded.split('\n').mapNotNull { line ->
            if (line.isBlank()) return@mapNotNull null
            // Doppelpunkt außerhalb von Anführungszeichen trennt Name/Parameter vom Wert
            var inQ = false; var colon = -1
            for (i in line.indices) { val ch = line[i]; if (ch == '"') inQ = !inQ else if (ch == ':' && !inQ) { colon = i; break } }
            if (colon < 0) return@mapNotNull null
            val head = line.substring(0, colon)
            val parts = head.split(';')
            val params = parts.drop(1).mapNotNull { p ->
                val eq = p.indexOf('='); if (eq < 0) null else p.substring(0, eq).uppercase() to p.substring(eq + 1).trim('"')
            }.toMap()
            Prop(parts[0].uppercase(), params, line.substring(colon + 1))
        }
    }

    fun unescape(s: String) = s.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")

    private fun zoneOf(tzid: String?, local: ZoneId): ZoneId {
        if (tzid.isNullOrBlank()) return local
        val t = tzid.trim().trim('"')
        windowsZones[t.lowercase()]?.let { return ZoneId.of(it) }
        runCatching { return ZoneId.of(t) }
        // z. B. "/mozilla.org/20050126_1/Europe/Berlin" oder "(UTC+01:00) Amsterdam, Berlin …"
        Regex("([A-Za-z]+/[A-Za-z_]+)$").find(t)?.let { m -> runCatching { return ZoneId.of(m.groupValues[1]) } }
        Regex("UTC([+-]\\d{1,2}):?(\\d{2})?").find(t)?.let { m ->
            runCatching { return ZoneOffset.ofHoursMinutes(m.groupValues[1].toInt(), (m.groupValues[2].ifEmpty { "0" }).toInt() * if (m.groupValues[1].startsWith("-")) -1 else 1) }
        }
        return local
    }

    /** Datum/Zeit in Gerätezeit umrechnen. Zweiter Wert: nur Datum (ganztägig). */
    fun time(p: Prop, local: ZoneId): Pair<LocalDateTime, Boolean>? = runCatching {
        val v = p.value.trim()
        if (p.params["VALUE"].equals("DATE", true) || Regex("^\\d{8}$").matches(v)) {
            LocalDate.parse(v.take(8), d).atStartOfDay() to true
        } else if (v.endsWith("Z", true)) {
            LocalDateTime.parse(v.dropLast(1).take(15), dt).atZone(ZoneOffset.UTC).withZoneSameInstant(local).toLocalDateTime() to false
        } else {
            LocalDateTime.parse(v.take(15), dt).atZone(zoneOf(p.params["TZID"], local)).withZoneSameInstant(local).toLocalDateTime() to false
        }
    }.getOrNull()

    private fun duration(s: String): Duration? = runCatching {
        // Wochen kennt java.time.Duration nicht
        val w = Regex("^([+-])?P(\\d+)W$").find(s.trim())
        if (w != null) Duration.ofDays(w.groupValues[2].toLong() * 7).let { if (w.groupValues[1] == "-") it.negated() else it }
        else Duration.parse(s.trim())
    }.getOrNull()

    private fun mailOf(v: String) = v.trim().removePrefix("mailto:").removePrefix("MAILTO:")

    /** Alle Termine einer .ics-Datei. Ungültige Einträge werden übersprungen. */
    fun parse(text: String, local: ZoneId = ZoneId.systemDefault()): List<IcsEvent> {
        val all = props(text)
        val method = all.firstOrNull { it.name == "METHOD" }?.value?.trim()?.uppercase() ?: ""
        val out = mutableListOf<IcsEvent>()
        var depth = 0 // Verschachtelung innerhalb VEVENT (VALARM)
        var cur: MutableList<Prop>? = null
        val alarms = mutableListOf<List<Prop>>()
        var alarm: MutableList<Prop>? = null
        for (p in all) {
            when {
                p.name == "BEGIN" && p.value.equals("VEVENT", true) -> { cur = mutableListOf(); alarms.clear(); depth = 0 }
                p.name == "BEGIN" && cur != null -> { depth++; if (p.value.equals("VALARM", true)) alarm = mutableListOf() }
                p.name == "END" && p.value.equals("VEVENT", true) && cur != null -> {
                    build(cur, alarms.toList(), method, local)?.let(out::add); cur = null
                }
                p.name == "END" && cur != null -> { depth--; alarm?.let { alarms += it }; alarm = null }
                alarm != null -> alarm!!.add(p)
                cur != null && depth == 0 -> cur!!.add(p)
            }
        }
        return out
    }

    private fun build(ps: List<Prop>, alarms: List<List<Prop>>, method: String, local: ZoneId): IcsEvent? {
        fun one(n: String) = ps.firstOrNull { it.name == n }
        val uid = one("UID")?.value?.trim().orEmpty()
        val startP = one("DTSTART") ?: return null
        val (start, allDay) = time(startP, local) ?: return null
        var end: LocalDateTime = one("DTEND")?.let { time(it, local)?.first }
            ?: one("DURATION")?.let { duration(it.value)?.let { du -> start.plus(du) } }
            ?: if (allDay) start.plusDays(1) else start.plusHours(1)
        if (allDay) {
            // DTEND ist bei ganztägigen Terminen exklusiv -> letzter Tag
            end = end.minusDays(1).let { if (it.isBefore(start)) start else it }
        } else if (end.isBefore(start)) end = start
        val (repeat, until, note) = rrule(one("RRULE")?.value, start, local)
        val reminders = alarms.mapNotNull { a ->
            val trig = a.firstOrNull { it.name == "TRIGGER" } ?: return@mapNotNull null
            if (trig.params["VALUE"].equals("DATE-TIME", true)) return@mapNotNull null
            val du = duration(trig.value) ?: return@mapNotNull null
            (-du.toMinutes()).toInt().takeIf { it >= 0 }
        }.distinct().sorted()
        return IcsEvent(
            uid = uid.ifEmpty { "${one("SUMMARY")?.value}-${startP.value}" },
            summary = unescape(one("SUMMARY")?.value ?: "").trim(),
            start = start, end = end, allDay = allDay,
            location = unescape(one("LOCATION")?.value ?: "").trim(),
            description = unescape(one("DESCRIPTION")?.value ?: "").trim(),
            organizer = one("ORGANIZER")?.let { o -> o.params["CN"]?.let { "$it <${mailOf(o.value)}>" } ?: mailOf(o.value) } ?: "",
            method = method,
            cancelled = one("STATUS")?.value?.trim().equals("CANCELLED", true),
            sequence = one("SEQUENCE")?.value?.trim()?.toIntOrNull() ?: 0,
            recurrenceId = one("RECURRENCE-ID")?.value?.trim().orEmpty(),
            repeat = repeat, repeatUntil = until, repeatNote = note, reminders = reminders,
        )
    }

    /** RRULE in die Wiederholungen des Familienkalenders übersetzen. */
    private fun rrule(r: String?, start: LocalDateTime, local: ZoneId): Triple<String, LocalDate?, String> {
        if (r.isNullOrBlank()) return Triple("none", null, "")
        val m = r.split(';').mapNotNull { val i = it.indexOf('='); if (i < 0) null else it.substring(0, i).uppercase() to it.substring(i + 1) }.toMap()
        val interval = m["INTERVAL"]?.toIntOrNull() ?: 1
        val freq = m["FREQ"]?.uppercase()
        val rep = when {
            freq == "DAILY" && interval == 1 -> "daily"
            freq == "WEEKLY" && interval == 1 && (m["BYDAY"]?.contains(',') != true) -> "weekly"
            freq == "WEEKLY" && interval == 2 && (m["BYDAY"]?.contains(',') != true) -> "biweekly"
            freq == "MONTHLY" && interval == 1 -> "monthly"
            freq == "YEARLY" && interval == 1 -> "yearly"
            else -> return Triple("none", null, r)
        }
        val until = m["UNTIL"]?.let { u -> time(Prop("UNTIL", emptyMap(), u), local)?.first?.toLocalDate() }
            ?: m["COUNT"]?.toLongOrNull()?.takeIf { it > 0 }?.let { n ->
                val k = n - 1
                when (rep) {
                    "daily" -> start.plusDays(k); "weekly" -> start.plusWeeks(k); "biweekly" -> start.plusWeeks(2 * k)
                    "monthly" -> start.plusMonths(k); else -> start.plusYears(k)
                }.toLocalDate()
            }
        return Triple(rep, until, "")
    }
}
