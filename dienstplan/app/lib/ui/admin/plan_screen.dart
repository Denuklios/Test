import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_model.dart';
import '../../core/dates.dart';
import '../../core/models.dart';
import '../team_groups.dart';
import '../widgets.dart';
import 'shift_picker.dart';

/// Admin: Planen in Wochen- oder Tagesansicht, Mehrfachauswahl, Vorwoche übernehmen.
class AdminPlanScreen extends StatefulWidget {
  const AdminPlanScreen({super.key});

  @override
  State<AdminPlanScreen> createState() => _AdminPlanScreenState();
}

class _AdminPlanScreenState extends State<AdminPlanScreen> {
  DateTime _monday = mondayOf(DateTime.now());
  String _day = dayKey(DateTime.now());
  bool _week = true;
  bool _multi = false;
  final Set<String> _sel = {}; // "dayKey|empId"

  void _shiftWeek(int n) => setState(() {
        if (n == 0) {
          _monday = mondayOf(DateTime.now());
          _day = dayKey(DateTime.now());
        } else {
          _monday = addDays(_monday, 7 * n);
          _day = dayKey(_monday);
        }
        _sel.clear();
      });

  Future<void> _apply(Changes ch, String okText) async {
    final m = context.read<AppModel>();
    final err = await m.setCells(ch);
    if (!mounted) return;
    showMessage(context, err ?? okText, error: err != null);
  }

  Future<void> _editOne(DienstState st, String day, Employee e) async {
    if (_multi) {
      setState(() {
        final k = '$day|${e.id}';
        _sel.contains(k) ? _sel.remove(k) : _sel.add(k);
      });
      return;
    }
    final r = await pickShift(context, st, title: e.name, subtitle: longDate(parseDayKey(day)), current: st.cell(e.id, day));
    if (r == null) return;
    await _apply({day: {e.id: r.cell}}, 'Gespeichert ✓');
  }

  Future<void> _editSelection(DienstState st) async {
    if (_sel.isEmpty) return;
    final r = await pickShift(context, st, title: '${_sel.length} Einträge', subtitle: 'Gleicher Dienst für alle markierten Felder');
    if (r == null) return;
    final ch = <String, Map<String, PlanCell?>>{};
    for (final k in _sel) {
      final p = k.split('|');
      (ch[p[0]] ??= {})[p[1]] = r.cell;
    }
    await _apply(ch, '${_sel.length} Einträge gespeichert ✓');
    if (mounted) setState(() => _sel.clear());
  }

  void _toggleMany(Iterable<String> keys) => setState(() {
        final all = keys.every(_sel.contains);
        for (final k in keys) {
          all ? _sel.remove(k) : _sel.add(k);
        }
      });

  Future<void> _copyPrev(DienstState st) async {
    final ok = await confirm(
      context,
      'Vorwoche übernehmen?',
      'Alle Einträge der KW ${isoWeek(_monday)} werden mit der Vorwoche (KW ${isoWeek(addDays(_monday, -7))}) überschrieben.',
      ok: 'Überschreiben',
      danger: true,
    );
    if (!ok) return;
    final ch = <String, Map<String, PlanCell?>>{};
    for (var i = 0; i < 7; i++) {
      final src = dayKey(addDays(_monday, i - 7)), dst = dayKey(addDays(_monday, i));
      ch[dst] = {for (final e in st.emps) e.id: st.cell(e.id, src)};
    }
    await _apply(ch, 'Woche übernommen ✓');
  }

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final st = m.state;
    if (st == null) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    final days = [for (var i = 0; i < 7; i++) addDays(_monday, i)];
    final emps = st.visibleEmps;
    final today = dayKey(DateTime.now());

    final body = <Widget>[
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
      Row(children: [
        Expanded(
          child: SegmentedButton<bool>(
            segments: const [ButtonSegment(value: false, label: Text('Tag')), ButtonSegment(value: true, label: Text('Woche'))],
            selected: {_week},
            onSelectionChanged: (s) => setState(() => _week = s.first),
          ),
        ),
        const SizedBox(width: 8),
        FilterChip(
          label: const Text('Mehrfach'),
          avatar: const Icon(Icons.checklist, size: 18),
          selected: _multi,
          onSelected: (v) => setState(() {
            _multi = v;
            _sel.clear();
          }),
        ),
      ]),
      const SizedBox(height: 8),
      Text(
        _multi
            ? (_week ? 'Felder antippen zum Markieren. Tipp auf Wochentag oder Namen markiert die ganze Spalte bzw. Zeile.' : 'Mitarbeiter antippen zum Markieren.')
            : 'Tippe auf ein Feld, um den Dienst zu wählen. Änderungen sind sofort für alle sichtbar.',
        style: TextStyle(color: cs.outline, fontSize: 13),
      ),
      const SizedBox(height: 10),
    ];

    if (_week) {
      body.addAll([
        WeekMatrix(
          state: st,
          monday: _monday,
          editable: true,
          selected: _sel,
          emps: emps,
          onCell: (k, e) => _editOne(st, k, e),
          onDay: (k) {
            if (_multi) {
              _toggleMany([for (final e in emps) '$k|${e.id}']);
            } else {
              setState(() {
                _day = k;
                _week = false;
              });
            }
          },
          onEmp: _multi ? (e) => _toggleMany([for (final d in days) '${dayKey(d)}|${e.id}']) : null,
        ),
        Legend(st.templates),
      ]);
    } else {
      body.add(Row(children: [
        for (final d in days)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: ChoiceChip(
                showCheckmark: false,
                padding: EdgeInsets.zero,
                labelPadding: const EdgeInsets.symmetric(vertical: 4),
                side: dayKey(d) == today ? BorderSide(color: cs.primary, width: 2) : null,
                label: SizedBox(
                  width: double.infinity,
                  child: Column(children: [
                    Text(weekdayShort[d.weekday - 1], style: const TextStyle(fontSize: 12)),
                    Text('${d.day}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  ]),
                ),
                selected: dayKey(d) == _day,
                onSelected: (_) => setState(() => _day = dayKey(d)),
              ),
            ),
          ),
      ]));
      body.add(Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Text(longDate(parseDayKey(_day)), style: const TextStyle(fontWeight: FontWeight.w700)),
      ));
      if (emps.isEmpty) body.add(const EmptyHint('Noch keine Mitarbeiter mit Namen. Unter „Team“ Namen eintragen.'));
      for (final e in emps) {
        final k = '$_day|${e.id}';
        body.add(Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Material(
            color: _sel.contains(k) ? cs.primaryContainer : cs.surfaceContainerLow,
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => _editOne(st, _day, e),
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Row(children: [
                  if (_multi) Checkbox(value: _sel.contains(k), onChanged: (_) => _editOne(st, _day, e)),
                  SizedBox(width: 96, child: Text(e.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))),
                  Expanded(child: ShiftPill(shift: st.shiftOf(e.id, _day), dense: true, emptyText: '+ eintragen')),
                ]),
              ),
            ),
          ),
        ));
      }
    }

    body.addAll([
      const SizedBox(height: 16),
      OutlinedButton.icon(onPressed: () => _copyPrev(st), icon: const Icon(Icons.content_copy), label: const Text('Vorwoche übernehmen')),
    ]);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Planen'),
        actions: [
          if (m.syncing) const Padding(padding: EdgeInsets.all(16), child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: m.refresh,
        child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.fromLTRB(12, 0, 12, 100), children: body),
      ),
      bottomSheet: _multi && _sel.isNotEmpty
          ? SafeArea(
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                color: cs.surfaceContainerHigh,
                child: Row(children: [
                  Expanded(child: Text('${_sel.length} markiert', style: const TextStyle(fontWeight: FontWeight.w700))),
                  TextButton(onPressed: () => setState(_sel.clear), child: const Text('Aufheben')),
                  const SizedBox(width: 8),
                  FilledButton(onPressed: () => _editSelection(st), child: const Text('Dienst setzen')),
                ]),
              ),
            )
          : null,
    );
  }
}
