import 'package:flutter/material.dart';

import '../../core/dates.dart';
import '../../core/models.dart';
import '../theme.dart';
import '../widgets.dart';

/// Ergebnis der Auswahl: [cell] == null bedeutet „Eintrag leeren“.
class PickResult {
  final PlanCell? cell;
  const PickResult(this.cell);
}

/// Bottom-Sheet: Dienst per Tap wählen, optional Notiz und abweichende Zeit.
Future<PickResult?> pickShift(BuildContext context, DienstState st, {required String title, required String subtitle, PlanCell? current}) {
  return showModalBottomSheet<PickResult>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    builder: (c) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom),
      child: _PickerBody(st: st, title: title, subtitle: subtitle, current: current),
    ),
  );
}

class _PickerBody extends StatefulWidget {
  final DienstState st;
  final String title;
  final String subtitle;
  final PlanCell? current;
  const _PickerBody({required this.st, required this.title, required this.subtitle, this.current});

  @override
  State<_PickerBody> createState() => _PickerBodyState();
}

class _PickerBodyState extends State<_PickerBody> {
  late final TextEditingController _note;
  late int _start;
  late int _end;

  @override
  void initState() {
    super.initState();
    final c = widget.current;
    _note = TextEditingController(text: c?.n ?? '');
    final cur = c == null ? null : Shift.resolve(c, widget.st.template(c.t));
    ShiftTemplate? def;
    for (final t in widget.st.templates) {
      if (!t.allDay) {
        def = t;
        break;
      }
    }
    _start = parseHm(cur?.hasTimes == true ? cur!.start : (def?.start ?? '08:00')) ?? 480;
    _end = parseHm(cur?.hasTimes == true ? cur!.end : (def?.end ?? '16:30')) ?? 990;
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  String? get _n => _note.text.trim().isEmpty ? null : _note.text.trim();

  void _pick(ShiftTemplate t) => Navigator.pop(context, PickResult(PlanCell(t: t.id, n: _n)));

  void _custom() {
    // Abweichende Zeit hängt an der aktuellen Vorlage (falls mit Zeiten), sonst an der ersten mit Zeiten
    final cur = widget.current;
    ShiftTemplate? base = cur != null ? widget.st.template(cur.t) : null;
    if (base == null || base.allDay) {
      base = null;
      for (final t in widget.st.templates) {
        if (!t.allDay) {
          base = t;
          break;
        }
      }
    }
    Navigator.pop(context, PickResult(PlanCell(t: base?.id ?? '', s: formatHm(_start), e: formatHm(_end), n: _n)));
  }

  Future<void> _time(bool start) async {
    final v = start ? _start : _end;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: v ~/ 60, minute: v % 60),
      helpText: start ? 'Beginn' : 'Ende',
    );
    if (t != null) setState(() => start ? _start = t.hour * 60 + t.minute : _end = t.hour * 60 + t.minute);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final cur = widget.current;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        Text(widget.subtitle, style: TextStyle(color: cs.outline)),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 2.6,
          children: [
            for (final t in widget.st.templates)
              Material(
                color: tint(context, t.colorValue, 0.22, 0.32),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: cur != null && cur.t == t.id && !cur.custom ? BorderSide(color: cs.primary, width: 2.5) : BorderSide.none,
                ),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => _pick(t),
                  child: Container(
                    decoration: BoxDecoration(border: Border(left: BorderSide(color: t.colorValue, width: 6))),
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                      Text(t.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16), overflow: TextOverflow.ellipsis),
                      Text(t.allDay ? 'ganztägig' : '${t.start}–${t.end}', style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
                    ]),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _note,
          maxLength: 80,
          decoration: const InputDecoration(labelText: 'Notiz (optional)', hintText: 'z. B. Inventur', prefixIcon: Icon(Icons.sticky_note_2_outlined)),
        ),
        const SectionTitle('Abweichende Zeit'),
        Row(children: [
          Expanded(child: OutlinedButton(onPressed: () => _time(true), child: Text('Beginn ${formatHm(_start)}'))),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('bis')),
          Expanded(child: OutlinedButton(onPressed: () => _time(false), child: Text('Ende ${formatHm(_end)}'))),
        ]),
        const SizedBox(height: 8),
        FilledButton.tonal(onPressed: _custom, child: const Text('Zeit übernehmen')),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: cs.error),
              onPressed: () => Navigator.pop(context, const PickResult(null)),
              icon: const Icon(Icons.delete_outline),
              label: const Text('Leeren'),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Schließen'))),
        ]),
      ]),
    );
  }
}
