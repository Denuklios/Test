package app.nfcwerkstatt.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.nfcwerkstatt.MainViewModel

@Composable
fun HistoryScreen(vm: MainViewModel) {
    val ctx = LocalContext.current
    val history by vm.history.collectAsStateWithLifecycle()
    var confirmClear by rememberSaveable { mutableStateOf(false) }

    if (history.isEmpty()) {
        EmptyState(Icons.Filled.History, "Noch kein Verlauf", "Gelesene Tags erscheinen hier.")
        return
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("${history.size} Einträge", Modifier.weight(1f).padding(start = 8.dp), style = MaterialTheme.typography.labelLarge)
            TextButton(onClick = { shareText(ctx, "NFC-Verlauf (JSON)", vm.historyJson()) }) {
                Icon(Icons.Filled.Share, null); Text(" Export")
            }
            TextButton(onClick = { confirmClear = true }) { Text("Alle löschen") }
        }
        LazyColumn(contentPadding = PaddingValues(16.dp, 0.dp, 16.dp, 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(history, key = { "${it.timestamp}-${it.uid}" }) { t ->
                Card(Modifier.fillMaxWidth().clickable { vm.showFromHistory(t) }) {
                    Row(Modifier.padding(start = 16.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(t.chip, style = MaterialTheme.typography.titleSmall)
                            Text(t.uid, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                            Text(t.summary(), maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                            Text(t.timeText, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        IconButton(onClick = { vm.deleteHistory(t) }) { Icon(Icons.Filled.Delete, "Löschen") }
                    }
                }
            }
        }
    }

    if (confirmClear) {
        ConfirmDialog("Verlauf löschen?", "Alle ${history.size} Einträge werden entfernt.", "Löschen",
            onConfirm = vm::clearHistory, onDismiss = { confirmClear = false })
    }
}
