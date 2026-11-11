package app.mailwerk.sync

import app.mailwerk.tr

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import app.mailwerk.R
import app.mailwerk.data.Crypto
import app.mailwerk.data.Db
import app.mailwerk.data.Prefs
import app.mailwerk.data.Repository
import app.mailwerk.mail.IdleWatcher
import app.mailwerk.ui.MainActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

/**
 * Hält pro Konto eine IMAP-IDLE-Verbindung offen und gleicht sofort ab, wenn der Server eine neue Mail meldet.
 * Läuft als Vordergrunddienst (Android verlangt dafür eine dauerhafte, unauffällige Benachrichtigung).
 */
class PushService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val watchers = ConcurrentHashMap<Long, Pair<String, IdleWatcher>>() // accountId -> (passwortHash, watcher)
    private val states = ConcurrentHashMap<String, String>()
    private var syncJob: Job? = null
    private var netCallback: ConnectivityManager.NetworkCallback? = null
    private var lostNetwork = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val n = statusNotification(tr("Verbinde …"))
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING)
        else startForeground(NOTIF_ID, n)
        val db = Db.get(this)
        scope.launch { db.changes.collectLatest { runCatching { updateWatchers() } } }
        registerNetwork()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Prefs(this).pushEnabled) { stopSelf(); return START_NOT_STICKY }
        return START_STICKY
    }

    private fun updateWatchers() {
        val accounts = Db.get(this).accounts()
        if (accounts.isEmpty() || !Prefs(this).pushEnabled) { stopSelf(); return }
        val ids = accounts.map { it.id }.toSet()
        watchers.keys.filter { it !in ids }.forEach { id -> watchers.remove(id)?.second?.stop() }
        for (a in accounts) {
            val existing = watchers[a.id]
            // Bei OAuth-Konten ändert sich der gespeicherte Status bei jeder Token-Erneuerung -> nicht neu verbinden
            val key = a.authType + a.imapHost + a.imapPort + a.username + (if (a.isOAuth) "" else a.passwordEnc)
            if (existing != null && existing.first == key) continue
            existing?.second?.stop()
            val repo = Repository.get(this)
            val w = IdleWatcher(a, secret = { Db.get(this).account(a.id)?.let { repo.secretFor(it) } ?: error(tr("Konto entfernt")) },
                onNewMail = { scheduleSync() }, onState = { st -> states[a.email] = st; refreshStatus() })
            watchers[a.id] = key to w
            w.start()
        }
        refreshStatus()
    }

    /** Mehrere Meldungen kurz hintereinander zu einem Abgleich bündeln. */
    private fun scheduleSync() {
        syncJob?.cancel()
        syncJob = scope.launch {
            delay(800)
            val wl = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mailwerk:push")
            wl.acquire(90_000)
            try { runCatching { Repository.get(this@PushService).sync(notify = true) } } finally { if (wl.isHeld) wl.release() }
        }
    }

    private fun registerNetwork() {
        val cm = getSystemService(ConnectivityManager::class.java)
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                // Nach Netzwechsel (WLAN <-> Mobil) sofort neu verbinden statt auf Zeitüberschreitung zu warten
                if (lostNetwork) { lostNetwork = false; scope.launch { delay(1500); watchers.values.forEach { it.second.poke() }; restartAll() } }
            }
            override fun onLost(network: Network) { lostNetwork = true }
        }
        runCatching {
            cm.registerNetworkCallback(NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), cb)
            netCallback = cb
        }
    }

    private fun restartAll() {
        watchers.values.forEach { it.second.stop() }
        watchers.clear()
        updateWatchers()
    }

    private fun refreshStatus() {
        val ok = states.values.count { it.startsWith("verbunden") }
        val text = when {
            states.isEmpty() -> tr("Verbinde …")
            ok == states.size -> if (ok == 1) tr("Sofort-Benachrichtigung aktiv") else tr("Sofort-Benachrichtigung aktiv · {0} Konten", ok)
            else -> states.entries.joinToString(" · ") { "${it.key}: ${stateText(it.value)}" }
        }
        getSystemService(NotificationManager::class.java).notify(NOTIF_ID, statusNotification(text))
    }

    /** Statustexte des IdleWatchers (intern deutsch) für die Anzeige übersetzen. */
    private fun stateText(s: String): String {
        Regex("^getrennt: (.*) – neuer Versuch in (\\d+)s$").find(s)?.let { m ->
            return tr("getrennt: {0} – neuer Versuch in {1}s", m.groupValues[1], m.groupValues[2])
        }
        return tr(s)
    }

    private fun statusNotification(text: String): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(
            NotificationChannel(CHANNEL, tr("Push-Verbindung (kann ausgeblendet werden)"), NotificationManager.IMPORTANCE_MIN).apply { setShowBadge(false) })
        val open = PendingIntent.getActivity(this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("Mailwerk").setContentText(text)
            .setOngoing(true).setSilent(true).setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE).setContentIntent(open).build()
    }

    override fun onDestroy() {
        watchers.values.forEach { it.second.stop() }
        watchers.clear()
        netCallback?.let { runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) } }
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val NOTIF_ID = 4711
        private const val CHANNEL = "push_status"

        /** Startet den Dienst, falls Push eingeschaltet ist und Konten existieren. Nur aus dem Vordergrund oder nach dem Booten aufrufen. */
        fun ensure(ctx: Context) {
            val prefs = Prefs(ctx)
            if (!prefs.pushEnabled || Db.get(ctx).accounts().isEmpty()) { stop(ctx); return }
            runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, PushService::class.java)) }
        }

        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, PushService::class.java)) }
    }
}

/** Nach dem Einschalten des Handys bzw. nach einem App-Update Push wieder starten. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) PushService.ensure(ctx)
    }
}
