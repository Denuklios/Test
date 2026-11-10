package app.mailwerk.mail

import app.mailwerk.data.Category

/**
 * Sortiert eingehende Mails automatisch in Wichtig / Newsletter / Benachrichtigungen
 * (Idee aus Spark „Smart Inbox“, Gmail-Tabs und Outlook „Relevanter Posteingang“).
 * Alles lokal auf dem Gerät – keine Mail verlässt das Telefon.
 */
object Classifier {
    private val noReply = Regex(
        "^(no-?reply|do-?not-?reply|donotreply|noreply[-_.].*|.*[-_.]noreply|notifications?|notify|alerts?|mailer-daemon|postmaster|" +
            "bounce[s]?|automated|system|service|support-noreply|info-noreply|account|accounts|security|billing|invoice|rechnung|" +
            "versand|shipping|order[s]?|bestellung|tracking|calendar-notification|auto-confirm|confirm|verification|status|updates?)$",
        RegexOption.IGNORE_CASE
    )
    private val bulkHeaders = listOf(
        "x-campaign", "x-campaignid", "x-mailchimp", "x-mc-user", "x-sg-eid", "x-mailgun-tag", "x-newsletter",
        "x-cmail-campaignid", "x-emarsys", "x-sib-id", "x-mailjet-campaign", "feedback-id", "x-rpcampaign", "x-mktmail"
    )
    private val notificationDomains = listOf(
        "github.com", "gitlab.com", "linkedin.com", "facebookmail.com", "accounts.google.com", "paypal.de", "paypal.com",
        "amazon.de", "amazon.com", "dhl.de", "dpd.de", "hermesworld.com", "ups.com", "slack.com", "atlassian.net",
        "microsoft.com", "apple.com", "ebay.de", "ebay.com", "booking.com", "deutschebahn.com", "bahn.de"
    )

    /**
     * @param headers Kopfzeilen, Schlüssel in Kleinbuchstaben
     * @param knownContact true wenn ich dieser Person schon einmal geschrieben habe
     */
    fun classify(fromAddr: String, headers: Map<String, String>, knownContact: Boolean, rule: Category? = null): Category {
        if (rule != null) return rule
        if (knownContact) return Category.PEOPLE
        val local = fromAddr.substringBefore('@').lowercase()
        val domain = fromAddr.substringAfter('@', "").lowercase()

        val autoSubmitted = headers["auto-submitted"]?.lowercase()
        if (autoSubmitted != null && autoSubmitted != "no") return Category.NOTIFICATION
        if (noReply.matches(local)) return Category.NOTIFICATION
        if (notificationDomains.any { domain == it || domain.endsWith(".$it") }) {
            return if (headers.containsKey("list-unsubscribe") && local.contains("news")) Category.NEWSLETTER else Category.NOTIFICATION
        }

        val precedence = headers["precedence"]?.lowercase()
        if (headers.containsKey("list-unsubscribe") || headers.containsKey("list-id") ||
            precedence == "bulk" || precedence == "list" || bulkHeaders.any { headers.containsKey(it) } ||
            local.contains("newsletter") || local == "news" || local == "marketing" || local == "angebote"
        ) return Category.NEWSLETTER
        return Category.PEOPLE
    }
}

/** Gruppiert Nachrichten zu Unterhaltungen anhand des bereinigten Betreffs. */
object Threads {
    private val prefix = Regex("^\\s*((re|aw|antw|fwd?|wg|wtr|sv|vs|tr|r|rif|enc|odp|ynt)(\\[\\d+])?\\s*:\\s*)+", RegexOption.IGNORE_CASE)
    private val listTag = Regex("^\\s*\\[[^]]{1,30}]\\s*")

    fun normalizeSubject(s: String): String {
        var x = s.trim()
        while (true) {
            val y = x.replace(prefix, "").replace(listTag, "").trim()
            if (y == x) break
            x = y
        }
        return x.lowercase().replace(Regex("\\s+"), " ")
    }

    fun key(accountId: Long, subject: String, messageId: String?): String {
        val n = normalizeSubject(subject)
        return if (n.isEmpty()) "$accountId:id:${messageId ?: System.nanoTime()}" else "$accountId:$n"
    }
}

/** Auswertung des List-Unsubscribe-Headers (RFC 2369 / RFC 8058 One-Click). */
data class Unsubscribe(val mailto: String?, val http: String?, val oneClick: Boolean) {
    companion object {
        fun parse(header: String?, post: String?): Unsubscribe? {
            if (header.isNullOrBlank()) return null
            val urls = Regex("<([^>]+)>").findAll(header).map { it.groupValues[1].trim() }.toList()
                .ifEmpty { header.split(',').map { it.trim() } }
            val mailto = urls.firstOrNull { it.startsWith("mailto:", true) }
            val http = urls.firstOrNull { it.startsWith("https://", true) || it.startsWith("http://", true) }
            if (mailto == null && http == null) return null
            val oneClick = http != null && post?.contains("One-Click", ignoreCase = true) == true
            return Unsubscribe(mailto, http, oneClick)
        }
    }

    /** Für die Speicherung: "http|mailto" */
    fun encode() = listOfNotNull(http, mailto).joinToString("\n")
}
