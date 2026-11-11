package de.fotobox.app

import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class ApiException(val code: Int, msg: String) : IOException(msg)

class Api(private val base: String, private val token: String = "") {

    private fun open(path: String, method: String, timeoutMs: Int = 15000): HttpURLConnection {
        val c = URL(base.trimEnd('/') + path).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = timeoutMs
        c.readTimeout = 60000
        if (token.isNotEmpty()) c.setRequestProperty("Authorization", "Bearer $token")
        return c
    }

    private fun read(c: HttpURLConnection): JSONObject {
        val code = c.responseCode
        val stream = if (code in 200..299) c.inputStream else c.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
        c.disconnect()
        val json = try { JSONObject(text) } catch (e: Exception) { JSONObject() }
        if (code !in 200..299) throw ApiException(code, json.optString("error", "Fehler $code"))
        return json
    }

    private fun q(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    /** true, wenn unser Server unter der Adresse antwortet (also: wir sind zu Hause). */
    fun ping(): Boolean = try {
        read(open("/api/ping", "GET", 4000)).optString("app") == "fotobox"
    } catch (e: Exception) { false }

    fun login(user: String, password: String, device: String): String {
        val c = open("/api/login", "POST")
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        val body = JSONObject().put("user", user).put("password", password).put("device", device)
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        return read(c).getString("token")
    }

    fun me(): String = read(open("/api/me", "GET")).getString("user")

    fun remoteSize(path: String): Long? {
        val j = read(open("/api/stat?path=${q(path)}", "GET"))
        return if (j.optBoolean("exists")) j.getLong("size") else null
    }

    /** Lädt eine Datei hoch. Gibt den Pfad zurück, unter dem sie gespeichert wurde. */
    fun upload(path: String, size: Long, mtimeMs: Long, input: InputStream, onProgress: (Long) -> Unit = {}): String {
        val c = open("/api/upload?path=${q(path)}&mtime=$mtimeMs", "PUT")
        c.doOutput = true
        c.readTimeout = 300000
        c.setFixedLengthStreamingMode(size)
        c.setRequestProperty("Content-Type", "application/octet-stream")
        c.outputStream.use { out ->
            val buf = ByteArray(256 * 1024)
            var sent = 0L
            input.use { inp ->
                while (sent < size) {
                    val n = inp.read(buf, 0, minOf(buf.size.toLong(), size - sent).toInt())
                    if (n < 0) throw IOException("Datei kürzer als erwartet")
                    out.write(buf, 0, n)
                    sent += n
                    onProgress(sent)
                }
            }
        }
        return read(c).optString("path", path)
    }
}
