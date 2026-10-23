package de.wunschfabrik.launcher;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** App-Suche ohne Android-Abhängigkeiten, damit sie auf dem Rechner testbar ist. */
public final class Search {
    private Search() {}

    /** Kleinbuchstaben, ohne Akzente; ß wird ss, ä/ö/ü werden a/o/u. */
    public static String normalize(String s) {
        if (s == null) return "";
        String t = s.toLowerCase(Locale.GERMAN).replace("ß", "ss");
        t = Normalizer.normalize(t, Normalizer.Form.NFD);
        StringBuilder b = new StringBuilder(t.length());
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (Character.getType(c) != Character.NON_SPACING_MARK) b.append(c);
        }
        return b.toString().trim();
    }

    /**
     * Wie gut passt die Anfrage zum Namen? 0 = gar nicht.
     * Anfang des Namens > Anfang eines Wortes > Anfangsbuchstaben > irgendwo enthalten > Buchstabenfolge.
     */
    public static int score(String label, String query) {
        String l = normalize(label);
        String q = normalize(query);
        if (q.isEmpty()) return 1;
        if (l.equals(q)) return 100;
        if (l.startsWith(q)) return 80;
        String[] words = l.split("[\\s\\-_.:]+");
        for (String w : words) if (w.startsWith(q)) return 60;
        StringBuilder initials = new StringBuilder();
        for (String w : words) if (!w.isEmpty()) initials.append(w.charAt(0));
        if (q.length() >= 2 && initials.toString().startsWith(q)) return 50;
        if (l.contains(q)) return 40;
        String compact = q.replace(" ", "");
        int i = 0;
        for (int j = 0; j < l.length() && i < compact.length(); j++) {
            if (l.charAt(j) == compact.charAt(i)) i++;
        }
        return (i == compact.length() && compact.length() >= 2) ? 10 : 0;
    }

    public interface Labeled { String label(); }

    /** Treffer nach Güte sortiert, bei Gleichstand alphabetisch. */
    public static <T extends Labeled> List<T> filter(List<T> items, String query) {
        final String q = query == null ? "" : query;
        List<T> out = new ArrayList<>();
        final Map<T, Integer> scores = new IdentityHashMap<>();
        for (T it : items) {
            int s = score(it.label(), q);
            if (s > 0) { out.add(it); scores.put(it, s); }
        }
        Collections.sort(out, new Comparator<T>() {
            @Override public int compare(T a, T b) {
                int d = scores.get(b) - scores.get(a);
                return d != 0 ? d : normalize(a.label()).compareTo(normalize(b.label()));
            }
        });
        return out;
    }

    /** Verschiebt ein Element einer Liste um delta Plätze (für die Favoriten-Reihenfolge). */
    public static <T> boolean move(List<T> list, T item, int delta) {
        int from = list.indexOf(item);
        if (from < 0) return false;
        int to = Math.max(0, Math.min(list.size() - 1, from + delta));
        if (to == from) return false;
        list.remove(from);
        list.add(to, item);
        return true;
    }
}
