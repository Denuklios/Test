import 'package:material_ui/material_ui.dart';
import 'package:latlong2/latlong.dart';

import '../geo.dart';
import '../store.dart';
import '../tracker.dart';
import '../ui.dart';

/// „Bin hier ✓“ – aktuellen Ort mit kurzer Nachricht an den Kreis
Future<void> showCheckin(BuildContext context) async {
  await showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => const _Checkin());
}

class _Checkin extends StatefulWidget {
  const _Checkin();
  @override
  State<_Checkin> createState() => _CheckinState();
}

class _CheckinState extends State<_Checkin> {
  final text = TextEditingController();
  String? place;
  LatLng? pos;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    _locate();
  }

  Future<void> _locate() async {
    await Tracker.i.sendNow(precise: true);
    final p = Tracker.i.lastPos;
    if (p == null) return;
    pos = LatLng(p.latitude, p.longitude);
    final known = store.circle?.places.where((pl) => meters(pl.pos, pos!) <= pl.radius).firstOrNull;
    final name = known != null ? '${known.icon} ${known.name}' : await addressOf(pos!);
    if (mounted) setState(() => place = name ?? 'Aktueller Standort');
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Check-in', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
        const SizedBox(height: 4),
        const Text('Sag deinem Kreis, dass du gut angekommen bist.'),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(gradient: LinearGradient(colors: [violet.withValues(alpha: 0.16), magenta.withValues(alpha: 0.12)]), borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            const Icon(Icons.place_rounded, color: magenta),
            const SizedBox(width: 10),
            Expanded(child: place == null ? const LinearProgressIndicator() : Text(place!, style: const TextStyle(fontWeight: FontWeight.w700))),
          ]),
        ),
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final q in const ['Gut angekommen ✅', 'Bin in der Schule 🏫', 'Training fertig ⚽', 'Bin bei Freunden 🎉'])
            ActionChip(label: Text(q), onPressed: () => setState(() => text.text = q)),
        ]),
        const SizedBox(height: 12),
        TextField(controller: text, decoration: const InputDecoration(hintText: 'Nachricht (optional)')),
        const SizedBox(height: 16),
        GradientButton('Einchecken', icon: Icons.check_circle_rounded, onTap: busy || pos == null ? null : () async {
          setState(() => busy = true);
          final ok = await guard(context, () async {
            await store.send('checkin', text: text.text.trim().isEmpty ? null : text.text.trim(), lat: pos!.latitude, lng: pos!.longitude, place: place);
            return true;
          });
          if (!context.mounted) return;
          if (ok == true) {
            Navigator.pop(context);
            toast(context, 'Eingecheckt ✓');
          } else {
            setState(() => busy = false);
          }
        }),
      ]),
    );
  }
}
