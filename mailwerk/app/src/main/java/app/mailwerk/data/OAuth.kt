package app.mailwerk.data

import app.mailwerk.tr

import android.content.Context
import android.content.Intent
import android.net.Uri
import app.mailwerk.BuildConfig
import app.mailwerk.mail.OAuthProvider
import kotlinx.coroutines.suspendCancellableCoroutine
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.ResponseTypeValues
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Anmeldung über Google/Microsoft mit AppAuth (OAuth 2.0 + PKCE).
 * Gespeichert wird nur der verschlüsselte Anmeldestatus (Refresh-Token), nie ein Passwort.
 */
object OAuth {
    fun clientId(p: OAuthProvider) = when (p) {
        OAuthProvider.GOOGLE -> BuildConfig.GOOGLE_CLIENT_ID
        OAuthProvider.MICROSOFT -> BuildConfig.MICROSOFT_CLIENT_ID
    }

    /** Nur Anbieter, für die eine Client-ID eingetragen ist, bekommen einen Anmelde-Knopf. */
    fun available(p: OAuthProvider) = clientId(p).isNotBlank()

    fun buildRequest(appId: String, p: OAuthProvider, clientId: String, loginHint: String?): AuthorizationRequest {
        val config = AuthorizationServiceConfiguration(Uri.parse(p.authEndpoint), Uri.parse(p.tokenEndpoint))
        return AuthorizationRequest.Builder(config, clientId, ResponseTypeValues.CODE, Uri.parse(p.redirectUri(appId)))
            .setScopes(p.scopes)
            .setPrompt("select_account")
            .apply { if (!loginHint.isNullOrBlank()) setLoginHint(loginHint) }
            .build()
    }

    fun loginIntent(ctx: Context, p: OAuthProvider, loginHint: String?): Intent =
        AuthorizationService(ctx).getAuthorizationRequestIntent(buildRequest(ctx.packageName, p, clientId(p), loginHint))

    data class Result(val email: String, val name: String, val stateJson: String)

    /** Wertet die Rückkehr aus dem Login-Fenster aus und tauscht den Code gegen Tokens. */
    suspend fun finish(ctx: Context, data: Intent?): Result {
        val resp = data?.let { AuthorizationResponse.fromIntent(it) }
        val ex = data?.let { AuthorizationException.fromIntent(it) }
        if (resp == null) throw IllegalStateException(
            if (ex?.code == AuthorizationException.GeneralErrors.USER_CANCELED_AUTH_FLOW.code) tr("Anmeldung abgebrochen") else ex?.errorDescription ?: ex?.message ?: tr("Anmeldung abgebrochen"))
        val state = AuthState(resp, ex)
        val service = AuthorizationService(ctx)
        try {
            val token = suspendCancellableCoroutine { cont ->
                service.performTokenRequest(resp.createTokenExchangeRequest()) { t, e ->
                    if (t != null) cont.resume(t) else cont.resumeWithException(IllegalStateException(e?.errorDescription ?: e?.message ?: tr("Token-Abruf fehlgeschlagen")))
                }
            }
            state.update(token, null)
            val (email, name) = OAuthProvider.identity(token.idToken) ?: throw IllegalStateException(tr("E-Mail-Adresse konnte nicht ermittelt werden"))
            return Result(email, name, state.jsonSerializeString())
        } finally { service.dispose() }
    }

    /**
     * Liefert ein gültiges Zugangs-Token (erneuert es bei Bedarf). Blockiert – nie im Hauptthread aufrufen.
     * Geänderter Anmeldestatus wird verschlüsselt zurückgespeichert.
     */
    fun freshToken(ctx: Context, acc: Account): String {
        val json = Crypto.decrypt(acc.passwordEnc)
        val state = AuthState.jsonDeserialize(json)
        val service = AuthorizationService(ctx)
        try {
            val latch = CountDownLatch(1)
            var token: String? = null
            var error: AuthorizationException? = null
            state.performActionWithFreshTokens(service) { access, _, e -> token = access; error = e; latch.countDown() }
            if (!latch.await(45, TimeUnit.SECONDS)) throw IllegalStateException(tr("Zeitüberschreitung bei der Anmeldung"))
            val t = token ?: throw IllegalStateException(
                if (error?.type == AuthorizationException.TYPE_OAUTH_TOKEN_ERROR) tr("Anmeldung abgelaufen – bitte unter Einstellungen → Konto erneut anmelden.")
                else tr("Anmeldung fehlgeschlagen: {0}", error?.errorDescription ?: error?.message))
            val newJson = state.jsonSerializeString()
            if (newJson != json) Db.get(ctx).saveAccountSilently(acc.copy(passwordEnc = Crypto.encrypt(newJson)))
            return t
        } finally { service.dispose() }
    }
}
