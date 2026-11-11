package de.fotobox.app

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Sichert automatisch Fotos und Videos aus der Galerie. */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    companion object {
        const val KEY_TRIGGER = "trigger"
        val lock = Mutex()
    }

    private data class Media(val uri: Uri, val key: String, val name: String, val size: Long, val takenMs: Long)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        val p = Prefs(ctx)
        try {
            if (!p.loggedIn) return@withContext Result.success()
            if (!lock.tryLock()) return@withContext Result.success() // läuft schon
            try {
                runSync(ctx, p)
            } finally {
                lock.unlock()
                p.progress = ""
            }
            Result.success()
        } catch (e: ApiException) {
            p.lastResult = if (e.code == 401) "Abgemeldet – bitte neu anmelden" else "Fehler: ${e.message}"
            Result.success()
        } catch (e: Exception) {
            p.lastResult = "Unterbrochen: ${e.message ?: e.javaClass.simpleName}"
            Result.retry()
        } finally {
            if (inputData.getBoolean(KEY_TRIGGER, false)) {
                // Für das nächste neue Foto wieder bereit sein.
                Scheduler.scheduleMediaTrigger(ctx, ExistingWorkPolicy.APPEND_OR_REPLACE)
            }
        }
    }

    private suspend fun runSync(ctx: Context, p: Prefs) {
        val api = Api(p.server, p.token)
        if (!api.ping()) {
            // Server nicht erreichbar → nicht zu Hause. Später nochmal.
            return
        }
        val db = UploadedDb(ctx)
        val todo = findMedia(ctx, p).filterNot { db.has(it.key) }
        p.lastRun = System.currentTimeMillis()
        if (todo.isEmpty()) {
            p.lastResult = "Alles gesichert"
            return
        }

        trySetForeground(todo.size, 0, "Starte …")
        val month = SimpleDateFormat("yyyy/MM", Locale.US)
        var done = 0
        var failed = 0
        for (m in todo) {
            if (isStopped) break
            p.progress = "Sichere ${done + 1} von ${todo.size}: ${m.name}"
            trySetForeground(todo.size, done, m.name)
            val remote = "Fotos/${month.format(Date(m.takenMs))}/${m.name}"
            try {
                val existing = api.remoteSize(remote)
                if (existing != null && existing == m.size) {
                    db.add(m.key, remote)
                } else {
                    val src = openUri(ctx, m.uri) ?: throw IllegalStateException("nicht lesbar")
                    val saved = api.upload(remote, m.size, m.takenMs, src)
                    db.add(m.key, saved)
                }
                done++
            } catch (e: ApiException) {
                if (e.code == 401) throw e
                failed++
            } catch (e: java.io.FileNotFoundException) {
                failed++ // inzwischen gelöscht
            } catch (e: IllegalStateException) {
                failed++
            }
        }
        p.lastRun = System.currentTimeMillis()
        p.lastResult = buildString {
            append("$done neu gesichert")
            if (failed > 0) append(", $failed fehlgeschlagen")
            if (isStopped) append(" (unterbrochen, geht gleich weiter)")
        }
        if (done > 0) Notify.done(ctx, "$done Fotos/Videos gesichert")
    }

    private fun openUri(ctx: Context, uri: Uri) = try {
        val u = if (ctx.checkSelfPermission(Manifest.permission.ACCESS_MEDIA_LOCATION) == PackageManager.PERMISSION_GRANTED)
            MediaStore.setRequireOriginal(uri) else uri // Original = mit GPS-Daten
        ctx.contentResolver.openInputStream(u)
    } catch (e: SecurityException) {
        ctx.contentResolver.openInputStream(uri)
    }

    private fun findMedia(ctx: Context, p: Prefs): List<Media> {
        val list = mutableListOf<Media>()
        val sources = mutableListOf(MediaStore.Images.Media.EXTERNAL_CONTENT_URI)
        if (p.videos) sources += MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        for (src in sources) {
            val cols = arrayOf(
                MediaStore.MediaColumns._ID,
                MediaStore.MediaColumns.DISPLAY_NAME,
                MediaStore.MediaColumns.SIZE,
                MediaStore.MediaColumns.DATE_ADDED,
                MediaStore.MediaColumns.DATE_MODIFIED,
                MediaStore.MediaColumns.DATE_TAKEN,
            )
            val where = StringBuilder("${MediaStore.MediaColumns.DATE_ADDED} >= ? AND ${MediaStore.MediaColumns.SIZE} > 0")
            val args = mutableListOf(p.sinceSeconds.toString())
            if (Build.VERSION.SDK_INT >= 29) where.append(" AND ${MediaStore.MediaColumns.IS_PENDING} = 0")
            if (p.cameraOnly) {
                if (Build.VERSION.SDK_INT >= 29) {
                    where.append(" AND ${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?"); args += "DCIM/%"
                } else {
                    @Suppress("DEPRECATION")
                    where.append(" AND ${MediaStore.MediaColumns.DATA} LIKE ?"); args += "%/DCIM/%"
                }
            }
            ctx.contentResolver.query(src, cols, where.toString(), args.toTypedArray(),
                "${MediaStore.MediaColumns.DATE_ADDED} ASC")?.use { c ->
                while (c.moveToNext()) {
                    val id = c.getLong(0)
                    val name = c.getString(1) ?: "datei_$id"
                    val size = c.getLong(2)
                    val added = c.getLong(3) * 1000
                    val modified = c.getLong(4)
                    val taken = c.getLong(5).takeIf { it > 0 } ?: added
                    val uri = ContentUris.withAppendedId(src, id)
                    list += Media(uri, "$src/$id/$size/$modified", name.replace('/', '_'), size, taken)
                }
            }
        }
        return list
    }

    private suspend fun trySetForeground(total: Int, done: Int, text: String) {
        try {
            val n = Notify.progress(applicationContext, text, done, total)
            setForeground(
                if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(Notify.ID_PROGRESS, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                else ForegroundInfo(Notify.ID_PROGRESS, n)
            )
        } catch (_: Exception) {
            // Aus dem Hintergrund evtl. nicht erlaubt – dann eben ohne Benachrichtigung.
        }
    }
}
