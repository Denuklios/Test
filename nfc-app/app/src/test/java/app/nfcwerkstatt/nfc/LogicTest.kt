package app.nfcwerkstatt.nfc

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LogicTest {

    @Test
    fun hexRoundTrip() {
        val b = byteArrayOf(0x04, 0xA2.toByte(), 0x7F, 0x00)
        assertEquals("04:A2:7F:00", b.toHex())
        assertArrayEquals(b, "04 a2 7f 00".hexToBytes())
        assertEquals("..\u007F.".replace('\u007F', '.'), b.toAsciiPreview())
    }

    @Test
    fun wifiRoundTrip() {
        val cfg = WifiConfig("Heimnetz Ä", WifiAuth.WPA2, "geheim123")
        val payload = WifiPayload.build(cfg)
        // Äußeres Credential-TLV 0x100E
        assertEquals(0x10, payload[0].toInt())
        assertEquals(0x0E, payload[1].toInt())
        assertEquals(cfg, WifiPayload.parse(payload))
    }

    @Test
    fun wifiOpenHasEmptyKey() {
        val parsed = WifiPayload.parse(WifiPayload.build(WifiConfig("Gast", WifiAuth.OPEN, "egal")))
        assertEquals(WifiAuth.OPEN, parsed!!.auth)
        assertEquals("", parsed.password)
    }

    @Test
    fun wifiMixedAuthDetected() {
        assertEquals(WifiAuth.WPA_WPA2, WifiAuth.fromCode(0x0022))
        assertEquals(WifiAuth.WPA2, WifiAuth.fromCode(0x0020))
        assertNull(WifiPayload.parse(byteArrayOf(1, 2, 3)))
    }

    @Test
    fun vcardBuildAndSummarize() {
        val v = VCard.build(Contact("Max Mustermann", "+49 170 1234567", "max@example.org", "Firma; GmbH"))
        assertTrue(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0"))
        assertTrue(v.contains("N:Mustermann;Max;;;"))
        assertTrue(v.contains("ORG:Firma\\; GmbH"))
        val s = VCard.summarize(v)
        assertTrue(s.contains("Name: Max Mustermann"))
        assertTrue(s.contains("Telefon: +49 170 1234567"))
        assertTrue(s.contains("Firma: Firma"))
    }

    @Test
    fun ntagIdentify() {
        val ntag215 = "00 04 04 02 01 00 11 03".hexToBytes()
        val chip = Ntag.identify(ntag215)
        assertNotNull(chip)
        assertEquals("NXP NTAG215", chip!!.name)
        assertEquals(0x83, chip.cfgPage)
        assertEquals("NXP NTAG213", Ntag.identify("00 04 04 02 01 00 0F 03".hexToBytes())!!.name)
        assertEquals("NXP NTAG216", Ntag.identify("00 04 04 02 01 00 13 03".hexToBytes())!!.name)
        assertNull(Ntag.identify("00 05 04 02 01 00 0F 03".hexToBytes()))
        assertNull(Ntag.identify(ByteArray(2)))
    }

    @Test
    fun ntagPasswordDerivation() {
        val (pwd, pack) = Ntag.derivePassword("1a2b3c4d")
        assertArrayEquals("1A2B3C4D".hexToBytes(), pwd)
        assertEquals(2, pack.size)
        val (p1, _) = Ntag.derivePassword("mein passwort")
        val (p2, _) = Ntag.derivePassword(" mein passwort ")
        assertArrayEquals(p1, p2)
        assertEquals(4, p1.size)
    }

    @Test
    fun ntagConfigBits() {
        val chip = Ntag.identify("00 04 04 02 01 00 0F 03".hexToBytes())!!
        val cfg0 = "04 00 00 FF".hexToBytes()
        assertFalse(Ntag.isProtected(cfg0, chip))
        val protected = Ntag.withAuth0(cfg0, 4)
        assertTrue(Ntag.isProtected(protected, chip))
        assertEquals(0x80, Ntag.withProt("00 05 00 00".hexToBytes(), true)[0].toInt() and 0x80)
        assertEquals(0x05, Ntag.withProt("85 05 00 00".hexToBytes(), false)[0].toInt())
    }

    @Test
    fun blockFormatting() {
        val out = formatBlocks("Seite", listOf(4 to "48 61 6C 6C".hexToBytes()))
        assertEquals("Seite 004  48 61 6C 6C  |Hall|", out)
    }

    @Test
    fun textDetection() {
        assertTrue("Grüße".toByteArray().looksLikeText())
        assertFalse(byteArrayOf(0x00, 0x01, 0xFF.toByte()).looksLikeText())
    }
}
