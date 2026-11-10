package app.mailwerk.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AllInbox
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Drafts
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Outbox
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Report
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Snooze
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Badge
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.mailwerk.data.Category
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Message
import app.mailwerk.data.SwipeAction
import app.mailwerk.data.ThreadSummary
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(vm: MainViewModel, snackHost: SnackbarHostState) {
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val threads by vm.threads.collectAsState()
    val mailbox by vm.mailbox.collectAsState()
    val category by vm.category.collectAsState()
    val counts by vm.unreadCounts.collectAsState()
    val syncing by vm.syncing.collectAsState()
    val query by vm.query.collectAsState()
    var searching by remember { mutableStateOf(false) }
    var actionsFor by remember { mutableStateOf<Message?>(null) }
    var snoozeFor by remember { mutableStateOf<Message?>(null) }

    ModalNavigationDrawer(drawerState = drawer, drawerContent = {
        Drawer(vm) { scope.launch { drawer.close() } }
    }) {
        Scaffold(
            topBar = {
                if (searching) TopAppBar(
                    title = {
                        TextField(query, { vm.query.value = it }, placeholder = { Text("In allen Mails suchen") }, singleLine = true,
                            colors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent),
                            modifier = Modifier.fillMaxWidth())
                    },
                    navigationIcon = { IconButton(onClick = { searching = false; vm.query.value = "" }) { Icon(Icons.Outlined.Close, "Suche schließen") } },
                )
                else TopAppBar(
                    title = {
                        Column {
                            Text(mailbox.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            (mailbox as? Mailbox.InFolder)?.let { Text(it.accountEmail, style = MaterialTheme.typography.labelSmall) }
                        }
                    },
                    navigationIcon = { IconButton(onClick = { scope.launch { drawer.open() } }) { Icon(Icons.Outlined.Menu, "Menü") } },
                    actions = { IconButton(onClick = { searching = true }) { Icon(Icons.Outlined.Search, "Suchen") } },
                )
            },
            floatingActionButton = {
                ExtendedFloatingActionButton(onClick = { vm.compose() }, icon = { Icon(Icons.Outlined.Edit, null) }, text = { Text("Schreiben") })
            },
            snackbarHost = { SnackbarHost(snackHost) },
        ) { pad ->
            Column(Modifier.padding(pad).fillMaxSize()) {
                if (vm.showsCategories && query.isBlank()) CategoryTabs(category, counts) { vm.category.value = it }
                PullToRefreshBox(isRefreshing = syncing, onRefresh = { vm.refresh() }, modifier = Modifier.fillMaxSize()) {
                    if (threads.isEmpty()) EmptyState(mailbox, category, query)
                    else LazyColumn(Modifier.fillMaxSize()) {
                        items(threads, key = { it.latest.threadKey + it.latest.id }) { t ->
                            SwipeRow(vm, t, onSnooze = { snoozeFor = it }) {
                                ThreadRow(t, showAccount = vm.accounts.value.size > 1 && mailbox !is Mailbox.InFolder, vm,
                                    onClick = { vm.push(Screen.Thread(t.latest.threadKey)) },
                                    onLong = { actionsFor = t.latest })
                            }
                        }
                        item { Spacer(Modifier.height(96.dp)) }
                    }
                }
            }
        }
    }

    actionsFor?.let { m -> QuickActionsSheet(vm, m, onDismiss = { actionsFor = null }, onSnooze = { actionsFor = null; snoozeFor = m }) }
    snoozeFor?.let { m -> TimeChooser("Zurückstellen bis …", { snoozeFor = null }) { t -> vm.snooze(m, t); snoozeFor = null } }
}

@Composable
private fun CategoryTabs(selected: Category?, counts: Map<Category, Int>, onSelect: (Category?) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val tabs = listOf<Triple<Category?, String, ImageVector>>(
            Triple(Category.PEOPLE, "Wichtig", Icons.Outlined.Person),
            Triple(Category.NEWSLETTER, "Newsletter", Icons.Outlined.Newspaper),
            Triple(Category.NOTIFICATION, "Benachrichtigungen", Icons.Outlined.Notifications),
            Triple(null, "Alle", Icons.Outlined.AllInbox),
        )
        tabs.forEach { (cat, label, icon) ->
            val n = if (cat == null) counts.values.sum() else counts[cat] ?: 0
            FilterChip(selected = selected == cat, onClick = { onSelect(cat) },
                label = { Text(if (n > 0) "$label  $n" else label) },
                leadingIcon = { Icon(icon, null, Modifier.size(18.dp)) })
        }
    }
}

@Composable
private fun EmptyState(mb: Mailbox, cat: Category?, q: String) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(80.dp))
        Text(if (q.isNotBlank()) "🔍" else "🎉", style = MaterialTheme.typography.displayMedium)
        Spacer(Modifier.height(12.dp))
        Text(when {
            q.isNotBlank() -> "Nichts gefunden für „$q“"
            mb is Mailbox.Snoozed -> "Nichts zurückgestellt"
            mb is Mailbox.Pinned -> "Nichts angeheftet"
            cat == Category.PEOPLE -> "Inbox Zero – alles erledigt!"
            else -> "Hier ist nichts"
        }, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Text("Zum Aktualisieren nach unten ziehen", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeRow(vm: MainViewModel, t: ThreadSummary, onSnooze: (Message) -> Unit, content: @Composable () -> Unit) {
    val right = vm.prefs.swipeRight; val left = vm.prefs.swipeLeft
    val state = rememberSwipeToDismissBoxState(confirmValueChange = { v ->
        when (v) {
            SwipeToDismissBoxValue.StartToEnd -> vm.performSwipe(right, t.latest, onSnooze)
            SwipeToDismissBoxValue.EndToStart -> vm.performSwipe(left, t.latest, onSnooze)
            else -> {}
        }
        false // Zeile springt zurück; die Liste aktualisiert sich über die Datenbank
    }, positionalThreshold = { it * 0.35f })
    SwipeToDismissBox(state, enableDismissFromStartToEnd = right != SwipeAction.NONE, enableDismissFromEndToStart = left != SwipeAction.NONE,
        backgroundContent = {
            val dir = state.dismissDirection
            val action = if (dir == SwipeToDismissBoxValue.StartToEnd) right else left
            val (color, icon) = swipeLook(action)
            Box(Modifier.fillMaxSize().background(color).padding(horizontal = 24.dp),
                contentAlignment = if (dir == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(icon, null, tint = Color.White); Spacer(Modifier.width(8.dp)); Text(action.label, color = Color.White)
                }
            }
        }) { content() }
}

private fun swipeLook(a: SwipeAction): Pair<Color, ImageVector> = when (a) {
    SwipeAction.ARCHIVE -> Color(0xFF2E7D32) to Icons.Outlined.Archive
    SwipeAction.DELETE -> Color(0xFFC62828) to Icons.Outlined.Delete
    SwipeAction.SNOOZE -> Color(0xFFEF6C00) to Icons.Outlined.Snooze
    SwipeAction.READ -> Color(0xFF1565C0) to Icons.Outlined.MarkEmailRead
    SwipeAction.PIN -> Color(0xFF6A1B9A) to Icons.Outlined.PushPin
    SwipeAction.NONE -> Color.Gray to Icons.Outlined.Close
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ThreadRow(t: ThreadSummary, showAccount: Boolean, vm: MainViewModel, onClick: () -> Unit, onLong: () -> Unit) {
    val m = t.latest
    val bold = if (t.unread) FontWeight.Bold else FontWeight.Normal
    val sent = m.folderRole == FolderRole.SENT
    val name = if (sent) "An: " + (Regexes.firstName(m.toAddrs)) else m.fromName.ifBlank { m.fromAddr }
    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)
        .combinedClickable(onClick = onClick, onLongClick = onLong).padding(horizontal = 16.dp, vertical = 10.dp)) {
        Box {
            Avatar(m.fromName, if (sent) m.toAddrs else m.fromAddr)
            if (t.unread) Box(Modifier.size(11.dp).background(MaterialTheme.colorScheme.primary, CircleShape).align(Alignment.TopEnd))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(name, fontWeight = bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (t.count > 1) Text("  ${t.count}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.weight(1f))
                if (t.pinned) Icon(Icons.Filled.PushPin, "Angeheftet", Modifier.size(15.dp), tint = MaterialTheme.colorScheme.tertiary)
                if (m.snoozedUntil > 0) Icon(Icons.Outlined.AccessTime, null, Modifier.size(15.dp), tint = MaterialTheme.colorScheme.tertiary)
                Text("  " + shortTime(m.date), style = MaterialTheme.typography.labelMedium,
                    color = if (t.unread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(m.subject.ifBlank { "(kein Betreff)" }, fontWeight = bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                if (t.hasAttachments) Icon(Icons.Outlined.AttachFile, "Anhang", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                if (t.flagged) Icon(Icons.Filled.Flag, "Markiert", Modifier.size(16.dp), tint = Color(0xFFE53935))
            }
            Text(m.snippet, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (showAccount) vm.accounts.value.firstOrNull { it.id == m.accountId }?.let { a ->
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 3.dp)) {
                    Box(Modifier.size(7.dp).background(Color(a.color), CircleShape)); Spacer(Modifier.width(4.dp))
                    Text(a.email, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

object Regexes {
    fun firstName(addrs: String): String {
        val a = app.mailwerk.data.Repository.parseAddrs(addrs).firstOrNull() ?: return addrs
        return a.second.ifBlank { a.first }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuickActionsSheet(vm: MainViewModel, m: Message, onDismiss: () -> Unit, onSnooze: () -> Unit) {
    var moveOpen by remember { mutableStateOf(false) }
    var remindOpen by remember { mutableStateOf(false) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            Text(m.subject.ifBlank { "(kein Betreff)" }, style = MaterialTheme.typography.titleMedium, maxLines = 2,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            fun item(label: String, icon: ImageVector, action: () -> Unit): @Composable () -> Unit = {
                ListItem(headlineContent = { Text(label) }, leadingContent = { Icon(icon, null) },
                    modifier = Modifier.combinedClickable(onClick = { action() }))
            }
            item(if (m.pinned) "Nicht mehr anheften" else "Anheften (oben halten)", Icons.Outlined.PushPin) { vm.togglePin(m); onDismiss() }()
            item("Zurückstellen …", Icons.Outlined.Snooze) { onSnooze() }()
            item("Erinnern, falls keine Antwort …", Icons.Outlined.AccessTime) { remindOpen = true }()
            item(if (m.seen) "Als ungelesen markieren" else "Als gelesen markieren", if (m.seen) Icons.Outlined.MarkEmailUnread else Icons.Outlined.MarkEmailRead) { vm.toggleSeen(m); onDismiss() }()
            item(if (m.flagged) "Markierung entfernen" else "Markieren", Icons.Outlined.Flag) { vm.toggleFlag(m); onDismiss() }()
            item("Archivieren", Icons.Outlined.Archive) { vm.archive(m); onDismiss() }()
            item("Verschieben …", Icons.Outlined.Folder) { moveOpen = !moveOpen }()
            if (moveOpen) vm.folders.value[m.accountId].orEmpty().filter { it.id != m.folderId }.forEach { f ->
                ListItem(headlineContent = { Text(f.displayName) }, leadingContent = { Spacer(Modifier.width(24.dp)) },
                    modifier = Modifier.combinedClickable(onClick = { vm.moveTo(m, f); onDismiss() }))
            }
            item("Löschen", Icons.Outlined.Delete) { vm.delete(m); onDismiss() }()
            HorizontalDivider()
            Text("Mails von ${m.fromAddr} künftig einsortieren als:", style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Category.entries.forEach { c ->
                    FilterChip(selected = m.category == c, onClick = { vm.setCategory(m, c); onDismiss() }, label = { Text(c.label) })
                }
            }
            item("Spam", Icons.Outlined.Report) { vm.spam(m); onDismiss() }()
            item("Absender blockieren", Icons.Outlined.Block) { vm.block(m); onDismiss() }()
        }
    }
    if (remindOpen) TimeChooser("Erinnern, falls bis dahin keine Antwort kommt", { remindOpen = false }) { t ->
        vm.remindIfNoReply(m, t); remindOpen = false; onDismiss()
    }
}

@Composable
private fun Drawer(vm: MainViewModel, close: () -> Unit) {
    val accounts by vm.accounts.collectAsState()
    val folders by vm.folders.collectAsState()
    val current by vm.mailbox.collectAsState()
    ModalDrawerSheet {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
            Text("Mailwerk", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(16.dp))
            @Composable fun entry(label: String, icon: ImageVector, selected: Boolean, badge: Int = 0, onClick: () -> Unit) =
                NavigationDrawerItem(label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) }, selected = selected, onClick = { onClick(); close() },
                    icon = { Icon(icon, null) }, badge = { if (badge > 0) Badge { Text("$badge") } })
            entry("Alle Posteingänge", Icons.Outlined.AllInbox, current is Mailbox.Unified,
                folders.values.flatten().filter { it.role == FolderRole.INBOX }.sumOf { it.unread }) { vm.selectMailbox(Mailbox.Unified) }
            entry("Angeheftet", Icons.Outlined.PushPin, current is Mailbox.Pinned) { vm.selectMailbox(Mailbox.Pinned) }
            entry("Markiert", Icons.Outlined.Star, current is Mailbox.Flagged) { vm.selectMailbox(Mailbox.Flagged) }
            entry("Zurückgestellt", Icons.Outlined.Snooze, current is Mailbox.Snoozed) { vm.selectMailbox(Mailbox.Snoozed) }
            entry("Postausgang & Entwürfe", Icons.Outlined.Outbox, false, vm.db.outbox().size) { vm.push(Screen.Outbox) }
            accounts.forEach { a ->
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 16.dp, bottom = 4.dp)) {
                    Box(Modifier.size(10.dp).background(Color(a.color), CircleShape)); Spacer(Modifier.width(8.dp))
                    Text(a.email, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                folders[a.id].orEmpty().forEach { f ->
                    val icon = when (f.role) {
                        FolderRole.INBOX -> Icons.Outlined.Inbox; FolderRole.SENT -> Icons.AutoMirrored.Outlined.Send
                        FolderRole.ARCHIVE -> Icons.Outlined.Archive; FolderRole.TRASH -> Icons.Outlined.Delete
                        FolderRole.DRAFTS -> Icons.Outlined.Drafts; FolderRole.JUNK -> Icons.Outlined.Report
                        else -> Icons.Outlined.Folder
                    }
                    val sel = (current as? Mailbox.InFolder)?.folder?.id == f.id
                    entry(f.displayName, icon, sel, if (f.role == FolderRole.INBOX) f.unread else 0) { vm.selectMailbox(Mailbox.InFolder(f, a.email)) }
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            entry("Konto hinzufügen", Icons.Outlined.Add, false) { vm.push(Screen.AccountSetup()) }
            entry("Einstellungen", Icons.Outlined.Settings, false) { vm.push(Screen.Settings) }
            Spacer(Modifier.height(24.dp))
        }
    }
}
