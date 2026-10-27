package de.obdwerkstatt.core;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Liest alles aus, was der OBD-Adapter über sich verrät, prüft die Befehle, die für
 * Diagnose und Steuergeräte-Zugriff nötig sind, und testet optional die Fahrzeugprotokolle.
 */
public final class AdapterTest {
    public static final int OK = 0, WARN = 1, FAIL = 2, INFO = 3;

    public static final class Row {
        public final int status;
        public final String name;
        public final String value;

        Row(int status, String name, String value) {
            this.status = status;
            this.name = name;
            this.value = value;
        }
    }

    public interface Progress {
        void update(String text);

        boolean cancelled();
    }

    public final List<Row> rows = new ArrayList<Row>();
    /** Gesamturteil in einem Satz. */
    public String verdict = "";
    private final Elm327 elm;

    public AdapterTest(Elm327 elm) {
        this.elm = elm;
    }

    private void add(int st, String name, String value) {
        rows.add(new Row(st, name, value));
    }

    /** Antwort oder null, wenn der Befehl nicht unterstützt wird ("?") oder keine Antwort kam. */
    private String ask(String cmd, long timeout) {
        try {
            String r = elm.cmd(cmd, timeout).trim();
            if (r.isEmpty() || r.equals("?") || r.endsWith("?")) return null;
            return r.replace('\n', ' ');
        } catch (IOException e) {
            if (e instanceof Elm327.Timeout) elm.recover();
            return null;
        }
    }

    public void run(boolean vehicle, Progress p) throws IOException {
        p.update("Adapter wird zurückgesetzt …");
        elm.raw("ATZ", 5000);
        elm.setup();

        // ---- Identität
        p.update("Lese Kennung …");
        String ver = ask("ATI", 3000);
        add(ver == null ? FAIL : INFO, "Version (ATI)", ver == null ? "keine Antwort" : ver);
        String desc = ask("AT@1", 3000);
        add(INFO, "Gerätebeschreibung (AT@1)", desc == null ? "nicht unterstützt" : desc);
        String id = ask("AT@2", 3000);
        add(INFO, "Gerätekennung (AT@2)", id == null ? "nicht unterstützt / leer" : id);
        String sti = ask("STI", 3000);
        if (sti != null) {
            add(OK, "STN-Chip (OBDLink)", sti);
            String stdi = ask("STDI", 3000);
            if (stdi != null) add(INFO, "STN-Hardware", stdi);
        } else {
            add(INFO, "STN-Chip (OBDLink)", "nein");
        }
        String volt = ask("ATRV", 3000);
        add(volt == null ? WARN : INFO, "Spannung am OBD-Stecker (ATRV)", volt == null ? "nicht lesbar" : volt);
        if (volt != null) {
            try {
                double v = Double.parseDouble(volt.replaceAll("[^0-9.]", ""));
                if (v < 11.8) add(WARN, "Bordnetz", "Spannung niedrig – Batterie schwach oder Zündung aus");
                else if (v > 13.2) add(OK, "Bordnetz", "Motor läuft (Lichtmaschine lädt)");
                else add(INFO, "Bordnetz", "Batteriespannung normal, Motor aus");
            } catch (NumberFormatException ignored) {
            }
        }
        String ign = ask("ATIGN", 3000);
        add(INFO, "Zündungseingang (ATIGN)", ign == null ? "nicht unterstützt" : ign);
        add(INFO, "Eingestelltes Protokoll (ATDP)", nz(ask("ATDP", 3000)));

        // ---- Antwortzeit
        p.update("Messe Antwortzeit …");
        long sum = 0;
        int n = 0;
        for (int i = 0; i < 5; i++) {
            long t = System.currentTimeMillis();
            if (ask("ATI", 3000) != null) {
                sum += System.currentTimeMillis() - t;
                n++;
            }
        }
        long avg = n == 0 ? -1 : sum / n;
        add(avg < 0 ? FAIL : avg > 250 ? WARN : OK, "Antwortzeit Adapter",
                avg < 0 ? "keine Antwort" : avg + " ms pro Befehl" + (avg > 250 ? " (langsam)" : ""));

        // ---- Befehlsumfang
        String[][] feats = {
                {"ATH1", "Header anzeigen", "1"},
                {"ATS1", "Leerzeichen ein/aus", "1"},
                {"ATAT1", "Adaptives Timing", "1"},
                {"ATST32", "Antwort-Timeout einstellbar", "1"},
                {"ATCAF1", "CAN-Autoformatierung", "1"},
                {"ATSH7E0", "Steuergeräte direkt ansprechen (Header)", "2"},
                {"ATCRA7E8", "CAN-Empfangsadresse", "2"},
                {"ATCF700", "CAN-Filter", "2"},
                {"ATCM700", "CAN-Maske", "2"},
                {"ATFCSH7E0", "Flusssteuerung Header (lange Antworten)", "2"},
                {"ATFCSD300000", "Flusssteuerung Daten", "2"},
                {"ATFCSM1", "Flusssteuerung Modus", "2"},
                {"ATCP18", "29-Bit-CAN Priorität", "3"},
                {"ATCSM0", "CAN-Stillmodus", "3"},
                {"ATKW0", "KWP-Schlüsselwörter", "3"},
                {"ATSW00", "Wachhalte-Intervall (K-Leitung)", "3"},
                {"ATPBC001", "Benutzerdefiniertes CAN-Protokoll", "3"},
        };
        int missingBasic = 0, missingUds = 0, missingAll = 0;
        List<String> missing = new ArrayList<String>();
        for (String[] f : feats) {
            if (p.cancelled()) break;
            p.update("Prüfe Befehl " + f[0] + " …");
            boolean ok = ask(f[0], 3000) != null;
            add(ok ? OK : (f[2].equals("3") ? WARN : FAIL), f[1] + " (" + f[0] + ")", ok ? "unterstützt" : "FEHLT");
            if (!ok) {
                missingAll++;
                missing.add(f[0]);
                if (f[2].equals("1")) missingBasic++;
                if (f[2].equals("2")) missingUds++;
            }
        }
        // Auf Standard zurück
        elm.cmd("ATD");
        elm.setup();

        // ---- Bewertung
        boolean clone15 = ver != null && ver.contains("1.5");
        boolean clone21 = ver != null && ver.contains("2.1") && sti == null;
        String kind;
        if (sti != null) kind = "Hochwertiger Adapter mit STN-Chip (OBDLink o. ä.)";
        else if (clone15) kind = "Nachbau – eine Version 1.5 hat der Hersteller ELM Electronics nie verkauft";
        else if (clone21) kind = "Wahrscheinlich Nachbau (v2.1 wird oft von Billigadaptern vorgetäuscht)";
        else if (ver != null && ver.startsWith("ELM327")) kind = "ELM327-kompatibel";
        else kind = "Unbekannter Adapter";
        add(INFO, "Adaptertyp", kind);
        add(missingBasic == 0 ? OK : FAIL, "OBD-II-Diagnose (Fehler, Live-Daten)",
                missingBasic == 0 ? "möglich" : "eingeschränkt – Grundbefehle fehlen");
        add(missingUds == 0 ? OK : FAIL, "Steuergeräte-Scan (ABS, Airbag …)",
                missingUds == 0 ? "möglich" : "nicht möglich – Adapter kann keine Steuergeräte direkt ansprechen");

        // ---- Fahrzeug
        boolean carOk = false;
        if (vehicle && !p.cancelled()) {
            int[] protos = {6, 8, 7, 9, 5, 4, 3, 1, 2};
            for (int pr : protos) {
                if (p.cancelled()) break;
                p.update("Fahrzeug: teste " + Elm327.PROTOCOLS[pr] + " …");
                String r;
                try {
                    elm.cmd("ATSP" + pr);
                    r = elm.cmd("0100", pr >= 6 ? 12000 : 25000).replace('\n', ' ');
                } catch (Elm327.Timeout e) {
                    r = "keine Antwort (Adapter hängt)";
                    elm.recover();
                }
                boolean ok = !ResponseParser.parse(r, true, false).isEmpty();
                add(ok ? OK : WARN, "Fahrzeug " + Elm327.PROTOCOLS[pr], ok ? "ANTWORT: " + r : r);
                if (ok) {
                    carOk = true;
                    break;
                }
            }
            if (!carOk) add(FAIL, "Fahrzeug", "Auf keinem Protokoll eine Antwort – Zündung an?");
            elm.cmd("ATD");
            elm.setup();
            elm.cmd("ATSP" + Integer.toHexString(elm.protocol).toUpperCase());
        }

        StringBuilder v = new StringBuilder(kind).append(". ");
        if (missingUds > 0) v.append("Für Werkstattfunktionen (Steuergeräte) fehlen Befehle. ");
        else if (missingBasic == 0) v.append("Alle wichtigen Befehle werden unterstützt. ");
        if (vehicle) v.append(carOk ? "Das Fahrzeug antwortet." : "Das Fahrzeug antwortet nicht.");
        verdict = v.toString().trim();
        if (missingAll > 0) add(INFO, "Fehlende Befehle", join(missing));
    }

    private static String nz(String s) {
        return s == null ? "–" : s;
    }

    private static String join(List<String> l) {
        StringBuilder sb = new StringBuilder();
        for (String s : l) {
            if (sb.length() > 0) sb.append(", ");
            sb.append(s);
        }
        return sb.toString();
    }

    /** Bericht als Text inkl. vollständigem Befehlsprotokoll. */
    public String report() {
        StringBuilder sb = new StringBuilder("ADAPTER-TEST – OBD Werkstatt\n");
        sb.append(verdict).append("\n\n");
        String[] mark = {"[OK]  ", "[!]   ", "[X]   ", "      "};
        for (Row r : rows) sb.append(mark[r.status]).append(r.name).append(": ").append(r.value).append('\n');
        sb.append("\n--- Befehlsprotokoll ---\n").append(elm.transcript());
        return sb.toString();
    }

    static String fmt(double d) {
        return String.format(Locale.GERMANY, "%.1f", d);
    }
}
