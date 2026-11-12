import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../main.dart';
import '../models.dart';
import '../notifications.dart';
import '../prep_engine.dart';
import '../widgets/prep_widgets.dart';
import '../store.dart';
import '../voice_parser.dart';
import '../widgets/common.dart';
import '../widgets/voice.dart';

class EventEditor extends StatefulWidget {
  final CalEvent? event;
  final DateTime? day;
  final VoiceResult? voice;
  final String? kind;
  const EventEditor({super.key, this.event, this.day, this.voice, this.kind});
  @override
  State<EventEditor> createState() => _EventEditorState();
}

class _EventEditorState extends State<EventEditor> {
  late CalEvent ev;
  late bool isNew;
  final _title = TextEditingController();
  final _location = TextEditingController();
  final _notes = TextEditingController();
  final _check = TextEditingController();
  late Set<String> _people;
  bool _yearKnown = true;
  int _uploading = 0;
  late bool _autoPrep = store.autoPrep;

  @override
  void initState() {
    super.initState();
    isNew = widget.event == null;
    if (!isNew) {
      ev = widget.event!.copy();
      _yearKnown = ev.birthYear != null;
    } else {
      final d = widget.day ?? DateTime.now();
      final now = DateTime.now();
      final h = (widget.day == null || dateOnly(d) == dateOnly(now)) ? (now.hour + 1).clamp(0, 23) : 9;
      final s = DateTime(d.year, d.month, d.day, h);
      ev = CalEvent(
        id: newId(),
        title: '',
        start: s,
        end: s.add(const Duration(hours: 1)),
        ownerId: store.myId,
        reminders: [...store.defaultReminders],
        kind: widget.kind ?? EventKind.normal,
      );
      if (ev.kind != EventKind.normal) _applyKind(ev.kind);
      if (widget.voice != null) _applyVoice(widget.voice!);
    }
    _title.text = ev.title;
    _location.text = ev.location;
    _notes.text = ev.notes;
    _people = ev.people.toSet();
  }

  void _applyKind(String k) {
    ev.kind = k;
    if (k == EventKind.birthday) {
      ev.allDay = true;
      ev.start = dateOnly(ev.start);
      ev.end = ev.start;
      ev.repeat = Repeat.yearly;
      ev.reminders = [];
    } else if (k == EventKind.vacation) {
      ev.allDay = true;
      ev.start = dateOnly(ev.start);
      if (ev.end.isBefore(ev.start)) ev.end = ev.start;
      ev.end = dateOnly(ev.end);
      ev.repeat = Repeat.none;
      ev.reminders = [];
      if (_title.text.isEmpty) _title.text = 'Urlaub';
    } else {
      if (ev.repeat == Repeat.yearly && ev.birthYear != null) ev.repeat = Repeat.none;
    }
  }

  void _applyVoice(VoiceResult r) {
    ev.title = r.title;
    _title.text = r.title;
    if (r.kind != EventKind.normal) _applyKind(r.kind);
    final d = r.date ?? dateOnly(ev.start);
    if (r.kind == EventKind.birthday) {
      ev.birthYear = r.birthYear;
      _yearKnown = r.birthYear != null;
      ev.start = DateTime(r.birthYear ?? d.year, d.month, d.day);
      ev.end = ev.start;
    } else if (r.allDay) {
      ev.allDay = true;
      ev.start = dateOnly(d);
      ev.end = dateOnly(r.endDate ?? d);
    } else {
      ev.allDay = false;
      ev.start = DateTime(d.year, d.month, d.day, r.startMinutes! ~/ 60, r.startMinutes! % 60);
      if (r.endMinutes != null) {
        final ed = r.endDate ?? d;
        ev.end = DateTime(ed.year, ed.month, ed.day, r.endMinutes! ~/ 60, r.endMinutes! % 60);
        if (!ev.end.isAfter(ev.start)) ev.end = ev.end.add(const Duration(days: 1));
      } else {
        ev.end = ev.start.add(const Duration(hours: 1));
      }
    }
    if (r.location.isNotEmpty) {
      ev.location = r.location;
      _location.text = r.location;
    }
    if (r.participants.isNotEmpty) {
      ev.participants = r.participants.where((p) => p != ev.ownerId).toList();
      _people = ev.people.toSet();
      if (r.kind == EventKind.vacation) {
        // "Urlaub Jeannine" -> Jeannine hat Urlaub
        _people = r.participants.toSet();
      }
    }
    if (r.reminder != null && !ev.reminders.contains(r.reminder)) ev.reminders.add(r.reminder!);
  }

  Future<void> _voiceFill() async {
    final text = await listenSpeech(context);
    if (text == null || !mounted) return;
    setState(() => _applyVoice(parseVoice(text, store.activeMembers)));
  }

  Future<DateTime?> _pickDate(DateTime initial) => showDatePicker(
        context: context,
        initialDate: initial,
        firstDate: DateTime(1900),
        lastDate: DateTime(2100),
        locale: const Locale('de', 'DE'),
      );

  Future<TimeOfDay?> _pickTime(DateTime initial) => showTimePicker(
        context: context,
        initialTime: TimeOfDay.fromDateTime(initial),
        builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(alwaysUse24HourFormat: true), child: child!),
      );

  Future<void> _editStart({bool time = false}) async {
    final dur = ev.end.difference(ev.start);
    if (time) {
      final t = await _pickTime(ev.start);
      if (t == null) return;
      ev.start = DateTime(ev.start.year, ev.start.month, ev.start.day, t.hour, t.minute);
    } else {
      final d = await _pickDate(ev.start);
      if (d == null) return;
      ev.start = DateTime(d.year, d.month, d.day, ev.start.hour, ev.start.minute);
    }
    ev.end = ev.start.add(dur);
    setState(() {});
  }

  Future<void> _editEnd({bool time = false}) async {
    if (time) {
      final t = await _pickTime(ev.end);
      if (t == null) return;
      ev.end = DateTime(ev.end.year, ev.end.month, ev.end.day, t.hour, t.minute);
    } else {
      final d = await _pickDate(ev.end.isBefore(ev.start) ? ev.start : ev.end);
      if (d == null) return;
      ev.end = DateTime(d.year, d.month, d.day, ev.end.hour, ev.end.minute);
    }
    if (ev.end.isBefore(ev.start)) {
      ev.end = ev.allDay ? dateOnly(ev.start) : ev.start.add(const Duration(hours: 1));
    }
    setState(() {});
  }

  Future<void> _addPhoto(ImageSource src) async {
    final picker = ImagePicker();
    List<XFile> files;
    if (src == ImageSource.gallery) {
      files = await picker.pickMultiImage(maxWidth: 1800, maxHeight: 1800, imageQuality: 80);
    } else {
      final f = await picker.pickImage(source: src, maxWidth: 1800, maxHeight: 1800, imageQuality: 80);
      files = f == null ? [] : [f];
    }
    for (final f in files) {
      setState(() => _uploading++);
      try {
        final name = await store.api.uploadPhoto(File(f.path));
        setState(() => ev.photos.add(name));
      } catch (e) {
        if (mounted) toast(context, 'Foto-Upload fehlgeschlagen: $e');
      } finally {
        if (mounted) setState(() => _uploading--);
      }
    }
  }

  CalEvent _current() => ev.copy()
    ..title = _title.text.trim()
    ..location = _location.text.trim()
    ..notes = _notes.text.trim();

  Future<void> _wizard() async {
    final c = _current();
    if (await runPrepWizard(context, c)) {
      setState(() {
        ev.prep = c.prep;
        ev.answers = c.answers;
      });
    }
  }

  Widget _prepSection() {
    if (ev.prep.isNotEmpty) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        PrepList(ev: ev, occStart: ev.start, editable: true, onChanged: (c) => setState(() => ev.prep = c.prep)),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(onPressed: _wizard, icon: const Icon(Icons.auto_awesome), label: const Text('Fragen ändern / neu vorschlagen')),
        ),
      ]);
    }
    final cur = _current();
    final cats = detectCategories(cur);
    if (cats.isEmpty) return const SizedBox.shrink();
    final preview = generatePrep(cur, guessAnswers(cur, cats));
    if (preview.isEmpty) return const SizedBox.shrink();
    final travel = cats.contains('travel');
    return Card(
      color: const Color(0xFFFFF8E1),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 8, 6),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.auto_awesome, color: Colors.orange),
            const SizedBox(width: 8),
            Expanded(child: Text('Passt dazu: ${preview.length} Punkte', style: const TextStyle(fontWeight: FontWeight.bold))),
            Switch(value: _autoPrep, onChanged: (v) => setState(() => _autoPrep = v)),
          ]),
          Text(
            preview.take(6).map((p) => p.text).join(' · ') + (preview.length > 6 ? ' …' : ''),
            style: TextStyle(color: Colors.grey.shade800, fontSize: 13),
          ),
          const SizedBox(height: 2),
          Text(
            _autoPrep
                ? (travel ? 'Wird beim Speichern übernommen – mit kurzen Fragen (Wetter, Auto/Flug …).' : 'Wird beim Speichern übernommen, mit Erinnerungen.')
                : 'Ausgeschaltet – kein Vorschlag für diesen Termin.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
          ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(onPressed: _wizard, icon: const Icon(Icons.tune, size: 18), label: const Text('Jetzt ansehen & anpassen')),
          ),
        ]),
      ),
    );
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      toast(context, ev.isBirthday ? 'Wessen Geburtstag? Bitte Namen eingeben.' : 'Bitte einen Titel eingeben.');
      return;
    }
    if (_people.isEmpty) _people = {store.myId};
    ev.title = title;
    ev.location = _location.text.trim();
    ev.notes = _notes.text.trim();
    final list = _people.toList();
    // Ich zuerst, wenn ich dabei bin
    if (list.contains(store.myId)) {
      list.remove(store.myId);
      list.insert(0, store.myId);
    }
    ev.ownerId = list.first;
    ev.participants = list.skip(1).toList();
    if (ev.isBirthday) {
      ev.birthYear = _yearKnown ? ev.start.year : null;
      ev.repeat = Repeat.yearly;
      ev.end = ev.start;
    }
    if (ev.allDay) {
      ev.start = dateOnly(ev.start);
      ev.end = dateOnly(ev.end);
      if (ev.end.isBefore(ev.start)) ev.end = ev.start;
    }
    // Passende Vorschläge automatisch übernehmen (bei Reisen mit kurzen Fragen)
    if (ev.prep.isEmpty && _autoPrep && mounted) {
      final cats = detectCategories(ev);
      if (cats.contains('travel')) {
        await runPrepWizard(context, ev);
      } else if (cats.isNotEmpty) {
        ev.answers = guessAnswers(ev, cats);
        ev.prep = generatePrep(ev, ev.answers, idGen: newId);
      }
    }
    final oldColor = widget.event?.color;
    await store.saveEvent(ev);
    if (ev.color != oldColor && mounted) {
      final same = store.events.values
          .where((o) => !o.deleted && o.id != ev.id && o.title.trim().toLowerCase() == ev.title.trim().toLowerCase() && o.color != ev.color)
          .toList();
      if (same.isNotEmpty) {
        final all = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Auch die anderen?'),
            content: Text('Es gibt noch ${same.length} weitere Termine „${ev.title}“. Sollen alle diese Farbe bekommen?'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Nur dieser')),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text('Alle ${same.length + 1}')),
            ],
          ),
        );
        if (all == true) {
          for (final o in same) {
            await store.saveEvent(o.copy()..color = ev.color);
          }
        }
      }
    }
    if (mounted) Navigator.pop(context, ev);
  }

  @override
  Widget build(BuildContext context) {
    final members = store.activeMembers;
    final df = DateFormat('EEE, d. MMM yyyy', 'de_DE');
    final bday = ev.isBirthday;
    final vac = ev.isVacation;
    return Scaffold(
      appBar: AppBar(
        title: Text(isNew ? (bday ? 'Neuer Geburtstag' : vac ? 'Urlaub eintragen' : 'Neuer Termin') : 'Bearbeiten'),
        actions: [
          TextButton(
            onPressed: _uploading > 0 ? null : _save,
            child: const Text('Speichern', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          ),
        ],
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 40), children: [
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: EventKind.normal, label: Text('Termin'), icon: Icon(Icons.event)),
            ButtonSegment(value: EventKind.vacation, label: Text('Urlaub'), icon: Icon(Icons.beach_access)),
            ButtonSegment(value: EventKind.birthday, label: Text('Geburtstag'), icon: Icon(Icons.cake)),
          ],
          selected: {ev.kind},
          onSelectionChanged: (s) => setState(() => _applyKind(s.first)),
        ),
        const SizedBox(height: 14),
        TextField(
          controller: _title,
          textCapitalization: TextCapitalization.sentences,
          style: const TextStyle(fontSize: 20),
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: bday ? 'Wer hat Geburtstag?' : (vac ? 'Bezeichnung (z. B. Urlaub, Kur, Reha)' : 'Titel'),
            border: const OutlineInputBorder(),
            suffixIcon: IconButton(icon: const Icon(Icons.mic), tooltip: 'Per Sprache ausfüllen', onPressed: _voiceFill),
          ),
        ),
        if (!bday && store.activeTemplates.isNotEmpty && isNew) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            children: store.activeTemplates
                .map((t) => ActionChip(
                      label: Text(t.title),
                      avatar: const Icon(Icons.bolt, size: 16),
                      onPressed: () => setState(() {
                        _title.text = t.title;
                        ev.allDay = t.allDay;
                        final d = ev.start;
                        if (!t.allDay) {
                          ev.start = DateTime(d.year, d.month, d.day, t.startTod.hour, t.startTod.minute);
                          ev.end = DateTime(d.year, d.month, d.day, t.endTod.hour, t.endTod.minute);
                          if (!ev.end.isAfter(ev.start)) ev.end = ev.end.add(const Duration(days: 1));
                        } else {
                          ev.start = dateOnly(d);
                          ev.end = ev.start;
                        }
                      }),
                    ))
                .toList(),
          ),
        ],
        if (ev.prep.isEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: _prepSection()),
        const SizedBox(height: 16),
        // Datum / Zeit
        if (bday) ...[
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.cake_outlined),
            title: Text(_yearKnown ? DateFormat('d. MMMM yyyy', 'de_DE').format(ev.start) : DateFormat('d. MMMM', 'de_DE').format(ev.start)),
            subtitle: const Text('Geburtsdatum'),
            onTap: () => _editStart(),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Geburtsjahr bekannt (Alter anzeigen)'),
            value: _yearKnown,
            onChanged: (v) => setState(() => _yearKnown = v),
          ),
          Text('Geburtstage erscheinen bei allen in der Geburtstagsfarbe und wiederholen sich jedes Jahr.', style: TextStyle(color: Colors.grey.shade600)),
        ] else ...[
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            secondary: const Icon(Icons.wb_sunny_outlined),
            title: const Text('Ganztägig'),
            value: ev.allDay,
            onChanged: vac
                ? null
                : (v) => setState(() {
                      ev.allDay = v;
                      if (v) {
                        ev.start = dateOnly(ev.start);
                        ev.end = dateOnly(ev.end);
                      } else {
                        ev.start = DateTime(ev.start.year, ev.start.month, ev.start.day, 9);
                        ev.end = DateTime(ev.end.year, ev.end.month, ev.end.day, 10);
                        if (!ev.end.isAfter(ev.start)) ev.end = ev.start.add(const Duration(hours: 1));
                      }
                    }),
          ),
          _dateRow('Von', df.format(ev.start), ev.allDay ? null : hhmm(ev.start), () => _editStart(), () => _editStart(time: true)),
          _dateRow('Bis', df.format(ev.end), ev.allDay ? null : hhmm(ev.end), () => _editEnd(), () => _editEnd(time: true)),
          if (vac)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('${ev.end.difference(ev.start).inDays + 1} Tage Urlaub', style: TextStyle(color: Colors.grey.shade700)),
            ),
        ],
        const Divider(height: 32),
        // Personen
        Text(bday ? 'Gehört zu (optional)' : (vac ? 'Wer hat Urlaub?' : 'Wer ist dabei?'), style: const TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: members
              .map((m) => FilterChip(
                    avatar: MemberAvatar(m, size: 24),
                    label: Text(m.name),
                    selected: _people.contains(m.id),
                    selectedColor: m.c.withValues(alpha: 0.35),
                    onSelected: (v) => setState(() => v ? _people.add(m.id) : _people.remove(m.id)),
                  ))
              .toList(),
        ),
        if (!bday && _people.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(children: [
              Container(
                width: 80,
                height: 18,
                decoration: multiColorDecoration(_people.map((id) => store.member(id)?.c ?? Colors.grey).toList()),
              ),
              const SizedBox(width: 8),
              Expanded(child: Text('So sieht der Termin im Kalender aus', style: TextStyle(color: Colors.grey.shade600, fontSize: 12))),
            ]),
          ),
        if (!bday)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Container(
              width: 34,
              height: 22,
              decoration: ev.color != null
                  ? BoxDecoration(color: Color(ev.color!), borderRadius: BorderRadius.circular(5))
                  : multiColorDecoration((_people.isEmpty ? {store.myId} : _people).map((id) => store.member(id)?.c ?? Colors.grey).toList()),
            ),
            title: const Text('Farbe'),
            subtitle: Text(ev.color != null ? 'Eigene Farbe – z. B. für Müll, Haushalt, Allgemeines' : 'Automatisch: Farbe der Personen'),
            trailing: ev.color != null
                ? IconButton(icon: const Icon(Icons.close), tooltip: 'Wieder automatisch', onPressed: () => setState(() => ev.color = null))
                : const Icon(Icons.palette_outlined),
            onTap: () async {
              final c = await pickEventColor(context, ev.color);
              if (c != null) setState(() => ev.color = c < 0 ? null : c);
            },
          ),
        if (!bday) ...[
          const Divider(height: 32),
          // Ort
          Row(children: [
            Expanded(
              child: TextField(
                controller: _location,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(labelText: 'Ort / Adresse', prefixIcon: Icon(Icons.place_outlined), border: OutlineInputBorder()),
              ),
            ),
            IconButton(icon: const Icon(Icons.bookmarks_outlined), tooltip: 'Gespeicherte Orte', onPressed: _pickPlace),
            IconButton(
              icon: const Icon(Icons.map_outlined),
              tooltip: 'In Karte zeigen',
              onPressed: _location.text.trim().isEmpty ? null : () => openMap(_location.text.trim()),
            ),
          ]),
          const SizedBox(height: 16),
          // Wiederholung
          if (!vac)
            DropdownButtonFormField<String>(
              initialValue: ev.repeat,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Wiederholen', prefixIcon: Icon(Icons.repeat), border: OutlineInputBorder()),
              items: Repeat.labels.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
              onChanged: (v) => setState(() => ev.repeat = v ?? Repeat.none),
            ),
          if (ev.repeat != Repeat.none && !vac)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_busy),
              title: Text(ev.repeatUntil == null ? 'Endet nie' : 'Bis ${df.format(ev.repeatUntil!)}'),
              trailing: ev.repeatUntil == null ? null : IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(() => ev.repeatUntil = null)),
              onTap: () async {
                final d = await _pickDate(ev.repeatUntil ?? ev.start.add(const Duration(days: 90)));
                if (d != null) setState(() => ev.repeatUntil = d);
              },
            ),
          // Erinnerungen
          if (!vac) ...[
            const SizedBox(height: 8),
            Row(children: [
              const Icon(Icons.notifications_outlined),
              const SizedBox(width: 12),
              Expanded(
                child: Wrap(spacing: 6, runSpacing: 4, children: [
                  ...(ev.reminders.toList()..sort()).map((m) => InputChip(
                        label: Text(ev.allDay ? (allDayReminderOptions[m] ?? reminderOptionLabel(m)) : reminderOptionLabel(m)),
                        onDeleted: () => setState(() => ev.reminders.remove(m)),
                      )),
                  ActionChip(avatar: const Icon(Icons.add, size: 16), label: const Text('Erinnerung'), onPressed: _addReminder),
                ]),
              ),
            ]),
            if (ev.reminders.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(left: 36, top: 4),
                child: Text('Erinnert werden alle, die dabei sind.', style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
              ),
          ],
        ],
        const Divider(height: 32),
        TextField(
          controller: _notes,
          maxLines: 5,
          minLines: 2,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(labelText: 'Notizen', prefixIcon: Icon(Icons.notes), border: OutlineInputBorder()),
        ),
        const SizedBox(height: 16),
        // Checkliste
        Text(bday ? 'Geschenkideen' : 'Checkliste / Mitbringliste', style: const TextStyle(fontWeight: FontWeight.bold)),
        ...ev.checklist.asMap().entries.map((e) {
          final done = e.value.startsWith('[x]');
          final text = e.value.substring(4);
          return CheckboxListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: done,
            title: Text(text, style: TextStyle(decoration: done ? TextDecoration.lineThrough : null)),
            secondary: IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => setState(() => ev.checklist.removeAt(e.key))),
            onChanged: (v) => setState(() => ev.checklist[e.key] = '${v == true ? '[x]' : '[ ]'} $text'),
          );
        }),
        TextField(
          controller: _check,
          decoration: InputDecoration(
            hintText: 'Punkt hinzufügen …',
            suffixIcon: IconButton(icon: const Icon(Icons.add), onPressed: _addCheck),
          ),
          onSubmitted: (_) => _addCheck(),
        ),
        if (ev.prep.isNotEmpty) ...[const SizedBox(height: 16), _prepSection()],
        const SizedBox(height: 20),
        // Fotos
        Row(children: [
          const Text('Fotos', style: TextStyle(fontWeight: FontWeight.bold)),
          const Spacer(),
          if (_uploading > 0) const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
          IconButton(icon: const Icon(Icons.photo_camera_outlined), onPressed: () => _addPhoto(ImageSource.camera)),
          IconButton(icon: const Icon(Icons.photo_library_outlined), onPressed: () => _addPhoto(ImageSource.gallery)),
        ]),
        if (ev.photos.isNotEmpty)
          SizedBox(
            height: 96,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: ev.photos
                  .map((p) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Stack(children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.network(store.api.photoUrl(p), width: 96, height: 96, fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Container(width: 96, height: 96, color: Colors.grey.shade300, child: const Icon(Icons.broken_image))),
                          ),
                          Positioned(
                            right: 0,
                            top: 0,
                            child: InkWell(
                              onTap: () => setState(() => ev.photos.remove(p)),
                              child: const ColorDot(Colors.black54, size: 24, child: Icon(Icons.close, size: 16, color: Colors.white)),
                            ),
                          ),
                        ]),
                      ))
                  .toList(),
            ),
          ),
      ]),
    );
  }

  void _addCheck() {
    final t = _check.text.trim();
    if (t.isEmpty) return;
    setState(() {
      ev.checklist.add('[ ] $t');
      _check.clear();
    });
  }

  Widget _dateRow(String label, String date, String? time, VoidCallback onDate, VoidCallback onTime) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(children: [
        SizedBox(width: 40, child: Text(label, style: TextStyle(color: Colors.grey.shade700))),
        Expanded(child: OutlinedButton(onPressed: onDate, child: Text(date))),
        if (time != null) ...[
          const SizedBox(width: 8),
          OutlinedButton(onPressed: onTime, child: Text(time, style: const TextStyle(fontWeight: FontWeight.bold))),
        ],
      ]),
    );
  }

  Future<void> _addReminder() async {
    final opts = ev.allDay
        ? allDayReminderOptions
        : reminderOptions;
    final m = await showModalBottomSheet<int>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: opts.entries.map((e) => ListTile(title: Text(e.value), onTap: () => Navigator.pop(ctx, e.key))).toList(),
        ),
      ),
    );
    if (m != null && !ev.reminders.contains(m)) setState(() => ev.reminders.add(m));
  }

  Future<void> _pickPlace() async {
    final res = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: ListView(shrinkWrap: true, children: [
          if (_location.text.trim().isNotEmpty)
            ListTile(
              leading: const Icon(Icons.bookmark_add_outlined, color: Colors.blue),
              title: Text('„${_location.text.trim()}“ als Ort speichern'),
              onTap: () async {
                final name = await _askName(_location.text.trim());
                if (name == null) return;
                await store.savePlace(Place(id: newId(), name: name, address: _location.text.trim()));
                if (ctx.mounted) Navigator.pop(ctx);
              },
            ),
          if (store.activePlaces.isEmpty)
            const ListTile(title: Text('Noch keine Orte gespeichert.'), subtitle: Text('Adresse eintippen und hier speichern.')),
          ...store.activePlaces.map((p) => ListTile(
                leading: const Icon(Icons.place),
                title: Text(p.name),
                subtitle: p.address.isNotEmpty && p.address != p.name ? Text(p.address) : null,
                onTap: () => Navigator.pop(ctx, p.address.isNotEmpty ? p.address : p.name),
              )),
        ]),
      ),
    );
    if (res != null) setState(() => _location.text = res);
  }

  Future<String?> _askName(String initial) {
    final c = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Name für diesen Ort'),
        content: TextField(controller: c, autofocus: true, decoration: const InputDecoration(hintText: 'z. B. Oma, Zahnarzt, Hundeschule')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim().isEmpty ? initial : c.text.trim()), child: const Text('Speichern')),
        ],
      ),
    );
  }
}

Future<void> openMap(String query) async {
  final uri = Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(query)}');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<void> openRoute(String query) async {
  final uri = Uri.parse('https://www.google.com/maps/dir/?api=1&destination=${Uri.encodeComponent(query)}');
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}
