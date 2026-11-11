package app.mailwerk.mail

import app.mailwerk.tr

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
    private val APP_PW get() = tr("Dieser Anbieter verlangt ein App-Passwort (nicht das normale Passwort), wenn die 2-Faktor-Anmeldung aktiv ist.")

    val ONE_COM = ServerConfig("imap.one.com", 993, Security.SSL, "send.one.com", 465, Security.SSL)

    val presets: Map<String, ServerConfig> = buildMap {
        val gmail = ServerConfig("imap.gmail.com", 993, Security.SSL, "smtp.gmail.com", 465, Security.SSL,
            hint = tr("Gmail: unter myaccount.google.com → Sicherheit → App-Passwörter ein App-Passwort erstellen und hier eingeben."))
        put("gmail.com", gmail); put("googlemail.com", gmail)
        val ms = ServerConfig("outlook.office365.com", 993, Security.SSL, "smtp-mail.outlook.com", 587, Security.STARTTLS,
            hint = tr("Outlook/Hotmail: Microsoft erlaubt bei vielen privaten Konten nur noch OAuth-Anmeldung. Falls die Anmeldung scheitert, Weiterleitung oder ein anderes Konto nutzen."))
        listOf("outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com").forEach { put(it, ms) }
        val gmx = ServerConfig("imap.gmx.net", 993, Security.SSL, "mail.gmx.net", 587, Security.STARTTLS,
            hint = tr("GMX: Im Web-Postfach unter Einstellungen → POP3/IMAP Abruf den IMAP-Zugriff aktivieren."))
        listOf("gmx.de", "gmx.net", "gmx.at", "gmx.ch", "gmx.com").forEach { put(it, gmx) }
        put("web.de", ServerConfig("imap.web.de", 993, Security.SSL, "smtp.web.de", 587, Security.STARTTLS,
            hint = tr("WEB.DE: Im Web-Postfach unter Einstellungen → POP3/IMAP Abruf den IMAP-Zugriff aktivieren.")))
        put("t-online.de", ServerConfig("secureimap.t-online.de", 993, Security.SSL, "securesmtp.t-online.de", 465, Security.SSL,
            hint = tr("Telekom: Im E-Mail-Center ein eigenes „E-Mail-Passwort“ für Mail-Programme anlegen.")))
        val icloud = ServerConfig("imap.mail.me.com", 993, Security.SSL, "smtp.mail.me.com", 587, Security.STARTTLS, hint = tr("iCloud: {0} (appleid.apple.com)", APP_PW))
        listOf("icloud.com", "me.com", "mac.com").forEach { put(it, icloud) }
        val yahoo = ServerConfig("imap.mail.yahoo.com", 993, Security.SSL, "smtp.mail.yahoo.com", 465, Security.SSL, hint = tr("Yahoo: {0}", APP_PW))
        listOf("yahoo.com", "yahoo.de", "ymail.com").forEach { put(it, yahoo) }
        put("posteo.de", ServerConfig("posteo.de", 993, Security.SSL, "posteo.de", 465, Security.SSL))
        put("posteo.net", ServerConfig("posteo.de", 993, Security.SSL, "posteo.de", 465, Security.SSL))
        put("mailbox.org", ServerConfig("imap.mailbox.org", 993, Security.SSL, "smtp.mailbox.org", 465, Security.SSL))
        val ionos = ServerConfig("imap.ionos.de", 993, Security.SSL, "smtp.ionos.de", 465, Security.SSL)
        listOf("ionos.de", "online.de", "1und1.de").forEach { put(it, ionos) }
        put("freenet.de", ServerConfig("mx.freenet.de", 993, Security.SSL, "mx.freenet.de", 587, Security.STARTTLS))
        put("aol.com", ServerConfig("imap.aol.com", 993, Security.SSL, "smtp.aol.com", 465, Security.SSL, hint = "AOL: $APP_PW"))
        put("proton.me", ServerConfig("127.0.0.1", 1143, Security.STARTTLS, "127.0.0.1", 1025, Security.STARTTLS,
            hint = tr("Proton Mail funktioniert nur über die Proton Bridge (Desktop). Auf dem Handy wird IMAP nicht direkt angeboten.")))
        put("zoho.com", ServerConfig("imap.zoho.eu", 993, Security.SSL, "smtp.zoho.eu", 465, Security.SSL))
        put("mail.de", ServerConfig("imap.mail.de", 993, Security.SSL, "smtp.mail.de", 465, Security.SSL))
        put("arcor.de", ServerConfig("imap.arcor.de", 993, Security.SSL, "mail.arcor.de", 465, Security.SSL))
        put("vodafone.de", ServerConfig("imap.vodafonemail.de", 993, Security.SSL, "smtp.vodafonemail.de", 587, Security.STARTTLS))
        put("one.com", ONE_COM)
    }


    /** Anbieter anhand des MX-Eintrags (für eigene Domains). */
    private val byMx: List<Pair<String, ServerConfig>> = listOf(
        "one.com" to ONE_COM,
        "kundenserver.de" to ServerConfig("imap.ionos.de", 993, Security.SSL, "smtp.ionos.de", 465, Security.SSL),
        "ionos.de" to ServerConfig("imap.ionos.de", 993, Security.SSL, "smtp.ionos.de", 465, Security.SSL),
        "strato.de" to ServerConfig("imap.strato.de", 993, Security.SSL, "smtp.strato.de", 465, Security.SSL),
        "rzone.de" to ServerConfig("imap.strato.de", 993, Security.SSL, "smtp.strato.de", 465, Security.SSL),
        "google.com" to ServerConfig("imap.gmail.com", 993, Security.SSL, "smtp.gmail.com", 465, Security.SSL,
            hint = tr("Google Workspace: ein App-Passwort verwenden (2-Faktor-Anmeldung).")),
        "googlemail.com" to ServerConfig("imap.gmail.com", 993, Security.SSL, "smtp.gmail.com", 465, Security.SSL),
        "outlook.com" to ServerConfig("outlook.office365.com", 993, Security.SSL, "smtp.office365.com", 587, Security.STARTTLS,
            hint = tr("Microsoft 365: Der Administrator muss IMAP/SMTP-Anmeldung erlauben.")),
        "mailbox.org" to ServerConfig("imap.mailbox.org", 993, Security.SSL, "smtp.mailbox.org", 465, Security.SSL),
        "posteo.de" to ServerConfig("posteo.de", 993, Security.SSL, "posteo.de", 465, Security.SSL),
        "zoho.eu" to ServerConfig("imap.zoho.eu", 993, Security.SSL, "smtp.zoho.eu", 465, Security.SSL),
        "simply.com" to ServerConfig("mail.simply.com", 993, Security.SSL, "smtp.simply.com", 587, Security.STARTTLS),
    )

    fun fromMxHost(mx: String): ServerConfig? {
        val h = mx.trimEnd('.').lowercase()
        return byMx.firstOrNull { (suffix, _) -> h == suffix || h.endsWith(".$suffix") }?.second
    }

    private fun mxHosts(domain: String): List<String> = runCatching {
        val json = fetch("https://dns.google/resolve?name=$domain&type=MX") ?: return emptyList()
        Regex("\"data\"\\s*:\\s*\"\\d+\\s+([^\"]+)\"").findAll(json).map { it.groupValues[1] }.toList()
    }.getOrDefault(emptyList())

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
        // Eigene Domain: Anbieter über den MX-Eintrag erkennen (wie Thunderbird)
        val mx = mxHosts(domain)
        mx.firstNotNullOfOrNull { fromMxHost(it) }?.let { return it }
        mx.firstOrNull()?.trimEnd('.')?.split('.')?.takeLast(2)?.joinToString(".")?.let { base ->
            runCatching { fetch("https://autoconfig.thunderbird.net/v1.1/$base")?.let { parseIspdb(it, email) } }.getOrNull()?.let { return it }
        }
        return ServerConfig("imap.$domain", 993, Security.SSL, "smtp.$domain", 587, Security.STARTTLS,
            hint = tr("Server wurden geschätzt. Bitte prüfen (Angaben findest du beim Anbieter unter „IMAP/SMTP“)."))
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
