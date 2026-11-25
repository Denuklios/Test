package app.nfcwerkstatt.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudDownload
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Power
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.nfcwerkstatt.MainViewModel
import app.nfcwerkstatt.automation.TuyaCloud
import app.nfcwerkstatt.automation.TuyaDevice
import app.nfcwerkstatt.automation.TuyaDiscovery
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Tuya / Smart Life / LSC / Megos: Geräte verwalten – geschaltet wird lokal im WLAN. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TuyaSetupDialog(vm: MainViewModel, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val devices by vm.tuya.collectAsStateWithLifecycle()
    var scanning by remember { mutableStateOf(false) }
    var importing by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf<String?>(null) }
    var region by remember { mutableStateOf("eu") }
    var accessId by remember { mutableStateOf("") }
    var secret by remember { mutableStateOf("") }
    var showManual by remember { mutableStateOf(false) }
    var mName by remember { mutableStateOf("") }
    var mId by remember { mutableStateOf("") }
    var mKey by remember { mutableStateOf("") }
    var mIp by remember { mutableStateOf("") }
    var mVer by remember { mutableStateOf("3.3") }

    fun scan() {
        scanning = true; info = "Suche im WLAN (8 s) …"
        scope.launch {
            val found = withContext(Dispatchers.IO) { runCatching { TuyaDiscovery.scan(ctx) } }
            scanning = false
            found.onSuccess { list ->
                val current = vm.tuya.value
                val updated = current.map { d -> list.firstOrNull { it.id == d.id }?.let { d.copy(ip = it.ip, version = it.version) } ?: d }
                vm.setTuya(updated)
                val unknown = list.count { f -> current.none { it.id == f.id } }
                info = "${list.size} Tuya-Geräte im WLAN gefunden, ${updated.count { it.ip.isNotBlank() }} von ${updated.size} zugeordnet." +
                    if (unknown > 0) " $unknown ohne Schlüssel (erst importieren)." else ""
            }.onFailure { info = "Suche fehlgeschlagen: ${it.message}" }
        }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Tuya-Geräte", maxLines = 1) },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, "Schließen") } },
                )
            },
        ) { pad ->
            Column(
                Modifier.padding(pad).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Für Tuya, Smart Life, LSC Smart Connect, Megos u. a. Geschaltet wird direkt im WLAN – ohne Cloud, ohne Alexa.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                devices.forEach { d ->
                    AppCard {
                        Row(Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(d.name.ifBlank { d.id }, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    if (d.ip.isBlank()) "IP unbekannt – im WLAN suchen" else "${d.ip} · v${d.version}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (d.ip.isBlank()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            TextButton(onClick = { vm.tuyaSwitch(d, "on") }, enabled = d.ip.isNotBlank()) { Text("An") }
                            TextButton(onClick = { vm.tuyaSwitch(d, "off") }, enabled = d.ip.isNotBlank()) { Text("Aus") }
                            IconButton(onClick = { vm.setTuya(devices.filterNot { it.id == d.id }) }) { Icon(Icons.Filled.Delete, "Entfernen") }
                        }
                    }
                }

                FilledTonalButton(onClick = { scan() }, enabled = !scanning, modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium) {
                    if (scanning) CircularProgressIndicator(Modifier.size(18.dp)) else Icon(Icons.Filled.Search, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp)); Text("Im WLAN suchen")
                }
                info?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }

                SectionCard("Schlüssel einmalig holen", Icons.Filled.CloudDownload) {
                    Text(
                        "Jedes Tuya-Gerät hat einen geheimen „Local Key“. Den gibt Tuya nur einmal über die Entwickler-Plattform heraus:",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Text(
                        "1. iot.tuya.com → kostenlos registrieren → Cloud → Development → Create Cloud Project " +
                            "(Rechenzentrum „Central Europe“)\n" +
                            "2. Im Projekt: Devices → Link App Account → QR-Code mit der Smart-Life-App scannen " +
                            "(LSC- und Megos-Geräte vorher in Smart Life hinzufügen)\n" +
                            "3. Overview: Access ID und Access Secret hier eintragen",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        TuyaCloud.REGIONS.forEach { (k, v) -> FilterChip(selected = region == k, onClick = { region = k }, label = { Text(v.first) }) }
                    }
                    OutlinedTextField(accessId, { accessId = it.trim() }, label = { Text("Access ID") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(secret, { secret = it.trim() }, label = { Text("Access Secret") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(
                        enabled = accessId.isNotBlank() && secret.isNotBlank() && !importing,
                        onClick = {
                            importing = true; info = null
                            scope.launch {
                                val r = withContext(Dispatchers.IO) { runCatching { TuyaCloud(region, accessId, secret).devices() } }
                                importing = false
                                r.onSuccess { list ->
                                    val old = vm.tuya.value
                                    val merged = list.map { n -> old.firstOrNull { it.id == n.id }?.let { o -> n.copy(ip = o.ip, version = o.version) } ?: n } +
                                        old.filter { o -> list.none { it.id == o.id } }
                                    vm.setTuya(merged)
                                    secret = "" // Secret wird nicht gespeichert
                                    info = "${list.size} Geräte mit Schlüssel importiert."
                                    scan()
                                }.onFailure { info = it.message ?: "Import fehlgeschlagen" }
                            }
                        },
                    ) { Text(if (importing) "Importiere …" else "Geräte importieren") }
                    Text("Access Secret wird nicht gespeichert. Danach braucht die App die Tuya-Cloud nicht mehr.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }

                OutlinedButton(onClick = { showManual = !showManual }, shape = MaterialTheme.shapes.medium) {
                    Icon(Icons.Filled.Power, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Gerät von Hand hinzufügen")
                }
                if (showManual) {
                    OutlinedTextField(mName, { mName = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(mId, { mId = it.trim() }, label = { Text("Geräte-ID") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(mKey, { mKey = it.trim() }, label = { Text("Local Key (16 Zeichen)") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                        isError = mKey.isNotEmpty() && mKey.length != 16)
                    OutlinedTextField(mIp, { mIp = it.trim() }, label = { Text("IP-Adresse") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("3.3", "3.4", "3.5").forEach { v -> FilterChip(selected = mVer == v, onClick = { mVer = v }, label = { Text("v$v") }) }
                    }
                    Button(
                        enabled = mId.isNotBlank() && mKey.length == 16,
                        onClick = {
                            vm.setTuya(vm.tuya.value.filterNot { it.id == mId } + TuyaDevice(mId, mName.ifBlank { mId }, mKey, mIp, mVer))
                            mName = ""; mId = ""; mKey = ""; mIp = ""; showManual = false
                        },
                    ) { Text("Hinzufügen") }
                }
            }
        }
    }
}
