package app.nfcwerkstatt.ui

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DoNotDisturbOn
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Power
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.nfcwerkstatt.MainViewModel
import app.nfcwerkstatt.automation.ActionRunner
import app.nfcwerkstatt.automation.HaConfig
import app.nfcwerkstatt.automation.HaEntity
import app.nfcwerkstatt.automation.HomeAssistant
import app.nfcwerkstatt.automation.Hue
import app.nfcwerkstatt.automation.HueBridge
import app.nfcwerkstatt.automation.HueGroup
import app.nfcwerkstatt.automation.HueScene
import app.nfcwerkstatt.automation.Step
import app.nfcwerkstatt.automation.StepType
import app.nfcwerkstatt.automation.TagAction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private fun alexa(label: String) = Step(StepType.ALEXA, mapOf("label" to label, "url" to ""))

private fun tuyaAll(mode: String) = Step(StepType.TUYA, mapOf("ids" to "all", "names" to "Alle", "mode" to mode))

private val TEMPLATES = listOf(
    TagAction.new("Gute Nacht", listOf(tuyaAll("off"), Step(StepType.RINGER, mapOf("mode" to "silent")))),
    TagAction.new("Licht an/aus", listOf(tuyaAll("toggle"))),
    TagAction.new("Nach Hause kommen", listOf(tuyaAll("on"), Step(StepType.RINGER, mapOf("mode" to "normal")))),
    TagAction.new("Kaffee-Timer", listOf(Step(StepType.TIMER, mapOf("minutes" to "4", "label" to "Kaffee")))),
    TagAction.new("Taschenlampe", listOf(Step(StepType.TORCH, mapOf("mode" to "toggle")))),
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ActionsScreen(vm: MainViewModel) {
    val ctx = LocalContext.current
    val actions by vm.actions.collectAsStateWithLifecycle()
    val hue by vm.hue.collectAsStateWithLifecycle()
    val ha by vm.ha.collectAsStateWithLifecycle()
    val tuya by vm.tuya.collectAsStateWithLifecycle()
    var showTuya by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<TagAction?>(null) }
    var showHue by remember { mutableStateOf(false) }
    var showHa by remember { mutableStateOf(false) }
    var showAlexa by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<TagAction?>(null) }
    var resumeTick by remember { mutableStateOf(0) }
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    androidx.compose.runtime.DisposableEffect(lifecycle) {
        val obs = androidx.lifecycle.LifecycleEventObserver { _, e -> if (e == androidx.lifecycle.Lifecycle.Event.ON_RESUME) resumeTick++ }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }
    val dnd = remember(resumeTick) { ActionRunner.hasDndAccess(ctx) }

    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text(
                "Handy an den Tag halten → die Aktion läuft sofort, auch wenn die App geschlossen ist (Handy entsperrt).",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item {
            SectionCard("Verbindungen", Icons.Filled.Home) {
                ConnectionRow(Icons.Filled.Power, "Tuya · Smart Life · LSC · Megos",
                    if (tuya.isEmpty()) "Direkt im WLAN, ohne Cloud" else "${tuya.size} Geräte · ${tuya.count { it.ip.isNotBlank() }} im WLAN",
                    if (tuya.isEmpty()) "Einrichten" else "Geräte") { showTuya = true }
                ConnectionRow(Icons.Filled.RecordVoiceOver, "Amazon Alexa", "Startet deine Alexa-Routinen", "Anleitung") { showAlexa = true }
                ConnectionRow(Icons.Filled.Lightbulb, "Philips Hue", hue?.let { "Verbunden · ${it.ip}" } ?: "Nicht verbunden",
                    if (hue == null) "Verbinden" else "Trennen") { if (hue == null) showHue = true else vm.setHue(null) }
                ConnectionRow(Icons.Filled.Home, "Home Assistant", ha?.let { "Verbunden · ${it.url}" } ?: "Steuert fast alles (IKEA, Shelly, Sonos …)",
                    if (ha == null) "Einrichten" else "Trennen") { if (ha == null) showHa = true else vm.setHa(null) }
                if (!dnd) ConnectionRow(Icons.Filled.DoNotDisturbOn, "Lautlos schalten", "Zugriff auf „Nicht stören“ fehlt", "Erlauben") {
                    ctx.startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
                }
            }
        }
        if (actions.isEmpty()) {
            item {
                SectionCard("Vorlagen", Icons.Filled.Bolt) {
                    Text("Antippen zum Übernehmen und Anpassen:", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        TEMPLATES.forEach { t ->
                            OutlinedButton(onClick = { editing = TagAction.new(t.name, t.steps) }, shape = MaterialTheme.shapes.medium) { Text(t.name) }
                        }
                    }
                }
            }
        }
        items(actions, key = { it.id }) { a ->
            AppCard {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(Icons.Filled.Bolt, 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Text(a.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        IconButton(onClick = { editing = a }) { Icon(Icons.Filled.Edit, "Bearbeiten") }
                        IconButton(onClick = { deleting = a }) { Icon(Icons.Filled.Delete, "Löschen") }
                    }
                    a.steps.forEach { s -> Text("• " + s.describe(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilledTonalButton(onClick = { vm.runAction(a) }) {
                            Icon(Icons.Filled.PlayArrow, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Testen")
                        }
                        Button(onClick = { vm.writeActionTag(a) }) {
                            Icon(Icons.Filled.Nfc, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Auf Tag")
                        }
                    }
                }
            }
        }
        item {
            OutlinedButton(
                onClick = { editing = TagAction.new("", emptyList()) },
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = MaterialTheme.shapes.medium,
            ) { Icon(Icons.Filled.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Neue Aktion") }
        }
        if (actions.isNotEmpty()) item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TEMPLATES.filter { t -> actions.none { it.name == t.name } }.forEach { t ->
                    TextButton(onClick = { editing = TagAction.new(t.name, t.steps) }) { Text("+ ${t.name}") }
                }
            }
        }
    }

    editing?.let { a -> ActionEditorDialog(vm, a, onSave = { vm.saveAction(it); editing = null }, onDismiss = { editing = null }) }
    if (showAlexa) AlexaHelpDialog { showAlexa = false }
    if (showTuya) TuyaSetupDialog(vm) { showTuya = false }
    if (showHue) HueSetupDialog(onConnected = { vm.setHue(it); showHue = false }, onDismiss = { showHue = false })
    if (showHa) HaSetupDialog(onConnected = { vm.setHa(it); showHa = false }, onDismiss = { showHa = false })
    deleting?.let { a ->
        ConfirmDialog("„${a.name}“ löschen?", "Tags mit dieser Aktion funktionieren danach nicht mehr.", "Löschen",
            onConfirm = { vm.deleteAction(a) }, onDismiss = { deleting = null })
    }
}

@Composable
private fun ConnectionRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, status: String, button: String, onClick: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        TextButton(onClick = onClick) { Text(button, maxLines = 1) }
    }
}

// ---------------------------------------------------------------- Aktion bearbeiten

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ActionEditorDialog(vm: MainViewModel, initial: TagAction, onSave: (TagAction) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(initial.name) }
    val steps = remember { mutableStateListOf<Step>().apply { addAll(initial.steps) } }
    var addStep by remember { mutableStateOf(false) }
    var editIndex by remember { mutableStateOf<Int?>(null) }
    val valid = name.isNotBlank() && steps.isNotEmpty()

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Aktion", maxLines = 1) },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, "Schließen") } },
                    actions = { TextButton(onClick = { onSave(initial.copy(name = name.trim(), steps = steps.toList())) }, enabled = valid) { Text("Speichern") } },
                )
            },
        ) { pad ->
            Column(
                Modifier.padding(pad).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(name, { name = it }, label = { Text("Name, z. B. Gute Nacht") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Text("Schritte (laufen nacheinander)", style = MaterialTheme.typography.titleSmall)
                steps.forEachIndexed { i, s ->
                    AppCard(Modifier.clickable { editIndex = i }) {
                        Row(Modifier.padding(start = 16.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(s.type.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                                Text(
                                    s.describe(), style = MaterialTheme.typography.bodyMedium,
                                    color = if (s.type == StepType.ALEXA && s["url"].isBlank()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
                                )
                            }
                            IconButton(onClick = { steps.removeAt(i) }) { Icon(Icons.Filled.Close, "Entfernen") }
                        }
                    }
                }
                OutlinedButton(onClick = { addStep = true }, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium) {
                    Icon(Icons.Filled.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Schritt hinzufügen")
                }
                Button(
                    onClick = { onSave(initial.copy(name = name.trim(), steps = steps.toList())) },
                    enabled = valid, modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium,
                ) { Text("Speichern") }
            }
        }
    }
    if (addStep) StepEditorDialog(vm, null, onAdd = { steps.add(it); addStep = false }, onDismiss = { addStep = false })
    editIndex?.let { i ->
        StepEditorDialog(vm, steps.getOrNull(i), onAdd = { steps[i] = it; editIndex = null }, onDismiss = { editIndex = null })
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun StepEditorDialog(vm: MainViewModel, initial: Step?, onAdd: (Step) -> Unit, onDismiss: () -> Unit) {
    val hue by vm.hue.collectAsStateWithLifecycle()
    val ha by vm.ha.collectAsStateWithLifecycle()
    val tuyaDevs by vm.tuya.collectAsStateWithLifecycle()
    var tuyaSel by remember { mutableStateOf(setOf<String>()) }
    var type by remember { mutableStateOf(initial?.type ?: StepType.TUYA) }
    var prefill by remember { mutableStateOf(initial) }
    var mode by remember { mutableStateOf("off") }
    var f1 by remember { mutableStateOf("") }
    var f2 by remember { mutableStateOf("") }
    var f3 by remember { mutableStateOf("") }
    var selId by remember { mutableStateOf<String?>(null) }
    var selName by remember { mutableStateOf("") }
    var selGroup by remember { mutableStateOf("") }
    var useBri by remember { mutableStateOf(false) }
    var bri by remember { mutableFloatStateOf(0.6f) }
    var groups by remember { mutableStateOf<List<HueGroup>>(emptyList()) }
    var scenes by remember { mutableStateOf<List<HueScene>>(emptyList()) }
    var entities by remember { mutableStateOf<List<HaEntity>>(emptyList()) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var pickApp by remember { mutableStateOf(false) }

    LaunchedEffect(type) {
        loadError = null; selId = null; f1 = ""; f2 = ""; f3 = ""
        tuyaSel = emptySet()
        mode = when (type) { StepType.RINGER -> "silent"; StepType.WEBHOOK -> "GET"; StepType.ALEXA -> "vsh"; else -> "off" }
        if (type == StepType.HA) f1 = "light.turn_off"
        prefill?.takeIf { it.type == type }?.let { p ->
            when (type) {
                StepType.TUYA -> { mode = p["mode"].ifBlank { "off" }; tuyaSel = if (p["ids"] == "all") setOf("all") else p["ids"].split(",").filter { it.isNotBlank() }.toSet() }
                StepType.ALEXA -> {
                    f3 = p["label"]
                    val u = p["url"]
                    if (u.contains("voicemonkey.io")) {
                        mode = "vm"
                        f1 = u.substringAfter("token=", "").substringBefore('&')
                        f2 = u.substringAfter("device=", "").substringBefore('&')
                    } else f1 = u
                }
                StepType.HUE_GROUP, StepType.HUE_SCENE -> { selId = p["id"]; selName = p["name"]; selGroup = p["group"]; mode = p["mode"].ifBlank { mode } }
                StepType.HA -> { f1 = p["service"]; f2 = p["entity"] }
                StepType.WEBHOOK -> { mode = p["method"].ifBlank { "GET" }; f1 = p["url"]; f2 = p["body"] }
                StepType.TIMER -> { f1 = p["minutes"]; f2 = p["label"] }
                StepType.OPEN_URL -> f1 = p["url"]
                StepType.OPEN_APP -> { f1 = p["package"]; f2 = p["label"] }
                else -> mode = p["mode"].ifBlank { mode }
            }
            prefill = null
        }
        val r = withContext(Dispatchers.IO) {
            runCatching {
                when (type) {
                    StepType.HUE_GROUP -> groups = Hue.groups(hue ?: error("Zuerst Hue verbinden."))
                    StepType.HUE_SCENE -> {
                        val b = hue ?: error("Zuerst Hue verbinden.")
                        groups = Hue.groups(b); scenes = Hue.scenes(b)
                    }
                    StepType.HA -> entities = HomeAssistant.entities(ha ?: error("Zuerst Home Assistant einrichten."))
                    StepType.HUE_ALL -> if (hue == null) error("Zuerst Hue verbinden.") else Unit
                    else -> Unit
                }
            }
        }
        loadError = r.exceptionOrNull()?.message
    }

    fun build(): Step? = when (type) {
        StepType.TUYA -> if (tuyaSel.isEmpty()) null else {
            val all = "all" in tuyaSel
            Step(type, mapOf(
                "ids" to if (all) "all" else tuyaSel.joinToString(","),
                "names" to if (all) "Alle" else tuyaDevs.filter { it.id in tuyaSel }.joinToString(", ") { it.name },
                "mode" to mode,
            ))
        }
        StepType.ALEXA -> {
            val url = if (mode == "vm") {
                if (f1.isBlank() || f2.isBlank()) null
                else "https://api-v3.voicemonkey.io/trigger?token=${android.net.Uri.encode(f1.trim())}&device=${android.net.Uri.encode(f2.trim())}"
            } else f1.trim().takeIf { it.startsWith("https://") }
            url?.let { Step(type, mapOf("label" to f3.trim(), "url" to it)) }
        }
        StepType.HUE_ALL -> Step(type, mapOf("mode" to mode))
        StepType.HUE_GROUP -> selId?.let {
            Step(type, buildMap {
                put("id", it); put("name", selName); put("mode", mode)
                if (useBri && mode != "off") put("bri", (bri * 253 + 1).toInt().toString())
            })
        }
        StepType.HUE_SCENE -> selId?.let { Step(type, mapOf("id" to it, "name" to selName, "group" to selGroup)) }
        StepType.HA -> if (f1.contains('.')) Step(type, mapOf("service" to f1.trim(), "entity" to f2.trim())) else null
        StepType.WEBHOOK -> if (f1.startsWith("http")) Step(type, mapOf("method" to mode, "url" to f1.trim(), "body" to f2)) else null
        StepType.TORCH -> Step(type, mapOf("mode" to mode))
        StepType.RINGER -> Step(type, mapOf("mode" to mode))
        StepType.TIMER -> f1.toIntOrNull()?.takeIf { it > 0 }?.let { Step(type, mapOf("minutes" to it.toString(), "label" to f2)) }
        StepType.OPEN_URL -> if (f1.contains(":")) Step(type, mapOf("url" to f1.trim())) else null
        StepType.OPEN_APP -> if (f1.isNotBlank()) Step(type, mapOf("package" to f1.trim(), "label" to f2)) else null
    }

    @Composable
    fun ModeChips(options: List<Pair<String, String>>) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            options.forEach { (k, l) -> FilterChip(selected = mode == k, onClick = { mode = k }, label = { Text(l) }) }
        }
    }
    val onOff = listOf("off" to "Aus", "on" to "An", "toggle" to "Umschalten")

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Schritt", maxLines = 1) },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, "Schließen") } },
                    actions = { TextButton(onClick = { build()?.let(onAdd) }, enabled = build() != null) { Text("Hinzufügen") } },
                )
            },
        ) { pad ->
            Column(
                Modifier.padding(pad).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StepType.entries.forEach { t -> FilterChip(selected = t == type, onClick = { type = t }, label = { Text(t.label) }) }
                }
                HorizontalDivider()
                loadError?.let { Text(it, color = MaterialTheme.colorScheme.error) }

                when (type) {
                    StepType.TUYA -> {
                        ModeChips(onOff)
                        if (tuyaDevs.isEmpty()) Text("Noch keine Tuya-Geräte – unter Aktionen → Tuya einrichten.", color = MaterialTheme.colorScheme.error)
                        else {
                            SelectRow("Alle Geräte", "${tuyaDevs.size} Geräte", "all" in tuyaSel) { tuyaSel = if ("all" in tuyaSel) emptySet() else setOf("all") }
                            tuyaDevs.forEach { d ->
                                Row(Modifier.fillMaxWidth().clickable {
                                    tuyaSel = (tuyaSel - "all").let { if (d.id in it) it - d.id else it + d.id }
                                }, verticalAlignment = Alignment.CenterVertically) {
                                    Checkbox(checked = d.id in tuyaSel || "all" in tuyaSel, onCheckedChange = {
                                        tuyaSel = (tuyaSel - "all").let { if (d.id in it) it - d.id else it + d.id }
                                    })
                                    Text(d.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                    StepType.ALEXA -> {
                        OutlinedTextField(f3, { f3 = it }, label = { Text("Name der Routine (zur Anzeige)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        ModeChips(listOf("vsh" to "Virtual Smart Home", "vm" to "Voice Monkey"))
                        if (mode == "vm") {
                            OutlinedTextField(f1, { f1 = it.trim() }, label = { Text("API-Token") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(f2, { f2 = it.trim() }, label = { Text("Geräte-ID (Monkey)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            Hint("Token und Geräte-ID findest du im Voice-Monkey-Dashboard (voicemonkey.io).")
                        } else {
                            OutlinedTextField(f1, { f1 = it.trim() }, label = { Text("Trigger-Link (https://…)") }, singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
                            Hint("Link aus virtualsmarthome.xyz → URL Routine Trigger kopieren und hier einfügen.")
                        }
                    }
                    StepType.HUE_ALL -> ModeChips(onOff)
                    StepType.HUE_GROUP -> {
                        ModeChips(onOff)
                        if (groups.isEmpty() && loadError == null) CircularProgressIndicator()
                        groups.forEach { g ->
                            SelectRow(g.name, g.type, selId == g.id) { selId = g.id; selName = g.name }
                        }
                        if (mode != "off") {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Checkbox(useBri, { useBri = it }); Text("Helligkeit ${(bri * 100).toInt()} %")
                            }
                            if (useBri) Slider(bri, { bri = it }, valueRange = 0.01f..1f)
                        }
                    }
                    StepType.HUE_SCENE -> {
                        if (scenes.isEmpty() && loadError == null) CircularProgressIndicator()
                        scenes.forEach { s ->
                            val room = groups.firstOrNull { it.id == s.group }?.name.orEmpty()
                            SelectRow(s.name, room, selId == s.id) { selId = s.id; selName = s.name; selGroup = s.group.orEmpty() }
                        }
                    }
                    StepType.HA -> {
                        Text("Dienst", style = MaterialTheme.typography.labelLarge)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("light.turn_off", "light.turn_on", "light.toggle", "switch.toggle", "scene.turn_on", "script.turn_on", "cover.close_cover")
                                .forEach { sv -> FilterChip(selected = f1 == sv, onClick = { f1 = sv }, label = { Text(sv) }) }
                        }
                        OutlinedTextField(f1, { f1 = it }, label = { Text("Dienst (domain.dienst)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(f2, { f2 = it }, label = { Text("Gerät (entity_id oder „all“)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        val domain = f1.substringBefore('.')
                        val matches = entities.filter { (domain.isBlank() || it.id.startsWith("$domain.")) && (f2.isBlank() || it.id.contains(f2, true) || it.name.contains(f2, true)) }
                        if (f1.endsWith("turn_off")) TextButton(onClick = { f2 = "all" }) { Text("Alle (all)") }
                        matches.take(30).forEach { e -> SelectRow(e.name.ifBlank { e.id }, e.id, f2 == e.id) { f2 = e.id } }
                    }
                    StepType.WEBHOOK -> {
                        ModeChips(listOf("GET" to "GET", "POST" to "POST", "PUT" to "PUT"))
                        OutlinedTextField(f1, { f1 = it }, label = { Text("URL") }, singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
                        if (mode != "GET") OutlinedTextField(f2, { f2 = it }, label = { Text("Inhalt (JSON, optional)") }, minLines = 3, modifier = Modifier.fillMaxWidth())
                        Hint("Beispiele: Shelly http://192.168.1.50/relay/0?turn=off · Tasmota http://IP/cm?cmnd=Power%20Off · IFTTT-Webhook-URL")
                    }
                    StepType.TORCH -> ModeChips(onOff)
                    StepType.RINGER -> ModeChips(listOf("silent" to "Lautlos", "vibrate" to "Vibration", "normal" to "Normal", "toggle" to "Lautlos ↔ Normal"))
                    StepType.TIMER -> {
                        OutlinedTextField(f1, { f1 = it.filter(Char::isDigit) }, label = { Text("Minuten") }, singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(f2, { f2 = it }, label = { Text("Bezeichnung (optional)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    }
                    StepType.OPEN_URL -> OutlinedTextField(f1, { f1 = it }, label = { Text("Link (https://…, spotify:…)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    StepType.OPEN_APP -> {
                        OutlinedButton(onClick = { pickApp = true }) { Text(if (f1.isBlank()) "App auswählen" else f2.ifBlank { f1 }) }
                    }
                }
                Button(onClick = { build()?.let(onAdd) }, enabled = build() != null, modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = MaterialTheme.shapes.medium) { Text("Hinzufügen") }
            }
        }
    }
    if (pickApp) AppPickerDialog(onPick = { pkg ->
        f1 = pkg
        f2 = runCatching { vm.getApplication<android.app.Application>().packageManager.let { pm -> pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString() } }.getOrDefault("")
        pickApp = false
    }, onDismiss = { pickApp = false })
}

@Composable
private fun SelectRow(title: String, subtitle: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        androidx.compose.material3.RadioButton(selected = selected, onClick = onClick)
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

// ---------------------------------------------------------------- Einrichtung

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HueSetupDialog(onConnected: (HueBridge) -> Unit, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var found by remember { mutableStateOf<List<String>?>(null) }
    var ip by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        val r = withContext(Dispatchers.IO) { runCatching { Hue.discover() } }
        found = r.getOrDefault(emptyList())
        if (ip.isBlank()) found?.firstOrNull()?.let { ip = it }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
        icon = { Icon(Icons.Filled.Lightbulb, null) },
        title = { Text("Hue verbinden") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                when {
                    found == null -> Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)); Text("Suche Bridge …")
                    }
                    found!!.isEmpty() -> Text("Keine Bridge gefunden – IP-Adresse aus der Hue-App eintragen (Einstellungen → Bridges).")
                    else -> FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        found!!.forEach { f -> FilterChip(selected = ip == f, onClick = { ip = f }, label = { Text(f) }) }
                    }
                }
                OutlinedTextField(ip, { ip = it.trim() }, label = { Text("IP-Adresse der Bridge") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                Text("1. Runden Knopf auf der Bridge drücken\n2. Innerhalb von 30 s auf „Verbinden“ tippen", style = MaterialTheme.typography.bodyMedium)
                status?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = ip.isNotBlank() && !busy, onClick = {
                busy = true; status = null
                scope.launch {
                    val r = withContext(Dispatchers.IO) { runCatching { Hue.pair(ip) } }
                    busy = false
                    r.onSuccess { onConnected(HueBridge(ip, it)) }.onFailure { status = it.message ?: "Bridge nicht erreichbar" }
                }
            }) { Text(if (busy) "Verbinde …" else "Verbinden") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } },
    )
}

@Composable
private fun HaSetupDialog(onConnected: (HaConfig) -> Unit, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf("http://homeassistant.local:8123") }
    var token by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
        icon = { Icon(Icons.Filled.Home, null) },
        title = { Text("Home Assistant") },
        text = {
            Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(url, { url = it.trim() }, label = { Text("Adresse") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                OutlinedTextField(token, { token = it.trim() }, label = { Text("Langzeit-Zugangstoken") }, singleLine = true)
                Text("Token erstellen: Home Assistant → Profil → Sicherheit → „Langlebige Zugangstoken“.", style = MaterialTheme.typography.bodySmall)
                status?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = url.isNotBlank() && token.isNotBlank() && !busy, onClick = {
                busy = true; status = null
                val cfg = HaConfig(url, token)
                scope.launch {
                    val r = withContext(Dispatchers.IO) { runCatching { HomeAssistant.test(cfg) } }
                    busy = false
                    r.onSuccess { onConnected(cfg) }.onFailure { status = it.message ?: "Nicht erreichbar" }
                }
            }) { Text(if (busy) "Prüfe …" else "Verbinden") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } },
    )
}

@Composable
private fun AlexaHelpDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
        icon = { Icon(Icons.Filled.RecordVoiceOver, null) },
        title = { Text("Alexa per NFC") },
        text = {
            Column(Modifier.heightIn(max = 480.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Amazon erlaubt Apps nicht, Routinen direkt zu starten. Ein kostenloser Trigger-Dienst übernimmt das:")
                Text("1. virtualsmarthome.xyz → „URL Routine Trigger“, mit deinem Amazon-Konto anmelden, Trigger anlegen (z. B. „Gute Nacht“).")
                Text("2. In der Alexa-App den Skill „URL Routine Trigger“ aktivieren und Geräte suchen lassen.")
                Text("3. Alexa-App → Routine erstellen → Auslöser: Smart Home → dein Trigger → Aktionen, z. B. alle Lichter aus.")
                Text("4. Hier: Aktion anlegen → Schritt „Alexa-Routine“ → Trigger-Link einfügen → „Auf Tag“.")
                Text("Alternativ geht Voice Monkey (voicemonkey.io) mit Token und Geräte-ID.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Verstanden") } },
    )
}
