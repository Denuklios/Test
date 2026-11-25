package app.nfcwerkstatt.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.nfcwerkstatt.MainViewModel
import app.nfcwerkstatt.NfcState
import app.nfcwerkstatt.PendingAction
import app.nfcwerkstatt.Tab

private fun Tab.icon(): ImageVector = when (this) {
    Tab.READ -> Icons.Filled.Nfc
    Tab.WRITE -> Icons.Filled.Edit
    Tab.TOOLS -> Icons.Filled.Build
    Tab.HISTORY -> Icons.Filled.History
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun App(vm: MainViewModel, onOpenNfcSettings: () -> Unit) {
    val tab by vm.tab.collectAsStateWithLifecycle()
    val nfc by vm.nfcState.collectAsStateWithLifecycle()
    val pending by vm.pending.collectAsStateWithLifecycle()
    val count by vm.pendingCount.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        vm.messages.collect {
            snackbar.currentSnackbarData?.dismiss()
            snackbar.showSnackbar(it)
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text(if (tab == Tab.READ) "NFC Werkstatt" else tab.title) }) },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = t == tab,
                        onClick = { vm.tab.value = t },
                        icon = { Icon(t.icon(), contentDescription = null) },
                        label = { Text(t.title) },
                    )
                }
            }
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (nfc != NfcState.ON) NfcBanner(nfc, onOpenNfcSettings)
            when (tab) {
                Tab.READ -> ReadScreen(vm)
                Tab.WRITE -> WriteScreen(vm)
                Tab.TOOLS -> ToolsScreen(vm, nfc, onOpenNfcSettings)
                Tab.HISTORY -> HistoryScreen(vm)
            }
        }
    }

    pending?.let { PendingDialog(it, count, onCancel = vm::cancelPending) }
}

@Composable
private fun NfcBanner(state: NfcState, onOpenNfcSettings: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.errorContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Warning, null, tint = MaterialTheme.colorScheme.onErrorContainer)
            Spacer(Modifier.width(12.dp))
            Text(
                if (state == NfcState.OFF) "NFC ist ausgeschaltet." else "Dieses Gerät hat kein NFC.",
                color = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier.weight(1f),
            )
            if (state == NfcState.OFF) TextButton(onClick = onOpenNfcSettings) { Text("Einschalten") }
        }
    }
}

@Composable
private fun PendingDialog(action: PendingAction, count: Int, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        icon = { Icon(Icons.Filled.Nfc, null, Modifier.size(40.dp)) },
        title = { Text(action.title) },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(action.hint)
                CircularProgressIndicator()
                if (action.repeat && count > 0) Text("$count erledigt – nächsten Tag anhalten", style = MaterialTheme.typography.titleMedium)
            }
        },
        confirmButton = { TextButton(onClick = onCancel) { Text(if (action.repeat && count > 0) "Fertig" else "Abbrechen") } },
    )
}
