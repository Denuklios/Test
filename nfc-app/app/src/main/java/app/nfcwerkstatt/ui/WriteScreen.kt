package app.nfcwerkstatt.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.nfcwerkstatt.MainViewModel
import app.nfcwerkstatt.nfc.NdefFactory

@Composable
fun WriteScreen(vm: MainViewModel) {
    val drafts by vm.drafts.collectAsStateWithLifecycle()
    var showEditor by rememberSaveable { mutableStateOf(false) }
    var lock by rememberSaveable { mutableStateOf(false) }
    var repeat by rememberSaveable { mutableStateOf(false) }
    var confirmLock by rememberSaveable { mutableStateOf(false) }

    val total = if (drafts.isEmpty()) 0 else NdefFactory.message(drafts).byteArrayLength

    Column(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (drafts.isEmpty()) {
                item {
                    Text(
                        "Stelle zusammen, was auf den Tag soll. Ein Tag kann mehrere Datensätze enthalten – " +
                            "beim Scannen reagiert das Handy meist auf den ersten.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            itemsIndexed(drafts) { i, d ->
                AppCard {
                    Row(Modifier.padding(start = 14.dp, top = 10.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(recordIcon(d.kind), 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(d.kind, style = MaterialTheme.typography.titleSmall)
                            Text(d.summary, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${d.size} Bytes", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (drafts.size > 1) {
                            IconButton(onClick = { vm.moveDraft(i, if (i > 0) -1 else 1) }, modifier = Modifier.size(40.dp)) {
                                Icon(if (i > 0) Icons.Filled.ArrowUpward else Icons.Filled.ArrowDownward, "Verschieben", Modifier.size(20.dp))
                            }
                        }
                        IconButton(onClick = { vm.removeDraft(i) }, modifier = Modifier.size(40.dp)) {
                            Icon(Icons.Filled.Close, "Entfernen", Modifier.size(20.dp))
                        }
                    }
                }
            }
            item {
                Column {
                    OutlinedButton(
                        onClick = { showEditor = true },
                        shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        Icon(Icons.Filled.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text("Datensatz hinzufügen", maxLines = 1)
                    }
                    if (drafts.isNotEmpty()) TextButton(onClick = vm::clearDrafts) { Text("Alle entfernen") }
                }
            }
        }

        Surface(
            color = MaterialTheme.colorScheme.surfaceContainerLowest,
            shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
            shadowElevation = 12.dp,
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Text(
                    when (drafts.size) {
                        0 -> "Noch nichts zum Schreiben"
                        1 -> "1 Datensatz · $total Bytes"
                        else -> "${drafts.size} Datensätze · $total Bytes"
                    },
                    style = MaterialTheme.typography.titleSmall,
                )
                if (drafts.isNotEmpty()) {
                    val fits = listOf("NTAG213" to 137, "NTAG215" to 492, "NTAG216" to 862).filter { total <= it.second }.map { it.first }
                    Text(
                        if (fits.isEmpty()) "Zu groß für gängige NTAG-Tags" else "Passt auf " + fits.joinToString(", "),
                        style = MaterialTheme.typography.bodySmall,
                        color = if (fits.isEmpty()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                CheckRow(repeat, { repeat = it }, "Serienmodus (mehrere Tags)")
                CheckRow(lock, { lock = it }, "Danach dauerhaft sperren")
                Spacer(Modifier.padding(4.dp))
                Button(
                    onClick = { if (lock) confirmLock = true else vm.startWrite(false, repeat) },
                    enabled = drafts.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Icon(Icons.Filled.Nfc, null); Spacer(Modifier.width(8.dp)); Text("Auf Tag schreiben")
                }
            }
        }
    }

    if (showEditor) {
        RecordEditorDialog(onAdd = { vm.addDraft(it); showEditor = false }, onDismiss = { showEditor = false })
    }
    if (confirmLock) {
        ConfirmDialog(
            title = "Dauerhaft sperren?",
            text = "Nach dem Schreiben wird der Tag schreibgeschützt. Das kann NIE wieder rückgängig gemacht werden.",
            confirm = "Schreiben & sperren",
            onConfirm = { vm.startWrite(true, repeat) },
            onDismiss = { confirmLock = false },
        )
    }
}

@Composable
fun CheckRow(checked: Boolean, onChange: (Boolean) -> Unit, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onChange)
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}
