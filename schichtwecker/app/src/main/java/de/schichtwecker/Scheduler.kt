package de.schichtwecker

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object Actions {
    const val ALARM = "de.schichtwecker.ALARM"
    const val SNOOZE_FIRE = "de.schichtwecker.SNOOZE_FIRE"
    const val SILENT_ON = "de.schichtwecker.SILENT_ON"
    const val SILENT_OFF = "de.schichtwecker.SILENT_OFF"
    const val BEDTIME = "de.schichtwecker.BEDTIME"
    const val EVENING = "de.schichtwecker.EVENING"
    const val RESYNC = "de.schichtwecker.RESYNC"
    const val WAKE_CHECK = "de.schichtwecker.WAKE_CHECK"
    const val WAKE_CHECK_FAIL = "de.schichtwecker.WAKE_CHECK_FAIL"
    const val WAKE_CONFIRM = "de.schichtwecker.WAKE_CONFIRM"
    const val SKIP_NEXT = "de.schichtwecker.SKIP_NEXT"
}

object Notif {
    const val CH_ALARM = "alarm"
    const val CH_INFO = "info"
    const val CH_WAKE = "wake"
    const val ID_ALARM = 1
    const val ID_BEDTIME = 2
    const val ID_EVENING = 3
    const val ID_WAKE = 4
    const val ID_SILENT = 5

    fun ensureChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CH_ALARM, "Wecker", NotificationManager.IMPORTANCE_HIGH).apply {
            setSound(null, null); enableVibration(false); setBypassDnd(true)
            description = "Klingelnder Wecker"
        })
        nm.createNotificationChannel(NotificationChannel(CH_WAKE, "Wach-Kontrolle", NotificationManager.IMPORTANCE_HIGH).apply {
            setBypassDnd(true); description = "Fragt nach dem Wecker, ob du wirklich wach bist"
        })
        nm.createNotificationChannel(NotificationChannel(CH_INFO, "Hinweise", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Schlafenszeit, Abendübersicht, Lautlos-Status"
        })
    }
}

object Scheduler {
    private const val TAG = "SchichtWecker"
    private val fmt get() = SimpleDateFormat("EE dd.MM. HH:mm", Locale.GERMANY)
    private val hm get() = SimpleDateFormat("HH:mm", Locale.GERMANY)

    fun canExact(ctx: Context): Boolean {
        val am = ctx.getSystemService(AlarmManager::class.java)
        return Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    }

    private fun intent(ctx: Context, action: String, key: String, label: String = "") =
        Intent(ctx, AlarmReceiver::class.java).setAction(action)
            .setData(Uri.parse("sw://$action/$key"))
            .putExtra("key", key).putExtra("label", label)

    private fun pi(ctx: Context, i: Intent) =
        PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun showPi(ctx: Context) = PendingIntent.getActivity(
        ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
    )

    /** Wecker-Alarm: setAlarmClock = höchste Zuverlässigkeit, erscheint als "nächster Wecker" im System. */
    fun setAlarmClock(ctx: Context, at: Long, action: String, key: String, label: String) {
        val am = ctx.getSystemService(AlarmManager::class.java)
        try {
            am.setAlarmClock(AlarmManager.AlarmClockInfo(at, showPi(ctx)), pi(ctx, intent(ctx, action, key, label)))
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(ctx, intent(ctx, action, key, label)))
        }
    }

    private fun setExact(ctx: Context, at: Long, action: String, key: String, label: String = "") {
        val am = ctx.getSystemService(AlarmManager::class.java)
        val p = pi(ctx, intent(ctx, action, key, label))
        try {
            if (canExact(ctx)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p)
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, p)
        }
    }

    fun cancel(ctx: Context, action: String, key: String) {
        ctx.getSystemService(AlarmManager::class.java).cancel(pi(ctx, intent(ctx, action, key)))
    }

    /** Liest den Kalender neu und plant alle Wecker, Lautlos-Zeiten und Hinweise neu. */
    fun rescheduleAll(ctx: Context) {
        Notif.ensureChannels(ctx)
        val p = Prefs(ctx)
        val now = System.currentTimeMillis()

        // Alles Bisherige abbrechen
        for (entry in p.scheduled) {
            val parts = entry.split('|', limit = 2)
            if (parts.size == 2) cancel(ctx, parts[0], parts[1])
        }
        val newScheduled = mutableSetOf<String>()
        fun track(action: String, key: String) { newScheduled += "$action|$key" }

        val shifts = Planner.plan(ctx, now)
        // Übersprungene Einträge aufräumen, die es nicht mehr gibt
        val keys = shifts.map { it.key }.toSet()
        p.skipped = p.skipped.filter { it in keys }.toSet()

        val vacation = p.vacationUntil
        var activeWindow: PlannedShift? = null
        var nextAlarm: PlannedShift? = null

        for (s in shifts) {
            val paused = s.skipped || (vacation > now && s.start < vacation)
            if (paused) continue
            val label = "${s.type.name} · ${hm.format(Date(s.start))}–${hm.format(Date(s.end))}"
            if (s.alarmAt != null && s.alarmAt > now) {
                setAlarmClock(ctx, s.alarmAt, Actions.ALARM, s.key, label); track(Actions.ALARM, s.key)
                if (nextAlarm == null) nextAlarm = s
                if (p.bedtimeOn) {
                    val bed = s.alarmAt - p.sleepMin * 60_000L
                    if (bed > now) { setExact(ctx, bed, Actions.BEDTIME, s.key, label); track(Actions.BEDTIME, s.key) }
                }
            }
            if (s.silentFrom != null && s.silentTo != null && s.silentTo > now) {
                if (s.silentFrom > now) { setExact(ctx, s.silentFrom, Actions.SILENT_ON, s.key, label); track(Actions.SILENT_ON, s.key) }
                else if (activeWindow == null) activeWindow = s
                setExact(ctx, s.silentTo, Actions.SILENT_OFF, s.key, label); track(Actions.SILENT_OFF, s.key)
            }
        }

        // Laufende Schicht (z. B. nach Neustart): sofort lautlos
        if (activeWindow != null) SilentManager.begin(ctx, activeWindow.key)
        else {
            // Sitzung aktiv, aber Schicht nicht mehr im Kalender → wieder laut
            val active = p.silentKey
            if (active != null && shifts.none { it.key == active && it.silentTo != null && it.silentTo > now && it.silentFrom!! <= now })
                SilentManager.end(ctx, active)
        }

        // Abendübersicht für morgen
        if (p.eveningSummary) {
            val today = Planner.startOfDay(now)
            var ev = Planner.atMinute(today, p.eveningMinOfDay)
            if (ev <= now) ev = Planner.atMinute(Planner.startOfDay(today + 30 * 3600_000L), p.eveningMinOfDay)
            setExact(ctx, ev, Actions.EVENING, "daily"); track(Actions.EVENING, "daily")
        }

        // Regelmäßig neu lesen (Kalender kann sich ändern), etwa stündlich
        val am = ctx.getSystemService(AlarmManager::class.java)
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, now + 3600_000L, pi(ctx, intent(ctx, Actions.RESYNC, "periodic")))
        track(Actions.RESYNC, "periodic")
        if (vacation > now) { setExact(ctx, vacation + 1000, Actions.RESYNC, "vacation"); track(Actions.RESYNC, "vacation") }

        p.scheduled = newScheduled
        p.lastSync = now
        Log.i(TAG, "geplant: ${shifts.size} Schichten, nächster Wecker ${nextAlarm?.alarmAt?.let { fmt.format(Date(it)) }}")
    }

    /** Familienkalender vom Server holen, dann neu planen. Nicht im Haupt-Thread aufrufen. */
    fun syncAndReschedule(ctx: Context): String? {
        val err = Familienkalender.fetch(ctx)
        rescheduleAll(ctx)
        return err
    }

    fun nextActive(ctx: Context): PlannedShift? {
        val p = Prefs(ctx); val now = System.currentTimeMillis()
        return Planner.plan(ctx, now).firstOrNull {
            it.alarmAt != null && it.alarmAt > now && !it.skipped && !(p.vacationUntil > now && it.start < p.vacationUntil)
        }
    }

    fun scheduleSnooze(ctx: Context, key: String, label: String, minutes: Int) {
        setAlarmClock(ctx, System.currentTimeMillis() + minutes * 60_000L, Actions.SNOOZE_FIRE, key, label)
    }

    fun scheduleWakeCheck(ctx: Context, key: String, label: String, minutes: Int) {
        setExact(ctx, System.currentTimeMillis() + minutes * 60_000L, Actions.WAKE_CHECK, key, label)
    }

    fun scheduleWakeCheckFail(ctx: Context, key: String, label: String) {
        setExact(ctx, System.currentTimeMillis() + 2 * 60_000L, Actions.WAKE_CHECK_FAIL, key, label)
    }
}

/** Schaltet das Handy lautlos und stellt danach den vorherigen Zustand wieder her. */
object SilentManager {

    fun hasPolicyAccess(ctx: Context) =
        ctx.getSystemService(NotificationManager::class.java).isNotificationPolicyAccessGranted

    fun begin(ctx: Context, key: String) {
        val p = Prefs(ctx)
        val am = ctx.getSystemService(AudioManager::class.java)
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val alreadyActive = p.silentKey != null
        if (p.silentKey == key) return
        if (p.sp.getString("silentDismissed", null) == key) return
        if (!alreadyActive) {
            p.prevRinger = am.ringerMode
            p.prevFilter = nm.currentInterruptionFilter
        }
        val access = hasPolicyAccess(ctx)
        try {
            when (if (access) p.silentMode else SilentMode.VIBRATE) {
                SilentMode.DND_PRIORITY -> nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY)
                SilentMode.DND_ALARMS -> nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS)
                SilentMode.SILENT -> am.ringerMode = AudioManager.RINGER_MODE_SILENT
                SilentMode.VIBRATE -> am.ringerMode = AudioManager.RINGER_MODE_VIBRATE
            }
        } catch (e: SecurityException) {
            try { am.ringerMode = AudioManager.RINGER_MODE_VIBRATE } catch (_: SecurityException) {}
        }
        p.appliedRinger = am.ringerMode
        p.appliedFilter = nm.currentInterruptionFilter
        p.silentKey = key
    }

    fun end(ctx: Context, key: String) {
        val p = Prefs(ctx)
        if (p.silentKey != key) return
        val am = ctx.getSystemService(AudioManager::class.java)
        val nm = ctx.getSystemService(NotificationManager::class.java)
        // Nur zurückstellen, wenn du in der Zwischenzeit nichts selbst geändert hast
        val untouched = am.ringerMode == p.appliedRinger && nm.currentInterruptionFilter == p.appliedFilter
        if (untouched) {
            try {
                if (hasPolicyAccess(ctx) && p.prevFilter > 0) nm.setInterruptionFilter(p.prevFilter)
                if (p.prevRinger >= 0) am.ringerMode = p.prevRinger
            } catch (_: SecurityException) {}
        }
        p.silentKey = null
    }

    /** Sofort wieder laut (Knopf in der App) */
    fun forceEnd(ctx: Context) {
        val k = Prefs(ctx).silentKey ?: return
        val p = Prefs(ctx)
        p.appliedRinger = ctx.getSystemService(AudioManager::class.java).ringerMode
        p.appliedFilter = ctx.getSystemService(NotificationManager::class.java).currentInterruptionFilter
        end(ctx, k)
        p.sp.edit().putString("silentDismissed", k).apply()
    }
}
