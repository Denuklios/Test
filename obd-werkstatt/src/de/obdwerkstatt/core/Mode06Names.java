package de.obdwerkstatt.core;

/** Bezeichnungen und Skalierung für Modus 06 (On-Board-Prüfergebnisse, SAE J1979 Anhang D/E). */
public final class Mode06Names {
    private Mode06Names() {
    }

    public static String mid(int m) {
        String[] o2 = {"B1S1", "B1S2", "B1S3", "B1S4", "B2S1", "B2S2", "B2S3", "B2S4"};
        if (m >= 0x01 && m <= 0x08) return "Lambdasonde " + o2[m - 1];
        if (m >= 0x41 && m <= 0x48) return "Lambdasondenheizung " + o2[m - 0x41];
        if (m >= 0xA2 && m <= 0xAD) return "Zündaussetzer Zylinder " + (m - 0xA1);
        switch (m) {
            case 0x21: return "Katalysator Bank 1";
            case 0x22: return "Katalysator Bank 2";
            case 0x23: return "Katalysator Bank 3";
            case 0x24: return "Katalysator Bank 4";
            case 0x31: return "AGR-System Bank 1";
            case 0x32: return "AGR-System Bank 2";
            case 0x35: return "Nockenwellenverstellung Bank 1";
            case 0x36: return "Nockenwellenverstellung Bank 2";
            case 0x39: return "Tankentlüftung (Leck 0,150\")";
            case 0x3A: return "Tankentlüftung (Leck 0,090\")";
            case 0x3B: return "Tankentlüftung (Leck 0,040\")";
            case 0x3C: return "Tankentlüftung (Leck 0,020\")";
            case 0x3D: return "Tankentlüftung Spülstrom";
            case 0x61: return "Katalysatorheizung Bank 1";
            case 0x62: return "Katalysatorheizung Bank 2";
            case 0x71: return "Sekundärluft 1";
            case 0x72: return "Sekundärluft 2";
            case 0x81: return "Kraftstoffsystem Bank 1";
            case 0x82: return "Kraftstoffsystem Bank 2";
            case 0x85: return "Ladedruckregelung Bank 1";
            case 0x86: return "Ladedruckregelung Bank 2";
            case 0x90: return "NOx-Speicherkatalysator Bank 1";
            case 0x98: return "NOx-Katalysator/SCR Bank 1";
            case 0xA1: return "Zündaussetzer allgemein";
            case 0xB0: return "Partikelfilter Bank 1";
            case 0xB1: return "Partikelfilter Bank 2";
            default: return "Monitor 0x" + Hex.b(m);
        }
    }

    public static String tid(int mid, int t) {
        if (mid >= 0xA1 && mid <= 0xAD) {
            if (t == 0x0B) return "Aussetzer Mittel (letzte 10 Zyklen)";
            if (t == 0x0C) return "Aussetzer letzter/aktueller Zyklus";
        }
        switch (t) {
            case 0x01: return "Schwelle fett→mager";
            case 0x02: return "Schwelle mager→fett";
            case 0x03: return "Schaltpunkt niedrig";
            case 0x04: return "Schaltpunkt hoch";
            case 0x05: return "Schaltzeit fett→mager";
            case 0x06: return "Schaltzeit mager→fett";
            case 0x07: return "Minimale Sondenspannung";
            case 0x08: return "Maximale Sondenspannung";
            case 0x09: return "Zeit zwischen Wechseln";
            case 0x0A: return "Periodendauer";
            default: return "Test 0x" + Hex.b(t);
        }
    }

    private static double signed(int raw) {
        return (short) raw;
    }

    public static double scale(int uas, int raw) {
        switch (uas) {
            case 0x01: case 0x24: case 0x25: case 0x34: return raw;
            case 0x02: return raw * 0.1;
            case 0x03: case 0x0C: case 0x0F: case 0x17: case 0x1C: case 0x27: case 0x2F: return raw * 0.01;
            case 0x04: case 0x0B: case 0x0E: return raw * 0.001;
            case 0x07: return raw * 0.25;
            case 0x0A: return raw * 0.122;
            case 0x0D: return raw * 0.00390625;
            case 0x10: case 0x12: case 0x1A: return raw;
            case 0x16: return raw * 0.1 - 40;
            case 0x1D: return raw * 0.5;
            case 0x1E: return raw * 0.0000305;
            case 0x81: case 0x90: return signed(raw);
            case 0x82: case 0x96: return signed(raw) * 0.1;
            case 0x83: case 0x8C: case 0x9C: case 0xAF: return signed(raw) * 0.01;
            case 0x84: case 0x8B: case 0x8E: return signed(raw) * 0.001;
            case 0x8A: return signed(raw) * 0.122;
            case 0x9D: return signed(raw) * 0.5;
            case 0xFE: return signed(raw) * 0.25;
            default: return raw;
        }
    }

    public static String unit(int uas) {
        switch (uas) {
            case 0x07: return "1/min";
            case 0x0A: case 0x8A: return "mV";
            case 0x0B: case 0x0C: case 0x8B: case 0x8C: return "V";
            case 0x0D: return "mA";
            case 0x0E: case 0x0F: case 0x8E: return "A";
            case 0x10: case 0x90: return "ms";
            case 0x12: return "s";
            case 0x16: case 0x96: return "°C";
            case 0x17: case 0x1A: return "kPa";
            case 0x1C: case 0x1D: case 0x9C: case 0x9D: return "°";
            case 0x1E: return "λ";
            case 0x24: return "Anzahl";
            case 0x25: return "km";
            case 0x27: return "g/s";
            case 0x2F: case 0xAF: return "%";
            case 0x34: return "min";
            case 0xFE: return "Pa";
            default: return "";
        }
    }
}
