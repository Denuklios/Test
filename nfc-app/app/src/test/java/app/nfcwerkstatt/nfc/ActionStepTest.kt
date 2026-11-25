package app.nfcwerkstatt.nfc

import app.nfcwerkstatt.automation.Step
import app.nfcwerkstatt.automation.StepType
import org.junit.Assert.assertEquals
import org.junit.Test

class ActionStepTest {
    @Test
    fun describeSteps() {
        assertEquals("Alexa-Routine „Gute Nacht“ – Link fehlt", Step(StepType.ALEXA, mapOf("label" to "Gute Nacht")).describe())
        assertEquals("Alexa-Routine „Licht aus“", Step(StepType.ALEXA, mapOf("label" to "Licht aus", "url" to "https://x")).describe())
        assertEquals("Alle Hue-Lichter aus", Step(StepType.HUE_ALL, mapOf("mode" to "off")).describe())
        assertEquals("Hue „Küche“ an · 50 %", Step(StepType.HUE_GROUP, mapOf("name" to "Küche", "mode" to "on", "bri" to "127")).describe())
        assertEquals("Klingelmodus: lautlos", Step(StepType.RINGER, mapOf("mode" to "silent")).describe())
        assertEquals("HA: light.turn_off → all", Step(StepType.HA, mapOf("service" to "light.turn_off", "entity" to "all")).describe())
        assertEquals("Timer 4 min „Kaffee“", Step(StepType.TIMER, mapOf("minutes" to "4", "label" to "Kaffee")).describe())
    }
}
