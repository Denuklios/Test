package app.mailwerk.ui

import app.mailwerk.tr

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
import app.mailwerk.sync.Updater
import app.mailwerk.sync.PushService
import app.mailwerk.data.PresetAccounts
import app.mailwerk.BuildConfig
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
    data object Unified : Mailbox { override val title = tr("Alle Posteingänge") }
    data object Pinned : Mailbox { override val title = tr("Angeheftet") }
    data object Flagged : Mailbox { override val title = tr("Markiert") }
    data object Snoozed : Mailbox { override val title = tr("Zurückgestellt") }
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
    data class Rules(val prefill: app.mailwerk.mail.Rule? = null) : Screen
    data object Blocklist : Screen
    data object Vacation : Screen
    data object FamilyCalendar : Screen
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

    // ------------------------------------------------------------ Vorbereitete Konten & Updates
    val pendingPresets: StateFlow<List<PresetAccounts.Preset>> =
        accounts.map { PresetAccounts.pending(it) }.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val hiddenBanners = MutableStateFlow(setOf<String>())
    val update = MutableStateFlow<Updater.Info?>(null)
    /** null = kein Download; 0..1 = Fortschritt */
    val updateProgress = MutableStateFlow<Float?>(null)

    fun checkUpdate(manual: Boolean) = viewModelScope.launch {
        if (!manual && (!prefs.autoUpdateCheck || System.currentTimeMillis() - prefs.lastUpdateCheck < 3 * 3_600_000L)) return@launch
        runCatching { Updater.check(getApplication()) }
            .onSuccess { info -> update.value = info; if (manual && info == null) snack(tr("Du hast die neueste Version ({0}) ✓", BuildConfig.VERSION_NAME)) }
            .onFailure { if (manual) snack(tr("Update-Prüfung fehlgeschlagen: {0}", it.message)) }
    }

    fun installUpdate() {
        val info = update.value ?: return
        if (updateProgress.value != null) return
        viewModelScope.launch {
            updateProgress.value = 0f
            runCatching { Updater.download(getApplication(), info) { updateProgress.value = it } }
                .onSuccess { f ->
                    if (!Updater.install(getApplication(), f))
                        snack(tr("Bitte „Apps aus dieser Quelle zulassen“ einschalten und danach erneut auf Aktualisieren tippen"))
                }
                .onFailure { snack(tr("Update fehlgeschlagen: {0}", it.message)) }
            updateProgress.value = null
        }
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
            PushService.ensure(getApplication())
            errors.firstOrNull()?.let { snack(it) }
        }
    }

    // ------------------------------------------------------------ Aktionen
    private fun act(block: suspend () -> String?) = viewModelScope.launch { block()?.let { snack(it) } }

    fun archive(m: Message) = act {
        val r = repo.archive(m)
        if (r == null) snack(tr("Archiviert"), tr("Rückgängig")) { act { repo.db.folderByRole(m.accountId, m.folderRole ?: FolderRole.INBOX)?.let { f -> repo.moveTo(db.message(m.id) ?: m, f) } } }
        r
    }
    fun delete(m: Message) = act {
        val r = repo.delete(m)
        if (r == null && m.folderRole != FolderRole.TRASH) snack(tr("In den Papierkorb verschoben"), tr("Rückgängig")) {
            act { db.folder(m.folderId)?.let { f -> repo.moveTo(db.message(m.id) ?: m, f) } }
        }
        r
    }
    fun spam(m: Message) = act {
        repo.markSpam(m) ?: run {
            snack(tr("Spam – künftige Mails von {0} landen direkt im Spam-Ordner", m.fromAddr), tr("Rückgängig")) { notSpam(m) }; null
        }
    }
    fun notSpam(m: Message) = act { repo.notSpam(m) ?: run { snack(tr("Kein Spam – zurück im Posteingang")); null } }
    fun reloadAccount(id: Long) {
        if (syncing.value) { snack(tr("Abruf läuft bereits – bitte kurz warten")); return }
        viewModelScope.launch {
            syncing.value = true
            snack(tr("Mails werden neu geladen …"))
            val errors = repo.reloadAccount(id)
            syncing.value = false
            snack(errors.firstOrNull() ?: tr("Fertig – Mails neu geladen"))
        }
    }

    fun sendReadReceipt(m: Message) = act { repo.sendReadReceipt(m) ?: run { snack(tr("Lesebestätigung gesendet ✓")); null } }

    fun createFolder(accountId: Long, name: String, insideInbox: Boolean) = act {
        repo.createFolder(accountId, name, insideInbox) ?: run { snack(tr("Ordner „{0}“ angelegt", name)); null }
    }
    fun renameFolder(f: Folder, newName: String) = act {
        repo.renameFolder(f, newName) ?: run {
            (mailbox.value as? Mailbox.InFolder)?.takeIf { it.folder.id == f.id }?.let { mb ->
                db.folder(f.id)?.let { mailbox.value = mb.copy(folder = it) } }
            snack(tr("Umbenannt in „{0}“", newName)); null
        }
    }
    fun deleteFolder(f: Folder) = act {
        repo.deleteFolder(f) ?: run {
            if ((mailbox.value as? Mailbox.InFolder)?.folder?.id == f.id) mailbox.value = Mailbox.Unified
            snack(tr("Ordner „{0}“ gelöscht", f.displayName)); null
        }
    }

    fun applyRules() = viewModelScope.launch {
        snack(tr("Regeln werden angewendet …"))
        val n = repo.applyRulesToExisting()
        snack(if (n == 0) tr("Fertig – keine Mail musste verschoben werden") else tr("Fertig – {0} Mail(s) verschoben", n))
    }
    fun toggleSeen(m: Message) = act { repo.markSeen(m, !m.seen) }
    fun toggleFlag(m: Message) = act { repo.toggleFlag(m) }
    fun togglePin(m: Message) { repo.togglePin(m); snack(if (m.pinned) tr("Nicht mehr angeheftet") else tr("Angeheftet 📌")) }
    fun snooze(m: Message, until: Long) {
        repo.snooze(m, until); Scheduler.scheduleTimer(getApplication(), until)
        snack(tr("Zurückgestellt bis {0}", fmt(until)), tr("Rückgängig")) { repo.unsnooze(m) }
    }
    fun remindIfNoReply(m: Message, at: Long) {
        repo.remindIfNoReply(m, at); Scheduler.scheduleTimer(getApplication(), at)
        snack(tr("Erinnerung am {0}, falls keine Antwort kommt", fmt(at)))
    }
    fun setCategory(m: Message, c: Category) { db.setCategoryForSender(m.fromAddr, c); snack(tr("Mails von {0} landen jetzt in „{1}“", m.fromAddr, c.label)) }
    fun block(m: Message, domain: Boolean = false) = act {
        repo.blockSender(m, domain)
        val what = if (domain) tr("Alle Mails von @{0}", m.fromAddr.substringAfter('@')) else tr("Mails von {0}", m.fromAddr)
        snack(tr("{0} landen künftig direkt im Spam", what), tr("Rückgängig")) { notSpam(m) }; null
    }
    fun moveTo(m: Message, f: Folder) = act { repo.moveTo(m, f) ?: run { snack(tr("Verschoben nach {0}", f.displayName)); null } }
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
        push(Screen.Compose(ComposeInit(acc.id, actualTo, cc, "", subj, "\n\n${signature(acc, true)}${quote(m)}", m.messageId, m.references)))
    }

    fun forward(m: Message) {
        val subj = if (m.subject.startsWith("Fwd:", true) || m.subject.startsWith("WG:", true)) m.subject else tr("WG: {0}", m.subject)
        val acc = db.account(m.accountId)
        val header = tr("\n\n{0}---------- Weitergeleitete Nachricht ----------\n", acc?.let { signature(it, true) } ?: "") +
            tr("Von: {0} <{1}>\nDatum: {2}\nBetreff: {3}\nAn: {4}\n\n", m.fromName, m.fromAddr, fmt(m.date), m.subject, m.toAddrs) + (db.message(m.id)?.bodyText ?: "")
        push(Screen.Compose(ComposeInit(m.accountId, subject = subj, body = header)))
    }

    fun compose(to: String = "") {
        val acc = (mailbox.value as? Mailbox.InFolder)?.folder?.accountId?.let { db.account(it) } ?: accounts.value.firstOrNull()
        push(Screen.Compose(ComposeInit(acc?.id, to = to, body = acc?.let { signature(it, false) }?.takeIf { it.isNotBlank() }?.let { "\n\n$it" } ?: "")))
    }

    private fun signature(a: Account, reply: Boolean): String {
        val text = if (reply && a.replySignature.isNotBlank()) a.replySignature else a.signature
        val logo = if (a.logoPath != null && java.io.File(a.logoPath).exists()) "\n" + app.mailwerk.mail.TextFormat.LOGO_MARKER else ""
        return if (text.isBlank() && logo.isEmpty()) "" else "-- \n${text.trim()}$logo\n"
    }

    private fun quote(m: Message): String {
        val full = db.message(m.id)?.bodyText ?: m.snippet
        return tr("\nAm {0} schrieb {1}:\n", fmt(m.date), m.fromName.ifBlank { m.fromAddr }) + full.lines().joinToString("\n") { "> $it" }
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
            if (later != null) snack(tr("Wird gesendet am {0}", fmt(later)))
            else if (prefs.undoSeconds > 0) snack(tr("Wird gesendet …"), tr("Rückgängig")) { undoSend(id) }
        }
    }

    fun undoSend(id: Long) {
        Scheduler.cancelSend(getApplication(), id)
        val o = db.outboxItem(id) ?: return
        if (o.status == OutboxStatus.SENDING) { snack(tr("Zu spät – die Nachricht ist schon unterwegs")); return }
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
        snack(tr("Als Entwurf gespeichert"))
    }

    fun retry(o: OutboxItem) { db.saveOutbox(o.copy(status = OutboxStatus.SCHEDULED, error = null)); Scheduler.scheduleSend(getApplication(), o.id, 0) }

    companion object {
        fun fmt(t: Long): String = SimpleDateFormat(if (app.mailwerk.I18n.german()) "EEE, d. MMM, HH:mm" else "EEE, MMM d, h:mm a",
            Locale.getDefault()).format(Date(t))
    }
}
