package de.familie.familienkalender

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import org.json.JSONArray
import org.json.JSONObject

/** Ein Termin mit offenen Vorbereitungen */
data class PrepEntry(val from: Long, val until: Long, val day: Long, val title: String, val items: List<String>, val eventId: String)

object PrepScheduler {
    private const val PREFS = "prep_service"

    fun save(ctx: Context, enabled: Boolean, entries: String) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", enabled).putString("entries", entries).apply()
    }

    fun enabled(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", true)

    fun entries(ctx: Context): List<PrepEntry> {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("entries", "[]") ?: "[]"
        val res = mutableListOf<PrepEntry>()
        try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val o: JSONObject = arr.getJSONObject(i)
                val items = o.getJSONArray("items")
                res.add(PrepEntry(o.getLong("from"), o.getLong("until"), o.optLong("day", o.getLong("until")), o.getString("title"),
                    (0 until items.length()).map { items.getString(it) }, o.optString("eventId")))
            }
        } catch (_: Exception) {}
        return res
    }

    fun active(ctx: Context): List<PrepEntry> {
        val now = System.currentTimeMillis()
        return entries(ctx).filter { it.from <= now && now < it.until && it.items.isNotEmpty() }.sortedBy { it.until }
    }

    fun lastPopup(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("lastPopup", 0)
    fun setLastPopup(ctx: Context, t: Long) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong("lastPopup", t).apply()

    /** Dienst starten/stoppen und den nächsten Weckzeitpunkt setzen */
    fun apply(ctx: Context) {
        val now = System.currentTimeMillis()
        val on = enabled(ctx)
        val act = if (on) active(ctx) else emptyList()
        val svc = Intent(ctx, PrepUnlockService::class.java)
        if (act.isNotEmpty()) {
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(svc) else ctx.startService(svc)
            } catch (_: Exception) {}
        } else {
            ctx.stopService(svc)
        }
        // nächster Zeitpunkt: Beginn eines Fensters oder Ende eines aktiven
        val times = mutableListOf<Long>()
        if (on) {
            for (e in entries(ctx)) {
                if (e.from > now) times.add(e.from)
                if (e.until > now) times.add(e.until)
            }
            // täglich morgens den Text aktualisieren
            if (act.isNotEmpty()) times.add(now + 6 * 3600 * 1000L)
        }
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getBroadcast(ctx, 4711, Intent(ctx, PrepAlarmReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.cancel(pi)
        val next = times.minOrNull() ?: return
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi)
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi)
            }
        } catch (_: Exception) {}
    }

    fun whenText(day: Long): String {
        val cal = java.util.Calendar.getInstance()
        cal.set(java.util.Calendar.HOUR_OF_DAY, 0); cal.set(java.util.Calendar.MINUTE, 0)
        cal.set(java.util.Calendar.SECOND, 0); cal.set(java.util.Calendar.MILLISECOND, 0)
        val d = Math.round((day - cal.timeInMillis) / 86400000.0).toInt()
        return when {
            d <= 0 -> "heute"
            d == 1 -> "morgen"
            else -> "in $d Tagen"
        }
    }
}

/** Weckt zur richtigen Zeit auf und nach dem Neustart des Handys */
class PrepAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        PrepScheduler.apply(context)
    }
}

/**
 * Läuft nur in den Tagen vor einem Termin mit offenen Punkten.
 * Kein Sensor, kein Dauer-Polling: er reagiert nur auf das Entsperren des Handys.
 */
class PrepUnlockService : Service() {
    companion object {
        const val CH_STICKY = "vorbereitung_sperrbildschirm"
        const val CH_POPUP = "vorbereitung_entsperren"
        const val ID_STICKY = 77001
        const val ID_POPUP = 77002
    }

    private var receiver: BroadcastReceiver? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CH_STICKY, "Offene Vorbereitungen (Sperrbildschirm)", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Zeigt offene Punkte vor einem Termin dauerhaft an"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            })
            nm.createNotificationChannel(NotificationChannel(CH_POPUP, "Nicht vergessen (beim Entsperren)", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Erinnert beim Entsperren an offene Punkte"
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                enableVibration(true)
            })
        }
        receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) = onUnlock()
        }
        val f = IntentFilter().apply {
            addAction(Intent.ACTION_USER_PRESENT)
        }
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, f, Context.RECEIVER_EXPORTED) else registerReceiver(receiver, f)
    }

    override fun onDestroy() {
        try { receiver?.let { unregisterReceiver(it) } } catch (_: Exception) {}
        super.onDestroy()
    }

    private fun openIntent(): PendingIntent {
        val i = packageManager.getLaunchIntentForPackage(packageName) ?: Intent(this, MainActivity::class.java)
        i.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun builder(channel: String): Notification.Builder =
        if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channel) else @Suppress("DEPRECATION") Notification.Builder(this)

    private fun summary(act: List<PrepEntry>): Pair<String, String> {
        val first = act.first()
        val total = act.sumOf { it.items.size }
        val title = if (act.size == 1) "🧳 ${first.title} – ${PrepScheduler.whenText(first.day)}: ${first.items.size} offen"
                    else "🧳 $total offene Punkte für ${act.size} Termine"
        val lines = StringBuilder()
        for (e in act) {
            if (act.size > 1) lines.append("${e.title} (${PrepScheduler.whenText(e.day)}):\n")
            e.items.take(8).forEach { lines.append("• ").append(it).append('\n') }
            if (e.items.size > 8) lines.append("… und ${e.items.size - 8} weitere\n")
        }
        return Pair(title, lines.toString().trim())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val act = PrepScheduler.active(this)
        val (title, text) = if (act.isEmpty()) Pair("Vorbereitung", "Alles erledigt 👍") else summary(act)
        val n = builder(CH_STICKY)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text.lineSequence().firstOrNull() ?: "")
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(openIntent())
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID_STICKY, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(ID_STICKY, n)
        }
        if (act.isEmpty()) stopSelf()
        return START_STICKY
    }

    /** Handy wurde entsperrt → höchstens einmal pro Stunde aufpoppen */
    private fun onUnlock() {
        val act = PrepScheduler.active(this)
        if (act.isEmpty()) { stopSelf(); return }
        val now = System.currentTimeMillis()
        val soon = act.first().day - now < 36 * 3600 * 1000L
        val gap = if (soon) 30 * 60 * 1000L else 90 * 60 * 1000L
        if (now - PrepScheduler.lastPopup(this) < gap) return
        PrepScheduler.setLastPopup(this, now)
        val (title, text) = summary(act)
        val n = builder(CH_POPUP)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Nicht vergessen! " + title.removePrefix("🧳 "))
            .setContentText(text.lineSequence().firstOrNull() ?: "")
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setContentIntent(openIntent())
            .setTimeoutAfter(10 * 60 * 1000L)
            .build()
        getSystemService(NotificationManager::class.java).notify(ID_POPUP, n)
    }
}
