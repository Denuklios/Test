import 'package:flutter/material.dart';

import '../core/dates.dart';
import '../core/models.dart';
import 'theme.dart';
import 'widgets.dart';

/// Mitarbeiter eines Tages nach Dienst gruppiert (Früh, Spät, Frei …), eigener Name hervorgehoben.
class DayGroups extends StatelessWidget {
  final DienstState state;
  final String dayKey;
  const DayGroups({super.key, required this.state, required this.dayKey});

  @override
  Widget build(BuildContext context) {
    final list = state.visibleEmps;
    if (list.isEmpty) return const EmptyHint('Noch keine Mitarbeiter mit Namen.');
    final groups = <String, List<(Employee, Shift?)>>{};
    for (final e in list) {
      final c = state.cell(e.id, dayKey);
      var id = '-';
      if (c != null) id = state.template(c.t) != null ? c.t : 'x';
      (groups[id] ??= []).add((e, state.shiftOf(e.id, dayKey)));
    }
    final out = <Widget>[];
    for (final t in state.templates) {
      final g = groups[t.id];
      if (g != null) out.add(_Group(title: t.name, sub: t.allDay ? '' : '${t.start}–${t.end}', color: t.colorValue, items: g, meId: state.me.id));
    }
    if (groups['x'] != null) out.add(_Group(title: 'Individuell', sub: '', color: const Color(0xff64748b), items: groups['x']!, meId: state.me.id));
    if (groups['-'] != null) out.add(_Group(title: 'Nicht eingetragen', sub: '', color: null, items: groups['-']!, meId: state.me.id));
    return Column(children: out);
  }
}

class _Group extends StatelessWidget {
  final String title;
  final String sub;
  final Color? color;
  final List<(Employee, Shift?)> items;
  final String meId;

  const _Group({required this.title, required this.sub, required this.color, required this.items, required this.meId});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: color == null ? cs.surfaceContainerHighest.withValues(alpha: 0.5) : cs.surfaceContainerLow,
        borderRadius: BorderRadius.circular(16),
        border: Border(left: BorderSide(color: color ?? cs.outlineVariant, width: 6)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text(title, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          if (sub.isNotEmpty) ...[const SizedBox(width: 8), Text(sub, style: t.bodyMedium?.copyWith(color: cs.outline))],
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 1),
            decoration: BoxDecoration(color: color != null ? tint(context, color!, 0.25, 0.35) : cs.surface, borderRadius: BorderRadius.circular(99)),
            child: Text('${items.length}', style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
        ]),
        const SizedBox(height: 8),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final (e, sh) in items)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: e.id == meId ? cs.primary : (color == null ? cs.surface : cs.surfaceContainerHighest),
                borderRadius: BorderRadius.circular(99),
              ),
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: e.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  if (sh != null && sh.custom && sh.hasTimes) TextSpan(text: '  ${sh.start}–${sh.end}', style: const TextStyle(fontSize: 12)),
                  if (sh?.note != null) TextSpan(text: '  📝 ${sh!.note}', style: const TextStyle(fontSize: 12)),
                ]),
                style: TextStyle(color: e.id == meId ? cs.onPrimary : cs.onSurface),
              ),
            ),
        ]),
      ]),
    );
  }
}

/// Kompakte Wochenmatrix aller Mitarbeiter, passt ohne Seitwärts-Scrollen auf das Handy.
class WeekMatrix extends StatelessWidget {
  final DienstState state;
  final DateTime monday;
  final bool editable;
  final Set<String> selected; // "dayKey|empId"
  final void Function(String dayKey, Employee e)? onCell;
  final void Function(String dayKey)? onDay;
  final void Function(Employee e)? onEmp;
  final List<Employee>? emps;

  const WeekMatrix({
    super.key,
    required this.state,
    required this.monday,
    this.editable = false,
    this.selected = const {},
    this.onCell,
    this.onDay,
    this.onEmp,
    this.emps,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final list = emps ?? state.visibleEmps;
    if (list.isEmpty) return const EmptyHint('Noch keine Mitarbeiter mit Namen. Im Bereich „Team“ Namen eintragen.');
    final days = [for (var i = 0; i < 7; i++) addDays(monday, i)];
    final today = dayKey(DateTime.now());
    return LayoutBuilder(builder: (context, c) {
      final nameW = c.maxWidth < 420 ? 66.0 : 120.0;
      return Column(children: [
        Row(children: [
          SizedBox(width: nameW),
          for (var i = 0; i < 7; i++)
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: onDay == null ? null : () => onDay!(dayKey(days[i])),
                child: Container(
                  margin: const EdgeInsets.all(1.5),
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  decoration: BoxDecoration(
                    color: dayKey(days[i]) == today ? cs.primary : cs.surfaceContainerHighest.withValues(alpha: 0.6),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(children: [
                    Text(weekdayShort[i],
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: dayKey(days[i]) == today ? cs.onPrimary : null)),
                    Text('${days[i].day}', style: TextStyle(fontSize: 11, color: dayKey(days[i]) == today ? cs.onPrimary : cs.outline)),
                  ]),
                ),
              ),
            ),
        ]),
        for (final e in list)
          Row(children: [
            SizedBox(
              width: nameW,
              child: InkWell(
                onTap: onEmp == null ? null : () => onEmp!(e),
                child: Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Text(e.name,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: e.id == state.me.id ? FontWeight.w800 : FontWeight.w600,
                        color: e.id == state.me.id ? cs.primary : null,
                      )),
                ),
              ),
            ),
            for (final d in days)
              Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: onCell == null ? null : () => onCell!(dayKey(d), e),
                  child: MatrixCell(
                    shift: state.shiftOf(e.id, dayKey(d)),
                    selected: selected.contains('${dayKey(d)}|${e.id}'),
                    highlight: e.id == state.me.id,
                    emptyMark: editable ? '+' : '·',
                  ),
                ),
              ),
          ]),
        const SizedBox(height: 4),
        Row(children: [
          SizedBox(width: nameW, child: Text('Im Dienst', style: TextStyle(fontSize: 11, color: cs.outline))),
          for (final d in days)
            Expanded(
              child: Text(
                '${list.where((e) => state.shiftOf(e.id, dayKey(d))?.hasTimes ?? false).length}',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: cs.outline),
              ),
            ),
        ]),
      ]);
    });
  }
}

class Legend extends StatelessWidget {
  final List<ShiftTemplate> templates;
  const Legend(this.templates, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 12),
        child: Wrap(spacing: 14, runSpacing: 6, children: [
          for (final t in templates)
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 10, height: 10, decoration: BoxDecoration(color: t.colorValue, borderRadius: BorderRadius.circular(3))),
              const SizedBox(width: 5),
              Text(t.allDay ? t.name : '${t.name} ${t.start}–${t.end}', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline)),
            ]),
        ]),
      );
}
