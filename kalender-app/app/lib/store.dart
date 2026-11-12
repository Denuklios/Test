import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';
import 'holidays.dart';
import 'models.dart';

const _uuid = Uuid();
String newId() => _uuid.v4().replaceAll('-', '');

class ChangeInfo {
  final CalEvent ev;
  final bool isNew;
  final bool removed;
  ChangeInfo(this.ev, this.isNew, this.removed);
}

class AppStore extends ChangeNotifier {
  // Einstellungen (pro Gerät)
  String serverUrl = '';
  String code = '';
  String groupName = '';
  String myId = '';
  String state = 'SH';
  bool showDE = true;
  bool showDK = true;
  bool showObservances = true;
  bool schoolDE = true;
  bool schoolDK = true;
  int birthdayColor = 0xFFEC407A;
  List<int> defaultReminders = [60];
  int birthdayReminderDays = 1;
  bool notifyChanges = true;
  bool notifyOnlyMine = false;
  bool morningSummary = true;
  int morningHour = 7;
  Set<String> hidden = {};
  bool showWeekNumbers = true;
  bool prepNotify = true;
  bool autoPrep = true;
  bool autoUpdate = true;
  bool unlockReminder = true;
  int prepWindowDays = 3;

  // Daten (geteilt)
  final Map<String, Member> members = {};
  final Map<String, CalEvent> events = {};
  final Map<String, Place> places = {};
  final Map<String, Template> templates = {};
  int since = 0;
  List<Map<String, dynamic>> pending = [];

  bool syncing = false;
  String? lastError;
  DateTime? lastSync;
  final holidays = HolidayService();
  final school = SchoolHolidayService();
  Timer? _timer;
  void Function(List<ChangeInfo>)? onRemoteChanges;
  void Function()? onDataChanged;

  bool get isSetUp => serverUrl.isNotEmpty && code.isNotEmpty && myId.isNotEmpty && members.containsKey(myId);
  bool get isConnected => serverUrl.isNotEmpty && code.isNotEmpty;
  Api get api => Api(serverUrl, code);
  Member? get me => members[myId];

  List<Member> get activeMembers => members.values.where((m) => !m.deleted).toList()..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  List<Place> get activePlaces => places.values.where((p) => !p.deleted).toList()..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  List<Template> get activeTemplates => templates.values.where((t) => !t.deleted).toList()..sort((a, b) => a.startTime.compareTo(b.startTime));

  // ---------- Laden / Speichern ----------
  Future<File> _file() async {
    final dir = await getApplicationSupportDirectory();
    return File('${dir.path}/kalender_daten.json');
  }

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    serverUrl = p.getString('serverUrl') ?? '';
    code = p.getString('code') ?? '';
    groupName = p.getString('groupName') ?? '';
    myId = p.getString('myId') ?? '';
    state = p.getString('state') ?? 'SH';
    showDE = p.getBool('showDE') ?? true;
    showDK = p.getBool('showDK') ?? true;
    showObservances = p.getBool('showObs') ?? true;
    schoolDE = p.getBool('schoolDE') ?? true;
    schoolDK = p.getBool('schoolDK') ?? true;
    birthdayColor = p.getInt('birthdayColor') ?? 0xFFEC407A;
    defaultReminders = (p.getStringList('defaultReminders') ?? ['60']).map(int.parse).toList();
    birthdayReminderDays = p.getInt('birthdayReminderDays') ?? 1;
    notifyChanges = p.getBool('notifyChanges') ?? true;
    notifyOnlyMine = p.getBool('notifyOnlyMine') ?? false;
    morningSummary = p.getBool('morningSummary') ?? true;
    morningHour = p.getInt('morningHour') ?? 7;
    hidden = (p.getStringList('hidden') ?? []).toSet();
    showWeekNumbers = p.getBool('showWeekNumbers') ?? true;
    prepNotify = p.getBool('prepNotify') ?? true;
    autoPrep = p.getBool('autoPrep') ?? true;
    autoUpdate = p.getBool('autoUpdate') ?? true;
    unlockReminder = p.getBool('unlockReminder') ?? true;
    prepWindowDays = p.getInt('prepWindowDays') ?? 3;
    _applyHolidayConfig();
    // Umzug: der frühere Test-Ordner ist jetzt www.wunsch-fabrik.dk/kalender (gleicher Gruppen-Code)
    var moved = false;
    if (RegExp(r'wunsch-fabrik\.dk/test/kalender/', caseSensitive: false).hasMatch(serverUrl)) {
      serverUrl = 'https://www.wunsch-fabrik.dk/kalender/api.php';
      moved = true;
      await p.setString('serverUrl', serverUrl);
    }
    try {
      final f = await _file();
      if (await f.exists()) {
        final j = jsonDecode(await f.readAsString()) as Map<String, dynamic>;
        for (final m in (j['members'] as List? ?? [])) {
          final x = Member.fromJson(m as Map<String, dynamic>);
          members[x.id] = x;
        }
        for (final e in (j['events'] as List? ?? [])) {
          final x = CalEvent.fromJson(e as Map<String, dynamic>);
          events[x.id] = x;
        }
        for (final e in (j['places'] as List? ?? [])) {
          final x = Place.fromJson(e as Map<String, dynamic>);
          places[x.id] = x;
        }
        for (final e in (j['templates'] as List? ?? [])) {
          final x = Template.fromJson(e as Map<String, dynamic>);
          templates[x.id] = x;
        }
        since = (j['since'] ?? 0) as int;
        pending = ((j['pending'] as List?) ?? []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
    } catch (_) {}
    if (moved) {
      since = 0; // auf dem neuen Server alles einmal komplett holen
      await _saveData();
    }
  }

  Future<void> _saveData() async {
    final f = await _file();
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsString(jsonEncode({
      'members': members.values.map((e) => e.toJson()).toList(),
      'events': events.values.map((e) => e.toJson()).toList(),
      'places': places.values.map((e) => e.toJson()).toList(),
      'templates': templates.values.map((e) => e.toJson()).toList(),
      'since': since,
      'pending': pending,
    }));
    await tmp.rename(f.path);
  }

  Future<void> saveSettings() async {
    final p = await SharedPreferences.getInstance();
    await p.setString('serverUrl', serverUrl);
    await p.setString('code', code);
    await p.setString('groupName', groupName);
    await p.setString('myId', myId);
    await p.setString('state', state);
    await p.setBool('showDE', showDE);
    await p.setBool('showDK', showDK);
    await p.setBool('showObs', showObservances);
    await p.setBool('schoolDE', schoolDE);
    await p.setBool('schoolDK', schoolDK);
    await p.setInt('birthdayColor', birthdayColor);
    await p.setStringList('defaultReminders', defaultReminders.map((e) => '$e').toList());
    await p.setInt('birthdayReminderDays', birthdayReminderDays);
    await p.setBool('notifyChanges', notifyChanges);
    await p.setBool('notifyOnlyMine', notifyOnlyMine);
    await p.setBool('morningSummary', morningSummary);
    await p.setInt('morningHour', morningHour);
    await p.setStringList('hidden', hidden.toList());
    await p.setBool('showWeekNumbers', showWeekNumbers);
    await p.setBool('prepNotify', prepNotify);
    await p.setBool('autoPrep', autoPrep);
    await p.setBool('autoUpdate', autoUpdate);
    await p.setBool('unlockReminder', unlockReminder);
    await p.setInt('prepWindowDays', prepWindowDays);
    _applyHolidayConfig();
    notifyListeners();
    onDataChanged?.call();
  }

  void _applyHolidayConfig() {
    holidays.configure(state: state, de: showDE, dk: showDK, obs: showObservances);
    school.configure(state: state, de: schoolDE, dk: schoolDK);
    school.onLoaded = notifyListeners;
  }

  Future<void> resetConnection() async {
    serverUrl = '';
    code = '';
    groupName = '';
    myId = '';
    members.clear();
    events.clear();
    places.clear();
    templates.clear();
    since = 0;
    pending.clear();
    await saveSettings();
    await _saveData();
  }

  // ---------- Sync ----------
  void startAutoSync() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => sync());
  }

  void stopAutoSync() {
    _timer?.cancel();
    _timer = null;
  }

  Future<List<ChangeInfo>> sync({bool quiet = true}) async {
    if (!isConnected || syncing) return [];
    syncing = true;
    notifyListeners();
    final changes = <ChangeInfo>[];
    try {
      // 1) Ausstehende Änderungen hochladen
      while (pending.isNotEmpty) {
        final op = pending.first;
        try {
          await api.save(op['kind'] as String, Map<String, dynamic>.from(op['item'] as Map));
        } on ApiException catch (e) {
          // Vom Server abgelehnt (nicht: falscher Code) -> nicht ewig blockieren
          if (e.message.contains('Gruppen-Code')) rethrow;
        }
        pending.removeAt(0);
        await _saveData();
      }
      // 2) Neues vom Server holen
      final j = await api.sync(since);
      groupName = (j['group'] ?? groupName) as String;
      List<Map<String, dynamic>> list(String k) =>
          (j[k] is List ? j[k] as List : const []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
      // Ein kaputter Eintrag darf nie die ganze Synchronisation stoppen
      for (final m in list('members')) {
        try {
          final x = Member.fromJson(m);
          members[x.id] = x;
        } catch (_) {}
      }
      for (final e in list('events')) {
        try {
          final x = CalEvent.fromJson(e);
          final old = events[x.id];
          if (since > 0 && x.editedBy.isNotEmpty && x.editedBy != myId) {
            changes.add(ChangeInfo(x, old == null || old.deleted, x.deleted));
          }
          events[x.id] = x;
        } catch (_) {}
      }
      for (final e in list('places')) {
        try {
          final x = Place.fromJson(e);
          places[x.id] = x;
        } catch (_) {}
      }
      for (final e in list('templates')) {
        try {
          final x = Template.fromJson(e);
          templates[x.id] = x;
        } catch (_) {}
      }
      since = (j['since'] as num).toInt();
      lastError = null;
      lastSync = DateTime.now();
      await _saveData();
      final p = await SharedPreferences.getInstance();
      await p.setString('groupName', groupName);
    } catch (e) {
      if (e is ApiException) {
        lastError = e.message;
      } else if (e is SocketException || e is TimeoutException || e is http.ClientException || e is HandshakeException) {
        lastError = 'Keine Verbindung zum Server (Internet / Adresse prüfen)';
      } else {
        lastError = 'Sync-Fehler: $e';
      }
    } finally {
      syncing = false;
      notifyListeners();
    }
    if (changes.isNotEmpty) {
      onDataChanged?.call();
      onRemoteChanges?.call(changes);
    }
    return changes;
  }

  Future<void> _put(String kind, Map<String, dynamic> item) async {
    pending.add({'kind': kind, 'item': item});
    await _saveData();
    notifyListeners();
    onDataChanged?.call();
    unawaited(sync());
  }

  Future<void> saveEvent(CalEvent ev) async {
    if (ev.createdBy.isEmpty) ev.createdBy = myId;
    ev.editedBy = myId;
    ev.updatedAt = DateTime.now().millisecondsSinceEpoch;
    events[ev.id] = ev;
    await _put('event', ev.toJson());
  }

  /// Wartet, bis alles hochgeladen ist (für Hintergrund-Aktionen)
  Future<void> flush() async {
    for (var i = 0; i < 40 && syncing; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    if (pending.isNotEmpty) await sync();
  }

  /// Punkte der Vorbereitungsliste abhaken
  Future<void> markPrepDone(String eventId, String occKey, List<String> itemIds) async {
    final ev = events[eventId];
    if (ev == null) return;
    final c = ev.copy();
    for (final p in c.prep) {
      if (itemIds.contains(p.id)) {
        p.done = occKey;
        p.doneBy = myId;
      }
    }
    await saveEvent(c);
  }

  Future<void> deleteEvent(CalEvent ev) async {
    ev.deleted = true;
    await saveEvent(ev);
  }

  Future<void> saveMember(Member m) async {
    members[m.id] = m;
    await _put('member', m.toJson());
  }

  Future<void> savePlace(Place p) async {
    places[p.id] = p;
    await _put('place', p.toJson());
  }

  Future<void> saveTemplate(Template t) async {
    templates[t.id] = t;
    await _put('template', t.toJson());
  }

  Future<void> seedTemplates() async {
    if (templates.isNotEmpty) return;
    for (final t in [
      Template(id: newId(), title: 'Früh', startTime: '06:00', endTime: '14:00'),
      Template(id: newId(), title: 'Spät', startTime: '14:00', endTime: '22:00'),
      Template(id: newId(), title: 'Nacht', startTime: '22:00', endTime: '06:00'),
      Template(id: newId(), title: 'Frei', allDay: true),
    ]) {
      await saveTemplate(t);
    }
  }

  // ---------- Darstellung ----------
  Member? member(String id) => members[id];

  List<Color> colorsFor(CalEvent ev) {
    if (ev.isBirthday) return [Color(birthdayColor)];
    final cols = <Color>[];
    for (final id in ev.people) {
      final m = members[id];
      if (m != null && !m.deleted) {
        final c = m.c;
        if (!cols.contains(c)) cols.add(c);
      }
    }
    if (cols.isEmpty) cols.add(Colors.blueGrey);
    return cols;
  }

  String peopleNames(CalEvent ev) =>
      ev.people.map((id) => members[id]?.name).whereType<String>().where((s) => s.isNotEmpty).join(', ');

  bool isVisible(CalEvent ev) {
    if (ev.deleted) return false;
    if (hidden.isEmpty || ev.isBirthday) return true;
    return ev.people.any((p) => !hidden.contains(p));
  }

  String displayTitle(Occurrence o) {
    final ev = o.ev;
    if (ev.isBirthday) {
      final age = ev.birthYear != null ? o.start.year - ev.birthYear! : null;
      return '🎂 ${ev.title}${age != null && age > 0 ? ' ($age)' : ''}';
    }
    if (ev.isVacation) {
      final names = peopleNames(ev);
      final t = ev.title.trim().isEmpty ? 'Urlaub' : ev.title;
      return '🌴 ${names.isEmpty ? t : '$names: $t'}';
    }
    return ev.fromMail ? '📧 ${ev.title}' : ev.title;
  }

  /// Alle Vorkommen im Zeitraum [from, to] (Tage inklusive)
  List<Occurrence> occurrences(DateTime from, DateTime to, {bool onlyVisible = true}) {
    final f = dateOnly(from), t = dateOnly(to);
    final res = <Occurrence>[];
    for (final ev in events.values) {
      if (ev.deleted) continue;
      if (onlyVisible && !isVisible(ev)) continue;
      res.addAll(expand(ev, f, t));
    }
    res.sort(compareOcc);
    return res;
  }

  static int compareOcc(Occurrence a, Occurrence b) {
    int rank(Occurrence o) => o.ev.isVacation ? 0 : (o.ev.isBirthday ? 1 : (o.ev.allDay || o.lastDay != o.firstDay ? 2 : 3));
    final c = a.firstDay.compareTo(b.firstDay);
    if (c != 0) return c;
    final r = rank(a) - rank(b);
    if (r != 0) return r;
    final len = b.lastDay.difference(b.firstDay).inDays - a.lastDay.difference(a.firstDay).inDays;
    if (len != 0) return len;
    return a.start.compareTo(b.start);
  }

  static List<Occurrence> expand(CalEvent ev, DateTime from, DateTime to) {
    final res = <Occurrence>[];
    final spanDays = dateOnly(ev.end).difference(dateOnly(ev.start)).inHours ~/ 24;
    final dur = ev.end.difference(ev.start);
    Occurrence make(DateTime s) {
      final e = ev.allDay ? DateTime(s.year, s.month, s.day + spanDays) : s.add(dur.isNegative ? Duration.zero : dur);
      return Occurrence(ev, s, e);
    }

    final repeat = ev.isBirthday ? Repeat.yearly : ev.repeat;
    if (repeat == Repeat.none) {
      final o = make(ev.start);
      if (!o.lastDay.isBefore(from) && !o.firstDay.isAfter(to)) res.add(o);
      return res;
    }
    final s0 = ev.start;
    DateTime nth(int n) {
      switch (repeat) {
        case Repeat.daily:
          return DateTime(s0.year, s0.month, s0.day + n, s0.hour, s0.minute);
        case Repeat.weekly:
          return DateTime(s0.year, s0.month, s0.day + 7 * n, s0.hour, s0.minute);
        case Repeat.biweekly:
          return DateTime(s0.year, s0.month, s0.day + 14 * n, s0.hour, s0.minute);
        case Repeat.monthly:
          final m = DateTime(s0.year, s0.month + n, 1);
          final len = DateTime(m.year, m.month + 1, 0).day;
          return DateTime(m.year, m.month, s0.day > len ? len : s0.day, s0.hour, s0.minute);
        default: // jährlich
          final y = s0.year + n;
          final len = DateTime(y, s0.month + 1, 0).day;
          return DateTime(y, s0.month, s0.day > len ? len : s0.day, s0.hour, s0.minute);
      }
    }

    // Grob vorspringen, damit nicht jedes Mal von Anfang an gezählt wird
    int n = 0;
    final daysToFrom = from.difference(dateOnly(s0)).inHours ~/ 24 - spanDays - 2;
    if (daysToFrom > 0) {
      switch (repeat) {
        case Repeat.daily:
          n = daysToFrom;
          break;
        case Repeat.weekly:
          n = daysToFrom ~/ 7;
          break;
        case Repeat.biweekly:
          n = daysToFrom ~/ 14;
          break;
        case Repeat.monthly:
          n = (daysToFrom ~/ 31);
          break;
        default:
          n = daysToFrom ~/ 366;
      }
    }
    final until = ev.repeatUntil == null ? null : dateOnly(ev.repeatUntil!);
    for (var guard = 0; guard < 2000; guard++, n++) {
      final s = nth(n);
      if (dateOnly(s).isAfter(to)) break;
      if (until != null && dateOnly(s).isAfter(until)) break;
      final o = make(s);
      if (!o.lastDay.isBefore(from)) res.add(o);
    }
    return res;
  }

  List<Occurrence> forDay(DateTime day) => occurrences(day, day);

  /// Nächste Geburtstage (ein Eintrag pro Geburtstag)
  List<Occurrence> upcomingBirthdays() {
    final today = dateOnly(DateTime.now());
    final res = <Occurrence>[];
    for (final ev in events.values.where((e) => !e.deleted && e.isBirthday)) {
      final occ = expand(ev, today, DateTime(today.year + 1, today.month, today.day));
      if (occ.isNotEmpty) res.add(occ.first);
    }
    res.sort((a, b) => a.start.compareTo(b.start));
    return res;
  }

  List<CalEvent> search(String q) {
    final s = q.toLowerCase().trim();
    if (s.isEmpty) return [];
    return events.values
        .where((e) =>
            !e.deleted &&
            (e.title.toLowerCase().contains(s) ||
                e.location.toLowerCase().contains(s) ||
                e.notes.toLowerCase().contains(s) ||
                peopleNames(e).toLowerCase().contains(s)))
        .toList()
      ..sort((a, b) => b.start.compareTo(a.start));
  }

  /// Wer hat an diesem Tag Urlaub?
  List<Member> onVacation(DateTime day) {
    final ids = <String>{};
    for (final o in forDay(day).where((o) => o.ev.isVacation)) {
      ids.addAll(o.ev.people);
    }
    return ids.map((i) => members[i]).whereType<Member>().toList();
  }
}
