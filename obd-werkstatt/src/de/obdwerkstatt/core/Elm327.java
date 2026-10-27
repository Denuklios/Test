package de.obdwerkstatt.core;

import java.io.IOException;
import java.util.List;

/** Ansteuerung eines ELM327 (oder kompatiblen) Adapters. */
public final class Elm327 {
    public final Transport transport;
    public String version = "";
    public String protocolDesc = "";
    /** ELM-Protokollnummer 1..C (6..9 = CAN). */
    public int protocol;
    /** false = nur der Adapter antwortet, das Fahrzeug (noch) nicht. */
    public boolean vehicleOk;
    /** Absenderkennungen (ATH1) anzeigen; false = Kompatibilitätsmodus wie bei Torque/Car Scanner. */
    public boolean headers = true;

    private final StringBuilder transcript = new StringBuilder();
    private final long t0 = System.currentTimeMillis();

    /** Protokollnamen für ATSP-Auswahl. */
    public static final String[] PROTOCOLS = {
            "0 – Automatisch",
            "1 – SAE J1850 PWM (Ford)",
            "2 – SAE J1850 VPW (GM)",
            "3 – ISO 9141-2",
            "4 – ISO 14230-4 KWP (5 Baud)",
            "5 – ISO 14230-4 KWP (schnell)",
            "6 – ISO 15765-4 CAN 11 Bit 500 kBit/s",
            "7 – ISO 15765-4 CAN 29 Bit 500 kBit/s",
            "8 – ISO 15765-4 CAN 11 Bit 250 kBit/s",
            "9 – ISO 15765-4 CAN 29 Bit 250 kBit/s",
    };

    public Elm327(Transport t) {
        this.transport = t;
    }

    /** Sendet einen Befehl und liefert die ungefilterte Antwort (ohne Prompt). */
    public synchronized String raw(String cmd, long timeoutMs) throws IOException {
        transport.clearInput();
        long start = System.currentTimeMillis();
        log("> " + cmd);
        transport.write(cmd + "\r");
        String r = transport.readUntilPrompt(timeoutMs);
        if (r == null) {
            // Nicht unterbrechen (billige Klone hängen sich dabei oft auf), sondern noch etwas länger warten
            r = transport.readUntilPrompt(5000);
        }
        long ms = System.currentTimeMillis() - start;
        if (r == null) {
            String partial = transport.peek().replace('\r', ' ').trim();
            log("< (keine Antwort nach " + ms + " ms" + (partial.isEmpty() ? "" : ", Teil: " + partial) + ")");
            throw new Timeout("Keine Antwort vom Adapter auf \"" + cmd + "\" (Zeitüberschreitung"
                    + (partial.isEmpty() ? "" : ", bisher empfangen: " + partial) + ")");
        }
        log("< " + r.trim().replace("\r", " | ") + "   [" + ms + " ms]");
        return r;
    }

    private void log(String line) {
        synchronized (transcript) {
            if (transcript.length() > 200_000) return;
            transcript.append(String.format(java.util.Locale.US, "%7.2f s  ", (System.currentTimeMillis() - t0) / 1000.0))
                    .append(line).append('\n');
        }
    }

    /** Vollständiges Mitschnitt-Protokoll aller Befehle und Antworten. */
    public String transcript() {
        synchronized (transcript) {
            return transcript.toString();
        }
    }

    /** Versucht einen hängenden Adapter per Reset wiederzubeleben. */
    public boolean recover() {
        try {
            raw("ATZ", 5000);
            setup();
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    public String cmd(String c) throws IOException {
        return cmd(c, 5000);
    }

    public String cmd(String c, long timeoutMs) throws IOException {
        return clean(raw(c, timeoutMs), c);
    }

    static String clean(String r, String cmd) {
        String c = cmd.replace(" ", "");
        StringBuilder sb = new StringBuilder();
        for (String l : r.split("[\r\n]+")) {
            String t = l.trim();
            if (t.isEmpty()) continue;
            if (t.replace(" ", "").equalsIgnoreCase(c)) continue; // Echo
            if (t.startsWith("SEARCHING")) continue;
            if (t.startsWith("BUS INIT") && t.endsWith("OK")) continue;
            if (sb.length() > 0) sb.append('\n');
            sb.append(t);
        }
        return sb.toString();
    }

    public boolean isCan() {
        return protocol >= 6;
    }

    public boolean is29Bit() {
        return protocol == 7 || protocol == 9 || protocol == 0xB;
    }

    public List<Frame> query(String c) throws IOException {
        return query(c, 5000);
    }

    public List<Frame> query(String c, long timeoutMs) throws IOException {
        return ResponseParser.parse(cmd(c, timeoutMs), isCan(), is29Bit());
    }

    /** Grundeinstellungen setzen (nach ATZ oder ATD). */
    public void setup() throws IOException {
        cmd("ATE0");
        cmd("ATL0");
        cmd("ATS1");
        cmd(headers ? "ATH1" : "ATH0");
        cmd("ATAT1");
    }

    /**
     * Initialisiert Adapter und Fahrzeugverbindung.
     *
     * @param protocolChoice 0 = automatisch, sonst feste Protokollnummer
     */
    public void init(int protocolChoice, Log log) throws IOException {
        // Manche Adapter brauchen nach dem Verbindungsaufbau einen Moment und einen "Weckruf"
        log.line("Warte auf Adapter …");
        try {
            Thread.sleep(700);
        } catch (InterruptedException ignored) {
        }
        transport.clearInput();
        transport.write("\r");
        transport.readUntilPrompt(1500);
        // Nicht jeder Klon versteht ATZ – nacheinander verschiedene Rücksetzbefehle probieren
        String[] resets = {"ATZ", "ATWS", "ATD", "ATI"};
        boolean ok = false;
        for (String r : resets) {
            log.line("Adapter wird initialisiert (" + r + ") …");
            try {
                raw(r, r.equals("ATZ") ? 4000 : 2500);
                ok = true;
                break;
            } catch (IOException e) {
                if (transport.isFailed()) throw e;
                if (transport.receivedCount() == 0) break; // völlig stumm: weitere Befehle sinnlos
            }
        }
        if (!ok) {
            int n = transport.receivedCount();
            throw new NoResponse(n == 0,
                    n == 0 ? "verbunden, aber keine Daten empfangen"
                            : "Der Adapter antwortet nicht wie ein ELM327. Empfangen: \"" + transport.receivedText() + "\"");
        }
        // Ab hier ist klar: Bluetooth und Adapter funktionieren. Fehler betreffen das Fahrzeug.
        try {
            setup();
            version = cmd("ATI");
            log.line("Adapter: " + version);
            findVehicle(protocolChoice, log);
        } catch (IOException e) {
            if (transport.isFailed() || e instanceof VehicleError) throw e;
            throw new VehicleError("Der Adapter (" + version + ") antwortet, aber die Verbindung zum Fahrzeug "
                    + "klappt nicht: " + e.getMessage());
        }
    }

    private void findVehicle(int protocolChoice, Log log) throws IOException {
        // Erst die gängigen CAN-Protokolle direkt testen (schnell), dann die automatische Suche
        // mit viel Zeit – billige Klone brauchen dafür teils über 30 s.
        // Schritte: {Protokoll, Header an?}. Der Kompatibilitätsmodus (Header aus, automatische Suche)
        // entspricht dem Ablauf gängiger Apps – manche Nachbauten kommen nur damit zurecht.
        int[][] steps = protocolChoice != 0
                ? new int[][]{{protocolChoice, 1}, {protocolChoice, 0}}
                : new int[][]{{6, 1}, {6, 0}, {0, 0}};
        StringBuilder tried = new StringBuilder();
        boolean found = false;
        for (int[] st : steps) {
            int p = st[0];
            boolean h = st[1] == 1;
            String name = (p == 0 ? "Automatische Suche" : PROTOCOLS[p]) + (h ? "" : " (Kompatibilitätsmodus)");
            log.line(p == 0 ? "Automatische Protokollsuche, Kompatibilitätsmodus (bis zu 1 Minute) …"
                    : "Teste " + name + " …");
            String result;
            try {
                if (h != headers) {
                    headers = h;
                    cmd(h ? "ATH1" : "ATH0");
                }
                cmd("ATSP" + Integer.toHexString(p).toUpperCase());
                String r = cmd("0100", p == 0 ? 60000 : 15000);
                if (!ResponseParser.parse(r, true, false).isEmpty()) {
                    found = true;
                    break;
                }
                result = r.replace('\n', ' ');
            } catch (Timeout e) {
                result = "keine Antwort";
                log.line("Adapter hängt – Neustart …");
                if (!recover()) throw new VehicleError("Der Adapter (" + version + ") hat sich bei der "
                        + "Fahrzeugabfrage aufgehängt und reagiert nicht mehr. Adapter abziehen und neu einstecken.");
            }
            tried.append("\n• ").append(name).append(": ").append(result);
        }
        if (!found) {
            throw new VehicleError("Der Adapter (" + version + ") funktioniert, aber das Fahrzeug antwortet nicht."
                    + tried + "\n\nZündung einschalten (Stellung 2 oder Motor laufen lassen) und erneut verbinden.");
        }
        String dpn = cmd("ATDPN").replace("A", "").trim();
        try {
            protocol = Integer.parseInt(dpn.isEmpty() ? "0" : dpn.substring(dpn.length() - 1), 16);
        } catch (NumberFormatException e) {
            protocol = 6;
        }
        protocolDesc = cmd("ATDP");
        log.line("Protokoll: " + protocolDesc);
        if (!headers) {
            // Gefunden im Kompatibilitätsmodus: prüfen, ob Header jetzt doch gehen (für Steuergeräte-Scan nötig)
            try {
                cmd("ATSP" + Integer.toHexString(protocol).toUpperCase());
                cmd("ATH1");
                if (!ResponseParser.parse(cmd("0100", 8000), isCan(), is29Bit()).isEmpty()) headers = true;
            } catch (Timeout e) {
                recover();
                cmd("ATSP" + Integer.toHexString(protocol).toUpperCase());
            }
            if (!headers) cmd("ATH0");
            log.line(headers ? "Header funktionieren jetzt." : "Kompatibilitätsmodus bleibt aktiv.");
        }
        // Feste Protokollnummer setzen, damit später keine Suche mehr nötig ist
        cmd("ATSP" + Integer.toHexString(protocol).toUpperCase());
        vehicleOk = true;
    }

    /** Stellt den Normalzustand nach Spezialbefehlen (UDS, Header) wieder her. */
    public void restore() throws IOException {
        cmd("ATD");
        setup();
        cmd("ATSP" + Integer.toHexString(protocol).toUpperCase());
    }

    /** Adapter liefert keine verwertbare Antwort; silent = überhaupt keine Bytes empfangen. */
    public static final class NoResponse extends IOException {
        public final boolean silent;

        public NoResponse(boolean silent, String msg) {
            super(msg);
            this.silent = silent;
        }
    }

    /** Zeitüberschreitung bei einem einzelnen Befehl. */
    public static final class Timeout extends IOException {
        public Timeout(String msg) {
            super(msg);
        }
    }

    /** Adapter antwortet, aber das Fahrzeug nicht. */
    public static final class VehicleError extends IOException {
        public VehicleError(String msg) {
            super(msg);
        }
    }

    public interface Log {
        void line(String s);
    }
}
