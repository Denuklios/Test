package app.mailwerk

import android.graphics.Bitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import com.github.takahirom.roborazzi.captureRoboImage
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.test.performScrollToIndex
import androidx.test.core.app.ApplicationProvider
import app.mailwerk.data.Account
import app.mailwerk.data.Attachment
import app.mailwerk.data.Category
import app.mailwerk.data.Db
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Message
import app.mailwerk.data.Security
import app.mailwerk.mail.Threads
import app.mailwerk.ui.MainActivity
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/** Bilder: Einladung in der Mail (eingetragen in Mamas Farbe) und Einstellungen → Familienkalender. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xhdpi")
class FamilyScreenshotTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    @get:Rule val rule = createEmptyComposeRule()

    private fun shot(name: String) {
        rule.waitForIdle(); Thread.sleep(300); rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screenshots/$name.png")
    }

    @Test fun familyCalendar() {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Db.get(ctx)
        db.accounts().forEach { db.deleteAccount(it.id) }
        val a = db.saveAccount(Account(0, "Sandra", "sandra@beispiel.de", "imap.beispiel.de", 993, Security.SSL, "smtp.beispiel.de", 465, Security.SSL, "x", "x", color = 0xFFE53935.toInt()))
        val inbox = db.upsertFolder(a, "INBOX", "Posteingang", FolderRole.INBOX)
        val fam = app.mailwerk.data.FamilyCalendar(ctx)
        fam.serverUrl = "https://example.org/kalender/api.php"; fam.code = "K7MZ4QPA"; fam.groupName = "Familie Muster"
        fam.members = listOf(app.mailwerk.data.FamilyMember("k", "Emil", 0xFF43A047.toInt()), app.mailwerk.data.FamilyMember("p", "Jonas", 0xFF1E88E5.toInt()),
            app.mailwerk.data.FamilyMember("s", "Sandra", 0xFFE53935.toInt()))
        fam.setMember(a, "s")
        val now = System.currentTimeMillis()
        val id = db.insertMessage(Message(accountId = a, folderId = inbox, uid = 1, messageId = "<inv@x>", threadKey = Threads.key(a, "Einladung: Elternabend Klasse 3b", "1"),
            fromName = "Grundschule am Park", fromAddr = "sekretariat@grundschule.example", toAddrs = "Sandra <sandra@beispiel.de>", ccAddrs = "", replyTo = "",
            subject = "Einladung: Elternabend Klasse 3b", date = now - 40 * 60_000, snippet = "Liebe Eltern, hiermit laden wir Sie herzlich ein …",
            bodyHtml = null, bodyText = "Liebe Eltern,\n\nhiermit laden wir Sie herzlich zum Elternabend der Klasse 3b ein. Themen: Klassenfahrt, Sporttag, Verschiedenes.\n\nViele Grüße\nIhre Grundschule am Park",
            seen = false, flagged = false, category = Category.PEOPLE, hasAttachments = true, unsubscribe = null, inReplyTo = null, references = null),
            listOf(Attachment(messageId = 0, partPath = "1", name = "Einladung.ics", mime = "text/calendar", size = 812)))
        db.saveInvite(id, a, "BEGIN:VCALENDAR\nMETHOD:REQUEST\nBEGIN:VEVENT\nUID:eltern3b\nDTSTART:20261124T193000\nDTEND:20261124T210000\n" +
            "SUMMARY:Elternabend Klasse 3b\nLOCATION:Aula\\, Grundschule am Park\nEND:VEVENT\nEND:VCALENDAR")
        db.setInviteStatus(id, app.mailwerk.data.FamilyCalendar.STATUS_ADDED, "mailx", "Sandra")
        db.notifyChanged()

        val sc = ActivityScenario.launch(MainActivity::class.java)
        rule.waitForIdle()
        val key = db.message(id)!!.threadKey
        sc.onActivity { act -> androidx.lifecycle.ViewModelProvider(act)[app.mailwerk.ui.MainViewModel::class.java].push(app.mailwerk.ui.Screen.Thread(key)) }
        shot("19_einladung_familienkalender")
        sc.onActivity { act -> androidx.lifecycle.ViewModelProvider(act)[app.mailwerk.ui.MainViewModel::class.java].push(app.mailwerk.ui.Screen.FamilyCalendar) }
        shot("20_familienkalender_einstellungen")
    }
}
