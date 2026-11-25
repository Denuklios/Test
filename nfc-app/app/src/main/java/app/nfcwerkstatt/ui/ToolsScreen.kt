package app.nfcwerkstatt.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CleaningServices
import androidx.compose.material.icons.filled.FileCopy
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Password
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
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
import app.nfcwerkstatt.NfcState
import app.nfcwerkstatt.PendingAction

@Composable
fun ToolsScreen(vm: MainViewModel, nfc: NfcState, onOpenNfcSettings: () -> Unit) {
    val dump by vm.dumpMemory.collectAsStateWithLifecycle()
    val vibrate by vm.vibrate.collectAsStateWithLifecycle()
    val saveHistory by vm.saveHistory.collectAsStateWithLifecycle()

    var confirmErase by rememberSaveable { mutableStateOf(false) }
    var confirmLock by rememberSaveable { mutableStateOf(false) }
    var pwDialog by rememberSaveable { mutableStateOf<String?>(null) } // "set" | "remove"

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SectionCard("Tag kopieren", Icons.Filled.FileCopy) {
            Text("Liest den NDEF-Inhalt eines Tags und schreibt ihn auf beliebig viele weitere Tags.")
            Button(onClick = { vm.start(PendingAction.CopySource) }) { Text("Kopieren starten") }
        }

        SectionCard("Tag löschen / formatieren", Icons.Filled.CleaningServices) {
            Text("Entfernt alle Datensätze. Nicht formatierte Tags werden dabei NDEF-formatiert.")
            OutlinedButton(onClick = { confirmErase = true }) { Text("Löschen") }
        }

        SectionCard("Schreibschutz", Icons.Filled.Lock) {
            Text("Sperrt den Tag dauerhaft gegen Änderungen. Das ist NICHT umkehrbar.")
            OutlinedButton(onClick = { confirmLock = true }) { Text("Dauerhaft sperren") }
        }

        SectionCard("Passwortschutz (NTAG21x)", Icons.Filled.Password) {
            Text(
                "Schützt NTAG213/215/216 (und Ultralight EV1) mit einem Passwort gegen Überschreiben – " +
                    "umkehrbar, solange du das Passwort kennst. 8 Hex-Ziffern (z. B. 1A2B3C4D) werden direkt " +
                    "als Tag-Passwort verwendet, anderer Text wird daraus abgeleitet.",
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { pwDialog = "set" }) { Text("Passwort setzen") }
                OutlinedButton(onClick = { pwDialog = "remove" }) { Text("Entfernen") }
            }
        }

        SectionCard("Einstellungen", Icons.Filled.Tune) {
            SwitchRow("Speicher-Dump beim Lesen", "Liest Seiten/Blöcke roh aus (dauert etwas länger)", dump, vm::setDumpMemory)
            SwitchRow("Vibration", "Rückmeldung bei Erfolg und Fehler", vibrate, vm::setVibrate)
            SwitchRow("Verlauf speichern", "Gelesene Tags lokal auf dem Gerät speichern", saveHistory, vm::setSaveHistory)
        }

        SectionCard("NFC", Icons.Filled.Settings) {
            Text(
                when (nfc) {
                    NfcState.ON -> "NFC ist eingeschaltet. Die App liest Tags, solange sie geöffnet ist."
                    NfcState.OFF -> "NFC ist ausgeschaltet."
                    NfcState.MISSING -> "Dieses Gerät hat keinen NFC-Chip."
                },
            )
            if (nfc != NfcState.MISSING) OutlinedButton(onClick = onOpenNfcSettings) { Text("NFC-Einstellungen öffnen") }
        }
    }

    if (confirmErase) {
        ConfirmDialog(
            "Tag löschen?", "Der gesamte NDEF-Inhalt des nächsten Tags wird überschrieben.", "Löschen",
            onConfirm = { vm.start(PendingAction.Erase) }, onDismiss = { confirmErase = false },
        )
    }
    if (confirmLock) {
        ConfirmDialog(
            "Wirklich dauerhaft sperren?",
            "Der nächste Tag, den du anhältst, wird für immer schreibgeschützt. Das lässt sich nie wieder aufheben.",
            "Sperren",
            onConfirm = { vm.start(PendingAction.Lock) }, onDismiss = { confirmLock = false },
        )
    }
    pwDialog?.let { mode ->
        PasswordDialog(
            setMode = mode == "set",
            onConfirm = { pw, protectRead ->
                pwDialog = null
                vm.start(if (mode == "set") PendingAction.SetPassword(pw, protectRead) else PendingAction.RemovePassword(pw))
            },
            onDismiss = { pwDialog = null },
        )
    }
}

@Composable
private fun SwitchRow(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun PasswordDialog(setMode: Boolean, onConfirm: (String, Boolean) -> Unit, onDismiss: () -> Unit) {
    var pw by rememberSaveable { mutableStateOf("") }
    var pw2 by rememberSaveable { mutableStateOf("") }
    var protectRead by rememberSaveable { mutableStateOf(false) }
    val valid = pw.isNotBlank() && (!setMode || pw == pw2)
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { androidx.compose.material3.Icon(if (setMode) Icons.Filled.Lock else Icons.Filled.LockOpen, null) },
        title = { Text(if (setMode) "Passwort setzen" else "Passwort entfernen") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(pw, { pw = it }, label = { Text("Passwort") }, singleLine = true)
                if (setMode) {
                    OutlinedTextField(pw2, { pw2 = it }, label = { Text("Wiederholen") }, singleLine = true,
                        isError = pw2.isNotEmpty() && pw != pw2)
                    CheckRow(protectRead, { protectRead = it }, "Auch Lesen schützen")
                    Text(
                        "Achtung: Mit Leseschutz können Handys den Inhalt nicht mehr ohne Passwort anzeigen. " +
                            "Passwort gut merken – ohne lässt sich der Schutz nicht entfernen.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = { TextButton(onClick = { onConfirm(pw, protectRead) }, enabled = valid) { Text("Weiter") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } },
    )
}
