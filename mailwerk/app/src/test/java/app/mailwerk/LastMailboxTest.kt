package app.mailwerk

import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.mailwerk.data.Account
import app.mailwerk.data.Db
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Prefs
import app.mailwerk.data.Security
import app.mailwerk.ui.MainActivity
import app.mailwerk.ui.MainViewModel
import app.mailwerk.ui.Mailbox
import com.github.takahirom.roborazzi.captureRoboImage
import androidx.compose.ui.test.onRoot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Gewähltes Postfach bleibt nach dem Schließen erhalten; Begrüßung passt zum Postfach. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xhdpi")
class LastMailboxTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    @get:Rule val rule = createEmptyComposeRule()

    @Test fun remembersLastMailboxAndGreetsAccount() {
        val app = ApplicationProvider.getApplicationContext<android.app.Application>()
        val db = Db.get(app); db.accounts().forEach { db.deleteAccount(it.id) }
        val privat = db.saveAccount(Account(0, "Robert", "robert@beispiel.de", "h", 993, Security.SSL, "h", 465, Security.SSL, "x", "x"))
        val firma = db.saveAccount(Account(0, "Wunsch-Fabrik", "hallo@firma.example", "h", 993, Security.SSL, "h", 465, Security.SSL, "x", "x"))
        db.upsertFolder(privat, "INBOX", "Posteingang", FolderRole.INBOX)
        val firmaInbox = db.upsertFolder(firma, "INBOX", "Posteingang", FolderRole.INBOX)
        Prefs(app).lastMailbox = "unified"

        // App 1: nur Wunsch-Fabrik auswählen
        val vm1 = MainViewModel(app)
        assertTrue(vm1.mailbox.value is Mailbox.Unified)
        vm1.selectMailbox(Mailbox.InFolder(db.folder(firmaInbox)!!, "hallo@firma.example"))

        // App neu geöffnet: wieder Wunsch-Fabrik
        val vm2 = MainViewModel(app)
        assertEquals(firmaInbox, (vm2.mailbox.value as Mailbox.InFolder).folder.id)

        // Oberfläche: Begrüßung mit dem Namen des gewählten Postfachs
        val sc = ActivityScenario.launch(MainActivity::class.java)
        rule.waitForIdle()
        rule.waitUntil(10_000) { rule.onAllNodesWithText("Wunsch-Fabrik", substring = true, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        rule.onRoot().captureRoboImage("build/screenshots/23_postfach_gemerkt.png")
        sc.close()

        // Ordner gelöscht -> sauber zurück auf „Alle Posteingänge“
        db.deleteAccount(firma)
        assertTrue(MainViewModel(app).mailbox.value is Mailbox.Unified)
        Prefs(app).lastMailbox = "unified"
    }
}
