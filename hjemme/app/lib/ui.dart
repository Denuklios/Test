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

/// Karten-Markierung: Avatar in einer Tropfenform, darunter Status-Abzeichen
class MemberPin extends StatelessWidget {
  final Member m;
  final bool selected, sos;
  const MemberPin(this.m, {super.key, this.selected = false, this.sos = false});
  @override
  Widget build(BuildContext context) {
    final c = sos ? const Color(0xFFFF3B30) : mColor(m.color);
    final l = m.last;
    final stale = l == null || DateTime.now().difference(l.time).inMinutes > 60;
    final size = selected ? 58.0 : 50.0;
    return Opacity(
      opacity: stale ? 0.65 : 1,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Stack(clipBehavior: Clip.none, children: [
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: c,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: c.withValues(alpha: 0.6), blurRadius: sos ? 22 : 10, spreadRadius: sos ? 4 : 0)],
            ),
            child: Avatar(m, size: size - 6, ring: false),
          ),
          if (l?.driving == true)
            Positioned(right: -6, top: -4, child: _badge('🚗 ${l!.kmh.round()}', Colors.black87)),
          if (m.paused || !m.sharing) Positioned(right: -4, top: -4, child: _badge('⏸', Colors.black87)),
          if (m.bubble) Positioned(right: -4, top: -4, child: _badge('🫧', Colors.black54)),
          if (l?.bat != null && l!.bat! <= 20) Positioned(left: -6, bottom: -2, child: _badge('🪫${l.bat}', const Color(0xFFD32F2F))),
        ]),
        CustomPaint(size: const Size(14, 9), painter: _Tip(c)),
      ]),
    );
  }

  Widget _badge(String t, Color bg) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.white, width: 1.2)),
        child: Text(t, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
      );
}

class _Tip extends CustomPainter {
  final Color c;
  _Tip(this.c);
  @override
  void paint(Canvas canvas, Size s) {
    final p = Path()
      ..moveTo(0, 0)
      ..lineTo(s.width, 0)
      ..lineTo(s.width / 2, s.height)
      ..close();
    canvas.drawPath(p, Paint()..color = c);
  }

  @override
  bool shouldRepaint(_Tip o) => o.c != c;
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

String tileUrl(String style, bool dark) {
  switch (style) {
    case 'satellite':
      return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    case 'dark':
      return 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    case 'light':
      return 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    default:
      return dark ? tileUrl('dark', true) : tileUrl('light', false);
  }
}
