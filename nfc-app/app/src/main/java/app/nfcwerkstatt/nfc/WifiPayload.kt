package app.nfcwerkstatt.nfc

import java.io.ByteArrayOutputStream

enum class WifiAuth(val label: String, val authCode: Int, val encCode: Int) {
    WPA2("WPA2-Personal", 0x0020, 0x0008),
    WPA_WPA2("WPA/WPA2-Personal", 0x0022, 0x000C),
    WPA("WPA-Personal", 0x0002, 0x0004),
    OPEN("Offen (kein Passwort)", 0x0001, 0x0001);

    companion object {
        fun fromCode(code: Int): WifiAuth = when {
            code and 0x0020 != 0 && code and 0x0002 != 0 -> WPA_WPA2
            code and 0x0020 != 0 -> WPA2
            code and 0x0002 != 0 -> WPA
            else -> OPEN
        }
    }
}

data class WifiConfig(val ssid: String, val auth: WifiAuth, val password: String)

/**
 * Wi-Fi Simple Configuration (WSC) Credential – MIME-Typ application/vnd.wfa.wsc.
 * Android erkennt diesen Datensatz und bietet beim Scannen an, sich mit dem WLAN zu verbinden.
 */
object WifiPayload {
    const val MIME = "application/vnd.wfa.wsc"

    private const val CREDENTIAL = 0x100E
    private const val NETWORK_INDEX = 0x1026
    private const val SSID = 0x1045
    private const val AUTH_TYPE = 0x1003
    private const val ENC_TYPE = 0x100F
    private const val NETWORK_KEY = 0x1027
    private const val MAC_ADDRESS = 0x1020

    fun build(cfg: WifiConfig): ByteArray {
        val inner = ByteArrayOutputStream()
        tlv(inner, NETWORK_INDEX, byteArrayOf(1))
        tlv(inner, SSID, cfg.ssid.toByteArray(Charsets.UTF_8))
        tlv(inner, AUTH_TYPE, u16(cfg.auth.authCode))
        tlv(inner, ENC_TYPE, u16(cfg.auth.encCode))
        tlv(inner, NETWORK_KEY, if (cfg.auth == WifiAuth.OPEN) ByteArray(0) else cfg.password.toByteArray(Charsets.UTF_8))
        tlv(inner, MAC_ADDRESS, ByteArray(6) { 0xFF.toByte() })
        val out = ByteArrayOutputStream()
        tlv(out, CREDENTIAL, inner.toByteArray())
        return out.toByteArray()
    }

    fun parse(payload: ByteArray): WifiConfig? {
        val top = parseTlvs(payload)
        val credential = top.firstOrNull { it.first == CREDENTIAL }?.second ?: return null
        val fields = parseTlvs(credential)
        val ssid = fields.firstOrNull { it.first == SSID }?.second ?: return null
        val auth = fields.firstOrNull { it.first == AUTH_TYPE }?.second
        val key = fields.firstOrNull { it.first == NETWORK_KEY }?.second ?: ByteArray(0)
        val authCode = if (auth != null && auth.size >= 2) ((auth[0].toInt() and 0xFF) shl 8) or (auth[1].toInt() and 0xFF) else 0x0001
        return WifiConfig(String(ssid, Charsets.UTF_8), WifiAuth.fromCode(authCode), String(key, Charsets.UTF_8))
    }

    private fun parseTlvs(data: ByteArray): List<Pair<Int, ByteArray>> {
        val list = mutableListOf<Pair<Int, ByteArray>>()
        var i = 0
        while (i + 4 <= data.size) {
            val type = ((data[i].toInt() and 0xFF) shl 8) or (data[i + 1].toInt() and 0xFF)
            val len = ((data[i + 2].toInt() and 0xFF) shl 8) or (data[i + 3].toInt() and 0xFF)
            i += 4
            if (i + len > data.size) break
            list += type to data.copyOfRange(i, i + len)
            i += len
        }
        return list
    }

    private fun u16(v: Int) = byteArrayOf((v shr 8).toByte(), v.toByte())

    private fun tlv(out: ByteArrayOutputStream, type: Int, value: ByteArray) {
        out.write(u16(type))
        out.write(u16(value.size))
        out.write(value)
    }
}
