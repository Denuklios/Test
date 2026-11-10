package app.mailwerk.mail

import app.mailwerk.data.Security
import java.net.HttpURLConnection
import java.net.URL
import javax.xml.parsers.DocumentBuilderFactory

data class ServerConfig(
    val imapHost: String, val imapPort: Int, val imapSecurity: Security,
    val smtpHost: String, val smtpPort: Int, val smtpSecurity: Security,
    val usernameIsEmail: Boolean = true,
    val hint: String? = null,
)

/**
 * Automatische Servererkennung wie in Thunderbird: erst bekannte Anbieter, dann die
 * Mozilla-ISPDB, dann autoconfig beim Anbieter, zuletzt eine begründete Vermutung.
 */
object AutoConfig {
    private const val APP_PW = "Dieser Anbieter verlangt ein App-Passwort (nicht das normale Passwort), wenn die 2-Faktor-Anmeldung aktiv ist."

    val presets: Map<String, ServerConfig> = buildMap {
        val gmail = ServerConfig("imap.gmail.com", 993, Security.SSL, "smtp.gmail.com", 465, Security.SSL,
            hint = "Gmail: unter myaccount.google.com → Sicherheit → App-Passwörter ein App-Passwort erstellen und hier eingeben.")
        put("gmail.com", gmail); put("googlemail.com", gmail)
        val ms = ServerConfig("outlook.office365.com", 993, Security.SSL, "smtp-mail.outlook.com", 587, Security.STARTTLS,
            hint = "Outlook/Hotmail: Microsoft erlaubt bei vielen privaten Konten nur noch OAuth-Anmeldung. Falls die Anmeldung scheitert, Weiterleitung oder ein anderes Konto nutzen.")
        listOf("outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com").forEach { put(it, ms) }
        val gmx = ServerConfig("imap.gmx.net", 993, Security.SSL, "mail.gmx.net", 587, Security.STARTTLS,
            hint = "GMX: Im Web-Postfach unter Einstellungen → POP3/IMAP Abruf den IMAP-Zugriff aktivieren.")
        listOf("gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com").forEach { put(it, gmx) }
        put("web.de", ServerConfig("imap.web.de", 993, Security.SSL, "smtp.web.de", 587, Security.STARTTLS,
            hint = "WEB.DE: Im Web-Postfach unter Einstellungen → POP3/IMAP Abruf den IMAP-Zugriff aktivieren."))
        put("t-online.de", ServerConfig("secureimap.t-online.de", 993, Security.SSL, "securesmtp.t-online.de", 465, Security.SSL,
            hint = "Telekom: Im E-Mail-Center ein eigenes „E-Mail-Passwort“ für Mail-Programme anlegen."))
        val icloud = ServerConfig("imap.mail.me.com", 993, Security.SSL, "smtp.mail.me.com", 587, Security.STARTTLS, hint = "iCloud: $APP_PW (appleid.apple.com)")
        listOf("icloud.com", "me.com", "mac.com").forEach { put(it, icloud) }
        val yahoo = ServerConfig("imap.mail.yahoo.com", 993, Security.SSL, "smtp.mail.yahoo.com", 465, Security.SSL, hint = "Yahoo: $APP_PW")
        listOf("yahoo.com", "yahoo.de", "ymail.com").forEach { put(it, yahoo) }
        put("posteo.de", ServerConfig("posteo.de", 993, Security.SSL, "posteo.de", 465, Security.SSL))
        put("posteo.net", ServerConfig("posteo.de", 993, Security.SSL, "posteo.de", 465, Security.SSL))
        put("mailbox.org", ServerConfig("imap.mailbox.org", 993, Security.SSL, "smtp.mailbox.org", 465, Security.SSL))
        val ionos = ServerConfig("imap.ionos.de", 993, Security.SSL, "smtp.ionos.de", 465, Security.SSL)
        listOf("ionos.de", "online.de", "1und1.de").forEach { put(it, ionos) }
        put("freenet.de", ServerConfig("mx.freenet.de", 993, Security.SSL, "mx.freenet.de", 587, Security.STARTTLS))
        put("aol.com", ServerConfig("imap.aol.com", 993, Security.SSL, "smtp.aol.com", 465, Security.SSL, hint = "AOL: $APP_PW"))
        put("proton.me", ServerConfig("127.0.0.1", 1143, Security.STARTTLS, "127.0.0.1", 1025, Security.STARTTLS,
            hint = "Proton Mail funktioniert nur über die Proton Bridge (Desktop). Auf dem Handy wird IMAP nicht direkt angeboten."))
        put("zoho.com", ServerConfig("imap.zoho.eu", 993, Security.SSL, "smtp.zoho.eu", 465, Security.SSL))
        put("mail.de", ServerConfig("imap.mail.de", 993, Security.SSL, "smtp.mail.de", 465, Security.SSL))
        put("arcor.de", ServerConfig("imap.arcor.de", 993, Security.SSL, "mail.arcor.de", 465, Security.SSL))
        put("vodafone.de", ServerConfig("imap.vodafonemail.de", 993, Security.SSL, "smtp.vodafonemail.de", 587, Security.STARTTLS))
    }

    /** Netzwerkzugriff – nicht im Hauptthread aufrufen. */
    fun discover(email: String): ServerConfig {
        val domain = email.substringAfter('@').trim().lowercase()
        presets[domain]?.let { return it }
        val urls = listOf(
            "https://autoconfig.thunderbird.net/v1.1/$domain",
            "https://autoconfig.$domain/mail/config-v1.1.xml?emailaddress=$email",
            "https://$domain/.well-known/autoconfig/mail/config-v1.1.xml",
        )
        for (u in urls) {
            runCatching { fetch(u)?.let { parseIspdb(it, email) } }.getOrNull()?.let { return it }
        }
        return ServerConfig("imap.$domain", 993, Security.SSL, "smtp.$domain", 587, Security.STARTTLS,
            hint = "Server wurden geschätzt. Bitte prüfen (Angaben findest du beim Anbieter unter „IMAP/SMTP“).")
    }

    private fun fetch(url: String): String? {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 6000; c.readTimeout = 6000
        return try { if (c.responseCode == 200) c.inputStream.bufferedReader().readText() else null } finally { c.disconnect() }
    }

    fun parseIspdb(xml: String, email: String): ServerConfig? {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(xml.byteInputStream())
        fun servers(tag: String, type: String) = (0 until doc.getElementsByTagName(tag).length)
            .map { doc.getElementsByTagName(tag).item(it) as org.w3c.dom.Element }
            .filter { it.getAttribute("type") == type }
        fun org.w3c.dom.Element.child(n: String) = getElementsByTagName(n).item(0)?.textContent?.trim().orEmpty()
        fun sec(s: String) = when (s.uppercase()) { "SSL" -> Security.SSL; "STARTTLS" -> Security.STARTTLS; else -> Security.NONE }
        // bevorzugt verschlüsselte Varianten
        val imap = servers("incomingServer", "imap").sortedBy { if (sec(it.child("socketType")) == Security.NONE) 1 else 0 }.firstOrNull() ?: return null
        val smtp = servers("outgoingServer", "smtp").sortedBy { if (sec(it.child("socketType")) == Security.NONE) 1 else 0 }.firstOrNull() ?: return null
        val local = email.substringBefore('@'); val domain = email.substringAfter('@')
        fun host(e: org.w3c.dom.Element) = e.child("hostname").replace("%EMAILDOMAIN%", domain)
        return ServerConfig(
            host(imap), imap.child("port").toIntOrNull() ?: 993, sec(imap.child("socketType")),
            host(smtp), smtp.child("port").toIntOrNull() ?: 587, sec(smtp.child("socketType")),
            usernameIsEmail = imap.child("username").let { it.isEmpty() || it.contains("%EMAILADDRESS%") },
        ).let { if (!it.usernameIsEmail && local.isNotEmpty()) it else it }
    }
}
