package de.familie.familienkalender

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Meldet bei allen Familienmitgliedern, wenn jemand anderes etwas einträgt, ändert oder löscht.
 * Ohne Google-Dienste: fragt alle paar Minuten beim eigenen Server nach (nur Änderungen seit dem letzten Mal).
 */
object ChangeWatch {
    private const val PREFS = "change_watch"
    private const val INTERVAL = 5 * 60 * 1000L

    fun configure(ctx: Context, url: String, code: String, me: String, since: Long, names: String, enabled: Boolean, onlyMine: Boolean) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val old = p.getLong("since", 0)
        p.edit().putString("url", url).putString("code", code).putString("me", me).putString("names", names)
            .putBoolean("enabled", enabled).putBoolean("onlyMine", onlyMine)
            .putLong("since", if (since > old) since else old).apply()
        schedule(ctx)
    }

    fun schedule(ctx: Context) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = PendingIntent.getBroadcast(ctx, 4712, Intent(ctx, ChangeWatchReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.cancel(pi)
        if (!p.getBoolean("enabled", true) || p.getString("code", "").isNullOrEmpty()) return
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + INTERVAL, pi)
    }

    /** Läuft im Hintergrund-Thread */
    fun poll(ctx: Context) {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val url = p.getString("url", "") ?: return
        val code = p.getString("code", "") ?: return
        val me = p.getString("me", "") ?: ""
        val since = p.getLong("since", 0)
        if (url.isEmpty() || code.isEmpty()) return
        val c = URL("$url?a=sync&since=$since").openConnection() as HttpURLConnection
        c.connectTimeout = 15000; c.readTimeout = 20000
        c.setRequestProperty("X-Group-Key", code)
        val body = c.inputStream.bufferedReader().use { it.readText() }
        val j = JSONObject(body)
        if (!j.optBoolean("ok")) return
        val newSince = j.optLong("since", since)
        // beim allerersten Mal nur den Stand merken, nichts melden
        if (since > 0) {
            val names = try { JSONObject(p.getString("names", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
            val ms = j.optJSONArray("members")
            if (ms != null) for (i in 0 until ms.length()) { val m = ms.getJSONObject(i); names.put(m.optString("id"), m.optString("name")) }
            val evs = j.optJSONArray("events")
            val lines = mutableListOf<Pair<String, String>>()
            if (evs != null) for (i in 0 until evs.length()) {
                val e = evs.getJSONObject(i)
                val by = e.optString("editedBy")
                if (by.isEmpty() || by == me) continue
                if (p.getBoolean("onlyMine", false)) {
                    val parts = e.optJSONArray("participants")
                    val mine = e.optString("ownerId") == me || e.optString("ownerId").isEmpty() || e.optString("kind") == "birthday" ||
                        (parts != null && (0 until parts.length()).any { parts.optString(it) == me })
                    if (!mine) continue
                }
                val who = names.optString(by, "").ifEmpty { "Jemand" }
                val what = when {
                    e.optBoolean("deleted") -> "hat gelöscht"
                    p.getStringSet("known", emptySet())!!.contains(e.optString("id")) -> "hat geändert"
                    else -> "hat eingetragen"
                }
                val title = (if (e.optString("kind") == "birthday") "🎂 " else "") + e.optString("title")
                lines.add(Pair("$who $what", "$title · ${dateText(e.optString("start"), e.optBoolean("allDay"))}"))
            }
            notify(ctx, lines)
        }
        val evAll = j.optJSONArray("events")
        if (evAll != null && evAll.length() > 0) {
            val known = (p.getStringSet("known", emptySet()) ?: emptySet()).toMutableSet()
            for (i in 0 until evAll.length()) known.add(evAll.getJSONObject(i).optString("id"))
            p.edit().putStringSet("known", known).apply()
        }
        p.edit().putLong("since", newSince).apply()
    }

    private fun dateText(iso: String, allDay: Boolean): String {
        if (iso.length < 10) return ""
        val days = arrayOf("", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
        return try {
            val d = java.time.LocalDateTime.parse(iso.take(19))
            val base = "${days[d.dayOfWeek.value]} ${d.dayOfMonth}.${d.monthValue}."
            if (allDay) base else "$base ${"%02d:%02d".format(d.hour, d.minute)}"
        } catch (_: Exception) { iso.take(10) }
    }

    private fun notify(ctx: Context, lines: List<Pair<String, String>>) {
        if (lines.isEmpty()) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel("aenderungen_push", "Neue Termine von anderen", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Wenn jemand aus der Familie etwas einträgt, ändert oder löscht"
            })
        }
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        val pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        fun b() = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, "aenderungen_push") else @Suppress("DEPRECATION") Notification.Builder(ctx)
        if (lines.size <= 3) {
            for ((i, l) in lines.withIndex()) {
                nm.notify(78000 + (System.currentTimeMillis() % 1000).toInt() * 4 + i, b().setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(l.first).setContentText(l.second).setStyle(Notification.BigTextStyle().bigText(l.second))
                    .setAutoCancel(true).setContentIntent(pi).build())
            }
        } else {
            val text = lines.take(8).joinToString("\n") { "${it.first}: ${it.second}" }
            nm.notify(77999, b().setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("${lines.size} Änderungen im Familienkalender").setContentText(lines.first().second)
                .setStyle(Notification.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(pi).build())
        }
    }
}

class ChangeWatchReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val pending = goAsync()
        Thread {
            try { ChangeWatch.poll(ctx) } catch (_: Exception) {} finally {
                ChangeWatch.schedule(ctx)
                pending.finish()
            }
        }.start()
    }
}
