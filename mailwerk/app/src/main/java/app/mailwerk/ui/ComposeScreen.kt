package app.mailwerk.ui

import app.mailwerk.tr

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.DoneAll
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.ShortText
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.InputChip
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import app.mailwerk.data.OutboxItem
import app.mailwerk.data.OutboxStatus
import java.io.File

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ComposeScreen(vm: MainViewModel, init: ComposeInit, snackHost: SnackbarHostState) {
    val ctx = LocalContext.current
    val accounts = vm.accounts.value
    var accountId by remember { mutableStateOf(init.accountId ?: accounts.firstOrNull()?.id ?: 0L) }
    var to by remember { mutableStateOf(TextFieldValue(init.to)) }
    var cc by remember { mutableStateOf(init.cc) }
    var bcc by remember { mutableStateOf(init.bcc) }
    var showCc by remember { mutableStateOf(init.cc.isNotBlank() || init.bcc.isNotBlank()) }
    var subject by remember { mutableStateOf(init.subject) }
    var body by remember { mutableStateOf(TextFieldValue(init.body, TextRange(0))) }
    val atts = remember { mutableStateListOf<String>().apply { addAll(init.attachments.map { copyToCache(ctx, it) }) } }
    var accountMenu by remember { mutableStateOf(false) }
    var moreMenu by remember { mutableStateOf(false) }
    var templatesOpen by remember { mutableStateOf(false) }
    var laterOpen by remember { mutableStateOf(false) }
    var remindDays by remember { mutableStateOf(0) }
    var readReceipt by remember { mutableStateOf(false) }
    var remindOpen by remember { mutableStateOf(false) }
    var confirmDiscard by remember { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        uris.forEach { atts += copyToCache(ctx, it.toString()) }
    }

    fun item() = OutboxItem(id = init.outboxId, accountId = accountId, to = to.text.trim().trimEnd(','), cc = cc.trim(), bcc = bcc.trim(),
        subject = subject, body = body.text, attachments = atts.joinToString("\n"), inReplyTo = init.inReplyTo,
        references = init.references, sendAt = 0, status = OutboxStatus.DRAFT, remindIfNoReplyDays = remindDays, readReceipt = readReceipt)

    fun valid(): Boolean {
        if (to.text.isBlank()) { vm.snack(tr("Bitte einen Empfänger angeben")); return false }
        if (app.mailwerk.data.Repository.parseAddrs(to.text).isEmpty()) { vm.snack(tr("Empfängeradresse ungültig")); return false }
        if (subject.isBlank() && body.text.isBlank()) { vm.snack(tr("Die Nachricht ist leer")); return false }
        return true
    }
    val changed = to.text != init.to || subject != init.subject || body.text != init.body || atts.size != init.attachments.size

    BackHandler { if (changed) confirmDiscard = true else vm.pop() }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(if (init.inReplyTo != null) tr("Antworten") else tr("Neue E-Mail"), style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = { if (changed) confirmDiscard = true else vm.pop() }) { Icon(Icons.Outlined.Close, tr("Schließen")) } },
                actions = {
                    IconButton(onClick = { picker.launch("*/*") }) { Icon(Icons.Outlined.AttachFile, tr("Anhang")) }
                    Row(Modifier.padding(horizontal = 4.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(16.dp)).background(Brand.gradient)
                        .clickable { if (valid()) vm.send(item()) }.padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Icon(Icons.AutoMirrored.Outlined.Send, null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp)); Text(tr("Senden"), color = Color.White, style = MaterialTheme.typography.labelLarge)
                    }
                    IconButton(onClick = { moreMenu = true }) { Icon(Icons.Outlined.MoreVert, tr("Mehr")) }
                    DropdownMenu(moreMenu, { moreMenu = false }) {
                        DropdownMenuItem(text = { Text(tr("Später senden …")) }, leadingIcon = { Icon(Icons.Outlined.Schedule, null) },
                            onClick = { moreMenu = false; if (valid()) laterOpen = true })
                        DropdownMenuItem(text = { Text(tr("Vorlage einfügen")) }, leadingIcon = { Icon(Icons.Outlined.ShortText, null) },
                            onClick = { moreMenu = false; templatesOpen = true })
                        DropdownMenuItem(text = { Text(if (remindDays > 0) tr("Erinnerung: nach {0} Tag(en)", remindDays) else tr("Erinnern, falls keine Antwort")) },
                            leadingIcon = { Icon(Icons.Outlined.NotificationsActive, null) }, onClick = { moreMenu = false; remindOpen = true })
                        DropdownMenuItem(text = { Text(if (readReceipt) tr("✓ Lesebestätigung angefordert") else tr("Lesebestätigung anfordern")) },
                            leadingIcon = { Icon(Icons.Outlined.DoneAll, null) }, onClick = { moreMenu = false; readReceipt = !readReceipt })
                        DropdownMenuItem(text = { Text(tr("Als Entwurf speichern")) }, leadingIcon = { Icon(Icons.Outlined.Save, null) },
                            onClick = { moreMenu = false; vm.saveDraft(item()); vm.pop() })
                    }
                })
        },
        snackbarHost = { SnackbarHost(snackHost) },
    ) { pad ->
        val fieldColors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent)
        val bodyColors = TextFieldDefaults.colors(focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent)
        Column(Modifier.padding(pad).imePadding().fillMaxSize().verticalScroll(rememberScrollState())) {
            // Absender
            val acc = accounts.firstOrNull { it.id == accountId }
            Row(Modifier.fillMaxWidth().clickable(enabled = accounts.size > 1) { accountMenu = true }.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Text(tr("Von  "), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(acc?.let { "${it.name} <${it.email}>" } ?: tr("Kein Konto"), Modifier.weight(1f))
                DropdownMenu(accountMenu, { accountMenu = false }) {
                    accounts.forEach { a -> DropdownMenuItem(text = { Text(a.email) }, onClick = { accountId = a.id; accountMenu = false }) }
                }
            }
            HorizontalDivider()
            Row {
                TextField(to, { to = it }, label = { Text(tr("An")) }, modifier = Modifier.weight(1f), colors = fieldColors,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                IconButton(onClick = { showCc = !showCc }, modifier = Modifier.padding(top = 8.dp)) {
                    Icon(if (showCc) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, "Cc/Bcc")
                }
            }
            // Kontaktvorschläge (häufigste zuerst)
            val token = to.text.substringAfterLast(',').trim()
            val sugg = remember(token) { if (token.length >= 2 && !token.contains('>')) vm.db.suggestContacts(token) else emptyList() }
            sugg.forEach { c ->
                ListItem(headlineContent = { Text(c.name.ifBlank { c.address }) }, supportingContent = { Text(c.address) },
                    leadingContent = { Avatar(c.name, c.address, 32.dp) },
                    modifier = Modifier.clickable {
                        val prefix = to.text.substringBeforeLast(',', "").let { if (it.isBlank()) "" else "$it, " }
                        val entry = if (c.name.isBlank()) c.address else "${c.name} <${c.address}>"
                        val nt = "$prefix$entry, "
                        to = TextFieldValue(nt, TextRange(nt.length))
                    })
            }
            if (showCc) {
                TextField(cc, { cc = it }, label = { Text("Cc") }, modifier = Modifier.fillMaxWidth(), colors = fieldColors,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                TextField(bcc, { bcc = it }, label = { Text("Bcc") }, modifier = Modifier.fillMaxWidth(), colors = fieldColors,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
            }
            TextField(subject, { subject = it }, label = { Text(tr("Betreff")) }, modifier = Modifier.fillMaxWidth(), colors = fieldColors,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
            if (atts.isNotEmpty()) FlowRow(Modifier.padding(horizontal = 12.dp)) {
                atts.forEach { u ->
                    InputChip(selected = false, onClick = { atts.remove(u) }, label = { Text(File(Uri.parse(u).path ?: u).name) },
                        trailingIcon = { Icon(Icons.Outlined.Close, tr("Entfernen"), Modifier.size(16.dp)) }, modifier = Modifier.padding(4.dp))
                }
            }
            if (readReceipt) Text(tr("✓✓ Lesebestätigung wird angefordert – funktioniert, wenn das Programm des Empfängers sie unterstützt und er zustimmt."),
                style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            if (remindDays > 0) Text(tr("🔔 Erinnerung, falls nach {0} Tag(en) keine Antwort kommt", remindDays),
                style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            HorizontalDivider()
            TextField(body, { body = it }, placeholder = { Text(tr("Nachricht verfassen")) }, modifier = Modifier.fillMaxWidth().heightIn(min = 320.dp),
                colors = bodyColors, keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences))
        }
    }

    if (templatesOpen) AlertDialog(onDismissRequest = { templatesOpen = false }, confirmButton = {},
        dismissButton = { TextButton(onClick = { templatesOpen = false; vm.push(Screen.Templates) }) { Text(tr("Vorlagen bearbeiten")) } },
        title = { Text(tr("Vorlage einfügen")) },
        text = {
            Column {
                vm.db.templates().forEach { t ->
                    ListItem(headlineContent = { Text(t.name) }, supportingContent = { Text(t.body, maxLines = 2) },
                        modifier = Modifier.clickable {
                            val pos = body.selection.start
                            val nt = body.text.substring(0, pos) + t.body + body.text.substring(pos)
                            body = TextFieldValue(nt, TextRange(pos + t.body.length)); templatesOpen = false
                        })
                }
            }
        })
    if (laterOpen) TimeChooser(tr("Später senden"), { laterOpen = false }) { t -> laterOpen = false; vm.send(item(), later = t) }
    if (remindOpen) AlertDialog(onDismissRequest = { remindOpen = false }, confirmButton = {},
        dismissButton = { TextButton(onClick = { remindDays = 0; remindOpen = false }) { Text(tr("Keine Erinnerung")) } },
        title = { Text(tr("Erinnern, falls keine Antwort kommt nach …")) },
        text = {
            Column { listOf(1, 2, 3, 7, 14).forEach { d ->
                ListItem(headlineContent = { Text(if (d == 1) tr("1 Tag") else tr("{0} Tagen", d)) }, modifier = Modifier.clickable { remindDays = d; remindOpen = false })
            } }
        })
    if (confirmDiscard) AlertDialog(onDismissRequest = { confirmDiscard = false },
        title = { Text(tr("Nachricht verwerfen?")) },
        confirmButton = { TextButton(onClick = { confirmDiscard = false; vm.saveDraft(item()); vm.pop() }) { Text(tr("Als Entwurf speichern")) } },
        dismissButton = {
            TextButton(onClick = {
                confirmDiscard = false
                if (init.outboxId != 0L) vm.db.deleteOutbox(init.outboxId)
                vm.pop()
            }) { Text(tr("Verwerfen")) }
        })
}

/** Kopiert Anhänge in den App-Speicher, damit sie auch beim zeitversetzten Senden noch lesbar sind. */
private fun copyToCache(ctx: Context, uriStr: String): String {
    val uri = Uri.parse(uriStr)
    if (uri.scheme == "file") return uriStr
    return runCatching {
        var name = "anhang"
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0)?.let { name = it } }
        val dir = File(ctx.filesDir, "outgoing/${System.nanoTime()}").apply { mkdirs() }
        val f = File(dir, name.replace(Regex("[/\\\\]"), "_"))
        ctx.contentResolver.openInputStream(uri)!!.use { i -> f.outputStream().use { i.copyTo(it) } }
        Uri.fromFile(f).toString()
    }.getOrDefault(uriStr)
}
