import 'dart:ui' show Color;

/// Dienst-Vorlage (z. B. Früh 08:00–16:30). Ohne Zeiten = ganztägig (Frei, Urlaub, Krank).
class ShiftTemplate {
  final String id;
  final String name;
  final String start;
  final String end;
  final String color;

  const ShiftTemplate({required this.id, required this.name, required this.start, required this.end, required this.color});

  bool get allDay => start.isEmpty || end.isEmpty;
  Color get colorValue => parseHexColor(color);

  factory ShiftTemplate.fromJson(Map<String, dynamic> j) => ShiftTemplate(
        id: '${j['id'] ?? ''}',
        name: '${j['name'] ?? ''}',
        start: '${j['start'] ?? ''}',
        end: '${j['end'] ?? ''}',
        color: '${j['color'] ?? '#94a3b8'}',
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'start': start, 'end': end, 'color': color};

  ShiftTemplate copyWith({String? name, String? start, String? end, String? color}) => ShiftTemplate(
        id: id,
        name: name ?? this.name,
        start: start ?? this.start,
        end: end ?? this.end,
        color: color ?? this.color,
      );
}

class Employee {
  final String id;
  final String name;
  final bool mustChange;
  final String? initPw;

  const Employee({required this.id, required this.name, this.mustChange = false, this.initPw});

  /// Mitarbeiter, die noch „MitarbeiterN“ heißen, werden nirgends angezeigt.
  bool get isNamed => !RegExp(r'^mitarbeiter\s*\d*$', caseSensitive: false).hasMatch(name.trim());

  factory Employee.fromJson(Map<String, dynamic> j) => Employee(
        id: '${j['id'] ?? ''}',
        name: '${j['name'] ?? ''}',
        mustChange: j['mustChange'] == true,
        initPw: j['initPw'] is String ? j['initPw'] as String : null,
      );

  Map<String, dynamic> toJson({bool withSecrets = false}) => {
        'id': id,
        'name': name,
        'mustChange': mustChange,
        if (withSecrets && initPw != null) 'initPw': initPw,
      };
}

/// Eintrag im Plan: Vorlage, optional abweichende Zeit und Notiz.
class PlanCell {
  final String t;
  final String? s;
  final String? e;
  final String? n;

  const PlanCell({required this.t, this.s, this.e, this.n});

  bool get custom => s != null && e != null;

  factory PlanCell.fromJson(Map<String, dynamic> j) => PlanCell(
        t: '${j['t'] ?? ''}',
        s: j['s'] is String ? j['s'] as String : null,
        e: j['e'] is String ? j['e'] as String : null,
        n: j['n'] is String && (j['n'] as String).isNotEmpty ? j['n'] as String : null,
      );

  Map<String, dynamic> toJson() => {
        't': t,
        if (custom) 's': s,
        if (custom) 'e': e,
        if (n != null && n!.isNotEmpty) 'n': n,
      };

  @override
  bool operator ==(Object other) => other is PlanCell && other.t == t && other.s == s && other.e == e && other.n == n;

  @override
  int get hashCode => Object.hash(t, s, e, n);
}

class Me {
  final String role;
  final String id;
  final String name;
  final bool mustChange;

  const Me({required this.role, required this.id, required this.name, required this.mustChange});

  bool get isAdmin => role == 'admin';

  factory Me.fromJson(Map<String, dynamic> j) => Me(
        role: '${j['role'] ?? ''}',
        id: '${j['id'] ?? ''}',
        name: '${j['name'] ?? ''}',
        mustChange: j['mustChange'] == true,
      );

  Map<String, dynamic> toJson() => {'role': role, 'id': id, 'name': name, 'mustChange': mustChange};
}

typedef Plan = Map<String, Map<String, PlanCell>>;

/// Gesamter Stand vom Server (api=state).
class DienstState {
  final Me me;
  final List<Employee> emps;
  final List<ShiftTemplate> templates;
  final Plan plan;

  const DienstState({required this.me, required this.emps, required this.templates, required this.plan});

  factory DienstState.fromJson(Map<String, dynamic> j) {
    final plan = <String, Map<String, PlanCell>>{};
    final rawPlan = j['plan'];
    if (rawPlan is Map) {
      rawPlan.forEach((day, cells) {
        if (cells is Map) {
          final m = <String, PlanCell>{};
          cells.forEach((eid, c) {
            if (c is Map) m['$eid'] = PlanCell.fromJson(Map<String, dynamic>.from(c));
          });
          if (m.isNotEmpty) plan['$day'] = m;
        }
      });
    }
    return DienstState(
      me: Me.fromJson(Map<String, dynamic>.from(j['me'] as Map)),
      emps: [for (final e in (j['emps'] as List? ?? const [])) Employee.fromJson(Map<String, dynamic>.from(e as Map))],
      templates: [for (final t in (j['templates'] as List? ?? const [])) ShiftTemplate.fromJson(Map<String, dynamic>.from(t as Map))],
      plan: plan,
    );
  }

  /// Für den Offline-Cache: Start-Passwörter werden nie gespeichert.
  Map<String, dynamic> toJson() => {
        'me': me.toJson(),
        'emps': [for (final e in emps) e.toJson()],
        'templates': [for (final t in templates) t.toJson()],
        'plan': {
          for (final d in plan.entries) d.key: {for (final c in d.value.entries) c.key: c.value.toJson()}
        },
      };

  List<Employee> get visibleEmps => emps.where((e) => e.isNamed).toList();

  ShiftTemplate? template(String id) {
    for (final t in templates) {
      if (t.id == id) return t;
    }
    return null;
  }

  PlanCell? cell(String empId, String dayKey) => plan[dayKey]?[empId];

  Shift? shiftOf(String empId, String dayKey) {
    final c = cell(empId, dayKey);
    if (c == null) return null;
    return Shift.resolve(c, template(c.t));
  }

  DienstState copyWith({Plan? plan, List<Employee>? emps, List<ShiftTemplate>? templates, Me? me}) => DienstState(
        me: me ?? this.me,
        emps: emps ?? this.emps,
        templates: templates ?? this.templates,
        plan: plan ?? this.plan,
      );
}

/// Aufgelöster Dienst für die Anzeige.
class Shift {
  final String? templateId;
  final String name;
  final String color;
  final String start;
  final String end;
  final bool custom;
  final String? note;

  const Shift({
    required this.templateId,
    required this.name,
    required this.color,
    required this.start,
    required this.end,
    required this.custom,
    this.note,
  });

  /// Ganztägig / ohne Arbeitszeit (Frei, Urlaub, Krank …)
  bool get off => start.isEmpty && end.isEmpty;
  bool get hasTimes => start.isNotEmpty && end.isNotEmpty;
  Color get colorValue => parseHexColor(color);
  String get timeText => hasTimes ? '$start–$end' : 'ganztägig';

  static Shift resolve(PlanCell c, ShiftTemplate? t) {
    final s = c.custom ? c.s! : (t?.start ?? '');
    final e = c.custom ? c.e! : (t?.end ?? '');
    return Shift(
      templateId: t?.id,
      name: t?.name ?? (s.isNotEmpty ? 'Individuell' : '?'),
      color: t?.color ?? '#64748b',
      start: s,
      end: e,
      custom: c.custom,
      note: c.n,
    );
  }

  String get signature => '$name|$start|$end|${note ?? ''}';
}

Color parseHexColor(String hex) {
  final h = hex.replaceFirst('#', '');
  final v = int.tryParse(h.length == 6 ? 'ff$h' : h, radix: 16);
  return Color(v ?? 0xff94a3b8);
}

String colorToHex(Color c) {
  String two(double v) => (v * 255).round().clamp(0, 255).toRadixString(16).padLeft(2, '0');
  return '#${two(c.r)}${two(c.g)}${two(c.b)}';
}
