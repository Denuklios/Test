import 'dart:math';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../main.dart';
import '../models.dart';

/// Geburtstags-Feuerwerk: einmal am Tag beim ersten Öffnen der App
class Fireworks {
  static OverlayEntry? _entry;

  static Future<void> showIfBirthday(BuildContext context, {bool force = false}) async {
    final today = dateOnly(DateTime.now());
    final kids = store.occurrences(today, today).where((o) => o.ev.isBirthday).toList();
    if (kids.isEmpty || _entry != null) return;
    final p = await SharedPreferences.getInstance();
    final key = dayKey(today);
    if (!force && p.getString('fireworksShown') == key) return;
    await p.setString('fireworksShown', key);
    if (!context.mounted) return;
    final names = kids.map((o) {
      final age = o.ev.birthYear != null ? today.year - o.ev.birthYear! : null;
      return age != null && age > 0 ? '${o.ev.title} (wird $age)' : o.ev.title;
    }).toList();
    final text = names.length == 1 ? '🎂 ${names.first} hat heute Geburtstag!' : '🎂 Heute haben Geburtstag:\n${names.join('\n')}';
    _entry = OverlayEntry(builder: (_) => FireworksOverlay(text: text, onDone: hide));
    Overlay.of(context).insert(_entry!);
  }

  static void hide() {
    _entry?.remove();
    _entry = null;
  }
}

class _Spark {
  Offset pos;
  Offset vel;
  final Color color;
  final double size;
  final List<Offset> trail = [];
  _Spark(this.pos, this.vel, this.color, this.size);
}

class _Rocket {
  Offset pos;
  final Offset vel;
  final double burstAt; // Höhe (Anteil vom Bildschirm), bei der sie zerplatzt
  final Color color;
  bool burst = false;
  _Rocket(this.pos, this.vel, this.burstAt, this.color);
}

class FireworksOverlay extends StatefulWidget {
  final String text;
  final VoidCallback onDone;
  final Duration duration;
  const FireworksOverlay({super.key, required this.text, required this.onDone, this.duration = const Duration(seconds: 6)});
  @override
  State<FireworksOverlay> createState() => FireworksOverlayState();
}

class FireworksOverlayState extends State<FireworksOverlay> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: widget.duration)
    ..addListener(_tick)
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) widget.onDone();
    })
    ..forward();
  final _rnd = Random(7);
  final rockets = <_Rocket>[];
  final sparks = <_Spark>[];
  double _last = 0;
  double _nextLaunch = 0;
  Size _size = Size.zero;

  static const _colors = [
    Color(0xFFFF5252), Color(0xFFFFD740), Color(0xFF69F0AE), Color(0xFF40C4FF),
    Color(0xFFE040FB), Color(0xFFFF6E40), Color(0xFFFFFFFF), Color(0xFFB2FF59),
  ];

  /// Simuliert bis zum Zeitpunkt t (Sekunden) – auch für Tests nutzbar
  void advanceTo(double t) {
    while (_last < t) {
      _step(min(1 / 60, t - _last));
    }
  }

  void _tick() {
    if (_size == Size.zero) return;
    advanceTo(_c.value * widget.duration.inMilliseconds / 1000);
    setState(() {});
  }

  void _step(double dt) {
    _last += dt;
    final total = widget.duration.inMilliseconds / 1000;
    // neue Raketen in den ersten ~70 % der Zeit
    if (_last >= _nextLaunch && _last < total * 0.7) {
      final n = 1 + _rnd.nextInt(2);
      for (var i = 0; i < n; i++) {
        final x = _size.width * (0.15 + _rnd.nextDouble() * 0.7);
        rockets.add(_Rocket(Offset(x, _size.height + 10), Offset((_rnd.nextDouble() - 0.5) * 60, -(_size.height * (0.85 + _rnd.nextDouble() * 0.35))),
            0.18 + _rnd.nextDouble() * 0.3, _colors[_rnd.nextInt(_colors.length)]));
      }
      _nextLaunch = _last + 0.35 + _rnd.nextDouble() * 0.45;
    }
    for (final r in rockets) {
      if (r.burst) continue;
      r.pos += r.vel * dt;
      if (r.pos.dy <= _size.height * r.burstAt) {
        r.burst = true;
        final count = 60 + _rnd.nextInt(40);
        final second = _colors[_rnd.nextInt(_colors.length)];
        for (var i = 0; i < count; i++) {
          final a = 2 * pi * i / count + _rnd.nextDouble() * 0.2;
          final sp = 140 + _rnd.nextDouble() * 220;
          sparks.add(_Spark(r.pos, Offset(cos(a), sin(a)) * sp, i.isEven ? r.color : second, 2.2 + _rnd.nextDouble() * 2.2));
        }
      }
    }
    rockets.removeWhere((r) => r.burst);
    for (final s in sparks) {
      s.trail.insert(0, s.pos);
      if (s.trail.length > 6) s.trail.removeLast();
      s.vel = Offset(s.vel.dx * 0.985, s.vel.dy * 0.985 + 160 * dt); // Schwerkraft & Luftwiderstand
      s.pos += s.vel * dt;
    }
    sparks.removeWhere((s) => s.pos.dy > _size.height + 20);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = _c.value;
    final fadeOut = t > 0.85 ? (1 - (t - 0.85) / 0.15) : 1.0;
    final bannerIn = Curves.elasticOut.transform((t * 4).clamp(0.0, 1.0));
    return LayoutBuilder(builder: (context, cons) {
      _size = cons.biggest;
      return GestureDetector(
        onTap: widget.onDone,
        child: Material(
          color: Colors.black.withValues(alpha: 0.55 * fadeOut),
          child: Stack(children: [
            Positioned.fill(child: CustomPaint(painter: _FireworksPainter(this, fadeOut))),
            Align(
              alignment: const Alignment(0, 0.35),
              child: Opacity(
                opacity: fadeOut.clamp(0.0, 1.0),
                child: Transform.scale(
                  scale: 0.4 + 0.6 * bannerIn,
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 24),
                    padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
                    decoration: BoxDecoration(
                      color: Color(store.birthdayColor),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 16, offset: Offset(0, 6))],
                    ),
                    child: Text(widget.text,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, height: 1.3)),
                  ),
                ),
              ),
            ),
          ]),
        ),
      );
    });
  }
}

class _FireworksPainter extends CustomPainter {
  final FireworksOverlayState s;
  final double fade;
  _FireworksPainter(this.s, this.fade);

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..strokeCap = StrokeCap.round;
    for (final r in s.rockets) {
      p
        ..color = Colors.white.withValues(alpha: 0.9 * fade)
        ..strokeWidth = 3;
      canvas.drawLine(r.pos, r.pos - r.vel * 0.04, p);
    }
    for (final sp in s.sparks) {
      for (var i = 0; i < sp.trail.length; i++) {
        p
          ..color = sp.color.withValues(alpha: (0.5 * (1 - i / sp.trail.length)) * fade)
          ..strokeWidth = sp.size * (1 - i / sp.trail.length);
        canvas.drawLine(i == 0 ? sp.pos : sp.trail[i - 1], sp.trail[i], p);
      }
      p.color = sp.color.withValues(alpha: fade);
      canvas.drawCircle(sp.pos, sp.size, p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}
