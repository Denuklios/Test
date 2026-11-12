package app.mailwerk

import app.mailwerk.mail.Ics
import app.mailwerk.mail.TextDates
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class TextDatesTest {
    /** Mittwoch, 11.11.2026, 10:00 */
    private val sent = LocalDateTime.of(2026, 11, 11, 10, 0)
    private fun one(t: String) = TextDates.find(t, sent).single()
    private fun none(t: String) = assertEquals(t, 0, TextDates.find(t, sent).size)

    @Test fun deadlineWeekdayWithTime() {
        val f = one("Hallo Sandra,\nbitte melde dich bis Montag 16:00 wegen der Klassenfahrt.\nLG Tom")
        assertEquals(LocalDateTime.of(2026, 11, 16, 16, 0), f.start)
        assertTrue(f.deadline); assertFalse(f.allDay)
        assertEquals("bitte melde dich bis Montag 16:00 wegen der Klassenfahrt.", f.sentence)
    }

    @Test fun numericDateWithUhr() {
        val f = one("Der Elternabend ist am 24.11. um 19:30 Uhr in der Aula.")
        assertEquals(LocalDateTime.of(2026, 11, 24, 19, 30), f.start); assertFalse(f.deadline)
    }

    @Test fun tomorrowAndFullDateAndMonthName() {
        assertEquals(LocalDateTime.of(2026, 11, 12, 10, 0), one("Können wir morgen um 10 Uhr telefonieren?").start)
        val d = one("Anmeldeschluss: 15.12.2026")
        assertTrue(d.allDay); assertTrue(d.deadline); assertEquals(LocalDateTime.of(2026, 12, 15, 0, 0), d.start)
        assertEquals(LocalDateTime.of(2027, 1, 8, 0, 0), one("Die Praxis ist am 8. Januar wieder geöffnet, kommen Sie am 8. Januar vorbei.").start)
        assertEquals(LocalDateTime.of(2026, 11, 13, 15, 0), one("Can we meet on Friday at 3pm?").start)
        assertEquals(LocalDateTime.of(2026, 12, 5, 0, 0), one("Please reply by December 5th.").start)
        // Wochentag ohne Uhrzeit, aber „am“: ganztägig
        assertTrue(one("Am Samstag ist das Schulfest.").allDay)
        // gleicher Wochentag = nächste Woche
        assertEquals(LocalDateTime.of(2026, 11, 18, 0, 0), one("Bitte bis Mittwoch zurückmelden.").start)
    }

    @Test fun placeFromSentence() {
        val f = one("treffen morgen um 19:00 in Flensburg")
        assertEquals(LocalDateTime.of(2026, 11, 12, 19, 0), f.start); assertEquals("Flensburg", f.location)
        assertEquals("Café Central", one("Wir sehen uns am Freitag um 12 Uhr im Café Central.").location)
        assertEquals("Oma", one("Sonntag 15:00 Kaffee bei Oma").location)
        assertEquals("", one("Bitte bis Montag 16:00 melden, dann ist alles in Ordnung.").location)
        val ev = Ics.parse(TextDates.toIcs(f, "u", "Treffen"), ZoneId.of("Europe/Berlin")).single()
        assertEquals("Flensburg", ev.location)
    }

    @Test fun timeLaterInSentenceAndTitle() {
        // gemeldet: Mail ohne Betreff an sich selbst
        val k = TextDates.find("Morgen ins Kino um 20:00", LocalDateTime.of(2026, 11, 12, 15, 8)).single()
        assertEquals(LocalDateTime.of(2026, 11, 13, 20, 0), k.start); assertEquals("Kino", k.title)
        assertEquals(LocalDateTime.of(2026, 11, 12, 20, 0), one("Wir gehen morgen ins Kino um 20 Uhr").start)
        assertEquals("Kino", one("Wir gehen morgen ins Kino um 20 Uhr").title)
        assertEquals(LocalDateTime.of(2026, 11, 12, 18, 30), one("Um 18:30 Uhr morgen Elternabend").start)
        assertEquals("Treffen in Flensburg", one("treffen morgen um 19:00 in Flensburg").title)
        assertEquals(LocalDateTime.of(2026, 11, 20, 20, 0), one("Am Freitag, 20.11. gehen wir essen, Tisch ist um 20.00 Uhr reserviert.").start)
        // Screenshot des Nutzers: Uhrzeit allein hinter dem Punkt
        assertEquals(LocalDateTime.of(2026, 11, 13, 19, 0), TextDates.find("Morgen früh essen gehen. 19:00", LocalDateTime.of(2026, 11, 12, 15, 30)).single().start)
        // Preis ist keine Uhrzeit, „morgen“ ohne Uhrzeit bleibt unerkannt
        none("Morgen kostet der Eintritt 12.50 Euro")
    }

    @Test fun noFalsePositives() {
        none("Guten Morgen Sandra, wie geht es dir?")
        none("Ich melde mich morgen.")
        none("Der Preis beträgt 12.50 € und Version 1.5 ist installiert.")
        none("Wir treffen uns um 16:00 Uhr.") // Uhrzeit ohne Tag
        none("Am 01.10. hatten wir telefoniert.") // Vergangenheit
        none("Hallo,\nja passt.\n\nAm 10.11.2026 um 09:12 schrieb Tom:\n> bis Freitag 12:00 bitte melden")
        none("> Termin am 30.11. um 18:00")
    }

    @Test fun becomesIcsForTheCalendar() {
        val f = one("Bitte bis Freitag, 20.11. um 12:00 das Formular abgeben.")
        assertEquals(LocalDateTime.of(2026, 11, 20, 12, 0), f.start)
        val ev = Ics.parse(TextDates.toIcs(f, "text-<abc@x>", "Frist: Formular"), ZoneId.of("Europe/Berlin")).single()
        assertEquals("Frist: Formular", ev.summary); assertEquals(f.start, ev.start); assertEquals(f.start, ev.end)
        assertEquals(listOf(120), ev.reminders); assertTrue(ev.description.contains("Formular abgeben"))
        assertTrue(TextDates.isDetected(TextDates.toIcs(f, "u", "t")))
    }
}
