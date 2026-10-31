package de.funkgeraet.walkie;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Kleiner MQTT-3.1.1-Client (nur QoS 0) – genug, um über einen öffentlichen Vermittlungsserver
 * Funkpakete an alle Geräte im selben Kanal zu verteilen. Verbindet sich bei Abbruch selbst neu.
 */
public final class Mqtt {
    public interface Listener {
        void onConnected();
        void onDisconnected(String why);
        void onMessage(byte[] payload);
    }

    private final String host;
    private final int port;
    private final boolean tls;
    private final String topic;
    private final byte[] will;
    private final Listener listener;
    private final String clientId;

    private volatile boolean running;
    private volatile boolean connected;
    private volatile Socket socket;
    private OutputStream out;
    private Thread thread;
    private long lastWrite;

    public Mqtt(String host, int port, boolean tls, String topic, byte[] will, Listener listener) {
        this.host = host; this.port = port; this.tls = tls; this.topic = topic; this.will = will; this.listener = listener;
        byte[] r = new byte[6];
        new SecureRandom().nextBytes(r);
        StringBuilder sb = new StringBuilder("funk-");
        for (byte x : r) sb.append(String.format("%02x", x));
        clientId = sb.toString();
    }

    public boolean isConnected() { return connected; }

    public synchronized void start() {
        if (running) return;
        running = true;
        thread = new Thread(this::loop, "mqtt");
        thread.start();
    }

    public void stop() {
        running = false;
        try { synchronized (this) { if (connected && out != null) { out.write(new byte[] { (byte) 0xE0, 0 }); out.flush(); } } } catch (IOException ignored) {}
        closeSocket();
        if (thread != null) thread.interrupt();
    }

    /** Sendet an alle im Kanal. false, wenn gerade keine Verbindung besteht. */
    public boolean publish(byte[] payload) {
        if (!connected) return false;
        byte[] t = topic.getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream body = new ByteArrayOutputStream(payload.length + t.length + 2);
        writeString(body, t);
        body.write(payload, 0, payload.length);
        try {
            send(0x30, body.toByteArray());
            return true;
        } catch (IOException e) {
            closeSocket();
            return false;
        }
    }

    private void loop() {
        int backoff = 1000;
        while (running) {
            try {
                connectOnce();
                backoff = 1000;
                readLoop();
            } catch (Exception e) {
                if (connected) { connected = false; listener.onDisconnected(String.valueOf(e.getMessage())); }
                else listener.onDisconnected(String.valueOf(e.getMessage()));
            }
            connected = false;
            closeSocket();
            if (!running) break;
            try { Thread.sleep(backoff); } catch (InterruptedException ignored) {}
            backoff = Math.min(backoff * 2, 15000);
        }
    }

    private void connectOnce() throws IOException {
        Socket s;
        if (tls) {
            Socket raw = new Socket();
            raw.connect(new InetSocketAddress(host, port), 10000);
            SSLSocket ssl = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(raw, host, port, true);
            ssl.startHandshake();
            s = ssl;
        } else {
            s = new Socket();
            s.connect(new InetSocketAddress(host, port), 10000);
        }
        s.setTcpNoDelay(true);
        s.setSoTimeout(15000);
        socket = s;
        out = new BufferedOutputStream(s.getOutputStream(), 4096);
        DataInputStream in = new DataInputStream(s.getInputStream());

        // CONNECT
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        writeString(b, "MQTT".getBytes(StandardCharsets.UTF_8));
        b.write(4);                                     // Protokoll 3.1.1
        b.write(0x02 | (will != null ? 0x04 : 0));      // clean session (+ Testament)
        b.write(0); b.write(30);                        // keep alive 30 s
        writeString(b, clientId.getBytes(StandardCharsets.UTF_8));
        if (will != null) { writeString(b, topic.getBytes(StandardCharsets.UTF_8)); writeString(b, will); }
        send(0x10, b.toByteArray());

        int h = in.readUnsignedByte();
        int len = readLength(in);
        byte[] ack = new byte[len];
        in.readFully(ack);
        if (h != 0x20 || len < 2 || ack[1] != 0) throw new IOException("Server lehnt ab (" + (len >= 2 ? ack[1] : -1) + ")");

        // SUBSCRIBE
        ByteArrayOutputStream sub = new ByteArrayOutputStream();
        sub.write(0); sub.write(1);                     // Paket-ID 1
        writeString(sub, topic.getBytes(StandardCharsets.UTF_8));
        sub.write(0);                                   // QoS 0
        send(0x82, sub.toByteArray());
        lastSocketIn = in;
    }

    private DataInputStream lastSocketIn;

    private void readLoop() throws IOException {
        DataInputStream in = lastSocketIn;
        boolean subscribed = false;
        while (running) {
            int h;
            try {
                h = in.readUnsignedByte();
            } catch (java.net.SocketTimeoutException e) {
                ping();
                continue;
            }
            int len = readLength(in);
            byte[] d = new byte[len];
            in.readFully(d);
            int type = h >> 4;
            if (type == 9 && !subscribed) {            // SUBACK
                subscribed = true;
                connected = true;
                listener.onConnected();
            } else if (type == 3) {                     // PUBLISH
                int tl = ((d[0] & 0xff) << 8) | (d[1] & 0xff);
                int pos = 2 + tl;
                if (((h >> 1) & 3) > 0) pos += 2;       // Paket-ID bei QoS > 0
                if (pos <= len) {
                    byte[] payload = new byte[len - pos];
                    System.arraycopy(d, pos, payload, 0, payload.length);
                    try { listener.onMessage(payload); } catch (Exception ignored) {}
                }
            }
            if (System.currentTimeMillis() - lastWrite > 20000) ping();
        }
    }

    private void ping() throws IOException {
        send(0xC0, new byte[0]);
    }

    private synchronized void send(int header, byte[] body) throws IOException {
        if (out == null) throw new IOException("keine Verbindung");
        out.write(header);
        int len = body.length;
        do {
            int digit = len % 128;
            len /= 128;
            out.write(len > 0 ? digit | 0x80 : digit);
        } while (len > 0);
        out.write(body);
        out.flush();
        lastWrite = System.currentTimeMillis();
    }

    private static int readLength(DataInputStream in) throws IOException {
        int mult = 1, value = 0, b;
        do {
            b = in.readUnsignedByte();
            value += (b & 127) * mult;
            mult *= 128;
            if (mult > 128 * 128 * 128 * 128) throw new IOException("ungültige Länge");
        } while ((b & 128) != 0);
        return value;
    }

    private static void writeString(ByteArrayOutputStream b, byte[] s) {
        b.write(s.length >> 8);
        b.write(s.length & 0xff);
        b.write(s, 0, s.length);
    }

    private void closeSocket() {
        connected = false;
        Socket s = socket;
        socket = null;
        if (s != null) try { s.close(); } catch (IOException ignored) {}
        synchronized (this) { out = null; }
    }
}
