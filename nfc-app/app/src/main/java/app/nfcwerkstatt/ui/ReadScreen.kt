package app.nfcwerkstatt.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.TipsAndUpdates
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import app.nfcwerkstatt.ui.theme.BrandGradient
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
        ScanHero()
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
        item { TagHero(t) }

        if (t.details.isNotEmpty()) item {
            SectionCard("Technik", Icons.Filled.Info) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    t.techs.forEach { TechChip(it) }
                }
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
                    if (n.maxSize > 0) KeyValue("Belegt", "${n.usedSize} / ${n.maxSize} Bytes")
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
                    Icon(Icons.Filled.Share, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Teilen")
                }
                if (t.ndefRaw != null) {
                    OutlinedButton(onClick = { vm.copyTo(t) }) {
                        Icon(Icons.Filled.FileCopy, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Kopieren")
                    }
                    OutlinedButton(onClick = { vm.editAsDraft(t) }) {
                        Icon(Icons.Filled.Edit, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Bearbeiten")
                    }
                }
            }
        }
    }
}

@Composable
private fun ScanHero() {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        ScanPulse(size = 132.dp)
        Spacer(Modifier.height(8.dp))
        Text("Bereit zum Scannen", style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(10.dp))
        Text(
            "Halte einen Tag, eine Karte oder einen Sticker an die Rückseite deines Handys.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Row(
            Modifier.clip(MaterialTheme.shapes.medium).background(MaterialTheme.colorScheme.secondaryContainer)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.TipsAndUpdates, null, tint = MaterialTheme.colorScheme.onSecondaryContainer)
            Spacer(Modifier.width(10.dp))
            Text(
                "Die NFC-Antenne sitzt meist oben in der Mitte. Kurz still halten, bis es vibriert.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
    }
}

@Composable
private fun TagHero(t: TagInfo) {
    val ctx = LocalContext.current
    Column(
        Modifier.fillMaxWidth().clip(MaterialTheme.shapes.large).background(BrandGradient).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(t.timeText, style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.75f))
        Text(t.chip, style = MaterialTheme.typography.headlineSmall, color = Color.White)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                t.uid, fontFamily = FontFamily.Monospace, color = Color.White,
                style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f),
            )
            IconButton(onClick = { copyToClipboard(ctx, "UID", t.uid) }) {
                Icon(Icons.Filled.ContentCopy, "UID kopieren", tint = Color.White)
            }
        }
        t.ndef?.let { n ->
            if (n.maxSize > 0) {
                LinearProgressIndicator(
                    progress = { (n.usedSize.toFloat() / n.maxSize).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape),
                    color = Color.White,
                    trackColor = Color.White.copy(alpha = 0.25f),
                    drawStopIndicator = {},
                )
                Text(
                    "${n.usedSize} von ${n.maxSize} Bytes belegt · ${if (n.writable) "beschreibbar" else "gesperrt"}",
                    style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.85f),
                )
            }
        }
    }
}

@Composable
private fun TechChip(label: String) {
    Text(
        label,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onPrimaryContainer,
        modifier = Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

@Composable
private fun RecordCard(index: Int, r: RecordInfo) {
    val ctx = LocalContext.current
    var showRaw by remember { mutableStateOf(false) }
    SectionCard(r.title, recordIcon(r.title)) {
        Text(r.content, style = MaterialTheme.typography.bodyLarge)
        Row(verticalAlignment = Alignment.CenterVertically) {
            r.actionUri?.let { uri ->
                TextButton(onClick = { openUri(ctx, uri) }) { Text("Öffnen") }
            }
            TextButton(onClick = { copyToClipboard(ctx, r.title, r.content) }) { Text("Kopieren") }
            TextButton(onClick = { showRaw = !showRaw }) { Text(if (showRaw) "Weniger" else "Rohdaten") }
        }
        if (showRaw) {
            Text(r.meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            MonoText(r.payloadHex.ifEmpty { "(keine Nutzdaten)" })
        }
    }
}
