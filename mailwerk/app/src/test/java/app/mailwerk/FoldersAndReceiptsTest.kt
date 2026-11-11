package app.mailwerk

import androidx.test.core.app.ApplicationProvider
import app.mailwerk.data.Account
import app.mailwerk.data.Db
import app.mailwerk.data.FolderRole
import app.mailwerk.data.OutboxItem
import app.mailwerk.data.OutboxStatus
import app.mailwerk.data.Repository
import app.mailwerk.data.Security
import app.mailwerk.mail.MailClient
import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import jakarta.mail.Folder
import jakarta.mail.Session
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Properties

@RunWith(RobolectricTestRunner::class)
class FoldersAndReceiptsTest {
    @Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    private val gm = GreenMail(arrayOf(ServerSetup(3145, null, "imap"), ServerSetup(3028, null, "smtp"))).also { it.start() }
    @After fun stop() { gm.stop() }

    private fun deliver(to: String, from: String, subject: String, headers: Map<String, String> = emptyMap()) {
        val m = MimeMessage(Session.getInstance(Properties()))
        m.setFrom(InternetAddress(from)); m.setRecipients(jakarta.mail.Message.RecipientType.TO, to)
        m.subject = subject; m.setText("Hallo"); headers.forEach { (k, v) -> m.setHeader(k, v) }; m.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser(to)).store(m)
    }

    @Test fun foldersAndReadReceipts() = runBlocking {
        gm.setUser("ich@test.de", "ich@test.de", "pw"); gm.setUser("anna@test.de", "anna@test.de", "pw")
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Db.get(ctx); db.accounts().forEach { db.deleteAccount(it.id) }
        val repo = Repository.get(ctx); repo.passwordOf = { "pw" }
        val acc = Account(0, "Ich", "ich@test.de", "127.0.0.1", 3145, Security.NONE, "127.0.0.1", 3028, Security.NONE, "ich@test.de", "x")
        val id = db.saveAccount(acc)
        val c = MailClient(acc, "pw")
        c.withStore { s -> s.getFolder("Gesendet").create(Folder.HOLDS_MESSAGES) }
        deliver("ich@test.de", "alt@test.de", "Start")
        repo.sync()

        // ---- Ordner
        assertNull(repo.createFolder(id, "Kunden", insideInbox = true))
        assertNull(repo.createFolder(id, "Projekte", insideInbox = false))
        val names = c.withStore { s -> s.defaultFolder.list("*").map { it.fullName } }
        assertTrue(names.toString(), names.any { it.startsWith("INBOX") && it.endsWith("Kunden") && it != "INBOX" })
        assertTrue(names.contains("Projekte"))
        assertTrue(repo.createFolder(id, "Projekte", insideInbox = false)!!.contains("gibt es schon"))
        val projekte = db.folders(id).first { it.displayName == "Projekte" }
        assertNull(repo.renameFolder(projekte, "Archiv 2026"))
        assertTrue(c.withStore { s -> s.getFolder("Archiv 2026").exists() && !s.getFolder("Projekte").exists() })
        assertNull(repo.deleteFolder(db.folders(id).first { it.displayName == "Archiv 2026" }))
        assertTrue(c.withStore { s -> !s.getFolder("Archiv 2026").exists() })
        assertTrue(db.folders(id).none { it.displayName == "Archiv 2026" })

        // ---- Lesebestätigung anfordern -> Empfänger bestätigt -> gesendete Mail „gelesen“
        val oid = db.saveOutbox(OutboxItem(accountId = id, to = "anna@test.de", cc = "", bcc = "", subject = "Angebot", body = "Hallo Anna",
            attachments = "", inReplyTo = null, references = null, sendAt = 0, status = OutboxStatus.SCHEDULED, readReceipt = true))
        assertNull(repo.sendNow(oid))
        val toAnna = gm.receivedMessages.first { it.allRecipients.any { r -> r.toString() == "anna@test.de" } }
        assertEquals("Ich <ich@test.de>", toAnna.getHeader("Disposition-Notification-To")[0])
        // Anna (ebenfalls Mailwerk) sendet die Bestätigung zurück
        MailClient(Account(0, "Anna", "anna@test.de", "127.0.0.1", 3145, Security.NONE, "127.0.0.1", 3028, Security.NONE, "anna@test.de", ""), "pw")
            .sendReadReceipt("ich@test.de", "Angebot", toAnna.messageID, null)
        repo.sync()
        val sent = db.listMessages(db.folders(id).filter { it.role == FolderRole.SENT }.map { it.id }, null, null)
        assertTrue(sent.toString(), sent.first { it.subject == "Angebot" }.readAt > 0)

        // ---- Jemand bittet MICH um eine Lesebestätigung
        deliver("ich@test.de", "kunde@test.de", "Bitte bestätigen", mapOf("Disposition-Notification-To" to "kunde@test.de"))
        repo.sync()
        val bitte = db.listMessages(null, null, "Bitte bestätigen").first()
        assertEquals("kunde@test.de", bitte.receiptTo)
        assertNull(repo.sendReadReceipt(bitte))
        assertEquals("", db.listMessages(null, null, "Bitte bestätigen").first().receiptTo)
        assertTrue(gm.receivedMessages.any { it.subject == "Gelesen: Bitte bestätigen" && it.allRecipients.first().toString() == "kunde@test.de" })
        db.deleteAccount(id)
    }
}
