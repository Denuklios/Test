package de.fotobox.app

import android.content.Context

class Prefs(ctx: Context) {
    private val p = ctx.getSharedPreferences("fotobox", Context.MODE_PRIVATE)

    var server: String
        get() = p.getString("server", "") ?: ""
        set(v) = p.edit().putString("server", v).apply()
    var user: String
        get() = p.getString("user", "") ?: ""
        set(v) = p.edit().putString("user", v).apply()
    var token: String
        get() = p.getString("token", "") ?: ""
        set(v) = p.edit().putString("token", v).apply()
    /** Nur Medien sichern, die nach diesem Zeitpunkt (Sekunden) hinzugekommen sind. */
    var sinceSeconds: Long
        get() = p.getLong("since", 0)
        set(v) = p.edit().putLong("since", v).apply()
    var videos: Boolean
        get() = p.getBoolean("videos", true)
        set(v) = p.edit().putBoolean("videos", v).apply()
    var cameraOnly: Boolean
        get() = p.getBoolean("cameraOnly", true)
        set(v) = p.edit().putBoolean("cameraOnly", v).apply()
    var onlyCharging: Boolean
        get() = p.getBoolean("charging", false)
        set(v) = p.edit().putBoolean("charging", v).apply()
    var lastRun: Long
        get() = p.getLong("lastRun", 0)
        set(v) = p.edit().putLong("lastRun", v).apply()
    var lastResult: String
        get() = p.getString("lastResult", "") ?: ""
        set(v) = p.edit().putString("lastResult", v).apply()
    var progress: String
        get() = p.getString("progress", "") ?: ""
        set(v) = p.edit().putString("progress", v).apply()

    val loggedIn get() = token.isNotEmpty() && server.isNotEmpty()

    fun logout() {
        p.edit().remove("token").remove("progress").remove("lastResult").remove("lastRun").apply()
    }
}
