import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../main.dart';
import '../models.dart';
import '../notifications.dart';
import '../prep_engine.dart';
import '../widgets/prep_widgets.dart';
import '../store.dart';
import '../widgets/common.dart';
import '../widgets/event_tile.dart';
import 'event_editor.dart';

class EventDetail extends StatelessWidget {
  final String eventId;
  final DateTime? occurrenceStart;
  const EventDetail({super.key, required this.eventId, this.occurrenceStart});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final ev = store.events[eventId];
        if (ev == null || ev.deleted) {
          return Scaffold(appBar: AppBar(), body: const Center(child: Text('Dieser Termin wurde gelöscht.')));
        }
        Occurrence o = Occurrence(ev, ev.start, ev.end);
        if (occurrenceStart != null) {
          final list = AppStore.expand(ev, dateOnly(occurrenceStart!), dateOnly(occurrenceStart!).add(const Duration(days: 1)));
          final hit = list.where((x) => x.start == occurrenceStart).toList();
          if (hit.isNotEmpty) o = hit.first;
        }
        final colors = store.colorsFor(ev);
        final df = DateFormat('EEEE, d. MMMM yyyy', 'de_DE');
        final creator = store.member(ev.createdBy)?.name;
        final editor = store.member(ev.editedBy)?.name;
        return Scaffold(
          appBar: AppBar(
            actions: [
              IconButton(icon: const Icon(Icons.share), tooltip: 'Teilen', onPressed: () => _share(o)),
              IconButton(
                icon: const Icon(Icons.copy),
                tooltip: 'Duplizieren',
                onPressed: () {
                  final c = ev.copy()
                    ..id = newId()
                    ..createdBy = ''
                    ..photos = [...ev.photos];
                  Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => EventEditor(event: c)));
                },
              ),
              IconButton(icon: const Icon(Icons.delete_outline), tooltip: 'Löschen', onPressed: () => _delete(context, ev, o)),
            ],
          ),
          floatingActionButton: FloatingActionButton.extended(
            heroTag: 'edit',
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => EventEditor(event: ev))),
            icon: const Icon(Icons.edit),
            label: const Text('Bearbeiten'),
          ),
          body: ListView(padding: const EdgeInsets.only(bottom: 90), children: [
            Container(
              height: 10,
              decoration: ev.isVacation ? vacationDecoration(colors) : multiColorDecoration(colors, radius: 0),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 4),
              child: Text(store.displayTitle(o), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
            ),
            ListTile(
              leading: Icon(ev.isBirthday ? Icons.cake : Icons.schedule),
              title: Text(o.firstDay == o.lastDay || ev.isBirthday ? df.format(o.start) : '${df.format(o.firstDay)}\nbis ${df.format(o.lastDay)}'),
              subtitle: Text(ev.isBirthday
                  ? (ev.birthYear != null ? 'Geboren ${ev.birthYear} · wird ${o.start.year - ev.birthYear!}' : 'Jedes Jahr')
                  : timeText(o) + (ev.repeat != Repeat.none ? ' · ${repeatText(ev.repeat, ev.interval)}' : '')),
            ),
            if (ev.fromMail)
              ListTile(
                leading: const Text('📧', style: TextStyle(fontSize: 22)),
                title: const Text('Aus E-Mail eingetragen'),
                subtitle: Text(ev.mailSource ?? 'automatisch von Mailwerk'),
              ),
            if (!ev.isBirthday)
              ListTile(
                leading: const Icon(Icons.people_outline),
                title: ev.people.isEmpty
                    ? const Text('👪 Allgemein (für alle)')
                    : Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: ev.people.map((id) => store.member(id)).whereType<Member>().map((m) => Chip(
                              avatar: MemberAvatar(m, size: 22),
                              label: Text(m.name),
                              backgroundColor: m.c.withValues(alpha: 0.15),
                              side: BorderSide.none,
                            )).toList(),
                      ),
                subtitle: const Text('Antippen, um die Person zu ändern'),
                trailing: const Icon(Icons.swap_horiz),
                onTap: () => changePeople(context, ev),
              ),
            if (ev.location.isNotEmpty)
              ListTile(
                leading: const Icon(Icons.place_outlined),
                title: Text(ev.location),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  IconButton(icon: const Icon(Icons.map_outlined), tooltip: 'Karte', onPressed: () => openMap(ev.location)),
                  IconButton(icon: const Icon(Icons.directions_car_outlined), tooltip: 'Route', onPressed: () => openRoute(ev.location)),
                ]),
              ),
            if (ev.reminders.isNotEmpty)
              ListTile(
                leading: const Icon(Icons.notifications_outlined),
                title: Text((ev.reminders.toList()..sort())
                    .map((m) => ev.allDay ? (allDayReminderOptions[m] ?? reminderOptionLabel(m)) : reminderOptionLabel(m))
                    .join(', ')),
              ),
            if (ev.notes.isNotEmpty) ListTile(leading: const Icon(Icons.notes), title: SelectableText(ev.notes)),
            if (ev.checklist.isNotEmpty) ...[
              const Divider(),
              Padding(
                padding: const EdgeInsets.only(left: 20, top: 4),
                child: Text(ev.isBirthday ? 'Geschenkideen' : 'Checkliste', style: const TextStyle(fontWeight: FontWeight.bold)),
              ),
              ...ev.checklist.asMap().entries.map((e) {
                final done = e.value.startsWith('[x]');
                final text = e.value.length > 4 ? e.value.substring(4) : e.value;
                return CheckboxListTile(
                  controlAffinity: ListTileControlAffinity.leading,
                  value: done,
                  title: Text(text, style: TextStyle(decoration: done ? TextDecoration.lineThrough : null)),
                  onChanged: (v) {
                    final c = ev.copy();
                    c.checklist[e.key] = '${v == true ? '[x]' : '[ ]'} $text';
                    store.saveEvent(c);
                  },
                );
              }),
            ],
            if (ev.prep.isNotEmpty) ...[
              const Divider(),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 12, 8),
                child: PrepList(ev: ev, occStart: o.start, onChanged: (c) => store.saveEvent(c)),
              ),
            ] else if (hasPrepSuggestions(ev))
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Card(
                  color: const Color(0xFFFFF8E1),
                  child: ListTile(
                    leading: const Icon(Icons.auto_awesome, color: Colors.orange),
                    title: const Text('Intelligente Checkliste'),
                    subtitle: const Text('Passende Punkte vorschlagen und rechtzeitig erinnern'),
                    trailing: FilledButton(
                      onPressed: () async {
                        final c = ev.copy();
                        if (await runPrepWizard(context, c)) await store.saveEvent(c);
                      },
                      child: const Text('Los'),
                    ),
                  ),
                ),
              ),
            if (ev.photos.isNotEmpty) ...[
              const Divider(),
              Padding(
                padding: const EdgeInsets.all(12),
                child: GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 6,
                  crossAxisSpacing: 6,
                  children: ev.photos
                      .map((p) => GestureDetector(
                            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => _PhotoView(ev.photos, ev.photos.indexOf(p)))),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.network(store.api.photoUrl(p), fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(color: Colors.grey.shade300, child: const Icon(Icons.broken_image))),
                            ),
                          ))
                      .toList(),
                ),
              ),
            ],
            const Divider(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
              child: Text(
                [
                  if (creator != null) 'Eingetragen von $creator',
                  if (editor != null && editor != creator) 'zuletzt geändert von $editor',
                  if (ev.updatedAt > 0) DateFormat('d.M.yyyy HH:mm').format(DateTime.fromMillisecondsSinceEpoch(ev.updatedAt)),
                ].join(' · '),
                style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
              ),
            ),
          ]),
        );
      },
    );
  }

  void _share(Occurrence o) {
    final ev = o.ev;
    final df = DateFormat('EEEE, d. MMMM yyyy', 'de_DE');
    final lines = <String>[
      store.displayTitle(o),
      ev.allDay || ev.isBirthday
          ? (o.firstDay == o.lastDay ? df.format(o.start) : '${df.format(o.firstDay)} – ${df.format(o.lastDay)}')
          : '${df.format(o.start)}, ${hhmm(o.start)} – ${hhmm(o.end)} Uhr',
      if (ev.location.isNotEmpty) '📍 ${ev.location}',
      if (ev.notes.isNotEmpty) ev.notes,
    ];
    SharePlus.instance.share(ShareParams(text: lines.join('\n')));
  }

  Future<void> _delete(BuildContext context, CalEvent ev, Occurrence o) async {
    if (ev.repeat != Repeat.none && !ev.isBirthday) {
      final which = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Serie löschen?'),
          content: Text('„${ev.title}“ wiederholt sich. Was soll weg?'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Abbrechen')),
            TextButton(onPressed: () => Navigator.pop(ctx, 'one'), child: Text('Nur am ${DateFormat('d.M.', 'de_DE').format(o.start)}')),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.red), onPressed: () => Navigator.pop(ctx, 'all'), child: const Text('Ganze Serie')),
          ],
        ),
      );
      if (which == 'one') {
        await store.saveEvent(ev.copy()..exdates = [...ev.exdates, dayKey(o.start)]);
        if (context.mounted) Navigator.pop(context);
      } else if (which == 'all') {
        await store.deleteEvent(ev.copy());
        if (context.mounted) Navigator.pop(context);
      }
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Löschen?'),
        content: Text(ev.repeat != Repeat.none || ev.isBirthday
            ? '„${ev.title}“ wird mit allen Wiederholungen für alle gelöscht.'
            : '„${ev.title}“ wird für alle gelöscht.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Abbrechen')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: Colors.red), onPressed: () => Navigator.pop(ctx, true), child: const Text('Löschen')),
        ],
      ),
    );
    if (ok == true) {
      await store.deleteEvent(ev.copy());
      if (context.mounted) Navigator.pop(context);
    }
  }
}

/// Für wen ist der Termin? Direkt ändern, ohne den ganzen Editor
Future<void> changePeople(BuildContext context, CalEvent ev) async {
  final sel = ev.people.toSet();
  final ok = await showModalBottomSheet<bool>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setS) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Für wen ist „${ev.title}“?', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 6, children: [
              ChoiceChip(avatar: const Text('👪'), label: const Text('Allgemein'), selected: sel.isEmpty, onSelected: (_) => setS(sel.clear)),
              ...store.activeMembers.map((m) => FilterChip(
                    avatar: MemberAvatar(m, size: 24),
                    label: Text(m.name),
                    selected: sel.contains(m.id),
                    selectedColor: m.c.withValues(alpha: 0.35),
                    onSelected: (v) => setS(() => v ? sel.add(m.id) : sel.remove(m.id)),
                  )),
            ]),
            const SizedBox(height: 14),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Übernehmen')),
          ]),
        ),
      ),
    ),
  );
  if (ok != true) return;
  final list = sel.toList();
  final c = ev.copy()
    ..ownerId = list.isEmpty ? '' : list.first
    ..participants = list.skip(1).toList();
  await store.saveEvent(c);
}

class _PhotoView extends StatelessWidget {
  final List<String> photos;
  final int index;
  const _PhotoView(this.photos, this.index);
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(backgroundColor: Colors.black),
        body: PageView(
          controller: PageController(initialPage: index),
          children: photos
              .map((p) => InteractiveViewer(child: Center(child: Image.network(store.api.photoUrl(p), fit: BoxFit.contain))))
              .toList(),
        ),
      );
}
