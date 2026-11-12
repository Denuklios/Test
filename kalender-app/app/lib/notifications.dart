import 'dart:convert';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:intl/intl.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'package:flutter/services.dart';

import 'models.dart';
import 'store.dart';
import 'widgets/prep_widgets.dart';

/// Antworten auf Benachrichtigungen, auch wenn die App geschlossen ist
@pragma('vm:entry-point')
Future<void> notificationTapBackground(NotificationResponse r) async {
  await Notifier.handleResponse(r);
}

class Notifier {
  static final plugin = FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static const _reminderChannel = AndroidNotificationDetails(
    'erinnerungen',
    'Erinnerungen',
    channelDescription: 'Erinnerungen an Termine und Geburtstage',
    importance: Importance.high,
    priority: Priority.high,
    icon: 'ic_notification',
  );
  static const _changeChannel = AndroidNotificationDetails(
    'aenderungen',
    'Neue Termine von anderen',
    channelDescription: 'Wenn jemand aus der Gruppe etwas einträgt oder ändert',
    importance: Importance.defaultImportance,
    icon: 'ic_notification',
  );
  static const _summaryChannel = AndroidNotificationDetails(
    'tagesvorschau',
    'Tagesvorschau am Morgen',
    channelDescription: 'Was heute ansteht',
    importance: Importance.defaultImportance,
    icon: 'ic_notification',
    styleInformation: BigTextStyleInformation(''),
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
    await plugin.initialize(
      settings: const InitializationSettings(android: AndroidInitializationSettings('ic_notification')),
      onDidReceiveNotificationResponse: handleResponse,
      onDidReceiveBackgroundNotificationResponse: notificationTapBackground,
    );
    _ready = true;
  }

  /// Im Vordergrund gesetzt: Store der laufenden App und Navigation zum Termin
  static AppStore? foregroundStore;
  static void Function(String eventId)? onOpenEvent;
  static const _channel = MethodChannel('kalender/prep');

  static Future<void> handleResponse(NotificationResponse r) async {
    final parts = (r.payload ?? '').split('|');
    if (parts.length < 2) return;
    final eventId = parts[1];
    if (r.actionId == 'done' && parts[0] == 'prep' && parts.length >= 4) {
      var s = foregroundStore;
      final bg = s == null;
      if (s == null) {
        s = AppStore();
        await s.load();
      }
      await s.markPrepDone(eventId, parts[2], parts[3].split(','));
      if (r.id != null) await plugin.cancel(id: r.id!);
      await s.flush();
      if (bg) await rescheduleAll(s);
      return;
    }
    onOpenEvent?.call(eventId);
  }

  /// Termin, über dessen Benachrichtigung die App gestartet wurde
  static Future<String?> launchEventId() async {
    final d = await plugin.getNotificationAppLaunchDetails();
    if (d?.didNotificationLaunchApp != true) return null;
    final parts = (d!.notificationResponse?.payload ?? '').split('|');
    return parts.length >= 2 ? parts[1] : null;
  }

  static Future<void> requestPermission() async {
    final a = plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await a?.requestNotificationsPermission();
  }

  static String _time(DateTime d) => DateFormat('HH:mm').format(d);

  static String describe(AppStore s, Occurrence o) {
    final ev = o.ev;
    final day = DateFormat('EEE d. MMM', 'de_DE').format(o.start);
    final when = ev.allDay || ev.isBirthday ? day : '$day, ${_time(o.start)}';
    final parts = <String>[when];
    if (ev.location.isNotEmpty) parts.add(ev.location);
    return parts.join(' · ');
  }

  /// Plant alle Erinnerungen der nächsten Wochen neu.
  static Future<void> rescheduleAll(AppStore s) async {
    await init();
    await plugin.cancelAllPendingNotifications();
    if (!s.isSetUp) return;
    final now = DateTime.now();
    final until = now.add(const Duration(days: 62));
    final items = <(DateTime, String, String, String)>[];
    for (final o in s.occurrences(now.subtract(const Duration(days: 1)), until, onlyVisible: false)) {
      final ev = o.ev;
      if (ev.isBirthday) {
        final age = ev.birthYear != null ? o.start.year - ev.birthYear! : null;
        final ageTxt = age != null && age > 0 ? ' wird $age' : ' hat Geburtstag';
        final day = dateOnly(o.start);
        items.add((day.add(const Duration(hours: 8)), '🎂 Heute: ${ev.title}', '${ev.title}$ageTxt! Gratulieren nicht vergessen.', 'open|${ev.id}'));
        if (s.birthdayReminderDays > 0) {
          final pre = DateTime(day.year, day.month, day.day - s.birthdayReminderDays, 18);
          final txt = s.birthdayReminderDays == 1 ? 'Morgen' : 'In ${s.birthdayReminderDays} Tagen';
          if (ev.prep.isEmpty) items.add((pre, '🎂 $txt: ${ev.title}', '${ev.title}$ageTxt – Geschenk schon besorgt?', 'open|${ev.id}'));
        }
        continue;
      }
      final general = ev.ownerId.isEmpty && ev.participants.isEmpty;
      if (!general && !ev.people.contains(s.myId)) continue; // nur eigene / eingeladene / allgemeine Termine
      final base = ev.allDay ? dateOnly(o.start).add(const Duration(hours: 9)) : o.start;
      for (final m in ev.reminders) {
        final at = ev.allDay && m == 0 ? dateOnly(o.start).add(const Duration(hours: 8)) : base.subtract(Duration(minutes: m));
        final dd = dateOnly(o.start).difference(dateOnly(at)).inHours ~/ 24;
        final lead = ev.allDay ? (dd <= 0 ? 'Heute' : dd == 1 ? 'Morgen' : 'In $dd Tagen') : reminderLabel(m);
        items.add((at, s.displayTitle(o), '$lead · ${describe(s, o)}', 'open|${ev.id}'));
      }
    }
    items.removeWhere((i) => i.$1.isBefore(now));
    items.sort((a, b) => a.$1.compareTo(b.$1));
    var id = 1000;
    for (final i in items.take(250)) {
      await _schedule(id++, i.$1, i.$2, i.$3, _reminderChannel, payload: i.$4);
    }
    // Vorbereitungs-Erinnerungen (intelligente Checkliste)
    if (s.prepNotify) {
      final prepItems = <(DateTime, String, String, String)>[];
      for (final pd in upcomingPrep(s, days: 62)) {
        final o = pd.o;
        final byDay = <DateTime, List<PrepItem>>{};
        for (final p in pd.open) {
          byDay.putIfAbsent(p.dueDate(o.start), () => []).add(p);
        }
        for (final e in byDay.entries) {
          final dueDay = e.key;
          final onDay = dueDay == dateOnly(o.start);
          var at = onDay
              ? (o.ev.allDay ? dueDay.add(const Duration(hours: 7)) : o.start.subtract(const Duration(hours: 2)))
              : dueDay.add(const Duration(hours: 18));
          if (onDay && !o.ev.allDay && at.hour < 6) at = DateTime(at.year, at.month, at.day, 6);
          if (at.isBefore(now)) continue;
          final diff = dateOnly(o.start).difference(dueDay).inHours ~/ 24;
          final when = diff == 0 ? 'heute' : (diff == 1 ? 'morgen' : 'in $diff Tagen');
          final texts = e.value.map((p) => '• ${p.text}').toList();
          prepItems.add((
            at,
            '🧳 ${s.displayTitle(o)} – $when',
            texts.join('\n'),
            'prep|${o.ev.id}|${dayKey(o.start)}|${e.value.map((p) => p.id).join(',')}',
          ));
        }
      }
      prepItems.sort((a, b) => a.$1.compareTo(b.$1));
      var pid = 30000;
      for (final i in prepItems.take(150)) {
        await _schedule(pid++, i.$1, i.$2, i.$3, AndroidNotificationDetails(
          'vorbereitung',
          'Vorbereitung & Packliste',
          channelDescription: 'Erinnert an Punkte der intelligenten Checkliste',
          importance: Importance.high,
          priority: Priority.high,
          icon: 'ic_notification',
          visibility: NotificationVisibility.public,
          styleInformation: BigTextStyleInformation(i.$3),
          actions: const [
            AndroidNotificationAction('done', '✓ Erledigt', cancelNotification: true),
            AndroidNotificationAction('open', 'Öffnen', showsUserInterface: true),
          ],
        ), payload: i.$4);
      }
    }
    await updateUnlockService(s);
    await updateChangeWatch(s);
    // Tagesvorschau morgens
    if (s.morningSummary) {
      for (var d = 0; d < 21; d++) {
        final day = DateTime(now.year, now.month, now.day + d);
        final at = day.add(Duration(hours: s.morningHour));
        if (at.isBefore(now)) continue;
        final occ = s.forDay(day);
        final hol = s.holidays.forDay(day).where((h) => h.free).map((h) => h.label);
        if (occ.isEmpty && hol.isEmpty) continue;
        final lines = <String>[
          ...hol.map((h) => '🎉 $h'),
          ...occ.map((o) => o.ev.allDay || o.ev.isBirthday || o.firstDay != dateOnly(o.start)
              ? s.displayTitle(o)
              : '${_time(o.start)} ${s.displayTitle(o)}'),
        ];
        await _schedule(
          50000 + d,
          at,
          'Heute: ${occ.length} ${occ.length == 1 ? 'Termin' : 'Termine'}',
          lines.join('\n'),
          AndroidNotificationDetails(
            _summaryChannel.channelId,
            _summaryChannel.channelName,
            channelDescription: _summaryChannel.channelDescription,
            icon: 'ic_notification',
            styleInformation: BigTextStyleInformation(lines.join('\n')),
          ),
        );
      }
    }
  }

  /// Push-Wächter (Android): meldet Änderungen anderer auch bei geschlossener App
  static Future<void> updateChangeWatch(AppStore s) async {
    if (!s.isConnected) return;
    try {
      await _channel.invokeMethod('changeWatch', {
        'url': s.serverUrl,
        'code': s.code,
        'me': s.myId,
        'since': s.since,
        'names': jsonEncode({for (final m in s.members.values) m.id: m.name}),
        'enabled': s.notifyChanges,
        'onlyMine': s.notifyOnlyMine,
        'known': s.events.keys.toList(),
      });
    } catch (_) {}
  }

  /// Daten für den Entsperr-Dienst (Android) – nur im Vordergrund möglich
  static Future<void> updateUnlockService(AppStore s) async {
    final entries = <Map<String, dynamic>>[];
    if (s.unlockReminder) {
      for (final pd in upcomingPrep(s, days: 30)) {
        final o = pd.o;
        final day = dateOnly(o.start);
        final from = DateTime(day.year, day.month, day.day - s.prepWindowDays, 6);
        final until = o.ev.allDay ? day.add(const Duration(hours: 12)) : o.start;
        final sorted = [...pd.open]..sort((a, b) => b.days.compareTo(a.days));
        entries.add({
          'from': from.millisecondsSinceEpoch,
          'until': until.millisecondsSinceEpoch,
          'day': day.millisecondsSinceEpoch,
          'title': s.displayTitle(o),
          'items': sorted.map((p) => p.text).toList(),
          'eventId': o.ev.id,
        });
      }
    }
    try {
      await _channel.invokeMethod('update', {'enabled': s.unlockReminder, 'entries': jsonEncode(entries)});
    } catch (_) {
      // im Hintergrund nicht verfügbar
    }
  }

  static Future<void> _schedule(int id, DateTime at, String title, String body, AndroidNotificationDetails d, {String? payload}) async {
    try {
      await plugin.zonedSchedule(
        id: id,
        scheduledDate: tz.TZDateTime.from(at, tz.local),
        notificationDetails: NotificationDetails(android: d),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        title: title,
        body: body,
        payload: payload,
      );
    } catch (_) {
      try {
        await plugin.zonedSchedule(
          id: id,
          scheduledDate: tz.TZDateTime.from(at, tz.local),
          notificationDetails: NotificationDetails(android: d),
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
          title: title,
          body: body,
          payload: payload,
        );
      } catch (_) {}
    }
  }

  static Future<void> showChanges(AppStore s, List<ChangeInfo> changes) async {
    if (!s.notifyChanges) return;
    await init();
    var id = 90000 + DateTime.now().millisecond * 10;
    for (final c in changes.take(5)) {
      final ev = c.ev;
      if (s.notifyOnlyMine && !ev.people.contains(s.myId) && !ev.isBirthday) continue;
      final who = s.member(ev.editedBy)?.name ?? 'Jemand';
      final what = c.removed ? 'hat gelöscht' : (c.isNew ? 'hat eingetragen' : 'hat geändert');
      final o = Occurrence(ev, ev.start, ev.end);
      await plugin.show(
        id: id++,
        title: '$who $what',
        body: '${s.displayTitle(o)} · ${describe(s, o)}',
        notificationDetails: const NotificationDetails(android: _changeChannel),
        payload: 'open|${ev.id}',
      );
    }
  }
}

String reminderLabel(int m) {
  if (m == 0) return 'Jetzt';
  if (m < 60) return 'In $m Minuten';
  if (m < 1440) {
    final h = m ~/ 60;
    return h == 1 ? 'In 1 Stunde' : 'In $h Stunden';
  }
  final d = m ~/ 1440;
  if (d == 7) return 'In 1 Woche';
  return d == 1 ? 'Morgen' : 'In $d Tagen';
}

const reminderOptions = <int, String>{
  0: 'Zum Zeitpunkt',
  5: '5 Minuten vorher',
  15: '15 Minuten vorher',
  30: '30 Minuten vorher',
  60: '1 Stunde vorher',
  120: '2 Stunden vorher',
  1440: '1 Tag vorher',
  2880: '2 Tage vorher',
  10080: '1 Woche vorher',
};

String reminderOptionLabel(int m) => reminderOptions[m] ?? '$m Minuten vorher';


/// Für ganztägige Termine (Bezug: 9:00 Uhr am Tag)
const allDayReminderOptions = <int, String>{
  0: 'Am Tag um 8:00',
  900: 'Am Vorabend 18:00',
  1440: '1 Tag vorher (9:00)',
  2880: '2 Tage vorher',
  10080: '1 Woche vorher',
};
