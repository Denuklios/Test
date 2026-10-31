package de.funkgeraet.walkie;

import static org.junit.Assert.*;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.Assume;
import org.junit.Test;

public class CoreTest {

    @Test public void adpcmRoundTripKeepsSpeechShape() {
        short[] s = new short[800];
        for (int i = 0; i < s.length; i++)
            s[i] = (short) (8000 * Math.sin(i * 2 * Math.PI * 440 / 8000) + 3000 * Math.sin(i * 2 * Math.PI * 1300 / 8000));
        Adpcm enc = new Adpcm();
        int p0 = enc.predictor, i0 = enc.index;
        byte[] a = enc.encode(s, s.length);
        assertEquals(400, a.length);
        // zweites Paket: mit mitgeliefertem Zustand eigenständig dekodierbar
        int p1 = enc.predictor, i1 = enc.index;
        byte[] b = enc.encode(s, s.length);
        short[] da = Adpcm.decode(a, 0, a.length, p0, i0);
        short[] db = Adpcm.decode(b, 0, b.length, p1, i1);
        double sig = 0, err = 0;
        for (int i = 0; i < s.length; i++) { sig += s[i] * (double) s[i]; err += Math.pow(s[i] - db[i], 2); }
        double snr = 10 * Math.log10(sig / err);
        assertTrue("SNR " + snr, snr > 18);
        assertEquals(800, da.length);
    }

    @Test public void packetsRoundTripAndAreEncrypted() {
        byte[] k = Packet.key("Falke 4271");
        assertArrayEquals(k, Packet.key("  falke   4271 "));
        assertEquals(Packet.topic("Falke 4271"), Packet.topic("falke 4271"));
        assertNotEquals(Packet.topic("falke 4271"), Packet.topic("falke 4272"));

        Packet a = new Packet();
        a.type = Packet.AUDIO; a.sender = 12345; a.session = 65000; a.seq = 7; a.predictor = -1234; a.index = 55;
        a.audio = new byte[] { 1, 2, 3, (byte) 200 };
        byte[] sealed = Packet.seal(k, a.toBytes());
        assertNull(Packet.open(Packet.key("anderer kanal"), sealed));
        Packet b = Packet.fromBytes(Packet.open(k, sealed));
        assertEquals(Packet.AUDIO, b.type);
        assertEquals(12345, b.sender);
        assertEquals(65000, b.session);
        assertEquals(7, b.seq);
        assertEquals(-1234, b.predictor);
        assertEquals(55, b.index);
        assertArrayEquals(a.audio, b.audio);

        Packet h = new Packet();
        h.type = Packet.HELLO; h.sender = -5; h.name = "Jürgen"; h.ask = true;
        Packet h2 = Packet.fromBytes(Packet.open(k, Packet.seal(k, h.toBytes())));
        assertEquals("Jürgen", h2.name);
        assertTrue(h2.ask);
        assertFalse(h2.talking);
        assertEquals(-5, h2.sender);
    }

    /** Braucht einen lokalen MQTT-Server: -Dmqtt.port=1883 (wird sonst übersprungen). */
    @Test public void mqttDeliversBetweenClientsAndWill() throws Exception {
        String port = System.getProperty("mqtt.port", System.getenv("MQTT_PORT"));
        Assume.assumeTrue(port != null && !port.isEmpty());
        int p = Integer.parseInt(port);
        String topic = Packet.topic("test-" + System.nanoTime());

        LinkedBlockingQueue<byte[]> got = new LinkedBlockingQueue<>();
        CountDownLatch up = new CountDownLatch(2);
        Mqtt.Listener recv = new Mqtt.Listener() {
            public void onConnected() { up.countDown(); }
            public void onDisconnected(String why) {}
            public void onMessage(byte[] d) { got.add(d); }
        };
        Mqtt.Listener send = new Mqtt.Listener() {
            public void onConnected() { up.countDown(); }
            public void onDisconnected(String why) {}
            public void onMessage(byte[] d) {}
        };
        Mqtt b = new Mqtt("127.0.0.1", p, false, topic, null, recv);
        Mqtt a = new Mqtt("127.0.0.1", p, false, topic, "tschuess".getBytes(), send);
        b.start(); a.start();
        assertTrue(up.await(5, TimeUnit.SECONDS));

        byte[] big = new byte[450];
        for (int i = 0; i < big.length; i++) big[i] = (byte) i;
        for (int i = 0; i < 50; i++) { big[0] = (byte) i; assertTrue(a.publish(big.clone())); }
        for (int i = 0; i < 50; i++) {
            byte[] d = got.poll(3, TimeUnit.SECONDS);
            assertNotNull("Paket " + i, d);
            assertEquals(450, d.length);
            assertEquals((byte) i, d[0]);
            assertEquals((byte) 200, d[200]);
        }
        got.clear();
        // harter Abbruch ohne DISCONNECT → Server verschickt das Testament
        java.lang.reflect.Field f = Mqtt.class.getDeclaredField("socket");
        f.setAccessible(true);
        java.lang.reflect.Field r = Mqtt.class.getDeclaredField("running");
        r.setAccessible(true);
        r.set(a, false);
        ((java.net.Socket) f.get(a)).close();
        byte[] will = got.poll(5, TimeUnit.SECONDS);
        assertNotNull("Testament", will);
        assertEquals("tschuess", new String(will));
        b.stop();
    }
}
