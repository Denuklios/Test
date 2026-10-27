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
        transport.write(cmd + "\r");
        String r = transport.readUntilPrompt(timeoutMs);
        if (r == null) {
            String partial = transport.peek().replace('\r', ' ').trim();
            // Adapter mit einem Zeilenumbruch unterbrechen und neu synchronisieren
            transport.write("\r");
            transport.readUntilPrompt(1500);
            throw new IOException("Keine Antwort vom Adapter auf \"" + cmd + "\" (Zeitüberschreitung"
                    + (partial.isEmpty() ? "" : ", bisher empfangen: " + partial) + ")");
        }
        return r;
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
        cmd("ATH1");
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
        setup();
        version = cmd("ATI");
        log.line("Adapter: " + version);
        // Erst die gängigen CAN-Protokolle direkt testen (schnell), dann die automatische Suche
        // mit viel Zeit – billige Klone brauchen dafür teils über 30 s.
        int[] order = protocolChoice != 0 ? new int[]{protocolChoice} : new int[]{6, 8, 7, 9, 0};
        String last = "";
        boolean found = false;
        for (int p : order) {
            log.line(p == 0 ? "Automatische Protokollsuche (kann bis zu 1 Minute dauern) …"
                    : "Teste " + PROTOCOLS[p] + " …");
            cmd("ATSP" + Integer.toHexString(p).toUpperCase());
            try {
                String r = cmd("0100", p == 0 ? 60000 : p >= 6 ? 8000 : 25000);
                if (!ResponseParser.parse(r, true, false).isEmpty()) {
                    found = true;
                    break;
                }
                last = r.replace('\n', ' ');
            } catch (IOException e) {
                if (transport.isFailed()) throw e;
                last = e.getMessage();
            }
        }
        if (!found) {
            throw new VehicleError("Der Adapter (" + version + ") funktioniert, aber das Fahrzeug antwortet nicht"
                    + (last.isEmpty() ? "." : " (" + last + ").")
                    + "\nBitte Zündung einschalten (Stellung 2 oder Motor laufen lassen) und erneut verbinden.");
        }
        String dpn = cmd("ATDPN").replace("A", "").trim();
        try {
            protocol = Integer.parseInt(dpn.isEmpty() ? "0" : dpn.substring(dpn.length() - 1), 16);
        } catch (NumberFormatException e) {
            protocol = 6;
        }
        protocolDesc = cmd("ATDP");
        log.line("Protokoll: " + protocolDesc);
        // Feste Protokollnummer setzen, damit später keine Suche mehr nötig ist
        cmd("ATSP" + Integer.toHexString(protocol).toUpperCase());
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
