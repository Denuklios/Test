package app.mailwerk.desktop

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.mailwerk.mail.HtmlSanitizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import org.jsoup.nodes.Node
import org.jsoup.nodes.TextNode
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Base64

/**
 * HTML-Mails mit Bildern darstellen – ohne eingebetteten Browser (keine Skripte, keine Spionage):
 * Text mit Formatierung und Links, dazu Bilder (eingebettete sofort, aus dem Internet erst auf Wunsch).
 */
object HtmlView {
    sealed interface Block
    data class Para(val text: AnnotatedString, val align: TextAlign) : Block
    data class Img(val src: String, val w: Int?, val h: Int?, val href: String?, val alt: String) : Block
    /** mehrere Bilder nebeneinander (Logo-Leisten, Social-Icons) */
    data class Imgs(val images: List<Img>, val align: TextAlign) : Block
    data object Rule : Block

    private val blocks = setOf("p", "div", "section", "article", "header", "footer", "table", "tbody", "thead", "tr", "ul", "ol", "li", "blockquote",
        "h1", "h2", "h3", "h4", "h5", "h6", "pre", "center", "address", "dl", "dt", "dd", "form", "td", "th")

    fun hasRemoteImages(blocks: List<Block>) = blocks.any { b ->
        when (b) { is Img -> b.src.startsWith("http"); is Imgs -> b.images.any { it.src.startsWith("http") }; else -> false }
    }

    private fun alignOf(e: Element?): TextAlign {
        var x = e
        while (x != null && x.tagName() != "body") {
            val a = x.attr("align").lowercase()
            val st = x.attr("style").lowercase().replace(" ", "")
            when {
                a == "center" || st.contains("text-align:center") || x.tagName() == "center" -> return TextAlign.Center
                a == "right" || st.contains("text-align:right") -> return TextAlign.End
                a == "left" || st.contains("text-align:left") -> return TextAlign.Start
            }
            x = x.parent()
        }
        return TextAlign.Start
    }

    private fun px(v: String): Int? = v.trim().removeSuffix("px").takeIf { it.isNotEmpty() && it.all(Char::isDigit) }?.toIntOrNull()
    private fun styleSize(style: String, prop: String): Int? =
        Regex("(?:^|;)\\s*$prop\\s*:\\s*(\\d+)px", RegexOption.IGNORE_CASE).find(style)?.groupValues?.get(1)?.toIntOrNull()

    fun parse(html: String, link: Color): List<Block> {
        val doc = Jsoup.parse(html)
        doc.select("script, style, head, title, meta, link, noscript, template, svg, iframe, object").remove()
        doc.select("[style~=(?i)display\\s*:\\s*none], [hidden]").remove()
        // Spionage-Pixel nie laden
        doc.select("img").forEach { if (HtmlSanitizer.isTracker(it)) it.remove() }
        val out = mutableListOf<Block>()
        val pendingImgs = mutableListOf<Img>()
        var pendingAlign = TextAlign.Start
        var b = AnnotatedString.Builder()
        var paraAlign = TextAlign.Start
        var lastChar = '\n'; var trailingNl = 0; var empty = true

        fun flushImgs() {
            if (pendingImgs.isEmpty()) return
            out += if (pendingImgs.size == 1) Imgs(listOf(pendingImgs.single()), pendingAlign) else Imgs(pendingImgs.toList(), pendingAlign)
            pendingImgs.clear()
        }
        fun flushText() {
            val t = b.toAnnotatedString()
            if (t.text.isNotBlank()) out += Para(trim(t), paraAlign)
            b = AnnotatedString.Builder(); lastChar = '\n'; trailingNl = 0; empty = true
        }
        fun add(t: String) {
            if (t.isEmpty()) return
            if (pendingImgs.isNotEmpty() && t.isNotBlank()) flushImgs()
            b.append(t); empty = false; lastChar = t.last()
            trailingNl = if (t.all { it == '\n' }) trailingNl + t.length else t.length - t.trimEnd('\n').length
        }
        fun nl(n: Int) { if (!empty) repeat((n - trailingNl).coerceAtLeast(0)) { add("\n") } }

        fun walk(node: Node, pre: Boolean, href: String?) {
            when (node) {
                is TextNode -> {
                    var t = if (pre) node.wholeText else node.text().replace(' ', ' ')
                    if (!pre) {
                        t = t.replace(Regex("\\s+"), " ")
                        if (empty || lastChar == '\n') t = t.trimStart()
                        if (t.isEmpty()) return
                        if (!empty && lastChar == ' ' && t.startsWith(' ')) t = t.trimStart()
                    }
                    if (empty) paraAlign = alignOf(node.parent() as? Element)
                    add(t)
                }
                is Element -> {
                    val tag = node.tagName().lowercase()
                    when (tag) {
                        "br" -> { add("\n"); return }
                        "hr" -> { flushText(); flushImgs(); out += Rule; return }
                        "img" -> {
                            val src = node.attr("src").trim()
                            if (src.isEmpty() || src.startsWith("cid:")) { node.attr("alt").takeIf { it.isNotBlank() && it.length < 60 }?.let { add(it) }; return }
                            val st = node.attr("style")
                            val img = Img(src, px(node.attr("width")) ?: styleSize(st, "width"), px(node.attr("height")) ?: styleSize(st, "height"), href, node.attr("alt"))
                            // Text davor abschließen, Bild als eigener Block (benachbarte Bilder nebeneinander)
                            if (!empty && b.toAnnotatedString().text.isNotBlank()) flushText()
                            if (pendingImgs.isEmpty()) pendingAlign = alignOf(node)
                            pendingImgs += img
                            return
                        }
                    }
                    val isBlock = tag in blocks
                    if (isBlock && tag != "td" && tag != "th") {
                        // neuer Absatz: Ausrichtung kann wechseln -> Text abschließen
                        if (tag in setOf("p", "div", "h1", "h2", "h3", "h4", "center", "table", "blockquote", "li", "tr")) { flushText(); flushImgs() } else nl(1)
                    }
                    if (tag == "li") add(if (node.parent()?.tagName() == "ol") "${node.elementSiblingIndex() + 1}. " else "•  ")
                    if ((tag == "td" || tag == "th") && node.elementSiblingIndex() > 0 && !empty) add("   ")
                    val style: SpanStyle? = when (tag) {
                        "b", "strong", "th" -> SpanStyle(fontWeight = FontWeight.Bold)
                        "i", "em" -> SpanStyle(fontStyle = FontStyle.Italic)
                        "u" -> SpanStyle(textDecoration = TextDecoration.Underline)
                        "h1" -> SpanStyle(fontWeight = FontWeight.Bold, fontSize = 24.sp)
                        "h2" -> SpanStyle(fontWeight = FontWeight.Bold, fontSize = 20.sp)
                        "h3", "h4" -> SpanStyle(fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        "small" -> SpanStyle(fontSize = 12.sp)
                        "blockquote" -> SpanStyle(color = Color.Gray)
                        "code", "pre" -> SpanStyle(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                        else -> null
                    }
                    val myHref = if (tag == "a") node.attr("abs:href").ifBlank { node.attr("href") }.takeIf { it.startsWith("http", true) || it.startsWith("mailto:", true) } else null
                    val children = { node.childNodes().forEach { walk(it, pre || tag == "pre", myHref ?: href) } }
                    val styled = { if (style != null) { b.pushStyle(style); children(); b.pop() } else children() }
                    if (myHref != null) {
                        b.pushLink(LinkAnnotation.Url(myHref, TextLinkStyles(SpanStyle(color = link, textDecoration = TextDecoration.Underline))))
                        styled(); b.pop()
                    } else styled()
                    if (isBlock && tag != "td" && tag != "th") {
                        if (tag in setOf("p", "div", "h1", "h2", "h3", "h4", "center", "table", "blockquote", "li", "tr")) { flushText(); flushImgs() } else nl(1)
                    }
                }
            }
        }
        doc.body()?.let { walk(it, false, null) }
        flushText(); flushImgs()
        // leere Absätze und doppelte Trennlinien entfernen
        return out.filterIndexed { i, bl -> !(bl is Rule && (i == 0 || out[i - 1] is Rule)) }
    }

    private fun trim(s: AnnotatedString): AnnotatedString {
        val t = s.text
        var start = 0; while (start < t.length && t[start].isWhitespace()) start++
        var end = t.length; while (end > start && t[end - 1].isWhitespace()) end--
        val cut = s.subSequence(start, end)
        // höchstens eine Leerzeile
        val text = cut.text
        if (!text.contains("\n\n\n")) return cut
        return buildAnnotatedString {
            var i = 0; var nlRun = 0
            while (i < text.length) {
                if (text[i] == '\n') nlRun++ else nlRun = 0
                if (nlRun <= 2) append(cut.subSequence(i, i + 1))
                i++
            }
        }
    }
}

/** Bilder laden: eingebettete sofort, aus dem Internet mit Zwischenspeicher (Speicher + Festplatte) */
object Images {
    private val mem = object : LinkedHashMap<String, ImageBitmap>(64, 0.75f, true) {
        override fun removeEldestEntry(e: MutableMap.MutableEntry<String, ImageBitmap>?) = size > 120
    }
    private val dir by lazy { File(Paths.home, "bilder").apply { mkdirs() } }

    fun decode(bytes: ByteArray): ImageBitmap? = runCatching { org.jetbrains.skia.Image.makeFromEncoded(bytes).toComposeImageBitmap() }.getOrNull()

    suspend fun load(src: String): ImageBitmap? = withContext(Dispatchers.IO) {
        synchronized(mem) { mem[src] }?.let { return@withContext it }
        val bmp = when {
            src.startsWith("data:", true) -> runCatching { decode(Base64.getMimeDecoder().decode(src.substringAfter("base64,", ""))) }.getOrNull()
            src.startsWith("http", true) -> {
                val key = MessageDigest.getInstance("SHA-1").digest(src.toByteArray()).joinToString("") { "%02x".format(it) }
                val f = File(dir, key)
                val bytes = if (f.exists()) f.readBytes() else runCatching {
                    val c = URL(src).openConnection() as HttpURLConnection
                    c.connectTimeout = 10_000; c.readTimeout = 15_000; c.instanceFollowRedirects = true
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0) Mailwerk")
                    c.setRequestProperty("Accept", "image/*")
                    try {
                        if (c.responseCode !in 200..299) null
                        else c.inputStream.use { it.readNBytes(8_000_000) }.also { runCatching { f.writeBytes(it) } }
                    } finally { c.disconnect() }
                }.getOrNull()
                bytes?.let(::decode)
            }
            else -> null
        }
        bmp?.also { synchronized(mem) { mem[src] = it } }
    }
}

/** Darstellung der Blöcke. remote = Bilder aus dem Internet laden. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HtmlBody(blocks: List<HtmlView.Block>, remote: Boolean) {
    val uri = LocalUriHandler.current
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        blocks.forEach { bl ->
            when (bl) {
                is HtmlView.Para -> SelectionContainer { Text(bl.text, Modifier.fillMaxWidth(), style = MaterialTheme.typography.bodyLarge, textAlign = bl.align) }
                is HtmlView.Rule -> Box(Modifier.fillMaxWidth().padding(vertical = 4.dp).size(1.dp).background(MaterialTheme.colorScheme.outlineVariant))
                is HtmlView.Imgs -> {
                    val arr = when (bl.align) { TextAlign.Center -> Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally); TextAlign.End -> Arrangement.spacedBy(8.dp, Alignment.End); else -> Arrangement.spacedBy(8.dp) }
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = arr, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        bl.images.forEach { img -> MailImage(img, remote, single = bl.images.size == 1) { img.href?.let { runCatching { uri.openUri(it) } } } }
                    }
                }
                is HtmlView.Img -> MailImage(bl, remote, single = true) { bl.href?.let { runCatching { uri.openUri(it) } } }
            }
        }
    }
}

@Composable
private fun MailImage(img: HtmlView.Img, remote: Boolean, single: Boolean, onClick: () -> Unit) {
    val isRemote = img.src.startsWith("http", true)
    if (isRemote && !remote) {
        // Platzhalter mit Alternativtext, solange Bilder blockiert sind
        if (img.alt.isNotBlank() || (img.w ?: 0) >= 60) Box(Modifier.clip(RoundedCornerShape(4.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 10.dp, vertical = 6.dp)) {
            Text("🖼 " + img.alt.ifBlank { "Bild" }.take(50), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val bmp by produceState<ImageBitmap?>(null, img.src) { value = Images.load(img.src) }
    val b = bmp ?: run {
        if (img.w != null && img.h != null) Box(Modifier.size(minOf(img.w, 600).dp, (img.h * minOf(img.w, 600) / maxOf(img.w, 1)).dp)
            .background(MaterialTheme.colorScheme.surfaceVariant))
        return
    }
    val density = LocalDensity.current
    BoxWithConstraints {
        // Breite: Angabe aus der Mail (in CSS-Pixeln) bzw. natürliche Größe, höchstens so breit wie der Lesebereich
        val natural = (img.w ?: with(density) { b.width.toDp().value.toInt() }).coerceAtLeast(1)
        val wDp = minOf(natural.toFloat(), maxWidth.value)
        val ratio = if (img.w != null && img.h != null && img.h > 0) img.w.toFloat() / img.h else b.width.toFloat() / maxOf(b.height, 1)
        Image(b, img.alt, Modifier.width(wDp.dp).aspectRatio(ratio.coerceIn(0.05f, 20f))
            .then(if (img.href != null) Modifier.clip(RoundedCornerShape(2.dp)).clickable(onClick = onClick) else Modifier),
            contentScale = ContentScale.Fit)
    }
}
