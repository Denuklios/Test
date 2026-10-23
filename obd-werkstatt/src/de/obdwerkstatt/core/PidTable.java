package de.obdwerkstatt.core;

import java.util.Locale;

/** OBD-II Modus 01/02 Parameter (SAE J1979) mit Umrechnung. */
public final class PidTable {
    private PidTable() {
    }

    private static final String[] NAME = new String[256];
    private static final String[] UNIT = new String[256];
    private static final int[] DEC = new int[256];

    private static void def(int pid, String name, String unit, int decimals) {
        NAME[pid] = name;
        UNIT[pid] = unit;
        DEC[pid] = decimals;
    }

    static {
        def(0x01, "Status seit Fehlerlöschen", "", 0);
        def(0x02, "Fehlercode des Freeze Frames", "", 0);
        def(0x03, "Kraftstoffsystem Status", "", 0);
        def(0x04, "Berechnete Motorlast", "%", 1);
        def(0x05, "Kühlmitteltemperatur", "°C", 0);
        def(0x06, "Kurzzeit-Gemischanpassung Bank 1", "%", 1);
        def(0x07, "Langzeit-Gemischanpassung Bank 1", "%", 1);
        def(0x08, "Kurzzeit-Gemischanpassung Bank 2", "%", 1);
        def(0x09, "Langzeit-Gemischanpassung Bank 2", "%", 1);
        def(0x0A, "Kraftstoffdruck", "kPa", 0);
        def(0x0B, "Saugrohrdruck (absolut)", "kPa", 0);
        def(0x0C, "Motordrehzahl", "1/min", 0);
        def(0x0D, "Geschwindigkeit", "km/h", 0);
        def(0x0E, "Zündzeitpunkt", "° v. OT", 1);
        def(0x0F, "Ansauglufttemperatur", "°C", 0);
        def(0x10, "Luftmasse (LMM)", "g/s", 2);
        def(0x11, "Drosselklappenstellung", "%", 1);
        def(0x12, "Sekundärluft Status", "", 0);
        def(0x13, "Vorhandene Lambdasonden", "", 0);
        String[] o2 = {"B1S1", "B1S2", "B1S3", "B1S4", "B2S1", "B2S2", "B2S3", "B2S4"};
        for (int i = 0; i < 8; i++) {
            def(0x14 + i, "Lambdasonde " + o2[i] + " Spannung", "V", 3);
            def(0x24 + i, "Lambdasonde " + o2[i] + " Lambda (Breitband)", "λ", 3);
            def(0x34 + i, "Lambdasonde " + o2[i] + " Lambda (Strom)", "λ", 3);
        }
        def(0x1C, "OBD-Norm des Fahrzeugs", "", 0);
        def(0x1D, "Vorhandene Lambdasonden (4 Bänke)", "", 0);
        def(0x1E, "Nebenantrieb (PTO)", "", 0);
        def(0x1F, "Laufzeit seit Motorstart", "s", 0);
        def(0x21, "Strecke mit Motorkontrollleuchte an", "km", 0);
        def(0x22, "Kraftstoffverteilerdruck (rel. Saugrohr)", "kPa", 1);
        def(0x23, "Kraftstoffverteilerdruck (Diesel/Direkteinspr.)", "kPa", 0);
        def(0x2C, "AGR Sollwert", "%", 1);
        def(0x2D, "AGR Abweichung", "%", 1);
        def(0x2E, "Tankentlüftung Sollwert", "%", 1);
        def(0x2F, "Tankfüllstand", "%", 1);
        def(0x30, "Warmläufe seit Fehlerlöschen", "", 0);
        def(0x31, "Strecke seit Fehlerlöschen", "km", 0);
        def(0x32, "Dampfdruck Tankentlüftung", "Pa", 1);
        def(0x33, "Luftdruck (Umgebung)", "kPa", 0);
        def(0x3C, "Katalysatortemperatur B1S1", "°C", 1);
        def(0x3D, "Katalysatortemperatur B2S1", "°C", 1);
        def(0x3E, "Katalysatortemperatur B1S2", "°C", 1);
        def(0x3F, "Katalysatortemperatur B2S2", "°C", 1);
        def(0x41, "Überwachungsstatus aktueller Fahrzyklus", "", 0);
        def(0x42, "Steuergeräte-Spannung", "V", 2);
        def(0x43, "Absolute Last", "%", 1);
        def(0x44, "Lambda Sollwert", "λ", 3);
        def(0x45, "Relative Drosselklappenstellung", "%", 1);
        def(0x46, "Umgebungstemperatur", "°C", 0);
        def(0x47, "Drosselklappenstellung B", "%", 1);
        def(0x48, "Drosselklappenstellung C", "%", 1);
        def(0x49, "Fahrpedalstellung D", "%", 1);
        def(0x4A, "Fahrpedalstellung E", "%", 1);
        def(0x4B, "Fahrpedalstellung F", "%", 1);
        def(0x4C, "Drosselklappe Sollwert", "%", 1);
        def(0x4D, "Laufzeit mit Motorkontrollleuchte an", "min", 0);
        def(0x4E, "Zeit seit Fehlerlöschen", "min", 0);
        def(0x51, "Kraftstoffart", "", 0);
        def(0x52, "Ethanolanteil", "%", 1);
        def(0x59, "Kraftstoffverteilerdruck (absolut)", "kPa", 0);
        def(0x5A, "Relative Fahrpedalstellung", "%", 1);
        def(0x5B, "Hybridbatterie Restlebensdauer", "%", 1);
        def(0x5C, "Motoröltemperatur", "°C", 0);
        def(0x5D, "Einspritzzeitpunkt", "°", 2);
        def(0x5E, "Kraftstoffverbrauch", "l/h", 2);
        def(0x61, "Fahrerwunsch-Drehmoment", "%", 0);
        def(0x62, "Ist-Drehmoment", "%", 0);
        def(0x63, "Bezugsdrehmoment", "Nm", 0);
        def(0xA6, "Kilometerstand", "km", 1);
    }

    public static boolean known(int pid) {
        return pid >= 0 && pid < 256 && NAME[pid] != null;
    }

    public static String name(int pid) {
        return known(pid) ? NAME[pid] : "PID " + Hex.b(pid);
    }

    public static String unit(int pid) {
        return known(pid) && UNIT[pid] != null ? UNIT[pid] : "";
    }

    /** Ist der PID als Zahl darstellbar (für Diagramme)? */
    public static boolean numeric(int pid) {
        switch (pid) {
            case 0x01: case 0x02: case 0x03: case 0x12: case 0x13: case 0x1C: case 0x1D: case 0x1E:
            case 0x41: case 0x51:
                return false;
            default:
                return known(pid);
        }
    }

    /** Zahlenwert, oder null wenn nicht numerisch / zu wenig Daten. d = Datenbytes nach Modus und PID. */
    public static Double value(int pid, int[] d) {
        if (d == null || d.length == 0) return null;
        int a = d[0];
        int b = d.length > 1 ? d[1] : -1;
        int ab = b >= 0 ? a * 256 + b : -1;
        switch (pid) {
            case 0x04: case 0x11: case 0x2C: case 0x2E: case 0x2F: case 0x45: case 0x47: case 0x48:
            case 0x49: case 0x4A: case 0x4B: case 0x4C: case 0x52: case 0x5A: case 0x5B:
                return a * 100.0 / 255.0;
            case 0x05: case 0x0F: case 0x46: case 0x5C:
                return a - 40.0;
            case 0x06: case 0x07: case 0x08: case 0x09: case 0x2D:
                return (a - 128) * 100.0 / 128.0;
            case 0x0A:
                return a * 3.0;
            case 0x0B: case 0x0D: case 0x30: case 0x33:
                return (double) a;
            case 0x0E:
                return a / 2.0 - 64.0;
            case 0x14: case 0x15: case 0x16: case 0x17: case 0x18: case 0x19: case 0x1A: case 0x1B:
                return a / 200.0;
            case 0x61: case 0x62:
                return a - 125.0;
        }
        if (ab < 0) return null;
        switch (pid) {
            case 0x0C:
                return ab / 4.0;
            case 0x10:
                return ab / 100.0;
            case 0x1F: case 0x21: case 0x31: case 0x4D: case 0x4E: case 0x63:
                return (double) ab;
            case 0x22:
                return ab * 0.079;
            case 0x23: case 0x59:
                return ab * 10.0;
            case 0x32:
                return ((short) ab) / 4.0;
            case 0x3C: case 0x3D: case 0x3E: case 0x3F:
                return ab / 10.0 - 40.0;
            case 0x42:
                return ab / 1000.0;
            case 0x43:
                return ab * 100.0 / 255.0;
            case 0x44:
                return ab * 2.0 / 65536.0;
            case 0x5D:
                return ab / 128.0 - 210.0;
            case 0x5E:
                return ab / 20.0;
        }
        if (pid >= 0x24 && pid <= 0x2B) return ab * 2.0 / 65536.0;
        if (pid >= 0x34 && pid <= 0x3B) return ab * 2.0 / 65536.0;
        if (pid == 0xA6 && d.length >= 4) {
            long v = ((long) a << 24) | ((long) b << 16) | (d[2] << 8) | d[3];
            return v / 10.0;
        }
        return null;
    }

    public static String formatNumber(int pid, double v) {
        int dec = known(pid) ? DEC[pid] : 1;
        return String.format(Locale.GERMANY, "%." + dec + "f", v);
    }

    /** Lesbarer Wert inkl. Einheit. */
    public static String format(int pid, int[] d) {
        if (d == null || d.length == 0) return "–";
        Double v = value(pid, d);
        if (v != null) {
            String u = unit(pid);
            return formatNumber(pid, v) + (u.isEmpty() ? "" : " " + u);
        }
        int a = d[0];
        switch (pid) {
            case 0x01:
                return ((a & 0x80) != 0 ? "MKL an" : "MKL aus") + ", " + (a & 0x7F) + " Fehler gespeichert";
            case 0x02:
                return d.length >= 2 ? Dtc.decode(a, d[1]) : "–";
            case 0x03:
                return fuelSystem(a) + (d.length > 1 && d[1] != 0 ? " / " + fuelSystem(d[1]) : "");
            case 0x12:
                switch (a) {
                    case 1: return "Vor Katalysator";
                    case 2: return "Nach Katalysator";
                    case 4: return "Außenluft / aus";
                    case 8: return "Pumpe für Diagnose an";
                    default: return "0x" + Hex.b(a);
                }
            case 0x13: case 0x1D:
                return "Bitmaske 0x" + Hex.b(a);
            case 0x1C:
                return obdStandard(a);
            case 0x1E:
                return (a & 1) != 0 ? "aktiv" : "inaktiv";
            case 0x51:
                return fuelType(a);
        }
        return Hex.join(d, 0, d.length);
    }

    private static String fuelSystem(int a) {
        switch (a) {
            case 0: return "–";
            case 1: return "Offener Regelkreis (Motor kalt)";
            case 2: return "Geschlossener Regelkreis (Lambdaregelung)";
            case 4: return "Offener Regelkreis (Last/Schub)";
            case 8: return "Offener Regelkreis (Systemfehler)";
            case 16: return "Geschlossen, Fehler in Rückführung";
            default: return "0x" + Hex.b(a);
        }
    }

    public static String obdStandard(int a) {
        switch (a) {
            case 1: return "OBD-II (CARB, USA)";
            case 2: return "OBD (EPA, USA)";
            case 3: return "OBD und OBD-II";
            case 4: return "OBD-I";
            case 5: return "Kein OBD";
            case 6: return "EOBD (Europa)";
            case 7: return "EOBD und OBD-II";
            case 8: return "EOBD und OBD";
            case 9: return "EOBD, OBD und OBD-II";
            case 10: return "JOBD (Japan)";
            case 11: return "JOBD und OBD-II";
            case 12: return "JOBD und EOBD";
            case 13: return "JOBD, EOBD und OBD-II";
            case 17: return "EMD";
            case 18: return "EMD+";
            case 19: return "HD OBD-C";
            case 20: return "HD OBD";
            case 21: return "WWH-OBD";
            case 23: return "HD EOBD-I";
            case 24: return "HD EOBD-I N";
            case 25: return "HD EOBD-II";
            case 26: return "HD EOBD-II N";
            case 28: return "OBDBr-1 (Brasilien)";
            case 29: return "OBDBr-2 (Brasilien)";
            case 30: return "KOBD (Korea)";
            case 31: return "IOBD I (Indien)";
            case 32: return "IOBD II (Indien)";
            case 33: return "HD EOBD-IV";
            default: return "Code " + a;
        }
    }

    public static String fuelType(int a) {
        switch (a) {
            case 1: return "Benzin";
            case 2: return "Methanol";
            case 3: return "Ethanol";
            case 4: return "Diesel";
            case 5: return "Autogas (LPG)";
            case 6: return "Erdgas (CNG)";
            case 7: return "Propan";
            case 8: return "Elektro";
            case 9: return "Bivalent Benzin";
            case 10: return "Bivalent Methanol";
            case 11: return "Bivalent Ethanol";
            case 12: return "Bivalent LPG";
            case 13: return "Bivalent CNG";
            case 14: return "Bivalent Propan";
            case 15: return "Bivalent Elektro";
            case 16: return "Bivalent Elektro/Verbrenner";
            case 17: return "Hybrid Benzin";
            case 18: return "Hybrid Ethanol";
            case 19: return "Hybrid Diesel";
            case 20: return "Hybrid Elektro";
            case 21: return "Hybrid Elektro/Verbrenner";
            case 22: return "Hybrid regenerativ";
            case 23: return "Bivalent Diesel";
            default: return "Code " + a;
        }
    }
}
