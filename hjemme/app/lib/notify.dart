import 'dart:typed_data';
import 'dart:ui' show Color;

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Lokale Benachrichtigungen (Orte, Akku, Chat, SOS, Klingeln)
class Notify {
  static final _p = FlutterLocalNotificationsPlugin();
  static bool _ready = false;
  static void Function(String? payload)? onTap;

  static const _alerts = AndroidNotificationChannel('alerts', 'Orte & Hinweise',
      description: 'Ankommen, Losfahren, Akku, Tempo', importance: Importance.high);
  static const _chat = AndroidNotificationChannel('chat', 'Nachrichten', description: 'Chat und Check-ins', importance: Importance.high);
  static final _sos = AndroidNotificationChannel('sos2', 'SOS-Alarm',
      description: 'Notruf aus deinem Kreis – sehr laut',
      importance: Importance.max,
      sound: const UriAndroidNotificationSound('content://settings/system/alarm_alert'),
      audioAttributesUsage: AudioAttributesUsage.alarm,
      enableVibration: true,
      vibrationPattern: Int64List.fromList([0, 800, 400, 800, 400, 800]));
  static const _ring = AndroidNotificationChannel('ring2', 'Handy klingeln lassen',
      description: 'Wenn jemand dein Handy sucht',
      importance: Importance.max,
      sound: UriAndroidNotificationSound('content://settings/system/ringtone'),
      audioAttributesUsage: AudioAttributesUsage.alarm);

  static Future<void> init() async {
    if (_ready) return;
    await _p.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('@drawable/ic_notification')),
      onDidReceiveNotificationResponse: (r) => onTap?.call(r.payload),
    );
    final a = _p.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    for (final c in [_alerts, _chat, _sos, _ring]) {
      await a?.createNotificationChannel(c);
    }
    _ready = true;
  }

  static Future<void> requestPermission() async {
    await _p.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission();
  }

  static Future<String?> launchPayload() async {
    final d = await _p.getNotificationAppLaunchDetails();
    return d?.didNotificationLaunchApp == true ? d?.notificationResponse?.payload : null;
  }

  static Future<void> show(int id, String title, String body, {String kind = 'alerts', String? payload, int? color}) async {
    await init();
    AndroidNotificationDetails d;
    switch (kind) {
      case 'sos':
        d = AndroidNotificationDetails(_sos.id, _sos.name,
            channelDescription: _sos.description,
            importance: Importance.max,
            priority: Priority.max,
            category: AndroidNotificationCategory.alarm,
            fullScreenIntent: true,
            audioAttributesUsage: AudioAttributesUsage.alarm,
            additionalFlags: Int32List.fromList([4]), // Ton wiederholen bis geöffnet
            color: const Color(0xFFFF4D4F),
            styleInformation: BigTextStyleInformation(body));
      case 'ring':
        d = AndroidNotificationDetails(_ring.id, _ring.name,
            channelDescription: _ring.description,
            importance: Importance.max,
            priority: Priority.max,
            category: AndroidNotificationCategory.alarm,
            fullScreenIntent: true,
            audioAttributesUsage: AudioAttributesUsage.alarm,
            additionalFlags: Int32List.fromList([4]),
            ongoing: true,
            autoCancel: true,
            timeoutAfter: 60000);
      case 'chat':
        d = AndroidNotificationDetails(_chat.id, _chat.name,
            channelDescription: _chat.description,
            importance: Importance.high,
            priority: Priority.high,
            color: color == null ? null : Color(0xFF000000 | color),
            styleInformation: BigTextStyleInformation(body));
      default:
        d = AndroidNotificationDetails(_alerts.id, _alerts.name,
            channelDescription: _alerts.description,
            importance: Importance.high,
            priority: Priority.high,
            color: color == null ? null : Color(0xFF000000 | color),
            styleInformation: BigTextStyleInformation(body));
    }
    await _p.show(id: id, title: title, body: body, notificationDetails: NotificationDetails(android: d), payload: payload);
  }

  static Future<void> cancel(int id) async {
    await init();
    await _p.cancel(id: id);
  }
}
