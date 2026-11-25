package app.nfcwerkstatt.automation

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.zip.CRC32
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Ein Tuya-WLAN-Gerät (Tuya, Smart Life, LSC Smart Connect, Megos …). */
data class TuyaDevice(
    val id: String,
    val name: String,
    val key: String,
    val ip: String,
    val version: String = "3.3",
    val category: String = "",
    /** Datenpunkt des Schalters; leer = automatisch erkennen */
    val switchDp: String = "",
)

/**
 * Lokales Tuya-Protokoll 3.3 / 3.4 / 3.5 – direkt im WLAN, ohne Cloud.
 * Portiert nach dem Vorbild von tinytuya (MIT-Lizenz).
 */
object TuyaProtocol {
    const val PREFIX_55AA = 0x000055AA
    const val SUFFIX_55AA = 0x0000AA55
    const val PREFIX_6699 = 0x00006699
    const val SUFFIX_6699 = 0x00009966

    const val SESS_KEY_NEG_START = 3
    const val SESS_KEY_NEG_RESP = 4
    const val SESS_KEY_NEG_FINISH = 5
    const val CONTROL = 7
    const val STATUS = 8
    const val HEART_BEAT = 9
    const val DP_QUERY = 0x0a
    const val CONTROL_NEW = 0x0d
    const val DP_QUERY_NEW = 0x10
    const val UPDATEDPS = 0x12
    const val REQ_DEVINFO = 0x25
    const val LAN_EXT_STREAM = 0x40

    val NO_PROTOCOL_HEADER_CMDS = setOf(DP_QUERY, DP_QUERY_NEW, UPDATEDPS, HEART_BEAT, SESS_KEY_NEG_START, SESS_KEY_NEG_RESP, SESS_KEY_NEG_FINISH, LAN_EXT_STREAM)

    /** Schlüssel für UDP-Broadcasts der Geräte */
    val UDP_KEY: ByteArray = MessageDigest.getInstance("MD5").digest("yGAdlopoPVldABfn".toByteArray())

    private val rnd = SecureRandom()

    // ------------------------------------------------------------ Krypto

    fun ecbEncrypt(key: ByteArray, data: ByteArray, pad: Boolean = true): ByteArray {
        val c = Cipher.getInstance("AES/ECB/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"))
        return c.doFinal(if (pad) pkcs7(data) else data)
    }

    fun ecbDecrypt(key: ByteArray, data: ByteArray): ByteArray {
        require(data.size % 16 == 0) { "Ungültige Länge ${data.size}" }
        val c = Cipher.getInstance("AES/ECB/NoPadding")
        c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"))
        val raw = c.doFinal(data)
        val p = raw.last().toInt() and 0xFF
        require(p in 1..16) { "Ungültiges Padding" }
        return raw.copyOfRange(0, raw.size - p)
    }

    /** AES-GCM: liefert Chiffretext + 16-Byte-Tag. */
    fun gcmEncrypt(key: ByteArray, iv: ByteArray, aad: ByteArray?, data: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        if (aad != null) c.updateAAD(aad)
        return c.doFinal(data)
    }

    fun gcmDecrypt(key: ByteArray, iv: ByteArray, aad: ByteArray?, dataWithTag: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
        if (aad != null) c.updateAAD(aad)
        return c.doFinal(dataWithTag)
    }

    fun hmac(key: ByteArray, data: ByteArray): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(data)

    private fun pkcs7(d: ByteArray): ByteArray {
        val n = 16 - d.size % 16
        return d + ByteArray(n) { n.toByte() }
    }

    fun randomBytes(n: Int) = ByteArray(n).also { rnd.nextBytes(it) }

    // ------------------------------------------------------------ Pakete

    data class Message(val seq: Int, val cmd: Int, val retcode: Int?, val payload: ByteArray, val ok: Boolean)

    fun pack(prefix: Int, seq: Int, cmd: Int, payload: ByteArray, hmacKey: ByteArray?, retcode: Int? = null, iv: ByteArray? = null): ByteArray {
        val out = ByteArrayOutputStream()
        if (prefix == PREFIX_55AA) {
            val endLen = if (hmacKey != null) 36 else 8
            val header = ByteBuffer.allocate(16).putInt(prefix).putInt(seq).putInt(cmd).putInt(payload.size + endLen).array()
            val data = header + payload
            out.write(data)
            if (hmacKey != null) out.write(hmac(hmacKey, data))
            else out.write(ByteBuffer.allocate(4).putInt(CRC32().apply { update(data) }.value.toInt()).array())
            out.write(ByteBuffer.allocate(4).putInt(SUFFIX_55AA).array())
        } else {
            requireNotNull(hmacKey) { "Für 6699-Pakete wird ein Schlüssel benötigt" }
            val raw = if (retcode != null) ByteBuffer.allocate(4).putInt(retcode).array() + payload else payload
            val len = raw.size + 16 + 12
            val header = ByteBuffer.allocate(18).putInt(prefix).putShort(0).putInt(seq).putInt(cmd).putInt(len).array()
            val nonce = iv ?: randomBytes(12)
            out.write(header)
            out.write(nonce)
            out.write(gcmEncrypt(hmacKey, nonce, header.copyOfRange(4, 18), raw))
            out.write(ByteBuffer.allocate(4).putInt(SUFFIX_6699).array())
        }
        return out.toByteArray()
    }

    /** Gesamtlänge des nächsten Pakets im Puffer oder -1, wenn der Kopf noch unvollständig ist. */
    fun packetLength(buf: ByteArray): Int {
        if (buf.size < 4) return -1
        val prefix = ByteBuffer.wrap(buf, 0, 4).int
        return when (prefix) {
            PREFIX_55AA -> if (buf.size < 16) -1 else 16 + ByteBuffer.wrap(buf, 12, 4).int
            PREFIX_6699 -> if (buf.size < 18) -1 else 18 + ByteBuffer.wrap(buf, 14, 4).int + 4
            else -> throw IllegalStateException("Unbekannter Paketanfang %08X".format(prefix))
        }
    }

    /**
     * Entpackt ein Paket. noRetcode: false = Rückgabecode immer vorhanden,
     * null = automatisch erkennen (6699), true = keiner.
     */
    fun unpack(data: ByteArray, hmacKey: ByteArray?, noRetcode: Boolean? = false): Message {
        val bb = ByteBuffer.wrap(data)
        val prefix = bb.int
        if (prefix == PREFIX_55AA) {
            val seq = bb.int
            val cmd = bb.int
            val len = bb.int
            val endLen = if (hmacKey != null) 36 else 8
            val retLen = if (noRetcode == true) 0 else 4
            val msgEnd = 16 + len
            require(data.size >= msgEnd && len >= retLen + endLen) { "Paket unvollständig" }
            val retcode = if (retLen == 4) ByteBuffer.wrap(data, 16, 4).int else null
            val payload = data.copyOfRange(16 + retLen, msgEnd - endLen)
            val signed = data.copyOfRange(0, msgEnd - endLen)
            val ok = if (hmacKey != null) hmac(hmacKey, signed).contentEquals(data.copyOfRange(msgEnd - endLen, msgEnd - 4))
            else (CRC32().apply { update(signed) }.value.toInt() == ByteBuffer.wrap(data, msgEnd - 8, 4).int)
            return Message(seq, cmd, retcode, payload, ok)
        }
        require(prefix == PREFIX_6699) { "Unbekanntes Paketformat" }
        requireNotNull(hmacKey)
        bb.short
        val seq = bb.int
        val cmd = bb.int
        val len = bb.int
        val body = data.copyOfRange(18, 18 + len)
        val iv = body.copyOfRange(0, 12)
        var plain = try {
            gcmDecrypt(hmacKey, iv, data.copyOfRange(4, 18), body.copyOfRange(12, body.size))
        } catch (e: Exception) {
            return Message(seq, cmd, null, ByteArray(0), false)
        }
        var retcode: Int? = null
        val strip = when (noRetcode) {
            false -> true
            null -> plain.size >= 5 && plain[0] != '{'.code.toByte() && plain[4] == '{'.code.toByte()
            true -> false
        }
        if (strip && plain.size >= 4) {
            retcode = ByteBuffer.wrap(plain, 0, 4).int
            plain = plain.copyOfRange(4, plain.size)
        }
        return Message(seq, cmd, retcode, plain, true)
    }

    // ------------------------------------------------------------ UDP-Erkennung

    /** Entschlüsselt einen Broadcast (Port 6666/6667/7000) zu JSON-Text. */
    fun decryptUdp(msg: ByteArray): String? = runCatching {
        val prefix = if (msg.size >= 4) ByteBuffer.wrap(msg, 0, 4).int else 0
        when (prefix) {
            PREFIX_55AA -> {
                val p = unpack(msg, null).payload
                if (p.isNotEmpty() && p.first() == '{'.code.toByte() && p.last() == '}'.code.toByte()) String(p)
                else String(ecbDecrypt(UDP_KEY, p))
            }
            PREFIX_6699 -> String(unpack(msg, UDP_KEY, noRetcode = null).payload).trimEnd('\u0000')
            else -> String(ecbDecrypt(UDP_KEY, msg))
        }
    }.getOrNull()

    fun discoveryRequest(localIp: String): ByteArray =
        pack(PREFIX_6699, 0, REQ_DEVINFO, """{"from":"app","ip":"$localIp"}""".toByteArray(), UDP_KEY)
}

/** Eine TCP-Verbindung zu einem Tuya-Gerät. */
class TuyaClient(private val dev: TuyaDevice, private val timeoutMs: Int = 5000, private val port: Int = 6668) : AutoCloseable {
    private val version = dev.version.toDoubleOrNull() ?: 3.3
    private val realKey = dev.key.toByteArray(Charsets.UTF_8).also {
        require(it.size == 16) { "Local Key muss 16 Zeichen lang sein (ist ${it.size})" }
    }
    private var key = realKey
    private var seq = 1
    private var device22 = false
    private val socket = Socket()
    private lateinit var input: InputStream
    private val versionHeader = dev.version.toByteArray() + ByteArray(12)

    init {
        require(version >= 3.2) { "Protokoll ${dev.version} wird nicht unterstützt (nur 3.3–3.5)" }
    }

    fun connect(): TuyaClient {
        socket.connect(InetSocketAddress(dev.ip, port), timeoutMs)
        socket.soTimeout = timeoutMs
        socket.tcpNoDelay = true
        input = socket.getInputStream()
        if (version >= 3.4) negotiate()
        return this
    }

    override fun close() = runCatching { socket.close() }.let { }

    private fun negotiate() {
        val localNonce = TuyaProtocol.randomBytes(16)
        key = realKey
        send(TuyaProtocol.SESS_KEY_NEG_START, localNonce)
        val resp = receive() ?: throw IllegalStateException("Keine Antwort beim Schlüsselaustausch")
        require(resp.cmd == TuyaProtocol.SESS_KEY_NEG_RESP) { "Unerwartete Antwort beim Schlüsselaustausch" }
        var p = resp.payload
        if (version < 3.5) p = TuyaProtocol.ecbDecrypt(realKey, p)
        require(p.size >= 48) { "Schlüsselaustausch fehlgeschlagen – Local Key falsch?" }
        val remoteNonce = p.copyOfRange(0, 16)
        require(TuyaProtocol.hmac(realKey, localNonce).contentEquals(p.copyOfRange(16, 48))) { "Local Key passt nicht zum Gerät" }
        send(TuyaProtocol.SESS_KEY_NEG_FINISH, TuyaProtocol.hmac(realKey, remoteNonce))
        val x = ByteArray(16) { (localNonce[it].toInt() xor remoteNonce[it].toInt()).toByte() }
        key = if (version < 3.5) TuyaProtocol.ecbEncrypt(realKey, x, pad = false)
        else TuyaProtocol.gcmEncrypt(realKey, localNonce.copyOfRange(0, 12), null, x).copyOfRange(0, 16)
    }

    private fun encode(cmd: Int, payload: ByteArray): ByteArray {
        val withHeader = cmd !in TuyaProtocol.NO_PROTOCOL_HEADER_CMDS
        val s = seq++
        return when {
            version >= 3.5 -> TuyaProtocol.pack(TuyaProtocol.PREFIX_6699, s, cmd, if (withHeader) versionHeader + payload else payload, key)
            version >= 3.4 -> {
                val p = if (withHeader) versionHeader + payload else payload
                TuyaProtocol.pack(TuyaProtocol.PREFIX_55AA, s, cmd, TuyaProtocol.ecbEncrypt(key, p), key)
            }
            else -> {
                val enc = TuyaProtocol.ecbEncrypt(key, payload)
                TuyaProtocol.pack(TuyaProtocol.PREFIX_55AA, s, cmd, if (withHeader) versionHeader + enc else enc, null)
            }
        }
    }

    private fun send(cmd: Int, payload: ByteArray) {
        socket.getOutputStream().apply { write(encode(cmd, payload)); flush() }
    }

    private var buffer = ByteArray(0)

    /** Nächstes Paket lesen; null bei Zeitüberschreitung. */
    private fun receive(): TuyaProtocol.Message? {
        while (true) {
            resync()
            val need = TuyaProtocol.packetLength(buffer)
            if (need in 1..buffer.size) {
                val pkt = buffer.copyOfRange(0, need)
                buffer = buffer.copyOfRange(need, buffer.size)
                val hmacKey = if (version >= 3.4) key else null
                val m = TuyaProtocol.unpack(pkt, hmacKey, noRetcode = false)
                if (!m.ok) throw IllegalStateException("Prüfsumme falsch – Local Key oder Version stimmt nicht")
                return m
            }
            val chunk = ByteArray(1024)
            val n = try { input.read(chunk) } catch (e: java.net.SocketTimeoutException) { return null }
            if (n < 0) throw IllegalStateException("Gerät hat die Verbindung getrennt")
            buffer += chunk.copyOf(n)
        }
    }

    /** Verwirft Bytes bis zum nächsten Paketanfang (00 00 55 AA bzw. 00 00 66 99). */
    private fun resync() {
        if (buffer.size < 4) return
        for (i in 0..buffer.size - 4) {
            if (buffer[i] == 0.toByte() && buffer[i + 1] == 0.toByte() &&
                ((buffer[i + 2] == 0x55.toByte() && buffer[i + 3] == 0xAA.toByte()) || (buffer[i + 2] == 0x66.toByte() && buffer[i + 3] == 0x99.toByte()))
            ) {
                if (i > 0) buffer = buffer.copyOfRange(i, buffer.size)
                return
            }
        }
        buffer = buffer.copyOfRange(buffer.size - 3, buffer.size)
    }

    /** Entschlüsselt die Nutzdaten einer Antwort zu JSON (oder null bei leerer Bestätigung). */
    private fun decode(m: TuyaProtocol.Message): JSONObject? {
        var p = m.payload
        if (p.isEmpty()) return null
        if (version >= 3.4 && version < 3.5) p = TuyaProtocol.ecbDecrypt(key, p)
        if (p.size >= 3 && String(p, 0, 3) == dev.version) p = p.copyOfRange(versionHeader.size, p.size)
        if (version < 3.4) p = TuyaProtocol.ecbDecrypt(key, p)
        val text = String(p, Charsets.UTF_8)
        if (text.contains("data unvalid")) { device22 = true; return null }
        if (!text.trimStart().startsWith("{")) return null
        val j = JSONObject(text)
        if (!j.has("dps") && j.optJSONObject("data")?.has("dps") == true) j.put("dps", j.getJSONObject("data").getJSONObject("dps"))
        return j
    }

    private fun ts() = System.currentTimeMillis() / 1000

    /** Liest alle Datenpunkte (dps). */
    fun status(): JSONObject {
        repeat(2) {
            if (version >= 3.4) send(TuyaProtocol.DP_QUERY_NEW, "{}".toByteArray())
            else if (device22) send(TuyaProtocol.CONTROL_NEW, """{"devId":"${dev.id}","uid":"${dev.id}","t":"${ts()}","dps":{"1":null}}""".toByteArray())
            else send(TuyaProtocol.DP_QUERY, """{"gwId":"${dev.id}","devId":"${dev.id}","uid":"${dev.id}","t":"${ts()}"}""".toByteArray())
            while (true) {
                val m = receive() ?: break
                val j = decode(m) ?: if (device22) break else continue
                j.optJSONObject("dps")?.let { return it }
            }
        }
        throw IllegalStateException("Gerät liefert keinen Status")
    }

    /** Setzt Datenpunkte, z. B. {"1": true}. */
    fun set(dps: Map<String, Any>) {
        val d = JSONObject(dps).toString()
        if (version >= 3.4) send(TuyaProtocol.CONTROL_NEW, """{"protocol":5,"t":${ts()},"data":{"dps":$d}}""".toByteArray())
        else send(TuyaProtocol.CONTROL, """{"devId":"${dev.id}","uid":"${dev.id}","t":"${ts()}","dps":$d}""".toByteArray())
        val m = receive() ?: throw IllegalStateException("Gerät antwortet nicht")
        if (m.retcode != null && m.retcode != 0) throw IllegalStateException("Gerät meldet Fehler ${m.retcode}")
    }

    /** Schalten: mode = on | off | toggle. Gibt den neuen Zustand zurück. */
    fun switch(mode: String): Boolean {
        var dp = dev.switchDp
        var current: Boolean? = null
        if (dp.isBlank() || mode == "toggle") {
            val s = status()
            if (dp.isBlank()) dp = listOf("1", "20").firstOrNull { s.opt(it) is Boolean } ?: s.keys().asSequence().firstOrNull { s.opt(it) is Boolean }
                ?: throw IllegalStateException("Kein Schalter-Datenpunkt gefunden")
            current = s.optBoolean(dp)
        }
        val target = when (mode) { "on" -> true; "off" -> false; else -> !(current ?: false) }
        set(mapOf(dp to target))
        return target
    }
}
