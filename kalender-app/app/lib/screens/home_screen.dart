import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../main.dart';
import '../models.dart';
import '../notifications.dart';
import '../store.dart';
import '../voice_parser.dart';
import '../widgets/common.dart';
import '../widgets/event_tile.dart';
import '../widgets/voice.dart';
import 'agenda_screen.dart';
import 'birthdays_screen.dart';
import 'event_detail.dart';
import 'event_editor.dart';
import 'month_view.dart';
import 'settings_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  int _tab = 0;
  final _monthKey = GlobalKey<MonthViewState>();
  DateTime _shownMonth = DateTime(DateTime.now().year, DateTime.now().month);
  Template? _brush; // Schicht-Pinsel
  bool _painting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    store.onRemoteChanges = (changes) {
      if (!mounted) return;
      final c = changes.first;
      final who = store.member(c.ev.editedBy)?.name ?? 'Jemand';
      toast(context, '$who: ${c.removed ? 'gelöscht' : (c.isNew ? 'neu' : 'geändert')} – ${c.ev.title}${changes.length > 1 ? ' (+${changes.length - 1})' : ''}');
    };
    store.startAutoSync();
    store.sync();
    Notifier.rescheduleAll(store);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    store.stopAutoSync();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      store.startAutoSync();
      store.sync();
    } else if (state == AppLifecycleState.paused) {
      store.stopAutoSync();
    }
  }

  Future<void> _newEvent({DateTime? day, VoiceResult? voice, String? kind}) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => EventEditor(day: day, voice: voice, kind: kind)));
  }

  Future<void> _voice() async {
    final text = await listenSpeech(context);
    if (text == null || text.trim().isEmpty || !mounted) return;
    final r = parseVoice(text, store.activeMembers);
    await _newEvent(voice: r);
  }

  void _openEvent(Occurrence o) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => EventDetail(eventId: o.ev.id, occurrenceStart: o.start)));
  }

  Future<void> _paintDay(DateTime day) async {
    final t = _brush;
    if (t == null) return;
    // Gleiche Vorlage am selben Tag schon da? -> wieder entfernen
    final existing = store.forDay(day).where((o) => o.ev.ownerId == store.myId && o.ev.title == t.title && o.firstDay == dateOnly(day) && o.ev.repeat == Repeat.none);
    if (existing.isNotEmpty) {
      await store.deleteEvent(existing.first.ev);
      return;
    }
    final s = t.allDay ? dateOnly(day) : DateTime(day.year, day.month, day.day, t.startTod.hour, t.startTod.minute);
    var e = t.allDay ? dateOnly(day) : DateTime(day.year, day.month, day.day, t.endTod.hour, t.endTod.minute);
    if (!e.isAfter(s) && !t.allDay) e = e.add(const Duration(days: 1)); // Nachtschicht
    await store.saveEvent(CalEvent(
      id: newId(),
      title: t.title,
      start: s,
      end: e,
      allDay: t.allDay,
      ownerId: store.myId,
      kind: t.kind,
      reminders: t.allDay ? [] : [...store.defaultReminders],
    ));
  }

  void _dayTap(DateTime day) {
    if (_painting) {
      _paintDay(day);
      return;
    }
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.5,
        minChildSize: 0.3,
        maxChildSize: 0.92,
        builder: (ctx, sc) => ListenableBuilder(
          listenable: store,
          builder: (ctx, _) => _DaySheet(
            day: day,
            controller: sc,
            onOpen: (o) {
              Navigator.pop(ctx);
              _openEvent(o);
            },
            onNew: () {
              Navigator.pop(ctx);
              _newEvent(day: day);
            },
          ),
        ),
      ),
    );
  }

  void _filterDialog() {
    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Wessen Termine anzeigen?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: store.activeMembers
                .map((m) => CheckboxListTile(
                      value: !store.hidden.contains(m.id),
                      secondary: MemberAvatar(m),
                      title: Text(m.name),
                      onChanged: (v) {
                        setD(() => v == true ? store.hidden.remove(m.id) : store.hidden.add(m.id));
                        store.saveSettings();
                      },
                    ))
                .toList(),
          ),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Fertig'))],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final isCurrent = _shownMonth.year == now.year && _shownMonth.month == now.month;
    return Scaffold(
      appBar: AppBar(
        title: _tab == 0
            ? GestureDetector(onTap: () => _monthKey.currentState?.goToday(), child: Text(isCurrent ? 'Heute' : 'Zu heute'))
            : Text(_tab == 1 ? 'Termine' : 'Geburtstage'),
        actions: [
          ListenableBuilder(
            listenable: store,
            builder: (_, __) => store.syncing
                ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)))
                : store.lastError != null || store.pending.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.cloud_off),
                        tooltip: store.lastError ?? 'Noch nicht hochgeladen',
                        onPressed: () async {
                          await store.sync();
                          if (context.mounted) toast(context, store.lastError ?? 'Synchronisiert ✓');
                        },
                      )
                    : const SizedBox.shrink(),
          ),
          if (_tab == 0)
            IconButton(
              icon: Icon(_painting ? Icons.brush : Icons.brush_outlined),
              tooltip: 'Schicht-Pinsel',
              onPressed: () => setState(() {
                _painting = !_painting;
                if (_painting && _brush == null && store.activeTemplates.isNotEmpty) _brush = store.activeTemplates.first;
              }),
            ),
          IconButton(icon: const Icon(Icons.search), onPressed: () => showSearch(context: context, delegate: _Search(_openEvent))),
          IconButton(icon: const Icon(Icons.add, size: 30), onPressed: () => _newEvent()),
        ],
      ),
      drawer: _drawer(),
      body: Column(children: [
        if (_painting && _tab == 0) _brushBar(),
        Expanded(
          child: IndexedStack(index: _tab, children: [
            MonthView(
              key: _monthKey,
              onDayTap: _dayTap,
              onDayLongPress: (d) => _newEvent(day: d),
              onEventTap: (o) => _painting ? _paintDay(o.firstDay) : _openEvent(o),
              onMonthChanged: (m) => setState(() => _shownMonth = m),
            ),
            AgendaScreen(onOpen: _openEvent),
            BirthdaysScreen(onOpen: _openEvent),
          ]),
        ),
      ]),
      floatingActionButton: FloatingActionButton(
        heroTag: 'mic',
        onPressed: _voice,
        tooltip: 'Termin per Sprache',
        child: const Icon(Icons.mic),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.calendar_view_month_outlined), selectedIcon: Icon(Icons.calendar_view_month), label: 'Kalender'),
          NavigationDestination(icon: Icon(Icons.view_agenda_outlined), selectedIcon: Icon(Icons.view_agenda), label: 'Termine'),
          NavigationDestination(icon: Icon(Icons.cake_outlined), selectedIcon: Icon(Icons.cake), label: 'Geburtstage'),
        ],
      ),
    );
  }

  Widget _brushBar() {
    final ts = store.activeTemplates;
    return Material(
      color: Colors.amber.shade50,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(children: [
          const Icon(Icons.brush, size: 18),
          const SizedBox(width: 6),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: ts
                    .map((t) => Padding(
                          padding: const EdgeInsets.only(right: 6),
                          child: ChoiceChip(
                            label: Text(t.allDay ? t.title : '${t.title} ${t.startTime}'),
                            selected: _brush?.id == t.id,
                            selectedColor: store.me?.c.withValues(alpha: 0.4),
                            onSelected: (_) => setState(() => _brush = t),
                          ),
                        ))
                    .toList(),
              ),
            ),
          ),
          IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _painting = false)),
        ]),
      ),
    );
  }

  Widget _drawer() {
    final me = store.me;
    return Drawer(
      child: ListView(padding: EdgeInsets.zero, children: [
        DrawerHeader(
          decoration: const BoxDecoration(color: Color(0xFF1976D2)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.end, children: [
            if (me != null) MemberAvatar(me, size: 52),
            const SizedBox(height: 10),
            Text(me?.name ?? '', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            Text(store.groupName, style: const TextStyle(color: Colors.white70)),
          ]),
        ),
        ListTile(leading: const Icon(Icons.person_add_alt), title: const Text('Jemanden einladen'), onTap: () {
          Navigator.pop(context);
          showInvite(context);
        }),
        ListTile(leading: const Icon(Icons.filter_alt_outlined), title: const Text('Personen filtern'), onTap: () {
          Navigator.pop(context);
          _filterDialog();
        }),
        ListTile(leading: const Icon(Icons.beach_access_outlined), title: const Text('Urlaub eintragen'), onTap: () {
          Navigator.pop(context);
          _newEvent(kind: EventKind.vacation);
        }),
        ListTile(leading: const Icon(Icons.cake_outlined), title: const Text('Geburtstag eintragen'), onTap: () {
          Navigator.pop(context);
          _newEvent(kind: EventKind.birthday);
        }),
        const Divider(),
        ListTile(leading: const Icon(Icons.settings_outlined), title: const Text('Einstellungen'), onTap: () {
          Navigator.pop(context);
          Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
        }),
        ListTile(
          leading: const Icon(Icons.sync),
          title: const Text('Jetzt synchronisieren'),
          subtitle: Text(store.lastSync == null ? '–' : 'Zuletzt ${DateFormat('HH:mm').format(store.lastSync!)}'),
          onTap: () async {
            Navigator.pop(context);
            await store.sync();
            if (mounted) toast(context, store.lastError ?? 'Synchronisiert ✓');
          },
        ),
      ]),
    );
  }
}

class _DaySheet extends StatelessWidget {
  final DateTime day;
  final ScrollController controller;
  final void Function(Occurrence) onOpen;
  final VoidCallback onNew;
  const _DaySheet({required this.day, required this.controller, required this.onOpen, required this.onNew});

  @override
  Widget build(BuildContext context) {
    final occ = store.forDay(day);
    final hol = store.holidays.forDay(day);
    final school = store.school.forDay(day);
    return ListView(controller: controller, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 8, 8),
        child: Row(children: [
          Expanded(
            child: Text(DateFormat('EEEE, d. MMMM yyyy', 'de_DE').format(day), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          ),
          FilledButton.icon(onPressed: onNew, icon: const Icon(Icons.add), label: const Text('Termin')),
        ]),
      ),
      ...hol.map((h) => ListTile(
            dense: true,
            leading: Icon(h.free ? Icons.celebration : Icons.event_note, color: Colors.blue),
            title: Text(h.label),
            subtitle: Text(h.free ? 'Feiertag' : 'Gedenk-/Aktionstag'),
          )),
      ...school.map((s) => ListTile(
            dense: true,
            leading: Icon(Icons.backpack_outlined, color: Colors.brown.shade300),
            title: Text(s.label),
            subtitle: Text('Schulferien ${DateFormat('d.M.').format(s.start)} – ${DateFormat('d.M.yyyy').format(s.end)}'),
          )),
      if (hol.isNotEmpty || school.isNotEmpty) const Divider(),
      if (occ.isEmpty)
        const Padding(
          padding: EdgeInsets.all(24),
          child: Center(child: Text('Keine Termine – frei! 🎉', style: TextStyle(color: Colors.grey))),
        ),
      ...occ.map((o) => EventTile(o, onTap: () => onOpen(o))),
      const SizedBox(height: 30),
    ]);
  }
}

class _Search extends SearchDelegate<void> {
  final void Function(Occurrence) onOpen;
  _Search(this.onOpen) : super(searchFieldLabel: 'Termine suchen');

  @override
  List<Widget>? buildActions(BuildContext context) => [IconButton(icon: const Icon(Icons.clear), onPressed: () => query = '')];
  @override
  Widget? buildLeading(BuildContext context) => BackButton(onPressed: () => close(context, null));
  @override
  Widget buildResults(BuildContext context) => _list(context);
  @override
  Widget buildSuggestions(BuildContext context) => _list(context);

  Widget _list(BuildContext context) {
    final res = store.search(query);
    return ListView(
      children: res.map((e) {
        final o = Occurrence(e, e.start, e.end);
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Padding(
            padding: const EdgeInsets.only(left: 16, top: 8),
            child: Text(DateFormat('EEE d. MMM yyyy', 'de_DE').format(e.start), style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
          ),
          EventTile(o, onTap: () {
            close(context, null);
            onOpen(o);
          }),
        ]);
      }).toList(),
    );
  }
}
