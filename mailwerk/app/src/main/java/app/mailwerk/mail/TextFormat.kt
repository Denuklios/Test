package app.mailwerk.mail

/**
 * Wandelt den geschriebenen Text in schönes HTML um:
 * **fett**, *kursiv*, Links und E-Mail-Adressen klickbar, Zitate („> …“) grau eingerückt,
 * die Zeile „[Logo]“ wird durch das eingebettete Signatur-Logo ersetzt.
 */
object TextFormat {
    const val LOGO_MARKER = "[Logo]"
    const val LOGO_CID = "signatur-logo@mailwerk"

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    fun inline(line: String): String {
        var h = esc(line)
        h = h.replace(Regex("\\*\\*(.+?)\\*\\*"), "<b>$1</b>")
        h = h.replace(Regex("(?<![*\\w])\\*(?!\\s)(.+?)(?<!\\s)\\*(?![*\\w])"), "<i>$1</i>")
        h = h.replace(Regex("(https?://[^\\s<]+[^\\s<.,;:!?)])")) { "<a href=\"${it.value}\">${it.value}</a>" }
        h = h.replace(Regex("(?<![\\w./:@-])(www\\.[^\\s<]+[^\\s<.,;:!?)])")) { "<a href=\"https://${it.value}\">${it.value}</a>" }
        h = h.replace(Regex("(?<![\\w.+/:-])([\\w.+-]+@[\\w-]+(\\.[\\w-]+)+)")) { "<a href=\"mailto:${it.value}\">${it.value}</a>" }
        return h
    }

    fun toHtml(body: String, hasLogo: Boolean): String {
        val out = StringBuilder("<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5\">")
        var inQuote = false
        var inSig = false
        for (line in body.split("\n")) {
            val quoted = line.startsWith(">")
            if (quoted && !inQuote) { out.append("<blockquote style=\"margin:0 0 0 4px;padding-left:10px;border-left:3px solid #ccc;color:#666\">"); inQuote = true }
            if (!quoted && inQuote) { out.append("</blockquote>"); inQuote = false }
            when {
                line.trim() == LOGO_MARKER -> if (hasLogo) out.append("<img src=\"cid:$LOGO_CID\" alt=\"Logo\" style=\"max-width:220px;max-height:90px;margin:6px 0\"><br>")
                line == "-- " -> { inSig = true; out.append("<div style=\"color:#555;font-size:13px\">-- <br>") }
                quoted -> out.append(inline(line.removePrefix(">").removePrefix(" "))).append("<br>")
                else -> out.append(inline(line)).append("<br>")
            }
            if (inSig && line.isBlank()) { out.append("</div>"); inSig = false }
        }
        if (inQuote) out.append("</blockquote>")
        if (inSig) out.append("</div>")
        return out.append("</div>").toString()
    }

    /** Klartext-Teil: Formatierungszeichen und Logo-Platzhalter entfernen. */
    fun toPlain(body: String): String = body.lines().filter { it.trim() != LOGO_MARKER }.joinToString("\n")
        .replace(Regex("\\*\\*(.+?)\\*\\*"), "$1")
}
