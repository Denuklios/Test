package app.mailwerk.sync

import app.mailwerk.tr

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import app.mailwerk.BuildConfig
import app.mailwerk.R
import app.mailwerk.data.Prefs
import app.mailwerk.ui.MainActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Update-Funktion: liest update.json aus dem GitHub-Repo, lädt bei einer neueren Version die APK und startet
 * die Installation. Android installiert sie nur, wenn sie mit demselben Schlüssel signiert ist –
 * eine fremde/manipulierte APK kann die App also nicht ersetzen.
 */
object Updater {
    /** Ordner mit update.json und APK; leer in der Play-Store-Version (dort aktualisiert der Store). */
    val BASE: String = BuildConfig.UPDATE_URL.let { if (it.isEmpty() || it.endsWith("/")) it else "$it/" }
    val enabled: Boolean get() = BuildConfig.SELF_UPDATE && BASE.isNotEmpty()

    data class Info(val versionCode: Int, val versionName: String, val notes: String, val apkUrl: String)

    fun parse(json: String): Info {
        val o = JSONObject(json)
        val apk = o.optString("apk", "Mailwerk.apk")
        return Info(o.getInt("versionCode"), o.getString("versionName"), o.optString("notes", ""),
            if (apk.startsWith("https://")) apk else BASE + apk)
    }

    /** null = keine neuere Version. Wirft bei Netzwerkfehlern. */
    suspend fun check(ctx: Context): Info? = withContext(Dispatchers.IO) {
        if (!enabled) return@withContext null
        val c = URL(BASE + "update.json?t=${System.currentTimeMillis() / 60000}").openConnection() as HttpURLConnection
        c.connectTimeout = 10000; c.readTimeout = 10000; c.useCaches = false
        try {
            if (c.responseCode != 200) error(tr("Update-Server antwortet nicht ({0})", c.responseCode))
            val info = parse(c.inputStream.bufferedReader().readText())
            Prefs(ctx).lastUpdateCheck = System.currentTimeMillis()
            info.takeIf { it.versionCode > BuildConfig.VERSION_CODE }
        } finally { c.disconnect() }
    }

    suspend fun download(ctx: Context, info: Info, progress: (Float) -> Unit): File = withContext(Dispatchers.IO) {
        val dir = File(ctx.cacheDir, "updates").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
        val out = File(dir, "Mailwerk-${info.versionName}.apk")
        var url = URL(info.apkUrl)
        var c = url.openConnection() as HttpURLConnection
        c.instanceFollowRedirects = true; c.connectTimeout = 15000; c.readTimeout = 30000
        if (c.responseCode in 300..399) { url = URL(c.getHeaderField("Location")); c.disconnect(); c = url.openConnection() as HttpURLConnection }
        try {
            if (c.responseCode != 200) error(tr("Download fehlgeschlagen ({0})", c.responseCode))
            val total = c.contentLengthLong
            c.inputStream.use { input ->
                out.outputStream().use { o ->
                    val buf = ByteArray(64 * 1024); var done = 0L
                    while (true) {
                        val n = input.read(buf); if (n < 0) break
                        o.write(buf, 0, n); done += n
                        if (total > 0) progress(done.toFloat() / total)
                    }
                }
            }
        } finally { c.disconnect() }
        if (out.length() < 100_000) error(tr("Heruntergeladene Datei ist unvollständig"))
        out
    }

    /** true = Installationsdialog geöffnet; false = erst „Unbekannte Apps installieren“ erlauben (Einstellungen wurden geöffnet). */
    fun install(ctx: Context, apk: File): Boolean {
        if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
            ctx.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return false
        }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", apk)
        ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
    }

    const val ACTION_RESULT = "app.mailwerk.UPDATE_RESULT"
    const val EXTRA_FOREGROUND = "fg"
    const val EXTRA_APK = "apk"

    /** Darf die App Pakete installieren? (Einstellung „Apps aus dieser Quelle zulassen“) */
    fun canInstall(ctx: Context) = Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()

    /**
     * Automatisches Update über eine Installations-Sitzung. Ab Android 12 ohne Rückfrage, sobald Mailwerk selbst
     * die App installiert hat (also ab dem zweiten Update); sonst fragt Android einmal nach (siehe [UpdateResultReceiver]).
     */
    fun sessionInstall(ctx: Context, apk: File, foreground: Boolean) {
        val pi = ctx.packageManager.packageInstaller
        val params = android.content.pm.PackageInstaller.SessionParams(android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(ctx.packageName)
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(android.content.pm.PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            if (Build.VERSION.SDK_INT >= 34) setPackageSource(android.content.pm.PackageInstaller.PACKAGE_SOURCE_DOWNLOADED_FILE)
        }
        val id = pi.createSession(params)
        pi.openSession(id).use { session ->
            session.openWrite("mailwerk.apk", 0, apk.length()).use { out -> apk.inputStream().use { it.copyTo(out) }; session.fsync(out) }
            val result = Intent(ACTION_RESULT).setPackage(ctx.packageName).setClass(ctx, UpdateResultReceiver::class.java)
                .putExtra(EXTRA_FOREGROUND, foreground).putExtra(EXTRA_APK, apk.absolutePath)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            session.commit(PendingIntent.getBroadcast(ctx, id, result, flags).intentSender)
        }
    }

    /** Hinweis-Benachrichtigung (Update bereit / Bestätigung nötig) */
    fun notify(ctx: Context, title: String, text: String, intent: PendingIntent? = null) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val open = intent ?: PendingIntent.getActivity(ctx, 77, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        runCatching {
            nm.notify(7700, NotificationCompat.Builder(ctx, "reminder").setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title).setContentText(text).setAutoCancel(true).setContentIntent(open).build())
        }
    }

    /** Für den Hintergrund-Abgleich: höchstens alle 12 Stunden prüfen; automatisch installieren oder einmal pro Version benachrichtigen. */
    suspend fun backgroundCheck(ctx: Context) {
        val p = Prefs(ctx)
        if (!enabled) return
        if (!p.autoUpdateCheck || System.currentTimeMillis() - p.lastUpdateCheck < 12 * 3_600_000L) return
        val info = runCatching { check(ctx) }.getOrNull() ?: return
        if (p.autoInstall && canInstall(ctx)) {
            val ok = runCatching { sessionInstall(ctx, download(ctx, info) {}, foreground = false) }.isSuccess
            if (ok) return
        }
        if (p.notifiedUpdate >= info.versionCode) return
        p.notifiedUpdate = info.versionCode
        notify(ctx, tr("Mailwerk {0} ist verfügbar", info.versionName), info.notes.ifBlank { tr("Zum Aktualisieren tippen") })
    }
}

/** Ergebnis der Installations-Sitzung. */
class UpdateResultReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val status = intent.getIntExtra(android.content.pm.PackageInstaller.EXTRA_STATUS, -999)
        val fg = intent.getBooleanExtra(Updater.EXTRA_FOREGROUND, false)
        when (status) {
            android.content.pm.PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // Android möchte einmal bestätigt haben (z. B. erstes Update nach Installation aus dem Browser)
                @Suppress("DEPRECATION")
                val confirm = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                    else intent.getParcelableExtra(Intent.EXTRA_INTENT)) ?: return
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (fg) runCatching { ctx.startActivity(confirm) }.onSuccess { return }
                Updater.notify(ctx, tr("Mailwerk-Update bereit"), tr("Zum Installieren tippen"),
                    PendingIntent.getActivity(ctx, 78, confirm, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            }
            android.content.pm.PackageInstaller.STATUS_SUCCESS -> Unit // App wird ersetzt und neu gestartet
            else -> {
                android.util.Log.w("Mailwerk", "Update-Installation: $status ${intent.getStringExtra(android.content.pm.PackageInstaller.EXTRA_STATUS_MESSAGE)}")
                // Rückfall: klassischer Installationsdialog
                val apk = intent.getStringExtra(Updater.EXTRA_APK)?.let(::File)
                if (fg && apk != null && apk.exists()) runCatching { Updater.install(ctx, apk) }
                else if (status != android.content.pm.PackageInstaller.STATUS_FAILURE_ABORTED)
                    Updater.notify(ctx, tr("Mailwerk-Update nicht installiert"), tr("Zum Aktualisieren tippen"))
            }
        }
    }
}
