package de.funkgeraet.walkie;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.NoRouteToHostException;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLException;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Kleiner MQTT-3.1.1-Client (nur QoS 0) – verteilt die Funkpakete über einen öffentlichen Vermittlungsserver.
 * Probiert mehrere Wege zum selben Server (TLS, WebSocket wie ein Browser, unverschlüsselt), weil manche
 * WLANs und Mobilfunknetze einzelne Ports sperren. Die Funkpakete selbst sind immer Ende-zu-Ende verschlüsselt.
 */
public final class Mqtt {
    public interface Listener {
        void onConnected(String via);
        void onDisconnected(String why);
        void onMessage(byte[] payload);
    }

    /** Ein Weg zum Server. */
    public static final class Endpoint {
        public final String host, path;
        public final int port;
        public final boolean tls, ws;

        public Endpoint(String host, int port, boolean tls, boolean ws, String path) {
            this.host = host; this.port = port; this.tls = tls; this.ws = ws; this.path = path;
        }

        @Override public String toString() {
            return (ws ? (tls ? "wss" : "ws") : (tls ? "tls" : "tcp")) + ":" + port;
        }
    }

    /** Aus der Einstellung „host“ oder „host:port“ die Liste der Wege bauen. */
    public static List<Endpoint> endpoints(String setting) {
        String s = setting == null ? "" : setting.trim();
        if (s.isEmpty()) s = "broker.hivemq.com";
        String host = s;
        int port = -1;
        int colon = s.lastIndexOf(':');
        if (colon > 0) {
            host = s.substring(0, colon);
            try { port = Integer.parseInt(s.substring(colon + 1)); } catch (NumberFormatException ignored) {}
        }
        List<Endpoint> l = new ArrayList<>();
        String h = host.toLowerCase(Locale.ROOT);
        boolean known = h.equals("broker.hivemq.com") || h.equals("broker.emqx.io") || h.equals("test.mosquitto.org");
        if (known && (port == -1 || port == 8883)) {
            // alle Zugänge desselben Servers – die Geräte treffen sich trotzdem
            l.add(new Endpoint(host, 8883, true, false, null));
            if (h.equals("broker.hivemq.com")) {
                l.add(new Endpoint(host, 8884, true, true, "/mqtt"));
                l.add(new Endpoint(host, 1883, false, false, null));
                l.add(new Endpoint(host, 8000, false, true, "/mqtt"));
            } else if (h.equals("broker.emqx.io")) {
                l.add(new Endpoint(host, 8084, true, true, "/mqtt"));
                l.add(new Endpoint(host, 1883, false, false, null));
                l.add(new Endpoint(host, 8083, false, true, "/mqtt"));
            } else {
                l.add(new Endpoint(host, 8081, true, true, "/"));
                l.add(new Endpoint(host, 1883, false, false, null));
                l.add(new Endpoint(host, 8080, false, true, "/"));
            }
            return l;
        }
        if (port == -1) port = 8883;
        boolean ws = port == 443 || port == 80 || port == 8884 || port == 8084 || port == 8000 || port == 8083 || port == 8081 || port == 8080;
        boolean tls = !(port == 1883 || port == 80 || port == 8000 || port == 8083 || port == 8080);
        l.add(new Endpoint(host, port, tls, ws, ws ? "/mqtt" : null));
        return l;
    }

    private final List<Endpoint> endpoints;
    private final String topic;
    private final byte[] will;
    private final Listener listener;
    private final String clientId;

    private volatile boolean running;
    private volatile boolean connected;
    private volatile Socket socket;
    private OutputStream out;
    private DataInputStream in;
    private Thread thread;
    private volatile long lastWrite, lastRead;
    private int current;

    public Mqtt(List<Endpoint> endpoints, String topic, byte[] will, Listener listener) {
        this.endpoints = endpoints; this.topic = topic; this.will = will; this.listener = listener;
        byte[] r = new byte[6];
        new SecureRandom().nextBytes(r);
        StringBuilder sb = new StringBuilder("funk-");
        for (byte x : r) sb.append(String.format("%02x", x));
        clientId = sb.toString();
    }

    /** Einfacher Zugang (für Tests). */
    public Mqtt(String host, int port, boolean tls, String topic, byte[] will, Listener listener) {
        this(java.util.Collections.singletonList(new Endpoint(host, port, tls, false, null)), topic, will, listener);
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

    /** Netz hat gewechselt (WLAN ↔ Mobilfunk): sofort neu verbinden. */
    public void kick() {
        closeSocket();
        Thread t = thread;
        if (t != null) t.interrupt();
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
        int backoff = 1000, failsInRound = 0;
        while (running) {
            Endpoint ep = endpoints.get(current % endpoints.size());
            try {
                connectOnce(ep);
                backoff = 1000;
                failsInRound = 0;
                readLoop(ep);
            } catch (Exception e) {
                boolean was = connected;
                connected = false;
                if (running) listener.onDisconnected(describe(e) + (endpoints.size() > 1 && !was ? " [" + ep + "]" : ""));
                if (!was) { current++; failsInRound++; }
            }
            connected = false;
            closeSocket();
            if (!running) break;
            // erst alle Wege durchprobieren, dann warten
            if (failsInRound > 0 && failsInRound < endpoints.size()) continue;
            failsInRound = 0;
            try { Thread.sleep(backoff); } catch (InterruptedException ignored) {}
            backoff = Math.min(backoff * 2, 15000);
        }
    }

    static String describe(Throwable e) {
        if (e instanceof UnknownHostException) return "Server nicht gefunden – Internet aus oder Werbeblocker/Private DNS?";
        if (e instanceof SocketTimeoutException) return "Server antwortet nicht (Zeitüberschreitung)";
        if (e instanceof ConnectException || e instanceof NoRouteToHostException) return "Server nicht erreichbar (Netz sperrt?)";
        if (e instanceof SSLException) return "Verschlüsselung fehlgeschlagen (Uhrzeit falsch?)";
        if (e instanceof EOFException) return "Verbindung vom Netz getrennt";
        String m = e.getMessage();
        return m == null || m.isEmpty() ? e.getClass().getSimpleName() : m;
    }

    private void connectOnce(Endpoint ep) throws IOException {
        Socket raw = new Socket();
        socket = raw;
        raw.connect(new InetSocketAddress(ep.host, ep.port), 8000);
        Socket s = raw;
        if (ep.tls) {
            SSLSocket ssl = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(raw, ep.host, ep.port, true);
            ssl.setSoTimeout(8000);
            ssl.startHandshake();
            if (!HttpsURLConnection.getDefaultHostnameVerifier().verify(ep.host, ssl.getSession()))
                throw new SSLException("Zertifikat passt nicht zum Server");
            s = ssl;
        }
        socket = s;
        s.setTcpNoDelay(true);
        s.setSoTimeout(10000);
        InputStream is = s.getInputStream();
        OutputStream os = s.getOutputStream();
        if (ep.ws) {
            WsIn wi = new WsIn(is);
            WsOut wo = new WsOut(os);
            wi.pongTo = wo;
            wsHandshake(ep, is, os);
            is = wi;
            os = wo;
        }
        synchronized (this) { out = new BufferedOutputStream(os, 4096); }
        in = new DataInputStream(is);

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
        lastRead = System.currentTimeMillis();
    }

    private void readLoop(Endpoint ep) throws IOException {
        boolean subscribed = false;
        while (running) {
            int h;
            try {
                h = in.readUnsignedByte();
            } catch (SocketTimeoutException e) {
                // nichts gekommen: Lebenszeichen schicken; bleibt die Antwort aus, ist die Leitung tot
                if (System.currentTimeMillis() - lastRead > 35000) throw new SocketTimeoutException("Leitung tot");
                ping();
                continue;
            }
            int len = readLength(in);
            byte[] d = new byte[len];
            in.readFully(d);
            lastRead = System.currentTimeMillis();
            int type = h >> 4;
            if (type == 9 && !subscribed) {            // SUBACK
                subscribed = true;
                connected = true;
                listener.onConnected(ep.toString());
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

    /* ---------- WebSocket (wie ein Browser, Port 8884/443) ---------- */

    private static final SecureRandom RNG = new SecureRandom();

    private static void wsHandshake(Endpoint ep, InputStream is, OutputStream os) throws IOException {
        byte[] k = new byte[16];
        RNG.nextBytes(k);
        String key = Base64.getEncoder().encodeToString(k);
        String hostHdr = ep.host + ((ep.tls && ep.port == 443) || (!ep.tls && ep.port == 80) ? "" : ":" + ep.port);
        String req = "GET " + ep.path + " HTTP/1.1\r\nHost: " + hostHdr + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            + "Sec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: mqtt\r\n"
            + "Origin: https://" + ep.host + "\r\n\r\n";
        os.write(req.getBytes(StandardCharsets.ISO_8859_1));
        os.flush();
        // Antwortkopf bis zur Leerzeile lesen
        StringBuilder sb = new StringBuilder();
        int c, n = 0;
        while ((c = is.read()) != -1) {
            sb.append((char) c);
            if (++n > 8192) throw new IOException("WebSocket-Antwort zu lang");
            if (sb.length() >= 4 && sb.substring(sb.length() - 4).equals("\r\n\r\n")) break;
        }
        String head = sb.toString();
        if (!head.startsWith("HTTP/1.1 101")) {
            int e = head.indexOf("\r\n");
            throw new IOException("WebSocket abgelehnt: " + (e > 0 ? head.substring(0, e) : head));
        }
    }

    /** Schreibt MQTT-Bytes als maskierte WebSocket-Binärrahmen (ein Rahmen pro flush). */
    static final class WsOut extends OutputStream {
        private final OutputStream os;
        private final ByteArrayOutputStream buf = new ByteArrayOutputStream();

        WsOut(OutputStream os) { this.os = os; }

        @Override public synchronized void write(int b) { buf.write(b); }
        @Override public synchronized void write(byte[] b, int off, int len) { buf.write(b, off, len); }

        @Override public synchronized void flush() throws IOException {
            if (buf.size() == 0) return;
            frame(0x2, buf.toByteArray());
            buf.reset();
        }

        synchronized void frame(int opcode, byte[] p) throws IOException {
            ByteArrayOutputStream f = new ByteArrayOutputStream(p.length + 14);
            f.write(0x80 | opcode);
            if (p.length < 126) f.write(0x80 | p.length);
            else if (p.length < 65536) { f.write(0x80 | 126); f.write(p.length >> 8); f.write(p.length & 0xff); }
            else { f.write(0x80 | 127); for (int i = 7; i >= 0; i--) f.write((int) ((long) p.length >> (8 * i)) & 0xff); }
            byte[] mask = new byte[4];
            RNG.nextBytes(mask);
            f.write(mask, 0, 4);
            for (int i = 0; i < p.length; i++) f.write(p[i] ^ mask[i & 3]);
            os.write(f.toByteArray());
            os.flush();
        }

        @Override public void close() throws IOException { os.close(); }
    }

    /** Liest WebSocket-Rahmen und liefert deren Inhalt als fortlaufenden Datenstrom. */
    static final class WsIn extends InputStream {
        private final DataInputStream is;
        private byte[] cur = new byte[0];
        private int pos;
        WsOut pongTo;

        WsIn(InputStream is) { this.is = new DataInputStream(is); }

        private boolean fill() throws IOException {
            while (pos >= cur.length) {
                int b0 = is.readUnsignedByte();
                int b1 = is.readUnsignedByte();
                long len = b1 & 127;
                if (len == 126) len = is.readUnsignedShort();
                else if (len == 127) len = is.readLong();
                if (len > 1 << 24) throw new IOException("WebSocket-Rahmen zu groß");
                byte[] mask = (b1 & 0x80) != 0 ? new byte[4] : null;
                if (mask != null) is.readFully(mask);
                byte[] p = new byte[(int) len];
                is.readFully(p);
                if (mask != null) for (int i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
                int op = b0 & 0xf;
                if (op == 0x8) throw new EOFException();
                if (op == 0x9) { if (pongTo != null) pongTo.frame(0xA, p); continue; }
                if (op == 0xA) continue;
                cur = p;
                pos = 0;
            }
            return true;
        }

        @Override public int read() throws IOException {
            fill();
            return cur[pos++] & 0xff;
        }

        @Override public int read(byte[] b, int off, int len) throws IOException {
            if (len == 0) return 0;
            fill();
            int n = Math.min(len, cur.length - pos);
            System.arraycopy(cur, pos, b, off, n);
            pos += n;
            return n;
        }

        @Override public int available() { return cur.length - pos; }
    }
}
