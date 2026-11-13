package app.mailwerk.desktop

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.runDesktopComposeUiTest
import androidx.compose.ui.text.style.TextAlign
import app.mailwerk.data.Account
import app.mailwerk.data.Category
import app.mailwerk.data.FolderRole
import app.mailwerk.data.Security
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.Base64
import javax.imageio.ImageIO

/** kleines Logo als PNG */
fun logoPng(w: Int = 160, h: Int = 48, rgb: Int = 0x3D4FE0): ByteArray {
    val img = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
    val g = img.createGraphics(); g.color = java.awt.Color(rgb); g.fillRect(0, 0, w, h)
    g.color = java.awt.Color.WHITE; g.font = java.awt.Font("SansSerif", java.awt.Font.BOLD, h / 2); g.drawString("FIRMA", 12, h * 2 / 3); g.dispose()
    return ByteArrayOutputStream().also { ImageIO.write(img, "png", it) }.toByteArray()
}

/** Mini-Webserver, der ein Bild ausliefert */
class ImageServer(private val bytes: ByteArray) {
    private val sock = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    var hits = 0
    val url get() = "http://127.0.0.1:${sock.localPort}/banner.png"
    init {
        Thread {
            while (!sock.isClosed) {
                val c = runCatching { sock.accept() }.getOrNull() ?: break
                c.use { s ->
                    val r = s.getInputStream().bufferedReader(); while (r.readLine()?.isNotEmpty() == true) {}
                    hits++
                    s.getOutputStream().apply { write("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray()); write(bytes); flush() }
                }
            }
        }.apply { isDaemon = true }.start()
    }
    fun stop() = sock.close()
}

class HtmlViewTest {
    private val dataLogo = "data:image/png;base64," + Base64.getEncoder().encodeToString(logoPng())

    @Test fun parsesLogoRemoteImageAndDropsTracker() {
        val html = """<table><tr><td align="center"><img src="$dataLogo" width="160" height="48" alt="Firma GmbH"></td></tr></table>
            <p>Hallo Robert,</p><p>unser <b>Angebot</b>.</p>
            <div style="text-align:center"><a href="https://shop.example/sale"><img src="https://img.example/banner.jpg" width="600" height="200" alt="Winter-Sale"></a></div>
            <img src="https://t.example/open.gif" width="1" height="1">
            <p><a href="https://x.example"><img src="https://img.example/fb.png" width="24"></a><a href="https://y.example"><img src="https://img.example/ig.png" width="24"></a></p>"""
        val b = HtmlView.parse(html, Color.Blue)
        val imgs = b.filterIsInstance<HtmlView.Imgs>()
        assertEquals(3, imgs.size)
        assertTrue(imgs[0].images.single().src.startsWith("data:")); assertEquals(TextAlign.Center, imgs[0].align)
        assertEquals("https://shop.example/sale", imgs[1].images.single().href); assertEquals(TextAlign.Center, imgs[1].align)
        assertEquals(2, imgs[2].images.size) // Social-Icons nebeneinander
        assertTrue("Spionage-Pixel entfernt", b.none { it is HtmlView.Imgs && it.images.any { i -> i.src.contains("open.gif") } })
        assertTrue(HtmlView.hasRemoteImages(b))
        assertTrue(b.filterIsInstance<HtmlView.Para>().any { it.text.text.contains("unser Angebot.") })
    }

    @Test fun loadsEmbeddedAndRemoteImages() = runBlocking {
        assertNotNull(Images.load(dataLogo))
        val srv = ImageServer(logoPng(600, 200, 0xE0751F))
        try {
            val bmp = Images.load(srv.url)
            assertNotNull(bmp); assertEquals(600, bmp!!.width)
            Images.load(srv.url); assertEquals("zweites Mal aus dem Zwischenspeicher", 1, srv.hits)
        } finally { srv.stop() }
    }
}

@OptIn(ExperimentalTestApi::class)
class HtmlScreenshotTest {
    @Test fun newsletterWithImages() = runDesktopComposeUiTest(1500, 900) {
        val srv = ImageServer(logoPng(600, 200, 0xE0751F))
        val store = Store(File.createTempFile("mailwerk", ".db").apply { delete() })
        val acc = store.saveAccount(Account(0, "Robert", "robert@beispiel.de", "imap.beispiel.de", 993, Security.SSL, "smtp.beispiel.de", 465, Security.SSL, "x", "x"))
        val inbox = store.upsertFolder(acc, "INBOX", "Posteingang", FolderRole.INBOX)
        val logo = "data:image/png;base64," + Base64.getEncoder().encodeToString(logoPng())
        val html = """<div style="text-align:center"><img src="$logo" width="160" height="48" alt="Ofenhaus"></div>
            <h2>Ihre Rechnung</h2><p>Sehr geehrter Herr Robert,</p><p>anbei erhalten Sie die Rechnung über <b>„Schornsteinanierung“</b>.</p>
            <div style="text-align:center"><a href="https://shop.example"><img src="${srv.url}" width="600" height="200" alt="Winteraktion"></a></div>
            <p>Mit freundlichen Grüßen<br>Ihr Ofenhaus-Team</p>"""
        store.insertMessage(app.mailwerk.data.Message(accountId = acc, folderId = inbox, uid = 1, messageId = "<r@x>", threadKey = "t1",
            fromName = "Verkauf | Ofenhaus", fromAddr = "verkauf@ofenhaus.example", toAddrs = "robert@beispiel.de", ccAddrs = "", replyTo = "",
            subject = "Rechnung über „Schornsteinsanierung“", date = System.currentTimeMillis() - 3_600_000, snippet = "Sehr geehrter Herr Robert, anbei …",
            bodyHtml = html, bodyText = null, seen = true, flagged = false, category = Category.PEOPLE, hasAttachments = false,
            unsubscribe = null, inReplyTo = null, references = null), emptyList())
        val st = AppState(Repo(store).apply { passwordOf = { error("offline") } })
        st.select(store.list(null, Category.PEOPLE, "").first())
        setContent { MailwerkTheme(false) { App(st) } }
        waitForIdle(); Thread.sleep(800); st.repo.errors.value = emptyMap(); waitForIdle()
        File("build/screenshots").mkdirs()
        ImageIO.write(onRoot().captureToImage().toAwtImage(), "png", File("build/screenshots/desktop_bilder_blockiert.png"))
        // „Absender immer vertrauen“ -> Bilder laden
        st.trustSender("verkauf@ofenhaus.example"); st.afterRemove(); waitForIdle()
        st.select(store.list(null, Category.PEOPLE, "").first()); waitForIdle(); Thread.sleep(1500); waitForIdle()
        ImageIO.write(onRoot().captureToImage().toAwtImage(), "png", File("build/screenshots/desktop_bilder_geladen.png"))
        assertTrue(srv.hits >= 1)
        srv.stop()
    }
}
