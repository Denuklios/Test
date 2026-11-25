package app.nfcwerkstatt

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.nfcwerkstatt.automation.Http
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class UpdateInfo(val version: String, val code: Long, val apkUrl: String, val notes: String)

/**
 * App-Updates wie bei den anderen Apps: version.json + APK liegen auf einem Server
 * (Standard: dieses Repo), die App prüft beim Start und installiert per PackageInstaller.
 */
object Updater {
    const val DEFAULT_BASE = "https://raw.githubusercontent.com/denuklios/test/ccr-836a5f86-m7ar5n/nfc-app/"

    fun base(ctx: Context): String =
        ctx.getSharedPreferences("updates", Context.MODE_PRIVATE).getString("base", null) ?: DEFAULT_BASE

    fun setBase(ctx: Context, url: String?) {
        ctx.getSharedPreferences("updates", Context.MODE_PRIVATE).edit()
            .putString("base", url?.trim()?.let { if (it.endsWith("/")) it else "$it/" }).apply()
    }

    fun currentCode(ctx: Context): Long {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else @Suppress("DEPRECATION") pi.versionCode.toLong()
    }

    fun currentName(ctx: Context): String =
        runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: "?"

    /** Liefert Infos, wenn eine neuere Version bereitliegt, sonst null. */
    fun check(ctx: Context): UpdateInfo? {
        val b = base(ctx)
        val (code, text) = Http.request("GET", b + "update/version.json?t=" + System.currentTimeMillis(), timeoutMs = 10000)
        if (code != 200) throw IllegalStateException("Update-Server antwortet mit $code")
        val j = JSONObject(text)
        val info = UpdateInfo(j.getString("version"), j.getLong("code"), b + j.getString("file"), j.optString("notes"))
        return info.takeIf { it.code > currentCode(ctx) }
    }

    fun canInstall(ctx: Context) = ctx.packageManager.canRequestPackageInstalls()

    fun openInstallPermission(ctx: Context) {
        ctx.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    /** Lädt die APK und übergibt sie dem Android-Installer (läuft im Hintergrund-Thread). */
    fun downloadAndInstall(ctx: Context, info: UpdateInfo) {
        val dir = File(ctx.cacheDir, "updates").apply { mkdirs() }
        val apk = File(dir, "update.apk")
        val c = URL(info.apkUrl).openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 60000
        try {
            if (c.responseCode != 200) throw IllegalStateException("Download fehlgeschlagen (${c.responseCode})")
            c.inputStream.use { input -> apk.outputStream().use { input.copyTo(it) } }
        } finally {
            c.disconnect()
        }
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        params.setAppPackageName(ctx.packageName)
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        val id = installer.createSession(params)
        installer.openSession(id).use { s ->
            s.openWrite("nfc-werkstatt.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                s.fsync(out)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            val pi = PendingIntent.getBroadcast(ctx, id, Intent(ctx, InstallResultReceiver::class.java), flags)
            s.commit(pi.intentSender)
        }
    }
}

/** Ergebnis der Installation; fragt Android nach Bestätigung, wird der Dialog geöffnet. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm: Intent? = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION") intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { if (confirm != null) ctx.startActivity(confirm) }
            }
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> ctx.getSharedPreferences("updates", Context.MODE_PRIVATE).edit()
                .putString("error", intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "unbekannt").apply()
        }
    }
}
