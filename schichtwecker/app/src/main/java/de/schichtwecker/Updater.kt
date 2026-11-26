package de.schichtwecker

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Automatische Updates wie beim Familienkalender: Auf dem Server liegen
 * kalender/schichtwecker/version.json und die APK. Die App prüft beim Öffnen
 * (höchstens stündlich) und einmal am Tag im Hintergrund.
 */
object Updater {
    const val DEFAULT_BASE = "https://www.wunsch-fabrik.dk/kalender/schichtwecker/"

    data class Info(val code: Long, val name: String, val url: String, val notes: String)

    fun base(ctx: Context): String {
        val fk = Familienkalender.url(ctx)
        return if (fk.endsWith("/api.php")) fk.removeSuffix("api.php") + "schichtwecker/" else DEFAULT_BASE
    }

    fun currentCode(ctx: Context): Long {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else @Suppress("DEPRECATION") pi.versionCode.toLong()
    }

    fun currentName(ctx: Context): String = ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: "?"

    /** Neuere Version auf dem Server? Nicht im Haupt-Thread aufrufen. */
    fun check(ctx: Context): Info? {
        val p = Prefs(ctx)
        p.sp.edit().putLong("updLastCheck", System.currentTimeMillis()).apply()
        return try {
            val b = base(ctx)
            val c = (URL(b + "version.json?t=" + System.currentTimeMillis()).openConnection() as HttpURLConnection)
                .apply { connectTimeout = 15000; readTimeout = 15000; useCaches = false }
            if (c.responseCode != 200) { c.disconnect(); return null }
            val j = JSONObject(c.inputStream.bufferedReader().readText()); c.disconnect()
            val code = j.optLong("versionCode", 0)
            if (code <= currentCode(ctx)) return null
            Info(code, j.optString("version"), b + j.optString("file", "schichtwecker.apk") + "?v=$code", j.optString("notes"))
        } catch (_: Exception) { null }
    }

    fun shouldCheck(ctx: Context, minIntervalMs: Long) =
        System.currentTimeMillis() - Prefs(ctx).sp.getLong("updLastCheck", 0) > minIntervalMs

    fun canInstall(ctx: Context) = ctx.packageManager.canRequestPackageInstalls()

    /** Lädt die APK und installiert sie. Bei der ersten Aktualisierung fragt Android einmal nach. */
    fun downloadAndInstall(ctx: Context, info: Info): String? {
        return try {
            val f = File(ctx.cacheDir, "update.apk")
            val c = (URL(info.url).openConnection() as HttpURLConnection).apply { connectTimeout = 15000; readTimeout = 60000 }
            if (c.responseCode != 200) return "Download fehlgeschlagen (HTTP ${c.responseCode})"
            c.inputStream.use { inp -> f.outputStream().use { inp.copyTo(it) } }
            c.disconnect()

            val pi = ctx.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(ctx.packageName)
            if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            val id = pi.createSession(params)
            pi.openSession(id).use { s ->
                s.openWrite("schichtwecker.apk", 0, f.length()).use { out -> f.inputStream().use { it.copyTo(out) }; s.fsync(out) }
                val status = PendingIntent.getBroadcast(
                    ctx, 9, Intent(ctx, UpdateReceiver::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )
                s.commit(status.intentSender)
            }
            null
        } catch (e: Exception) { e.message ?: e.toString() }
    }
}

/** Ergebnis der Installation – fragt bei Bedarf den Nutzer */
class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, i: Intent) {
        when (i.getIntExtra(PackageInstaller.EXTRA_STATUS, -99)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = i.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try { ctx.startActivity(confirm) } catch (_: Exception) {}
                // Falls Android das Öffnen im Hintergrund blockiert: Benachrichtigung zum Antippen
                val tap = PendingIntent.getActivity(ctx, 10, confirm, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                val n = android.app.Notification.Builder(ctx, Notif.CH_INFO)
                    .setSmallIcon(R.drawable.ic_alarm).setContentTitle("SchichtWecker-Update bereit")
                    .setContentText("Tippen, um das Update zu installieren").setContentIntent(tap).setAutoCancel(true).build()
                try { ctx.getSystemService(android.app.NotificationManager::class.java).notify(7, n) } catch (_: SecurityException) {}
            }
            PackageInstaller.STATUS_SUCCESS -> ctx.getSystemService(android.app.NotificationManager::class.java).cancel(7)
            else -> AlarmReceiver.info(ctx, 6, "Update nicht installiert",
                i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "Bitte die App öffnen und erneut versuchen.")
        }
    }
}
