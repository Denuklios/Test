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
                Card(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${i + 1}. ${d.kind}", style = MaterialTheme.typography.titleSmall)
                            Text(d.summary, style = MaterialTheme.typography.bodyMedium, maxLines = 3)
                            Text("${d.size} Bytes", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onClick = { vm.moveDraft(i, -1) }, enabled = i > 0) { Icon(Icons.Filled.ArrowUpward, "Nach oben") }
                        IconButton(onClick = { vm.moveDraft(i, 1) }, enabled = i < drafts.lastIndex) { Icon(Icons.Filled.ArrowDownward, "Nach unten") }
                        IconButton(onClick = { vm.removeDraft(i) }) { Icon(Icons.Filled.Close, "Entfernen") }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { showEditor = true }) {
                        Icon(Icons.Filled.Add, null); Text(" Datensatz hinzufügen")
                    }
                    if (drafts.isNotEmpty()) TextButton(onClick = vm::clearDrafts) { Text("Alle entfernen") }
                }
            }
        }

        Surface(tonalElevation = 3.dp) {
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Text(
                    if (drafts.isEmpty()) "Noch nichts zum Schreiben" else "${drafts.size} Datensatz/-sätze · $total Bytes",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    "Passt z. B. auf NTAG213 (144 B), NTAG215 (504 B), NTAG216 (888 B).",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (total > 144) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                CheckRow(repeat, { repeat = it }, "Serienmodus: mehrere Tags nacheinander beschreiben")
                CheckRow(lock, { lock = it }, "Danach dauerhaft schreibschützen (nicht umkehrbar!)")
                Spacer(Modifier.padding(4.dp))
                Button(
                    onClick = { if (lock) confirmLock = true else vm.startWrite(false, repeat) },
                    enabled = drafts.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth(),
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
