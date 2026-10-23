/// Datumshilfen. Der Plan arbeitet mit Kalendertagen im Format YYYY-MM-DD (Ortszeit).
library;

const weekdayShort = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const weekdayLong = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const monthNames = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

String _p2(int n) => n.toString().padLeft(2, '0');

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

String dayKey(DateTime d) => '${d.year}-${_p2(d.month)}-${_p2(d.day)}';

DateTime parseDayKey(String k) {
  final p = k.split('-');
  return DateTime(int.parse(p[0]), int.parse(p[1]), int.parse(p[2]));
}

/// Tage addieren, ohne Probleme mit der Sommerzeit-Umstellung.
DateTime addDays(DateTime d, int n) => DateTime(d.year, d.month, d.day + n);

DateTime mondayOf(DateTime d) => addDays(dateOnly(d), -(d.weekday - 1));

DateTime firstOfMonth(DateTime d) => DateTime(d.year, d.month, 1);

DateTime addMonths(DateTime d, int n) => DateTime(d.year, d.month + n, 1);

int daysInMonth(int year, int month) => DateTime(year, month + 1, 0).day;

/// ISO-8601-Kalenderwoche
int isoWeek(DateTime d) {
  final date = DateTime.utc(d.year, d.month, d.day);
  final thursday = date.add(Duration(days: 4 - date.weekday));
  final firstJan = DateTime.utc(thursday.year, 1, 1);
  return thursday.difference(firstJan).inDays ~/ 7 + 1;
}

/// Kalenderraster eines Monats: beginnt am Montag, volle Wochen (5 oder 6 Zeilen).
List<DateTime> monthGrid(DateTime month) {
  final first = firstOfMonth(month);
  final start = mondayOf(first);
  final last = DateTime(first.year, first.month + 1, 0);
  final end = addDays(mondayOf(last), 6);
  final days = <DateTime>[];
  for (var d = start; !d.isAfter(end); d = addDays(d, 1)) {
    days.add(d);
  }
  return days;
}

/// „08:00“ -> Minuten seit Mitternacht, sonst null
int? parseHm(String s) {
  final m = RegExp(r'^([01]\d|2[0-3]):([0-5]\d)$').firstMatch(s);
  if (m == null) return null;
  return int.parse(m.group(1)!) * 60 + int.parse(m.group(2)!);
}

String formatHm(int minutes) => '${_p2(minutes ~/ 60)}:${_p2(minutes % 60)}';

/// Beginn und Ende eines Dienstes als DateTime. Endet er vor dem Beginn, geht er über Mitternacht.
(DateTime, DateTime)? shiftInterval(String dayKeyStr, String start, String end) {
  final s = parseHm(start), e = parseHm(end);
  if (s == null || e == null) return null;
  final d = parseDayKey(dayKeyStr);
  final from = DateTime(d.year, d.month, d.day, s ~/ 60, s % 60);
  var to = DateTime(d.year, d.month, d.day, e ~/ 60, e % 60);
  if (!to.isAfter(from)) to = DateTime(d.year, d.month, d.day + 1, e ~/ 60, e % 60);
  return (from, to);
}

String shortDate(DateTime d) => '${_p2(d.day)}.${_p2(d.month)}.';

String longDate(DateTime d) => '${weekdayLong[d.weekday - 1]}, ${_p2(d.day)}.${_p2(d.month)}.${d.year}';

String mediumDate(DateTime d) => '${weekdayShort[d.weekday - 1]} ${shortDate(d)}';

String monthTitle(DateTime d) => '${monthNames[d.month - 1]} ${d.year}';

String dateTimeStamp(DateTime d) => '${shortDate(d)}${d.year}, ${_p2(d.hour)}:${_p2(d.minute)} Uhr';

/// „Heute“, „Morgen“, „Übermorgen“ oder Wochentag mit Datum
String relativeDay(DateTime day, DateTime now) {
  final diff = dateOnly(day).difference(dateOnly(now)).inDays;
  if (diff == 0) return 'Heute';
  if (diff == 1) return 'Morgen';
  if (diff == 2) return 'Übermorgen';
  if (diff == -1) return 'Gestern';
  return mediumDate(day);
}

/// Countdown-Text, z. B. „in 2 Tagen 3 Std.“, „in 45 Min.“
String countdown(Duration d) {
  if (d.isNegative) return 'jetzt';
  final mins = (d.inSeconds / 60).ceil();
  if (mins < 60) return 'in $mins Min.';
  final h = mins ~/ 60, m = mins % 60;
  if (h < 24) return m == 0 ? 'in $h Std.' : 'in $h Std. $m Min.';
  final days = h ~/ 24, rh = h % 24;
  final dayText = days == 1 ? '1 Tag' : '$days Tagen';
  return rh == 0 ? 'in $dayText' : 'in $dayText $rh Std.';
}

/// Dauer als „7:30 Std.“
String formatDuration(int minutes) {
  final neg = minutes < 0;
  final m = minutes.abs();
  return '${neg ? '-' : ''}${m ~/ 60}:${_p2(m % 60)} Std.';
}
