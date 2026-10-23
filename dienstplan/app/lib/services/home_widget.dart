import 'dart:convert';

import 'package:home_widget/home_widget.dart';

import '../core/dates.dart';
import '../core/models.dart';
import '../core/schedule.dart';

/// Daten für das Home-Screen-Widget „Nächster Dienst“.
/// Das Widget bekommt die nächsten Dienste als Liste und sucht sich selbst den aktuellen aus,
/// so stimmt es auch ohne Netz und nach Mitternacht.
class DienstWidget {
  static const iOSGroup = 'group.de.sonderpreis.dienstplan';
  static const androidName = 'NextShiftWidgetProvider';
  static const iOSName = 'NextShiftWidget';

  static Future<void> update(DienstState? st) async {
    try {
      await HomeWidget.setAppGroupId(iOSGroup);
      final list = <Map<String, dynamic>>[];
      if (st != null && !st.me.isAdmin) {
        for (final ds in shiftsInRange(st, st.me.id, addDays(dateOnly(DateTime.now()), -1), 31)) {
          final iv = ds.interval;
          if (iv == null) continue;
          list.add({
            'start': iv.$1.millisecondsSinceEpoch,
            'end': iv.$2.millisecondsSinceEpoch,
            'day': mediumDate(ds.day),
            'name': ds.shift.name,
            'time': '${ds.shift.start}–${ds.shift.end}',
            'color': ds.shift.color,
            'note': ds.shift.note ?? '',
          });
        }
      }
      await HomeWidget.saveWidgetData<String>('shifts', jsonEncode(list));
      await HomeWidget.saveWidgetData<String>('state', st == null ? 'logout' : (st.me.isAdmin ? 'admin' : 'ok'));
      await HomeWidget.saveWidgetData<int>('updated', DateTime.now().millisecondsSinceEpoch);
      await HomeWidget.updateWidget(androidName: androidName, iOSName: iOSName);
    } catch (_) {
      // Widget ist optional; Fehler dürfen den Abgleich nicht stören.
    }
  }
}
