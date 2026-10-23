import 'package:flutter/material.dart';

const brandOrange = Color(0xFFE8590C);

ThemeData buildTheme(Brightness b) {
  final scheme = ColorScheme.fromSeed(
    seedColor: brandOrange,
    brightness: b,
    dynamicSchemeVariant: DynamicSchemeVariant.fidelity,
  );
  final base = ThemeData(colorScheme: scheme, useMaterial3: true, brightness: b);
  return base.copyWith(
    scaffoldBackgroundColor: b == Brightness.light ? const Color(0xFFF6F4F2) : const Color(0xFF141210),
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: scheme.onSurface),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      margin: EdgeInsets.zero,
      color: scheme.surfaceContainerLow,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 52),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 68,
      indicatorColor: scheme.primaryContainer,
      labelTextStyle: WidgetStatePropertyAll(base.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

/// Hintergrund in der Dienstfarbe, passend zum Hell-/Dunkelmodus
Color tint(BuildContext context, Color c, [double light = 0.18, double dark = 0.30]) {
  final dk = Theme.of(context).brightness == Brightness.dark;
  return Color.alphaBlend(c.withValues(alpha: dk ? dark : light), Theme.of(context).colorScheme.surface);
}
