package app.nfcwerkstatt.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.nfcwerkstatt.MainViewModel
import app.nfcwerkstatt.NfcState
import app.nfcwerkstatt.PendingAction
import app.nfcwerkstatt.Tab
import app.nfcwerkstatt.ui.theme.BrandGradient
import app.nfcwerkstatt.ui.theme.Success

private fun Tab.icon(): ImageVector = when (this) {
    Tab.READ -> Icons.Filled.Nfc
    Tab.WRITE -> Icons.Filled.Edit
    Tab.ACTIONS -> Icons.Filled.Bolt
    Tab.TOOLS -> Icons.Filled.Build
    Tab.HISTORY -> Icons.Filled.History
}

/** Begrenzt die System-Schriftvergrößerung, damit Leisten und Titel nicht umbrechen. */
@Composable
fun CappedFontScale(max: Float, content: @Composable () -> Unit) {
    val d = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(d.density, d.fontScale.coerceAtMost(max)), content = content)
}

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
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { AppHeader(tab.title, nfc) },
        bottomBar = { BottomNav(tab) { vm.tab.value = it } },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (nfc != NfcState.ON) NfcBanner(nfc, onOpenNfcSettings)
            when (tab) {
                Tab.READ -> ReadScreen(vm)
                Tab.WRITE -> WriteScreen(vm)
                Tab.ACTIONS -> ActionsScreen(vm)
                Tab.TOOLS -> ToolsScreen(vm, nfc, onOpenNfcSettings)
                Tab.HISTORY -> HistoryScreen(vm)
            }
        }
    }

    pending?.let { PendingDialog(it, count, onCancel = vm::cancelPending) }
}

@Composable
private fun AppHeader(title: String, nfc: NfcState) {
    CappedFontScale(1.15f) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(start = 20.dp, end = 16.dp, top = 12.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(BrandGradient),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Nfc, null, tint = Color.White, modifier = Modifier.size(24.dp)) }
            Spacer(Modifier.width(12.dp))
            Text(
                title,
                style = MaterialTheme.typography.headlineSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            StatusPill(nfc)
        }
    }
}

@Composable
private fun StatusPill(nfc: NfcState) {
    val (label, color) = when (nfc) {
        NfcState.ON -> "NFC an" to Success
        NfcState.OFF -> "NFC aus" to MaterialTheme.colorScheme.error
        NfcState.MISSING -> "Kein NFC" to MaterialTheme.colorScheme.error
    }
    Row(
        Modifier.clip(CircleShape).background(color.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = color, maxLines = 1, softWrap = false)
    }
}

@Composable
private fun BottomNav(current: Tab, onSelect: (Tab) -> Unit) {
    CappedFontScale(1.1f) {
        NavigationBar(containerColor = MaterialTheme.colorScheme.surfaceContainerLowest, tonalElevation = 0.dp) {
            Tab.entries.forEach { t ->
                NavigationBarItem(
                    selected = t == current,
                    onClick = { onSelect(t) },
                    icon = { Icon(t.icon(), contentDescription = null) },
                    label = {
                        Text(t.nav, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                    },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.onPrimary,
                        indicatorColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                    ),
                )
            }
        }
    }
}

@Composable
private fun NfcBanner(state: NfcState, onOpenNfcSettings: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
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
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
        title = { Text(action.title, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) },
        text = {
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                ScanPulse(size = 96.dp)
                Text(action.hint, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyLarge)
                if (action.repeat && count > 0) {
                    Text(
                        "$count erledigt · nächsten Tag anhalten",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onCancel) { Text(if (action.repeat && count > 0) "Fertig" else "Abbrechen") }
        },
    )
}
