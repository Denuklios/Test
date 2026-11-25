package app.nfcwerkstatt.nfc

import android.nfc.NdefMessage
import android.nfc.NdefRecord

object NdefParser {

    fun parse(message: NdefMessage): List<RecordInfo> = message.records.map { parseRecord(it) }

    fun parseRecord(r: NdefRecord): RecordInfo {
        val type = String(r.type ?: ByteArray(0), Charsets.US_ASCII)
        val payload = r.payload ?: ByteArray(0)
        val hex = payload.toHex(" ")
        val idPart = r.id?.takeIf { it.isNotEmpty() }?.let { " · ID: ${it.toHex()}" } ?: ""
        val meta = "TNF: ${tnfName(r.tnf)} · Typ: ${type.ifEmpty { "–" }} · ${payload.size} Bytes$idPart"

        return try {
            when (r.tnf) {
                NdefRecord.TNF_WELL_KNOWN -> when {
                    r.type.contentEquals(NdefRecord.RTD_TEXT) -> {
                        val (lang, text) = decodeText(payload)
                        RecordInfo("Text ($lang)", text, meta, hex)
                    }
                    r.type.contentEquals(NdefRecord.RTD_URI) -> {
                        val uri = r.toUri()?.toString() ?: ""
                        RecordInfo(uriTitle(uri), uri, meta, hex, uri)
                    }
                    r.type.contentEquals(NdefRecord.RTD_SMART_POSTER) -> {
                        val inner = parse(NdefMessage(payload))
                        val content = inner.joinToString("\n") { "${it.title}: ${it.content}" }
                        RecordInfo("Smart Poster", content, meta, hex, r.toUri()?.toString())
                    }
                    r.type.contentEquals(NdefRecord.RTD_HANDOVER_SELECT) ->
                        RecordInfo("Handover Select (z. B. Bluetooth-Kopplung)", hex, meta, hex)
                    else -> RecordInfo("Well-Known: $type", payloadPreview(payload), meta, hex)
                }

                NdefRecord.TNF_MIME_MEDIA -> {
                    val mime = type.lowercase()
                    when {
                        mime == WifiPayload.MIME -> {
                            val w = WifiPayload.parse(payload)
                            if (w != null) {
                                val pw = if (w.auth == WifiAuth.OPEN) "–" else w.password
                                RecordInfo("WLAN", "Netzwerk: ${w.ssid}\nSicherheit: ${w.auth.label}\nPasswort: $pw", meta, hex)
                            } else RecordInfo("WLAN (unlesbar)", hex, meta, hex)
                        }
                        mime == "text/vcard" || mime == "text/x-vcard" ->
                            RecordInfo("Kontakt (vCard)", VCard.summarize(String(payload, Charsets.UTF_8)), meta, hex)
                        mime == "application/vnd.bluetooth.ep.oob" ->
                            RecordInfo("Bluetooth-Kopplung", bluetoothOob(payload), meta, hex)
                        else -> RecordInfo("MIME: $mime", payloadPreview(payload), meta, hex)
                    }
                }

                NdefRecord.TNF_ABSOLUTE_URI -> RecordInfo(uriTitle(type), type, meta, hex, type)

                NdefRecord.TNF_EXTERNAL_TYPE ->
                    if (type.equals("app.nfcwerkstatt:a", true)) {
                        RecordInfo("NFC-Werkstatt-Aktion", "Aktions-ID: ${String(payload, Charsets.US_ASCII)}", meta, hex)
                    } else if (type == "android.com:pkg") {
                        RecordInfo("App starten (AAR)", String(payload, Charsets.US_ASCII), meta, hex)
                    } else RecordInfo("Externer Typ: $type", payloadPreview(payload), meta, hex)

                NdefRecord.TNF_EMPTY -> RecordInfo("Leerer Datensatz", "–", meta, hex)
                else -> RecordInfo("Unbekannter Datensatz", payloadPreview(payload), meta, hex)
            }
        } catch (e: Exception) {
            RecordInfo("Fehlerhafter Datensatz", e.message ?: e.javaClass.simpleName, meta, hex)
        }
    }

    fun decodeText(payload: ByteArray): Pair<String, String> {
        if (payload.isEmpty()) return "?" to ""
        val status = payload[0].toInt() and 0xFF
        val utf16 = status and 0x80 != 0
        val langLen = status and 0x3F
        val lang = String(payload, 1, langLen, Charsets.US_ASCII)
        val text = String(
            payload, 1 + langLen, payload.size - 1 - langLen,
            if (utf16) Charsets.UTF_16 else Charsets.UTF_8,
        )
        return lang.ifEmpty { "?" } to text
    }

    fun uriTitle(uri: String): String = when {
        uri.startsWith("tel:", true) -> "Telefon"
        uri.startsWith("mailto:", true) -> "E-Mail"
        uri.startsWith("sms:", true) || uri.startsWith("smsto:", true) -> "SMS"
        uri.startsWith("geo:", true) -> "Standort"
        uri.contains("paypal.me", true) -> "PayPal"
        uri.contains("revolut.me", true) -> "Revolut"
        uri.contains("mobilepay", true) -> "MobilePay"
        uri.startsWith("http", true) -> "Link"
        uri.startsWith("WIFI:", true) -> "WLAN (Text)"
        else -> "URI"
    }

    private fun payloadPreview(p: ByteArray): String =
        if (p.looksLikeText()) String(p, Charsets.UTF_8) else p.toHex(" ")

    private fun bluetoothOob(p: ByteArray): String {
        if (p.size < 8) return p.toHex(" ")
        val mac = p.copyOfRange(2, 8).reversedArray().toHex()
        return "Geräteadresse: $mac"
    }

    fun tnfName(tnf: Short): String = when (tnf) {
        NdefRecord.TNF_EMPTY -> "Leer"
        NdefRecord.TNF_WELL_KNOWN -> "Well-Known"
        NdefRecord.TNF_MIME_MEDIA -> "MIME"
        NdefRecord.TNF_ABSOLUTE_URI -> "Absolute URI"
        NdefRecord.TNF_EXTERNAL_TYPE -> "Extern"
        NdefRecord.TNF_UNKNOWN -> "Unbekannt"
        NdefRecord.TNF_UNCHANGED -> "Unverändert"
        else -> tnf.toString()
    }
}
