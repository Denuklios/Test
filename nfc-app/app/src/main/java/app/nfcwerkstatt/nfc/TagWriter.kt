package app.nfcwerkstatt.nfc

import android.nfc.NdefMessage
import android.nfc.Tag
import android.nfc.TagLostException
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import android.nfc.tech.NfcA
import java.io.IOException

class NfcOpException(message: String) : Exception(message)

object TagWriter {

    /** Schreibt eine NDEF-Nachricht, prüft sie durch erneutes Lesen und sperrt optional. */
    fun write(tag: Tag, message: NdefMessage, lock: Boolean): String = guard {
        val size = message.byteArrayLength
        val ndef = Ndef.get(tag)
        if (ndef != null) {
            try {
                ndef.connect()
                if (!ndef.isWritable) throw NfcOpException("Der Tag ist schreibgeschützt.")
                if (size > ndef.maxSize) throw NfcOpException("Zu groß: $size Bytes, der Tag fasst nur ${ndef.maxSize} Bytes.")
                if (lock && !ndef.canMakeReadOnly()) throw NfcOpException("Dieser Tag kann nicht schreibgeschützt werden.")
                ndef.writeNdefMessage(message)
                val verified = runCatching { ndef.ndefMessage?.toByteArray()?.contentEquals(message.toByteArray()) == true }
                    .getOrDefault(false)
                var result = "Geschrieben: $size von ${ndef.maxSize} Bytes" + if (verified) " ✓ geprüft" else ""
                if (lock) {
                    if (!ndef.makeReadOnly()) throw NfcOpException("Geschrieben, aber Schreibschutz fehlgeschlagen.")
                    result += " · dauerhaft gesperrt"
                }
                return@guard result
            } finally {
                TagReader.close(ndef)
            }
        }
        val formatable = NdefFormatable.get(tag)
        if (formatable != null) {
            try {
                formatable.connect()
                if (lock) formatable.formatReadOnly(message) else formatable.format(message)
            } finally {
                TagReader.close(formatable)
            }
            return@guard "Tag formatiert und beschrieben ($size Bytes)" + if (lock) " · dauerhaft gesperrt" else ""
        }
        throw NfcOpException("Dieser Tag unterstützt kein NDEF. Techniken: " + tag.techList.joinToString { it.substringAfterLast('.') })
    }

    fun erase(tag: Tag): String {
        write(tag, NdefFactory.emptyMessage(), false)
        return "Tag gelöscht (leere NDEF-Nachricht)."
    }

    fun lock(tag: Tag): String = guard {
        val ndef = Ndef.get(tag) ?: throw NfcOpException("Tag ist nicht NDEF-formatiert – erst beschreiben oder löschen.")
        try {
            ndef.connect()
            if (!ndef.isWritable) return@guard "Tag ist bereits schreibgeschützt."
            if (!ndef.canMakeReadOnly()) throw NfcOpException("Dieser Tag kann nicht schreibgeschützt werden.")
            if (!ndef.makeReadOnly()) throw NfcOpException("Schreibschutz fehlgeschlagen.")
            "Tag ist jetzt dauerhaft schreibgeschützt."
        } finally {
            TagReader.close(ndef)
        }
    }

    /** NTAG21x / Ultralight EV1: Passwortschutz aktivieren. */
    fun setPassword(tag: Tag, password: String, protectRead: Boolean): String = withNfcA(tag) { a ->
        val chip = identify(a)
        val (pwd, pack) = Ntag.derivePassword(password)
        val cfg = readPages(a, chip.cfgPage)
        val cfg0 = cfg.copyOfRange(0, 4)
        val cfg1 = cfg.copyOfRange(4, 8)
        if (Ntag.isProtected(cfg0, chip)) {
            throw NfcOpException("Der Tag hat bereits einen Passwortschutz. Bitte zuerst das Passwort entfernen.")
        }
        writePage(a, chip.cfgPage + 2, pwd)
        writePage(a, chip.cfgPage + 3, byteArrayOf(pack[0], pack[1], 0, 0))
        writePage(a, chip.cfgPage + 1, Ntag.withProt(cfg1, protectRead))
        writePage(a, chip.cfgPage, Ntag.withAuth0(cfg0, Ntag.DEFAULT_AUTH0)) // zuletzt: aktiviert den Schutz
        "Passwortschutz aktiv (${chip.name}, " + (if (protectRead) "Lesen + Schreiben" else "nur Schreiben") + ")."
    }

    /** NTAG21x / Ultralight EV1: Passwortschutz mit bekanntem Passwort entfernen. */
    fun removePassword(tag: Tag, password: String): String = withNfcA(tag) { a ->
        val chip = identify(a)
        val (pwd, _) = Ntag.derivePassword(password)
        val resp = try {
            a.transceive(byteArrayOf(Ntag.CMD_PWD_AUTH) + pwd)
        } catch (e: IOException) {
            throw NfcOpException("Passwort falsch (Tag hat abgelehnt).")
        }
        if (resp.size < 2) throw NfcOpException("Passwort falsch (Tag hat abgelehnt).")
        val cfg = readPages(a, chip.cfgPage)
        writePage(a, chip.cfgPage + 1, Ntag.withProt(cfg.copyOfRange(4, 8), false))
        writePage(a, chip.cfgPage + 2, byteArrayOf(-1, -1, -1, -1))
        writePage(a, chip.cfgPage, Ntag.withAuth0(cfg.copyOfRange(0, 4), 0xFF))
        "Passwortschutz entfernt (${chip.name})."
    }

    // ------------------------------------------------------------------ intern

    private fun <T> withNfcA(tag: Tag, block: (NfcA) -> T): T = guard {
        val a = NfcA.get(tag) ?: throw NfcOpException("Kein NFC-A-Tag. Passwörter werden nur bei NTAG21x / Ultralight EV1 unterstützt.")
        try {
            a.connect()
            a.timeout = 1000
            block(a)
        } finally {
            TagReader.close(a)
        }
    }

    private fun identify(a: NfcA): ChipInfo {
        val v = try { a.transceive(byteArrayOf(Ntag.CMD_GET_VERSION)) } catch (e: IOException) { ByteArray(0) }
        return Ntag.identify(v)
            ?: throw NfcOpException("Kein NTAG21x / Ultralight EV1 erkannt – Passwortschutz nicht möglich.")
    }

    private fun readPages(a: NfcA, page: Int): ByteArray {
        val r = a.transceive(byteArrayOf(Ntag.CMD_READ, page.toByte()))
        if (r.size < 16) throw NfcOpException("Konfiguration nicht lesbar (Tag evtl. lesegeschützt).")
        return r
    }

    private fun writePage(a: NfcA, page: Int, data: ByteArray) {
        require(data.size == 4)
        val r = a.transceive(byteArrayOf(Ntag.CMD_WRITE, page.toByte()) + data)
        if (r.isNotEmpty() && (r[0].toInt() and 0x0F) != 0x0A) {
            throw NfcOpException("Tag hat Schreibbefehl für Seite $page abgelehnt.")
        }
    }

    /** Übersetzt technische Fehler in verständliche Meldungen. */
    private inline fun <T> guard(block: () -> T): T = try {
        block()
    } catch (e: NfcOpException) {
        throw e
    } catch (e: TagLostException) {
        throw NfcOpException("Verbindung zum Tag verloren – Tag ruhig halten und nochmal versuchen.")
    } catch (e: IOException) {
        throw NfcOpException("Kommunikationsfehler: ${e.message ?: "Tag nicht erreichbar"} – nochmal versuchen.")
    } catch (e: android.nfc.FormatException) {
        throw NfcOpException("Ungültige NDEF-Daten: ${e.message}")
    } catch (e: IllegalArgumentException) {
        throw NfcOpException(e.message ?: "Ungültige Eingabe.")
    } catch (e: SecurityException) {
        throw NfcOpException("Tag ist nicht mehr verfügbar – bitte erneut anhalten.")
    }
}
