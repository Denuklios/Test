package app.nfcwerkstatt.ui

import android.content.Intent
import android.content.pm.PackageManager
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.nfcwerkstatt.nfc.Contact
import app.nfcwerkstatt.nfc.DraftRecord
import app.nfcwerkstatt.nfc.NdefFactory
import app.nfcwerkstatt.nfc.WifiAuth
import app.nfcwerkstatt.nfc.WifiConfig

enum class RecordKind(val label: String, val icon: ImageVector) {
    TEXT("Text", Icons.Filled.TextFields),
    URL("Link", Icons.Filled.Link),
    PHONE("Telefon", Icons.Filled.Phone),
    EMAIL("E-Mail", Icons.Filled.Email),
    SMS("SMS", Icons.AutoMirrored.Filled.Message),
    WIFI("WLAN", Icons.Filled.Wifi),
    CONTACT("Kontakt", Icons.Filled.Person),
    GEO("Standort", Icons.Filled.Place),
    APP("App starten", Icons.Filled.Apps),
    MIME("MIME", Icons.Filled.Code),
    EXTERNAL("Extern", Icons.Filled.Extension),
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RecordEditorDialog(onAdd: (DraftRecord) -> Unit, onDismiss: () -> Unit) {
    var kind by rememberSaveable { mutableStateOf(RecordKind.TEXT) }
    var error by remember { mutableStateOf<String?>(null) }

    // Felder (alle typübergreifend gemerkt)
    var a by rememberSaveable { mutableStateOf("") }
    var b by rememberSaveable { mutableStateOf("") }
    var c by rememberSaveable { mutableStateOf("") }
    var d by rememberSaveable { mutableStateOf("") }
    var e by rememberSaveable { mutableStateOf("") }
    var f by rememberSaveable { mutableStateOf("") }
    var lang by rememberSaveable { mutableStateOf("de") }
    var wifiAuth by rememberSaveable { mutableStateOf(WifiAuth.WPA2) }
    var showPw by rememberSaveable { mutableStateOf(false) }
    var pickApp by remember { mutableStateOf(false) }

    fun reset() { a = ""; b = ""; c = ""; d = ""; e = ""; f = ""; error = null }

    fun build(): DraftRecord? {
        fun need(v: String, name: String): Boolean {
            if (v.isBlank()) { error = "$name fehlt."; return false }; return true
        }
        return try {
            when (kind) {
                RecordKind.TEXT -> if (need(a, "Text")) NdefFactory.text(a, lang) else null
                RecordKind.URL -> if (need(a, "Adresse")) NdefFactory.url(a) else null
                RecordKind.PHONE -> if (need(a, "Nummer")) NdefFactory.phone(a) else null
                RecordKind.EMAIL -> if (need(a, "Empfänger")) NdefFactory.email(a, b, c) else null
                RecordKind.SMS -> if (need(a, "Nummer")) NdefFactory.sms(a, b) else null
                RecordKind.WIFI -> when {
                    !need(a, "Netzwerkname (SSID)") -> null
                    wifiAuth != WifiAuth.OPEN && b.length < 8 -> { error = "WPA-Passwort braucht mindestens 8 Zeichen."; null }
                    else -> NdefFactory.wifi(WifiConfig(a.trim(), wifiAuth, b))
                }
                RecordKind.CONTACT -> if (need(a, "Name")) NdefFactory.contact(Contact(a, b, c, d, e, f)) else null
                RecordKind.GEO -> {
                    val lat = a.replace(',', '.').trim().toDoubleOrNull()
                    val lon = b.replace(',', '.').trim().toDoubleOrNull()
                    when {
                        lat == null || lat !in -90.0..90.0 -> { error = "Breitengrad ungültig (-90 … 90)."; null }
                        lon == null || lon !in -180.0..180.0 -> { error = "Längengrad ungültig (-180 … 180)."; null }
                        else -> NdefFactory.geo(lat, lon, c)
                    }
                }
                RecordKind.APP -> if (need(a, "Paketname")) NdefFactory.app(a) else null
                RecordKind.MIME -> when {
                    !need(a, "MIME-Typ") -> null
                    !a.contains('/') -> { error = "MIME-Typ muss die Form typ/untertyp haben."; null }
                    else -> NdefFactory.mime(a, b)
                }
                RecordKind.EXTERNAL -> when {
                    !need(a, "Typ") -> null
                    !a.contains(':') -> { error = "Externer Typ muss die Form domain.de:typ haben."; null }
                    else -> NdefFactory.external(a, b)
                }
            }
        } catch (ex: Exception) {
            error = ex.message ?: "Ungültige Eingabe."
            null
        }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Datensatz hinzufügen") },
                    navigationIcon = { TextButton(onClick = onDismiss) { Text("Abbrechen") } },
                    actions = {
                        TextButton(onClick = { build()?.let(onAdd) }) { Text("Hinzufügen") }
                    },
                )
            },
        ) { pad ->
            Column(
                Modifier.padding(pad).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    RecordKind.entries.forEach { k ->
                        FilterChip(
                            selected = k == kind,
                            onClick = { if (kind != k) { kind = k; reset() } },
                            label = { Text(k.label) },
                            leadingIcon = { Icon(k.icon, null, Modifier.padding(0.dp)) },
                        )
                    }
                }
                HorizontalDivider()

                when (kind) {
                    RecordKind.TEXT -> {
                        Field(a, { a = it }, "Text", singleLine = false)
                        Field(lang, { lang = it.take(8) }, "Sprache (ISO, z. B. de, en)")
                    }
                    RecordKind.URL -> {
                        Field(a, { a = it }, "Adresse (z. B. https://beispiel.de)", KeyboardType.Uri)
                        Hint("Ohne „https://“ wird es automatisch ergänzt. Funktioniert auch auf iPhones ohne App.")
                    }
                    RecordKind.PHONE -> Field(a, { a = it }, "Telefonnummer", KeyboardType.Phone)
                    RecordKind.EMAIL -> {
                        Field(a, { a = it }, "Empfänger", KeyboardType.Email)
                        Field(b, { b = it }, "Betreff (optional)")
                        Field(c, { c = it }, "Nachricht (optional)", singleLine = false)
                    }
                    RecordKind.SMS -> {
                        Field(a, { a = it }, "Telefonnummer", KeyboardType.Phone)
                        Field(b, { b = it }, "Nachricht (optional)", singleLine = false)
                    }
                    RecordKind.WIFI -> {
                        Field(a, { a = it }, "Netzwerkname (SSID)")
                        Text("Sicherheit", style = MaterialTheme.typography.labelLarge)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            WifiAuth.entries.forEach { w ->
                                FilterChip(selected = w == wifiAuth, onClick = { wifiAuth = w }, label = { Text(w.label) })
                            }
                        }
                        if (wifiAuth != WifiAuth.OPEN) {
                            OutlinedTextField(
                                value = b, onValueChange = { b = it }, label = { Text("Passwort") },
                                singleLine = true, modifier = Modifier.fillMaxWidth(),
                                visualTransformation = if (showPw) VisualTransformation.None else PasswordVisualTransformation(),
                                trailingIcon = { TextButton(onClick = { showPw = !showPw }) { Text(if (showPw) "Verbergen" else "Zeigen") } },
                            )
                        }
                        Hint("Android-Geräte bieten beim Scannen direkt an, sich mit dem WLAN zu verbinden.")
                    }
                    RecordKind.CONTACT -> {
                        Field(a, { a = it }, "Name")
                        Field(b, { b = it }, "Telefon", KeyboardType.Phone)
                        Field(c, { c = it }, "E-Mail", KeyboardType.Email)
                        Field(d, { d = it }, "Firma")
                        Field(e, { e = it }, "Webseite", KeyboardType.Uri)
                        Field(f, { f = it }, "Adresse", singleLine = false)
                    }
                    RecordKind.GEO -> {
                        Field(a, { a = it }, "Breitengrad (z. B. 52.5163)", KeyboardType.Decimal)
                        Field(b, { b = it }, "Längengrad (z. B. 13.3777)", KeyboardType.Decimal)
                        Field(c, { c = it }, "Bezeichnung (optional)")
                    }
                    RecordKind.APP -> {
                        Field(a, { a = it }, "Paketname (z. B. com.spotify.music)")
                        OutlinedButton(onClick = { pickApp = true }) { Text("Installierte App auswählen") }
                        Hint("Android Application Record: öffnet die App – oder den Play Store, falls sie fehlt. " +
                            "Am besten als letzten Datensatz hinter einen Link setzen.")
                    }
                    RecordKind.MIME -> {
                        Field(a, { a = it }, "MIME-Typ (z. B. application/json)")
                        Field(b, { b = it }, "Inhalt", singleLine = false)
                    }
                    RecordKind.EXTERNAL -> {
                        Field(a, { a = it }, "Typ (z. B. beispiel.de:meintyp)")
                        Field(b, { b = it }, "Inhalt", singleLine = false)
                        Hint("NFC-Forum External Type – für eigene Apps und Automatisierungen.")
                    }
                }

                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Button(onClick = { build()?.let(onAdd) }, modifier = Modifier.fillMaxWidth()) { Text("Hinzufügen") }
            }
        }
    }

    if (pickApp) AppPickerDialog(onPick = { a = it; pickApp = false }, onDismiss = { pickApp = false })
}

@Composable
private fun Field(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    keyboard: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = singleLine,
        minLines = if (singleLine) 1 else 3,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun Hint(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun AppPickerDialog(onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val ctx = LocalContext.current
    val apps = remember {
        val pm = ctx.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        @Suppress("DEPRECATION")
        pm.queryIntentActivities(intent, PackageManager.MATCH_ALL)
            .map { it.loadLabel(pm).toString() to it.activityInfo.packageName }
            .distinctBy { it.second }
            .sortedBy { it.first.lowercase() }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("App auswählen") },
        text = {
            LazyColumn(Modifier.heightIn(max = 420.dp)) {
                items(apps) { (label, pkg) ->
                    Column(Modifier.fillMaxWidth().clickable { onPick(pkg) }.padding(vertical = 8.dp)) {
                        Text(label, style = MaterialTheme.typography.bodyLarge)
                        Text(pkg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Schließen") } },
    )
}
