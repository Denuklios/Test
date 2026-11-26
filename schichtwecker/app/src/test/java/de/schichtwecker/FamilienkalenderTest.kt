package de.schichtwecker

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/** Testet gegen eine echte Antwort von api.php (lokal erzeugt, wie der Familienkalender speichert). */
class FamilienkalenderTest {
    private val sync = JSONObject(javaClass.classLoader!!.getResource("sync.json").readText())
    private val cache = Familienkalender.mergeSync(JSONObject(), sync)
    private fun at(y: Int, m: Int, d: Int) = Calendar.getInstance().apply { clear(); set(y, m - 1, d) }.timeInMillis
    private val fmt = SimpleDateFormat("dd.MM. HH:mm", Locale.GERMANY)

    @Test fun einladungLesen() {
        val inv = Familienkalender.parseInvite(
            "Komm in unseren Familienkalender „Familie“! 📅\nApp installieren, dann diese Nachricht beim Start einfügen.\nServer: https://www.wunsch-fabrik.dk/kalender\nCode: AB3DEF7H")
        assertEquals("https://www.wunsch-fabrik.dk/kalender/api.php", inv!!.first)
        assertEquals("AB3DEF7H", inv.second)
    }

    @Test fun nurMeineTermineMitWiederholung() {
        val occ = Familienkalender.expandAll(cache.getJSONObject("event"), "mRobert", at(2026, 11, 26), at(2026, 12, 14))
        val txt = occ.map { "${it.title} ${fmt.format(it.start)}-${fmt.format(it.end)}${if (it.allDay) " ganztags" else ""}" }
        println(txt.joinToString("\n"))
        assertTrue("Früh 27.11. 06:00-27.11. 14:00" in txt)
        assertTrue("Spät 28.11. 14:00-28.11. 22:00" in txt)
        assertTrue("Nacht 29.11. 22:00-30.11. 06:00" in txt)          // Nachtschicht über Mitternacht
        assertTrue(txt.none { it.startsWith("Nacht 06.12.") })       // ausgelassener Tag
        assertTrue("Nacht 13.12. 22:00-14.12. 06:00" in txt)          // wöchentlich weiter
        assertTrue(txt.any { it.startsWith("Zahnarzt") })            // als Teilnehmer dabei
        assertTrue(txt.any { it.startsWith("Früh 01.12. 00:00") && it.endsWith("ganztags") })
        assertTrue(txt.none { it.contains("Geburtstag") })
        assertEquals(1, txt.count { it.startsWith("Früh 27.11.") })  // Jeannines Frühschicht nicht
    }

    @Test fun mehrtaegigeSchichtJederTagEinzeln() {
        val evs = JSONObject().put("x", JSONObject("""{"id":"x","title":"Früh","start":"2026-11-02T00:00:00","end":"2026-11-04T00:00:00","allDay":true,"ownerId":"mRobert","participants":[],"kind":"normal","repeat":"none"}"""))
        val occ = Familienkalender.expandAll(evs, "mRobert", at(2026, 11, 1), at(2026, 11, 10))
        assertEquals(listOf("02.11. 00:00", "03.11. 00:00", "04.11. 00:00"), occ.map { fmt.format(it.start) })
    }

    @Test fun schichtenErkannt() {
        val types = ShiftType.defaults()
        val occ = Familienkalender.expandAll(cache.getJSONObject("event"), "mRobert", at(2026, 11, 26), at(2026, 12, 2))
        val names = occ.mapNotNull { Planner.match(it.title, types)?.name }
        assertEquals(listOf("Frühschicht", "Spätschicht", "Nachtschicht", "Frühschicht"), names)
    }
}
