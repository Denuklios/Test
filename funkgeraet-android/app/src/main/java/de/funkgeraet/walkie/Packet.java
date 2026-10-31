package de.funkgeraet.walkie;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Locale;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Funkpakete. Alles wird mit einem aus dem Kanalnamen abgeleiteten Schlüssel (AES-GCM) verschlüsselt,
 * damit auf dem öffentlichen Vermittlungsserver niemand ohne Kanalnamen mithören kann.
 */
public final class Packet {
    public static final byte HELLO = 1, BYE = 2, START = 3, AUDIO = 4, END = 5;

    public byte type;
    public int sender;
    public String name = "";
    public boolean ask, talking;     // HELLO
    public int session, seq;         // START/AUDIO/END
    public int predictor, index;     // AUDIO: ADPCM-Startzustand
    public byte[] audio = new byte[0];

    /* ---------- Kanal → Thema und Schlüssel ---------- */

    public static String normalize(String channel) {
        return channel.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    public static String topic(String channel) {
        byte[] h = sha256("funkgeraet-topic|" + normalize(channel));
        StringBuilder sb = new StringBuilder("funkgeraet-v1/");
        for (int i = 0; i < 16; i++) sb.append(String.format("%02x", h[i]));
        return sb.toString();
    }

    public static byte[] key(String channel) {
        return sha256("funkgeraet-key|" + normalize(channel));
    }

    private static byte[] sha256(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    /* ---------- Kodieren ---------- */

    public byte[] toBytes() {
        byte[] n = name.getBytes(StandardCharsets.UTF_8);
        if (n.length > 60) n = java.util.Arrays.copyOf(n, 60);
        ByteBuffer b = ByteBuffer.allocate(16 + n.length + audio.length);
        b.put(type).putInt(sender);
        switch (type) {
            case HELLO: b.put((byte) ((ask ? 1 : 0) | (talking ? 2 : 0))).put(n); break;
            case START: b.putShort((short) session).put(n); break;
            case AUDIO: b.putShort((short) session).putShort((short) seq).putShort((short) predictor).put((byte) index).put(audio); break;
            case END: b.putShort((short) session); break;
            default: break;
        }
        byte[] out = new byte[b.position()];
        b.flip(); b.get(out);
        return out;
    }

    public static Packet fromBytes(byte[] d) {
        ByteBuffer b = ByteBuffer.wrap(d);
        Packet p = new Packet();
        p.type = b.get();
        p.sender = b.getInt();
        switch (p.type) {
            case HELLO: { int f = b.get(); p.ask = (f & 1) != 0; p.talking = (f & 2) != 0; p.name = rest(b); break; }
            case START: p.session = b.getShort() & 0xffff; p.name = rest(b); break;
            case AUDIO:
                p.session = b.getShort() & 0xffff; p.seq = b.getShort() & 0xffff;
                p.predictor = b.getShort(); p.index = b.get();
                p.audio = new byte[b.remaining()]; b.get(p.audio);
                break;
            case END: p.session = b.getShort() & 0xffff; break;
            case BYE: break;
            default: throw new IllegalArgumentException("unbekannter Pakettyp");
        }
        return p;
    }

    private static String rest(ByteBuffer b) {
        byte[] s = new byte[b.remaining()];
        b.get(s);
        return new String(s, StandardCharsets.UTF_8);
    }

    /* ---------- Verschlüsseln ---------- */

    private static final SecureRandom RNG = new SecureRandom();

    public static byte[] seal(byte[] key, byte[] plain) {
        try {
            byte[] iv = new byte[12];
            RNG.nextBytes(iv);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
            byte[] ct = c.doFinal(plain);
            byte[] out = new byte[12 + ct.length];
            System.arraycopy(iv, 0, out, 0, 12);
            System.arraycopy(ct, 0, out, 12, ct.length);
            return out;
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    /** null, wenn das Paket nicht zu diesem Kanal gehört oder beschädigt ist. */
    public static byte[] open(byte[] key, byte[] sealed) {
        if (sealed == null || sealed.length < 12 + 16 + 5) return null;
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, sealed, 0, 12));
            return c.doFinal(sealed, 12, sealed.length - 12);
        } catch (Exception e) { return null; }
    }
}
