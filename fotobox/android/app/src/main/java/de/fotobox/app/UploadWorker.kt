package de.fotobox.app

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Lädt die Warteschlange (selbst gewählte Dateien) in den Ordner „Dateien“ hoch. */
class UploadWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val ctx = applicationContext
        val p = Prefs(ctx)
        if (!p.loggedIn) return@withContext Result.success()
        val files = FileQueue.pending(ctx)
        if (files.isEmpty()) return@withContext Result.success()
        val api = Api(p.server, p.token)
        if (!api.ping()) {
            p.lastResult = "${files.size} Datei(en) warten – Server nicht erreichbar"
            return@withContext Result.retry()
        }
        var ok = 0
        for (f in files) {
            if (isStopped) return@withContext Result.retry()
            p.progress = "Lade hoch: ${f.name}"
            try {
                api.upload("Dateien/${f.name}", f.length(), f.lastModified(), f.inputStream())
                f.parentFile?.deleteRecursively()
                ok++
            } catch (e: ApiException) {
                if (e.code == 401) { p.lastResult = "Abgemeldet – bitte neu anmelden"; break }
            } catch (e: Exception) {
                p.progress = ""
                return@withContext Result.retry()
            }
        }
        p.progress = ""
        p.lastResult = "$ok Datei(en) hochgeladen"
        if (ok > 0) Notify.done(ctx, "$ok Datei(en) hochgeladen")
        Result.success()
    }
}
