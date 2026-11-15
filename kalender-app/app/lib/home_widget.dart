import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart';

import 'models.dart';
import 'store.dart';

/// Gibt die Kalenderdaten an das Startbildschirm-Widget weiter.
class HomeWidgetBridge {
  static const _channel = MethodChannel('kalender/prep');
  static bool _queued = false;

  /// Mehrere Änderungen kurz hintereinander werden zu einem Schreibvorgang zusammengefasst.
  static void schedule(AppStore s) {
    if (_queued) return;
    _queued = true;
    scheduleMicrotask(() {
      _queued = false;
      push(s);
    });
  }

  static Map<String, dynamic> build(AppStore s) {
    const keep = ['id', 'title', 'start', 'end', 'allDay', 'ownerId', 'participants', 'kind', 'repeat', 'repeatUntil', 'birthYear', 'interval', 'exdates'];
    final events = <Map<String, dynamic>>[];
    for (final ev in s.events.values) {
      if (ev.deleted) continue;
      final j = ev.toJson();
      events.add({
        for (final k in keep) k: j[k],
        '_c': s.colorsFor(ev).map((c) => c.toARGB32()).toList(),
      });
    }
    final now = DateTime.now();
    final hol = <Map<String, dynamic>>[];
    for (var i = -45; i <= 150; i++) {
      final d = DateTime(now.year, now.month, now.day + i);
      for (final h in s.holidays.forDay(d)) {
        hol.add({'d': dayKey(d), 'l': h.label, 'f': h.free});
      }
    }
    return {
      'me': s.myId,
      'bday': s.birthdayColor,
      'members': s.members.values.where((m) => !m.deleted).map((m) => {'id': m.id, 'name': m.name, 'color': m.color}).toList(),
      'events': events,
      'hol': hol,
    };
  }

  static Future<void> push(AppStore s) async {
    try {
      await _channel.invokeMethod('widgetData', {'json': jsonEncode(build(s))});
    } catch (_) {
      // in Tests / ohne Android gibt es kein Widget
    }
  }
}
