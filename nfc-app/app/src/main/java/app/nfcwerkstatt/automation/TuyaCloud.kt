package app.nfcwerkstatt.automation

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Einmaliger Import der Local Keys über die Tuya-IoT-Plattform (iot.tuya.com).
 * Danach wird die Cloud nicht mehr gebraucht – geschaltet wird nur noch lokal.
 */
class TuyaCloud(private val region: String, private val accessId: String, private val secret: String) {

    companion object {
        val REGIONS = linkedMapOf(
            "eu" to ("Europa" to "openapi.tuyaeu.com"),
            "eu-w" to ("Westeuropa" to "openapi-weaz.tuyaeu.com"),
            "us" to ("USA West" to "openapi.tuyaus.com"),
            "us-e" to ("USA Ost" to "openapi-ueaz.tuyaus.com"),
            "cn" to ("China" to "openapi.tuyacn.com"),
            "in" to ("Indien" to "openapi.tuyain.com"),
        )

        private val SHA_EMPTY = sha256Hex("")

        fun sha256Hex(s: String) = MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }

        /** Signatur nach Tuya-Vorgabe (neues Verfahren, wie tinytuya). */
        fun sign(accessId: String, secret: String, token: String?, t: Long, method: String, pathAndQuery: String, body: String = ""): String {
            val bodyHash = if (body.isEmpty()) SHA_EMPTY else sha256Hex(body)
            val payload = accessId + (token ?: "") + t + "$method\n$bodyHash\n\n$pathAndQuery"
            return TuyaProtocol.hmac(secret.toByteArray(), payload.toByteArray()).joinToString("") { "%02X".format(it) }
        }
    }

    private val host = REGIONS[region]?.second ?: REGIONS.values.first().second
    private var token: String? = null

    private fun get(pathAndQuery: String): JSONObject {
        val t = System.currentTimeMillis()
        val c = URL("https://$host$pathAndQuery").openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10000; c.readTimeout = 15000
            c.setRequestProperty("client_id", accessId)
            c.setRequestProperty("sign", sign(accessId, secret, token, t, "GET", pathAndQuery))
            c.setRequestProperty("t", t.toString())
            c.setRequestProperty("sign_method", "HMAC-SHA256")
            token?.let { c.setRequestProperty("access_token", it) }
            val text = (if (c.responseCode < 400) c.inputStream else c.errorStream).bufferedReader().use { it.readText() }
            val j = JSONObject(text)
            if (!j.optBoolean("success")) {
                val msg = j.optString("msg", "unbekannt")
                throw IllegalStateException(
                    when {
                        msg.contains("sign invalid", true) -> "Access ID oder Secret falsch."
                        msg.contains("data center", true) || j.optInt("code") == 2009 -> "Falsches Rechenzentrum gewählt – Region prüfen."
                        msg.contains("permission", true) -> "Keine Berechtigung – im Tuya-Projekt die App-Verknüpfung prüfen."
                        else -> "Tuya: $msg"
                    },
                )
            }
            return j
        } finally {
            c.disconnect()
        }
    }

    /** Lädt alle verknüpften Geräte inkl. Local Key. IP/Version kommen danach aus der WLAN-Suche. */
    fun devices(): List<TuyaDevice> {
        token = null
        token = get("/v1.0/token?grant_type=1").getJSONObject("result").getString("access_token")
        val list = mutableListOf<TuyaDevice>()
        var lastRowKey: String? = null
        do {
            val q = (if (lastRowKey != null) "last_row_key=$lastRowKey&" else "") + "size=50"
            val r = get("/v1.0/iot-01/associated-users/devices?$q").getJSONObject("result")
            val arr = r.optJSONArray("devices") ?: r.optJSONArray("list")
            if (arr != null) for (i in 0 until arr.length()) {
                val d = arr.getJSONObject(i)
                val key = d.optString("local_key")
                if (key.length != 16) continue // z. B. Zigbee-Untergeräte ohne eigenen Schlüssel
                list += TuyaDevice(
                    id = d.getString("id"),
                    name = d.optString("name").ifBlank { d.optString("product_name") },
                    key = key,
                    ip = "",
                    version = "",
                    category = d.optString("category"),
                    switchDp = defaultSwitchDp(d.optString("category")),
                )
            }
            lastRowKey = r.optString("last_row_key").ifBlank { null }
        } while (r.optBoolean("has_more") && lastRowKey != null)
        return list
    }

    private fun defaultSwitchDp(category: String) = when (category) {
        "dj", "dd", "fwd", "xdd", "dc", "fsd", "tgq" -> "20" // Lampen, Lichtstreifen, Deckenleuchten
        else -> "" // Steckdosen meist "1" – wird beim ersten Schalten erkannt
    }
}
