import 'package:material_ui/material_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import '../geo.dart';
import '../models.dart';
import '../store.dart';
import '../ui.dart';

/// Tagesverlauf: Strecke auf der Karte, Aufenthalte und Fahrten, Wiedergabe
class HistoryScreen extends StatefulWidget {
  final Member member;
  const HistoryScreen({super.key, required this.member});
  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  final map = MapController();
  DateTime day = DateTime.now();
  List<Pt> pts = [];
  List<Segment> segs = [];
  bool loading = true;
  String? error;
  double play = 1; // 0..1 Wiedergabe
  Segment? selected;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      error = null;
      selected = null;
    });
    final from = DateTime(day.year, day.month, day.day);
    try {
      final rows = await store.history(widget.member.id, from, from.add(const Duration(days: 1)));
      pts = rows.map(Pt.fromRow).toList();
      segs = segment(pts, places: store.circle?.places ?? []);
      play = 1;
      if (pts.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _fit(pts.map((p) => p.p).toList()));
      }
    } catch (e) {
      error = e.toString();
    }
    if (mounted) setState(() => loading = false);
  }

  void _fit(List<LatLng> p) {
    if (p.isEmpty) return;
    if (p.length == 1) {
      map.move(p.first, 15);
    } else {
      map.fitCamera(CameraFit.bounds(bounds: LatLngBounds.fromPoints(p), padding: const EdgeInsets.all(40), maxZoom: 16));
    }
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final color = mColor(widget.member.color);
    final shown = pts.isEmpty ? <Pt>[] : pts.sublist(0, (pts.length * play).clamp(1, pts.length).round());
    final trips = segs.whereType<Trip>().toList();
    final dist = trips.fold<double>(0, (s, t) => s + t.distance);
    return Scaffold(
      appBar: AppBar(title: Text('Verlauf · ${widget.member.name}')),
      body: Column(children: [
        SizedBox(
          height: 52,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 10), children: [
            for (var i = 0; i < 30; i++) _dayChip(DateTime.now().subtract(Duration(days: i))),
          ]),
        ),
        Expanded(
          flex: 5,
          child: Stack(children: [
            FlutterMap(
              mapController: map,
              options: MapOptions(
                initialCenter: widget.member.last?.pos ?? const LatLng(51.1657, 10.4515),
                initialZoom: 13,
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
              ),
              children: [
                TileLayer(urlTemplate: tileUrl(store.mapStyle, dark), subdomains: const ['a', 'b', 'c', 'd'], retinaMode: true, userAgentPackageName: 'de.familie.hjemme'),
                PolylineLayer(polylines: [
                  if (shown.length > 1)
                    Polyline(points: shown.map((p) => p.p).toList(), strokeWidth: 5, gradientColors: [violet, magenta, coral], borderColor: Colors.white, borderStrokeWidth: 1.5),
                  if (selected is Trip)
                    Polyline(points: (selected as Trip).pts.map((p) => p.p).toList(), strokeWidth: 8, color: color.withValues(alpha: 0.85)),
                ]),
                MarkerLayer(markers: [
                  for (final s in segs.whereType<Stay>())
                    Marker(
                      point: s.center,
                      width: 30,
                      height: 30,
                      child: Container(
                        decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, border: Border.all(color: violet, width: 2.5)),
                        alignment: Alignment.center,
                        child: Text(s.place?.icon ?? '•', style: const TextStyle(fontSize: 14)),
                      ),
                    ),
                  if (shown.isNotEmpty)
                    Marker(point: shown.last.p, width: 40, height: 40, child: Avatar(widget.member, size: 40)),
                ]),
              ],
            ),
            if (loading) const Center(child: CircularProgressIndicator()),
            if (!loading && pts.isEmpty)
              Center(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(error ?? 'Für diesen Tag gibt es keinen Verlauf.'),
                  ),
                ),
              ),
          ]),
        ),
        if (pts.length > 1)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              const Icon(Icons.play_circle_outline_rounded),
              Expanded(child: Slider(value: play, onChanged: (v) => setState(() => play = v))),
              Text(hm(shown.last.t), style: const TextStyle(fontWeight: FontWeight.w800, fontFeatures: [FontFeature.tabularFigures()])),
            ]),
          ),
        if (pts.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
            child: Row(children: [
              _stat('🛣️', fmtDist(dist)),
              _stat('🚗', '${trips.where((t) => t.mode == Mode.drive).length} Fahrten'),
              _stat('📍', '${segs.whereType<Stay>().length} Orte'),
            ]),
          ),
        Expanded(
          flex: 4,
          child: ListView(padding: const EdgeInsets.only(bottom: 20), children: [
            for (final s in segs.reversed) _segTile(s),
          ]),
        ),
      ]),
    );
  }

  Widget _stat(String e, String t) => Expanded(
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(e),
          const SizedBox(width: 4),
          Text(t, style: const TextStyle(fontWeight: FontWeight.w800)),
        ]),
      );

  Widget _dayChip(DateTime d) {
    final now = DateTime.now();
    final same = d.year == day.year && d.month == day.month && d.day == day.day;
    final diff = DateTime(now.year, now.month, now.day).difference(DateTime(d.year, d.month, d.day)).inDays;
    final label = diff == 0 ? 'Heute' : diff == 1 ? 'Gestern' : DateFormat('E d.M.', 'de').format(d);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: same,
        onSelected: (_) {
          setState(() => day = d);
          _load();
        },
      ),
    );
  }

  Widget _segTile(Segment s) {
    final time = '${hm(s.start)} – ${hm(s.end)}';
    if (s is Stay) {
      return ListTile(
        leading: CircleAvatar(backgroundColor: violet.withValues(alpha: 0.15), child: Text(s.place?.icon ?? '📍', style: const TextStyle(fontSize: 18))),
        title: FutureBuilder<String?>(
          future: s.place == null ? addressOf(s.center) : Future.value(s.place!.name),
          builder: (_, snap) => Text(snap.data ?? 'Aufenthalt', style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
        subtitle: Text('$time · ${fmtDuration(s.duration)}'),
        onTap: () {
          setState(() => selected = s);
          map.move(s.center, 16);
        },
      );
    }
    final t = s as Trip;
    final mode = switch (t.mode) { Mode.drive => ('🚗', 'Fahrt'), Mode.bike => ('🚲', 'Rad / Roller'), Mode.walk => ('🚶', 'Zu Fuß') };
    final limit = store.circle?.speedLimit ?? 0;
    final fast = t.speedingPoints(limit);
    return ListTile(
      selected: selected == s,
      leading: CircleAvatar(backgroundColor: magenta.withValues(alpha: 0.15), child: Text(mode.$1, style: const TextStyle(fontSize: 18))),
      title: Text('${mode.$2} · ${fmtDist(t.distance)}', style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text('$time · ${fmtDuration(t.duration)} · max. ${t.maxKmh.round()} km/h${fast > 0 ? ' · ⚠️ zu schnell' : ''}'),
      onTap: () {
        setState(() => selected = s);
        _fit(t.pts.map((p) => p.p).toList());
      },
    );
  }
}
