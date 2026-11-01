import 'package:familienkalender/models.dart';
import 'package:familienkalender/prep_engine.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  CalEvent ev(String t, DateTime s, DateTime e, {String loc = '', String kind = EventKind.normal, bool allDay = true}) =>
      CalEvent(id: 'x', title: t, start: s, end: e, ownerId: 'r', location: loc, kind: kind, allDay: allDay);
  void show(CalEvent e) {
    final c = detectCategories(e);
    final a = guessAnswers(e, c);
    final items = generatePrep(e, a);
    print('${e.title} @${e.location} -> $c\n   $a\n   ${items.length} Punkte: ${items.take(12).map((p) => '${p.text} (${p.days})').join('; ')}');
  }

  test('beispiele', () {
    show(ev('Urlaub', DateTime(2027, 7, 3), DateTime(2027, 7, 17), loc: 'Mallorca, Flug ab Hamburg', kind: EventKind.vacation));
    show(ev('Skiurlaub Ischgl', DateTime(2027, 2, 6), DateTime(2027, 2, 13)));
    show(ev('Sommerhus Blåvand', DateTime(2027, 8, 1), DateTime(2027, 8, 8)));
    show(ev('Zahnarzt', DateTime(2026, 11, 5, 9), DateTime(2026, 11, 5, 10), allDay: false));
    show(ev('Glas/Müll', DateTime(2026, 11, 2), DateTime(2026, 11, 2)));
    show(ev('Hochzeit Lisa', DateTime(2027, 5, 2), DateTime(2027, 5, 2)));
    show(ev('TÜV', DateTime(2026, 11, 9, 8), DateTime(2026, 11, 9, 9), allDay: false));
    show(ev('Ole', DateTime(1996, 11, 30), DateTime(1996, 11, 30), kind: EventKind.birthday)..birthYear = 1996);
    show(ev('Einkaufen', DateTime(2026, 11, 9), DateTime(2026, 11, 9)));
    expect(detectCategories(ev('Kaffee', DateTime(2026), DateTime(2026))).isEmpty, true);
  });
}
