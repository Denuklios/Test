package app.mailwerk.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.animateColorAsState
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.luminance
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Email
import androidx.compose.foundation.clickable
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
    val accounts by vm.accounts.collectAsState()
    var actionsFor by remember { mutableStateOf<Message?>(null) }
    var snoozeFor by remember { mutableStateOf<Message?>(null) }
    val listState = rememberLazyListState()
    val scrolled by remember { derivedStateOf { listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 40 } }

    ModalNavigationDrawer(drawerState = drawer, drawerContent = {
        Drawer(vm) { scope.launch { drawer.close() } }
    }) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            floatingActionButton = { GradientFab(expanded = !scrolled) { vm.compose() } },
            snackbarHost = { SnackbarHost(snackHost) },
        ) { pad ->
            Column(Modifier.padding(top = pad.calculateTopPadding()).fillMaxSize()) {
                Header(vm, mailbox, accounts.firstOrNull()?.name, onMenu = { scope.launch { drawer.open() } })
                SearchPill(query) { vm.query.value = it }
                if (vm.showsCategories && query.isBlank()) CategoryTabs(category, counts) { vm.category.value = it }
                PullToRefreshBox(isRefreshing = syncing, onRefresh = { vm.refresh() }, modifier = Modifier.fillMaxSize()) {
                    if (threads.isEmpty()) EmptyState(mailbox, category, query)
                    else LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 110.dp)) {
                        var lastSection = ""
                        threads.forEach { t ->
                            val section = if (t.pinned) "Angeheftet" else sectionOf(t.latest.date)
                            if (section != lastSection) {
                                lastSection = section
                                item(key = "h_$section") { SectionHeader(section) }
                            }
                            item(key = t.latest.threadKey + t.latest.id) {
                                SwipeRow(vm, t, onSnooze = { snoozeFor = it }) {
                                    ThreadRow(t, showAccount = accounts.size > 1 && mailbox !is Mailbox.InFolder, vm,
                                        onClick = { vm.push(Screen.Thread(t.latest.threadKey)) },
                                        onLong = { actionsFor = t.latest })
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    actionsFor?.let { m -> QuickActionsSheet(vm, m, onDismiss = { actionsFor = null }, onSnooze = { actionsFor = null; snoozeFor = m }) }
    snoozeFor?.let { m -> TimeChooser("Zurückstellen bis …", { snoozeFor = null }) { t -> vm.snooze(m, t); snoozeFor = null } }
}

private fun sectionOf(t: Long): String {
    val now = java.util.Calendar.getInstance(); val c = java.util.Calendar.getInstance().apply { timeInMillis = t }
    val sameYear = now.get(java.util.Calendar.YEAR) == c.get(java.util.Calendar.YEAR)
    val dd = now.get(java.util.Calendar.DAY_OF_YEAR) - c.get(java.util.Calendar.DAY_OF_YEAR)
    return when {
        sameYear && dd == 0 -> "Heute"
        sameYear && dd == 1 -> "Gestern"
        sameYear && dd < 7 -> "Diese Woche"
        sameYear && now.get(java.util.Calendar.MONTH) == c.get(java.util.Calendar.MONTH) -> "Diesen Monat"
        else -> "Früher"
    }
}

@Composable
private fun SectionHeader(text: String) {
    Row(Modifier.padding(start = 8.dp, top = 14.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (text == "Angeheftet") { Icon(Icons.Filled.PushPin, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.tertiary); Spacer(Modifier.width(6.dp)) }
        Text(text.uppercase(), style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Header(vm: MainViewModel, mailbox: Mailbox, userName: String?, onMenu: () -> Unit) {
    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    val greet = when (hour) { in 5..10 -> "Guten Morgen"; in 11..17 -> "Hallo"; in 18..22 -> "Guten Abend"; else -> "Gute Nacht" }
    val first = userName?.split(' ')?.firstOrNull()?.takeIf { it.isNotBlank() }
    Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 16.dp, top = 6.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onMenu) { Icon(Icons.Outlined.Menu, "Menü") }
        Column(Modifier.weight(1f).padding(start = 4.dp)) {
            val sub = (mailbox as? Mailbox.InFolder)?.accountEmail ?: (if (first != null) "$greet, $first 👋" else greet)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (mailbox is Mailbox.Unified) "Posteingang" else mailbox.title, style = MaterialTheme.typography.headlineMedium,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        val acc = vm.accounts.value.firstOrNull()
        if (acc != null) Box(Modifier.clip(CircleShape).clickable { vm.push(Screen.Settings) }) { Avatar(acc.name, acc.email, 40.dp) }
    }
}

@Composable
private fun SearchPill(query: String, onChange: (String) -> Unit) {
    val focus = LocalFocusManager.current
    TextField(query, onChange, singleLine = true,
        placeholder = { Text("In allen Mails suchen", style = MaterialTheme.typography.bodyLarge) },
        leadingIcon = { Icon(Icons.Outlined.Search, null) },
        trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { onChange(""); focus.clearFocus() }) { Icon(Icons.Outlined.Close, "Suche leeren") } },
        shape = RoundedCornerShape(28.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh, unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).height(54.dp))
}

@Composable
private fun GradientFab(expanded: Boolean, onClick: () -> Unit) {
    Row(Modifier.shadow(10.dp, RoundedCornerShape(22.dp), spotColor = Brand.Indigo)
        .clip(RoundedCornerShape(22.dp)).background(Brand.gradient).clickable(onClick = onClick)
        .padding(horizontal = if (expanded) 22.dp else 18.dp, vertical = 18.dp).animateContentSize(),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.Edit, "Schreiben", tint = Color.White)
        if (expanded) { Spacer(Modifier.width(10.dp)); Text("Schreiben", color = Color.White, style = MaterialTheme.typography.titleMedium) }
    }
}

fun categoryColor(c: Category?): Color = when (c) {
    Category.PEOPLE -> Brand.People; Category.NEWSLETTER -> Brand.News; Category.NOTIFICATION -> Brand.Notify; null -> Color(0xFF5B6080)
}

@Composable
private fun CategoryTabs(selected: Category?, counts: Map<Category, Int>, onSelect: (Category?) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val tabs = listOf<Triple<Category?, String, ImageVector>>(
            Triple(Category.PEOPLE, "Wichtig", Icons.Outlined.Person),
            Triple(Category.NEWSLETTER, "Newsletter", Icons.Outlined.Newspaper),
            Triple(Category.NOTIFICATION, "Benachrichtigungen", Icons.Outlined.Notifications),
            Triple(null, "Alle", Icons.Outlined.AllInbox),
        )
        tabs.forEach { (cat, label, icon) ->
            val n = if (cat == null) counts.values.sum() else counts[cat] ?: 0
            val sel = selected == cat
            val color = categoryColor(cat)
            val bg by animateColorAsState(if (sel) color else MaterialTheme.colorScheme.surfaceContainerHigh, label = "tab")
            val fg = if (sel) Color.White else MaterialTheme.colorScheme.onSurface
            Row(Modifier.clip(RoundedCornerShape(16.dp)).background(bg).clickable { onSelect(cat) }.padding(horizontal = 14.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, Modifier.size(18.dp), tint = if (sel) Color.White else color)
                Spacer(Modifier.width(7.dp))
                Text(label, color = fg, style = MaterialTheme.typography.labelLarge)
                if (n > 0) {
                    Spacer(Modifier.width(7.dp))
                    Box(Modifier.clip(RoundedCornerShape(10.dp)).background(if (sel) Color.White.copy(alpha = 0.25f) else color.copy(alpha = 0.14f))
                        .padding(horizontal = 7.dp, vertical = 1.dp)) {
                        Text("$n", color = if (sel) Color.White else color, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyState(mb: Mailbox, cat: Category?, q: String) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(70.dp))
        Box(Modifier.size(120.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
            Icon(if (q.isNotBlank()) Icons.Outlined.Search else if (mb is Mailbox.Snoozed) Icons.Outlined.Snooze else Icons.Outlined.DoneAll,
                null, Modifier.size(56.dp), tint = Color.White)
        }
        Spacer(Modifier.height(24.dp))
        Text(when {
            q.isNotBlank() -> "Nichts gefunden"
            mb is Mailbox.Snoozed -> "Nichts zurückgestellt"
            mb is Mailbox.Pinned -> "Nichts angeheftet"
            cat == Category.PEOPLE -> "Alles erledigt!"
            else -> "Hier ist es ruhig"
        }, style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(when {
            q.isNotBlank() -> "Keine Mail passt zu „$q“."
            cat == Category.PEOPLE -> "Keine offenen Mails von Menschen.\nGenieß den Moment ☕"
            else -> "Zum Aktualisieren nach unten ziehen."
        }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
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
        false
    }, positionalThreshold = { it * 0.35f })
    SwipeToDismissBox(state, enableDismissFromStartToEnd = right != SwipeAction.NONE, enableDismissFromEndToStart = left != SwipeAction.NONE,
        modifier = Modifier.padding(vertical = 3.dp),
        backgroundContent = {
            val dir = state.dismissDirection
            val action = if (dir == SwipeToDismissBoxValue.StartToEnd) right else left
            val (color, icon) = swipeLook(action)
            if (dir != SwipeToDismissBoxValue.Settled) Box(Modifier.fillMaxSize().clip(RoundedCornerShape(22.dp)).background(color).padding(horizontal = 26.dp),
                contentAlignment = if (dir == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(icon, null, tint = Color.White); Spacer(Modifier.width(8.dp))
                    Text(action.label, color = Color.White, style = MaterialTheme.typography.titleSmall)
                }
            }
        }) { content() }
}

private fun swipeLook(a: SwipeAction): Pair<Color, ImageVector> = when (a) {
    SwipeAction.ARCHIVE -> Color(0xFF16A06E) to Icons.Outlined.Archive
    SwipeAction.DELETE -> Color(0xFFE5484D) to Icons.Outlined.Delete
    SwipeAction.SNOOZE -> Color(0xFFF59E0B) to Icons.Outlined.Snooze
    SwipeAction.READ -> Brand.Indigo to Icons.Outlined.MarkEmailRead
    SwipeAction.PIN -> Brand.Violet to Icons.Outlined.PushPin
    SwipeAction.NONE -> Color.Gray to Icons.Outlined.Close
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ThreadRow(t: ThreadSummary, showAccount: Boolean, vm: MainViewModel, onClick: () -> Unit, onLong: () -> Unit) {
    val m = t.latest
    val unread = t.unread
    val sent = m.folderRole == FolderRole.SENT
    val name = if (sent) "An: " + (Regexes.firstName(m.toAddrs)) else m.fromName.ifBlank { m.fromAddr }
    val cs = MaterialTheme.colorScheme
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp))
        .background(
            if (cs.background.luminance() < 0.5f) { if (unread) cs.surfaceContainerHigh else cs.surfaceContainerLow }
            else { if (unread) cs.surfaceContainerLowest else cs.surfaceContainer })
        .combinedClickable(onClick = onClick, onLongClick = onLong).padding(horizontal = 14.dp, vertical = 13.dp)) {
        Box {
            Avatar(m.fromName, if (sent) m.toAddrs else m.fromAddr, 46.dp)
            if (showAccount) vm.accounts.value.firstOrNull { it.id == m.accountId }?.let { a ->
                Box(Modifier.size(14.dp).align(Alignment.BottomEnd).clip(CircleShape).background(cs.surfaceContainerLowest).padding(2.dp)
                    .clip(CircleShape).background(Color(a.color)))
            }
        }
        Spacer(Modifier.width(13.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(name, style = MaterialTheme.typography.titleMedium.copy(fontWeight = if (unread) FontWeight.Bold else FontWeight.Medium),
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                    color = if (unread) cs.onSurface else cs.onSurface.copy(alpha = 0.85f))
                if (t.count > 1) {
                    Spacer(Modifier.width(6.dp))
                    Text("${t.count}", style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant,
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(cs.surfaceContainerHighest).padding(horizontal = 5.dp, vertical = 1.dp))
                }
                Spacer(Modifier.weight(1f))
                if (m.snoozedUntil > 0) Icon(Icons.Outlined.AccessTime, null, Modifier.size(15.dp), tint = cs.tertiary)
                Text("  " + shortTime(m.date), style = MaterialTheme.typography.labelMedium, color = if (unread) cs.primary else cs.onSurfaceVariant)
            }
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(m.subject.ifBlank { "(kein Betreff)" }, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal),
                    color = cs.onSurface, modifier = Modifier.weight(1f))
                if (t.hasAttachments) Icon(Icons.Outlined.AttachFile, "Anhang", Modifier.size(16.dp), tint = cs.onSurfaceVariant)
                if (t.flagged) Icon(Icons.Filled.Flag, "Markiert", Modifier.size(16.dp), tint = Color(0xFFE5484D))
                if (unread) { Spacer(Modifier.width(6.dp)); Box(Modifier.size(9.dp).clip(CircleShape).background(Brand.gradient)) }
            }
            Spacer(Modifier.height(2.dp))
            Text(m.snippet, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
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
            Box(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 12.dp).clip(RoundedCornerShape(24.dp)).background(Brand.gradientDeep).padding(20.dp)) {
                Column {
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.Email, null, tint = Color.White)
                    }
                    Spacer(Modifier.height(12.dp))
                    Text("Mailwerk", style = MaterialTheme.typography.headlineSmall, color = Color.White)
                    Text(if (accounts.size == 1) "1 Konto" else "${accounts.size} Konten", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                }
            }
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
