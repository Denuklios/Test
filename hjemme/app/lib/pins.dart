import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import 'models.dart';
import 'ui.dart';

/// Drei Entwürfe für die Personen-Markierung auf der Karte (Stil des App-Icons:
/// Glas, Leuchten, Verlauf Violett → Magenta → Koralle).
/// Alle sind unten mittig verankert: die untere Mitte ist genau die Position.
enum PinStyle { heart, drop, orb }

class StyledPin extends StatelessWidget {
  final Member m;
  final PinStyle style;
  final bool selected, sos;
  const StyledPin(this.m, {super.key, required this.style, this.selected = false, this.sos = false});

  @override
  Widget build(BuildContext context) {
    final base = sos ? const Color(0xFFFF2D55) : mColor(m.color);
    final l = m.last;
    final stale = l == null || DateTime.now().difference(l.time).inMinutes > 60;
    final scale = selected ? 1.15 : 1.0;
    final pin = switch (style) {
      PinStyle.heart => _heart(base),
      PinStyle.drop => _drop(base),
      PinStyle.orb => _orb(base),
    };
    return Opacity(
      opacity: stale ? 0.7 : 1,
      child: Transform.scale(
        scale: scale,
        alignment: Alignment.bottomCenter,
        child: Stack(clipBehavior: Clip.none, alignment: Alignment.bottomCenter, children: [
          pin,
          if (l?.driving == true) Positioned(right: 0, top: 0, child: _badge('🚗 ${l!.kmh.round()}', Colors.black87)),
          if (m.paused || !m.sharing) Positioned(right: 4, top: 0, child: _badge('⏸', Colors.black87)),
          if (l?.bat != null && l!.bat! <= 20) Positioned(left: 0, top: 6, child: _badge('🪫${l.bat}', const Color(0xFFD32F2F))),
        ]),
      ),
    );
  }

  // ---------- A: Herz-Pin wie das App-Icon ----------
  Widget _heart(Color c) {
    const w = 66.0, h = 64.0;
    return SizedBox(
      width: 84,
      height: 84,
      child: Stack(alignment: Alignment.bottomCenter, children: [
        Positioned(bottom: -3, child: _groundShadow(26)),
        Positioned(
          bottom: 0,
          child: CustomPaint(
            size: const Size(w, h),
            painter: _HeartPainter(c),
            child: SizedBox(
              width: w,
              height: h,
              child: Align(
                alignment: const Alignment(0, -0.22),
                child: _avatarRing(m, 34),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  // ---------- B: Glas-Tropfen ----------
  Widget _drop(Color c) {
    const w = 56.0, h = 70.0;
    return SizedBox(
      width: 84,
      height: 84,
      child: Stack(alignment: Alignment.bottomCenter, children: [
        Positioned(bottom: -4, child: _groundShadow(22)),
        Positioned(
          bottom: 0,
          child: CustomPaint(
            size: const Size(w, h),
            painter: _DropPainter(c),
            child: const SizedBox(width: w, height: h),
          ),
        ),
        Positioned(bottom: h - 8 - 40, child: _avatarRing(m, 40)),
      ]),
    );
  }

  // ---------- C: Leuchtkugel mit Lichtstrahl ----------
  Widget _orb(Color c) {
    return SizedBox(
      width: 84,
      height: 84,
      child: Stack(clipBehavior: Clip.none, alignment: Alignment.bottomCenter, children: [
        // Schatten auf dem Boden (Sonne von oben)
        const Positioned(left: 42, bottom: 0, child: CustomPaint(size: Size(1, 1), painter: _CastShadow())),
        // Lichtpunkt am Boden
        Positioned(
          bottom: -7,
          child: Container(
            width: 26,
            height: 14,
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.all(Radius.elliptical(26, 14)),
              gradient: RadialGradient(colors: [c.withValues(alpha: 0.8), c.withValues(alpha: 0)]),
            ),
          ),
        ),
        Positioned(
          bottom: -4,
          child: Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: [BoxShadow(color: c, blurRadius: 8, spreadRadius: 2)]),
          ),
        ),
        // Lichtstrahl
        Positioned(
          bottom: 0,
          child: Container(
            width: 4,
            height: 18,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(2),
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color.lerp(c, coral, 0.4)!, Colors.white]),
              boxShadow: [BoxShadow(color: c.withValues(alpha: 0.8), blurRadius: 6)],
            ),
          ),
        ),
        // Richtungspfeil beim Fahren
        if (m.last?.hdg != null && (m.last?.spd ?? 0) > 1.5 && !m.paused)
          Positioned(
            bottom: 60,
            left: 8,
            child: Transform.rotate(
              angle: m.last!.hdg! * math.pi / 180,
              child: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(colors: [c, Color.lerp(c, coral, 0.6)!]),
                  border: Border.all(color: Colors.white, width: 2),
                  boxShadow: [BoxShadow(color: c.withValues(alpha: 0.7), blurRadius: 6)],
                ),
                child: const Icon(Icons.navigation_rounded, size: 12, color: Colors.white),
              ),
            ),
          ),
        // Kugel
        Positioned(
          bottom: 16,
          child: Container(
            width: 58,
            height: 58,
            padding: const EdgeInsets.all(3.5),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: SweepGradient(
                transform: const GradientRotation(-math.pi / 2),
                colors: [c, Color.lerp(c, magenta, 0.6)!, Color.lerp(c, coral, 0.7)!, Color.lerp(c, violet, 0.5)!, c],
              ),
              boxShadow: [
                BoxShadow(color: c.withValues(alpha: 0.75), blurRadius: 18, spreadRadius: 1),
                BoxShadow(color: Color.lerp(c, coral, 0.6)!.withValues(alpha: 0.45), blurRadius: 30, spreadRadius: 4),
              ],
            ),
            child: Stack(children: [
              Container(
                decoration: const BoxDecoration(color: Color(0xFF0E1638), shape: BoxShape.circle),
                padding: const EdgeInsets.all(2),
                child: Avatar(m, size: 47, ring: false),
              ),
              // Glas-Glanz oben
              Positioned.fill(
                child: IgnorePointer(
                  child: Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.center,
                        colors: [Colors.white.withValues(alpha: 0.45), Colors.white.withValues(alpha: 0)],
                      ),
                    ),
                  ),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _groundShadow(double w) => Container(
        width: w,
        height: w * 0.32,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.all(Radius.elliptical(w, w * 0.32)),
          gradient: RadialGradient(colors: [Colors.black.withValues(alpha: 0.45), Colors.black.withValues(alpha: 0)]),
        ),
      );

  static Widget _avatarRing(Member m, double size) => Container(
        width: size,
        height: size,
        padding: const EdgeInsets.all(2.5),
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 4, offset: const Offset(0, 1))],
        ),
        child: Avatar(m, size: size - 5, ring: false),
      );

  static Widget _badge(String t, Color bg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.white, width: 1.5),
          boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4)],
        ),
        child: Text(t, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
      );
}

/// Glanz-Füllung wie das App-Icon: Verlauf, weicher Lichtschein, heller Rand, Glanzlicht
void _glossy(Canvas canvas, Path p, Size s, Color c) {
  final c2 = Color.lerp(c, magenta, 0.55)!, c3 = Color.lerp(c, coral, 0.75)!;
  // Leuchten
  canvas.drawPath(p, Paint()
    ..color = c.withValues(alpha: 0.75)
    ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 9));
  // Körper
  canvas.drawPath(p, Paint()
    ..shader = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [c, c2, c3]).createShader(Offset.zero & s));
  // Glanzlicht oben
  canvas.save();
  canvas.clipPath(p);
  canvas.drawOval(
    Rect.fromLTWH(s.width * 0.08, -s.height * 0.12, s.width * 0.84, s.height * 0.52),
    Paint()..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
        colors: [Colors.white.withValues(alpha: 0.55), Colors.white.withValues(alpha: 0.0)]).createShader(Rect.fromLTWH(0, -s.height * 0.12, s.width, s.height * 0.52)),
  );
  canvas.restore();
  // heller Glasrand
  canvas.drawPath(p, Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.6
    ..shader = LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight,
        colors: [Colors.white.withValues(alpha: 0.9), Colors.white.withValues(alpha: 0.25)]).createShader(Offset.zero & s));
}

class _HeartPainter extends CustomPainter {
  final Color c;
  _HeartPainter(this.c);
  @override
  void paint(Canvas canvas, Size s) {
    final w = s.width, h = s.height;
    final p = Path()
      ..moveTo(w / 2, h)
      ..cubicTo(w * 0.20, h * 0.80, 0, h * 0.56, 0, h * 0.32)
      ..cubicTo(0, h * 0.12, w * 0.14, 0, w * 0.29, 0)
      ..cubicTo(w * 0.40, 0, w * 0.47, h * 0.06, w / 2, h * 0.15)
      ..cubicTo(w * 0.53, h * 0.06, w * 0.60, 0, w * 0.71, 0)
      ..cubicTo(w * 0.86, 0, w, h * 0.12, w, h * 0.32)
      ..cubicTo(w, h * 0.56, w * 0.80, h * 0.80, w / 2, h)
      ..close();
    _glossy(canvas, p, s, c);
  }

  @override
  bool shouldRepaint(_HeartPainter o) => o.c != c;
}

class _DropPainter extends CustomPainter {
  final Color c;
  _DropPainter(this.c);
  @override
  void paint(Canvas canvas, Size s) {
    final w = s.width, h = s.height, r = w / 2;
    final cy = r;
    // Tropfen: Kreis oben, Spitze unten, mit weichen Übergängen
    final a = math.asin(r / (h - cy)); // Winkel der Tangente zur Spitze
    final p = Path()
      ..moveTo(w / 2, h)
      ..lineTo(w / 2 - r * math.cos(a), cy + r * math.sin(a))
      ..arcTo(Rect.fromCircle(center: Offset(w / 2, cy), radius: r), math.pi - a, math.pi + 2 * a, false)
      ..close();
    _glossy(canvas, p, s, c);
  }

  @override
  bool shouldRepaint(_DropPainter o) => o.c != c;
}

/// Schatten auf dem Boden bei Sonne von oben: weiche Ellipse genau unter der Kugel,
/// um den Fußpunkt herum, innen dunkel und nach außen auslaufend.
class _CastShadow extends CustomPainter {
  const _CastShadow();
  @override
  void paint(Canvas canvas, Size size) {
    const r = 30.0;
    final rect = Rect.fromCircle(center: Offset.zero, radius: r);
    canvas.save();
    canvas.scale(1, 0.32); // flach auf dem Boden
    canvas.drawCircle(
      Offset.zero,
      r,
      Paint()
        ..shader = RadialGradient(colors: [
          Colors.black.withValues(alpha: 0.32),
          Colors.black.withValues(alpha: 0.15),
          Colors.black.withValues(alpha: 0),
        ], stops: const [0, 0.5, 1]).createShader(rect),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_CastShadow o) => false;
}
