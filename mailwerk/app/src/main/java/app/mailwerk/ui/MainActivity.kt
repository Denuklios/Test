package app.mailwerk.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import app.mailwerk.data.Db

class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (Build.VERSION.SDK_INT >= 33) registerForActivityResult(ActivityResultContracts.RequestPermission()) {}
            .launch(Manifest.permission.POST_NOTIFICATIONS)
        handleIntent(intent)
        setContent {
            val settingsV by vm.settingsVersion.collectAsState()
            var theme by remember { mutableStateOf(vm.prefs.theme) }
            var dyn by remember { mutableStateOf(vm.prefs.dynamicColor) }
            LaunchedEffect(settingsV) { theme = vm.prefs.theme; dyn = vm.prefs.dynamicColor }
            MailwerkTheme(theme, dyn) {
                val stack by vm.stack.collectAsState()
                val snackHost = remember { SnackbarHostState() }
                LaunchedEffect(Unit) {
                    vm.snacks.collect { s ->
                        snackHost.currentSnackbarData?.dismiss()
                        val r = snackHost.showSnackbar(s.text, s.actionLabel, withDismissAction = s.actionLabel == null,
                            duration = if (s.actionLabel != null) SnackbarDuration.Long else SnackbarDuration.Short)
                        if (r == SnackbarResult.ActionPerformed) s.action?.invoke()
                    }
                }
                BackHandler(enabled = stack.size > 1) { vm.pop() }
                AnimatedContent(stack.last(), transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "screen") { screen ->
                    when (screen) {
                        Screen.Inbox -> InboxScreen(vm, snackHost)
                        is Screen.Thread -> ThreadScreen(vm, screen.threadKey, snackHost)
                        is Screen.Compose -> ComposeScreen(vm, screen.init, snackHost)
                        is Screen.AccountSetup -> AccountSetupScreen(vm, screen.editId)
                        Screen.Settings -> SettingsScreen(vm)
                        Screen.Outbox -> OutboxScreen(vm)
                        Screen.Templates -> TemplatesScreen(vm)
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); handleIntent(intent) }

    override fun onResume() { super.onResume(); if (vm.accounts.value.isNotEmpty()) vm.refresh() }

    private fun handleIntent(i: Intent?) {
        i ?: return
        val id = i.getLongExtra("open_message", 0)
        if (id > 0) Db.get(this).message(id)?.let { vm.push(Screen.Thread(it.threadKey)) }
        // mailto:-Links aus anderen Apps
        if (i.action == Intent.ACTION_SENDTO || i.action == Intent.ACTION_VIEW) {
            i.data?.takeIf { it.scheme == "mailto" }?.let { uri ->
                val to = uri.schemeSpecificPart.substringBefore('?')
                val q = uri.schemeSpecificPart.substringAfter('?', "")
                val params = q.split('&').mapNotNull { p -> p.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0].lowercase() to java.net.URLDecoder.decode(it[1], "UTF-8") } }.toMap()
                vm.push(Screen.Compose(ComposeInit(vm.accounts.value.firstOrNull()?.id, to, params["cc"] ?: "", params["bcc"] ?: "",
                    params["subject"] ?: "", params["body"] ?: "")))
            }
        }
        if (i.action == Intent.ACTION_SEND || i.action == Intent.ACTION_SEND_MULTIPLE) {
            val text = i.getStringExtra(Intent.EXTRA_TEXT) ?: ""
            val subj = i.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
            val uris = buildList {
                @Suppress("DEPRECATION")
                (i.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM))?.let { add(it.toString()) }
                @Suppress("DEPRECATION")
                i.getParcelableArrayListExtra<android.net.Uri>(Intent.EXTRA_STREAM)?.forEach { add(it.toString()) }
            }
            vm.push(Screen.Compose(ComposeInit(vm.accounts.value.firstOrNull()?.id, subject = subj, body = text, attachments = uris)))
        }
    }
}
