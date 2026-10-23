package de.obdwerkstatt.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Deutsche Beschreibungen genormter OBD-II Fehlercodes (SAE J2012 / ISO 15031-6).
 * Herstellerspezifische Codes werden nach Bereich eingeordnet.
 */
public final class DtcDatabase {
    private DtcDatabase() {
    }

    private static final Map<String, String> DB = new HashMap<String, String>();

    private static void p(String code, String text) {
        DB.put(code, text);
    }

    private static String code(int n) {
        String s = Integer.toHexString(n).toUpperCase();
        while (s.length() < 4) s = "0" + s;
        return "P" + s;
    }

    /** Standardmuster: Stromkreis, Bereich/Leistung, niedrig, hoch, sporadisch. */
    private static void sensor5(int start, String name) {
        p(code(start), name + " – Stromkreis Fehlfunktion");
        p(code(start + 1), name + " – Bereich/Leistung");
        p(code(start + 2), name + " – Signal zu niedrig");
        p(code(start + 3), name + " – Signal zu hoch");
        p(code(start + 4), name + " – Signal sporadisch");
    }

    /** Muster: Stromkreis, Bereich, niedrig, hoch (ohne sporadisch). */
    private static void sensor4(int start, String name) {
        p(code(start), name + " – Stromkreis Fehlfunktion");
        p(code(start + 1), name + " – Bereich/Leistung");
        p(code(start + 2), name + " – Signal zu niedrig");
        p(code(start + 3), name + " – Signal zu hoch");
    }

    static {
        // Nockenwellenverstellung / Kurbelwellenkorrelation
        p("P0010", "Nockenwellenversteller A (Einlass) Bank 1 – Stromkreis");
        p("P0011", "Nockenwelle A (Einlass) Bank 1 – Steuerzeit zu früh / Systemleistung");
        p("P0012", "Nockenwelle A (Einlass) Bank 1 – Steuerzeit zu spät");
        p("P0013", "Nockenwellenversteller B (Auslass) Bank 1 – Stromkreis");
        p("P0014", "Nockenwelle B (Auslass) Bank 1 – Steuerzeit zu früh / Systemleistung");
        p("P0015", "Nockenwelle B (Auslass) Bank 1 – Steuerzeit zu spät");
        p("P0016", "Kurbelwelle/Nockenwelle Korrelation – Bank 1 Sensor A (Steuerkette/Zahnriemen prüfen)");
        p("P0017", "Kurbelwelle/Nockenwelle Korrelation – Bank 1 Sensor B");
        p("P0018", "Kurbelwelle/Nockenwelle Korrelation – Bank 2 Sensor A");
        p("P0019", "Kurbelwelle/Nockenwelle Korrelation – Bank 2 Sensor B");
        p("P0020", "Nockenwellenversteller A (Einlass) Bank 2 – Stromkreis");
        p("P0021", "Nockenwelle A (Einlass) Bank 2 – Steuerzeit zu früh / Systemleistung");
        p("P0022", "Nockenwelle A (Einlass) Bank 2 – Steuerzeit zu spät");
        p("P0023", "Nockenwellenversteller B (Auslass) Bank 2 – Stromkreis");
        p("P0024", "Nockenwelle B (Auslass) Bank 2 – Steuerzeit zu früh / Systemleistung");
        p("P0025", "Nockenwelle B (Auslass) Bank 2 – Steuerzeit zu spät");
        // Lambdasondenheizung
        String[][] heater = {{"0030", "B1S1"}, {"0036", "B1S2"}, {"0042", "B1S3"}, {"0050", "B2S1"},
                {"0056", "B2S2"}, {"0062", "B2S3"}};
        for (String[] h : heater) {
            int n = Integer.parseInt(h[0], 16);
            p(code(n), "Lambdasondenheizung " + h[1] + " – Regelkreis");
            p(code(n + 1), "Lambdasondenheizung " + h[1] + " – Steuerkreis Signal zu niedrig");
            p(code(n + 2), "Lambdasondenheizung " + h[1] + " – Steuerkreis Signal zu hoch");
        }
        p("P0045", "Turbolader-Ladedruckregelung Magnetventil – Stromkreis offen");
        p("P0046", "Turbolader-Ladedruckregelung Magnetventil – Bereich/Leistung");
        p("P0047", "Turbolader-Ladedruckregelung Magnetventil – Signal zu niedrig");
        p("P0048", "Turbolader-Ladedruckregelung Magnetventil – Signal zu hoch");
        p("P0068", "Saugrohrdruck/Luftmasse – Drosselklappenstellung Korrelation (Falschluft?)");
        p("P0069", "Saugrohrdruck – Luftdruck Korrelation");
        sensor5(0x0070, "Umgebungslufttemperatursensor");
        p("P0087", "Kraftstoffverteiler-/Systemdruck zu niedrig");
        p("P0088", "Kraftstoffverteiler-/Systemdruck zu hoch");
        p("P0089", "Kraftstoffdruckregler 1 – Leistung");
        p("P0090", "Kraftstoffdruckregler 1 – Steuerkreis");
        p("P0093", "Kraftstoffsystem – großes Leck erkannt");
        p("P0097", "Ansauglufttemperatursensor 2 – Signal zu niedrig");
        p("P0098", "Ansauglufttemperatursensor 2 – Signal zu hoch");

        // Luft- und Kraftstoffmessung
        sensor5(0x0100, "Luftmassenmesser (LMM)");
        sensor5(0x0105, "Saugrohrdruck-/Luftdrucksensor (MAP)");
        sensor5(0x0110, "Ansauglufttemperatursensor 1");
        sensor5(0x0115, "Kühlmitteltemperatursensor");
        sensor5(0x0120, "Drosselklappen-/Fahrpedalsensor A");
        p("P0125", "Kühlmitteltemperatur zu niedrig für Lambdaregelung");
        p("P0128", "Kühlmittelthermostat – Temperatur unter Regeltemperatur (Thermostat prüfen)");
        String[] o2 = {"B1S1", "B1S2", "B1S3", "B2S1", "B2S2", "B2S3"};
        int[] o2Start = {0x130, 0x136, 0x142, 0x150, 0x156, 0x162};
        for (int i = 0; i < o2.length; i++) {
            int s = o2Start[i];
            String n = "Lambdasonde " + o2[i];
            p(code(s), n + " – Stromkreis Fehlfunktion");
            p(code(s + 1), n + " – Spannung zu niedrig");
            p(code(s + 2), n + " – Spannung zu hoch");
            p(code(s + 3), n + " – Reaktion zu langsam");
            p(code(s + 4), n + " – keine Aktivität");
            p(code(s + 5), n + " – Heizung Stromkreis");
        }
        p("P0168", "Kraftstofftemperatur zu hoch");
        p("P0169", "Falsche Kraftstoffzusammensetzung");
        p("P0170", "Gemischanpassung Bank 1 – Fehlfunktion");
        p("P0171", "System zu mager (Bank 1) – Falschluft, LMM, Kraftstoffdruck prüfen");
        p("P0172", "System zu fett (Bank 1)");
        p("P0173", "Gemischanpassung Bank 2 – Fehlfunktion");
        p("P0174", "System zu mager (Bank 2)");
        p("P0175", "System zu fett (Bank 2)");
        p("P0176", "Kraftstoffzusammensetzungssensor – Stromkreis");
        sensor5(0x0180, "Kraftstofftemperatursensor A");
        sensor5(0x0190, "Kraftstoffverteilerdrucksensor");
        sensor5(0x0195, "Motoröltemperatursensor");

        // Einspritzung
        p("P0200", "Einspritzventile – Stromkreis Fehlfunktion");
        for (int c = 1; c <= 12; c++) {
            p(code(0x200 + (c <= 9 ? c : c + 6)), "Einspritzventil Zylinder " + c + " – Stromkreis");
        }
        p("P0216", "Einspritzzeitpunkt-Steuerung – Stromkreis");
        p("P0217", "Motor-Übertemperatur");
        p("P0218", "Getriebe-Übertemperatur");
        p("P0219", "Motor-Überdrehzahl");
        sensor5(0x0220, "Drosselklappen-/Fahrpedalsensor B");
        sensor5(0x0225, "Drosselklappen-/Fahrpedalsensor C");
        p("P0230", "Kraftstoffpumpe – Primärstromkreis");
        p("P0231", "Kraftstoffpumpe – Sekundärstromkreis zu niedrig");
        p("P0232", "Kraftstoffpumpe – Sekundärstromkreis zu hoch");
        p("P0234", "Turbolader/Kompressor – Überladung (Ladedruck zu hoch)");
        sensor4(0x0235, "Ladedrucksensor A");
        p("P0243", "Wastegate-Magnetventil A – Stromkreis");
        p("P0244", "Wastegate-Magnetventil A – Bereich/Leistung");
        p("P0245", "Wastegate-Magnetventil A – Signal zu niedrig");
        p("P0246", "Wastegate-Magnetventil A – Signal zu hoch");
        p("P0251", "Einspritzpumpe Mengensteuerung A – Fehlfunktion");
        for (int c = 1; c <= 12; c++) {
            // P0261..P0296: je Zylinder drei Codes, Ziffern dezimal fortlaufend
            int dec = 261 + (c - 1) * 3;
            p("P0" + dec, "Einspritzventil Zylinder " + c + " – Stromkreis zu niedrig");
            p("P0" + (dec + 1), "Einspritzventil Zylinder " + c + " – Stromkreis zu hoch");
            p("P0" + (dec + 2), "Zylinder " + c + " – Beitrag/Laufruhe fehlerhaft");
        }
        p("P0299", "Turbolader/Kompressor – Unterladung (Ladedruck zu niedrig)");

        // Zündung
        p("P0300", "Zufällige/mehrfache Zündaussetzer erkannt");
        for (int c = 1; c <= 12; c++) {
            p("P03" + (c < 10 ? "0" + c : "" + c), "Zündaussetzer Zylinder " + c + " erkannt");
        }
        p("P0313", "Zündaussetzer bei niedrigem Kraftstoffstand");
        p("P0314", "Zündaussetzer einzelner Zylinder (nicht angegeben)");
        p("P0315", "Kurbelwellen-Geberrad – Adaption nicht gelernt");
        p("P0320", "Zündung/Verteiler – Drehzahlsignal Stromkreis");
        sensor5(0x0325, "Klopfsensor 1 (Bank 1)");
        sensor5(0x0330, "Klopfsensor 2 (Bank 2)");
        sensor5(0x0335, "Kurbelwellenpositionssensor A");
        sensor5(0x0340, "Nockenwellenpositionssensor A (Bank 1)");
        sensor5(0x0345, "Nockenwellenpositionssensor A (Bank 2)");
        p("P0350", "Zündspule – Primär-/Sekundärstromkreis");
        String coils = "ABCDEFGHIJKL";
        for (int c = 1; c <= 12; c++) {
            p("P03" + (50 + c), "Zündspule " + coils.charAt(c - 1) + " (Zylinder " + c + ") – Primär-/Sekundärstromkreis");
        }
        sensor4(0x0365, "Nockenwellenpositionssensor B (Bank 1)");
        p("P0380", "Glühkerzen/Heizung – Stromkreis A");
        p("P0381", "Glühzeit-Kontrollleuchte – Stromkreis");
        p("P0382", "Glühkerzen/Heizung – Stromkreis B");
        p("P0385", "Kurbelwellenpositionssensor B – Stromkreis");
        p("P0390", "Nockenwellenpositionssensor B (Bank 2) – Stromkreis");

        // Abgasnachbehandlung
        p("P0400", "Abgasrückführung (AGR) – Durchfluss fehlerhaft");
        p("P0401", "Abgasrückführung – Durchfluss zu gering (AGR-Ventil verkokt?)");
        p("P0402", "Abgasrückführung – Durchfluss zu hoch");
        p("P0403", "Abgasrückführung – Steuerkreis");
        p("P0404", "Abgasrückführung – Bereich/Leistung");
        p("P0405", "AGR-Sensor A – Signal zu niedrig");
        p("P0406", "AGR-Sensor A – Signal zu hoch");
        p("P0410", "Sekundärluftsystem – Fehlfunktion");
        p("P0411", "Sekundärluftsystem – falscher Durchfluss");
        p("P0412", "Sekundärluft-Umschaltventil A – Stromkreis");
        p("P0418", "Sekundärluftpumpenrelais A – Stromkreis");
        p("P0420", "Katalysator Bank 1 – Wirkungsgrad unter Schwellwert");
        p("P0421", "Vorkatalysator Bank 1 – Wirkungsgrad unter Schwellwert");
        p("P0430", "Katalysator Bank 2 – Wirkungsgrad unter Schwellwert");
        p("P0431", "Vorkatalysator Bank 2 – Wirkungsgrad unter Schwellwert");
        p("P0440", "Tankentlüftungssystem (EVAP) – Fehlfunktion");
        p("P0441", "Tankentlüftung – falscher Spülstrom");
        p("P0442", "Tankentlüftung – kleines Leck erkannt");
        p("P0443", "Tankentlüftungsventil (Spülventil) – Stromkreis");
        p("P0446", "Tankentlüftung Belüftungssteuerung – Stromkreis");
        p("P0449", "Tankentlüftung Belüftungsventil – Stromkreis");
        p("P0450", "Tankentlüftung Drucksensor – Stromkreis");
        p("P0451", "Tankentlüftung Drucksensor – Bereich/Leistung");
        p("P0452", "Tankentlüftung Drucksensor – Signal zu niedrig");
        p("P0453", "Tankentlüftung Drucksensor – Signal zu hoch");
        p("P0455", "Tankentlüftung – großes Leck erkannt (Tankdeckel prüfen)");
        p("P0456", "Tankentlüftung – sehr kleines Leck erkannt");
        p("P0457", "Tankentlüftung – Leck erkannt (Tankdeckel lose/fehlt)");
        sensor5(0x0460, "Kraftstoffstandsensor A");
        p("P0470", "Abgasdrucksensor – Stromkreis");
        p("P0471", "Abgasdrucksensor – Bereich/Leistung");
        p("P0480", "Kühlerlüfter 1 – Steuerkreis");
        p("P0481", "Kühlerlüfter 2 – Steuerkreis");
        p("P0489", "Abgasrückführung – Steuerkreis zu niedrig");
        p("P0490", "Abgasrückführung – Steuerkreis zu hoch");
        p("P0491", "Sekundärluftsystem Bank 1 – unzureichender Durchfluss");
        p("P0492", "Sekundärluftsystem Bank 2 – unzureichender Durchfluss");

        // Geschwindigkeit, Leerlauf, Eingänge
        p("P0500", "Fahrzeuggeschwindigkeitssensor A – Fehlfunktion");
        p("P0501", "Fahrzeuggeschwindigkeitssensor A – Bereich/Leistung");
        p("P0502", "Fahrzeuggeschwindigkeitssensor A – Signal zu niedrig");
        p("P0503", "Fahrzeuggeschwindigkeitssensor A – sporadisch/zu hoch");
        p("P0505", "Leerlaufregelung – Fehlfunktion");
        p("P0506", "Leerlaufdrehzahl niedriger als erwartet");
        p("P0507", "Leerlaufdrehzahl höher als erwartet (Falschluft?)");
        sensor4(0x0520, "Motoröldrucksensor/-schalter");
        p("P0530", "Klimaanlage Kältemitteldrucksensor A – Stromkreis");
        p("P0544", "Abgastemperatursensor Bank 1 Sensor 1 – Stromkreis");
        p("P0545", "Abgastemperatursensor Bank 1 Sensor 1 – Signal zu niedrig");
        p("P0546", "Abgastemperatursensor Bank 1 Sensor 1 – Signal zu hoch");
        p("P0560", "Bordnetzspannung – Fehlfunktion");
        p("P0561", "Bordnetzspannung – instabil");
        p("P0562", "Bordnetzspannung zu niedrig (Batterie/Lichtmaschine prüfen)");
        p("P0563", "Bordnetzspannung zu hoch");
        p("P0565", "Geschwindigkeitsregelanlage – Signal EIN");
        p("P0571", "Bremslichtschalter A – Stromkreis");
        p("P0597", "Thermostatheizung – Steuerkreis offen");

        // Steuergerät
        p("P0600", "Serielle Kommunikationsverbindung – Fehlfunktion");
        p("P0601", "Steuergerät intern – Speicher-Prüfsummenfehler");
        p("P0602", "Steuergerät – Programmierfehler");
        p("P0603", "Steuergerät intern – Dauerspeicher (KAM) Fehler");
        p("P0604", "Steuergerät intern – RAM-Fehler");
        p("P0605", "Steuergerät intern – ROM-Fehler");
        p("P0606", "Steuergerät – Prozessorfehler");
        p("P0607", "Steuergerät – Leistung");
        p("P0615", "Anlasserrelais – Stromkreis");
        p("P0620", "Generator (Lichtmaschine) – Steuerkreis");
        p("P0627", "Kraftstoffpumpe A – Steuerkreis offen");
        p("P0638", "Drosselklappensteller Bank 1 – Bereich/Leistung");
        p("P0641", "Sensor-Referenzspannung A – Stromkreis offen");
        p("P0650", "Motorkontrollleuchte (MKL) – Steuerkreis");
        p("P0657", "Steller-Versorgungsspannung A – Stromkreis offen");
        p("P0670", "Glühzeitsteuergerät – Stromkreis");
        for (int c = 1; c <= 8; c++) {
            p("P067" + c, "Glühkerze Zylinder " + c + " – Stromkreis");
        }
        p("P0685", "Motorsteuerrelais – Stromkreis offen");
        p("P0691", "Kühlerlüfter 1 – Steuerkreis zu niedrig");
        p("P0692", "Kühlerlüfter 1 – Steuerkreis zu hoch");

        // Getriebe
        p("P0700", "Getriebesteuerung – Fehler gespeichert (Getriebesteuergerät auslesen)");
        p("P0705", "Getriebe-Wählhebelpositionssensor – Stromkreis");
        p("P0710", "Getriebeöltemperatursensor A – Stromkreis");
        p("P0711", "Getriebeöltemperatursensor A – Bereich/Leistung");
        p("P0715", "Turbinendrehzahlsensor (Getriebeeingang) – Stromkreis");
        p("P0720", "Getriebeausgangsdrehzahlsensor – Stromkreis");
        p("P0725", "Motordrehzahl-Eingang Getriebe – Stromkreis");
        p("P0730", "Falsches Übersetzungsverhältnis");
        for (int g = 1; g <= 5; g++) p("P073" + g, "Gang " + g + " – falsches Übersetzungsverhältnis");
        p("P0736", "Rückwärtsgang – falsches Übersetzungsverhältnis");
        p("P0740", "Wandlerüberbrückungskupplung – Stromkreis");
        p("P0741", "Wandlerüberbrückungskupplung – Leistung oder hängt offen");
        p("P0743", "Wandlerüberbrückungskupplung – elektrisch");
        p("P0750", "Schaltmagnetventil A – Fehlfunktion");
        p("P0755", "Schaltmagnetventil B – Fehlfunktion");
        p("P0760", "Schaltmagnetventil C – Fehlfunktion");
        p("P0765", "Schaltmagnetventil D – Fehlfunktion");
        p("P0770", "Schaltmagnetventil E – Fehlfunktion");
        p("P0780", "Schaltfehler");
        p("P0841", "Getriebeöldrucksensor/-schalter A – Bereich/Leistung");
        p("P0850", "Park-/Neutralschalter – Eingangskreis");

        // P2xxx
        p("P2002", "Partikelfilter Bank 1 – Wirkungsgrad unter Schwellwert");
        p("P2004", "Saugrohrklappe Bank 1 – klemmt offen");
        p("P2008", "Saugrohrklappe (Drallklappe) Bank 1 – Steuerkreis offen");
        p("P2015", "Saugrohrklappe Positionssensor Bank 1 – Bereich/Leistung");
        p("P2096", "Nachkat-Gemischregelung Bank 1 – zu mager");
        p("P2097", "Nachkat-Gemischregelung Bank 1 – zu fett");
        p("P2098", "Nachkat-Gemischregelung Bank 2 – zu mager");
        p("P2099", "Nachkat-Gemischregelung Bank 2 – zu fett");
        p("P2100", "Drosselklappenmotor – Stromkreis offen");
        p("P2101", "Drosselklappenmotor – Bereich/Leistung");
        p("P2106", "Drosselklappensteller – erzwungene Leistungsbegrenzung (Notlauf)");
        p("P2110", "Drosselklappensteller – erzwungene Drehzahlbegrenzung");
        p("P2111", "Drosselklappensteller – klemmt offen");
        p("P2112", "Drosselklappensteller – klemmt geschlossen");
        p("P2118", "Drosselklappenmotor – Strom außerhalb Bereich");
        p("P2119", "Drosselklappengehäuse – Bereich/Leistung");
        p("P2122", "Fahrpedalsensor D – Signal zu niedrig");
        p("P2123", "Fahrpedalsensor D – Signal zu hoch");
        p("P2127", "Fahrpedalsensor E – Signal zu niedrig");
        p("P2128", "Fahrpedalsensor E – Signal zu hoch");
        p("P2135", "Drosselklappen-/Pedalsensor A/B – Spannungskorrelation");
        p("P2138", "Fahrpedalsensor D/E – Spannungskorrelation");
        p("P2177", "System zu mager außerhalb Leerlauf (Bank 1)");
        p("P2178", "System zu fett außerhalb Leerlauf (Bank 1)");
        p("P2179", "System zu mager außerhalb Leerlauf (Bank 2)");
        p("P2180", "System zu fett außerhalb Leerlauf (Bank 2)");
        p("P2187", "System zu mager im Leerlauf (Bank 1)");
        p("P2188", "System zu fett im Leerlauf (Bank 1)");
        p("P2189", "System zu mager im Leerlauf (Bank 2)");
        p("P2190", "System zu fett im Leerlauf (Bank 2)");
        p("P2195", "Lambdasonde B1S1 – Signal hängt mager");
        p("P2196", "Lambdasonde B1S1 – Signal hängt fett");
        p("P2197", "Lambdasonde B2S1 – Signal hängt mager");
        p("P2198", "Lambdasonde B2S1 – Signal hängt fett");
        p("P2237", "Lambdasonde B1S1 – Pumpstrom-Regelkreis offen");
        p("P2263", "Turbolader/Kompressor – Ladedrucksystem Leistung");
        p("P2279", "Ansaugluftsystem – Leck (Falschluft)");
        p("P2293", "Kraftstoffdruckregler 2 – Leistung");
        for (int c = 0; c < 8; c++) {
            int dec = 2300 + c * 3;
            p("P" + dec, "Zündspule " + coils.charAt(c) + " – Primärsteuerkreis zu niedrig");
            p("P" + (dec + 1), "Zündspule " + coils.charAt(c) + " – Primärsteuerkreis zu hoch");
            p("P" + (dec + 2), "Zündspule " + coils.charAt(c) + " – Sekundärkreis");
        }
        p("P242F", "Partikelfilter – Beschränkung durch Ascheansammlung");
        p("P2452", "Partikelfilter-Differenzdrucksensor – Stromkreis");
        p("P2453", "Partikelfilter-Differenzdrucksensor – Bereich/Leistung");
        p("P2454", "Partikelfilter-Differenzdrucksensor – Signal zu niedrig");
        p("P2455", "Partikelfilter-Differenzdrucksensor – Signal zu hoch");
        p("P2459", "Partikelfilter – Regenerationshäufigkeit zu hoch");
        p("P2463", "Partikelfilter – Rußansammlung zu hoch");
        p("P20EE", "SCR-Katalysator Bank 1 – NOx-Wirkungsgrad unter Schwellwert");

        // Netzwerk
        p("U0001", "High-Speed-CAN-Bus – Kommunikationsfehler");
        p("U0073", "Steuergeräte-Kommunikationsbus A – Bus aus");
        p("U0100", "Kommunikation mit Motorsteuergerät (ECM/PCM) verloren");
        p("U0101", "Kommunikation mit Getriebesteuergerät (TCM) verloren");
        p("U0102", "Kommunikation mit Verteilergetriebe-Steuergerät verloren");
        p("U0103", "Kommunikation mit Schaltmodul verloren");
        p("U0104", "Kommunikation mit Tempomat-Steuergerät verloren");
        p("U0106", "Kommunikation mit Glühzeitsteuergerät verloren");
        p("U0107", "Kommunikation mit Drosselklappensteuergerät verloren");
        p("U0121", "Kommunikation mit ABS-Steuergerät verloren");
        p("U0122", "Kommunikation mit Fahrdynamikregelung verloren");
        p("U0126", "Kommunikation mit Lenkwinkelsensor verloren");
        p("U0128", "Kommunikation mit Parkbremse verloren");
        p("U0131", "Kommunikation mit Servolenkung verloren");
        p("U0140", "Kommunikation mit Karosseriesteuergerät (BCM) verloren");
        p("U0151", "Kommunikation mit Airbag-Steuergerät verloren");
        p("U0155", "Kommunikation mit Kombiinstrument verloren");
        p("U0164", "Kommunikation mit Klimasteuergerät verloren");
        p("U0184", "Kommunikation mit Radio verloren");
        p("U0199", "Kommunikation mit Türsteuergerät A verloren");
        p("U0401", "Ungültige Daten vom Motorsteuergerät empfangen");
        p("U0402", "Ungültige Daten vom Getriebesteuergerät empfangen");
        p("U0415", "Ungültige Daten vom ABS-Steuergerät empfangen");

        // Fahrwerk / Karosserie (allgemein)
        p("C0035", "Raddrehzahlsensor vorne links – Stromkreis");
        p("C0040", "Raddrehzahlsensor vorne rechts – Stromkreis");
        p("C0045", "Raddrehzahlsensor hinten links – Stromkreis");
        p("C0050", "Raddrehzahlsensor hinten rechts – Stromkreis");
        p("B0001", "Fahrer-Frontairbag Stufe 1 – Zündkreis");
        p("B0002", "Fahrer-Frontairbag Stufe 2 – Zündkreis");
        p("B0010", "Beifahrer-Frontairbag Stufe 1 – Zündkreis");
    }

    public static String lookup(String code) {
        return DB.get(code.toUpperCase());
    }

    public static String describe(String code) {
        if (code == null || code.length() < 5) return "Unbekannter Code";
        String c = code.toUpperCase().substring(0, 5);
        String d = DB.get(c);
        if (d != null) return d;
        return category(c);
    }

    /** Einordnung nach Bereich, wenn keine genaue Beschreibung vorliegt. */
    public static String category(String c) {
        char sys = c.charAt(0);
        char d1 = c.charAt(1);
        char d2 = c.charAt(2);
        boolean oem;
        switch (sys) {
            case 'P':
                oem = d1 == '1' || (d1 == '3' && d2 <= '3');
                if (oem) return "Herstellerspezifischer Motor-/Getriebecode – " + area(d2);
                return "Antrieb – " + area(d2);
            case 'C':
                oem = d1 == '1' || d1 == '2';
                return (oem ? "Herstellerspezifischer " : "") + "Fahrwerkscode (Bremsen, ABS/ESP, Lenkung, Federung)";
            case 'B':
                oem = d1 == '1' || d1 == '2';
                return (oem ? "Herstellerspezifischer " : "") + "Karosseriecode (Airbag, Komfort, Licht, Klima)";
            case 'U':
                oem = d1 == '1' || d1 == '2';
                if (!oem && d2 == '1') return "Kommunikation mit einem Steuergerät verloren";
                if (!oem && (d2 == '3')) return "Software-Inkompatibilität zwischen Steuergeräten";
                if (!oem && (d2 == '4')) return "Ungültige Daten von einem Steuergerät empfangen";
                return (oem ? "Herstellerspezifischer " : "") + "Netzwerk-/Kommunikationscode";
            default:
                return "Unbekannter Code";
        }
    }

    private static String area(char d) {
        switch (d) {
            case '0': return "Kraftstoff-/Luftmessung, Abgas, Nockenwellenverstellung";
            case '1': return "Kraftstoff- und Luftmessung";
            case '2': return "Kraftstoff- und Luftmessung (Einspritzung)";
            case '3': return "Zündsystem oder Zündaussetzer";
            case '4': return "Zusätzliche Abgasreinigung";
            case '5': return "Geschwindigkeit, Leerlauf, Hilfseingänge";
            case '6': return "Steuergerät und Ausgänge";
            case '7': case '8': case '9': return "Getriebe";
            case 'A': case 'B': case 'C': return "Hybrid-/Elektroantrieb";
            default: return "Antriebsstrang";
        }
    }

    /** Alle Codes, die mit dem Suchbegriff beginnen oder ihn im Text enthalten. */
    public static List<String> search(String q) {
        List<String> r = new ArrayList<String>();
        String u = q.trim().toUpperCase();
        String l = q.trim().toLowerCase();
        if (u.isEmpty()) return r;
        for (Map.Entry<String, String> e : DB.entrySet()) {
            if (e.getKey().startsWith(u) || e.getValue().toLowerCase().contains(l)) r.add(e.getKey());
        }
        java.util.Collections.sort(r);
        return r;
    }
}
