package app.mailwerk.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.mailwerk.data.Message
import app.mailwerk.mail.Ics
import app.mailwerk.mail.TextDates
import app.mailwerk.tr
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/** Vorschlag für das Fenster: aus Einladung, aus dem Mailtext oder morgen 9:00. */
internal data class CalendarDraft(val title: String, val date: LocalDate, val time: LocalTime?, val minutes: Long, val location: String)

internal fun draftFor(m: Message, ics: String?): CalendarDraft {
    ics?.let { runCatching { Ics.parse(it).firstOrNull { e -> !e.isReply } }.getOrNull() }?.let { e ->
        val mins = if (e.allDay) 60 else java.time.Duration.between(e.start, e.end).toMinutes().coerceAtLeast(0)
        return CalendarDraft(e.summary, e.start.toLocalDate(), if (e.allDay) null else e.start.toLocalTime(), mins, e.location)
    }
    val sent = Instant.ofEpochMilli(m.date).atZone(ZoneId.systemDefault()).toLocalDateTime()
    val subj = m.subject.replace(Regex("^((re|aw|wg|fw|fwd)\\s*:\\s*)+", RegexOption.IGNORE_CASE), "").trim()
    runCatching { TextDates.find(m.bodyText ?: "", sent, max = 1).firstOrNull() }.getOrNull()?.let { f ->
        val t = subj.ifBlank { f.title.ifBlank { f.sentence.take(60) } }
        return CalendarDraft(if (f.deadline && subj.isNotBlank()) tr("Frist: {0}", subj) else t, f.start.toLocalDate(),
            if (f.allDay) null else f.start.toLocalTime(), if (f.deadline) 0 else 60, f.location)
    }
    return CalendarDraft(subj.ifBlank { (m.bodyText ?: "").lineSequence().firstOrNull { it.isNotBlank() }?.trim()?.take(60) ?: "" },
        LocalDate.now().plusDays(1), LocalTime.of(9, 0), 60, "")
}

/** „In Kalender“: Termin aus der geöffneten Mail in den Familienkalender eintragen. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddToCalendarDialog(vm: MainViewModel, m: Message, onDismiss: () -> Unit) {
    val fam = vm.repo.family
    val scope = rememberCoroutineScope()
    var v by remember { mutableIntStateOf(0) } // nach dem Verbinden neu zeichnen
    val draft = remember(m.id) { draftFor(m, vm.db.invite(m.id)?.ics) }
    var title by remember { mutableStateOf(draft.title) }
    var date by remember { mutableStateOf(draft.date) }
    var time by remember { mutableStateOf(draft.time ?: LocalTime.of(9, 0)) }
    var allDay by remember { mutableStateOf(draft.time == null) }
    var location by remember { mutableStateOf(draft.location) }
    var who by remember { mutableStateOf(listOfNotNull(fam.memberFor(m.accountId)?.id)) }
    var pickDate by remember { mutableStateOf(false) }
    var pickTime by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val dayFmt = remember { DateTimeFormatter.ofPattern("EE, d. MMM yyyy", java.util.Locale.getDefault()) }

    AlertDialog(onDismissRequest = onDismiss, title = { Text(tr("In Familienkalender eintragen")) },
        text = {
            androidx.compose.runtime.key(v) {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (!fam.connected) {
                        // nicht verbunden: Einladung aus den Mails suchen und direkt verbinden
                        val found = remember { fam.findInvite(null, runCatching { vm.db.calendarInviteTexts() }.getOrDefault(emptyList())) }
                        Text(tr("Mailwerk ist noch nicht mit dem Familienkalender verbunden."), style = MaterialTheme.typography.bodyMedium)
                        if (found != null) Button(enabled = !busy, onClick = {
                            busy = true; error = null
                            scope.launch {
                                val r = withContext(Dispatchers.IO) { runCatching { vm.repo.connectFamily(found.url ?: "", found.code) } }
                                busy = false
                                r.onSuccess { who = listOfNotNull(fam.memberFor(m.accountId)?.id); v++ }.onFailure { error = it.message }
                            }
                        }) { Text(tr("Jetzt verbinden (Code {0})", found.code)) }
                        else TextButton(onClick = { onDismiss(); vm.push(Screen.FamilyCalendar) }) { Text(tr("Familienkalender verbinden")) }
                    } else {
                        OutlinedTextField(title, { title = it }, label = { Text(tr("Titel")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            OutlinedButton(onClick = { pickDate = true }) { Text("📅 " + date.format(dayFmt)) }
                            if (!allDay) OutlinedButton(onClick = { pickTime = true }) { Text("🕒 " + time.format(DateTimeFormatter.ofPattern("HH:mm"))) }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(tr("Ganztägig"), Modifier.weight(1f)); Switch(allDay, { allDay = it })
                        }
                        OutlinedTextField(location, { location = it }, label = { Text(tr("Ort (optional)")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Text(tr("Für wen?"), style = MaterialTheme.typography.labelLarge)
                        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            fam.members.forEach { mem ->
                                MemberChip(mem, mem.id in who) { who = if (mem.id in who) who - mem.id else who + mem.id }
                            }
                        }
                        if (fam.members.isEmpty()) Text(tr("Keine Personen gefunden – unter Einstellungen → Familienkalender „Personen neu laden“."),
                            style = MaterialTheme.typography.bodySmall)
                    }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    if (busy) CircularProgressIndicator(Modifier.padding(4.dp))
                }
            }
        },
        confirmButton = {
            if (fam.connected) Button(enabled = !busy && who.isNotEmpty() && title.isNotBlank(), onClick = {
                busy = true; error = null
                val start = if (allDay) date.atStartOfDay() else date.atTime(time)
                val end = if (allDay) start else start.plusMinutes(if (draft.minutes > 0) draft.minutes else 60)
                scope.launch {
                    val msg = vm.repo.addToCalendarManually(m.id, title.trim(), start, end, allDay, location.trim(), who)
                    busy = false
                    if (msg == tr("Im Familienkalender eingetragen")) { vm.snack("📅 " + msg); onDismiss() } else error = msg
                }
            }) { Text(tr("Eintragen")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Abbrechen")) } })

    if (pickDate) {
        val st = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
        DatePickerDialog(onDismissRequest = { pickDate = false },
            confirmButton = { TextButton(onClick = {
                st.selectedDateMillis?.let { date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }; pickDate = false
            }) { Text(tr("OK")) } },
            dismissButton = { TextButton(onClick = { pickDate = false }) { Text(tr("Abbrechen")) } }) { DatePicker(st) }
    }
    if (pickTime) {
        val st = rememberTimePickerState(initialHour = time.hour, initialMinute = time.minute, is24Hour = true)
        AlertDialog(onDismissRequest = { pickTime = false },
            confirmButton = { TextButton(onClick = { time = LocalTime.of(st.hour, st.minute); pickTime = false }) { Text(tr("OK")) } },
            dismissButton = { TextButton(onClick = { pickTime = false }) { Text(tr("Abbrechen")) } },
            text = { TimePicker(st) })
    }
}

