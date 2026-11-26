package de.schichtwecker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Anbindung an die eigene Familienkalender-App (Server mit api.php + Gruppen-Code).
 * Liest die Termine genauso wie die App selbst (Sync-Schnittstelle) und rechnet
 * Wiederholungen aus.
 */
object Familienkalender {

    data class Member(val id: String, val name: String, val color: Int)
    data class Occ(val id: String, val title: String, val start: Long, val end: Long, val allDay: Boolean)

    private fun sp(ctx: Context) = Prefs(ctx).sp

    fun url(ctx: Context) = sp(ctx).getString("famUrl", "") ?: ""
    fun code(ctx: Context) = sp(ctx).getString("famCode", "") ?: ""
    fun myId(ctx: Context) = sp(ctx).getString("famMyId", "") ?: ""
    fun setMyId(ctx: Context, id: String) = sp(ctx).edit().putString("famMyId", id).apply()
    fun connected(ctx: Context) = url(ctx).isNotEmpty() && code(ctx).isNotEmpty()
    fun lastError(ctx: Context) = sp(ctx).getString("famError", null)
    fun lastOk(ctx: Context) = sp(ctx).getLong("famLastOk", 0L)

    private fun cacheFile(ctx: Context) = File(ctx.filesDir, "familienkalender.json")

    fun normalizeUrl(input: String): String {
        var u = input.trim().trimEnd(')', '.', ',')
        if (u.isEmpty()) return u
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://$u"
        u = u.trimEnd('/')
        if (!u.endsWith(".php")) u = "$u/api.php"
        return u
    }

    /** Erkennt Server und Code aus der Einladung („Server: https://… Code: ABCD2345“). */
    fun parseInvite(text: String): Pair<String, String>? {
        val url = Regex("https?://\\S+").find(text)?.value
        val code = Regex("(?:Code|code)[:\\s]+([A-Z0-9]{6,12})").find(text)?.groupValues?.get(1)
        if (url == null || code == null) return null
        return normalizeUrl(url) to code
    }

    fun connect(ctx: Context, url: String, code: String) {
        sp(ctx).edit().putString("famUrl", url).putString("famCode", code)
            .putString("famMyId", "").remove("famError").putLong("famSince", 0).apply()
        cacheFile(ctx).delete()
    }

    fun disconnect(ctx: Context) {
        sp(ctx).edit().remove("famUrl").remove("famCode").remove("famMyId").remove("famError")
            .remove("famSince").remove("famLastOk").apply()
        cacheFile(ctx).delete()
    }

    private fun loadCache(ctx: Context): JSONObject = try {
        JSONObject(cacheFile(ctx).readText())
    } catch (_: Exception) {
        JSONObject().put("member", JSONObject()).put("event", JSONObject()).put("template", JSONObject())
    }

    /** Holt Änderungen vom Server. Nicht im Haupt-Thread aufrufen. Gibt Fehlertext oder null zurück. */
    fun fetch(ctx: Context): String? {
        if (!connected(ctx)) return null
        val since = sp(ctx).getLong("famSince", 0L)
        return try {
            val u = URL(url(ctx) + "?a=sync&since=" + URLEncoder.encode(since.toString(), "UTF-8"))
            val c = (u.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15000; readTimeout = 20000
                setRequestProperty("X-Group-Key", code(ctx))
                setRequestProperty("Accept", "application/json")
            }
            val status = c.responseCode
            val body = (if (status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.readText() ?: ""
            c.disconnect()
            val j = try { JSONObject(body) } catch (_: Exception) {
                throw IllegalStateException("Server antwortet nicht richtig (HTTP $status)")
            }
            if (!j.optBoolean("ok")) throw IllegalStateException(j.optString("error", "Fehler vom Server"))
            val cache = mergeSync(loadCache(ctx), j)
            cacheFile(ctx).writeText(cache.toString())
            sp(ctx).edit().putLong("famSince", j.optLong("since", since)).putLong("famLastOk", System.currentTimeMillis())
                .remove("famError").apply()
            null
        } catch (e: Exception) {
            val msg = when (e) {
                is java.net.UnknownHostException -> "Kein Internet oder Server nicht erreichbar"
                is java.net.SocketTimeoutException -> "Server antwortet nicht (Zeitüberschreitung)"
                else -> e.message ?: e.toString()
            }
            sp(ctx).edit().putString("famError", msg).apply()
            msg
        }
    }

    /** Antwort von api.php?a=sync in den Zwischenspeicher übernehmen */
    fun mergeSync(cache: JSONObject, j: JSONObject): JSONObject {
        fun merge(kind: String, arr: JSONArray?) {
            if (arr == null) return
            val m = cache.optJSONObject(kind) ?: JSONObject().also { cache.put(kind, it) }
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val id = o.optString("id"); if (id.isEmpty()) continue
                if (o.optBoolean("deleted")) m.remove(id) else m.put(id, o)
            }
        }
        merge("member", j.optJSONArray("members"))
        merge("event", j.optJSONArray("events"))
        merge("template", j.optJSONArray("templates"))
        return cache
    }

    fun members(ctx: Context): List<Member> {
        val m = loadCache(ctx).optJSONObject("member") ?: return emptyList()
        return m.keys().asSequence().mapNotNull { m.optJSONObject(it) }
            .filter { !it.optBoolean("deleted") }
            .map { Member(it.optString("id"), it.optString("name", "?"), it.optInt("color", 0xFF1E88E5.toInt())) }
            .sortedBy { it.name.lowercase() }.toList()
    }

    /** Vorlagen des Schicht-Pinsels (Titel, Beginn, Ende in Minuten, ganztägig) */
    fun templates(ctx: Context): List<JSONObject> {
        val m = loadCache(ctx).optJSONObject("template") ?: return emptyList()
        return m.keys().asSequence().mapNotNull { m.optJSONObject(it) }.filter { !it.optBoolean("deleted") }.toList()
    }

    private fun parseLocal(s: String?): LocalDateTime? {
        if (s.isNullOrEmpty()) return null
        return try {
            if (s.endsWith("Z") || Regex("[+-]\\d\\d:\\d\\d$").containsMatchIn(s))
                java.time.OffsetDateTime.parse(s).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime()
            else LocalDateTime.parse(s.take(19))
        } catch (_: Exception) {
            try { LocalDate.parse(s.take(10)).atStartOfDay() } catch (_: Exception) { null }
        }
    }

    private fun ms(d: LocalDateTime) = d.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    /** Alle Termine, an denen „ich“ beteiligt bin, im Zeitraum – Wiederholungen ausgerechnet. */
    fun occurrences(ctx: Context, from: Long, to: Long, onlyMine: Boolean = true): List<Occ> {
        if (!connected(ctx)) return emptyList()
        val evs = loadCache(ctx).optJSONObject("event") ?: return emptyList()
        return expandAll(evs, if (onlyMine) myId(ctx) else "", from, to)
    }

    fun expandAll(evs: JSONObject, me: String, from: Long, to: Long): List<Occ> {
        val zone = ZoneId.systemDefault()
        val fromD = java.time.Instant.ofEpochMilli(from).atZone(zone).toLocalDate()
        val toD = java.time.Instant.ofEpochMilli(to).atZone(zone).toLocalDate()
        val out = mutableListOf<Occ>()
        for (k in evs.keys()) {
            val e = evs.optJSONObject(k) ?: continue
            if (e.optBoolean("deleted")) continue
            val kind = e.optString("kind", "normal")
            if (kind == "birthday" || kind == "vacation") continue
            if (me.isNotEmpty()) {
                val parts = e.optJSONArray("participants")
                val mine = e.optString("ownerId") == me ||
                    (parts != null && (0 until parts.length()).any { parts.optString(it) == me })
                if (!mine) continue
            }
            val s0 = parseLocal(e.optString("start")) ?: continue
            val end0 = parseLocal(e.optString("end")) ?: s0
            val allDay = e.optBoolean("allDay")
            val dur = Duration.between(s0, end0)
            val title = e.optString("title")
            val id = e.optString("id")
            fun add(s: LocalDateTime) {
                val en = if (allDay) s.plusDays(1) else s.plus(dur)
                out += Occ(id, title, ms(s), ms(en), allDay)
            }
            var repeat = e.optString("repeat", "none")
            var iv = e.optInt("interval", 1).coerceAtLeast(1)
            if (repeat == "biweekly") { repeat = "weekly"; iv = 2 }
            if (repeat == "none" || repeat.isEmpty()) {
                val d = s0.toLocalDate()
                if (!d.isBefore(fromD.minusDays(1)) && !d.isAfter(toD)) add(s0)
                continue
            }
            val until = parseLocal(e.optString("repeatUntil", ""))?.toLocalDate()
            val ex = e.optJSONArray("exdates")?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet()
            fun nth(n: Long): LocalDateTime = when (repeat) {
                "daily" -> s0.plusDays(n * iv)
                "weekly" -> s0.plusWeeks(n * iv)
                "monthly" -> s0.plusMonths(n * iv)   // Java kürzt am Monatsende genauso wie die App
                else -> s0.plusYears(n * iv)
            }
            var n = 0L
            val daysTo = ChronoUnit.DAYS.between(s0.toLocalDate(), fromD) - 3
            if (daysTo > 0) n = when (repeat) {
                "daily" -> daysTo / iv; "weekly" -> daysTo / (7L * iv); "monthly" -> daysTo / (31L * iv); else -> daysTo / (366L * iv)
            }
            var guard = 0
            while (guard++ < 2000) {
                val s = nth(n++)
                val d = s.toLocalDate()
                if (d.isAfter(toD)) break
                if (until != null && d.isAfter(until)) break
                if (d.toString() in ex) continue
                if (!d.isBefore(fromD.minusDays(1))) add(s)
            }
        }
        return out.sortedBy { it.start }
    }

    private object Duration {
        fun between(a: LocalDateTime, b: LocalDateTime): java.time.Duration {
            val d = java.time.Duration.between(a, b)
            return if (d.isNegative) java.time.Duration.ZERO else d
        }
    }
}
