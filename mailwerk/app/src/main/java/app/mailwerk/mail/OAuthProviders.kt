package app.mailwerk.mail

import app.mailwerk.data.Security
import org.json.JSONObject
import java.util.Base64

/** Anbieter mit Anmeldung über das eigene Login-Fenster (OAuth 2.0 + PKCE, ohne Passwort in der App). */
enum class OAuthProvider(
    val label: String,
    val authEndpoint: String,
    val tokenEndpoint: String,
    val scopes: List<String>,
    val imapHost: String, val imapPort: Int, val imapSecurity: Security,
    val smtpHost: String, val smtpPort: Int, val smtpSecurity: Security,
    val domains: Set<String>,
) {
    GOOGLE(
        "Google", "https://accounts.google.com/o/oauth2/v2/auth", "https://oauth2.googleapis.com/token",
        listOf("https://mail.google.com/", "openid", "email", "profile"),
        "imap.gmail.com", 993, Security.SSL, "smtp.gmail.com", 465, Security.SSL,
        setOf("gmail.com", "googlemail.com"),
    ),
    MICROSOFT(
        "Microsoft", "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        listOf("offline_access", "openid", "email", "profile", "https://outlook.office.com/IMAP.AccessAsUser.All", "https://outlook.office.com/SMTP.Send"),
        "outlook.office365.com", 993, Security.SSL, "smtp.office365.com", 587, Security.STARTTLS,
        setOf("outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com"),
    );

    /** Kennung im Konto-Datensatz */
    val authType get() = "oauth_" + name.lowercase()

    /** Google verlangt „paket:/pfad“, Microsoft akzeptiert „schema://pfad“ – beides landet in der App. */
    fun redirectUri(appId: String) = if (this == GOOGLE) "$appId:/oauth2redirect" else "$appId://oauth2redirect"

    companion object {
        fun ofAuthType(t: String?) = entries.firstOrNull { it.authType == t }
        fun forEmail(email: String) = email.substringAfter('@').lowercase().let { d -> entries.firstOrNull { d in it.domains } }

        /** E-Mail-Adresse und Name aus dem ID-Token lesen (wird von Google/Microsoft signiert ausgeliefert). */
        fun identity(idToken: String?): Pair<String, String>? {
            val payload = idToken?.split('.')?.getOrNull(1) ?: return null
            return runCatching {
                val json = JSONObject(String(Base64.getUrlDecoder().decode(payload.padEnd((payload.length + 3) / 4 * 4, '='))))
                val email = json.optString("email").ifBlank { json.optString("preferred_username") }.ifBlank { json.optString("upn") }
                if (!email.contains('@')) null else email.lowercase() to json.optString("name")
            }.getOrNull()
        }
    }
}
