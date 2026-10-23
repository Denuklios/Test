package de.obdwerkstatt.core;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Diagnosefunktionen auf Basis von SAE J1979 (OBD-II) und ISO 14229 (UDS). */
public final class ObdApi {
    public final Elm327 elm;
    private boolean[] supported01;

    public ObdApi(Elm327 elm) {
        this.elm = elm;
    }

    // ------------------------------------------------------------------ PIDs

    /** Liest die Bitmasken 0100, 0120, ... und liefert die unterstützten Modus-01-PIDs. */
    public boolean[] supportedPids() throws IOException {
        if (supported01 == null) supported01 = readSupported("01", "", 0x41, 2);
        return supported01;
    }

    private boolean[] readSupported(String mode, String suffix, int resp, int offset) throws IOException {
        boolean[] s = new boolean[256];
        for (int base = 0; base < 0xE0; base += 0x20) {
            if (base != 0 && !s[base]) break;
            List<Frame> fr = elm.query(mode + Hex.b(base) + suffix);
            boolean any = false;
            for (Frame f : fr) {
                if (f.get(0) != resp || f.get(1) != base || f.data.length < offset + 4) continue;
                any = true;
                for (int i = 0; i < 32; i++) {
                    int byteIdx = offset + i / 8;
                    if ((f.data[byteIdx] & (0x80 >> (i % 8))) != 0) s[base + i + 1] = true;
                }
            }
            if (!any) break;
        }
        return s;
    }

    /** Bereits gelesene PID-Liste (ohne Adapterzugriff), oder null. */
    public boolean[] cachedSupported() {
        return supported01;
    }

    /** Datenbytes nach "41 PID" oder null. */
    public int[] readPid(int pid) throws IOException {
        return pickPid(elm.query("01" + Hex.b(pid)), 0x41, pid, 2);
    }

    private static int[] pickPid(List<Frame> frames, int resp, int pid, int skip) {
        Frame best = null;
        for (Frame f : frames) {
            if (f.get(0) == resp && f.get(1) == pid && f.data.length > skip) {
                if (best == null || EcuNames.isEngine(f.ecu)) best = f;
            }
        }
        if (best == null) return null;
        int[] d = new int[best.data.length - skip];
        System.arraycopy(best.data, skip, d, 0, d.length);
        return d;
    }

    // ------------------------------------------------------------------ Fehlercodes

    public static final String STORED = "Gespeichert";
    public static final String PENDING = "Ausstehend";
    public static final String PERMANENT = "Permanent";

    public List<Dtc> readDtcs(int mode) throws IOException {
        String kind = mode == 3 ? STORED : mode == 7 ? PENDING : PERMANENT;
        List<Dtc> out = new ArrayList<Dtc>();
        List<Frame> frames = elm.query("0" + Integer.toHexString(mode).toUpperCase(), 8000);
        int resp = 0x40 + mode;
        for (Frame f : frames) {
            if (f.get(0) != resp) continue;
            int start = 1;
            if (elm.isCan() && f.data.length % 2 == 0) start = 2; // Anzahl-Byte bei CAN
            for (int i = start; i + 1 < f.data.length; i += 2) {
                int b1 = f.data[i], b2 = f.data[i + 1];
                if (b1 == 0 && b2 == 0) continue;
                String code = Dtc.decode(b1, b2);
                if (!contains(out, code, f.ecu)) out.add(new Dtc(code, f.ecu, kind, ""));
            }
        }
        return out;
    }

    private static boolean contains(List<Dtc> l, String code, String ecu) {
        for (Dtc d : l) if (d.code.equals(code) && d.ecu.equals(ecu)) return true;
        return false;
    }

    public List<Dtc> readAllDtcs() throws IOException {
        List<Dtc> all = new ArrayList<Dtc>();
        all.addAll(readDtcs(3));
        all.addAll(readDtcs(7));
        if (elm.isCan()) all.addAll(readDtcs(0x0A));
        return all;
    }

    /** Modus 04: Fehlerspeicher löschen. Liefert eine Statusmeldung. */
    public String clearDtcs() throws IOException {
        String r = elm.cmd("04", 10000);
        List<Frame> fr = ResponseParser.parse(r, elm.isCan(), elm.is29Bit());
        int ok = 0;
        boolean rejected = false;
        for (Frame f : fr) {
            if (f.get(0) == 0x44) ok++;
            if (f.get(0) == 0x7F) rejected = true;
        }
        if (ok > 0) return "Fehlerspeicher gelöscht (" + ok + " Steuergerät" + (ok > 1 ? "e" : "") + " bestätigt).";
        if (rejected) return "Löschen abgelehnt. Bei laufendem Motor verweigern viele Fahrzeuge das Löschen – Motor aus, Zündung an.";
        return "Keine Bestätigung erhalten (" + r.replace('\n', ' ') + "). Bitte erneut auslesen.";
    }

    // ------------------------------------------------------------------ Readiness

    public static final class Monitor {
        public final String name;
        public final boolean supported;
        public final boolean complete;

        Monitor(String name, boolean supported, boolean complete) {
            this.name = name;
            this.supported = supported;
            this.complete = complete;
        }
    }

    public static final class Readiness {
        public boolean mil;
        public int dtcCount;
        public boolean diesel;
        public final List<Monitor> monitors = new ArrayList<Monitor>();
        public String ecu = "";
    }

    public Readiness readiness() throws IOException {
        int[] d = readPid(0x01);
        if (d == null || d.length < 4) return null;
        return parseReadiness(d);
    }

    public static Readiness parseReadiness(int[] d) {
        Readiness r = new Readiness();
        int a = d[0], b = d[1], c = d[2], e = d[3];
        r.mil = (a & 0x80) != 0;
        r.dtcCount = a & 0x7F;
        r.diesel = (b & 0x08) != 0;
        String[] common = {"Zündaussetzer", "Kraftstoffsystem", "Bauteile (umfassend)"};
        for (int i = 0; i < 3; i++) {
            r.monitors.add(new Monitor(common[i], (b & (1 << i)) != 0, (b & (0x10 << i)) == 0));
        }
        String[] spark = {"Katalysator", "Katalysatorheizung", "Tankentlüftung (EVAP)", "Sekundärluft",
                "Klimaanlage (Kältemittel)", "Lambdasonden", "Lambdasondenheizung", "Abgasrückführung/VVT"};
        String[] diesel = {"NMHC-Katalysator", "NOx/SCR-Nachbehandlung", "", "Ladedrucksystem",
                "", "Abgassensor", "Partikelfilter", "Abgasrückführung/VVT"};
        String[] names = r.diesel ? diesel : spark;
        for (int i = 0; i < 8; i++) {
            if (names[i].isEmpty()) continue;
            boolean sup = (c & (1 << i)) != 0;
            r.monitors.add(new Monitor(names[i], sup, (e & (1 << i)) == 0));
        }
        return r;
    }

    // ------------------------------------------------------------------ Fahrzeuginfo (Modus 09)

    public String readVin() throws IOException {
        List<Frame> fr = elm.query("0902", 8000);
        StringBuilder sb = new StringBuilder();
        for (Frame f : fr) {
            if (f.get(0) != 0x49 || f.get(1) != 0x02) continue;
            if (elm.isCan()) {
                if (sb.length() == 0) sb.append(Hex.ascii(f.data, 3));
            } else {
                sb.append(Hex.ascii(f.data, 3));
            }
        }
        String v = sb.toString().replaceAll("[^A-Z0-9]", "");
        if (v.length() > 17) v = v.substring(v.length() - 17);
        return v.isEmpty() ? null : v;
    }

    /** Textuelle Info (Kalibrier-ID, Steuergerätename) aus Modus 09; je Steuergerät eine Zeile. */
    public List<String> readInfoText(int pid) throws IOException {
        List<String> out = new ArrayList<String>();
        for (Frame f : elm.query("09" + Hex.b(pid), 8000)) {
            if (f.get(0) != 0x49 || f.get(1) != pid) continue;
            String s;
            if (pid == 0x06 || pid == 0x08 || pid == 0x0B) {
                s = Hex.join(f.data, 3, f.data.length).replace(" ", "");
            } else {
                s = Hex.ascii(f.data, 3);
            }
            if (!s.isEmpty()) out.add(EcuNames.name(f.ecu) + ": " + s);
        }
        return out;
    }

    // ------------------------------------------------------------------ Freeze Frame (Modus 02)

    public static final class FreezeValue {
        public final int pid;
        public final String value;

        FreezeValue(int pid, String value) {
            this.pid = pid;
            this.value = value;
        }
    }

    public List<FreezeValue> readFreezeFrame() throws IOException {
        List<FreezeValue> out = new ArrayList<FreezeValue>();
        boolean[] sup = readSupported("02", "00", 0x42, 3);
        for (int pid = 1; pid < 256; pid++) {
            if (!sup[pid] || pid % 0x20 == 0) continue;
            int[] d = pickPid(elm.query("02" + Hex.b(pid) + "00"), 0x42, pid, 3);
            if (d == null) continue;
            out.add(new FreezeValue(pid, PidTable.format(pid, d)));
        }
        return out;
    }

    // ------------------------------------------------------------------ Modus 06 (Prüfergebnisse)

    public static final class TestResult {
        public final String ecu;
        public final int mid, tid, uasid;
        public final double value, min, max;

        TestResult(String ecu, int mid, int tid, int uasid, double value, double min, double max) {
            this.ecu = ecu;
            this.mid = mid;
            this.tid = tid;
            this.uasid = uasid;
            this.value = value;
            this.min = min;
            this.max = max;
        }

        public boolean passed() {
            return value >= min && value <= max;
        }
    }

    public List<TestResult> readMode06() throws IOException {
        List<TestResult> out = new ArrayList<TestResult>();
        if (!elm.isCan()) throw new IOException("Modus 06 wird nur für CAN-Fahrzeuge ausgewertet.");
        boolean[] sup = readSupported("06", "", 0x46, 2);
        for (int mid = 1; mid < 256; mid++) {
            if (!sup[mid] || mid % 0x20 == 0) continue;
            for (Frame f : elm.query("06" + Hex.b(mid))) {
                if (f.get(0) != 0x46) continue;
                for (int i = 1; i + 8 < f.data.length; i += 9) {
                    int m = f.data[i], tid = f.data[i + 1], uas = f.data[i + 2];
                    int v = f.data[i + 3] * 256 + f.data[i + 4];
                    int mn = f.data[i + 5] * 256 + f.data[i + 6];
                    int mx = f.data[i + 7] * 256 + f.data[i + 8];
                    out.add(new TestResult(f.ecu, m, tid, uas, Mode06Names.scale(uas, v),
                            Mode06Names.scale(uas, mn), Mode06Names.scale(uas, mx)));
                }
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ Batteriespannung

    public String voltage() throws IOException {
        return elm.cmd("ATRV");
    }

    // ------------------------------------------------------------------ UDS-Steuergeräte

    public static final class Module {
        /** Anfrage-Header (11 Bit "7E0" oder 29 Bit Zieladresse "10"). */
        public final String request;
        public final String response;
        public final boolean ext;
        public String name = "";
        public boolean kwp;

        Module(String request, String response, boolean ext) {
            this.request = request;
            this.response = response;
            this.ext = ext;
        }

        public String label() {
            String guess = EcuNames.guessModule(request, ext);
            String n = !name.isEmpty() ? name : guess;
            return n + (ext ? "  (29 Bit, Adresse 0x" + request + ")" : "  (0x" + request + " → 0x" + response + ")");
        }
    }

    public interface Progress {
        void update(String text, int done, int total);

        boolean cancelled();
    }

    /** Bekannte Diagnose-Anfrage-IDs (11 Bit) verschiedener Hersteller. */
    private static final int[] QUICK_IDS = {
            0x7E0, 0x7E1, 0x7E2, 0x7E3, 0x7E4, 0x7E5, 0x7E6, 0x7E7,
            0x700, 0x701, 0x703, 0x704, 0x706, 0x707, 0x70A, 0x70E, 0x710, 0x711, 0x712, 0x713, 0x714, 0x715, 0x716,
            0x717, 0x71A, 0x71B, 0x720, 0x724, 0x726, 0x727, 0x730, 0x731, 0x732, 0x733, 0x737, 0x740, 0x741, 0x744,
            0x746, 0x750, 0x751, 0x760, 0x765, 0x770, 0x780, 0x790, 0x7A0, 0x7A2, 0x7A6, 0x7B0, 0x7B1, 0x7B2,
            0x7B3, 0x7C0, 0x7C4, 0x7C6, 0x7D0, 0x7D1, 0x7D2, 0x7D4, 0x7D6,
    };

    private void udsSetup() throws IOException {
        elm.cmd("ATH1");
        elm.cmd("ATS1");
        elm.cmd("ATCAF1");
        elm.cmd("ATAT0");
        if (elm.is29Bit()) {
            elm.cmd("ATCP18");
        } else {
            elm.cmd("ATCF700");
            elm.cmd("ATCM700");
        }
    }

    private void address(Module m) throws IOException {
        if (m.ext) {
            elm.cmd("ATSHDA" + m.request + "F1");
            elm.cmd("ATCRA18DAF1" + m.request);
            elm.cmd("ATFCSH18DA" + m.request + "F1");
        } else {
            elm.cmd("ATSH" + m.request);
            elm.cmd("ATFCSH" + m.request);
        }
        elm.cmd("ATFCSD300000");
        elm.cmd("ATFCSM1");
    }

    /** Sucht Steuergeräte über TesterPresent (3E 00). Nur CAN. */
    public List<Module> scanModules(boolean full, Progress p) throws IOException {
        if (!elm.isCan()) throw new IOException("Steuergeräte-Scan ist nur bei CAN-Fahrzeugen (ab ca. 2008) möglich.");
        List<Module> found = new ArrayList<Module>();
        List<String> candidates = new ArrayList<String>();
        boolean ext = elm.is29Bit();
        if (ext) {
            for (int a = 0; a < 0x100; a++) {
                if (a == 0xF1 || a == 0x33) continue;
                if (!full && a > 0x7F) break;
                candidates.add(Hex.b(a));
            }
        } else if (full) {
            for (int id = 0x700; id <= 0x7E7; id++) if (id != 0x7DF) candidates.add(Integer.toHexString(id).toUpperCase());
        } else {
            for (int id : QUICK_IDS) candidates.add(Integer.toHexString(id).toUpperCase());
        }
        java.util.Set<String> responders = new java.util.HashSet<String>();
        try {
            udsSetup();
            elm.cmd("ATST19"); // ca. 100 ms warten je Adresse
            int i = 0;
            for (String c : candidates) {
                if (p.cancelled()) break;
                p.update("Prüfe Adresse 0x" + c + " … (" + found.size() + " gefunden)", i++, candidates.size());
                if (responders.contains(c)) continue; // ist Antwort-ID eines anderen Steuergeräts
                if (ext) {
                    elm.cmd("ATSHDA" + c + "F1");
                    elm.cmd("ATCRA18DAF1" + c);
                } else {
                    elm.cmd("ATSH" + c);
                }
                List<Frame> fr = elm.query("3E00", 3000);
                for (Frame f : fr) {
                    if (f.get(0) != 0x7E && f.get(0) != 0x7F) continue;
                    String resp = f.ecu;
                    if (!ext && (resp.equals(c) || resp.isEmpty())) continue;
                    Module m = new Module(c, resp, ext);
                    found.add(m);
                    responders.add(resp);
                    break;
                }
            }
            // Namen lesen (UDS DID F197 = Systemname)
            elm.cmd("ATST40");
            for (Module m : found) {
                if (p.cancelled()) break;
                p.update("Lese Kennung von 0x" + m.request + " …", i, candidates.size());
                address(m);
                String n = readDidText(m, 0xF197);
                if (n == null || n.isEmpty()) n = readDidText(m, 0xF18A);
                if (n != null) m.name = n;
            }
        } finally {
            elm.restore();
        }
        return found;
    }

    private String readDidText(Module m, int did) throws IOException {
        for (Frame f : elm.query("22" + Hex.b(did >> 8) + Hex.b(did), 4000)) {
            if (f.get(0) == 0x62 && f.get(1) == (did >> 8) && f.get(2) == (did & 0xFF)) {
                return Hex.ascii(f.data, 3);
            }
        }
        return null;
    }

    private List<Frame> moduleQuery(Module m, String cmd) throws IOException {
        List<Frame> fr = elm.query(cmd, 8000);
        List<Frame> out = new ArrayList<Frame>();
        for (Frame f : fr) {
            if (m.ext || m.response.isEmpty() || f.ecu.equals(m.response)) {
                // "Antwort folgt" (NRC 0x78) überspringen
                if (f.get(0) == 0x7F && f.get(2) == 0x78) continue;
                out.add(f);
            }
        }
        return out;
    }

    /** Fehlerspeicher eines Steuergeräts per UDS (19 02) bzw. KWP2000 (18 02) lesen. */
    public List<Dtc> moduleDtcs(Module m) throws IOException {
        List<Dtc> out = new ArrayList<Dtc>();
        String ecu = m.ext ? "18DAF1" + m.request : m.response;
        try {
            udsSetup();
            elm.cmd("ATSTFF");
            address(m);
            List<Frame> fr = moduleQuery(m, "1902FF");
            boolean pos = false;
            for (Frame f : fr) {
                if (f.get(0) != 0x59) continue;
                pos = true;
                for (int i = 3; i + 3 < f.data.length; i += 4) {
                    int st = f.data[i + 3];
                    if ((st & 0xAF) == 0) continue; // nur "Test nicht abgeschlossen"
                    String code = Dtc.decode(f.data[i], f.data[i + 1]);
                    out.add(new Dtc(code, ecu, "UDS", "Fehlerart 0x" + Hex.b(f.data[i + 2]) + " – " + Dtc.udsStatus(st)));
                }
            }
            if (!pos) {
                for (Frame f : moduleQuery(m, "1802FF00")) {
                    if (f.get(0) != 0x58) continue;
                    pos = true;
                    m.kwp = true;
                    for (int i = 2; i + 2 < f.data.length; i += 3) {
                        String code = Dtc.decode(f.data[i], f.data[i + 1]);
                        out.add(new Dtc(code, ecu, "KWP", "Status 0x" + Hex.b(f.data[i + 2])));
                    }
                }
            }
            if (!pos) throw new IOException("Steuergerät beantwortet die Fehlerspeicher-Abfrage nicht ("
                    + describeNegative(fr) + ").");
        } finally {
            elm.restore();
        }
        return out;
    }

    /** Fehlerspeicher eines Steuergeräts löschen (UDS 14 FF FF FF bzw. KWP 14 FF 00). */
    public String moduleClear(Module m) throws IOException {
        try {
            udsSetup();
            elm.cmd("ATSTFF");
            address(m);
            List<Frame> fr = moduleQuery(m, m.kwp ? "14FF00" : "14FFFFFF");
            if (has(fr, 0x54)) return "Fehlerspeicher gelöscht.";
            // ggf. erweiterte Diagnosesitzung nötig
            moduleQuery(m, "1003");
            fr = moduleQuery(m, m.kwp ? "14FF00" : "14FFFFFF");
            if (has(fr, 0x54)) return "Fehlerspeicher gelöscht (erweiterte Sitzung).";
            if (!m.kwp) {
                fr = moduleQuery(m, "14FF00");
                if (has(fr, 0x54)) return "Fehlerspeicher gelöscht (KWP).";
            }
            return "Löschen nicht bestätigt: " + describeNegative(fr);
        } finally {
            elm.restore();
        }
    }

    /** Identifikationsdaten (UDS-DIDs) eines Steuergeräts. */
    public Map<String, String> moduleIdent(Module m) throws IOException {
        Map<String, String> out = new LinkedHashMap<String, String>();
        int[] dids = {0xF190, 0xF197, 0xF187, 0xF18A, 0xF18C, 0xF191, 0xF192, 0xF193, 0xF194, 0xF195, 0xF189};
        String[] names = {"Fahrgestellnummer", "Systemname", "Teilenummer", "Lieferant", "Seriennummer",
                "Hardware-Nummer", "Lieferanten-HW-Nr.", "Lieferanten-HW-Version", "Lieferanten-SW-Nr.",
                "Lieferanten-SW-Version", "Software-Version"};
        try {
            udsSetup();
            elm.cmd("ATST40");
            address(m);
            for (int i = 0; i < dids.length; i++) {
                String s = readDidText(m, dids[i]);
                if (s != null && !s.isEmpty()) out.put(names[i], s);
            }
        } finally {
            elm.restore();
        }
        return out;
    }

    private static boolean has(List<Frame> fr, int sid) {
        for (Frame f : fr) if (f.get(0) == sid) return true;
        return false;
    }

    private static String describeNegative(List<Frame> fr) {
        for (Frame f : fr) {
            if (f.get(0) == 0x7F) return "Code 0x" + Hex.b(f.get(2)) + " – " + nrc(f.get(2));
        }
        return fr.isEmpty() ? "keine Antwort" : "unerwartete Antwort " + fr.get(0);
    }

    public static String nrc(int c) {
        switch (c) {
            case 0x10: return "allgemein abgelehnt";
            case 0x11: return "Dienst nicht unterstützt";
            case 0x12: return "Unterfunktion nicht unterstützt";
            case 0x13: return "falsche Nachrichtenlänge";
            case 0x22: return "Bedingungen nicht erfüllt (Motor aus, Zündung an?)";
            case 0x31: return "Wert außerhalb des Bereichs";
            case 0x33: return "Zugriff verweigert (Security Access nötig)";
            case 0x72: return "Programmierfehler";
            case 0x7E: return "in aktueller Sitzung nicht unterstützt";
            case 0x7F: return "Dienst in aktueller Sitzung nicht unterstützt";
            default: return "Ablehnung";
        }
    }
}
