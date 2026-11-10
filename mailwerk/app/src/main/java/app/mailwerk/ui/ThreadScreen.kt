package app.mailwerk.ui

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
        topBar = {
            TopAppBar(title = {},
                navigationIcon = { IconButton(onClick = { vm.pop() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Zurück") } },
                actions = {
                    last?.let { m ->
                        IconButton(onClick = { vm.archive(m); vm.pop() }) { Icon(Icons.Outlined.Archive, "Archivieren") }
                        IconButton(onClick = { snooze = m }) { Icon(Icons.Outlined.Snooze, "Zurückstellen") }
                        IconButton(onClick = { vm.delete(m); vm.pop() }) { Icon(Icons.Outlined.Delete, "Löschen") }
                        IconButton(onClick = { actions = m }) { Icon(Icons.Outlined.MoreVert, "Mehr") }
                    }
                })
        },
        bottomBar = {
            last?.let { m ->
                BottomAppBar {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                        TextButton(onClick = { vm.reply(m, false) }) { Icon(Icons.AutoMirrored.Outlined.Reply, null); Spacer(Modifier.width(6.dp)); Text("Antworten") }
                        TextButton(onClick = { vm.reply(m, true) }) { Icon(Icons.AutoMirrored.Outlined.ReplyAll, null); Spacer(Modifier.width(6.dp)); Text("Allen") }
                        TextButton(onClick = { vm.forward(m) }) { Icon(Icons.AutoMirrored.Outlined.Forward, null); Spacer(Modifier.width(6.dp)); Text("Weiterleiten") }
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snackHost) },
    ) { pad ->
        LazyColumn(Modifier.padding(pad).fillMaxSize(), state = listState) {
            item {
                Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(msgs.firstOrNull()?.subject?.ifBlank { "(kein Betreff)" } ?: "", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                    if (msgs.any { it.pinned }) Icon(Icons.Filled.PushPin, "Angeheftet", tint = MaterialTheme.colorScheme.tertiary)
                    if (msgs.any { it.flagged }) Icon(Icons.Filled.Flag, "Markiert", tint = Color(0xFFE53935))
                }
            }
            items(msgs, key = { it.id }) { m -> MessageCard(vm, m, expandedInitially = m == msgs.last() || !m.seen || msgs.size <= 2) }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
    actions?.let { m -> QuickActionsSheet(vm, m, onDismiss = { actions = null }, onSnooze = { actions = null; snooze = m }) }
    snooze?.let { m -> TimeChooser("Zurückstellen bis …", { snooze = null }) { t -> vm.snooze(m, t); snooze = null; vm.pop() } }
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

    Card(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Row(Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(m.fromName, m.fromAddr, 36.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(m.fromName.ifBlank { m.fromAddr }, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (expanded) Text("an ${m.toAddrs}" + if (m.ccAddrs.isNotBlank()) ", cc ${m.ccAddrs}" else "",
                    style = MaterialTheme.typography.bodySmall, maxLines = if (showDetails) 10 else 1, overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.clickable { showDetails = !showDetails })
                else Text(m.snippet, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(shortTime(m.date), style = MaterialTheme.typography.labelSmall)
        }
        if (showDetails && expanded) Column(Modifier.padding(horizontal = 12.dp)) {
            Text("Von: ${m.fromName} <${m.fromAddr}>", style = MaterialTheme.typography.bodySmall)
            Text("Datum: ${MainViewModel.fmt(m.date)}", style = MaterialTheme.typography.bodySmall)
            if (m.replyTo.isNotBlank()) Text("Antwort an: ${m.replyTo}", style = MaterialTheme.typography.bodySmall)
        }
        if (expanded && sanitized != null) {
            // Datenschutz-Leiste: blockierte Tracker, Bilder, Abmelden
            val chips = sanitized.trackers > 0 || sanitized.remoteImages > 0 || m.unsubscribe != null
            if (chips) Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (sanitized.trackers > 0) AssistChip(onClick = { vm.snack("${sanitized.trackers} Spionage-Pixel entfernt – der Absender erfährt nicht, dass du die Mail geöffnet hast.") },
                    label = { Text("${sanitized.trackers} Tracker blockiert") }, leadingIcon = { Icon(Icons.Outlined.Shield, null, Modifier.size(18.dp), tint = Color(0xFF2E7D32)) })
                if (sanitized.remoteImages > 0) AssistChip(onClick = { loadImages = true },
                    label = { Text("Bilder laden (${sanitized.remoteImages})") }, leadingIcon = { Icon(Icons.Outlined.Image, null, Modifier.size(18.dp)) })
                if (m.unsubscribe != null) AssistChip(onClick = { vm.unsubscribe(m) { openUrl(ctx, it) } },
                    label = { Text("Abmelden") }, leadingIcon = { Icon(Icons.Outlined.Unsubscribe, null, Modifier.size(18.dp)) })
            }
            MailWebView(sanitized.html)
            if (atts.isNotEmpty()) Column(Modifier.padding(12.dp)) {
                atts.forEach { a ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)
                        .background(MaterialTheme.colorScheme.surfaceContainerHighest, RoundedCornerShape(10.dp))
                        .clickable {
                            scope.launch {
                                vm.snack("Lade ${a.name} …")
                                runCatching { vm.repo.downloadAttachment(m, a) }
                                    .onSuccess { f -> openFile(ctx, f, a.mime) }
                                    .onFailure { vm.snack("Download fehlgeschlagen: ${app.mailwerk.mail.friendly(it)}") }
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
