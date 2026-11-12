import 'dart:io';

import 'package:familienkalender/main.dart';
import 'package:familienkalender/models.dart';
import 'package:familienkalender/screens/event_detail.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> font(String f, List<String> p) async {
  final l = FontLoader(f);
  for (final x in p) {
    l.addFont(Future.value(ByteData.view(File(x).readAsBytesSync().buffer)));
  }
  await l.load();
}

void main() {
  testWidgets('fremden Termin bearbeiten', (t) async {
    SharedPreferences.setMockInitialValues({});
    await initializeDateFormatting('de_DE');
    const r = '/opt/sdk/flutter/bin/cache/dart-sdk/bin/resources/devtools/assets/packages/devtools_app_shared/fonts/Roboto';
    await font('Roboto', ['$r/Roboto-Regular.ttf', '$r/Roboto-Bold.ttf']);
    await font('MaterialIcons', ['/opt/sdk/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf']);
    store.members['r'] = Member(id: 'r', name: 'Robert', color: 0xFF5E35B1);
    store.members['j'] = Member(id: 'j', name: 'Jeannine', color: 0xFFD81B60);
    store.myId = 'r';
    store.events['x'] = CalEvent(id: 'x', title: 'Lotte Kaffee', start: DateTime(2026, 11, 7, 15), end: DateTime(2026, 11, 7, 18), ownerId: 'j', createdBy: 'j');
    t.view.physicalSize = const Size(1080, 2280);
    t.view.devicePixelRatio = 2.625;
    await t.pumpWidget(MaterialApp(
      locale: const Locale('de', 'DE'),
      supportedLocales: const [Locale('de', 'DE')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: ThemeData(fontFamily: 'Roboto'),
      home: const EventDetail(eventId: 'x'),
      builder: (c, w) => w!,
    ));
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('/tmp/claude-0/-home-user-Test/cd4db189-3460-55ed-b918-077f9e0d3ba7/scratchpad/shots/detail_bearbeiten.png'));
    await t.tap(find.text('Bearbeiten'));
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('/tmp/claude-0/-home-user-Test/cd4db189-3460-55ed-b918-077f9e0d3ba7/scratchpad/shots/edit_other.png'));
    await t.enterText(find.byType(TextField).first, 'Lotte Kaffee geändert');
    await t.tap(find.text('Robert'));
    await t.pump();
    await t.tap(find.text('Speichern'));
    await t.pump(const Duration(seconds: 1));
    final e = store.events['x']!;
    print('Titel: ${e.title} | Personen: ${e.people} | bearbeitet von: ${e.editedBy}');
    expect(e.title, 'Lotte Kaffee geändert');
  });
}
