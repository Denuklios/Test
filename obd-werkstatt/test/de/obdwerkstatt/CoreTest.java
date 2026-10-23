package de.obdwerkstatt;

import de.obdwerkstatt.core.*;
import java.util.*;

/** Prüft den Diagnosekern gegen den simulierten Adapter und einige echte ELM-Antworten. */
public class CoreTest {
    static int fails = 0;

    static void check(boolean c, String msg) {
        System.out.println((c ? "OK   " : "FAIL ") + msg);
        if (!c) fails++;
    }

    public static void main(String[] a) throws Exception {
        // Parser: echte Mitschnitte
        List<Frame> f = ResponseParser.parse("7E8 10 14 49 02 01 31 44 34\n7E8 21 47 50 30 30 52 35 35\n7E8 22 42 31 32 33 34 35 36", true, false);
        check(f.size() == 1 && Hex.ascii(f.get(0).data, 3).equals("1D4GP00R55B123456"), "ISO-TP Mehrfachrahmen VIN: " + f);
        f = ResponseParser.parse("48 6B 10 43 01 33 00 00 00 00 A1\n48 6B 10 43 00 00 00 00 00 00 9F", false, false);
        check(f.size() == 2 && f.get(0).data[1] == 0x01 && f.get(0).ecu.equals("10"), "J1850 mit Header/Prüfsumme: " + f);
        f = ResponseParser.parse("18 DA F1 10 06 41 00 BE 3F A8 13", true, true);
        check(f.size() == 1 && f.get(0).ecu.equals("18DAF110") && f.get(0).data[0] == 0x41, "29-Bit CAN: " + f);
        f = ResponseParser.parse("014\n0: 49 02 01 31 44 34\n1: 47 50 30 30 52 35 35\n2: 42 31 32 33 34 35 36", true, false);
        check(f.size() == 1 && Hex.ascii(f.get(0).data, 3).equals("1D4GP00R55B123456"), "Mehrfachrahmen ohne Header: " + f);
        check(Dtc.decode(0x01, 0x33).equals("P0133") && Dtc.decode(0xC1, 0x00).equals("U0100") && Dtc.decode(0x40, 0x35).equals("C0035"), "DTC-Dekodierung");
        check(DtcDatabase.describe("P0301").contains("Zylinder 1"), "DB P0301: " + DtcDatabase.describe("P0301"));
        check(DtcDatabase.describe("P0264").contains("Zylinder 2"), "DB P0264: " + DtcDatabase.describe("P0264"));
        check(DtcDatabase.describe("P0362").contains("Zylinder 12"), "DB P0362: " + DtcDatabase.describe("P0362"));
        check(DtcDatabase.describe("P1234").startsWith("Herstellerspezifisch"), "DB P1234: " + DtcDatabase.describe("P1234"));

        DemoTransport t = new DemoTransport();
        Elm327 elm = new Elm327(t);
        elm.init(0, new Elm327.Log() { public void line(String s) { System.out.println("  log: " + s); } });
        check(elm.protocol == 6 && elm.isCan(), "Protokoll erkannt: " + elm.protocolDesc);
        ObdApi api = new ObdApi(elm);
        boolean[] s = api.supportedPids();
        check(s[0x0C] && s[0x0D] && s[0x5C] && s[0xA6] && !s[0x0A], "Unterstützte PIDs");
        int[] rpm = api.readPid(0x0C);
        check(rpm != null && PidTable.value(0x0C, rpm) > 500, "Drehzahl " + PidTable.format(0x0C, rpm));
        System.out.println("  km: " + PidTable.format(0xA6, api.readPid(0xA6)) + ", Kraftstoff: " + PidTable.format(0x51, api.readPid(0x51)));
        List<Dtc> d = api.readAllDtcs();
        for (Dtc x : d) System.out.println("  " + x.kind + " " + x.code + " [" + EcuNames.name(x.ecu) + "] " + x.description());
        check(d.size() == 4, "4 Fehler (P0301,P0171,P0715,P0420)");
        ObdApi.Readiness r = api.readiness();
        check(r.mil && r.dtcCount == 2 && !r.diesel, "Readiness MKL/Anzahl");
        String vin = api.readVin();
        check("WVWZZZ1KZAM654321".equals(vin), "VIN " + vin + " " + VinDecoder.manufacturer(vin) + " " + VinDecoder.modelYear(vin));
        System.out.println("  Kalib: " + api.readInfoText(0x04) + " CVN: " + api.readInfoText(0x06) + " Name: " + api.readInfoText(0x0A));
        List<ObdApi.FreezeValue> ff = api.readFreezeFrame();
        for (ObdApi.FreezeValue v : ff) System.out.println("  FF " + PidTable.name(v.pid) + " = " + v.value);
        check(ff.size() == FREEZE, "Freeze Frame Werte: " + ff.size());
        List<ObdApi.TestResult> m6 = api.readMode06();
        for (ObdApi.TestResult x : m6) System.out.println("  M06 " + Mode06Names.mid(x.mid) + " / " + Mode06Names.tid(x.mid, x.tid) + " = " + x.value + " [" + x.min + ".." + x.max + "] " + (x.passed() ? "OK" : "NOK"));
        check(m6.size() >= 10, "Modus 06 Ergebnisse: " + m6.size());
        List<ObdApi.Module> mods = api.scanModules(false, new ObdApi.Progress() {
            public void update(String text, int done, int total) {}
            public boolean cancelled() { return false; }
        });
        for (ObdApi.Module m : mods) System.out.println("  Modul " + m.label());
        check(mods.size() == 4, "4 Steuergeräte gefunden");
        ObdApi.Module abs = null;
        for (ObdApi.Module m : mods) if (m.request.equals("713")) abs = m;
        List<Dtc> ad = api.moduleDtcs(abs);
        for (Dtc x : ad) System.out.println("  ABS " + x.code + " " + x.detail + " " + x.description());
        check(ad.size() == 1 && ad.get(0).code.equals("C0035"), "ABS-Fehler gelesen");
        System.out.println("  Ident: " + api.moduleIdent(abs));
        System.out.println("  " + api.moduleClear(abs));
        check(api.moduleDtcs(abs).isEmpty(), "ABS-Fehler gelöscht");
        System.out.println("  " + api.clearDtcs());
        check(api.readAllDtcs().isEmpty(), "OBD-Fehler gelöscht");
        r = api.readiness();
        check(!r.mil, "MKL aus nach Löschen");
        System.out.println(fails == 0 ? "ALLE TESTS OK" : fails + " FEHLER");
        System.exit(fails == 0 ? 0 : 1);
    }
    static final int FREEZE = 10;
}
