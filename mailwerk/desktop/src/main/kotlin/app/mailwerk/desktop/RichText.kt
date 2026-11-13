package app.mailwerk.desktop

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.sp
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode

/**
 * Mails als formatierten Text anzeigen – ohne Browser-Baustein: Überschriften, fett/kursiv, Listen, Zitate und
 * anklickbare Links. Bilder von außen werden nie geladen (keine Spionage-Pixel), Skripte nie ausgeführt.
 */
object RichText {
    private val blocks = setOf("p", "div", "section", "article", "header", "footer", "table", "tr", "ul", "ol", "li", "blockquote",
        "h1", "h2", "h3", "h4", "h5", "h6", "pre", "hr", "center", "address", "dl", "dt", "dd", "form")

    fun fromHtml(html: String, link: Color): AnnotatedString {
        val doc = Jsoup.parse(html)
        doc.select("script, style, head, title, meta, link, noscript, template, svg, iframe, object").remove()
        // unsichtbare Vorschauzeilen vieler Newsletter
        doc.select("[style~=(?i)display\\s*:\\s*none], [hidden]").remove()
        return buildAnnotatedString {
            // Endstück des bisherigen Texts merken (statt jedes Mal den ganzen Text zu bauen)
            var lastChar = '\n'; var trailingNl = 0; var empty = true
            fun add(t: String) {
                if (t.isEmpty()) return
                append(t); empty = false
                lastChar = t.last()
                trailingNl = if (t.all { it == '\n' }) trailingNl + t.length else t.length - t.trimEnd('\n').length
            }
            fun nl(n: Int) {
                if (empty) return
                repeat((n - trailingNl).coerceAtLeast(0)) { add("\n") }
            }
            fun walk(node: Node, pre: Boolean) {
                when (node) {
                    is TextNode -> {
                        var t = if (pre) node.wholeText else node.text().replace(' ', ' ')
                        if (!pre) {
                            t = t.replace(Regex("\\s+"), " ")
                            if (empty || lastChar == '\n') t = t.trimStart()
                            if (t.isEmpty()) return
                            if (!empty && lastChar == ' ' && t.startsWith(' ')) t = t.trimStart()
                        }
                        add(t)
                    }
                    is Element -> {
                        val tag = node.tagName().lowercase()
                        val isBlock = tag in blocks
                        when (tag) {
                            "br" -> { add("\n"); return }
                            "hr" -> { nl(1); add("────────────"); nl(1); return }
                            "img" -> { node.attr("alt").takeIf { it.isNotBlank() && it.length < 40 }?.let { add(it) }; return }
                        }
                        if (isBlock) nl(if (tag.startsWith("h") || tag == "p" || tag == "table" || tag == "blockquote") 2 else 1)
                        if (tag == "li") add(if (node.parent()?.tagName() == "ol") "${node.elementSiblingIndex() + 1}. " else "•  ")
                        if (tag == "td" || tag == "th") { if (node.elementSiblingIndex() > 0) add("   ") }
                        val style: SpanStyle? = when (tag) {
                            "b", "strong", "th" -> SpanStyle(fontWeight = FontWeight.Bold)
                            "i", "em" -> SpanStyle(fontStyle = FontStyle.Italic)
                            "u" -> SpanStyle(textDecoration = TextDecoration.Underline)
                            "h1" -> SpanStyle(fontWeight = FontWeight.Bold, fontSize = 24.sp)
                            "h2" -> SpanStyle(fontWeight = FontWeight.Bold, fontSize = 20.sp)
                            "h3", "h4" -> SpanStyle(fontWeight = FontWeight.Bold, fontSize = 17.sp)
                            "blockquote" -> SpanStyle(color = Color.Gray)
                            "code", "pre" -> SpanStyle(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                            else -> null
                        }
                        val href = if (tag == "a") node.attr("abs:href").ifBlank { node.attr("href") } else ""
                        val children = { node.childNodes().forEach { walk(it, pre || tag == "pre") } }
                        val styled = { if (style != null) withStyle(style) { children() } else children() }
                        if (href.startsWith("http", true) || href.startsWith("mailto:", true)) {
                            withLink(LinkAnnotation.Url(href, TextLinkStyles(SpanStyle(color = link, textDecoration = TextDecoration.Underline)))) { styled() }
                        } else styled()
                        if (isBlock) nl(if (tag.startsWith("h") || tag == "p" || tag == "table" || tag == "blockquote") 2 else 1)
                    }
                }
            }
            doc.body()?.let { walk(it, false) }
        }.let { trimBlankLines(it) }
    }

    /** reiner Text mit anklickbaren Links */
    fun fromText(text: String, link: Color): AnnotatedString = buildAnnotatedString {
        val rx = Regex("(https?://[^\\s<>\"]+|[\\w.+-]+@[\\w-]+\\.[\\w.-]+)")
        var pos = 0
        rx.findAll(text).forEach { m ->
            append(text.substring(pos, m.range.first))
            val url = if (m.value.contains("://")) m.value.trimEnd('.', ',', ')') else "mailto:" + m.value
            val shown = if (m.value.contains("://")) m.value.trimEnd('.', ',', ')') else m.value
            withLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(color = link, textDecoration = TextDecoration.Underline)))) { append(shown) }
            append(m.value.removePrefix(shown))
            pos = m.range.last + 1
        }
        append(text.substring(pos))
    }

    /** höchstens eine Leerzeile hintereinander, nichts am Anfang/Ende */
    private fun trimBlankLines(s: AnnotatedString): AnnotatedString {
        val t = s.text
        val keep = BooleanArray(t.length) { true }
        var nlRun = 0
        for (i in t.indices) {
            if (t[i] == '\n') { nlRun++; if (nlRun > 2) keep[i] = false } else if (t[i] == ' ' && nlRun > 0) keep[i] = false else nlRun = 0
        }
        var start = 0; while (start < t.length && t[start].isWhitespace()) start++
        var end = t.length; while (end > start && t[end - 1].isWhitespace()) end--
        return buildAnnotatedString {
            var i = start
            while (i < end) {
                if (!keep[i]) { i++; continue }
                var j = i
                while (j < end && keep[j]) j++
                append(s.subSequence(i, j))
                i = j
            }
        }
    }
}
