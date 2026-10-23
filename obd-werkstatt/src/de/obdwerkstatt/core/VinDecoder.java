package de.obdwerkstatt.core;

/** Grobe Auswertung der Fahrgestellnummer (Hersteller, Modelljahr). */
public final class VinDecoder {
    private VinDecoder() {
    }

    private static final String[][] WMI = {
            {"WVW", "Volkswagen (Pkw)"}, {"WV1", "Volkswagen Nutzfahrzeuge"}, {"WV2", "Volkswagen Nutzfahrzeuge"},
            {"WV3", "Volkswagen Nutzfahrzeuge"}, {"WVG", "Volkswagen (SUV)"}, {"WAU", "Audi"}, {"WUA", "Audi Sport"},
            {"TRU", "Audi (Ungarn)"}, {"WBA", "BMW"}, {"WBS", "BMW M"}, {"WBY", "BMW i"}, {"WMW", "MINI"},
            {"WDB", "Mercedes-Benz"}, {"WDD", "Mercedes-Benz"}, {"WDC", "Mercedes-Benz (SUV)"}, {"W1K", "Mercedes-Benz"},
            {"W1N", "Mercedes-Benz (SUV)"}, {"W1V", "Mercedes-Benz Transporter"}, {"WDF", "Mercedes-Benz Transporter"},
            {"WP0", "Porsche"}, {"WP1", "Porsche (SUV)"}, {"W0L", "Opel"}, {"W0V", "Opel"}, {"WF0", "Ford (Deutschland)"},
            {"WMA", "MAN"}, {"WSM", "Schmitz"}, {"TMB", "Škoda"}, {"VSS", "SEAT/Cupra"}, {"VWV", "Volkswagen (Spanien)"},
            {"VF1", "Renault"}, {"VF3", "Peugeot"}, {"VF7", "Citroën"}, {"VR3", "Peugeot"}, {"VR7", "Citroën"},
            {"VXK", "Opel/Stellantis"}, {"UU1", "Dacia"}, {"ZFA", "Fiat"}, {"ZAR", "Alfa Romeo"}, {"ZLA", "Lancia"},
            {"ZFF", "Ferrari"}, {"ZHW", "Lamborghini"}, {"YV1", "Volvo"}, {"YS3", "Saab"}, {"SAL", "Land Rover"},
            {"SAJ", "Jaguar"}, {"SCC", "Lotus"}, {"SB1", "Toyota (Großbritannien)"}, {"VNK", "Toyota (Frankreich)"},
            {"NMT", "Toyota (Türkei)"}, {"JTD", "Toyota"}, {"JTE", "Toyota"}, {"JTN", "Toyota"}, {"JTM", "Toyota"},
            {"JT1", "Toyota"}, {"JHM", "Honda"}, {"SHH", "Honda (Großbritannien)"}, {"JN1", "Nissan"},
            {"SJN", "Nissan (Großbritannien)"}, {"VSK", "Nissan (Spanien)"}, {"JMZ", "Mazda"}, {"JMB", "Mitsubishi"},
            {"JF1", "Subaru"}, {"JSA", "Suzuki"}, {"TSM", "Suzuki (Ungarn)"}, {"KMH", "Hyundai"},
            {"TMA", "Hyundai (Tschechien)"}, {"NLH", "Hyundai (Türkei)"}, {"KNA", "Kia"}, {"KNE", "Kia"},
            {"U5Y", "Kia (Slowakei)"}, {"U6Y", "Kia (Slowakei)"}, {"KL1", "Chevrolet/Daewoo"}, {"5YJ", "Tesla"},
            {"LRW", "Tesla (China)"}, {"XP7", "Tesla (Deutschland)"}, {"1FA", "Ford (USA)"}, {"1FT", "Ford (USA)"},
            {"1FM", "Ford (USA)"}, {"1G1", "Chevrolet (USA)"}, {"1GC", "Chevrolet (USA)"}, {"1C4", "Chrysler/Jeep"},
            {"1J4", "Jeep"}, {"NM0", "Ford (Türkei)"}, {"LSV", "SAIC Volkswagen"}, {"LFV", "FAW-Volkswagen"},
            {"LVS", "Ford (China)"}, {"YS2", "Scania"}, {"YV2", "Volvo Lkw"}, {"XLR", "DAF"}, {"VF6", "Renault Trucks"},
    };

    public static String manufacturer(String vin) {
        if (vin == null || vin.length() < 3) return "unbekannt";
        String w = vin.substring(0, 3).toUpperCase();
        for (String[] e : WMI) if (e[0].equals(w)) return e[1];
        switch (vin.charAt(0)) {
            case 'W': return "Hersteller aus Deutschland";
            case 'V': return "Hersteller aus Frankreich/Spanien";
            case 'Z': return "Hersteller aus Italien";
            case 'S': return "Hersteller aus Großbritannien";
            case 'Y': return "Hersteller aus Schweden/Finnland";
            case 'T': return "Hersteller aus der Schweiz/Tschechien/Ungarn";
            case 'J': return "Hersteller aus Japan";
            case 'K': return "Hersteller aus Südkorea";
            case 'L': return "Hersteller aus China";
            case '1': case '4': case '5': return "Hersteller aus den USA";
            case '2': return "Hersteller aus Kanada";
            case '3': return "Hersteller aus Mexiko";
            default: return "unbekannt";
        }
    }

    /** Modelljahr laut 10. Stelle (nicht alle europäischen Hersteller codieren es). */
    public static String modelYear(String vin) {
        if (vin == null || vin.length() < 10) return "–";
        char c = Character.toUpperCase(vin.charAt(9));
        String letters = "ABCDEFGHJKLMNPRSTVWXY";
        int i = letters.indexOf(c);
        if (i >= 0) return String.valueOf(2010 + i);
        if (c >= '1' && c <= '9') return String.valueOf(2001 + (c - '1'));
        return "nicht codiert";
    }
}
