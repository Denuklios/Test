import 'dart:convert';
import 'dart:math' as math;

import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import 'api.dart';
import 'models.dart';

const _dist = Distance();

double meters(LatLng a, LatLng b) => _dist.as(LengthUnit.Meter, a, b);

String fmtDist(double m) {
  if (m < 1000) return '${m.round()} m';
  if (m < 10000) return '${(m / 1000).toStringAsFixed(1).replaceAll('.', ',')} km';
  return '${(m / 1000).round()} km';
}

String fmtDuration(Duration d) {
  if (d.inMinutes < 1) return 'unter 1 Min.';
  if (d.inMinutes < 60) return '${d.inMinutes} Min.';
  final h = d.inHours, m = d.inMinutes % 60;
  if (h < 24) return m == 0 ? '$h Std.' : '$h Std. $m Min.';
  return '${d.inDays} Tg. ${h % 24} Std.';
}

String ago(DateTime t, {DateTime? now}) {
  final d = (now ?? DateTime.now()).difference(t);
  if (d.inSeconds < 90) return 'gerade eben';
  if (d.inMinutes < 60) return 'vor ${d.inMinutes} Min.';
  if (d.inHours < 24) return 'vor ${d.inHours} Std.';
  if (d.inDays == 1) return 'gestern ${DateFormat.Hm('de').format(t)}';
  return DateFormat('d. MMM, HH:mm', 'de').format(t);
}

String hm(DateTime t) => DateFormat.Hm('de').format(t);

// ---------- Verlauf in Aufenthalte und Fahrten zerlegen ----------

class Pt {
  final DateTime t;
  final LatLng p;
  final double? acc, spd;
  final int? bat;
  Pt(this.t, this.p, {this.acc, this.spd, this.bat});
  static Pt fromRow(List r) => Pt(DateTime.fromMillisecondsSinceEpoch((r[0] as num).toInt()),
      LatLng((r[1] as num).toDouble(), (r[2] as num).toDouble()),
      acc: (r[3] as num?)?.toDouble(), spd: (r[4] as num?)?.toDouble(), bat: (r[5] as num?)?.toInt());
}

enum Mode { walk, bike, drive }

abstract class Segment {
  DateTime get start;
  DateTime get end;
  Duration get duration => end.difference(start);
}

class Stay extends Segment {
  @override
  final DateTime start;
  @override
  DateTime end;
  final LatLng center;
  Place? place;
  Stay(this.start, this.end, this.center);
}

class Trip extends Segment {
  final List<Pt> pts;
  Trip(this.pts);
  @override
  DateTime get start => pts.first.t;
  @override
  DateTime get end => pts.last.t;
  double get distance {
    var d = 0.0;
    for (var i = 1; i < pts.length; i++) {
      d += meters(pts[i - 1].p, pts[i].p);
    }
    return d;
  }

  double get maxKmh {
    var m = 0.0;
    for (final p in pts) {
      if (p.spd != null && (p.acc ?? 99) < 60) m = math.max(m, p.spd! * 3.6);
    }
    // ohne Tempo-Werte: aus Abständen schätzen
    if (m == 0) {
      for (var i = 1; i < pts.length; i++) {
        final s = pts[i].t.difference(pts[i - 1].t).inSeconds;
        if (s >= 5) m = math.max(m, meters(pts[i - 1].p, pts[i].p) / s * 3.6);
      }
    }
    return m;
  }

  double get avgKmh => duration.inSeconds < 1 ? 0 : distance / duration.inSeconds * 3.6;
  Mode get mode {
    if (maxKmh > 35 || avgKmh > 20) return Mode.drive;
    if (avgKmh > 9 || maxKmh > 20) return Mode.bike;
    return Mode.walk;
  }

  int speedingPoints(double limit) => limit <= 0 ? 0 : pts.where((p) => (p.spd ?? 0) * 3.6 > limit).length;
}

/// Ein Aufenthalt: mind. [minStay] lang innerhalb von [radius] Metern.
List<Segment> _segmentChunk(List<Pt> pts, {List<Place> places = const [], double radius = 120, Duration minStay = const Duration(minutes: 5)}) {
  final out = <Segment>[];
  if (pts.isEmpty) return out;
  final good = pts.where((p) => (p.acc ?? 0) <= 200).toList();
  if (good.isEmpty) return out;
  var tripPts = <Pt>[];
  var i = 0;
  while (i < good.length) {
    // versuchen, ab i einen Aufenthalt aufzubauen
    var j = i;
    var lat = good[i].p.latitude, lng = good[i].p.longitude, n = 1;
    while (j + 1 < good.length && meters(LatLng(lat / n, lng / n), good[j + 1].p) <= radius) {
      j++;
      lat += good[j].p.latitude;
      lng += good[j].p.longitude;
      n++;
    }
    final center = LatLng(lat / n, lng / n);
    // Lücke bis zum nächsten Punkt zählt zum Aufenthalt, wenn kaum Bewegung
    final end = good[j].t;
    if (end.difference(good[i].t) >= minStay || (j == good.length - 1 && i == 0 && good.length == 1)) {
      if (tripPts.isNotEmpty) {
        tripPts.add(good[i]);
        if (tripPts.length >= 2 && Trip(tripPts).distance > 250) {
          out.add(Trip(List.of(tripPts)));
        } else if (out.isNotEmpty && out.last is Stay) {
          // Mini-Bewegung: dem letzten Aufenthalt zuschlagen
        }
        tripPts = [];
      }
      final s = Stay(good[i].t, end, center);
      if (out.isNotEmpty && out.last is Stay && meters((out.last as Stay).center, center) <= radius) {
        (out.last as Stay).end = end;
      } else {
        out.add(s);
      }
      if (j + 1 < good.length) tripPts = [good[j]];
      i = j + 1;
    } else {
      tripPts.add(good[i]);
      i++;
    }
  }
  if (tripPts.length >= 2 && Trip(tripPts).distance > 250) out.add(Trip(tripPts));
  for (final s in out.whereType<Stay>()) {
    Place? best;
    var bd = double.infinity;
    for (final p in places) {
      final d = meters(p.pos, s.center);
      if (d <= p.radius + 60 && d < bd) {
        bd = d;
        best = p;
      }
    }
    s.place = best;
  }
  return out;
}

/// Zeitraum ohne Standortdaten (Handy aus, kein Netz, App vom System beendet)
class Gap extends Segment {
  @override
  final DateTime start, end;
  final LatLng from, to;
  Gap(this.start, this.end, this.from, this.to);
}

/// Längere Pausen zwischen zwei Punkten, in denen die Person woanders war, sind Lücken –
/// sie werden nicht als gerade „Fahrt“ verbunden.
bool isGap(Pt a, Pt b) {
  final dt = b.t.difference(a.t);
  final d = meters(a.p, b.p);
  return dt > const Duration(minutes: 12) && d > 600 && d / dt.inSeconds < 50; // < 50 m/s, sonst Ausreißer
}

/// Punkte an Lücken in zusammenhängende Stücke teilen
List<List<Pt>> splitAtGaps(List<Pt> pts) {
  final out = <List<Pt>>[];
  var cur = <Pt>[];
  for (final p in pts) {
    if (cur.isNotEmpty && isGap(cur.last, p)) {
      out.add(cur);
      cur = [];
    }
    cur.add(p);
  }
  if (cur.isNotEmpty) out.add(cur);
  return out;
}

List<Segment> segment(List<Pt> pts, {List<Place> places = const [], double radius = 120, Duration minStay = const Duration(minutes: 5)}) {
  final good = pts.where((p) => (p.acc ?? 0) <= 200).toList();
  final chunks = splitAtGaps(good);
  final out = <Segment>[];
  for (var i = 0; i < chunks.length; i++) {
    if (i > 0) out.add(Gap(chunks[i - 1].last.t, chunks[i].first.t, chunks[i - 1].last.p, chunks[i].first.p));
    out.addAll(_segmentChunk(chunks[i], places: places, radius: radius, minStay: minStay));
  }
  return out;
}

class WeekStats {
  double distance = 0, driveDistance = 0, topKmh = 0;
  int trips = 0, drives = 0, speeding = 0;
  Duration driveTime = Duration.zero;
  final Map<String, Duration> placeTime = {};
  final Map<int, double> perDay = {}; // Wochentag 1..7 -> Meter
}

WeekStats stats(List<Pt> pts, List<Place> places, double limit) {
  final st = WeekStats();
  for (final s in segment(pts, places: places)) {
    if (s is Trip) {
      st.trips++;
      final d = s.distance;
      st.distance += d;
      st.perDay[s.start.weekday] = (st.perDay[s.start.weekday] ?? 0) + d;
      st.topKmh = math.max(st.topKmh, s.maxKmh);
      st.speeding += s.speedingPoints(limit);
      if (s.mode == Mode.drive) {
        st.drives++;
        st.driveDistance += d;
        st.driveTime += s.duration;
      }
    } else if (s is Stay && s.place != null) {
      st.placeTime[s.place!.name] = (st.placeTime[s.place!.name] ?? Duration.zero) + s.duration;
    }
  }
  return st;
}

// ---------- Adressen (OpenStreetMap Nominatim) ----------

final Map<String, String> _addrCache = {};
DateTime _lastNominatim = DateTime(2000);

Future<void> _politeWait() async {
  final wait = const Duration(milliseconds: 1100) - DateTime.now().difference(_lastNominatim);
  if (!wait.isNegative) await Future.delayed(wait);
  _lastNominatim = DateTime.now();
}

Future<String?> addressOf(LatLng p) async {
  final key = '${p.latitude.toStringAsFixed(4)},${p.longitude.toStringAsFixed(4)}';
  if (_addrCache.containsKey(key)) return _addrCache[key];
  try {
    await _politeWait();
    final r = await http.get(
        Uri.parse('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=de'
            '&lat=${p.latitude}&lon=${p.longitude}'),
        headers: {'User-Agent': userAgent}).timeout(const Duration(seconds: 10));
    final j = jsonDecode(utf8.decode(r.bodyBytes));
    final a = (j['address'] ?? {}) as Map;
    final street = [a['road'] ?? a['pedestrian'] ?? a['footway'] ?? a['path'], a['house_number']].whereType<String>().join(' ');
    final town = (a['city'] ?? a['town'] ?? a['village'] ?? a['suburb'] ?? a['municipality'] ?? '').toString();
    final s = [if (street.isNotEmpty) street, if (town.isNotEmpty) town].join(', ');
    final res = s.isEmpty ? (j['display_name'] ?? '').toString().split(',').take(2).join(',') : s;
    _addrCache[key] = res;
    return res;
  } catch (_) {
    return null;
  }
}

class SearchHit {
  final String name, detail;
  final LatLng pos;
  SearchHit(this.name, this.detail, this.pos);
}

Future<List<SearchHit>> searchPlaces(String q, {LatLng? near}) async {
  if (q.trim().length < 3) return [];
  await _politeWait();
  final vb = near == null
      ? ''
      : '&viewbox=${near.longitude - 1},${near.latitude + 1},${near.longitude + 1},${near.latitude - 1}';
  final r = await http.get(
      Uri.parse('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=de&q=${Uri.encodeQueryComponent(q)}$vb'),
      headers: {'User-Agent': userAgent}).timeout(const Duration(seconds: 12));
  final list = jsonDecode(utf8.decode(r.bodyBytes)) as List;
  return [
    for (final e in list)
      SearchHit(
        (e['name'] ?? '').toString().isEmpty ? e['display_name'].toString().split(',').first : e['name'].toString(),
        e['display_name'].toString().split(',').skip(1).take(3).join(',').trim(),
        LatLng(double.parse(e['lat'].toString()), double.parse(e['lon'].toString())),
      )
  ];
}

/// Fahrzeit mit dem Auto in Minuten (OSRM), sonst grobe Schätzung.
Future<int> driveMinutes(LatLng a, LatLng b) async {
  try {
    final r = await http
        .get(Uri.parse('https://router.project-osrm.org/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=false'),
            headers: {'User-Agent': userAgent})
        .timeout(const Duration(seconds: 8));
    final j = jsonDecode(r.body);
    final s = (j['routes'][0]['duration'] as num).toDouble();
    return math.max(1, (s / 60).round());
  } catch (_) {
    final km = meters(a, b) / 1000 * 1.3;
    return math.max(1, (km / 45 * 60).round());
  }
}

class LatLngX {
  static LatLng of(dynamic p) => LatLng(p.latitude as double, p.longitude as double);
}
