// Vorschau der drei Markierungs-Entwürfe auf einer echten Nachtkarte
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:hjemme/models.dart';
import 'package:hjemme/pins.dart';

Future<void> fonts() async {
  const dir = '/opt/sdk/flutter/bin/cache/artifacts/material_fonts';
  final r = FontLoader('Roboto');
  for (final f in ['Roboto-Regular.ttf', 'Roboto-Bold.ttf', 'Roboto-Black.ttf']) {
    r.addFont(Future.value(ByteData.sublistView(File('$dir/$f').readAsBytesSync())));
  }
  await r.load();
  final e = FontLoader('NotoColorEmoji')..addFont(Future.value(ByteData.sublistView(File('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf').readAsBytesSync())));
  await e.load();
}

Member mem(String id, String name, int color, String emoji, {double spd = 0, int bat = 80}) => Member.fromJson({
      'id': id, 'name': name, 'color': color, 'emoji': emoji, 'sharing': true,
      'last': {'lat': 55.0, 'lng': 10.0, 'acc': 10, 'spd': spd, 'hdg': 40, 'bat': bat, 'ts': DateTime.now().millisecondsSinceEpoch},
    });

void main() {
  setUpAll(fonts);
  for (final s in PinStyle.values) {
    testWidgets('pin ${s.name}', (t) async {
      t.view.physicalSize = const Size(1200, 1100);
      t.view.devicePixelRatio = 1;
      final members = [
        (mem('a', 'Robert', 0x6C3BFF, '🚀'), const Offset(110, 170), true),
        (mem('b', 'Anna', 0xE23BC8, '🌻', spd: 14, bat: 15), const Offset(270, 140), false),
        (mem('c', 'Lena', 0xFF6A3D, '🦄'), const Offset(150, 320), false),
        (mem('d', 'Jonas', 0x00B8A9, ''), const Offset(300, 300), false),
      ];
      await t.pumpWidget(MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: ThemeData(fontFamily: 'Roboto', fontFamilyFallback: const ['NotoColorEmoji'],
            textTheme: ThemeData().textTheme.apply(fontFamily: 'Roboto', fontFamilyFallback: ['NotoColorEmoji'])),
        color: Colors.transparent,
        home: RepaintBoundary(key: const ValueKey('pins'), child: Transform.scale(scale: 3, alignment: Alignment.topLeft, child: DefaultTextStyle(style: const TextStyle(fontFamily: 'Roboto', fontFamilyFallback: ['NotoColorEmoji']), child: Stack(children: [
          for (final (m, o, sel) in members)
            Positioned(left: o.dx - 42, top: o.dy - 84, width: 84, height: 84, child: StyledPin(m, style: s, selected: sel)),
        ])))),
      ));
      await t.pump();
      await expectLater(find.byKey(const ValueKey('pins')), matchesGoldenFile('shots/pin_${s.name}.png'));
    });
  }
}
