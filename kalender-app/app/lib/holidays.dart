import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

class Holiday {
  final DateTime date;
  final String name;
  final String key;
  final Set<String> countries; // DE / DK
  final bool free; // gesetzlicher Feiertag (frei)
  Holiday(this.date, this.name, this.key, this.countries, this.free);

  String get label {
    if (countries.length == 2) return '$name 🇩🇰';
    if (countries.contains('DK')) return '🇩🇰 $name';
    return name;
  }
}

class SchoolHoliday {
  final DateTime start;
  final DateTime end;
  final String name;
  final String country;
  SchoolHoliday(this.start, this.end, this.name, this.country);
  bool covers(DateTime d) {
    final x = dateOnly(d);
    return !x.isBefore(start) && !x.isAfter(end);
  }

  String get label => country == 'DK' ? '🇩🇰 $name' : name;
}

const bundeslaender = <String, String>{
  'BW': 'Baden-Württemberg',
  'BY': 'Bayern',
  'BE': 'Berlin',
  'BB': 'Brandenburg',
  'HB': 'Bremen',
  'HH': 'Hamburg',
  'HE': 'Hessen',
  'MV': 'Mecklenburg-Vorpommern',
  'NI': 'Niedersachsen',
  'NW': 'Nordrhein-Westfalen',
  'RP': 'Rheinland-Pfalz',
  'SL': 'Saarland',
  'SN': 'Sachsen',
  'ST': 'Sachsen-Anhalt',
  'SH': 'Schleswig-Holstein',
  'TH': 'Thüringen',
};

DateTime easterSunday(int y) {
  final a = y % 19, b = y ~/ 100, c = y % 100, d = b ~/ 4, e = b % 4;
  final f = (b + 8) ~/ 25, g = (b - f + 1) ~/ 3;
  final h = (19 * a + b - d - g + 15) % 30;
  final i = c ~/ 4, k = c % 4;
  final l = (32 + 2 * e + 2 * i - h - k) % 7;
  final m = (a + 11 * h + 22 * l) ~/ 451;
  final month = (h + l - 7 * m + 114) ~/ 31;
  final day = ((h + l - 7 * m + 114) % 31) + 1;
  return DateTime(y, month, day);
}

DateTime _add(DateTime d, int days) => DateTime(d.year, d.month, d.day + days);

DateTime isoWeekMonday(int year, int week) {
  final jan4 = DateTime(year, 1, 4);
  final w1 = _add(jan4, -(jan4.weekday - 1));
  return _add(w1, 7 * (week - 1));
}

int isoWeekNumber(DateTime d) {
  final date = dateOnly(d);
  final thursday = _add(date, 4 - date.weekday);
  final jan1 = DateTime(thursday.year, 1, 1);
  return ((thursday.difference(jan1).inHours / 24).round() ~/ 7) + 1;
}

class HolidayService {
  final Map<int, List<Holiday>> _cache = {};
  String state;
  bool showDE, showDK, showObservances;

  HolidayService({this.state = 'SH', this.showDE = true, this.showDK = true, this.showObservances = true});

  void configure({required String state, required bool de, required bool dk, required bool obs}) {
    if (state != this.state || de != showDE || dk != showDK || obs != showObservances) {
      _cache.clear();
    }
    this.state = state;
    showDE = de;
    showDK = dk;
    showObservances = obs;
  }

  List<Holiday> forYear(int y) => _cache.putIfAbsent(y, () => _build(y));

  List<Holiday> forDay(DateTime d) {
    final x = dateOnly(d);
    return forYear(x.year).where((h) => h.date == x).toList();
  }

  bool isFreeDay(DateTime d) => forDay(d).any((h) => h.free);

  List<Holiday> _build(int y) {
    final e = easterSunday(y);
    final res = <Holiday>[];
    final s = state;
    void de(DateTime d, String name, String key, {List<String>? states, bool always = false}) {
      if (!showDE) return;
      final free = always || (states != null && states.contains(s));
      if (!free && !showObservances) return;
      res.add(Holiday(d, name, key, {'DE'}, free));
    }

    // Deutschland
    de(DateTime(y, 1, 1), 'Neujahr', 'ny', always: true);
    de(DateTime(y, 1, 6), 'Heilige Drei Könige', 'epi', states: ['BW', 'BY', 'ST']);
    de(DateTime(y, 3, 8), 'Frauentag', 'women', states: ['BE', 'MV']);
    de(_add(e, -2), 'Karfreitag', 'gf', always: true);
    de(e, 'Ostersonntag', 'es', states: ['BB']);
    de(_add(e, 1), 'Ostermontag', 'em', always: true);
    de(DateTime(y, 5, 1), 'Tag der Arbeit', 'may1', always: true);
    de(_add(e, 39), 'Christi Himmelfahrt', 'asc', always: true);
    de(_add(e, 49), 'Pfingstsonntag', 'ws', states: ['BB']);
    de(_add(e, 50), 'Pfingstmontag', 'wm', always: true);
    de(_add(e, 60), 'Fronleichnam', 'cc', states: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
    de(DateTime(y, 8, 15), 'Mariä Himmelfahrt', 'assum', states: ['SL']);
    de(DateTime(y, 9, 20), 'Weltkindertag', 'kids', states: ['TH']);
    de(DateTime(y, 10, 3), 'Tag der Deutschen Einheit', 'unity', always: true);
    de(DateTime(y, 10, 31), 'Reformationstag', 'ref', states: ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']);
    de(DateTime(y, 11, 1), 'Allerheiligen', 'allsaints', states: ['BW', 'BY', 'NW', 'RP', 'SL']);
    final dec24 = DateTime(y, 12, 24);
    final advent4 = _add(dec24, -(dec24.weekday % 7));
    final advent1 = _add(advent4, -21);
    final totensonntag = _add(advent1, -7);
    de(_add(totensonntag, -4), 'Buß- und Bettag', 'bb', states: ['SN']);
    de(DateTime(y, 12, 25), '1. Weihnachtstag', 'x1', always: true);
    de(DateTime(y, 12, 26), '2. Weihnachtstag', 'x2', always: true);

    if (showDE && showObservances) {
      void obs(DateTime d, String n) => res.add(Holiday(d, n, 'o_$n', {'DE'}, false));
      obs(DateTime(y, 2, 14), 'Valentinstag');
      obs(_add(e, -52), 'Weiberfastnacht');
      obs(_add(e, -48), 'Rosenmontag');
      obs(_add(e, -46), 'Aschermittwoch');
      final mar31 = DateTime(y, 3, 31);
      obs(_add(mar31, -(mar31.weekday % 7)), 'Sommerzeit (+1 Std.)');
      final may1 = DateTime(y, 5, 1);
      final firstSundayMay = _add(may1, (7 - may1.weekday) % 7);
      obs(_add(firstSundayMay, 7), 'Muttertag');
      final oct31 = DateTime(y, 10, 31);
      obs(_add(oct31, -(oct31.weekday % 7)), 'Winterzeit (−1 Std.)');
      obs(_add(totensonntag, -7), 'Volkstrauertag');
      obs(totensonntag, 'Totensonntag');
      obs(advent1, '1. Advent');
      obs(_add(advent1, 7), '2. Advent');
      obs(_add(advent1, 14), '3. Advent');
      obs(advent4, '4. Advent');
      obs(DateTime(y, 12, 6), 'Nikolaus');
      obs(DateTime(y, 12, 24), 'Heiligabend');
      obs(DateTime(y, 12, 31), 'Silvester');
    }

    // Dänemark
    if (showDK) {
      void dk(DateTime d, String name, String key, {bool free = true}) {
        if (!free && !showObservances) return;
        final idx = res.indexWhere((h) => h.key == key && h.date == d);
        if (idx >= 0) {
          final old = res[idx];
          res[idx] = Holiday(old.date, old.name, key, {...old.countries, 'DK'}, old.free || free);
        } else {
          res.add(Holiday(d, name, key, {'DK'}, free));
        }
      }

      dk(DateTime(y, 1, 1), 'Nytårsdag', 'ny');
      dk(_add(e, -49), 'Fastelavn', 'dk_fast', free: false);
      dk(_add(e, -3), 'Skærtorsdag', 'dk_mt');
      dk(_add(e, -2), 'Langfredag', 'gf');
      dk(e, 'Påskedag', 'es');
      dk(_add(e, 1), '2. påskedag', 'em');
      if (y <= 2023) dk(_add(e, 26), 'Store bededag', 'dk_sb');
      dk(_add(e, 39), 'Kristi himmelfartsdag', 'asc');
      dk(_add(e, 49), 'Pinsedag', 'ws');
      dk(_add(e, 50), '2. pinsedag', 'wm');
      dk(DateTime(y, 6, 5), 'Grundlovsdag', 'dk_gl', free: false);
      dk(DateTime(y, 6, 23), 'Sankthansaften', 'dk_sh', free: false);
      dk(DateTime(y, 11, 10), 'Mortensaften', 'dk_ma', free: false);
      dk(DateTime(y, 12, 24), 'Juleaften', 'o_Heiligabend', free: false);
      dk(DateTime(y, 12, 25), 'Juledag', 'x1');
      dk(DateTime(y, 12, 26), '2. juledag', 'x2');
      dk(DateTime(y, 12, 31), 'Nytårsaften', 'o_Silvester', free: false);
    }
    res.sort((a, b) {
      final c = a.date.compareTo(b.date);
      if (c != 0) return c;
      return (b.free ? 1 : 0) - (a.free ? 1 : 0);
    });
    return res;
  }
}

/// Schulferien: Deutschland über openholidaysapi.org (zwischengespeichert),
/// Dänemark nach den üblichen Ferienwochen berechnet (ca.-Angaben).
class SchoolHolidayService {
  final Map<int, List<SchoolHoliday>> _de = {};
  final Set<int> _loading = {};
  String state = 'SH';
  bool showDE = true;
  bool showDK = true;
  void Function()? onLoaded;

  void configure({required String state, required bool de, required bool dk}) {
    if (state != this.state) _de.clear();
    this.state = state;
    showDE = de;
    showDK = dk;
  }

  List<SchoolHoliday> forDay(DateTime d) {
    final y = d.year;
    final res = <SchoolHoliday>[];
    for (final yy in [y - 1, y]) {
      if (showDE) res.addAll(_deFor(yy).where((h) => h.covers(d)));
      if (showDK) res.addAll(dkFor(yy).where((h) => h.covers(d)));
    }
    return res;
  }

  List<SchoolHoliday> _deFor(int y) {
    final c = _de[y];
    if (c != null) return c;
    _load(y);
    return const [];
  }

  Future<void> _load(int y) async {
    if (_loading.contains(y)) return;
    _loading.add(y);
    final key = 'school_${state}_$y';
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(key);
    final cachedAt = prefs.getInt('${key}_at') ?? 0;
    List<SchoolHoliday>? list;
    if (cached != null) list = _parse(cached);
    final old = DateTime.now().millisecondsSinceEpoch - cachedAt > 1000 * 60 * 60 * 24 * 14;
    if (list == null || old || list.isEmpty) {
      try {
        final uri = Uri.parse('https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&subdivisionCode=DE-$state'
            '&languageIsoCode=DE&validFrom=$y-01-01&validTo=$y-12-31');
        final r = await http.get(uri, headers: {'accept': 'application/json'}).timeout(const Duration(seconds: 15));
        if (r.statusCode == 200) {
          final fresh = _parse(r.body);
          if (fresh != null) {
            list = fresh;
            await prefs.setString(key, r.body);
            await prefs.setInt('${key}_at', DateTime.now().millisecondsSinceEpoch);
          }
        }
      } catch (_) {}
    }
    _loading.remove(y);
    if (list != null) {
      _de[y] = list;
      onLoaded?.call();
    }
  }

  List<SchoolHoliday>? _parse(String body) {
    try {
      final l = jsonDecode(body) as List;
      return l.map((e) {
        final names = (e['name'] as List?) ?? [];
        final name = names.isNotEmpty ? names.first['text'] as String : 'Ferien';
        return SchoolHoliday(DateTime.parse(e['startDate'] as String), DateTime.parse(e['endDate'] as String), name, 'DE');
      }).toList();
    } catch (_) {
      return null;
    }
  }

  final Map<int, List<SchoolHoliday>> _dk = {};
  List<SchoolHoliday> dkFor(int y) => _dk.putIfAbsent(y, () {
        final e = easterSunday(y);
        DateTime sat(int week) => _add(isoWeekMonday(y, week), 5);
        DateTime sun(int week) => _add(isoWeekMonday(y, week), 6);
        return [
          SchoolHoliday(sat(6), sun(7), 'Vinterferie (ca.)', 'DK'),
          SchoolHoliday(_add(e, -8), _add(e, 1), 'Påskeferie', 'DK'),
          SchoolHoliday(sat(26), sun(32), 'Sommerferie (ca.)', 'DK'),
          SchoolHoliday(sat(41), sun(42), 'Efterårsferie', 'DK'),
          SchoolHoliday(DateTime(y, 12, 20), DateTime(y + 1, 1, 2), 'Juleferie (ca.)', 'DK'),
        ];
      });
}
