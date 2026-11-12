package app.mailwerk.ui

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Badge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import app.mailwerk.tr

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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.foundation.border
import androidx.compose.ui.draw.shadow
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.animateColorAsState
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.luminance
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material.icons.outlined.Check
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.ui.focus.focusRequester
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.material.icons.outlined.CreateNewFolder
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Rule
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material.icons.outlined.SystemUpdate
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
    LaunchedEffect(category, mailbox) { listState.scrollToItem(0) }
    // Mit Sperre gegen Flackern: einklappen nach etwas Scrollweg, wieder aufklappen erst ganz oben
    var scrolled by remember { mutableStateOf(false) }
    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex to listState.firstVisibleItemScrollOffset }.collect { (i, o) ->
            if (i > 0 || o > 60) scrolled = true else if (i == 0 && o == 0) scrolled = false
        }
    }
    var searchOpen by remember { mutableStateOf(false) }

    ModalNavigationDrawer(drawerState = drawer, drawerContent = {
        Drawer(vm) { scope.launch { drawer.close() } }
    }) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            floatingActionButton = { GradientFab(expanded = !scrolled) { vm.compose() } },
            snackbarHost = { SnackbarHost(snackHost) },
        ) { pad ->
            Column(Modifier.padding(top = pad.calculateTopPadding()).fillMaxSize()) {
                val collapsed = scrolled && query.isBlank()
                Header(vm, mailbox, accounts.firstOrNull()?.name, collapsed,
                    showCats = vm.showsCategories, category = category, counts = counts,
                    onCategory = { vm.category.value = it },
                    searchOpen = searchOpen || query.isNotBlank(), query = query,
                    onQuery = { vm.query.value = it },
                    onSearchOpen = { open -> searchOpen = open; if (!open) vm.query.value = "" else scope.launch { listState.scrollToItem(0) } },
                    onMenu = { scope.launch { drawer.open() } })
                AnimatedVisibility(!collapsed, enter = expandVertically() + fadeIn(), exit = shrinkVertically() + fadeOut()) {
                    Column { Banners(vm) }
                }
                PullToRefreshBox(isRefreshing = syncing, onRefresh = { vm.refresh() }, modifier = Modifier.fillMaxSize()) {
                    if (threads.isEmpty() && syncing && query.isBlank()) LoadingState()
                    else if (threads.isEmpty()) EmptyState(mailbox, category, query)
                    else LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 110.dp)) {
                        var lastSection = ""
                        val used = HashSet<String>()
                        // stabile, eindeutige Schlüssel -> Einträge rutschen beim Entfernen geschmeidig nach
                        fun uniq(k: String, idx: Int) = if (used.add(k)) k else "$k#$idx".also { used.add(it) }
                        threads.forEachIndexed { idx, t ->
                            val section = if (t.pinned) tr("Angeheftet") else sectionOf(t.latest.date)
                            if (section != lastSection) {
                                lastSection = section
                                item(key = uniq("h_$section", idx)) { Box(Modifier.animateItem(fadeInSpec = tween(220), placementSpec = spring(stiffness = Spring.StiffnessMediumLow), fadeOutSpec = tween(180))) { SectionHeader(section) } }
                            }
                            item(key = uniq("m_${t.latest.id}", idx)) {
                                SwipeRow(vm, t, Modifier.animateItem(fadeInSpec = tween(220), placementSpec = spring(stiffness = Spring.StiffnessMediumLow), fadeOutSpec = tween(180)),
                                    onSnooze = { snoozeFor = it }) {
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
    snoozeFor?.let { m -> TimeChooser(tr("Zurückstellen bis …"), { snoozeFor = null }) { t -> vm.snooze(m, t); snoozeFor = null } }
}

@Composable
private fun Banners(vm: MainViewModel) {
    val pending by vm.pendingPresets.collectAsState()
    val syncingNow by vm.syncing.collectAsState()
    val accs by vm.accounts.collectAsState()
    accs.forEach { a ->
        val dbChanges by vm.db.changes.collectAsState()
        val err = remember(syncingNow, dbChanges, a.id) { vm.prefs.syncError(a.id) }
        if (err != null) Banner(Icons.Outlined.CloudOff, tr("Abruf fehlgeschlagen: {0}", a.email), err,
            if (syncingNow) null else tr("Erneut"), onAction = { vm.refresh() }, onClose = null)
    }
    val hidden by vm.hiddenBanners.collectAsState()
    val upd by vm.update.collectAsState()
    val progress by vm.updateProgress.collectAsState()
    if (vm.prefs.vacationActive()) {
        val until = vm.prefs.vacationUntil
        Banner(Icons.Outlined.BeachAccess, tr("Abwesenheitsnotiz ist aktiv"),
            if (until > 0) tr("Automatische Antwort bis {0}", MainViewModel.fmt(until)) else tr("Absender erhalten eine automatische Antwort"),
            tr("Einstellen"), onAction = { vm.push(Screen.Vacation) }, onClose = null)
    }
    upd?.let { u ->
        Banner(Icons.Outlined.SystemUpdate, tr("Mailwerk {0} ist da", u.versionName),
            if (progress != null) tr("Wird geladen … {0} %", ((progress ?: 0f) * 100).toInt()) else u.notes.ifBlank { tr("Neue Funktionen und Verbesserungen") },
            if (progress != null) null else tr("Aktualisieren"), gradient = true, onAction = { vm.installUpdate() }, onClose = null)
    }
    pending.filter { it.email !in hidden }.forEach { p ->
        Banner(Icons.Outlined.Key, p.email, tr("Vorbereitet – es fehlt nur noch das Passwort."), tr("Verbinden"),
            onAction = { vm.push(Screen.AccountSetup()) }, onClose = { vm.hiddenBanners.value = hidden + p.email })
    }
}

@Composable
private fun Banner(icon: ImageVector, title: String, text: String, action: String?, gradient: Boolean = false,
                   onAction: () -> Unit, onClose: (() -> Unit)?) {
    val cs = MaterialTheme.colorScheme
    val fg = if (gradient) Color.White else cs.onSurface
    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clip(RoundedCornerShape(22.dp))
        .then(if (gradient) Modifier.background(Brand.gradient) else Modifier.background(cs.tertiaryContainer))
        .clickable(enabled = action != null, onClick = onAction).padding(start = 16.dp, top = 12.dp, bottom = 12.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(if (gradient) Color.White.copy(alpha = 0.2f) else cs.tertiary.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center) { Icon(icon, null, tint = if (gradient) Color.White else cs.tertiary) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(text, style = MaterialTheme.typography.bodySmall, color = fg.copy(alpha = 0.8f))
        }
        if (action != null) Text(action, style = MaterialTheme.typography.labelLarge, color = if (gradient) Color.White else cs.tertiary,
            modifier = Modifier.padding(horizontal = 8.dp))
        if (onClose != null) IconButton(onClick = onClose) { Icon(Icons.Outlined.Close, tr("Später"), tint = fg.copy(alpha = 0.6f), modifier = Modifier.size(18.dp)) }
        else Spacer(Modifier.width(8.dp))
    }
}

@Composable
private fun NewFolderDialog(onDismiss: () -> Unit, onCreate: (String, Boolean) -> Unit) {
    var name by remember { mutableStateOf("") }
    var inInbox by remember { mutableStateOf(true) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text(tr("Neuer Ordner")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text(tr("Name des Ordners")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(tr("Im Posteingang anlegen (Unterordner)"), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Switch(inInbox, { inInbox = it })
                }
                Text(tr("Der Ordner wird auf dem Server angelegt und erscheint auch im Webmail und auf anderen Geräten."),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { TextButton(enabled = name.isNotBlank() && !name.contains('/'), onClick = { onCreate(name.trim(), inInbox) }) { Text(tr("Anlegen")) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Abbrechen")) } })
}

@Composable
private fun EditFolderDialog(vm: MainViewModel, f: app.mailwerk.data.Folder, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(f.displayName) }
    var confirmDelete by remember { mutableStateOf(false) }
    if (confirmDelete) AlertDialog(onDismissRequest = onDismiss, title = { Text(tr("Ordner „{0}“ löschen?", f.displayName)) },
        text = { Text(tr("Der Ordner und alle Mails darin werden auf dem Server gelöscht. Das kann nicht rückgängig gemacht werden.")) },
        confirmButton = { TextButton(onClick = { vm.deleteFolder(f); onDismiss() }) { Text(tr("Löschen"), color = MaterialTheme.colorScheme.error) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Abbrechen")) } })
    else AlertDialog(onDismissRequest = onDismiss, title = { Text(tr("Ordner bearbeiten")) },
        text = { OutlinedTextField(name, { name = it }, label = { Text(tr("Name")) }, singleLine = true, modifier = Modifier.fillMaxWidth()) },
        confirmButton = {
            TextButton(enabled = name.isNotBlank() && name.trim() != f.displayName && !name.contains('/'), onClick = { vm.renameFolder(f, name.trim()); onDismiss() }) {
                Text(tr("Umbenennen"))
            }
        },
        dismissButton = { TextButton(onClick = { confirmDelete = true }) { Text(tr("Ordner löschen"), color = MaterialTheme.colorScheme.error) } })
}

private fun sectionOf(t: Long): String {
    val now = java.util.Calendar.getInstance(); val c = java.util.Calendar.getInstance().apply { timeInMillis = t }
    val sameYear = now.get(java.util.Calendar.YEAR) == c.get(java.util.Calendar.YEAR)
    val dd = now.get(java.util.Calendar.DAY_OF_YEAR) - c.get(java.util.Calendar.DAY_OF_YEAR)
    return when {
        t > now.timeInMillis || (sameYear && dd == 0) -> tr("Heute")
        sameYear && dd == 1 -> tr("Gestern")
        sameYear && dd < 7 -> tr("Diese Woche")
        sameYear && now.get(java.util.Calendar.MONTH) == c.get(java.util.Calendar.MONTH) -> tr("Diesen Monat")
        else -> tr("Früher")
    }
}

@Composable
private fun SectionHeader(text: String) {
    Row(Modifier.padding(start = 8.dp, top = 10.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        if (text == tr("Angeheftet")) { Icon(Icons.Filled.PushPin, null, Modifier.size(14.dp), tint = MaterialTheme.colorScheme.tertiary); Spacer(Modifier.width(6.dp)) }
        Text(text.uppercase(), style = MaterialTheme.typography.labelMedium.copy(letterSpacing = 1.2.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Header(vm: MainViewModel, mailbox: Mailbox, userName: String?, collapsed: Boolean, showCats: Boolean,
                   category: Category?, counts: Map<Category, Int>, onCategory: (Category?) -> Unit,
                   searchOpen: Boolean, query: String, onQuery: (String) -> Unit, onSearchOpen: (Boolean) -> Unit, onMenu: () -> Unit) {
    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    val greet = when (hour) { in 5..10 -> tr("Guten Morgen"); in 11..17 -> tr("Hallo"); in 18..22 -> tr("Guten Abend"); else -> tr("Gute Nacht") }
    val first = userName?.split(' ')?.firstOrNull()?.takeIf { it.isNotBlank() }
    val boxTitle = if (mailbox is Mailbox.Unified) tr("Posteingang") else mailbox.title
    val sub = (mailbox as? Mailbox.InFolder)?.accountEmail ?: (if (first != null) "$greet, $first 👋" else greet)
    val acc = vm.accounts.value.firstOrNull()
    val titleSize by androidx.compose.animation.core.animateFloatAsState(if (collapsed) 20f else 30f, label = "title")

    Column(Modifier.fillMaxWidth().animateContentSize().padding(start = 4.dp, end = 12.dp, top = if (collapsed) 2.dp else 8.dp, bottom = if (collapsed) 4.dp else 6.dp)) {
        // Zeile 1: Menü · Begrüßung · Avatar  (eingeklappt: Menü · Posteingang)
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onMenu) { Icon(Icons.Outlined.Menu, tr("Menü")) }
            if (collapsed) Text(boxTitle, style = MaterialTheme.typography.headlineMedium.copy(fontSize = titleSize.sp, lineHeight = (titleSize + 6).sp),
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 4.dp))
            else Text(sub, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 4.dp))
            if (collapsed && showCats) { CategoryPill(category, counts, onCategory, compact = true); Spacer(Modifier.width(8.dp)) }
            if (collapsed) SearchToggle(searchOpen = false, query = "", onQuery = onQuery, onOpen = onSearchOpen, compact = true)
            else if (acc != null) Box(Modifier.clip(CircleShape).clickable { vm.push(Screen.Settings) }) { Avatar(acc.name, acc.email, 40.dp) }
        }
        if (!collapsed) {
            // Zeile 2: Posteingang (groß)
            Text(boxTitle, style = MaterialTheme.typography.headlineMedium.copy(fontSize = titleSize.sp, lineHeight = (titleSize + 6).sp),
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 16.dp, end = 8.dp))
            Spacer(Modifier.height(8.dp))
            // Zeile 3: Auswahl-Knopf · Lupe (fährt zum Suchfeld aus)
            Row(Modifier.fillMaxWidth().padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                AnimatedVisibility(showCats && !searchOpen, enter = fadeIn() + expandHorizontally(), exit = fadeOut() + shrinkHorizontally()) {
                    CategoryPill(category, counts, onCategory)
                }
                Spacer(Modifier.weight(1f))
                SearchToggle(searchOpen, query, onQuery, onSearchOpen, compact = false, modifier = if (searchOpen) Modifier.weight(50f) else Modifier)
            }
        }
    }
}

/** Auswahl-Knopf für Wichtig / Newsletter / Benachrichtigungen / Alle. */
@Composable
private fun CategoryPill(category: Category?, counts: Map<Category, Int>, onCategory: (Category?) -> Unit, compact: Boolean = false) {
    var open by remember { mutableStateOf(false) }
    val color = categoryColor(category)
    val n = if (category == null) counts.values.sum() else counts[category] ?: 0
    val others = counts.filterKeys { it != category }.values.sum()
    val icon = when (category) { Category.PEOPLE -> Icons.Outlined.Person; Category.NEWSLETTER -> Icons.Outlined.Newspaper
        Category.NOTIFICATION -> Icons.Outlined.Notifications; null -> Icons.Outlined.AllInbox }
    Box {
        val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
        Row(Modifier.clip(RoundedCornerShape(20.dp))
            .background(if (dark) MaterialTheme.colorScheme.surfaceContainerHigh else color.copy(alpha = 0.14f))
            .then(if (dark) Modifier.border(1.dp, color.copy(alpha = 0.7f), RoundedCornerShape(20.dp)) else Modifier)
            .clickable { open = true }
            .padding(start = 12.dp, end = 6.dp, top = 7.dp, bottom = 7.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, if (compact) category?.label ?: tr("Alle") else null, Modifier.size(19.dp), tint = color)
            if (!compact) {
                Spacer(Modifier.width(7.dp))
                Text(category?.label ?: tr("Alle"), style = MaterialTheme.typography.titleSmall.copy(fontSize = 15.sp), color = MaterialTheme.colorScheme.onSurface)
            }
            if (n > 0) {
                Spacer(Modifier.width(7.dp))
                Text("$n", color = Color.White, style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(color).padding(horizontal = 7.dp, vertical = 1.dp))
            }
            Icon(Icons.Outlined.ArrowDropDown, tr("Kategorie wählen"), Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurface)
            if (category != null && others > 0) Box(Modifier.size(7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.tertiary))
        }
        CategoryMenu(open, category, counts, onDismiss = { open = false }) { open = false; onCategory(it) }
    }
}

/** Lupe, die sich – wie der Schreiben-Knopf – zu einem Suchfeld aus- und wieder einfährt. */
@Composable
private fun SearchToggle(searchOpen: Boolean, query: String, onQuery: (String) -> Unit, onOpen: (Boolean) -> Unit,
                         compact: Boolean, modifier: Modifier = Modifier) {
    val cs = MaterialTheme.colorScheme
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    val focusManager = LocalFocusManager.current
    Row(modifier.animateContentSize().height(if (compact) 40.dp else 46.dp).clip(RoundedCornerShape(23.dp))
        .background(if (searchOpen || cs.background.luminance() < 0.5f) cs.surfaceContainerHigh else cs.primary.copy(alpha = 0.12f))
        .then(if (cs.background.luminance() < 0.5f) Modifier.border(1.dp, cs.primary.copy(alpha = 0.5f), RoundedCornerShape(23.dp)) else Modifier)
        .clickable(enabled = !searchOpen) { onOpen(true) }
        .padding(horizontal = if (searchOpen) 12.dp else if (compact) 8.dp else 11.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.Search, tr("In allen Mails suchen"), tint = cs.primary, modifier = Modifier.size(24.dp))
        if (searchOpen) {
            Spacer(Modifier.width(8.dp))
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                if (query.isEmpty()) Text(tr("In allen Mails suchen"), style = MaterialTheme.typography.bodyLarge, color = cs.onSurfaceVariant, maxLines = 1)
                androidx.compose.foundation.text.BasicTextField(query, onQuery, singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = cs.onSurface),
                    cursorBrush = androidx.compose.ui.graphics.SolidColor(cs.primary),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus))
            }
            IconButton(onClick = { focusManager.clearFocus(); onOpen(false) }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Outlined.Close, tr("Suche leeren"), Modifier.size(20.dp))
            }
            LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
        }
    }
}

@Composable
private fun CategoryMenu(open: Boolean, selected: Category?, counts: Map<Category, Int>, onDismiss: () -> Unit, onSelect: (Category?) -> Unit) {
    DropdownMenu(open, onDismiss, shape = RoundedCornerShape(18.dp)) {
        listOf<Triple<Category?, String, ImageVector>>(
            Triple(Category.PEOPLE, tr("Wichtig"), Icons.Outlined.Person),
            Triple(Category.NEWSLETTER, tr("Newsletter"), Icons.Outlined.Newspaper),
            Triple(Category.NOTIFICATION, tr("Benachrichtigungen"), Icons.Outlined.Notifications),
            Triple(null, tr("Alle"), Icons.Outlined.AllInbox),
        ).forEach { (cat, label, icon) ->
            val n = if (cat == null) counts.values.sum() else counts[cat] ?: 0
            val color = categoryColor(cat)
            DropdownMenuItem(
                text = { Text(label, style = MaterialTheme.typography.titleMedium.copy(fontWeight = if (cat == selected) FontWeight.Bold else FontWeight.Medium)) },
                leadingIcon = { Icon(icon, null, tint = color) },
                trailingIcon = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (n > 0) Text("$n", color = color, style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(color.copy(alpha = 0.14f)).padding(horizontal = 8.dp, vertical = 2.dp))
                        if (cat == selected) { Spacer(Modifier.width(8.dp)); Icon(Icons.Outlined.Check, null, tint = MaterialTheme.colorScheme.primary) }
                    }
                },
                onClick = { onSelect(cat) },
                modifier = Modifier.widthIn(min = 260.dp))
        }
    }
}


@Composable
private fun GradientFab(expanded: Boolean, onClick: () -> Unit) {
    Row(Modifier.shadow(10.dp, RoundedCornerShape(22.dp), spotColor = Brand.Indigo)
        .clip(RoundedCornerShape(22.dp)).background(Brand.gradient).clickable(onClick = onClick)
        .padding(horizontal = if (expanded) 22.dp else 18.dp, vertical = 18.dp).animateContentSize(),
        verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Outlined.Edit, tr("Schreiben"), tint = Color.White)
        if (expanded) { Spacer(Modifier.width(10.dp)); Text(tr("Schreiben"), color = Color.White, style = MaterialTheme.typography.titleMedium) }
    }
}

fun categoryColor(c: Category?): Color = when (c) {
    Category.PEOPLE -> Brand.People; Category.NEWSLETTER -> Brand.News; Category.NOTIFICATION -> Brand.Notify; null -> Color(0xFF5B6080)
}


@Composable
private fun LoadingState() {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(90.dp))
        CircularProgressIndicator(Modifier.size(56.dp), strokeWidth = 5.dp)
        Spacer(Modifier.height(24.dp))
        Text(tr("Mails werden geladen …"), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(tr("Beim ersten Mal kann das einen Moment dauern."), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
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
            q.isNotBlank() -> tr("Nichts gefunden")
            mb is Mailbox.Snoozed -> tr("Nichts zurückgestellt")
            mb is Mailbox.Pinned -> tr("Nichts angeheftet")
            cat == Category.PEOPLE -> tr("Alles erledigt!")
            else -> tr("Hier ist es ruhig")
        }, style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(when {
            q.isNotBlank() -> tr("Keine Mail passt zu „{0}“.", q)
            cat == Category.PEOPLE -> tr("Keine offenen Mails von Menschen.\nGenieß den Moment ☕")
            else -> tr("Zum Aktualisieren nach unten ziehen.")
        }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeRow(vm: MainViewModel, t: ThreadSummary, modifier: Modifier, onSnooze: (Message) -> Unit, content: @Composable () -> Unit) {
    val right = vm.prefs.swipeRight; val left = vm.prefs.swipeLeft
    // Aktionen, bei denen die Mail die Liste verlässt: ganz hinausgleiten, dann zusammenschrumpfen lassen
    fun leaves(a: SwipeAction) = a == SwipeAction.ARCHIVE || a == SwipeAction.DELETE
    var pending by remember { mutableStateOf<SwipeAction?>(null) }
    val state = rememberSwipeToDismissBoxState(confirmValueChange = { v ->
        val action = when (v) { SwipeToDismissBoxValue.StartToEnd -> right; SwipeToDismissBoxValue.EndToStart -> left; else -> null }
        when {
            action == null -> false
            leaves(action) -> { pending = action; true } // Karte gleitet ganz nach außen
            else -> { vm.performSwipe(action, t.latest, onSnooze); false } // zurückfedern
        }
    }, positionalThreshold = { it * 0.35f })
    val visible = remember { androidx.compose.animation.core.MutableTransitionState(true) }
    // nach dem Hinausgleiten: Höhe weich auf 0, dann erst ausführen -> die Mails darunter rutschen geschmeidig hoch
    LaunchedEffect(pending, state.currentValue) {
        if (pending != null && state.currentValue != SwipeToDismissBoxValue.Settled) visible.targetState = false
    }
    LaunchedEffect(visible.isIdle, visible.currentState) {
        val a = pending
        if (a != null && visible.isIdle && !visible.currentState) {
            pending = null; vm.performSwipe(a, t.latest, onSnooze)
            // Mail ist nach kurzer Zeit immer noch da (z. B. Rückgängig oder Fehler)? Wieder zeigen statt unsichtbar lassen
            kotlinx.coroutines.delay(1500)
            state.reset(); visible.targetState = true
        }
    }
    AnimatedVisibility(visible, modifier = modifier,
        exit = shrinkVertically(animationSpec = tween(260, easing = FastOutSlowInEasing)) + fadeOut(tween(200))) {
        SwipeToDismissBox(state, enableDismissFromStartToEnd = right != SwipeAction.NONE, enableDismissFromEndToStart = left != SwipeAction.NONE,
            modifier = Modifier.padding(vertical = 2.dp),
            backgroundContent = {
                val dir = state.dismissDirection
                val action = if (dir == SwipeToDismissBoxValue.StartToEnd) right else left
                val (color, icon) = swipeLook(action)
                if (dir != SwipeToDismissBoxValue.Settled) Box(Modifier.fillMaxSize().clip(RoundedCornerShape(16.dp)).background(color).padding(horizontal = 26.dp),
                    contentAlignment = if (dir == SwipeToDismissBoxValue.StartToEnd) Alignment.CenterStart else Alignment.CenterEnd) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(icon, null, tint = Color.White); Spacer(Modifier.width(8.dp))
                        Text(action.label, color = Color.White, style = MaterialTheme.typography.titleSmall)
                    }
                }
            }) { content() }
    }
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
    val name = if (sent) tr("An: ") + (Regexes.firstName(m.toAddrs)) else m.fromName.ifBlank { m.fromAddr }
    val cs = MaterialTheme.colorScheme
    val dark = cs.background.luminance() < 0.5f
    val shape = RoundedCornerShape(16.dp)
    // Ungelesen: helle Karte, farbiger Rand und Streifen links. Gelesen: zurückhaltend, ohne Akzent.
    val cardColor = if (dark) { if (unread) cs.surfaceContainerHigh else cs.surfaceContainerLow }
                    else { if (unread) cs.surfaceContainerLowest else cs.surfaceContainer }
    Row(Modifier.fillMaxWidth().clip(shape)
        .background(cardColor)
        .then(if (unread) Modifier.border(1.dp, cs.primary.copy(alpha = if (dark) 0.55f else 0.30f), shape)
              else if (dark) Modifier.border(1.dp, cs.outlineVariant, shape) else Modifier)
        .drawBehind { if (unread) drawRect(Brand.gradient, size = androidx.compose.ui.geometry.Size(4.dp.toPx(), size.height)) }
        .combinedClickable(onClick = onClick, onLongClick = onLong).padding(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically) {
        Box {
            Avatar(m.fromName, if (sent) m.toAddrs else m.fromAddr, 38.dp)
            if (showAccount) vm.accounts.value.firstOrNull { it.id == m.accountId }?.let { a ->
                Box(Modifier.size(12.dp).align(Alignment.BottomEnd).clip(CircleShape).background(cs.surfaceContainerLowest).padding(2.dp)
                    .clip(CircleShape).background(Color(a.color)))
            }
        }
        Spacer(Modifier.width(11.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(name, style = MaterialTheme.typography.titleSmall.copy(fontSize = 15.sp, lineHeight = 19.sp, fontWeight = if (unread) FontWeight.Bold else FontWeight.Medium),
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false),
                    color = if (unread) cs.onSurface else cs.onSurfaceVariant)
                if (t.count > 1) {
                    Spacer(Modifier.width(6.dp))
                    Text("${t.count}", style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant,
                        modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(cs.surfaceContainerHighest).padding(horizontal = 5.dp, vertical = 1.dp))
                }
                Spacer(Modifier.weight(1f))
                if (m.snoozedUntil > 0) Icon(Icons.Outlined.AccessTime, null, Modifier.size(15.dp), tint = cs.tertiary)
                Text("  " + shortTime(m.date), style = MaterialTheme.typography.labelSmall, color = if (unread) cs.primary else cs.onSurfaceVariant)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(m.subject.ifBlank { tr("(kein Betreff)") }, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 18.sp, fontWeight = if (unread) FontWeight.SemiBold else FontWeight.Normal),
                    color = if (unread) cs.onSurface else cs.onSurfaceVariant, modifier = Modifier.weight(1f))
                if (t.hasAttachments) Icon(Icons.Outlined.AttachFile, tr("Anhang"), Modifier.size(14.dp), tint = cs.onSurfaceVariant)
                if (t.flagged) Icon(Icons.Filled.Flag, tr("Markiert"), Modifier.size(14.dp), tint = Color(0xFFE5484D))
                if (unread) { Spacer(Modifier.width(6.dp)); Box(Modifier.size(8.dp).clip(CircleShape).background(Brand.gradient)) }
            }
            // Vorschau: 1 Zeile, kleinere Schrift
            if (m.snippet.isNotBlank()) Text(m.snippet, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, lineHeight = 16.sp),
                color = if (unread) cs.onSurfaceVariant else cs.onSurfaceVariant.copy(alpha = 0.75f))
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
            Text(m.subject.ifBlank { tr("(kein Betreff)") }, style = MaterialTheme.typography.titleMedium, maxLines = 2,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            fun item(label: String, icon: ImageVector, action: () -> Unit): @Composable () -> Unit = {
                ListItem(headlineContent = { Text(label) }, leadingContent = { Icon(icon, null) },
                    modifier = Modifier.combinedClickable(onClick = { action() }))
            }
            item(if (m.pinned) tr("Nicht mehr anheften") else tr("Anheften (oben halten)"), Icons.Outlined.PushPin) { vm.togglePin(m); onDismiss() }()
            item(tr("Zurückstellen …"), Icons.Outlined.Snooze) { onSnooze() }()
            item(tr("Erinnern, falls keine Antwort …"), Icons.Outlined.AccessTime) { remindOpen = true }()
            item(if (m.seen) tr("Als ungelesen markieren") else tr("Als gelesen markieren"), if (m.seen) Icons.Outlined.MarkEmailUnread else Icons.Outlined.MarkEmailRead) { vm.toggleSeen(m); onDismiss() }()
            item(if (m.flagged) tr("Markierung entfernen") else tr("Markieren"), Icons.Outlined.Flag) { vm.toggleFlag(m); onDismiss() }()
            item(tr("Archivieren"), Icons.Outlined.Archive) { vm.archive(m); onDismiss() }()
            item(tr("Verschieben …"), Icons.Outlined.Folder) { moveOpen = !moveOpen }()
            if (moveOpen) vm.folders.value[m.accountId].orEmpty().filter { it.id != m.folderId }.forEach { f ->
                ListItem(headlineContent = { Text(f.displayName) }, leadingContent = { Spacer(Modifier.width(24.dp)) },
                    modifier = Modifier.combinedClickable(onClick = { vm.moveTo(m, f); onDismiss() }))
            }
            item(tr("Löschen"), Icons.Outlined.Delete) { vm.delete(m); onDismiss() }()
            HorizontalDivider()
            Text(tr("Mails von {0} künftig einsortieren als:", m.fromAddr), style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Category.entries.forEach { c ->
                    FilterChip(selected = m.category == c, onClick = { vm.setCategory(m, c); onDismiss() }, label = { Text(c.label) })
                }
            }
            HorizontalDivider()
            if (m.folderRole == FolderRole.JUNK) item(tr("Kein Spam – zurück in den Posteingang"), Icons.Outlined.Inbox) { vm.notSpam(m); onDismiss() }()
            else {
                item(tr("Spam – Absender künftig sperren"), Icons.Outlined.Report) { vm.spam(m); onDismiss() }()
                item(tr("Ganze Domain sperren (@{0})", m.fromAddr.substringAfter('@')), Icons.Outlined.Block) { vm.block(m, domain = true); onDismiss() }()
            }
            item(tr("Regel aus dieser Mail erstellen …"), Icons.Outlined.Rule) {
                onDismiss()
                vm.push(Screen.Rules(app.mailwerk.mail.Rule(name = tr("Mails von {0}", m.fromName.ifBlank { m.fromAddr }),
                    field = app.mailwerk.mail.RuleField.FROM, value = m.fromAddr, action = app.mailwerk.mail.RuleAction.MOVE)))
            }()
        }
    }
    if (remindOpen) TimeChooser(tr("Erinnern, falls bis dahin keine Antwort kommt"), { remindOpen = false }) { t ->
        vm.remindIfNoReply(m, t); remindOpen = false; onDismiss()
    }
}

@Composable
private fun Drawer(vm: MainViewModel, close: () -> Unit) {
    val accounts by vm.accounts.collectAsState()
    val folders by vm.folders.collectAsState()
    val current by vm.mailbox.collectAsState()
    var newFolderFor by remember { mutableStateOf<Long?>(null) }
    var editFolder by remember { mutableStateOf<app.mailwerk.data.Folder?>(null) }
    ModalDrawerSheet {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
            Box(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 12.dp).clip(RoundedCornerShape(24.dp)).background(Brand.gradientDeep).padding(20.dp)) {
                Column {
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.Email, null, tint = Color.White)
                    }
                    Spacer(Modifier.height(12.dp))
                    Text("Mailwerk", style = MaterialTheme.typography.headlineSmall, color = Color.White)
                    Text(if (accounts.size == 1) tr("1 Konto") else tr("{0} Konten", accounts.size), style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                }
            }
            @Composable fun entry(label: String, icon: ImageVector, selected: Boolean, badge: Int = 0, menu: (() -> Unit)? = null, onClick: () -> Unit) =
                NavigationDrawerItem(label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) }, selected = selected, onClick = { onClick(); close() },
                    icon = { Icon(icon, null) }, badge = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (badge > 0) Badge { Text("$badge") }
                            if (menu != null) IconButton(onClick = menu, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.Outlined.MoreVert, tr("Ordner bearbeiten"), Modifier.size(18.dp))
                            }
                        }
                    })
            entry(tr("Alle Posteingänge"), Icons.Outlined.AllInbox, current is Mailbox.Unified,
                folders.values.flatten().filter { it.role == FolderRole.INBOX }.sumOf { it.unread }) { vm.selectMailbox(Mailbox.Unified) }
            entry(tr("Angeheftet"), Icons.Outlined.PushPin, current is Mailbox.Pinned) { vm.selectMailbox(Mailbox.Pinned) }
            entry(tr("Markiert"), Icons.Outlined.Star, current is Mailbox.Flagged) { vm.selectMailbox(Mailbox.Flagged) }
            entry(tr("Zurückgestellt"), Icons.Outlined.Snooze, current is Mailbox.Snoozed) { vm.selectMailbox(Mailbox.Snoozed) }
            entry(tr("Postausgang & Entwürfe"), Icons.Outlined.Outbox, false, vm.db.outbox().size) { vm.push(Screen.Outbox) }
            var expanded by remember { mutableStateOf(vm.prefs.drawerExpanded ?: if (accounts.size == 1) accounts.map { it.id }.toSet() else emptySet()) }
            accounts.forEach { a ->
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                val open = a.id in expanded
                val arrow by androidx.compose.animation.core.animateFloatAsState(if (open) 180f else 0f, label = "pfeil")
                val unread = folders[a.id].orEmpty().filter { it.role == FolderRole.INBOX }.sumOf { it.unread }
                // Postfach-Kopf: antippen klappt die Ordner auf/zu
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                    .clickable {
                        expanded = if (open) expanded - a.id else expanded + a.id
                        vm.prefs.drawerExpanded = expanded
                    }.padding(start = 16.dp, end = 8.dp, top = 10.dp, bottom = 10.dp)) {
                    Box(Modifier.size(10.dp).background(Color(a.color), CircleShape)); Spacer(Modifier.width(8.dp))
                    Text(a.email, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (!open && unread > 0) Badge { Text("$unread") }
                    Icon(Icons.Outlined.ExpandMore, if (open) tr("Einklappen") else tr("Aufklappen"), Modifier.padding(start = 6.dp).size(22.dp).graphicsLayer { rotationZ = arrow })
                }
                AnimatedVisibility(open, enter = expandVertically(tween(240)) + fadeIn(tween(200)), exit = shrinkVertically(tween(220)) + fadeOut(tween(160))) {
                Column {
                folders[a.id].orEmpty().forEach { f ->
                    val icon = when (f.role) {
                        FolderRole.INBOX -> Icons.Outlined.Inbox; FolderRole.SENT -> Icons.AutoMirrored.Outlined.Send
                        FolderRole.ARCHIVE -> Icons.Outlined.Archive; FolderRole.TRASH -> Icons.Outlined.Delete
                        FolderRole.DRAFTS -> Icons.Outlined.Drafts; FolderRole.JUNK -> Icons.Outlined.Report
                        else -> Icons.Outlined.Folder
                    }
                    val sel = (current as? Mailbox.InFolder)?.folder?.id == f.id
                    entry(f.displayName, icon, sel, if (f.role == FolderRole.INBOX) f.unread else 0,
                        menu = if (f.role == null) ({ editFolder = f }) else null) { vm.selectMailbox(Mailbox.InFolder(f, a.email)) }
                }
                NavigationDrawerItem(label = { Text(tr("Neuer Ordner"), color = MaterialTheme.colorScheme.primary) }, selected = false,
                    icon = { Icon(Icons.Outlined.CreateNewFolder, null, tint = MaterialTheme.colorScheme.primary) }, onClick = { newFolderFor = a.id })
                }
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            entry(tr("Konto hinzufügen"), Icons.Outlined.Add, false) { vm.push(Screen.AccountSetup()) }
            newFolderFor?.let { accId -> NewFolderDialog(onDismiss = { newFolderFor = null }) { name, inInbox -> vm.createFolder(accId, name, inInbox); newFolderFor = null } }
            editFolder?.let { f -> EditFolderDialog(vm, f) { editFolder = null } }
            entry(tr("Einstellungen"), Icons.Outlined.Settings, false) { vm.push(Screen.Settings) }
            Spacer(Modifier.height(24.dp))
        }
    }
}
