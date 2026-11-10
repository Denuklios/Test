package app.mailwerk.mail

import app.mailwerk.data.Account
import jakarta.mail.Folder
import jakarta.mail.event.MessageCountAdapter
import jakarta.mail.event.MessageCountEvent
import org.eclipse.angus.mail.imap.IMAPFolder
import org.eclipse.angus.mail.imap.IMAPStore
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Echtes Push per IMAP IDLE (RFC 2177): hält eine Verbindung zum Posteingang offen, der Server meldet neue
 * Mails sofort. Unterstützt der Server kein IDLE, wird jede Minute nachgesehen.
 * Läuft in einem eigenen Thread und verbindet sich nach Abbrüchen selbständig neu.
 */
class IdleWatcher(
    private val acc: Account,
    private val password: String,
    private val onNewMail: () -> Unit,
    private val onState: (String) -> Unit = {},
    private val keepAliveMinutes: Long = 9,
) {
    @Volatile private var running = false
    @Volatile private var folder: IMAPFolder? = null
    @Volatile private var store: IMAPStore? = null
    private var thread: Thread? = null
    private val timer = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "idle-keepalive").apply { isDaemon = true } }
    private var keepAlive: ScheduledFuture<*>? = null

    val email get() = acc.email

    fun start() {
        if (running) return
        running = true
        thread = Thread({ loop() }, "idle-${acc.email}").apply { isDaemon = true; start() }
        // Viele Server/Router trennen stille Verbindungen nach ~10–30 Min. -> regelmäßig NOOP (bricht IDLE kurz ab, Schleife startet es neu)
        keepAlive = timer.scheduleWithFixedDelay({ poke() }, keepAliveMinutes, keepAliveMinutes, TimeUnit.MINUTES)
    }

    fun stop() {
        running = false
        keepAlive?.cancel(true)
        timer.shutdownNow()
        Thread { runCatching { store?.close() } }.start()
        thread?.interrupt()
    }

    /** Verbindung prüfen; bricht ein laufendes IDLE ab, danach wird es neu gestartet. */
    fun poke() {
        val f = folder ?: return
        runCatching { f.doCommand { p -> p.simpleCommand("NOOP", null); null } }
    }

    private fun loop() {
        var backoff = 5_000L
        while (running) {
            try {
                Thread.currentThread().contextClassLoader = IdleWatcher::class.java.classLoader
                MailClient(acc, password).withStore { s ->
                    val st = s as IMAPStore
                    store = st
                    val f = st.getFolder("INBOX") as IMAPFolder
                    f.open(Folder.READ_ONLY)
                    folder = f
                    f.addMessageCountListener(object : MessageCountAdapter() {
                        override fun messagesAdded(e: MessageCountEvent) { onNewMail() }
                    })
                    val idle = st.hasCapability("IDLE")
                    onState(if (idle) "verbunden (Push)" else "verbunden (Abruf jede Minute)")
                    backoff = 5_000L
                    onNewMail() // nach (Neu-)Verbindung einmal abgleichen – evtl. kam in der Zwischenzeit etwas
                    while (running && f.isOpen) {
                        if (idle) f.idle(true)
                        else { Thread.sleep(60_000); f.messageCount }
                    }
                    folder = null
                    runCatching { f.close(false) }
                }
            } catch (e: InterruptedException) {
                break
            } catch (e: Exception) {
                folder = null
                if (!running) break
                onState("getrennt: ${friendly(e)} – neuer Versuch in ${backoff / 1000}s")
                try { Thread.sleep(backoff) } catch (_: InterruptedException) { break }
                backoff = (backoff * 2).coerceAtMost(5 * 60_000L)
            }
        }
        onState("beendet")
    }
}
