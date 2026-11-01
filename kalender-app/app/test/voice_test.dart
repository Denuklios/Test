import 'package:familienkalender/models.dart';
import 'package:familienkalender/voice_parser.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final members = [Member(id: 'j', name: 'Jeannine', color: 1), Member(id: 'r', name: 'Robert', color: 2)];
  final now = DateTime(2026, 11, 1);
  String fmt(VoiceResult r) =>
      '${r.title} | ${r.date} - ${r.endDate} | ${r.startMinutes}-${r.endMinutes} | ${r.kind} | ${r.participants} | ${r.location} | rem ${r.reminder}';
  test('beispiele', () {
    for (final s in [
      'Morgen um 15 Uhr Zahnarzt mit Jeannine in Flensburg',
      'Ole hat am 30. November Geburtstag',
      'Urlaub vom 3. bis 14. August',
      'Nächsten Freitag von 10 bis 12 Uhr Elternabend, erinnere mich einen Tag vorher',
      'übermorgen halb drei Friseur',
      'am 24.12. Weihnachten bei Oma',
      'Geburtstag Sophie 5. März geboren 2001',
      'In drei Tagen Müll rausbringen',
      'heute abend um 7 Kino mit Robert und Jeannine',
    ]) {
      print('$s\n   => ${fmt(parseVoice(s, members, now: now))}');
    }
    final r = parseVoice('Morgen um 15 Uhr Zahnarzt mit Jeannine in Flensburg', members, now: now);
    expect(r.title, 'Zahnarzt');
    expect(r.date, DateTime(2026, 11, 2));
    expect(r.startMinutes, 900);
    expect(r.participants, ['j']);
    expect(r.location, 'Flensburg');
  });
}
