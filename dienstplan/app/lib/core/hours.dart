import 'dates.dart';
import 'models.dart';

/// Wie Pausen von der Dienstzeit abgezogen werden.
enum PauseMode { none, fixed, legal }

class PauseRule {
  final PauseMode mode;

  /// Bei [PauseMode.fixed]: so viele Minuten abziehen …
  final int fixedMinutes;

  /// … wenn der Dienst länger als so viele Minuten dauert.
  final int fixedThreshold;

  const PauseRule({this.mode = PauseMode.legal, this.fixedMinutes = 30, this.fixedThreshold = 360});

  /// Pause in Minuten für einen Dienst mit [gross] Minuten Anwesenheit.
  int pauseFor(int gross) {
    switch (mode) {
      case PauseMode.none:
        return 0;
      case PauseMode.fixed:
        return gross > fixedThreshold ? fixedMinutes.clamp(0, gross) : 0;
      case PauseMode.legal:
        // § 4 ArbZG: mehr als 6 Std. -> 30 Min., mehr als 9 Std. -> 45 Min.
        if (gross > 540) return 45;
        if (gross > 360) return 30;
        return 0;
    }
  }

  String describe() {
    switch (mode) {
      case PauseMode.none:
        return 'Keine Pause abziehen';
      case PauseMode.fixed:
        return '$fixedMinutes Min. ab ${formatHm(fixedThreshold).replaceFirst(':00', '')} Std. Dienst';
      case PauseMode.legal:
        return 'Gesetzlich: 30 Min. ab 6 Std., 45 Min. ab 9 Std.';
    }
  }
}

/// Dauer eines Dienstes in Minuten (über Mitternacht möglich). Ganztägige Dienste zählen 0.
int shiftMinutes(String start, String end) {
  final s = parseHm(start), e = parseHm(end);
  if (s == null || e == null) return 0;
  return e > s ? e - s : e + 1440 - s;
}

class HoursEntry {
  final DateTime day;
  final Shift shift;
  final int gross;
  final int pause;

  const HoursEntry(this.day, this.shift, this.gross, this.pause);

  int get net => gross - pause;
}

class MonthHours {
  final List<HoursEntry> entries;
  final Map<String, int> offDays; // z. B. Urlaub: 3, Krank: 1

  const MonthHours(this.entries, this.offDays);

  int get gross => entries.fold(0, (a, b) => a + b.gross);
  int get pause => entries.fold(0, (a, b) => a + b.pause);
  int get net => gross - pause;
  int get shifts => entries.length;
}

/// Stundenübersicht eines Mitarbeiters für einen Monat.
MonthHours monthHours(DienstState st, String empId, DateTime month, PauseRule rule) {
  final entries = <HoursEntry>[];
  final off = <String, int>{};
  final days = daysInMonth(month.year, month.month);
  for (var i = 1; i <= days; i++) {
    final d = DateTime(month.year, month.month, i);
    final sh = st.shiftOf(empId, dayKey(d));
    if (sh == null) continue;
    if (sh.hasTimes) {
      final g = shiftMinutes(sh.start, sh.end);
      entries.add(HoursEntry(d, sh, g, rule.pauseFor(g)));
    } else {
      off[sh.name] = (off[sh.name] ?? 0) + 1;
    }
  }
  return MonthHours(entries, off);
}
