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

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xhdpi")
class ScreenshotTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    @get:Rule val rule = createEmptyComposeRule()

    companion object {
        fun seed() {
            val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
            app.mailwerk.data.Prefs(ctx).presetCache = "Max Muster|max@beispiel-domain.de"
            app.mailwerk.data.PresetAccounts.load(ctx)
            val db = Db.get(ctx)
            if (db.accounts().any { it.email == "robert@beispiel.de" } && db.accounts().size == 1) return
            db.accounts().forEach { db.deleteAccount(it.id) }
            val a = db.saveAccount(Account(0, "Robert", "robert@beispiel.de", "imap.beispiel.de", 993, Security.SSL, "smtp.beispiel.de", 465, Security.SSL, "x", "x", color = 0xFF1E88E5.toInt()))
            val inbox = db.upsertFolder(a, "INBOX", "Posteingang", FolderRole.INBOX)
            val sent = db.upsertFolder(a, "Gesendet", "Gesendet", FolderRole.SENT)
            db.upsertFolder(a, "Archiv", "Archiv", FolderRole.ARCHIVE); db.upsertFolder(a, "Papierkorb", "Papierkorb", FolderRole.TRASH)
            val now = System.currentTimeMillis(); var uid = 1L
            fun m(folder: Long, name: String, addr: String, subj: String, text: String, ago: Long, cat: Category, seen: Boolean = false,
                  html: String? = null, att: Boolean = false, pinned: Boolean = false, unsub: String? = null) {
                val id = db.insertMessage(Message(accountId = a, folderId = folder, uid = uid++, messageId = "<$uid@x>", threadKey = Threads.key(a, subj, "$uid"),
                    fromName = name, fromAddr = addr, toAddrs = "Robert <robert@beispiel.de>", ccAddrs = "", replyTo = "", subject = subj, date = now - ago,
                    snippet = text.take(150), bodyHtml = html, bodyText = text, seen = seen, flagged = false, pinned = pinned, category = cat,
                    hasAttachments = att, unsubscribe = unsub, inReplyTo = null, references = null),
                    if (att) listOf(Attachment(messageId = 0, partPath = "1", name = "Angebot_2026.pdf", mime = "application/pdf", size = 482_113)) else emptyList())
                if (pinned) db.updateFlags(id, pinned = true)
            }
            m(inbox, "Anna Schmidt", "anna@schmidt.de", "Angebot für die Stickerei", "Hallo Robert, anbei wie besprochen unser Angebot für die 200 Poloshirts. Kannst du bis Freitag Bescheid geben?", 25 * 60_000, Category.PEOPLE, att = true, pinned = true)
            m(sent, "Robert", "robert@beispiel.de", "Re: Angebot für die Stickerei", "Danke Anna, ich schaue es mir heute Abend an.", 10 * 60_000, Category.PEOPLE, seen = true)
            m(inbox, "Markus Weber", "m.weber@firma.de", "Termin nächste Woche", "Passt dir Dienstag um 10 Uhr? Sonst ginge auch Mittwochnachmittag.", 3 * 3_600_000, Category.PEOPLE)
            m(inbox, "Lisa Braun", "lisa@braun-design.de", "Logo-Datei in Vektor", "Hier ist das Logo als SVG und PDF. Sag Bescheid, wenn du noch etwas brauchst!", 26 * 3_600_000, Category.PEOPLE, seen = true, att = true)
            m(inbox, "Steuerbüro Klein", "info@steuer-klein.de", "Unterlagen für Q3", "Bitte senden Sie uns bis zum 15. die Belege für das dritte Quartal.", 50 * 3_600_000, Category.PEOPLE, seen = true)
            m(inbox, "Zalando", "news@zalando.de", "Bis zu 50 % auf Winterjacken", "Nur dieses Wochenende: Sale auf ausgewählte Marken.", 5 * 3_600_000, Category.NEWSLETTER,
                html = "<h2>Winter-Sale</h2><p>Bis zu <b>50 %</b> auf Jacken.</p><img src='https://img.zalando.de/a.jpg'><img src='https://t.zalando.de/track/open?x' width=1 height=1>",
                unsub = "https://zalando.de/unsub")
            m(inbox, "heise online", "newsletter@heise.de", "heise-Newsletter: KI, Chips und Datenschutz", "Die wichtigsten Meldungen des Tages im Überblick.", 30 * 3_600_000, Category.NEWSLETTER, seen = true, unsub = "https://heise.de/u")
            m(inbox, "DHL Paket", "noreply@dhl.de", "Ihr Paket kommt heute", "Ihre Sendung 00340434 wird heute zwischen 13:00 und 15:00 zugestellt.", 2 * 3_600_000, Category.NOTIFICATION)
            m(inbox, "GitHub", "noreply@github.com", "[denuklios/test] Neuer Pull Request", "Ein neuer Pull Request wurde erstellt.", 8 * 3_600_000, Category.NOTIFICATION, seen = true)
            db.notifyChanged()
        }
    }

    private fun shot(name: String) {
        rule.waitForIdle(); Thread.sleep(300); rule.waitForIdle()
        rule.onRoot().captureRoboImage("build/screenshots/$name.png")
    }

    @Test fun screens() {
        seed()
        val sc = ActivityScenario.launch(MainActivity::class.java)
        rule.waitForIdle()
        shot("1_posteingang_wichtig")
        rule.onAllNodes(androidx.compose.ui.test.hasContentDescription("Kategorie wählen"), useUnmergedTree = true).onFirst().performClick()
        shot("16_kategorie_dropdown")
        rule.onAllNodesWithText("Alle", substring = false, useUnmergedTree = true).onLast().performClick()
        rule.waitForIdle()
        rule.onAllNodes(androidx.compose.ui.test.hasScrollAction()).onFirst().performScrollToIndex(10)
        rule.waitForIdle()
        shot("17_eingeklappt")
        rule.onAllNodes(androidx.compose.ui.test.hasContentDescription("In allen Mails suchen"), useUnmergedTree = true).onFirst().performClick()
        rule.waitForIdle()
        shot("18_suche_offen")
        rule.onAllNodes(androidx.compose.ui.test.hasContentDescription("Suche leeren"), useUnmergedTree = true).onFirst().performClick()
        rule.waitForIdle()
        rule.onAllNodes(androidx.compose.ui.test.hasScrollAction()).onFirst().performScrollToIndex(0)
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].category.value = app.mailwerk.data.Category.PEOPLE }
        rule.waitForIdle()
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].category.value = app.mailwerk.data.Category.NEWSLETTER }
        rule.waitForIdle()
        shot("2_newsletter")
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].category.value = app.mailwerk.data.Category.NOTIFICATION }
        rule.waitForIdle()
        shot("3_benachrichtigungen")
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].category.value = app.mailwerk.data.Category.PEOPLE }
        rule.waitForIdle()
        rule.onAllNodesWithText("Angebot für die Stickerei", substring = true, useUnmergedTree = true).onFirst().performClick()
        shot("4_unterhaltung")
        rule.onAllNodesWithText("Antworten", useUnmergedTree = true).onFirst().performClick()
        shot("5_antworten")
        sc.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        rule.waitForIdle()
        sc.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        sc.onActivity { a ->
            androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].update.value =
                app.mailwerk.sync.Updater.Info(99, "1.4", "Neue Funktionen und Verbesserungen", "")
        }
        shot("10_hinweise")
        sc.onActivity { a ->
            val vm = androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java]
            vm.db.saveRule(app.mailwerk.mail.Rule(name = "Rechnungen", field = app.mailwerk.mail.RuleField.SUBJECT, value = "Rechnung",
                action = app.mailwerk.mail.RuleAction.MOVE, arg = "Buchhaltung"))
            vm.db.saveRule(app.mailwerk.mail.Rule(name = "Alles weiterleiten", field = app.mailwerk.mail.RuleField.ALL,
                action = app.mailwerk.mail.RuleAction.FORWARD, arg = "buero@beispiel.de", enabled = false))
            vm.push(app.mailwerk.ui.Screen.Rules())
        }
        shot("11_regeln")
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].replaceTop(app.mailwerk.ui.Screen.Vacation) }
        shot("12_abwesenheit")
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].pop() }
        sc.onActivity { a -> androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java].update.value = null }
        rule.onAllNodesWithText("Schreiben", useUnmergedTree = true).onFirst().performClick()
        shot("6_neue_mail")
        sc.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        sc.onActivity { a ->
            val vm = androidx.lifecycle.ViewModelProvider(a)[app.mailwerk.ui.MainViewModel::class.java]
            val acc = vm.db.accounts().first()
            vm.db.upsertFolder(acc.id, "INBOX/Kunden", "Kunden", null); vm.db.notifyChanged()
        }
        rule.onAllNodes(androidx.compose.ui.test.hasContentDescription("Menü")).onFirst().performClick()
        shot("15_menue_ordner")
    }

    @Test @Config(qualifiers = "w393dp-h852dp-night-xhdpi")
    fun dark() {
        seed()
        ActivityScenario.launch(MainActivity::class.java)
        rule.waitForIdle()
        shot("8_dunkel_posteingang")
        rule.onAllNodesWithText("Angebot für die Stickerei", substring = true, useUnmergedTree = true).onFirst().performClick()
        shot("9_dunkel_unterhaltung")
    }
}
