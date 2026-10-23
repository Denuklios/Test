package de.wunschfabrik.launcher;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class SearchTest {
    static int failed = 0;

    static void check(boolean ok, String what) {
        System.out.println((ok ? "OK    " : "FEHLER ") + what);
        if (!ok) failed++;
    }

    static final class App implements Search.Labeled {
        final String name;
        App(String n) { name = n; }
        @Override public String label() { return name; }
        @Override public String toString() { return name; }
    }

    static List<String> names(List<App> l) {
        List<String> r = new ArrayList<>();
        for (App a : l) r.add(a.name);
        return r;
    }

    public static void main(String[] args) {
        check(Search.normalize("Größe Ärger").equals("grosse arger"), "Umlaute und ß normalisieren");
        check(Search.score("Kamera", "kam") == 80, "Anfang des Namens");
        check(Search.score("Google Maps", "maps") == 60, "Anfang eines Wortes");
        check(Search.score("Google Maps", "gm") == 50, "Anfangsbuchstaben");
        check(Search.score("WhatsApp", "app") == 40, "irgendwo enthalten");
        check(Search.score("Einstellungen", "estlg") == 10, "Buchstabenfolge");
        check(Search.score("Kamera", "xyz") == 0, "kein Treffer");
        check(Search.score("Uhr", "") == 1, "leere Suche zeigt alles");
        check(Search.score("Müll-Kalender", "mull") == 80, "Umlaut in App-Namen ohne Umlaut gesucht");

        List<App> apps = Arrays.asList(new App("Maps"), new App("Google Maps"), new App("Gmail"),
                new App("Kamera"), new App("Galerie"));
        List<String> r = names(Search.filter(apps, "ma"));
        check(r.equals(Arrays.asList("Maps", "Google Maps", "Gmail", "Kamera")), "Sortierung nach Güte: " + r);
        r = names(Search.filter(apps, ""));
        check(r.equals(Arrays.asList("Galerie", "Gmail", "Google Maps", "Kamera", "Maps")), "alles alphabetisch: " + r);

        List<String> fav = new ArrayList<>(Arrays.asList("a", "b", "c"));
        check(Search.move(fav, "c", -1) && fav.equals(Arrays.asList("a", "c", "b")), "Favorit nach links");
        check(!Search.move(fav, "a", -1), "erster Favorit bleibt vorne");
        check(Search.move(fav, "a", 5) && fav.equals(Arrays.asList("c", "b", "a")), "Favorit ans Ende");

        if (failed > 0) { System.out.println(failed + " Test(s) fehlgeschlagen"); System.exit(1); }
        System.out.println("Alle Tests bestanden");
    }
}
