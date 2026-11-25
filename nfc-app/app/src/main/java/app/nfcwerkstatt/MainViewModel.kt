package app.nfcwerkstatt

import android.app.Application
import android.nfc.NdefMessage
import android.nfc.Tag
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.nfcwerkstatt.automation.ActionRunner
import app.nfcwerkstatt.automation.ActionStore
import app.nfcwerkstatt.automation.ActionTag
import app.nfcwerkstatt.automation.HaConfig
import app.nfcwerkstatt.automation.HueBridge
import app.nfcwerkstatt.automation.TagAction
import app.nfcwerkstatt.data.HistoryStore
import app.nfcwerkstatt.data.Settings
import app.nfcwerkstatt.nfc.DraftRecord
import app.nfcwerkstatt.nfc.NdefFactory
import app.nfcwerkstatt.nfc.NfcOpException
import app.nfcwerkstatt.nfc.TagInfo
import app.nfcwerkstatt.nfc.TagReader
import app.nfcwerkstatt.nfc.TagWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class Tab(val title: String, val nav: String) {
    READ("NFC Werkstatt", "Lesen"),
    WRITE("Schreiben", "Schreiben"),
    ACTIONS("Aktionen", "Aktionen"),
    TOOLS("Werkzeuge", "Tools"),
    HISTORY("Verlauf", "Verlauf"),
}

enum class NfcState { MISSING, OFF, ON }

/** Aktion, die beim nächsten erkannten Tag ausgeführt wird. */
sealed class PendingAction(val title: String, val hint: String, val repeat: Boolean = false) {
    class Write(val message: NdefMessage, val lock: Boolean, repeat: Boolean) :
        PendingAction("Schreiben", "Halte den Tag an das Gerät, um " + (if (message.records.size == 1) "1 Datensatz" else "${message.records.size} Datensätze") + " zu schreiben.", repeat)

    data object Erase : PendingAction("Löschen", "Halte den Tag an das Gerät, um seinen Inhalt zu löschen.")
    data object Lock : PendingAction("Schreibschutz", "Halte den Tag an das Gerät. Der Schreibschutz ist DAUERHAFT!")
    data object CopySource : PendingAction("Kopieren 1/2", "Halte den QUELL-Tag an das Gerät.")
    class CopyTarget(val message: NdefMessage) :
        PendingAction("Kopieren 2/2", "Halte jetzt den ZIEL-Tag an das Gerät. Mehrere Kopien nacheinander möglich.", repeat = true)

    class SetPassword(val password: String, val protectRead: Boolean) :
        PendingAction("Passwort setzen", "Halte einen NTAG21x-Tag an das Gerät.")

    class RemovePassword(val password: String) :
        PendingAction("Passwort entfernen", "Halte den geschützten Tag an das Gerät.")
}

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val settings = Settings(app)
    private val store = HistoryStore(app)
    val actionStore = ActionStore(app)
    val actions = MutableStateFlow<List<TagAction>>(emptyList())
    val hue = MutableStateFlow(actionStore.hue)
    val ha = MutableStateFlow(actionStore.ha)

    val tab = MutableStateFlow(Tab.READ)
    val nfcState = MutableStateFlow(NfcState.ON)
    val lastTag = MutableStateFlow<TagInfo?>(null)
    val pending = MutableStateFlow<PendingAction?>(null)
    val pendingCount = MutableStateFlow(0)
    val drafts = MutableStateFlow<List<DraftRecord>>(emptyList())
    val history = MutableStateFlow<List<TagInfo>>(emptyList())
    val messages = MutableSharedFlow<String>(extraBufferCapacity = 16)

    val dumpMemory = MutableStateFlow(settings.dumpMemory)
    val vibrate = MutableStateFlow(settings.vibrate)
    val saveHistory = MutableStateFlow(settings.saveHistory)

    init {
        viewModelScope.launch(Dispatchers.IO) {
            val loaded = store.load()
            history.update { current -> (current + loaded).distinctBy { it.timestamp to it.uid } }
        }
        viewModelScope.launch(Dispatchers.IO) {
            val loaded = actionStore.load()
            actions.update { current -> (current + loaded).distinctBy { it.id } }
        }
    }

    // ------------------------------------------------------------ Tag-Ereignis

    /** Wird vom NFC-Reader-Thread aufgerufen (nicht Main-Thread). */
    fun onTag(tag: Tag, fallback: NdefMessage? = null) {
        val action = pending.value
        if (action == null) {
            readTag(tag, fallback)
        } else {
            perform(action, tag)
        }
    }

    private var lastReadId: String? = null
    private var lastReadAt = 0L

    private fun readTag(tag: Tag, fallback: NdefMessage?) {
        val id = tag.id?.joinToString("") { "%02X".format(it) }
        val now = System.currentTimeMillis()
        synchronized(this) {
            // Gleicher Tag doppelt gemeldet (App-Start per Tag + Reader-Modus)
            if (id != null && id == lastReadId && now - lastReadAt < 2000) return
            lastReadId = id
            lastReadAt = now
        }
        try {
            val info = TagReader.read(tag, dumpMemory.value, fallback)
            lastTag.value = info
            tab.value = Tab.READ
            if (saveHistory.value) addToHistory(info)
            buzz(true)
            // Aktions-Tag auch bei geöffneter App ausführen
            val actionId = info.ndefRaw?.let { runCatching { ActionTag.findId(NdefMessage(it)) }.getOrNull() }
            actions.value.firstOrNull { it.id == actionId }?.let { runAction(it) }
        } catch (e: Exception) {
            buzz(false)
            msg("Lesen fehlgeschlagen: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    private fun perform(action: PendingAction, tag: Tag) {
        try {
            val result = when (action) {
                is PendingAction.Write -> TagWriter.write(tag, action.message, action.lock)
                PendingAction.Erase -> TagWriter.erase(tag)
                PendingAction.Lock -> TagWriter.lock(tag)
                PendingAction.CopySource -> {
                    val info = TagReader.read(tag, false)
                    val raw = info.ndefRaw ?: throw NfcOpException("Der Quell-Tag enthält keine NDEF-Daten.")
                    lastTag.value = info
                    pendingCount.value = 0
                    pending.value = PendingAction.CopyTarget(NdefMessage(raw))
                    buzz(true)
                    msg("Quelle gelesen (${raw.size} Bytes) – jetzt Ziel-Tag anhalten.")
                    return
                }
                is PendingAction.CopyTarget -> TagWriter.write(tag, action.message, false)
                is PendingAction.SetPassword -> TagWriter.setPassword(tag, action.password, action.protectRead)
                is PendingAction.RemovePassword -> TagWriter.removePassword(tag, action.password)
            }
            buzz(true)
            if (action.repeat) {
                pendingCount.update { it + 1 }
                msg("#${pendingCount.value}: $result")
            } else {
                pending.value = null
                msg(result)
            }
        } catch (e: Exception) {
            buzz(false)
            msg(e.message ?: e.javaClass.simpleName)
        }
    }

    fun start(action: PendingAction) {
        if (nfcState.value != NfcState.ON) {
            msg(if (nfcState.value == NfcState.OFF) "Bitte zuerst NFC einschalten." else "Dieses Gerät hat kein NFC.")
            return
        }
        pendingCount.value = 0
        pending.value = action
    }

    fun cancelPending() {
        pending.value = null
    }

    // ------------------------------------------------------------ Schreibliste

    fun addDraft(d: DraftRecord) = drafts.update { it + d }
    fun removeDraft(index: Int) = drafts.update { it.toMutableList().apply { removeAt(index) } }
    fun clearDrafts() { drafts.value = emptyList() }
    fun moveDraft(index: Int, delta: Int) = drafts.update { list ->
        val target = index + delta
        if (target !in list.indices) list else list.toMutableList().apply { add(target, removeAt(index)) }
    }

    fun startWrite(lock: Boolean, repeat: Boolean) {
        val list = drafts.value
        if (list.isEmpty()) return msg("Bitte zuerst einen Datensatz hinzufügen.")
        start(PendingAction.Write(NdefFactory.message(list), lock, repeat))
    }

    /** Inhalt eines gelesenen Tags in die Schreibliste übernehmen. */
    fun editAsDraft(info: TagInfo) {
        val raw = info.ndefRaw ?: return msg("Kein NDEF-Inhalt zum Übernehmen.")
        try {
            drafts.value = NdefMessage(raw).records.map { NdefFactory.fromRecord(it) }
            tab.value = Tab.WRITE
        } catch (e: Exception) {
            msg("Inhalt nicht übernehmbar: ${e.message}")
        }
    }

    fun copyTo(info: TagInfo) {
        val raw = info.ndefRaw ?: return msg("Kein NDEF-Inhalt zum Kopieren.")
        start(PendingAction.CopyTarget(NdefMessage(raw)))
    }

    // ------------------------------------------------------------ Verlauf

    private fun addToHistory(info: TagInfo) {
        history.update { (listOf(info) + it).take(HistoryStore.MAX_ENTRIES) }
        persist()
    }

    fun deleteHistory(info: TagInfo) {
        history.update { list -> list.filterNot { it.timestamp == info.timestamp && it.uid == info.uid } }
        persist()
    }

    fun clearHistory() {
        history.value = emptyList()
        persist()
    }

    fun showFromHistory(info: TagInfo) {
        lastTag.value = info
        tab.value = Tab.READ
    }

    fun historyJson(): String = HistoryStore.toJsonArray(history.value).toString(2)

    private fun persist() {
        val snapshot = history.value
        viewModelScope.launch(Dispatchers.IO) { runCatching { store.save(snapshot) } }
    }

    // ------------------------------------------------------------ Einstellungen

    fun setDumpMemory(v: Boolean) { dumpMemory.value = v; settings.dumpMemory = v }
    fun setVibrate(v: Boolean) { vibrate.value = v; settings.vibrate = v }
    fun setSaveHistory(v: Boolean) { saveHistory.value = v; settings.saveHistory = v }

    // ------------------------------------------------------------ Aktionen

    fun saveAction(a: TagAction) {
        actions.update { list -> if (list.any { it.id == a.id }) list.map { if (it.id == a.id) a else it } else list + a }
        persistActions()
    }

    fun deleteAction(a: TagAction) {
        actions.update { list -> list.filterNot { it.id == a.id } }
        persistActions()
    }

    fun runAction(a: TagAction) {
        val ctx = getApplication<Application>()
        viewModelScope.launch(Dispatchers.IO) {
            val results = ActionRunner.run(ctx, a)
            buzz(results.all { it.ok })
            msg(ActionRunner.summary(a, results))
        }
    }

    fun writeActionTag(a: TagAction, lock: Boolean = false) {
        start(PendingAction.Write(ActionTag.message(a, getApplication<Application>().packageName), lock, repeat = true))
    }

    fun setHue(b: HueBridge?) { actionStore.hue = b; hue.value = b }
    fun setHa(c: HaConfig?) { actionStore.ha = c; ha.value = c }

    private fun persistActions() {
        val snapshot = actions.value
        viewModelScope.launch(Dispatchers.IO) { runCatching { actionStore.save(snapshot) } }
    }

    // ------------------------------------------------------------ Hilfen

    fun msg(text: String) {
        messages.tryEmit(text)
    }

    private fun buzz(success: Boolean) {
        if (!vibrate.value) return
        val ctx = getApplication<Application>()
        val vib: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
            ctx.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            ctx.getSystemService(Vibrator::class.java)
        }
        val effect = if (success) VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE)
        else VibrationEffect.createWaveform(longArrayOf(0, 80, 80, 80), -1)
        runCatching { vib?.vibrate(effect) }
    }
}
