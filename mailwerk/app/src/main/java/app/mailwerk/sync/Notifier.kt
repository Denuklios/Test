package app.mailwerk.sync

import app.mailwerk.tr

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.mailwerk.R
import app.mailwerk.data.Account
import app.mailwerk.data.Message
import app.mailwerk.data.OutboxItem
import app.mailwerk.ui.MainActivity

object Notifier {
    private const val CH_MAIL = "mail"
    private const val CH_REMIND = "reminder"
    private const val CH_ERROR = "errors"

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_MAIL, tr("Neue E-Mails"), NotificationManager.IMPORTANCE_DEFAULT))
        nm.createNotificationChannel(NotificationChannel(CH_REMIND, tr("Erinnerungen & Zurückgestellt"), NotificationManager.IMPORTANCE_HIGH))
        nm.createNotificationChannel(NotificationChannel(CH_ERROR, tr("Versandfehler"), NotificationManager.IMPORTANCE_HIGH))
    }

    private fun allowed(ctx: Context) = ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun open(ctx: Context, messageId: Long?): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            messageId?.let { putExtra("open_message", it) }
        }
        return PendingIntent.getActivity(ctx, (messageId ?: 0).toInt(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    @Suppress("MissingPermission")
    fun newMail(ctx: Context, acc: Account, msgs: List<Message>) {
        if (!allowed(ctx)) return
        val nm = NotificationManagerCompat.from(ctx)
        val group = "acc_${acc.id}"
        msgs.takeLast(5).forEach { m ->
            val n = NotificationCompat.Builder(ctx, CH_MAIL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(m.fromName.ifBlank { m.fromAddr })
                .setContentText(m.subject)
                .setStyle(NotificationCompat.BigTextStyle().bigText("${m.subject}\n${m.snippet}"))
                .setSubText(acc.email).setColor(acc.color)
                .setWhen(m.date).setShowWhen(true)
                .setGroup(group).setAutoCancel(true)
                .setContentIntent(open(ctx, m.id))
                .build()
            nm.notify(m.id.toInt(), n)
        }
        if (msgs.size > 1) {
            nm.notify(-acc.id.toInt() - 1000, NotificationCompat.Builder(ctx, CH_MAIL)
                .setSmallIcon(R.drawable.ic_notification).setContentTitle(tr("{0} neue E-Mails", msgs.size))
                .setSubText(acc.email).setGroup(group).setGroupSummary(true).setAutoCancel(true)
                .setContentIntent(open(ctx, null)).build())
        }
    }

    @Suppress("MissingPermission")
    fun reminder(ctx: Context, m: Message, text: String) {
        if (!allowed(ctx)) return
        NotificationManagerCompat.from(ctx).notify(m.id.toInt() + 500000, NotificationCompat.Builder(ctx, CH_REMIND)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(text).setContentText(m.fromName.ifBlank { m.fromAddr })
            .setAutoCancel(true).setContentIntent(open(ctx, m.id)).build())
    }

    @Suppress("MissingPermission")
    fun sendFailed(ctx: Context, o: OutboxItem, error: String) {
        if (!allowed(ctx)) return
        NotificationManagerCompat.from(ctx).notify(o.id.toInt() + 900000, NotificationCompat.Builder(ctx, CH_ERROR)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(tr("Senden fehlgeschlagen: {0}", o.subject))
            .setContentText(error).setStyle(NotificationCompat.BigTextStyle().bigText(error))
            .setAutoCancel(true).setContentIntent(open(ctx, null)).build())
    }
}
