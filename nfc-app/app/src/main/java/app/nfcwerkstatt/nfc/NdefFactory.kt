package app.nfcwerkstatt.nfc

import android.net.Uri
import android.nfc.NdefMessage
import android.nfc.NdefRecord

/** Ein vorbereiteter Datensatz in der Schreibliste. */
data class DraftRecord(
    val kind: String,
    val summary: String,
    val record: NdefRecord,
) {
    val size: Int get() = NdefMessage(record).byteArrayLength
}

object NdefFactory {

    fun text(text: String, lang: String = "de"): DraftRecord =
        DraftRecord("Text", text, NdefRecord.createTextRecord(lang.ifBlank { "de" }, text))

    fun url(input: String): DraftRecord {
        val u = input.trim().let { if (!it.contains(":")) "https://$it" else it }
        return DraftRecord("Link", u, NdefRecord.createUri(u))
    }

    fun phone(number: String): DraftRecord {
        val n = number.filter { it.isDigit() || it in "+*#" }
        return DraftRecord("Telefon", n, NdefRecord.createUri("tel:$n"))
    }

    fun email(to: String, subject: String, body: String): DraftRecord {
        val params = buildList {
            if (subject.isNotBlank()) add("subject=" + Uri.encode(subject))
            if (body.isNotBlank()) add("body=" + Uri.encode(body))
        }
        val uri = "mailto:${to.trim()}" + if (params.isEmpty()) "" else "?" + params.joinToString("&")
        val summary = listOf(to.trim(), subject).filter { it.isNotBlank() }.joinToString(" – ")
        return DraftRecord("E-Mail", summary, NdefRecord.createUri(uri))
    }

    fun sms(number: String, body: String): DraftRecord {
        val n = number.filter { it.isDigit() || it == '+' }
        val uri = "sms:$n" + if (body.isNotBlank()) "?body=" + Uri.encode(body) else ""
        return DraftRecord("SMS", listOf(n, body).filter { it.isNotBlank() }.joinToString(" – "), NdefRecord.createUri(uri))
    }

    fun geo(lat: Double, lon: Double, label: String): DraftRecord {
        val base = "geo:$lat,$lon"
        val uri = if (label.isNotBlank()) "$base?q=$lat,$lon(${Uri.encode(label)})" else base
        return DraftRecord("Standort", listOf("$lat, $lon", label).filter { it.isNotBlank() }.joinToString(" – "), NdefRecord.createUri(uri))
    }

    fun app(packageName: String): DraftRecord =
        DraftRecord("App starten", packageName.trim(), NdefRecord.createApplicationRecord(packageName.trim()))

    fun wifi(cfg: WifiConfig): DraftRecord =
        DraftRecord("WLAN", "${cfg.ssid} (${cfg.auth.label})", NdefRecord.createMime(WifiPayload.MIME, WifiPayload.build(cfg)))

    fun contact(c: Contact): DraftRecord =
        DraftRecord("Kontakt", c.name, NdefRecord.createMime(VCard.MIME, VCard.build(c).toByteArray(Charsets.UTF_8)))

    fun mime(type: String, data: String): DraftRecord =
        DraftRecord("MIME", "${type.trim()}: $data", NdefRecord.createMime(type.trim(), data.toByteArray(Charsets.UTF_8)))

    fun external(domainType: String, data: String): DraftRecord {
        val (domain, t) = domainType.split(":", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
        return DraftRecord("Extern", "$domainType: $data", NdefRecord.createExternal(domain.trim(), t.trim(), data.toByteArray(Charsets.UTF_8)))
    }

    /** Bestehenden Datensatz (z. B. aus gelesenem Tag) wieder in die Liste übernehmen. */
    fun fromRecord(r: NdefRecord): DraftRecord {
        val info = NdefParser.parseRecord(r)
        return DraftRecord(info.title, info.content.lineSequence().firstOrNull() ?: "", r)
    }

    fun message(drafts: List<DraftRecord>): NdefMessage = NdefMessage(drafts.map { it.record }.toTypedArray())

    fun emptyMessage(): NdefMessage = NdefMessage(NdefRecord(NdefRecord.TNF_EMPTY, null, null, null))
}
