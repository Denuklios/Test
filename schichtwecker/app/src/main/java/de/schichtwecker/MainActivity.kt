package de.schichtwecker

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import de.schichtwecker.Ui.button
import de.schichtwecker.Ui.card
import de.schichtwecker.Ui.divider
import de.schichtwecker.Ui.dp
import de.schichtwecker.Ui.hbox
import de.schichtwecker.Ui.section
import de.schichtwecker.Ui.switchRow
import de.schichtwecker.Ui.text
import de.schichtwecker.Ui.vbox
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

class MainActivity : Activity() {

    private lateinit var content: LinearLayout
    private val day = SimpleDateFormat("EE dd.MM.", Locale.GERMANY)
    private val hm = SimpleDateFormat("HH:mm", Locale.GERMANY)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Notif.ensureChannels(this)
        val scroll = ScrollView(this).apply { setBackgroundColor(Ui.BG); isFillViewport = true }
        content = vbox(16)
        scroll.addView(content)
        setContentView(scroll)
        askBasicPermissions()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        Thread {
            Scheduler.rescheduleAll(this)
            val shifts = Planner.plan(this)
            runOnUiThread { render(shifts) }
        }.start()
    }

    private fun askBasicPermissions() {
        val need = mutableListOf<String>()
        if (!Planner.hasCalendarPermission(this)) need += Manifest.permission.READ_CALENDAR
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            need += Manifest.permission.POST_NOTIFICATIONS
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 1)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh()
    }

    private fun render(shifts: List<PlannedShift>) {
        val p = Prefs(this)
        val now = System.currentTimeMillis()
        content.removeAllViews()

        // Kopf
        val head = hbox().apply { setPadding(dp(4), dp(8), 0, dp(12)) }
        head.addView(text("SchichtWecker", 26f, Ui.TEXT, bold = true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        head.addView(text("⚙", 26f, Ui.MUTED).apply {
            setPadding(dp(12), 0, dp(4), 0)
            setOnClickListener { startActivity(Intent(this@MainActivity, SettingsActivity::class.java)) }
        })
        content.addView(head)

        // Nächster Wecker
        val next = shifts.firstOrNull {
            it.alarmAt != null && it.alarmAt > now && !it.skipped && !(p.vacationActive && it.start < p.vacationUntil)
        }
        val hero = card(Ui.CARD)
        hero.background = Ui.rounded(Ui.CARD, dp(22).toFloat(), dp(1), 0x55FFB547)
        if (p.vacationActive) {
            hero.addView(text("🏖  Urlaubsmodus", 18f, Ui.ACCENT, bold = true))
            hero.addView(text("Keine Wecker bis ${day.format(Date(p.vacationUntil))} ${hm.format(Date(p.vacationUntil))}", 14f, Ui.MUTED))
        }
        if (next != null) {
            hero.addView(text("Nächster Wecker", 13f, Ui.MUTED))
            hero.addView(text(hm.format(Date(next.alarmAt!!)), 64f, Ui.TEXT, bold = true))
            hero.addView(text("${day.format(Date(next.alarmAt))} · in ${Text.duration(next.alarmAt - now)}", 15f, Ui.ACCENT))
            hero.addView(text("${next.type.name} ${hm.format(Date(next.start))}–${hm.format(Date(next.end))}  ·  „${next.title}“", 14f, Ui.MUTED).apply { setPadding(0, dp(6), 0, 0) })
            if (p.bedtimeOn) {
                val bed = next.alarmAt - p.sleepMin * 60_000L
                if (bed > now) hero.addView(text("🌙 Schlafenszeit ${hm.format(Date(bed))} für ${p.sleepMin / 60} Std ${if (p.sleepMin % 60 > 0) "${p.sleepMin % 60} Min " else ""}Schlaf", 14f, Ui.MUTED))
            }
            hero.addView(button("Diesen Wecker überspringen") {
                p.skipped = p.skipped + next.key; refresh()
            })
        } else if (!p.vacationActive) {
            hero.addView(text("Kein Wecker geplant", 20f, Ui.TEXT, bold = true))
            hero.addView(text(
                if (!Planner.hasCalendarPermission(this)) "Bitte Kalender-Zugriff erlauben."
                else "In den nächsten ${p.lookaheadDays} Tagen wurde keine Schicht im Kalender gefunden. Prüfe in den Einstellungen die Stichwörter (z. B. „Früh“, „Spät“).",
                14f, Ui.MUTED))
        }
        content.addView(hero)

        // Lautlos-Status
        if (p.silentKey != null) {
            val c = card(Ui.CARD2)
            c.addView(text("🔕 Handy ist gerade lautlos (Schicht)", 16f, Ui.TEXT, bold = true))
            c.addView(button("Jetzt wieder laut") { SilentManager.forceEnd(this); refresh() })
            content.addView(c)
        }

        // Gesundheits-Check
        val problems = healthProblems()
        if (problems.isNotEmpty()) {
            content.addView(section("Bitte einrichten"))
            val c = card()
            problems.forEachIndexed { i, (title, desc, fix) ->
                if (i > 0) c.addView(divider())
                val row = vbox().apply { setPadding(0, dp(8), 0, dp(8)) }
                row.addView(text("⚠ $title", 15f, Ui.WARN, bold = true))
                row.addView(text(desc, 13f, Ui.MUTED))
                row.addView(button("Beheben") { fix() })
                c.addView(row)
            }
            content.addView(c)
        }

        // Urlaubsmodus
        content.addView(section("Pause"))
        val vac = card()
        vac.addView(switchRow("Urlaubsmodus", if (p.vacationActive) "bis ${day.format(Date(p.vacationUntil))}" else "Alle Wecker bis zu einem Datum pausieren", p.vacationActive) { on ->
            if (on) pickVacationEnd() else { p.vacationUntil = 0; refresh() }
        })
        content.addView(vac)

        // Kommende Schichten
        content.addView(section("Kommende Schichten"))
        val list = card()
        if (shifts.isEmpty()) list.addView(text("Keine Schichten gefunden.", 14f, Ui.MUTED))
        shifts.take(30).forEachIndexed { i, s ->
            if (i > 0) list.addView(divider())
            val paused = s.skipped || (p.vacationActive && s.start < p.vacationUntil)
            val row = hbox().apply { setPadding(0, dp(10), 0, dp(10)) }
            val col = vbox()
            col.addView(text("${day.format(Date(s.start))}  ${s.type.name}", 16f, if (paused) Ui.MUTED else Ui.TEXT, bold = true))
            val parts = mutableListOf("${hm.format(Date(s.start))}–${hm.format(Date(s.end))}")
            if (s.alarmAt != null) parts += "⏰ ${hm.format(Date(s.alarmAt))}"
            if (s.silentFrom != null) parts += "🔕"
            col.addView(text(parts.joinToString("  ·  "), 14f, if (paused) Ui.MUTED else Ui.ACCENT))
            if (s.skipped) col.addView(text("übersprungen", 12f, Ui.WARN))
            row.addView(col, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            val sw = android.widget.Switch(this).apply {
                isChecked = !s.skipped
                setOnCheckedChangeListener { _, on ->
                    p.skipped = if (on) p.skipped - s.key else p.skipped + s.key
                    refresh()
                }
            }
            if (s.alarmAt != null || s.silentFrom != null) row.addView(sw)
            list.addView(row)
        }
        content.addView(list)

        content.addView(button("Jetzt mit Kalender abgleichen", primary = true) { refresh() })
        content.addView(button("Testalarm in 10 Sekunden") {
            Scheduler.setAlarmClock(this, System.currentTimeMillis() + 10_000, Actions.SNOOZE_FIRE, "test", "Testalarm")
            android.widget.Toast.makeText(this, "Klingelt in 10 Sekunden – gern Bildschirm sperren", android.widget.Toast.LENGTH_LONG).show()
        })
        content.addView(text("Zuletzt abgeglichen: ${if (p.lastSync > 0) SimpleDateFormat("dd.MM. HH:mm", Locale.GERMANY).format(Date(p.lastSync)) else "–"}", 12f, Ui.MUTED).apply {
            gravity = Gravity.CENTER; setPadding(0, dp(12), 0, dp(24))
        })
    }

    private fun pickVacationEnd() {
        val c = Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, 7) }
        val d = DatePickerDialog(this, { _, y, m, dd ->
            val end = Calendar.getInstance().apply { clear(); set(y, m, dd, 23, 59) }.timeInMillis
            Prefs(this).vacationUntil = end; refresh()
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH))
        d.setTitle("Urlaub bis einschließlich")
        d.setOnCancelListener { refresh() }
        d.show()
    }

    private fun healthProblems(): List<Triple<String, String, () -> Unit>> {
        val out = mutableListOf<Triple<String, String, () -> Unit>>()
        val p = Prefs(this)
        if (!Planner.hasCalendarPermission(this))
            out += Triple("Kalender-Zugriff fehlt", "Ohne Zugriff können keine Schichten gelesen werden.") { appSettingsOrAsk() }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            out += Triple("Benachrichtigungen aus", "Nötig, damit der Wecker auf dem Sperrbildschirm erscheint.") { appSettingsOrAsk() }
        if (!SilentManager.hasPolicyAccess(this))
            out += Triple("„Nicht stören“-Zugriff fehlt", "Damit das Handy während der Schicht lautlos geschaltet werden kann. Ohne ihn nur Vibration.") {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
            }
        if (!Scheduler.canExact(this))
            out += Triple("Exakte Wecker nicht erlaubt", "Sonst kann der Wecker einige Minuten zu spät klingeln.") {
                if (Build.VERSION.SDK_INT >= 31) startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            }
        if (Build.VERSION.SDK_INT >= 34 && !getSystemService(NotificationManager::class.java).canUseFullScreenIntent())
            out += Triple("Vollbild-Wecker nicht erlaubt", "Damit der Wecker bei gesperrtem Handy groß erscheint.") {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
            }
        if (!getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName))
            out += Triple("Akku-Optimierung aktiv", "Manche Handys (Samsung, Xiaomi, Huawei) beenden sonst die App und der Kalender wird nicht neu gelesen.") {
                try {
                    startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
                } catch (_: Exception) { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
            }
        if (Planner.hasCalendarPermission(this) && Planner.calendars(this).isEmpty())
            out += Triple("Kein Kalender gefunden", "Ist dein Kalenderkonto auf dem Handy eingerichtet und wird synchronisiert?") {
                startActivity(Intent(Settings.ACTION_SYNC_SETTINGS))
            }
        if (p.calendarIds.isNotEmpty() && Planner.hasCalendarPermission(this) && Planner.calendars(this).none { it.id.toString() in p.calendarIds })
            out += Triple("Gewählter Kalender fehlt", "Der ausgewählte Kalender existiert nicht mehr.") {
                startActivity(Intent(this, SettingsActivity::class.java))
            }
        return out
    }

    private fun appSettingsOrAsk() {
        val asked = getSharedPreferences("ui", MODE_PRIVATE)
        if (!asked.getBoolean("askedOnce", false)) {
            asked.edit().putBoolean("askedOnce", true).apply(); askBasicPermissions()
        } else startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }

    @Suppress("unused")
    private fun info(msg: String) = AlertDialog.Builder(this).setMessage(msg).setPositiveButton("OK", null).show()
}
