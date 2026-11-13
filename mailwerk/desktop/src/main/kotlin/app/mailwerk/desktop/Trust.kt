package app.mailwerk.desktop

import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Zertifikate wie Outlook prüfen: Mailwerk vertraut den Zertifizierungsstellen von Java UND denen im
 * Windows-Zertifikatsspeicher. Wichtig für Virenscanner mit „E-Mail-Schutz“ (Avast, AVG, ESET, Kaspersky, Norton …)
 * und Firmennetze – sie prüfen Mail-Verbindungen mit einem eigenen, nur in Windows eingetragenen Zertifikat.
 * Unsichere Verbindungen werden weiterhin abgelehnt.
 */
object Trust {
    fun manager(store: KeyStore?): X509TrustManager =
        TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(store) }
            .trustManagers.filterIsInstance<X509TrustManager>().first()

    /** vertraut, wenn mindestens einer der Speicher die Kette bestätigt */
    class Composite(private val all: List<X509TrustManager>) : X509TrustManager {
        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = check { it.checkClientTrusted(chain, authType) }
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = check { it.checkServerTrusted(chain, authType) }
        override fun getAcceptedIssuers(): Array<X509Certificate> = all.flatMap { it.acceptedIssuers.toList() }.toTypedArray()
        private fun check(block: (X509TrustManager) -> Unit) {
            var last: CertificateException? = null
            for (tm in all) { try { block(tm); return } catch (e: CertificateException) { last = e } }
            throw last ?: CertificateException("Kein Zertifikatsspeicher verfügbar")
        }
    }

    /** Zusätzliche Speicher (Windows: Stammzertifizierungsstellen und Zwischenzertifikate des Systems) */
    fun windowsStores(): List<KeyStore> = listOf("Windows-ROOT", "Windows-CA").mapNotNull { type ->
        runCatching { KeyStore.getInstance(type).apply { load(null, null) } }.getOrNull()
    }

    fun install(extra: List<KeyStore> = if (Paths.isWindows) windowsStores() else emptyList()) {
        if (extra.isEmpty()) return
        runCatching {
            val ctx = SSLContext.getInstance("TLS")
            ctx.init(null, arrayOf(Composite(listOf(manager(null)) + extra.map { manager(it) })), null)
            SSLContext.setDefault(ctx)
        }.onFailure { System.err.println("Mailwerk: Windows-Zertifikatsspeicher nicht nutzbar: ${it.message}") }
    }
}
