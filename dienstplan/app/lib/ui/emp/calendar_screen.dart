import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_model.dart';
import '../../core/dates.dart';
import '../../core/models.dart';
import '../day_details.dart';
import '../team_groups.dart';
import '../theme.dart';
import '../widgets.dart';

/// Monatskalender mit farbigen Markierungen des eigenen Dienstes. Wischen wechselt den Monat.
class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  static const _origin = 600; // Seite für den aktuellen Monat
  final _pc = PageController(initialPage: _origin);
  int _page = _origin;

  DateTime _monthOf(int page) => addMonths(firstOfMonth(DateTime.now()), page - _origin);

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  void _go(int delta) => _pc.animateToPage(_page + delta, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final st = m.state;
    if (st == null) return const SizedBox.shrink();
    final month = _monthOf(_page);
    return Scaffold(
      appBar: AppBar(
        title: Text(monthTitle(month)),
        actions: [
          IconButton(tooltip: 'Vorheriger Monat', onPressed: () => _go(-1), icon: const Icon(Icons.chevron_left)),
          TextButton(onPressed: () => _pc.animateToPage(_origin, duration: const Duration(milliseconds: 250), curve: Curves.easeOut), child: const Text('Heute')),
          IconButton(tooltip: 'Nächster Monat', onPressed: () => _go(1), icon: const Icon(Icons.chevron_right)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: m.refresh,
        child: Column(children: [
          const SyncBanner(),
          Expanded(
            child: PageView.builder(
              controller: _pc,
              onPageChanged: (p) => setState(() => _page = p),
              itemBuilder: (c, p) => _MonthView(state: st, month: _monthOf(p)),
            ),
          ),
        ]),
      ),
    );
  }
}

class _MonthView extends StatelessWidget {
  final DienstState state;
  final DateTime month;
  const _MonthView({required this.state, required this.month});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final days = monthGrid(month);
    final today = dayKey(DateTime.now());
    final used = <String>{};
    for (final d in days) {
      final c = state.cell(state.me.id, dayKey(d));
      if (c != null) used.add(c.t);
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
      children: [
        Row(children: [
          for (final w in weekdayShort)
            Expanded(child: Center(child: Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text(w, style: TextStyle(color: cs.outline, fontWeight: FontWeight.w600))))),
        ]),
        GridView.count(
          crossAxisCount: 7,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 0.72,
          children: [
            for (final d in days)
              _DayCell(
                day: d,
                inMonth: d.month == month.month,
                today: dayKey(d) == today,
                shift: state.shiftOf(state.me.id, dayKey(d)),
                onTap: () => showDayDetails(context, state, d),
              ),
          ],
        ),
        Legend(state.templates.where((t) => used.contains(t.id)).toList()),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  final DateTime day;
  final bool inMonth;
  final bool today;
  final Shift? shift;
  final VoidCallback onTap;

  const _DayCell({required this.day, required this.inMonth, required this.today, required this.shift, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final sh = shift;
    return Opacity(
      opacity: inMonth ? 1 : 0.4,
      child: Padding(
        padding: const EdgeInsets.all(2),
        child: Material(
          color: sh == null ? cs.surfaceContainerLow : tint(context, sh.colorValue, 0.25, 0.35),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: today ? BorderSide(color: cs.primary, width: 2) : BorderSide.none,
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 4, 4),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Text('${day.day}', style: TextStyle(fontWeight: today ? FontWeight.w800 : FontWeight.w600, color: today ? cs.primary : null)),
                  const Spacer(),
                  if (sh?.note != null) Icon(Icons.sticky_note_2, size: 11, color: cs.primary),
                ]),
                const Spacer(),
                if (sh != null) ...[
                  Container(height: 4, decoration: BoxDecoration(color: sh.colorValue, borderRadius: BorderRadius.circular(2))),
                  const SizedBox(height: 2),
                  Text(sh.name, maxLines: 1, overflow: TextOverflow.clip, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
                  if (sh.hasTimes) Text(sh.start, maxLines: 1, style: const TextStyle(fontSize: 10)),
                ],
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
