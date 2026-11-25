package app.nfcwerkstatt.automation

import org.json.JSONArray
import org.json.JSONObject

data class HueBridge(val ip: String, val user: String)
data class HueGroup(val id: String, val name: String, val type: String)
data class HueScene(val id: String, val name: String, val group: String?)

/** Philips Hue Bridge über die lokale API (v1) im Heimnetz. */
object Hue {

    fun discover(): List<String> {
        val (_, text) = Http.request("GET", "https://discovery.meethue.com/")
        val arr = JSONArray(text)
        return (0 until arr.length()).mapNotNull { arr.getJSONObject(it).optString("internalipaddress").ifEmpty { null } }
    }

    /** Koppeln: vorher den runden Knopf auf der Bridge drücken. Gibt den Benutzer-Schlüssel zurück. */
    fun pair(ip: String): String {
        val (_, text) = Http.request("POST", "http://$ip/api", """{"devicetype":"nfc_werkstatt#android"}""")
        val o = JSONArray(text).getJSONObject(0)
        o.optJSONObject("success")?.let { return it.getString("username") }
        val err = o.optJSONObject("error")
        throw IllegalStateException(
            if (err?.optInt("type") == 101) "Bitte zuerst den runden Knopf auf der Bridge drücken, dann innerhalb von 30 s verbinden."
            else err?.optString("description") ?: "Unerwartete Antwort der Bridge",
        )
    }

    fun groups(b: HueBridge): List<HueGroup> {
        val o = get(b, "groups")
        return o.keys().asSequence().map { id ->
            val g = o.getJSONObject(id)
            HueGroup(id, g.optString("name"), g.optString("type"))
        }.filter { it.type in setOf("Room", "Zone", "LightGroup", "Entertainment") }.sortedBy { it.name.lowercase() }.toList()
    }

    fun scenes(b: HueBridge): List<HueScene> {
        val o = get(b, "scenes")
        return o.keys().asSequence().map { id ->
            val s = o.getJSONObject(id)
            HueScene(id, s.optString("name"), s.optString("group").ifEmpty { null })
        }.sortedBy { it.name.lowercase() }.toList()
    }

    /** mode: on | off | toggle; bri 1..254 optional */
    fun setGroup(b: HueBridge, groupId: String, mode: String, bri: Int? = null): String {
        val on = when (mode) {
            "toggle" -> !get(b, "groups/$groupId").getJSONObject("state").optBoolean("any_on")
            "on" -> true
            else -> false
        }
        val body = JSONObject().put("on", on)
        if (on && bri != null) body.put("bri", bri.coerceIn(1, 254))
        put(b, "groups/$groupId/action", body)
        return if (on) "an" else "aus"
    }

    fun scene(b: HueBridge, sceneId: String, groupId: String?) {
        put(b, "groups/${groupId ?: "0"}/action", JSONObject().put("scene", sceneId))
    }

    private fun get(b: HueBridge, path: String): JSONObject {
        val (code, text) = Http.request("GET", "http://${b.ip}/api/${b.user}/$path")
        if (code >= 400) throw IllegalStateException("Bridge antwortet mit $code")
        if (text.trimStart().startsWith("[")) throw IllegalStateException(errorText(JSONArray(text)))
        return JSONObject(text)
    }

    private fun put(b: HueBridge, path: String, body: JSONObject) {
        val (code, text) = Http.request("PUT", "http://${b.ip}/api/${b.user}/$path", body.toString())
        if (code >= 400) throw IllegalStateException("Bridge antwortet mit $code")
        if (text.trimStart().startsWith("[")) {
            val arr = JSONArray(text)
            if ((0 until arr.length()).any { arr.getJSONObject(it).has("error") }) throw IllegalStateException(errorText(arr))
        }
    }

    private fun errorText(arr: JSONArray): String =
        (0 until arr.length()).mapNotNull { arr.getJSONObject(it).optJSONObject("error")?.optString("description") }
            .firstOrNull()?.let { if (it.contains("unauthorized")) "Bridge-Zugang ungültig – Hue neu verbinden." else it }
            ?: "Fehler der Bridge"
}
