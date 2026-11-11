package app.mailwerk.data

enum class Security { SSL, STARTTLS, NONE }

/** Intelligente Posteingangs-Kategorien (wie Spark „Smart Inbox“ / Gmail-Tabs). */
enum class Category(val label: String) {
    PEOPLE("Wichtig"),
    NEWSLETTER("Newsletter"),
    NOTIFICATION("Benachrichtigungen");

    companion object {
        fun of(name: String?) = entries.firstOrNull { it.name == name } ?: PEOPLE
    }
}

data class Account(
    val id: Long = 0,
    val name: String,
    val email: String,
    val imapHost: String,
    val imapPort: Int,
    val imapSecurity: Security,
    val smtpHost: String,
    val smtpPort: Int,
    val smtpSecurity: Security,
    val username: String,
    val passwordEnc: String,
    val signature: String = "",
    val color: Int = 0,
    /** eigene Signatur für Antworten/Weiterleitungen; leer = wie [signature] */
    val replySignature: String = "",
    /** Logo-Bild für die Signatur (Datei im App-Speicher) */
    val logoPath: String? = null,
)

object FolderRole {
    const val INBOX = "inbox"
    const val SENT = "sent"
    const val ARCHIVE = "archive"
    const val TRASH = "trash"
    const val DRAFTS = "drafts"
    const val JUNK = "junk"
}

data class Folder(
    val id: Long = 0,
    val accountId: Long,
    val fullName: String,
    val displayName: String,
    val role: String?,
    val unread: Int = 0,
    val lastUid: Long = 0,
    val uidValidity: Long = 0,
)

data class Message(
    val id: Long = 0,
    val accountId: Long,
    val folderId: Long,
    val uid: Long,
    val messageId: String?,
    val threadKey: String,
    val fromName: String,
    val fromAddr: String,
    val toAddrs: String,
    val ccAddrs: String,
    val replyTo: String,
    val subject: String,
    val date: Long,
    val snippet: String,
    val bodyHtml: String?,
    val bodyText: String?,
    val seen: Boolean,
    val flagged: Boolean,
    val pinned: Boolean = false,
    val snoozedUntil: Long = 0,
    val category: Category,
    val hasAttachments: Boolean,
    val unsubscribe: String?,
    val unsubscribePost: Boolean = false,
    val inReplyTo: String?,
    val references: String?,
    val folderRole: String? = null,
    val remindIfNoReplyAt: Long = 0,
)

data class Attachment(
    val id: Long = 0,
    val messageId: Long,
    val partPath: String,
    val name: String,
    val mime: String,
    val size: Long,
    val localPath: String? = null,
)

data class Template(val id: Long = 0, val name: String, val body: String)

data class Contact(val address: String, val name: String, val sentCount: Int, val lastUsed: Long)

object OutboxStatus {
    const val DRAFT = "draft"
    const val SCHEDULED = "scheduled"
    const val SENDING = "sending"
    const val FAILED = "failed"
}

data class OutboxItem(
    val id: Long = 0,
    val accountId: Long,
    val to: String,
    val cc: String,
    val bcc: String,
    val subject: String,
    val body: String,
    val attachments: String, // durch \n getrennte content://-URIs
    val inReplyTo: String?,
    val references: String?,
    val sendAt: Long,
    val status: String,
    val error: String? = null,
    val remindIfNoReplyDays: Int = 0,
)

/** Eine Unterhaltung in der Liste: neueste Nachricht + Anzahl. */
data class ThreadSummary(
    val latest: Message,
    val count: Int,
    val unread: Boolean,
    val pinned: Boolean,
    val flagged: Boolean,
    val hasAttachments: Boolean,
)
