package app.mailwerk.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.mailwerk.data.Category
import app.mailwerk.mail.Rule
import app.mailwerk.mail.RuleAction
import app.mailwerk.mail.RuleField
import app.mailwerk.mail.RuleOp

@Composable
private fun <T> ChipRow(options: List<T>, selected: T, label: (T) -> String, on: (T) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        options.forEach { o -> FilterChip(selected = o == selected, onClick = { on(o) }, label = { Text(label(o)) }) }
    }
}

// ============================================================================ Regeln
@Composable
fun RulesScreen(vm: MainViewModel, prefill: Rule?) {
    val changes by vm.db.changes.collectAsState()
    val rules = remember(changes) { vm.db.rules() }
    var edit by remember { mutableStateOf(prefill) }
    SubScaffold(vm, "Regeln & Filter", fab = {
        FloatingActionButton(onClick = { edit = Rule(name = "") }) { Icon(Icons.Outlined.Add, "Neue Regel") }
    }) { mod ->
        LazyColumn(mod) {
            item {
                Text("Regeln werden auf jede neue Mail angewendet – automatisch, auch im Hintergrund. " +
                    "Weiterleiten klappt, solange das Handy online ist; für Weiterleitung rund um die Uhr besser im Webmail deines Anbieters einrichten.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp))
            }
            if (rules.isEmpty()) item {
                Column(Modifier.padding(16.dp)) {
                    Text("Noch keine Regeln.", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Text("Beispiele: Rechnungen automatisch in einen Ordner „Buchhaltung“, Mails vom Chef immer anheften, " +
                        "alle Mails an eine zweite Adresse weiterleiten.", style = MaterialTheme.typography.bodyMedium)
                }
            }
            items(rules, key = { it.id }) { r ->
                ListItem(headlineContent = { Text(r.name.ifBlank { "Regel" }) },
                    supportingContent = { Text(r.describe() + (r.accountId?.let { id -> " · nur " + (vm.accounts.value.firstOrNull { it.id == id }?.email ?: "") } ?: "")) },
                    trailingContent = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Switch(r.enabled, { vm.db.saveRule(r.copy(enabled = it)) })
                            IconButton(onClick = { vm.db.deleteRule(r.id) }) { Icon(Icons.Outlined.Delete, "Löschen") }
                        }
                    }, modifier = Modifier.clickable { edit = r })
                HorizontalDivider()
            }
            if (rules.isNotEmpty()) item {
                OutlinedButton(onClick = { vm.applyRules() }, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    Icon(Icons.Outlined.PlayArrow, null); Spacer(Modifier.padding(4.dp)); Text("Jetzt auf den Posteingang anwenden")
                }
            }
            item { Spacer(Modifier.height(90.dp)) }
        }
    }
    edit?.let { r -> RuleEditor(vm, r, onDone = { edit = null }) }
}

@Composable
private fun RuleEditor(vm: MainViewModel, initial: Rule, onDone: () -> Unit) {
    var name by remember { mutableStateOf(initial.name) }
    var field by remember { mutableStateOf(initial.field) }
    var op by remember { mutableStateOf(initial.op) }
    var value by remember { mutableStateOf(initial.value) }
    var action by remember { mutableStateOf(initial.action) }
    var arg by remember { mutableStateOf(initial.arg) }
    var accountId by remember { mutableStateOf(initial.accountId) }
    var stop by remember { mutableStateOf(initial.stop) }
    val accounts = vm.accounts.value
    val folders = vm.folders.value
    AlertDialog(onDismissRequest = onDone, title = { Text(if (initial.id == 0L) "Neue Regel" else "Regel bearbeiten") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Name der Regel") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Text("Wenn …", style = MaterialTheme.typography.titleSmall)
                ChipRow(RuleField.entries, field, { it.label }) { field = it }
                if (field != RuleField.ALL) {
                    ChipRow(RuleOp.entries, op, { it.label }) { op = it }
                    OutlinedTextField(value, { value = it }, label = { Text("Text, z. B. rechnung@ oder Bestellung") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
                Text("Konto", style = MaterialTheme.typography.titleSmall)
                ChipRow(listOf<Long?>(null) + accounts.map { it.id }, accountId, { id -> if (id == null) "Alle Konten" else accounts.first { it.id == id }.email }) { accountId = it }
                Text("… dann", style = MaterialTheme.typography.titleSmall)
                ChipRow(RuleAction.entries, action, { it.label }) { action = it; if (it != initial.action) arg = "" }
                when (action) {
                    RuleAction.MOVE -> {
                        OutlinedTextField(arg, { arg = it }, label = { Text("Ordner (wird angelegt, falls nicht vorhanden)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        val names = (if (accountId == null) folders.values.flatten() else folders[accountId].orEmpty())
                            .filter { it.role != app.mailwerk.data.FolderRole.INBOX }.map { it.displayName }.distinct()
                        if (names.isNotEmpty()) ChipRow(names, arg, { it }) { arg = it }
                    }
                    RuleAction.CATEGORY -> ChipRow(Category.entries.map { it.name }, arg.ifBlank { Category.PEOPLE.name }, { Category.of(it).label }) { arg = it }
                    RuleAction.FORWARD -> OutlinedTextField(arg, { arg = it }, label = { Text("Weiterleiten an (E-Mail-Adresse)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    else -> {}
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(stop, { stop = it }); Spacer(Modifier.padding(4.dp)); Text("Danach keine weiteren Regeln prüfen", style = MaterialTheme.typography.bodyMedium)
                }
            }
        },
        confirmButton = {
            val valid = (field == RuleField.ALL || value.isNotBlank()) && (!action.needsArg || arg.isNotBlank() || action == RuleAction.CATEGORY) &&
                (action != RuleAction.FORWARD || arg.contains('@'))
            TextButton(enabled = valid, onClick = {
                val r = initial.copy(name = name.ifBlank { if (field == RuleField.ALL) action.label else "${field.label}: $value" }, field = field, op = op, value = value.trim(),
                    action = action, arg = if (action == RuleAction.CATEGORY) arg.ifBlank { Category.PEOPLE.name } else arg.trim(), accountId = accountId, stop = stop, enabled = true)
                vm.db.saveRule(r); vm.snack("Regel gespeichert – gilt ab sofort für neue Mails"); onDone()
            }) { Text("Speichern") }
        },
        dismissButton = { TextButton(onClick = onDone) { Text("Abbrechen") } })
}

// ============================================================================ Sperrliste
@Composable
fun BlocklistScreen(vm: MainViewModel) {
    val changes by vm.db.changes.collectAsState()
    val list = remember(changes) { vm.db.blocklist() }
    var add by remember { mutableStateOf(false) }
    SubScaffold(vm, "Spam & gesperrte Absender", fab = {
        FloatingActionButton(onClick = { add = true }) { Icon(Icons.Outlined.Add, "Sperren") }
    }) { mod ->
        LazyColumn(mod) {
            item {
                Text("Mails von gesperrten Absendern oder Domains werden sofort beim Eintreffen in den Spam-Ordner verschoben – " +
                    "sie erscheinen nicht im Posteingang und lösen keine Benachrichtigung aus. " +
                    "Tipp: Mail lange antippen → „Spam – Absender künftig sperren“.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp))
            }
            if (list.isEmpty()) item { Text("Noch niemand gesperrt.", modifier = Modifier.padding(16.dp)) }
            items(list, key = { it.pattern }) { b ->
                ListItem(headlineContent = { Text(if (b.isDomain) "@${b.pattern}" else b.pattern) },
                    supportingContent = { Text(if (b.isDomain) "Ganze Domain gesperrt" else "Absender gesperrt") },
                    trailingContent = { TextButton(onClick = { vm.db.unblock(b.pattern) }) { Text("Freigeben") } })
                HorizontalDivider()
            }
            item { Spacer(Modifier.height(90.dp)) }
        }
    }
    if (add) {
        var text by remember { mutableStateOf("") }
        var domain by remember { mutableStateOf(false) }
        AlertDialog(onDismissRequest = { add = false }, title = { Text("Absender sperren") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(text, { text = it }, label = { Text(if (domain) "Domain, z. B. werbung.de" else "E-Mail-Adresse") }, singleLine = true)
                    ChipRow(listOf(false, true), domain, { if (it) "Ganze Domain" else "Einzelne Adresse" }) { domain = it }
                }
            },
            confirmButton = {
                TextButton(enabled = if (domain) text.contains('.') else text.contains('@'), onClick = {
                    vm.db.block(if (domain) text.substringAfter('@') else text, domain); add = false
                }) { Text("Sperren") }
            },
            dismissButton = { TextButton(onClick = { add = false }) { Text("Abbrechen") } })
    }
}

// ============================================================================ Abwesenheitsnotiz
@Composable
fun VacationScreen(vm: MainViewModel) {
    val p = vm.prefs
    var on by remember { mutableStateOf(p.vacationOn) }
    var from by remember { mutableStateOf(p.vacationFrom) }
    var until by remember { mutableStateOf(p.vacationUntil) }
    var subject by remember { mutableStateOf(p.vacationSubject) }
    var text by remember { mutableStateOf(p.vacationText) }
    var contactsOnly by remember { mutableStateOf(p.vacationContactsOnly) }
    var accs by remember { mutableStateOf(p.vacationAccounts.split(',').mapNotNull { it.trim().toLongOrNull() }.toSet()) }
    var pick by remember { mutableIntStateOf(0) } // 1 = von, 2 = bis
    val accounts = vm.accounts.value

    fun save() {
        val wasOn = p.vacationOn
        p.vacationOn = on; p.vacationFrom = from; p.vacationUntil = until; p.vacationSubject = subject; p.vacationText = text
        p.vacationContactsOnly = contactsOnly; p.vacationAccounts = accs.joinToString(",")
        if (on && !wasOn) vm.db.resetVacationReplied() // neue Abwesenheit: jeder bekommt wieder einmal eine Antwort
        vm.settingsVersion.value++
        vm.snack(if (on) "Abwesenheitsnotiz gespeichert" else "Abwesenheitsnotiz aus"); vm.pop()
    }

    SubScaffold(vm, "Abwesenheitsnotiz") { mod ->
        Column(mod.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Automatisch antworten", style = MaterialTheme.typography.titleMedium)
                    Text("Jeder Absender bekommt die Antwort nur einmal. Newsletter und automatische Mails werden nie beantwortet.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Switch(on, { on = it })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { pick = 1 }) { Text(if (from == 0L) "Ab: sofort" else "Ab: ${MainViewModel.fmt(from)}") }
                OutlinedButton(onClick = { pick = 2 }) { Text(if (until == 0L) "Bis: Ausschalten" else "Bis: ${MainViewModel.fmt(until)}") }
            }
            if (from != 0L || until != 0L) TextButton(onClick = { from = 0; until = 0 }) { Text("Zeitraum entfernen") }
            OutlinedTextField(subject, { subject = it }, label = { Text("Betreff") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(text, { text = it }, label = { Text("Nachricht") }, minLines = 5, modifier = Modifier.fillMaxWidth())
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Nur Kontakten antworten, denen ich schon geschrieben habe", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                Switch(contactsOnly, { contactsOnly = it })
            }
            if (accounts.size > 1) {
                Text("Für Konten", style = MaterialTheme.typography.titleSmall)
                ChipRow(listOf(-1L) + accounts.map { it.id }, if (accs.isEmpty()) -1L else accs.first(), { id -> if (id == -1L) "Alle" else accounts.first { it.id == id }.email }) {
                    accs = if (it == -1L) emptySet() else setOf(it)
                }
            }
            app.mailwerk.ui.InfoCard("Die App antwortet, sobald sie neue Mails abruft – also wenn das Handy an und online ist. " +
                "Für eine Antwort rund um die Uhr kannst du die Abwesenheitsnotiz zusätzlich im Webmail deines Anbieters einschalten " +
                "(bei one.com im Webmail unter den Einstellungen, meist „Autoresponder“ oder „Abwesenheit“).")
            Button(onClick = { save() }, modifier = Modifier.fillMaxWidth()) { Text("Speichern") }
            Spacer(Modifier.height(40.dp))
        }
    }
    if (pick != 0) TimeChooser(if (pick == 1) "Abwesend ab …" else "Abwesend bis …", { pick = 0 }) { t ->
        if (pick == 1) from = t else until = t; pick = 0
    }
}
