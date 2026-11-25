package app.nfcwerkstatt.automation

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.provider.AlarmClock

/** Führt die Schritte einer Aktion nacheinander aus. Läuft im Hintergrund-Thread. */
object ActionRunner {

    data class Result(val ok: Boolean, val text: String)

    fun run(ctx: Context, action: TagAction): List<Result> {
        val store = ActionStore(ctx)
        return action.steps.map { step ->
            try {
                runStep(ctx, store, step)
                Result(true, step.describe())
            } catch (e: Exception) {
                Result(false, "${step.describe()}: ${e.message ?: e.javaClass.simpleName}")
            }
        }
    }

    fun summary(action: TagAction, results: List<Result>): String {
        val failed = results.filterNot { it.ok }
        return if (failed.isEmpty()) "✓ ${action.name}" else "⚠ ${action.name}: " + failed.joinToString("; ") { it.text }
    }

    private fun runStep(ctx: Context, store: ActionStore, s: Step) {
        when (s.type) {
            StepType.TUYA -> tuya(store, s["ids"], s["mode"])
            StepType.ALEXA -> {
                if (s["url"].isBlank()) throw IllegalStateException("Trigger-Link fehlt – Aktion bearbeiten.")
                val (code, _) = Http.request("GET", s["url"])
                if (code >= 400) throw IllegalStateException("Alexa-Trigger antwortet mit $code")
            }
            StepType.HUE_ALL -> Hue.setGroup(hue(store), "0", s["mode"])
            StepType.HUE_GROUP -> Hue.setGroup(hue(store), s["id"], s["mode"], s["bri"].toIntOrNull())
            StepType.HUE_SCENE -> Hue.scene(hue(store), s["id"], s["group"].ifBlank { null })
            StepType.HA -> HomeAssistant.call(
                store.ha ?: throw IllegalStateException("Home Assistant ist nicht eingerichtet."),
                s["service"], s["entity"],
            )
            StepType.WEBHOOK -> {
                val method = s["method"].ifBlank { "GET" }
                val (code, _) = Http.request(method, s["url"], s["body"].ifBlank { null }.takeIf { method != "GET" })
                if (code >= 400) throw IllegalStateException("Antwort $code")
            }
            StepType.TORCH -> torch(ctx, s["mode"])
            StepType.RINGER -> ringer(ctx, s["mode"])
            StepType.TIMER -> {
                val minutes = s["minutes"].toIntOrNull() ?: throw IllegalStateException("Minuten fehlen")
                ctx.startActivity(
                    Intent(AlarmClock.ACTION_SET_TIMER)
                        .putExtra(AlarmClock.EXTRA_LENGTH, minutes * 60)
                        .putExtra(AlarmClock.EXTRA_MESSAGE, s["label"].ifBlank { "NFC-Timer" })
                        .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
            StepType.OPEN_URL -> ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(s["url"])).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            StepType.OPEN_APP -> {
                val i = ctx.packageManager.getLaunchIntentForPackage(s["package"])
                    ?: throw IllegalStateException("App nicht installiert")
                ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
    }

    /** Schaltet Tuya-Geräte lokal, mehrere gleichzeitig. */
    fun tuya(store: ActionStore, ids: String, mode: String) {
        val all = store.tuya
        val targets = if (ids == "all") all else ids.split(",").mapNotNull { id -> all.firstOrNull { it.id == id.trim() } }
        if (targets.isEmpty()) throw IllegalStateException("Keine Tuya-Geräte eingerichtet.")
        var m = mode
        if (m == "toggle" && targets.size > 1) {
            // Gruppe: ist irgendwas an → alles aus, sonst alles an
            val anyOn = targets.any { d -> runCatching { TuyaClient(d).connect().use { c -> c.status().let { st -> (d.switchDp.ifBlank { null } ?: listOf("1", "20").firstOrNull { st.opt(it) is Boolean })?.let { st.optBoolean(it) } } } }.getOrNull() == true }
            m = if (anyOn) "off" else "on"
        }
        val errors = java.util.Collections.synchronizedList(mutableListOf<String>())
        targets.map { d ->
            Thread {
                try {
                    if (d.ip.isBlank()) throw IllegalStateException("IP unbekannt – „Im WLAN suchen“")
                    var last: Exception? = null
                    for (attempt in 1..2) {
                        try { TuyaClient(d).connect().use { it.switch(m) }; last = null; break } catch (e: Exception) { last = e }
                    }
                    last?.let { throw it }
                } catch (e: Exception) {
                    errors += "${d.name}: ${e.message ?: e.javaClass.simpleName}"
                }
            }.apply { start() }
        }.forEach { it.join() }
        if (errors.isNotEmpty()) throw IllegalStateException(errors.joinToString("; "))
    }

    private fun hue(store: ActionStore) = store.hue ?: throw IllegalStateException("Hue-Bridge ist nicht verbunden.")

    private fun torch(ctx: Context, mode: String) {
        val cm = ctx.getSystemService(CameraManager::class.java)
        val id = cm.cameraIdList.firstOrNull {
            cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        } ?: throw IllegalStateException("Keine Taschenlampe vorhanden")
        val prefs = ctx.getSharedPreferences("smarthome", Context.MODE_PRIVATE)
        val on = when (mode) { "on" -> true; "toggle" -> !prefs.getBoolean("torch", false); else -> false }
        cm.setTorchMode(id, on)
        prefs.edit().putBoolean("torch", on).apply()
    }

    private fun ringer(ctx: Context, mode: String) {
        val am = ctx.getSystemService(AudioManager::class.java)
        val target = when (mode) {
            "silent" -> AudioManager.RINGER_MODE_SILENT
            "vibrate" -> AudioManager.RINGER_MODE_VIBRATE
            "toggle" -> if (am.ringerMode == AudioManager.RINGER_MODE_NORMAL) AudioManager.RINGER_MODE_SILENT else AudioManager.RINGER_MODE_NORMAL
            else -> AudioManager.RINGER_MODE_NORMAL
        }
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if ((target == AudioManager.RINGER_MODE_SILENT || am.ringerMode == AudioManager.RINGER_MODE_SILENT) &&
            !nm.isNotificationPolicyAccessGranted
        ) throw IllegalStateException("Bitte in „Aktionen“ den Zugriff auf „Nicht stören“ erlauben.")
        am.ringerMode = target
    }

    fun hasDndAccess(ctx: Context): Boolean =
        runCatching { ctx.getSystemService(NotificationManager::class.java).isNotificationPolicyAccessGranted }.getOrDefault(true)
}
