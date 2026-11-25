package app.nfcwerkstatt.nfc

import java.security.MessageDigest

/** Chip-Daten für NXP NTAG21x / MIFARE Ultralight EV1. */
data class ChipInfo(
    val name: String,
    val totalPages: Int,
    val userBytes: Int,
    /** Seite CFG0; CFG1 = +1, PWD = +2, PACK = +3 */
    val cfgPage: Int,
)

object Ntag {
    const val CMD_GET_VERSION: Byte = 0x60
    const val CMD_READ: Byte = 0x30
    const val CMD_WRITE: Byte = 0xA2.toByte()
    const val CMD_PWD_AUTH: Byte = 0x1B
    const val CMD_READ_SIG: Byte = 0x3C

    /** Standard: Schutz ab Seite 4 = gesamter Nutzerspeicher. */
    const val DEFAULT_AUTH0 = 0x04

    private val HEX8 = Regex("[0-9A-Fa-f]{8}")

    /** Wertet die 8-Byte-Antwort auf GET_VERSION aus. */
    fun identify(v: ByteArray): ChipInfo? {
        if (v.size < 8) return null
        val vendor = v[1].toInt() and 0xFF
        val product = v[2].toInt() and 0xFF
        val storage = v[6].toInt() and 0xFF
        if (vendor != 0x04) return null
        return when (product) {
            0x04 -> when (storage) {
                0x0B -> ChipInfo("NXP NTAG210", 20, 48, 0x10)
                0x0E -> ChipInfo("NXP NTAG212", 41, 128, 0x25)
                0x0F -> ChipInfo("NXP NTAG213", 45, 144, 0x29)
                0x11 -> ChipInfo("NXP NTAG215", 135, 504, 0x83)
                0x13 -> ChipInfo("NXP NTAG216", 231, 888, 0xE3)
                else -> null
            }
            0x03 -> when (storage) {
                0x0B -> ChipInfo("NXP MIFARE Ultralight EV1 (MF0UL11)", 20, 48, 0x10)
                0x0E -> ChipInfo("NXP MIFARE Ultralight EV1 (MF0UL21)", 41, 128, 0x25)
                else -> null
            }
            else -> null
        }
    }

    /**
     * Macht aus einer Eingabe ein 4-Byte-Passwort (PWD) und 2-Byte-Bestätigung (PACK).
     * Genau 8 Hex-Ziffern werden direkt als PWD verwendet (kompatibel zu anderen Apps),
     * jeder andere Text wird per SHA-256 abgeleitet.
     */
    fun derivePassword(input: String): Pair<ByteArray, ByteArray> {
        val t = input.trim()
        require(t.isNotEmpty()) { "Passwort darf nicht leer sein" }
        val pwd = if (HEX8.matches(t)) t.hexToBytes() else sha256(t.toByteArray(Charsets.UTF_8)).copyOfRange(0, 4)
        val pack = sha256(pwd).copyOfRange(0, 2)
        return pwd to pack
    }

    /** Neues CFG0 mit gesetztem AUTH0 (Byte 3). */
    fun withAuth0(cfg0: ByteArray, auth0: Int): ByteArray = cfg0.copyOf(4).also { it[3] = auth0.toByte() }

    /** Neues CFG1 mit PROT-Bit (Bit 7 von ACCESS): true = auch Lesen schützen. */
    fun withProt(cfg1: ByteArray, protectRead: Boolean): ByteArray = cfg1.copyOf(4).also {
        val access = it[0].toInt() and 0xFF
        it[0] = (if (protectRead) access or 0x80 else access and 0x7F).toByte()
    }

    fun isProtected(cfg0: ByteArray, chip: ChipInfo): Boolean = (cfg0[3].toInt() and 0xFF) < chip.totalPages

    private fun sha256(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b)
}

/** Hersteller anhand des ersten UID-Bytes (ISO/IEC 7816-6). */
fun manufacturerName(code: Int): String? = when (code) {
    0x02 -> "STMicroelectronics"
    0x04 -> "NXP Semiconductors"
    0x05 -> "Infineon"
    0x07 -> "Texas Instruments"
    0x08 -> "Fujitsu"
    0x16 -> "EM Microelectronic"
    0x1F -> "Melexis"
    else -> null
}
