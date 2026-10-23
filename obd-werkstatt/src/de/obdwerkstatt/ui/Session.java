package de.obdwerkstatt.ui;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import de.obdwerkstatt.core.Dtc;
import de.obdwerkstatt.core.Elm327;
import de.obdwerkstatt.core.ObdApi;
import de.obdwerkstatt.core.Transport;

/** Verbindungszustand und Hintergrund-Thread für alle Adapterzugriffe. */
public final class Session {
    private Session() {
    }

    public static volatile Transport transport;
    public static volatile Elm327 elm;
    public static volatile ObdApi api;

    /** Ein einziger Arbeits-Thread, damit Befehle nie gleichzeitig an den Adapter gehen. */
    static final ExecutorService WORKER = Executors.newSingleThreadExecutor();

    // Zuletzt gelesene Daten für den Diagnosebericht
    public static String vin;
    public static List<Dtc> lastDtcs = new ArrayList<Dtc>();
    public static ObdApi.Readiness lastReadiness;
    public static String lastVoltage;

    public static boolean connected() {
        return api != null && transport != null && !transport.isFailed();
    }

    public static ObdApi api() throws IOException {
        ObdApi a = api;
        if (a == null || transport == null || transport.isFailed()) throw new IOException("Nicht mit Adapter verbunden.");
        return a;
    }

    public static void disconnect() {
        Transport t = transport;
        transport = null;
        elm = null;
        api = null;
        vin = null;
        lastReadiness = null;
        lastVoltage = null;
        lastDtcs = new ArrayList<Dtc>();
        if (t != null) t.close();
    }
}
