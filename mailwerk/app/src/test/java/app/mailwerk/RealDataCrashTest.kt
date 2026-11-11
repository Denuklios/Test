package app.mailwerk

import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import app.mailwerk.data.Account
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

/** Stellt typische „echte“ Postfach-Inhalte nach, die im Alltag zum Absturz führen können. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w393dp-h852dp-xhdpi")
class RealDataCrashTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    @get:Rule val rule = createEmptyComposeRule()

    @Test fun hugeMailsAndFutureDatesDoNotCrash() {
        val db = Db.get(ApplicationProvider.getApplicationContext())
        db.accounts().forEach { db.deleteAccount(it.id) }
        val a = db.saveAccount(Account(0, "Test", "t@x.de", "imap.x.de", 993, Security.SSL, "smtp.x.de", 465, Security.SSL, "t", "x"))
        val inbox = db.upsertFolder(a, "INBOX", "Posteingang", FolderRole.INBOX)
        val now = System.currentTimeMillis()
        val huge = "<p>Newsletter</p><img src=\"data:image/png;base64," + "A".repeat(3_500_000) + "\">"
        val dates = listOf(now + 3 * 86_400_000L, now - 60_000, now + 400 * 86_400_000L, now - 2 * 86_400_000L, now - 40 * 86_400_000L, now + 3_600_000)
        dates.forEachIndexed { i, d ->
            db.insertMessage(Message(accountId = a, folderId = inbox, uid = i + 1L, messageId = "<$i@x>", threadKey = Threads.key(a, "Betreff $i", "$i"),
                fromName = "Absender $i", fromAddr = "a$i@x.de", toAddrs = "t@x.de", ccAddrs = "", replyTo = "", subject = "Betreff $i", date = d,
                snippet = "kurz", bodyHtml = if (i % 2 == 0) huge else null, bodyText = "T".repeat(if (i == 1) 2_500_000 else 10), seen = false, flagged = false,
                category = Category.PEOPLE, hasAttachments = false, unsubscribe = null, inReplyTo = null, references = null), emptyList())
        }
        db.notifyChanged()
        // Listen-Abfragen dürfen keine riesigen Inhalte laden
        db.listMessages(null, null, null); db.search("Betreff"); db.dueSnoozed(now)
        db.thread(Threads.key(a, "Betreff 0", "0"))
        // Alte Version hat riesige Zeilen schon gespeichert -> nach dem Update müssen sie repariert werden
        val id0 = db.listMessages(null, null, "Betreff 0").first().id
        db.writableDatabase.execSQL("UPDATE messages SET body_html=? WHERE id=?", arrayOf<Any>("X".repeat(3_000_000), id0))
        val crashed = runCatching { db.thread(Threads.key(a, "Betreff 0", "0")) }.isFailure
        org.junit.Assert.assertTrue("Testaufbau: alte riesige Zeile sollte nicht lesbar sein", crashed)
        db.onUpgrade(db.writableDatabase, 1, 2)
        org.junit.Assert.assertEquals(1, db.thread(Threads.key(a, "Betreff 0", "0")).size)
        // Oberfläche: Posteingang mit Zukunfts-Datum rendern und eine riesige Mail öffnen
        ActivityScenario.launch(MainActivity::class.java)
        rule.waitForIdle()
        Thread.sleep(500); rule.waitForIdle()
        // Update auf DB 6: leere Ordner werden zum Neuladen zurückgesetzt, Ordner mit Mails nicht
        val empty = db.upsertFolder(a, "Leer", "Leer", null)
        db.setFolderSyncState(empty, 999, 1); db.setFolderSyncState(inbox, 999, 1)
        db.onUpgrade(db.writableDatabase, 5, 6)
        org.junit.Assert.assertEquals(0L, db.folder(empty)!!.lastUid)
        org.junit.Assert.assertEquals(999L, db.folder(inbox)!!.lastUid)
        db.deleteAccount(a)
    }
}
