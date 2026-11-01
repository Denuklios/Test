package de.funkgeraet.walkie;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

/** Erzeugt alle Effekt-Klänge (8 kHz): Roger-Töne, Funkrauschen, Morsezeichen, Klingeln. */
public final class Sfx {
    public static final int RATE = 8000;
    public static final String[] ROGER_NAMES = { "Klassisch", "Piep", "Melodie", "Weltraum", "Aus" };
    public static final int ROGER_OFF = 4;
    public static final int MORSE_UNIT_MS = 75;   // ca. 16 Wörter pro Minute
    public static final int MORSE_HZ = 700;

    private static final Random RNG = new Random();

    /** Wachsender Klangpuffer. */
    public static final class Buf {
        private short[] d = new short[RATE];
        public int n;

        void add(double v) {
            if (n == d.length) d = java.util.Arrays.copyOf(d, d.length * 2);
            int s = (int) Math.round(v * 32767);
            d[n++] = (short) Math.max(-32768, Math.min(32767, s));
        }

        public int ms() { return n * 1000 / RATE; }
        public short[] get() { return java.util.Arrays.copyOf(d, n); }
    }

    public static void tone(Buf b, double hz, int ms, double vol) {
        int len = ms * RATE / 1000, fade = Math.min(len / 4, RATE / 200);
        for (int i = 0; i < len; i++) {
            double env = Math.min(1, Math.min(i, len - 1 - i) / (double) Math.max(1, fade));
            b.add(Math.sin(2 * Math.PI * hz * i / RATE) * vol * env);
        }
    }

    public static void silence(Buf b, int ms) {
        for (int i = 0, len = ms * RATE / 1000; i < len; i++) b.add(0);
    }

    /** Funkrauschen (Rauschsperre öffnet/schließt). */
    public static void noise(Buf b, int ms, double vol) {
        int len = ms * RATE / 1000;
        double lp = 0;
        for (int i = 0; i < len; i++) {
            double env = Math.min(1, Math.min(i, len - 1 - i) / (RATE * 0.01));
            lp += (RNG.nextGaussian() - lp) * 0.55;
            b.add(lp * vol * env * 0.6);
        }
    }

    public static void roger(Buf b, int style) {
        switch (style) {
            case 0: tone(b, 1200, 70, 0.35); tone(b, 900, 90, 0.35); break;
            case 1: tone(b, 1000, 160, 0.35); break;
            case 2: tone(b, 880, 70, 0.3); tone(b, 1109, 70, 0.3); tone(b, 1319, 110, 0.3); break;
            case 3: {
                int len = 320 * RATE / 1000;
                double ph = 0;
                for (int i = 0; i < len; i++) {
                    double t = i / (double) len;
                    double hz = 2200 * Math.pow(0.18, t) + 60 * Math.sin(2 * Math.PI * 22 * i / RATE);
                    ph += 2 * Math.PI * hz / RATE;
                    b.add(Math.sin(ph) * 0.3 * Math.min(1, (1 - t) * 6));
                }
                break;
            }
            default: break;
        }
    }

    /** Ende einer Durchsage beim Empfänger: Roger-Ton des Senders, danach Rauschen. */
    public static short[] endOfTransmission(int roger, boolean staticNoise) {
        Buf b = new Buf();
        if (roger != ROGER_OFF) { silence(b, 40); roger(b, roger); }
        if (staticNoise) noise(b, 220, 0.5);
        return b.get();
    }

    public static short[] squelchOpen() {
        Buf b = new Buf();
        noise(b, 110, 0.45);
        return b.get();
    }

    /** Klingeln wie ein altes Telefon. */
    public static short[] ring() {
        Buf b = new Buf();
        for (int k = 0; k < 3; k++) {
            int len = 450 * RATE / 1000;
            for (int i = 0; i < len; i++) {
                boolean hi = (i * 25 / RATE) % 2 == 0;
                double env = Math.min(1, Math.min(i, len - 1 - i) / 60.0);
                b.add((Math.sin(2 * Math.PI * (hi ? 1100 : 1350) * i / RATE) * 0.32) * env);
            }
            silence(b, 220);
        }
        return b.get();
    }

    /* ---------- Morse ---------- */

    private static final Map<Character, String> MORSE = new HashMap<>();
    static {
        String[] t = { "A.-", "B-...", "C-.-.", "D-..", "E.", "F..-.", "G--.", "H....", "I..", "J.---", "K-.-", "L.-..",
            "M--", "N-.", "O---", "P.--.", "Q--.-", "R.-.", "S...", "T-", "U..-", "V...-", "W.--", "X-..-", "Y-.--",
            "Z--..", "0-----", "1.----", "2..---", "3...--", "4....-", "5.....", "6-....", "7--...", "8---..",
            "9----.", "..-.-.-", ",--..--", "?..--..", "!-.-.--", "/-..-.", "@.--.-.", "=-...-", "+.-.-.", "--....-" };
        for (String s : t) MORSE.put(s.charAt(0), s.substring(1));
    }

    /** Text auf morsbare Zeichen bringen (Umlaute ausgeschrieben). */
    public static String morseText(String s) {
        String u = s.toUpperCase(Locale.GERMAN).replace("Ä", "AE").replace("Ö", "OE").replace("Ü", "UE").replace("ß", "SS");
        StringBuilder sb = new StringBuilder();
        for (char c : u.toCharArray()) {
            if (c == ' ' || Character.isWhitespace(c)) { if (sb.length() > 0 && sb.charAt(sb.length() - 1) != ' ') sb.append(' '); }
            else if (MORSE.containsKey(c)) sb.append(c);
        }
        String r = sb.toString().trim();
        return r.length() > 40 ? r.substring(0, 40).trim() : r;
    }

    public static String code(char c) { String s = MORSE.get(c); return s == null ? "" : s; }

    /** Ergebnis: Klang, Startzeit jedes Zeichens und An/Aus-Zeiten (für die Taschenlampe). */
    public static final class Morse {
        public short[] pcm;
        public int[] charStartMs;
        public List<int[]> onOff = new ArrayList<>();   // {start, dauer} in ms
        public int totalMs;
    }

    public static Morse morse(String text) {
        Buf b = new Buf();
        Morse m = new Morse();
        m.charStartMs = new int[text.length()];
        int u = MORSE_UNIT_MS;
        silence(b, 150);
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            m.charStartMs[i] = b.ms();
            if (c == ' ') { silence(b, u * 4); continue; }   // + 3 nach dem letzten Zeichen = 7
            String code = code(c);
            for (int k = 0; k < code.length(); k++) {
                int len = code.charAt(k) == '.' ? u : 3 * u;
                m.onOff.add(new int[] { b.ms(), len });
                tone(b, MORSE_HZ, len, 0.4);
                if (k < code.length() - 1) silence(b, u);
            }
            silence(b, 3 * u);
        }
        silence(b, 100);
        m.pcm = b.get();
        m.totalMs = b.ms();
        return m;
    }
}
