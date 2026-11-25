package app.nfcwerkstatt.nfc

fun ByteArray.toHex(separator: String = ":"): String =
    joinToString(separator) { "%02X".format(it.toInt() and 0xFF) }

fun String.hexToBytes(): ByteArray {
    val clean = replace(Regex("[^0-9A-Fa-f]"), "")
    require(clean.length % 2 == 0) { "Ungerade Anzahl Hex-Ziffern" }
    return ByteArray(clean.length / 2) { clean.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}

/** Druckbare ASCII-Darstellung, nicht druckbare Bytes als Punkt. */
fun ByteArray.toAsciiPreview(): String =
    map { val c = it.toInt() and 0xFF; if (c in 0x20..0x7E) c.toChar() else '.' }.joinToString("")

/**
 * Formatiert Speicherblöcke als Hex-Dump.
 * @param blocks Liste aus (Adresse, Daten)
 */
fun formatBlocks(label: String, blocks: List<Pair<Int, ByteArray>>): String = buildString {
    for ((addr, data) in blocks) {
        append(label).append(' ')
        append("%03d".format(addr)).append("  ")
        append(data.toHex(" ")).append("  |")
        append(data.toAsciiPreview()).append("|\n")
    }
}.trimEnd()

/** Prüft, ob die Bytes sinnvoll als UTF-8-Text darstellbar sind. */
fun ByteArray.looksLikeText(): Boolean {
    if (isEmpty()) return true
    val s = try {
        Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(this)).toString()
    } catch (e: Exception) {
        return false
    }
    return s.all { !it.isISOControl() || it == '\n' || it == '\r' || it == '\t' }
}
