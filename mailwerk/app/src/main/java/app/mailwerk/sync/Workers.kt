package app.mailwerk.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import app.mailwerk.data.Repository
import java.util.concurrent.TimeUnit

class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val errors = Repository.get(applicationContext).sync(notify = true)
        return if (errors.isEmpty()) Result.success() else Result.success() // Fehler werden beim nächsten Lauf erneut versucht
    }
}

class SendWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val id = inputData.getLong("id", 0)
        val err = Repository.get(applicationContext).sendNow(id)
        return if (err == null) Result.success() else Result.failure()
    }
}

/** Kurzer Wecker für Zurückgestellt/Erinnerungen, damit sie pünktlich auftauchen. */
class TimerWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        Repository.get(applicationContext).sync(notify = true)
        return Result.success()
    }
}

object Scheduler {
    private val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun schedulePeriodic(ctx: Context, minutes: Int) {
        val wm = WorkManager.getInstance(ctx)
        if (minutes <= 0) { wm.cancelUniqueWork("sync"); return }
        wm.enqueueUniquePeriodicWork("sync", ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<SyncWorker>(minutes.toLong().coerceAtLeast(15), TimeUnit.MINUTES).setConstraints(net).build())
    }

    fun scheduleSend(ctx: Context, outboxId: Long, at: Long) {
        val delay = (at - System.currentTimeMillis()).coerceAtLeast(0)
        WorkManager.getInstance(ctx).enqueueUniqueWork("send-$outboxId", ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<SendWorker>().setInitialDelay(delay, TimeUnit.MILLISECONDS)
                .setConstraints(net).setInputData(workDataOf("id" to outboxId)).build())
    }

    fun cancelSend(ctx: Context, outboxId: Long) { WorkManager.getInstance(ctx).cancelUniqueWork("send-$outboxId") }

    fun scheduleTimer(ctx: Context, at: Long) {
        val delay = (at - System.currentTimeMillis()).coerceAtLeast(0)
        WorkManager.getInstance(ctx).enqueueUniqueWork("timer-$at", ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<TimerWorker>().setInitialDelay(delay, TimeUnit.MILLISECONDS).build())
    }
}
