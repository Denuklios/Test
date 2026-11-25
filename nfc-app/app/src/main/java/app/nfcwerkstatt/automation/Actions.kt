package app.nfcwerkstatt.automation

import android.content.Context
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

enum class StepType(val label: String) {
    HUE_ALL("Hue: alle Lichter"),
    HUE_GROUP("Hue: Raum / Zone"),
    HUE_SCENE("Hue: Szene"),
    HA("Home Assistant"),
    WEBHOOK("Webhook (Shelly, IFTTT …)"),
    TORCH("Taschenlampe"),
    RINGER("Klingelmodus"),
    TIMER("Timer stellen"),
    OPEN_URL("Link öffnen"),
    OPEN_APP("App öffnen"),
}

data class Step(val type: StepType, val p: Map<String, String> = emptyMap()) {
    operator fun get(k: String): String = p[k].orEmpty()

    fun describe(): String = when (type) {
        StepType.HUE_ALL -> "Alle Hue-Lichter ${modeText(this["mode"])}"
        StepType.HUE_GROUP -> "Hue „${this["name"]}“ ${modeText(this["mode"])}" +
            (this["bri"].toIntOrNull()?.let { if (this["mode"] != "off") " · ${it * 100 / 254} %" else "" } ?: "")
        StepType.HUE_SCENE -> "Hue-Szene „${this["name"]}“"
        StepType.HA -> "HA: ${this["service"]} → ${this["entity"].ifBlank { "–" }}"
        StepType.WEBHOOK -> "${this["method"].ifBlank { "GET" }} ${this["url"]}"
        StepType.TORCH -> "Taschenlampe ${modeText(this["mode"])}"
        StepType.RINGER -> "Klingelmodus: " + when (this["mode"]) {
            "silent" -> "lautlos"; "vibrate" -> "Vibration"; "toggle" -> "lautlos ↔ normal"; else -> "normal"
        }
        StepType.TIMER -> "Timer ${this["minutes"]} min" + this["label"].let { if (it.isBlank()) "" else " „$it“" }
        StepType.OPEN_URL -> "Öffnen: ${this["url"]}"
        StepType.OPEN_APP -> "App: ${this["label"].ifBlank { this["package"] }}"
    }

    private fun modeText(m: String) = when (m) { "on" -> "an"; "toggle" -> "umschalten"; else -> "aus" }
}

data class TagAction(val id: String, val name: String, val steps: List<Step>) {
    companion object {
        fun new(name: String, steps: List<Step>) = TagAction(UUID.randomUUID().toString().take(8), name, steps)
    }
}

/** Kennung im Tag: NFC-Forum External Type "app.nfcwerkstatt:a" mit der Aktions-ID. */
object ActionTag {
    const val DOMAIN = "app.nfcwerkstatt"
    const val TYPE = "a"
    const val FULL = "$DOMAIN:$TYPE"

    fun message(a: TagAction, packageName: String): NdefMessage = NdefMessage(
        NdefRecord.createExternal(DOMAIN, TYPE, a.id.toByteArray(Charsets.US_ASCII)),
        NdefRecord.createApplicationRecord(packageName),
    )

    fun findId(msg: NdefMessage?): String? = msg?.records?.firstOrNull {
        it.tnf == NdefRecord.TNF_EXTERNAL_TYPE && String(it.type, Charsets.US_ASCII).equals(FULL, true)
    }?.let { String(it.payload, Charsets.US_ASCII) }
}

/** Speichert Aktionen und Zugangsdaten lokal im App-Speicher. */
class ActionStore(context: Context) {
    private val file = File(context.filesDir, "actions.json")
    private val prefs = context.getSharedPreferences("smarthome", Context.MODE_PRIVATE)

    @Synchronized
    fun load(): List<TagAction> = try {
        if (!file.exists()) emptyList() else {
            val arr = JSONArray(file.readText())
            (0 until arr.length()).map { arr.getJSONObject(it) }.map { o ->
                val steps = o.getJSONArray("steps").let { s ->
                    (0 until s.length()).mapNotNull { i ->
                        val so = s.getJSONObject(i)
                        val type = runCatching { StepType.valueOf(so.getString("type")) }.getOrNull() ?: return@mapNotNull null
                        val po = so.optJSONObject("p") ?: JSONObject()
                        Step(type, po.keys().asSequence().associateWith { po.getString(it) })
                    }
                }
                TagAction(o.getString("id"), o.getString("name"), steps)
            }
        }
    } catch (e: Exception) {
        emptyList()
    }

    @Synchronized
    fun save(list: List<TagAction>) {
        val arr = JSONArray()
        list.forEach { a ->
            arr.put(JSONObject().put("id", a.id).put("name", a.name).put("steps", JSONArray().apply {
                a.steps.forEach { s -> put(JSONObject().put("type", s.type.name).put("p", JSONObject(s.p))) }
            }))
        }
        file.writeText(arr.toString())
    }

    fun find(id: String): TagAction? = load().firstOrNull { it.id == id }

    var hue: HueBridge?
        get() {
            val ip = prefs.getString("hueIp", null) ?: return null
            val user = prefs.getString("hueUser", null) ?: return null
            return HueBridge(ip, user)
        }
        set(v) = prefs.edit().putString("hueIp", v?.ip).putString("hueUser", v?.user).apply()

    var ha: HaConfig?
        get() {
            val url = prefs.getString("haUrl", null) ?: return null
            val token = prefs.getString("haToken", null) ?: return null
            return HaConfig(url, token)
        }
        set(v) = prefs.edit().putString("haUrl", v?.url).putString("haToken", v?.token).apply()
}
