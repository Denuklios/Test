package de.schichtwecker

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/** Spielt den Weckton (sanft lauter werdend), vibriert und zeigt den Vollbild-Wecker. */
class AlarmService : Service() {

    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var prevAlarmVolume = -1
    private var key = ""
    private var label = ""
    private var startedAt = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SNOOZE -> { snooze(); return START_NOT_STICKY }
            ACTION_DISMISS -> { dismiss(); return START_NOT_STICKY }
        }
        key = intent?.getStringExtra("key") ?: key
        label = intent?.getStringExtra("label") ?: label
        startedAt = System.currentTimeMillis()
        running = true

        val n = buildNotification()
        if (Build.VERSION.SDK_INT >= 29)
            startForeground(Notif.ID_ALARM, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(Notif.ID_ALARM, n)

        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "schichtwecker:alarm").apply { acquire(15 * 60_000L) }

        startSound()
        startVibration()
        try { startActivity(activityIntent(this).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}

        // Automatisch verstummen, damit der Akku nicht leerläuft – dann wie Schlummern
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ snooze(auto = true) }, Prefs(this).autoStopMin * 60_000L)
        return START_NOT_STICKY
    }

    private fun buildNotification(): Notification {
        val p = Prefs(this)
        val full = PendingIntent.getActivity(this, 1, activityIntent(this), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val snooze = PendingIntent.getService(this, 2, Intent(this, AlarmService::class.java).setAction(ACTION_SNOOZE),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val dismiss = PendingIntent.getService(this, 3, Intent(this, AlarmService::class.java).setAction(ACTION_DISMISS),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val b = Notification.Builder(this, Notif.CH_ALARM)
            .setSmallIcon(R.drawable.ic_alarm)
            .setContentTitle("Wecker – aufstehen!")
            .setContentText(label)
            .setCategory(Notification.CATEGORY_ALARM)
            .setOngoing(true)
            .setFullScreenIntent(full, true)
            .setContentIntent(full)
        if (p.snoozeCount < p.snoozeMax) b.addAction(Notification.Action.Builder(null, "Schlummern ${p.snoozeMin} Min", snooze).build())
        if (!p.mathTask) b.addAction(Notification.Action.Builder(null, "Aus", dismiss).build())
        return b.build()
    }

    private fun startSound() {
        stopSound()
        val p = Prefs(this)
        val am = getSystemService(AudioManager::class.java)
        val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        val want = (max * p.minVolumePct / 100f).toInt().coerceIn(1, max)
        if (am.getStreamVolume(AudioManager.STREAM_ALARM) < want) {
            prevAlarmVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
            try { am.setStreamVolume(AudioManager.STREAM_ALARM, want, 0) } catch (_: Exception) {}
        }
        val uris = listOfNotNull(
            p.ringtone?.let { Uri.parse(it) },
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        )
        for (u in uris) {
            try {
                val mp = MediaPlayer()
                mp.setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                mp.setDataSource(this, u)
                mp.isLooping = true
                mp.prepare()
                player = mp
                break
            } catch (_: Exception) { }
        }
        val mp = player ?: return
        val ramp = p.rampSec.coerceAtLeast(0)
        if (ramp == 0) mp.setVolume(1f, 1f) else {
            mp.setVolume(0.05f, 0.05f)
            val steps = 30
            for (i in 1..steps) {
                handler.postDelayed({
                    val v = 0.05f + 0.95f * i / steps
                    try { player?.setVolume(v * v, v * v) } catch (_: Exception) {}
                }, ramp * 1000L * i / steps)
            }
        }
        mp.start()
    }

    private fun startVibration() {
        if (!Prefs(this).vibrate) return
        vibrator = if (Build.VERSION.SDK_INT >= 31)
            getSystemService(VibratorManager::class.java).defaultVibrator
        else @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
        val pattern = longArrayOf(0, 600, 400, 600, 1200)
        if (Build.VERSION.SDK_INT >= 33) {
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0),
                android.os.VibrationAttributes.createForUsage(android.os.VibrationAttributes.USAGE_ALARM))
        } else {
            @Suppress("DEPRECATION")
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
        }
    }

    private fun stopSound() {
        try { player?.stop() } catch (_: Exception) {}
        player?.release(); player = null
    }

    private fun snooze(auto: Boolean = false) {
        val p = Prefs(this)
        if (p.snoozeCount < p.snoozeMax || auto) {
            p.snoozeCount = p.snoozeCount + 1
            Scheduler.scheduleSnooze(this, key, label, p.snoozeMin)
            finishAll()
        } else dismiss()
    }

    private fun dismiss() {
        val p = Prefs(this)
        if (p.wakeCheck && key.isNotEmpty()) Scheduler.scheduleWakeCheck(this, key, label, p.wakeCheckMin)
        p.snoozeCount = 0
        finishAll()
        Scheduler.rescheduleAll(this)
    }

    private fun finishAll() {
        handler.removeCallbacksAndMessages(null)
        stopSound()
        vibrator?.cancel()
        if (prevAlarmVolume >= 0) {
            try { getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_ALARM, prevAlarmVolume, 0) } catch (_: Exception) {}
            prevAlarmVolume = -1
        }
        sendBroadcast(Intent(ACTION_DONE).setPackage(packageName))
        running = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        stopSound(); vibrator?.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        running = false
        super.onDestroy()
    }

    companion object {
        const val ACTION_SNOOZE = "de.schichtwecker.svc.SNOOZE"
        const val ACTION_DISMISS = "de.schichtwecker.svc.DISMISS"
        const val ACTION_DONE = "de.schichtwecker.ALARM_DONE"
        @Volatile var running = false

        fun start(ctx: Context, key: String, label: String) {
            ctx.startForegroundService(Intent(ctx, AlarmService::class.java).putExtra("key", key).putExtra("label", label))
        }

        fun send(ctx: Context, action: String) {
            ctx.startService(Intent(ctx, AlarmService::class.java).setAction(action))
        }

        fun activityIntent(ctx: Context) = Intent(ctx, AlarmActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    }
}
