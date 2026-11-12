package app.mailwerk

import androidx.test.core.app.ApplicationProvider
import app.mailwerk.data.Account
import app.mailwerk.data.Db
import app.mailwerk.data.Repository
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
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.Properties

/** Leitet TCP weiter und verzögert jede Anfrage des Clients (simuliert Mobilfunk-Laufzeit). */
class LatencyProxy(private val targetPort: Int, private val delayMs: Long) {
    private val sock = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    val port get() = sock.localPort
    @Volatile var requests = 0
    init {
        Thread {
            while (!sock.isClosed) {
                val c = runCatching { sock.accept() }.getOrNull() ?: break
                val s = Socket("127.0.0.1", targetPort)
                fun pipe(a: Socket, b: Socket, delay: Boolean) = Thread {
                    runCatching {
                        val buf = ByteArray(65536); val i = a.getInputStream(); val o = b.getOutputStream()
                        while (true) { val n = i.read(buf); if (n < 0) break; if (delay) { requests++; Thread.sleep(delayMs) }; o.write(buf, 0, n); o.flush() }
                    }
                    runCatching { a.close() }; runCatching { b.close() }
                }.apply { isDaemon = true; start() }
                pipe(c, s, true); pipe(s, c, false)
            }
        }.apply { isDaemon = true }.start()
    }
    fun stop() = sock.close()
}

@RunWith(RobolectricTestRunner::class)
class SpeedTest {
    @org.junit.Before fun deLocale() { java.util.Locale.setDefault(java.util.Locale.GERMAN) }
    private val gm = GreenMail(arrayOf(ServerSetup(3146, null, "imap"), ServerSetup(3028, null, "smtp"))).also { it.start() }
    private val proxy = LatencyProxy(3146, 40)
    @After fun stop() { gm.stop(); proxy.stop() }

    @Test fun firstSyncOf80Mails() = runBlocking {
        gm.setUser("speed@test.de", "speed@test.de", "pw")
        val inbox = gm.managers.imapHostManager.getInbox(gm.managers.userManager.getUser("speed@test.de"))
        repeat(80) { i ->
            val m = MimeMessage(Session.getInstance(Properties()))
            m.setFrom(InternetAddress("absender$i@example.org", "Absender $i")); m.setRecipients(jakarta.mail.Message.RecipientType.TO, "speed@test.de")
            m.subject = "Newsletter Nummer $i"
            val alt = MimeMultipart("alternative",
                MimeBodyPart().apply { setText("Hallo, das ist Mail $i. ".repeat(40), "UTF-8") },
                MimeBodyPart().apply { setContent("<html><body><h1>Mail $i</h1>" + "<p>Absatz mit Text.</p>".repeat(80) + "</body></html>", "text/html; charset=UTF-8") })
            val mixed = MimeMultipart("mixed", MimeBodyPart().apply { setContent(alt) },
                MimeBodyPart().apply { dataHandler = DataHandler(ByteArrayDataSource(ByteArray(20_000) { it.toByte() }, "application/pdf")); fileName = "Rechnung$i.pdf" })
            m.setContent(mixed); m.sentDate = java.util.Date(); m.saveChanges(); inbox.store(m)
        }
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val db = Db.get(ctx); db.accounts().forEach { db.deleteAccount(it.id) }
        val repo = Repository.get(ctx); repo.passwordOf = { "pw" }; repo.family.disconnect()
        db.saveAccount(Account(0, "Speed", "speed@test.de", "127.0.0.1", proxy.port, Security.NONE, "127.0.0.1", 3028, Security.NONE, "speed@test.de", "x"))
        val t0 = System.currentTimeMillis()
        assertTrue(repo.sync().isEmpty())
        val ms = System.currentTimeMillis() - t0
        println("SPEED erster Abruf 80 Mails: $ms ms, ${proxy.requests} Anfragen")
        assertEquals(80, db.listMessages(null, null, null).size)
        // vorher: ~2.300 Anfragen / >3 Minuten; jetzt eine Handvoll gebündelter Abfragen
        assertTrue("zu viele Server-Anfragen: ${proxy.requests}", proxy.requests < 60)
        assertTrue("zu langsam: $ms ms", ms < 20_000)
        // Inhalt vollständig (Text, HTML, Anhang)
        val m = db.listMessages(null, null, null).first()
        val full = db.message(m.id)!!
        assertTrue(full.bodyHtml!!.contains("<h1>Mail")); assertTrue(full.bodyText!!.contains("das ist Mail"))
        assertEquals(1, db.attachments(m.id).size)
        val t1 = System.currentTimeMillis(); repo.sync(); val ms2 = System.currentTimeMillis() - t1
        println("SPEED zweiter Abruf (nichts Neues): $ms2 ms")
    }
}
