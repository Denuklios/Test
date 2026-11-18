import 'dart:async';
import 'dart:convert';

import 'package:battery_plus/battery_plus.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

import 'api.dart';
import 'events.dart';
import 'models.dart';
import 'notify.dart';

/// Standort erfassen und hochladen – im Vordergrund-Dienst (mit Hinweis in der Statusleiste)
/// und zusätzlich alle 15 Minuten per WorkManager, falls Android den Dienst beendet.
class Tracker {
  static final Tracker i = Tracker._();
  Tracker._();

  StreamSubscription<Position>? _sub;
  Position? lastPos;
  bool _flushing = false;
  final _battery = Battery();
  final ValueNotifier<Position?> position = ValueNotifier(null);

  bool get running => _sub != null;

  static Future<bool> hasPermission({bool background = false}) async {
    final p = await Geolocator.checkPermission();
    if (background) return p == LocationPermission.always;
    return p == LocationPermission.always || p == LocationPermission.whileInUse;
  }

  Future<void> start() async {
    if (_sub != null) return;
    if (!await hasPermission()) return;
    // Hochladen übernimmt der eigene Android-Standortdienst (läuft auch ohne App weiter).
    await startNativeService();
    // Hier nur für die Anzeige der eigenen Position, solange die App offen ist.
    final settings = AndroidSettings(accuracy: LocationAccuracy.high, distanceFilter: 3, intervalDuration: const Duration(seconds: 2));
    _sub = Geolocator.getPositionStream(locationSettings: settings).listen(_onPos, onError: (_) {
      _sub?.cancel();
      _sub = null;
    });
    await registerBackground();
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
    await stopNativeService();
  }

  void _onPos(Position p) {
    lastPos = p;
    position.value = p;
  }

  static const _native = MethodChannel('hjemme/native');

  static Future<void> startNativeService() async {
    try {
      await _native.invokeMethod('startService');
    } catch (_) {}
  }

  static Future<void> stopNativeService() async {
    try {
      await _native.invokeMethod('stopService');
    } catch (_) {}
  }

  /// Gerätezustand: Standort „Immer“, Akku-Optimierung, Energiesparmodus
  static Future<Map<String, bool>> deviceDiag() async {
    try {
      final r = await _native.invokeMapMethod<String, dynamic>('diag');
      return {for (final e in (r ?? {}).entries) e.key: e.value == true};
    } catch (_) {
      return {};
    }
  }

  static Map<String, dynamic> _pt(Position p) => {
        'lat': p.latitude,
        'lng': p.longitude,
        'acc': p.accuracy,
        'spd': p.speed < 0 ? null : p.speed,
        'hdg': p.heading < 0 ? null : p.heading,
        'ts': p.timestamp.millisecondsSinceEpoch,
      };

  static Future<void> _queueStatic(Position p) async {
    final prefs = await SharedPreferences.getInstance();
    final q = prefs.getStringList('locQueue') ?? [];
    q.add(jsonEncode(_pt(p)));
    await prefs.setStringList('locQueue', q.length > 2000 ? q.sublist(q.length - 2000) : q);
  }

  /// Aktuellen Standort sofort holen und senden (z. B. „Wo bist du?“ oder Herzschlag)
  Future<void> sendNow({bool precise = false}) async {
    try {
      final p = await Geolocator.getCurrentPosition(
          locationSettings: AndroidSettings(accuracy: precise ? LocationAccuracy.best : LocationAccuracy.high, timeLimit: const Duration(seconds: 25)));
      lastPos = p;
      position.value = p;
      await _queueStatic(p);
    } catch (_) {
      final p = lastPos ?? await Geolocator.getLastKnownPosition();
      if (p != null) await _queueStatic(p);
    }
    await flush();
  }

  Future<void> flush() async {
    if (_flushing) return;
    _flushing = true;
    try {
      await flushQueue(_battery);
    } catch (_) {
      // offline – bleibt in der Warteschlange
    } finally {
      _flushing = false;
    }
  }

  static Future<void> flushQueue(Battery battery) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    final q = prefs.getStringList('locQueue') ?? [];
    if (q.isEmpty) return;
    final api = await Api.load();
    if (!api.loggedIn) return;
    final (bat, chg) = await readBattery(battery);
    final batch = q.take(400).toList();
    await api.post('loc', {'points': batch.map(jsonDecode).toList(), 'bat': bat, 'chg': chg});
    final rest = (prefs.getStringList('locQueue') ?? []).skip(batch.length).toList();
    await prefs.setStringList('locQueue', rest);
  }

  static Future<void> registerBackground() async {
    try {
      await Workmanager().initialize(callbackDispatcher);
      await Workmanager().registerPeriodicTask('hjemme-sync', 'sync',
          frequency: const Duration(minutes: 15),
          existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
          constraints: Constraints(networkType: NetworkType.connected));
    } catch (_) {}
  }
}

/// Befehle an dieses Gerät ausführen
Future<void> runCommands(List<Ev> cmds) async {
  for (final c in cmds) {
    if (c.type == 'locate') {
      try {
        await const MethodChannel('hjemme/native').invokeMethod('locateNow');
      } catch (_) {}
      await Tracker.i.sendNow(precise: true);
    } else if (c.type == 'ring_stop') {
      await Notify.cancel(900001);
    }
  }
}

/// Hintergrund-Abgleich: Standort senden, Neuigkeiten abholen, benachrichtigen
Future<void> backgroundSync() async {
  final api = await Api.load();
  if (!api.loggedIn) return;
  try {
    if (await Tracker.hasPermission()) {
      final p = await Geolocator.getCurrentPosition(
          locationSettings: AndroidSettings(accuracy: LocationAccuracy.high, timeLimit: const Duration(seconds: 30)));
      await Tracker._queueStatic(p);
    }
  } catch (_) {}
  try {
    await Tracker.flushQueue(Battery());
  } catch (_) {}
  final prefs = await SharedPreferences.getInstance();
  final since = prefs.getInt('cursor') ?? 0;
  if (since == 0) return;
  final j = await api.get('poll', {'since': '$since'});
  final circles = [for (final c in j['circles'] as List) Circle.fromJson(Map<String, dynamic>.from(c))];
  final events = [for (final e in j['events'] as List) Ev.fromJson(Map<String, dynamic>.from(e))];
  final cmds = await notifyNew(events, circles, api.memberId!);
  for (final c in cmds) {
    if (c.type == 'locate') {
      try {
        final p = await Geolocator.getCurrentPosition(locationSettings: AndroidSettings(accuracy: LocationAccuracy.best, timeLimit: const Duration(seconds: 25)));
        await Tracker._queueStatic(p);
        await Tracker.flushQueue(Battery());
      } catch (_) {}
    }
  }
  // Chat & Ereignisse für die App merken, Zähler weiterschieben
  await prefs.setInt('cursor', (j['cursor'] as num).toInt());
  final stored = prefs.getString('events');
  final list = stored == null ? <dynamic>[] : (jsonDecode(stored) as List);
  list.addAll(events.map((e) => e.toJson()));
  await prefs.setString('events', jsonEncode(list.length > 600 ? list.sublist(list.length - 600) : list));
}

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, input) async {
    WidgetsFlutterBinding.ensureInitialized();
    try {
      await Notify.init();
      await backgroundSync();
    } catch (_) {}
    return true;
  });
}

/// Akkustand lesen: zuerst direkt über Android, sonst über battery_plus.
/// 0 % oder unsinnige Werte gelten als „unbekannt“ (null), damit keine falschen Warnungen entstehen.
Future<(int?, bool)> readBattery(Battery battery) async {
  try {
    final r = await const MethodChannel('hjemme/native').invokeMapMethod<String, dynamic>('battery');
    final l = (r?['level'] as num?)?.toInt() ?? -1;
    if (l > 0 && l <= 100) return (l, r?['charging'] == true);
  } catch (_) {
    // im Hintergrund-Abgleich gibt es den Kanal nicht – dann battery_plus
  }
  try {
    final l = await battery.batteryLevel;
    final s = await battery.batteryState;
    final chg = s == BatteryState.charging || s == BatteryState.full;
    if (l > 0 && l <= 100) return (l, chg);
    return (null, chg);
  } catch (_) {
    return (null, false);
  }
}
