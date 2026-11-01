import 'package:flutter/material.dart';

import '../models.dart';

/// Farbiger Hintergrund – bei mehreren Personen in Streifen nebeneinander
BoxDecoration multiColorDecoration(List<Color> colors, {double radius = 5, double opacity = 1}) {
  final cols = colors.map((c) => c.withValues(alpha: opacity)).toList();
  if (cols.length == 1) {
    return BoxDecoration(color: cols.first, borderRadius: BorderRadius.circular(radius));
  }
  final stops = <double>[];
  final gc = <Color>[];
  for (var i = 0; i < cols.length; i++) {
    stops.add(i / cols.length);
    stops.add((i + 1) / cols.length);
    gc.add(cols[i]);
    gc.add(cols[i]);
  }
  return BoxDecoration(
    borderRadius: BorderRadius.circular(radius),
    gradient: LinearGradient(colors: gc, stops: stops, begin: Alignment.topLeft, end: Alignment.bottomRight),
  );
}

/// Urlaub: helle Fläche mit kräftigem Rand links
BoxDecoration vacationDecoration(List<Color> colors) {
  final d = multiColorDecoration(colors, opacity: 0.3);
  return BoxDecoration(color: d.color, gradient: d.gradient, border: Border(left: BorderSide(color: colors.first, width: 3)));
}

Color readableOn(List<Color> colors, {double opacity = 1}) {
  if (opacity < 0.6) return Colors.black87;
  final lum = colors.map((c) => c.computeLuminance()).reduce((a, b) => a + b) / colors.length;
  return lum > 0.55 ? Colors.black87 : Colors.white;
}

class ColorDot extends StatelessWidget {
  final Color color;
  final double size;
  final Widget? child;
  const ColorDot(this.color, {super.key, this.size = 22, this.child});
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        child: child,
      );
}

class MemberAvatar extends StatelessWidget {
  final Member m;
  final double size;
  const MemberAvatar(this.m, {super.key, this.size = 32});
  @override
  Widget build(BuildContext context) => ColorDot(
        m.c,
        size: size,
        child: Text(
          m.name.isEmpty ? '?' : m.name.characters.first.toUpperCase(),
          style: TextStyle(color: textOn(m.c), fontWeight: FontWeight.bold, fontSize: size * 0.45),
        ),
      );
}

Future<int?> pickColor(BuildContext context, int current, {List<int>? taken}) {
  return showDialog<int>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Farbe wählen'),
      content: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: memberPalette.map((c) {
          final sel = c == current;
          final used = taken?.contains(c) == true && !sel;
          return InkWell(
            onTap: () => Navigator.pop(ctx, c),
            customBorder: const CircleBorder(),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Color(c),
                shape: BoxShape.circle,
                border: Border.all(color: sel ? Colors.black : Colors.transparent, width: 3),
              ),
              child: sel
                  ? Icon(Icons.check, color: textOn(Color(c)))
                  : used
                      ? Icon(Icons.person, size: 18, color: textOn(Color(c)).withValues(alpha: 0.7))
                      : null,
            ),
          );
        }).toList(),
      ),
    ),
  );
}

void toast(BuildContext context, String msg) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating));
}

String two(int v) => v.toString().padLeft(2, '0');
String hhmm(DateTime d) => '${two(d.hour)}:${two(d.minute)}';
