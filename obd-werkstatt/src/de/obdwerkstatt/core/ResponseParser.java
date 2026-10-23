package de.obdwerkstatt.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Zerlegt ELM327-Antworten (Header an, Leerzeichen an) in Nachrichten je Steuergerät.
 * CAN: ISO-TP (Einzel-, Erst- und Folgerahmen) wird wieder zusammengesetzt.
 * Ältere Protokolle (J1850, ISO 9141, KWP2000): 3 Byte Header, letztes Byte Prüfsumme.
 */
public final class ResponseParser {
    private ResponseParser() {
    }

    private static final class Acc {
        final int len;
        final List<Integer> bytes = new ArrayList<Integer>();

        Acc(int len) {
            this.len = len;
        }

        Frame toFrame(String ecu) {
            int n = Math.min(len, bytes.size());
            int[] d = new int[n];
            for (int i = 0; i < n; i++) d[i] = bytes.get(i);
            return new Frame(ecu, d);
        }
    }

    public static List<Frame> parse(String response, boolean can, boolean ext29) {
        List<Frame> out = new ArrayList<Frame>();
        Map<String, Acc> pending = new LinkedHashMap<String, Acc>();
        Acc noHeader = null;
        if (response == null) return out;
        for (String raw : response.split("\n")) {
            String line = raw.trim().toUpperCase();
            if (line.isEmpty()) continue;

            // Format ohne Header bei mehrteiligen CAN-Antworten: "014" / "0: 49 02 .." / "1: .."
            if (line.length() > 2 && line.charAt(1) == ':' && Character.digit(line.charAt(0), 16) >= 0) {
                if (noHeader == null) noHeader = new Acc(4095);
                String[] t = line.substring(2).trim().split("\\s+");
                if (!allHex(t)) continue;
                for (String s : t) noHeader.bytes.add(Hex.parse(s));
                continue;
            }

            String[] tok = line.split("\\s+");
            if (!allHex(tok)) continue; // NO DATA, SEARCHING..., STOPPED usw.

            if (can) {
                int hdr;
                String ecu;
                if (tok[0].length() == 3) {
                    if (tok.length == 1) {
                        // Längenangabe einer mehrteiligen Antwort ohne Header
                        noHeader = new Acc(Hex.parse(tok[0]));
                        continue;
                    }
                    hdr = 1;
                    ecu = tok[0];
                } else if (ext29 && tok.length >= 5) {
                    hdr = 4;
                    ecu = tok[0] + tok[1] + tok[2] + tok[3];
                } else {
                    // Header aus: Daten ohne PCI-Byte
                    out.add(new Frame("", toInts(tok, 0, tok.length)));
                    continue;
                }
                if (tok.length <= hdr) continue;
                int pci = Hex.parse(tok[hdr]);
                int type = pci >> 4;
                if (type == 0) {
                    int len = pci & 0x0F;
                    int end = Math.min(hdr + 1 + len, tok.length);
                    out.add(new Frame(ecu, toInts(tok, hdr + 1, end)));
                } else if (type == 1 && tok.length > hdr + 1) {
                    int len = ((pci & 0x0F) << 8) | Hex.parse(tok[hdr + 1]);
                    Acc a = new Acc(len);
                    for (int i = hdr + 2; i < tok.length; i++) a.bytes.add(Hex.parse(tok[i]));
                    pending.put(ecu, a);
                } else if (type == 2) {
                    Acc a = pending.get(ecu);
                    if (a == null) continue;
                    for (int i = hdr + 1; i < tok.length; i++) a.bytes.add(Hex.parse(tok[i]));
                    if (a.bytes.size() >= a.len) {
                        out.add(a.toFrame(ecu));
                        pending.remove(ecu);
                    }
                }
                // type 3 = Flusssteuerung, ignorieren
            } else {
                if (tok.length >= 5) {
                    out.add(new Frame(tok[2], toInts(tok, 3, tok.length - 1)));
                } else {
                    out.add(new Frame("", toInts(tok, 0, tok.length)));
                }
            }
        }
        for (Map.Entry<String, Acc> e : pending.entrySet()) out.add(e.getValue().toFrame(e.getKey()));
        if (noHeader != null && !noHeader.bytes.isEmpty()) out.add(noHeader.toFrame(""));
        return out;
    }

    private static boolean allHex(String[] t) {
        for (String s : t) {
            if (s.length() > 3 || !Hex.isHex(s)) return false;
        }
        return t.length > 0;
    }

    private static int[] toInts(String[] t, int from, int to) {
        if (to < from) to = from;
        int[] r = new int[to - from];
        for (int i = from; i < to; i++) r[i - from] = Hex.parse(t[i]);
        return r;
    }
}
