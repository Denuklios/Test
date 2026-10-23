package de.obdwerkstatt.core;

/** Namen für Steuergeräte-Adressen. */
public final class EcuNames {
    private EcuNames() {
    }

    public static boolean isEngine(String ecu) {
        return ecu.equals("7E8") || ecu.equals("18DAF110") || ecu.equals("10");
    }

    /** Name der Antwortadresse bei Standard-OBD-Abfragen. */
    public static String name(String ecu) {
        if (ecu == null || ecu.isEmpty()) return "Steuergerät";
        if (isEngine(ecu)) return "Motor";
        if (ecu.equals("7E9") || ecu.equals("18DAF118") || ecu.equals("18")) return "Getriebe";
        if (ecu.length() == 3 && ecu.startsWith("7E")) {
            int n = Character.digit(ecu.charAt(2), 16) - 7;
            return "Steuergerät " + n + " (0x" + ecu + ")";
        }
        if (ecu.startsWith("18DAF1")) return "Steuergerät 0x" + ecu.substring(6);
        return "Steuergerät 0x" + ecu;
    }

    /** Typische Belegung von Diagnoseadressen – nur ein Hinweis, je nach Hersteller verschieden. */
    public static String guessModule(String req, boolean ext) {
        if (ext) {
            if (req.equals("10")) return "Motor";
            if (req.equals("18")) return "Getriebe";
            if (req.equals("28")) return "Bremse/ABS (typisch)";
            if (req.equals("58")) return "Airbag (typisch)";
            return "Steuergerät";
        }
        switch (req) {
            case "7E0": return "Motorsteuergerät";
            case "7E1": return "Getriebesteuergerät";
            case "7E2": return "Hybrid/E-Antrieb (typisch)";
            case "7E3": return "Steuergerät 0x7E3";
            case "710": return "Gateway (VAG)";
            case "711": return "Fahrwerk (VAG, typisch)";
            case "712": return "Lenkung (VAG)";
            case "713": return "Bremse/ABS (VAG)";
            case "714": return "Kombiinstrument (VAG)";
            case "715": return "Airbag (VAG)";
            case "720": return "Kombiinstrument (Ford)";
            case "726": return "Karosseriesteuergerät (Ford)";
            case "730": return "Servolenkung (Ford)";
            case "737": return "Airbag (Ford)";
            case "760": return "ABS (Ford)";
            case "780": return "Airbag (Toyota)";
            case "7B0": return "ABS/ESP (Toyota)";
            case "7C0": return "Kombiinstrument (Toyota)";
            case "7A0": return "Karosseriesteuergerät (Hyundai/Kia)";
            case "7C6": return "Kombiinstrument (Hyundai/Kia)";
            case "7D1": return "ABS/ESP (Hyundai/Kia)";
            case "7D2": return "Airbag (Hyundai/Kia)";
            default: return "Steuergerät";
        }
    }
}
