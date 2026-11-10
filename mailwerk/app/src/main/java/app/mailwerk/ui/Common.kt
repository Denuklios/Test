package app.mailwerk.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Weekend
import androidx.compose.material.icons.outlined.WbTwilight
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.clickable
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

private val avatarColors = listOf(0xFF1E88E5, 0xFF43A047, 0xFFE53935, 0xFF8E24AA, 0xFFFB8C00, 0xFF00897B, 0xFF3949AB, 0xFFD81B60, 0xFF6D4C41, 0xFF546E7A)

@Composable
fun Avatar(name: String, address: String, size: Dp = 40.dp) {
    val label = name.ifBlank { address }.trim()
    val initials = label.split(' ', '.', '_', '-').filter { it.isNotBlank() && it[0].isLetterOrDigit() }.take(2)
        .joinToString("") { it.first().uppercase() }.ifBlank { "?" }
    val c = Color(avatarColors[abs(address.lowercase().hashCode()) % avatarColors.size])
    Box(Modifier.size(size).background(c, CircleShape), contentAlignment = Alignment.Center) {
        Text(initials, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = (size.value * 0.38f).sp)
    }
}

fun shortTime(t: Long): String {
    val now = Calendar.getInstance(); val c = Calendar.getInstance().apply { timeInMillis = t }
    return when {
        now.get(Calendar.YEAR) == c.get(Calendar.YEAR) && now.get(Calendar.DAY_OF_YEAR) == c.get(Calendar.DAY_OF_YEAR) ->
            SimpleDateFormat("HH:mm", Locale.GERMAN).format(Date(t))
        now.get(Calendar.YEAR) == c.get(Calendar.YEAR) && now.get(Calendar.DAY_OF_YEAR) - c.get(Calendar.DAY_OF_YEAR) == 1 -> "Gestern"
        now.timeInMillis - t < 6 * 86_400_000L -> SimpleDateFormat("EEE", Locale.GERMAN).format(Date(t))
        now.get(Calendar.YEAR) == c.get(Calendar.YEAR) -> SimpleDateFormat("d. MMM", Locale.GERMAN).format(Date(t))
        else -> SimpleDateFormat("dd.MM.yy", Locale.GERMAN).format(Date(t))
    }
}

fun humanSize(b: Long): String = when {
    b <= 0 -> ""
    b < 1024 -> "$b B"
    b < 1024 * 1024 -> "${b / 1024} KB"
    else -> String.format(Locale.GERMAN, "%.1f MB", b / 1048576.0)
}

/** Schnellauswahl-Zeitpunkte wie in Spark/Gmail/Outlook. */
object QuickTimes {
    private fun at(daysAhead: Int, hour: Int): Long = Calendar.getInstance().apply {
        add(Calendar.DAY_OF_YEAR, daysAhead); set(Calendar.HOUR_OF_DAY, hour); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    fun options(): List<Triple<String, ImageVector, Long>> {
        val now = Calendar.getInstance()
        val list = mutableListOf<Triple<String, ImageVector, Long>>()
        list += Triple("In 3 Stunden", Icons.Outlined.Schedule, System.currentTimeMillis() + 3 * 3_600_000L)
        if (now.get(Calendar.HOUR_OF_DAY) < 17) list += Triple("Heute Abend (18:00)", Icons.Outlined.DarkMode, at(0, 18))
        list += Triple("Morgen früh (8:00)", Icons.Outlined.WbTwilight, at(1, 8))
        val dow = now.get(Calendar.DAY_OF_WEEK)
        if (dow != Calendar.SATURDAY && dow != Calendar.SUNDAY) {
            val toSat = (Calendar.SATURDAY - dow + 7) % 7
            list += Triple("Am Wochenende (Sa 9:00)", Icons.Outlined.Weekend, at(toSat, 9))
        }
        val toMon = ((Calendar.MONDAY - dow + 7) % 7).let { if (it == 0) 7 else it }
        list += Triple("Nächste Woche (Mo 8:00)", Icons.Outlined.Today, at(toMon, 8))
        list += Triple("In einem Monat", Icons.Outlined.LightMode, at(30, 8))
        return list
    }
}

/** Dialog zur Auswahl eines Zeitpunkts (Zurückstellen, Später senden, Erinnern). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimeChooser(title: String, onDismiss: () -> Unit, onPick: (Long) -> Unit) {
    var step by remember { mutableIntStateOf(0) } // 0=Liste 1=Datum 2=Uhrzeit
    var day by remember { mutableLongStateOf(0L) }
    when (step) {
        0 -> AlertDialog(onDismissRequest = onDismiss, confirmButton = {}, dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } },
            title = { Text(title) },
            text = {
                Column {
                    QuickTimes.options().forEach { (label, icon, t) ->
                        ListItem(headlineContent = { Text(label) }, supportingContent = { Text(MainViewModel.fmt(t)) },
                            leadingContent = { Icon(icon, null) }, modifier = Modifier.clickable { onPick(t) })
                    }
                    ListItem(headlineContent = { Text("Datum & Uhrzeit wählen …") }, leadingContent = { Icon(Icons.Outlined.CalendarMonth, null) },
                        modifier = Modifier.clickable { step = 1 })
                }
            })
        1 -> {
            val st = rememberDatePickerState(initialSelectedDateMillis = System.currentTimeMillis() + 86_400_000L)
            DatePickerDialog(onDismissRequest = onDismiss,
                confirmButton = { TextButton(onClick = { day = st.selectedDateMillis ?: System.currentTimeMillis(); step = 2 }) { Text("Weiter") } },
                dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } }) { DatePicker(st) }
        }
        else -> {
            val tp = rememberTimePickerState(8, 0, true)
            AlertDialog(onDismissRequest = onDismiss, title = { Text("Uhrzeit") }, text = { TimePicker(tp) },
                confirmButton = {
                    TextButton(onClick = {
                        // DatePicker liefert UTC-Mitternacht -> in lokale Zeit übertragen
                        val utc = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { timeInMillis = day }
                        val local = Calendar.getInstance().apply {
                            set(utc.get(Calendar.YEAR), utc.get(Calendar.MONTH), utc.get(Calendar.DAY_OF_MONTH), tp.hour, tp.minute, 0)
                            set(Calendar.MILLISECOND, 0)
                        }
                        onPick(local.timeInMillis)
                    }) { Text("OK") }
                },
                dismissButton = { TextButton(onClick = onDismiss) { Text("Abbrechen") } })
        }
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 16.dp, top = 20.dp, bottom = 6.dp))
}

@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier) {
    Row(modifier.background(color.copy(alpha = 0.15f), CircleShape).padding(horizontal = 8.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        Text(text, color = color, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
fun HSpace(w: Dp) = Spacer(Modifier.width(w))

@Composable
fun FullWidth(content: @Composable () -> Unit) = Box(Modifier.fillMaxWidth()) { content() }
