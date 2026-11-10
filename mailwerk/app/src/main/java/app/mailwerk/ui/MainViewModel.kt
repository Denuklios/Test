package app.mailwerk.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.mailwerk.data.Account
import app.mailwerk.data.Category
import app.mailwerk.data.Folder
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Message
import app.mailwerk.data.OutboxItem
import app.mailwerk.data.OutboxStatus
import app.mailwerk.data.Repository
import app.mailwerk.data.ThreadSummary
import app.mailwerk.sync.Scheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

sealed interface Mailbox {
    val title: String
    data object Unified : Mailbox { override val title = "Alle Posteingänge" }
    data object Pinned : Mailbox { override val title = "Angeheftet" }
    data object Flagged : Mailbox { override val title = "Markiert" }
    data object Snoozed : Mailbox { override val title = "Zurückgestellt" }
    data class InFolder(val folder: Folder, val accountEmail: String) : Mailbox { override val title = folder.displayName }
}

data class ComposeInit(
    val accountId: Long? = null,
    val to: String = "",
    val cc: String = "",
    val bcc: String = "",
    val subject: String = "",
    val body: String = "",
    val inReplyTo: String? = null,
    val references: String? = null,
    val outboxId: Long = 0,
    val attachments: List<String> = emptyList(),
)

sealed interface Screen {
    data object Inbox : Screen
    data class Thread(val threadKey: String) : Screen
    data class Compose(val init: ComposeInit) : Screen
    data class AccountSetup(val editId: Long? = null) : Screen
    data object Settings : Screen
    data object Outbox : Screen
    data object Templates : Screen
}

data class Snack(val text: String, val actionLabel: String? = null, val action: (() -> Unit)? = null)

@OptIn(FlowPreview::class)
class MainViewModel(app: Application) : AndroidViewModel(app) {
    val repo = Repository.get(app)
    val db = repo.db
    val prefs = repo.prefs

    private val _stack = MutableStateFlow<List<Screen>>(listOf(Screen.Inbox))
    val stack: StateFlow<List<Screen>> = _stack
    fun push(s: Screen) { _stack.value = _stack.value + s }
    fun pop(): Boolean { if (_stack.value.size <= 1) return false; _stack.value = _stack.value.dropLast(1); return true }
    fun replaceTop(s: Screen) { _stack.value = _stack.value.dropLast(1) + s }

    val mailbox = MutableStateFlow<Mailbox>(Mailbox.Unified)
    /** null = alle Kategorien */
    val category = MutableStateFlow<Category?>(if (prefs.smartInbox) Category.PEOPLE else null)
    val query = MutableStateFlow("")
    val syncing = MutableStateFlow(false)
    val settingsVersion = MutableStateFlow(0)

    private val _snacks = MutableSharedFlow<Snack>(extraBufferCapacity = 8)
    val snacks: SharedFlow<Snack> = _snacks
    fun snack(text: String, actionLabel: String? = null, action: (() -> Unit)? = null) { _snacks.tryEmit(Snack(text, actionLabel, action)) }

    val accounts: StateFlow<List<Account>> = db.changes.map { db.accounts() }.flowOn(Dispatchers.IO)
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val folders: StateFlow<Map<Long, List<Folder>>> = db.changes.map { db.accounts().associate { it.id to db.folders(it.id) } }
        .flowOn(Dispatchers.IO).stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    val showsCategories: Boolean get() = prefs.smartInbox && mailbox.value.let { it is Mailbox.Unified || (it is Mailbox.InFolder && it.folder.role == FolderRole.INBOX) }

    val threads: StateFlow<List<ThreadSummary>> = combine(db.changes, mailbox, category, query.debounce(200), settingsVersion) { _, mb, cat, q, _ ->
        loadThreads(mb, cat, q)
    }.flowOn(Dispatchers.IO).stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val unreadCounts: StateFlow<Map<Category, Int>> = combine(db.changes, mailbox) { _, mb ->
        when (mb) {
            is Mailbox.Unified -> db.unreadCounts(null)
            is Mailbox.InFolder -> db.unreadCounts(listOf(mb.folder.id))
            else -> emptyMap()
        }
    }.flowOn(Dispatchers.IO).stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    private fun loadThreads(mb: Mailbox, cat: Category?, q: String): List<ThreadSummary> {
        val useCat = if (prefs.smartInbox && q.isBlank() && (mb is Mailbox.Unified || (mb is Mailbox.InFolder && mb.folder.role == FolderRole.INBOX))) cat else null
        val msgs = if (q.isNotBlank() && mb is Mailbox.Unified) db.search(q) else when (mb) {
            Mailbox.Unified -> db.listMessages(null, useCat, null)
            Mailbox.Pinned -> db.listMessages(null, null, q, onlyPinned = true)
            Mailbox.Flagged -> db.listMessages(null, null, q, onlyFlagged = true)
            Mailbox.Snoozed -> db.listMessages(null, null, q, onlySnoozed = true)
            is Mailbox.InFolder -> db.listMessages(listOf(mb.folder.id), useCat, q)
        }
        val grouped = if (prefs.groupThreads) msgs.groupBy { it.threadKey }.values.map { list ->
            ThreadSummary(list.first(), list.size, list.any { !it.seen }, list.any { it.pinned }, list.any { it.flagged }, list.any { it.hasAttachments })
        } else msgs.map { ThreadSummary(it, 1, !it.seen, it.pinned, it.flagged, it.hasAttachments) }
        // Angeheftete nach oben (wie Spark „Pins“)
        return grouped.sortedWith(compareByDescending<ThreadSummary> { it.pinned }.thenByDescending { it.latest.date })
    }

    init {
        if (db.accounts().isEmpty()) _stack.value = listOf(Screen.Inbox, Screen.AccountSetup())
        else refresh()
    }

    fun selectMailbox(mb: Mailbox) {
        mailbox.value = mb
        if (mb is Mailbox.InFolder && mb.folder.role != FolderRole.INBOX) refresh(mb.folder.id)
    }

    fun refresh(extraFolder: Long? = (mailbox.value as? Mailbox.InFolder)?.folder?.id) {
        if (syncing.value) return
        viewModelScope.launch {
            syncing.value = true
            val errors = repo.sync(extraFolder)
            syncing.value = false
            errors.firstOrNull()?.let { snack(it) }
        }
    }

    // ------------------------------------------------------------ Aktionen
    private fun act(block: suspend () -> String?) = viewModelScope.launch { block()?.let { snack(it) } }

    fun archive(m: Message) = act {
        val r = repo.archive(m)
        if (r == null) snack("Archiviert", "Rückgängig") { act { repo.db.folderByRole(m.accountId, m.folderRole ?: FolderRole.INBOX)?.let { f -> repo.moveTo(db.message(m.id) ?: m, f) } } }
        r
    }
    fun delete(m: Message) = act {
        val r = repo.delete(m)
        if (r == null && m.folderRole != FolderRole.TRASH) snack("In den Papierkorb verschoben", "Rückgängig") {
            act { db.folder(m.folderId)?.let { f -> repo.moveTo(db.message(m.id) ?: m, f) } }
        }
        r
    }
    fun spam(m: Message) = act { repo.markSpam(m) ?: run { snack("Als Spam markiert"); null } }
    fun toggleSeen(m: Message) = act { repo.markSeen(m, !m.seen) }
    fun toggleFlag(m: Message) = act { repo.toggleFlag(m) }
    fun togglePin(m: Message) { repo.togglePin(m); snack(if (m.pinned) "Nicht mehr angeheftet" else "Angeheftet 📌") }
    fun snooze(m: Message, until: Long) {
        repo.snooze(m, until); Scheduler.scheduleTimer(getApplication(), until)
        snack("Zurückgestellt bis ${fmt(until)}", "Rückgängig") { repo.unsnooze(m) }
    }
    fun remindIfNoReply(m: Message, at: Long) {
        repo.remindIfNoReply(m, at); Scheduler.scheduleTimer(getApplication(), at)
        snack("Erinnerung am ${fmt(at)}, falls keine Antwort kommt")
    }
    fun setCategory(m: Message, c: Category) { db.setCategoryForSender(m.fromAddr, c); snack("Mails von ${m.fromAddr} landen jetzt in „${c.label}“") }
    fun block(m: Message) = act { repo.blockSender(m); snack("${m.fromAddr} blockiert"); null }
    fun moveTo(m: Message, f: Folder) = act { repo.moveTo(m, f) ?: run { snack("Verschoben nach ${f.displayName}"); null } }
    fun unsubscribe(m: Message, openUrl: (String) -> Unit) = viewModelScope.launch {
        val (ok, msg) = repo.unsubscribe(m)
        if (!ok && msg.startsWith("http")) openUrl(msg) else snack(msg)
    }
    fun markThreadSeen(key: String) = viewModelScope.launch { repo.markThreadSeen(key) }

    fun performSwipe(action: app.mailwerk.data.SwipeAction, m: Message, askSnooze: (Message) -> Unit) = when (action) {
        app.mailwerk.data.SwipeAction.ARCHIVE -> { archive(m); Unit }
        app.mailwerk.data.SwipeAction.DELETE -> { delete(m); Unit }
        app.mailwerk.data.SwipeAction.SNOOZE -> askSnooze(m)
        app.mailwerk.data.SwipeAction.READ -> { toggleSeen(m); Unit }
        app.mailwerk.data.SwipeAction.PIN -> togglePin(m)
        app.mailwerk.data.SwipeAction.NONE -> Unit
    }

    // ------------------------------------------------------------ Verfassen
    fun reply(m: Message, all: Boolean) {
        val acc = db.account(m.accountId) ?: return
        val to = m.replyTo.ifBlank { if (m.fromName.isBlank()) m.fromAddr else "${m.fromName} <${m.fromAddr}>" }
        val me = acc.email.lowercase()
        val cc = if (all) (Repository.parseAddrs(m.toAddrs) + Repository.parseAddrs(m.ccAddrs))
            .filter { it.first.lowercase() != me && it.first.lowercase() != m.fromAddr.lowercase() }
            .joinToString(", ") { if (it.second.isBlank()) it.first else "${it.second} <${it.first}>" } else ""
        val subj = if (m.subject.startsWith("Re:", true) || m.subject.startsWith("AW:", true)) m.subject else "Re: ${m.subject}"
        val actualTo = if (m.folderRole == FolderRole.SENT) m.toAddrs else to
        push(Screen.Compose(ComposeInit(acc.id, actualTo, cc, "", subj, "\n\n${signature(acc)}${quote(m)}", m.messageId, m.references)))
    }

    fun forward(m: Message) {
        val subj = if (m.subject.startsWith("Fwd:", true) || m.subject.startsWith("WG:", true)) m.subject else "WG: ${m.subject}"
        val acc = db.account(m.accountId)
        val header = "\n\n${acc?.let { signature(it) } ?: ""}---------- Weitergeleitete Nachricht ----------\n" +
            "Von: ${m.fromName} <${m.fromAddr}>\nDatum: ${fmt(m.date)}\nBetreff: ${m.subject}\nAn: ${m.toAddrs}\n\n" + (db.message(m.id)?.bodyText ?: "")
        push(Screen.Compose(ComposeInit(m.accountId, subject = subj, body = header)))
    }

    fun compose(to: String = "") {
        val acc = (mailbox.value as? Mailbox.InFolder)?.folder?.accountId?.let { db.account(it) } ?: accounts.value.firstOrNull()
        push(Screen.Compose(ComposeInit(acc?.id, to = to, body = acc?.let { signature(it) }?.takeIf { it.isNotBlank() }?.let { "\n\n$it" } ?: "")))
    }

    private fun signature(a: Account) = if (a.signature.isBlank()) "" else "-- \n${a.signature}\n"

    private fun quote(m: Message): String {
        val full = db.message(m.id)?.bodyText ?: m.snippet
        return "\nAm ${fmt(m.date)} schrieb ${m.fromName.ifBlank { m.fromAddr }}:\n" + full.lines().joinToString("\n") { "> $it" }
    }

    /**
     * Versenden mit „Rückgängig“-Fenster (Gmail) bzw. zu einem späteren Zeitpunkt (Outlook/Spark „Später senden“).
     */
    fun send(o: OutboxItem, later: Long? = null) {
        viewModelScope.launch {
            val at = later ?: (System.currentTimeMillis() + prefs.undoSeconds * 1000L)
            val id = withContext(Dispatchers.IO) { db.saveOutbox(o.copy(sendAt = at, status = OutboxStatus.SCHEDULED, error = null)) }
            Scheduler.scheduleSend(getApplication(), id, at)
            pop()
            if (later != null) snack("Wird gesendet am ${fmt(later)}")
            else if (prefs.undoSeconds > 0) snack("Wird gesendet …", "Rückgängig") { undoSend(id) }
        }
    }

    fun undoSend(id: Long) {
        Scheduler.cancelSend(getApplication(), id)
        val o = db.outboxItem(id) ?: return
        if (o.status == OutboxStatus.SENDING) { snack("Zu spät – die Nachricht ist schon unterwegs"); return }
        db.saveOutbox(o.copy(status = OutboxStatus.DRAFT))
        openOutbox(o.copy(status = OutboxStatus.DRAFT))
    }

    fun openOutbox(o: OutboxItem) {
        Scheduler.cancelSend(getApplication(), o.id)
        push(Screen.Compose(ComposeInit(o.accountId, o.to, o.cc, o.bcc, o.subject, o.body, o.inReplyTo, o.references, o.id,
            o.attachments.lines().filter { it.isNotBlank() })))
    }

    fun saveDraft(o: OutboxItem) {
        db.saveOutbox(o.copy(status = OutboxStatus.DRAFT, sendAt = System.currentTimeMillis()))
        snack("Als Entwurf gespeichert")
    }

    fun retry(o: OutboxItem) { db.saveOutbox(o.copy(status = OutboxStatus.SCHEDULED, error = null)); Scheduler.scheduleSend(getApplication(), o.id, 0) }

    companion object {
        fun fmt(t: Long): String = SimpleDateFormat("EEE, d. MMM, HH:mm", Locale.GERMAN).format(Date(t))
    }
}
