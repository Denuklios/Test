package app.mailwerk.desktop

import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.painter.BitmapPainter
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.res.loadImageBitmap
import androidx.compose.ui.res.useResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Notification
import androidx.compose.ui.window.Tray
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowPlacement
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberTrayState
import androidx.compose.ui.window.rememberWindowState
import app.mailwerk.tr
import kotlinx.coroutines.launch
import java.io.File

private var icon: Painter? = null
fun appIcon(): Painter = icon ?: BitmapPainter(useResource("icon.png", ::loadImageBitmap)).also { icon = it }

/** Kleine Windows-Helfer (Autostart über die Registrierung) */
object Windows {
    const val VERSION = "1.2.0"
    private const val RUN = "Software\\Microsoft\\Windows\\CurrentVersion\\Run"
    /** Pfad der Mailwerk.exe (wird vom Starter gesetzt) */
    private val exe: String? get() = System.getProperty("mailwerk.exe")?.takeIf { File(it).exists() }

    fun autostartEnabled(): Boolean = runCatching {
        Paths.isWindows && com.sun.jna.platform.win32.Advapi32Util.registryValueExists(com.sun.jna.platform.win32.WinReg.HKEY_CURRENT_USER, RUN, "Mailwerk")
    }.getOrDefault(false)

    fun setAutostart(on: Boolean) = runCatching {
        if (!Paths.isWindows) return@runCatching
        val hk = com.sun.jna.platform.win32.WinReg.HKEY_CURRENT_USER
        if (on) exe?.let { com.sun.jna.platform.win32.Advapi32Util.registrySetStringValue(hk, RUN, "Mailwerk", "\"$it\" --minimized") }
        else com.sun.jna.platform.win32.Advapi32Util.registryDeleteValue(hk, RUN, "Mailwerk")
    }
}

/** Beim ersten Start: Verknüpfungen im Startmenü und auf dem Desktop anlegen (nur Windows, nur mit Mailwerk.exe) */
private fun createShortcuts(store: Store) {
    val exe = System.getProperty("mailwerk.exe")?.takeIf { File(it).exists() } ?: return
    if (store.setting("shortcuts") == exe) return
    val appData = System.getenv("APPDATA") ?: return
    val targets = listOf(File(appData, "Microsoft\\Windows\\Start Menu\\Programs\\Mailwerk.lnk"),
        File(System.getProperty("user.home"), "Desktop\\Mailwerk.lnk"))
    val ps = targets.joinToString(";") { lnk ->
        "\$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.absolutePath.replace("'", "''")}');" +
            "\$s.TargetPath='${exe.replace("'", "''")}';\$s.WorkingDirectory='${File(exe).parent.replace("'", "''")}';\$s.IconLocation='${exe.replace("'", "''")},0';\$s.Save()"
    }
    runCatching {
        ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps).redirectErrorStream(true).start().waitFor()
        store.setSetting("shortcuts", exe)
    }
}

fun main(args: Array<String>) {
    System.setProperty("skiko.renderApi", System.getProperty("skiko.renderApi") ?: "DIRECT3D".takeIf { Paths.isWindows } ?: "OPENGL")
    Trust.install() // vor der ersten Verbindung: auch dem Windows-Zertifikatsspeicher vertrauen
    val repo = Repo()
    val st = AppState(repo)
    if (Paths.isWindows) Thread { createShortcuts(repo.store) }.start()
    application {
        var visible by remember { mutableStateOf(!args.contains("--minimized")) }
        var themeVersion by remember { mutableIntStateOf(0) }
        val dark = remember(themeVersion) {
            when (repo.store.setting("theme", "system")) { "dark" -> true; "light" -> false; else -> windowsPrefersDark() }
        }
        val tray = rememberTrayState()
        val scope = rememberCoroutineScope()
        // neue Mails -> Windows-Benachrichtigung
        LaunchedEffect(Unit) {
            repo.onNewMail = { acc, msgs ->
                val m = msgs.first()
                tray.sendNotification(Notification(
                    if (msgs.size == 1) m.fromName.ifBlank { m.fromAddr } else tr("{0} neue Mails · {1}", msgs.size, acc.email),
                    if (msgs.size == 1) m.subject else msgs.take(3).joinToString(" · ") { it.fromName.ifBlank { it.fromAddr } }, Notification.Type.Info))
            }
            repo.startPush { scope.launch { repo.sync() } }
        }
        Tray(icon = appIcon(), state = tray, tooltip = "Mailwerk", onAction = { visible = true }, menu = {
            Item(tr("Öffnen"), onClick = { visible = true })
            Item(tr("Abrufen"), onClick = { scope.launch { repo.sync() } })
            Separator()
            Item(tr("Beenden"), onClick = { repo.stopPush(); exitApplication() })
        })
        if (visible) Window(
            onCloseRequest = { if (repo.store.setting("tray", "1") == "1") visible = false else { repo.stopPush(); exitApplication() } },
            title = "Mailwerk", icon = appIcon(),
            state = rememberWindowState(placement = WindowPlacement.Maximized, width = 1440.dp, height = 900.dp),
            // Tastenkürzel wie in Outlook; Textfelder bekommen die Tasten zuerst (Bearbeiten bleibt normal)
            onKeyEvent = { e ->
                if (e.type != KeyEventType.KeyDown) return@Window false
                val ctrl = e.isCtrlPressed; val shift = e.isShiftPressed
                when {
                    e.key == Key.F5 || (ctrl && e.key == Key.M) -> { scope.launch { repo.sync((st.box as? Box.InFolder)?.folder?.id) }; true }
                    ctrl && e.key == Key.N -> { st.newMail(); true }
                    ctrl && e.key == Key.E -> { runCatching { SearchFocus.requester.requestFocus() }; true }
                    ctrl && shift && e.key == Key.R -> { st.targets().lastOrNull()?.let { st.reply(it, true) }; true }
                    ctrl && e.key == Key.R -> { st.targets().lastOrNull()?.let { st.reply(it, false) }; true }
                    ctrl && e.key == Key.F -> { st.targets().lastOrNull()?.let { st.forward(it) }; true }
                    ctrl && e.key == Key.Q -> { scope.launch { st.setSeen(true) }; true }
                    ctrl && e.key == Key.U -> { scope.launch { st.setSeen(false) }; true }
                    ctrl && e.key == Key.A -> { st.marked = st.visible.map { it.id }.toSet(); true }
                    ctrl && shift && e.key == Key.V -> { st.moveDialog = st.targets(); true }
                    ctrl && (e.key == Key.Equals || e.key == Key.Plus || e.key == Key.NumPadAdd) -> { st.changeZoom(effectiveZoom(st) + 0.1f); true }
                    ctrl && (e.key == Key.Minus || e.key == Key.NumPadSubtract) -> { st.changeZoom(effectiveZoom(st) - 0.1f); true }
                    ctrl && (e.key == Key.Zero || e.key == Key.NumPad0) -> { st.changeZoom(1f); true }
                    e.key == Key.Delete -> { scope.launch { st.delete() }; true }
                    e.key == Key.Backspace && !ctrl -> { scope.launch { st.archive() }; true }
                    e.key == Key.DirectionDown -> { st.moveSelection(1); true }
                    e.key == Key.DirectionUp -> { st.moveSelection(-1); true }
                    e.key == Key.Escape -> { st.afterRemove(); true }
                    else -> false
                }
            },
        ) {
            MailwerkTheme(dark) {
                // Titelleiste in derselben Farbe wie die Befehlsleiste (Windows 11)
                val bar = androidx.compose.material3.MaterialTheme.colorScheme.surfaceContainer
                LaunchedEffect(dark) { WinChrome.apply(window, dark, bar) }
                Zoomed(effectiveZoom(st)) {
                    App(st)
                    if (st.addAccount) AccountDialog(st, null) { st.addAccount = false }
                    st.showAccount?.let { a -> AccountDialog(st, a) { st.showAccount = null } }
                    if (st.showSettings && !st.addAccount && st.showAccount == null) SettingsDialog(st, { themeVersion++ }) { st.showSettings = false }
                }
            }
        }
        st.drafts.forEach { d -> androidx.compose.runtime.key(d.id) { ComposerWindow(st, d, dark) { st.drafts = st.drafts - d } } }
    }
}

/** Alles vergrößern/verkleinern (Strg +/-), unabhängig von der Windows-Skalierung */
@androidx.compose.runtime.Composable
fun Zoomed(zoom: Float, content: @androidx.compose.runtime.Composable () -> Unit) {
    val d = androidx.compose.ui.platform.LocalDensity.current
    androidx.compose.runtime.CompositionLocalProvider(
        androidx.compose.ui.platform.LocalDensity provides androidx.compose.ui.unit.Density(d.density * zoom, d.fontScale), content = content)
}
