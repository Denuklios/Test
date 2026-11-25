package app.nfcwerkstatt.nfc

import android.nfc.NdefMessage
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.nfc.tech.MifareClassic
import android.nfc.tech.MifareUltralight
import android.nfc.tech.Ndef
import android.nfc.tech.NfcA
import android.nfc.tech.NfcB
import android.nfc.tech.NfcBarcode
import android.nfc.tech.NfcF
import android.nfc.tech.NfcV
import java.io.Closeable

object TagReader {

    fun read(tag: Tag, dumpMemory: Boolean, fallbackMessage: NdefMessage? = null): TagInfo {
        val techs = tag.techList.map { it.substringAfterLast('.') }
        val details = mutableListOf<Pair<String, String>>()
        val uidBytes = tag.id ?: ByteArray(0)

        // 1) NDEF zuerst – danach können Rohbefehle den Tag-Zustand verändern
        var ndefInfo: NdefInfo? = null
        var raw: ByteArray? = null
        Ndef.get(tag)?.let { ndef ->
            var msg: NdefMessage? = null
            var writable = false
            var lockable = false
            var maxSize = 0
            try {
                ndef.connect()
                msg = ndef.ndefMessage
                writable = ndef.isWritable
                lockable = ndef.canMakeReadOnly()
                maxSize = ndef.maxSize
            } catch (e: Exception) {
                msg = ndef.cachedNdefMessage ?: fallbackMessage
                writable = ndef.isWritable
                maxSize = ndef.maxSize
            } finally {
                close(ndef)
            }
            raw = msg?.toByteArray()
            ndefInfo = NdefInfo(
                type = ndefTypeName(ndef.type),
                maxSize = maxSize,
                usedSize = msg?.byteArrayLength ?: 0,
                writable = writable,
                canMakeReadOnly = lockable,
                records = msg?.let { NdefParser.parse(it) } ?: emptyList(),
            )
        }
        if (ndefInfo == null && fallbackMessage != null) {
            raw = fallbackMessage.toByteArray()
            ndefInfo = NdefInfo("NDEF", 0, fallbackMessage.byteArrayLength, false, false, NdefParser.parse(fallbackMessage))
        }

        // 2) Technische Eckdaten
        var chip: ChipInfo? = null
        NfcA.get(tag)?.let { a ->
            details += "ATQA" to a.atqa.toHex()
            details += "SAK" to "%02X".format(a.sak.toInt())
            details += "Max. Übertragung" to "${a.maxTransceiveLength} Bytes"
            if (uidBytes.isNotEmpty()) manufacturerName(uidBytes[0].toInt() and 0xFF)?.let { details += "Hersteller" to it }
            if (MifareUltralight.get(tag) != null || a.sak.toInt() == 0) {
                chip = tryGetVersion(a, details)
            }
        }
        NfcB.get(tag)?.let { b ->
            details += "Application Data" to b.applicationData.toHex()
            details += "Protocol Info" to b.protocolInfo.toHex()
        }
        NfcF.get(tag)?.let { f ->
            details += "Manufacturer (PMm)" to f.manufacturer.toHex()
            details += "System Code" to f.systemCode.toHex()
        }
        NfcV.get(tag)?.let { v ->
            details += "DSFID" to "%02X".format(v.dsfId.toInt())
            details += "Response Flags" to "%02X".format(v.responseFlags.toInt())
            if (uidBytes.size >= 7) manufacturerName(uidBytes[6].toInt() and 0xFF)?.let { details += "Hersteller" to it }
        }
        IsoDep.get(tag)?.let { d ->
            d.historicalBytes?.let { details += "Historical Bytes" to it.toHex() }
            d.hiLayerResponse?.let { details += "Hi-Layer Response" to it.toHex() }
            details += "Extended APDU" to if (d.isExtendedLengthApduSupported) "ja" else "nein"
        }
        NfcBarcode.get(tag)?.let { details += "Barcode" to it.barcode.toHex() }
        MifareClassic.get(tag)?.let { m ->
            details += "Sektoren / Blöcke" to "${m.sectorCount} / ${m.blockCount}"
        }

        val chipName = chip?.name ?: guessChip(tag, techs)
        chip?.let { details += "Nutzerspeicher" to "${it.userBytes} Bytes (${it.totalPages} Seiten gesamt)" }

        // 3) Optionaler Speicher-Dump
        val dump = if (dumpMemory) {
            try {
                dumpMemory(tag, chip)
            } catch (e: Exception) {
                "Speicher konnte nicht gelesen werden: ${e.message ?: e.javaClass.simpleName}"
            }
        } else null

        return TagInfo(
            timestamp = System.currentTimeMillis(),
            uid = if (uidBytes.isEmpty()) "–" else uidBytes.toHex(),
            chip = chipName,
            techs = techs,
            details = details,
            ndef = ndefInfo,
            ndefRaw = raw,
            memoryDump = dump,
        )
    }

    private fun tryGetVersion(a: NfcA, details: MutableList<Pair<String, String>>): ChipInfo? = try {
        a.connect()
        a.timeout = 500
        val v = a.transceive(byteArrayOf(Ntag.CMD_GET_VERSION))
        if (v.size >= 8) details += "Version" to v.toHex(" ")
        val chip = Ntag.identify(v)
        if (chip != null) {
            try {
                val cfg = a.transceive(byteArrayOf(Ntag.CMD_READ, chip.cfgPage.toByte()))
                if (cfg.size >= 8) {
                    val auth0 = cfg[3].toInt() and 0xFF
                    val prot = cfg[4].toInt() and 0x80 != 0
                    details += "Passwortschutz" to when {
                        auth0 >= chip.totalPages -> "aus"
                        prot -> "an (Lesen + Schreiben ab Seite $auth0)"
                        else -> "an (Schreiben ab Seite $auth0)"
                    }
                }
            } catch (_: Exception) {
                details += "Passwortschutz" to "unbekannt (Konfiguration geschützt)"
            }
        }
        chip
    } catch (_: Exception) {
        null
    } finally {
        close(a)
    }

    private fun guessChip(tag: Tag, techs: List<String>): String {
        MifareClassic.get(tag)?.let { m ->
            val size = when (m.size) {
                MifareClassic.SIZE_MINI -> "Mini"
                MifareClassic.SIZE_1K -> "1K"
                MifareClassic.SIZE_2K -> "2K"
                MifareClassic.SIZE_4K -> "4K"
                else -> "${m.size} Bytes"
            }
            return "MIFARE Classic $size"
        }
        MifareUltralight.get(tag)?.let { u ->
            return when (u.type) {
                MifareUltralight.TYPE_ULTRALIGHT -> "MIFARE Ultralight / NTAG"
                MifareUltralight.TYPE_ULTRALIGHT_C -> "MIFARE Ultralight C"
                else -> "MIFARE Ultralight (Typ unbekannt)"
            }
        }
        return when {
            "IsoDep" in techs && "NfcA" in techs -> "ISO 14443-4 Typ A (z. B. DESFire, Karte)"
            "IsoDep" in techs -> "ISO 14443-4 Typ B (z. B. Ausweis, Karte)"
            "NfcV" in techs -> "ISO 15693 (NFC-V, z. B. ICODE)"
            "NfcF" in techs -> "FeliCa (NFC-F)"
            "NfcB" in techs -> "ISO 14443-3 Typ B"
            "NfcA" in techs -> "ISO 14443-3 Typ A"
            "NfcBarcode" in techs -> "NFC Barcode (Kovio)"
            else -> "Unbekannt"
        }
    }

    // ---------------------------------------------------------------- Speicher-Dump

    private fun dumpMemory(tag: Tag, chip: ChipInfo?): String? {
        MifareUltralight.get(tag)?.let { return dumpUltralight(it, chip) }
        MifareClassic.get(tag)?.let { return dumpClassic(it) }
        NfcV.get(tag)?.let { return dumpNfcV(it, tag.id) }
        return "Speicher-Dump wird für diesen Tag-Typ nicht unterstützt."
    }

    private fun dumpUltralight(u: MifareUltralight, chip: ChipInfo?): String {
        val maxPages = chip?.totalPages ?: when (u.type) {
            MifareUltralight.TYPE_ULTRALIGHT -> 16
            MifareUltralight.TYPE_ULTRALIGHT_C -> 48
            else -> 256
        }
        val pages = mutableListOf<Pair<Int, ByteArray>>()
        var note = ""
        try {
            u.connect()
            var p = 0
            while (p < maxPages) {
                val data = try {
                    u.readPages(p)
                } catch (e: Exception) {
                    note = "\n… ab Seite $p nicht lesbar (Ende oder Passwortschutz)"
                    break
                }
                for (i in 0 until 4) {
                    if (p + i >= maxPages) break
                    pages += (p + i) to data.copyOfRange(i * 4, i * 4 + 4)
                }
                p += 4
            }
        } finally {
            close(u)
        }
        return formatBlocks("Seite", pages) + note
    }

    private fun dumpClassic(m: MifareClassic): String {
        val keys = listOf(
            MifareClassic.KEY_DEFAULT,
            MifareClassic.KEY_MIFARE_APPLICATION_DIRECTORY,
            MifareClassic.KEY_NFC_FORUM,
        )
        return buildString {
            try {
                m.connect()
                for (s in 0 until m.sectorCount) {
                    val ok = keys.any { k -> runCatching { m.authenticateSectorWithKeyA(s, k) }.getOrDefault(false) } ||
                        keys.any { k -> runCatching { m.authenticateSectorWithKeyB(s, k) }.getOrDefault(false) }
                    append("Sektor $s")
                    if (!ok) {
                        append(": kein Standardschlüssel passt\n")
                        continue
                    }
                    append('\n')
                    val first = m.sectorToBlock(s)
                    val blocks = (0 until m.getBlockCountInSector(s)).mapNotNull { i ->
                        runCatching { (first + i) to m.readBlock(first + i) }.getOrNull()
                    }
                    append(formatBlocks("  Block", blocks)).append('\n')
                }
            } finally {
                close(m)
            }
        }.trimEnd()
    }

    private fun dumpNfcV(v: NfcV, uid: ByteArray): String {
        val blocks = mutableListOf<Pair<Int, ByteArray>>()
        try {
            v.connect()
            for (b in 0 until 256) {
                // Flags 0x22 = adressiert + hohe Datenrate, 0x20 = READ SINGLE BLOCK
                val cmd = byteArrayOf(0x22, 0x20) + uid + byteArrayOf(b.toByte())
                val resp = try { v.transceive(cmd) } catch (_: Exception) { break }
                if (resp.isEmpty() || resp[0].toInt() and 0x01 != 0) break
                blocks += b to resp.copyOfRange(1, resp.size)
            }
        } finally {
            close(v)
        }
        return if (blocks.isEmpty()) "Keine Blöcke lesbar." else formatBlocks("Block", blocks)
    }

    private fun ndefTypeName(type: String?): String = when (type) {
        Ndef.NFC_FORUM_TYPE_1 -> "NFC Forum Typ 1"
        Ndef.NFC_FORUM_TYPE_2 -> "NFC Forum Typ 2"
        Ndef.NFC_FORUM_TYPE_3 -> "NFC Forum Typ 3"
        Ndef.NFC_FORUM_TYPE_4 -> "NFC Forum Typ 4"
        Ndef.MIFARE_CLASSIC -> "MIFARE Classic"
        null -> "NDEF"
        else -> type.substringAfterLast('.')
    }

    internal fun close(c: Closeable) {
        try { c.close() } catch (_: Exception) { }
    }
}
