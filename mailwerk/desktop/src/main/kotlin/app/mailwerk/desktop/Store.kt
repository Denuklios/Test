package app.mailwerk.desktop

import app.mailwerk.data.Account
import app.mailwerk.data.Attachment
import app.mailwerk.data.Category
import app.mailwerk.data.Folder
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Message
import app.mailwerk.data.Security
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.security.SecureRandom
import java.sql.Connection
import java.sql.DriverManager
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Ordner für Daten: Windows %APPDATA%\Mailwerk, sonst ~/.mailwerk (für Tests: -Dmailwerk.home=…) */
object Paths {
    val home: File by lazy {
        val dir = System.getProperty("mailwerk.home")?.let(::File)
            ?: System.getenv("APPDATA")?.let { File(it, "Mailwerk") }
            ?: File(System.getProperty("user.home"), ".mailwerk")
        dir.apply { mkdirs() }
    }
    val isWindows get() = System.getProperty("os.name").lowercase().contains("win")
    val downloads: File get() = File(System.getProperty("user.home"), "Downloads").apply { mkdirs() }
}

/**
 * Passwörter verschlüsselt speichern. Windows: Datenschutz-API (DPAPI) – nur dieses Windows-Benutzerkonto kann sie lesen.
 * Andere Systeme (nur zum Testen): AES-GCM mit Schlüsseldatei im Datenordner.
 */
object Secret {
    fun protect(plain: String): String =
        if (Paths.isWindows) "dpapi:" + Base64.getEncoder().encodeToString(
            com.sun.jna.platform.win32.Crypt32Util.cryptProtectData(plain.toByteArray(Charsets.UTF_8)))
        else "aes:" + aes(Cipher.ENCRYPT_MODE, plain.toByteArray(Charsets.UTF_8))

    fun reveal(stored: String): String = when {
        stored.startsWith("dpapi:") -> String(com.sun.jna.platform.win32.Crypt32Util.cryptUnprotectData(
            Base64.getDecoder().decode(stored.removePrefix("dpapi:"))), Charsets.UTF_8)
        stored.startsWith("aes:") -> String(aesDecrypt(stored.removePrefix("aes:")), Charsets.UTF_8)
        else -> stored
    }

    private val key: ByteArray by lazy {
        val f = File(Paths.home, "key.bin")
        if (!f.exists()) {
            f.writeBytes(ByteArray(32).also { SecureRandom().nextBytes(it) })
            runCatching { f.setReadable(false, false); f.setReadable(true, true); f.setWritable(false, false); f.setWritable(true, true) }
        }
        f.readBytes()
    }

    private fun aes(mode: Int, data: ByteArray): String {
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv)) }
        return Base64.getEncoder().encodeToString(iv + c.doFinal(data))
    }

    private fun aesDecrypt(s: String): ByteArray {
        val all = Base64.getDecoder().decode(s)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, all.copyOfRange(0, 12)))
        }
        return c.doFinal(all.copyOfRange(12, all.size))
    }
}

/** Lokale Datenbank (SQLite) – Mails sind offline lesbar. */
class Store(file: File = File(Paths.home, "mailwerk.db")) {
    private val db: Connection = DriverManager.getConnection("jdbc:sqlite:${file.absolutePath}")
    private val _changes = MutableStateFlow(0L)
    val changes: StateFlow<Long> = _changes
    fun changed() { _changes.value = _changes.value + 1 }

    init {
        db.createStatement().use { s ->
            s.execute("PRAGMA journal_mode=WAL"); s.execute("PRAGMA foreign_keys=ON")
            s.execute("""CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT,
                imap_host TEXT, imap_port INTEGER, imap_sec TEXT, smtp_host TEXT, smtp_port INTEGER, smtp_sec TEXT,
                username TEXT, password TEXT, signature TEXT, color INTEGER)""")
            s.execute("""CREATE TABLE IF NOT EXISTS folders(id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                full_name TEXT, display_name TEXT, role TEXT, unread INTEGER DEFAULT 0, last_uid INTEGER DEFAULT 0, uid_validity INTEGER DEFAULT 0,
                UNIQUE(account_id, full_name))""")
            s.execute("""CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
                uid INTEGER, message_id TEXT, thread_key TEXT, from_name TEXT, from_addr TEXT, to_addrs TEXT, cc_addrs TEXT, reply_to TEXT,
                subject TEXT, date INTEGER, snippet TEXT, body_html TEXT, body_text TEXT, seen INTEGER, flagged INTEGER, pinned INTEGER DEFAULT 0,
                category TEXT, has_attachments INTEGER, unsubscribe TEXT, in_reply_to TEXT, refs TEXT, UNIQUE(folder_id, uid))""")
            s.execute("CREATE INDEX IF NOT EXISTS idx_m_folder_date ON messages(folder_id, date)")
            s.execute("CREATE INDEX IF NOT EXISTS idx_m_thread ON messages(thread_key)")
            s.execute("""CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE, part_path TEXT, name TEXT, mime TEXT, size INTEGER)""")
            s.execute("CREATE TABLE IF NOT EXISTS contacts(address TEXT PRIMARY KEY, name TEXT, sent INTEGER DEFAULT 0, last INTEGER)")
            s.execute("CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT)")
        }
    }

    // ------------------------------------------------------------------ Hilfen
    @Synchronized private fun <T> q(sql: String, vararg args: Any?, map: (ResultSet) -> T): List<T> =
        db.prepareStatement(sql).use { st -> bind(st, args); st.executeQuery().use { rs -> buildList { while (rs.next()) add(map(rs)) } } }
    @Synchronized private fun x(sql: String, vararg args: Any?): Int = db.prepareStatement(sql).use { st -> bind(st, args); st.executeUpdate() }
    @Synchronized private fun insert(sql: String, vararg args: Any?): Long =
        db.prepareStatement(sql, java.sql.Statement.RETURN_GENERATED_KEYS).use { st ->
            bind(st, args); st.executeUpdate(); st.generatedKeys.use { if (it.next()) it.getLong(1) else -1 }
        }
    private fun bind(st: PreparedStatement, args: Array<out Any?>) = args.forEachIndexed { i, a ->
        when (a) {
            null -> st.setObject(i + 1, null); is Boolean -> st.setInt(i + 1, if (a) 1 else 0)
            is Int -> st.setInt(i + 1, a); is Long -> st.setLong(i + 1, a); else -> st.setString(i + 1, a.toString())
        }
    }
    @Synchronized fun <T> tx(block: () -> T): T {
        db.autoCommit = false
        try { return block().also { db.commit() } } catch (e: Exception) { db.rollback(); throw e } finally { db.autoCommit = true }
    }

    // ------------------------------------------------------------------ Einstellungen
    fun setting(key: String, default: String = ""): String = q("SELECT value FROM settings WHERE key=?", key) { it.getString(1) }.firstOrNull() ?: default
    fun setSetting(key: String, value: String) { x("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, value); changed() }

    // ------------------------------------------------------------------ Konten
    private fun ResultSet.toAccount() = Account(getLong("id"), getString("name") ?: "", getString("email") ?: "",
        getString("imap_host") ?: "", getInt("imap_port"), Security.valueOf(getString("imap_sec") ?: "SSL"),
        getString("smtp_host") ?: "", getInt("smtp_port"), Security.valueOf(getString("smtp_sec") ?: "SSL"),
        getString("username") ?: "", getString("password") ?: "", getString("signature") ?: "", getInt("color"))

    fun accounts(): List<Account> = q("SELECT * FROM accounts ORDER BY id") { it.toAccount() }
    fun account(id: Long): Account? = q("SELECT * FROM accounts WHERE id=?", id) { it.toAccount() }.firstOrNull()

    fun saveAccount(a: Account): Long {
        val id = if (a.id == 0L) insert("""INSERT INTO accounts(name,email,imap_host,imap_port,imap_sec,smtp_host,smtp_port,smtp_sec,username,password,signature,color)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""", a.name, a.email, a.imapHost, a.imapPort, a.imapSecurity.name, a.smtpHost, a.smtpPort,
            a.smtpSecurity.name, a.username, a.passwordEnc, a.signature, a.color)
        else { x("""UPDATE accounts SET name=?,email=?,imap_host=?,imap_port=?,imap_sec=?,smtp_host=?,smtp_port=?,smtp_sec=?,username=?,password=?,signature=?,color=? WHERE id=?""",
            a.name, a.email, a.imapHost, a.imapPort, a.imapSecurity.name, a.smtpHost, a.smtpPort, a.smtpSecurity.name, a.username,
            a.passwordEnc, a.signature, a.color, a.id); a.id }
        changed(); return id
    }
    fun deleteAccount(id: Long) { x("DELETE FROM accounts WHERE id=?", id); changed() }

    // ------------------------------------------------------------------ Ordner
    private fun ResultSet.toFolder() = Folder(getLong("id"), getLong("account_id"), getString("full_name"), getString("display_name"),
        getString("role"), getInt("unread"), getLong("last_uid"), getLong("uid_validity"))

    fun folders(accountId: Long): List<Folder> = q("""SELECT f.*, (SELECT COUNT(*) FROM messages m WHERE m.folder_id=f.id AND m.seen=0) AS unread
        FROM folders f WHERE account_id=? ORDER BY CASE role WHEN 'inbox' THEN 0 WHEN 'drafts' THEN 1 WHEN 'sent' THEN 2 WHEN 'archive' THEN 3
        WHEN 'junk' THEN 4 WHEN 'trash' THEN 5 ELSE 6 END, display_name COLLATE NOCASE""", accountId) { it.toFolder() }
    fun folder(id: Long): Folder? = q("SELECT * FROM folders WHERE id=?", id) { it.toFolder() }.firstOrNull()
    fun folderByRole(accountId: Long, role: String): Folder? = q("SELECT * FROM folders WHERE account_id=? AND role=?", accountId, role) { it.toFolder() }.firstOrNull()

    fun upsertFolder(accountId: Long, fullName: String, display: String, role: String?): Long {
        x("""INSERT INTO folders(account_id, full_name, display_name, role) VALUES(?,?,?,?)
            ON CONFLICT(account_id, full_name) DO UPDATE SET display_name=excluded.display_name, role=excluded.role""", accountId, fullName, display, role)
        return q("SELECT id FROM folders WHERE account_id=? AND full_name=?", accountId, fullName) { it.getLong(1) }.first()
    }
    fun removeFoldersNotIn(accountId: Long, keep: Collection<String>) {
        folders(accountId).filter { it.fullName !in keep }.forEach { x("DELETE FROM folders WHERE id=?", it.id) }
    }
    fun setFolderSync(id: Long, lastUid: Long, validity: Long) = x("UPDATE folders SET last_uid=?, uid_validity=? WHERE id=?", lastUid, validity, id)
    fun clearFolder(id: Long) = x("DELETE FROM messages WHERE folder_id=?", id)

    // ------------------------------------------------------------------ Nachrichten
    private fun ResultSet.toMessage(withBody: Boolean) = Message(
        id = getLong("id"), accountId = getLong("account_id"), folderId = getLong("folder_id"), uid = getLong("uid"),
        messageId = getString("message_id"), threadKey = getString("thread_key") ?: "", fromName = getString("from_name") ?: "",
        fromAddr = getString("from_addr") ?: "", toAddrs = getString("to_addrs") ?: "", ccAddrs = getString("cc_addrs") ?: "",
        replyTo = getString("reply_to") ?: "", subject = getString("subject") ?: "", date = getLong("date"), snippet = getString("snippet") ?: "",
        bodyHtml = if (withBody) getString("body_html") else null, bodyText = if (withBody) getString("body_text") else null,
        seen = getInt("seen") == 1, flagged = getInt("flagged") == 1, pinned = getInt("pinned") == 1,
        category = Category.of(getString("category")), hasAttachments = getInt("has_attachments") == 1, unsubscribe = getString("unsubscribe"),
        inReplyTo = getString("in_reply_to"), references = getString("refs"), folderRole = runCatching { getString("role") }.getOrNull(),
    )

    fun insertMessage(m: Message, atts: List<Attachment>): Long = tx {
        val id = insert("""INSERT OR IGNORE INTO messages(account_id,folder_id,uid,message_id,thread_key,from_name,from_addr,to_addrs,cc_addrs,reply_to,
            subject,date,snippet,body_html,body_text,seen,flagged,category,has_attachments,unsubscribe,in_reply_to,refs)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", m.accountId, m.folderId, m.uid, m.messageId, m.threadKey, m.fromName, m.fromAddr,
            m.toAddrs, m.ccAddrs, m.replyTo, m.subject, m.date, m.snippet, m.bodyHtml?.take(1_500_000), m.bodyText?.take(400_000), m.seen, m.flagged,
            m.category.name, m.hasAttachments, m.unsubscribe, m.inReplyTo, m.references)
        if (id > 0) atts.forEach { a -> insert("INSERT INTO attachments(message_id,part_path,name,mime,size) VALUES(?,?,?,?,?)", id, a.partPath, a.name, a.mime, a.size) }
        id
    }

    private val sel = "SELECT m.*, f.role FROM messages m JOIN folders f ON f.id=m.folder_id"

    /** Liste ohne Inhalte (schnell). folderId null = alle Posteingänge. */
    fun list(folderId: Long?, category: Category?, query: String, limit: Int = 800): List<Message> {
        val where = mutableListOf<String>(); val args = mutableListOf<Any?>()
        if (folderId == null) where += "f.role='inbox'" else { where += "m.folder_id=?"; args += folderId }
        if (category != null) { where += "m.category=?"; args += category.name }
        if (query.isNotBlank()) {
            where += "(m.subject LIKE ? OR m.from_name LIKE ? OR m.from_addr LIKE ? OR m.to_addrs LIKE ? OR m.body_text LIKE ?)"
            repeat(5) { args += "%${query.trim()}%" }
        }
        return q("$sel WHERE ${where.joinToString(" AND ")} ORDER BY m.pinned DESC, m.date DESC LIMIT $limit", *args.toTypedArray()) { it.toMessage(false) }
    }
    fun message(id: Long): Message? = q("$sel WHERE m.id=?", id) { it.toMessage(true) }.firstOrNull()
    fun thread(key: String, accountId: Long): List<Message> =
        q("$sel WHERE m.thread_key=? AND m.account_id=? AND f.role NOT IN ('trash','junk') ORDER BY m.date", key, accountId) { it.toMessage(true) }
    fun unreadCounts(folderId: Long?): Map<Category, Int> =
        q("SELECT m.category, COUNT(*) FROM messages m JOIN folders f ON f.id=m.folder_id WHERE ${if (folderId == null) "f.role='inbox'" else "m.folder_id=$folderId"} AND m.seen=0 GROUP BY m.category") {
            Category.of(it.getString(1)) to it.getInt(2) }.toMap()
    fun uidsInFolder(folderId: Long): Map<Long, Triple<Long, Boolean, Boolean>> =
        q("SELECT uid, id, seen, flagged FROM messages WHERE folder_id=?", folderId) { it.getLong(1) to Triple(it.getLong(2), it.getInt(3) == 1, it.getInt(4) == 1) }.toMap()

    fun setFlags(id: Long, seen: Boolean? = null, flagged: Boolean? = null, pinned: Boolean? = null) {
        seen?.let { x("UPDATE messages SET seen=? WHERE id=?", it, id) }
        flagged?.let { x("UPDATE messages SET flagged=? WHERE id=?", it, id) }
        pinned?.let { x("UPDATE messages SET pinned=? WHERE id=?", it, id) }
        changed()
    }
    fun deleteMessage(id: Long) = x("DELETE FROM messages WHERE id=?", id)
    fun setCategory(fromAddr: String, cat: Category) { x("UPDATE messages SET category=? WHERE from_addr=?", cat.name, fromAddr); setSetting("sender:" + fromAddr.lowercase(), cat.name) }
    fun senderRule(fromAddr: String): Category? = setting("sender:" + fromAddr.lowercase()).takeIf { it.isNotEmpty() }?.let { Category.of(it) }

    fun attachments(messageId: Long): List<Attachment> = q("SELECT * FROM attachments WHERE message_id=?", messageId) {
        Attachment(it.getLong("id"), it.getLong("message_id"), it.getString("part_path"), it.getString("name"), it.getString("mime"), it.getLong("size")) }

    // ------------------------------------------------------------------ Kontakte (Vorschläge beim Schreiben)
    fun touchContact(address: String, name: String, sent: Boolean) {
        if (!address.contains('@')) return
        x("""INSERT INTO contacts(address,name,sent,last) VALUES(?,?,?,?) ON CONFLICT(address) DO UPDATE SET
            name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE contacts.name END, sent=contacts.sent+excluded.sent, last=excluded.last""",
            address.lowercase(), name, if (sent) 1 else 0, System.currentTimeMillis())
    }
    fun isKnownContact(address: String) = q("SELECT sent FROM contacts WHERE address=?", address.lowercase()) { it.getInt(1) }.firstOrNull()?.let { it > 0 } ?: false
    fun suggestContacts(prefix: String): List<Pair<String, String>> = if (prefix.length < 2) emptyList() else
        q("SELECT address, name FROM contacts WHERE address LIKE ? OR name LIKE ? ORDER BY sent DESC, last DESC LIMIT 6", "%$prefix%", "%$prefix%") { it.getString(1) to (it.getString(2) ?: "") }

    fun close() = db.close()
}

val inboxRoles = setOf(FolderRole.INBOX)
