package app.mailwerk.desktop

import app.mailwerk.data.Account
import app.mailwerk.data.Security
import app.mailwerk.mail.MailClient
import app.mailwerk.mail.friendly
import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyStore
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/** Server mit einem Zertifikat, das nur in einem Zusatz-Speicher steht (wie ein Virenscanner im Windows-Speicher). */
class TrustTest {
    private val gm = GreenMail(arrayOf(ServerSetup(3993, null, "imaps"))).also { it.start() }
    private val original = SSLContext.getDefault()
    @After fun stop() { gm.stop(); SSLContext.setDefault(original) }

    private fun serverCert(): X509Certificate {
        val trustAll = arrayOf<TrustManager>(object : X509TrustManager {
            override fun checkClientTrusted(c: Array<X509Certificate>, a: String) {}
            override fun checkServerTrusted(c: Array<X509Certificate>, a: String) {}
            override fun getAcceptedIssuers() = arrayOf<X509Certificate>()
        })
        val ctx = SSLContext.getInstance("TLS").apply { init(null, trustAll, null) }
        (ctx.socketFactory.createSocket("127.0.0.1", 3993) as SSLSocket).use { s -> s.startHandshake(); return s.session.peerCertificates[0] as X509Certificate }
    }

    @Test fun trustsCertificateFromSystemStore() {
        gm.setUser("ich@test.de", "ich@test.de", "pw")
        val acc = Account(0, "Ich", "ich@test.de", "localhost", 3993, Security.SSL, "localhost", 3465, Security.SSL, "ich@test.de", "")
        // ohne Zusatz-Speicher: abgelehnt (unbekanntes Zertifikat)
        val before = runCatching { MailClient(acc, "pw").withStore { it.defaultFolder.list().size } }
        assertTrue("muss ohne Zusatz-Speicher scheitern", before.isFailure)
        assertTrue(friendly(before.exceptionOrNull()!!), friendly(before.exceptionOrNull()!!).contains("Zertifikat"))
        // mit Zusatz-Speicher (wie Windows-ROOT): klappt
        val extra = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null, null); setCertificateEntry("virenscanner", serverCert()) }
        Trust.install(listOf(extra))
        val after = runCatching { MailClient(acc, "pw").withStore { it.getFolder("INBOX").exists() } }
        // Kette wird jetzt akzeptiert; das Test-Zertifikat ist nur nicht auf „localhost“ ausgestellt –
        // die Namensprüfung bleibt also streng (richtig so). Ohne Zusatz-Speicher kam die Prüfung gar nicht so weit.
        val msg = generateSequence(after.exceptionOrNull()) { it.cause }.joinToString(" | ") { it.message ?: "" }
        assertTrue(msg, after.isSuccess || msg.contains("No name matching"))
        assertTrue(!generateSequence(before.exceptionOrNull()) { it.cause }.joinToString { it.message ?: "" }.contains("No name matching"))
    }
}
