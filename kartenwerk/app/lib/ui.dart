import 'dart:io';

import 'package:barcode_widget/barcode_widget.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';

import 'models.dart';
import 'store.dart';

class K {
  static const navy = Color(0xFF0B1630);
  static const navy2 = Color(0xFF13234A);
  static const navy3 = Color(0xFF1C2F5E);
  static const gold = Color(0xFFF5B544);
  static const teal = Color(0xFF19B3A6);
  static const coral = Color(0xFFFF6B3D);
  static const text = Color(0xFFEAF0FF);
  static const muted = Color(0xFF8C9BC2);
}

ThemeData buildTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(seedColor: K.teal, brightness: Brightness.dark, primary: K.gold, secondary: K.teal, surface: K.navy2),
    scaffoldBackgroundColor: K.navy,
  );
  return base.copyWith(
    appBarTheme: const AppBarTheme(backgroundColor: K.navy, elevation: 0, centerTitle: false, foregroundColor: K.text),
    cardTheme: CardThemeData(color: K.navy2, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)), elevation: 0),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: K.navy2,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: K.gold, width: 1.5)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(backgroundColor: K.gold, foregroundColor: K.navy, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)), padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: K.navy2,
      indicatorColor: K.gold.withValues(alpha: .22),
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}

final _nf = NumberFormat.decimalPattern('de_DE');
final _nf2 = NumberFormat('#,##0.00', 'de_DE');

String fmtNum(double? v) {
  if (v == null) return '–';
  return v == v.roundToDouble() ? _nf.format(v.round()) : _nf2.format(v);
}

String fmtMoney(double v, String cur) => '${_nf2.format(v)} $cur';

String fmtDate(DateTime d) => DateFormat('d. MMM y', 'de_DE').format(d);

String daysText(int d) {
  if (d < 0) return 'abgelaufen';
  if (d == 0) return 'läuft heute ab';
  if (d == 1) return 'läuft morgen ab';
  return 'noch $d Tage';
}

/// Helle oder dunkle Schrift, je nach Kartenfarbe
Color onColor(Color c) => c.computeLuminance() > 0.5 ? const Color(0xFF111111) : Colors.white;

Barcode barcodeFor(CodeType t) => switch (t) {
      CodeType.qr => Barcode.qrCode(),
      CodeType.ean13 => Barcode.ean13(),
      CodeType.ean8 => Barcode.ean8(),
      CodeType.upcA => Barcode.upcA(),
      CodeType.upcE => Barcode.upcE(),
      CodeType.code39 => Barcode.code39(),
      CodeType.code93 => Barcode.code93(),
      CodeType.itf => Barcode.itf(),
      CodeType.codabar => Barcode.codabar(),
      CodeType.pdf417 => Barcode.pdf417(),
      CodeType.aztec => Barcode.aztec(),
      CodeType.dataMatrix => Barcode.dataMatrix(),
      _ => Barcode.code128(),
    };

/// Zeigt den Barcode; fällt bei ungültigen Daten auf Code 128 zurück.
class CodeView extends StatelessWidget {
  final WalletCard card;
  final double height;
  const CodeView(this.card, {super.key, this.height = 120});

  @override
  Widget build(BuildContext context) {
    if (card.codeType == CodeType.none || card.code.isEmpty) return const SizedBox.shrink();
    var bc = barcodeFor(card.codeType);
    if (!bc.isValid(card.code)) bc = Barcode.code128();
    final square = card.codeType == CodeType.qr || card.codeType == CodeType.aztec || card.codeType == CodeType.dataMatrix;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
      child: SizedBox(
        height: square ? height * 1.8 : height,
        width: square ? height * 1.8 : double.infinity,
        child: BarcodeWidget(
          barcode: bc,
          data: card.code,
          drawText: false,
          color: Colors.black,
          errorBuilder: (c, e) => Center(child: Text('Code nicht darstellbar:\n${card.code}', textAlign: TextAlign.center, style: const TextStyle(color: Colors.black))),
        ),
      ),
    );
  }
}

/// Die Karte, wie sie in der Wallet aussieht. Wird immer in fester
/// Entwurfsgröße gezeichnet und skaliert – sieht klein wie groß gleich aus.
class CardFace extends StatelessWidget {
  final WalletCard card;
  final bool compact;
  const CardFace(this.card, {super.key, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final c = card.colorValue;
    final fg = onColor(c);
    final img = card.frontImage != null ? store.image(card.frontImage!) : null;
    final hasImg = img != null && img.existsSync();
    final logo = card.logoImage != null ? store.image(card.logoImage!) : null;
    final d = card.daysLeft;
    final w = compact ? 300.0 : 360.0;
    return AspectRatio(
      aspectRatio: 1.586,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(compact ? 14 : 22),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .35), blurRadius: 18, offset: const Offset(0, 8))],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(compact ? 14 : 22),
          child: FittedBox(
            fit: BoxFit.fill,
            child: SizedBox(
              width: w,
              height: w / 1.586,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color.lerp(c, Colors.white, .12)!, c, Color.lerp(c, Colors.black, .28)!],
                  ),
                  image: hasImg ? DecorationImage(image: FileImage(img), fit: BoxFit.cover) : null,
                ),
                child: Stack(children: [
                  if (!hasImg) ...[
                    Positioned(right: -40, top: -60, child: _blob(190, fg.withValues(alpha: .07))),
                    Positioned(left: -30, bottom: -80, child: _blob(170, fg.withValues(alpha: .05))),
                  ],
                  if (hasImg)
                    Positioned(
                      left: 0,
                      right: 0,
                      top: 0,
                      height: 64,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.black.withValues(alpha: .55), Colors.transparent]),
                        ),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 18, 16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      // Kopfzeile – im Stapel immer sichtbar
                      Row(children: [
                        if (logo != null && logo.existsSync())
                          ClipRRect(borderRadius: BorderRadius.circular(6), child: Image.file(logo, height: 28, width: 28, fit: BoxFit.contain))
                        else
                          Icon(card.kind.icon, color: (hasImg ? Colors.white : fg).withValues(alpha: .9), size: 26),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(card.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: hasImg ? Colors.white : fg, fontWeight: FontWeight.w800, fontSize: 21, letterSpacing: .2)),
                        ),
                        if (card.points != null && !compact) ...[
                          const SizedBox(width: 8),
                          Text('${fmtNum(card.points)} ${card.pointsUnit.length <= 7 ? card.pointsUnit : ''}'.trim(),
                              style: TextStyle(color: hasImg ? K.gold : fg, fontWeight: FontWeight.w900, fontSize: 17)),
                        ],
                        if (card.favorite) ...[const SizedBox(width: 8), const Icon(Icons.star_rounded, color: K.gold, size: 22)],
                      ]),
                      const Spacer(),
                      Row(children: [
                        Expanded(
                          child: hasImg
                              ? const SizedBox.shrink()
                              : Text(card.holder.isNotEmpty ? card.holder : card.kind.label,
                                  maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: fg.withValues(alpha: .75), fontSize: 14)),
                        ),
                        if (card.points != null && compact) _chip('${fmtNum(card.points)} ${card.pointsUnit}', K.gold),
                        if (card.balance != null) _chip(fmtMoney(card.balance!, card.currency), K.teal),
                        if (d != null && d <= 14) _chip(d < 0 ? 'abgelaufen' : '$d T.', K.coral),
                      ]),
                    ]),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _blob(double s, Color c) => Container(width: s, height: s, decoration: BoxDecoration(shape: BoxShape.circle, color: c));

  Widget _chip(String t, Color c) => Container(
        margin: const EdgeInsets.only(left: 6),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: Colors.black.withValues(alpha: .35), borderRadius: BorderRadius.circular(20), border: Border.all(color: c.withValues(alpha: .8))),
        child: Text(t, maxLines: 1, style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 13)),
      );
}

class SectionTitle extends StatelessWidget {
  final String text;
  final Widget? trailing;
  const SectionTitle(this.text, {super.key, this.trailing});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 12, 8),
        child: Row(children: [
          Text(text.toUpperCase(), style: const TextStyle(color: K.muted, fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 1.4)),
          const Spacer(),
          ?trailing,
        ]),
      );
}

void toast(BuildContext context, String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

bool fileExists(String? name) => name != null && File('${store.imgDir.path}/$name').existsSync();
