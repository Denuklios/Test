import 'package:latlong2/latlong.dart';

int _i(dynamic v, [int d = 0]) => v is num ? v.toInt() : int.tryParse('$v') ?? d;
double? _d(dynamic v) => v is num ? v.toDouble() : (v == null ? null : double.tryParse('$v'));

class LastLoc {
  final double? lat, lng, acc, spd, hdg;
  final int? bat;
  final bool chg;
  final int ts;
  final String act;
  LastLoc({this.lat, this.lng, this.acc, this.spd, this.hdg, this.bat, this.chg = false, this.ts = 0, this.act = ''});
  factory LastLoc.fromJson(Map<String, dynamic> j) => LastLoc(
        lat: _d(j['lat']),
        lng: _d(j['lng']),
        acc: _d(j['acc']),
        spd: _d(j['spd']),
        hdg: _d(j['hdg']),
        bat: j['bat'] == null ? null : _i(j['bat']),
        chg: j['chg'] == true,
        ts: _i(j['ts']),
        act: (j['act'] ?? '').toString(),
      );
  bool get hasPos => lat != null && lng != null;
  LatLng? get pos => hasPos ? LatLng(lat!, lng!) : null;
  DateTime get time => DateTime.fromMillisecondsSinceEpoch(ts);
  double get kmh => (spd ?? 0) * 3.6;
  bool get driving => kmh >= 20 && DateTime.now().difference(time).inMinutes < 5;
}

class Eta {
  final String name;
  final double lat, lng;
  final int started;
  final int? minutes;
  Eta(this.name, this.lat, this.lng, this.started, this.minutes);
  static Eta? fromJson(dynamic j) {
    if (j is! Map) return null;
    return Eta((j['name'] ?? 'Ziel').toString(), _d(j['lat']) ?? 0, _d(j['lng']) ?? 0, _i(j['started']),
        j['minutes'] == null ? null : _i(j['minutes']));
  }

  LatLng get pos => LatLng(lat, lng);
}

class Member {
  final String id, name, emoji, role;
  final String? avatar, phone, place;
  final int color;
  final LastLoc? last;
  final bool paused, sharing, bubble;
  final int bubbleUntil;
  final int? placeSince;
  final Eta? eta;
  Member({
    required this.id,
    required this.name,
    this.emoji = '',
    this.role = 'member',
    this.avatar,
    this.phone,
    this.place,
    this.color = 0x3D7BF7,
    this.last,
    this.paused = false,
    this.sharing = true,
    this.bubble = false,
    this.bubbleUntil = 0,
    this.placeSince,
    this.eta,
  });
  factory Member.fromJson(Map<String, dynamic> j) => Member(
        id: j['id'].toString(),
        name: (j['name'] ?? '?').toString(),
        emoji: (j['emoji'] ?? '').toString(),
        role: (j['role'] ?? 'member').toString(),
        avatar: j['avatar']?.toString(),
        phone: (j['phone'] ?? '').toString().isEmpty ? null : j['phone'].toString(),
        place: j['place']?.toString(),
        color: _i(j['color'], 0x3D7BF7),
        last: j['last'] is Map ? LastLoc.fromJson(Map<String, dynamic>.from(j['last'])) : null,
        paused: j['paused'] == true,
        sharing: j['sharing'] != false,
        bubble: j['bubble'] == true,
        bubbleUntil: _i(j['bubbleUntil']),
        placeSince: j['placeSince'] == null ? null : _i(j['placeSince']),
        eta: Eta.fromJson(j['eta']),
      );
  bool get isAdmin => role == 'admin';
  String get initials {
    final p = name.trim().split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (p.isEmpty) return '?';
    if (p.length == 1) return p[0].characters2.toUpperCase();
    return (p[0].characters1 + p[1].characters1).toUpperCase();
  }
}

extension on String {
  String get characters1 => isEmpty ? '' : String.fromCharCode(runes.first);
  String get characters2 => runes.take(2).map(String.fromCharCode).join();
}

class Place {
  final String id, name, icon;
  final double lat, lng, radius;
  Place({required this.id, required this.name, this.icon = '📍', required this.lat, required this.lng, this.radius = 150});
  factory Place.fromJson(Map<String, dynamic> j) => Place(
        id: j['id'].toString(),
        name: (j['name'] ?? '').toString(),
        icon: (j['icon'] ?? '📍').toString(),
        lat: _d(j['lat']) ?? 0,
        lng: _d(j['lng']) ?? 0,
        radius: _d(j['radius']) ?? 150,
      );
  LatLng get pos => LatLng(lat, lng);
  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'icon': icon, 'lat': lat, 'lng': lng, 'radius': radius};
}

class Circle {
  final int id;
  final String name, code, owner;
  final Map<String, dynamic> settings;
  final List<Member> members;
  final List<Place> places;
  Circle({required this.id, required this.name, required this.code, required this.owner, required this.settings,
      required this.members, required this.places});
  factory Circle.fromJson(Map<String, dynamic> j) => Circle(
        id: _i(j['id']),
        name: (j['name'] ?? '').toString(),
        code: (j['code'] ?? '').toString(),
        owner: (j['owner'] ?? '').toString(),
        settings: j['settings'] is Map ? Map<String, dynamic>.from(j['settings']) : {},
        members: [for (final m in (j['members'] as List? ?? [])) Member.fromJson(Map<String, dynamic>.from(m))],
        places: [for (final p in (j['places'] as List? ?? [])) Place.fromJson(Map<String, dynamic>.from(p))],
      );
  double get speedLimit => (settings['speedLimit'] as num?)?.toDouble() ?? 0;
  Place? placeById(String? id) => id == null ? null : places.where((p) => p.id == id).firstOrNull;
  Member? member(String id) => members.where((m) => m.id == id).firstOrNull;
}

class Ev {
  final int id, circle, ts;
  final String type, member;
  final String? target;
  final Map<String, dynamic> data;
  Ev({required this.id, required this.circle, required this.ts, required this.type, required this.member, this.target, required this.data});
  factory Ev.fromJson(Map<String, dynamic> j) => Ev(
        id: _i(j['id']),
        circle: _i(j['circle']),
        ts: _i(j['ts']),
        type: (j['type'] ?? '').toString(),
        member: (j['member'] ?? '').toString(),
        target: j['target']?.toString(),
        data: j['data'] is Map ? Map<String, dynamic>.from(j['data']) : {},
      );
  Map<String, dynamic> toJson() => {'id': id, 'circle': circle, 'ts': ts, 'type': type, 'member': member, 'target': target, 'data': data};
  DateTime get time => DateTime.fromMillisecondsSinceEpoch(ts);
  LatLng? get pos => data['lat'] is num && data['lng'] is num ? LatLng((data['lat'] as num).toDouble(), (data['lng'] as num).toDouble()) : null;
  String get text => (data['text'] ?? '').toString();
}
