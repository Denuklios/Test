package app.mailwerk.desktop

import app.mailwerk.data.Account
import app.mailwerk.data.Attachment
import app.mailwerk.data.Category
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Message
import app.mailwerk.mail.Classifier
import app.mailwerk.mail.HtmlSanitizer
import app.mailwerk.mail.IdleWatcher
import app.mailwerk.mail.MailClient
import app.mailwerk.mail.OutgoingAttachment
import app.mailwerk.mail.Threads
import app.mailwerk.mail.Unsubscribe
import app.mailwerk.mail.friendly
import app.mailwerk.tr
import jakarta.mail.internet.InternetAddress
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File

/** Abgleich, Aktionen und Versand – dieselbe Logik wie in der Handy-App, mit dem gemeinsamen Mail-Kern. */
class Repo(val store: Store = Store()) {
    private val lock = Mutex()
    val syncing = MutableStateFlow(false)
    val errors = MutableStateFlow<Map<Long, String>>(emptyMap())
    /** wird bei neuen Mails aufgerufen (Windows-Benachrichtigung) */
    var onNewMail: (Account, List<Message>) -> Unit = { _, _ -> }
    /** für Tests austauschbar */
    var passwordOf: (Account) -> String = { Secret.reveal(it.passwordEnc) }

    fun client(a: Account) = MailClient(a, passwordOf(a))

    // ------------------------------------------------------------------ Konten
    suspend fun testAccount(a: Account, password: String) = withContext(Dispatchers.IO) { MailClient(a, password).test() }

    suspend fun addAccount(a: Account, password: String): Long = withContext(Dispatchers.IO) {
        val colors = listOf(0xFF3D4FE0, 0xFFE53935, 0xFF43A047, 0xFF8E24AA, 0xFFFB8C00, 0xFF00897B).map { it.toInt() }
        store.saveAccount(a.copy(passwordEnc = Secret.protect(password), color = if (a.color == 0) colors[store.accounts().size % colors.size] else a.color))
    }

    suspend fun updateAccount(a: Account, newPassword: String?) = withContext(Dispatchers.IO) {
        store.saveAccount(if (newPassword.isNullOrEmpty()) a else a.copy(passwordEnc = Secret.protect(newPassword)))
    }

    // ------------------------------------------------------------------ Abgleich
    suspend fun sync(extraFolderId: Long? = null): Map<Long, String> = withContext(Dispatchers.IO) {
        lock.withLock {
            syncing.value = true
            val errs = mutableMapOf<Long, String>()
            try {
                for (a in store.accounts()) {
                    try { syncAccount(a, extraFolderId) } catch (e: Exception) { errs[a.id] = friendly(e) }
                    store.changed()
                }
            } finally { syncing.value = false }
            errors.value = errs
            errs
        }
    }

    private fun syncAccount(acc: Account, extraFolderId: Long?) {
        val c = client(acc)
        c.withStore { s ->
            val remote = c.listFolders(s).filter { it.selectable }
            remote.forEach { store.upsertFolder(acc.id, it.fullName, it.display, it.role) }
            store.removeFoldersNotIn(acc.id, remote.map { it.fullName })
            val toSync = store.folders(acc.id).filter { it.role == FolderRole.INBOX || it.role == FolderRole.SENT || it.id == extraFolderId }
                .sortedBy { if (it.role == FolderRole.SENT) 0 else 1 } // erst Gesendet -> bekannte Kontakte für die Einsortierung
            for (f in toSync) {
                val res = c.syncFolder(s, f.fullName, f.lastUid, f.uidValidity)
                if (f.uidValidity != 0L && f.uidValidity != res.uidValidity) store.clearFolder(f.id)
                val local = store.uidsInFolder(f.id)
                local.forEach { (uid, v) ->
                    val (id, seen, flagged) = v
                    if (uid >= res.checkedFromUid && res.checkedFromUid > 0) {
                        val r = res.flags[uid]
                        if (r == null) store.deleteMessage(id)
                        else if (r.first != seen || r.second != flagged) store.setFlags(id, seen = r.first, flagged = r.second)
                    }
                }
                val fresh = mutableListOf<Message>()
                for (p in res.newMessages) {
                    if (p.uid in local) continue
                    val isSent = f.role == FolderRole.SENT || p.fromAddr.equals(acc.email, true)
                    if (isSent) (parse(p.to) + parse(p.cc)).forEach { (addr, name) -> store.touchContact(addr, name, true) }
                    else store.touchContact(p.fromAddr, p.fromName, false)
                    val text = p.text ?: p.html?.let(HtmlSanitizer::htmlToText) ?: ""
                    val cat = if (isSent) Category.PEOPLE else Classifier.classify(p.fromAddr, p.headers, store.isKnownContact(p.fromAddr), store.senderRule(p.fromAddr))
                    val unsub = Unsubscribe.parse(p.headers["list-unsubscribe"], p.headers["list-unsubscribe-post"])
                    val m = Message(accountId = acc.id, folderId = f.id, uid = p.uid, messageId = p.messageId,
                        threadKey = Threads.key(acc.id, p.subject, p.messageId), fromName = p.fromName, fromAddr = p.fromAddr,
                        toAddrs = p.to, ccAddrs = p.cc, replyTo = p.replyTo, subject = p.subject, date = p.date, snippet = HtmlSanitizer.snippet(text),
                        bodyHtml = p.html, bodyText = text, seen = p.seen || isSent, flagged = p.flagged, category = cat,
                        hasAttachments = p.attachments.isNotEmpty(), unsubscribe = unsub?.encode(), inReplyTo = p.inReplyTo, references = p.references)
                    val id = store.insertMessage(m, p.attachments.map { Attachment(messageId = 0, partPath = it.path, name = it.name, mime = it.mime, size = it.size) })
                    if (id > 0 && !m.seen && f.role == FolderRole.INBOX && f.lastUid > 0) fresh += m.copy(id = id)
                }
                store.setFolderSync(f.id, maxOf(f.lastUid, res.maxFetchedUid), res.uidValidity)
                if (fresh.isNotEmpty()) runCatching { onNewMail(acc, fresh) }
            }
        }
    }

    // ------------------------------------------------------------------ Sofort-Benachrichtigung (IMAP IDLE)
    private val watchers = mutableMapOf<Long, IdleWatcher>()
    fun startPush(onChange: () -> Unit) {
        store.accounts().forEach { a ->
            if (watchers.containsKey(a.id)) return@forEach
            watchers[a.id] = IdleWatcher(a, { passwordOf(a) }, onNewMail = onChange).also { it.start() }
        }
    }
    fun stopPush() { watchers.values.forEach { it.stop() }; watchers.clear() }

    // ------------------------------------------------------------------ Aktionen (lokal sofort, Server im Hintergrund)
    private suspend fun onServer(m: Message, block: MailClient.(folder: String) -> Unit) = withContext(Dispatchers.IO) {
        val acc = store.account(m.accountId) ?: return@withContext
        val f = store.folder(m.folderId) ?: return@withContext
        runCatching { client(acc).block(f.fullName) }.onFailure { errors.value = errors.value + (acc.id to friendly(it)) }
    }

    suspend fun setSeen(m: Message, seen: Boolean) { store.setFlags(m.id, seen = seen); onServer(m) { setFlag(it, m.uid, jakarta.mail.Flags.Flag.SEEN, seen) } }
    suspend fun setFlagged(m: Message, flagged: Boolean) { store.setFlags(m.id, flagged = flagged); onServer(m) { setFlag(it, m.uid, jakarta.mail.Flags.Flag.FLAGGED, flagged) } }
    fun togglePin(m: Message) = store.setFlags(m.id, pinned = !m.pinned)

    suspend fun moveToRole(m: Message, role: String, fallbackName: String): Boolean {
        val target = store.folderByRole(m.accountId, role)
        store.deleteMessage(m.id); store.changed()
        onServer(m) { from -> move(from, m.uid, target?.fullName ?: withStore { s -> ensureFolder(s, fallbackName) }) }
        return true
    }
    suspend fun archive(m: Message) = moveToRole(m, FolderRole.ARCHIVE, tr("Archiv"))
    suspend fun delete(m: Message) =
        if (m.folderRole == FolderRole.TRASH) { store.deleteMessage(m.id); store.changed(); onServer(m) { deleteForever(it, m.uid) }; true }
        else moveToRole(m, FolderRole.TRASH, tr("Papierkorb"))
    suspend fun spam(m: Message) = moveToRole(m, FolderRole.JUNK, "Spam")

    suspend fun downloadAttachment(m: Message, a: Attachment, dir: File = Paths.downloads): File = withContext(Dispatchers.IO) {
        val acc = store.account(m.accountId) ?: error("Konto fehlt")
        val f = store.folder(m.folderId) ?: error("Ordner fehlt")
        var out = File(dir, a.name.replace(Regex("[\\\\/:*?\"<>|]"), "_"))
        var n = 1
        while (out.exists()) out = File(dir, a.name.substringBeforeLast('.') + " (${n++})." + a.name.substringAfterLast('.', "bin"))
        client(acc).downloadPart(f.fullName, m.uid, a.partPath) { input -> out.outputStream().use { input.copyTo(it) } }
        out
    }

    // ------------------------------------------------------------------ Senden
    suspend fun send(accountId: Long, to: String, cc: String, bcc: String, subject: String, body: String, files: List<File>,
                     inReplyTo: String?, references: String?) = withContext(Dispatchers.IO) {
        val acc = store.account(accountId) ?: error(tr("Konto fehlt"))
        val c = client(acc)
        val atts = files.map { OutgoingAttachment(it.name, java.nio.file.Files.probeContentType(it.toPath()) ?: "application/octet-stream", it.readBytes()) }
        val msg = c.buildMessage(to, cc, bcc, subject, body, atts, inReplyTo, references)
        c.send(msg, store.folderByRole(acc.id, FolderRole.SENT)?.fullName)
        (parse(to) + parse(cc) + parse(bcc)).forEach { (addr, name) -> store.touchContact(addr, name, true) }
        store.changed()
    }

    companion object {
        fun parse(s: String): List<Pair<String, String>> = runCatching {
            InternetAddress.parse(s.replace(';', ','), false).map { it.address to (it.personal ?: "") }
        }.getOrDefault(emptyList())
    }
}
