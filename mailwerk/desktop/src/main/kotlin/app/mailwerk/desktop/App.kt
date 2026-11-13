package app.mailwerk.desktop

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Drafts
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Report
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TooltipBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.PlainTooltip
import androidx.compose.material3.TooltipDefaults
import androidx.compose.material3.rememberTooltipState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
    var box by mutableStateOf<Box>(Box.Unified)
    var category by mutableStateOf<Category?>(Category.PEOPLE)
    var query by mutableStateOf("")
    var selected by mutableStateOf<Message?>(null)
    var drafts by mutableStateOf(listOf<Draft>())
    var showAccount by mutableStateOf<Account?>(null)
    var addAccount by mutableStateOf(false)
    var showSettings by mutableStateOf(false)
    var snack by mutableStateOf<String?>(null)
    val store get() = repo.store

    fun compose(d: Draft) { drafts = drafts + d }

    fun signature(a: Account?) = a?.signature?.takeIf { it.isNotBlank() }?.let { "\n\n-- \n$it" } ?: ""

    fun reply(m: Message, all: Boolean) {
        val acc = store.account(m.accountId)
        val to = m.replyTo.ifBlank { if (m.fromName.isBlank()) m.fromAddr else "${m.fromName} <${m.fromAddr}>" }
        val me = acc?.email?.lowercase()
        val cc = if (all) (Repo.parse(m.toAddrs) + Repo.parse(m.ccAddrs)).filter { it.first.lowercase() != me && !it.first.equals(m.fromAddr, true) }
            .joinToString(", ") { if (it.second.isBlank()) it.first else "${it.second} <${it.first}>" } else ""
        val subj = if (Regex("^(re|aw):", RegexOption.IGNORE_CASE).containsMatchIn(m.subject)) m.subject else "Re: ${m.subject}"
        compose(Draft(m.accountId, if (m.folderRole == FolderRole.SENT) m.toAddrs else to, cc, subj, signature(acc) + quote(m), m.messageId, m.references))
    }

    fun forward(m: Message) {
        val subj = if (Regex("^(fwd|wg):", RegexOption.IGNORE_CASE).containsMatchIn(m.subject)) m.subject else tr("WG: {0}", m.subject)
        val head = "\n\n" + tr("---------- Weitergeleitete Nachricht ----------") + "\n" + tr("Von: {0} <{1}>", m.fromName, m.fromAddr) +
            "\n" + tr("Datum: {0}", fmtLong(m.date)) + "\n" + tr("Betreff: {0}", m.subject) + "\n" + tr("An: {0}", m.toAddrs) + "\n\n"
        compose(Draft(m.accountId, subject = subj, body = signature(store.account(m.accountId)) + head + (m.bodyText ?: "")))
    }

    private fun quote(m: Message) = "\n\n" + tr("Am {0} schrieb {1}:", fmtLong(m.date), m.fromName.ifBlank { m.fromAddr }) + "\n" +
        (m.bodyText ?: "").lines().take(400).joinToString("\n") { "> $it" }
}

fun fmtShort(t: Long): String {
    val now = Calendar.getInstance(); val c = Calendar.getInstance().apply { timeInMillis = t }
    return when {
        now.get(Calendar.YEAR) == c.get(Calendar.YEAR) && now.get(Calendar.DAY_OF_YEAR) == c.get(Calendar.DAY_OF_YEAR) -> SimpleDateFormat("HH:mm").format(Date(t))
        System.currentTimeMillis() - t < 6 * 86_400_000L -> SimpleDateFormat("EE", Locale.getDefault()).format(Date(t))
        else -> SimpleDateFormat("d. MMM", Locale.getDefault()).format(Date(t))
    }
}
fun fmtLong(t: Long): String = SimpleDateFormat("EEEE, d. MMMM yyyy, HH:mm", Locale.getDefault()).format(Date(t))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Tip(text: String, content: @Composable () -> Unit) =
    TooltipBox(TooltipDefaults.rememberPlainTooltipPositionProvider(), tooltip = { PlainTooltip { Text(text) } }, state = rememberTooltipState()) { content() }

@Composable
fun ActionIcon(icon: ImageVector, text: String, onClick: () -> Unit) = Tip(text) { IconButton(onClick = onClick) { Icon(icon, text) } }

@Composable
fun Avatar(name: String, addr: String, size: Int = 36) {
    val label = name.ifBlank { addr }.split(' ', '.', '@').filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }
    val hue = (addr.lowercase().hashCode() and 0xffffff) % 360
    Box(Modifier.size(size.dp).clip(CircleShape).background(Color.hsl(hue.toFloat(), 0.55f, 0.45f)), contentAlignment = Alignment.Center) {
        Text(label, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
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
    // regelmäßig abgleichen (zusätzlich zur Sofort-Benachrichtigung)
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(5 * 60_000L); st.repo.sync((st.box as? Box.InFolder)?.folder?.id) } }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        if (accounts.isEmpty()) { Welcome(st); return@Surface }
        Row(Modifier.fillMaxSize()) {
            Sidebar(st, accounts, changes, syncing)
            Column(Modifier.width(400.dp).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceContainerLow)) {
                if (syncing) LinearProgressIndicator(Modifier.fillMaxWidth().height(2.dp)) else Spacer(Modifier.height(2.dp))
                MessageList(st, changes)
            }
            Box(Modifier.weight(1f).fillMaxHeight()) { Reader(st, changes) }
        }
        errors.entries.firstOrNull()?.let { (accId, err) ->
            Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.BottomCenter) {
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.errorContainer, shadowElevation = 4.dp) {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("Abruf fehlgeschlagen: {0}", accounts.firstOrNull { it.id == accId }?.email ?: "") + " – " + err,
                            Modifier.weight(1f, false), color = MaterialTheme.colorScheme.onErrorContainer, maxLines = 2)
                        TextButton(onClick = { scope.launch { st.repo.sync() } }) { Text(tr("Erneut")) }
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
    }
}

@Composable
private fun Welcome(st: AppState) {
    Box(Modifier.fillMaxSize().background(Brand.gradient), contentAlignment = Alignment.Center) {
        Surface(shape = RoundedCornerShape(28.dp), shadowElevation = 12.dp) {
            Column(Modifier.padding(40.dp).width(420.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(tr("Willkommen bei Mailwerk"), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text(tr("Alle Postfächer an einem Ort. Privat, schnell, ohne Werbung."), color = MaterialTheme.colorScheme.onSurfaceVariant)
                androidx.compose.material3.Button(onClick = { st.addAccount = true }) { Text(tr("E-Mail-Konto hinzufügen")) }
            }
        }
    }
}

@Composable
private fun Sidebar(st: AppState, accounts: List<Account>, changes: Long, syncing: Boolean) {
    val scope = rememberCoroutineScope()
    Column(Modifier.width(250.dp).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceContainer).padding(10.dp)) {
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brand.gradient).clickable { st.compose(Draft(accounts.first().id, body = st.signature(accounts.first()))) }
            .padding(vertical = 14.dp, horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Edit, null, tint = Color.White); Spacer(Modifier.width(10.dp))
                Text(tr("Neue E-Mail"), color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(10.dp))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            val unifiedUnread = remember(changes) { st.store.unreadCounts(null).values.sum() }
            NavItem(Icons.Outlined.AllInbox, tr("Alle Posteingänge"), st.box is Box.Unified, unifiedUnread) { st.box = Box.Unified; st.selected = null }
            accounts.forEach { a ->
                var open by remember { mutableStateOf(accounts.size == 1) }
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { open = !open }.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(Color(a.color))); Spacer(Modifier.width(8.dp))
                    Text(a.email, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(if (open) "▾" else "▸", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (open) remember(changes, a.id) { st.store.folders(a.id) }.forEach { f ->
                    val icon = when (f.role) {
                        FolderRole.INBOX -> Icons.Outlined.Inbox; FolderRole.SENT -> Icons.AutoMirrored.Outlined.Send
                        FolderRole.ARCHIVE -> Icons.Outlined.Archive; FolderRole.TRASH -> Icons.Outlined.Delete
                        FolderRole.DRAFTS -> Icons.Outlined.Drafts; FolderRole.JUNK -> Icons.Outlined.Report; else -> Icons.Outlined.Folder
                    }
                    NavItem(icon, f.displayName, (st.box as? Box.InFolder)?.folder?.id == f.id, if (f.role == FolderRole.INBOX) f.unread else 0) {
                        st.box = Box.InFolder(f); st.selected = null
                        if (f.role != FolderRole.INBOX && f.role != FolderRole.SENT) scope.launch { st.repo.sync(f.id) }
                    }
                }
            }
        }
        HorizontalDivider(Modifier.padding(vertical = 6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            ActionIcon(Icons.Outlined.Refresh, tr("Abrufen (F5)")) { scope.launch { st.repo.sync((st.box as? Box.InFolder)?.folder?.id) } }
            ActionIcon(Icons.Outlined.Settings, tr("Einstellungen")) { st.showSettings = true }
            Spacer(Modifier.weight(1f))
            if (syncing) Text(tr("Abruf …"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun NavItem(icon: ImageVector, label: String, selected: Boolean, badge: Int = 0, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 1.dp).clip(RoundedCornerShape(12.dp))
        .background(if (selected) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
        .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, Modifier.size(20.dp), tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(12.dp))
        Text(label, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
        if (badge > 0) Badge { Text("$badge") }
    }
}

@Composable
private fun MessageList(st: AppState, changes: Long) {
    val folder = (st.box as? Box.InFolder)?.folder
    val smart = folder == null || folder.role == FolderRole.INBOX
    val cat = if (smart && st.query.isBlank()) st.category else null
    val msgs by produceState(emptyList<Message>(), changes, st.box, cat, st.query) {
        value = withContext(Dispatchers.IO) {
            st.store.list(folder?.id, cat, st.query).groupBy { it.threadKey + "/" + it.accountId }.values.map { it.first() }
        }
    }
    val counts = remember(changes, st.box) { st.store.unreadCounts(folder?.id) }
    Column(Modifier.fillMaxSize()) {
        Text(folder?.displayName ?: tr("Posteingang"), Modifier.padding(start = 18.dp, top = 14.dp, bottom = 6.dp),
            style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        OutlinedTextField(st.query, { st.query = it }, Modifier.fillMaxWidth().padding(horizontal = 12.dp), singleLine = true,
            placeholder = { Text(tr("Suchen")) }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, shape = RoundedCornerShape(14.dp))
        if (smart && st.query.isBlank()) Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf<Category?>(Category.PEOPLE, Category.NEWSLETTER, Category.NOTIFICATION, null).forEach { c ->
                val n = if (c == null) counts.values.sum() else counts[c] ?: 0
                FilterChip(st.category == c, { st.category = c; st.selected = null },
                    label = { Text((when (c) { null -> tr("Alle"); Category.NOTIFICATION -> tr("Hinweise"); else -> c.label }) + if (n > 0) " $n" else "", maxLines = 1) })
            }
        }
        if (msgs.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(if (st.query.isNotBlank()) tr("Keine Treffer") else tr("Alles erledigt ✓"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else LazyColumn(Modifier.fillMaxSize(), rememberLazyListState()) {
            items(msgs, key = { it.id }) { m -> Row_(st, m, st.selected?.threadKey == m.threadKey && st.selected?.accountId == m.accountId) }
        }
    }
}

@Composable
private fun Row_(st: AppState, m: Message, selected: Boolean) {
    val scope = rememberCoroutineScope()
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 2.dp).clip(RoundedCornerShape(12.dp))
        .background(when { selected -> MaterialTheme.colorScheme.primaryContainer; !m.seen -> MaterialTheme.colorScheme.surfaceContainerLowest; else -> Color.Transparent })
        .clickable {
            st.selected = m
            if (!m.seen) scope.launch { st.repo.setSeen(m, true) }
        }.padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
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

@Composable
private fun Reader(st: AppState, changes: Long) {
    val sel = st.selected ?: run {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(tr("Wähle links eine Mail aus"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val scope = rememberCoroutineScope()
    val thread by produceState(emptyList<Message>(), sel.id, changes) {
        value = withContext(Dispatchers.IO) { st.store.thread(sel.threadKey, sel.accountId).ifEmpty { listOfNotNull(st.store.message(sel.id)) } }
    }
    val last = thread.lastOrNull() ?: return
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            ActionIcon(Icons.AutoMirrored.Outlined.Reply, tr("Antworten (Strg+R)")) { st.reply(last, false) }
            ActionIcon(Icons.AutoMirrored.Outlined.ReplyAll, tr("Allen antworten")) { st.reply(last, true) }
            ActionIcon(Icons.AutoMirrored.Outlined.Forward, tr("Weiterleiten")) { st.forward(last) }
            Spacer(Modifier.width(12.dp))
            ActionIcon(Icons.Outlined.Archive, tr("Archivieren")) { scope.launch { thread.forEach { st.repo.archive(it) }; st.selected = null; st.snack = tr("Archiviert") } }
            ActionIcon(Icons.Outlined.Delete, tr("Löschen (Entf)")) { scope.launch { thread.forEach { st.repo.delete(it) }; st.selected = null; st.snack = tr("Gelöscht") } }
            ActionIcon(Icons.Outlined.Report, tr("Spam")) { scope.launch { thread.forEach { st.repo.spam(it) }; st.selected = null; st.snack = tr("In den Spam-Ordner verschoben") } }
            ActionIcon(Icons.Outlined.MarkEmailUnread, tr("Als ungelesen markieren")) { scope.launch { st.repo.setSeen(last, false); st.selected = null } }
            ActionIcon(Icons.Outlined.Flag, tr("Markieren")) { scope.launch { st.repo.setFlagged(last, !last.flagged) } }
            ActionIcon(Icons.Outlined.PushPin, tr("Anheften")) { st.repo.togglePin(last) }
        }
        HorizontalDivider()
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(last.subject.ifBlank { tr("(kein Betreff)") }, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            thread.forEach { m -> MailCard(st, m, expandedInitially = m == last || !m.seen || thread.size <= 2) }
        }
    }
}

@Composable
private fun MailCard(st: AppState, m: Message, expandedInitially: Boolean) {
    var expanded by remember(m.id) { mutableStateOf(expandedInitially) }
    val scope = rememberCoroutineScope()
    val link = MaterialTheme.colorScheme.primary
    val body = remember(m.id, link) {
        val html = m.bodyHtml
        if (!html.isNullOrBlank()) RichText.fromHtml(html, link) else RichText.fromText(m.bodyText ?: "", link)
    }
    val atts = remember(m.id) { st.store.attachments(m.id) }
    Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLowest,
        modifier = Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(20.dp))) {
        Column(Modifier.padding(18.dp)) {
            Row(Modifier.fillMaxWidth().clickable { expanded = !expanded }, verticalAlignment = Alignment.CenterVertically) {
                Avatar(m.fromName, m.fromAddr, 40); Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(m.fromName.ifBlank { m.fromAddr } + if (m.fromName.isNotBlank()) "  <${m.fromAddr}>" else "", fontWeight = FontWeight.SemiBold)
                    Text(tr("an {0}", m.toAddrs) + if (m.ccAddrs.isNotBlank()) tr(", cc {0}", m.ccAddrs) else "", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Text(fmtLong(m.date), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (!expanded) Text(m.snippet, Modifier.padding(top = 8.dp), maxLines = 1, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else {
                Spacer(Modifier.height(14.dp))
                SelectionContainer { Text(body, style = MaterialTheme.typography.bodyLarge) }
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

fun humanSize(b: Long): String = when {
    b >= 1_048_576 -> String.format("%.1f MB", b / 1_048_576.0)
    b >= 1024 -> "${b / 1024} KB"
    else -> "$b B"
}
