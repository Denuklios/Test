package app.nfcwerkstatt.automation

import java.net.HttpURLConnection
import java.net.URL

object Http {
    /** Einfache HTTP-Anfrage. Gibt (Statuscode, Antworttext) zurück. */
    fun request(
        method: String,
        url: String,
        body: String? = null,
        headers: Map<String, String> = emptyMap(),
        timeoutMs: Int = 6000,
    ): Pair<Int, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = method
            c.connectTimeout = timeoutMs
            c.readTimeout = timeoutMs
            headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
            if (body != null && method != "GET") {
                c.doOutput = true
                if (headers.keys.none { it.equals("Content-Type", true) }) c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            val stream = if (code < 400) c.inputStream else c.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
            return code to text
        } finally {
            c.disconnect()
        }
    }
}
