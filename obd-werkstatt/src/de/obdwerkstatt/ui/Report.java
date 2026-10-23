package de.obdwerkstatt.ui;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import de.obdwerkstatt.core.Dtc;
import de.obdwerkstatt.core.EcuNames;
import de.obdwerkstatt.core.ObdApi;
import de.obdwerkstatt.core.VinDecoder;

/** Diagnosebericht als Text aus den zuletzt gelesenen Daten. */
final class Report {
    private Report() {
    }

    static String build() {
        StringBuilder sb = new StringBuilder();
        sb.append("DIAGNOSEBERICHT – OBD Werkstatt\n");
        sb.append("Datum: ").append(new SimpleDateFormat("dd.MM.yyyy HH:mm", Locale.GERMANY).format(new Date())).append("\n\n");
        if (Session.vin != null) {
            sb.append("FIN: ").append(Session.vin).append(" (").append(VinDecoder.manufacturer(Session.vin)).append(")\n");
        }
        if (Session.elm != null) sb.append("Protokoll: ").append(Session.elm.protocolDesc).append('\n');
        if (Session.lastVoltage != null) sb.append("Batteriespannung: ").append(Session.lastVoltage).append('\n');
        ObdApi.Readiness r = Session.lastReadiness;
        if (r != null) {
            sb.append("\nMotorkontrollleuchte: ").append(r.mil ? "AN" : "aus").append('\n');
            sb.append("Readiness:\n");
            for (ObdApi.Monitor m : r.monitors) {
                if (!m.supported) continue;
                sb.append("  ").append(m.complete ? "[✓] " : "[ ] ").append(m.name).append('\n');
            }
        }
        sb.append("\nFehlercodes:\n");
        if (Session.lastDtcs.isEmpty()) sb.append("  keine (bzw. noch nicht ausgelesen)\n");
        for (Dtc d : Session.lastDtcs) {
            sb.append("  ").append(d.code).append("  [").append(d.kind).append(", ").append(EcuNames.name(d.ecu))
                    .append("]\n    ").append(d.description()).append('\n');
        }
        return sb.toString();
    }

    static void share(MainActivity act) {
        if (Session.lastDtcs.isEmpty() && Session.lastReadiness == null && Session.vin == null) {
            act.alert("Bericht", "Bitte zuerst den Fehlerspeicher und ggf. die Fahrzeugdaten auslesen.");
            return;
        }
        act.share("Diagnosebericht", build());
    }
}
