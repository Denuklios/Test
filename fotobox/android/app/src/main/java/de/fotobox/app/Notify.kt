package de.fotobox.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.app.Notification

object Notify {
    const val CHANNEL_PROGRESS = "progress"
    const val CHANNEL_DONE = "done"
    const val ID_PROGRESS = 1
    const val ID_DONE = 2

    fun setup(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_PROGRESS, "Upload läuft", NotificationManager.IMPORTANCE_LOW))
        nm.createNotificationChannel(NotificationChannel(CHANNEL_DONE, "Upload fertig", NotificationManager.IMPORTANCE_LOW))
    }

    private fun openApp(ctx: Context) = PendingIntent.getActivity(
        ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
    )

    fun progress(ctx: Context, text: String, done: Int, total: Int): Notification {
        setup(ctx)
        return Notification.Builder(ctx, CHANNEL_PROGRESS)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle("FotoBox sichert …")
            .setContentText(text)
            .setProgress(total, done, total == 0)
            .setOngoing(true)
            .setContentIntent(openApp(ctx))
            .build()
    }

    fun done(ctx: Context, text: String) {
        setup(ctx)
        try {
            ctx.getSystemService(NotificationManager::class.java).notify(
                ID_DONE, Notification.Builder(ctx, CHANNEL_DONE)
                    .setSmallIcon(R.drawable.ic_notify)
                    .setContentTitle("FotoBox")
                    .setContentText(text)
                    .setAutoCancel(true)
                    .setContentIntent(openApp(ctx))
                    .build()
            )
        } catch (_: SecurityException) { }
    }
}
