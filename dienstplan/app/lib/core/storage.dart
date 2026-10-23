import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'hours.dart';
import 'models.dart';

/// Token und Geräte-Kennung liegen verschlüsselt im Android-Keystore bzw. iOS-Schlüsselbund.
/// Passwörter werden nie gespeichert.
class SecureStore {
  static const _s = FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device),
  );

  static Future<String?> token() => _s.read(key: 'token');
  static Future<void> setToken(String? t) => t == null ? _s.delete(key: 'token') : _s.write(key: 'token', value: t);

  static Future<String> deviceId() async {
    var id = await _s.read(key: 'device');
    if (id == null || id.length < 8) {
      final r = Random.secure();
      const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
      id = List.generate(24, (_) => a[r.nextInt(a.length)]).join();
      await _s.write(key: 'device', value: id);
    }
    return id;
  }
}

class Settings {
  ThemeMode themeMode;
  bool remindEvening;
  int eveningMinutes; // Uhrzeit am Vorabend, Minuten seit Mitternacht
  bool remindBefore;
  int beforeMinutes; // Vorlauf vor Dienstbeginn
  bool notifyChanges;
  bool backgroundSync;
  PauseRule pause;

  Settings({
    this.themeMode = ThemeMode.system,
    this.remindEvening = true,
    this.eveningMinutes = 20 * 60,
    this.remindBefore = true,
    this.beforeMinutes = 60,
    this.notifyChanges = true,
    this.backgroundSync = true,
    this.pause = const PauseRule(),
  });

  Map<String, dynamic> toJson() => {
        'theme': themeMode.name,
        'remindEvening': remindEvening,
        'eveningMinutes': eveningMinutes,
        'remindBefore': remindBefore,
        'beforeMinutes': beforeMinutes,
        'notifyChanges': notifyChanges,
        'backgroundSync': backgroundSync,
        'pauseMode': pause.mode.name,
        'pauseFixed': pause.fixedMinutes,
        'pauseThreshold': pause.fixedThreshold,
      };

  factory Settings.fromJson(Map<String, dynamic> j) {
    T pick<T>(String k, T def) => j[k] is T ? j[k] as T : def;
    return Settings(
      themeMode: ThemeMode.values.firstWhere((m) => m.name == j['theme'], orElse: () => ThemeMode.system),
      remindEvening: pick('remindEvening', true),
      eveningMinutes: pick('eveningMinutes', 20 * 60),
      remindBefore: pick('remindBefore', true),
      beforeMinutes: pick('beforeMinutes', 60),
      notifyChanges: pick('notifyChanges', true),
      backgroundSync: pick('backgroundSync', true),
      pause: PauseRule(
        mode: PauseMode.values.firstWhere((m) => m.name == j['pauseMode'], orElse: () => PauseMode.legal),
        fixedMinutes: pick('pauseFixed', 30),
        fixedThreshold: pick('pauseThreshold', 360),
      ),
    );
  }
}

/// Unkritische Daten: Server-Adresse, letzter Benutzername, Einstellungen und Offline-Cache.
class LocalStore {
  final SharedPreferences p;

  LocalStore(this.p);

  static Future<LocalStore> open() async => LocalStore(await SharedPreferences.getInstance());

  String? get server => p.getString('server');
  Future<void> setServer(String s) => p.setString('server', s);

  String get lastUser => p.getString('lastUser') ?? '';
  Future<void> setLastUser(String u) => p.setString('lastUser', u);

  Settings get settings {
    final raw = p.getString('settings');
    if (raw == null) return Settings();
    try {
      return Settings.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {
      return Settings();
    }
  }

  Future<void> setSettings(Settings s) => p.setString('settings', jsonEncode(s.toJson()));

  /// Letzter Stand vom Server (ohne Start-Passwörter) mit Zeitstempel
  (DienstState, DateTime)? get cache {
    final raw = p.getString('cache');
    final t = p.getInt('cacheTime');
    if (raw == null || t == null) return null;
    try {
      return (DienstState.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map)), DateTime.fromMillisecondsSinceEpoch(t));
    } catch (_) {
      return null;
    }
  }

  Future<void> setCache(DienstState st, DateTime at) async {
    await p.setString('cache', jsonEncode(st.toJson()));
    await p.setInt('cacheTime', at.millisecondsSinceEpoch);
  }

  /// Admin: noch nicht gesendete Planänderungen (gehen bei Fehlern nicht verloren)
  Map<String, Map<String, PlanCell?>> get pending {
    final raw = p.getString('pending');
    if (raw == null) return {};
    try {
      final j = jsonDecode(raw) as Map;
      return {
        for (final d in j.entries)
          '${d.key}': {
            for (final c in (d.value as Map).entries)
              '${c.key}': c.value == null ? null : PlanCell.fromJson(Map<String, dynamic>.from(c.value as Map))
          }
      };
    } catch (_) {
      return {};
    }
  }

  Future<void> setPending(Map<String, Map<String, PlanCell?>> m) async {
    if (m.isEmpty) {
      await p.remove('pending');
      return;
    }
    await p.setString('pending', jsonEncode({
      for (final d in m.entries) d.key: {for (final c in d.value.entries) c.key: c.value?.toJson()}
    }));
  }

  Future<void> clearAccountData() async {
    await p.remove('cache');
    await p.remove('cacheTime');
    await p.remove('pending');
  }
}
