import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../main.dart';
import '../models.dart';
import '../widgets/event_tile.dart';

class AgendaScreen extends StatelessWidget {
  final void Function(Occurrence) onOpen;
  const AgendaScreen({super.key, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final today = dateOnly(DateTime.now());
        final end = DateTime(today.year, today.month + 3, today.day);
        final occ = store.occurrences(today, end);
        final children = <Widget>[];
        for (var d = today; !d.isAfter(end); d = DateTime(d.year, d.month, d.day + 1)) {
          final dayOcc = occ.where((o) => o.coversDay(d)).toList();
          final hol = store.holidays.forDay(d).where((h) => h.free).toList();
          final isToday = d == today;
          if (dayOcc.isEmpty && hol.isEmpty && !isToday) continue;
          children.add(Container(
            color: isToday ? const Color(0xFFE3F2FD) : Colors.grey.shade100,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(children: [
              Text(
                isToday
                    ? 'Heute, ${DateFormat('d. MMMM', 'de_DE').format(d)}'
                    : d == today.add(const Duration(days: 1))
                        ? 'Morgen, ${DateFormat('d. MMMM', 'de_DE').format(d)}'
                        : DateFormat('EEEE, d. MMMM', 'de_DE').format(d),
                style: TextStyle(fontWeight: FontWeight.bold, color: isToday ? const Color(0xFF1565C0) : Colors.black87),
              ),
              const Spacer(),
              if (hol.isNotEmpty) Flexible(child: Text('🎉 ${hol.map((h) => h.label).join(', ')}', style: const TextStyle(color: Colors.red, fontSize: 12), overflow: TextOverflow.ellipsis)),
            ]),
          ));
          if (dayOcc.isEmpty) {
            children.add(const Padding(padding: EdgeInsets.all(14), child: Text('Nichts geplant', style: TextStyle(color: Colors.grey))));
          }
          children.addAll(dayOcc.map((o) => EventTile(o, onTap: () => onOpen(o))));
        }
        return RefreshIndicator(
          onRefresh: () => store.sync(),
          child: ListView(children: children),
        );
      },
    );
  }
}
