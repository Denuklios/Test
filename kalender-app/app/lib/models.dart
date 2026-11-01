import 'package:flutter/material.dart';

DateTime dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

String isoLocal(DateTime d) {
  String two(int v) => v.toString().padLeft(2, '0');
  return '${d.year.toString().padLeft(4, '0')}-${two(d.month)}-${two(d.day)}T${two(d.hour)}:${two(d.minute)}:00';
}

DateTime parseLocal(String? s, [DateTime? fallback]) {
  if (s == null || s.isEmpty) return fallback ?? DateTime.now();
  final d = DateTime.tryParse(s);
  if (d == null) return fallback ?? DateTime.now();
  return d.isUtc ? d.toLocal() : d;
}

class Member {
  String id;
  String name;
  int color;
  bool deleted;
  int updatedAt;
  Member({required this.id, required this.name, required this.color, this.deleted = false, this.updatedAt = 0});

  Color get c => Color(color);

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'color': color, 'deleted': deleted, 'updatedAt': updatedAt};
  factory Member.fromJson(Map<String, dynamic> j) => Member(
        id: j['id'] as String,
        name: (j['name'] ?? '') as String,
        color: (j['color'] ?? 0xFF1E88E5) as int,
        deleted: j['deleted'] == true,
        updatedAt: (j['updatedAt'] ?? 0) as int,
      );
}

class EventKind {
  static const normal = 'normal';
  static const birthday = 'birthday';
  static const vacation = 'vacation';
}

class Repeat {
  static const none = 'none';
  static const daily = 'daily';
  static const weekly = 'weekly';
  static const biweekly = 'biweekly';
  static const monthly = 'monthly';
  static const yearly = 'yearly';
  static const labels = {
    none: 'Nie',
    daily: 'Täglich',
    weekly: 'Wöchentlich',
    biweekly: 'Alle 2 Wochen',
    monthly: 'Monatlich',
    yearly: 'Jährlich',
  };
}

class CalEvent {
  String id;
  String title;
  DateTime start;
  DateTime end; // bei ganztägig: letzter Tag (inklusive)
  bool allDay;
  String ownerId;
  List<String> participants;
  String kind;
  String location;
  String notes;
  List<int> reminders; // Minuten vorher
  String repeat;
  DateTime? repeatUntil;
  List<String> photos;
  int? birthYear;
  String createdBy;
  String editedBy;
  int updatedAt;
  bool deleted;
  List<String> checklist; // "[x] Text" / "[ ] Text"

  CalEvent({
    required this.id,
    required this.title,
    required this.start,
    required this.end,
    this.allDay = false,
    required this.ownerId,
    List<String>? participants,
    this.kind = EventKind.normal,
    this.location = '',
    this.notes = '',
    List<int>? reminders,
    this.repeat = Repeat.none,
    this.repeatUntil,
    List<String>? photos,
    this.birthYear,
    this.createdBy = '',
    this.editedBy = '',
    this.updatedAt = 0,
    this.deleted = false,
    List<String>? checklist,
  })  : participants = participants ?? [],
        reminders = reminders ?? [],
        photos = photos ?? [],
        checklist = checklist ?? [];

  bool get isBirthday => kind == EventKind.birthday;
  bool get isVacation => kind == EventKind.vacation;

  /// Alle beteiligten Personen (Besitzer zuerst, ohne Doppelte)
  List<String> get people {
    final l = <String>[ownerId];
    for (final p in participants) {
      if (!l.contains(p)) l.add(p);
    }
    return l;
  }

  CalEvent copy() => CalEvent.fromJson(toJson());

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'start': isoLocal(start),
        'end': isoLocal(end),
        'allDay': allDay,
        'ownerId': ownerId,
        'participants': participants,
        'kind': kind,
        'location': location,
        'notes': notes,
        'reminders': reminders,
        'repeat': repeat,
        'repeatUntil': repeatUntil == null ? null : isoLocal(repeatUntil!),
        'photos': photos,
        'birthYear': birthYear,
        'createdBy': createdBy,
        'editedBy': editedBy,
        'updatedAt': updatedAt,
        'deleted': deleted,
        'checklist': checklist,
      };

  factory CalEvent.fromJson(Map<String, dynamic> j) {
    final start = parseLocal(j['start'] as String?);
    return CalEvent(
      id: j['id'] as String,
      title: (j['title'] ?? '') as String,
      start: start,
      end: parseLocal(j['end'] as String?, start),
      allDay: j['allDay'] == true,
      ownerId: (j['ownerId'] ?? '') as String,
      participants: ((j['participants'] ?? []) as List).map((e) => e.toString()).toList(),
      kind: (j['kind'] ?? EventKind.normal) as String,
      location: (j['location'] ?? '') as String,
      notes: (j['notes'] ?? '') as String,
      reminders: ((j['reminders'] ?? []) as List).map((e) => (e as num).toInt()).toList(),
      repeat: (j['repeat'] ?? Repeat.none) as String,
      repeatUntil: j['repeatUntil'] == null ? null : parseLocal(j['repeatUntil'] as String?),
      photos: ((j['photos'] ?? []) as List).map((e) => e.toString()).toList(),
      birthYear: (j['birthYear'] as num?)?.toInt(),
      createdBy: (j['createdBy'] ?? '') as String,
      editedBy: (j['editedBy'] ?? '') as String,
      updatedAt: (j['updatedAt'] ?? 0) as int,
      deleted: j['deleted'] == true,
      checklist: ((j['checklist'] ?? []) as List).map((e) => e.toString()).toList(),
    );
  }
}

/// Ein konkretes Vorkommen eines (evtl. wiederkehrenden) Termins
class Occurrence {
  final CalEvent ev;
  final DateTime start;
  final DateTime end;
  Occurrence(this.ev, this.start, this.end);

  DateTime get firstDay => dateOnly(start);
  DateTime get lastDay {
    if (ev.allDay) return dateOnly(end);
    // Endet ein Termin um 00:00, zählt der Folgetag nicht mehr
    final e = end.isAfter(start) && end.hour == 0 && end.minute == 0 ? end.subtract(const Duration(minutes: 1)) : end;
    final d = dateOnly(e);
    return d.isBefore(firstDay) ? firstDay : d;
  }

  bool coversDay(DateTime day) {
    final d = dateOnly(day);
    return !d.isBefore(firstDay) && !d.isAfter(lastDay);
  }
}

class Place {
  String id;
  String name;
  String address;
  bool deleted;
  int updatedAt;
  Place({required this.id, required this.name, this.address = '', this.deleted = false, this.updatedAt = 0});
  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'address': address, 'deleted': deleted, 'updatedAt': updatedAt};
  factory Place.fromJson(Map<String, dynamic> j) => Place(
        id: j['id'] as String,
        name: (j['name'] ?? '') as String,
        address: (j['address'] ?? '') as String,
        deleted: j['deleted'] == true,
        updatedAt: (j['updatedAt'] ?? 0) as int,
      );
}

/// Schnell-Vorlage, z. B. Schichten "Früh", "Spät", "Frei"
class Template {
  String id;
  String title;
  bool allDay;
  String startTime; // "06:00"
  String endTime; // "14:00"
  String kind;
  bool deleted;
  int updatedAt;
  Template({
    required this.id,
    required this.title,
    this.allDay = false,
    this.startTime = '08:00',
    this.endTime = '16:00',
    this.kind = EventKind.normal,
    this.deleted = false,
    this.updatedAt = 0,
  });
  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'allDay': allDay,
        'startTime': startTime,
        'endTime': endTime,
        'kind': kind,
        'deleted': deleted,
        'updatedAt': updatedAt
      };
  factory Template.fromJson(Map<String, dynamic> j) => Template(
        id: j['id'] as String,
        title: (j['title'] ?? '') as String,
        allDay: j['allDay'] == true,
        startTime: (j['startTime'] ?? '08:00') as String,
        endTime: (j['endTime'] ?? '16:00') as String,
        kind: (j['kind'] ?? EventKind.normal) as String,
        deleted: j['deleted'] == true,
        updatedAt: (j['updatedAt'] ?? 0) as int,
      );

  TimeOfDay get startTod => _tod(startTime);
  TimeOfDay get endTod => _tod(endTime);
  static TimeOfDay _tod(String s) {
    final p = s.split(':');
    return TimeOfDay(hour: int.tryParse(p[0]) ?? 0, minute: p.length > 1 ? int.tryParse(p[1]) ?? 0 : 0);
  }
}

const memberPalette = <int>[
  0xFF1E88E5, // Blau
  0xFFE53935, // Rot
  0xFF43A047, // Grün
  0xFFFB8C00, // Orange
  0xFF8E24AA, // Lila
  0xFF00ACC1, // Türkis
  0xFF6D4C41, // Braun
  0xFFFDD835, // Gelb
  0xFFD81B60, // Pink
  0xFF3949AB, // Indigo
  0xFF7CB342, // Hellgrün
  0xFF546E7A, // Blaugrau
  0xFFFFB300, // Bernstein
  0xFF00897B, // Petrol
  0xFFA1887F, // Taupe
  0xFF5E35B1, // Violett
];

Color textOn(Color c) => c.computeLuminance() > 0.55 ? Colors.black87 : Colors.white;
