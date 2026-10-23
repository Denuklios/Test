import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_model.dart';
import '../../core/dates.dart';
import '../../core/hours.dart';
import '../widgets.dart';

/// Stundenübersicht pro Monat. Admin sieht alle Mitarbeiter, Mitarbeiter nur sich selbst.
class HoursScreen extends StatefulWidget {
  const HoursScreen({super.key});

  @override
  State<HoursScreen> createState() => _HoursScreenState();
}

class _HoursScreenState extends State<HoursScreen> {
  DateTime _month = firstOfMonth(DateTime.now());

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final st = m.state;
    if (st == null) return const SizedBox.shrink();
    final rule = m.settings.pause;
    final cs = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;

    final header = Row(children: [
      IconButton.filledTonal(onPressed: () => setState(() => _month = addMonths(_month, -1)), icon: const Icon(Icons.chevron_left), tooltip: 'Vorheriger Monat'),
      Expanded(child: Text(monthTitle(_month), textAlign: TextAlign.center, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
      IconButton.filledTonal(onPressed: () => setState(() => _month = addMonths(_month, 1)), icon: const Icon(Icons.chevron_right), tooltip: 'Nächster Monat'),
    ]);

    final children = <Widget>[const SyncBanner(), header, const SizedBox(height: 12)];

    if (st.me.isAdmin) {
      for (final e in st.visibleEmps) {
        final h = monthHours(st, e.id, _month, rule);
        children.add(Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            title: Text(e.name, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${h.shifts} Dienste${h.offDays.isEmpty ? '' : ' · ${h.offDays.entries.map((x) => '${x.value}× ${x.key}').join(', ')}'}'),
            trailing: Text(formatDuration(h.net), style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          ),
        ));
      }
    } else {
      final h = monthHours(st, st.me.id, _month, rule);
      children.addAll([
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('ARBEITSZEIT', style: t.labelMedium?.copyWith(letterSpacing: 0.6, fontWeight: FontWeight.w700, color: cs.outline)),
              const SizedBox(height: 4),
              Text(formatDuration(h.net), style: t.displaySmall?.copyWith(fontWeight: FontWeight.w800, color: cs.primary)),
              const SizedBox(height: 8),
              Text('${h.shifts} Dienste · ${formatDuration(h.gross)} Anwesenheit · ${formatDuration(h.pause)} Pause'),
              if (h.offDays.isNotEmpty) Text(h.offDays.entries.map((x) => '${x.value}× ${x.key}').join(' · '), style: TextStyle(color: cs.outline)),
              const SizedBox(height: 6),
              Text('Pause: ${rule.describe()} (änderbar unter Konto)', style: t.bodySmall?.copyWith(color: cs.outline)),
            ]),
          ),
        ),
        const SectionTitle('Dienste im Monat'),
        if (h.entries.isEmpty) const EmptyHint('Keine Dienste mit Arbeitszeit in diesem Monat.', icon: Icons.event_available),
        for (final e in h.entries)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              SizedBox(width: 74, child: Text(mediumDate(e.day), style: const TextStyle(fontWeight: FontWeight.w600))),
              Expanded(child: ShiftPill(shift: e.shift, dense: true)),
              SizedBox(width: 78, child: Text(formatDuration(e.net), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w600))),
            ]),
          ),
      ]);
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Stunden')),
      body: RefreshIndicator(
        onRefresh: m.refresh,
        child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(16, 0, 16, 24), children: children),
      ),
    );
  }
}
