package app.mailwerk.ui

import app.mailwerk.tr

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Forward
import androidx.compose.material.icons.automirrored.outlined.Reply
import androidx.compose.material.icons.automirrored.outlined.ReplyAll
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.Snooze
import androidx.compose.material.icons.outlined.Unsubscribe
import androidx.compose.material3.AssistChip
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import app.mailwerk.data.Attachment
import app.mailwerk.data.Message
import app.mailwerk.mail.HtmlSanitizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThreadScreen(vm: MainViewModel, threadKey: String, snackHost: SnackbarHostState) {
    val changes by vm.db.changes.collectAsState()
    val msgs by produceState(emptyList<Message>(), changes, threadKey) { value = withContext(Dispatchers.IO) { vm.db.thread(threadKey) } }
    var actions by remember { mutableStateOf<Message?>(null) }
    var snooze by remember { mutableStateOf<Message?>(null) }
    LaunchedEffect(threadKey) { vm.markThreadSeen(threadKey) }
    val last = msgs.lastOrNull { it.folderRole != "sent" } ?: msgs.lastOrNull()
    val listState = rememberLazyListState()
    LaunchedEffect(msgs.size) { if (msgs.size > 1) listState.scrollToItem(msgs.size - 1) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(title = {}, colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
                navigationIcon = { IconButton(onClick = { vm.pop() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, tr("Zurück")) } },
                actions = {
                    last?.let { m ->
                        IconButton(onClick = { vm.archive(m); vm.pop() }) { Icon(Icons.Outlined.Archive, tr("Archivieren")) }
                        IconButton(onClick = { snooze = m }) { Icon(Icons.Outlined.Snooze, tr("Zurückstellen")) }
                        IconButton(onClick = { vm.delete(m); vm.pop() }) { Icon(Icons.Outlined.Delete, tr("Löschen")) }
                        IconButton(onClick = { actions = m }) { Icon(Icons.Outlined.MoreVert, tr("Mehr")) }
                    }
                })
        },
        bottomBar = {
            last?.let { m ->
                Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background).navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1f).height(52.dp).clip(RoundedCornerShape(18.dp)).background(Brand.gradient).clickable { vm.reply(m, false) },
                        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.AutoMirrored.Outlined.Reply, null, tint = Color.White); Spacer(Modifier.width(8.dp))
                        Text(tr("Antworten"), color = Color.White, style = MaterialTheme.typography.titleMedium)
                    }
                    RoundAction(Icons.AutoMirrored.Outlined.ReplyAll, tr("Allen antworten")) { vm.reply(m, true) }
                    RoundAction(Icons.AutoMirrored.Outlined.Forward, tr("Weiterleiten")) { vm.forward(m) }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackHost) },
    ) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize(), state = listState) {
            item {
                Column(Modifier.padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 10.dp)) {
                    msgs.firstOrNull()?.let { f ->
                        val c = categoryColor(f.category)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(f.category.label, color = c, style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(c.copy(alpha = 0.12f)).padding(horizontal = 8.dp, vertical = 3.dp))
                            if (msgs.size > 1) Text(tr("  {0} Nachrichten", msgs.size), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(msgs.firstOrNull()?.subject?.ifBlank { tr("(kein Betreff)") } ?: "", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
                    if (msgs.any { it.pinned }) Icon(Icons.Filled.PushPin, tr("Angeheftet"), tint = MaterialTheme.colorScheme.tertiary)
                    if (msgs.any { it.flagged }) Icon(Icons.Filled.Flag, tr("Markiert"), tint = Color(0xFFE53935))
                }
                }
            }
            items(msgs, key = { it.id }) { m -> MessageCard(vm, m, expandedInitially = m == msgs.last() || !m.seen || msgs.size <= 2) }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
    actions?.let { m -> QuickActionsSheet(vm, m, onDismiss = { actions = null }, onSnooze = { actions = null; snooze = m }) }
    snooze?.let { m -> TimeChooser(tr("Zurückstellen bis …"), { snooze = null }) { t -> vm.snooze(m, t); snooze = null; vm.pop() } }
}

@Composable
private fun MessageCard(vm: MainViewModel, m: Message, expandedInitially: Boolean) {
    var expanded by remember(m.id) { mutableStateOf(expandedInitially) }
    var showDetails by remember { mutableStateOf(false) }
    var loadImages by remember(m.id) { mutableStateOf(!vm.prefs.blockRemoteImages) }
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val dark = isDark(vm.prefs.theme)
    val sanitized = remember(m.id, loadImages, dark, expanded) {
        if (!expanded) null
        else if (m.bodyHtml != null) HtmlSanitizer.sanitize(m.bodyHtml, blockRemote = !loadImages, darkMode = dark)
        else HtmlSanitizer.Result(HtmlSanitizer.textToHtml(m.bodyText ?: "", dark), 0, 0)
    }
    val atts by produceState(emptyList<Attachment>(), m.id) { value = withContext(Dispatchers.IO) { vm.db.attachments(m.id) } }

    Card(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp), shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = if (dark) MaterialTheme.colorScheme.surfaceContainer else MaterialTheme.colorScheme.surfaceContainerLowest)) {
        Row(Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(m.fromName, m.fromAddr, 42.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(m.fromName.ifBlank { m.fromAddr }, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (expanded) Text(tr("an {0}", m.toAddrs) + if (m.ccAddrs.isNotBlank()) tr(", cc {0}", m.ccAddrs) else "",
                    style = MaterialTheme.typography.bodySmall, maxLines = if (showDetails) 10 else 1, overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.clickable { showDetails = !showDetails })
                else Text(m.snippet, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(shortTime(m.date), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (showDetails && expanded) Column(Modifier.padding(horizontal = 12.dp)) {
            Text(tr("Von: {0} <{1}>", m.fromName, m.fromAddr), style = MaterialTheme.typography.bodySmall)
            Text(tr("Datum: {0}", MainViewModel.fmt(m.date)), style = MaterialTheme.typography.bodySmall)
            if (m.replyTo.isNotBlank()) Text(tr("Antwort an: {0}", m.replyTo), style = MaterialTheme.typography.bodySmall)
        }
        if (m.readAt > 0) Row(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp).clip(RoundedCornerShape(10.dp))
            .background(Brand.Notify.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(androidx.compose.material.icons.Icons.Outlined.DoneAll, null, Modifier.size(16.dp), tint = Brand.Notify)
            Spacer(Modifier.width(6.dp))
            Text(tr("Gelesen am {0}", MainViewModel.fmt(m.readAt)), style = MaterialTheme.typography.labelMedium, color = Brand.Notify)
        }
        if (m.receiptTo.isNotBlank()) Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.tertiaryContainer).padding(12.dp)) {
            Text(tr("{0} bittet um eine Lesebestätigung.", m.fromName.ifBlank { m.fromAddr }), style = MaterialTheme.typography.bodyMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { vm.sendReadReceipt(m) }) { Text(tr("Bestätigung senden")) }
                TextButton(onClick = { vm.db.clearReceiptRequest(m.id) }) { Text(tr("Ignorieren")) }
            }
        }
        InviteCard(vm, m)
        JoinCalendarCard(vm, m)
        if (expanded && sanitized != null) {
            // Datenschutz-Leiste: blockierte Tracker, Bilder, Abmelden
            val chips = sanitized.trackers > 0 || sanitized.remoteImages > 0 || m.unsubscribe != null
            if (chips) Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (sanitized.trackers > 0) AssistChip(onClick = { vm.snack(tr("{0} Spionage-Pixel entfernt – der Absender erfährt nicht, dass du die Mail geöffnet hast.", sanitized.trackers)) },
                    label = { Text(tr("{0} Tracker blockiert", sanitized.trackers)) }, leadingIcon = { Icon(Icons.Outlined.Shield, null, Modifier.size(18.dp), tint = Color(0xFF2E7D32)) })
                if (sanitized.remoteImages > 0) AssistChip(onClick = { loadImages = true },
                    label = { Text(tr("Bilder laden ({0})", sanitized.remoteImages)) }, leadingIcon = { Icon(Icons.Outlined.Image, null, Modifier.size(18.dp)) })
                if (m.unsubscribe != null) AssistChip(onClick = { vm.unsubscribe(m) { openUrl(ctx, it) } },
                    label = { Text(tr("Abmelden")) }, leadingIcon = { Icon(Icons.Outlined.Unsubscribe, null, Modifier.size(18.dp)) })
            }
            MailWebView(sanitized.html)
            if (atts.isNotEmpty()) Column(Modifier.padding(12.dp)) {
                atts.forEach { a ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)
                        .background(MaterialTheme.colorScheme.surfaceContainerHigh, RoundedCornerShape(14.dp))
                        .clickable {
                            scope.launch {
                                vm.snack(tr("Lade {0} …", a.name))
                                runCatching { vm.repo.downloadAttachment(m, a) }
                                    .onSuccess { f -> openFile(ctx, f, a.mime) }
                                    .onFailure { vm.snack(tr("Download fehlgeschlagen: {0}", app.mailwerk.mail.friendly(it))) }
                            }
                        }.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.AttachFile, null); Spacer(Modifier.width(8.dp))
                        Text(a.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(humanSize(a.size), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun RoundAction(icon: androidx.compose.ui.graphics.vector.ImageVector, desc: String, onClick: () -> Unit) {
    Box(Modifier.size(52.dp).clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable(onClick = onClick),
        contentAlignment = Alignment.Center) { Icon(icon, desc, tint = MaterialTheme.colorScheme.primary) }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun MailWebView(html: String) {
    Box(Modifier.fillMaxWidth().heightIn(min = 40.dp)) {
        AndroidView(factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = false // niemals JavaScript aus Mails ausführen
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = false
                settings.builtInZoomControls = true
                settings.displayZoomControls = false
                settings.blockNetworkImage = false
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        openUrl(view.context, request.url.toString()); return true
                    }
                }
            }
        }, update = { it.loadDataWithBaseURL(null, html, "text/html", "utf-8", null) },
            modifier = Modifier.fillMaxWidth())
    }
}

fun openUrl(ctx: Context, url: String) {
    try {
        if (url.startsWith("mailto:")) ctx.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse(url)).setPackage(ctx.packageName))
        else ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (_: ActivityNotFoundException) {}
}

private fun openFile(ctx: Context, f: java.io.File, mime: String) {
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", f)
    val i = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime.ifBlank { "*/*" }).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    try { ctx.startActivity(Intent.createChooser(i, f.name)) } catch (_: ActivityNotFoundException) {}
}

/** Kalender-Einladung in der Mail: Termin + Status im Familienkalender (in der Farbe des Empfängers). */
@Composable
private fun InviteCard(vm: MainViewModel, m: Message) {
    val changes by vm.db.changes.collectAsState()
    val inv by produceState<app.mailwerk.data.Db.Invite?>(null, m.id, changes) { value = withContext(Dispatchers.IO) { vm.db.invite(m.id) } }
    val i = inv ?: return
    val events = remember(i.ics) { runCatching { app.mailwerk.mail.Ics.parse(i.ics) }.getOrDefault(emptyList()).filter { !it.isReply } }
    val ev = events.firstOrNull() ?: return
    val fam = vm.repo.family
    val detected = remember(i.ics) { app.mailwerk.mail.TextDates.isDetected(i.ics) }
    if (detected && !fam.connected) return // Texterkennung nur zeigen, wenn ein Familienkalender verbunden ist
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val member = fam.memberFor(m.accountId)
    val accent = member?.let { Color(it.color) } ?: MaterialTheme.colorScheme.primary
    fun add(memberId: String? = null) {
        busy = true
        scope.launch { val r = vm.repo.addInviteToCalendar(m.id, memberId); busy = false; vm.snack(r) }
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clip(RoundedCornerShape(18.dp))
        .background(accent.copy(alpha = 0.12f)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("📅", style = MaterialTheme.typography.titleMedium); Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text((if (ev.isCancel) tr("Abgesagt: ") else "") + ev.summary.ifBlank { tr("Termin") }, fontWeight = FontWeight.SemiBold,
                    maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (detected) Text(tr("Im Mailtext erkannt"), style = MaterialTheme.typography.labelSmall, color = accent)
                Text(inviteWhen(ev), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (ev.location.isNotBlank()) Text("📍 " + ev.location, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        when {
            i.status == app.mailwerk.data.FamilyCalendar.STATUS_ADDED || i.status == app.mailwerk.data.FamilyCalendar.STATUS_UPDATED ||
                i.status == app.mailwerk.data.FamilyCalendar.STATUS_CANCELLED -> Row(verticalAlignment = Alignment.CenterVertically) {
                member?.let { MemberDot(it) }; Spacer(Modifier.width(6.dp))
                Text(when (i.status) {
                    app.mailwerk.data.FamilyCalendar.STATUS_CANCELLED -> tr("Absage im Familienkalender übernommen")
                    app.mailwerk.data.FamilyCalendar.STATUS_UPDATED -> tr("Im Familienkalender aktualisiert · {0}", i.info)
                    else -> tr("Im Familienkalender eingetragen · {0}", i.info)
                }, style = MaterialTheme.typography.labelLarge, color = accent)
            }
            !fam.connected -> TextButton(onClick = { vm.push(Screen.FamilyCalendar) }) { Text(tr("Mit Familienkalender verbinden")) }
            member == null -> {
                Text(tr("Für wen ist der Termin?"), style = MaterialTheme.typography.bodySmall)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    fam.members.forEach { mem -> MemberChip(mem, false) { if (!busy) add(mem.id) } }
                }
            }
            else -> Row(verticalAlignment = Alignment.CenterVertically) {
                if (i.info.isNotBlank() && i.status == app.mailwerk.data.FamilyCalendar.STATUS_ERROR)
                    Text(i.info, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, maxLines = 2)
                else Spacer(Modifier.weight(1f))
                TextButton(onClick = { add() }, enabled = !busy) {
                    MemberDot(member); Spacer(Modifier.width(6.dp))
                    Text(if (i.status == app.mailwerk.data.FamilyCalendar.STATUS_ERROR) tr("Erneut versuchen") else tr("In Familienkalender eintragen"))
                }
            }
        }
    }
}

private fun inviteWhen(ev: app.mailwerk.mail.IcsEvent): String {
    val loc = java.util.Locale.getDefault()
    val day = java.time.format.DateTimeFormatter.ofPattern("EE, d. MMM yyyy", loc)
    val time = java.time.format.DateTimeFormatter.ofPattern("HH:mm", loc)
    return if (ev.allDay) {
        if (ev.end.toLocalDate() == ev.start.toLocalDate()) tr("{0} · ganztägig", ev.start.format(day))
        else "${ev.start.format(day)} – ${ev.end.format(day)}"
    } else if (ev.end == ev.start) "${ev.start.format(day)} · ${ev.start.format(time)}"
    else if (ev.end.toLocalDate() == ev.start.toLocalDate()) "${ev.start.format(day)} · ${ev.start.format(time)}–${ev.end.format(time)}"
    else "${ev.start.format(day)} ${ev.start.format(time)} – ${ev.end.format(day)} ${ev.end.format(time)}"
}

/** Mail enthält eine Einladung in den Familienkalender -> mit einem Tipp beitreten. */
@Composable
private fun JoinCalendarCard(vm: MainViewModel, m: Message) {
    val fam = vm.repo.family
    val changes by vm.db.changes.collectAsState()
    var joined by remember { mutableStateOf(false) }
    val found = remember(m.id, changes) {
        if (fam.connected) null else fam.findInvite(null, listOf((m.fromName.ifBlank { m.fromAddr }) to (m.bodyText ?: "")))
    } ?: return
    if (joined) return
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).clip(RoundedCornerShape(18.dp))
        .background(MaterialTheme.colorScheme.primaryContainer).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(tr("📅 Einladung in den Familienkalender"), fontWeight = FontWeight.SemiBold)
        Text(tr("Mit Mailwerk verbinden: Termine aus deinen Mails landen dann automatisch im gemeinsamen Kalender."),
            style = MaterialTheme.typography.bodySmall)
        TextButton(enabled = !busy, onClick = {
            busy = true
            scope.launch {
                val r = withContext(Dispatchers.IO) { runCatching { fam.connect(found.url ?: "", found.code, vm.db.accounts()) } }
                busy = false
                r.onSuccess {
                    joined = true
                    vm.snack(tr("Mit „{0}“ verbunden", fam.groupName))
                    vm.push(Screen.FamilyCalendar) // Postfächer den Personen zuordnen
                }.onFailure { vm.snack(it.message ?: tr("Verbindung fehlgeschlagen")) }
            }
        }) { Text(tr("Familienkalender verbinden")) }
    }
}
