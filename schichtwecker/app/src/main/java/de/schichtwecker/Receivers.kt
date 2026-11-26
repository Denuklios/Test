package de.schichtwecker

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, i: Intent) {
        val key = i.getStringExtra("key") ?: ""
        val label = i.getStringExtra("label") ?: ""
        val p = Prefs(ctx)
        Notif.ensureChannels(ctx)
        when (i.action) {
            Actions.ALARM -> {
                p.snoozeCountKey = key; p.snoozeCount = 0
                AlarmService.start(ctx, key, label)
            }
            Actions.SNOOZE_FIRE, Actions.WAKE_CHECK_FAIL -> {
                ctx.getSystemService(NotificationManager::class.java).cancel(Notif.ID_WAKE)
                AlarmService.start(ctx, key, label)
            }
            Actions.SILENT_ON -> {
                SilentManager.begin(ctx, key)
                info(ctx, Notif.ID_SILENT, "Handy ist lautlos", "$label – nach Schichtende wird es automatisch wieder laut.", silentAction = true)
            }
            Actions.SILENT_OFF -> {
                SilentManager.end(ctx, key)
                ctx.getSystemService(NotificationManager::class.java).cancel(Notif.ID_SILENT)
            }
            Actions.BEDTIME -> {
                val next = Scheduler.nextActive(ctx)
                if (next != null && next.key == key) {
                    val t = SimpleDateFormat("HH:mm", Locale.GERMANY).format(Date(next.alarmAt!!))
                    info(ctx, Notif.ID_BEDTIME, "Zeit fürs Bett 🌙",
                        "Dein Wecker klingelt um $t ($label). Jetzt schlafen = ${Text.duration(next.alarmAt - System.currentTimeMillis())} Schlaf.",
                        skipAction = true)
                }
            }
            Actions.EVENING -> background { Scheduler.syncAndReschedule(ctx); evening(ctx) }
            Actions.WAKE_CHECK -> {
                wakeCheck(ctx, key, label)
                Scheduler.scheduleWakeCheckFail(ctx, key, label)
            }
            Actions.WAKE_CONFIRM -> {
                Scheduler.cancel(ctx, Actions.WAKE_CHECK_FAIL, key)
                ctx.getSystemService(NotificationManager::class.java).cancel(Notif.ID_WAKE)
            }
            Actions.SKIP_NEXT -> {
                val next = Scheduler.nextActive(ctx)
                if (next != null) p.skipped = p.skipped + next.key
                ctx.getSystemService(NotificationManager::class.java).cancel(Notif.ID_BEDTIME)
                ctx.getSystemService(NotificationManager::class.java).cancel(Notif.ID_EVENING)
                Scheduler.rescheduleAll(ctx)
            }
            Actions.RESYNC -> background {
                Scheduler.syncAndReschedule(ctx)
                // Einmal am Tag nach Updates schauen und, wenn erlaubt, gleich installieren
                if (Updater.shouldCheck(ctx, 20 * 3600_000L) && !AlarmService.running) {
                    val u = Updater.check(ctx)
                    if (u != null && Updater.canInstall(ctx)) Updater.downloadAndInstall(ctx, u)
                    else if (u != null) info(ctx, 7, "SchichtWecker ${u.name} ist da", "App öffnen, um das Update zu installieren.")
                }
            }
            "de.schichtwecker.UNSILENT" -> {
                SilentManager.forceEnd(ctx)
                ctx.getSystemService(NotificationManager::class.java).cancel(Notif.ID_SILENT)
            }
        }
    }

    private fun background(work: () -> Unit) {
        val pending = goAsync()
        Thread { try { work() } finally { pending.finish() } }.start()
    }

    private fun evening(ctx: Context) {
        val now = System.currentTimeMillis()
        val tomorrowStart = Planner.startOfDay(Planner.startOfDay(now) + 30 * 3600_000L)
        val tomorrowEnd = Planner.startOfDay(tomorrowStart + 30 * 3600_000L)
        val p = Prefs(ctx)
        val shifts = Planner.plan(ctx, now).filter { it.start in tomorrowStart until tomorrowEnd }
        val hm = SimpleDateFormat("HH:mm", Locale.GERMANY)
        if (shifts.isEmpty()) return
        val s = shifts.first()
        val text = when {
            p.vacationActive -> "Morgen ${s.type.name}, aber Urlaubsmodus ist an – kein Wecker."
            s.skipped -> "Morgen ${s.type.name} (${hm.format(Date(s.start))}) – Wecker ist übersprungen!"
            s.alarmAt != null -> "Morgen ${s.type.name} ${hm.format(Date(s.start))}–${hm.format(Date(s.end))}. Wecker: ${hm.format(Date(s.alarmAt))}"
            else -> "Morgen ${s.type.name} ${hm.format(Date(s.start))}–${hm.format(Date(s.end))} (ohne Wecker)."
        }
        info(ctx, Notif.ID_EVENING, "Schicht morgen", text, skipAction = s.alarmAt != null && !s.skipped && !p.vacationActive)
    }

    private fun wakeCheck(ctx: Context, key: String, label: String) {
        val confirm = PendingIntent.getBroadcast(
            ctx, 3, Intent(ctx, AlarmReceiver::class.java).setAction(Actions.WAKE_CONFIRM).putExtra("key", key),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val n = Notification.Builder(ctx, Notif.CH_WAKE)
            .setSmallIcon(R.drawable.ic_alarm)
            .setContentTitle("Bist du wach?")
            .setContentText("Tippe innerhalb von 2 Minuten, sonst klingelt der Wecker erneut.")
            .setCategory(Notification.CATEGORY_ALARM)
            .setContentIntent(confirm)
            .addAction(Notification.Action.Builder(null, "Ich bin wach", confirm).build())
            .setAutoCancel(true)
            .build()
        ctx.getSystemService(NotificationManager::class.java).notify(Notif.ID_WAKE, n)
    }

    companion object {
        fun info(ctx: Context, id: Int, title: String, text: String, skipAction: Boolean = false, silentAction: Boolean = false) {
            val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            val b = Notification.Builder(ctx, Notif.CH_INFO)
                .setSmallIcon(R.drawable.ic_alarm)
                .setContentTitle(title).setContentText(text)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setContentIntent(open).setAutoCancel(true)
            if (skipAction) {
                val skip = PendingIntent.getBroadcast(ctx, 4,
                    Intent(ctx, AlarmReceiver::class.java).setAction(Actions.SKIP_NEXT),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                b.addAction(Notification.Action.Builder(null, "Wecker überspringen", skip).build())
            }
            if (silentAction) {
                val un = PendingIntent.getBroadcast(ctx, 5,
                    Intent(ctx, AlarmReceiver::class.java).setAction("de.schichtwecker.UNSILENT"),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                b.addAction(Notification.Action.Builder(null, "Jetzt wieder laut", un).build())
                b.setOngoing(true).setAutoCancel(false)
            }
            try { ctx.getSystemService(NotificationManager::class.java).notify(id, b.build()) } catch (_: SecurityException) {}
        }
    }
}

class SystemReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, i: Intent) {
        if (i.action == null) return
        if (i.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Updater.setStatus(ctx, null)
            AlarmReceiver.info(ctx, 8, "SchichtWecker aktualisiert ✓", "Jetzt Version ${Updater.currentName(ctx)}")
        }
        val pending = goAsync()
        Thread {
            try { Scheduler.syncAndReschedule(ctx) } finally { pending.finish() }
        }.start()
    }
}
