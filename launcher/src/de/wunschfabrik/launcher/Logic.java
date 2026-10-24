package de.wunschfabrik.launcher;

/** Reine Logik ohne Android-Abhängigkeiten (auf dem Rechner getestet). */
public final class Logic {
    private Logic() {}

    // ---------- Arbeitszeit ----------

    /**
     * Ist zu diesem Zeitpunkt Arbeitszeit?
     * @param dayIndex 0 = Montag … 6 = Sonntag
     * @param minute Minuten seit Mitternacht
     * @param daysMask Bit 0 = Montag … Bit 6 = Sonntag
     * Endet die Arbeitszeit nach Mitternacht (z. B. 22:00–06:00), zählt der Morgen noch zum Vortag.
     */
    public static boolean isWorkTime(int dayIndex, int minute, int start, int end, int daysMask) {
        if (start == end) return false;
        if (start < end) return dayOn(daysMask, dayIndex) && minute >= start && minute < end;
        if (minute >= start) return dayOn(daysMask, dayIndex);
        return minute < end && dayOn(daysMask, (dayIndex + 6) % 7);
    }

    private static boolean dayOn(int mask, int day) { return (mask & (1 << day)) != 0; }

    /**
     * Minuten bis zum nächsten Wechsel Arbeit ↔ Feierabend (höchstens eine Woche), oder -1 wenn es keinen gibt.
     */
    public static int minutesToNextChange(int dayIndex, int minute, int start, int end, int daysMask) {
        boolean now = isWorkTime(dayIndex, minute, start, end, daysMask);
        for (int m = 1; m <= 7 * 24 * 60; m++) {
            int t = minute + m;
            int d = (dayIndex + t / (24 * 60)) % 7;
            if (isWorkTime(d, t % (24 * 60), start, end, daysMask) != now) return m;
        }
        return -1;
    }

    public static String hhmm(int minutes) {
        int m = ((minutes % 1440) + 1440) % 1440;
        return String.format(java.util.Locale.ROOT, "%02d:%02d", m / 60, m % 60);
    }

    /** "8:30", "08:30", "830" → Minuten, sonst -1. */
    public static int parseHhmm(String s) {
        if (s == null) return -1;
        String t = s.trim().replace('.', ':');
        int h, m;
        try {
            if (t.contains(":")) {
                String[] p = t.split(":");
                h = Integer.parseInt(p[0].trim());
                m = p.length > 1 && !p[1].trim().isEmpty() ? Integer.parseInt(p[1].trim()) : 0;
            } else if (t.length() >= 3) {
                h = Integer.parseInt(t.substring(0, t.length() - 2));
                m = Integer.parseInt(t.substring(t.length() - 2));
            } else {
                h = Integer.parseInt(t);
                m = 0;
            }
        } catch (NumberFormatException e) {
            return -1;
        }
        if (h < 0 || h > 24 || m < 0 || m > 59 || (h == 24 && m > 0)) return -1;
        return (h * 60 + m) % 1440;
    }

    // ---------- Link der Werkstatt-Anzeige ----------

    /** Token (64 Hex-Zeichen) aus dem Link „…/auftraege/werkstatt/?t=…“ oder nur dem Token; sonst null. */
    public static String displayToken(String link) {
        if (link == null) return null;
        String s = link.trim();
        int i = s.indexOf("t=");
        String raw = i >= 0 ? s.substring(i + 2) : s;
        int amp = raw.indexOf('&');
        if (amp >= 0) raw = raw.substring(0, amp);
        String hex = raw.replaceAll("[^0-9a-fA-F]", "").toLowerCase(java.util.Locale.ROOT);
        return hex.length() == 64 ? hex : null;
    }

    /** Basisadresse der Auftrags-App aus dem Link, z. B. „https://wunsch-fabrik.dk/auftraege/“. */
    public static String displayBase(String link, String fallback) {
        if (link == null) return fallback;
        String s = link.trim();
        int w = s.indexOf("werkstatt/");
        if (w > 0 && s.startsWith("http")) return s.substring(0, w);
        return fallback;
    }

    /** Link „Neuer Auftrag“ mit der Notiz: die Auftrags-App verteilt sie auf Kunde, Menge, Artikel, Verfahren, Termin, Preis. */
    public static String noteOrderUrl(String base, String note) {
        String n = note == null ? "" : note.trim();
        if (n.length() > 4000) n = n.substring(0, 4000);
        try {
            return base + "index.php#/new?note=" + java.net.URLEncoder.encode(n, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            return base + "index.php#/new";
        }
    }

    // ---------- Wetter (WMO-Codes von Open-Meteo) ----------

    public static String weatherIcon(int code) {
        if (code == 0) return "☀";
        if (code <= 2) return "🌤";
        if (code == 3) return "☁";
        if (code == 45 || code == 48) return "🌫";
        if (code >= 51 && code <= 67) return "🌧";
        if (code >= 71 && code <= 77) return "❄";
        if (code >= 80 && code <= 82) return "🌦";
        if (code >= 85 && code <= 86) return "🌨";
        if (code >= 95) return "⛈";
        return "🌡";
    }

    public static String weatherText(int code) {
        if (code == 0) return "klar";
        if (code <= 2) return "heiter";
        if (code == 3) return "bewölkt";
        if (code == 45 || code == 48) return "Nebel";
        if (code >= 51 && code <= 57) return "Niesel";
        if (code >= 61 && code <= 67) return "Regen";
        if (code >= 71 && code <= 77) return "Schnee";
        if (code >= 80 && code <= 82) return "Schauer";
        if (code >= 85 && code <= 86) return "Schneeschauer";
        if (code >= 95) return "Gewitter";
        return "";
    }
}
