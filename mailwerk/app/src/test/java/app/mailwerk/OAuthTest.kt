package app.mailwerk

import app.mailwerk.data.Account
import app.mailwerk.data.OAuth
import app.mailwerk.data.Security
import app.mailwerk.mail.MailClient
import app.mailwerk.mail.OAuthProvider
import com.icegreen.greenmail.util.GreenMail
import com.icegreen.greenmail.util.ServerSetup
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Base64

@RunWith(RobolectricTestRunner::class)
class OAuthTest {
    private fun jwt(json: String) = "eyJhbGciOiJSUzI1NiJ9." + Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray()) + ".sig"

    @Test fun identityFromIdTokens() {
        assertEquals("anna@gmail.com" to "Anna Muster", OAuthProvider.identity(jwt("""{"email":"Anna@gmail.com","name":"Anna Muster"}""")))
        assertEquals("max@firma.onmicrosoft.com", OAuthProvider.identity(jwt("""{"preferred_username":"max@firma.onmicrosoft.com","name":"Max"}"""))!!.first)
        assertNull(OAuthProvider.identity("kaputt"))
        assertEquals(OAuthProvider.GOOGLE, OAuthProvider.forEmail("x@googlemail.com"))
        assertEquals(OAuthProvider.MICROSOFT, OAuthProvider.forEmail("x@hotmail.de"))
        assertNull(OAuthProvider.forEmail("x@gmx.de"))
    }

    @Test fun loginRequestUsesPkceAndRightRedirects() {
        val g = OAuth.buildRequest("app.mailwerk", OAuthProvider.GOOGLE, "123-abc.apps.googleusercontent.com", "anna@gmail.com").toUri().toString()
        assertTrue(g.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"))
        assertTrue(g.contains("redirect_uri=app.mailwerk%3A%2Foauth2redirect"))
        assertTrue(g.contains("code_challenge=") && g.contains("code_challenge_method=S256"))
        assertTrue(g.contains("https%3A%2F%2Fmail.google.com%2F"))
        assertTrue(g.contains("login_hint=anna%40gmail.com"))
        val m = OAuth.buildRequest("app.mailwerk", OAuthProvider.MICROSOFT, "0000-1111", null).toUri().toString()
        assertTrue(m.contains("redirect_uri=app.mailwerk%3A%2F%2Foauth2redirect"))
        assertTrue(m.contains("IMAP.AccessAsUser.All") && m.contains("SMTP.Send") && m.contains("offline_access"))
    }

    /** Senden mit Zugangs-Token (SASL XOAUTH2) gegen einen echten SMTP-Server. */
    @Test fun smtpWithXoauth2() {
        val gm = GreenMail(arrayOf(ServerSetup(3027, null, "smtp").apply { setVerbose(false) }))
        gm.start()
        try {
            gm.setUser("anna@gmail.com", "anna@gmail.com", "ya29.TOKEN")
            val acc = Account(1, "Anna", "anna@gmail.com", "127.0.0.1", 3143, Security.NONE, "127.0.0.1", 3027, Security.NONE,
                "anna@gmail.com", "", authType = OAuthProvider.GOOGLE.authType)
            val c = MailClient(acc, "ya29.TOKEN")
            c.send(c.buildMessage("bob@test.de", "", "", "Per OAuth", "Hallo", emptyList(), null, null), null)
            assertTrue(gm.waitForIncomingEmail(5000, 1))
            assertEquals("Per OAuth", gm.receivedMessages[0].subject)
        } finally { gm.stop() }
    }
}
