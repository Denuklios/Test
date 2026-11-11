package app.mailwerk.ui

import app.mailwerk.tr

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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.outlined.Email
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import app.mailwerk.data.Account
import app.mailwerk.data.PresetAccounts
import androidx.compose.runtime.collectAsState
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
    var replySignature by remember { mutableStateOf(existing?.replySignature ?: "") }
    var logoPath by remember { mutableStateOf(existing?.logoPath) }
    val ctxLocal = androidx.compose.ui.platform.LocalContext.current
    val logoPicker = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) logoPath = saveLogo(ctxLocal, uri) ?: logoPath.also { vm.snack(tr("Bild konnte nicht gelesen werden")) }
    }
    var hint by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmDelete by remember { mutableStateOf(false) }
    val canGoBack = vm.stack.value.size > 1 && vm.db.accounts().isNotEmpty()

    val oauthCtx = androidx.compose.ui.platform.LocalContext.current
    var oauthProvider by remember { mutableStateOf<app.mailwerk.mail.OAuthProvider?>(null) }
    val oauthLauncher = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { res ->
        val p = oauthProvider ?: return@rememberLauncherForActivityResult
        scope.launch {
            busy = true; error = null
            try {
                val r = app.mailwerk.data.OAuth.finish(oauthCtx, res.data)
                vm.repo.addOAuthAccount(p, r)
                vm.snack(tr("{0} verbunden – Mails werden geladen …", r.email))
                if (vm.stack.value.size > 1) vm.pop()
                vm.refresh()
            } catch (e: Exception) { error = e.message ?: friendly(e); if (existing == null) step = 0 }
            busy = false
        }
    }
    fun startOAuth(p: app.mailwerk.mail.OAuthProvider, hintMail: String?) {
        oauthProvider = p
        runCatching { oauthLauncher.launch(app.mailwerk.data.OAuth.loginIntent(oauthCtx, p, hintMail)) }
            .onFailure { error = tr("Kein Browser gefunden, um die Anmeldung zu öffnen.") }
    }
    fun build() = Account(
        id = existing?.id ?: 0, name = name.ifBlank { email.substringBefore('@') }, email = email.trim(),
        imapHost = imapHost.trim(), imapPort = imapPort.toIntOrNull() ?: 993, imapSecurity = imapSec,
        smtpHost = smtpHost.trim(), smtpPort = smtpPort.toIntOrNull() ?: 587, smtpSecurity = smtpSec,
        username = user.trim().ifBlank { email.trim() }, passwordEnc = existing?.passwordEnc ?: "", signature = signature,
        color = existing?.color ?: 0, replySignature = replySignature, logoPath = logoPath,
    )

    fun saveAndTest() {
        busy = true; error = null
        scope.launch {
            try {
                val acc = build()
                val acc0 = build()
                // Nur Signatur/Name geändert -> ohne Server-Test speichern
                if (existing != null && password.isEmpty() && acc0.imapHost == existing.imapHost && acc0.imapPort == existing.imapPort &&
                    acc0.imapSecurity == existing.imapSecurity && acc0.smtpHost == existing.smtpHost && acc0.smtpPort == existing.smtpPort &&
                    acc0.smtpSecurity == existing.smtpSecurity && acc0.username == existing.username) {
                    vm.repo.updateAccount(acc0, null); busy = false; vm.snack(tr("Gespeichert")); vm.pop(); return@launch
                }
                val pw = password.ifEmpty { existing?.let { app.mailwerk.data.Crypto.decrypt(it.passwordEnc) } ?: "" }
                vm.repo.testAccount(acc, pw)
                if (existing == null) vm.repo.addAccount(acc, pw) else vm.repo.updateAccount(acc, password.ifEmpty { null })
                busy = false
                vm.snack(if (existing == null) tr("Konto hinzugefügt – Mails werden geladen …") else tr("Gespeichert"))
                if (vm.stack.value.size > 1) vm.pop()
                vm.refresh()
            } catch (e: Exception) { busy = false; error = e.message ?: friendly(e) }
        }
    }

    Scaffold(topBar = {
        TopAppBar(title = { Text(if (existing != null) tr("Konto bearbeiten") else tr("E-Mail-Konto hinzufügen")) },
            navigationIcon = {
                if (canGoBack || step == 1 && existing == null) IconButton(onClick = { if (step == 1 && existing == null) step = 0 else vm.pop() }) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, tr("Zurück"))
                }
            },
            actions = { if (existing != null) IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Outlined.Delete, tr("Konto entfernen")) } })
    }) { pad ->
        Column(Modifier.padding(pad).imePadding().fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (step == 0) {
                Box(Modifier.fillMaxWidth().clip(androidx.compose.foundation.shape.RoundedCornerShape(28.dp)).background(Brand.gradientDeep).padding(24.dp)) {
                    Column {
                        Box(Modifier.size(56.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp)).background(Color.White.copy(alpha = 0.18f)),
                            contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Email, null, tint = Color.White, modifier = Modifier.size(30.dp)) }
                        Spacer(Modifier.height(16.dp))
                        Text(tr("Willkommen bei Mailwerk"), style = MaterialTheme.typography.headlineMedium, color = Color.White)
                        Spacer(Modifier.height(6.dp))
                        Text(tr("Alle Postfächer an einem Ort. Privat, schnell, ohne Werbung."), style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
                    }
                }
                val accountsNow by vm.accounts.collectAsState()
                val pending = PresetAccounts.pending(accountsNow)
                if (existing == null && pending.isNotEmpty()) {
                    Text(tr("Deine Konten sind vorbereitet – nur noch das Passwort eingeben:"), style = MaterialTheme.typography.titleSmall)
                    pending.forEach { p -> PresetCard(vm, p) }
                    TextButton(onClick = { vm.pop() }, modifier = Modifier.fillMaxWidth()) {
                        Text(if (accountsNow.isEmpty()) tr("Später einrichten") else tr("Rest später einrichten – zum Posteingang"))
                    }
                    Text(tr("Du kannst das Passwort jederzeit nachtragen: im Posteingang über den Hinweis oder unter Einstellungen → Konten."),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Text(tr("Weiteres Konto hinzufügen"), style = MaterialTheme.typography.titleSmall)
                }
                error?.let { InfoCard("⚠️ $it", isError = true) }
                val oauthList = app.mailwerk.mail.OAuthProvider.entries.filter { app.mailwerk.data.OAuth.available(it) }
                oauthList.forEach { p ->
                    androidx.compose.material3.OutlinedButton(onClick = { startOAuth(p, email.takeIf { it.contains('@') }) }, enabled = !busy,
                        modifier = Modifier.fillMaxWidth().height(54.dp)) {
                        Text(if (p == app.mailwerk.mail.OAuthProvider.GOOGLE) "G" else "⊞", style = MaterialTheme.typography.titleLarge,
                            color = if (p == app.mailwerk.mail.OAuthProvider.GOOGLE) androidx.compose.ui.graphics.Color(0xFF4285F4) else androidx.compose.ui.graphics.Color(0xFF0078D4))
                        Spacer(Modifier.width(12.dp)); Text(tr("Mit {0} anmelden", p.label), style = MaterialTheme.typography.titleMedium)
                    }
                }
                if (oauthList.isNotEmpty()) Text(oauthList.joinToString(" / ") { if (it == app.mailwerk.mail.OAuthProvider.GOOGLE) tr("Gmail & Google Workspace") else tr("Outlook, Hotmail & Microsoft 365") } +
                    tr(": sicher über das Anmeldefenster des Anbieters – dein Passwort sieht die App nie."),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(if (oauthList.isEmpty()) tr("Funktioniert mit jedem Anbieter, der IMAP anbietet: GMX, WEB.DE, Telekom, Gmail, iCloud, Yahoo, Posteo, mailbox.org, IONOS, eigene Domains …")
                    else tr("Oder mit E-Mail-Adresse und Passwort (GMX, WEB.DE, Telekom, iCloud, Yahoo, IONOS, one.com, eigene Domains …):"),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(name, { name = it }, label = { Text(tr("Dein Name (für Empfänger sichtbar)")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(email, { email = it }, label = { Text(tr("E-Mail-Adresse")) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                PasswordField(password, { password = it }, showPw) { showPw = !showPw }
                val viaOAuth = app.mailwerk.mail.OAuthProvider.forEmail(email)?.takeIf { app.mailwerk.data.OAuth.available(it) }
                if (viaOAuth != null) InfoCard(tr("Für diese Adresse am besten oben „Mit {0} anmelden“ verwenden.", viaOAuth.label))
                else AutoConfig.presets[email.substringAfter('@', "").lowercase()]?.hint?.let { InfoCard(it) }
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
                }) { if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text(tr("Weiter")) }
                Text(tr("🔒 Dein Passwort wird verschlüsselt im Android-Keystore gesichert und nur an deinen Mailserver gesendet."),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { step = 1 }) { Text(tr("Server manuell einrichten")) }
            } else if (existing?.isOAuth == true) {
                val p = app.mailwerk.mail.OAuthProvider.ofAuthType(existing.authType)
                error?.let { InfoCard("⚠️ $it", isError = true) }
                InfoCard(tr("Angemeldet über {0} – kein Passwort gespeichert.", p?.label ?: "OAuth"))
                OutlinedTextField(name, { name = it }, label = { Text(tr("Name (für Empfänger sichtbar)")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                if (p != null && app.mailwerk.data.OAuth.available(p)) androidx.compose.material3.OutlinedButton(onClick = { startOAuth(p, existing.email) },
                    modifier = Modifier.fillMaxWidth()) { Text(tr("Erneut mit {0} anmelden", p.label)) }
                SectionTitle(tr("Signatur"))
                OAuthSignatureFields(signature, { signature = it }, replySignature, { replySignature = it })
                Button(onClick = { saveAndTest() }, modifier = Modifier.fillMaxWidth()) { Text(tr("Speichern")) }
            } else {
                hint?.let { InfoCard(it) }
                error?.let { InfoCard("⚠️ $it", isError = true) }
                OutlinedTextField(name, { name = it }, label = { Text(tr("Name")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(email, { email = it }, label = { Text(tr("E-Mail-Adresse")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(user, { user = it }, label = { Text(tr("Benutzername (meist die E-Mail-Adresse)")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                PasswordField(password, { password = it }, showPw, if (existing != null) tr("Passwort (leer = unverändert)") else tr("Passwort")) { showPw = !showPw }
                SectionTitle(tr("Posteingang (IMAP)"))
                ServerFields(imapHost, { imapHost = it }, imapPort, { imapPort = it }, imapSec) { s ->
                    imapSec = s; imapPort = if (s == Security.SSL) "993" else "143"
                }
                SectionTitle(tr("Postausgang (SMTP)"))
                ServerFields(smtpHost, { smtpHost = it }, smtpPort, { smtpPort = it }, smtpSec) { s ->
                    smtpSec = s; smtpPort = if (s == Security.SSL) "465" else "587"
                }
                SectionTitle(tr("Signatur"))
                OutlinedTextField(signature, { signature = it }, label = { Text(tr("Signatur für neue Mails")) }, minLines = 3, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(replySignature, { replySignature = it }, label = { Text(tr("Signatur für Antworten (leer = wie oben)")) }, minLines = 2,
                    modifier = Modifier.fillMaxWidth())
                Text(tr("Formatierung: **fett**, *kursiv*. Web- und E-Mail-Adressen werden beim Empfänger klickbar. Das Logo erscheint unter der Signatur."),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    val bmp = remember(logoPath) { logoPath?.let { android.graphics.BitmapFactory.decodeFile(it) }?.asImageBitmap() }
                    if (bmp != null) androidx.compose.foundation.Image(bmp, tr("Logo"), Modifier.size(width = 120.dp, height = 56.dp))
                    OutlinedButtonCompat(if (bmp == null) tr("Logo hinzufügen") else tr("Logo ändern")) { logoPicker.launch("image/*") }
                    if (bmp != null) TextButton(onClick = { logoPath = null }) { Text(tr("Entfernen")) }
                }
                Button(enabled = !busy && imapHost.isNotBlank() && smtpHost.isNotBlank() && email.contains('@'), modifier = Modifier.fillMaxWidth(),
                    onClick = { saveAndTest() }) {
                    if (busy) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Spacer(Modifier.width(8.dp)); Text(tr("Verbindung wird geprüft …")) }
                    else Text(tr("Prüfen & speichern"))
                }
            }
            if (existing != null) {
                SectionTitle(tr("Fehlerbehebung"))
                vm.prefs.syncError(existing.id)?.let { InfoCard(tr("Letzter Abruf fehlgeschlagen: {0}", it), isError = true) }
                val last = vm.prefs.lastSync(existing.id)
                if (last > 0) Text(tr("Letzter Abruf: {0}", MainViewModel.fmt(last)), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                androidx.compose.material3.OutlinedButton(onClick = { vm.reloadAccount(existing.id); vm.pop() }, modifier = Modifier.fillMaxWidth()) {
                    Text(tr("Mails neu laden"))
                }
                Text(tr("Löscht nur die Kopien auf diesem Gerät und lädt die Mails neu vom Server. Auf dem Server bleibt alles erhalten."),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(40.dp))
        }
    }
    if (confirmDelete && existing != null) AlertDialog(onDismissRequest = { confirmDelete = false },
        title = { Text(tr("Konto entfernen?")) }, text = { Text(tr("{0} und alle lokal gespeicherten Mails werden von diesem Gerät entfernt. Auf dem Server bleibt alles erhalten.", existing.email)) },
        confirmButton = { TextButton(onClick = { vm.db.deleteAccount(existing.id); vm.mailbox.value = Mailbox.Unified; confirmDelete = false; vm.pop() }) { Text(tr("Entfernen")) } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text(tr("Abbrechen")) } })
}

@Composable
private fun PasswordField(v: String, on: (String) -> Unit, show: Boolean, label: String = tr("Passwort / App-Passwort"), toggle: () -> Unit) {
    OutlinedTextField(v, on, label = { Text(label) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        visualTransformation = if (show) VisualTransformation.None else PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        trailingIcon = { IconButton(onClick = toggle) { Icon(if (show) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, tr("Anzeigen")) } })
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
            FilterChip(selected = sec == s, onClick = { onSec(s) }, label = { Text(when (s) { Security.SSL -> "SSL/TLS"; Security.STARTTLS -> "STARTTLS"; Security.NONE -> tr("Keine ⚠️") }) })
        }
    }
}

/** Karte für ein vorbereitetes Konto: nur Passwort eingeben, Verbindung wird geprüft und gespeichert. */
@Composable
private fun PresetCard(vm: MainViewModel, p: PresetAccounts.Preset) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(p.name) }
    var pw by remember { mutableStateOf("") }
    var show by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var err by remember { mutableStateOf<String?>(null) }
    Card(shape = androidx.compose.foundation.shape.RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(name, p.email, 36.dp); Spacer(Modifier.width(10.dp))
                Column {
                    Text(p.email, style = MaterialTheme.typography.titleMedium)
                    Text(tr("{0} · IMAP/SMTP mit SSL", PresetAccounts.toAccount(p).imapHost), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            OutlinedTextField(name, { name = it }, label = { Text(tr("Absendername")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            PasswordField(pw, { pw = it }, show, tr("Passwort")) { show = !show }
            err?.let { Text("⚠️ $it", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Button(enabled = pw.isNotEmpty() && !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                busy = true; err = null
                scope.launch {
                    try {
                        val acc = PresetAccounts.toAccount(p, name.ifBlank { p.name })
                        vm.repo.testAccount(acc, pw)
                        vm.repo.addAccount(acc, pw)
                        vm.snack(tr("{0} verbunden – Mails werden geladen …", p.email))
                        vm.refresh()
                        if (PresetAccounts.pending(vm.db.accounts()).isEmpty() && vm.stack.value.size > 1) vm.pop()
                    } catch (e: Exception) { err = e.message ?: friendly(e) }
                    busy = false
                }
            }) {
                if (busy) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Spacer(Modifier.width(8.dp)); Text(tr("Verbindung wird geprüft …")) }
                else Text(tr("Verbinden"))
            }
        }
    }
}

@Composable
private fun OAuthSignatureFields(sig: String, onSig: (String) -> Unit, reply: String, onReply: (String) -> Unit) {
    OutlinedTextField(sig, onSig, label = { Text(tr("Signatur für neue Mails")) }, minLines = 3, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(reply, onReply, label = { Text(tr("Signatur für Antworten (leer = wie oben)")) }, minLines = 2, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun OutlinedButtonCompat(text: String, onClick: () -> Unit) =
    androidx.compose.material3.OutlinedButton(onClick = onClick) { Text(text) }

/** Logo verkleinern (max. 600 px breit) und als PNG im App-Speicher ablegen. */
private fun saveLogo(ctx: android.content.Context, uri: android.net.Uri): String? = runCatching {
    val src = ctx.contentResolver.openInputStream(uri)!!.use { android.graphics.BitmapFactory.decodeStream(it) } ?: return null
    val scale = minOf(1f, 600f / src.width, 240f / src.height)
    val bmp = if (scale < 1f) android.graphics.Bitmap.createScaledBitmap(src, (src.width * scale).toInt().coerceAtLeast(1), (src.height * scale).toInt().coerceAtLeast(1), true) else src
    val dir = java.io.File(ctx.filesDir, "logos").apply { mkdirs() }
    val f = java.io.File(dir, "logo_${System.currentTimeMillis()}.png")
    f.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    f.absolutePath
}.getOrNull()

@Composable
fun InfoCard(text: String, isError: Boolean = false) {
    Card(colors = CardDefaults.cardColors(containerColor = if (isError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer)) {
        Row(Modifier.padding(12.dp)) {
            Icon(Icons.Outlined.Info, null); Spacer(Modifier.width(8.dp)); Text(text, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
