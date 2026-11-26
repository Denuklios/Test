package app.mailwerk

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.mailwerk.data.Account
import app.mailwerk.data.Db
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Prefs
import app.mailwerk.data.Repository
import app.mailwerk.data.Security
import app.mailwerk.mail.MailClient
import app.mailwerk.ui.MainActivity
import com.github.takahirom.roborazzi.captureRoboImage
import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import jakarta.mail.Folder
import jakarta.mail.Session
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.util.Properties

/** Viele Mails auf einmal: Alle von einem Absender löschen, Rückgängig, Gelesen, Spam – und die Auswahl in der Oberfläche. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xhdpi")
class BulkTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    @get:Rule val rule = createEmptyComposeRule()
    private val gm = GreenMail(arrayOf(ServerSetup(3151, null, "imap"), ServerSetup(3033, null, "smtp"))).also { it.start() }
    @After fun stop() { gm.stop() }

    private fun deliver(from: String, name: String, subject: String) {
        val m = MimeMessage(Session.getInstance(Properties()))
        m.setFrom(InternetAddress(from, name)); m.setRecipients(jakarta.mail.Message.RecipientType.TO, "ich@test.de")
        m.subject = subject; m.setText("Text $subject"); m.saveChanges()
        gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser("ich@test.de")).store(m)
    }
    private fun serverCount(c: MailClient, name: String): Int = c.withStore { s ->
        val f = s.getFolder(name); if (!f.exists()) return@withStore 0
        f.open(Folder.READ_ONLY); val n = f.messages.count { !it.isSet(jakarta.mail.Flags.Flag.DELETED) }; f.close(false); n
    }

    @Test fun deleteAllFromSenderUndoReadSpamAndSelectionUi() = runBlocking {
        gm.setUser("ich@test.de", "ich@test.de", "pw")
        val app = ApplicationProvider.getApplicationContext<android.app.Application>()
        val db = Db.get(app); db.accounts().forEach { db.deleteAccount(it.id) }
        val repo = Repository.get(app); repo.passwordOf = { "pw" }
        Prefs(app).lastMailbox = "unified"
        val acc = Account(0, "Ich", "ich@test.de", "127.0.0.1", 3151, Security.NONE, "127.0.0.1", 3033, Security.NONE, "ich@test.de", "x")
        db.saveAccount(acc)
        val c = MailClient(acc, "pw")
        c.withStore { s -> listOf("Trash", "Spam").forEach { s.getFolder(it).create(Folder.HOLDS_MESSAGES) } }
        repo.sync()
        repeat(5) { deliver("news@shop.example", "Shop", "Angebot ${it + 1}") }
        deliver("anna@example.org", "Anna", "Hallo"); deliver("bob@example.org", "Bob", "Frage")
        assertTrue(repo.sync().isEmpty())
        db.folders(db.accounts().single().id).firstOrNull { it.fullName == "Trash" }?.let { db.upsertFolder(it.accountId, it.fullName, it.displayName, FolderRole.TRASH) }

        // Alle von einem Absender löschen: 5 in den Papierkorb (auch auf dem Server), andere bleiben
        val fromShop = repo.messagesFrom("news@shop.example")
        assertEquals(5, fromShop.size)
        val (moved, err) = repo.bulkDelete(fromShop)
        assertEquals(null, err); assertEquals(5, moved.size)
        assertEquals(2, serverCount(c, "INBOX")); assertEquals(5, serverCount(c, "Trash"))
        assertEquals(0, repo.messagesFrom("news@shop.example").size)

        // Rückgängig: alle wieder im Posteingang
        assertEquals(null, repo.bulkMoveBack(moved))
        assertEquals(7, serverCount(c, "INBOX")); assertEquals(0, serverCount(c, "Trash"))

        // Gelesen für mehrere (auf dem Server)
        val two = db.listMessages(null, null, null).filter { it.fromAddr.endsWith("example.org") }
        repo.bulkSeen(two, true)
        assertTrue(db.listMessages(null, null, null).filter { it.fromAddr.endsWith("example.org") }.all { it.seen })

        // Spam für mehrere: Absender gesperrt, Mails im Spam-Ordner
        repo.bulkSpam(repo.messagesFrom("news@shop.example").take(2))
        assertEquals(2, serverCount(c, "Spam"))
        assertTrue(db.blocklist().any { "shop.example" in it.pattern || "news@shop.example" == it.pattern })

        // Oberfläche: lang drücken -> Auswahl, Antippen -> weitere, „Alle auswählen“, Löschen
        val sc = ActivityScenario.launch(MainActivity::class.java)
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Hallo", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onAllNodesWithText("Hallo", useUnmergedTree = true).onFirst().performTouchInput { longClick() }
        rule.waitUntil(5_000) { rule.onAllNodesWithText("1 ausgewählt", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onAllNodesWithText("Frage", useUnmergedTree = true).onFirst().performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("2 ausgewählt", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onRoot().captureRoboImage("build/screenshots/24_auswahl.png")
        // Alle sichtbaren sind gewählt -> Knopf hebt die Auswahl auf; neu wählen -> „Alle auswählen“ wählt alle
        rule.onAllNodes(hasContentDescription("Auswahl aufheben"), useUnmergedTree = true).onFirst().performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("ausgewählt", substring = true, useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
        rule.onAllNodesWithText("Hallo", useUnmergedTree = true).onFirst().performTouchInput { longClick() }
        rule.waitUntil(5_000) { rule.onAllNodesWithText("1 ausgewählt", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onAllNodes(hasContentDescription("Alle auswählen"), useUnmergedTree = true).onFirst().performClick()
        rule.waitUntil(5_000) { rule.onAllNodesWithText("2 ausgewählt", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        // Löschen aus der Leiste: beide in den Papierkorb, Auswahl beendet
        rule.onAllNodes(hasContentDescription("Löschen"), useUnmergedTree = true).onFirst().performClick()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("ausgewählt", substring = true, useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
        rule.waitUntil(10_000) { serverCount(c, "Trash") == 2 }
        sc.close()
    }
}
