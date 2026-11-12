package app.mailwerk.mail

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter

/** Ein im Mailtext gefundener Termin oder eine Frist („melde dich bis Montag 16:00“). */
data class FoundDate(
    val start: LocalDateTime,
    /** keine Uhrzeit genannt -> ganztägig */
    val allDay: Boolean,
    /** „bis“, „spätestens“, „Frist“ … -> Frist statt Termin */
    val deadline: Boolean,
    /** der Satz, in dem das Datum steht */
    val sentence: String,
    /** Ort, falls genannt („in Flensburg“, „bei Oma“) */
    val location: String = "",
)

/**
 * Sucht Daten und Uhrzeiten im Fließtext (Deutsch und Englisch): „bis Montag 16:00“, „am 24.11. um 19:30“,
 * „morgen um 10 Uhr“, „Frist: 15.12.2026“, „on Friday at 3pm“, „by 5 December“ …
 * Bewusst vorsichtig: ohne Wochentag/Datum/„morgen“ wird nichts erkannt (eine Uhrzeit allein reicht nicht).
 */
object TextDates {
    private val weekdays = mapOf(
        "montag" to DayOfWeek.MONDAY, "dienstag" to DayOfWeek.TUESDAY, "mittwoch" to DayOfWeek.WEDNESDAY,
        "donnerstag" to DayOfWeek.THURSDAY, "freitag" to DayOfWeek.FRIDAY, "samstag" to DayOfWeek.SATURDAY,
        "sonnabend" to DayOfWeek.SATURDAY, "sonntag" to DayOfWeek.SUNDAY,
        "monday" to DayOfWeek.MONDAY, "tuesday" to DayOfWeek.TUESDAY, "wednesday" to DayOfWeek.WEDNESDAY,
        "thursday" to DayOfWeek.THURSDAY, "friday" to DayOfWeek.FRIDAY, "saturday" to DayOfWeek.SATURDAY, "sunday" to DayOfWeek.SUNDAY,
    )
    private val months = mapOf(
        "januar" to 1, "jänner" to 1, "january" to 1, "jan" to 1, "februar" to 2, "february" to 2, "feb" to 2,
        "märz" to 3, "maerz" to 3, "march" to 3, "mär" to 3, "mar" to 3, "april" to 4, "apr" to 4, "mai" to 5, "may" to 5,
        "juni" to 6, "june" to 6, "jun" to 6, "juli" to 7, "july" to 7, "jul" to 7, "august" to 8, "aug" to 8,
        "september" to 9, "sept" to 9, "sep" to 9, "oktober" to 10, "october" to 10, "okt" to 10, "oct" to 10,
        "november" to 11, "nov" to 11, "dezember" to 12, "december" to 12, "dez" to 12, "dec" to 12,
    )
    private val relDays = mapOf("heute" to 0, "today" to 0, "morgen" to 1, "tomorrow" to 1, "übermorgen" to 2)

    private const val WD = "montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday"
    private val monthAlt = months.keys.sortedByDescending { it.length }.joinToString("|")
    private val dateRx = Regex(
        "(?<![\\w.])(?:(?:(nächsten|nächster|kommenden|kommender|next)\\s+)?($WD)(?:,?\\s*(?:den\\s+)?(\\d{1,2})\\.(\\d{1,2})\\.(\\d{2,4})?)?" +
            "|(übermorgen|heute|morgen|today|tomorrow)" +
            "|(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2}(?!\\d))?" +
            "|(\\d{1,2})\\.?\\s+($monthAlt)\\.?(?:\\s+(\\d{4}))?" +
            "|($monthAlt)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?)(?![\\w])",
        RegexOption.IGNORE_CASE,
    )
    private val timeRx = Regex(
        "^[\\s,–-]*(?:um|ab|gegen|bis|at|by|von)?\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(uhr|h\\b|am\\b|pm\\b|a\\.m\\.|p\\.m\\.)?",
        RegexOption.IGNORE_CASE,
    )
    private val deadlineRx = Regex("(\\bbis\\b|spätestens|frist|deadline|abgabe|einsende|anmeldeschluss|\\bby\\b|\\buntil\\b|\\bdue\\b|no later than)\\s*[:\\w\\s]{0,22}$", RegexOption.IGNORE_CASE)

    /** Zitierte frühere Mails („> …“, „Am … schrieb …“, „-----Original“) abschneiden. */
    fun ownText(text: String): String {
        val lines = text.lines()
        val out = mutableListOf<String>()
        for (l in lines) {
            val t = l.trim()
            if (t.startsWith(">")) continue
            if (Regex("^(am|on) .{3,80}(schrieb|wrote).{0,40}:$", RegexOption.IGNORE_CASE).matches(t)) break
            if (t.startsWith("-----Original", true) || t.startsWith("________________") || t.matches(Regex("^(Von|From):\\s.+"))) break
            out += l
        }
        return out.joinToString("\n")
    }

    fun find(text: String, sent: LocalDateTime, max: Int = 3): List<FoundDate> {
        val body = ownText(text).take(20_000)
        val res = mutableListOf<FoundDate>()
        for (m in dateRx.findAll(body)) {
            val day = resolve(m, sent.toLocalDate()) ?: continue
            // Uhrzeit direkt danach („Montag 16:00“, „24.11. um 19:30 Uhr“, „Friday at 3pm“)
            val after = body.substring(m.range.last + 1).take(24)
            val tm = timeRx.find(after)
            var time: LocalTime? = null
            if (tm != null && tm.value.isNotBlank()) {
                val h = tm.groupValues[1].toInt(); val min = tm.groupValues[2].ifEmpty { "0" }.toInt()
                val suffix = tm.groupValues[3].lowercase()
                val explicit = tm.groupValues[2].isNotEmpty() || suffix.isNotEmpty()
                if (explicit && min in 0..59) {
                    val hh = when { suffix.startsWith("p") && h in 1..11 -> h + 12; suffix.startsWith("a") && h == 12 -> 0; else -> h }
                    if (hh in 0..23) time = LocalTime.of(hh, min)
                }
            }
            val before = body.substring(0, m.range.first).takeLast(40)
            val line = before.substringAfterLast('\n')
            val deadline = deadlineRx.containsMatchIn(line)
            // Vorsicht bei ungenauen Angaben: „Guten Morgen“, „ich melde mich morgen“, „am Montag war …“
            if (m.groupValues[6].isNotEmpty()) {
                if (Regex("(guten|schönen|jeden|am|heute|bis)\\s*$", RegexOption.IGNORE_CASE).containsMatchIn(line) && time == null && !deadline) continue
                if (Regex("(guten|schönen|jeden)\\s*$", RegexOption.IGNORE_CASE).containsMatchIn(line)) continue
                if (time == null && !deadline) continue
            }
            if (m.groupValues[2].isNotEmpty() && m.groupValues[3].isEmpty() && time == null && !deadline &&
                !Regex("(\\bam|\\bon|nächsten|nächster|kommenden|kommender|next|diesen|this)\\s*$", RegexOption.IGNORE_CASE).containsMatchIn(line)) continue
            val start = if (time != null) day.atTime(time) else day.atStartOfDay()
            // nur Zukunft (ab Versand) und höchstens ~1 Jahr voraus
            if (start.toLocalDate().isBefore(sent.toLocalDate()) || start.isAfter(sent.plusDays(400))) continue
            if (time != null && start.isBefore(sent)) continue
            val sent0 = sentence(body, m.range.first, m.range.last)
            val f = FoundDate(start, time == null, deadline, sent0, location(sent0))
            if (res.none { it.start == f.start }) res += f
            if (res.size >= max) break
        }
        return res
    }

    private val placeStop = setOf("ordnung", "ruhe", "zukunft", "kürze", "kuerze", "eile", "bezug", "zusammenarbeit", "the", "der", "die", "das", "touch")
    private val placeRx = Regex("(?<![\\p{L}\\d])(?:in|im|bei|beim|at|auf dem|auf der)\\s+((?:der |dem |den |the )?\\p{Lu}[\\p{L}\\d.'-]*(?:[ -](?:[\\p{Lu}\\d][\\p{L}\\d.'-]*|am|an der|im))*)")

    /** Ort aus dem Satz: „in Flensburg“, „bei Oma“, „im Café Central“, „at Starbucks“ */
    fun location(sentence: String): String {
        for (m in placeRx.findAll(sentence)) {
            val place = m.groupValues[1].trim().trimEnd('.', ',', '!', '?').removeSuffix(" am").removeSuffix(" im").trim()
            val first = place.removePrefix("der ").removePrefix("dem ").removePrefix("den ").removePrefix("the ").substringBefore(' ').lowercase()
            if (first in placeStop || first in weekdays || first in months || place.length < 2) continue
            return place
        }
        return ""
    }

    private fun sentence(body: String, from: Int, to: Int): String {
        val s = body.lastIndexOfAny(charArrayOf('.', '!', '?', '\n'), from - 1).let { i ->
            // Punkt eines Datums („24.11.“) ist kein Satzende
            var j = i; while (j > 0 && body[j] == '.' && j > 0 && body[j - 1].isDigit()) j = body.lastIndexOfAny(charArrayOf('.', '!', '?', '\n'), j - 1)
            j + 1
        }
        var e = to + 1
        while (e < body.length && body[e] !in "!?\n" && !(body[e] == '.' && (e + 1 >= body.length || body[e + 1].isWhitespace()) && !body[e - 1].isDigit())) e++
        return body.substring(s.coerceAtLeast(0), (e + 1).coerceAtMost(body.length)).trim().replace(Regex("\\s+"), " ").take(240)
    }

    private fun year(y: String, fallback: Int): Int = when {
        y.isEmpty() -> fallback
        y.length == 2 -> 2000 + y.toInt()
        else -> y.toInt()
    }

    /** Datum ohne Jahr: dieses Jahr, liegt es schon zurück -> nächstes Jahr. */
    private fun dated(d: Int, mo: Int, y: String, ref: LocalDate): LocalDate? = runCatching {
        if (y.isNotEmpty()) return LocalDate.of(year(y, ref.year), mo, d)
        val cand = LocalDate.of(ref.year, mo, d)
        // kürzlich vergangen = Vergangenheit („am 01.10. hatten wir …“), weit zurück = nächstes Jahr („im Dezember: am 8.1.“)
        when { !cand.isBefore(ref) -> cand; cand.isBefore(ref.minusDays(60)) -> cand.plusYears(1); else -> null }
    }.getOrNull()

    private fun resolve(m: MatchResult, ref: LocalDate): LocalDate? {
        val g = m.groupValues
        return when {
            g[2].isNotEmpty() -> {
                if (g[3].isNotEmpty()) return dated(g[3].toInt(), g[4].toInt(), g[5], ref)
                val wd = weekdays[g[2].lowercase()] ?: return null
                var add = (wd.value - ref.dayOfWeek.value + 7) % 7
                if (add == 0) add = 7 // „bis Montag“ am Montag geschrieben = nächster Montag
                if (g[1].isNotEmpty() && add < 3 && g[1].lowercase().startsWith("n")) add += 7 // „nächsten Freitag“ am Mittwoch: eher die Woche drauf
                ref.plusDays(add.toLong())
            }
            g[6].isNotEmpty() -> ref.plusDays((relDays[g[6].lowercase()] ?: return null).toLong())
            g[7].isNotEmpty() -> {
                val d = g[7].toInt(); val mo = g[8].toInt()
                if (d !in 1..31 || mo !in 1..12) null else dated(d, mo, g[9], ref)
            }
            g[10].isNotEmpty() -> dated(g[10].toInt(), months[g[11].lowercase()] ?: return null, g[12], ref)
            g[13].isNotEmpty() -> dated(g[14].toInt(), months[g[13].lowercase()] ?: return null, g[15], ref)
            else -> null
        }
    }

    private val icsFmt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss")
    private val icsDay = DateTimeFormatter.ofPattern("yyyyMMdd")
    private fun esc(s: String) = s.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")

    /** Als kleine .ics-Datei ablegen, damit derselbe Weg wie bei echten Einladungen genutzt wird. */
    fun toIcs(f: FoundDate, uid: String, title: String): String = buildString {
        append("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Mailwerk//Texterkennung//DE\r\nX-MAILWERK-DETECTED:1\r\nBEGIN:VEVENT\r\n")
        append("UID:").append(esc(uid)).append("\r\n")
        if (f.allDay) {
            append("DTSTART;VALUE=DATE:").append(f.start.format(icsDay)).append("\r\n")
            append("DTEND;VALUE=DATE:").append(f.start.plusDays(1).format(icsDay)).append("\r\n")
        } else {
            append("DTSTART:").append(f.start.format(icsFmt)).append("\r\n")
            append("DTEND:").append((if (f.deadline) f.start else f.start.plusHours(1)).format(icsFmt)).append("\r\n")
        }
        append("SUMMARY:").append(esc(title)).append("\r\n")
        if (f.location.isNotBlank()) append("LOCATION:").append(esc(f.location)).append("\r\n")
        append("DESCRIPTION:").append(esc("„${f.sentence}“")).append("\r\n")
        if (!f.allDay) append("BEGIN:VALARM\r\nTRIGGER:-PT${if (f.deadline) 120 else 60}M\r\nACTION:DISPLAY\r\nEND:VALARM\r\n")
        append("END:VEVENT\r\nEND:VCALENDAR\r\n")
    }

    fun isDetected(ics: String) = ics.contains("X-MAILWERK-DETECTED:1")
}
