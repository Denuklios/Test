package app.mailwerk

import app.mailwerk.mail.EncodedWords
import app.mailwerk.mail.HtmlSanitizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Base64

class RenderingTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    private fun b64(b: ByteArray) = Base64.getEncoder().encodeToString(b)

    @Test fun emojiSplitAcrossEncodedWords() {
        val bytes = "🎄 Weihnachtsangebote".toByteArray()
        // Emoji (4 Bytes) mitten durchgeschnitten – so schicken es manche Newsletter-Systeme
        val subject = "=?UTF-8?B?${b64(bytes.copyOfRange(0, 2))}?= =?UTF-8?B?${b64(bytes.copyOfRange(2, bytes.size))}?="
        assertEquals("🎄 Weihnachtsangebote", EncodedWords.decode(subject))
        assertEquals("Grüße 🎅 aus Køge", EncodedWords.decode("=?utf-8?Q?Gr=C3=BC=C3=9Fe_=F0=9F?= =?utf-8?Q?=8E=85_aus_K=C3=B8ge?="))
        assertEquals("Hallo Welt", EncodedWords.decode("Hallo =?ISO-8859-1?Q?Welt?="))
        assertEquals("a b", EncodedWords.decode("=?UTF-8?Q?a?= =?ISO-8859-1?Q?_b?="))
        assertEquals("Normaler Betreff", EncodedWords.decode("Normaler Betreff"))
    }

    @Test fun rawUtf8HeaderReadAsLatin1IsRepaired() {
        val broken = String("🎄 Jul i Danmark – æøå".toByteArray(), Charsets.ISO_8859_1)
        assertEquals("🎄 Jul i Danmark – æøå", EncodedWords.decode(broken))
        assertEquals("Grüße", EncodedWords.decode("Grüße")) // echtes Latin-1 bleibt unverändert
    }

    @Test fun emojiImagesBecomeEmojiText() {
        val r = HtmlSanitizer.sanitize("""<p>Frohe Weihnachten <img src="https://cdn.x.de/emoji/1f384.png" alt="🎄" width="20" height="20"></p>
            <img src="https://cdn.x.de/hero.jpg" alt="Banner" width="600">""", blockRemote = true, darkMode = false)
        assertTrue(r.html.contains("Frohe Weihnachten 🎄"))
        assertEquals(1, r.remoteImages)
    }

    @Test fun fixedWidthNewsletterFitsPhone() {
        val html = """<html><head><style>.wrap{width:640px;min-width:640px} @media only screen{.x{width:600px}}</style></head><body>
            <table width="640" cellpadding="0" style="width:640px;margin:0 auto"><tr><td width="640" nowrap>
              <div class="wrap"><h1>Opdatering af dine kontooplysninger – en meget lang overskrift der skal ombrydes</h1>
              <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" width="600" height="300" alt="">
              <p style="width: 620px">Som en del af vores fortsatte arbejde med at overholde de gældende finansielle regler og retningslinjer.</p>
              <table width="600"><tr><td width="300">Venstre kolonne med tekst</td><td width="300">Højre kolonne med tekst</td></tr></table>
              <a href="https://example.com/averyveryveryveryveryveryveryveryveryveryverylongurlwithoutbreaks/abcdefghijklmnopqrstuvwxyz0123456789">https://example.com/averyveryveryveryveryveryveryveryveryveryverylongurlwithoutbreaks/abcdefghijklmnopqrstuvwxyz0123456789</a>
              </div></td></tr></table></body></html>"""
        val r = HtmlSanitizer.sanitize(html, blockRemote = true, darkMode = true)
        assertFalse(r.html.contains("640px")); assertFalse(r.html.contains("width=\"640\""))
        assertFalse(r.html.contains("nowrap"))
        File("build/render-check").apply { mkdirs() }.let { File(it, "newsletter.html").writeText(r.html) }
    }

    @Test fun signatureFormattingAndLogo() {
        val body = "Hallo Anna,\n\ndanke!\n\n-- \n**Max Mustermann**\n*Musterfirma*\nwww.beispiel.dk · hej@beispiel.dk\n[Logo]\n\n> zitierte Zeile"
        val h = app.mailwerk.mail.TextFormat.toHtml(body, hasLogo = true)
        assertTrue(h.contains("<b>Max Mustermann</b>")); assertTrue(h.contains("<i>Musterfirma</i>"))
        assertTrue(h.contains("href=\"https://www.beispiel.dk\"")); assertTrue(h.contains("href=\"mailto:hej@beispiel.dk\""))
        assertTrue(h.contains("cid:signatur-logo@mailwerk")); assertTrue(h.contains("<blockquote"))
        assertFalse(app.mailwerk.mail.TextFormat.toPlain(body).contains("[Logo]"))
        assertFalse(app.mailwerk.mail.TextFormat.toHtml(body, hasLogo = false).contains("cid:"))
        // 5*3 = 15 darf nicht kursiv werden
        assertFalse(app.mailwerk.mail.TextFormat.inline("5 * 3 = 15 und 2 * 4").contains("<i>"))

        val acc = app.mailwerk.data.Account(1, "Ich", "ich@x.de", "h", 1, app.mailwerk.data.Security.SSL, "h", 1, app.mailwerk.data.Security.SSL, "u", "")
        val logo = app.mailwerk.mail.OutgoingAttachment("logo.png", "image/png", ByteArray(100) { 1 })
        val msg = app.mailwerk.mail.MailClient(acc, "x").buildMessage("a@b.de", "", "", "Test", body, emptyList(), null, null, logo)
        val out = java.io.ByteArrayOutputStream().also { msg.writeTo(it) }.toString()
        assertTrue(out.contains("multipart/related")); assertTrue(out.contains("Content-ID: <signatur-logo@mailwerk>"))
    }
}
