package app.mailwerk.data

import android.content.Context
import app.mailwerk.mail.IcsEvent
import app.mailwerk.tr
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/** Ein Familienmitglied im gemeinsamen Kalender (Name + Farbe). */
data class FamilyMember(val id: String, val name: String, val color: Int)

/**
 * Verbindung zum Familienkalender (eigene Kalender-App mit PHP-Server, z. B. …/kalender/api.php).
 * Die Zugangsdaten sind dieselben wie in der Einladung der Kalender-App: Server-Adresse + Gruppen-Code.
 */
class FamilyCalendar(ctx: Context) {
    private val p = ctx.getSharedPreferences("family_calendar", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = p.getString("url", "")!!
        set(v) = p.edit().putString("url", v).apply()
    var code: String
        get() = p.getString("code", "")!!
        set(v) = p.edit().putString("code", v).apply()
    var groupName: String
        get() = p.getString("group", "")!!
        set(v) = p.edit().putString("group", v).apply()
    /** Termine aus E-Mails automatisch eintragen */
    var autoAdd: Boolean
        get() = p.getBoolean("auto", true)
        set(v) = p.edit().putBoolean("auto", v).apply()
    /** Auch Termine und Fristen im Mailtext erkennen („bis Montag 16:00“) */
    var detectText: Boolean
        get() = p.getBoolean("detect_text", true)
        set(v) = p.edit().putBoolean("detect_text", v).apply()
    val connected get() = serverUrl.isNotBlank() && code.isNotBlank()

    var members: List<FamilyMember>
        get() = runCatching {
            val a = JSONArray(p.getString("members", "[]"))
            (0 until a.length()).map { a.getJSONObject(it).let { o -> FamilyMember(o.getString("id"), o.optString("name"), o.optInt("color")) } }
        }.getOrDefault(emptyList())
        set(v) = p.edit().putString("members", JSONArray(v.map { JSONObject().put("id", it.id).put("name", it.name).put("color", it.color) }).toString()).apply()

    /** Welches Familienmitglied hinter welchem Mail-Konto steckt */
    fun memberFor(accountId: Long): FamilyMember? {
        val id = p.getString("map_$accountId", null) ?: return null
        return members.firstOrNull { it.id == id }
    }
    fun setMember(accountId: Long, memberId: String?) =
        p.edit().apply { if (memberId == null) remove("map_$accountId") else putString("map_$accountId", memberId) }.apply()

    fun disconnect() { p.edit().clear().apply() }

    /** Verbinden: Adresse prüfen, Gruppe und Mitglieder laden. */
    fun connect(url: String, groupCode: String, accounts: List<Account>) {
        val u = Api.normalizeUrl(url)
        val c = groupCode.trim().uppercase()
        val api = Api(u, c)
        api.ping()
        val name = api.groupName()
        serverUrl = u; code = c; groupName = name
        refreshMembers()
        // Konten automatisch zuordnen, wenn der Vorname passt
        val ms = members
        accounts.forEach { a ->
            if (memberFor(a.id) != null) return@forEach
            val first = a.name.trim().substringBefore(' ').lowercase()
            ms.firstOrNull { m -> first.isNotEmpty() && m.name.trim().substringBefore(' ').lowercase() == first }?.let { setMember(a.id, it.id) }
        }
    }

    fun refreshMembers(): List<FamilyMember> {
        val j = api().sync(0)
        val list = j.optJSONArray("members") ?: JSONArray()
        val ms = (0 until list.length()).map { list.getJSONObject(it) }.filter { !it.optBoolean("deleted") }
            .map { FamilyMember(it.getString("id"), it.optString("name"), it.optInt("color", 0xFF1E88E5.toInt())) }
            .sortedBy { it.name.lowercase() }
        members = ms
        j.optString("group").takeIf { it.isNotBlank() }?.let { groupName = it }
        return ms
    }

    fun api() = Api(serverUrl, code)

    /** Ergebnis beim Eintragen eines Termins */
    data class Result(val status: String, val eventId: String, val member: FamilyMember?, val title: String)

    /**
     * Termin aus der Einladung eintragen (bzw. aktualisieren oder absagen). Kommt dieselbe Einladung bei mehreren
     * Familienmitgliedern an, entsteht ein einziger Termin, an dem alle Empfänger teilnehmen.
     */
    fun apply(ev: IcsEvent, member: FamilyMember, source: String): Result {
        val id = eventId(ev)
        val api = api()
        val existing = api.findEvent(id)
        val merged = merge(existing, ev, member.id, source)
            ?: return Result(STATUS_IGNORED, id, member, ev.summary)
        api.save("event", merged)
        val status = when {
            merged.optBoolean("deleted") -> STATUS_CANCELLED
            ev.isCancel -> STATUS_CANCELLED
            existing != null && !existing.optBoolean("deleted") -> STATUS_UPDATED
            else -> STATUS_ADDED
        }
        return Result(status, id, member, ev.summary)
    }

    companion object {
        const val STATUS_ADDED = "added"
        const val STATUS_UPDATED = "updated"
        const val STATUS_CANCELLED = "cancelled"
        const val STATUS_IGNORED = "ignored"
        const val STATUS_ERROR = "error"
        const val STATUS_PENDING = ""

        private val iso = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")
        fun isoLocal(t: LocalDateTime): String = t.withSecond(0).withNano(0).format(iso)

        /** Gleiche Einladung -> gleiche Termin-ID, egal bei welchem Familienmitglied sie ankommt. */
        fun eventId(ev: IcsEvent): String {
            val md = MessageDigest.getInstance("SHA-1").digest((ev.uid + "|" + ev.recurrenceId).toByteArray())
            return "mail" + md.joinToString("") { "%02x".format(it) }.take(28)
        }

        /**
         * Termin für den Familienkalender bauen (Format der Kalender-App). Liefert null, wenn nichts zu tun ist
         * (Absage für einen Termin, der gar nicht eingetragen ist).
         */
        fun merge(existing: JSONObject?, ev: IcsEvent, memberId: String, source: String): JSONObject? {
            val alive = existing != null && !existing.optBoolean("deleted")
            if (ev.isCancel) {
                if (!alive) return null
                val o = JSONObject(existing!!.toString())
                val parts = o.optJSONArray("participants").toStrings().filter { it != memberId }
                if (o.optString("ownerId") == memberId || o.optString("ownerId").isEmpty()) {
                    if (parts.isEmpty()) o.put("deleted", true) else o.put("ownerId", parts.first()).put("participants", JSONArray(parts.drop(1)))
                } else o.put("participants", JSONArray(parts))
                o.put("editedBy", memberId)
                return o
            }
            val o = if (alive) JSONObject(existing!!.toString()) else JSONObject().apply {
                put("id", eventId(ev)); put("ownerId", memberId); put("participants", JSONArray())
                put("kind", "normal"); put("photos", JSONArray()); put("birthYear", JSONObject.NULL)
                put("createdBy", memberId); put("checklist", JSONArray()); put("prep", JSONArray()); put("answers", JSONObject())
                put("reminders", JSONArray(ev.reminders.ifEmpty { listOf(60) }))
            }
            // Empfänger als Teilnehmer ergänzen (Farbe im Kalender)
            if (alive && o.optString("ownerId") != memberId) {
                val parts = o.optJSONArray("participants").toStrings()
                if (memberId !in parts) o.put("participants", JSONArray(parts + memberId))
            }
            o.put("title", ev.summary.ifBlank { tr("Termin") })
            o.put("start", isoLocal(ev.start))
            o.put("end", isoLocal(ev.end))
            o.put("allDay", ev.allDay)
            o.put("location", ev.location)
            if (!alive || o.optString("notes").isBlank()) o.put("notes", notes(ev, source))
            o.put("repeat", ev.repeat)
            o.put("repeatUntil", ev.repeatUntil?.let { isoLocal(it.atStartOfDay()) } ?: JSONObject.NULL)
            o.put("editedBy", memberId)
            o.put("deleted", false)
            return o
        }

        private fun notes(ev: IcsEvent, source: String): String = buildList {
            if (ev.description.isNotBlank()) add(ev.description.take(2000))
            if (ev.repeatNote.isNotBlank()) add(tr("Wiederholung laut Einladung: {0}", ev.repeatNote))
            add(tr("📧 Aus E-Mail: {0}", source))
        }.joinToString("\n\n")

        private fun JSONArray?.toStrings(): List<String> = if (this == null) emptyList() else (0 until length()).map { optString(it) }
    }
}

/** HTTP-Schnittstelle des Kalender-Servers (api.php). */
class Api(val baseUrl: String, val code: String) {
    class ApiException(msg: String) : Exception(msg)

    companion object {
        fun normalizeUrl(input: String): String {
            var u = input.trim().trimEnd(')', '.', ',')
            if (u.isEmpty()) return u
            if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://$u"
            u = u.trimEnd('/')
            if (!u.endsWith(".php")) u = "$u/api.php"
            return u
        }

        /** Einladungstext der Kalender-App („Server: … Code: …“) zerlegen. */
        fun parseInvite(text: String): Pair<String?, String?> {
            val url = Regex("https?://\\S+").find(text)?.value?.replace(Regex("[).,]+$"), "")
            val code = Regex("(?:Code|code|CODE)[:\\s]+([A-Za-z0-9]{6,12})").find(text)?.groupValues?.get(1)?.uppercase()
            return url to code
        }
    }

    private fun url(action: String, q: Map<String, String> = emptyMap()): URL {
        val sep = if (baseUrl.contains('?')) "&" else "?"
        val extra = q.entries.joinToString("") { "&${it.key}=${URLEncoder.encode(it.value, "UTF-8")}" }
        return URL("$baseUrl${sep}a=$action$extra")
    }

    private fun call(action: String, q: Map<String, String> = emptyMap(), body: JSONObject? = null, auth: Boolean = true): JSONObject {
        val con = url(action, q).openConnection() as HttpURLConnection
        try {
            con.connectTimeout = 15_000; con.readTimeout = 20_000
            con.setRequestProperty("Accept", "application/json")
            if (auth) con.setRequestProperty("X-Group-Key", code)
            if (body != null) {
                con.requestMethod = "POST"; con.doOutput = true
                con.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                con.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val codeHttp = con.responseCode
            val text = (if (codeHttp >= 400) con.errorStream else con.inputStream)?.use { String(it.readBytes()) } ?: ""
            val j = runCatching { JSONObject(text) }.getOrElse {
                throw ApiException(tr("Der Kalender-Server antwortet nicht richtig (HTTP {0}). Stimmt die Adresse?", codeHttp))
            }
            if (!j.optBoolean("ok")) throw ApiException(j.optString("error").ifBlank { tr("Fehler beim Kalender-Server") })
            return j
        } finally { con.disconnect() }
    }

    fun ping() {
        val j = runCatching { call("ping", auth = false) }.getOrElse { throw ApiException(it.message ?: tr("Kalender-Server nicht erreichbar")) }
        if (j.optString("app") != "familienkalender") throw ApiException(tr("Unter dieser Adresse läuft kein Familienkalender."))
    }

    fun groupName(): String = call("group").optString("name")
    fun sync(since: Long): JSONObject = call("sync", mapOf("since" to "$since"))
    fun save(kind: String, item: JSONObject): Long = call("save", body = JSONObject().put("kind", kind).put("item", item)).optLong("updatedAt")

    fun findEvent(id: String): JSONObject? {
        val evs = sync(0).optJSONArray("events") ?: return null
        return (0 until evs.length()).map { evs.getJSONObject(it) }.lastOrNull { it.optString("id") == id }
    }
}
