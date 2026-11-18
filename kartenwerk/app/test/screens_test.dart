// Vorschaubilder der Bildschirme mit Beispieldaten.
// Aufruf: flutter test test/screens_test.dart --update-goldens  → Bilder in test/shots/
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:kartenwerk/main.dart';
import 'package:kartenwerk/models.dart';
import 'package:kartenwerk/screens/card_view.dart';
import 'package:kartenwerk/screens/edit.dart';
import 'package:kartenwerk/screens/home.dart';
import 'package:kartenwerk/store.dart';
import 'package:kartenwerk/ui.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> loadFonts() async {
  const dir = '/opt/sdk/flutter/bin/cache/artifacts/material_fonts';
  final roboto = FontLoader('Roboto');
  for (final f in ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Bold.ttf', 'Roboto-Black.ttf']) {
    roboto.addFont(Future.value(ByteData.sublistView(File('$dir/$f').readAsBytesSync())));
  }
  await roboto.load();
  final icons = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(File('$dir/MaterialIcons-Regular.otf').readAsBytesSync())));
  await icons.load();
}

Future<void> sample() async {
  final dir = await Directory.systemTemp.createTemp('kwshots');
  await store.load(baseDir: dir);
  store.cards.clear();
  final now = DateTime.now();
  final pb = WalletCard(id: 'pb', name: 'PAYBACK', kind: CardKind.points, color: 0xFF0046AA, code: '4012345678901', codeType: CodeType.ean13,
      number: '4012 3456 7890 1', pointValue: 0.01, pointsGoal: 5000, website: 'https://www.payback.de', favorite: true, uses: 30, holder: 'Robert A.');
  for (final (d, v) in [(120, 2210.0), (90, 2650.0), (60, 2980.0), (40, 3310.0), (20, 3790.0), (2, 4718.0)]) {
    pb.history.add(PointsEntry(now.subtract(Duration(days: d)), v, ''));
  }
  pb.points = 4718;
  final coop = WalletCard(id: 'coop', name: 'Coop', kind: CardKind.points, color: 0xFFE2001A, code: 'COOP-88231', codeType: CodeType.qr,
      pointsUnit: 'kr bonus', pointValue: 1, currency: 'kr', uses: 22)
    ..history.add(PointsEntry(now.subtract(const Duration(days: 45)), 87.5))
    ..points = 87.5;
  final mm = WalletCard(id: 'mm', name: 'Miles & More', kind: CardKind.points, color: 0xFF0B1F44, code: '992004512345', pointsUnit: 'Meilen', uses: 8)
    ..history.add(PointsEntry(now.subtract(const Duration(days: 6)), 41250))
    ..points = 41250;
  store.cards.addAll([
    pb,
    coop,
    WalletCard(id: 'gym', name: 'Fitnessstudio', kind: CardKind.membership, color: 0xFF212121, code: 'FIT-2231-77', codeType: CodeType.qr, uses: 18, holder: 'Mitglied seit 2024'),
    WalletCard(id: 'gift', name: 'Zalando Gutschein', kind: CardKind.voucher, color: 0xFFFF6B3D, code: 'ZAL9-22KD-8812', balance: 50, expires: now.add(const Duration(days: 9)), uses: 2),
    mm,
    WalletCard(id: 'ikea', name: 'IKEA Family', kind: CardKind.membership, color: 0xFF0058A3, code: '6275980123456789', uses: 4),
    WalletCard(id: 'bib', name: 'Stadtbibliothek', kind: CardKind.library, color: 0xFF5D4037, code: 'B00412776', codeType: CodeType.codabar, uses: 1),
  ]);
}

Widget app(Widget child) => MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildTheme().copyWith(textTheme: buildTheme().textTheme.apply(fontFamily: 'Roboto')),
      home: DefaultTextStyle.merge(style: const TextStyle(fontFamily: 'Roboto'), child: child),
    );

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await initializeDateFormatting('de_DE');
    await loadFonts();
  });

  Future<void> shot(WidgetTester t, Widget w, String name, {Future<void> Function()? then}) async {
    t.view.physicalSize = const Size(1080, 2280);
    t.view.devicePixelRatio = 2.75;
    await t.pumpWidget(app(w));
    await t.runAsync(() async {
      for (final a in ['assets/splash.jpg', 'assets/points.jpg', 'assets/empty.jpg', 'assets/icon.png']) {
        await precacheImage(AssetImage(a), t.element(find.byType(MaterialApp)));
      }
    });
    for (var i = 0; i < 4; i++) {
      await t.pump(const Duration(milliseconds: 600));
    }
    if (then != null) await then();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('shots/$name.png'));
  }

  testWidgets('Start', (t) async {
    await t.runAsync(sample);
    await shot(t, const SplashView(), '0_start');
  });
  testWidgets('Wallet', (t) async {
    await t.runAsync(sample);
    await shot(t, const HomeScreen(), '1_wallet');
  });
  testWidgets('Punkte', (t) async {
    await t.runAsync(sample);
    await shot(t, const HomeScreen(), '2_punkte', then: () async {
      await t.tap(find.text('Punkte').last);
      for (var i = 0; i < 4; i++) {
        await t.pump(const Duration(milliseconds: 400));
      }
    });
  });
  testWidgets('Karte zeigen', (t) async {
    await t.runAsync(sample);
    await shot(t, const CardViewScreen(cardId: 'pb'), '3_karte');
  });
  testWidgets('Hinzufügen', (t) async {
    await t.runAsync(sample);
    await shot(t, const HomeScreen(), '4_hinzufuegen', then: () async {
      await t.tap(find.text('Karte'));
      for (var i = 0; i < 4; i++) {
        await t.pump(const Duration(milliseconds: 400));
      }
    });
  });
  testWidgets('Bearbeiten', (t) async {
    await t.runAsync(sample);
    await shot(t, EditCardScreen(card: store.byId('coop')!), '5_bearbeiten');
  });
  testWidgets('Leer', (t) async {
    await t.runAsync(sample);
    store.cards.clear();
    await shot(t, const HomeScreen(), '6_leer');
  });
  testWidgets('Mehr', (t) async {
    await t.runAsync(sample);
    await shot(t, const HomeScreen(), '7_mehr', then: () async {
      await t.tap(find.text('Mehr'));
      for (var i = 0; i < 3; i++) {
        await t.pump(const Duration(milliseconds: 400));
      }
    });
  });
}
