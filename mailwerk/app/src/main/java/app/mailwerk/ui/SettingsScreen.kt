package app.mailwerk.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Drafts
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.mailwerk.data.OutboxStatus
import app.mailwerk.data.SwipeAction
import app.mailwerk.data.Template
import app.mailwerk.data.ThemeMode
import app.mailwerk.sync.Scheduler

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SubScaffold(vm: MainViewModel, title: String, fab: @Composable () -> Unit = {}, content: @Composable (Modifier) -> Unit) {
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = {
        TopAppBar(title = { Text(title, style = MaterialTheme.typography.headlineSmall) },
            colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background), navigationIcon = { IconButton(onClick = { vm.pop() }) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "Zurück") } })
    }, floatingActionButton = fab) { pad -> content(Modifier.padding(pad).fillMaxSize()) }
}

@Composable
fun SettingsScreen(vm: MainViewModel) {
    val p = vm.prefs
    val ctx = LocalContext.current
    var v by remember { mutableIntStateOf(0) } // erzwingt Neuzeichnen nach Änderungen
    fun changed() { v++; vm.settingsVersion.value++ }
    val accounts by vm.accounts.collectAsState()

    SubScaffold(vm, "Einstellungen") { mod ->
        key(v) {
            Column(mod.verticalScroll(rememberScrollState())) {
                SectionTitle("Konten")
                accounts.forEach { a ->
                    ListItem(headlineContent = { Text(a.email) }, supportingContent = { Text("${a.imapHost} · Signatur & Server bearbeiten") },
                        leadingContent = { Avatar(a.name, a.email) }, modifier = Modifier.clickable { vm.push(Screen.AccountSetup(a.id)) })
                }
                vm.pendingPresets.collectAsState().value.forEach { pr ->
                    ListItem(headlineContent = { Text(pr.email) }, supportingContent = { Text("Passwort fehlt noch – tippen zum Verbinden", color = MaterialTheme.colorScheme.tertiary) },
                        leadingContent = { Avatar(pr.name, pr.email) }, modifier = Modifier.clickable { vm.push(Screen.AccountSetup()) })
                }
                ListItem(headlineContent = { Text("Konto hinzufügen") }, leadingContent = { Icon(Icons.Outlined.Add, null) },
                    modifier = Modifier.clickable { vm.push(Screen.AccountSetup()) })

                SectionTitle("Posteingang")
                Toggle("Smart Inbox", "Mails automatisch in Wichtig / Newsletter / Benachrichtigungen sortieren", p.smartInbox) {
                    p.smartInbox = it; vm.category.value = if (it) app.mailwerk.data.Category.PEOPLE else null; changed()
                }
                Toggle("Als Unterhaltungen gruppieren", "Antworten zum selben Thema zusammenfassen", p.groupThreads) { p.groupThreads = it; changed() }
                Choice("Nach rechts wischen", SwipeAction.entries, p.swipeRight, { it.label }) { p.swipeRight = it; changed() }
                Choice("Nach links wischen", SwipeAction.entries, p.swipeLeft, { it.label }) { p.swipeLeft = it; changed() }

                SectionTitle("Datenschutz")
                Toggle("Externe Bilder blockieren", "Verhindert, dass Absender sehen, wann und wo du Mails öffnest. Tracking-Pixel werden immer entfernt.",
                    p.blockRemoteImages) { p.blockRemoteImages = it; changed() }

                SectionTitle("Senden")
                Choice("„Senden rückgängig“-Zeit", listOf(0, 5, 10, 20, 30), p.undoSeconds, { if (it == 0) "Aus" else "$it s" }) { p.undoSeconds = it; changed() }
                ListItem(headlineContent = { Text("Vorlagen (Schnellantworten)") }, modifier = Modifier.clickable { vm.push(Screen.Templates) })

                SectionTitle("Abgleich & Benachrichtigungen")
                Toggle("Sofort-Benachrichtigung (Push)", "Neue Mails erscheinen in Sekunden (IMAP IDLE). Braucht etwas mehr Akku als der Abruf alle 15 Minuten.", p.pushEnabled) {
                    p.pushEnabled = it; if (it) app.mailwerk.sync.PushService.ensure(ctx) else app.mailwerk.sync.PushService.stop(ctx); changed()
                }
                val pm = ctx.getSystemService(android.os.PowerManager::class.java)
                if (p.pushEnabled && !pm.isIgnoringBatteryOptimizations(ctx.packageName)) ListItem(
                    headlineContent = { Text("Akku-Optimierung ausschalten") },
                    supportingContent = { Text("Empfohlen, damit Android die Push-Verbindung nicht im Standby trennt.", color = MaterialTheme.colorScheme.tertiary) },
                    modifier = Modifier.clickable { requestBatteryExemption(ctx) })
                Choice("Neue Mails abrufen", listOf(15, 30, 60, 180, 0), p.syncMinutes, { if (it == 0) "Nur manuell" else if (it < 60) "alle $it Min." else "alle ${it / 60} Std." }) {
                    p.syncMinutes = it; Scheduler.schedulePeriodic(ctx, it); changed()
                }
                Choice("Zeitraum beim ersten Laden", listOf(14, 30, 60, 180, 365), p.initialSyncDays, { "$it Tage" }) { p.initialSyncDays = it; changed() }
                Toggle("Nur bei wichtigen Mails benachrichtigen", "Keine Störung durch Newsletter und automatische Benachrichtigungen", p.notifyOnlyImportant) {
                    p.notifyOnlyImportant = it; changed()
                }

                SectionTitle("Darstellung")
                Choice("Design", ThemeMode.entries, p.theme, { it.label }) { p.theme = it; changed() }
                if (android.os.Build.VERSION.SDK_INT >= 31) Toggle("Farben vom Hintergrundbild", "Material You statt der Mailwerk-Farben", p.dynamicColor) {
                    p.dynamicColor = it; changed()
                }

                if (p.blockedSenders.isNotEmpty()) {
                    SectionTitle("Blockierte Absender")
                    p.blockedSenders.sorted().forEach { s ->
                        ListItem(headlineContent = { Text(s) }, trailingContent = {
                            IconButton(onClick = { p.blockedSenders = p.blockedSenders - s; changed() }) { Icon(Icons.Outlined.Delete, "Freigeben") }
                        })
                    }
                }
                SectionTitle("App")
                val upd by vm.update.collectAsState()
                val prog by vm.updateProgress.collectAsState()
                ListItem(headlineContent = { Text("Version ${app.mailwerk.BuildConfig.VERSION_NAME}") },
                    supportingContent = { Text(when {
                        prog != null -> "Update wird geladen … ${((prog ?: 0f) * 100).toInt()} %"
                        upd != null -> "Version ${upd!!.versionName} verfügbar – tippen zum Installieren"
                        else -> "Tippen, um nach Updates zu suchen"
                    }) },
                    modifier = Modifier.clickable { if (upd != null) vm.installUpdate() else vm.checkUpdate(manual = true) })
                Toggle("Automatisch nach Updates suchen", null, p.autoUpdateCheck) { p.autoUpdateCheck = it; changed() }
                HorizontalDivider(Modifier.padding(top = 16.dp))
                Text("Mailwerk 1.0 · Alle Daten bleiben auf deinem Gerät und bei deinem Mail-Anbieter. Keine Cloud, keine Werbung, kein Tracking.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp))
                Spacer(Modifier.height(40.dp))
            }
        }
    }
}

@android.annotation.SuppressLint("BatteryLife")
fun requestBatteryExemption(ctx: android.content.Context) {
    runCatching {
        ctx.startActivity(android.content.Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            android.net.Uri.parse("package:${ctx.packageName}")).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
    }.onFailure {
        runCatching { ctx.startActivity(android.content.Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }
}

@Composable
private fun key(v: Int, content: @Composable () -> Unit) = androidx.compose.runtime.key(v) { content() }

@Composable
private fun Toggle(title: String, sub: String?, value: Boolean, on: (Boolean) -> Unit) {
    ListItem(headlineContent = { Text(title) }, supportingContent = sub?.let { { Text(it) } },
        trailingContent = { Switch(value, on) }, modifier = Modifier.clickable { on(!value) })
}

@Composable
private fun <T> Choice(title: String, options: List<T>, value: T, label: (T) -> String, on: (T) -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
        Text(title, style = MaterialTheme.typography.bodyLarge)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            options.forEach { o -> FilterChip(selected = o == value, onClick = { on(o) }, label = { Text(label(o)) }) }
        }
    }
}

@Composable
fun OutboxScreen(vm: MainViewModel) {
    val changes by vm.db.changes.collectAsState()
    val items = remember(changes) { vm.db.outbox() }
    SubScaffold(vm, "Postausgang & Entwürfe") { mod ->
        if (items.isEmpty()) Column(mod.padding(32.dp)) { Text("Keine geplanten Mails oder Entwürfe.") }
        else LazyColumn(mod) {
            items(items, key = { it.id }) { o ->
                val (icon, info, color) = when (o.status) {
                    OutboxStatus.SCHEDULED -> Triple(Icons.Outlined.Schedule, "Geplant: ${MainViewModel.fmt(o.sendAt)}", MaterialTheme.colorScheme.primary)
                    OutboxStatus.FAILED -> Triple(Icons.Outlined.ErrorOutline, "Fehler: ${o.error}", Color(0xFFC62828))
                    OutboxStatus.SENDING -> Triple(Icons.Outlined.Schedule, "Wird gesendet …", MaterialTheme.colorScheme.primary)
                    else -> Triple(Icons.Outlined.Drafts, "Entwurf", MaterialTheme.colorScheme.onSurfaceVariant)
                }
                ListItem(headlineContent = { Text(o.subject.ifBlank { "(kein Betreff)" }) },
                    supportingContent = { Column { Text("An: ${o.to}"); Text(info, color = color) } },
                    leadingContent = { Icon(icon, null, tint = color) },
                    trailingContent = {
                        Row {
                            if (o.status == OutboxStatus.FAILED) IconButton(onClick = { vm.retry(o) }) { Icon(Icons.Outlined.Refresh, "Erneut senden") }
                            IconButton(onClick = { app.mailwerk.sync.Scheduler.cancelSend(vm.getApplication(), o.id); vm.db.deleteOutbox(o.id) }) {
                                Icon(Icons.Outlined.Delete, "Löschen")
                            }
                        }
                    },
                    modifier = Modifier.clickable { if (o.status != OutboxStatus.SENDING) vm.openOutbox(o) })
                HorizontalDivider()
            }
        }
    }
}

@Composable
fun TemplatesScreen(vm: MainViewModel) {
    val changes by vm.db.changes.collectAsState()
    val list = remember(changes) { vm.db.templates() }
    var edit by remember { mutableStateOf<Template?>(null) }
    SubScaffold(vm, "Vorlagen", fab = {
        FloatingActionButton(onClick = { edit = Template(name = "", body = "") }) { Icon(Icons.Outlined.Add, "Neue Vorlage") }
    }) { mod ->
        LazyColumn(mod) {
            items(list, key = { it.id }) { t ->
                ListItem(headlineContent = { Text(t.name) }, supportingContent = { Text(t.body, maxLines = 2) },
                    trailingContent = { IconButton(onClick = { vm.db.deleteTemplate(t.id) }) { Icon(Icons.Outlined.Delete, "Löschen") } },
                    modifier = Modifier.clickable { edit = t })
            }
        }
    }
    edit?.let { t ->
        var name by remember(t) { mutableStateOf(t.name) }
        var body by remember(t) { mutableStateOf(t.body) }
        AlertDialog(onDismissRequest = { edit = null }, title = { Text(if (t.id == 0L) "Neue Vorlage" else "Vorlage bearbeiten") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(body, { body = it }, label = { Text("Text") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = { TextButton(enabled = name.isNotBlank(), onClick = { vm.db.saveTemplate(t.copy(name = name, body = body)); edit = null }) { Text("Speichern") } },
            dismissButton = { TextButton(onClick = { edit = null }) { Text("Abbrechen") } })
    }
}
