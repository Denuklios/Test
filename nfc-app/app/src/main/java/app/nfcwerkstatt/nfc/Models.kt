package app.nfcwerkstatt.nfc

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class RecordInfo(
    val title: String,
    val content: String,
    val meta: String,
    val payloadHex: String,
    /** URI, die man öffnen kann (Link, Telefon, Karte …) */
    val actionUri: String? = null,
)

data class NdefInfo(
    val type: String,
    val maxSize: Int,
    val usedSize: Int,
    val writable: Boolean,
    val canMakeReadOnly: Boolean,
    val records: List<RecordInfo>,
)

data class TagInfo(
    val timestamp: Long,
    val uid: String,
    val chip: String,
    val techs: List<String>,
    val details: List<Pair<String, String>>,
    val ndef: NdefInfo?,
    /** Komplette NDEF-Nachricht als Bytes – zum Kopieren / erneut Schreiben */
    val ndefRaw: ByteArray?,
    val memoryDump: String?,
) {
    val timeText: String
        get() = SimpleDateFormat("dd.MM.yyyy HH:mm:ss", Locale.GERMANY).format(Date(timestamp))

    fun summary(): String = ndef?.records?.firstOrNull()?.let { "${it.title}: ${it.content.lineSequence().first()}" }
        ?: if (ndef != null) "NDEF – leer" else "Kein NDEF-Inhalt"

    fun report(): String = buildString {
        appendLine("NFC-Tag gelesen am $timeText")
        appendLine("Chip: $chip")
        appendLine("UID: $uid")
        appendLine("Techniken: ${techs.joinToString(", ")}")
        details.forEach { (k, v) -> appendLine("$k: $v") }
        ndef?.let { n ->
            appendLine()
            appendLine("NDEF (${n.type})")
            appendLine("Belegt: ${n.usedSize} / ${n.maxSize} Bytes · ${if (n.writable) "beschreibbar" else "schreibgeschützt"}")
            n.records.forEachIndexed { i, r ->
                appendLine()
                appendLine("Datensatz ${i + 1}: ${r.title}")
                appendLine(r.content)
                appendLine(r.meta)
            }
        }
        memoryDump?.let {
            appendLine()
            appendLine("Speicher:")
            appendLine(it)
        }
    }.trimEnd()
}
