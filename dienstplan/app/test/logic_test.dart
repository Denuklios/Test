import 'package:dienstplan/core/api.dart';
import 'package:dienstplan/core/dates.dart';
import 'package:dienstplan/core/hours.dart';
import 'package:dienstplan/core/models.dart';
import 'package:dienstplan/core/schedule.dart';
import 'package:flutter_test/flutter_test.dart';

DienstState makeState(Map<String, dynamic> plan, {String me = 'm1', String role = 'emp'}) => DienstState.fromJson({
      'me': {'role': role, 'id': me, 'name': 'Anna', 'mustChange': false},
      'emps': [
        {'id': 'm1', 'name': 'Anna'},
        {'id': 'm2', 'name': 'Mitarbeiter2'},
        {'id': 'm3', 'name': 'Tim K'},
      ],
      'templates': [
        {'id': 't1', 'name': 'Früh', 'start': '08:00', 'end': '16:30', 'color': '#2f80ed'},
        {'id': 't2', 'name': 'Spät', 'start': '11:30', 'end': '20:00', 'color': '#f2994a'},
        {'id': 't3', 'name': 'Frei', 'start': '', 'end': '', 'color': '#94a3b8'},
        {'id': 't4', 'name': 'Urlaub', 'start': '', 'end': '', 'color': '#27ae60'},
        {'id': 'tn', 'name': 'Nacht', 'start': '22:00', 'end': '06:00', 'color': '#333333'},
      ],
      'plan': plan,
    });

void main() {
  group('Datum', () {
    test('ISO-Kalenderwoche', () {
      expect(isoWeek(DateTime(2026, 1, 1)), 1);
      expect(isoWeek(DateTime(2027, 1, 1)), 53); // Freitag, gehört zu KW 53/2026
      expect(isoWeek(DateTime(2026, 10, 23)), 43);
      expect(isoWeek(DateTime(2024, 12, 30)), 1);
    });

    test('Montag der Woche und Tage addieren über Zeitumstellung', () {
      expect(mondayOf(DateTime(2026, 10, 25)), DateTime(2026, 10, 19)); // Sonntag
      expect(mondayOf(DateTime(2026, 10, 19)), DateTime(2026, 10, 19));
      expect(addDays(DateTime(2026, 10, 24), 1), DateTime(2026, 10, 25));
      expect(addDays(DateTime(2026, 10, 25), 1), DateTime(2026, 10, 26));
      expect(addDays(DateTime(2026, 3, 28), 2), DateTime(2026, 3, 30));
      expect(dayKey(addDays(DateTime(2026, 12, 31), 1)), '2027-01-01');
    });

    test('Monatsraster beginnt Montag und hat volle Wochen', () {
      final g = monthGrid(DateTime(2026, 2, 1));
      expect(g.first, DateTime(2026, 1, 26));
      expect(g.length % 7, 0);
      expect(g.last.weekday, DateTime.sunday);
      expect(g.length, 35);
      expect(monthGrid(DateTime(2026, 3, 1)).length, 42); // März 2026 beginnt Sonntag
    });

    test('Tagesschlüssel hin und zurück', () {
      expect(dayKey(DateTime(2026, 3, 5)), '2026-03-05');
      expect(parseDayKey('2026-03-05'), DateTime(2026, 3, 5));
      expect(daysInMonth(2028, 2), 29);
      expect(addMonths(DateTime(2026, 12, 1), 1), DateTime(2027, 1, 1));
    });

    test('Dienst über Mitternacht', () {
      final iv = shiftInterval('2026-10-23', '22:00', '06:00')!;
      expect(iv.$1, DateTime(2026, 10, 23, 22));
      expect(iv.$2, DateTime(2026, 10, 24, 6));
      expect(shiftInterval('2026-10-23', '', ''), isNull);
      expect(parseHm('24:00'), isNull);
      expect(parseHm('07:05'), 425);
    });

    test('Countdown-Text', () {
      expect(countdown(const Duration(minutes: 45)), 'in 45 Min.');
      expect(countdown(const Duration(minutes: 44, seconds: 10)), 'in 45 Min.');
      expect(countdown(const Duration(hours: 3)), 'in 3 Std.');
      expect(countdown(const Duration(hours: 3, minutes: 5)), 'in 3 Std. 5 Min.');
      expect(countdown(const Duration(days: 1, hours: 2)), 'in 1 Tag 2 Std.');
      expect(countdown(const Duration(days: 3)), 'in 3 Tagen');
      expect(relativeDay(DateTime(2026, 10, 24), DateTime(2026, 10, 23, 23, 59)), 'Morgen');
      expect(relativeDay(DateTime(2026, 10, 28), DateTime(2026, 10, 23)), 'Mi 28.10.');
    });
  });

  group('Stunden', () {
    test('Dauer und Pausenregeln', () {
      expect(shiftMinutes('08:00', '16:30'), 510);
      expect(shiftMinutes('22:00', '06:00'), 480);
      expect(shiftMinutes('', ''), 0);
      const legal = PauseRule(mode: PauseMode.legal);
      expect(legal.pauseFor(360), 0);
      expect(legal.pauseFor(361), 30);
      expect(legal.pauseFor(540), 30);
      expect(legal.pauseFor(541), 45);
      const fixed = PauseRule(mode: PauseMode.fixed, fixedMinutes: 45, fixedThreshold: 240);
      expect(fixed.pauseFor(240), 0);
      expect(fixed.pauseFor(300), 45);
      expect(const PauseRule(mode: PauseMode.none).pauseFor(600), 0);
      expect(const PauseRule(mode: PauseMode.fixed, fixedMinutes: 30, fixedThreshold: 0).pauseFor(20), 20);
    });

    test('Monatssumme mit abweichender Zeit und ganztägigen Diensten', () {
      final st = makeState({
        '2026-10-01': {'m1': {'t': 't1'}}, // 8:30 -> 8:00 netto
        '2026-10-02': {'m1': {'t': 't2', 's': '12:00', 'e': '17:00'}}, // 5:00, keine Pause
        '2026-10-03': {'m1': {'t': 't3'}},
        '2026-10-04': {'m1': {'t': 't4'}},
        '2026-10-05': {'m1': {'t': 't4'}},
        '2026-10-31': {'m1': {'t': 'tn'}}, // 8:00 über Mitternacht -> 7:30
        '2026-11-01': {'m1': {'t': 't1'}}, // anderer Monat
        '2026-10-06': {'m3': {'t': 't1'}}, // andere Person
      });
      final h = monthHours(st, 'm1', DateTime(2026, 10, 1), const PauseRule());
      expect(h.shifts, 3);
      expect(h.gross, 510 + 300 + 480);
      expect(h.pause, 30 + 0 + 30);
      expect(h.net, 1230);
      expect(h.offDays, {'Frei': 1, 'Urlaub': 2});
      expect(formatDuration(h.net), '20:30 Std.');
    });
  });

  group('Plan', () {
    test('Nächster und laufender Dienst', () {
      final st = makeState({
        '2026-10-23': {'m1': {'t': 't1'}},
        '2026-10-24': {'m1': {'t': 't3'}},
        '2026-10-26': {'m1': {'t': 't2', 'n': 'Inventur'}},
      });
      final morning = DateTime(2026, 10, 23, 7);
      expect(nextShift(st, 'm1', morning)!.dayKey, '2026-10-23');
      expect(currentShift(st, 'm1', morning), isNull);
      final noon = DateTime(2026, 10, 23, 12);
      expect(currentShift(st, 'm1', noon)!.dayKey, '2026-10-23');
      final n = nextShift(st, 'm1', noon)!;
      expect(n.dayKey, '2026-10-26'); // Frei wird übersprungen
      expect(n.shift.note, 'Inventur');
      expect(nextShift(st, 'm3', noon), isNull);
    });

    test('Nachtdienst vom Vortag läuft noch', () {
      final st = makeState({'2026-10-22': {'m1': {'t': 'tn'}}});
      expect(currentShift(st, 'm1', DateTime(2026, 10, 23, 3))!.dayKey, '2026-10-22');
    });

    test('Änderungen am eigenen Dienst erkennen', () {
      final a = makeState({
        '2026-10-26': {'m1': {'t': 't1'}, 'm3': {'t': 't1'}},
        '2026-10-27': {'m1': {'t': 't1'}},
        '2026-10-20': {'m1': {'t': 't1'}}, // Vergangenheit zählt nicht
      });
      final b = makeState({
        '2026-10-26': {'m1': {'t': 't2'}, 'm3': {'t': 't2'}},
        '2026-10-27': {'m1': {'t': 't1', 'n': 'Inventur'}},
        '2026-10-28': {'m1': {'t': 't1'}},
      });
      final today = DateTime(2026, 10, 23);
      final ch = diffOwnShifts(a, b, 'm1', today);
      expect(ch.map((c) => dayKey(c.day)), ['2026-10-26', '2026-10-27', '2026-10-28']);
      expect(diffOwnShifts(null, b, 'm1', today), isEmpty);
      expect(diffOwnShifts(b, b, 'm1', today), isEmpty);
      final one = diffOwnShifts(a, makeState({...a.toJson()['plan'] as Map<String, dynamic>, '2026-10-26': {'m1': {'t': 't2'}}}), 'm1', today);
      expect(one.length, 1);
      final (title, body) = changeMessage(one);
      expect(title, 'Dein Dienst am Montag hat sich geändert');
      expect(body, 'Montag, 26.10.: Spät 11:30–20:00');
      expect(changeMessage(ch).$1, '3 Dienste haben sich geändert');
      final removed = diffOwnShifts(a, makeState({}), 'm1', today);
      expect(removed.first.afterText, 'kein Dienst mehr eingetragen');
    });

    test('Platzhalter-Mitarbeiter werden ausgeblendet', () {
      final st = makeState({});
      expect(st.visibleEmps.map((e) => e.name), ['Anna', 'Tim K']);
      expect(const Employee(id: 'x', name: 'mitarbeiter 12').isNamed, isFalse);
      expect(const Employee(id: 'x', name: 'Mitarbeiterin Lea').isNamed, isTrue);
    });

    test('Cache speichert keine Start-Passwörter', () {
      final st = DienstState.fromJson({
        'me': {'role': 'admin', 'id': 'admin', 'name': 'Admin'},
        'emps': [
          {'id': 'm1', 'name': 'Anna', 'mustChange': true, 'initPw': 'abc123'}
        ],
        'templates': [],
        'plan': {},
      });
      expect(st.emps.first.initPw, 'abc123');
      expect(st.toJson().toString().contains('abc123'), isFalse);
    });

    test('Abweichende Zeit und unbekannte Vorlage', () {
      final st = makeState({
        '2026-10-26': {'m1': {'t': 't1', 's': '09:00', 'e': '13:00'}, 'm3': {'t': 'weg'}},
      });
      final s = st.shiftOf('m1', '2026-10-26')!;
      expect(s.name, 'Früh');
      expect(s.timeText, '09:00–13:00');
      expect(s.custom, isTrue);
      expect(st.shiftOf('m3', '2026-10-26')!.name, '?');
    });
  });

  group('Server-Adresse', () {
    test('nur HTTPS', () {
      expect(normalizeServer('dienstplan.example.de').toString(), 'https://dienstplan.example.de/');
      expect(normalizeServer(' https://example.de/dienstplan ').toString(), 'https://example.de/dienstplan/');
      expect(normalizeServer('https://example.de/dp/index.php').toString(), 'https://example.de/dp/index.php');
      expect(() => normalizeServer('http://example.de'), throwsA(isA<ApiException>()));
      expect(() => normalizeServer(''), throwsA(isA<ApiException>()));
      expect(() => normalizeServer('https://localhost'), throwsA(isA<ApiException>()));
    });
  });
}
