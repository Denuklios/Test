package de.familie.hjemme

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Eigener Standortdienst – läuft unabhängig von der Flutter-Oberfläche weiter,
 * auch wenn die App weggewischt oder das Handy neu gestartet wurde.
 * Sendet direkt an den Server (Zugangsdaten aus den Flutter-Einstellungen).
 */
class LocationService : Service() {
    companion object {
        private const val CHANNEL = "standort"
        private const val NOTIF_ID = 4711
        private const val QUEUE_PREFS = "hjemme_native"

        fun start(ctx: Context) {
            if (!hasLocation(ctx) || !loggedIn(ctx)) return
            val i = Intent(ctx, LocationService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
            } catch (_: Exception) {
                // z. B. Android 12+ aus dem Hintergrund ohne Erlaubnis – beim nächsten App-Start erneut
            }
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, LocationService::class.java))
        }

        fun hasLocation(ctx: Context) =
            ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

        fun hasBackground(ctx: Context) = Build.VERSION.SDK_INT < 29 ||
            ctx.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

        private fun flutterPrefs(ctx: Context) = ctx.getSharedPreferences("FlutterSharedPreferences", Context.MODE_PRIVATE)
        fun loggedIn(ctx: Context): Boolean {
            val p = flutterPrefs(ctx)
            return p.getString("flutter.memberId", null) != null && p.getString("flutter.token", null) != null
        }

        /** Gerätezustand, damit die Familie sieht, ob das Handy richtig eingestellt ist */
        fun diag(ctx: Context): JSONObject {
            val pm = ctx.getSystemService(PowerManager::class.java)
            val version = try { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName } catch (_: Exception) { "" }
            return JSONObject()
                .put("bg", hasBackground(ctx))
                .put("opt", !pm.isIgnoringBatteryOptimizations(ctx.packageName)) // true = Akku-Optimierung aktiv (schlecht)
                .put("save", pm.isPowerSaveMode)
                .put("svc", true)
                .put("v", version)
        }

        fun battery(ctx: Context): Pair<Int?, Boolean> {
            val i = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = i?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = i?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            val status = i?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val pct = if (level >= 0 && scale > 0) Math.round(level * 100f / scale) else -1
            val chg = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
            return Pair(if (pct in 1..100) pct else null, chg)
        }
    }

    private lateinit var fused: FusedLocationProviderClient
    private val io = Executors.newSingleThreadExecutor()
    private var lastSent = 0L
    private var moving = false
    private var wake: PowerManager.WakeLock? = null

    private val callback = object : LocationCallback() {
        override fun onLocationResult(r: LocationResult) {
            for (l in r.locations) enqueue(l)
            val last = r.lastLocation ?: return
            val nowMoving = last.hasSpeed() && last.speed > 1.5f
            if (nowMoving != moving) {
                moving = nowMoving
                request() // Takt anpassen: unterwegs häufig, still seltener
            }
            val gap = if (moving) 4_000L else 60_000L
            if (System.currentTimeMillis() - lastSent >= gap) flush()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
        startInForeground()
        wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "hjemme:standort").apply {
            setReferenceCounted(false)
        }
        request()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        if (intent?.getBooleanExtra("now", false) == true) {
            try {
                fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null).addOnSuccessListener { l ->
                    if (l != null) { enqueue(l); flush() }
                }
            } catch (_: SecurityException) {}
        }
        return START_STICKY // Android startet den Dienst neu, falls er beendet wird
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App weggewischt: Dienst läuft weiter (Vordergrund-Dienst), nichts zu tun
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        try { fused.removeLocationUpdates(callback) } catch (_: Exception) {}
        super.onDestroy()
    }

    private fun startInForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Standort teilen", NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false)
            })
        }
        val open = packageManager.getLaunchIntentForPackage(packageName)
        val pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
        val n = b.setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Hjemme ist für deine Familie da")
            .setContentText("Dein Standort wird mit deinem Kreis geteilt")
            .setOngoing(true)
            .setContentIntent(pi)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    private fun request() {
        val req = if (moving) {
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 4_000L)
                .setMinUpdateDistanceMeters(8f)
                .setMinUpdateIntervalMillis(2_000L)
                .build()
        } else {
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 20_000L)
                .setMinUpdateDistanceMeters(15f)
                .setMinUpdateIntervalMillis(10_000L)
                .setMaxUpdateDelayMillis(60_000L)
                .build()
        }
        try {
            fused.removeLocationUpdates(callback)
            fused.requestLocationUpdates(req, callback, Looper.getMainLooper())
        } catch (_: SecurityException) {
            stopSelf()
        }
        // Herzschlag: auch ohne Bewegung regelmäßig melden (Akku, „zuletzt gesehen“)
        heartbeat()
    }

    private var heartbeatPosted = false
    private val handler = android.os.Handler(Looper.getMainLooper())
    private fun heartbeat() {
        if (heartbeatPosted) return
        heartbeatPosted = true
        handler.postDelayed(object : Runnable {
            override fun run() {
                if (System.currentTimeMillis() - lastSent > 4 * 60_000L) {
                    try {
                        fused.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, null).addOnSuccessListener { l ->
                            if (l != null) enqueue(l)
                            flush()
                        }
                    } catch (_: SecurityException) {}
                }
                handler.postDelayed(this, 5 * 60_000L)
            }
        }, 5 * 60_000L)
    }

    private fun enqueue(l: Location) {
        val p = JSONObject()
            .put("lat", l.latitude).put("lng", l.longitude).put("acc", l.accuracy.toDouble())
            .put("ts", l.time)
        if (l.hasSpeed()) p.put("spd", l.speed.toDouble())
        if (l.hasBearing() && l.hasSpeed() && l.speed > 1f) p.put("hdg", l.bearing.toDouble())
        synchronized(this) {
            val prefs = getSharedPreferences(QUEUE_PREFS, MODE_PRIVATE)
            val q = JSONArray(prefs.getString("queue", "[]"))
            q.put(p)
            // höchstens 3000 Punkte puffern (offline)
            val trimmed = if (q.length() > 3000) JSONArray().also { n -> for (i in q.length() - 3000 until q.length()) n.put(q.get(i)) } else q
            prefs.edit().putString("queue", trimmed.toString()).apply()
        }
    }

    private fun flush() {
        lastSent = System.currentTimeMillis()
        io.execute {
            wake?.acquire(30_000L)
            try { upload() } catch (_: Exception) { /* offline: bleibt in der Warteschlange */ } finally {
                try { wake?.release() } catch (_: Exception) {}
            }
        }
    }

    private fun upload() {
        val fp = getSharedPreferences("FlutterSharedPreferences", MODE_PRIVATE)
        val member = fp.getString("flutter.memberId", null) ?: return
        val token = fp.getString("flutter.token", null) ?: return
        val server = fp.getString("flutter.server", null) ?: "https://www.wunsch-fabrik.dk/hjemme/api.php"
        val prefs = getSharedPreferences(QUEUE_PREFS, MODE_PRIVATE)
        val all: JSONArray
        synchronized(this) { all = JSONArray(prefs.getString("queue", "[]")) }
        if (all.length() == 0) return
        val n = minOf(all.length(), 400)
        val batch = JSONArray().also { b -> for (i in 0 until n) b.put(all.get(i)) }
        val (bat, chg) = battery(this)
        val body = JSONObject().put("points", batch).put("chg", chg).put("diag", diag(this))
        if (bat != null) body.put("bat", bat)
        val c = URL("$server?a=loc").openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.connectTimeout = 20_000
        c.readTimeout = 30_000
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("User-Agent", "Hjemme-Familienapp/1.0")
        c.setRequestProperty("X-Member", member)
        c.setRequestProperty("X-Token", token)
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = c.responseCode
        c.disconnect()
        if (code in 200..299) {
            synchronized(this) {
                val now = JSONArray(prefs.getString("queue", "[]"))
                val rest = JSONArray().also { r -> for (i in n until now.length()) r.put(now.get(i)) }
                prefs.edit().putString("queue", rest.toString()).apply()
            }
        } else if (code == 401) {
            // abgemeldet – Warteschlange verwerfen
            prefs.edit().putString("queue", "[]").apply()
        }
    }
}

/** Nach Neustart oder Update den Standortdienst wieder starten */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, "android.intent.action.QUICKBOOT_POWERON" -> {
                if (LocationService.hasBackground(ctx)) LocationService.start(ctx)
            }
        }
    }
}
