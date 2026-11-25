package app.nfcwerkstatt.automation

import org.json.JSONArray
import org.json.JSONObject

data class HaConfig(val url: String, val token: String)
data class HaEntity(val id: String, val name: String)

/** Home Assistant REST-API – darüber lassen sich fast alle Smart-Home-Systeme steuern. */
object HomeAssistant {
    private val DOMAINS = setOf("light", "switch", "scene", "script", "cover", "fan", "media_player", "input_boolean", "lock", "climate", "automation")

    fun test(c: HaConfig): String {
        val (code, text) = Http.request("GET", base(c) + "/api/", headers = auth(c))
        if (code == 401) throw IllegalStateException("Token ungültig.")
        if (code >= 400) throw IllegalStateException("Home Assistant antwortet mit $code")
        return JSONObject(text).optString("message", "OK")
    }

    fun entities(c: HaConfig): List<HaEntity> {
        val (code, text) = Http.request("GET", base(c) + "/api/states", headers = auth(c))
        if (code >= 400) throw IllegalStateException("Home Assistant antwortet mit $code")
        val arr = JSONArray(text)
        return (0 until arr.length()).map { arr.getJSONObject(it) }
            .map { HaEntity(it.getString("entity_id"), it.optJSONObject("attributes")?.optString("friendly_name").orEmpty()) }
            .filter { it.id.substringBefore('.') in DOMAINS }
            .sortedBy { it.id }
    }

    /** service z. B. "light.turn_off", entity z. B. "all" oder "light.wohnzimmer" */
    fun call(c: HaConfig, service: String, entity: String) {
        val (domain, name) = service.trim().split(".", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
        require(domain.isNotBlank() && name.isNotBlank()) { "Dienst muss die Form domain.dienst haben, z. B. light.turn_off" }
        val body = JSONObject().apply { if (entity.isNotBlank()) put("entity_id", entity.trim()) }
        val (code, _) = Http.request("POST", base(c) + "/api/services/$domain/$name", body.toString(), auth(c))
        if (code == 401) throw IllegalStateException("Home-Assistant-Token ungültig.")
        if (code >= 400) throw IllegalStateException("Home Assistant antwortet mit $code")
    }

    private fun base(c: HaConfig) = c.url.trim().trimEnd('/')
    private fun auth(c: HaConfig) = mapOf("Authorization" to "Bearer ${c.token.trim()}")
}
