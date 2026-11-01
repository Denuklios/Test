package de.funkgeraet.walkie;

import static org.junit.Assert.*;

import org.junit.Test;

public class ExtrasTest {

    @Test public void morseTextAndTiming() {
        assertEquals("SOS", Sfx.morseText("sos"));
        assertEquals("GRUESSE AUS KOELN", Sfx.morseText("Grüße  aus Köln#"));
        assertEquals("...", Sfx.code('S'));
        assertEquals("---", Sfx.code('O'));
        Sfx.Morse m = Sfx.morse("SOS");
        assertEquals(9, m.onOff.size());                       // 3 + 3 + 3 Elemente
        int u = Sfx.MORSE_UNIT_MS;
        assertEquals(u, m.onOff.get(0)[1]);                    // Punkt
        assertEquals(3 * u, m.onOff.get(3)[1]);                // Strich
        // Zeichenabstand: zweites Zeichen startet 3 Einheiten nach Ende des ersten
        int endS = m.onOff.get(2)[0] + m.onOff.get(2)[1];
        assertEquals(endS + 3 * u, m.charStartMs[1], 2);
        assertEquals(m.totalMs, m.pcm.length * 1000 / Sfx.RATE);
    }

    @Test public void newPacketsRoundTrip() {
        byte[] k = Packet.key("x");
        Packet m = new Packet();
        m.type = Packet.MORSE; m.sender = 9; m.name = "Jeannine"; m.text = "SOS";
        Packet r = Packet.fromBytes(Packet.open(k, Packet.seal(k, m.toBytes())));
        assertEquals(Packet.MORSE, r.type);
        assertEquals("Jeannine", r.name);
        assertEquals("SOS", r.text);
        Packet g = new Packet();
        g.type = Packet.RING; g.sender = 9; g.name = "Robert";
        assertEquals("Robert", Packet.fromBytes(g.toBytes()).name);
        Packet e = new Packet();
        e.type = Packet.END; e.sender = 1; e.session = 77; e.roger = 3;
        Packet e2 = Packet.fromBytes(e.toBytes());
        assertEquals(3, e2.roger);
        assertEquals(77, e2.session);
        // altes END (ohne Roger-Byte) bleibt lesbar
        byte[] old = java.util.Arrays.copyOf(e.toBytes(), e.toBytes().length - 1);
        assertEquals(0, Packet.fromBytes(old).roger);
    }

    private static double freq(short[] s, int from) {
        int z = 0;
        for (int i = from + 1; i < s.length; i++) if ((s[i - 1] < 0) != (s[i] < 0)) z++;
        return z / 2.0 / ((s.length - from) / (double) Sfx.RATE);
    }

    private static short[] sine(double hz, int n) {
        short[] s = new short[n];
        for (int i = 0; i < n; i++) s[i] = (short) (10000 * Math.sin(2 * Math.PI * hz * i / Sfx.RATE));
        return s;
    }

    @Test public void pitchEffectsShiftPitch() {
        for (int[] c : new int[][] { { VoiceFx.MICKY, 165 }, { VoiceFx.MONSTER, 62 } }) {
            VoiceFx fx = new VoiceFx(c[0]);
            short[] all = sine(300, 8000);
            for (int i = 0; i < all.length; i += 800) {
                short[] chunk = java.util.Arrays.copyOfRange(all, i, i + 800);
                fx.process(chunk);
                System.arraycopy(chunk, 0, all, i, 800);
            }
            double f = freq(all, 2000);
            assertEquals("Effekt " + c[0], 300 * c[1] / 100.0, f, 300 * c[1] / 100.0 * 0.12);
        }
    }

    @Test public void allEffectsStayInRangeAndMakeSound() {
        for (int mode = 0; mode < VoiceFx.NAMES.length; mode++) {
            VoiceFx fx = new VoiceFx(mode);
            short[] s = sine(440, 800);
            fx.process(s);
            long e = 0;
            for (short v : s) e += Math.abs(v);
            assertTrue(VoiceFx.NAMES[mode], e > 800 * 300);
        }
        assertTrue(Sfx.ring().length > 8000);
        for (int r = 0; r < Sfx.ROGER_NAMES.length; r++) assertNotNull(Sfx.endOfTransmission(r, true));
    }
}
