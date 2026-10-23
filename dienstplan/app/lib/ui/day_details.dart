import 'package:flutter/material.dart';

import '../core/dates.dart';
import '../core/hours.dart';
import '../core/models.dart';
import 'team_groups.dart';
import 'widgets.dart';

/// Tagesdetails: eigener Dienst inkl. Notiz und wer an dem Tag arbeitet.
Future<void> showDayDetails(BuildContext context, DienstState st, DateTime day) {
  final k = dayKey(day);
  final own = st.me.isAdmin ? null : st.shiftOf(st.me.id, k);
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    builder: (c) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.35,
      maxChildSize: 0.95,
      builder: (c, scroll) => ListView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          Text(longDate(day), style: Theme.of(c).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          Text('KW ${isoWeek(day)}', style: TextStyle(color: Theme.of(c).colorScheme.outline)),
          if (!st.me.isAdmin) ...[
            const SectionTitle('Mein Dienst'),
            ShiftPill(shift: own),
            if (own != null && own.hasTimes)
              Padding(
                padding: const EdgeInsets.only(top: 6, left: 4),
                child: Text('Dauer ${formatDuration(shiftMinutes(own.start, own.end))}', style: TextStyle(color: Theme.of(c).colorScheme.outline)),
              ),
          ],
          const SectionTitle('Team an diesem Tag'),
          DayGroups(state: st, dayKey: k),
        ],
      ),
    ),
  );
}
