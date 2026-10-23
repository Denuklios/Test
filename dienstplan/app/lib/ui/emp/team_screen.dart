import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_model.dart';
import '../../core/dates.dart';
import '../team_groups.dart';
import '../widgets.dart';

/// Team-Ansicht: Tag (nach Dienst gruppiert) oder Woche (kompakte Matrix).
class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  DateTime _monday = mondayOf(DateTime.now());
  String _day = dayKey(DateTime.now());
  bool _week = false;

  void _shiftWeek(int n) => setState(() {
        if (n == 0) {
          _monday = mondayOf(DateTime.now());
          _day = dayKey(DateTime.now());
        } else {
          _monday = addDays(_monday, 7 * n);
          _day = dayKey(_monday);
        }
      });

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final st = m.state;
    if (st == null) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    final days = [for (var i = 0; i < 7; i++) addDays(_monday, i)];
    final today = dayKey(DateTime.now());
    final sel = parseDayKey(_day);
    final working = st.visibleEmps.where((e) => st.shiftOf(e.id, _day)?.hasTimes ?? false).length;

    return Scaffold(
      appBar: AppBar(title: const Text('Team')),
      body: RefreshIndicator(
        onRefresh: m.refresh,
        child: GestureDetector(
          // Wischen wechselt die Woche
          onHorizontalDragEnd: (d) {
            final v = d.primaryVelocity ?? 0;
            if (v.abs() > 300) _shiftWeek(v < 0 ? 1 : -1);
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              const SyncBanner(),
              Row(children: [
                IconButton.filledTonal(onPressed: () => _shiftWeek(-1), icon: const Icon(Icons.chevron_left), tooltip: 'Vorherige Woche'),
                Expanded(
                  child: Column(children: [
                    Text('KW ${isoWeek(_monday)}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    Text('${shortDate(_monday)} – ${shortDate(days.last)}${days.last.year}', style: TextStyle(color: cs.outline, fontSize: 12)),
                  ]),
                ),
                TextButton(onPressed: () => _shiftWeek(0), child: const Text('Heute')),
                IconButton.filledTonal(onPressed: () => _shiftWeek(1), icon: const Icon(Icons.chevron_right), tooltip: 'Nächste Woche'),
              ]),
              const SizedBox(height: 8),
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('Tag'), icon: Icon(Icons.view_agenda_outlined)),
                  ButtonSegment(value: true, label: Text('Woche'), icon: Icon(Icons.grid_view)),
                ],
                selected: {_week},
                onSelectionChanged: (s) => setState(() => _week = s.first),
              ),
              const SizedBox(height: 12),
              if (_week) ...[
                WeekMatrix(
                  state: st,
                  monday: _monday,
                  onDay: (k) => setState(() {
                    _day = k;
                    _week = false;
                  }),
                ),
                Legend(st.templates),
              ] else ...[
                Row(children: [
                  for (final d in days)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
                        child: _DayChip(day: d, selected: dayKey(d) == _day, today: dayKey(d) == today, onTap: () => setState(() => _day = dayKey(d))),
                      ),
                    ),
                ]),
                const SizedBox(height: 12),
                Text('${longDate(sel)} · $working im Dienst', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                DayGroups(state: st, dayKey: _day),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DayChip extends StatelessWidget {
  final DateTime day;
  final bool selected;
  final bool today;
  final VoidCallback onTap;
  const _DayChip({required this.day, required this.selected, required this.today, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: selected ? cs.primary : cs.surfaceContainerLow,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: today && !selected ? BorderSide(color: cs.primary, width: 2) : BorderSide.none,
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(children: [
            Text(weekdayShort[day.weekday - 1], style: TextStyle(fontSize: 12, color: selected ? cs.onPrimary : cs.outline)),
            Text('${day.day}', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: selected ? cs.onPrimary : null)),
          ]),
        ),
      ),
    );
  }
}
