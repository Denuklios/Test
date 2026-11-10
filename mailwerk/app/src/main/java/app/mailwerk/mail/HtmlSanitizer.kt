package app.mailwerk.mail

import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element

/**
 * Macht HTML-Mails sicher und privat (Idee aus FairEmail, HEY und Apple Mail Datenschutz):
 * – entfernt Skripte, Formulare, iFrames
 * – erkennt und entfernt Tracking-Pixel (Lesebestätigungen ohne Zustimmung)
 * – blockiert externe Bilder, bis der Nutzer sie freigibt
 */
object HtmlSanitizer {
    data class Result(val html: String, val trackers: Int, val remoteImages: Int)

    private val trackerPatterns = listOf(
        "/track/open", "/open.aspx", "/open.php", "/o.gif", "/wf/open", "/e/o/", "/trk", "/tracking/", "/pixel", "/beacon",
        "/imp?", "/openmail", "/mo/", "/eo?", "/oo/", "email-open", "mailtrack.io", "mailtrack", "sidekickopen", "t.sidekick",
        "list-manage.com/track", "mandrillapp.com/track", "sendgrid.net/wf/open", "mailgun.org/o/", "/emimp/", "emltrk.com",
        "bananatag", "yesware", "mixmax.com/api/track", "getnotify.com", "streak.com", "superhuman.com", "pixel.wp.com",
        "google-analytics.com", "doubleclick.net", "facebook.com/tr", "exct.net", "links.m.", "cmail19.com/t/", "cmail20.com/t/",
        "createsend", "mktoweb", "mkt_tok", "hubspotlinks", "hs-analytics", "/open/", "newsletter2go.com/o", "sendinblue.com/track",
        "rdr.", "eu.rmail", "cleverreach.com/tr", "mailjet.com/oo", "awstrack.me", "klclick", "trk.klaviyo"
    )

    fun isTracker(img: Element): Boolean {
        val src = img.attr("src").lowercase()
        if (src.isBlank() || src.startsWith("cid:") || src.startsWith("data:")) return false
        val w = img.attr("width").filter { it.isDigit() }.toIntOrNull()
        val h = img.attr("height").filter { it.isDigit() }.toIntOrNull()
        val style = img.attr("style").lowercase().replace(" ", "")
        if ((w != null && w <= 2) && (h == null || h <= 2)) return true
        if ((h != null && h <= 2) && (w == null || w <= 2)) return true
        if (style.contains("display:none") || style.contains("visibility:hidden") ||
            style.contains("width:1px") || style.contains("height:1px") || style.contains("width:0") || style.contains("height:0")) return true
        return trackerPatterns.any { src.contains(it) }
    }

    fun sanitize(html: String, blockRemote: Boolean, darkMode: Boolean): Result {
        val doc: Document = Jsoup.parse(html)
        doc.select("script, noscript, iframe, frame, frameset, object, embed, applet, form, input, button, select, textarea, link[rel=stylesheet], meta[http-equiv], base").remove()
        // Event-Handler & javascript:-Links entfernen
        doc.getAllElements().forEach { el ->
            el.attributes().asList().map { it.key }.filter { it.lowercase().startsWith("on") }.forEach { el.removeAttr(it) }
            if (el.attr("href").trim().lowercase().startsWith("javascript:")) el.removeAttr("href")
        }
        var trackers = 0
        var remote = 0
        doc.select("img").forEach { img ->
            if (isTracker(img)) { img.remove(); trackers++; return@forEach }
            val src = img.attr("src")
            if (blockRemote && (src.startsWith("http://", true) || src.startsWith("https://", true) || src.startsWith("//"))) {
                img.attr("data-blocked-src", src)
                img.attr("src", "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7")
                img.attr("style", img.attr("style") + ";min-width:24px;min-height:24px;background:#8884;border-radius:4px")
                remote++
            }
        }
        if (blockRemote) {
            // Hintergrundbilder und externe CSS-Ressourcen blockieren
            doc.select("[background]").forEach { it.removeAttr("background"); remote++ }
            doc.select("[style*=url(]").forEach { el ->
                el.attr("style", el.attr("style").replace(Regex("url\\(\\s*['\"]?https?:[^)]*\\)", RegexOption.IGNORE_CASE), "none"))
            }
            doc.select("style").forEach { st ->
                st.html(st.html().replace(Regex("url\\(\\s*['\"]?https?:[^)]*\\)", RegexOption.IGNORE_CASE), "none")
                    .replace(Regex("@import[^;]+;", RegexOption.IGNORE_CASE), ""))
            }
        }
        doc.select("a[href]").forEach { it.attr("rel", "noopener noreferrer") }
        return Result(wrap(doc.body().html(), darkMode), trackers, remote)
    }

    fun textToHtml(text: String, darkMode: Boolean): String {
        val escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        val linked = escaped.replace(Regex("(https?://[^\\s<]+)")) { "<a href=\"${it.value}\">${it.value}</a>" }
        // Zitate (> …) einrücken
        val quoted = linked.lines().joinToString("\n") { l ->
            if (l.startsWith("&gt;")) "<span style=\"color:#888\">$l</span>" else l
        }
        return wrap("<div style=\"white-space:pre-wrap;word-wrap:break-word\">$quoted</div>", darkMode)
    }

    private fun wrap(body: String, dark: Boolean): String {
        val css = if (dark)
            "body{background:transparent;color:#e4e5ee} a{color:#9ecaff} img{filter:brightness(.9)} " +
                "body *{background-color:transparent!important;color:inherit!important;border-color:#444!important}"
        else "body{background:#fff;color:#1b1b1f} a{color:#0b57d0}"
        return """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;padding:0}body{padding:4px 2px;font-family:sans-serif;font-size:15px;line-height:1.45;word-wrap:break-word;overflow-wrap:anywhere}
img{max-width:100%!important;height:auto!important} table{max-width:100%!important} pre{white-space:pre-wrap}
blockquote{margin:0 0 0 6px;padding-left:10px;border-left:3px solid #8886} $css</style></head><body>$body</body></html>"""
    }

    fun snippet(text: String, max: Int = 180): String =
        text.replace(Regex("(?m)^>.*$"), " ").replace(Regex("\\s+"), " ").trim().take(max)

    fun htmlToText(html: String): String {
        val doc = Jsoup.parse(html)
        doc.select("style, script, head").remove()
        doc.select("br").append("\\n"); doc.select("p, div, tr, li, h1, h2, h3").prepend("\\n")
        return doc.text().replace("\\n", "\n").replace(Regex("\n{3,}"), "\n\n").trim()
    }
}
