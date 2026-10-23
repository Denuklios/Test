import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../core/dates.dart';
import '../core/models.dart';
import '../core/schedule.dart';
import '../core/storage.dart';

/// Lokale Erinnerungen (Vorabend, X Minuten vor Dienstbeginn) und Hinweise auf Planänderungen.
class Notifier {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static const _remindBase = 1000;
  static const _changeId = 1;

  static const _remindChannel = AndroidNotificationDetails(
    'erinnerungen',
    'Erinnerungen',
    channelDescription: 'Erinnerung am Vorabend und vor Dienstbeginn',
    importance: Importance.high,
    priority: Priority.high,
    category: AndroidNotificationCategory.reminder,
  );
  static const _changeChannel = AndroidNotificationDetails(
    'aenderungen',
    'Planänderungen',
    channelDescription: 'Hinweis, wenn sich dein Dienst geändert hat',
    importance: Importance.high,
    priority: Priority.high,
  );

  static Future<void> init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    try {
      final info = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(info.identifier));
    } catch (_) {
      tz.setLocalLocation(tz.getLocation('Europe/Berlin'));
    }
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@drawable/ic_notification'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
    );
    _ready = true;
  }

  /// Fragt die Berechtigung für Benachrichtigungen an (Android 13+, iOS).
  static Future<bool> requestPermission() async {
    await init();
    if (Platform.isAndroid) {
      final a = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      return await a?.requestNotificationsPermission() ?? true;
    }
    if (Platform.isIOS) {
      final i = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
      return await i?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
    }
    return true;
  }

  static Future<AndroidScheduleMode> _mode() async {
    if (!Platform.isAndroid) return AndroidScheduleMode.inexactAllowWhileIdle;
    final a = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    final exact = await a?.canScheduleExactNotifications() ?? false;
    return exact ? AndroidScheduleMode.exactAllowWhileIdle : AndroidScheduleMode.inexactAllowWhileIdle;
  }

  /// Plant alle Erinnerungen der nächsten 14 Tage neu (nach jeder Synchronisation).
  static Future<void> reschedule(DienstState st, Settings s) async {
    await init();
    for (final p in await _plugin.pendingNotificationRequests()) {
      if (p.id >= _remindBase) await _plugin.cancel(id: p.id);
    }
    if (st.me.isAdmin || (!s.remindEvening && !s.remindBefore)) return;
    final now = DateTime.now();
    final mode = await _mode();
    var id = _remindBase;
    for (final ds in shiftsInRange(st, st.me.id, dateOnly(now), 15)) {
      final iv = ds.interval;
      if (iv == null) continue;
      final sh = ds.shift;
      final note = sh.note != null ? ' · ${sh.note}' : '';
      if (s.remindEvening) {
        final eve = addDays(ds.day, -1);
        final at = DateTime(eve.year, eve.month, eve.day, s.eveningMinutes ~/ 60, s.eveningMinutes % 60);
        if (at.isAfter(now) && at.isBefore(iv.$1)) {
          await _schedule(id++, at, 'Morgen: ${sh.name}', '${weekdayLong[ds.day.weekday - 1]}, ${shortDate(ds.day)} · ${sh.start}–${sh.end} Uhr$note', mode);
        }
      }
      if (s.remindBefore) {
        final at = iv.$1.subtract(Duration(minutes: s.beforeMinutes));
        if (at.isAfter(now)) {
          final lead = s.beforeMinutes >= 60 && s.beforeMinutes % 60 == 0
              ? '${s.beforeMinutes ~/ 60} Std.'
              : '${s.beforeMinutes} Min.';
          await _schedule(id++, at, 'In $lead: ${sh.name}', 'Heute ${sh.start}–${sh.end} Uhr$note', mode);
        }
      }
    }
  }

  static Future<void> _schedule(int id, DateTime at, String title, String body, AndroidScheduleMode mode) async {
    try {
      await _plugin.zonedSchedule(
        id: id,
        title: title,
        body: body,
        scheduledDate: tz.TZDateTime.from(at, tz.local),
        notificationDetails: const NotificationDetails(android: _remindChannel, iOS: DarwinNotificationDetails()),
        androidScheduleMode: mode,
      );
    } catch (_) {
      // Exakte Alarme nicht erlaubt -> ungenau planen
      if (mode != AndroidScheduleMode.inexactAllowWhileIdle) {
        await _schedule(id, at, title, body, AndroidScheduleMode.inexactAllowWhileIdle);
      }
    }
  }

  static Future<void> showChanges(List<ShiftChange> changes) async {
    if (changes.isEmpty) return;
    await init();
    final (title, body) = changeMessage(changes);
    await _plugin.show(
      id: _changeId,
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(android: _changeChannel, iOS: DarwinNotificationDetails()),
    );
  }

  static Future<void> cancelAll() async {
    await init();
    await _plugin.cancelAll();
  }
}
