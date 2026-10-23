package de.obdwerkstatt.core;

/** Ein Fehlercode mit Herkunft und Status. */
public final class Dtc {
    public final String code;
    public final String ecu;
    public final String kind;
    /** Zusatzinfo, z. B. UDS-Status oder Fehlerart-Byte; kann leer sein. */
    public final String detail;

    public Dtc(String code, String ecu, String kind, String detail) {
        this.code = code;
        this.ecu = ecu;
        this.kind = kind;
        this.detail = detail == null ? "" : detail;
    }

    public String description() {
        return DtcDatabase.describe(code);
    }

    /** Wandelt die zwei Bytes eines OBD-Fehlercodes in die Form P0123 um. */
    public static String decode(int b1, int b2) {
        char letter = "PCBU".charAt((b1 >> 6) & 3);
        return "" + letter + ((b1 >> 4) & 3) + Integer.toHexString(b1 & 0x0F).toUpperCase() + Hex.b(b2);
    }

    /** Textuelle Auswertung des UDS-Statusbytes (ISO 14229). */
    public static String udsStatus(int s) {
        StringBuilder sb = new StringBuilder();
        if ((s & 0x01) != 0) add(sb, "aktuell fehlerhaft");
        if ((s & 0x02) != 0) add(sb, "in diesem Zyklus aufgetreten");
        if ((s & 0x04) != 0) add(sb, "ausstehend");
        if ((s & 0x08) != 0) add(sb, "bestätigt/gespeichert");
        if ((s & 0x20) != 0) add(sb, "seit Löschen aufgetreten");
        if ((s & 0x80) != 0) add(sb, "Warnleuchte angefordert");
        if (sb.length() == 0) add(sb, "sporadisch/nicht aktiv");
        return sb.toString();
    }

    private static void add(StringBuilder sb, String s) {
        if (sb.length() > 0) sb.append(", ");
        sb.append(s);
    }
}
