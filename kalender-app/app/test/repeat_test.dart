import 'package:familienkalender/models.dart';
import 'package:familienkalender/store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('alle 4 Wochen + ausgelassene Tage', () {
    final ev = CalEvent(id: 'g', title: 'Glas', start: DateTime(2024, 12, 2), end: DateTime(2024, 12, 2), allDay: true, ownerId: '',
        repeat: 'weekly', interval: 4, exdates: ['2026-11-30']);
    final o = AppStore.expand(ev, DateTime(2026, 10, 1), DateTime(2026, 12, 31)).map((o) => dayKey(o.start)).toList();
    print(o);
    expect(o, ['2026-10-05', '2026-11-02', '2026-12-28']); // 30.11. ausgelassen, alle 4 Wochen montags
    final bi = CalEvent(id: 'r', title: 'Rest', start: DateTime(2024, 8, 22), end: DateTime(2024, 8, 22), allDay: true, ownerId: '', repeat: 'biweekly');
    expect(AppStore.expand(bi, DateTime(2026, 11, 1), DateTime(2026, 11, 30)).length, 2);
  });
}
