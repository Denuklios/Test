// Vorschaubilder der wichtigsten Bildschirme mit Beispieldaten (ohne Kartenkacheln).
// Aufruf: flutter test test/screens_test.dart --update-goldens  → Bilder in test/shots/
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:material_ui/material_ui.dart';
import 'package:hjemme/api.dart';
import 'package:hjemme/models.dart';
import 'package:hjemme/screens/chat.dart';
import 'package:hjemme/screens/home.dart';
import 'package:hjemme/screens/onboarding.dart';
import 'package:hjemme/screens/sos.dart';
import 'package:hjemme/screens/splash.dart';
import 'package:hjemme/store.dart';
import 'package:hjemme/ui.dart';
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
  final emoji = FontLoader('NotoColorEmoji')
    ..addFont(Future.value(ByteData.sublistView(File('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf').readAsBytesSync())));
  await emoji.load();
}

void fakeData() {
  final now = DateTime.now().millisecondsSinceEpoch;
  store.api = Api(memberId: 'me', token: 't');
  store.mapStyle = 'none';
  Map<String, dynamic> m(String id, String name, int color, String emoji, double lat, double lng, int bat,
          {double spd = 0, String? place, int ago = 2, Map<String, dynamic>? eta}) =>
      {
        'id': id, 'name': name, 'color': color, 'emoji': emoji, 'role': id == 'me' ? 'admin' : 'member',
        'last': {'lat': lat, 'lng': lng, 'acc': 12, 'spd': spd, 'bat': bat, 'chg': false, 'ts': now - ago * 60000},
        'place': place, 'placeSince': now - 95 * 60000, 'sharing': true, 'eta': eta,
      };
  store.circles = [
    Circle.fromJson({
      'id': 1, 'name': 'Familie', 'code': 'K7M2QX', 'owner': 'me', 'settings': {'speedLimit': 100},
      'members': [
        m('me', 'Robert', 0x6C3BFF, '', 55.4038, 10.4024, 78, place: 'home'),
        m('a', 'Anna', 0xE23BC8, '🌻', 55.3961, 10.3880, 54, spd: 14.5, eta: {'name': 'Oma', 'lat': 55.37, 'lng': 10.43, 'started': now - 5 * 60000, 'minutes': 14}),
        m('l', 'Lena', 0xFF6A3D, '🦄', 55.4110, 10.3801, 12, place: 'school', ago: 6),
        m('j', 'Jonas', 0x00B8A9, '⚽', 55.3990, 10.4170, 91, ago: 1),
      ],
      'places': [
        {'id': 'home', 'name': 'Zuhause', 'icon': '🏠', 'lat': 55.4038, 'lng': 10.4024, 'radius': 120},
        {'id': 'school', 'name': 'Schule', 'icon': '🏫', 'lat': 55.4110, 'lng': 10.3801, 'radius': 150},
        {'id': 'oma', 'name': 'Oma & Opa', 'icon': '👵', 'lat': 55.37, 'lng': 10.43, 'radius': 150},
      ],
    })
  ];
  store.selectedCircleId = 1;
  store.events
    ..clear()
    ..addAll([
      Ev(id: 1, circle: 1, ts: now - 50 * 60000, type: 'arrive', member: 'l', data: {'name': 'Schule', 'icon': '🏫'}),
      Ev(id: 2, circle: 1, ts: now - 30 * 60000, type: 'chat', member: 'a', data: {'text': 'Ich hole Lena um 15 Uhr ab 🚗'}),
      Ev(id: 3, circle: 1, ts: now - 28 * 60000, type: 'chat', member: 'me', data: {'text': 'Super, danke! ❤️'}),
      Ev(id: 4, circle: 1, ts: now - 10 * 60000, type: 'checkin', member: 'j', data: {'place': 'Sportplatz Süd', 'text': 'Training fertig ⚽'}),
      Ev(id: 5, circle: 1, ts: now - 4 * 60000, type: 'chat', member: 'l', data: {'text': 'Bin gleich draußen!'}),
    ]);
}

Widget app(Widget child, {Brightness b = Brightness.dark}) => MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildTheme(b).copyWith(
        textTheme: buildTheme(b).textTheme.apply(fontFamily: 'Roboto', fontFamilyFallback: ['NotoColorEmoji']),
      ),
      home: DefaultTextStyle.merge(style: const TextStyle(fontFamily: 'Roboto', fontFamilyFallback: ['NotoColorEmoji']), child: child),
    );

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await initializeDateFormatting('de');
    await loadFonts();
  });

  Future<void> shot(WidgetTester t, Widget w, String name, {Brightness b = Brightness.dark}) async {
    t.view.physicalSize = const Size(1080, 2280);
    t.view.devicePixelRatio = 2.75;
    await t.pumpWidget(app(w, b: b));
    await t.runAsync(() async {
      for (final a in ['assets/welcome.jpg', 'assets/sos.jpg', 'assets/icon.png']) {
        await precacheImage(AssetImage(a), t.element(find.byType(MaterialApp)));
      }
    });
    await t.pump(const Duration(milliseconds: 900));
    await t.pump(const Duration(milliseconds: 900));
    await t.pump(const Duration(milliseconds: 900));
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('shots/$name.png'));
  }

  testWidgets('Begrüßung', (t) async {
    await t.runAsync(() async => fakeData());
    await shot(t, Onboarding(onDone: () {}), '1_begruessung');
  });

  testWidgets('Karte', (t) async {
    fakeData();
    await shot(t, const Home(), '2_karte');
  });

  testWidgets('Chat', (t) async {
    fakeData();
    await t.runAsync(() async => store.init());
    fakeData();
    await shot(t, const ChatScreen(), '3_chat', b: Brightness.light);
  });

  testWidgets('SOS', (t) async {
    fakeData();
    await shot(t, const SosScreen(), '4_sos');
  });

  testWidgets('Startbildschirm', (t) async {
    fakeData();
    t.view.physicalSize = const Size(1080, 2280);
    t.view.devicePixelRatio = 2.75;
    await t.pumpWidget(app(SplashOverlay(onDone: () {})));
    await t.runAsync(() async {
      for (final a in ['assets/welcome.jpg', 'assets/icon.png']) {
        await precacheImage(AssetImage(a), t.element(find.byType(MaterialApp)));
      }
    });
    await t.pump(const Duration(milliseconds: 1200));
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('shots/0_start.png'));
    await t.pump(const Duration(seconds: 3));
  });
}
