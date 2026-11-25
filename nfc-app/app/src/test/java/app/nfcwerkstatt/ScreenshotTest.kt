package app.nfcwerkstatt

import android.app.Application
import android.content.Context
import android.content.ContextWrapper
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import app.nfcwerkstatt.automation.HueBridge
import app.nfcwerkstatt.automation.Step
import app.nfcwerkstatt.automation.StepType
import app.nfcwerkstatt.automation.TagAction
import app.nfcwerkstatt.nfc.Contact
import app.nfcwerkstatt.nfc.NdefInfo
import app.nfcwerkstatt.nfc.NdefFactory
import app.nfcwerkstatt.nfc.RecordInfo
import app.nfcwerkstatt.nfc.TagInfo
import app.nfcwerkstatt.nfc.WifiAuth
import app.nfcwerkstatt.nfc.WifiConfig
import app.nfcwerkstatt.ui.App
import app.nfcwerkstatt.ui.theme.NfcTheme
import org.junit.Rule
import org.junit.Test

/** Rendert die Bildschirme ohne Gerät (auch mit großer Systemschrift). */
class ScreenshotTest {

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_5.copy(fontScale = 1.3f, softButtons = false),
        maxPercentDifference = 1.0,
    )

    private fun vm(): MainViewModel {
        val app = Application()
        ContextWrapper::class.java.getDeclaredMethod("attachBaseContext", Context::class.java)
            .apply { isAccessible = true }.invoke(app, paparazzi.context)
        return MainViewModel(app)
    }

    private fun shot(dark: Boolean = false, setup: (MainViewModel) -> Unit) {
        val vm = vm().also(setup)
        paparazzi.snapshot { NfcTheme(dark = dark) { App(vm, onOpenNfcSettings = {}) } }
    }

    private val sampleTag = TagInfo(
        timestamp = 1764060000000,
        uid = "04:A2:3B:1C:7D:80:00",
        chip = "NXP NTAG215",
        techs = listOf("NfcA", "MifareUltralight", "Ndef"),
        details = listOf("ATQA" to "44:00", "SAK" to "00", "Hersteller" to "NXP Semiconductors", "Passwortschutz" to "aus"),
        ndef = NdefInfo(
            "NFC Forum Typ 2", 492, 63, writable = true, canMakeReadOnly = true,
            records = listOf(
                RecordInfo("Link", "https://julekontor.dk", "TNF: Well-Known · Typ: U · 14 Bytes", "04 6A 75", "https://julekontor.dk"),
                RecordInfo("WLAN", "Netzwerk: Werkstatt\nSicherheit: WPA2-Personal\nPasswort: geheim123", "TNF: MIME", "10 0E"),
            ),
        ),
        ndefRaw = byteArrayOf(1),
        memoryDump = null,
    )

    @Test fun readEmpty() = shot { }
    @Test fun readEmptyDark() = shot(dark = true) { }
    @Test fun readTag() = shot { it.lastTag.value = sampleTag }
    @Test fun write() = shot {
        it.tab.value = Tab.WRITE
        it.addDraft(NdefFactory.url("julekontor.dk"))
        it.addDraft(NdefFactory.wifi(WifiConfig("Werkstatt", WifiAuth.WPA2, "geheim123")))
        it.addDraft(NdefFactory.contact(Contact("Max Mustermann", "+45 12345678")))
    }
    @Test fun actionsEmpty() = shot { it.tab.value = Tab.ACTIONS }
    @Test fun actionsList() = shot {
        it.tab.value = Tab.ACTIONS
        it.hue.value = HueBridge("192.168.1.20", "x")
        it.actions.value = listOf(
            TagAction("a1", "Gute Nacht", listOf(Step(StepType.HUE_ALL, mapOf("mode" to "off")), Step(StepType.RINGER, mapOf("mode" to "silent")))),
            TagAction("a2", "Wohnzimmer gemütlich", listOf(Step(StepType.HUE_GROUP, mapOf("id" to "1", "name" to "Wohnzimmer", "mode" to "on", "bri" to "100")))),
        )
    }
    @Test fun tools() = shot { it.tab.value = Tab.TOOLS }
    @Test fun history() = shot { it.tab.value = Tab.HISTORY; it.history.value = listOf(sampleTag, sampleTag.copy(timestamp = 1764050000000, chip = "MIFARE Classic 1K", ndef = null)) }
}
