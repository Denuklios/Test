package app.mailwerk.mail

import app.mailwerk.tr

import app.mailwerk.data.Account
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Security
import jakarta.activation.CommandMap
import jakarta.activation.DataHandler
import jakarta.activation.MailcapCommandMap
import jakarta.mail.Address
import jakarta.mail.FetchProfile
import jakarta.mail.Flags
import jakarta.mail.Folder
import jakarta.mail.Message
import jakarta.mail.Multipart
import jakarta.mail.Part
import jakarta.mail.Session
import jakarta.mail.Store
import jakarta.mail.UIDFolder
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeBodyPart
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import jakarta.mail.internet.MimeUtility
import jakarta.mail.util.ByteArrayDataSource
import org.eclipse.angus.mail.imap.IMAPFolder
import org.eclipse.angus.mail.imap.IMAPMessage
import java.io.InputStream
import java.util.Base64
import java.util.Date
import java.util.Properties

data class ParsedAttachment(val path: String, val name: String, val mime: String, val size: Long)

data class ParsedMessage(
    val uid: Long,
    val messageId: String?,
    val fromName: String,
    val fromAddr: String,
    val to: String,
    val cc: String,
    val replyTo: String,
    val subject: String,
    val date: Long,
    val html: String?,
    val text: String?,
    val seen: Boolean,
    val flagged: Boolean,
    val headers: Map<String, String>,
    val attachments: List<ParsedAttachment>,
    val inReplyTo: String?,
    val references: String?,
)

data class RemoteFolder(val fullName: String, val display: String, val role: String?, val selectable: Boolean)

data class OutgoingAttachment(val name: String, val mime: String, val bytes: ByteArray)

/** Dünne Schicht über Jakarta Mail (Angus). Alle Methoden blockieren -> nur in Dispatchers.IO aufrufen. */
class MailClient(private val acc: Account, private val password: String) {

    companion object {
        init {
            // Auf Android werden die mailcap-Einträge oft nicht gefunden -> explizit registrieren.
            val mc = CommandMap.getDefaultCommandMap() as MailcapCommandMap
            mc.addMailcap("text/html;; x-java-content-handler=org.eclipse.angus.mail.handlers.text_html")
            mc.addMailcap("text/xml;; x-java-content-handler=org.eclipse.angus.mail.handlers.text_xml")
            mc.addMailcap("text/plain;; x-java-content-handler=org.eclipse.angus.mail.handlers.text_plain")
            mc.addMailcap("multipart/*;; x-java-content-handler=org.eclipse.angus.mail.handlers.multipart_mixed; x-java-fallback-entry=true")
            mc.addMailcap("message/rfc822;; x-java-content-handler=org.eclipse.angus.mail.handlers.message_rfc822")
            CommandMap.setDefaultCommandMap(mc)
            System.setProperty("mail.mime.decodetext.strict", "false")
            System.setProperty("mail.mime.address.strict", "false")
            System.setProperty("mail.mime.parameters.strict", "false")
        }

        val headerNames = arrayOf(
            "List-Unsubscribe", "List-Unsubscribe-Post", "List-Id", "Precedence", "Auto-Submitted", "X-Campaign", "X-CampaignID",
            "X-Mailchimp", "X-MC-User", "X-SG-EID", "X-Mailgun-Tag", "X-Newsletter", "X-CMail-CampaignID", "X-Emarsys",
            "X-Sib-Id", "X-Mailjet-Campaign", "Feedback-ID", "X-rpcampaign", "X-MktMail", "In-Reply-To", "References", "X-Mailwerk-Auto",
            "Content-Type", "Disposition-Notification-To", "Return-Receipt-To"
        )
    }

    private fun props(): Properties = Properties().apply {
        val imapProto = if (acc.imapSecurity == Security.SSL) "imaps" else "imap"
        put("mail.store.protocol", imapProto)
        put("mail.$imapProto.host", acc.imapHost)
        put("mail.$imapProto.port", acc.imapPort.toString())
        put("mail.$imapProto.connectiontimeout", "20000")
        put("mail.$imapProto.timeout", "60000")
        put("mail.$imapProto.writetimeout", "60000")
        put("mail.$imapProto.partialfetch", "false")
        put("mail.$imapProto.fetchsize", "1048576")
        put("mail.$imapProto.peek", "true")
        put("mail.$imapProto.ssl.checkserveridentity", "true")
        if (acc.imapSecurity == Security.STARTTLS) {
            put("mail.imap.starttls.enable", "true"); put("mail.imap.starttls.required", "true")
        }
        val smtpProto = if (acc.smtpSecurity == Security.SSL) "smtps" else "smtp"
        put("mail.transport.protocol", smtpProto)
        put("mail.$smtpProto.host", acc.smtpHost)
        put("mail.$smtpProto.port", acc.smtpPort.toString())
        put("mail.$smtpProto.auth", "true")
        put("mail.$smtpProto.connectiontimeout", "20000")
        put("mail.$smtpProto.timeout", "60000")
        put("mail.$smtpProto.writetimeout", "60000")
        put("mail.$smtpProto.ssl.checkserveridentity", "true")
        put("mail.$smtpProto.localhost", "localhost")
        if (acc.smtpSecurity == Security.STARTTLS) {
            put("mail.smtp.starttls.enable", "true"); put("mail.smtp.starttls.required", "true")
        }
        if (acc.isOAuth) {
            // Anmeldung mit Zugangs-Token statt Passwort (SASL XOAUTH2, von Google und Microsoft unterstützt)
            put("mail.$imapProto.auth.mechanisms", "XOAUTH2")
            put("mail.$imapProto.auth.login.disable", "true")
            put("mail.$imapProto.auth.plain.disable", "true")
            put("mail.$smtpProto.auth.mechanisms", "XOAUTH2")
            put("mail.$smtpProto.auth.login.disable", "true")
            put("mail.$smtpProto.auth.plain.disable", "true")
        }
    }

    private val session: Session by lazy { Session.getInstance(props()) }

    fun <T> withStore(block: (Store) -> T): T {
        Thread.currentThread().contextClassLoader = MailClient::class.java.classLoader
        val store = session.store
        store.connect(acc.imapHost, acc.imapPort, acc.username, password)
        try { return block(store) } finally { runCatching { store.close() } }
    }

    /** Prüft IMAP- und SMTP-Anmeldung. Wirft eine verständliche Exception bei Fehlern. */
    fun test() {
        try { withStore { it.getFolder("INBOX").exists() } }
        catch (e: Exception) { throw IllegalStateException(tr("Posteingangsserver (IMAP): {0}", friendly(e)), e) }
        try {
            val t = session.transport
            t.connect(acc.smtpHost, acc.smtpPort, acc.username, password); t.close()
        } catch (e: Exception) { throw IllegalStateException(tr("Postausgangsserver (SMTP): {0}", friendly(e)), e) }
    }

    fun listFolders(store: Store): List<RemoteFolder> {
        val result = mutableListOf<RemoteFolder>()
        store.defaultFolder.list("*").forEach { f ->
            val attrs = (f as? IMAPFolder)?.attributes?.map { it.lowercase() } ?: emptyList()
            val selectable = (f.type and Folder.HOLDS_MESSAGES) != 0 && "\\noselect" !in attrs && "\\nonexistent" !in attrs
            val role = when {
                f.fullName.equals("INBOX", true) -> FolderRole.INBOX
                "\\sent" in attrs -> FolderRole.SENT
                "\\archive" in attrs || "\\all" in attrs && acc.imapHost.contains("gmail") -> FolderRole.ARCHIVE
                "\\trash" in attrs -> FolderRole.TRASH
                "\\drafts" in attrs -> FolderRole.DRAFTS
                "\\junk" in attrs -> FolderRole.JUNK
                else -> guessRole(f.name)
            }
            val display = if (role == FolderRole.INBOX) tr("Posteingang") else f.name
            result += RemoteFolder(f.fullName, display, role, selectable)
        }
        // pro Rolle nur einen Ordner behalten (der mit Spezial-Attribut gewinnt, sonst der erste)
        val seen = mutableSetOf<String>()
        return result.map { rf ->
            if (rf.role != null && !seen.add(rf.role)) rf.copy(role = null) else rf
        }
    }

    private fun guessRole(name: String): String? {
        val n = name.lowercase()
        return when {
            n in setOf("sent", "sent items", "sent messages", "gesendet", "gesendete objekte", "gesendete elemente", "gesendete nachrichten", "postausgang") -> FolderRole.SENT
            n in setOf("archive", "archiv", "archives", "all mail", "alle nachrichten") -> FolderRole.ARCHIVE
            n in setOf("trash", "papierkorb", "deleted", "deleted items", "deleted messages", "gelöscht", "gelöschte objekte", "gelöschte elemente", "bin") -> FolderRole.TRASH
            n in setOf("drafts", "entwürfe", "entwurf", "draft") -> FolderRole.DRAFTS
            n in setOf("spam", "junk", "junk e-mail", "junk-e-mail", "unerwünscht", "bulk mail") -> FolderRole.JUNK
            else -> null
        }
    }

    data class FolderSync(
        val uidValidity: Long,
        val newMessages: List<ParsedMessage>,
        val flags: Map<Long, Pair<Boolean, Boolean>>, // uid -> seen, flagged (für bekannte Bereich)
        val checkedFromUid: Long,
        /** höchste UID unter den abgerufenen Nachrichten (auch wenn eine nicht lesbar war) */
        val maxFetchedUid: Long = 0,
    )

    /**
     * Holt neue Nachrichten (UID > lastUid) und den aktuellen Flag-Stand der letzten [flagWindow] Nachrichten.
     * Beim ersten Abgleich werden höchstens [initialMax] Nachrichten der letzten [days] Tage geladen.
     */
    fun syncFolder(store: Store, fullName: String, lastUid: Long, knownValidity: Long, initialMax: Int = 150, days: Int = 60, flagWindow: Int = 400): FolderSync {
        val folder = store.getFolder(fullName) as IMAPFolder
        folder.open(Folder.READ_ONLY)
        try {
            val validity = folder.uidValidity
            val reset = knownValidity != 0L && knownValidity != validity
            val since = if (reset) 0L else lastUid
            val total = folder.messageCount
            if (total == 0) return FolderSync(validity, emptyList(), emptyMap(), 0)

            val newMsgs: Array<Message> = if (since <= 0) {
                val start = maxOf(1, total - initialMax + 1)
                val cutoff = System.currentTimeMillis() - days * 86_400_000L
                folder.getMessages(start, total).also { prefetch(folder, it, envelopeOnly = true) }
                    .filter { (it.receivedDate ?: it.sentDate ?: Date()).time >= cutoff }.toTypedArray()
            } else {
                folder.getMessagesByUID(since + 1, UIDFolder.LASTUID).filter { folder.getUID(it) > since }.toTypedArray()
                    .let { if (it.size > initialMax) it.copyOfRange(it.size - initialMax, it.size) else it }
            }
            prefetch(folder, newMsgs, envelopeOnly = false)
            val parsed = newMsgs.mapNotNull { m -> runCatching { parse(folder, m) }.getOrElse { e -> fallbackParse(folder, m, e) } }

            // Flags der letzten Nachrichten abgleichen (gelesen auf anderem Gerät, gelöscht …)
            val startNum = maxOf(1, total - flagWindow + 1)
            val window = folder.getMessages(startNum, total)
            val fp = FetchProfile().apply { add(UIDFolder.FetchProfileItem.UID); add(FetchProfile.Item.FLAGS) }
            folder.fetch(window, fp)
            val flags = window.associate { folder.getUID(it) to (it.isSet(Flags.Flag.SEEN) to it.isSet(Flags.Flag.FLAGGED)) }
            val checkedFrom = window.firstOrNull()?.let { folder.getUID(it) } ?: 0
            val maxFetched = newMsgs.maxOfOrNull { runCatching { folder.getUID(it) }.getOrDefault(0) } ?: 0
            return FolderSync(validity, parsed, flags, checkedFrom, maxFetched)
        } finally { runCatching { folder.close(false) } }
    }

    private fun prefetch(folder: IMAPFolder, msgs: Array<Message>, envelopeOnly: Boolean) {
        if (msgs.isEmpty()) return
        val fp = FetchProfile().apply {
            add(FetchProfile.Item.ENVELOPE); add(FetchProfile.Item.FLAGS); add(UIDFolder.FetchProfileItem.UID)
            if (!envelopeOnly) { add(FetchProfile.Item.CONTENT_INFO); headerNames.forEach { add(it) } }
        }
        folder.fetch(msgs, fp)
    }

    private fun parse(folder: IMAPFolder, m: Message): ParsedMessage {
        val mm = m as IMAPMessage
        val from = (mm.from?.firstOrNull() as? InternetAddress)
        val headers = buildMap {
            headerNames.forEach { h -> mm.getHeader(h)?.firstOrNull()?.let { put(h.lowercase(), decode(it)) } }
        }
        val body = BodyCollector().also { it.walk(mm, "") }
        return ParsedMessage(
            uid = folder.getUID(m),
            messageId = mm.messageID,
            fromName = rawName(mm, "From", from?.personal),
            fromAddr = from?.address ?: "",
            to = addrList(mm.getRecipients(Message.RecipientType.TO)),
            cc = addrList(mm.getRecipients(Message.RecipientType.CC)),
            replyTo = addrList(mm.replyTo?.takeIf { r -> r.any { (it as? InternetAddress)?.address != from?.address } }),
            subject = (mm.getHeader("Subject", null) ?: mm.subject)?.let(::decode) ?: "",
            date = (mm.receivedDate ?: mm.sentDate ?: Date()).time,
            html = body.html(),
            text = body.text,
            seen = mm.isSet(Flags.Flag.SEEN),
            flagged = mm.isSet(Flags.Flag.FLAGGED),
            headers = headers,
            attachments = body.attachments,
            inReplyTo = headers["in-reply-to"],
            references = headers["references"],
        )
    }

    /** Mail konnte nicht vollständig gelesen werden -> trotzdem mit Kopfdaten anzeigen statt verschwinden lassen. */
    private fun fallbackParse(folder: IMAPFolder, m: Message, e: Throwable): ParsedMessage? = runCatching {
        android.util.Log.w("Mailwerk", "Mail nicht vollständig lesbar: ${e.message}")
        val from = runCatching { m.from?.firstOrNull() as? InternetAddress }.getOrNull()
        ParsedMessage(
            uid = folder.getUID(m), messageId = runCatching { (m as MimeMessage).messageID }.getOrNull(),
            fromName = runCatching { from?.personal }.getOrNull() ?: "", fromAddr = from?.address ?: "",
            to = runCatching { addrList(m.getRecipients(Message.RecipientType.TO)) }.getOrDefault(""), cc = "", replyTo = "",
            subject = runCatching { m.subject }.getOrNull() ?: tr("(Betreff nicht lesbar)"),
            date = runCatching { (m.receivedDate ?: m.sentDate)?.time }.getOrNull() ?: System.currentTimeMillis(),
            html = null, text = tr("Diese Nachricht konnte nicht vollständig geladen werden ({0}). Bitte im Webmail öffnen.", e.message),
            seen = runCatching { m.isSet(Flags.Flag.SEEN) }.getOrDefault(false), flagged = false,
            headers = emptyMap(), attachments = emptyList(), inReplyTo = null, references = null,
        )
    }.getOrNull()

    private fun decode(s: String) = runCatching { EncodedWords.decode(s) }.getOrDefault(s)

    /** Anzeigename direkt aus der rohen Kopfzeile dekodieren (Angus zerlegt geteilte Emojis sonst falsch). */
    private fun rawName(mm: MimeMessage, header: String, fallback: String?): String {
        val raw = mm.getHeader(header, null) ?: return fallback ?: ""
        val namePart = raw.substringBefore('<', "").trim().trim('"').trim()
        if (namePart.isEmpty() || !raw.contains('<')) return fallback ?: ""
        return decode(namePart.replace("\\\"", "\""))
    }

    private fun addrList(a: Array<Address>?): String = a?.joinToString(", ") { ad ->
        (ad as? InternetAddress)?.let { if (it.personal.isNullOrBlank()) it.address else "${decode(it.personal)} <${it.address}>" } ?: ad.toString()
    } ?: ""

    /** Sammelt Text, HTML, eingebettete Bilder (cid:) und Anhänge aus der MIME-Struktur. */
    private class BodyCollector {
        var text: String? = null
        var htmlRaw: String? = null
        val inline = mutableMapOf<String, String>() // cid -> data-URI
        var inlineBytes = 0
        val attachments = mutableListOf<ParsedAttachment>()

        fun walk(p: Part, path: String) {
            val type = runCatching { p.contentType.lowercase() }.getOrDefault("text/plain")
            val disp = runCatching { p.disposition?.lowercase() }.getOrNull()
            val fileName = runCatching { p.fileName?.let { MimeUtility.decodeText(it) } }.getOrNull()
            when {
                type.startsWith("multipart/") -> {
                    val mp = p.content as Multipart
                    for (i in 0 until mp.count) walk(mp.getBodyPart(i), if (path.isEmpty()) "$i" else "$path.$i")
                }
                type.startsWith("message/rfc822") && disp != Part.ATTACHMENT -> {
                    attachments += ParsedAttachment(path, fileName ?: tr("Weitergeleitete Nachricht.eml"), "message/rfc822", p.size.toLong().coerceAtLeast(0))
                }
                disp == Part.ATTACHMENT || (fileName != null && !type.startsWith("image/") && !type.startsWith("text/")) ->
                    attachments += ParsedAttachment(path, fileName ?: tr("Anhang"), type.substringBefore(';').trim(), p.size.toLong().coerceAtLeast(0))
                type.startsWith("image/") -> {
                    val cid = (p as? MimeBodyPart)?.contentID?.trim('<', '>', ' ')
                    if (cid != null && p.size in 0..300_000 && inlineBytes + p.size < 600_000) {
                        val bytes = p.inputStream.use { it.readBytes() }
                        inlineBytes += bytes.size
                        inline[cid] = "data:${type.substringBefore(';').trim()};base64," + Base64.getEncoder().encodeToString(bytes)
                    } else attachments += ParsedAttachment(path, fileName ?: tr("Bild"), type.substringBefore(';').trim(), p.size.toLong().coerceAtLeast(0))
                }
                type.startsWith("text/html") && disp != Part.ATTACHMENT -> if (htmlRaw == null) htmlRaw = readText(p)
                type.startsWith("text/plain") && disp != Part.ATTACHMENT -> if (text == null) text = readText(p)
                type.startsWith("text/calendar") -> attachments += ParsedAttachment(path, fileName ?: "Einladung.ics", "text/calendar", p.size.toLong().coerceAtLeast(0))
                else -> if (fileName != null) attachments += ParsedAttachment(path, fileName, type.substringBefore(';').trim(), p.size.toLong().coerceAtLeast(0))
            }
        }

        private fun readText(p: Part): String = runCatching { p.content as? String ?: p.inputStream.use { String(it.readBytes()) } }
            .getOrElse { p.inputStream.use { String(it.readBytes(), Charsets.ISO_8859_1) } }

        fun html(): String? {
            var h = htmlRaw ?: return null
            inline.forEach { (cid, data) -> h = h.replace("cid:$cid", data, ignoreCase = true) }
            return h
        }
    }

    // ------------------------------------------------------------------ Aktionen

    private fun <T> withFolder(store: Store, fullName: String, block: (IMAPFolder) -> T): T {
        val f = store.getFolder(fullName) as IMAPFolder
        f.open(Folder.READ_WRITE)
        try { return block(f) } finally { runCatching { f.close(true) } }
    }

    // ---- Varianten mit bereits offenem Store (für Regeln während des Abgleichs)
    // ---- Ordner verwalten (direkt auf dem Server)
    /** Legt einen Ordner an; mit [parent] als Unterordner (z. B. „INBOX“). Liefert den vollen Namen. */
    fun createFolder(name: String, parent: String?): String = withStore { s ->
        val clean = name.trim().replace(Regex("[\\r\\n]"), "")
        require(clean.isNotEmpty()) { "Name fehlt" }
        val full = if (parent == null) clean else {
            val p = s.getFolder(parent)
            p.fullName + p.separator + clean
        }
        val f = s.getFolder(full)
        if (f.exists()) throw IllegalStateException(tr("Ordner „{0}“ gibt es schon", clean))
        if (!f.create(Folder.HOLDS_MESSAGES)) throw IllegalStateException(tr("Der Server hat das Anlegen abgelehnt"))
        runCatching { f.isSubscribed = true }
        f.fullName
    }

    fun renameFolder(fullName: String, newName: String): String = withStore { s ->
        val f = s.getFolder(fullName)
        val sep = f.separator
        val parentPath = fullName.substringBeforeLast(sep, "")
        val target = s.getFolder(if (parentPath.isEmpty()) newName.trim() else parentPath + sep + newName.trim())
        if (target.exists()) throw IllegalStateException(tr("Ordner „{0}“ gibt es schon", newName.trim()))
        if (!f.renameTo(target)) throw IllegalStateException(tr("Der Server hat das Umbenennen abgelehnt"))
        runCatching { target.isSubscribed = true }
        target.fullName
    }

    /** Löscht einen Ordner samt Inhalt auf dem Server. */
    fun deleteFolder(fullName: String) = withStore { s ->
        val f = s.getFolder(fullName)
        if (f.isOpen) f.close(false)
        runCatching { f.isSubscribed = false }
        if (!f.delete(true)) throw IllegalStateException(tr("Der Server hat das Löschen abgelehnt"))
    }

    /** Lesebestätigung (RFC 8098) an den Absender senden. */
    fun sendReadReceipt(to: String, originalSubject: String, originalMessageId: String?, sentFolder: String?) {
        val msg = MimeMessage(session)
        msg.setFrom(InternetAddress(acc.email, acc.name, "UTF-8"))
        msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to, false))
        msg.setSubject(tr("Gelesen: {0}", originalSubject), "UTF-8")
        msg.setHeader("Auto-Submitted", "auto-replied")
        msg.setHeader("X-Mailwerk-Auto", "mdn")
        originalMessageId?.let { msg.setHeader("In-Reply-To", it); msg.setHeader("References", it) }
        val report = MimeMultipart("report; report-type=disposition-notification")
        report.addBodyPart(MimeBodyPart().apply {
            setText(tr("Ihre Nachricht „{0}“ an {1} wurde am {2} gelesen.", originalSubject, acc.email,
                java.text.DateFormat.getDateTimeInstance().format(Date())), "UTF-8")
        })
        report.addBodyPart(MimeBodyPart().apply {
            setContent("Reporting-UA: Mailwerk\r\nFinal-Recipient: rfc822;${acc.email}\r\n" +
                (originalMessageId?.let { "Original-Message-ID: $it\r\n" } ?: "") +
                "Disposition: manual-action/MDN-sent-manually; displayed\r\n", "message/disposition-notification")
        })
        msg.setContent(report); msg.sentDate = Date(); msg.saveChanges()
        send(msg, sentFolder)
    }

    fun ensureFolder(store: Store, name: String): String {
        val f = store.getFolder(name)
        if (!f.exists()) f.create(Folder.HOLDS_MESSAGES)
        runCatching { f.isSubscribed = true }
        return f.fullName
    }

    fun setFlagsIn(store: Store, folder: String, uid: Long, seen: Boolean?, flagged: Boolean?) =
        withFolder(store, folder) { f ->
            val m = f.getMessageByUID(uid) ?: return@withFolder
            seen?.let { m.setFlag(Flags.Flag.SEEN, it) }
            flagged?.let { m.setFlag(Flags.Flag.FLAGGED, it) }
        }

    fun moveIn(store: Store, fromFolder: String, uid: Long, toFolder: String) = withFolder(store, fromFolder) { f ->
        val msg = f.getMessageByUID(uid) ?: return@withFolder
        val target = store.getFolder(toFolder)
        runCatching { f.moveMessages(arrayOf(msg), target) }.getOrElse { f.copyMessages(arrayOf(msg), target); msg.setFlag(Flags.Flag.DELETED, true) }
    }

    /** Leitet die Originalmail vollständig (mit allen Anhängen) als .eml-Anhang weiter. */
    fun forwardIn(store: Store, folder: String, uid: Long, to: List<String>, subject: String, sentFolder: String?) {
        val raw = withFolder(store, folder) { f ->
            val m = f.getMessageByUID(uid) ?: return@withFolder null
            java.io.ByteArrayOutputStream().also { m.writeTo(it) }.toByteArray()
        } ?: return
        val msg = MimeMessage(session)
        msg.setFrom(InternetAddress(acc.email, acc.name, "UTF-8"))
        msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to.joinToString(","), false))
        msg.setSubject(if (subject.startsWith("WG:", true) || subject.startsWith("Fwd:", true)) subject else tr("WG: {0}", subject), "UTF-8")
        msg.setHeader("X-Mailwerk-Auto", "forward")
        msg.setHeader("Auto-Submitted", "auto-forwarded")
        val mp = MimeMultipart("mixed")
        mp.addBodyPart(MimeBodyPart().apply { setText(tr("Automatisch weitergeleitet von {0} (Mailwerk-Regel).\nDie Originalnachricht ist angehängt.", acc.email), "UTF-8") })
        mp.addBodyPart(MimeBodyPart().apply {
            dataHandler = DataHandler(ByteArrayDataSource(raw, "message/rfc822"))
            fileName = tr("Weitergeleitete Nachricht.eml"); disposition = Part.ATTACHMENT
        })
        msg.setContent(mp); msg.sentDate = Date(); msg.saveChanges()
        send(msg, sentFolder)
    }

    /** Einfache automatische Antwort (Abwesenheitsnotiz) gemäß RFC 3834. */
    fun sendAutoReply(to: String, subject: String, text: String, inReplyTo: String?, sentFolder: String?) {
        val msg = MimeMessage(session)
        msg.setFrom(InternetAddress(acc.email, acc.name, "UTF-8"))
        msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to, false))
        msg.setSubject(subject, "UTF-8")
        msg.setHeader("Auto-Submitted", "auto-replied")
        msg.setHeader("X-Mailwerk-Auto", "vacation")
        msg.setHeader("Precedence", "auto_reply")
        inReplyTo?.let { msg.setHeader("In-Reply-To", it); msg.setHeader("References", it) }
        msg.setText(text, "UTF-8"); msg.sentDate = Date(); msg.saveChanges()
        send(msg, sentFolder)
    }

    fun setFlag(folder: String, uid: Long, flag: Flags.Flag, value: Boolean) = withStore { s ->
        withFolder(s, folder) { f -> f.getMessageByUID(uid)?.setFlag(flag, value) }
    }

    fun move(fromFolder: String, uid: Long, toFolder: String) = withStore { s ->
        withFolder(s, fromFolder) { f ->
            val msg = f.getMessageByUID(uid) ?: return@withFolder
            val target = s.getFolder(toFolder)
            runCatching { f.moveMessages(arrayOf(msg), target) }.getOrElse {
                f.copyMessages(arrayOf(msg), target); msg.setFlag(Flags.Flag.DELETED, true)
            }
        }
    }

    fun deleteForever(folder: String, uid: Long) = withStore { s ->
        withFolder(s, folder) { f -> f.getMessageByUID(uid)?.setFlag(Flags.Flag.DELETED, true) }
    }

    fun downloadPart(folder: String, uid: Long, path: String, sink: (InputStream) -> Unit) = withStore { s ->
        val f = s.getFolder(folder) as IMAPFolder
        f.open(Folder.READ_ONLY)
        try {
            var part: Part = f.getMessageByUID(uid) ?: error(tr("Nachricht nicht mehr auf dem Server"))
            if (path.isNotEmpty()) path.split('.').forEach { idx -> part = (part.content as Multipart).getBodyPart(idx.toInt()) }
            part.inputStream.use(sink)
        } finally { runCatching { f.close(false) } }
    }

    // ------------------------------------------------------------------ Senden

    fun buildMessage(
        to: String, cc: String, bcc: String, subject: String, body: String,
        attachments: List<OutgoingAttachment>, inReplyTo: String?, references: String?,
        logo: OutgoingAttachment? = null,
        readReceipt: Boolean = false,
    ): MimeMessage {
        val msg = MimeMessage(session)
        msg.setFrom(InternetAddress(acc.email, acc.name, "UTF-8"))
        msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(to.replace(';', ','), false))
        if (cc.isNotBlank()) msg.setRecipients(Message.RecipientType.CC, InternetAddress.parse(cc.replace(';', ','), false))
        if (bcc.isNotBlank()) msg.setRecipients(Message.RecipientType.BCC, InternetAddress.parse(bcc.replace(';', ','), false))
        msg.setSubject(subject, "UTF-8")
        msg.sentDate = Date()
        inReplyTo?.let { msg.setHeader("In-Reply-To", it) }
        listOfNotNull(references, inReplyTo).joinToString(" ").trim().takeIf { it.isNotEmpty() }?.let { msg.setHeader("References", it) }
        msg.setHeader("X-Mailer", "Mailwerk")
        if (readReceipt) msg.setHeader("Disposition-Notification-To", InternetAddress(acc.email, acc.name, "UTF-8").toString())

        val useLogo = logo != null && body.lines().any { it.trim() == TextFormat.LOGO_MARKER }
        val htmlBody = TextFormat.toHtml(body, useLogo)
        val htmlPart = MimeBodyPart().apply { setContent(htmlBody, "text/html; charset=UTF-8") }
        val alt = MimeMultipart("alternative").apply {
            addBodyPart(MimeBodyPart().apply { setText(TextFormat.toPlain(body), "UTF-8") })
            if (useLogo) {
                // HTML + eingebettetes Logo als multipart/related
                val related = MimeMultipart("related")
                related.addBodyPart(htmlPart)
                related.addBodyPart(MimeBodyPart().apply {
                    dataHandler = DataHandler(ByteArrayDataSource(logo!!.bytes, logo.mime))
                    contentID = "<${TextFormat.LOGO_CID}>"
                    disposition = Part.INLINE
                    fileName = logo.name
                })
                addBodyPart(MimeBodyPart().apply { setContent(related) })
            } else addBodyPart(htmlPart)
        }
        if (attachments.isEmpty()) msg.setContent(alt)
        else {
            val mixed = MimeMultipart("mixed")
            mixed.addBodyPart(MimeBodyPart().apply { setContent(alt) })
            attachments.forEach { a ->
                mixed.addBodyPart(MimeBodyPart().apply {
                    dataHandler = DataHandler(ByteArrayDataSource(a.bytes, a.mime))
                    fileName = MimeUtility.encodeText(a.name, "UTF-8", null)
                    disposition = Part.ATTACHMENT
                })
            }
            msg.setContent(mixed)
        }
        msg.saveChanges()
        return msg
    }

    /** Sendet und legt eine Kopie im „Gesendet“-Ordner ab (außer bei Gmail, das macht das selbst). */
    fun send(msg: MimeMessage, sentFolder: String?) {
        Thread.currentThread().contextClassLoader = MailClient::class.java.classLoader
        val t = session.transport
        try {
            t.connect(acc.smtpHost, acc.smtpPort, acc.username, password)
            t.sendMessage(msg, msg.allRecipients)
        } catch (e: Exception) { throw IllegalStateException(friendly(e), e) }
        finally { runCatching { t.close() } }
        if (sentFolder != null && !acc.smtpHost.contains("gmail")) runCatching {
            withStore { s ->
                val f = s.getFolder(sentFolder)
                msg.setFlag(Flags.Flag.SEEN, true)
                f.appendMessages(arrayOf(msg))
            }
        }
    }

    fun appendDraft(msg: MimeMessage, draftsFolder: String) = withStore { s ->
        msg.setFlag(Flags.Flag.DRAFT, true)
        s.getFolder(draftsFolder).appendMessages(arrayOf(msg))
    }
}

/** Übersetzt technische Fehler in verständliche Sätze. */
fun friendly(e: Throwable): String {
    val all = generateSequence(e) { it.cause }.joinToString(" | ") { "${it.javaClass.simpleName}: ${it.message}" }
    val m = all.lowercase()
    return when {
        "authenticationfailed" in m || "authentication failed" in m || "invalid credentials" in m || "535" in m ||
            "login failed" in m || "authenticate failed" in m || "[auth]" in m -> tr("Anmeldung fehlgeschlagen – Benutzername oder Passwort falsch (evtl. App-Passwort nötig).")
        "unknownhost" in m -> tr("Server nicht gefunden – Servername prüfen oder Internetverbindung.")
        "timeout" in m || "timed out" in m -> tr("Zeitüberschreitung – der Server antwortet nicht (Port/Verschlüsselung prüfen).")
        "connection refused" in m || "connectexception" in m -> tr("Verbindung abgelehnt – Port oder Verschlüsselung passt nicht.")
        "certificate" in m || "sslhandshake" in m || "certpath" in m -> tr("Zertifikatsfehler – die Verbindung ist nicht vertrauenswürdig.")
        "starttls" in m -> tr("Der Server unterstützt STARTTLS nicht – andere Verschlüsselung wählen.")
        "invalid addresses" in m || "addressexception" in m -> tr("Ungültige Empfängeradresse.")
        "message size" in m || "552" in m -> tr("Die Nachricht ist zu groß für den Server.")
        else -> e.message ?: e.javaClass.simpleName
    }
}
