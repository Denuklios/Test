package app.mailwerk.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import app.mailwerk.data.Account
import app.mailwerk.data.Security
import app.mailwerk.mail.AutoConfig
import app.mailwerk.mail.friendly
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountSetupScreen(vm: MainViewModel, editId: Long?) {
    val existing = remember(editId) { editId?.let { vm.db.account(it) } }
    val scope = rememberCoroutineScope()
    var step by remember { mutableStateOf(if (existing != null) 1 else 0) } // 0 = E-Mail+Passwort, 1 = Server
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var email by remember { mutableStateOf(existing?.email ?: "") }
    var password by remember { mutableStateOf("") }
    var showPw by remember { mutableStateOf(false) }
    var user by remember { mutableStateOf(existing?.username ?: "") }
    var imapHost by remember { mutableStateOf(existing?.imapHost ?: "") }
    var imapPort by remember { mutableStateOf(existing?.imapPort?.toString() ?: "993") }
    var imapSec by remember { mutableStateOf(existing?.imapSecurity ?: Security.SSL) }
    var smtpHost by remember { mutableStateOf(existing?.smtpHost ?: "") }
    var smtpPort by remember { mutableStateOf(existing?.smtpPort?.toString() ?: "465") }
    var smtpSec by remember { mutableStateOf(existing?.smtpSecurity ?: Security.SSL) }
    var signature by remember { mutableStateOf(existing?.signature ?: "") }
    var hint by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val canGoBack = vm.stack.value.size > 1 && vm.db.accounts().isNotEmpty()

    fun build() = Account(
        id = existing?.id ?: 0, name = name.ifBlank { email.substringBefore('@') }, email = email.trim(),
        imapHost = imapHost.trim(), imapPort = imapPort.toIntOrNull() ?: 993, imapSecurity = imapSec,
        smtpHost = smtpHost.trim(), smtpPort = smtpPort.toIntOrNull() ?: 587, smtpSecurity = smtpSec,
        username = user.trim().ifBlank { email.trim() }, passwordEnc = existing?.passwordEnc ?: "", signature = signature,
        color = existing?.color ?: 0,
    )

    fun saveAndTest() {
        busy = true; error = null
        scope.launch {
            try {
                val acc = build()
                val pw = password.ifEmpty { existing?.let { app.mailwerk.data.Crypto.decrypt(it.passwordEnc) } ?: "" }
                vm.repo.testAccount(acc, pw)
                if (existing == null) vm.repo.addAccount(acc, pw) else vm.repo.updateAccount(acc, password.ifEmpty { null })
                busy = false
                vm.snack(if (existing == null) "Konto hinzugefügt – Mails werden geladen …" else "Gespeichert")
                if (vm.stack.value.size > 1) vm.pop()
                vm.refresh()
            } catch (e: Exception) { busy = false; error = e.message ?: friendly(e) }
        }
    }

    Scaffold(topBar = {
        TopAppBar(title = { Text(if (existing != null) "Konto bearbeiten" else "E-Mail-Konto hinzufügen") },
            navigationIcon = {
                if (canGoBack || step == 1 && existing == null) IconButton(onClick = { if (step == 1 && existing == null) step = 0 else vm.pop() }) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Zurück")
                }
            },
            actions = { if (existing != null) IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Outlined.Delete, "Konto entfernen") } })
    }) { pad ->
        Column(Modifier.padding(pad).imePadding().fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (step == 0) {
                Text("Willkommen bei Mailwerk 👋", style = MaterialTheme.typography.headlineSmall)
                Text("Funktioniert mit jedem Anbieter, der IMAP anbietet: GMX, WEB.DE, Telekom, Gmail, iCloud, Yahoo, Posteo, mailbox.org, IONOS, eigene Domains …",
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(name, { name = it }, label = { Text("Dein Name (für Empfänger sichtbar)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(email, { email = it }, label = { Text("E-Mail-Adresse") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                PasswordField(password, { password = it }, showPw) { showPw = !showPw }
                AutoConfig.presets[email.substringAfter('@', "").lowercase()]?.hint?.let { InfoCard(it) }
                Button(enabled = email.contains('@') && password.isNotEmpty() && !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                    busy = true
                    scope.launch {
                        val cfg = withContext(Dispatchers.IO) { AutoConfig.discover(email.trim()) }
                        imapHost = cfg.imapHost; imapPort = "${cfg.imapPort}"; imapSec = cfg.imapSecurity
                        smtpHost = cfg.smtpHost; smtpPort = "${cfg.smtpPort}"; smtpSec = cfg.smtpSecurity
                        user = email.trim(); hint = cfg.hint
                        step = 1
                        saveAndTest()
                    }
                }) { if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text("Weiter") }
                Text("🔒 Dein Passwort wird verschlüsselt im Android-Keystore gesichert und nur an deinen Mailserver gesendet.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { step = 1 }) { Text("Server manuell einrichten") }
            } else {
                hint?.let { InfoCard(it) }
                error?.let { InfoCard("⚠️ $it", isError = true) }
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(email, { email = it }, label = { Text("E-Mail-Adresse") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(user, { user = it }, label = { Text("Benutzername (meist die E-Mail-Adresse)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                PasswordField(password, { password = it }, showPw, if (existing != null) "Passwort (leer = unverändert)" else "Passwort") { showPw = !showPw }
                SectionTitle("Posteingang (IMAP)")
                ServerFields(imapHost, { imapHost = it }, imapPort, { imapPort = it }, imapSec) { s ->
                    imapSec = s; imapPort = if (s == Security.SSL) "993" else "143"
                }
                SectionTitle("Postausgang (SMTP)")
                ServerFields(smtpHost, { smtpHost = it }, smtpPort, { smtpPort = it }, smtpSec) { s ->
                    smtpSec = s; smtpPort = if (s == Security.SSL) "465" else "587"
                }
                SectionTitle("Signatur")
                OutlinedTextField(signature, { signature = it }, label = { Text("Signatur") }, minLines = 3, modifier = Modifier.fillMaxWidth())
                Button(enabled = !busy && imapHost.isNotBlank() && smtpHost.isNotBlank() && email.contains('@'), modifier = Modifier.fillMaxWidth(),
                    onClick = { saveAndTest() }) {
                    if (busy) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Spacer(Modifier.width(8.dp)); Text("Verbindung wird geprüft …") }
                    else Text("Prüfen & speichern")
                }
            }
            Spacer(Modifier.height(40.dp))
        }
    }
    if (confirmDelete && existing != null) AlertDialog(onDismissRequest = { confirmDelete = false },
        title = { Text("Konto entfernen?") }, text = { Text("${existing.email} und alle lokal gespeicherten Mails werden von diesem Gerät entfernt. Auf dem Server bleibt alles erhalten.") },
        confirmButton = { TextButton(onClick = { vm.db.deleteAccount(existing.id); vm.mailbox.value = Mailbox.Unified; confirmDelete = false; vm.pop() }) { Text("Entfernen") } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Abbrechen") } })
}

@Composable
private fun PasswordField(v: String, on: (String) -> Unit, show: Boolean, label: String = "Passwort / App-Passwort", toggle: () -> Unit) {
    OutlinedTextField(v, on, label = { Text(label) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = { IconButton(onClick = toggle) { Icon(if (show) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, "Anzeigen") } })
}

@Composable
private fun ServerFields(host: String, onHost: (String) -> Unit, port: String, onPort: (String) -> Unit, sec: Security, onSec: (Security) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(host, onHost, label = { Text("Server") }, singleLine = true, modifier = Modifier.weight(1f))
        OutlinedTextField(port, { onPort(it.filter(Char::isDigit)) }, label = { Text("Port") }, singleLine = true, modifier = Modifier.width(90.dp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        Security.entries.forEach { s ->
            FilterChip(selected = sec == s, onClick = { onSec(s) }, label = { Text(when (s) { Security.SSL -> "SSL/TLS"; Security.STARTTLS -> "STARTTLS"; Security.NONE -> "Keine ⚠️" }) })
        }
    }
}

@Composable
fun InfoCard(text: String, isError: Boolean = false) {
    Card(colors = CardDefaults.cardColors(containerColor = if (isError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer)) {
        Row(Modifier.padding(12.dp)) {
            Icon(Icons.Outlined.Info, null); Spacer(Modifier.width(8.dp)); Text(text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
