package de.obdwerkstatt.core;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/**
 * Simulierter ELM327 mit CAN-Fahrzeug (11 Bit, 500 kBit/s) zum Ausprobieren ohne Auto.
 * Motor 7E0/7E8, Getriebe 7E1/7E9, ABS 713/77D, Airbag 715/77F.
 */
public final class DemoTransport extends Transport {
    private final long start = System.currentTimeMillis();
    private boolean cleared;
    private boolean absCleared;
    private String header = "7DF";

    private static final int[] ENGINE_PIDS = {0x01, 0x03, 0x04, 0x05, 0x06, 0x07, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
            0x10, 0x11, 0x13, 0x14, 0x15, 0x1C, 0x1F, 0x21, 0x2F, 0x30, 0x31, 0x33, 0x3C, 0x42, 0x43, 0x44, 0x45,
            0x46, 0x47, 0x49, 0x4A, 0x4C, 0x4D, 0x4E, 0x51, 0x5C, 0xA6};
    private static final int[] FREEZE_PIDS = {0x02, 0x04, 0x05, 0x06, 0x07, 0x0B, 0x0C, 0x0D, 0x0F, 0x11};
    private static final int[] MIDS = {0x01, 0x02, 0x21, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5};

    @Override
    public void open() {
    }

    @Override
    public void close() {
    }

    @Override
    public String describe() {
        return "Demo-Fahrzeug (simuliert)";
    }

    @Override
    protected void writeBytes(byte[] data) throws IOException {
        String cmd = new String(data, "ISO-8859-1").trim().toUpperCase().replace(" ", "");
        if (cmd.isEmpty()) {
            deliver("");
            return;
        }
        try {
            Thread.sleep(cmd.startsWith("AT") ? 5 : 35);
        } catch (InterruptedException ignored) {
        }
        deliver(respond(cmd));
    }

    private void deliver(String s) throws IOException {
        byte[] b = (s + "\r\r>").getBytes("ISO-8859-1");
        onData(b, b.length);
    }

    private double t() {
        return (System.currentTimeMillis() - start) / 1000.0;
    }

    private String respond(String c) {
        if (c.startsWith("AT")) {
            String a = c.substring(2);
            if (a.equals("Z")) return "\r\rELM327 v1.5";
            if (a.equals("I")) return "ELM327 v1.5";
            if (a.equals("DPN")) return "A6";
            if (a.equals("DP")) return "AUTO, ISO 15765-4 (CAN 11/500)";
            if (a.equals("RV")) return String.format(java.util.Locale.US, "%.1fV", 14.1 + 0.15 * Math.sin(t()));
            if (a.equals("D")) {
                header = "7DF";
                return "OK";
            }
            if (a.startsWith("SH")) header = a.substring(2);
            return "OK";
        }
        if (!Hex.isHex(c) || c.length() % 2 != 0) return "?";
        int[] req = new int[c.length() / 2];
        for (int i = 0; i < req.length; i++) req[i] = Hex.parse(c.substring(i * 2, i * 2 + 2));

        if (header.equals("7DF") || header.equals("7E0") || header.equals("7E1")) {
            boolean func = header.equals("7DF");
            boolean toEngine = func || header.equals("7E0");
            boolean toTrans = func || header.equals("7E1");
            if (req[0] <= 0x0A) {
                StringBuilder sb = new StringBuilder();
                if (toEngine) append(sb, obdEngine(req));
                if (toTrans) append(sb, obdTrans(req));
                return sb.length() == 0 ? "NO DATA" : sb.toString();
            }
            if (header.equals("7E0")) return uds("7E8", req, "ECM Motorelektronik", cleared ? new int[0]
                    : new int[]{0x03, 0x01, 0x00, 0x2F, 0x01, 0x71, 0x00, 0x2F});
            if (header.equals("7E1")) return uds("7E9", req, "TCM Getriebe", cleared ? new int[0]
                    : new int[]{0x07, 0x15, 0x00, 0x28});
        }
        if (header.equals("713")) return uds("77D", req, "ABS/ESP Bremse", absCleared ? new int[0]
                : new int[]{0x40, 0x35, 0x00, 0x09});
        if (header.equals("715")) return uds("77F", req, "Airbag", new int[0]);
        return "NO DATA";
    }

    private static void append(StringBuilder sb, String s) {
        if (s == null) return;
        if (sb.length() > 0) sb.append('\r');
        sb.append(s);
    }

    private String uds(String hdr, int[] r, String name, int[] dtcs) {
        if (r[0] == 0x3E) return isotp(hdr, new int[]{0x7E, 0x00});
        if (r[0] == 0x19 && r.length >= 3) {
            int[] p = new int[3 + dtcs.length];
            p[0] = 0x59;
            p[1] = 0x02;
            p[2] = 0xFF;
            System.arraycopy(dtcs, 0, p, 3, dtcs.length);
            return isotp(hdr, p);
        }
        if (r[0] == 0x14) {
            if (hdr.equals("77D")) absCleared = true;
            if (hdr.equals("7E8") || hdr.equals("7E9")) cleared = true;
            return isotp(hdr, new int[]{0x54});
        }
        if (r[0] == 0x10) return isotp(hdr, new int[]{0x50, r[1], 0x00, 0x32, 0x01, 0xF4});
        if (r[0] == 0x22 && r.length >= 3) {
            int did = r[1] * 256 + r[2];
            String s = null;
            if (did == 0xF197) s = name;
            if (did == 0xF187) s = "5Q0907379AB";
            if (did == 0xF18C) s = "DEMO" + hdr + "0815";
            if (did == 0xF190) s = "WVWZZZ1KZAM654321";
            if (did == 0xF189) s = "0402";
            if (s == null) return isotp(hdr, new int[]{0x7F, 0x22, 0x31});
            int[] p = new int[3 + s.length()];
            p[0] = 0x62;
            p[1] = r[1];
            p[2] = r[2];
            for (int i = 0; i < s.length(); i++) p[3 + i] = s.charAt(i);
            return isotp(hdr, p);
        }
        return isotp(hdr, new int[]{0x7F, r[0], 0x11});
    }

    private String obdTrans(int[] r) {
        switch (r[0]) {
            case 0x01:
                if (r.length > 1 && r[1] == 0x00) return isotp("7E9", new int[]{0x41, 0x00, 0x80, 0x00, 0x00, 0x00});
                if (r.length > 1 && r[1] == 0x01)
                    return isotp("7E9", new int[]{0x41, 0x01, cleared ? 0x00 : 0x81, 0x00, 0x00, 0x00});
                return null;
            case 0x03:
                return isotp("7E9", cleared ? new int[]{0x43, 0x00} : new int[]{0x43, 0x01, 0x07, 0x15});
            case 0x04:
                return isotp("7E9", new int[]{0x44});
            case 0x07:
            case 0x0A:
                return isotp("7E9", new int[]{0x40 + r[0], 0x00});
            default:
                return null;
        }
    }

    private String obdEngine(int[] r) {
        String h = "7E8";
        switch (r[0]) {
            case 0x01: {
                if (r.length < 2) return "?";
                int[] v = mode01(r[1]);
                if (v == null) return null;
                return isotp(h, concat(new int[]{0x41, r[1]}, v));
            }
            case 0x02: {
                if (r.length < 3 || cleared) return null;
                int pid = r[1];
                int[] v;
                if (pid % 0x20 == 0) v = bitmap(FREEZE_PIDS, pid);
                else if (pid == 0x02) v = new int[]{0x03, 0x01};
                else if (contains(FREEZE_PIDS, pid)) v = snapshot(pid);
                else return null;
                if (v == null) return null;
                return isotp(h, concat(new int[]{0x42, pid, 0x00}, v));
            }
            case 0x03:
                return isotp(h, cleared ? new int[]{0x43, 0x00} : new int[]{0x43, 0x02, 0x03, 0x01, 0x01, 0x71});
            case 0x04:
                cleared = true;
                return isotp(h, new int[]{0x44});
            case 0x06: {
                if (r.length < 2) return "?";
                int mid = r[1];
                if (mid % 0x20 == 0) {
                    int[] bm = bitmap(MIDS, mid);
                    return bm == null ? null : isotp(h, concat(new int[]{0x46, mid}, bm));
                }
                if (!contains(MIDS, mid)) return null;
                return isotp(h, mode06(mid));
            }
            case 0x07:
                return isotp(h, cleared ? new int[]{0x47, 0x00} : new int[]{0x47, 0x01, 0x04, 0x20});
            case 0x09: {
                if (r.length < 2) return "?";
                switch (r[1]) {
                    case 0x00:
                        return isotp(h, new int[]{0x49, 0x00, 0x54, 0x40, 0x00, 0x00});
                    case 0x02:
                        return isotp(h, concat(new int[]{0x49, 0x02, 0x01}, ascii("WVWZZZ1KZAM654321")));
                    case 0x04:
                        return isotp(h, concat(new int[]{0x49, 0x04, 0x01}, ascii("04E906027HT 1234")));
                    case 0x06:
                        return isotp(h, new int[]{0x49, 0x06, 0x01, 0x1A, 0x2B, 0x3C, 0x4D});
                    case 0x0A:
                        return isotp(h, concat(new int[]{0x49, 0x0A, 0x01}, ascii("ECM-EngineControl\0\0\0")));
                    default:
                        return null;
                }
            }
            case 0x0A:
                return isotp(h, new int[]{0x4A, 0x00});
            default:
                return isotp(h, new int[]{0x7F, r[0], 0x11});
        }
    }

    private int[] mode06(int mid) {
        List<int[]> recs = new ArrayList<int[]>();
        switch (mid) {
            case 0x01:
                recs.add(rec(mid, 0x01, 0x0A, 3690, 0, 4100));
                recs.add(rec(mid, 0x02, 0x0A, 1640, 0, 1800));
                break;
            case 0x02:
                recs.add(rec(mid, 0x07, 0x0A, 820, 0, 3690));
                break;
            case 0x21:
                recs.add(rec(mid, 0x80, 0x01, cleared ? 0 : 412, 0, 380));
                break;
            default: {
                int cyl = mid - 0xA1;
                int mis = (cyl == 1 && !cleared) ? 37 : (cyl == 0 && !cleared ? 37 : 0);
                recs.add(rec(mid, 0x0B, 0x24, mis / 3, 0, 0xFFFF));
                recs.add(rec(mid, 0x0C, 0x24, mis, 0, 0xFFFF));
            }
        }
        int[] out = new int[1 + recs.size() * 9];
        out[0] = 0x46;
        int i = 1;
        for (int[] rr : recs) {
            System.arraycopy(rr, 0, out, i, 9);
            i += 9;
        }
        return out;
    }

    private static int[] rec(int mid, int tid, int uas, int v, int mn, int mx) {
        return new int[]{mid, tid, uas, v >> 8, v & 0xFF, mn >> 8, mn & 0xFF, mx >> 8, mx & 0xFF};
    }

    private int[] snapshot(int pid) {
        switch (pid) {
            case 0x04: return new int[]{0x5A};
            case 0x05: return new int[]{0x7B};
            case 0x06: return new int[]{0x8A};
            case 0x07: return new int[]{0x9C};
            case 0x0B: return new int[]{0x2E};
            case 0x0C: return new int[]{0x0C, 0x80};
            case 0x0D: return new int[]{0x00};
            case 0x0F: return new int[]{0x3C};
            case 0x11: return new int[]{0x26};
            default: return null;
        }
    }

    private int[] mode01(int pid) {
        if (pid % 0x20 == 0) return bitmap(ENGINE_PIDS, pid);
        if (!contains(ENGINE_PIDS, pid)) return null;
        double t = t();
        double load = 0.5 + 0.5 * Math.sin(t / 2.5);
        double rpm = 780 + 2600 * load + 40 * Math.sin(t * 3);
        double speed = Math.max(0, 25 + 60 * Math.sin(t / 9));
        switch (pid) {
            case 0x01:
                return cleared ? new int[]{0x00, 0x07, 0x65, 0x65} : new int[]{0x82, 0x07, 0x65, 0x04};
            case 0x03: return new int[]{0x02, 0x00};
            case 0x04: return new int[]{clamp(load * 200 + 20)};
            case 0x05: return new int[]{clamp(Math.min(90, 20 + t * 1.5) + 40)};
            case 0x06: return new int[]{clamp(128 + 6 * Math.sin(t * 2))};
            case 0x07: return new int[]{cleared ? 128 : 141};
            case 0x0B: return new int[]{clamp(30 + 70 * load)};
            case 0x0C: return word(rpm * 4);
            case 0x0D: return new int[]{clamp(speed)};
            case 0x0E: return new int[]{clamp((10 + 15 * load + 64) * 2)};
            case 0x0F: return new int[]{clamp(22 + 40)};
            case 0x10: return word((3 + 40 * load) * 100);
            case 0x11: return new int[]{clamp((8 + 70 * load) * 2.55)};
            case 0x13: return new int[]{0x33};
            case 0x14: return new int[]{clamp(90 + 80 * Math.sin(t * 4)), 0x80};
            case 0x15: return new int[]{clamp(130 + 8 * Math.sin(t / 3)), 0xFF};
            case 0x1C: return new int[]{0x06};
            case 0x1F: return word(t + 312);
            case 0x21: return cleared ? word(0) : word(87);
            case 0x2F: return new int[]{clamp(0.62 * 255)};
            case 0x30: return new int[]{cleared ? 0 : 42};
            case 0x31: return cleared ? word(0) : word(1534);
            case 0x33: return new int[]{101};
            case 0x3C: return word((480 + 150 * load + 40) * 10);
            case 0x42: return word((14.1 + 0.1 * Math.sin(t)) * 1000);
            case 0x43: return word(load * 80 * 2.55 + 40);
            case 0x44: return word(32768);
            case 0x45: return new int[]{clamp((5 + 70 * load) * 2.55)};
            case 0x46: return new int[]{18 + 40};
            case 0x47: return new int[]{clamp((10 + 70 * load) * 2.55)};
            case 0x49: return new int[]{clamp((15 + 60 * load) * 2.55)};
            case 0x4A: return new int[]{clamp((7 + 30 * load) * 2.55)};
            case 0x4C: return new int[]{clamp((8 + 70 * load) * 2.55)};
            case 0x4D: return cleared ? word(0) : word(132);
            case 0x4E: return cleared ? word(t / 60) : word(9120);
            case 0x51: return new int[]{0x01};
            case 0x5C: return new int[]{clamp(Math.min(95, 20 + t) + 40)};
            case 0xA6: {
                long v = 1234567;
                return new int[]{(int) (v >> 24) & 0xFF, (int) (v >> 16) & 0xFF, (int) (v >> 8) & 0xFF, (int) v & 0xFF};
            }
            default: return null;
        }
    }

    private static int clamp(double v) {
        return (int) Math.max(0, Math.min(255, Math.round(v)));
    }

    private static int[] word(double v) {
        int i = (int) Math.max(0, Math.min(65535, Math.round(v)));
        return new int[]{i >> 8, i & 0xFF};
    }

    private static boolean contains(int[] a, int v) {
        for (int x : a) if (x == v) return true;
        return false;
    }

    /** Bitmaske "unterstützte PIDs" für base+1 .. base+32. */
    private static int[] bitmap(int[] pids, int base) {
        int[] b = new int[4];
        boolean any = false;
        for (int p : pids) {
            if (p > base && p <= base + 32) {
                int i = p - base - 1;
                b[i / 8] |= 0x80 >> (i % 8);
                any = true;
            }
            if (p > base + 32) {
                b[3] |= 0x01; // nächster Bereich vorhanden
                any = true;
            }
        }
        return any || base == 0 ? b : null;
    }

    private static int[] ascii(String s) {
        int[] r = new int[s.length()];
        for (int i = 0; i < s.length(); i++) r[i] = s.charAt(i);
        return r;
    }

    private static int[] concat(int[] a, int[] b) {
        int[] r = new int[a.length + b.length];
        System.arraycopy(a, 0, r, 0, a.length);
        System.arraycopy(b, 0, r, a.length, b.length);
        return r;
    }

    /** ISO-TP-Rahmen so formatieren, wie der ELM327 sie mit ATH1/ATS1 ausgibt. */
    static String isotp(String hdr, int[] p) {
        StringBuilder sb = new StringBuilder();
        if (p.length <= 7) {
            sb.append(hdr).append(' ').append(Hex.b(p.length));
            for (int i = 0; i < 7; i++) sb.append(' ').append(Hex.b(i < p.length ? p[i] : 0xAA));
            return sb.toString();
        }
        sb.append(hdr).append(" 1").append(Integer.toHexString(p.length >> 8).toUpperCase()).append(' ')
                .append(Hex.b(p.length & 0xFF));
        int i = 0;
        for (; i < 6; i++) sb.append(' ').append(Hex.b(p[i]));
        int seq = 1;
        while (i < p.length) {
            sb.append('\r').append(hdr).append(" 2").append(Integer.toHexString(seq & 0xF).toUpperCase());
            for (int k = 0; k < 7; k++, i++) sb.append(' ').append(Hex.b(i < p.length ? p[i] : 0xAA));
            seq++;
        }
        return sb.toString();
    }
}
