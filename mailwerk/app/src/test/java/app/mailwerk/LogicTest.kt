package app.mailwerk

import app.mailwerk.data.Category
import app.mailwerk.data.Security
import app.mailwerk.mail.AutoConfig
import app.mailwerk.mail.Classifier
import app.mailwerk.mail.HtmlSanitizer
import app.mailwerk.mail.Threads
import app.mailwerk.mail.Unsubscribe
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LogicTest {
    @Test fun classifiesNewsletter() {
        assertEquals(Category.NEWSLETTER, Classifier.classify("news@shop.de", mapOf("list-unsubscribe" to "<https://x>"), false))
        assertEquals(Category.NEWSLETTER, Classifier.classify("hallo@shop.de", mapOf("precedence" to "bulk"), false))
        assertEquals(Category.NEWSLETTER, Classifier.classify("team@firma.de", mapOf("x-mailchimp" to "1"), false))
    }

    @Test fun classifiesNotification() {
        assertEquals(Category.NOTIFICATION, Classifier.classify("noreply@github.com", emptyMap(), false))
        assertEquals(Category.NOTIFICATION, Classifier.classify("no-reply@bank.de", mapOf("list-unsubscribe" to "<x>"), false))
        assertEquals(Category.NOTIFICATION, Classifier.classify("max@firma.de", mapOf("auto-submitted" to "auto-generated"), false))
        assertEquals(Category.NOTIFICATION, Classifier.classify("versand@amazon.de", emptyMap(), false))
    }

    @Test fun classifiesPeople() {
        assertEquals(Category.PEOPLE, Classifier.classify("anna.mueller@gmx.de", emptyMap(), false))
        // Bekannter Kontakt schlägt Newsletter-Merkmale
        assertEquals(Category.PEOPLE, Classifier.classify("news@verein.de", mapOf("list-id" to "x"), true))
        // Eigene Regel gewinnt immer
        assertEquals(Category.NEWSLETTER, Classifier.classify("anna@gmx.de", emptyMap(), true, Category.NEWSLETTER))
    }

    @Test fun threadSubjects() {
        assertEquals("angebot 2026", Threads.normalizeSubject("AW: WG: Re: Angebot 2026"))
        assertEquals("angebot 2026", Threads.normalizeSubject("Re[2]: Fwd:  Angebot   2026"))
        assertEquals("termin", Threads.normalizeSubject("[Verein] AW: Termin"))
        assertEquals(Threads.key(1, "Re: Hallo", "a"), Threads.key(1, "Hallo", "b"))
        assertTrue(Threads.key(1, "", "x") != Threads.key(1, "", "y"))
    }

    @Test fun unsubscribeParsing() {
        val u = Unsubscribe.parse("<mailto:unsub@x.de?subject=stop>, <https://x.de/u?id=1>", "List-Unsubscribe=One-Click")!!
        assertEquals("mailto:unsub@x.de?subject=stop", u.mailto); assertEquals("https://x.de/u?id=1", u.http); assertTrue(u.oneClick)
        assertFalse(Unsubscribe.parse("<https://x.de/u>", null)!!.oneClick)
        assertNull(Unsubscribe.parse("", null))
    }

    @Test fun removesTrackersAndBlocksImages() {
        val html = """<p>Hallo</p><img src="https://t.shop.de/track/open?id=5" width="1" height="1">
            <img src="https://cdn.shop.de/logo.png" width="200"><img src="https://list-manage.com/track/open.php?u=1">
            <script>alert(1)</script><a href="javascript:alert(1)">x</a><div onclick="evil()">y</div>"""
        val r = HtmlSanitizer.sanitize(html, blockRemote = true, darkMode = false)
        assertEquals(2, r.trackers); assertEquals(1, r.remoteImages)
        assertFalse(r.html.contains("<script")); assertFalse(r.html.contains("javascript:")); assertFalse(r.html.contains("onclick"))
        assertTrue(r.html.contains("data-blocked-src=\"https://cdn.shop.de/logo.png\""))
        val open = HtmlSanitizer.sanitize(html, blockRemote = false, darkMode = true)
        assertEquals(0, open.remoteImages); assertTrue(open.html.contains("src=\"https://cdn.shop.de/logo.png\""))
    }

    @Test fun textToHtmlEscapes() {
        val h = HtmlSanitizer.textToHtml("a <b> & https://x.de\n> zitat", false)
        assertTrue(h.contains("a &lt;b&gt; &amp;")); assertTrue(h.contains("<a href=\"https://x.de\">"))
    }

    @Test fun updateInfoParsing() {
        val i = app.mailwerk.sync.Updater.parse("""{"versionCode":7,"versionName":"2.0","notes":"Neu","apk":"Mailwerk.apk"}""")
        assertEquals(7, i.versionCode); assertEquals("2.0", i.versionName)
        assertEquals(app.mailwerk.sync.Updater.BASE + "Mailwerk.apk", i.apkUrl)
        val repo = app.mailwerk.sync.Updater.parse(java.io.File("../update.json").readText())
        assertEquals(app.mailwerk.BuildConfig.VERSION_CODE, repo.versionCode) // update.json passt zur gebauten Version
        assertEquals(app.mailwerk.BuildConfig.VERSION_NAME, repo.versionName)
    }

    @Test fun customDomainsViaMx() {
        assertEquals("imap.one.com", AutoConfig.fromMxHost("mx1.mailpod16-cph3.g1i.one.com.")!!.imapHost)
        assertEquals("send.one.com", AutoConfig.fromMxHost("mx2.mailpod15-cph3.g1i.one.com")!!.smtpHost)
        assertEquals("imap.ionos.de", AutoConfig.fromMxHost("mx00.kundenserver.de")!!.imapHost)
        assertEquals("outlook.office365.com", AutoConfig.fromMxHost("firma-de.mail.protection.outlook.com")!!.imapHost)
        assertNull(AutoConfig.fromMxHost("mail.unbekannt.example"))
        val presets = app.mailwerk.data.PresetAccounts.parse("# Kommentar\nMax|max@beispiel-onecom.dk\nkaputt\nFirma | info@firma.example\n")
        assertEquals(listOf("max@beispiel-onecom.dk", "info@firma.example"), presets.map { it.email })
        assertEquals("Firma", presets[1].name)
        val acc = presets.map { app.mailwerk.data.PresetAccounts.toAccount(it) }
        acc.forEach { a ->
            assertEquals("imap.one.com", a.imapHost); assertEquals(993, a.imapPort); assertEquals(Security.SSL, a.imapSecurity)
            assertEquals("send.one.com", a.smtpHost); assertEquals(465, a.smtpPort); assertEquals(Security.SSL, a.smtpSecurity)
            assertEquals(a.email, a.username)
        }
    }

    @Test fun autoconfigPresetsAndIspdb() {
        assertEquals("imap.gmx.net", AutoConfig.presets["gmx.de"]!!.imapHost)
        assertEquals("secureimap.t-online.de", AutoConfig.presets["t-online.de"]!!.imapHost)
        val xml = """<?xml version="1.0"?><clientConfig version="1.1"><emailProvider id="x">
            <incomingServer type="pop3"><hostname>pop.x.de</hostname><port>995</port><socketType>SSL</socketType></incomingServer>
            <incomingServer type="imap"><hostname>imap.%EMAILDOMAIN%</hostname><port>143</port><socketType>STARTTLS</socketType><username>%EMAILADDRESS%</username></incomingServer>
            <outgoingServer type="smtp"><hostname>smtp.x.de</hostname><port>587</port><socketType>STARTTLS</socketType></outgoingServer>
            </emailProvider></clientConfig>"""
        val c = AutoConfig.parseIspdb(xml, "me@x.de")
        assertNotNull(c); c!!
        assertEquals("imap.x.de", c.imapHost); assertEquals(143, c.imapPort); assertEquals(Security.STARTTLS, c.imapSecurity)
        assertEquals("smtp.x.de", c.smtpHost); assertEquals(587, c.smtpPort)
    }
}
