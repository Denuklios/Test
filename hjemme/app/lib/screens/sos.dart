import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../geo.dart';
import '../store.dart';
import '../tracker.dart';
import '../ui.dart';

/// SOS: 3 Sekunden gedrückt halten → Alarm an alle Kreise mit Standort
class SosScreen extends StatefulWidget {
  const SosScreen({super.key});
  @override
  State<SosScreen> createState() => _SosScreenState();
}

class _SosScreenState extends State<SosScreen> with TickerProviderStateMixin {
  late final hold = AnimationController(vsync: this, duration: const Duration(seconds: 3))
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) _fire();
    });
  late final pulse = Tween(begin: 0.96, end: 1.04).animate(CurvedAnimation(parent: _pulseCtl, curve: Curves.easeInOut));
  late final _pulseCtl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
  final note = TextEditingController();
  bool sending = false;
  Timer? _resend;

  bool get active => store.activeSos(store.api.memberId ?? '') != null;

  @override
  void dispose() {
    hold.dispose();
    _pulseCtl.dispose();
    _resend?.cancel();
    super.dispose();
  }

  Future<void> _fire() async {
    HapticFeedback.heavyImpact();
    setState(() => sending = true);
    await Tracker.i.sendNow(precise: true);
    final p = Tracker.i.lastPos;
    await guard(context, () => store.send('sos', text: note.text.trim().isEmpty ? null : note.text.trim(), lat: p?.latitude, lng: p?.longitude));
    // während des Alarms häufiger senden
    _resend = Timer.periodic(const Duration(seconds: 30), (_) => Tracker.i.sendNow(precise: true));
    if (mounted) setState(() => sending = false);
    hold.reset();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) => Scaffold(
        backgroundColor: const Color(0xFF0B1433),
        appBar: AppBar(backgroundColor: Colors.transparent, foregroundColor: Colors.white, title: const Text('SOS')),
        body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(24), children: active ? _activeView() : _armView()),
        ),
      ),
    );
  }

  List<Widget> _armView() => [
        const Text('Hilfe holen', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
        const SizedBox(height: 6),
        Text('Halte den Knopf 3 Sekunden gedrückt. Alle in deinen Kreisen bekommen einen lauten Alarm mit deinem Standort.',
            textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.75), height: 1.4)),
        const SizedBox(height: 28),
        Center(
          child: GestureDetector(
            onTapDown: (_) {
              HapticFeedback.mediumImpact();
              hold.forward();
            },
            onTapUp: (_) => hold.isCompleted ? null : hold.reverse(),
            onTapCancel: () => hold.isCompleted ? null : hold.reverse(),
            child: AnimatedBuilder(
              animation: Listenable.merge([hold, pulse]),
              builder: (_, __) => Transform.scale(
                scale: hold.value > 0 ? 1 + hold.value * 0.06 : pulse.value,
                child: SizedBox(
                  width: 280,
                  height: 280,
                  child: Stack(alignment: Alignment.center, children: [
                    ClipOval(child: Image.asset('assets/sos.jpg', width: 280, height: 280, fit: BoxFit.cover)),
                    SizedBox(
                      width: 270,
                      height: 270,
                      child: CircularProgressIndicator(value: hold.value, strokeWidth: 10, color: Colors.white, backgroundColor: Colors.transparent),
                    ),
                    if (sending) const CircularProgressIndicator(color: Colors.white),
                    if (!sending)
                      Positioned(
                        bottom: 40,
                        child: Text(hold.value > 0 ? '${(3 - hold.value * 3).ceil()}' : 'Halten',
                            style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900, shadows: [Shadow(blurRadius: 8)])),
                      ),
                  ]),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 28),
        TextField(
          controller: note,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: 'Kurze Info (optional), z. B. „Unfall, bin okay“',
            hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4)),
            fillColor: Colors.white.withValues(alpha: 0.08),
          ),
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white38), padding: const EdgeInsets.all(16)),
          onPressed: () => launchUrl(Uri.parse('tel:112')),
          icon: const Icon(Icons.phone_rounded),
          label: const Text('Notruf 112 anrufen'),
        ),
      ];

  List<Widget> _activeView() {
    final e = store.activeSos(store.api.memberId!)!;
    return [
      const SizedBox(height: 20),
      const Center(child: Text('🆘', style: TextStyle(fontSize: 80))),
      const SizedBox(height: 12),
      const Text('Alarm ist raus', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
      const SizedBox(height: 8),
      Text('Gesendet um ${hm(e.time)}. Dein Kreis sieht deinen Standort und bekommt alle 30 Sekunden ein Update, solange diese Seite offen ist.',
          textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.8), height: 1.4)),
      const SizedBox(height: 32),
      GradientButton('Mir geht es gut', icon: Icons.favorite_rounded, onTap: () async {
        _resend?.cancel();
        await guard(context, () => store.send('sos_ok'));
      }),
      const SizedBox(height: 12),
      OutlinedButton(
        style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white38), padding: const EdgeInsets.all(16)),
        onPressed: () async {
          _resend?.cancel();
          await guard(context, () => store.send('sos_cancel'));
        },
        child: const Text('Versehentlich – Alarm zurücknehmen'),
      ),
      const SizedBox(height: 12),
      FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE53935)),
        onPressed: () => launchUrl(Uri.parse('tel:112')),
        icon: const Icon(Icons.phone_rounded),
        label: const Text('Notruf 112 anrufen'),
      ),
    ];
  }
}
