import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../main.dart';
import '../models.dart';
import 'common.dart';

String timeText(Occurrence o, {DateTime? day}) {
  final ev = o.ev;
  if (ev.isBirthday) return 'Geburtstag';
  final multi = o.firstDay != o.lastDay;
  final df = DateFormat('d. MMM', 'de_DE');
  if (ev.allDay) {
    return multi ? '${df.format(o.firstDay)} – ${df.format(o.lastDay)}' : 'Ganztägig';
  }
  if (multi) {
    return '${df.format(o.start)} ${hhmm(o.start)} – ${df.format(o.end)} ${hhmm(o.end)}';
  }
  return '${hhmm(o.start)} – ${hhmm(o.end)}';
}

class EventTile extends StatelessWidget {
  final Occurrence o;
  final VoidCallback? onTap;
  const EventTile(this.o, {super.key, this.onTap});

  @override
  Widget build(BuildContext context) {
    final ev = o.ev;
    final colors = store.colorsFor(ev);
    final names = store.peopleNames(ev);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 6, height: 44, decoration: ev.isVacation ? vacationDecoration(colors) : multiColorDecoration(colors, radius: 3)),
          const SizedBox(width: 10),
          SizedBox(
            width: 58,
            child: Text(
              ev.allDay || ev.isBirthday ? (o.firstDay != o.lastDay ? 'mehr-\ntägig' : 'ganz-\ntags') : hhmm(o.start),
              style: TextStyle(color: Colors.grey.shade700, fontWeight: FontWeight.w600, fontSize: ev.allDay || ev.isBirthday ? 12 : 14),
            ),
          ),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(store.displayTitle(o), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              Text(
                [
                  timeText(o),
                  if (names.isNotEmpty && !ev.isBirthday) names,
                  if (ev.location.isNotEmpty) '📍 ${ev.location}',
                ].join(' · '),
                style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
              ),
            ]),
          ),
          if (ev.photos.isNotEmpty) Icon(Icons.photo_outlined, size: 18, color: Colors.grey.shade600),
          if (ev.repeat != Repeat.none && !ev.isBirthday) Icon(Icons.repeat, size: 18, color: Colors.grey.shade600),
        ]),
      ),
    );
  }
}
