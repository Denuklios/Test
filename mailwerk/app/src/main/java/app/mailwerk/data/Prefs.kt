package app.mailwerk.data

import android.content.Context

enum class SwipeAction(val label: String) { ARCHIVE("Archivieren"), DELETE("Löschen"), SNOOZE("Später"), READ("Gelesen/Ungelesen"), PIN("Anheften"), NONE("Nichts") }
enum class ThemeMode(val label: String) { SYSTEM("System"), LIGHT("Hell"), DARK("Dunkel") }

class Prefs(ctx: Context) {
    private val p = ctx.getSharedPreferences("mailwerk", Context.MODE_PRIVATE)

    var swipeRight: SwipeAction
        get() = SwipeAction.valueOf(p.getString("swipe_right", SwipeAction.ARCHIVE.name)!!)
        set(v) = p.edit().putString("swipe_right", v.name).apply()
    var swipeLeft: SwipeAction
        get() = SwipeAction.valueOf(p.getString("swipe_left", SwipeAction.SNOOZE.name)!!)
        set(v) = p.edit().putString("swipe_left", v.name).apply()
    /** Sekunden, in denen „Senden rückgängig“ möglich ist. */
    var undoSeconds: Int
        get() = p.getInt("undo_seconds", 10)
        set(v) = p.edit().putInt("undo_seconds", v).apply()
    var blockRemoteImages: Boolean
        get() = p.getBoolean("block_images", true)
        set(v) = p.edit().putBoolean("block_images", v).apply()
    var smartInbox: Boolean
        get() = p.getBoolean("smart_inbox", true)
        set(v) = p.edit().putBoolean("smart_inbox", v).apply()
    var notifyOnlyImportant: Boolean
        get() = p.getBoolean("notify_important", true)
        set(v) = p.edit().putBoolean("notify_important", v).apply()
    var groupThreads: Boolean
        get() = p.getBoolean("group_threads", true)
        set(v) = p.edit().putBoolean("group_threads", v).apply()
    /** Minuten; 0 = nur manuell. */
    var syncMinutes: Int
        get() = p.getInt("sync_minutes", 15)
        set(v) = p.edit().putInt("sync_minutes", v).apply()
    var theme: ThemeMode
        get() = ThemeMode.valueOf(p.getString("theme", ThemeMode.SYSTEM.name)!!)
        set(v) = p.edit().putString("theme", v.name).apply()
    var dynamicColor: Boolean
        get() = p.getBoolean("dynamic_color", false)
        set(v) = p.edit().putBoolean("dynamic_color", v).apply()
    /** Sofort-Benachrichtigung per IMAP IDLE (Hintergrunddienst). */
    var pushEnabled: Boolean
        get() = p.getBoolean("push", true)
        set(v) = p.edit().putBoolean("push", v).apply()
    var askedBattery: Boolean
        get() = p.getBoolean("asked_battery", false)
        set(v) = p.edit().putBoolean("asked_battery", v).apply()
    var autoUpdateCheck: Boolean
        get() = p.getBoolean("auto_update", true)
        set(v) = p.edit().putBoolean("auto_update", v).apply()
    var lastUpdateCheck: Long
        get() = p.getLong("last_update_check", 0)
        set(v) = p.edit().putLong("last_update_check", v).apply()
    var notifiedUpdate: Int
        get() = p.getInt("notified_update", 0)
        set(v) = p.edit().putInt("notified_update", v).apply()
    /** Zwischenspeicher der vorbereiteten Konten, damit sie auch nach Updates ohne Vorbelegung erhalten bleiben. */
    var presetCache: String
        get() = p.getString("preset_cache", "")!!
        set(v) = p.edit().putString("preset_cache", v).apply()
    var initialSyncDays: Int
        get() = p.getInt("sync_days", 60)
        set(v) = p.edit().putInt("sync_days", v).apply()
    var blockedSenders: Set<String>
        get() = p.getStringSet("blocked", emptySet())!!
        set(v) = p.edit().putStringSet("blocked", v).apply()
}
