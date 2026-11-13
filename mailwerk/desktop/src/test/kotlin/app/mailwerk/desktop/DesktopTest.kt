package app.mailwerk.desktop

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.runDesktopComposeUiTest
import androidx.compose.ui.unit.Density
import app.mailwerk.data.Account
import app.mailwerk.data.Category
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Security
import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import jakarta.activation.DataHandler
import jakarta.mail.Session
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeBodyPart
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import jakarta.mail.util.ByteArrayDataSource
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.util.Locale
import java.util.Properties
import javax.imageio.ImageIO

class RichTextTest {
    @Test fun htmlBecomesFormattedText() {
        val t = RichText.fromHtml("""<html><head><style>p{color:red}</style></head><body>
            <h1>Winter-Sale</h1><p>Bis zu <b>50 %</b> auf <a href="https://shop.example/jacken">Jacken</a>.</p>
            <ul><li>Eins</li><li>Zwei</li></ul><img src="https://t.example/pixel.gif" width=1 height=1>
            <div style="display:none">Versteckte Vorschau</div><script>alert(1)</script></body></html>""", Color.Blue)
        assertEquals("Winter-Sale\n\nBis zu 50 % auf Jacken.\n\n•  Eins\n•  Zwei", t.text)
        val links = t.getLinkAnnotations(0, t.length)
        assertEquals("https://shop.example/jacken", (links.single().item as androidx.compose.ui.text.LinkAnnotation.Url).url)
    }

    @Test fun plainTextLinks() {
        val t = RichText.fromText("Siehe https://example.org/a. Mail an info@example.org", Color.Blue)
        assertEquals(2, t.getLinkAnnotations(0, t.length).size)
    }

    @Test fun passwordIsNotStoredInPlain() {
        val enc = Secret.protect("geheim123")
        assertTrue(!enc.contains("geheim123")); assertEquals("geheim123", Secret.reveal(enc))
    }
}

class DesktopMailTest {
    private val gm = GreenMail(arrayOf(ServerSetup(3243, null, "imap"), ServerSetup(3125, null, "smtp"))).also { it.start() }
    @After fun stop() = gm.stop()
    @Before fun de() { Locale.setDefault(Locale.GERMAN) }

    private fun deliver(from: String, subject: String, html: String, attach: Boolean = false, headers: Map<String, String> = emptyMap()) {
        val m = MimeMessage(Session.getInstance(Properties()))
        m.setFrom(InternetAddress(from)); m.setRecipients(jakarta.mail.Message.RecipientType.TO, "ich@test.de"); m.subject = subject
        val body = MimeBodyPart().apply { setContent(html, "text/html; charset=UTF-8") }
        if (attach) m.setContent(MimeMultipart("mixed", body, MimeBodyPart().apply {
            dataHandler = DataHandler(ByteArrayDataSource("PDF-Inhalt".toByteArray(), "application/pdf")); fileName = "Rechnung.pdf" }))
        else m.setContent(MimeMultipart("mixed", body))
        headers.forEach { (k, v) -> m.setHeader(k, v) }
        m.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser("ich@test.de")).store(m)
    }

    @Test fun syncReadSendAndDownload() = runBlocking {
        gm.setUser("ich@test.de", "ich@test.de", "pw")
        val store = Store(File.createTempFile("mailwerk", ".db").apply { delete() })
        val repo = Repo(store)
        val accId = repo.addAccount(Account(0, "Ich", "ich@test.de", "127.0.0.1", 3243, Security.NONE, "127.0.0.1", 3125, Security.NONE, "ich@test.de", ""), "pw")
        assertTrue("Passwort verschlüsselt gespeichert", !store.account(accId)!!.passwordEnc.contains("pw\""))
        deliver("anna@example.org", "Angebot", "<p>Hallo, anbei das <b>Angebot</b>.</p>", attach = true)
        deliver("news@shop.example", "Wochenangebote", "<h1>Sale</h1>", headers = mapOf("List-Unsubscribe" to "<https://shop.example/u>"))
        assertTrue(repo.sync().isEmpty())

        val all = store.list(null, null, "")
        assertEquals(2, all.size)
        assertEquals(Category.NEWSLETTER, all.first { it.subject == "Wochenangebote" }.category)
        val m = store.message(all.first { it.subject == "Angebot" }.id)!!
        assertTrue(RichText.fromHtml(m.bodyHtml!!, Color.Blue).text.contains("anbei das Angebot"))
        val att = store.attachments(m.id).single()
        val dir = File(System.getProperty("java.io.tmpdir"), "mw-dl-" + System.nanoTime()).apply { mkdirs() }
        assertEquals("PDF-Inhalt", repo.downloadAttachment(m, att, dir).readText())

        repo.setSeen(m, true)
        assertTrue(store.message(m.id)!!.seen)
        // Antworten senden -> landet beim Empfänger und im Gesendet-Ordner
        repo.send(accId, "anna@example.org", "", "", "Re: Angebot", "Danke!", emptyList(), m.messageId, null)
        assertTrue(gm.waitForIncomingEmail(5000, 1))
        assertEquals("Re: Angebot", gm.receivedMessages.last().subject)
        // Archivieren: verschwindet aus dem Posteingang
        repo.archive(store.message(m.id)!!)
        assertEquals(1, store.list(null, null, "").size)
        store.close()
    }
}

@OptIn(ExperimentalTestApi::class)
class DesktopScreenshotTest {
    @Test fun mainWindow() = runDesktopComposeUiTest(1320, 820) {
        val store = Store(File.createTempFile("mailwerk", ".db").apply { delete() })
        val acc = store.saveAccount(Account(0, "Robert", "robert@beispiel.de", "imap.beispiel.de", 993, Security.SSL, "smtp.beispiel.de", 465, Security.SSL, "x", "x", color = 0xFF3D4FE0.toInt()))
        val inbox = store.upsertFolder(acc, "INBOX", "Posteingang", FolderRole.INBOX)
        store.upsertFolder(acc, "Gesendet", "Gesendet", FolderRole.SENT); store.upsertFolder(acc, "Archiv", "Archiv", FolderRole.ARCHIVE)
        store.upsertFolder(acc, "Papierkorb", "Papierkorb", FolderRole.TRASH)
        val now = System.currentTimeMillis(); var uid = 1L
        fun add(name: String, addr: String, subj: String, html: String, ago: Long, seen: Boolean, att: Boolean = false) {
            store.insertMessage(app.mailwerk.data.Message(accountId = acc, folderId = inbox, uid = uid++, messageId = "<$uid@x>", threadKey = "t$uid",
                fromName = name, fromAddr = addr, toAddrs = "Robert <robert@beispiel.de>", ccAddrs = "", replyTo = "", subject = subj, date = now - ago,
                snippet = RichText.fromHtml(html, Color.Black).text.take(140).replace('\n', ' '), bodyHtml = html, bodyText = null, seen = seen, flagged = false,
                category = Category.PEOPLE, hasAttachments = att, unsubscribe = null, inReplyTo = null, references = null),
                if (att) listOf(app.mailwerk.data.Attachment(messageId = 0, partPath = "1", name = "Angebot_2026.pdf", mime = "application/pdf", size = 482_113)) else emptyList())
        }
        add("Anna Schmidt", "anna@schmidt.de", "Angebot für die Stickerei", "<p>Hallo Robert,</p><p>anbei wie besprochen unser <b>Angebot</b> für die 200 Poloshirts. Kannst du bis <b>Freitag</b> Bescheid geben?</p><p>Viele Grüße<br>Anna</p><p><a href='https://schmidt.example/angebot'>Angebot online ansehen</a></p>", 25 * 60_000, false, true)
        add("Markus Weber", "m.weber@firma.de", "Termin nächste Woche", "<p>Passt dir Dienstag um 10 Uhr? Sonst ginge auch Mittwochnachmittag.</p>", 3 * 3_600_000, false)
        add("Lisa Braun", "lisa@braun-design.de", "Logo-Datei in Vektor", "<p>Hier ist das Logo als SVG und PDF.</p>", 26 * 3_600_000, true, true)
        add("Steuerbüro Klein", "info@steuer-klein.de", "Unterlagen für Q3", "<p>Bitte senden Sie uns bis zum 15. die Belege.</p>", 50 * 3_600_000, true)
        val st = AppState(Repo(store).apply { passwordOf = { error("offline") } })
        st.selected = store.list(null, Category.PEOPLE, "").first()
        setContent { MailwerkTheme(false) { App(st) } }
        waitForIdle(); Thread.sleep(500); st.repo.errors.value = emptyMap(); waitForIdle()
        val img = onRoot().captureToImage().toAwtImage()
        File("build/screenshots").mkdirs(); ImageIO.write(img, "png", File("build/screenshots/desktop_hell.png"))
    }
}
