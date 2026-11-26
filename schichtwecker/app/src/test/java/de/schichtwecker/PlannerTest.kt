package de.schichtwecker

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.Calendar

class PlannerTest {
    private val types = ShiftType.defaults()

    @Test fun erkenntSchichtTitel() {
        assertEquals("Frühschicht", Planner.match("Früh", types)?.name)
        assertEquals("Frühschicht", Planner.match("Frühdienst Station 3", types)?.name)
        assertEquals("Frühschicht", Planner.match("F", types)?.name)
        assertEquals("Frühschicht", Planner.match("FRUEH", types)?.name)
        assertEquals("Spätschicht", Planner.match("Spätdienst", types)?.name)
        assertEquals("Spätschicht", Planner.match("S 14-22", types)?.name)
        assertEquals("Nachtschicht", Planner.match("Nachtwache", types)?.name)
        assertNull(Planner.match("Friseur", types))
        assertNull(Planner.match("Sport", types))
        assertNull(Planner.match("Geburtstag Fritz", types))
    }

    private fun at(d: Int, h: Int, m: Int) = Calendar.getInstance().apply { clear(); set(2026, 11, d, h, m) }.timeInMillis

    @Test fun weckzeitVorBeginn() {
        val t = ShiftType("Früh", "f", offsetMin = 75)
        assertEquals(at(1, 4, 45), Planner.alarmTime(t, at(1, 6, 0)))
    }

    @Test fun festeWeckzeit() {
        val spaet = ShiftType("Spät", "s", fixedTime = true, fixedMinOfDay = 9 * 60)
        assertEquals(at(1, 9, 0), Planner.alarmTime(spaet, at(1, 14, 0)))
        // Feste Zeit liegt nach Schichtbeginn -> Vortag
        val nacht = ShiftType("Nacht", "n", fixedTime = true, fixedMinOfDay = 23 * 60)
        assertEquals(at(1, 23, 0), Planner.alarmTime(nacht, at(2, 6, 0)))
    }
}
