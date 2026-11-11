package app.mailwerk.sync

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
            if (c.responseCode != 200) error("Update-Server antwortet nicht (${c.responseCode})")
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
            if (c.responseCode != 200) error("Download fehlgeschlagen (${c.responseCode})")
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
        if (out.length() < 100_000) error("Heruntergeladene Datei ist unvollständig")
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

    /** Für den Hintergrund-Abgleich: höchstens alle 12 Stunden prüfen und einmal pro Version benachrichtigen. */
    suspend fun backgroundCheck(ctx: Context) {
        val p = Prefs(ctx)
        if (!enabled) return
        if (!p.autoUpdateCheck || System.currentTimeMillis() - p.lastUpdateCheck < 12 * 3_600_000L) return
        val info = runCatching { check(ctx) }.getOrNull() ?: return
        if (p.notifiedUpdate >= info.versionCode) return
        p.notifiedUpdate = info.versionCode
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val open = PendingIntent.getActivity(ctx, 77, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        runCatching {
            nm.notify(7700, NotificationCompat.Builder(ctx, "reminder").setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Mailwerk ${info.versionName} ist verfügbar").setContentText(info.notes.ifBlank { "Zum Aktualisieren tippen" })
                .setAutoCancel(true).setContentIntent(open).build())
        }
    }
}
