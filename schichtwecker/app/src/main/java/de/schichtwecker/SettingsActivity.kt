package de.schichtwecker

import android.app.Activity
import android.app.AlertDialog
import android.app.TimePickerDialog
import android.content.Intent
import android.media.RingtoneManager
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import de.schichtwecker.Ui.button
import de.schichtwecker.Ui.card
import de.schichtwecker.Ui.divider
import de.schichtwecker.Ui.dp
import de.schichtwecker.Ui.section
import de.schichtwecker.Ui.switchRow
import de.schichtwecker.Ui.text
import de.schichtwecker.Ui.valueRow
import de.schichtwecker.Ui.vbox

class SettingsActivity : Activity() {

    private lateinit var content: LinearLayout
    private lateinit var p: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        p = Prefs(this)
        val scroll = ScrollView(this).apply { setBackgroundColor(Ui.BG) }
        content = vbox(16)
        scroll.addView(content)
        setContentView(scroll)
        render()
    }

    override fun onPause() {
        super.onPause()
        Thread { Scheduler.rescheduleAll(applicationContext) }.start()
    }

    private fun render() {
        content.removeAllViews()
        content.addView(text("Einstellungen", 26f, Ui.TEXT, bold = true).apply { setPadding(dp(4), dp(8), 0, dp(4)) })

        // Kalender
        content.addView(section("Kalender"))
        val cal = card()
        val cals = Planner.calendars(this)
        val chosen = p.calendarIds
        val calLabel = if (chosen.isEmpty()) "Alle" else cals.filter { it.id.toString() in chosen }.joinToString { it.name }.ifEmpty { "–" }
        cal.addView(valueRow("Schicht-Kalender", calLabel) { pickCalendars(cals) })
        cal.addView(divider())
        cal.addView(valueRow("Vorausschau", "${p.lookaheadDays} Tage") {
            number("Wie viele Tage im Voraus lesen?", p.lookaheadDays, 1, 90) { p.lookaheadDays = it; render() }
        })
        content.addView(cal)

        // Schichtarten
        content.addView(section("Schichtarten"))
        val types = card()
        types.addView(text("Eine Schicht wird erkannt, wenn ein Stichwort im Titel des Kalendereintrags steht. Bei ganztägigen Einträgen gelten die hier eingestellten Schichtzeiten.", 13f, Ui.MUTED).apply { setPadding(0, 0, 0, dp(6)) })
        p.shiftTypes.forEachIndexed { i, t ->
            if (i > 0) types.addView(divider())
            val wake = if (!t.alarmOn) "kein Wecker" else if (t.fixedTime) "⏰ ${Text.hm(t.fixedMinOfDay)}" else "⏰ ${t.offsetMin} Min vorher"
            types.addView(valueRow(t.name, "$wake${if (t.silentOn) " · 🔕" else ""}") { editType(i) })
        }
        types.addView(button("+ Schichtart hinzufügen") { editType(-1) })
        content.addView(types)

        // Lautlos
        content.addView(section("Lautlos während der Schicht"))
        val sil = card()
        sil.addView(valueRow("Art", SilentMode.labels[p.silentMode]) {
            AlertDialog.Builder(this).setTitle("Während der Schicht")
                .setSingleChoiceItems(SilentMode.labels, p.silentMode) { d, w -> p.silentMode = w; d.dismiss(); render() }.show()
        })
        sil.addView(divider())
        sil.addView(valueRow("Lautlos ab", if (p.silentBeforeMin == 0) "Schichtbeginn" else "${p.silentBeforeMin} Min vor Beginn") {
            number("Minuten vor Schichtbeginn lautlos", p.silentBeforeMin, 0, 240) { p.silentBeforeMin = it; render() }
        })
        sil.addView(divider())
        sil.addView(valueRow("Wieder laut", if (p.silentAfterMin == 0) "bei Schichtende" else "${p.silentAfterMin} Min nach Ende") {
            number("Minuten nach Schichtende wieder laut", p.silentAfterMin, 0, 240) { p.silentAfterMin = it; render() }
        })
        sil.addView(text("Hast du während der Schicht selbst etwas umgestellt, wird danach nichts überschrieben. Wecker klingeln immer, auch im Nicht-stören-Modus.", 12f, Ui.MUTED).apply { setPadding(0, dp(6), 0, 0) })
        content.addView(sil)

        // Wecken
        content.addView(section("Wecken"))
        val w = card()
        val rtName = p.ringtone?.let { RingtoneManager.getRingtone(this, Uri.parse(it))?.getTitle(this) } ?: "Standard-Weckton"
        w.addView(valueRow("Weckton", rtName) { pickRingtone() })
        w.addView(divider())
        w.addView(valueRow("Sanft lauter werden", if (p.rampSec == 0) "aus" else "über ${p.rampSec} s") {
            number("Sekunden bis volle Lautstärke (0 = sofort laut)", p.rampSec, 0, 600) { p.rampSec = it; render() }
        })
        w.addView(divider())
        w.addView(valueRow("Mindest-Lautstärke", "${p.minVolumePct} %") {
            number("Weckerlautstärke mindestens (%), falls du sie leise gestellt hast", p.minVolumePct, 0, 100) { p.minVolumePct = it; render() }
        })
        w.addView(divider())
        w.addView(switchRow("Vibration", null, p.vibrate) { p.vibrate = it })
        w.addView(divider())
        w.addView(valueRow("Schlummern", "${p.snoozeMin} Min, max. ${p.snoozeMax}×") {
            number("Schlummer-Dauer (Minuten)", p.snoozeMin, 1, 60) { m ->
                p.snoozeMin = m
                number("Wie oft darf geschlummert werden? (0 = gar nicht)", p.snoozeMax, 0, 10) { p.snoozeMax = it; render() }
            }
        })
        w.addView(divider())
        w.addView(valueRow("Automatisch verstummen", "nach ${p.autoStopMin} Min") {
            number("Nach wie vielen Minuten Klingeln schlummern?", p.autoStopMin, 1, 60) { p.autoStopMin = it; render() }
        })
        content.addView(w)

        // Wach bleiben
        content.addView(section("Nicht wieder einschlafen"))
        val a = card()
        a.addView(switchRow("Rechenaufgabe zum Ausschalten", "Wecker geht erst aus, wenn ${p.mathCount} Aufgaben gelöst sind", p.mathTask) { p.mathTask = it; render() })
        if (p.mathTask) a.addView(valueRow("Anzahl Aufgaben", "${p.mathCount}") {
            number("Wie viele Aufgaben?", p.mathCount, 1, 10) { p.mathCount = it; render() }
        })
        a.addView(divider())
        a.addView(switchRow("Wach-Kontrolle", "${p.wakeCheckMin} Min nach dem Ausschalten fragt die App „Bist du wach?“ – ohne Antwort klingelt es erneut", p.wakeCheck) { p.wakeCheck = it; render() })
        if (p.wakeCheck) a.addView(valueRow("Wach-Kontrolle nach", "${p.wakeCheckMin} Min") {
            number("Minuten nach dem Ausschalten", p.wakeCheckMin, 1, 30) { p.wakeCheckMin = it; render() }
        })
        content.addView(a)

        // Schlaf
        content.addView(section("Schlaf & Hinweise"))
        val s = card()
        s.addView(switchRow("Schlafenszeit-Erinnerung", "Erinnert dich, rechtzeitig ins Bett zu gehen", p.bedtimeOn) { p.bedtimeOn = it; render() })
        if (p.bedtimeOn) s.addView(valueRow("Gewünschte Schlafdauer", "${p.sleepMin / 60}:%02d Std".format(p.sleepMin % 60)) {
            time("Schlafdauer (Std:Min)", p.sleepMin) { p.sleepMin = it.coerceAtLeast(60); render() }
        })
        s.addView(divider())
        s.addView(switchRow("Abendübersicht", "Zeigt am Vorabend die Schicht und Weckzeit für morgen", p.eveningSummary) { p.eveningSummary = it; render() })
        if (p.eveningSummary) s.addView(valueRow("Uhrzeit Abendübersicht", Text.hm(p.eveningMinOfDay)) {
            time("Abendübersicht um", p.eveningMinOfDay) { p.eveningMinOfDay = it; render() }
        })
        content.addView(s)

        content.addView(button("Schichtarten auf Standard zurücksetzen") {
            AlertDialog.Builder(this).setMessage("Früh/Spät/Nacht wiederherstellen?")
                .setPositiveButton("Ja") { _, _ -> p.sp.edit().remove("shiftTypes").apply(); render() }
                .setNegativeButton("Abbrechen", null).show()
        })
        content.addView(text("", 12f).apply { setPadding(0, dp(24), 0, 0) })
    }

    private fun pickCalendars(cals: List<CalendarInfo>) {
        if (cals.isEmpty()) {
            AlertDialog.Builder(this).setMessage("Keine Kalender gefunden. Bitte Kalender-Zugriff erlauben.").setPositiveButton("OK", null).show(); return
        }
        val chosen = p.calendarIds.toMutableSet()
        val names = cals.map { "${it.name}\n${it.account}" }.toTypedArray()
        val checked = cals.map { it.id.toString() in chosen }.toBooleanArray()
        AlertDialog.Builder(this).setTitle("Welche Kalender enthalten deine Schichten?")
            .setMultiChoiceItems(names, checked) { _, i, on ->
                if (on) chosen += cals[i].id.toString() else chosen -= cals[i].id.toString()
            }
            .setPositiveButton("Übernehmen") { _, _ -> p.calendarIds = chosen; render() }
            .setNeutralButton("Alle") { _, _ -> p.calendarIds = emptySet(); render() }
            .show()
    }

    private fun editType(index: Int) {
        val list = p.shiftTypes.toMutableList()
        val t = if (index >= 0) list[index].copy() else ShiftType("Neue Schicht", "", startMin = 8 * 60, endMin = 16 * 60)
        val box = vbox(20)
        fun field(label: String, value: String, hint: String = ""): EditText {
            box.addView(text(label, 13f, Ui.MUTED).apply { setPadding(0, dp(8), 0, 0) })
            return EditText(this).apply { setText(value); this.hint = hint; setTextColor(Ui.TEXT); setHintTextColor(Ui.MUTED) }.also { box.addView(it) }
        }
        val name = field("Name", t.name)
        val kw = field("Stichwörter im Kalendertitel (mit Komma getrennt)", t.keywords, "z. B. früh, F, Frühdienst")
        val alarm = CheckBox(this).apply { text = "Wecker stellen"; isChecked = t.alarmOn; setTextColor(Ui.TEXT) }
        box.addView(alarm)
        val rg = RadioGroup(this)
        val rOff = RadioButton(this).apply { text = "Minuten vor Schichtbeginn"; id = android.view.View.generateViewId(); setTextColor(Ui.TEXT) }
        val rFix = RadioButton(this).apply { text = "Feste Uhrzeit"; id = android.view.View.generateViewId(); setTextColor(Ui.TEXT) }
        rg.addView(rOff); rg.addView(rFix); rg.check(if (t.fixedTime) rFix.id else rOff.id)
        box.addView(rg)
        val off = field("Minuten vor Beginn wecken (inkl. Fahrtzeit)", t.offsetMin.toString()).apply { inputType = InputType.TYPE_CLASS_NUMBER }
        var fixed = t.fixedMinOfDay
        var start = t.startMin
        var end = t.endMin
        val fixedBtn = button("Feste Weckzeit: ${Text.hm(fixed)}") {}
        fixedBtn.setOnClickListener { time("Weckzeit", fixed) { fixed = it; fixedBtn.text = "Feste Weckzeit: ${Text.hm(it)}" } }
        box.addView(fixedBtn)
        box.addView(text("Schichtzeiten bei ganztägigen Kalendereinträgen:", 13f, Ui.MUTED).apply { setPadding(0, dp(12), 0, 0) })
        val sBtn = button("Beginn: ${Text.hm(start)}") {}
        sBtn.setOnClickListener { time("Schichtbeginn", start) { start = it; sBtn.text = "Beginn: ${Text.hm(it)}" } }
        val eBtn = button("Ende: ${Text.hm(end)}") {}
        eBtn.setOnClickListener { time("Schichtende", end) { end = it; eBtn.text = "Ende: ${Text.hm(it)}" } }
        box.addView(sBtn); box.addView(eBtn)
        val silent = CheckBox(this).apply { text = "Während der Schicht lautlos"; isChecked = t.silentOn; setTextColor(Ui.TEXT) }
        box.addView(silent)

        val dlg = AlertDialog.Builder(this).setTitle(if (index >= 0) "Schichtart bearbeiten" else "Neue Schichtart")
            .setView(ScrollView(this).apply { addView(box) })
            .setPositiveButton("Speichern") { _, _ ->
                t.name = name.text.toString().trim().ifEmpty { "Schicht" }
                t.keywords = kw.text.toString()
                t.alarmOn = alarm.isChecked
                t.fixedTime = rg.checkedRadioButtonId == rFix.id
                t.offsetMin = off.text.toString().toIntOrNull()?.coerceIn(0, 24 * 60) ?: t.offsetMin
                t.fixedMinOfDay = fixed; t.startMin = start; t.endMin = end
                t.silentOn = silent.isChecked
                if (index >= 0) list[index] = t else list += t
                p.shiftTypes = list; render()
            }
            .setNegativeButton("Abbrechen", null)
        if (index >= 0) dlg.setNeutralButton("Löschen") { _, _ -> list.removeAt(index); p.shiftTypes = list; render() }
        dlg.show()
    }

    private fun number(title: String, value: Int, min: Int, max: Int, onOk: (Int) -> Unit) {
        val et = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER; setText(value.toString()); setSelection(text.length)
        }
        val wrap = vbox(20).apply { addView(et, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)) }
        AlertDialog.Builder(this).setTitle(title).setView(wrap)
            .setPositiveButton("OK") { _, _ -> onOk((et.text.toString().toIntOrNull() ?: value).coerceIn(min, max)) }
            .setNegativeButton("Abbrechen", null).show()
    }

    private fun time(title: String, minOfDay: Int, onOk: (Int) -> Unit) {
        TimePickerDialog(this, { _, h, m -> onOk(h * 60 + m) }, minOfDay / 60, minOfDay % 60, true).apply { setTitle(title) }.show()
    }

    private fun pickRingtone() {
        val i = Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
            .putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_ALARM or RingtoneManager.TYPE_RINGTONE)
            .putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Weckton")
            .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
            .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
            .putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, p.ringtone?.let { Uri.parse(it) })
        @Suppress("DEPRECATION") startActivityForResult(i, 7)
    }

    @Deprecated("Activity-Result-API braucht AndroidX")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 7 && resultCode == RESULT_OK) {
            @Suppress("DEPRECATION")
            val uri = data?.getParcelableExtra<Uri>(RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
            p.ringtone = uri?.toString(); render()
        }
    }
}
