package app.mailwerk.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Lokale Datenbank (Offline-Speicher aller Mails). Bewusst ohne ORM gehalten.
 * Jede Schreiboperation erhöht [changes], damit die Oberfläche neu lädt.
 */
class Db private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "mailwerk.db", null, 4) {

    private val _changes = MutableStateFlow(0L)
    val changes: StateFlow<Long> = _changes
    fun notifyChanged() { _changes.value = _changes.value + 1 }

    override fun onConfigure(db: SQLiteDatabase) { db.setForeignKeyConstraintsEnabled(true) }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""CREATE TABLE accounts(
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT,
            imap_host TEXT, imap_port INTEGER, imap_sec TEXT,
            smtp_host TEXT, smtp_port INTEGER, smtp_sec TEXT,
            username TEXT, password TEXT, signature TEXT, color INTEGER, reply_signature TEXT, logo_path TEXT)""")
        db.execSQL("""CREATE TABLE folders(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            full_name TEXT, display_name TEXT, role TEXT, unread INTEGER DEFAULT 0,
            last_uid INTEGER DEFAULT 0, uid_validity INTEGER DEFAULT 0,
            UNIQUE(account_id, full_name))""")
        db.execSQL("""CREATE TABLE messages(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
            uid INTEGER, message_id TEXT, thread_key TEXT,
            from_name TEXT, from_addr TEXT, to_addrs TEXT, cc_addrs TEXT, reply_to TEXT,
            subject TEXT, date INTEGER, snippet TEXT, body_html TEXT, body_text TEXT,
            seen INTEGER, flagged INTEGER, pinned INTEGER DEFAULT 0, snoozed_until INTEGER DEFAULT 0,
            category TEXT, has_attachments INTEGER, unsubscribe TEXT, unsubscribe_post INTEGER DEFAULT 0,
            in_reply_to TEXT, refs TEXT, remind_at INTEGER DEFAULT 0,
            UNIQUE(folder_id, uid))""")
        db.execSQL("CREATE INDEX idx_msg_thread ON messages(thread_key)")
        db.execSQL("CREATE INDEX idx_msg_date ON messages(date)")
        db.execSQL("CREATE INDEX idx_msg_from ON messages(from_addr)")
        db.execSQL("""CREATE TABLE attachments(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            part_path TEXT, name TEXT, mime TEXT, size INTEGER, local_path TEXT)""")
        db.execSQL("CREATE TABLE contacts(address TEXT PRIMARY KEY, name TEXT, sent_count INTEGER DEFAULT 0, last_used INTEGER DEFAULT 0)")
        db.execSQL("CREATE TABLE sender_rules(address TEXT PRIMARY KEY, category TEXT, blocked INTEGER DEFAULT 0)")
        db.execSQL("CREATE TABLE local_state(message_id TEXT PRIMARY KEY, pinned INTEGER, snoozed_until INTEGER, remind_at INTEGER)")
        createV4(db)
        db.execSQL("CREATE TABLE templates(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, body TEXT)")
        db.execSQL("""CREATE TABLE outbox(
            id INTEGER PRIMARY KEY AUTOINCREMENT, account_id INTEGER, to_addrs TEXT, cc TEXT, bcc TEXT,
            subject TEXT, body TEXT, attachments TEXT, in_reply_to TEXT, refs TEXT,
            send_at INTEGER, status TEXT, error TEXT, remind_days INTEGER DEFAULT 0)""")
        // Ein paar nützliche Vorlagen zum Start
        listOf(
            "Danke!" to "Vielen Dank für Ihre Nachricht! Ich melde mich in Kürze ausführlich.",
            "Erhalten" to "Hallo,\n\nich habe Ihre Nachricht erhalten und kümmere mich darum.\n\nViele Grüße",
            "Terminvorschlag" to "Hallo,\n\ngerne können wir einen Termin vereinbaren. Wie wäre es mit …?\n\nViele Grüße",
        ).forEach { (n, b) -> db.insert("templates", null, ContentValues().apply { put("name", n); put("body", b) }) }
    }

    private fun createV4(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS blocklist(pattern TEXT PRIMARY KEY, is_domain INTEGER, created INTEGER)")
        db.execSQL("""CREATE TABLE IF NOT EXISTS rules(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, enabled INTEGER, account_id INTEGER,
            field TEXT, op TEXT, value TEXT, action TEXT, arg TEXT, stop INTEGER, position INTEGER)""")
        db.execSQL("CREATE TABLE IF NOT EXISTS vacation_replied(address TEXT, account_id INTEGER, at INTEGER, PRIMARY KEY(address, account_id))")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) shrinkHugeRows(db)
        if (oldVersion < 4 && newVersion >= 4) {
            runCatching { db.execSQL("ALTER TABLE accounts ADD COLUMN reply_signature TEXT") }
            runCatching { db.execSQL("ALTER TABLE accounts ADD COLUMN logo_path TEXT") }
            createV4(db)
        }
        if (oldVersion < 3 && newVersion >= 3) {
            // Neue Dekodierung (Emojis, Breite): Mails einmal neu laden, eigene Markierungen merken
            db.execSQL("CREATE TABLE IF NOT EXISTS local_state(message_id TEXT PRIMARY KEY, pinned INTEGER, snoozed_until INTEGER, remind_at INTEGER)")
            db.execSQL("INSERT OR REPLACE INTO local_state SELECT message_id, pinned, snoozed_until, remind_at FROM messages " +
                "WHERE message_id IS NOT NULL AND (pinned=1 OR snoozed_until>0 OR remind_at>0)")
            db.execSQL("DELETE FROM messages")
            db.execSQL("UPDATE folders SET last_uid=0, uid_validity=0")
        }
    }

    /** Zu große Zeilen (> ~2 MB) kann Android nicht lesen und die App stürzt ab -> eingebettete Bilder entfernen bzw. kürzen. */
    private fun shrinkHugeRows(db: SQLiteDatabase) {
        db.execSQL("UPDATE messages SET body_html=NULL WHERE length(body_html) > $MAX_HTML")
        db.execSQL("UPDATE messages SET body_text=substr(body_text, 1, $MAX_TEXT) WHERE length(body_text) > $MAX_TEXT")
        db.execSQL("UPDATE messages SET snippet=substr(snippet, 1, 300), to_addrs=substr(to_addrs, 1, 4000), cc_addrs=substr(cc_addrs, 1, 4000), refs=substr(refs, 1, 4000) WHERE length(to_addrs) > 4000 OR length(cc_addrs) > 4000 OR length(refs) > 4000 OR length(snippet) > 300")
    }

    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        if (!db.isReadOnly) runCatching { shrinkHugeRows(db) }
    }

    // ---------------------------------------------------------------- Konten
    fun accounts(): List<Account> = readableDatabase.rawQuery("SELECT * FROM accounts ORDER BY id", null).use { c ->
        c.map { it.toAccount() }
    }

    fun account(id: Long): Account? = readableDatabase.rawQuery("SELECT * FROM accounts WHERE id=?", arrayOf("$id"), ).use { c ->
        if (c.moveToFirst()) c.toAccount() else null
    }

    fun saveAccount(a: Account): Long {
        val cv = ContentValues().apply {
            put("name", a.name); put("email", a.email)
            put("imap_host", a.imapHost); put("imap_port", a.imapPort); put("imap_sec", a.imapSecurity.name)
            put("smtp_host", a.smtpHost); put("smtp_port", a.smtpPort); put("smtp_sec", a.smtpSecurity.name)
            put("username", a.username); put("password", a.passwordEnc); put("signature", a.signature); put("color", a.color)
            put("reply_signature", a.replySignature); put("logo_path", a.logoPath)
        }
        val id = if (a.id == 0L) writableDatabase.insert("accounts", null, cv)
        else { writableDatabase.update("accounts", cv, "id=?", arrayOf("${a.id}")); a.id }
        notifyChanged(); return id
    }

    fun deleteAccount(id: Long) { writableDatabase.delete("accounts", "id=?", arrayOf("$id")); notifyChanged() }

    // ---------------------------------------------------------------- Ordner
    fun folders(accountId: Long): List<Folder> = readableDatabase.rawQuery(
        """SELECT f.*, (SELECT COUNT(*) FROM messages m WHERE m.folder_id=f.id AND m.seen=0) AS cnt
           FROM folders f WHERE account_id=? ORDER BY
           CASE role WHEN 'inbox' THEN 0 WHEN 'drafts' THEN 1 WHEN 'sent' THEN 2 WHEN 'archive' THEN 3
           WHEN 'junk' THEN 4 WHEN 'trash' THEN 5 ELSE 6 END, display_name COLLATE NOCASE""", arrayOf("$accountId")
    ).use { c -> c.map { it.toFolder() } }

    fun folder(id: Long): Folder? = readableDatabase.rawQuery("SELECT *, 0 AS cnt FROM folders WHERE id=?", arrayOf("$id")).use { c ->
        if (c.moveToFirst()) c.toFolder() else null
    }

    fun folderByRole(accountId: Long, role: String): Folder? = readableDatabase.rawQuery(
        "SELECT *, 0 AS cnt FROM folders WHERE account_id=? AND role=? LIMIT 1", arrayOf("$accountId", role)
    ).use { c -> if (c.moveToFirst()) c.toFolder() else null }

    fun upsertFolder(accountId: Long, fullName: String, display: String, role: String?): Long {
        val db = writableDatabase
        db.rawQuery("SELECT id FROM folders WHERE account_id=? AND full_name=?", arrayOf("$accountId", fullName)).use { c ->
            if (c.moveToFirst()) {
                val id = c.getLong(0)
                db.update("folders", ContentValues().apply { put("display_name", display); put("role", role) }, "id=?", arrayOf("$id"))
                return id
            }
        }
        return db.insert("folders", null, ContentValues().apply {
            put("account_id", accountId); put("full_name", fullName); put("display_name", display); put("role", role)
        })
    }

    fun removeFoldersNotIn(accountId: Long, keep: Collection<String>) {
        folders(accountId).filter { it.fullName !in keep }.forEach {
            writableDatabase.delete("folders", "id=?", arrayOf("${it.id}"))
        }
    }

    fun setFolderSyncState(folderId: Long, lastUid: Long, uidValidity: Long) {
        writableDatabase.update("folders", ContentValues().apply { put("last_uid", lastUid); put("uid_validity", uidValidity) },
            "id=?", arrayOf("$folderId"))
    }

    fun clearFolder(folderId: Long) { writableDatabase.delete("messages", "folder_id=?", arrayOf("$folderId")) }

    // ---------------------------------------------------------------- Nachrichten
    private val msgSelect = "SELECT m.*, f.role AS folder_role FROM messages m JOIN folders f ON f.id=m.folder_id"
    /** Für Listen: ohne Mail-Inhalt, damit nie riesige Zeilen geladen werden. */
    private val msgSelectLight = "SELECT m.id, m.account_id, m.folder_id, m.uid, m.message_id, m.thread_key, m.from_name, m.from_addr, " +
        "substr(m.to_addrs,1,2000) AS to_addrs, substr(m.cc_addrs,1,2000) AS cc_addrs, m.reply_to, substr(m.subject,1,1000) AS subject, m.date, " +
        "substr(m.snippet,1,300) AS snippet, NULL AS body_html, NULL AS body_text, m.seen, m.flagged, m.pinned, m.snoozed_until, m.category, " +
        "m.has_attachments, m.unsubscribe, m.unsubscribe_post, m.in_reply_to, substr(m.refs,1,2000) AS refs, m.remind_at, f.role AS folder_role " +
        "FROM messages m JOIN folders f ON f.id=m.folder_id"

    fun insertMessage(m: Message, atts: List<Attachment>): Long {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val id = db.insertWithOnConflict("messages", null, m.capped().toCv(), SQLiteDatabase.CONFLICT_IGNORE)
            if (id > 0 && m.messageId != null) db.rawQuery("SELECT pinned, snoozed_until, remind_at FROM local_state WHERE message_id=?", arrayOf(m.messageId)).use { c ->
                if (c.moveToFirst()) {
                    db.update("messages", ContentValues().apply { put("pinned", c.getInt(0)); put("snoozed_until", c.getLong(1)); put("remind_at", c.getLong(2)) },
                        "id=?", arrayOf("$id"))
                    db.delete("local_state", "message_id=?", arrayOf(m.messageId))
                }
            }
            if (id > 0) atts.forEach { a ->
                db.insert("attachments", null, ContentValues().apply {
                    put("message_id", id); put("part_path", a.partPath); put("name", a.name); put("mime", a.mime); put("size", a.size)
                })
            }
            db.setTransactionSuccessful()
            return id
        } finally { db.endTransaction() }
    }

    fun message(id: Long): Message? = readableDatabase.rawQuery("$msgSelect WHERE m.id=?", arrayOf("$id")).use { c ->
        if (c.moveToFirst()) c.toMessage() else null
    }

    fun uidsInFolder(folderId: Long, minUid: Long): Map<Long, Triple<Long, Boolean, Boolean>> =
        readableDatabase.rawQuery("SELECT uid, id, seen, flagged FROM messages WHERE folder_id=? AND uid>=?", arrayOf("$folderId", "$minUid")).use { c ->
            buildMap { while (c.moveToNext()) put(c.getLong(0), Triple(c.getLong(1), c.getInt(2) == 1, c.getInt(3) == 1)) }
        }

    fun deleteMessage(id: Long) { writableDatabase.delete("messages", "id=?", arrayOf("$id")) }

    fun updateFlags(id: Long, seen: Boolean? = null, flagged: Boolean? = null, pinned: Boolean? = null,
                    snoozedUntil: Long? = null, category: Category? = null, remindAt: Long? = null) {
        val cv = ContentValues()
        seen?.let { cv.put("seen", if (it) 1 else 0) }
        flagged?.let { cv.put("flagged", if (it) 1 else 0) }
        pinned?.let { cv.put("pinned", if (it) 1 else 0) }
        snoozedUntil?.let { cv.put("snoozed_until", it) }
        category?.let { cv.put("category", it.name) }
        remindAt?.let { cv.put("remind_at", it) }
        if (cv.size() > 0) writableDatabase.update("messages", cv, "id=?", arrayOf("$id"))
    }

    fun moveLocal(id: Long, newFolderId: Long) {
        // UID ist im Zielordner unbekannt -> negative Platzhalter-UID, wird beim nächsten Sync ersetzt
        writableDatabase.update("messages", ContentValues().apply { put("folder_id", newFolderId); put("uid", -id) }, "id=?", arrayOf("$id"))
    }

    fun setCategoryForSender(address: String, cat: Category) {
        writableDatabase.insertWithOnConflict("sender_rules", null, ContentValues().apply {
            put("address", address.lowercase()); put("category", cat.name)
        }, SQLiteDatabase.CONFLICT_REPLACE)
        writableDatabase.update("messages", ContentValues().apply { put("category", cat.name) }, "from_addr=?", arrayOf(address.lowercase()))
        notifyChanged()
    }

    fun senderRule(address: String): Category? = readableDatabase.rawQuery(
        "SELECT category FROM sender_rules WHERE address=?", arrayOf(address.lowercase())).use { c ->
        if (c.moveToFirst()) Category.of(c.getString(0)) else null
    }

    /**
     * Liste für die Oberfläche.
     * @param folderIds null = alle Posteingänge aller Konten (gemeinsamer Posteingang)
     */
    fun listMessages(
        folderIds: List<Long>?, category: Category?, query: String?,
        onlyPinned: Boolean = false, onlySnoozed: Boolean = false, onlyFlagged: Boolean = false, limit: Int = 600,
    ): List<Message> {
        val where = mutableListOf<String>(); val args = mutableListOf<String>()
        val now = System.currentTimeMillis()
        if (onlySnoozed) { where += "m.snoozed_until>?"; args += "$now" }
        else {
            where += "m.snoozed_until<=?"; args += "$now"
            if (onlyPinned) where += "m.pinned=1"
            else if (onlyFlagged) where += "m.flagged=1"
            else if (folderIds == null) where += "f.role='inbox'"
            else where += "m.folder_id IN (${folderIds.joinToString(",")})"
        }
        if (onlyPinned || onlyFlagged) where += "f.role NOT IN ('trash','junk')"
        category?.let { where += "m.category=?"; args += it.name }
        if (!query.isNullOrBlank()) {
            where += "(m.subject LIKE ? OR m.from_name LIKE ? OR m.from_addr LIKE ? OR m.to_addrs LIKE ? OR m.body_text LIKE ?)"
            val q = "%${query.trim()}%"; repeat(5) { args += q }
        }
        val sql = "$msgSelectLight WHERE ${where.joinToString(" AND ")} ORDER BY m.date DESC LIMIT $limit"
        return readableDatabase.rawQuery(sql, args.toTypedArray()).use { c -> c.map { it.toMessage(withBody = false) } }
    }

    /** Volltextsuche über alle Ordner aller Konten. */
    fun search(query: String): List<Message> {
        val q = "%${query.trim()}%"
        return readableDatabase.rawQuery(
            "$msgSelectLight WHERE (m.subject LIKE ? OR m.from_name LIKE ? OR m.from_addr LIKE ? OR m.to_addrs LIKE ? OR m.body_text LIKE ?) ORDER BY m.date DESC LIMIT 300",
            arrayOf(q, q, q, q, q)
        ).use { c -> c.map { it.toMessage(withBody = false) } }
    }

    fun unreadCounts(folderIds: List<Long>?): Map<Category, Int> {
        val now = System.currentTimeMillis()
        val cond = if (folderIds == null) "f.role='inbox'" else "m.folder_id IN (${folderIds.joinToString(",")})"
        return readableDatabase.rawQuery(
            "SELECT m.category, COUNT(*) FROM messages m JOIN folders f ON f.id=m.folder_id WHERE $cond AND m.seen=0 AND m.snoozed_until<=? GROUP BY m.category",
            arrayOf("$now")
        ).use { c -> buildMap { while (c.moveToNext()) put(Category.of(c.getString(0)), c.getInt(1)) } }
    }

    fun thread(threadKey: String): List<Message> = readableDatabase.rawQuery(
        "$msgSelect WHERE m.thread_key=? AND f.role NOT IN ('trash','junk') ORDER BY m.date ASC", arrayOf(threadKey)
    ).use { c -> c.map { it.toMessage() } }

    fun dueSnoozed(now: Long): List<Message> = readableDatabase.rawQuery(
        "$msgSelectLight WHERE m.snoozed_until>0 AND m.snoozed_until<=?", arrayOf("$now")).use { c -> c.map { it.toMessage(false) } }

    fun dueReminders(now: Long): List<Message> = readableDatabase.rawQuery(
        "$msgSelectLight WHERE m.remind_at>0 AND m.remind_at<=?", arrayOf("$now")).use { c -> c.map { it.toMessage(false) } }

    fun hasReplyInThread(threadKey: String, after: Long): Boolean = readableDatabase.rawQuery(
        "SELECT 1 FROM messages m JOIN folders f ON f.id=m.folder_id WHERE m.thread_key=? AND m.date>? AND f.role!='sent' LIMIT 1",
        arrayOf(threadKey, "$after")).use { it.moveToFirst() }

    fun messageIdExists(messageId: String): Boolean = readableDatabase.rawQuery(
        "SELECT 1 FROM messages WHERE message_id=? LIMIT 1", arrayOf(messageId)).use { it.moveToFirst() }

    fun attachments(messageId: Long): List<Attachment> = readableDatabase.rawQuery(
        "SELECT * FROM attachments WHERE message_id=?", arrayOf("$messageId")).use { c ->
        c.map { Attachment(it.long("id"), it.long("message_id"), it.str("part_path"), it.str("name"), it.str("mime"), it.long("size"), it.strOrNull("local_path")) }
    }

    fun setAttachmentPath(id: Long, path: String) {
        writableDatabase.update("attachments", ContentValues().apply { put("local_path", path) }, "id=?", arrayOf("$id"))
    }

    // ---------------------------------------------------------------- Kontakte
    fun touchContact(address: String, name: String, sent: Boolean) {
        if (address.isBlank()) return
        val a = address.lowercase()
        val db = writableDatabase
        db.execSQL("INSERT OR IGNORE INTO contacts(address, name, sent_count, last_used) VALUES(?,?,0,0)", arrayOf(a, name))
        if (name.isNotBlank()) db.execSQL("UPDATE contacts SET name=? WHERE address=? AND (name IS NULL OR name='')", arrayOf(name, a))
        if (sent) db.execSQL("UPDATE contacts SET sent_count=sent_count+1, last_used=? WHERE address=?", arrayOf(System.currentTimeMillis(), a))
    }

    fun isKnownContact(address: String): Boolean = readableDatabase.rawQuery(
        "SELECT sent_count FROM contacts WHERE address=?", arrayOf(address.lowercase())).use { it.moveToFirst() && it.getInt(0) > 0 }

    fun suggestContacts(prefix: String): List<Contact> {
        if (prefix.length < 1) return emptyList()
        val q = "%$prefix%"
        return readableDatabase.rawQuery(
            "SELECT * FROM contacts WHERE address LIKE ? OR name LIKE ? ORDER BY sent_count DESC, last_used DESC LIMIT 6", arrayOf(q, q)
        ).use { c -> c.map { Contact(it.str("address"), it.str("name"), it.int("sent_count"), it.long("last_used")) } }
    }

    // ---------------------------------------------------------------- Vorlagen
    fun templates(): List<Template> = readableDatabase.rawQuery("SELECT * FROM templates ORDER BY name", null).use { c ->
        c.map { Template(it.long("id"), it.str("name"), it.str("body")) }
    }
    fun saveTemplate(t: Template) {
        val cv = ContentValues().apply { put("name", t.name); put("body", t.body) }
        if (t.id == 0L) writableDatabase.insert("templates", null, cv) else writableDatabase.update("templates", cv, "id=?", arrayOf("${t.id}"))
        notifyChanged()
    }
    fun deleteTemplate(id: Long) { writableDatabase.delete("templates", "id=?", arrayOf("$id")); notifyChanged() }

    // ---------------------------------------------------------------- Sperrliste
    fun blocklist(): List<app.mailwerk.mail.BlockEntry> = readableDatabase.rawQuery("SELECT pattern, is_domain FROM blocklist ORDER BY pattern", null).use { c ->
        c.map { app.mailwerk.mail.BlockEntry(it.getString(0), it.getInt(1) == 1) }
    }
    fun block(pattern: String, domain: Boolean) {
        writableDatabase.insertWithOnConflict("blocklist", null, ContentValues().apply {
            put("pattern", pattern.lowercase().trim().removePrefix("@")); put("is_domain", if (domain) 1 else 0); put("created", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE); notifyChanged()
    }
    fun unblock(pattern: String) { writableDatabase.delete("blocklist", "pattern=?", arrayOf(pattern.lowercase().trim())); notifyChanged() }
    /** Gibt einen Absender frei – egal ob Adresse oder Domain gesperrt war. */
    fun unblockSender(address: String) {
        val a = address.lowercase().trim()
        writableDatabase.delete("blocklist", "pattern=? OR (is_domain=1 AND pattern=?)", arrayOf(a, a.substringAfter('@'))); notifyChanged()
    }

    // ---------------------------------------------------------------- Regeln
    fun rules(): List<app.mailwerk.mail.Rule> = readableDatabase.rawQuery("SELECT * FROM rules ORDER BY position, id", null).use { c ->
        c.map {
            app.mailwerk.mail.Rule(it.long("id"), it.str("name"), it.int("enabled") == 1,
                if (it.isNull(it.getColumnIndexOrThrow("account_id"))) null else it.long("account_id"),
                app.mailwerk.mail.RuleField.of(it.strOrNull("field")), app.mailwerk.mail.RuleOp.of(it.strOrNull("op")), it.str("value"),
                app.mailwerk.mail.RuleAction.of(it.strOrNull("action")), it.str("arg"), it.int("stop") == 1)
        }
    }
    fun saveRule(r: app.mailwerk.mail.Rule): Long {
        val cv = ContentValues().apply {
            put("name", r.name); put("enabled", if (r.enabled) 1 else 0); if (r.accountId == null) putNull("account_id") else put("account_id", r.accountId)
            put("field", r.field.name); put("op", r.op.name); put("value", r.value); put("action", r.action.name); put("arg", r.arg)
            put("stop", if (r.stop) 1 else 0)
        }
        val id = if (r.id == 0L) writableDatabase.insert("rules", null, cv.apply { put("position", System.currentTimeMillis() / 1000) })
        else { writableDatabase.update("rules", cv, "id=?", arrayOf("${r.id}")); r.id }
        notifyChanged(); return id
    }
    fun deleteRule(id: Long) { writableDatabase.delete("rules", "id=?", arrayOf("$id")); notifyChanged() }

    // ---------------------------------------------------------------- Abwesenheitsnotiz
    fun vacationReplied(address: String, accountId: Long): Boolean = readableDatabase.rawQuery(
        "SELECT 1 FROM vacation_replied WHERE address=? AND account_id=?", arrayOf(address.lowercase(), "$accountId")).use { it.moveToFirst() }
    fun markVacationReplied(address: String, accountId: Long) {
        writableDatabase.insertWithOnConflict("vacation_replied", null, ContentValues().apply {
            put("address", address.lowercase()); put("account_id", accountId); put("at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun resetVacationReplied() { writableDatabase.delete("vacation_replied", null, null) }

    // ---------------------------------------------------------------- Postausgang
    fun saveOutbox(o: OutboxItem): Long {
        val cv = ContentValues().apply {
            put("account_id", o.accountId); put("to_addrs", o.to); put("cc", o.cc); put("bcc", o.bcc)
            put("subject", o.subject); put("body", o.body); put("attachments", o.attachments)
            put("in_reply_to", o.inReplyTo); put("refs", o.references); put("send_at", o.sendAt)
            put("status", o.status); put("error", o.error); put("remind_days", o.remindIfNoReplyDays)
        }
        val id = if (o.id == 0L) writableDatabase.insert("outbox", null, cv)
        else { writableDatabase.update("outbox", cv, "id=?", arrayOf("${o.id}")); o.id }
        notifyChanged(); return id
    }
    fun outbox(): List<OutboxItem> = readableDatabase.rawQuery("SELECT * FROM outbox ORDER BY send_at", null).use { c -> c.map { it.toOutbox() } }
    fun outboxItem(id: Long): OutboxItem? = readableDatabase.rawQuery("SELECT * FROM outbox WHERE id=?", arrayOf("$id")).use { c ->
        if (c.moveToFirst()) c.toOutbox() else null
    }
    fun deleteOutbox(id: Long) { writableDatabase.delete("outbox", "id=?", arrayOf("$id")); notifyChanged() }

    // ---------------------------------------------------------------- Mapping
    private fun Message.capped(): Message {
        var html = bodyHtml
        if (html != null && html.length > MAX_HTML) {
            // erst eingebettete Bilder ersetzen, dann notfalls kürzen
            html = html.replace(Regex("data:[a-zA-Z0-9.+/-]+;base64,[A-Za-z0-9+/=\\s]{2000,}"), "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
            if (html.length > MAX_HTML) html = html.substring(0, MAX_HTML)
        }
        return copy(bodyHtml = html, bodyText = bodyText?.take(MAX_TEXT), snippet = snippet.take(300), subject = subject.take(2000),
            toAddrs = toAddrs.take(4000), ccAddrs = ccAddrs.take(4000), references = references?.take(4000), replyTo = replyTo.take(2000))
    }

    private fun Message.toCv() = ContentValues().apply {
        put("account_id", accountId); put("folder_id", folderId); put("uid", uid); put("message_id", messageId)
        put("thread_key", threadKey); put("from_name", fromName); put("from_addr", fromAddr.lowercase())
        put("to_addrs", toAddrs); put("cc_addrs", ccAddrs); put("reply_to", replyTo); put("subject", subject)
        put("date", date); put("snippet", snippet); put("body_html", bodyHtml); put("body_text", bodyText)
        put("seen", if (seen) 1 else 0); put("flagged", if (flagged) 1 else 0); put("pinned", if (pinned) 1 else 0)
        put("snoozed_until", snoozedUntil); put("category", category.name); put("has_attachments", if (hasAttachments) 1 else 0)
        put("unsubscribe", unsubscribe); put("unsubscribe_post", if (unsubscribePost) 1 else 0)
        put("in_reply_to", inReplyTo); put("refs", references); put("remind_at", remindIfNoReplyAt)
    }

    private fun Cursor.toAccount() = Account(
        long("id"), str("name"), str("email"), str("imap_host"), int("imap_port"), Security.valueOf(str("imap_sec")),
        str("smtp_host"), int("smtp_port"), Security.valueOf(str("smtp_sec")), str("username"), str("password"), str("signature"), int("color"),
        replySignature = strOrNull("reply_signature") ?: "", logoPath = strOrNull("logo_path"))

    private fun Cursor.toFolder() = Folder(long("id"), long("account_id"), str("full_name"), str("display_name"), strOrNull("role"),
        int("cnt"), long("last_uid"), long("uid_validity"))

    private fun Cursor.toMessage(withBody: Boolean = true) = Message(
        id = long("id"), accountId = long("account_id"), folderId = long("folder_id"), uid = long("uid"),
        messageId = strOrNull("message_id"), threadKey = str("thread_key"), fromName = str("from_name"), fromAddr = str("from_addr"),
        toAddrs = str("to_addrs"), ccAddrs = str("cc_addrs"), replyTo = str("reply_to"), subject = str("subject"), date = long("date"),
        snippet = str("snippet"), bodyHtml = if (withBody) strOrNull("body_html") else null,
        bodyText = if (withBody) strOrNull("body_text") else null, seen = int("seen") == 1, flagged = int("flagged") == 1,
        pinned = int("pinned") == 1, snoozedUntil = long("snoozed_until"), category = Category.of(strOrNull("category")),
        hasAttachments = int("has_attachments") == 1, unsubscribe = strOrNull("unsubscribe"), unsubscribePost = int("unsubscribe_post") == 1,
        inReplyTo = strOrNull("in_reply_to"), references = strOrNull("refs"), folderRole = strOrNull("folder_role"),
        remindIfNoReplyAt = long("remind_at"),
    )

    private fun Cursor.toOutbox() = OutboxItem(long("id"), long("account_id"), str("to_addrs"), str("cc"), str("bcc"), str("subject"),
        str("body"), str("attachments"), strOrNull("in_reply_to"), strOrNull("refs"), long("send_at"), str("status"), strOrNull("error"), int("remind_days"))

    companion object {
        const val MAX_HTML = 700_000
        const val MAX_TEXT = 200_000
        @Volatile private var inst: Db? = null
        fun get(ctx: Context): Db = inst ?: synchronized(this) { inst ?: Db(ctx.applicationContext).also { inst = it } }
    }
}

private inline fun <T> Cursor.map(f: (Cursor) -> T): List<T> = buildList { while (moveToNext()) add(f(this@map)) }
private fun Cursor.idx(n: String) = getColumnIndexOrThrow(n)
private fun Cursor.str(n: String): String = getString(idx(n)) ?: ""
private fun Cursor.strOrNull(n: String): String? = getString(idx(n))
private fun Cursor.long(n: String): Long = getLong(idx(n))
private fun Cursor.int(n: String): Int = getInt(idx(n))
