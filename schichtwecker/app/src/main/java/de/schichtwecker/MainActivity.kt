package de.schichtwecker

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.NotificationManager
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.Toast
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
    @Volatile private var busy = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Notif.ensureChannels(this)
        val scroll = ScrollView(this).apply { setBackgroundColor(Ui.BG); isFillViewport = true }
        content = vbox(16)
        scroll.addView(content)
        setContentView(scroll)
        askBasicPermissions()
        handleShare(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    override fun onResume() {
        super.onResume()
        refresh(fromServer = true, feedback = false)
    }

    /** Einladung aus dem Familienkalender wurde hierher geteilt */
    private fun handleShare(i: Intent?) {
        if (i?.action != Intent.ACTION_SEND) return
        val text = i.getStringExtra(Intent.EXTRA_TEXT) ?: return
        i.action = null
        applyInvite(text)
    }

    private fun applyInvite(text: String) {
        val inv = Familienkalender.parseInvite(text)
        if (inv == null) {
            AlertDialog.Builder(this).setTitle("Keine Einladung erkannt")
                .setMessage("Im Text muss „Server: https://…“ und „Code: …“ stehen – so wie in der Einladung aus dem Familienkalender.")
                .setPositiveButton("OK", null).show()
            return
        }
        Familienkalender.connect(this, inv.first, inv.second)
        refresh(fromServer = true, feedback = true) { pickMember() }
    }

    private fun refresh(fromServer: Boolean, feedback: Boolean, then: (() -> Unit)? = null) {
        if (busy) return
        busy = true
        if (feedback) showBusy()
        Thread {
            val err = if (fromServer) Familienkalender.fetch(this) else null
            Scheduler.rescheduleAll(this)
            val now = System.currentTimeMillis()
            val shifts = Planner.plan(this, now)
            val raw = Planner.rawEvents(this, now - 3600_000L, now + Prefs(this).lookaheadDays * 24 * 3600_000L)
            runOnUiThread {
                busy = false
                if (isFinishing) return@runOnUiThread
                render(shifts, raw)
                if (feedback) {
                    val msg = if (err != null) "Familienkalender: $err"
                    else "${raw.size} Termine gelesen · ${shifts.size} Schichten erkannt"
                    Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
                }
                then?.invoke()
            }
        }.start()
    }

    private fun showBusy() {
        content.addView(ProgressBar(this).apply { isIndeterminate = true }, 1,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)))
    }

    private fun askBasicPermissions() {
        val need = mutableListOf<String>()
        if (Prefs(this).useDeviceCalendar && !Planner.hasCalendarPermission(this)) need += Manifest.permission.READ_CALENDAR
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            need += Manifest.permission.POST_NOTIFICATIONS
        if (need.isNotEmpty()) requestPermissions(need.toTypedArray(), 1)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh(fromServer = false, feedback = false)
    }

    private fun render(shifts: List<PlannedShift>, raw: List<Planner.Raw>) {
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

        // Familienkalender verbinden
        if (!Familienkalender.connected(this)) {
            content.addView(connectCard())
        } else if (Familienkalender.myId(this).isEmpty() || Familienkalender.members(this).none { it.id == Familienkalender.myId(this) }) {
            val c = card(Ui.CARD2)
            c.addView(text("Wer bist du im Familienkalender?", 18f, Ui.TEXT, bold = true))
            val err = Familienkalender.lastError(this)
            c.addView(text(err ?: "Damit nur deine Schichten den Wecker stellen.", 14f, if (err != null) Ui.WARN else Ui.MUTED))
            c.addView(button("Person auswählen", primary = true) { pickMember() })
            content.addView(c)
        }

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
                if (bed > now) hero.addView(text("🌙 Schlafenszeit ${hm.format(Date(bed))}", 14f, Ui.MUTED))
            }
            hero.addView(button("Diesen Wecker überspringen") {
                p.skipped = p.skipped + next.key; refresh(false, false)
            })
        } else if (!p.vacationActive) {
            hero.addView(text("Kein Wecker geplant", 20f, Ui.TEXT, bold = true))
            hero.addView(text(
                when {
                    !Familienkalender.connected(this) && !Planner.hasCalendarPermission(this) -> "Verbinde oben deinen Familienkalender."
                    raw.isEmpty() -> "In den nächsten ${p.lookaheadDays} Tagen stehen keine Termine für dich im Kalender."
                    else -> "Es gibt ${raw.size} Termine, aber keiner ist als Schicht erkannt. Tippe unten bei „Deine Termine“ auf einen Titel und ordne ihn Früh/Spät/Nacht zu."
                }, 14f, Ui.MUTED))
        }
        content.addView(hero)

        // Lautlos-Status
        if (p.silentKey != null) {
            val c = card(Ui.CARD2)
            c.addView(text("🔕 Handy ist gerade lautlos (Schicht)", 16f, Ui.TEXT, bold = true))
            c.addView(button("Jetzt wieder laut") { SilentManager.forceEnd(this); refresh(false, false) })
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

        // Kommende Schichten
        content.addView(section("Kommende Schichten"))
        val list = card()
        if (shifts.isEmpty()) list.addView(text("Keine Schichten erkannt.", 14f, Ui.MUTED))
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
                    refresh(false, false)
                }
            }
            if (s.alarmAt != null || s.silentFrom != null) row.addView(sw)
            list.addView(row)
        }
        content.addView(list)

        // Termine, die (noch) keine Schicht sind → per Antippen zuordnen
        val types = p.shiftTypes
        val unmatched = raw.filter { Planner.match(it.title, types) == null }
            .groupBy { it.title.trim() }.entries.sortedBy { it.value.first().begin }.take(12)
        if (unmatched.isNotEmpty()) {
            content.addView(section("Deine Termine ohne Schicht-Zuordnung"))
            val c = card()
            c.addView(text("Ist einer davon eine Schicht? Antippen und zuordnen.", 13f, Ui.MUTED))
            unmatched.forEach { (title, occ) ->
                c.addView(divider())
                val r = occ.first()
                val when_ = if (r.allDay) "${day.format(Date(r.begin))} ganztägig" else "${day.format(Date(r.begin))} ${hm.format(Date(r.begin))}"
                c.addView(vbox().apply {
                    setPadding(0, dp(10), 0, dp(10))
                    addView(text(title.ifEmpty { "(ohne Titel)" }, 15f, Ui.TEXT))
                    addView(text("$when_ · ${r.source}${if (occ.size > 1) " · ${occ.size}×" else ""}", 12f, Ui.MUTED))
                    setOnClickListener { assignTitle(title) }
                })
            }
            content.addView(c)
        }

        // Urlaubsmodus
        content.addView(section("Pause"))
        val vac = card()
        vac.addView(switchRow("Urlaubsmodus", if (p.vacationActive) "bis ${day.format(Date(p.vacationUntil))}" else "Alle Wecker bis zu einem Datum pausieren", p.vacationActive) { on ->
            if (on) pickVacationEnd() else { p.vacationUntil = 0; refresh(false, false) }
        })
        content.addView(vac)

        content.addView(button("Jetzt mit Kalender abgleichen", primary = true) { refresh(fromServer = true, feedback = true) })
        content.addView(button("Testalarm in 10 Sekunden") {
            Scheduler.setAlarmClock(this, System.currentTimeMillis() + 10_000, Actions.SNOOZE_FIRE, "test", "Testalarm")
            Toast.makeText(this, "Klingelt in 10 Sekunden – gern Bildschirm sperren", Toast.LENGTH_LONG).show()
        })
        val fk = if (Familienkalender.connected(this)) {
            val me = Familienkalender.members(this).firstOrNull { it.id == Familienkalender.myId(this) }?.name
            val ok = Familienkalender.lastOk(this)
            "Familienkalender${me?.let { " · $it" } ?: ""} · zuletzt ${if (ok > 0) SimpleDateFormat("dd.MM. HH:mm", Locale.GERMANY).format(Date(ok)) else "–"}"
        } else "Familienkalender nicht verbunden"
        content.addView(text(fk, 12f, Ui.MUTED).apply { gravity = Gravity.CENTER; setPadding(0, dp(12), 0, dp(24)) })
    }

    private fun connectCard() = card(Ui.CARD2).apply {
        addView(text("📅 Mit deinem Familienkalender verbinden", 18f, Ui.TEXT, bold = true))
        addView(text(
            "1. Familienkalender öffnen → Menü ☰ → „Jemanden einladen“\n" +
                "2. „Einladung senden“ tippen und hier SchichtWecker auswählen\n\n" +
                "Oder die Einladung kopieren und unten einfügen.", 14f, Ui.MUTED).apply { setPadding(0, dp(6), 0, 0) })
        addView(button("Einladung einfügen", primary = true) { pasteInvite() })
    }

    private fun pasteInvite() {
        val clip = try {
            getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()
        } catch (_: Exception) { null } ?: ""
        val et = EditText(this).apply {
            setText(clip); hint = "Server: https://…\nCode: …"; minLines = 4
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        }
        val wrap = vbox(20).apply { addView(et) }
        AlertDialog.Builder(this).setTitle("Einladung aus dem Familienkalender").setView(wrap)
            .setPositiveButton("Verbinden") { _, _ -> applyInvite(et.text.toString()) }
            .setNegativeButton("Abbrechen", null).show()
    }

    private fun pickMember() {
        val members = Familienkalender.members(this)
        if (members.isEmpty()) {
            val err = Familienkalender.lastError(this)
            AlertDialog.Builder(this).setTitle("Keine Personen gefunden")
                .setMessage(err ?: "Der Familienkalender hat noch keine Personen geliefert. Bitte „Jetzt mit Kalender abgleichen“ tippen.")
                .setPositiveButton("OK", null).show()
            return
        }
        AlertDialog.Builder(this).setTitle("Wer bist du?")
            .setItems(members.map { it.name }.toTypedArray()) { _, i ->
                Familienkalender.setMyId(this, members[i].id)
                refresh(fromServer = false, feedback = true)
            }.show()
    }

    /** Titel einer Schichtart zuordnen (wird als Stichwort gespeichert) */
    private fun assignTitle(title: String) {
        val p = Prefs(this)
        val types = p.shiftTypes.toMutableList()
        val names = types.map { it.name }.toTypedArray()
        AlertDialog.Builder(this).setTitle("„$title“ ist …")
            .setItems(names) { _, i ->
                val t = types[i]
                t.keywords = (t.keywords.split(',').map { it.trim() }.filter { it.isNotEmpty() } + title.trim()).joinToString(", ")
                p.shiftTypes = types
                Toast.makeText(this, "„$title“ zählt jetzt als ${t.name}. Weckzeit in den Einstellungen anpassen.", Toast.LENGTH_LONG).show()
                refresh(false, false)
            }
            .setNegativeButton("Keine Schicht", null).show()
    }

    private fun pickVacationEnd() {
        val c = Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, 7) }
        val d = DatePickerDialog(this, { _, y, m, dd ->
            val end = Calendar.getInstance().apply { clear(); set(y, m, dd, 23, 59) }.timeInMillis
            Prefs(this).vacationUntil = end; refresh(false, false)
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH))
        d.setTitle("Urlaub bis einschließlich")
        d.setOnCancelListener { refresh(false, false) }
        d.show()
    }

    private fun healthProblems(): List<Triple<String, String, () -> Unit>> {
        val out = mutableListOf<Triple<String, String, () -> Unit>>()
        if (Familienkalender.connected(this)) Familienkalender.lastError(this)?.let { err ->
            out += Triple("Familienkalender nicht erreichbar", "$err – die zuletzt geladenen Schichten gelten weiter.") {
                refresh(fromServer = true, feedback = true)
            }
        }
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
            out += Triple("Akku-Optimierung aktiv", "Sonst kann Android die App beenden und der Kalender wird nicht neu gelesen.") {
                try {
                    startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
                } catch (_: Exception) { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
            }
        return out
    }

    private fun appSettingsOrAsk() {
        val asked = getSharedPreferences("ui", MODE_PRIVATE)
        if (!asked.getBoolean("askedOnce", false)) {
            asked.edit().putBoolean("askedOnce", true).apply(); askBasicPermissions()
        } else startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }
}
