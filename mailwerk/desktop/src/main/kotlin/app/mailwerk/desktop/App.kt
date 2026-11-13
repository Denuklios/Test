package app.mailwerk.desktop

import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.automirrored.outlined.Sort
import androidx.compose.material.icons.outlined.FilterAltOff
import androidx.compose.material.icons.outlined.FilterAlt
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.ui.unit.sp
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.rememberScrollbarAdapter
import androidx.compose.foundation.VerticalScrollbar
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

    /** Bilder aus dem Internet: immer, für vertraute Absender, oder für Kontakte, denen man schon geschrieben hat (wie Outlook) */
    fun imagesAllowed(m: Message) = store.setting("images", "contacts") == "always" || store.setting("img:" + m.fromAddr.lowercase()) == "1" ||
        (store.setting("images", "contacts") == "contacts" && store.isKnownContact(m.fromAddr))
    fun trustSender(addr: String) { store.setSetting("img:" + addr.lowercase(), "1"); snack = tr("Bilder von {0} werden künftig immer geladen", addr) }

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
    Tip(text) {
        Box(Modifier.size(32.dp).clip(RoundedCornerShape(5.dp)).clickable(enabled = enabled, onClick = onClick), contentAlignment = Alignment.Center) {
            Icon(icon, text, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (enabled) 1f else 0.35f))
        }
    }

/** Befehl: Symbol + Text nebeneinander (vereinfachtes Outlook-Menüband) */
@Composable
private fun Command(icon: ImageVector, label: String, enabled: Boolean = true, accent: Boolean = false, onClick: () -> Unit) {
    val c = when { !enabled -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.32f); accent -> MaterialTheme.colorScheme.primary; else -> MaterialTheme.colorScheme.onSurface }
    Row(Modifier.height(32.dp).clip(RoundedCornerShape(5.dp)).clickable(enabled = enabled, onClick = onClick).padding(horizontal = 9.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(17.dp), tint = if (enabled && !accent) MaterialTheme.colorScheme.primary.copy(alpha = 0.85f) else c)
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.bodyMedium, color = c, maxLines = 1)
    }
}

@Composable
private fun BarDivider() = Box(Modifier.padding(horizontal = 6.dp).width(1.dp).height(20.dp).background(MaterialTheme.colorScheme.outlineVariant))

/** Ruhige Avatare: helle Pastellfläche, dunklere Initialen (wie Outlook) */
@Composable
fun Avatar(name: String, addr: String, size: Int = 32) {
    val label = name.ifBlank { addr }.split(' ', '.', '@', '-', '_').filter { it.isNotBlank() && it.first().isLetterOrDigit() }.take(2)
        .joinToString("") { it.first().uppercase() }.ifEmpty { "?" }
    val hue = ((addr.lowercase().hashCode() and 0x7fffffff) % 12) * 30f
    val dark = LocalDark.current
    Box(Modifier.size(size.dp).clip(CircleShape).background(if (dark) Color.hsl(hue, 0.35f, 0.28f) else Color.hsl(hue, 0.55f, 0.90f)),
        contentAlignment = Alignment.Center) {
        Text(label, color = if (dark) Color.hsl(hue, 0.6f, 0.85f) else Color.hsl(hue, 0.55f, 0.32f), fontWeight = FontWeight.SemiBold,
            fontSize = (size * 0.38f).sp)
    }
}

/** Ziehbare Trennlinie zwischen zwei Spalten */
@Composable
private fun Splitter(onDrag: (Float) -> Unit, onDone: () -> Unit) {
    val density = LocalDensity.current
    val src = remember { MutableInteractionSource() }
    val hovered by src.collectIsHoveredAsState()
    Box(Modifier.width(5.dp).fillMaxHeight().hoverable(src)
        .pointerHoverIcon(PointerIcon(java.awt.Cursor(java.awt.Cursor.E_RESIZE_CURSOR)))
        .draggable(rememberDraggableState { px -> onDrag(with(density) { px.toDp().value }) }, Orientation.Horizontal, onDragStopped = { onDone() }),
        contentAlignment = Alignment.Center) {
        Box(Modifier.width(if (hovered) 2.dp else 1.dp).fillMaxHeight()
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
            CommandBar(st)
            Box(Modifier.fillMaxWidth().height(2.dp)) {
                if (syncing) LinearProgressIndicator(Modifier.fillMaxSize(), trackColor = Color.Transparent)
                else HorizontalDivider(Modifier.align(Alignment.BottomCenter), color = MaterialTheme.colorScheme.outlineVariant)
            }
            Row(Modifier.fillMaxSize()) {
                Sidebar(st, accounts, changes)
                Splitter({ st.sidebarW = (st.sidebarW + it).coerceIn(180f, 520f) }, st::saveLayout)
                Box(Modifier.width(st.listW.dp).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceContainerLow)) { MessageList(st, changes) }
                Splitter({ st.listW = (st.listW + it).coerceIn(280f, 1100f) }, st::saveLayout)
                Box(Modifier.weight(1f).fillMaxHeight().background(MaterialTheme.colorScheme.background)) { Reader(st, changes) }
            }
        }
        errors.entries.firstOrNull()?.let { (accId, err) ->
            Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.BottomCenter) {
                Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.errorContainer, shadowElevation = 8.dp) {
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("Abruf fehlgeschlagen: {0}", accounts.firstOrNull { it.id == accId }?.email ?: "") + " – " + err,
                            Modifier.weight(1f, false), color = MaterialTheme.colorScheme.onSurface, maxLines = 2, style = MaterialTheme.typography.bodyMedium)
                        TextButton(onClick = { scope.launch { st.repo.sync() } }, shape = ButtonShape) { Text(tr("Erneut")) }
                        TextButton(onClick = { st.repo.errors.value = emptyMap() }, shape = ButtonShape) { Text("✕") }
                    }
                }
            }
        }
        st.snack?.let { s ->
            LaunchedEffect(s) { kotlinx.coroutines.delay(3500); st.snack = null }
            Box(Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.BottomStart) {
                Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.inverseSurface, shadowElevation = 8.dp) {
                    Text(s, Modifier.padding(horizontal = 16.dp, vertical = 10.dp), color = MaterialTheme.colorScheme.inverseOnSurface, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        st.moveDialog?.let { msgs -> MoveDialog(st, msgs) { st.moveDialog = null } }
        st.folderDialog?.let { fe -> FolderDialog(st, fe) { st.folderDialog = null } }
    }
}

/** Befehlsleiste oben – wie das vereinfachte Menüband von Outlook */
@Composable
private fun CommandBar(st: AppState) {
    val scope = rememberCoroutineScope()
    val syncing by st.repo.syncing.collectAsState()
    val has = st.selected != null || st.marked.isNotEmpty()
    val single = st.marked.size <= 1 && st.selected != null
    var catMenu by remember { mutableStateOf(false) }
    var more by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainer).padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically) {
        // Hauptbefehl: schlicht in Akzentfarbe, kleine Rundung
        Row(Modifier.height(32.dp).clip(ButtonShape).background(MaterialTheme.colorScheme.primary).clickable { st.newMail() }.padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Edit, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onPrimary); Spacer(Modifier.width(8.dp))
            Text(tr("Neue E-Mail"), color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelLarge)
        }
        Spacer(Modifier.width(10.dp))
        Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
            Command(Icons.Outlined.Delete, tr("Löschen"), has) { scope.launch { st.delete() } }
            Command(Icons.Outlined.Archive, tr("Archivieren"), has) { scope.launch { st.archive() } }
            Command(Icons.Outlined.DriveFileMove, tr("Verschieben"), has) { st.moveDialog = st.targets() }
            Command(Icons.Outlined.Report, tr("Spam"), has) { scope.launch { st.spam() } }
            BarDivider()
            Command(Icons.AutoMirrored.Outlined.Reply, tr("Antworten"), single) { st.targets().lastOrNull()?.let { st.reply(it, false) } }
            Command(Icons.AutoMirrored.Outlined.ReplyAll, tr("Allen antworten"), single) { st.targets().lastOrNull()?.let { st.reply(it, true) } }
            Command(Icons.AutoMirrored.Outlined.Forward, tr("Weiterleiten"), single) { st.targets().lastOrNull()?.let { st.forward(it) } }
            BarDivider()
            Command(Icons.Outlined.MarkEmailRead, tr("Gelesen"), has) { scope.launch { st.setSeen(true) } }
            Command(Icons.Outlined.MarkEmailUnread, tr("Ungelesen"), has) { scope.launch { st.setSeen(false) } }
            Command(Icons.Outlined.Flag, tr("Markieren"), has) { scope.launch { st.toggleFlag() } }
            Box {
                Command(Icons.Outlined.MoreHoriz, tr("Mehr"), has) { more = true }
                DropdownMenu(more, { more = false }) {
                    DropdownMenuItem({ Text(tr("Anheften / lösen")) }, { more = false; st.togglePin() }, leadingIcon = { Icon(Icons.Outlined.PushPin, null) })
                    DropdownMenuItem({ Text(tr("Absender sperren")) }, { more = false; scope.launch { st.block() } }, leadingIcon = { Icon(Icons.Outlined.Block, null) })
                    HorizontalDivider()
                    Category.entries.forEach { c -> DropdownMenuItem({ Text(tr("Absender immer als „{0}“", c.label)) }, { more = false; st.categorize(c) },
                        leadingIcon = { Icon(Icons.Outlined.AllInbox, null) }) }
                }
            }
        }
        ActionIcon(Icons.Outlined.Refresh, if (syncing) tr("Abruf …") else tr("Abrufen (F5)"), !syncing) { scope.launch { st.repo.sync((st.box as? Box.InFolder)?.folder?.id) } }
        ActionIcon(Icons.Outlined.ZoomOut, tr("Kleiner (Strg −)")) { st.changeZoom(effectiveZoom(st) - 0.1f) }
        ActionIcon(Icons.Outlined.ZoomIn, tr("Größer (Strg +)")) { st.changeZoom(effectiveZoom(st) + 0.1f) }
        ActionIcon(Icons.Outlined.Settings, tr("Einstellungen")) { st.showSettings = true }
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
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceContainer), contentAlignment = Alignment.Center) {
        Surface(shape = RoundedCornerShape(10.dp), shadowElevation = 16.dp, color = MaterialTheme.colorScheme.surface) {
            Column(Modifier.padding(36.dp).width(420.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(Brand.gradient), contentAlignment = Alignment.Center) {
                    Icon(Icons.Outlined.Inbox, null, tint = Color.White)
                }
                Text(tr("Willkommen bei Mailwerk"), style = MaterialTheme.typography.headlineMedium)
                Text(tr("Alle Postfächer an einem Ort. Privat, schnell, ohne Werbung."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
                Button(onClick = { st.addAccount = true }, shape = ButtonShape) { Text(tr("E-Mail-Konto hinzufügen")) }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Sidebar(st: AppState, accounts: List<Account>, changes: Long) {
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    Box(Modifier.width(st.sidebarW.dp).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.fillMaxSize().verticalScroll(scroll).padding(start = 8.dp, end = 10.dp, top = 8.dp, bottom = 8.dp)) {
            val unifiedUnread = remember(changes) { st.store.unreadCounts(null).values.sum() }
            NavItem(Icons.Outlined.AllInbox, tr("Alle Posteingänge"), st.box is Box.Unified, unifiedUnread) { st.box = Box.Unified; st.afterRemove() }
            accounts.forEach { a ->
                Spacer(Modifier.height(10.dp))
                val open = st.isOpen(a.id)
                ContextMenuArea(items = { listOf(
                    ContextMenuItem(tr("Neuer Ordner …")) { st.folderDialog = FolderEdit(a.id, null, null) },
                    ContextMenuItem(tr("Konto bearbeiten …")) { st.showAccount = a },
                ) }) {
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(5.dp)).clickable { st.toggleOpen(a.id, accounts.map { it.id }) }
                        .padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(if (open) "⌄" else "›", Modifier.width(14.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(a.email, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Box(Modifier.size(8.dp).clip(CircleShape).background(Color(a.color)))
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
                        NavItem(icon, f.displayName, (st.box as? Box.InFolder)?.folder?.id == f.id,
                            if (f.role == FolderRole.INBOX || f.role == null || f.role == FolderRole.JUNK) f.unread else 0, depth + 1) {
                            st.box = Box.InFolder(f); st.afterRemove()
                            if (f.role != FolderRole.INBOX && f.role != FolderRole.SENT) scope.launch { st.repo.sync(f.id) }
                        }
                    }
                }
            }
        }
        VerticalScrollbar(rememberScrollbarAdapter(scroll), Modifier.align(Alignment.CenterEnd).fillMaxHeight().padding(vertical = 2.dp))
    }
}

/** Ordner-Eintrag: Auswahl mit Fläche + Akzentstrich links, Anzahl ungelesener in Akzentfarbe (kein rotes Badge) */
@Composable
private fun NavItem(icon: ImageVector, label: String, selected: Boolean, count: Int = 0, depth: Int = 0, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(34.dp).clip(RoundedCornerShape(5.dp))
        .background(if (selected) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
        .clickable(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(3.dp).height(16.dp).clip(RoundedCornerShape(2.dp)).background(if (selected) MaterialTheme.colorScheme.primary else Color.Transparent))
        Spacer(Modifier.width((8 + depth * 12).dp))
        Icon(icon, null, Modifier.size(17.dp), tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(10.dp))
        Text(label, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium,
            fontWeight = if (selected || count > 0) FontWeight.SemiBold else FontWeight.Normal)
        if (count > 0) Text("$count", Modifier.padding(end = 8.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
    }
}

/** Reiter mit Unterstrich (wie „Relevant / Sonstige“ in Outlook) */
@Composable
private fun TabItem(label: String, count: Int, selected: Boolean, onClick: () -> Unit) {
    Column(Modifier.clip(RoundedCornerShape(4.dp)).clickable(onClick = onClick).padding(horizontal = 8.dp).padding(top = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            if (count > 0) { Spacer(Modifier.width(5.dp)); Text("$count", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary) }
        }
        Spacer(Modifier.height(6.dp))
        Box(Modifier.width(if (selected) 28.dp else 0.dp).height(2.dp).clip(RoundedCornerShape(1.dp)).background(MaterialTheme.colorScheme.primary))
    }
}

/** Kompaktes Suchfeld (36 dp, kleine Rundung) */
@Composable
private fun SearchField(value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.height(34.dp).clip(RoundedCornerShape(5.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(5.dp)).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.Search, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(8.dp))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text(tr("Suchen (Strg+E)"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            BasicTextField(value, onChange, Modifier.fillMaxWidth().focusRequester(SearchFocus.requester), singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary))
        }
        if (value.isNotEmpty()) Text("✕", Modifier.clip(CircleShape).clickable { onChange("") }.padding(4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** für Strg+E */
object SearchFocus { val requester = FocusRequester() }

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
        SearchField(st.query, { st.query = it }, Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 10.dp))
        Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(folder?.displayName ?: tr("Posteingang"), Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            ActionIcon(Icons.Outlined.DoneAll, tr("Alle als gelesen markieren")) { scope.launch { st.repo.markAllRead(folder?.id) } }
            ActionIcon(if (st.unreadOnly) Icons.Outlined.FilterAltOff else Icons.Outlined.FilterAlt, if (st.unreadOnly) tr("Alle anzeigen") else tr("Nur ungelesene")) { st.unreadOnly = !st.unreadOnly }
            Box {
                ActionIcon(Icons.AutoMirrored.Outlined.Sort, tr("Sortieren")) { sortMenu = true }
                DropdownMenu(sortMenu, { sortMenu = false }) {
                    listOf("date" to tr("Neueste zuerst"), "old" to tr("Älteste zuerst"), "from" to tr("Absender"), "subject" to tr("Betreff")).forEach { (k, l) ->
                        DropdownMenuItem({ Text((if (st.sort == k) "✓  " else "     ") + l) }, { st.sort = k; st.store.setSetting("sort", k); sortMenu = false })
                    }
                }
            }
        }
        if (smart && st.query.isBlank()) Row(Modifier.padding(horizontal = 8.dp).horizontalScroll(rememberScrollState())) {
            listOf<Category?>(Category.PEOPLE, Category.NEWSLETTER, Category.NOTIFICATION, null).forEach { c ->
                TabItem(when (c) { null -> tr("Alle"); Category.NOTIFICATION -> tr("Hinweise"); else -> c.label },
                    if (c == null) 0 else counts[c] ?: 0, st.category == c) { st.category = c; st.afterRemove() }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        if (st.unreadOnly || st.marked.size > 1) Text(
            if (st.marked.size > 1) tr("{0} ausgewählt – Befehle oben gelten für alle", st.marked.size) else tr("Nur ungelesene"),
            Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.primaryContainer).padding(horizontal = 16.dp, vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        if (msgs.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(if (st.query.isNotBlank()) tr("Keine Treffer") else tr("Hier ist alles erledigt"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            val listState = rememberLazyListState()
            LaunchedEffect(st.selected?.id) {
                val i = msgs.indexOfFirst { it.id == st.selected?.id }
                if (i >= 0 && (i < listState.firstVisibleItemIndex || i > listState.firstVisibleItemIndex + listState.layoutInfo.visibleItemsInfo.size - 2)) listState.animateScrollToItem(i)
            }
            Box(Modifier.fillMaxSize()) {
                LazyColumn(Modifier.fillMaxSize().padding(end = 8.dp), listState) {
                    itemsIndexed(msgs, key = { _, m -> m.id }) { idx, m ->
                        val prev = msgs.getOrNull(idx - 1)
                        val group = dayGroup(m.date)
                        if (st.sort == "date" && !m.pinned && (prev == null || prev.pinned || dayGroup(prev.date) != group))
                            Text(group, Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp), style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        MailRow(st, m, m.id in st.marked || (st.marked.isEmpty() && st.selected?.id == m.id))
                    }
                }
                VerticalScrollbar(rememberScrollbarAdapter(listState), Modifier.align(Alignment.CenterEnd).fillMaxHeight().padding(vertical = 2.dp))
            }
        }
    }
}

/** Gruppen wie in Outlook: Heute, Gestern, Diese Woche, Letzte Woche, Monat */
fun dayGroup(t: Long): String {
    val now = Calendar.getInstance(); val c = Calendar.getInstance().apply { timeInMillis = t }
    val days = ((now.timeInMillis - c.timeInMillis) / 86_400_000L).toInt()
    return when {
        now.get(Calendar.YEAR) == c.get(Calendar.YEAR) && now.get(Calendar.DAY_OF_YEAR) == c.get(Calendar.DAY_OF_YEAR) -> tr("Heute")
        days <= 1 && now.get(Calendar.DAY_OF_YEAR) - c.get(Calendar.DAY_OF_YEAR) == 1 -> tr("Gestern")
        days < 7 && now.get(Calendar.WEEK_OF_YEAR) == c.get(Calendar.WEEK_OF_YEAR) -> tr("Diese Woche")
        days < 14 -> tr("Letzte Woche")
        else -> SimpleDateFormat("MMMM yyyy", Locale.getDefault()).format(Date(t))
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
        val unread = !m.seen
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)
            .background(if (selected) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
            .onClick(keyboardModifiers = { isCtrlPressed }) { st.toggleMark(m) }
            .onClick(keyboardModifiers = { isShiftPressed }) { st.rangeMark(m) }
            .onClick { st.select(m); if (!m.seen) scope.launch { st.repo.setSeen(m, true) } }
            .hoverHighlight(), verticalAlignment = Alignment.CenterVertically) {
            // ungelesen: schmaler Akzentbalken links (wie Outlook)
            Box(Modifier.width(3.dp).fillMaxHeight().background(if (unread) MaterialTheme.colorScheme.primary else Color.Transparent))
            Row(Modifier.weight(1f).padding(start = 11.dp, end = 10.dp, top = 9.dp, bottom = 9.dp), verticalAlignment = Alignment.Top) {
                Avatar(m.fromName, m.fromAddr, 32)
                Spacer(Modifier.width(11.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(if (m.folderRole == FolderRole.SENT) tr("an {0}", Repo.parse(m.toAddrs).firstOrNull()?.let { it.second.ifBlank { it.first } } ?: m.toAddrs)
                            else m.fromName.ifBlank { m.fromAddr }, Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyMedium, fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (m.hasAttachments) Icon(Icons.Outlined.AttachFile, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (m.pinned) Icon(Icons.Outlined.PushPin, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.tertiary)
                        if (m.flagged) Icon(Icons.Outlined.Flag, null, Modifier.size(14.dp), tint = Color(0xFFD13438))
                        Spacer(Modifier.width(6.dp))
                        Text(fmtShort(m.date), style = MaterialTheme.typography.labelMedium,
                            color = if (unread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(m.subject.ifBlank { tr("(kein Betreff)") }, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium,
                        color = if (unread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal)
                    Text(m.snippet, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        HorizontalDivider(Modifier.padding(start = 57.dp), color = MaterialTheme.colorScheme.outlineVariant)
    }
}

/** Hervorhebung beim Überfahren für Elemente mit eigener Klick-Logik */
@Composable
private fun Modifier.hoverHighlight(): Modifier {
    val src = remember { MutableInteractionSource() }
    val hovered by src.collectIsHoveredAsState()
    val tint = MaterialTheme.colorScheme.onSurface
    return this.hoverable(src).then(if (hovered) Modifier.background(tint.copy(alpha = 0.045f)) else Modifier)
}

@Composable
private fun Reader(st: AppState, changes: Long) {
    if (st.marked.size > 1) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Outlined.DoneAll, null, Modifier.size(40.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Text(tr("{0} Mails ausgewählt", st.marked.size), style = MaterialTheme.typography.titleLarge)
                Text(tr("Befehle oben gelten für alle"), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        return
    }
    val sel = st.selected ?: run {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Outlined.Inbox, null, Modifier.size(44.dp), tint = MaterialTheme.colorScheme.outline)
                Spacer(Modifier.height(10.dp))
                Text(tr("Wähle links eine Mail aus"), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        return
    }
    val thread by produceState(emptyList<Message>(), sel.id, changes) {
        value = withContext(Dispatchers.IO) { st.store.thread(sel.threadKey, sel.accountId).ifEmpty { listOfNotNull(st.store.message(sel.id)) } }
    }
    val last = thread.lastOrNull() ?: return
    val scroll = rememberScrollState()
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(scroll).padding(horizontal = 32.dp, vertical = 22.dp)) {
            Column(Modifier.widthIn(max = 900.dp)) {
                Text(last.subject.ifBlank { tr("(kein Betreff)") }, style = MaterialTheme.typography.headlineSmall)
                if (thread.size > 1) Text(tr("{0} Nachrichten", thread.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(14.dp))
                thread.forEachIndexed { i, m ->
                    if (i > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp), color = MaterialTheme.colorScheme.outlineVariant)
                    MailCard(st, m, expandedInitially = m == last || !m.seen || thread.size <= 2)
                }
            }
        }
        VerticalScrollbar(rememberScrollbarAdapter(scroll), Modifier.align(Alignment.CenterEnd).fillMaxHeight().padding(2.dp))
    }
}

/** Kleine Schaltfläche mit Text (Antworten, Weiterleiten …) */
@Composable
private fun SmallAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(Modifier.height(30.dp).clip(ButtonShape).border(1.dp, MaterialTheme.colorScheme.outlineVariant, ButtonShape)
        .background(MaterialTheme.colorScheme.surface).clickable(onClick = onClick).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(15.dp), tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun MailCard(st: AppState, m: Message, expandedInitially: Boolean) {
    var expanded by remember(m.id) { mutableStateOf(expandedInitially) }
    val scope = rememberCoroutineScope()
    val link = MaterialTheme.colorScheme.primary
    // HTML mit Bildern (wie Outlook): eingebettete sofort, aus dem Internet nur für vertrauenswürdige Absender oder auf Klick
    val blocks by produceState<List<HtmlView.Block>?>(null, m.id, link) {
        value = withContext(Dispatchers.Default) {
            val html = m.bodyHtml
            if (!html.isNullOrBlank()) HtmlView.parse(html, link) else listOf(HtmlView.Para(RichText.fromText(m.bodyText ?: "", link), androidx.compose.ui.text.style.TextAlign.Start))
        }
    }
    var showImages by remember(m.id) { mutableStateOf(st.imagesAllowed(m)) }
    val atts = remember(m.id) { st.store.attachments(m.id) }
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).clickable { expanded = !expanded }.padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Avatar(m.fromName, m.fromAddr, 40); Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(m.fromName.ifBlank { m.fromAddr }, style = MaterialTheme.typography.titleMedium)
                    if (m.fromName.isNotBlank()) { Spacer(Modifier.width(8.dp)); Text(m.fromAddr, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Text(tr("An: {0}", m.toAddrs) + if (m.ccAddrs.isNotBlank()) "   " + tr("Cc: {0}", m.ccAddrs) else "", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = if (expanded) 3 else 1, overflow = TextOverflow.Ellipsis)
            }
            Text(fmtLong(m.date), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (!expanded) Text(m.snippet, Modifier.padding(start = 52.dp, bottom = 4.dp), maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        else {
            Row(Modifier.padding(start = 52.dp, top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SmallAction(Icons.AutoMirrored.Outlined.Reply, tr("Antworten")) { st.reply(m, false) }
                SmallAction(Icons.AutoMirrored.Outlined.ReplyAll, tr("Allen antworten")) { st.reply(m, true) }
                SmallAction(Icons.AutoMirrored.Outlined.Forward, tr("Weiterleiten")) { st.forward(m) }
            }
            if (atts.isNotEmpty()) FlowRowAtts(st, m, atts, scope)
            Spacer(Modifier.height(16.dp))
            val bl = blocks
            if (bl != null && !showImages && HtmlView.hasRemoteImages(bl)) {
                // Leiste wie in Outlook: Bilder blockiert -> herunterladen / Absender vertrauen
                Row(Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Image, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(8.dp))
                    Text(tr("Bilder aus dem Internet wurden zum Schutz deiner Privatsphäre nicht geladen."), Modifier.weight(1f),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { showImages = true }, shape = ButtonShape) { Text(tr("Bilder herunterladen")) }
                    TextButton(onClick = { st.trustSender(m.fromAddr); showImages = true }, shape = ButtonShape) { Text(tr("Absender immer vertrauen")) }
                }
            }
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(if (LocalDark.current && showImages) Color.White else MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)).padding(horizontal = 26.dp, vertical = 22.dp)) {
                if (bl == null) Text(m.snippet, color = MaterialTheme.colorScheme.onSurfaceVariant)
                else if (LocalDark.current && showImages) MailwerkTheme(false) { HtmlBody(bl, true) } // Newsletter sind für hellen Hintergrund gestaltet
                else HtmlBody(bl, showImages)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowRowAtts(st: AppState, m: Message, atts: List<app.mailwerk.data.Attachment>, scope: kotlinx.coroutines.CoroutineScope) {
    FlowRow(Modifier.padding(start = 52.dp, top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        atts.forEach { a ->
            Row(Modifier.width(230.dp).clip(RoundedCornerShape(6.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp))
                .background(MaterialTheme.colorScheme.surface).clickable {
                    scope.launch {
                        st.snack = tr("Lade {0} …", a.name)
                        runCatching { st.repo.downloadAttachment(m, a) }
                            .onSuccess { f -> st.snack = tr("Gespeichert in Downloads: {0}", f.name); runCatching { java.awt.Desktop.getDesktop().open(f) } }
                            .onFailure { st.snack = tr("Download fehlgeschlagen: {0}", app.mailwerk.mail.friendly(it)) }
                    }
                }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(32.dp).clip(RoundedCornerShape(4.dp)).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
                    Text(a.name.substringAfterLast('.', "").take(4).uppercase().ifEmpty { "DATEI" }, style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(a.name, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(humanSize(a.size), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
        confirmButton = { Button(shape = ButtonShape, enabled = name.isNotBlank(), onClick = {
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
