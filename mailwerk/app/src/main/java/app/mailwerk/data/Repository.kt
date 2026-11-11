package app.mailwerk.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import app.mailwerk.mail.HtmlSanitizer
import app.mailwerk.mail.MailClient
import app.mailwerk.mail.OutgoingAttachment
import app.mailwerk.mail.Classifier
import app.mailwerk.mail.Threads
import app.mailwerk.mail.Unsubscribe
import app.mailwerk.mail.friendly
import app.mailwerk.sync.Notifier
import jakarta.mail.Flags
import jakarta.mail.internet.InternetAddress
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class Repository private constructor(private val ctx: Context) {
    val db = Db.get(ctx)
    val prefs = Prefs(ctx)
    private val syncLock = Mutex()
    /** Für Tests austauschbar (Robolectric hat keinen Android-Keystore). */
    internal var passwordOf: (Account) -> String = { Crypto.decrypt(it.passwordEnc) }

    init {
        // frühere Sperrliste (Einstellungen) in die Datenbank übernehmen
        if (prefs.blockedSenders.isNotEmpty()) { prefs.blockedSenders.forEach { db.block(it, false) }; prefs.blockedSenders = emptySet() }
    }

    private fun client(a: Account): MailClient {
        val pw = try { passwordOf(a) } catch (e: Exception) {
            throw IllegalStateException("Gespeichertes Passwort nicht lesbar – bitte unter Einstellungen → Konto das Passwort neu eingeben.")
        }
        return MailClient(a, pw)
    }

    // ================================================================= Konten
    suspend fun testAccount(a: Account, plainPassword: String) = withContext(Dispatchers.IO) {
        MailClient(a, plainPassword).test()
    }

    suspend fun addAccount(a: Account, plainPassword: String): Long = withContext(Dispatchers.IO) {
        val color = palette[db.accounts().size % palette.size]
        db.saveAccount(a.copy(passwordEnc = Crypto.encrypt(plainPassword), color = if (a.color == 0) color else a.color))
    }

    suspend fun updateAccount(a: Account, newPassword: String?) = withContext(Dispatchers.IO) {
        db.saveAccount(if (newPassword.isNullOrEmpty()) a else a.copy(passwordEnc = Crypto.encrypt(newPassword)))
    }

    // ================================================================= Abgleich
    /**
     * Gleicht alle Konten ab: Ordnerliste, Posteingang, Gesendet (für Unterhaltungen) und ggf. den gerade
     * geöffneten Ordner. Liefert Fehlermeldungen pro Konto.
     */
    suspend fun sync(extraFolderId: Long? = null, notify: Boolean = false): List<String> = withContext(Dispatchers.IO) {
        syncLock.withLock {
            val errors = mutableListOf<String>()
            for (acc in db.accounts()) {
                try { syncAccount(acc, extraFolderId, notify) }
                catch (e: Exception) { errors += "${acc.email}: ${friendly(e)}" }
            }
            processTimers()
            db.notifyChanged()
            errors
        }
    }

    private fun syncAccount(acc: Account, extraFolderId: Long?, notify: Boolean) {
        val c = client(acc)
        c.withStore { store ->
            val remote = c.listFolders(store)
            remote.filter { it.selectable }.forEach { db.upsertFolder(acc.id, it.fullName, it.display, it.role) }
            db.removeFoldersNotIn(acc.id, remote.filter { it.selectable }.map { it.fullName })

            val toSync = db.folders(acc.id).filter {
                it.role == FolderRole.SENT || it.role == FolderRole.INBOX || it.id == extraFolderId
            }.sortedBy { if (it.role == FolderRole.SENT) 0 else 1 } // Gesendet zuerst -> bekannte Kontakte für Einsortierung
            for (f in toSync) {
                val res = c.syncFolder(store, f.fullName, f.lastUid, f.uidValidity, days = prefs.initialSyncDays)
                if (f.uidValidity != 0L && f.uidValidity != res.uidValidity) db.clearFolder(f.id)
                val local = db.uidsInFolder(f.id, 0)
                // Flags & Löschungen abgleichen
                local.forEach { (uid, v) ->
                    val (id, seen, flagged) = v
                    if (uid < 0) { db.deleteMessage(id); return@forEach } // lokale Platzhalter nach Verschieben
                    if (uid >= res.checkedFromUid && res.checkedFromUid > 0) {
                        val r = res.flags[uid]
                        if (r == null) db.deleteMessage(id)
                        else if (r.first != seen || r.second != flagged) db.updateFlags(id, seen = r.first, flagged = r.second)
                    }
                }
                var maxUid = f.lastUid
                val fresh = mutableListOf<Message>()
                val initial = f.lastUid == 0L // erster Abgleich: nichts automatisch weiterleiten/beantworten
                val rules = db.rules().filter { it.enabled && (it.accountId == null || it.accountId == acc.id) }
                val blocklist = db.blocklist()
                for (p in res.newMessages) {
                    maxUid = maxOf(maxUid, p.uid)
                    if (p.uid in local) continue
                    val isSent = f.role == FolderRole.SENT || p.fromAddr.equals(acc.email, true)
                    var decision = app.mailwerk.mail.Decision()
                    if (f.role == FolderRole.INBOX && !isSent) {
                        decision = app.mailwerk.mail.RuleEngine.decide(rules, blocklist, app.mailwerk.mail.Incoming(
                            p.fromAddr, p.fromName, p.to, p.cc, p.subject, p.text ?: p.html?.let(HtmlSanitizer::htmlToText) ?: "", p.headers))
                        if (applyServerActions(c, store, acc, f, p, decision, initial)) continue // Mail hat den Posteingang verlassen
                    }
                    if (isSent) {
                        (parseAddrs(p.to) + parseAddrs(p.cc)).forEach { (addr, name) -> db.touchContact(addr, name, sent = true) }
                    } else db.touchContact(p.fromAddr, p.fromName, sent = false)
                    val blocked = decision.blocked
                    val cat = if (isSent) Category.PEOPLE else Classifier.classify(
                        p.fromAddr, p.headers, db.isKnownContact(p.fromAddr), db.senderRule(p.fromAddr))
                    val unsub = Unsubscribe.parse(p.headers["list-unsubscribe"], p.headers["list-unsubscribe-post"])
                    val text = p.text ?: p.html?.let(HtmlSanitizer::htmlToText) ?: ""
                    val m = Message(
                        accountId = acc.id, folderId = f.id, uid = p.uid, messageId = p.messageId,
                        threadKey = Threads.key(acc.id, p.subject, p.messageId),
                        fromName = p.fromName, fromAddr = p.fromAddr, toAddrs = p.to, ccAddrs = p.cc, replyTo = p.replyTo,
                        subject = p.subject, date = p.date, snippet = HtmlSanitizer.snippet(text), bodyHtml = p.html, bodyText = text,
                        seen = p.seen || isSent || blocked || decision.read, flagged = p.flagged || decision.flag, category = decision.category ?: cat,
                        pinned = decision.pin,
                        hasAttachments = p.attachments.isNotEmpty(), unsubscribe = unsub?.encode(), unsubscribePost = unsub?.oneClick == true,
                        inReplyTo = p.inReplyTo, references = p.references,
                    )
                    val id = db.insertMessage(m, p.attachments.map { Attachment(messageId = 0, partPath = it.path, name = it.name, mime = it.mime, size = it.size) })
                    if (id > 0 && !m.seen && f.role == FolderRole.INBOX && f.lastUid > 0) fresh += m.copy(id = id)
                    if (id > 0 && f.role == FolderRole.INBOX && !isSent && !initial) runCatching { maybeVacationReply(c, acc, p, m.category) }
                }
                db.setFolderSyncState(f.id, maxUid, res.uidValidity)
                if (notify && fresh.isNotEmpty()) {
                    val show = if (prefs.notifyOnlyImportant) fresh.filter { it.category == Category.PEOPLE } else fresh
                    if (show.isNotEmpty()) Notifier.newMail(ctx, acc, show)
                }
            }
        }
    }

    /**
     * Führt Regel-Aktionen auf dem Server aus. Gibt true zurück, wenn die Mail den Posteingang verlassen hat
     * (Spam, Papierkorb, anderer Ordner) und deshalb nicht im Posteingang gespeichert wird.
     */
    private fun applyServerActions(c: MailClient, store: jakarta.mail.Store, acc: Account, inbox: Folder,
                                   p: app.mailwerk.mail.ParsedMessage, d: app.mailwerk.mail.Decision, initial: Boolean): Boolean {
        if (d.matched.isEmpty()) return false
        try {
            if (d.read || d.flag) c.setFlagsIn(store, inbox.fullName, p.uid, if (d.read) true else null, if (d.flag) true else null)
            if (d.forwardTo.isNotEmpty() && !initial && !app.mailwerk.mail.RuleEngine.isAutomatedForward(p.headers)) {
                val targets = d.forwardTo.filter { !it.equals(acc.email, true) }
                if (targets.isNotEmpty()) c.forwardIn(store, inbox.fullName, p.uid, targets, p.subject, db.folderByRole(acc.id, FolderRole.SENT)?.fullName)
            }
            val target: String? = when {
                d.spam -> db.folderByRole(acc.id, FolderRole.JUNK)?.fullName ?: c.ensureFolder(store, "Spam")
                d.delete -> db.folderByRole(acc.id, FolderRole.TRASH)?.fullName ?: c.ensureFolder(store, "Papierkorb")
                d.moveTo != null -> resolveFolder(c, store, acc, d.moveTo)
                else -> null
            }
            if (target != null && !target.equals(inbox.fullName, true)) {
                c.moveIn(store, inbox.fullName, p.uid, target)
                if (d.spam) blockedCount++
                return true
            }
        } catch (e: Exception) {
            android.util.Log.w("Mailwerk", "Regel konnte nicht ausgeführt werden: ${friendly(e)}")
        }
        return false
    }

    /** Ordner per Anzeigename oder vollem Namen finden, sonst auf dem Server anlegen. */
    private fun resolveFolder(c: MailClient, store: jakarta.mail.Store, acc: Account, name: String): String {
        val fs = db.folders(acc.id)
        fs.firstOrNull { it.fullName.equals(name, true) || it.displayName.equals(name, true) }?.let { return it.fullName }
        val full = c.ensureFolder(store, name)
        db.upsertFolder(acc.id, full, name.substringAfterLast('/').substringAfterLast('.'), null)
        return full
    }

    @Volatile var blockedCount = 0

    /** Abwesenheitsnotiz: höchstens einmal pro Absender, nie an Newsletter/automatische Mails. */
    private fun maybeVacationReply(c: MailClient, acc: Account, p: app.mailwerk.mail.ParsedMessage, cat: Category) {
        if (!prefs.vacationActive()) return
        val accs = prefs.vacationAccounts.split(',').mapNotNull { it.trim().toLongOrNull() }
        if (accs.isNotEmpty() && acc.id !in accs) return
        if (cat != Category.PEOPLE || app.mailwerk.mail.RuleEngine.isAutomated(p.fromAddr, p.headers)) return
        if (p.fromAddr.isBlank() || p.fromAddr.equals(acc.email, true)) return
        if (prefs.vacationContactsOnly && !db.isKnownContact(p.fromAddr)) return
        if (db.vacationReplied(p.fromAddr, acc.id)) return
        val subj = prefs.vacationSubject.ifBlank { "Abwesenheitsnotiz" } + if (p.subject.isNotBlank()) ": ${p.subject}" else ""
        c.sendAutoReply(p.fromAddr, subj, prefs.vacationText, p.messageId, db.folderByRole(acc.id, FolderRole.SENT)?.fullName)
        db.markVacationReplied(p.fromAddr, acc.id)
    }

    /** Wendet alle Regeln (außer Weiterleiten) auf die Mails an, die schon im Posteingang liegen. */
    suspend fun applyRulesToExisting(): Int = withContext(Dispatchers.IO) {
        var moved = 0
        for (acc in db.accounts()) {
            val inbox = db.folderByRole(acc.id, FolderRole.INBOX) ?: continue
            val rules = db.rules().filter { it.enabled && (it.accountId == null || it.accountId == acc.id) }
                .map { if (it.action == app.mailwerk.mail.RuleAction.FORWARD) it.copy(enabled = false) else it }
            val blocklist = db.blocklist()
            val msgs = db.listMessages(listOf(inbox.id), null, null, limit = 2000)
            if (msgs.isEmpty() || (rules.none { it.enabled } && blocklist.isEmpty())) continue
            val c = client(acc)
            try {
                c.withStore { store ->
                    for (m in msgs) {
                        val d = app.mailwerk.mail.RuleEngine.decide(rules, blocklist,
                            app.mailwerk.mail.Incoming(m.fromAddr, m.fromName, m.toAddrs, m.ccAddrs, m.subject, db.message(m.id)?.bodyText ?: ""))
                        if (d.matched.isEmpty()) continue
                        d.category?.let { db.updateFlags(m.id, category = it) }
                        if (d.pin) db.updateFlags(m.id, pinned = true)
                        if (d.read) db.updateFlags(m.id, seen = true)
                        if (d.flag) db.updateFlags(m.id, flagged = true)
                        if (m.uid > 0 && applyServerActions(c, store, acc, inbox, app.mailwerk.mail.ParsedMessage(m.uid, m.messageId, m.fromName, m.fromAddr,
                                m.toAddrs, m.ccAddrs, m.replyTo, m.subject, m.date, null, null, m.seen, m.flagged, emptyMap(), emptyList(), null, null), d, initial = true)) {
                            db.deleteMessage(m.id); moved++
                        }
                    }
                }
            } catch (e: Exception) { android.util.Log.w("Mailwerk", friendly(e)) }
        }
        db.notifyChanged(); moved
    }

    /** Zurückgestellte Mails wieder einblenden und „Erinnern, falls keine Antwort“ prüfen. */
    private fun processTimers() {
        val now = System.currentTimeMillis()
        db.dueSnoozed(now).forEach { m ->
            db.updateFlags(m.id, snoozedUntil = 0, seen = false, pinned = true)
            Notifier.reminder(ctx, m, "Wieder da: ${m.subject.ifBlank { "(kein Betreff)" }}")
        }
        db.dueReminders(now).forEach { m ->
            db.updateFlags(m.id, remindAt = 0)
            if (!db.hasReplyInThread(m.threadKey, m.date)) {
                db.updateFlags(m.id, pinned = true)
                Notifier.reminder(ctx, m, "Keine Antwort erhalten: ${m.subject.ifBlank { "(kein Betreff)" }}")
            }
        }
    }

    // ================================================================= Aktionen
    private suspend fun remote(m: Message, block: (MailClient, Folder) -> Unit): String? = withContext(Dispatchers.IO) {
        val acc = db.account(m.accountId) ?: return@withContext "Konto nicht gefunden"
        val f = db.folder(m.folderId) ?: return@withContext "Ordner nicht gefunden"
        if (m.uid <= 0) return@withContext null
        try { block(client(acc), f); null } catch (e: Exception) { friendly(e) }
    }

    suspend fun markSeen(m: Message, seen: Boolean): String? {
        db.updateFlags(m.id, seen = seen); db.notifyChanged()
        return remote(m) { c, f -> c.setFlag(f.fullName, m.uid, Flags.Flag.SEEN, seen) }
    }

    suspend fun markThreadSeen(threadKey: String) {
        db.thread(threadKey).filter { !it.seen }.forEach { markSeen(it, true) }
    }

    suspend fun toggleFlag(m: Message): String? {
        db.updateFlags(m.id, flagged = !m.flagged); db.notifyChanged()
        return remote(m) { c, f -> c.setFlag(f.fullName, m.uid, Flags.Flag.FLAGGED, !m.flagged) }
    }

    fun togglePin(m: Message) { db.updateFlags(m.id, pinned = !m.pinned); db.notifyChanged() }

    fun snooze(m: Message, until: Long) {
        db.thread(m.threadKey).filter { it.folderRole == FolderRole.INBOX }.ifEmpty { listOf(m) }
            .forEach { db.updateFlags(it.id, snoozedUntil = until, pinned = false) }
        db.notifyChanged()
    }

    fun unsnooze(m: Message) { db.updateFlags(m.id, snoozedUntil = 0); db.notifyChanged() }

    fun remindIfNoReply(m: Message, at: Long) { db.updateFlags(m.id, remindAt = at); db.notifyChanged() }

    suspend fun archive(m: Message): String? = moveToRole(m, FolderRole.ARCHIVE, "Kein Archiv-Ordner gefunden")

    suspend fun delete(m: Message): String? {
        if (m.folderRole == FolderRole.TRASH) {
            db.deleteMessage(m.id); db.notifyChanged()
            return remote(m) { c, f -> c.deleteForever(f.fullName, m.uid) }
        }
        return moveToRole(m, FolderRole.TRASH, "Kein Papierkorb gefunden")
    }

    /** Spam: in den Spam-Ordner und den Absender sperren – künftige Mails gehen direkt in Spam. */
    suspend fun markSpam(m: Message, blockSender: Boolean = true): String? {
        if (blockSender && m.fromAddr.isNotBlank()) db.block(m.fromAddr, domain = false)
        db.folderByRole(m.accountId, FolderRole.JUNK)?.let { return moveTo(m, it) }
        // Kein Spam-Ordner vorhanden -> anlegen
        val acc = db.account(m.accountId) ?: return "Konto nicht gefunden"
        return withContext(Dispatchers.IO) {
            try {
                val c = client(acc)
                val full = c.withStore { c.ensureFolder(it, "Spam") }
                val fid = db.upsertFolder(acc.id, full, "Spam", FolderRole.JUNK)
                db.folder(fid)?.let { moveTo(m, it) }
            } catch (e: Exception) { friendly(e) }
        }
    }

    /** „Kein Spam“: zurück in den Posteingang und Sperre aufheben. */
    suspend fun notSpam(m: Message): String? {
        db.unblockSender(m.fromAddr)
        db.setCategoryForSender(m.fromAddr, Category.PEOPLE)
        val inbox = db.folderByRole(m.accountId, FolderRole.INBOX) ?: return null
        return moveTo(m, inbox)
    }

    suspend fun moveTo(m: Message, target: Folder): String? {
        val src = db.folder(m.folderId) ?: return null
        db.moveLocal(m.id, target.id); db.notifyChanged()
        return remote(m) { c, _ -> c.move(src.fullName, m.uid, target.fullName) }
    }

    private suspend fun moveToRole(m: Message, role: String, err: String): String? {
        val target = db.folderByRole(m.accountId, role) ?: return err
        if (target.id == m.folderId) return null
        return moveTo(m, target)
    }

    /** Absender blockieren: künftige Mails landen gelesen in „Benachrichtigungen“, vorhandene werden gelöscht. */
    suspend fun blockSender(m: Message, domain: Boolean = false) {
        db.block(if (domain) m.fromAddr.substringAfter('@') else m.fromAddr, domain)
        markSpam(m, blockSender = false)
    }

    /** Abmelden von Newslettern mit einem Tipp (RFC 8058 One-Click, sonst Mail an mailto-Adresse). */
    suspend fun unsubscribe(m: Message): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        val lines = m.unsubscribe?.lines()?.filter { it.isNotBlank() } ?: return@withContext false to "Keine Abmeldung möglich"
        val http = lines.firstOrNull { it.startsWith("http", true) }
        val mailto = lines.firstOrNull { it.startsWith("mailto:", true) }
        try {
            if (http != null && m.unsubscribePost) {
                val conn = URL(http).openConnection() as HttpURLConnection
                conn.requestMethod = "POST"; conn.doOutput = true; conn.connectTimeout = 10000; conn.readTimeout = 10000
                conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
                conn.outputStream.use { it.write("List-Unsubscribe=One-Click".toByteArray()) }
                val code = conn.responseCode; conn.disconnect()
                if (code in 200..299) { db.setCategoryForSender(m.fromAddr, Category.NEWSLETTER); return@withContext true to "Abgemeldet ✓" }
            }
            if (mailto != null) {
                val acc = db.account(m.accountId)!!
                val addr = mailto.removePrefix("mailto:").substringBefore('?')
                val subj = Regex("subject=([^&]*)", RegexOption.IGNORE_CASE).find(mailto)?.groupValues?.get(1)
                    ?.let { java.net.URLDecoder.decode(it, "UTF-8") } ?: "unsubscribe"
                val c = client(acc)
                c.send(c.buildMessage(addr, "", "", subj, "unsubscribe", emptyList(), null, null), null)
                return@withContext true to "Abmelde-Mail gesendet ✓"
            }
            if (http != null) return@withContext false to http // UI öffnet die Seite im Browser
            false to "Abmeldung fehlgeschlagen"
        } catch (e: Exception) { false to friendly(e) }
    }

    suspend fun downloadAttachment(m: Message, a: Attachment): File = withContext(Dispatchers.IO) {
        a.localPath?.let { File(it) }?.takeIf { it.exists() }?.let { return@withContext it }
        val acc = db.account(m.accountId)!!; val f = db.folder(m.folderId)!!
        val dir = File(ctx.cacheDir, "attachments/${a.id}").apply { mkdirs() }
        val safe = a.name.replace(Regex("[/\\\\:*?\"<>|]"), "_").ifBlank { "anhang" }
        val out = File(dir, safe)
        client(acc).downloadPart(f.fullName, m.uid, a.partPath) { input -> out.outputStream().use { input.copyTo(it) } }
        db.setAttachmentPath(a.id, out.absolutePath)
        out
    }

    // ================================================================= Senden
    /** Versendet sofort (vom SendWorker aufgerufen). */
    suspend fun sendNow(outboxId: Long): String? = withContext(Dispatchers.IO) {
        val o = db.outboxItem(outboxId) ?: return@withContext null
        val acc = db.account(o.accountId) ?: return@withContext "Konto nicht gefunden"
        db.saveOutbox(o.copy(status = OutboxStatus.SENDING))
        try {
            val atts = o.attachments.lines().filter { it.isNotBlank() }.map { readUri(Uri.parse(it)) }
            val c = client(acc)
            val logo = acc.logoPath?.let { File(it) }?.takeIf { it.exists() }?.let {
                OutgoingAttachment("logo." + it.extension.ifBlank { "png" }, if (it.extension.equals("jpg", true) || it.extension.equals("jpeg", true)) "image/jpeg" else "image/png", it.readBytes())
            }
            val msg = c.buildMessage(o.to, o.cc, o.bcc, o.subject, o.body, atts, o.inReplyTo, o.references, logo)
            c.send(msg, db.folderByRole(acc.id, FolderRole.SENT)?.fullName)
            (parseAddrs(o.to) + parseAddrs(o.cc) + parseAddrs(o.bcc)).forEach { (a, n) -> db.touchContact(a, n, sent = true) }
            db.deleteOutbox(o.id)
            if (o.remindIfNoReplyDays > 0) pendingReminders[Threads.key(acc.id, o.subject, null)] =
                System.currentTimeMillis() + o.remindIfNoReplyDays * 86_400_000L
            runCatching { sync() }
            // Erinnerung an der gesendeten Nachricht festmachen
            pendingReminders.toMap().forEach { (key, at) ->
                db.thread(key).lastOrNull { it.folderRole == FolderRole.SENT }?.let { db.updateFlags(it.id, remindAt = at); pendingReminders.remove(key) }
            }
            null
        } catch (e: Exception) {
            val msg = friendly(e)
            db.saveOutbox(o.copy(status = OutboxStatus.FAILED, error = msg))
            Notifier.sendFailed(ctx, o, msg)
            msg
        }
    }

    private val pendingReminders = mutableMapOf<String, Long>()

    private fun readUri(uri: Uri): OutgoingAttachment {
        val cr = ctx.contentResolver
        var name = uri.lastPathSegment ?: "anhang"
        cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0)?.let { name = it }
        }
        val mime = cr.getType(uri) ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase())
            ?: "application/octet-stream"
        val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: error("Anhang $name kann nicht gelesen werden")
        return OutgoingAttachment(name, mime, bytes)
    }

    companion object {
        @Volatile private var inst: Repository? = null
        fun get(ctx: Context) = inst ?: synchronized(this) { inst ?: Repository(ctx.applicationContext).also { inst = it } }

        val palette = listOf(0xFF1E88E5, 0xFFE53935, 0xFF43A047, 0xFF8E24AA, 0xFFFB8C00, 0xFF00897B, 0xFF3949AB, 0xFFD81B60).map { it.toInt() }

        fun parseAddrs(s: String): List<Pair<String, String>> = runCatching {
            InternetAddress.parse(s.replace(';', ','), false).map { it.address to (it.personal ?: "") }
        }.getOrDefault(emptyList())
    }
}
