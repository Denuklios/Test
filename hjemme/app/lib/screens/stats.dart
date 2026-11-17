import 'package:material_ui/material_ui.dart';

import '../geo.dart';
import '../models.dart';
import '../store.dart';
import '../ui.dart';

/// Wochenrückblick: Strecke, Fahrten, Höchsttempo, Zeit an Orten
class StatsScreen extends StatefulWidget {
  final Member member;
  const StatsScreen({super.key, required this.member});
  @override
  State<StatsScreen> createState() => _StatsScreenState();
}

class _StatsScreenState extends State<StatsScreen> {
  WeekStats? st;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final now = DateTime.now();
      final rows = await store.history(widget.member.id, now.subtract(const Duration(days: 7)), now);
      final s = stats(rows.map(Pt.fromRow).toList(), store.circle?.places ?? [], store.circle?.speedLimit ?? 0);
      if (mounted) setState(() => st = s);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = st;
    return Scaffold(
      appBar: AppBar(title: Text('Woche · ${widget.member.name}')),
      body: s == null
          ? Center(child: error == null ? const CircularProgressIndicator() : Text(error!))
          : ListView(padding: const EdgeInsets.all(16), children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(gradient: brandGradient, borderRadius: BorderRadius.circular(24)),
                child: Row(children: [
                  Avatar(widget.member, size: 60),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('Letzte 7 Tage', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
                      Text(fmtDist(s.distance), style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w900)),
                      Text('${s.trips} Wege · ${s.drives} Autofahrten', style: const TextStyle(color: Colors.white)),
                    ]),
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              Row(children: [
                _tile('🚗', fmtDist(s.driveDistance), 'mit dem Auto'),
                const SizedBox(width: 12),
                _tile('⏱️', fmtDuration(s.driveTime), 'Fahrzeit'),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                _tile('🏎️', '${s.topKmh.round()} km/h', 'Höchsttempo'),
                const SizedBox(width: 12),
                _tile(s.speeding == 0 ? '😇' : '⚠️', s.speeding == 0 ? 'Vorbildlich' : '${s.speeding}×',
                    (store.circle?.speedLimit ?? 0) > 0 ? 'über ${store.circle!.speedLimit.round()} km/h' : 'kein Tempolimit gesetzt'),
              ]),
              const SizedBox(height: 24),
              const Text('Strecke pro Tag', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              const SizedBox(height: 12),
              SizedBox(height: 150, child: _bars(s)),
              const SizedBox(height: 24),
              if (s.placeTime.isNotEmpty) ...[
                const Text('Zeit an Orten', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                const SizedBox(height: 8),
                for (final e in (s.placeTime.entries.toList()..sort((a, b) => b.value.compareTo(a.value))))
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Text(store.circle?.places.where((p) => p.name == e.key).firstOrNull?.icon ?? '📍', style: const TextStyle(fontSize: 24)),
                    title: Text(e.key, style: const TextStyle(fontWeight: FontWeight.w700)),
                    trailing: Text(fmtDuration(e.value), style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
              ],
            ]),
    );
  }

  Widget _tile(String e, String v, String l) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(e, style: const TextStyle(fontSize: 24)),
              const SizedBox(height: 6),
              Text(v, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              Text(l, style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6))),
            ]),
          ),
        ),
      );

  Widget _bars(WeekStats s) {
    const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    final maxV = s.perDay.values.fold<double>(1, (a, b) => b > a ? b : a);
    final today = DateTime.now().weekday;
    final order = [for (var i = 6; i >= 0; i--) ((today - 1 - i) % 7 + 7) % 7 + 1];
    return Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
      for (final d in order)
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 5),
            child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
              Text((s.perDay[d] ?? 0) < 100 ? '' : '${((s.perDay[d] ?? 0) / 1000).round()}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Container(
                height: 4 + 100 * (s.perDay[d] ?? 0) / maxV,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [coral, magenta, violet], begin: Alignment.topCenter, end: Alignment.bottomCenter),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              const SizedBox(height: 6),
              Text(names[d - 1], style: TextStyle(fontWeight: d == today ? FontWeight.w900 : FontWeight.w500)),
            ]),
          ),
        ),
    ]);
  }
}
