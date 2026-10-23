package de.obdwerkstatt.core;

public final class Hex {
    private Hex() {
    }

    public static String b(int v) {
        String s = Integer.toHexString(v & 0xFF).toUpperCase();
        return s.length() == 1 ? "0" + s : s;
    }

    public static String join(int[] d, int from, int to) {
        StringBuilder sb = new StringBuilder();
        for (int i = from; i < to && i < d.length; i++) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(b(d[i]));
        }
        return sb.toString();
    }

    public static boolean isHex(String s) {
        if (s.isEmpty()) return false;
        for (int i = 0; i < s.length(); i++) {
            if (Character.digit(s.charAt(i), 16) < 0) return false;
        }
        return true;
    }

    public static int parse(String s) {
        return Integer.parseInt(s, 16);
    }

    /** Druckbare ASCII-Zeichen aus einem Byte-Bereich. */
    public static String ascii(int[] d, int from) {
        StringBuilder sb = new StringBuilder();
        for (int i = from; i < d.length; i++) {
            int c = d[i];
            if (c >= 0x20 && c < 0x7F) sb.append((char) c);
        }
        return sb.toString().trim();
    }
}
