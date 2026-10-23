package de.wunschfabrik.launcher;

public class LogicTest {
    static int failed = 0;

    static void check(boolean ok, String what) {
        System.out.println((ok ? "OK    " : "FEHLER ") + what);
        if (!ok) failed++;
    }

    public static void main(String[] args) {
        int mofr = 0x1F, s = 8 * 60, e = 16 * 60;
        check(Logic.isWorkTime(0, 9 * 60, s, e, mofr), "Montag 9:00 ist Arbeit");
        check(!Logic.isWorkTime(0, 7 * 60 + 59, s, e, mofr), "Montag 7:59 ist frei");
        check(!Logic.isWorkTime(0, 16 * 60, s, e, mofr), "16:00 ist schon Feierabend");
        check(!Logic.isWorkTime(5, 10 * 60, s, e, mofr), "Samstag frei");
        check(Logic.isWorkTime(4, 23 * 60, 22 * 60, 6 * 60, mofr), "Nachtschicht Freitag 23:00");
        check(Logic.isWorkTime(5, 3 * 60, 22 * 60, 6 * 60, mofr), "Nachtschicht Samstag 3:00 gehört zum Freitag");
        check(!Logic.isWorkTime(6, 3 * 60, 22 * 60, 6 * 60, mofr), "Sonntag 3:00 frei (Samstag keine Schicht)");
        check(Logic.minutesToNextChange(0, 9 * 60, s, e, mofr) == 7 * 60, "Montag 9:00 → Feierabend in 7 h");
        check(Logic.minutesToNextChange(4, 17 * 60, s, e, mofr) == (7 + 48 + 8) * 60, "Freitag 17:00 → Montag 8:00");
        check(Logic.minutesToNextChange(0, 9 * 60, s, e, 0) == -1, "ohne Arbeitstage kein Wechsel");
        check(Logic.hhmm(8 * 60 + 5).equals("08:05"), "hhmm");
        check(Logic.parseHhmm("8:30") == 510 && Logic.parseHhmm("0830") == 510 && Logic.parseHhmm("16") == 960
                && Logic.parseHhmm("8.15") == 495, "Uhrzeit eingeben");
        check(Logic.parseHhmm("25:00") == -1 && Logic.parseHhmm("abc") == -1, "ungültige Uhrzeit");

        String tok = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        String link = "https://wunsch-fabrik.dk/auftraege/werkstatt/?t=" + tok;
        check(tok.equals(Logic.displayToken(link)), "Token aus Link");
        check(tok.equals(Logic.displayToken(" " + tok.toUpperCase() + "\n")), "nur Token, Großbuchstaben");
        check(tok.equals(Logic.displayToken(link + "&l=da")), "Link mit Sprache");
        check(Logic.displayToken(link.substring(0, link.length() - 3)) == null, "abgeschnittener Link");
        check(Logic.displayBase(link, "x").equals("https://wunsch-fabrik.dk/auftraege/"), "Basisadresse");
        check(Logic.displayBase(tok, "x").equals("x"), "Basisadresse ohne Link");

        check(Logic.weatherIcon(0).equals("☀") && Logic.weatherText(63).equals("Regen"), "Wetter-Codes");

        if (failed > 0) { System.out.println(failed + " Test(s) fehlgeschlagen"); System.exit(1); }
        System.out.println("Alle Logik-Tests bestanden");
    }
}
