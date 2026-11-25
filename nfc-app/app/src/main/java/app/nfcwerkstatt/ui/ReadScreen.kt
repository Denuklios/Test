package app.nfcwerkstatt.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FileCopy
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Memory
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AssistChip
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.nfcwerkstatt.MainViewModel
import app.nfcwerkstatt.nfc.RecordInfo
import app.nfcwerkstatt.nfc.TagInfo

@Composable
fun ReadScreen(vm: MainViewModel) {
    val tag by vm.lastTag.collectAsStateWithLifecycle()
    val t = tag
    if (t == null) {
        EmptyState(
            Icons.Filled.Nfc,
            "Bereit zum Lesen",
            "Halte einen NFC-Tag, eine Karte oder einen Sticker an die Rückseite deines Geräts.",
        )
    } else {
        TagDetails(t, vm)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagDetails(t: TagInfo, vm: MainViewModel) {
    val ctx = LocalContext.current
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionCard("Tag", Icons.Filled.Info) {
                Text(t.chip, style = MaterialTheme.typography.titleLarge)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("UID", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(t.uid, fontFamily = FontFamily.Monospace)
                    }
                    IconButton(onClick = { copyToClipboard(ctx, "UID", t.uid) }) { Icon(Icons.Filled.ContentCopy, "UID kopieren") }
                }
                Text(t.timeText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    t.techs.forEach { AssistChip(onClick = {}, label = { Text(it) }) }
                }
                HorizontalDivider()
                t.details.forEach { (k, v) -> KeyValue(k, v, mono = v.contains(':') || v.matches(Regex("[0-9A-F ]+"))) }
            }
        }

        item {
            val n = t.ndef
            SectionCard("NDEF-Inhalt", Icons.Filled.Description) {
                if (n == null) {
                    Text("Dieser Tag ist nicht NDEF-formatiert. Über „Schreiben“ kann er formatiert und beschrieben werden (falls unterstützt).")
                } else {
                    KeyValue("Format", n.type)
                    if (n.maxSize > 0) {
                        KeyValue("Belegt", "${n.usedSize} / ${n.maxSize} Bytes")
                        LinearProgressIndicator(
                            progress = { (n.usedSize.toFloat() / n.maxSize).coerceIn(0f, 1f) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    KeyValue("Beschreibbar", if (n.writable) "ja" else "nein (gesperrt)")
                    KeyValue("Sperrbar", if (n.canMakeReadOnly) "ja" else "nein")
                    if (n.records.isEmpty()) Text("Keine Datensätze – Tag ist leer.")
                }
            }
        }

        t.ndef?.records?.let { records ->
            itemsIndexed(records) { i, r -> RecordCard(i, r) }
        }

        t.memoryDump?.let { dump ->
            item {
                SectionCard("Speicher", Icons.Filled.Memory) {
                    Row(Modifier.horizontalScroll(rememberScrollState())) { MonoText(dump) }
                    TextButton(onClick = { copyToClipboard(ctx, "Speicher", dump) }) { Text("Dump kopieren") }
                }
            }
        }

        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = { shareText(ctx, "NFC-Tag ${t.uid}", t.report()) }) {
                    Icon(Icons.Filled.Share, null); Text("  Teilen")
                }
                if (t.ndefRaw != null) {
                    OutlinedButton(onClick = { vm.copyTo(t) }) { Icon(Icons.Filled.FileCopy, null); Text("  Auf anderen Tag kopieren") }
                    OutlinedButton(onClick = { vm.editAsDraft(t) }) { Icon(Icons.Filled.Edit, null); Text("  Bearbeiten") }
                }
            }
        }
    }
}

@Composable
private fun RecordCard(index: Int, r: RecordInfo) {
    val ctx = LocalContext.current
    var showRaw by remember { mutableStateOf(false) }
    SectionCard("${index + 1}. ${r.title}") {
        Text(r.content, style = MaterialTheme.typography.bodyLarge)
        Row(verticalAlignment = Alignment.CenterVertically) {
            r.actionUri?.let { uri ->
                TextButton(onClick = { openUri(ctx, uri) }) {
                    Icon(Icons.AutoMirrored.Filled.OpenInNew, null); Text(" Öffnen")
                }
            }
            TextButton(onClick = { copyToClipboard(ctx, r.title, r.content) }) {
                Icon(Icons.Filled.ContentCopy, null); Text(" Kopieren")
            }
            TextButton(onClick = { showRaw = !showRaw }) { Text(if (showRaw) "Weniger" else "Rohdaten") }
        }
        if (showRaw) {
            Text(r.meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            MonoText(r.payloadHex.ifEmpty { "(keine Nutzdaten)" })
        }
    }
}
