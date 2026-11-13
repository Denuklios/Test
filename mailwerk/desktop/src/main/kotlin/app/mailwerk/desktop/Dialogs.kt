package app.mailwerk.desktop

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.rememberWindowState
import app.mailwerk.data.Account
import app.mailwerk.data.Security
import app.mailwerk.mail.AutoConfig
import app.mailwerk.mail.friendly
import app.mailwerk.tr
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** Eigenes Fenster zum Schreiben (mehrere gleichzeitig möglich). */
@Composable
fun ComposerWindow(st: AppState, d: Draft, dark: Boolean, onClose: () -> Unit) {
    val accounts = remember { st.store.accounts() }
    var accId by remember { mutableStateOf(d.accountId ?: accounts.firstOrNull()?.id) }
    var to by remember { mutableStateOf(d.to) }
    var cc by remember { mutableStateOf(d.cc) }
    var bcc by remember { mutableStateOf("") }
    var showCc by remember { mutableStateOf(d.cc.isNotBlank()) }
    var subject by remember { mutableStateOf(d.subject) }
    var body by remember { mutableStateOf(d.body) }
    var files by remember { mutableStateOf(listOf<File>()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pickFrom by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun send() {
        if (to.isBlank() || busy) return
        busy = true; error = null
        scope.launch {
            runCatching { st.repo.send(accId!!, to, cc, bcc, subject, body, files, d.inReplyTo, d.references) }
                .onSuccess { st.snack = tr("Gesendet ✓"); onClose() }
                .onFailure { error = friendly(it) }
            busy = false
        }
    }
    fun attach() {
        val fd = java.awt.FileDialog(null as java.awt.Frame?, tr("Anhang auswählen"), java.awt.FileDialog.LOAD).apply { isMultipleMode = true; isVisible = true }
        files = files + fd.files.toList()
    }

    Window(onCloseRequest = onClose, title = subject.ifBlank { tr("Neue E-Mail") } + " – Mailwerk", icon = appIcon(),
        state = rememberWindowState(width = 760.dp, height = 680.dp),
        onPreviewKeyEvent = { e -> if (e.type == KeyEventType.KeyDown && e.isCtrlPressed && e.key == Key.Enter) { send(); true } else false }) {
        MailwerkTheme(dark) {
            Surface(Modifier.fillMaxSize()) {
                Column(Modifier.fillMaxSize().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("Von:"), Modifier.width(60.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Column {
                            TextButton(onClick = { pickFrom = true }) { Text(accounts.firstOrNull { it.id == accId }?.let { "${it.name} <${it.email}>" } ?: "") }
                            DropdownMenu(pickFrom, { pickFrom = false }) {
                                accounts.forEach { a -> DropdownMenuItem({ Text("${a.name} <${a.email}>") }, { accId = a.id; pickFrom = false }) }
                            }
                        }
                        Spacer(Modifier.weight(1f))
                        if (!showCc) TextButton(onClick = { showCc = true }) { Text(tr("Cc/Bcc")) }
                    }
                    RecipientField(st, tr("An"), to) { to = it }
                    if (showCc) { RecipientField(st, tr("Cc"), cc) { cc = it }; RecipientField(st, tr("Bcc"), bcc) { bcc = it } }
                    OutlinedTextField(subject, { subject = it }, Modifier.fillMaxWidth(), label = { Text(tr("Betreff")) }, singleLine = true)
                    OutlinedTextField(body, { body = it }, Modifier.fillMaxWidth().weight(1f), label = { Text(tr("Nachricht")) })
                    if (files.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        files.forEach { f -> AssistChip(onClick = { files = files - f }, label = { Text(f.name + "  ✕") },
                            leadingIcon = { Icon(Icons.Outlined.AttachFile, null, Modifier.size(16.dp)) }) }
                    }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = ::send, enabled = !busy && to.isNotBlank()) { Text(tr("Senden")) }
                        OutlinedButton(onClick = ::attach) { Icon(Icons.Outlined.AttachFile, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Anhang")) }
                        if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.weight(1f))
                        Text(tr("Strg+Enter sendet"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/** Empfängerfeld mit Vorschlägen aus bisherigen Kontakten */
@Composable
private fun RecipientField(st: AppState, label: String, value: String, onChange: (String) -> Unit) {
    val current = value.substringAfterLast(',').trim()
    val suggestions = remember(current) { st.store.suggestContacts(current) }
    var dismissed by remember(current) { mutableStateOf(false) }
    Column {
        OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, singleLine = true)
        DropdownMenu(suggestions.isNotEmpty() && !dismissed && current.length >= 2, { dismissed = true }, properties = androidx.compose.ui.window.PopupProperties(focusable = false)) {
            suggestions.forEach { (addr, name) ->
                DropdownMenuItem({ Text(if (name.isBlank()) addr else "$name <$addr>") }, {
                    val head = value.substringBeforeLast(',', "").let { if (it.isBlank()) "" else "$it, " }
                    onChange(head + (if (name.isBlank()) addr else "$name <$addr>") + ", "); dismissed = true
                })
            }
        }
    }
}

/** Konto hinzufügen bzw. bearbeiten – Server werden automatisch erkannt. */
@Composable
fun AccountDialog(st: AppState, edit: Account?, onDone: () -> Unit) {
    var name by remember { mutableStateOf(edit?.name ?: "") }
    var email by remember { mutableStateOf(edit?.email ?: "") }
    var password by remember { mutableStateOf("") }
    var signature by remember { mutableStateOf(edit?.signature ?: "") }
    var advanced by remember { mutableStateOf(edit != null) }
    var imapHost by remember { mutableStateOf(edit?.imapHost ?: "") }
    var imapPort by remember { mutableStateOf(edit?.imapPort?.toString() ?: "993") }
    var smtpHost by remember { mutableStateOf(edit?.smtpHost ?: "") }
    var smtpPort by remember { mutableStateOf(edit?.smtpPort?.toString() ?: "465") }
    var username by remember { mutableStateOf(edit?.username ?: "") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var hint by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    fun save() {
        busy = true; error = null
        scope.launch {
            runCatching {
                val base = if (!advanced && edit == null) withContext(Dispatchers.IO) { AutoConfig.discover(email.trim()) }.also {
                    imapHost = it.imapHost; imapPort = "${it.imapPort}"; smtpHost = it.smtpHost; smtpPort = "${it.smtpPort}"; hint = it.hint
                } else null
                fun sec(port: Int, fallback: Security) = when (port) { 993, 465 -> Security.SSL; 143, 587 -> Security.STARTTLS; else -> fallback }
                val a = Account(edit?.id ?: 0, name.ifBlank { email.substringBefore('@') }, email.trim(),
                    imapHost.trim(), imapPort.toInt(), base?.imapSecurity ?: sec(imapPort.toInt(), Security.SSL),
                    smtpHost.trim(), smtpPort.toInt(), base?.smtpSecurity ?: sec(smtpPort.toInt(), Security.SSL),
                    username.ifBlank { if (base?.usernameIsEmail == false) email.substringBefore('@') else email.trim() },
                    edit?.passwordEnc ?: "", signature, edit?.color ?: 0)
                if (password.isNotEmpty()) st.repo.testAccount(a, password)
                if (edit == null) st.repo.addAccount(a, password) else st.repo.updateAccount(a, password.ifEmpty { null })
            }.onSuccess { st.snack = tr("Konto gespeichert – Mails werden geladen …"); onDone(); st.repo.sync() }
                .onFailure {
                    error = friendly(it) + if (friendly(it).contains(tr("Zertifikat"), true) || friendly(it).contains("Zertifikat", true))
                        "\n" + tr("Häufige Ursache am PC: Ein Virenscanner mit „E-Mail-Schutz“ (z. B. Avast, AVG, ESET, Kaspersky) prüft die Verbindung. Dort den E-Mail-Schutz für verschlüsselte Verbindungen ausschalten oder Mailwerk als Ausnahme eintragen.") else ""
                    advanced = true
                }
            busy = false
        }
    }

    AlertDialog(onDismissRequest = onDone, title = { Text(if (edit == null) tr("E-Mail-Konto hinzufügen") else tr("Konto bearbeiten")) },
        text = {
            Column(Modifier.width(460.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text(tr("Dein Name")) }, singleLine = true)
                OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text(tr("E-Mail-Adresse")) }, singleLine = true, enabled = edit == null)
                OutlinedTextField(password, { password = it }, Modifier.fillMaxWidth(), singleLine = true, visualTransformation = PasswordVisualTransformation(),
                    label = { Text(if (edit == null) tr("Passwort") else tr("Neues Passwort (leer = unverändert)")) })
                hint?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary) }
                if (advanced) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(imapHost, { imapHost = it }, Modifier.weight(1f), label = { Text(tr("Posteingang (IMAP)")) }, singleLine = true)
                        OutlinedTextField(imapPort, { imapPort = it.filter(Char::isDigit) }, Modifier.width(90.dp), label = { Text(tr("Port")) }, singleLine = true)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(smtpHost, { smtpHost = it }, Modifier.weight(1f), label = { Text(tr("Postausgang (SMTP)")) }, singleLine = true)
                        OutlinedTextField(smtpPort, { smtpPort = it.filter(Char::isDigit) }, Modifier.width(90.dp), label = { Text(tr("Port")) }, singleLine = true)
                    }
                    OutlinedTextField(username, { username = it }, Modifier.fillMaxWidth(), label = { Text(tr("Benutzername")) }, singleLine = true)
                } else TextButton(onClick = { advanced = true }) { Text(tr("Server selbst eintragen")) }
                OutlinedTextField(signature, { signature = it }, Modifier.fillMaxWidth(), label = { Text(tr("Signatur")) }, minLines = 2)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (busy) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
            }
        },
        confirmButton = { Button(onClick = ::save, enabled = !busy && email.contains('@') && (edit != null || password.isNotEmpty())) { Text(tr("Speichern")) } },
        dismissButton = {
            Row {
                if (edit != null) TextButton(onClick = { st.store.deleteAccount(edit.id); st.selected = null; onDone() }) { Text(tr("Konto entfernen"), color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = onDone) { Text(tr("Abbrechen")) }
            }
        })
}

/** Einstellungen: Konten, Darstellung, Start mit Windows */
@Composable
fun SettingsDialog(st: AppState, onTheme: () -> Unit, onDone: () -> Unit) {
    val accounts = remember(st.store.changes.value) { st.store.accounts() }
    var theme by remember { mutableStateOf(st.store.setting("theme", "system")) }
    var autostart by remember { mutableStateOf(Windows.autostartEnabled()) }
    var background by remember { mutableStateOf(st.store.setting("tray", "1") == "1") }
    AlertDialog(onDismissRequest = onDone, title = { Text(tr("Einstellungen")) },
        text = {
            Column(Modifier.width(480.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(tr("Konten"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                accounts.forEach { a ->
                    Row(Modifier.fillMaxWidth().clickable { st.showAccount = a }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(a.name, a.email, 28); Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) { Text(a.email); Text(a.imapHost, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        Text(tr("Bearbeiten"), color = MaterialTheme.colorScheme.primary)
                    }
                }
                TextButton(onClick = { st.addAccount = true }) { Text(tr("+ Konto hinzufügen")) }
                HorizontalDivider()
                Text(tr("Darstellung"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("system" to tr("Wie Windows"), "light" to tr("Hell"), "dark" to tr("Dunkel")).forEach { (k, l) ->
                        FilterChip(theme == k, { theme = k; st.store.setSetting("theme", k); onTheme() }, label = { Text(l) })
                    }
                }
                HorizontalDivider()
                if (Paths.isWindows) Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(tr("Mit Windows starten"), Modifier.weight(1f)); Switch(autostart, { autostart = it; Windows.setAutostart(it) })
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(tr("Beim Schließen im Hintergrund weiterlaufen"))
                        Text(tr("Neue Mails werden dann sofort gemeldet (Symbol unten rechts in der Taskleiste)."),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Switch(background, { background = it; st.store.setSetting("tray", if (it) "1" else "0") })
                }
                Text(tr("Version {0} · Daten: {1}", Windows.VERSION, Paths.home.absolutePath), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { TextButton(onClick = onDone) { Text(tr("Fertig")) } })
}
