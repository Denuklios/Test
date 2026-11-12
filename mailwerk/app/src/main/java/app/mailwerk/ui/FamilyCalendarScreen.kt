package app.mailwerk.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.mailwerk.data.Api
import app.mailwerk.data.FamilyMember
import app.mailwerk.tr
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Farbiger Punkt eines Familienmitglieds */
@Composable
fun MemberDot(m: FamilyMember, size: Int = 14) {
    Box(Modifier.size(size.dp).background(Color(m.color), CircleShape))
}

@Composable
fun MemberChip(m: FamilyMember, selected: Boolean, onClick: () -> Unit) {
    FilterChip(selected, onClick, label = { Text(m.name) }, leadingIcon = { MemberDot(m) })
}

/** Einstellungen → Familienkalender: verbinden, Konten den Familienmitgliedern zuordnen. */
@Composable
fun FamilyCalendarScreen(vm: MainViewModel) {
    val fam = vm.repo.family
    val scope = rememberCoroutineScope()
    var v by remember { mutableIntStateOf(0) }
    var otherServer by remember { mutableStateOf(fam.defaultUrl.isBlank()) }
    var url by remember { mutableStateOf(fam.serverUrl) }
    var code by remember { mutableStateOf(fam.code) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val accounts = vm.accounts.value

    fun connect() {
        busy = true; error = null
        scope.launch {
            val r = withContext(Dispatchers.IO) { runCatching { fam.connect(if (otherServer) url else "", code, vm.db.accounts()) } }
            busy = false
            r.onSuccess { v++; vm.snack(tr("Mit „{0}“ verbunden", fam.groupName)); scope.launch { withContext(Dispatchers.IO) { runCatching { vm.repo.processInvites() } } } }
                .onFailure { error = it.message ?: tr("Verbindung fehlgeschlagen") }
        }
    }

    SubScaffold(vm, tr("Familienkalender")) { mod ->
        androidx.compose.runtime.key(v) {
            Column(mod.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(tr("Termine, die per E-Mail kommen (Einladungen, .ics), landen automatisch im gemeinsamen Familienkalender – in der Farbe der Person, die die Mail bekommen hat. Alle in der Familie sehen den Termin sofort."),
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (!fam.connected) {
                    val ctx = androidx.compose.ui.platform.LocalContext.current
                    var found by remember { mutableStateOf<app.mailwerk.data.FamilyCalendar.FoundInvite?>(null) }
                    // Einladung automatisch suchen: Zwischenablage, dann Mails
                    androidx.compose.runtime.LaunchedEffect(Unit) {
                        val clip = runCatching {
                            (ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager)
                                .primaryClip?.getItemAt(0)?.coerceToText(ctx)?.toString()
                        }.getOrNull()
                        found = withContext(Dispatchers.IO) { fam.findInvite(clip, runCatching { vm.db.calendarInviteTexts() }.getOrDefault(emptyList())) }
                        found?.let { f ->
                            code = f.code
                            if (f.url != null && Api.normalizeUrl(f.url) != Api.normalizeUrl(fam.defaultUrl.ifBlank { "-" })) { url = f.url; otherServer = true }
                        }
                    }
                    found?.let { f ->
                        Card(shape = RoundedCornerShape(18.dp), colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(tr("✨ Einladung gefunden"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                Text(tr("Code {0} · aus {1}", f.code, f.source), style = MaterialTheme.typography.bodySmall)
                                Button(onClick = ::connect, enabled = !busy) { Text(tr("Jetzt verbinden")) }
                            }
                        }
                    }
                    Text(tr("Gruppen-Code eingeben"), style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(code, { t ->
                        // ganze Einladung eingefügt? -> Code und Server herausziehen
                        val (u, c) = Api.parseInvite(t)
                        if (c != null) { code = c; if (u != null && Api.normalizeUrl(u) != Api.normalizeUrl(fam.defaultUrl.ifBlank { "-" })) { url = u; otherServer = true } }
                        else code = t.uppercase().filter { it.isLetterOrDigit() }.take(12)
                    }, label = { Text(tr("Gruppen-Code (oder ganze Einladung einfügen)")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    if (otherServer) OutlinedTextField(url, { url = it }, label = { Text(tr("Server-Adresse")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(onClick = ::connect, enabled = !busy && code.isNotBlank() && (!otherServer || url.isNotBlank() || fam.defaultUrl.isNotBlank())) { Text(tr("Verbinden")) }
                        if (busy) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                        if (!otherServer) TextButton(onClick = { otherServer = true }) { Text(tr("Anderer Server …")) }
                    }
                    Text(tr("Den Code findest du in der Kalender-App unter Einstellungen → Einladen. Hast du die Einladung per Mail oder Nachricht bekommen, wird sie automatisch erkannt."),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Card(shape = RoundedCornerShape(18.dp)) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("📅 " + fam.groupName.ifBlank { tr("Familienkalender") }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(tr("Verbunden · Code {0}", fam.code), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(fam.serverUrl.removePrefix("https://").removeSuffix("/api.php"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            // Verbindung beim Öffnen prüfen – Fehler (falscher Server/Code, kein Netz) sofort sichtbar
                            val check by androidx.compose.runtime.produceState<String?>(null, v) {
                                value = withContext(Dispatchers.IO) { runCatching { fam.api().groupName(); "" }.getOrElse { it.message ?: tr("Verbindung fehlgeschlagen") } }
                            }
                            when (check) {
                                null -> Text(tr("Verbindung wird geprüft …"), style = MaterialTheme.typography.bodySmall)
                                "" -> Text(tr("✓ Kalender-Server erreichbar"), style = MaterialTheme.typography.bodySmall, color = Color(0xFF2E7D32))
                                else -> Text(tr("⚠ {0} – bitte „Trennen“ und neu verbinden", check!!), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                            }
                            fam.lastError.takeIf { it.isNotBlank() }?.let { Text(tr("Letzter Fehler beim Eintragen: {0}", it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                            Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically) {
                                fam.members.forEach { m ->
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { MemberDot(m); Text(m.name) }
                                }
                            }
                            // im Kalender hinterlegte Mailadressen (dort bei der Person eintragen)
                            fam.members.filter { it.emails.isNotEmpty() }.forEach { m ->
                                Text("${m.name}: ${m.emails.joinToString(", ")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (fam.members.none { it.emails.isNotEmpty() }) Text(tr("Tipp: In der Kalender-App bei jeder Person die Mailadressen eintragen – dann ordnet Mailwerk jeden Termin eindeutig zu."),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(tr("Termine aus E-Mails automatisch eintragen"), style = MaterialTheme.typography.titleMedium)
                            Text(tr("Absagen und Änderungen werden ebenfalls übernommen."), style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(fam.autoAdd, { fam.autoAdd = it; v++ })
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(tr("Auch Termine im Mailtext erkennen"), style = MaterialTheme.typography.titleMedium)
                            Text(tr("z. B. „melde dich bis Montag 16:00“ oder „am 24.11. um 19:30“ – nur bei persönlichen Mails, nicht bei Newslettern."),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(fam.detectText, { fam.detectText = it; v++ })
                    }
                    Text(tr("Wer nutzt welches Postfach?"), style = MaterialTheme.typography.titleMedium)
                    if (accounts.isEmpty()) Text(tr("Noch kein Mail-Konto eingerichtet."))
                    accounts.forEach { a ->
                        val cur = fam.memberFor(a.id)
                        Column(Modifier.fillMaxWidth().border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp)).padding(12.dp)) {
                            Text(a.email, fontWeight = FontWeight.SemiBold)
                            if (cur == null) Text(tr("Noch niemand ausgewählt – Termine werden erst nach der Auswahl eingetragen"),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.tertiary)
                            Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                fam.members.forEach { m ->
                                    MemberChip(m, cur?.id == m.id) {
                                        fam.setMember(a.id, if (cur?.id == m.id) null else m.id); v++
                                        scope.launch { withContext(Dispatchers.IO) { runCatching { vm.repo.processInvites() } } }
                                    }
                                }
                            }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = {
                            busy = true
                            scope.launch {
                                val r = withContext(Dispatchers.IO) { runCatching { fam.refreshMembers() } }
                                busy = false; v++
                                r.onFailure { vm.snack(it.message ?: tr("Verbindung fehlgeschlagen")) }
                            }
                        }, enabled = !busy) { Text(tr("Personen neu laden")) }
                        TextButton(onClick = { fam.disconnect(); url = ""; code = ""; v++ }) { Text(tr("Trennen")) }
                    }
                }
            }
        }
    }
}
