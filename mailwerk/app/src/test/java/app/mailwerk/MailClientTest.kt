package app.mailwerk

import app.mailwerk.data.Account
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Security
import app.mailwerk.mail.MailClient
import app.mailwerk.mail.OutgoingAttachment
import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import jakarta.mail.Flags
import jakarta.mail.Session
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeBodyPart
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Properties

/** Echter IMAP/SMTP-Durchlauf gegen einen lokalen GreenMail-Server. */
class MailClientTest {
    private lateinit var gm: GreenMail
    private lateinit var acc: Account

    @Before fun setUp() {
        gm = GreenMail(arrayOf(ServerSetup(3143, null, "imap"), ServerSetup(3025, null, "smtp")))
        gm.start()
        gm.setUser("ich@test.de", "ich@test.de", "geheim")
        gm.setUser("anna@test.de", "anna@test.de", "pw")
        acc = Account(1, "Ich", "ich@test.de", "127.0.0.1", 3143, Security.NONE, "127.0.0.1", 3025, Security.NONE, "ich@test.de", "")
    }

    @After fun tearDown() { gm.stop() }

    private fun deliver(from: String, subject: String, html: String?, text: String, headers: Map<String, String> = emptyMap(), attach: Boolean = false) {
        val s = Session.getInstance(Properties())
        val m = MimeMessage(s)
        m.setFrom(InternetAddress(from, "Anna Müller", "UTF-8")); m.setRecipients(jakarta.mail.Message.RecipientType.TO, "ich@test.de")
        m.setSubject(subject, "UTF-8"); headers.forEach { (k, v) -> m.setHeader(k, v) }
        val alt = MimeMultipart("alternative")
        alt.addBodyPart(MimeBodyPart().apply { setText(text, "UTF-8") })
        if (html != null) alt.addBodyPart(MimeBodyPart().apply { setContent(html, "text/html; charset=UTF-8") })
        if (attach) {
            val mixed = MimeMultipart("mixed")
            mixed.addBodyPart(MimeBodyPart().apply { setContent(alt) })
            mixed.addBodyPart(MimeBodyPart().apply { setContent("Hallo PDF", "application/pdf"); fileName = "Rechnung.pdf"; disposition = "attachment" })
            m.setContent(mixed)
        } else m.setContent(alt)
        m.saveChanges()
        gm.getManagers().imapHostManager.getInbox(gm.getManagers().userManager.getUser("ich@test.de")).store(m)
    }

    @Test fun loginFoldersSyncParseFlagsMoveSend() {
        val c = MailClient(acc, "geheim")
        c.test()

        deliver("anna@test.de", "Grüße aus Köln", "<p>Hallo <b>du</b></p><img src=\"https://t.x.de/track/open\" width=1 height=1>", "Hallo du")
        deliver("news@shop.de", "Angebote", "<p>Rabatt</p>", "Rabatt", mapOf("List-Unsubscribe" to "<https://shop.de/u>", "List-Unsubscribe-Post" to "List-Unsubscribe=One-Click"))
        deliver("anna@test.de", "Re: Grüße aus Köln", null, "Antwort\n> alt", attach = true)

        c.withStore { store ->
            store.getFolder("Archiv").create(jakarta.mail.Folder.HOLDS_MESSAGES)
            store.getFolder("Gesendet").create(jakarta.mail.Folder.HOLDS_MESSAGES)
        }
        val folders = c.withStore { c.listFolders(it) }
        assertEquals(FolderRole.INBOX, folders.first { it.fullName == "INBOX" }.role)
        assertEquals(FolderRole.ARCHIVE, folders.first { it.fullName == "Archiv" }.role)
        assertEquals(FolderRole.SENT, folders.first { it.fullName == "Gesendet" }.role)

        val sync = c.withStore { c.syncFolder(it, "INBOX", 0, 0) }
        assertEquals(3, sync.newMessages.size)
        val first = sync.newMessages.first { it.subject == "Grüße aus Köln" }
        assertEquals("Anna Müller", first.fromName); assertEquals("anna@test.de", first.fromAddr)
        assertTrue(first.html!!.contains("<b>du</b>")); assertEquals("Hallo du", first.text!!.trim())
        val news = sync.newMessages.first { it.subject == "Angebote" }
        assertEquals("<https://shop.de/u>", news.headers["list-unsubscribe"])
        val withAtt = sync.newMessages.first { it.subject.startsWith("Re:") }
        assertEquals(1, withAtt.attachments.size); assertEquals("Rechnung.pdf", withAtt.attachments[0].name)

        // Anhang herunterladen
        var bytes = ByteArray(0)
        c.downloadPart("INBOX", withAtt.uid, withAtt.attachments[0].path) { bytes = it.readBytes() }
        assertEquals("Hallo PDF", String(bytes))

        // Inkrementell: nichts Neues
        val again = c.withStore { c.syncFolder(it, "INBOX", sync.newMessages.maxOf { m -> m.uid }, sync.uidValidity) }
        assertEquals(0, again.newMessages.size)

        // Flags
        c.setFlag("INBOX", first.uid, Flags.Flag.SEEN, true)
        val flags = c.withStore { c.syncFolder(it, "INBOX", 999, sync.uidValidity) }.flags
        assertTrue(flags[first.uid]!!.first)

        // Verschieben ins Archiv
        c.move("INBOX", news.uid, "Archiv")
        val after = c.withStore { c.syncFolder(it, "INBOX", 999, sync.uidValidity) }
        assertEquals(2, after.flags.size)
        assertEquals(1, c.withStore { c.syncFolder(it, "Archiv", 0, 0) }.newMessages.size)

        // Senden mit Anhang + Ablage in Gesendet
        val msg = c.buildMessage("Anna <anna@test.de>", "", "", "Test ä", "Hallo Anna\nZeile 2",
            listOf(OutgoingAttachment("notiz.txt", "text/plain", "Inhalt".toByteArray())), first.messageId, null)
        c.send(msg, "Gesendet")
        assertTrue(gm.waitForIncomingEmail(5000, 1))
        val received = gm.receivedMessages.last()
        assertEquals("Test ä", received.subject)
        assertEquals(first.messageId, received.getHeader("In-Reply-To")[0])
        val sent = c.withStore { c.syncFolder(it, "Gesendet", 0, 0) }
        assertEquals(1, sent.newMessages.size); assertEquals("notiz.txt", sent.newMessages[0].attachments[0].name)
    }

    @Test fun wrongPasswordGivesFriendlyError() {
        val e = runCatching { MailClient(acc, "falsch").test() }.exceptionOrNull()
        assertTrue(e!!.message!!.contains("Anmeldung fehlgeschlagen"))
    }
}
