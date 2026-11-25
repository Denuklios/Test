package app.nfcwerkstatt.nfc

import app.nfcwerkstatt.automation.TuyaClient
import app.nfcwerkstatt.automation.TuyaDevice
import app.nfcwerkstatt.automation.TuyaProtocol
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

class TuyaProtocolTest {

    private val key = "0123456789abcdef".toByteArray()

    @Test
    fun crcPacketRoundTrip() {
        val pkt = TuyaProtocol.pack(TuyaProtocol.PREFIX_55AA, 7, 8, "hallo".toByteArray(), null)
        assertEquals(pkt.size, TuyaProtocol.packetLength(pkt))
        val m = TuyaProtocol.unpack(pkt, null, noRetcode = true)
        assertTrue(m.ok)
        assertEquals(7, m.seq)
        assertArrayEquals("hallo".toByteArray(), m.payload)
    }

    @Test
    fun hmacPacketDetectsTampering() {
        val pkt = TuyaProtocol.pack(TuyaProtocol.PREFIX_55AA, 1, 13, ByteArray(16), key)
        assertTrue(TuyaProtocol.unpack(pkt, key, noRetcode = true).ok)
        pkt[20] = (pkt[20] + 1).toByte()
        assertFalse(TuyaProtocol.unpack(pkt, key, noRetcode = true).ok)
    }

    @Test
    fun gcmPacketRoundTrip() {
        val pkt = TuyaProtocol.pack(TuyaProtocol.PREFIX_6699, 5, 16, """{"a":1}""".toByteArray(), key, retcode = 0)
        assertEquals(pkt.size, TuyaProtocol.packetLength(pkt))
        val m = TuyaProtocol.unpack(pkt, key, noRetcode = null)
        assertTrue(m.ok)
        assertEquals(0, m.retcode)
        assertEquals("""{"a":1}""", String(m.payload))
    }

    @Test
    fun ecbPadding() {
        val enc = TuyaProtocol.ecbEncrypt(key, "x".toByteArray())
        assertEquals(16, enc.size)
        assertEquals("x", String(TuyaProtocol.ecbDecrypt(key, enc)))
    }

    @Test
    fun udpBroadcastDecrypts() {
        val json = """{"ip":"192.168.1.40","gwId":"bf12","version":"3.3"}"""
        val enc = TuyaProtocol.ecbEncrypt(TuyaProtocol.UDP_KEY, json.toByteArray())
        val pkt = TuyaProtocol.pack(TuyaProtocol.PREFIX_55AA, 0, 19, byteArrayOf(0, 0, 0, 0) + enc, null)
        assertEquals(json, TuyaProtocol.decryptUdp(pkt))
        val req = TuyaProtocol.discoveryRequest("192.168.1.2")
        assertEquals("""{"from":"app","ip":"192.168.1.2"}""", TuyaProtocol.decryptUdp(req))
    }

    /** Referenzwerte mit tinytuya.Cloud erzeugt (gleiche Eingaben, feste Uhrzeit). */
    @Test
    fun cloudSignatureMatchesTinytuya() {
        val t = 1764000000123L
        assertEquals(
            "100721E694B2EBE4DF856E606B30DC0C8864450BE1B4643D9A27512366B549C9",
            app.nfcwerkstatt.automation.TuyaCloud.sign("myid", "mysecret", null, t, "GET", "/v1.0/token?grant_type=1"),
        )
        assertEquals(
            "2F6C227AE6B493D7108CFD549445D5B6C5013F9781AF42FE3923E1ABD99F0F04",
            app.nfcwerkstatt.automation.TuyaCloud.sign("myid", "mysecret", "tok123", t, "GET", "/v1.0/iot-01/associated-users/devices?last_row_key=abc&size=50"),
        )
    }

    /** Gegen den simulierten Stecker (tinytuya): TUYA_MOCK="3.3:16668,3.4:16669,3.5:16670" */
    @Test
    fun againstMockDevice() {
        val spec = System.getenv("TUYA_MOCK")
        assumeTrue("TUYA_MOCK nicht gesetzt", !spec.isNullOrBlank())
        spec!!.split(",").forEach { entry ->
            val (ver, port) = entry.split(":")
            val dev = TuyaDevice("bf1234567890abcdef", "Test", "0123456789abcdef", "127.0.0.1", ver)
            TuyaClient(dev, port = port.toInt()).connect().use { c ->
                assertEquals("$ver: an", true, c.switch("on"))
            }
            TuyaClient(dev, port = port.toInt()).connect().use { c ->
                assertEquals("$ver: Status", true, c.status().getBoolean("1"))
                assertEquals("$ver: umschalten", false, c.switch("toggle"))
                assertEquals("$ver: Status 2", false, c.status().getBoolean("1"))
            }
            println("Tuya $ver OK")
        }
    }
}
