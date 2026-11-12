import 'package:flutter/material.dart';

import '../main.dart';
import '../models.dart';
import '../prep_engine.dart';
import '../store.dart';

/// Fragt kurz nach (vorausgefüllt) und erzeugt die Vorbereitungsliste.
/// Gibt true zurück, wenn [ev] geändert wurde.
Future<bool> runPrepWizard(BuildContext context, CalEvent ev) async {
  final cats = detectCategories(ev);
  if (cats.isEmpty) {
    // Nichts erkannt: trotzdem Reise-Fragen anbieten? Nur bei Urlaub.
    return false;
  }
  final qs = questionsFor(cats);
  final answers = {...guessAnswers(ev, cats), ...ev.answers};
  if (qs.isNotEmpty) {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _Wizard(qs: qs, answers: answers, title: ev.title),
    );
    if (ok != true) return false;
  }
  ev.answers = answers;
  ev.prep = mergePrep(ev.prep, generatePrep(ev, answers, idGen: newId));
  return true;
}

class _Wizard extends StatefulWidget {
  final List<PrepQuestion> qs;
  final Map<String, String> answers;
  final String title;
  const _Wizard({required this.qs, required this.answers, required this.title});
  @override
  State<_Wizard> createState() => _WizardState();
}

class _WizardState extends State<_Wizard> {
  Set<String> _vals(String k) => (widget.answers[k] ?? '').split(',').where((e) => e.isNotEmpty).toSet();

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (ctx, sc) => ListView(controller: sc, padding: const EdgeInsets.fromLTRB(20, 0, 20, 30), children: [
        Text('✨ Vorbereitung für „${widget.title}“', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text('Ich habe schon geraten – bitte kurz prüfen:', style: TextStyle(color: Colors.grey.shade700)),
        const SizedBox(height: 12),
        ...widget.qs.map((q) => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(q.label, style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: q.options.map((o) {
                    final sel = _vals(q.key).contains(o.$1);
                    return ChoiceChip(
                      label: Text(o.$2),
                      selected: sel,
                      onSelected: (v) => setState(() {
                        if (q.multi) {
                          final s = _vals(q.key);
                          v ? s.add(o.$1) : s.remove(o.$1);
                          widget.answers[q.key] = s.join(',');
                        } else {
                          widget.answers[q.key] = o.$1;
                        }
                      }),
                    );
                  }).toList(),
                ),
              ]),
            )),
        const SizedBox(height: 8),
        FilledButton.icon(
          onPressed: () => Navigator.pop(context, true),
          icon: const Icon(Icons.auto_awesome),
          label: const Text('Checkliste erstellen'),
        ),
      ]),
    );
  }
}

/// Gruppierte Vorbereitungsliste mit Fortschritt
class PrepList extends StatelessWidget {
  final CalEvent ev;
  final DateTime occStart;
  final bool editable;
  final void Function(CalEvent changed) onChanged;
  const PrepList({super.key, required this.ev, required this.occStart, required this.onChanged, this.editable = false});

  @override
  Widget build(BuildContext context) {
    final items = ev.prep;
    final done = items.where((p) => p.doneFor(occStart)).length;
    final groups = <String, List<PrepItem>>{};
    for (final p in items) {
      groups.putIfAbsent(p.group, () => []).add(p);
    }
    final order = [...G.order.where(groups.containsKey), ...groups.keys.where((g) => !G.order.contains(g))];
    final today = dateOnly(DateTime.now());
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        Text('✨ Vorbereitung', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const Spacer(),
        Text('$done / ${items.length} erledigt', style: TextStyle(color: Colors.grey.shade700)),
      ]),
      const SizedBox(height: 6),
      ClipRRect(
        borderRadius: BorderRadius.circular(4),
        child: LinearProgressIndicator(value: items.isEmpty ? 0 : done / items.length, minHeight: 8, backgroundColor: Colors.grey.shade200),
      ),
      for (final g in order) ...[
        Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 2),
          child: Text(g, style: TextStyle(fontWeight: FontWeight.w700, color: Colors.grey.shade800)),
        ),
        for (final p in (groups[g]!..sort((a, b) => b.days.compareTo(a.days))))
          Builder(builder: (context) {
            final isDone = p.doneFor(occStart);
            final due = p.dueDate(occStart);
            final overdue = !isDone && due.isBefore(today);
            final dueToday = !isDone && due == today;
            return InkWell(
              onTap: () {
                final c = ev.copy();
                final x = c.prep.firstWhere((e) => e.id == p.id);
                x.done = isDone ? '' : dayKey(occStart);
                x.doneBy = store.myId;
                onChanged(c);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(children: [
                  Icon(isDone ? Icons.check_circle : Icons.radio_button_unchecked, color: isDone ? Colors.green : (overdue ? Colors.red : Colors.grey)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(p.text,
                        style: TextStyle(
                          decoration: isDone ? TextDecoration.lineThrough : null,
                          color: isDone ? Colors.grey : Colors.black87,
                          fontWeight: dueToday || overdue ? FontWeight.w600 : null,
                        )),
                  ),
                  if (!isDone)
                    Text(
                      dueLabel(p, occStart),
                      style: TextStyle(fontSize: 11, color: overdue ? Colors.red : (dueToday ? Colors.orange.shade800 : Colors.grey.shade600)),
                    ),
                  if (isDone && p.doneBy.isNotEmpty && p.doneBy != store.myId)
                    Text(store.member(p.doneBy)?.name ?? '', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                  if (editable)
                    IconButton(
                      visualDensity: VisualDensity.compact,
                      icon: const Icon(Icons.close, size: 18),
                      onPressed: () {
                        final c = ev.copy()..prep.removeWhere((e) => e.id == p.id);
                        onChanged(c);
                      },
                    ),
                ]),
              ),
            );
          }),
      ],
      if (editable) _AddOwn(ev: ev, onChanged: onChanged),
    ]);
  }
}

class _AddOwn extends StatefulWidget {
  final CalEvent ev;
  final void Function(CalEvent) onChanged;
  const _AddOwn({required this.ev, required this.onChanged});
  @override
  State<_AddOwn> createState() => _AddOwnState();
}

class _AddOwnState extends State<_AddOwn> {
  final _c = TextEditingController();
  int _days = 1;

  void _add() {
    final t = _c.text.trim();
    if (t.isEmpty) return;
    final c = widget.ev.copy()..prep.add(PrepItem(id: newId(), text: t, group: G.own, days: _days));
    _c.clear();
    widget.onChanged(c);
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      TextField(
        controller: _c,
        decoration: const InputDecoration(hintText: 'Eigenen Punkt hinzufügen …'),
        onSubmitted: (_) => _add(),
      ),
      Row(children: [
        const Text('Fällig: '),
        Expanded(
          child: DropdownButton<int>(
            value: _days,
            isExpanded: true,
            items: const [0, 1, 2, 3, 7, 14].map((d) => DropdownMenuItem(value: d, child: Text(daysBeforeLabel(d)))).toList(),
            onChanged: (v) => setState(() => _days = v ?? 1),
          ),
        ),
        IconButton(icon: const Icon(Icons.add_circle), onPressed: _add),
      ]),
    ]);
  }
}

/// Termine in Kürze mit offenen Vorbereitungen (für mich)
class PrepDue {
  final Occurrence o;
  final List<PrepItem> open;
  final List<PrepItem> due; // heute fällig oder überfällig
  PrepDue(this.o, this.open, this.due);
}

List<PrepDue> upcomingPrep(AppStore s, {int days = 30}) {
  final today = dateOnly(DateTime.now());
  final res = <PrepDue>[];
  final seen = <String>{};
  for (final o in s.occurrences(today, today.add(Duration(days: days)), onlyVisible: false)) {
    final ev = o.ev;
    if (ev.prep.isEmpty || seen.contains(ev.id)) continue;
    if (!ev.isBirthday && !ev.people.contains(s.myId)) continue;
    if (o.start.isBefore(DateTime.now()) && !ev.allDay) continue;
    seen.add(ev.id);
    final open = ev.prep.where((p) => !p.doneFor(o.start)).toList();
    if (open.isEmpty) continue;
    final due = open.where((p) => !p.dueDate(o.start).isAfter(today)).toList();
    res.add(PrepDue(o, open, due));
  }
  return res;
}

String untilText(DateTime start) {
  final d = dateOnly(start).difference(dateOnly(DateTime.now())).inHours ~/ 24;
  if (d <= 0) return 'heute';
  if (d == 1) return 'morgen';
  return 'in $d Tagen';
}

/// Banner oben auf dem Startbildschirm
class PrepBanner extends StatelessWidget {
  final void Function(Occurrence) onOpen;
  const PrepBanner({super.key, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final list = upcomingPrep(store).where((p) => p.due.isNotEmpty).take(2).toList();
        if (list.isEmpty) return const SizedBox.shrink();
        return Column(
          children: list
              .map((p) => Material(
                    color: const Color(0xFFFFF3E0),
                    child: InkWell(
                      onTap: () => onOpen(p.o),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        child: Row(children: [
                          const Text('🧳', style: TextStyle(fontSize: 22)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('${store.displayTitle(p.o)} – ${untilText(p.o.start)}',
                                  style: const TextStyle(fontWeight: FontWeight.bold), maxLines: 1, overflow: TextOverflow.ellipsis),
                              Text('Nicht vergessen: ${p.due.take(3).map((e) => e.text).join(', ')}${p.due.length > 3 ? ' +${p.due.length - 3}' : ''}',
                                  style: TextStyle(fontSize: 12, color: Colors.grey.shade800), maxLines: 2, overflow: TextOverflow.ellipsis),
                            ]),
                          ),
                          const Icon(Icons.chevron_right),
                        ]),
                      ),
                    ),
                  ))
              .toList(),
        );
      },
    );
  }
}
