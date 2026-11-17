import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:hjemme/screens/photo_crop.dart';
import 'package:hjemme/ui.dart';

void main() {
  testWidgets('Foto anpassen: zoomen und Ergebnis liefern', (t) async {
    const dir = '/opt/sdk/flutter/bin/cache/artifacts/material_fonts';
    final r = FontLoader('Roboto')..addFont(Future.value(ByteData.sublistView(File('$dir/Roboto-Bold.ttf').readAsBytesSync())));
    await r.load();
    final i = FontLoader('MaterialIcons')..addFont(Future.value(ByteData.sublistView(File('$dir/MaterialIcons-Regular.otf').readAsBytesSync())));
    await i.load();
    t.view.physicalSize = const Size(1080, 2280);
    t.view.devicePixelRatio = 2.75;
    final bytes = File('assets/welcome.jpg').readAsBytesSync();
    Uint8List? result;
    await t.pumpWidget(MaterialApp(
      theme: buildTheme(Brightness.dark).copyWith(textTheme: buildTheme(Brightness.dark).textTheme.apply(fontFamily: 'Roboto')),
      home: Builder(builder: (ctx) => Scaffold(body: Center(child: TextButton(onPressed: () async => result = await cropPhoto(ctx, bytes), child: const Text('los'))))),
    ));
    await t.tap(find.text('los'));
    await t.pumpAndSettle();
    await t.runAsync(() async {
      await precacheImage(MemoryImage(bytes), t.element(find.byType(InteractiveViewer)));
    });
    await t.pump();
    // Zwei-Finger-Zoom
    final c = t.getCenter(find.byType(InteractiveViewer));
    final g1 = await t.startGesture(c - const Offset(20, 0));
    final g2 = await t.startGesture(c + const Offset(20, 0));
    await g1.moveBy(const Offset(-60, 0));
    await g2.moveBy(const Offset(60, 0));
    await g1.up();
    await g2.up();
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('shots/5_foto_anpassen.png'));
    await t.runAsync(() async {
      await t.tap(find.text('Übernehmen'));
      await Future.delayed(const Duration(milliseconds: 500));
    });
    await t.pumpAndSettle();
    expect(result, isNotNull);
    expect(result!.length, greaterThan(1000));
  });
}
