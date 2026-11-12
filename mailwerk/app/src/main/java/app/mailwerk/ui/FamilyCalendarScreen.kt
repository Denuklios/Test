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
    var invite by remember { mutableStateOf("") }
    var url by remember { mutableStateOf(fam.serverUrl) }
    var code by remember { mutableStateOf(fam.code) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val accounts = vm.accounts.value

    fun connect() {
        busy = true; error = null
        scope.launch {
            val r = withContext(Dispatchers.IO) { runCatching { fam.connect(url, code, vm.db.accounts()) } }
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
                    Text(tr("Verbinden"), style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(invite, { t ->
                        invite = t
                        val (u, c) = Api.parseInvite(t)
                        if (u != null) url = u
                        if (c != null) code = c
                    }, label = { Text(tr("Einladung aus der Kalender-App hier einfügen")) }, minLines = 3, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(url, { url = it }, label = { Text(tr("Server-Adresse")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(code, { code = it.uppercase() }, label = { Text(tr("Gruppen-Code")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Button(onClick = ::connect, enabled = !busy && url.isNotBlank() && code.isNotBlank()) { Text(tr("Verbinden")) }
                        if (busy) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                    }
                    Text(tr("Die Einladung findest du in der Kalender-App unter Einstellungen → Einladen."),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Card(shape = RoundedCornerShape(18.dp)) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("📅 " + fam.groupName.ifBlank { tr("Familienkalender") }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(tr("Verbunden · Code {0}", fam.code), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalAlignment = Alignment.CenterVertically) {
                                fam.members.forEach { m ->
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) { MemberDot(m); Text(m.name) }
                                }
                            }
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
                        TextButton(onClick = { fam.disconnect(); url = ""; code = ""; invite = ""; v++ }) { Text(tr("Trennen")) }
                    }
                }
            }
        }
    }
}
