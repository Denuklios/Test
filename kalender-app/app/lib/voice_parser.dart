import 'models.dart';

class VoiceResult {
  String title = '';
  DateTime? date;
  DateTime? endDate;
  int? startMinutes; // Minuten seit Mitternacht
  int? endMinutes;
  String kind = EventKind.normal;
  List<String> participants = [];
  String location = '';
  int? reminder;
  int? birthYear;

  bool get allDay => startMinutes == null;
}

const _months = {
  'januar': 1, 'jänner': 1, 'februar': 2, 'märz': 3, 'maerz': 3, 'april': 4, 'mai': 5, 'juni': 6, 'juli': 7,
  'august': 8, 'september': 9, 'oktober': 10, 'november': 11, 'dezember': 12,
};
const _weekdays = {'montag': 1, 'dienstag': 2, 'mittwoch': 3, 'donnerstag': 4, 'freitag': 5, 'samstag': 6, 'sonntag': 7};
const _numbers = {
  'einem': 1, 'einer': 1, 'einen': 1, 'ein': 1, 'eine': 1, 'zwei': 2, 'drei': 3, 'vier': 4, 'fünf': 5, 'sechs': 6,
  'sieben': 7, 'acht': 8, 'neun': 9, 'zehn': 10, 'elf': 11, 'zwölf': 12, 'zwanzig': 20, 'dreißig': 30,
};
const _ordinals = {
  'ersten': 1, 'zweiten': 2, 'dritten': 3, 'vierten': 4, 'fünften': 5, 'sechsten': 6, 'siebten': 7, 'achten': 8,
  'neunten': 9, 'zehnten': 10, 'elften': 11, 'zwölften': 12, 'dreizehnten': 13, 'vierzehnten': 14, 'fünfzehnten': 15,
  'sechzehnten': 16, 'siebzehnten': 17, 'achtzehnten': 18, 'neunzehnten': 19, 'zwanzigsten': 20,
  'einundzwanzigsten': 21, 'zweiundzwanzigsten': 22, 'dreiundzwanzigsten': 23, 'vierundzwanzigsten': 24,
  'fünfundzwanzigsten': 25, 'sechsundzwanzigsten': 26, 'siebenundzwanzigsten': 27, 'achtundzwanzigsten': 28,
  'neunundzwanzigsten': 29, 'dreißigsten': 30, 'einunddreißigsten': 31,
};

int? _num(String s) => int.tryParse(s) ?? _numbers[s.toLowerCase()];

/// Versteht Sätze wie
/// "Morgen um 15 Uhr Zahnarzt mit Jeannine in Flensburg",
/// "Ole hat am 30. November Geburtstag", "Urlaub vom 3. bis 14. August",
/// "Nächsten Freitag von 10 bis 12 Uhr Elternabend, erinnere mich einen Tag vorher".
VoiceResult parseVoice(String input, List<Member> members, {DateTime? now}) {
  final r = VoiceResult();
  final today = dateOnly(now ?? DateTime.now());
  var t = ' ${input.trim()} ';
  final monthAlt = _months.keys.join('|');
  final dayAlt = '\\d{1,2}\\.?|${_ordinals.keys.join('|')}';

  String cut(RegExp re) {
    t = t.replaceFirst(re, ' ');
    return t;
  }

  DateTime fixYear(int d, int m, int? y) {
    var dt = DateTime(y ?? today.year, m, d);
    if (y == null && dt.isBefore(today)) dt = DateTime(today.year + 1, m, d);
    return dt;
  }

  int? dayNum(String s) => int.tryParse(s.replaceAll('.', '')) ?? _ordinals[s.toLowerCase()];

  // Art
  if (_re(r'geburtstag', caseSensitive: false).hasMatch(t)) {
    r.kind = EventKind.birthday;
    cut(_re(r'\b(hat|haben)\b', caseSensitive: false));
    cut(_re(r'\bgeburtstag( von| vom)?\b', caseSensitive: false));
    final y = _re(r'\b(geboren|jahrgang)\s*(\d{4})\b', caseSensitive: false).firstMatch(t);
    if (y != null) {
      r.birthYear = int.parse(y.group(2)!);
      cut(_re(r'\b(geboren|jahrgang)\s*\d{4}\b', caseSensitive: false));
    }
  } else if (_re(r'\burlaub\b', caseSensitive: false).hasMatch(t)) {
    r.kind = EventKind.vacation;
    cut(_re(r'\b(ich habe |hat |habe )?urlaub\b', caseSensitive: false));
  }

  // Erinnerung
  final rem = _re(r'[,]?\s*erinner(e|n)? mich\s+(\w+)\s+(minute|minuten|stunde|stunden|tag|tage|tagen|woche)\s+(vorher|davor)',
          caseSensitive: false)
      .firstMatch(t);
  if (rem != null) {
    final n = _num(rem.group(2)!) ?? 1;
    final unit = rem.group(3)!.toLowerCase();
    r.reminder = unit.startsWith('minute') ? n : unit.startsWith('stunde') ? n * 60 : unit.startsWith('tag') ? n * 1440 : n * 10080;
    t = t.replaceFirst(rem.group(0)!, ' ');
  } else if (_re(r'erinner(e|n)? mich', caseSensitive: false).hasMatch(t)) {
    r.reminder = 60;
    cut(_re(r'[,]?\s*erinner(e|n)? mich( daran)?', caseSensitive: false));
  }

  // Datum: Zeitraum "vom 3. bis 14. August"
  final range = _re('\\b(vom |von |ab )?($dayAlt)\\s*($monthAlt)?\\s*bis (zum )?($dayAlt)\\s*($monthAlt)(\\s+\\d{4})?',
          caseSensitive: false)
      .firstMatch(t);
  final numRange = _re(r'\b(vom |von )?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\s*bis (zum )?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?', caseSensitive: false)
      .firstMatch(t);
  if (range != null) {
    final m2 = _months[range.group(6)!.toLowerCase()]!;
    final m1 = range.group(3) != null ? _months[range.group(3)!.toLowerCase()]! : m2;
    final y = range.group(7) != null ? int.parse(range.group(7)!.trim()) : null;
    r.date = fixYear(dayNum(range.group(2)!) ?? 1, m1, y);
    r.endDate = DateTime(r.date!.year + (m2 < m1 ? 1 : 0), m2, dayNum(range.group(5)!) ?? 1);
    t = t.replaceFirst(range.group(0)!, ' ');
  } else if (numRange != null) {
    int? yy(String? s) => s == null ? null : (s.length == 2 ? 2000 + int.parse(s) : int.parse(s));
    r.date = fixYear(int.parse(numRange.group(2)!), int.parse(numRange.group(3)!), yy(numRange.group(4)));
    r.endDate = DateTime(yy(numRange.group(8)) ?? r.date!.year, int.parse(numRange.group(7)!), int.parse(numRange.group(6)!));
    if (r.endDate!.isBefore(r.date!)) r.endDate = DateTime(r.endDate!.year + 1, r.endDate!.month, r.endDate!.day);
    t = t.replaceFirst(numRange.group(0)!, ' ');
  }

  if (r.date == null) {
    final words = _re(r'\b(übermorgen|morgen|heute)\b', caseSensitive: false).firstMatch(t);
    final inDays = _re(r'\bin (\w+) (tag|tagen|woche|wochen)\b', caseSensitive: false).firstMatch(t);
    final wd = _re('\\b(am |nächsten |nächste |kommenden |diesen )?(${_weekdays.keys.join('|')})\\b', caseSensitive: false).firstMatch(t);
    final named = _re('\\b(am |zum |den )?($dayAlt)\\s*($monthAlt)(\\s+\\d{4})?', caseSensitive: false).firstMatch(t);
    final numeric = _re(r'\b(am |zum |den )?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?', caseSensitive: false).firstMatch(t);
    if (named != null) {
      final y = named.group(4) != null ? int.parse(named.group(4)!.trim()) : null;
      r.date = fixYear(dayNum(named.group(2)!) ?? 1, _months[named.group(3)!.toLowerCase()]!, y);
      t = t.replaceFirst(named.group(0)!, ' ');
    } else if (numeric != null) {
      final ys = numeric.group(4);
      final y = ys == null ? null : (ys.length == 2 ? 2000 + int.parse(ys) : int.parse(ys));
      r.date = fixYear(int.parse(numeric.group(2)!), int.parse(numeric.group(3)!), y);
      t = t.replaceFirst(numeric.group(0)!, ' ');
    } else if (words != null) {
      final w = words.group(1)!.toLowerCase();
      // "morgen früh" -> morgen
      r.date = today.add(Duration(days: w == 'übermorgen' ? 2 : (w == 'morgen' ? 1 : 0)));
      t = t.replaceFirst(words.group(0)!, ' ');
    } else if (inDays != null && _num(inDays.group(1)!) != null) {
      final n = _num(inDays.group(1)!)!;
      r.date = DateTime(today.year, today.month, today.day + (inDays.group(2)!.toLowerCase().startsWith('woche') ? 7 * n : n));
      t = t.replaceFirst(inDays.group(0)!, ' ');
    } else if (wd != null) {
      final target = _weekdays[wd.group(2)!.toLowerCase()]!;
      var diff = (target - today.weekday) % 7;
      final next = (wd.group(1) ?? '').toLowerCase().startsWith('nächst');
      if (diff == 0 && next) diff = 7;
      r.date = DateTime(today.year, today.month, today.day + diff);
      t = t.replaceFirst(wd.group(0)!, ' ');
    }
    if (_re(r'\bnächste woche\b', caseSensitive: false).hasMatch(t) && r.date == null) {
      r.date = DateTime(today.year, today.month, today.day + 8 - today.weekday);
      cut(_re(r'\bnächste woche\b', caseSensitive: false));
    }
    // "bis Freitag" / "bis 20. Dezember" für mehrtägige Einträge
    final until = _re('\\bbis (zum )?($dayAlt)\\s*($monthAlt)\\b', caseSensitive: false).firstMatch(t);
    if (until != null && r.date != null) {
      r.endDate = fixYear(dayNum(until.group(2)!) ?? 1, _months[until.group(3)!.toLowerCase()]!, null);
      t = t.replaceFirst(until.group(0)!, ' ');
    }
  }

  // Uhrzeit
  int? hm(String h, String? m) => int.parse(h) * 60 + (m == null ? 0 : int.parse(m));
  final fromTo = _re(r'\b(von )?(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?\s*bis\s*(\d{1,2})(?:[:.](\d{2}))?\s*uhr', caseSensitive: false)
      .firstMatch(t);
  if (fromTo != null) {
    r.startMinutes = hm(fromTo.group(2)!, fromTo.group(3));
    r.endMinutes = hm(fromTo.group(4)!, fromTo.group(5));
    t = t.replaceFirst(fromTo.group(0)!, ' ');
  } else {
    final half = _re(r'\b(um )?halb (\d{1,2}|\w+)\b', caseSensitive: false).firstMatch(t);
    final at = _re(r'\b(um |ab |gegen )?(\d{1,2})(?:[:.](\d{2}))?\s*uhr(?:\s+(\d{1,2})\b)?', caseSensitive: false).firstMatch(t);
    final umOnly = _re(r'\bum (\d{1,2})(?:[:.](\d{2}))?\b', caseSensitive: false).firstMatch(t);
    if (at != null) {
      r.startMinutes = hm(at.group(2)!, at.group(3) ?? at.group(4));
      t = t.replaceFirst(at.group(0)!, ' ');
    } else if (half != null && _num(half.group(2)!) != null) {
      r.startMinutes = (_num(half.group(2)!)! - 1) * 60 + 30;
      t = t.replaceFirst(half.group(0)!, ' ');
    } else if (umOnly != null) {
      r.startMinutes = hm(umOnly.group(1)!, umOnly.group(2));
      t = t.replaceFirst(umOnly.group(0)!, ' ');
    }
  }
  final pm = _re(r'\b(nachmittags|abends|am nachmittag|am abend|heute abend|abend|nachmittag)\b', caseSensitive: false);
  if (pm.hasMatch(t)) {
    if (r.startMinutes != null && r.startMinutes! < 12 * 60) r.startMinutes = r.startMinutes! + 12 * 60;
    if (r.endMinutes != null && r.endMinutes! < 12 * 60) r.endMinutes = r.endMinutes! + 12 * 60;
    cut(pm);
  }
  final am = _re(r'\b(morgens|vormittags|früh|am morgen|am vormittag|nachts)\b', caseSensitive: false);
  final isAm = am.hasMatch(t);
  cut(am);
  // "halb drei", "um 4" ohne Zusatz ist meist nachmittags gemeint
  if (!isAm && r.startMinutes != null && r.startMinutes! >= 60 && r.startMinutes! < 7 * 60) {
    r.startMinutes = r.startMinutes! + 12 * 60;
    if (r.endMinutes != null && r.endMinutes! < 12 * 60) r.endMinutes = r.endMinutes! + 12 * 60;
  }
  if (r.startMinutes != null && r.endMinutes == null) {
    final bis = _re(r'\bbis (\d{1,2})(?:[:.](\d{2}))?\s*(uhr)?', caseSensitive: false).firstMatch(t);
    if (bis != null) {
      r.endMinutes = hm(bis.group(1)!, bis.group(2));
      t = t.replaceFirst(bis.group(0)!, ' ');
    }
  }

  // Personen
  for (final m in members) {
    if (m.name.trim().isEmpty) continue;
    final re = _re('\\b(mit |und |für |von )?${RegExp.escape(m.name.trim())}\\b', caseSensitive: false);
    final hit = re.firstMatch(t);
    if (hit != null && r.kind != EventKind.birthday) {
      r.participants.add(m.id);
      t = t.replaceFirst(hit.group(0)!, ' ');
    }
  }

  // Ort: "in Flensburg", "nach Berlin"
  final loc = _re(r'\b(in|nach|im|bei)\s+([A-ZÄÖÜ][\wäöüß\-]+(?:\s+[A-ZÄÖÜ][\wäöüß\-]+)?)').firstMatch(t);
  if (loc != null) {
    final word = loc.group(2)!;
    if (!_weekdays.containsKey(word.toLowerCase()) && !_months.containsKey(word.toLowerCase())) {
      r.location = word;
      t = t.replaceFirst(loc.group(0)!, ' ');
    }
  }

  // Füllwörter entfernen
  t = t.replaceAll(_re(r'\b(trag(e)? (bitte )?ein|eintragen|bitte|neuer termin|termin(:)?|am|um|ich habe|wir haben|einen|eine|ist|zum|vom)\b',
      caseSensitive: false), ' ');
  t = t.replaceAll(_re(r'[,.]+(\s|$)'), ' ').replaceAll(_re(r'\s+'), ' ').trim();
  if (t.isEmpty) {
    t = r.kind == EventKind.vacation ? 'Urlaub' : 'Termin';
  }
  r.title = t[0].toUpperCase() + t.substring(1);
  return r;
}

const _w = r'[A-Za-z0-9_äöüÄÖÜß]';
const _boundary = '(?:(?<!$_w)(?=$_w)|(?<=$_w)(?!$_w))';
RegExp _re(String p, {bool caseSensitive = true}) => RegExp(p.replaceAll(r'\b', _boundary), caseSensitive: caseSensitive);
