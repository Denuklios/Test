import 'dates.dart';
import 'models.dart';

/// Ein konkreter Dienst eines Mitarbeiters an einem Tag.
class DatedShift {
  final String dayKey;
  final DateTime day;
  final Shift shift;

  const DatedShift(this.dayKey, this.day, this.shift);

  /// Beginn/Ende als DateTime (nur bei Diensten mit Zeiten).
  (DateTime, DateTime)? get interval => shift.hasTimes ? shiftInterval(dayKey, shift.start, shift.end) : null;
}

/// Eigene Dienste ab [from] für [days] Tage.
List<DatedShift> shiftsInRange(DienstState st, String empId, DateTime from, int days) {
  final out = <DatedShift>[];
  for (var i = 0; i < days; i++) {
    final d = addDays(from, i);
    final k = dayKey(d);
    final sh = st.shiftOf(empId, k);
    if (sh != null) out.add(DatedShift(k, d, sh));
  }
  return out;
}

/// Nächster Arbeitsdienst, der nach [now] beginnt (bis 120 Tage voraus).
DatedShift? nextShift(DienstState st, String empId, DateTime now) {
  final start = addDays(dateOnly(now), -1);
  for (final ds in shiftsInRange(st, empId, start, 122)) {
    final iv = ds.interval;
    if (iv != null && iv.$1.isAfter(now)) return ds;
  }
  return null;
}

/// Dienst, der gerade läuft (auch vom Vortag über Mitternacht).
DatedShift? currentShift(DienstState st, String empId, DateTime now) {
  for (final ds in shiftsInRange(st, empId, addDays(dateOnly(now), -1), 2)) {
    final iv = ds.interval;
    if (iv != null && !now.isBefore(iv.$1) && now.isBefore(iv.$2)) return ds;
  }
  return null;
}

/// Eine erkannte Änderung am eigenen Dienst.
class ShiftChange {
  final DateTime day;
  final Shift? before;
  final Shift? after;

  const ShiftChange(this.day, this.before, this.after);

  String get afterText {
    final a = after;
    if (a == null) return 'kein Dienst mehr eingetragen';
    return a.hasTimes ? '${a.name} ${a.start}–${a.end}' : a.name;
  }
}

/// Vergleicht die eigenen Dienste von heute bis [days] Tage voraus.
List<ShiftChange> diffOwnShifts(DienstState? oldSt, DienstState newSt, String empId, DateTime today, {int days = 60}) {
  if (oldSt == null || oldSt.me.id != empId) return const [];
  final out = <ShiftChange>[];
  for (var i = 0; i < days; i++) {
    final d = addDays(dateOnly(today), i);
    final k = dayKey(d);
    final a = oldSt.shiftOf(empId, k), b = newSt.shiftOf(empId, k);
    if (a?.signature != b?.signature) out.add(ShiftChange(d, a, b));
  }
  return out;
}

/// Text für die Benachrichtigung, z. B. „Dein Dienst am Montag, 27.10. hat sich geändert“.
(String, String) changeMessage(List<ShiftChange> ch) {
  if (ch.length == 1) {
    final c = ch.first;
    final wd = weekdayLong[c.day.weekday - 1];
    return ('Dein Dienst am $wd hat sich geändert', '$wd, ${shortDate(c.day)}: ${c.afterText}');
  }
  final list = ch.take(4).map((c) => mediumDate(c.day)).join(', ');
  return ('${ch.length} Dienste haben sich geändert', ch.length > 4 ? '$list …' : list);
}
