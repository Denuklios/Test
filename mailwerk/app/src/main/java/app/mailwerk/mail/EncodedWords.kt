package app.mailwerk.mail

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.Charset
import java.nio.charset.CodingErrorAction
import java.util.Base64

/**
 * Robuste Dekodierung von Kopfzeilen (RFC 2047), wie Gmail/Thunderbird es machen:
 * Viele Absender zerteilen ein Emoji (4 Bytes UTF-8) auf zwei „encoded words“. Die Bytes aufeinanderfolgender
 * Wörter mit gleichem Zeichensatz werden deshalb erst gesammelt und dann gemeinsam dekodiert.
 * Außerdem werden unkodierte UTF-8-Kopfzeilen repariert, die als ISO-8859-1 gelesen wurden („ðŸŽ„“ -> „🎄“).
 */
object EncodedWords {
    private val word = Regex("=\\?([^?\\s]+)\\?([bBqQ])\\?([^?\\s]*)\\?=")

    fun decode(input: String): String {
        val s = input.replace(Regex("\\r?\\n[ \\t]+"), " ")
        if (!s.contains("=?")) return fixMojibake(s)
        val out = StringBuilder()
        val buf = ByteArrayOutputStream()
        var charset: String? = null
        var pos = 0
        fun flush() {
            val cs = charset ?: return
            out.append(String(buf.toByteArray(), charsetOf(cs)))
            buf.reset(); charset = null
        }
        for (m in word.findAll(s)) {
            val between = s.substring(pos, m.range.first)
            val cs = m.groupValues[1].substringBefore('*')
            when {
                between.isNotBlank() -> { flush(); out.append(fixMojibake(between)) }
                charset == null -> out.append(between) // Text/Leerraum vor dem ersten kodierten Wort
                !charset.equals(cs, ignoreCase = true) -> flush() // Leerraum zwischen kodierten Wörtern entfällt (RFC 2047)
            }
            charset = cs
            val data = m.groupValues[3]
            val bytes = runCatching {
                if (m.groupValues[2].equals("B", true)) Base64.getMimeDecoder().decode(data) else qDecode(data)
            }.getOrDefault(data.toByteArray())
            buf.write(bytes)
            pos = m.range.last + 1
        }
        flush()
        out.append(fixMojibake(s.substring(pos)))
        return out.toString()
    }

    private fun charsetOf(name: String): Charset = runCatching { Charset.forName(name) }.getOrElse {
        if (name.equals("utf8", true)) Charsets.UTF_8 else Charsets.ISO_8859_1
    }.let { if (it.name().equals("US-ASCII", true)) Charsets.UTF_8 else it } // falsch deklariert, aber oft UTF-8

    private fun qDecode(s: String): ByteArray {
        val out = ByteArrayOutputStream()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            when {
                c == '_' -> out.write(' '.code)
                c == '=' && i + 2 < s.length -> {
                    val h = s.substring(i + 1, i + 3).toIntOrNull(16)
                    if (h != null) { out.write(h); i += 2 } else out.write('='.code)
                }
                else -> out.write(c.code and 0xFF)
            }
            i++
        }
        return out.toByteArray()
    }

    /** Erkennt UTF-8, das fälschlich als ISO-8859-1 gelesen wurde, und stellt es wieder her. */
    fun fixMojibake(s: String): String {
        if (s.none { it.code in 0x80..0xFF } || s.any { it.code > 0xFF }) return s
        val bytes = s.toByteArray(Charsets.ISO_8859_1)
        return runCatching {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes)).toString()
        }.getOrDefault(s)
    }
}
