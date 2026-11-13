package app.mailwerk.desktop

import androidx.compose.foundation.ContextMenuArea
import androidx.compose.foundation.ContextMenuItem
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.onClick
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Forward
import androidx.compose.material.icons.automirrored.outlined.Reply
import androidx.compose.material.icons.automirrored.outlined.ReplyAll
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.AllInbox
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Drafts
import androidx.compose.material.icons.outlined.DriveFileMove
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Report
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.ZoomIn
import androidx.compose.material.icons.outlined.ZoomOut
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.VerticalDivider
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.input.pointer.isCtrlPressed
import androidx.compose.ui.input.pointer.isShiftPressed
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.mailwerk.data.Account
import app.mailwerk.data.Category
import app.mailwerk.data.Folder
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Message
import app.mailwerk.tr
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Was links ausgewählt ist */
sealed interface Box { data object Unified : Box; data class InFolder(val folder: Folder) : Box }

/** Entwurf für das Schreibfenster */
data class Draft(val accountId: Long?, val to: String = "", val cc: String = "", val subject: String = "", val body: String = "",
                 val inReplyTo: String? = null, val references: String? = null, val id: Long = System.nanoTime())

class AppState(val repo: Repo) {
    val store get() = repo.store
    var box by mutableStateOf<Box>(Box.Unified)
    var category by mutableStateOf<Category?>(Category.PEOPLE)
    var query by mutableStateOf("")
    var unreadOnly by mutableStateOf(false)
    var sort by mutableStateOf(store.setting("sort", "date"))
    /** angezeigte Mail (Lesebereich) */
    var selected by mutableStateOf<Message?>(null)
    /** markierte Mails (Mehrfachauswahl mit Strg/Umschalt) – IDs */
    var marked by mutableStateOf(setOf<Long>())
    /** aktuell sichtbare Liste (für Umschalt-Klick, Pfeiltasten, Strg+A) */
    var visible by mutableStateOf(listOf<Message>())
    var drafts by mutableStateOf(listOf<Draft>())
    var showAccount by mutableStateOf<Account?>(null)
    var addAccount by mutableStateOf(false)
    var showSettings by mutableStateOf(false)
    var moveDialog by mutableStateOf<List<Message>?>(null)
    var folderDialog by mutableStateOf<FolderEdit?>(null)
    var snack by mutableStateOf<String?>(null)
    // Spaltenbreiten und Zoom (gemerkt)
    var sidebarW by mutableFloatStateOf(store.setting("w_side", "270").toFloat())
    var listW by mutableFloatStateOf(store.setting("w_list", "440").toFloat())
    var zoom by mutableFloatStateOf(store.setting("zoom", "0").toFloat())
    var openAccounts by mutableStateOf(store.setting("open_accounts", "*").split(',').toSet())

    fun saveLayout() { store.setSetting("w_side", "$sidebarW"); store.setSetting("w_list", "$listW") }
    fun changeZoom(z: Float) { zoom = z.coerceIn(0.7f, 2.2f); store.setSetting("zoom", "$zoom") }
    fun isOpen(accountId: Long) = "*" in openAccounts || "$accountId" in openAccounts
    fun toggleOpen(accountId: Long, all: List<Long>) {
        val cur = if ("*" in openAccounts) all.map { "$it" }.toSet() else openAccounts
        openAccounts = if ("$accountId" in cur) cur - "$accountId" else cur + "$accountId"
        store.setSetting("open_accounts", openAccounts.joinToString(","))
    }

    /** Mails, auf die eine Aktion wirkt: markierte, sonst die angezeigte Unterhaltung */
    fun targets(): List<Message> = if (marked.size > 1) visible.filter { it.id in marked }
        else selected?.let { s -> store.thread(s.threadKey, s.accountId).ifEmpty { listOfNotNull(store.message(s.id)) } } ?: emptyList()

    fun select(m: Message) { selected = m; marked = setOf(m.id) }
    fun toggleMark(m: Message) { marked = if (m.id in marked) marked - m.id else marked + m.id; if (marked.size == 1) selected = visible.firstOrNull { it.id in marked } }
    fun rangeMark(m: Message) {
        val anchor = visible.indexOfFirst { it.id == selected?.id }.takeIf { it >= 0 } ?: 0
        val idx = visible.indexOfFirst { it.id == m.id }
        marked = visible.subList(minOf(anchor, idx), maxOf(anchor, idx) + 1).map { it.id }.toSet()
    }
    fun moveSelection(delta: Int) {
        if (visible.isEmpty()) return
        val i = visible.indexOfFirst { it.id == selected?.id }
        select(visible[(if (i < 0) 0 else i + delta).coerceIn(0, visible.size - 1)])
    }
    fun afterRemove() { selected = null; marked = emptySet() }

    fun compose(d: Draft) { drafts = drafts + d }
    fun newMail() { store.accounts().let { a -> val acc = (box as? Box.InFolder)?.folder?.accountId?.let { id -> a.firstOrNull { it.id == id } } ?: a.firstOrNull()
        acc?.let { compose(Draft(it.id, body = signature(it))) } } }

    fun signature(a: Account?) = a?.signature?.takeIf { it.isNotBlank() }?.let { "\n\n-- \n$it" } ?: ""

    fun reply(m: Message, all: Boolean) {
        val acc = store.account(m.accountId)
        val to = m.replyTo.ifBlank { if (m.fromName.isBlank()) m.fromAddr else "${m.fromName} <${m.fromAddr}>" }
        val me = acc?.email?.lowercase()
        val cc = if (all) (Repo.parse(m.toAddrs) + Repo.parse(m.ccAddrs)).filter { it.first.lowercase() != me && !it.first.equals(m.fromAddr, true) }
            .joinToString(", ") { if (it.second.isBlank()) it.first else "${it.second} <${it.first}>" } else ""
        val subj = if (Regex("^(re|aw):", RegexOption.IGNORE_CASE).containsMatchIn(m.subject)) m.subject else "Re: ${m.subject}"
        val full = store.message(m.id) ?: m
        compose(Draft(m.accountId, if (m.folderRole == FolderRole.SENT) m.toAddrs else to, cc, subj, signature(acc) + quote(full), m.messageId, m.references))
    }

    fun forward(m: Message) {
        val full = store.message(m.id) ?: m
        val subj = if (Regex("^(fwd|wg):", RegexOption.IGNORE_CASE).containsMatchIn(m.subject)) m.subject else tr("WG: {0}", m.subject)
        val head = "\n\n" + tr("---------- Weitergeleitete Nachricht ----------") + "\n" + tr("Von: {0} <{1}>", m.fromName, m.fromAddr) +
            "\n" + tr("Datum: {0}", fmtLong(m.date)) + "\n" + tr("Betreff: {0}", m.subject) + "\n" + tr("An: {0}", m.toAddrs) + "\n\n"
        compose(Draft(m.accountId, subject = subj, body = signature(store.account(m.accountId)) + head + (full.bodyText ?: "")))
    }

    private fun quote(m: Message) = "\n\n" + tr("Am {0} schrieb {1}:", fmtLong(m.date), m.fromName.ifBlank { m.fromAddr }) + "\n" +
        (m.bodyText ?: "").lines().take(400).joinToString("\n") { "> $it" }

    // ---- Aktionen auf die Auswahl
    suspend fun archive() { val t = targets(); t.forEach { repo.archive(it) }; afterRemove(); snack = tr("{0} archiviert", t.size) }
    suspend fun delete() { val t = targets(); t.forEach { repo.delete(it) }; afterRemove(); snack = tr("{0} gelöscht", t.size) }
    suspend fun spam() { val t = targets(); t.forEach { repo.spam(it) }; afterRemove(); snack = tr("In den Spam-Ordner verschoben") }
    suspend fun block() { val t = targets(); t.forEach { repo.blockSender(it) }; afterRemove(); snack = tr("Absender gesperrt – künftige Mails landen im Spam") }
    suspend fun setSeen(seen: Boolean) { targets().forEach { repo.setSeen(it, seen) }; if (!seen) afterRemove() }
    suspend fun toggleFlag() { val t = targets(); val v = !t.all { it.flagged }; t.forEach { repo.setFlagged(it, v) } }
    fun togglePin() { targets().forEach { repo.togglePin(it) } }
    fun categorize(c: Category) { targets().map { it.fromAddr }.distinct().forEach { store.setCategory(it, c) }; afterRemove(); snack = tr("Absender wird künftig als „{0}“ einsortiert", c.label) }
}

data class FolderEdit(val accountId: Long, val folder: Folder?, val parent: Folder?)

fun fmtShort(t: Long): String {
    val now = Calendar.getInstance(); val c = Calendar.getInstance().apply { timeInMillis = t }
    return when {
        now.get(Calendar.YEAR) == c.get(Calendar.YEAR) && now.get(Calendar.DAY_OF_YEAR) == c.get(Calendar.DAY_OF_YEAR) -> SimpleDateFormat("HH:mm").format(Date(t))
        System.currentTimeMillis() - t < 6 * 86_400_000L -> SimpleDateFormat("EE HH:mm", Locale.getDefault()).format(Date(t))
        now.get(Calendar.YEAR) == c.get(Calendar.YEAR) -> SimpleDateFormat("d. MMM", Locale.getDefault()).format(Date(t))
        else -> SimpleDateFormat("dd.MM.yyyy", Locale.getDefault()).format(Date(t))
    }
}
fun fmtLong(t: Long): String = SimpleDateFormat("EEEE, d. MMMM yyyy, HH:mm", Locale.getDefault()).format(Date(t))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Tip(text: String, content: @Composable () -> Unit) =
    TooltipBox(TooltipDefaults.rememberPlainTooltipPositionProvider(), tooltip = { PlainTooltip { Text(text) } }, state = rememberTooltipState()) { content() }

@Composable
fun ActionIcon(icon: ImageVector, text: String, enabled: Boolean = true, onClick: () -> Unit) =
    Tip(text) { IconButton(onClick = onClick, enabled = enabled) { Icon(icon, text) } }

/** Befehl mit Symbol und Beschriftung (wie im Outlook-Menüband) */
@Composable
private fun Command(icon: ImageVector, label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Column(Modifier.clip(RoundedCornerShape(10.dp)).clickable(enabled = enabled, onClick = onClick).padding(horizontal = 10.dp, vertical = 6.dp).widthIn(min = 56.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        val c = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f)
        Icon(icon, null, Modifier.size(22.dp), tint = c)
        Text(label, style = MaterialTheme.typography.labelSmall, color = c, maxLines = 1)
    }
}

@Composable
fun Avatar(name: String, addr: String, size: Int = 36) {
    val label = name.ifBlank { addr }.split(' ', '.', '@').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    val hue = (addr.lowercase().hashCode() and 0xffffff) % 360
    Box(Modifier.size(size.dp).clip(CircleShape).background(Color.hsl(hue.toFloat(), 0.55f, 0.45f)), contentAlignment = Alignment.Center) {
        Text(label, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
    }
}

/** Ziehbare Trennlinie zwischen zwei Spalten */
@Composable
private fun Splitter(onDrag: (Float) -> Unit, onDone: () -> Unit) {
    val density = LocalDensity.current
    val src = remember { MutableInteractionSource() }
    val hovered by src.collectIsHoveredAsState()
    Box(Modifier.width(7.dp).fillMaxHeight().hoverable(src)
        .pointerHoverIcon(PointerIcon(java.awt.Cursor(java.awt.Cursor.E_RESIZE_CURSOR)))
        .draggable(rememberDraggableState { px -> onDrag(with(density) { px.toDp().value }) }, Orientation.Horizontal, onDragStopped = { onDone() }),
        contentAlignment = Alignment.Center) {
        Box(Modifier.width(if (hovered) 3.dp else 1.dp).fillMaxHeight()
            .background(if (hovered) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant))
    }
}

@Composable
fun App(st: AppState) {
    val changes by st.store.changes.collectAsState()
    val syncing by st.repo.syncing.collectAsState()
    val errors by st.repo.errors.collectAsState()
    val scope = rememberCoroutineScope()
    val accounts = remember(changes) { st.store.accounts() }
    LaunchedEffect(Unit) { st.repo.sync() }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(5 * 60_000L); st.repo.sync((st.box as? Box.InFolder)?.folder?.id) } }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        if (accounts.isEmpty()) { Welcome(st); return@Surface }
        Column(Modifier.fillMaxSize()) {
            CommandBar(st, syncing)
            if (syncing) LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp)) else HorizontalDivider()
            Row(Modifier.fillMaxSize()) {
                Sidebar(st, accounts, changes)
                Splitter({ st.sidebarW = (st.sidebarW + it).coerceIn(180f, 520f) }, st::saveLayout)
                Box(Modifier.width(st.listW.dp).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceContainerLow)) { MessageList(st, changes) }
                Splitter({ st.listW = (st.listW + it).coerceIn(280f, 1100f) }, st::saveLayout)
                Box(Modifier.weight(1f).fillMaxHeight()) { Reader(st, changes) }
            }
        }
        errors.entries.firstOrNull()?.let { (accId, err) ->
            Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.BottomCenter) {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.errorContainer, shadowElevation = 4.dp) {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("Abruf fehlgeschlagen: {0}", accounts.firstOrNull { it.id == accId }?.email ?: "") + " – " + err,
                            Modifier.weight(1f, false), color = MaterialTheme.colorScheme.onErrorContainer, maxLines = 2)
                        TextButton(onClick = { scope.launch { st.repo.sync() } }) { Text(tr("Erneut")) }
                        TextButton(onClick = { st.repo.errors.value = emptyMap() }) { Text("✕") }
                    }
                }
            }
        }
        st.snack?.let { s ->
            LaunchedEffect(s) { kotlinx.coroutines.delay(3500); st.snack = null }
            Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.BottomStart) {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.inverseSurface, shadowElevation = 6.dp) {
                    Text(s, Modifier.padding(horizontal = 16.dp, vertical = 12.dp), color = MaterialTheme.colorScheme.inverseOnSurface)
                }
            }
        }
        st.moveDialog?.let { msgs -> MoveDialog(st, msgs) { st.moveDialog = null } }
        st.folderDialog?.let { fe -> FolderDialog(st, fe) { st.folderDialog = null } }
    }
}

/** Befehlsleiste oben – wie das Menüband großer Mail-Programme */
@Composable
private fun CommandBar(st: AppState, syncing: Boolean) {
    val scope = rememberCoroutineScope()
    val has = st.selected != null || st.marked.isNotEmpty()
    val single = st.marked.size <= 1 && st.selected != null
    var catMenu by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainer).padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.clip(RoundedCornerShape(14.dp)).background(Brand.gradient).clickable { st.newMail() }.padding(horizontal = 16.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Edit, null, tint = Color.White); Spacer(Modifier.width(8.dp))
                Text(tr("Neue E-Mail"), color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.width(8.dp))
        Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
            Command(Icons.AutoMirrored.Outlined.Reply, tr("Antworten"), single) { st.selected?.let { st.targets().lastOrNull()?.let { m -> st.reply(m, false) } } }
            Command(Icons.AutoMirrored.Outlined.ReplyAll, tr("Allen"), single) { st.targets().lastOrNull()?.let { st.reply(it, true) } }
            Command(Icons.AutoMirrored.Outlined.Forward, tr("Weiterleiten"), single) { st.targets().lastOrNull()?.let { st.forward(it) } }
            VerticalDivider(Modifier.height(36.dp).padding(horizontal = 4.dp))
            Command(Icons.Outlined.Archive, tr("Archivieren"), has) { scope.launch { st.archive() } }
            Command(Icons.Outlined.Delete, tr("Löschen"), has) { scope.launch { st.delete() } }
            Command(Icons.Outlined.DriveFileMove, tr("Verschieben"), has) { st.moveDialog = st.targets() }
            Command(Icons.Outlined.Report, tr("Spam"), has) { scope.launch { st.spam() } }
            Command(Icons.Outlined.Block, tr("Sperren"), has) { scope.launch { st.block() } }
            VerticalDivider(Modifier.height(36.dp).padding(horizontal = 4.dp))
            Command(Icons.Outlined.MarkEmailRead, tr("Gelesen"), has) { scope.launch { st.setSeen(true) } }
            Command(Icons.Outlined.MarkEmailUnread, tr("Ungelesen"), has) { scope.launch { st.setSeen(false) } }
            Command(Icons.Outlined.Flag, tr("Markieren"), has) { scope.launch { st.toggleFlag() } }
            Command(Icons.Outlined.PushPin, tr("Anheften"), has) { st.togglePin() }
            Box {
                Command(Icons.Outlined.AllInbox, tr("Einsortieren"), has) { catMenu = true }
                DropdownMenu(catMenu, { catMenu = false }) {
                    Category.entries.forEach { c -> DropdownMenuItem({ Text(tr("Absender immer als „{0}“", c.label)) }, { catMenu = false; st.categorize(c) }) }
                }
            }
        }
        Command(Icons.Outlined.ZoomOut, tr("Kleiner"), true) { st.changeZoom(effectiveZoom(st) - 0.1f) }
        Command(Icons.Outlined.ZoomIn, tr("Größer"), true) { st.changeZoom(effectiveZoom(st) + 0.1f) }
        Command(Icons.Outlined.Refresh, if (syncing) tr("Abruf …") else tr("Abrufen"), !syncing) { scope.launch { st.repo.sync((st.box as? Box.InFolder)?.folder?.id) } }
        Command(Icons.Outlined.Settings, tr("Einstellungen")) { st.showSettings = true }
    }
}

/** Zoom 0 = automatisch (nach Bildschirm) */
fun effectiveZoom(st: AppState): Float = if (st.zoom > 0f) st.zoom else autoZoom
/** Große Bildschirme ohne Windows-Skalierung: etwas vergrößern, damit Schrift lesbar ist */
val autoZoom: Float by lazy {
    runCatching {
        val gc = java.awt.GraphicsEnvironment.getLocalGraphicsEnvironment().defaultScreenDevice.defaultConfiguration
        val scale = gc.defaultTransform.scaleX
        val w = gc.bounds.width * scale
        if (scale < 1.2 && w >= 1800) 1.25f else 1f
    }.getOrDefault(1f)
}

@Composable
private fun Welcome(st: AppState) {
    Box(Modifier.fillMaxSize().background(Brand.gradient), contentAlignment = Alignment.Center) {
        Surface(shape = RoundedCornerShape(28.dp), shadowElevation = 12.dp) {
            Column(Modifier.padding(40.dp).width(420.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(tr("Willkommen bei Mailwerk"), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text(tr("Alle Postfächer an einem Ort. Privat, schnell, ohne Werbung."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = { st.addAccount = true }) { Text(tr("E-Mail-Konto hinzufügen")) }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Sidebar(st: AppState, accounts: List<Account>, changes: Long) {
    val scope = rememberCoroutineScope()
    Column(Modifier.width(st.sidebarW.dp).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceContainer).padding(8.dp)) {
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            val unifiedUnread = remember(changes) { st.store.unreadCounts(null).values.sum() }
            NavItem(Icons.Outlined.AllInbox, tr("Alle Posteingänge"), st.box is Box.Unified, unifiedUnread) { st.box = Box.Unified; st.afterRemove() }
            accounts.forEach { a ->
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                val open = st.isOpen(a.id)
                ContextMenuArea(items = { listOf(
                    ContextMenuItem(tr("Neuer Ordner …")) { st.folderDialog = FolderEdit(a.id, null, null) },
                    ContextMenuItem(tr("Konto bearbeiten …")) { st.showAccount = a },
                ) }) {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { st.toggleOpen(a.id, accounts.map { it.id }) }
                        .padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(10.dp).clip(CircleShape).background(Color(a.color))); Spacer(Modifier.width(8.dp))
                        Text(a.email, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(if (open) "▾" else "▸", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (open) remember(changes, a.id) { st.store.folders(a.id) }.forEach { f ->
                    val icon = when (f.role) {
                        FolderRole.INBOX -> Icons.Outlined.Inbox; FolderRole.SENT -> Icons.AutoMirrored.Outlined.Send
                        FolderRole.ARCHIVE -> Icons.Outlined.Archive; FolderRole.TRASH -> Icons.Outlined.Delete
                        FolderRole.DRAFTS -> Icons.Outlined.Drafts; FolderRole.JUNK -> Icons.Outlined.Report; else -> Icons.Outlined.Folder
                    }
                    val depth = f.fullName.count { it == '/' || it == '.' }.coerceAtMost(4).let { if (f.role != null) 0 else it }
                    ContextMenuArea(items = { buildList {
                        add(ContextMenuItem(tr("Alle als gelesen markieren")) { scope.launch { st.repo.markAllRead(f.id) } })
                        add(ContextMenuItem(tr("Neuer Unterordner …")) { st.folderDialog = FolderEdit(a.id, null, f) })
                        if (f.role == null) {
                            add(ContextMenuItem(tr("Umbenennen …")) { st.folderDialog = FolderEdit(a.id, f, null) })
                            add(ContextMenuItem(tr("Löschen")) { scope.launch { runCatching { st.repo.deleteFolder(f) }.onFailure { st.snack = app.mailwerk.mail.friendly(it) } } })
                        }
                    } }) {
                        NavItem(icon, f.displayName, (st.box as? Box.InFolder)?.folder?.id == f.id, if (f.role == FolderRole.INBOX || f.role == null) f.unread else 0, depth) {
                            st.box = Box.InFolder(f); st.afterRemove()
                            if (f.role != FolderRole.INBOX && f.role != FolderRole.SENT) scope.launch { st.repo.sync(f.id) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NavItem(icon: ImageVector, label: String, selected: Boolean, badge: Int = 0, depth: Int = 0, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 1.dp).clip(RoundedCornerShape(12.dp))
        .background(if (selected) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
        .clickable(onClick = onClick).padding(start = (12 + depth * 14).dp, end = 10.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(20.dp), tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(12.dp))
        Text(label, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = if (selected || badge > 0) FontWeight.SemiBold else FontWeight.Normal)
        if (badge > 0) Badge { Text("$badge") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MessageList(st: AppState, changes: Long) {
    val folder = (st.box as? Box.InFolder)?.folder
    val smart = folder == null || folder.role == FolderRole.INBOX
    val cat = if (smart && st.query.isBlank()) st.category else null
    val msgs by produceState(emptyList<Message>(), changes, st.box, cat, st.query, st.unreadOnly, st.sort) {
        value = withContext(Dispatchers.IO) {
            st.store.list(folder?.id, cat, st.query, unreadOnly = st.unreadOnly, sort = st.sort).groupBy { it.threadKey + "/" + it.accountId }.values.map { it.first() }
        }
    }
    LaunchedEffect(msgs) { st.visible = msgs }
    val counts = remember(changes, st.box) { st.store.unreadCounts(folder?.id) }
    var sortMenu by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(start = 16.dp, end = 6.dp, top = 10.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(folder?.displayName ?: tr("Posteingang"), Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            ActionIcon(Icons.Outlined.DoneAll, tr("Alle als gelesen markieren")) { scope.launch { st.repo.markAllRead(folder?.id) } }
            Box {
                TextButton(onClick = { sortMenu = true }) {
                    Text(when (st.sort) { "from" -> tr("Absender"); "subject" -> tr("Betreff"); "old" -> tr("Älteste zuerst"); else -> tr("Neueste zuerst") } + " ▾")
                }
                DropdownMenu(sortMenu, { sortMenu = false }) {
                    listOf("date" to tr("Neueste zuerst"), "old" to tr("Älteste zuerst"), "from" to tr("Absender"), "subject" to tr("Betreff")).forEach { (k, l) ->
                        DropdownMenuItem({ Text(l) }, { st.sort = k; st.store.setSetting("sort", k); sortMenu = false })
                    }
                }
            }
        }
        OutlinedTextField(st.query, { st.query = it }, Modifier.fillMaxWidth().padding(horizontal = 12.dp), singleLine = true,
            placeholder = { Text(tr("Suchen (Strg+E)")) }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, shape = RoundedCornerShape(14.dp))
        // Filter umbrechen statt abschneiden
        FlowRow(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (smart && st.query.isBlank()) listOf<Category?>(Category.PEOPLE, Category.NEWSLETTER, Category.NOTIFICATION, null).forEach { c ->
                val n = if (c == null) counts.values.sum() else counts[c] ?: 0
                FilterChip(st.category == c, { st.category = c; st.afterRemove() },
                    label = { Text((when (c) { null -> tr("Alle"); Category.NOTIFICATION -> tr("Hinweise"); else -> c.label }) + if (n > 0) " $n" else "", maxLines = 1) })
            }
            FilterChip(st.unreadOnly, { st.unreadOnly = !st.unreadOnly }, label = { Text(tr("Nur ungelesene")) })
        }
        if (st.marked.size > 1) Text(tr("{0} ausgewählt – Aktionen oben gelten für alle", st.marked.size), Modifier.padding(horizontal = 16.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        if (msgs.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(if (st.query.isNotBlank()) tr("Keine Treffer") else tr("Alles erledigt ✓"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val listState = rememberLazyListState()
            // ausgewählte Mail beim Blättern mit den Pfeiltasten sichtbar halten
            LaunchedEffect(st.selected?.id) {
                val i = msgs.indexOfFirst { it.id == st.selected?.id }
                if (i >= 0 && (i < listState.firstVisibleItemIndex || i > listState.firstVisibleItemIndex + listState.layoutInfo.visibleItemsInfo.size - 2)) listState.animateScrollToItem(i)
            }
            LazyColumn(Modifier.fillMaxSize(), listState) {
                itemsIndexed(msgs, key = { _, m -> m.id }) { _, m -> MailRow(st, m, m.id in st.marked || (st.marked.isEmpty() && st.selected?.id == m.id)) }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MailRow(st: AppState, m: Message, selected: Boolean) {
    val scope = rememberCoroutineScope()
    ContextMenuArea(items = {
        if (m.id !in st.marked) st.select(m)
        listOf(
            ContextMenuItem(tr("Antworten")) { st.reply(m, false) },
            ContextMenuItem(tr("Allen antworten")) { st.reply(m, true) },
            ContextMenuItem(tr("Weiterleiten")) { st.forward(m) },
            ContextMenuItem(if (m.seen) tr("Als ungelesen markieren") else tr("Als gelesen markieren")) { scope.launch { st.setSeen(!m.seen) } },
            ContextMenuItem(if (m.flagged) tr("Markierung entfernen") else tr("Markieren")) { scope.launch { st.toggleFlag() } },
            ContextMenuItem(if (m.pinned) tr("Nicht mehr anheften") else tr("Anheften")) { st.togglePin() },
            ContextMenuItem(tr("Verschieben nach …")) { st.moveDialog = st.targets() },
            ContextMenuItem(tr("Archivieren")) { scope.launch { st.archive() } },
            ContextMenuItem(tr("Löschen")) { scope.launch { st.delete() } },
            ContextMenuItem(tr("Spam")) { scope.launch { st.spam() } },
            ContextMenuItem(tr("Absender sperren")) { scope.launch { st.block() } },
            ContextMenuItem(tr("Absender immer als „{0}“", Category.PEOPLE.label)) { st.categorize(Category.PEOPLE) },
            ContextMenuItem(tr("Absender immer als „{0}“", Category.NEWSLETTER.label)) { st.categorize(Category.NEWSLETTER) },
        )
    }) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 1.dp).clip(RoundedCornerShape(10.dp))
            .background(when { selected -> MaterialTheme.colorScheme.primaryContainer; !m.seen -> MaterialTheme.colorScheme.surfaceContainerLowest; else -> Color.Transparent })
            .onClick(keyboardModifiers = { isCtrlPressed }) { st.toggleMark(m) }
            .onClick(keyboardModifiers = { isShiftPressed }) { st.rangeMark(m) }
            .onClick { st.select(m); if (!m.seen) scope.launch { st.repo.setSeen(m, true) } }
            .padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(8.dp)) { if (!m.seen) Box(Modifier.size(8.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary)) }
            Spacer(Modifier.width(6.dp))
            Avatar(m.fromName, m.fromAddr)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (m.folderRole == FolderRole.SENT) tr("an {0}", m.toAddrs) else m.fromName.ifBlank { m.fromAddr }, Modifier.weight(1f),
                        fontWeight = if (m.seen) FontWeight.Normal else FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (m.pinned) Icon(Icons.Outlined.PushPin, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.tertiary)
                    if (m.flagged) Icon(Icons.Outlined.Flag, null, Modifier.size(14.dp), tint = Color(0xFFE5484D))
                    if (m.hasAttachments) Icon(Icons.Outlined.AttachFile, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.width(4.dp))
                    Text(fmtShort(m.date), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Text(m.subject.ifBlank { tr("(kein Betreff)") }, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    fontWeight = if (m.seen) FontWeight.Normal else FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                Text(m.snippet, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun Reader(st: AppState, changes: Long) {
    if (st.marked.size > 1) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(tr("{0} Mails ausgewählt", st.marked.size), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val sel = st.selected ?: run {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(tr("Wähle links eine Mail aus"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val thread by produceState(emptyList<Message>(), sel.id, changes) {
        value = withContext(Dispatchers.IO) { st.store.thread(sel.threadKey, sel.accountId).ifEmpty { listOfNotNull(st.store.message(sel.id)) } }
    }
    val last = thread.lastOrNull() ?: return
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(last.subject.ifBlank { tr("(kein Betreff)") }, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        thread.forEach { m -> MailCard(st, m, expandedInitially = m == last || !m.seen || thread.size <= 2) }
    }
}

@Composable
private fun MailCard(st: AppState, m: Message, expandedInitially: Boolean) {
    var expanded by remember(m.id) { mutableStateOf(expandedInitially) }
    val scope = rememberCoroutineScope()
    val link = MaterialTheme.colorScheme.primary
    val body by produceState<androidx.compose.ui.text.AnnotatedString?>(null, m.id, link) {
        value = withContext(Dispatchers.Default) {
            val html = m.bodyHtml
            if (!html.isNullOrBlank()) RichText.fromHtml(html, link) else RichText.fromText(m.bodyText ?: "", link)
        }
    }
    val atts = remember(m.id) { st.store.attachments(m.id) }
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLowest,
        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(20.dp))) {
        Column(Modifier.padding(18.dp)) {
            Row(Modifier.fillMaxWidth().clickable { expanded = !expanded }, verticalAlignment = Alignment.CenterVertically) {
                Avatar(m.fromName, m.fromAddr, 40); Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    SelectionContainer { Text(m.fromName.ifBlank { m.fromAddr } + if (m.fromName.isNotBlank()) "  <${m.fromAddr}>" else "", fontWeight = FontWeight.SemiBold) }
                    Text(tr("an {0}", m.toAddrs) + if (m.ccAddrs.isNotBlank()) tr(", cc {0}", m.ccAddrs) else "", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Text(fmtLong(m.date), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ActionIcon(Icons.AutoMirrored.Outlined.Reply, tr("Antworten")) { st.reply(m, false) }
                ActionIcon(Icons.AutoMirrored.Outlined.Forward, tr("Weiterleiten")) { st.forward(m) }
            }
            if (!expanded) Text(m.snippet, Modifier.padding(top = 8.dp), maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else {
                Spacer(Modifier.height(14.dp))
                body?.let { SelectionContainer { Text(it, style = MaterialTheme.typography.bodyLarge) } } ?: Text(m.snippet, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (atts.isNotEmpty()) Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    atts.forEach { a ->
                        Row(Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable {
                            scope.launch {
                                st.snack = tr("Lade {0} …", a.name)
                                runCatching { st.repo.downloadAttachment(m, a) }
                                    .onSuccess { f -> st.snack = tr("Gespeichert in Downloads: {0}", f.name); runCatching { java.awt.Desktop.getDesktop().open(f) } }
                                    .onFailure { st.snack = tr("Download fehlgeschlagen: {0}", app.mailwerk.mail.friendly(it)) }
                            }
                        }.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.AttachFile, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
                            Text(a.name); Spacer(Modifier.width(10.dp))
                            Text(humanSize(a.size), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

/** „Verschieben nach …“: Ordner des Kontos auswählen */
@Composable
private fun MoveDialog(st: AppState, msgs: List<Message>, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    val folders = remember { msgs.map { it.accountId }.distinct().singleOrNull()?.let { st.store.folders(it) } ?: emptyList() }
    var filter by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDone, title = { Text(tr("Verschieben nach …")) },
        text = {
            Column(Modifier.width(380.dp)) {
                if (folders.isEmpty()) Text(tr("Mails aus verschiedenen Konten können nicht zusammen verschoben werden."))
                else {
                    OutlinedTextField(filter, { filter = it }, Modifier.fillMaxWidth(), singleLine = true, placeholder = { Text(tr("Ordner suchen")) })
                    Column(Modifier.padding(top = 8.dp).height(320.dp).verticalScroll(rememberScrollState())) {
                        folders.filter { it.displayName.contains(filter, true) && it.id != msgs.first().folderId }.forEach { f ->
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable {
                                scope.launch { msgs.forEach { st.repo.moveTo(it, f) }; st.afterRemove(); st.snack = tr("{0} verschoben nach {1}", msgs.size, f.displayName); onDone() }
                            }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Outlined.Folder, null, Modifier.size(18.dp)); Spacer(Modifier.width(10.dp)); Text(f.displayName)
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDone) { Text(tr("Abbrechen")) } })
}

/** Ordner anlegen oder umbenennen */
@Composable
private fun FolderDialog(st: AppState, fe: FolderEdit, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(fe.folder?.displayName ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(onDismissRequest = onDone,
        title = { Text(if (fe.folder != null) tr("Ordner umbenennen") else if (fe.parent != null) tr("Neuer Ordner in „{0}“", fe.parent.displayName) else tr("Neuer Ordner")) },
        text = {
            Column(Modifier.width(360.dp)) {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text(tr("Name")) })
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = { Button(enabled = name.isNotBlank(), onClick = {
            scope.launch {
                runCatching { if (fe.folder != null) st.repo.renameFolder(fe.folder, name.trim()) else st.repo.createFolder(fe.accountId, name.trim(), fe.parent) }
                    .onSuccess { onDone() }.onFailure { error = app.mailwerk.mail.friendly(it) }
            }
        }) { Text(tr("Speichern")) } },
        dismissButton = { TextButton(onClick = onDone) { Text(tr("Abbrechen")) } })
}

fun humanSize(b: Long): String = when {
    b >= 1_048_576 -> String.format("%.1f MB", b / 1_048_576.0)
    b >= 1024 -> "${b / 1024} KB"
    else -> "$b B"
}
