import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter_map/flutter_map.dart';
import 'package:material_ui/material_ui.dart';

import 'geo.dart';
import 'models.dart';
import 'store.dart';

// Farbwelt aus dem App-Icon: Nachtblau, Violett, Magenta, Koralle
const navy = Color(0xFF0E1A47);
const navy2 = Color(0xFF162762);
const violet = Color(0xFF6C3BFF);
const magenta = Color(0xFFE23BC8);
const coral = Color(0xFFFF6A3D);
const brandGradient = LinearGradient(colors: [violet, magenta, coral], begin: Alignment.topLeft, end: Alignment.bottomRight);

const memberColors = [0x6C3BFF, 0xE23BC8, 0xFF6A3D, 0x00B8A9, 0x2E86FF, 0xFFB400, 0x43C463, 0xFF4D6D, 0x8D6E63, 0x546E7A];
const memberEmojis = ['', '😎', '🦊', '🐼', '🦄', '🐯', '🐸', '🐙', '🌻', '⚽', '🎸', '🚀', '👑', '🐶', '🐱', '🍀'];
const placeIcons = ['🏠', '🏫', '🏢', '🏋️', '⚽', '🛒', '👵', '👴', '🏥', '🎵', '🌳', '⛪', '🏖️', '🍕', '🚉', '📍'];

ThemeData buildTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final scheme = ColorScheme.fromSeed(
    seedColor: violet,
    brightness: b,
    primary: dark ? const Color(0xFF9B7BFF) : violet,
    secondary: magenta,
    tertiary: coral,
    surface: dark ? const Color(0xFF0B1433) : const Color(0xFFF7F6FC),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surface,
    appBarTheme: AppBarTheme(backgroundColor: scheme.surface, surfaceTintColor: Colors.transparent, centerTitle: false),
    cardTheme: CardThemeData(
      elevation: 0,
      color: dark ? const Color(0xFF141F45) : Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: dark ? const Color(0xFF0F1A3D) : Colors.white,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
    ),
  );
}

Color mColor(int c) => Color(0xFF000000 | c);

/// Runder Avatar: Foto, Emoji oder Initialen, mit Farbring
class Avatar extends StatelessWidget {
  final Member m;
  final double size;
  final bool ring;
  const Avatar(this.m, {super.key, this.size = 44, this.ring = true});
  @override
  Widget build(BuildContext context) {
    final c = mColor(m.color);
    Widget inner;
    if (m.avatar != null && m.avatar!.isNotEmpty) {
      inner = Image.network(store.api.avatarUrl(m.avatar!), headers: store.api.headers, fit: BoxFit.cover, width: size, height: size,
          errorBuilder: (_, __, ___) => _letters(c));
    } else if (m.emoji.isNotEmpty) {
      inner = Container(
        color: c.withValues(alpha: 0.18),
        alignment: Alignment.center,
        child: Text(m.emoji, style: TextStyle(fontSize: size * 0.5)),
      );
    } else {
      inner = _letters(c);
    }
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(ring ? size * 0.06 : 0),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: ring ? LinearGradient(colors: [c, Color.lerp(c, Colors.white, 0.35)!], begin: Alignment.topLeft, end: Alignment.bottomRight) : null,
        boxShadow: ring ? [BoxShadow(color: c.withValues(alpha: 0.45), blurRadius: size * 0.25)] : null,
      ),
      child: ClipOval(child: SizedBox(width: size, height: size, child: inner)),
    );
  }

  Widget _letters(Color c) => Container(
        decoration: BoxDecoration(gradient: LinearGradient(colors: [c, Color.lerp(c, Colors.black, 0.25)!])),
        alignment: Alignment.center,
        child: Text(m.initials, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: size * 0.36)),
      );
}

/// Karten-Markierung: leuchtender Punkt genau auf der Position, darüber schwebt das Profilbild
class MemberPin extends StatefulWidget {
  final Member m;
  final bool selected, sos;
  const MemberPin(this.m, {super.key, this.selected = false, this.sos = false});
  @override
  State<MemberPin> createState() => _MemberPinState();
}

class _MemberPinState extends State<MemberPin> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final sos = widget.sos;
    final c = sos ? const Color(0xFFFF2D55) : mColor(m.color);
    final c2 = Color.lerp(c, sos ? coral : magenta, 0.55)!;
    final l = m.last;
    final stale = l == null || DateTime.now().difference(l.time).inMinutes > 60;
    final live = !stale && DateTime.now().difference(l.time).inMinutes < 10;
    final size = widget.selected ? 56.0 : 48.0;
    return Opacity(
      opacity: stale ? 0.7 : 1,
      child: Stack(clipBehavior: Clip.none, alignment: Alignment.bottomCenter, children: [
        // pulsierender Lichthof auf dem Boden
        if (live || sos)
          Positioned(
            bottom: -22,
            child: AnimatedBuilder(
              animation: _pulse,
              builder: (_, __) {
                final t = _pulse.value;
                final d = 10 + (sos ? 60 : 34) * t;
                return SizedBox(
                  width: 70,
                  height: 44,
                  child: Center(
                    child: Container(
                      width: d,
                      height: d * 0.62,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.all(Radius.elliptical(d, d * 0.62)),
                        color: c.withValues(alpha: (1 - t) * (sos ? 0.55 : 0.4)),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        // Punkt genau auf der Position
        Positioned(
          bottom: -6,
          child: Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(colors: [c, c2]),
              border: Border.all(color: Colors.white, width: 2.5),
              boxShadow: [BoxShadow(color: c.withValues(alpha: 0.7), blurRadius: 8)],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
            Stack(clipBehavior: Clip.none, children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 250),
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: SweepGradient(colors: [c, c2, Color.lerp(c, Colors.white, 0.3)!, c]),
                  boxShadow: [
                    BoxShadow(color: c.withValues(alpha: 0.55), blurRadius: widget.selected ? 20 : 12, offset: const Offset(0, 4)),
                    BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 6, offset: const Offset(0, 3)),
                  ],
                ),
                child: Container(
                  padding: const EdgeInsets.all(2.5),
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                  child: Avatar(m, size: size - 11, ring: false),
                ),
              ),
              if (l?.hdg != null && (l?.spd ?? 0) > 1.5 && !m.paused)
                Positioned(
                  left: -5,
                  top: -5,
                  child: Transform.rotate(
                    angle: l!.hdg! * math.pi / 180,
                    child: Container(
                      width: 22,
                      height: 22,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [c, c2]),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 2),
                      ),
                      child: const Icon(Icons.navigation_rounded, size: 12, color: Colors.white),
                    ),
                  ),
                ),
              if (l?.driving == true) Positioned(right: -10, top: -6, child: _badge('🚗 ${l!.kmh.round()}', Colors.black87)),
              if (m.paused || !m.sharing) Positioned(right: -6, top: -6, child: _badge('⏸', Colors.black87)),
              if (m.bubble) Positioned(right: -6, top: -6, child: _badge('🫧', Colors.black54)),
              if (l?.bat != null && l!.bat! <= 20) Positioned(left: -8, bottom: -2, child: _badge('🪫${l.bat}', const Color(0xFFD32F2F))),
            ]),
            CustomPaint(size: const Size(16, 10), painter: _Tip(c, c2)),
          ]),
        ),
      ]),
    );
  }

  Widget _badge(String t, Color bg) => Container(
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

/// Geschwungene Spitze unter dem Profilbild
class _Tip extends CustomPainter {
  final Color a, b;
  _Tip(this.a, this.b);
  @override
  void paint(Canvas canvas, Size s) {
    final p = Path()
      ..moveTo(0, 0)
      ..quadraticBezierTo(s.width * 0.32, s.height * 0.15, s.width / 2, s.height)
      ..quadraticBezierTo(s.width * 0.68, s.height * 0.15, s.width, 0)
      ..close();
    canvas.drawPath(p, Paint()..shader = LinearGradient(colors: [a, b]).createShader(Offset.zero & s));
  }

  @override
  bool shouldRepaint(_Tip o) => o.a != a || o.b != b;
}

class BatteryChip extends StatelessWidget {
  final LastLoc? l;
  const BatteryChip(this.l, {super.key});
  @override
  Widget build(BuildContext context) {
    final b = l?.bat;
    if (b == null) return const SizedBox.shrink();
    final color = b <= 15 ? Colors.red : (b <= 30 ? Colors.orange : Colors.green);
    final icon = l!.chg
        ? Icons.battery_charging_full
        : b > 85
            ? Icons.battery_full
            : b > 60
                ? Icons.battery_5_bar
                : b > 35
                    ? Icons.battery_3_bar
                    : b > 15
                        ? Icons.battery_2_bar
                        : Icons.battery_alert;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 16, color: color),
      Text('$b %', style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w600)),
    ]);
  }
}

/// Eine Zeile Status: „Zuhause seit 14:20“ / „Unterwegs – 52 km/h“ / „vor 5 Min.“
String statusLine(Member m, Circle c) {
  final l = m.last;
  if (m.paused) return 'Standort pausiert${l != null && l.ts > 0 ? ' · ${ago(l.time)}' : ''}';
  if (!m.sharing) return 'Teilt in diesem Kreis nicht';
  if (l == null || !l.hasPos) return 'Noch kein Standort';
  final place = c.placeById(m.place);
  final parts = <String>[];
  if (m.bubble) {
    parts.add('🫧 ungefähr');
  } else if (place != null) {
    parts.add('${place.icon} ${place.name}${m.placeSince != null ? ' seit ${hm(DateTime.fromMillisecondsSinceEpoch(m.placeSince!))}' : ''}');
  } else if (l.driving) {
    parts.add('Fährt · ${l.kmh.round()} km/h');
  }
  parts.add(ago(l.time));
  return parts.join(' · ');
}

class GradientButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  const GradientButton(this.label, {super.key, this.icon, this.onTap});
  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: onTap == null ? 0.5 : 1,
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(
            gradient: brandGradient,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [BoxShadow(color: magenta.withValues(alpha: 0.35), blurRadius: 18, offset: const Offset(0, 6))],
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 17, horizontal: 22),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                if (icon != null) ...[Icon(icon, color: Colors.white), const SizedBox(width: 10)],
                Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

void toast(BuildContext context, String msg) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));
}

/// Fehler freundlich anzeigen
Future<T?> guard<T>(BuildContext context, Future<T> Function() f) async {
  try {
    return await f();
  } catch (e) {
    if (context.mounted) toast(context, e.toString().replaceFirst('Exception: ', ''));
    return null;
  }
}

const _esri = 'https://server.arcgisonline.com/ArcGIS/rest/services';

/// Kartenkacheln ohne API-Schlüssel: OpenStreetMap und Esri
List<Widget> mapTiles(String style, bool dark) {
  if (style == 'none') return const [];
  if (style == 'auto') style = dark ? 'dark' : 'light';
  TileLayer t(String url, {int maxNative = 19}) => TileLayer(
        urlTemplate: url,
        userAgentPackageName: 'de.familie.hjemme',
        maxNativeZoom: maxNative,
        maxZoom: 20,
        retinaMode: false,
      );
  switch (style) {
    case 'satellite':
      return [t('$_esri/World_Imagery/MapServer/tile/{z}/{y}/{x}'), t('$_esri/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}')];
    case 'dark':
      return [t('$_esri/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', maxNative: 16),
        t('$_esri/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', maxNative: 16)];
    case 'streets':
      return [t('$_esri/World_Street_Map/MapServer/tile/{z}/{y}/{x}')];
    default:
      return [t('https://tile.openstreetmap.org/{z}/{x}/{y}.png')];
  }
}

/// Glas-Knopf: verschwommener Hintergrund, leuchtender Verlaufsrand wie im App-Icon
class GlassPill extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  final bool circle;
  const GlassPill({super.key, required this.child, this.onTap, this.circle = false});
  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final radius = BorderRadius.circular(circle ? 100 : 26);
    return Container(
      padding: const EdgeInsets.all(1.6),
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: LinearGradient(
          colors: [violet.withValues(alpha: 0.95), magenta.withValues(alpha: 0.9), coral.withValues(alpha: 0.9)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: [
          BoxShadow(color: magenta.withValues(alpha: dark ? 0.35 : 0.22), blurRadius: 16, offset: const Offset(0, 4)),
          BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 10, offset: const Offset(0, 3)),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Material(
            color: dark ? const Color(0xFF0E1638).withValues(alpha: 0.78) : Colors.white.withValues(alpha: 0.82),
            child: InkWell(onTap: onTap, child: child),
          ),
        ),
      ),
    );
  }
}

/// Symbol-Kachel aus den Canva-Grafiken (Stil wie das App-Icon), mit Leuchten und Drück-Effekt
class IconTile extends StatefulWidget {
  final String name;
  final double size;
  final VoidCallback? onTap;
  const IconTile(this.name, {super.key, this.size = 50, this.onTap});
  @override
  State<IconTile> createState() => _IconTileState();
}

class _IconTileState extends State<IconTile> {
  bool _down = false;
  @override
  Widget build(BuildContext context) {
    final glow = widget.name == 'sos' ? const Color(0xFFFF2D55) : magenta;
    final tile = AnimatedScale(
      scale: _down ? 0.9 : 1,
      duration: const Duration(milliseconds: 120),
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(widget.size * 0.24),
          boxShadow: [
            BoxShadow(color: glow.withValues(alpha: 0.38), blurRadius: widget.size * 0.32, offset: Offset(0, widget.size * 0.08)),
            BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: widget.size * 0.12, offset: Offset(0, widget.size * 0.05)),
          ],
        ),
        child: Image.asset('assets/icons/${widget.name}.png', width: widget.size, height: widget.size, filterQuality: FilterQuality.medium),
      ),
    );
    if (widget.onTap == null) return tile;
    return GestureDetector(
      onTapDown: (_) => setState(() => _down = true),
      onTapUp: (_) => setState(() => _down = false),
      onTapCancel: () => setState(() => _down = false),
      onTap: widget.onTap,
      child: tile,
    );
  }
}
