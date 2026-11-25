package app.nfcwerkstatt.nfc

data class Contact(
    val name: String,
    val phone: String = "",
    val email: String = "",
    val organization: String = "",
    val website: String = "",
    val address: String = "",
    val note: String = "",
)

object VCard {
    const val MIME = "text/vcard"

    fun build(c: Contact): String {
        val parts = c.name.trim().split(Regex("\\s+"))
        val last = if (parts.size > 1) parts.last() else c.name.trim()
        val first = if (parts.size > 1) parts.dropLast(1).joinToString(" ") else ""
        val lines = mutableListOf("BEGIN:VCARD", "VERSION:3.0")
        lines += "N:${esc(last)};${esc(first)};;;"
        lines += "FN:${esc(c.name.trim())}"
        if (c.organization.isNotBlank()) lines += "ORG:${esc(c.organization)}"
        if (c.phone.isNotBlank()) lines += "TEL;TYPE=CELL:${c.phone.trim()}"
        if (c.email.isNotBlank()) lines += "EMAIL:${c.email.trim()}"
        if (c.website.isNotBlank()) lines += "URL:${c.website.trim()}"
        if (c.address.isNotBlank()) lines += "ADR;TYPE=WORK:;;${esc(c.address)};;;;"
        if (c.note.isNotBlank()) lines += "NOTE:${esc(c.note)}"
        lines += "END:VCARD"
        return lines.joinToString("\r\n") + "\r\n"
    }

    /** Lesbare Zusammenfassung einer vCard. */
    fun summarize(vcard: String): String {
        val out = mutableListOf<String>()
        for (raw in vcard.lines()) {
            val line = raw.trim()
            val idx = line.indexOf(':')
            if (idx <= 0) continue
            val key = line.substring(0, idx).substringBefore(';').uppercase()
            val value = unesc(line.substring(idx + 1)).replace(";", " ").trim()
            if (value.isEmpty()) continue
            when (key) {
                "FN" -> out += "Name: $value"
                "ORG" -> out += "Firma: $value"
                "TEL" -> out += "Telefon: $value"
                "EMAIL" -> out += "E-Mail: $value"
                "URL" -> out += "Web: $value"
                "ADR" -> out += "Adresse: ${value.replace(Regex("\\s+"), " ")}"
                "NOTE" -> out += "Notiz: $value"
            }
        }
        return if (out.isEmpty()) vcard else out.joinToString("\n")
    }

    private fun esc(s: String) = s.trim()
        .replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")

    private fun unesc(s: String) = s.replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")
}
