package app.mailwerk

import androidx.test.core.app.ApplicationProvider
import app.mailwerk.data.Account
import app.mailwerk.data.Category
import app.mailwerk.data.Db
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Prefs
import app.mailwerk.data.Repository
import app.mailwerk.data.Security
import app.mailwerk.mail.MailClient
import app.mailwerk.mail.Rule
import app.mailwerk.mail.RuleAction
import app.mailwerk.mail.RuleField
import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import jakarta.mail.Folder
import jakarta.mail.Session
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import jakarta.mail.internet.MimeMultipart
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Properties

/** Ende-zu-Ende: Regeln, Sperrliste, Weiterleitung und Abwesenheitsnotiz gegen einen echten IMAP/SMTP-Server. */
@RunWith(RobolectricTestRunner::class)
class RulesIntegrationTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    private val gm = GreenMail(arrayOf(ServerSetup(3144, null, "imap"), ServerSetup(3026, null, "smtp"))).also { it.start() }
    @After fun stop() { gm.stop() }

    private fun deliver(from: String, subject: String, text: String, headers: Map<String, String> = emptyMap()) {
        val m = MimeMessage(Session.getInstance(Properties()))
        m.setFrom(InternetAddress(from)); m.setRecipients(jakarta.mail.Message.RecipientType.TO, "ich@test.de")
        m.subject = subject; m.setText(text); headers.forEach { (k, v) -> m.setHeader(k, v) }; m.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser("ich@test.de")).store(m)
    }

    private fun serverFolder(c: MailClient, name: String): List<String> = c.withStore { s ->
        val f = s.getFolder(name); if (!f.exists()) return@withStore emptyList()
        f.open(Folder.READ_ONLY); val r = f.messages.map { it.subject }; f.close(false); r
    }

    @Test fun rulesBlocklistForwardAndVacation() = runBlocking {
        gm.setUser("ich@test.de", "ich@test.de", "pw")
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Db.get(ctx); db.accounts().forEach { db.deleteAccount(it.id) }
        db.rules().forEach { db.deleteRule(it.id) }; db.blocklist().forEach { db.unblock(it.pattern) }
        val repo = Repository.get(ctx); repo.passwordOf = { "pw" }
        val acc = Account(0, "Ich", "ich@test.de", "127.0.0.1", 3144, Security.NONE, "127.0.0.1", 3026, Security.NONE, "ich@test.de", "x")
        val accId = db.saveAccount(acc)
        val c = MailClient(acc, "pw")
        c.withStore { s -> listOf("Spam", "Gesendet").forEach { n -> s.getFolder(n).create(Folder.HOLDS_MESSAGES) } }

        // Erster Abgleich (Startzustand)
        deliver("alt@test.de", "Alte Mail", "schon da")
        assertTrue(repo.sync().isEmpty())

        db.saveRule(Rule(name = "Rechnungen", field = RuleField.SUBJECT, value = "Rechnung", action = RuleAction.MOVE, arg = "Buchhaltung"))
        db.saveRule(Rule(name = "Chef weiterleiten", field = RuleField.FROM, value = "chef@firma.de", action = RuleAction.FORWARD, arg = "assistent@test.de"))
        db.saveRule(Rule(name = "Chef anheften", field = RuleField.FROM, value = "chef@", action = RuleAction.PIN))
        db.saveRule(Rule(name = "Shop als Newsletter", field = RuleField.FROM, value = "@shop.de", action = RuleAction.CATEGORY, arg = Category.NEWSLETTER.name))
        db.block("werbung.de", domain = true)
        val prefs = Prefs(ctx); prefs.vacationOn = true; prefs.vacationFrom = 0; prefs.vacationUntil = 0
        prefs.vacationSubject = "Bin im Urlaub"; prefs.vacationText = "Zurück am Montag."; db.resetVacationReplied()

        deliver("buchhaltung@lieferant.de", "Ihre Rechnung 4711", "Betrag 99 €")
        deliver("gewinn@news.werbung.de", "Sie haben gewonnen!!!", "Klicken Sie hier")
        deliver("chef@firma.de", "Projekt X", "Bitte bis Freitag")
        deliver("kundin@privat.de", "Frage zum Angebot", "Hallo, eine Frage …")
        deliver("info@shop.de", "Wochenangebote", "Rabatt", mapOf("List-Unsubscribe" to "<https://shop.de/u>"))
        assertTrue(repo.sync().isEmpty())

        // Server: Rechnung im (neu angelegten) Ordner, Spam im Spam-Ordner, Posteingang sauber
        assertEquals(listOf("Ihre Rechnung 4711"), serverFolder(c, "Buchhaltung"))
        assertEquals(listOf("Sie haben gewonnen!!!"), serverFolder(c, "Spam"))
        val inbox = serverFolder(c, "INBOX")
        assertTrue(inbox.containsAll(listOf("Projekt X", "Frage zum Angebot", "Wochenangebote")))
        assertTrue("Rechnung" !in inbox.joinToString() && "gewonnen" !in inbox.joinToString())

        // Lokal: Chef angeheftet, Shop als Newsletter
        val local = db.listMessages(null, null, null)
        assertTrue(local.first { it.subject == "Projekt X" }.pinned)
        assertEquals(Category.NEWSLETTER, local.first { it.subject == "Wochenangebote" }.category)
        assertTrue(local.none { it.subject.contains("gewonnen") })

        // Weiterleitung mit Originalmail als Anhang; Abwesenheitsnotiz nur an die Kundin (nicht an Newsletter/Chef? Chef ist Person -> ja)
        assertTrue(gm.waitForIncomingEmail(5000, 3))
        val sent = gm.receivedMessages.distinctBy { it.messageID }.filter { it.from.first().toString().contains("ich@test.de") }
        val fwd = sent.first { it.allRecipients.any { r -> r.toString() == "assistent@test.de" } }
        assertEquals("WG: Projekt X", fwd.subject)
        assertTrue((fwd.content as MimeMultipart).let { mp -> (0 until mp.count).any { mp.getBodyPart(it).isMimeType("message/rfc822") } })
        val vac = sent.filter { it.subject.startsWith("Bin im Urlaub") }.map { it.allRecipients.first().toString() }.sorted()
        assertEquals(listOf("chef@firma.de", "kundin@privat.de"), vac)

        // Zweite Mail der Kundin -> keine zweite Abwesenheitsnotiz
        deliver("kundin@privat.de", "Noch eine Frage", "…")
        repo.sync()
        Thread.sleep(500)
        assertEquals(1, gm.receivedMessages.distinctBy { it.messageID }.count { it.subject.startsWith("Bin im Urlaub") && it.allRecipients.first().toString() == "kundin@privat.de" })

        // Spam-Knopf: Absender wird gesperrt, nächste Mail geht direkt in Spam
        val kundin = db.listMessages(null, null, "Noch eine Frage").first()
        repo.markSpam(kundin)
        deliver("kundin@privat.de", "Dritte Mail", "…")
        repo.sync()
        assertTrue(serverFolder(c, "Spam").containsAll(listOf("Noch eine Frage", "Dritte Mail")))
        // Kein Spam -> wieder frei
        val spamMsg = db.listMessages(db.folders(accId).filter { it.role == FolderRole.JUNK }.map { it.id }, null, null)
        prefs.vacationOn = false
        db.deleteAccount(accId); db.rules().forEach { db.deleteRule(it.id) }; db.blocklist().forEach { db.unblock(it.pattern) }
    }
}
