import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_model.dart';
import '../../core/dates.dart';
import '../../core/models.dart';
import '../../core/schedule.dart';
import '../day_details.dart';
import '../theme.dart';
import '../widgets.dart';

class TodayScreen extends StatefulWidget {
  const TodayScreen({super.key});

  @override
  State<TodayScreen> createState() => _TodayScreenState();
}

class _TodayScreenState extends State<TodayScreen> {
  Timer? _tick;
  int _days = 14;

  @override
  void initState() {
    super.initState();
    // Countdown jede Minute aktualisieren
    _tick = Timer.periodic(const Duration(seconds: 30), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final st = m.state;
    if (st == null) return const SizedBox.shrink();
    final now = DateTime.now();
    final today = dayKey(now);
    final cs = Theme.of(context).colorScheme;

    final todayShift = st.shiftOf(st.me.id, today);
    final running = currentShift(st, st.me.id, now);
    final next = nextShift(st, st.me.id, now);

    final rows = <Widget>[];
    int? lastWeek;
    for (var i = 0; i < _days; i++) {
      final d = addDays(dateOnly(now), i);
      final w = isoWeek(d);
      if (w != lastWeek) {
        rows.add(SectionTitle('KW $w'));
        lastWeek = w;
      }
      rows.add(_DayRow(day: d, shift: st.shiftOf(st.me.id, dayKey(d)), today: i == 0, onTap: () => showDayDetails(context, st, d)));
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('Hallo ${st.me.name}'),
        actions: [
          if (m.syncing) const Padding(padding: EdgeInsets.all(16), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: m.refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            const SyncBanner(),
            if (m.recentChanges.isNotEmpty) _ChangesCard(changes: m.recentChanges, onClose: m.dismissChanges),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _TodayCard(now: now, shift: todayShift, running: running?.dayKey == today ? running : null),
                const SizedBox(height: 12),
                _NextCard(now: now, next: next, running: running),
                ...rows,
                const SizedBox(height: 8),
                OutlinedButton(onPressed: () => setState(() => _days += 14), child: const Text('Weitere 14 Tage')),
                if (m.lastSync != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text('Stand: ${dateTimeStamp(m.lastSync!)}', textAlign: TextAlign.center, style: TextStyle(color: cs.outline, fontSize: 12)),
                  ),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

class _TodayCard extends StatelessWidget {
  final DateTime now;
  final Shift? shift;
  final DatedShift? running;
  const _TodayCard({required this.now, required this.shift, required this.running});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    final sh = shift;
    final color = sh?.colorValue ?? cs.outlineVariant;
    String? status;
    if (running != null) {
      final left = running!.interval!.$2.difference(now);
      status = 'Läuft gerade · noch ${countdown(left).replaceFirst('in ', '')}';
    } else if (sh != null && sh.hasTimes) {
      final iv = shiftInterval(dayKey(now), sh.start, sh.end)!;
      status = iv.$1.isAfter(now) ? 'Beginnt ${countdown(iv.$1.difference(now))}' : 'Vorbei';
    }
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: sh == null ? cs.surfaceContainerLow : tint(context, color, 0.22, 0.32),
        borderRadius: BorderRadius.circular(24),
        border: Border(left: BorderSide(color: color, width: 8)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('HEUTE · ${longDate(now).toUpperCase()}', style: t.labelMedium?.copyWith(letterSpacing: 0.6, fontWeight: FontWeight.w700, color: cs.onSurfaceVariant)),
        const SizedBox(height: 10),
        Text(sh?.name ?? 'Nichts eingetragen', style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
        if (sh != null && sh.hasTimes) Text('${sh.start} – ${sh.end} Uhr', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w600)),
        if (sh?.note != null) ...[
          const SizedBox(height: 8),
          Row(children: [const Icon(Icons.sticky_note_2_outlined, size: 18), const SizedBox(width: 6), Expanded(child: Text(sh!.note!, style: t.titleSmall))]),
        ],
        if (status != null) ...[
          const SizedBox(height: 8),
          Text(status, style: t.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
        ],
      ]),
    );
  }
}

class _NextCard extends StatelessWidget {
  final DateTime now;
  final DatedShift? next;
  final DatedShift? running;
  const _NextCard({required this.now, required this.next, required this.running});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    final n = next;
    if (n == null) {
      return Card(child: ListTile(leading: const Icon(Icons.event_busy), title: const Text('Kein weiterer Dienst eingetragen'), subtitle: Text('Die nächsten 4 Monate', style: TextStyle(color: cs.outline))));
    }
    final iv = n.interval!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(children: [
          Container(
            width: 6,
            height: 64,
            decoration: BoxDecoration(color: n.shift.colorValue, borderRadius: BorderRadius.circular(3)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('NÄCHSTER DIENST', style: t.labelMedium?.copyWith(letterSpacing: 0.6, fontWeight: FontWeight.w700, color: cs.outline)),
              const SizedBox(height: 4),
              Text('${relativeDay(n.day, now)} · ${n.shift.name}', style: t.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
              Text('${mediumDate(n.day)} · ${n.shift.start}–${n.shift.end} Uhr${n.shift.note != null ? ' · ${n.shift.note}' : ''}', style: t.bodyMedium),
            ]),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(color: cs.primaryContainer, borderRadius: BorderRadius.circular(14)),
            child: Text(countdown(iv.$1.difference(now)), textAlign: TextAlign.center, style: TextStyle(color: cs.onPrimaryContainer, fontWeight: FontWeight.w700)),
          ),
        ]),
      ),
    );
  }
}

class _DayRow extends StatelessWidget {
  final DateTime day;
  final Shift? shift;
  final bool today;
  final VoidCallback onTap;
  const _DayRow({required this.day, required this.shift, required this.today, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: cs.surfaceContainerLow,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: today ? BorderSide(color: cs.primary, width: 2) : BorderSide.none,
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(children: [
              SizedBox(
                width: 54,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(weekdayShort[day.weekday - 1], style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  Text(shortDate(day), style: TextStyle(color: cs.outline, fontSize: 12)),
                ]),
              ),
              Expanded(child: ShiftPill(shift: shift, dense: true)),
            ]),
          ),
        ),
      ),
    );
  }
}

class _ChangesCard extends StatelessWidget {
  final List<ShiftChange> changes;
  final VoidCallback onClose;
  const _ChangesCard({required this.changes, required this.onClose});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final (title, _) = changeMessage(changes);
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      decoration: BoxDecoration(color: cs.tertiaryContainer, borderRadius: BorderRadius.circular(18)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.notifications_active_outlined, color: cs.onTertiaryContainer),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: TextStyle(fontWeight: FontWeight.w700, color: cs.onTertiaryContainer)),
            const SizedBox(height: 4),
            for (final c in changes.take(6))
              Text('${mediumDate(c.day)}: ${c.afterText}', style: TextStyle(color: cs.onTertiaryContainer)),
            if (changes.length > 6) Text('… und ${changes.length - 6} weitere', style: TextStyle(color: cs.onTertiaryContainer)),
          ]),
        ),
        IconButton(onPressed: onClose, icon: const Icon(Icons.close), tooltip: 'Ausblenden', color: cs.onTertiaryContainer),
      ]),
    );
  }
}
