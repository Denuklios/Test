package de.funkgeraet.walkie;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.media.ToneGenerator;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Das eigentliche Funkgerät. Läuft als Vordergrund-Dienst (mit Benachrichtigung), damit man auch
 * bei ausgeschaltetem Bildschirm empfangen und über das Widget senden kann.
 */
public class RadioService extends Service implements Mqtt.Listener {
    public static final String ACTION_START = "de.funkgeraet.walkie.START";
    public static final String ACTION_STOP = "de.funkgeraet.walkie.STOP";

    public static final String DEFAULT_SERVER = "broker.hivemq.com:8883";
    public static final int MAX_TALK_MS = 60000;   // Widget-Tippen sendet höchstens 1 Minute
    private static final int RATE = 8000, CHUNK = 800; // 100 ms pro Paket
    private static final String CH_ID = "funk";
    private static final int NOTIF_ID = 1;

    public interface UiListener { void onRadioChanged(); }

    public static volatile RadioService instance;
    public static volatile UiListener ui;

    public static final class Member {
        public String name = "";
        public long seen;
        public volatile boolean talking;
    }

    /* Zustand (wird von Widget und App gelesen) */
    public String name = "", channel = "", lastError = "";
    public volatile boolean connected, talking;
    public final Map<Integer, Member> members = new ConcurrentHashMap<>();
    public volatile int speaker;           // wer gerade empfangen wird (0 = niemand)

    private final Handler main = new Handler(Looper.getMainLooper());
    private final int myId = new SecureRandom().nextInt() | 1;
    private Mqtt mqtt;
    private byte[] key;
    private volatile int session = new SecureRandom().nextInt(65536);
    private volatile int speakerSession;
    private volatile long lastAudio;
    private volatile long stopAt;
    private Thread recThread, playThread;
    private volatile boolean running;
    private final LinkedBlockingQueue<short[]> playQueue = new LinkedBlockingQueue<>();
    private AudioTrack track;
    private ToneGenerator tones;
    private PowerManager.WakeLock cpuLock;
    private WifiManager.WifiLock wifiLock;

    /* ---------- Lebenszyklus ---------- */

    public static void start(Context c) {
        Intent i = new Intent(c, RadioService.class).setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    public static void stop(Context c) {
        RadioService s = instance;
        if (s != null) s.shutdown();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            if (instance == null) { stopSelf(); return START_NOT_STICKY; }
            shutdown();
            return START_NOT_STICKY;
        }
        instance = this;
        goForeground();
        if (instance == this && !running) boot();
        return START_NOT_STICKY;
    }

    private void goForeground() {
        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            else startForeground(NOTIF_ID, n);
        } catch (Exception e) {
            lastError = "Funk konnte nicht starten: " + e.getMessage();
            instance = null;
            stopSelf();
        }
    }

    private void boot() {
        SharedPreferences p = getSharedPreferences("funk", MODE_PRIVATE);
        name = p.getString("name", "").trim();
        channel = p.getString("channel", "").trim();
        String server = p.getString("server", DEFAULT_SERVER).trim();
        if (server.isEmpty()) server = DEFAULT_SERVER;
        String host = server;
        int port = 8883;
        int colon = server.lastIndexOf(':');
        if (colon > 0) {
            host = server.substring(0, colon);
            try { port = Integer.parseInt(server.substring(colon + 1)); } catch (NumberFormatException ignored) {}
        }
        boolean tls = port != 1883;

        running = true;
        lastError = "";
        key = Packet.key(channel);
        Packet bye = new Packet();
        bye.type = Packet.BYE;
        bye.sender = myId;
        mqtt = new Mqtt(host, port, tls, Packet.topic(channel), Packet.seal(key, bye.toBytes()), this);

        int min = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        track = new AudioTrack.Builder()
            .setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(new AudioFormat.Builder()
                .setSampleRate(RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(Math.max(min, CHUNK * 2 * 3))
            .setTransferMode(AudioTrack.MODE_STREAM)
            .build();
        track.play();
        try { tones = new ToneGenerator(AudioManager.STREAM_MUSIC, 70); } catch (Exception ignored) {}

        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        cpuLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "funk:radio");
        cpuLock.acquire();
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
        if (wm != null) {
            wifiLock = wm.createWifiLock(Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "funk:wifi");
            wifiLock.acquire();
        }

        playThread = new Thread(this::playLoop, "funk-play");
        playThread.start();
        mqtt.start();
        main.postDelayed(tick, 1000);
        changed();
    }

    public void shutdown() {
        if (talking) setTalking(false);
        running = false;
        main.removeCallbacksAndMessages(null);
        Mqtt m = mqtt;
        if (m != null) {
            new Thread(() -> {
                Packet bye = new Packet();
                bye.type = Packet.BYE;
                bye.sender = myId;
                send(bye);
                m.stop();
            }).start();
        }
        if (playThread != null) playThread.interrupt();
        if (track != null) { try { track.stop(); track.release(); } catch (Exception ignored) {} track = null; }
        if (tones != null) { tones.release(); tones = null; }
        if (cpuLock != null && cpuLock.isHeld()) cpuLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        members.clear();
        connected = false;
        speaker = 0;
        instance = null;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        changed();
    }

    @Override
    public void onDestroy() {
        if (instance == this) shutdown();
        super.onDestroy();
    }

    /* ---------- Senden ---------- */

    public void toggleTalk() { setTalking(!talking); }

    public synchronized void setTalking(boolean on) {
        if (on == talking) return;
        if (on) {
            if (!connected) { tone(ToneGenerator.TONE_PROP_NACK, 200); lastError = "Noch keine Verbindung"; changed(); return; }
            talking = true;
            playQueue.clear();
            vibrate(40);
            tone(ToneGenerator.TONE_PROP_BEEP, 80);
            main.removeCallbacks(autoStop);
            main.postDelayed(autoStop, MAX_TALK_MS);
            if (recThread == null || !recThread.isAlive()) {
                session = (session + 1) & 0xffff;
                recThread = new Thread(this::recordLoop, "funk-rec");
                recThread.start();
            }
        } else {
            talking = false;
            stopAt = SystemClock.elapsedRealtime() + 250; // Wortende nicht abschneiden
            main.removeCallbacks(autoStop);
            main.postDelayed(() -> { if (!talking) tone(ToneGenerator.TONE_PROP_ACK, 120); }, 300);
        }
        changed();
    }

    private final Runnable autoStop = () -> setTalking(false);

    private void recordLoop() {
        AudioRecord rec = null;
        try {
            int min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, 16000,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min, 16000));
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException("Mikrofon nicht verfügbar");
            rec.startRecording();

            Packet start = new Packet();
            start.type = Packet.START; start.sender = myId; start.session = session; start.name = name;
            send(start);

            Adpcm enc = new Adpcm();
            short[] in = new short[CHUNK * 2];
            short[] down = new short[CHUNK];
            int seq = 0;
            while (running && (talking || SystemClock.elapsedRealtime() < stopAt)) {
                int got = 0;
                while (got < in.length) {
                    int r = rec.read(in, got, in.length - got);
                    if (r <= 0) throw new IllegalStateException("Mikrofon liefert nichts (" + r + ")");
                    got += r;
                }
                // 16 kHz → 8 kHz (Mittelwert als einfacher Tiefpass)
                for (int i = 0; i < CHUNK; i++) down[i] = (short) ((in[2 * i] + in[2 * i + 1]) >> 1);
                Packet a = new Packet();
                a.type = Packet.AUDIO; a.sender = myId; a.session = session; a.seq = seq++;
                a.predictor = enc.predictor; a.index = enc.index;
                a.audio = enc.encode(down, CHUNK);
                send(a);
            }
        } catch (Exception e) {
            lastError = e.getMessage() == null ? "Mikrofonfehler" : e.getMessage();
            main.post(() -> setTalking(false));
        } finally {
            if (rec != null) { try { rec.stop(); } catch (Exception ignored) {} rec.release(); }
            Packet end = new Packet();
            end.type = Packet.END; end.sender = myId; end.session = session;
            send(end);
        }
    }

    private void send(Packet p) {
        Mqtt m = mqtt;
        if (m != null && key != null) m.publish(Packet.seal(key, p.toBytes()));
    }

    private void sendHello(boolean ask) {
        Packet h = new Packet();
        h.type = Packet.HELLO; h.sender = myId; h.name = name; h.ask = ask; h.talking = talking;
        send(h);
    }

    /* ---------- Empfangen ---------- */

    @Override
    public void onConnected() {
        connected = true;
        lastError = "";
        new Thread(() -> sendHello(true)).start();
        changed();
    }

    @Override
    public void onDisconnected(String why) {
        boolean was = connected;
        connected = false;
        if (running) lastError = "Keine Verbindung – versuche erneut …";
        if (was || running) changed();
    }

    @Override
    public void onMessage(byte[] payload) {
        byte[] plain = Packet.open(key, payload);
        if (plain == null) return;
        Packet p;
        try { p = Packet.fromBytes(plain); } catch (Exception e) { return; }
        if (p.sender == myId) return;
        long now = SystemClock.elapsedRealtime();
        Member m = members.get(p.sender);
        if (p.type == Packet.BYE) {
            if (m != null) { members.remove(p.sender); if (speaker == p.sender) endSpeaker(true); changed(); }
            return;
        }
        boolean isNew = m == null;
        if (isNew) { m = new Member(); members.put(p.sender, m); }
        m.seen = now;

        switch (p.type) {
            case Packet.HELLO:
                m.name = p.name;
                if (p.ask) sendHello(false);
                if (isNew) changed();
                break;
            case Packet.START:
                if (!p.name.isEmpty()) m.name = p.name;
                m.talking = true;
                if (speaker == 0 || now - lastAudio > 1500) beginSpeaker(p.sender, p.session, now);
                changed();
                break;
            case Packet.AUDIO:
                if (speaker == 0 || (speaker != p.sender && now - lastAudio > 1500)) beginSpeaker(p.sender, p.session, now);
                if (!m.talking) { m.talking = true; changed(); }
                if (speaker == p.sender && !talking) {
                    lastAudio = now;
                    short[] pcm = Adpcm.decode(p.audio, 0, p.audio.length, p.predictor, p.index);
                    while (playQueue.size() > 15) playQueue.poll();   // Rückstau abbauen
                    playQueue.offer(pcm);
                } else if (speaker == p.sender) lastAudio = now;
                break;
            case Packet.END:
                m.talking = false;
                if (speaker == p.sender) endSpeaker(true);
                changed();
                break;
            default: break;
        }
        if (isNew && p.type != Packet.HELLO) changed();
    }

    private void beginSpeaker(int id, int sess, long now) {
        speaker = id;
        speakerSession = sess;
        lastAudio = now;
        if (!talking) { tone(ToneGenerator.TONE_PROP_BEEP, 60); vibrate(30); }
    }

    private void endSpeaker(boolean roger) {
        speaker = 0;
        if (roger && !talking) {
            long delay = playQueue.size() * 100L + 150;
            main.postDelayed(() -> { if (speaker == 0 && !talking) tone(ToneGenerator.TONE_PROP_ACK, 100); }, delay);
        }
    }

    private void playLoop() {
        boolean primed = false;
        while (running) {
            try {
                short[] c = playQueue.poll(500, TimeUnit.MILLISECONDS);
                if (c == null) { primed = false; continue; }
                if (!primed) {   // kleiner Puffer gegen Aussetzer
                    long t = SystemClock.elapsedRealtime();
                    while (playQueue.isEmpty() && SystemClock.elapsedRealtime() - t < 200) Thread.sleep(10);
                    primed = true;
                }
                AudioTrack t = track;
                if (t != null && !talking) t.write(c, 0, c.length);
            } catch (InterruptedException e) {
                return;
            } catch (Exception ignored) {}
        }
    }

    /* ---------- Takt: Anwesenheit, Zeitüberschreitungen ---------- */

    private int tickCount;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!running) return;
            long now = SystemClock.elapsedRealtime();
            boolean ch = false;
            if (speaker != 0 && now - lastAudio > 2000) {
                Member m = members.get(speaker);
                if (m != null) m.talking = false;
                endSpeaker(true);
                ch = true;
            }
            List<Integer> gone = new ArrayList<>();
            for (Map.Entry<Integer, Member> e : members.entrySet()) {
                if (now - e.getValue().seen > 75000) gone.add(e.getKey());
                else if (e.getValue().talking && e.getKey() != speaker && now - e.getValue().seen > 3000) { e.getValue().talking = false; ch = true; }
            }
            for (Integer g : gone) members.remove(g);
            if (!gone.isEmpty()) ch = true;
            if (++tickCount % 25 == 0 && connected) new Thread(() -> sendHello(false)).start();
            if (ch) changed();
            main.postDelayed(this, 1000);
        }
    };

    /* ---------- Anzeige ---------- */

    public String speakerName() {
        int s = speaker;
        if (s == 0) {
            for (Member m : members.values()) if (m.talking) return m.name.isEmpty() ? "Jemand" : m.name;
            return null;
        }
        Member m = members.get(s);
        return m == null || m.name.isEmpty() ? "Jemand" : m.name;
    }

    public String statusLine() {
        if (!connected) return lastError.isEmpty() ? "Verbinde …" : lastError;
        int n = members.size();
        return n == 0 ? "Warte auf andere …" : n == 1 ? "1 Gerät im Kanal" : n + " Geräte im Kanal";
    }

    private void changed() {
        main.post(() -> {
            PttWidget.updateAll(this);
            if (running) {
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                try { nm.notify(NOTIF_ID, buildNotification()); } catch (Exception ignored) {}
            }
            UiListener l = ui;
            if (l != null) l.onRadioChanged();
        });
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CH_ID, "Funkgerät", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String sp = speakerName();
        String title = talking ? "● Du sendest …" : sp != null ? sp + " spricht" : "Funk an – Kanal „" + channel + "“";
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_ID) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_radio)
            .setContentTitle(title)
            .setContentText(statusLine())
            .setContentIntent(open)
            .setOngoing(true)
            .setShowWhen(false)
            .addAction(new Notification.Action.Builder(null, talking ? "Senden beenden" : "Sprechen",
                PttWidget.toggleIntent(this)).build())
            .addAction(new Notification.Action.Builder(null, "Ausschalten", PttWidget.offIntent(this)).build());
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    private void tone(int t, int ms) {
        ToneGenerator g = tones;
        if (g != null) try { g.startTone(t, ms); } catch (Exception ignored) {}
    }

    private void vibrate(int ms) {
        Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (v != null && v.hasVibrator()) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
    }
}
