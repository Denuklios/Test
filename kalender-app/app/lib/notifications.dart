import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:intl/intl.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'models.dart';
import 'store.dart';

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
    );
    _ready = true;
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
    final items = <(DateTime, String, String)>[];
    for (final o in s.occurrences(now.subtract(const Duration(days: 1)), until, onlyVisible: false)) {
      final ev = o.ev;
      if (ev.isBirthday) {
        final age = ev.birthYear != null ? o.start.year - ev.birthYear! : null;
        final ageTxt = age != null && age > 0 ? ' wird $age' : ' hat Geburtstag';
        final day = dateOnly(o.start);
        items.add((day.add(const Duration(hours: 8)), '🎂 Heute: ${ev.title}', '${ev.title}$ageTxt! Gratulieren nicht vergessen.'));
        if (s.birthdayReminderDays > 0) {
          final pre = DateTime(day.year, day.month, day.day - s.birthdayReminderDays, 18);
          final txt = s.birthdayReminderDays == 1 ? 'Morgen' : 'In ${s.birthdayReminderDays} Tagen';
          items.add((pre, '🎂 $txt: ${ev.title}', '${ev.title}$ageTxt – Geschenk schon besorgt?'));
        }
        continue;
      }
      if (!ev.people.contains(s.myId)) continue; // nur eigene / eingeladene Termine
      final base = ev.allDay ? dateOnly(o.start).add(const Duration(hours: 9)) : o.start;
      for (final m in ev.reminders) {
        final at = ev.allDay && m == 0 ? dateOnly(o.start).add(const Duration(hours: 8)) : base.subtract(Duration(minutes: m));
        final dd = dateOnly(o.start).difference(dateOnly(at)).inHours ~/ 24;
        final lead = ev.allDay ? (dd <= 0 ? 'Heute' : dd == 1 ? 'Morgen' : 'In $dd Tagen') : reminderLabel(m);
        items.add((at, s.displayTitle(o), '$lead · ${describe(s, o)}'));
      }
    }
    items.removeWhere((i) => i.$1.isBefore(now));
    items.sort((a, b) => a.$1.compareTo(b.$1));
    var id = 1000;
    for (final i in items.take(300)) {
      await _schedule(id++, i.$1, i.$2, i.$3, _reminderChannel);
    }
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

  static Future<void> _schedule(int id, DateTime at, String title, String body, AndroidNotificationDetails d) async {
    try {
      await plugin.zonedSchedule(
        id: id,
        scheduledDate: tz.TZDateTime.from(at, tz.local),
        notificationDetails: NotificationDetails(android: d),
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        title: title,
        body: body,
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
