package de.schichtwecker

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/** Eine Schichtart, z. B. "Früh". Erkannt wird sie an Stichwörtern im Kalendertitel. */
data class ShiftType(
    var name: String,
    var keywords: String,
    var alarmOn: Boolean = true,
    /** true = feste Weckzeit, false = X Minuten vor Schichtbeginn */
    var fixedTime: Boolean = false,
    var offsetMin: Int = 90,
    var fixedMinOfDay: Int = 4 * 60,
    /** Schichtzeiten, falls der Kalendereintrag ganztägig ist */
    var startMin: Int = 6 * 60,
    var endMin: Int = 14 * 60,
    var silentOn: Boolean = true,
) {
    fun toJson() = JSONObject().apply {
        put("name", name); put("keywords", keywords); put("alarmOn", alarmOn)
        put("fixedTime", fixedTime); put("offsetMin", offsetMin); put("fixedMinOfDay", fixedMinOfDay)
        put("startMin", startMin); put("endMin", endMin); put("silentOn", silentOn)
    }

    fun keywordList(): List<String> =
        keywords.split(',', ';').map { Text.norm(it) }.filter { it.isNotBlank() }

    companion object {
        fun fromJson(o: JSONObject) = ShiftType(
            o.optString("name"), o.optString("keywords"), o.optBoolean("alarmOn", true),
            o.optBoolean("fixedTime", false), o.optInt("offsetMin", 90), o.optInt("fixedMinOfDay", 240),
            o.optInt("startMin", 360), o.optInt("endMin", 840), o.optBoolean("silentOn", true)
        )

        fun defaults() = listOf(
            ShiftType("Frühschicht", "früh, frühdienst, frühschicht, F", offsetMin = 75, startMin = 6 * 60, endMin = 14 * 60),
            ShiftType("Spätschicht", "spät, spätdienst, spätschicht, S", offsetMin = 120, startMin = 14 * 60, endMin = 22 * 60),
            ShiftType("Nachtschicht", "nacht, nachtdienst, nachtschicht, N", offsetMin = 120, startMin = 22 * 60, endMin = 6 * 60),
        )
    }
}

object SilentMode {
    const val DND_PRIORITY = 0   // Nicht stören: nur Wecker + Prioritätskontakte
    const val DND_ALARMS = 1     // Nicht stören: nur Wecker
    const val SILENT = 2         // Lautlos (ohne Vibration)
    const val VIBRATE = 3        // Nur Vibration
    val labels = arrayOf(
        "Nicht stören (Favoriten dürfen anrufen)",
        "Nicht stören (nur Wecker)",
        "Lautlos",
        "Nur Vibration"
    )
}

class Prefs(ctx: Context) {
    val sp: SharedPreferences = ctx.getSharedPreferences("schichtwecker", Context.MODE_PRIVATE)

    var shiftTypes: List<ShiftType>
        get() {
            val raw = sp.getString("shiftTypes", null) ?: return ShiftType.defaults()
            val arr = JSONArray(raw)
            return (0 until arr.length()).map { ShiftType.fromJson(arr.getJSONObject(it)) }
        }
        set(v) { sp.edit().putString("shiftTypes", JSONArray(v.map { it.toJson() }).toString()).apply() }

    /** leer = alle Kalender */
    var calendarIds: Set<String>
        get() = sp.getStringSet("calendarIds", emptySet())!!.toSet()
        set(v) { sp.edit().putStringSet("calendarIds", v).apply() }

    var silentMode by IntPref("silentMode", SilentMode.DND_PRIORITY)
    var silentBeforeMin by IntPref("silentBeforeMin", 0)
    var silentAfterMin by IntPref("silentAfterMin", 15)
    var snoozeMin by IntPref("snoozeMin", 5)
    var snoozeMax by IntPref("snoozeMax", 3)
    var rampSec by IntPref("rampSec", 60)
    var minVolumePct by IntPref("minVolumePct", 70)
    var vibrate by BoolPref("vibrate", true)
    var mathTask by BoolPref("mathTask", false)
    var mathCount by IntPref("mathCount", 2)
    var wakeCheck by BoolPref("wakeCheck", false)
    var wakeCheckMin by IntPref("wakeCheckMin", 5)
    var bedtimeOn by BoolPref("bedtimeOn", true)
    var sleepMin by IntPref("sleepMin", 8 * 60)
    var eveningSummary by BoolPref("eveningSummary", true)
    var eveningMinOfDay by IntPref("eveningMinOfDay", 20 * 60)
    var autoStopMin by IntPref("autoStopMin", 10)
    var lookaheadDays by IntPref("lookaheadDays", 21)
    var ringtone: String?
        get() = sp.getString("ringtone", null)
        set(v) { sp.edit().putString("ringtone", v).apply() }

    /** Urlaubsmodus bis zu diesem Zeitpunkt (ms), 0 = aus */
    var vacationUntil by LongPref("vacationUntil", 0L)
    var lastSync by LongPref("lastSync", 0L)

    var skipped: Set<String>
        get() = sp.getStringSet("skipped", emptySet())!!.toSet()
        set(v) { sp.edit().putStringSet("skipped", v).apply() }

    var scheduled: Set<String>
        get() = sp.getStringSet("scheduled", emptySet())!!.toSet()
        set(v) { sp.edit().putStringSet("scheduled", v).apply() }

    // Lautlos-Sitzung
    var silentKey: String?
        get() = sp.getString("silentKey", null)
        set(v) { sp.edit().putString("silentKey", v).apply() }
    var prevRinger by IntPref("prevRinger", -1)
    var prevFilter by IntPref("prevFilter", -1)
    var appliedRinger by IntPref("appliedRinger", -1)
    var appliedFilter by IntPref("appliedFilter", -1)

    // Schlummer-Zähler je Weckvorgang
    var snoozeCountKey: String?
        get() = sp.getString("snoozeCountKey", null)
        set(v) { sp.edit().putString("snoozeCountKey", v).apply() }
    var snoozeCount by IntPref("snoozeCount", 0)

    val vacationActive get() = vacationUntil > System.currentTimeMillis()

    private inner class IntPref(val key: String, val def: Int) {
        operator fun getValue(t: Any?, p: Any?) = sp.getInt(key, def)
        operator fun setValue(t: Any?, p: Any?, v: Int) = sp.edit().putInt(key, v).apply()
    }
    private inner class LongPref(val key: String, val def: Long) {
        operator fun getValue(t: Any?, p: Any?) = sp.getLong(key, def)
        operator fun setValue(t: Any?, p: Any?, v: Long) = sp.edit().putLong(key, v).apply()
    }
    private inner class BoolPref(val key: String, val def: Boolean) {
        operator fun getValue(t: Any?, p: Any?) = sp.getBoolean(key, def)
        operator fun setValue(t: Any?, p: Any?, v: Boolean) = sp.edit().putBoolean(key, v).apply()
    }
}

object Text {
    fun norm(s: String) = s.trim().lowercase()
        .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")

    fun hm(minOfDay: Int) = "%02d:%02d".format((minOfDay / 60) % 24, minOfDay % 60)

    fun duration(ms: Long): String {
        val totalMin = (ms / 60000).coerceAtLeast(0)
        val d = totalMin / (60 * 24); val h = (totalMin / 60) % 24; val m = totalMin % 60
        return when {
            d > 0 -> "${d} T ${h} Std"
            h > 0 -> "${h} Std ${m} Min"
            else -> "${m} Min"
        }
    }
}
