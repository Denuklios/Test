package de.fotobox.app

import android.content.Context
import android.provider.MediaStore
import androidx.work.*
import java.util.concurrent.TimeUnit

object Scheduler {
    private const val PERIODIC = "fotobox-periodic"
    private const val MEDIA = "fotobox-media"
    private const val NOW = "fotobox-now"
    const val FILES = "fotobox-files"

    private fun wifi(p: Prefs) = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.UNMETERED)
        .setRequiresCharging(p.onlyCharging)

    /** Alles für die automatische Sicherung einplanen. */
    fun schedule(ctx: Context, replace: Boolean = false) {
        val p = Prefs(ctx)
        val wm = WorkManager.getInstance(ctx)
        if (!p.loggedIn) return cancelAll(ctx)

        // Alle 15 Minuten im WLAN – und sofort, wenn man ins WLAN kommt und die Zeit um ist.
        val periodic = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(wifi(p).build())
            .build()
        wm.enqueueUniquePeriodicWork(
            PERIODIC,
            if (replace) ExistingPeriodicWorkPolicy.UPDATE else ExistingPeriodicWorkPolicy.KEEP,
            periodic
        )
        scheduleMediaTrigger(ctx, if (replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP)
    }

    /** Startet, sobald ein neues Foto/Video entsteht (und WLAN da ist). */
    fun scheduleMediaTrigger(ctx: Context, policy: ExistingWorkPolicy) {
        val p = Prefs(ctx)
        val c = wifi(p)
            .addContentUriTrigger(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true)
            .addContentUriTrigger(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true)
            .setTriggerContentUpdateDelay(10, TimeUnit.SECONDS)
            .setTriggerContentMaxDelay(2, TimeUnit.MINUTES)
            .build()
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(c)
            .setInputData(workDataOf(SyncWorker.KEY_TRIGGER to true))
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(MEDIA, policy, req)
    }

    /** Knopf „Jetzt sichern“. */
    fun syncNow(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(NOW, ExistingWorkPolicy.KEEP, req)
    }

    /** Warteschlange mit selbst gewählten Dateien abarbeiten. */
    fun uploadFiles(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<UploadWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork(FILES, ExistingWorkPolicy.APPEND_OR_REPLACE, req)
    }

    fun cancelAll(ctx: Context) {
        val wm = WorkManager.getInstance(ctx)
        listOf(PERIODIC, MEDIA, NOW, FILES).forEach { wm.cancelUniqueWork(it) }
    }
}
