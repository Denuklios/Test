package app.mailwerk

import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import app.mailwerk.ui.MainActivity
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.util.Locale

/** Die App auf einem englischsprachigen Gerät. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "en-rUS-w393dp-h852dp-xhdpi")
class EnglishScreenshotTest {
    @get:Rule val rule = createEmptyComposeRule()
    @Before fun en() { Locale.setDefault(Locale.US) }

    private fun shot(name: String) { rule.waitForIdle(); Thread.sleep(300); rule.waitForIdle(); rule.onRoot().captureRoboImage("build/screenshots/$name.png") }

    private fun seedEnglish() {
        val ctx = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
        app.mailwerk.data.Prefs(ctx).presetCache = ""; app.mailwerk.data.PresetAccounts.load(ctx)
        val db = app.mailwerk.data.Db.get(ctx)
        db.accounts().forEach { db.deleteAccount(it.id) }
        val a = db.saveAccount(app.mailwerk.data.Account(0, "Alex Morgan", "alex@example.com", "imap.example.com", 993, app.mailwerk.data.Security.SSL,
            "smtp.example.com", 465, app.mailwerk.data.Security.SSL, "x", "x", color = 0xFF1E88E5.toInt()))
        val inbox = db.upsertFolder(a, "INBOX", "Inbox", app.mailwerk.data.FolderRole.INBOX)
        db.upsertFolder(a, "Sent", "Sent", app.mailwerk.data.FolderRole.SENT); db.upsertFolder(a, "Archive", "Archive", app.mailwerk.data.FolderRole.ARCHIVE)
        val now = System.currentTimeMillis(); var uid = 1L
        fun m(name: String, addr: String, subj: String, text: String, ago: Long, cat: app.mailwerk.data.Category, seen: Boolean = false,
              att: Boolean = false, pinned: Boolean = false, html: String? = null, unsub: String? = null) {
            val id = db.insertMessage(app.mailwerk.data.Message(accountId = a, folderId = inbox, uid = uid++, messageId = "<e$uid@x>",
                threadKey = app.mailwerk.mail.Threads.key(a, subj, "$uid"), fromName = name, fromAddr = addr, toAddrs = "Alex Morgan <alex@example.com>",
                ccAddrs = "", replyTo = "", subject = subj, date = now - ago, snippet = text, bodyHtml = html, bodyText = text, seen = seen, flagged = false,
                category = cat, hasAttachments = att, unsubscribe = unsub, inReplyTo = null, references = null),
                if (att) listOf(app.mailwerk.data.Attachment(messageId = 0, partPath = "1", name = "Quote_2026.pdf", mime = "application/pdf", size = 482_113)) else emptyList())
            if (pinned) db.updateFlags(id, pinned = true)
        }
        m("Sarah Johnson", "sarah@brightlabs.io", "Quote for the team shirts", "Hi Alex, attached is the quote for the 200 polo shirts we talked about. Could you let me know by Friday?",
            25 * 60_000, app.mailwerk.data.Category.PEOPLE, att = true, pinned = true)
        m("David Chen", "d.chen@northwind.com", "Meeting next week", "Does Tuesday at 10 work for you? Wednesday afternoon would be fine too.", 3 * 3_600_000, app.mailwerk.data.Category.PEOPLE)
        m("Emma Wilson", "emma@wilson-design.co", "Logo files (SVG + PDF)", "Here are the vector files of the new logo. Let me know if you need anything else!", 26 * 3_600_000,
            app.mailwerk.data.Category.PEOPLE, seen = true, att = true)
        m("Mom", "mom@family.net", "Sunday dinner? 🍝", "Are you coming over on Sunday? Dad is making lasagna.", 50 * 3_600_000, app.mailwerk.data.Category.PEOPLE, seen = true)
        m("Outdoor Store", "news@outdoorstore.com", "🎄 Up to 50% off winter jackets", "This weekend only: big savings on selected brands.", 5 * 3_600_000,
            app.mailwerk.data.Category.NEWSLETTER, unsub = "https://outdoorstore.com/u")
        m("Tech Weekly", "newsletter@techweekly.com", "AI, chips and privacy – this week's top stories", "The most important news of the week at a glance.", 30 * 3_600_000,
            app.mailwerk.data.Category.NEWSLETTER, seen = true)
        m("Parcel Service", "noreply@parcel.example", "Your package arrives today", "Your parcel will be delivered between 1 and 3 pm.", 2 * 3_600_000, app.mailwerk.data.Category.NOTIFICATION)
        db.notifyChanged()
    }

    @Test fun englishUi() {
        seedEnglish()
        val sc = ActivityScenario.launch(MainActivity::class.java)
        rule.waitForIdle(); Thread.sleep(800); rule.waitForIdle()
        // Testkonto hat keinen echten Server -> Fehlerhinweis für die Store-Bilder ausblenden
        val ctx = androidx.test.core.app.ApplicationProvider.getApplicationContext<android.content.Context>()
        app.mailwerk.data.Db.get(ctx).accounts().forEach { app.mailwerk.data.Prefs(ctx).setSyncStatus(it.id, true, null) }
        app.mailwerk.data.Db.get(ctx).notifyChanged()
        shot("en_1_inbox")
        assert(tr("Wichtig") == "Important" && tr("Mails von {0}", "x@y.de") == "Mail from x@y.de")
        rule.onAllNodesWithText("Newsletters", substring = true, useUnmergedTree = true).onFirst().performClick()
        shot("en_2_newsletters")
        rule.onAllNodesWithText("Important", substring = true, useUnmergedTree = true).onFirst().performClick()
        rule.onAllNodesWithText("Quote for the team shirts", substring = true, useUnmergedTree = true).onFirst().performClick()
        shot("en_3_thread")
        sc.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].push(app.mailwerk.ui.Screen.Settings) }
        shot("en_4_settings")
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].replaceTop(app.mailwerk.ui.Screen.AccountSetup()) }
        shot("en_5_setup")
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].replaceTop(app.mailwerk.ui.Screen.Rules()) }
        shot("en_6_rules")
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].replaceTop(app.mailwerk.ui.Screen.Vacation) }
        shot("en_7_vacation")
    }
}
