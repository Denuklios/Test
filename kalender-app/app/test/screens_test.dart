import 'dart:io';

import 'package:familienkalender/main.dart';
import 'package:familienkalender/models.dart';
import 'package:familienkalender/screens/agenda_screen.dart';
import 'package:familienkalender/screens/birthdays_screen.dart';
import 'package:familienkalender/screens/event_detail.dart';
import 'package:familienkalender/screens/event_editor.dart';
import 'package:familienkalender/screens/month_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> loadFont(String family, List<String> paths) async {
  final l = FontLoader(family);
  for (final p in paths) {
    l.addFont(Future.value(ByteData.view(File(p).readAsBytesSync().buffer)));
  }
  await l.load();
}

void seed() {
  store.myId = 'r';
  store.serverUrl = 'https://example.org/kalender/api.php';
  store.code = 'TEST';
  store.state = 'BB';
  store.holidays.configure(state: 'BB', de: true, dk: true, obs: true);
  store.school.configure(state: 'BB', de: false, dk: true);
  for (final m in [
    Member(id: 'r', name: 'Robert', color: 0xFF1E88E5),
    Member(id: 'j', name: 'Jeannine', color: 0xFF6D4C41),
    Member(id: 's', name: 'Sophie', color: 0xFFFFB300),
    Member(id: 'l', name: 'Lotte', color: 0xFFD81B60),
    Member(id: 'k', name: 'Kerstin', color: 0xFF7CB342),
  ]) {
    store.members[m.id] = m;
  }
  var n = 0;
  void ev(String t, DateTime s, DateTime e, String owner,
      {bool allDay = false, List<String> p = const [], String kind = EventKind.normal, String repeat = Repeat.none, int? by, String loc = ''}) {
    final id = 'e${n++}';
    store.events[id] = CalEvent(
        id: id, title: t, start: s, end: e, allDay: allDay, ownerId: owner, participants: [...p], kind: kind, repeat: repeat, birthYear: by, location: loc,
        reminders: [60], createdBy: owner, editedBy: owner);
  }

  DateTime d(int day, [int h = 0]) => DateTime(2026, 11, day, h);
  ev('Früh', d(2, 6), d(4, 14), 'r', allDay: true);
  ev('Glas/Müll', d(2), d(2), 'j', allDay: true, repeat: Repeat.monthly);
  ev('Holzklotz', d(2), d(2), 's', allDay: true);
  for (final x in [5, 9, 12, 19, 20, 24]) {
    ev('Spät', d(x, 14), d(x, 22), 'r');
  }
  for (final x in [6, 10, 11, 14, 17, 18, 21, 23, 25, 26]) {
    ev('Früh', d(x, 6), d(x, 14), 'r');
  }
  ev('Hundeschule', d(6, 17), d(6, 18), 'j', repeat: Repeat.weekly, loc: 'Hundeplatz Wriezen');
  ev('Kaffee und Kuchen', d(7, 15), d(7, 18), 'l', p: ['j', 'r']);
  ev('Kerstin', DateTime(1980, 11, 11), DateTime(1980, 11, 11), 'k', allDay: true, kind: EventKind.birthday, by: 1980);
  ev('Nati Wriezen', d(13), d(15), 'r', allDay: true, p: ['j']);
  ev('Restmüll', d(12), d(12), 'j', allDay: true, repeat: Repeat.biweekly);
  ev('Sophie Arbeit', d(19, 8), d(19, 16), 's');
  ev('Urlaub', d(16), d(20), 'j', allDay: true, kind: EventKind.vacation);
  ev('Düsseldorf', d(27), d(29), 'r', allDay: true, p: ['j', 's']);
  ev('Alessandro', DateTime(2019, 11, 28), DateTime(2019, 11, 28), 'k', allDay: true, kind: EventKind.birthday, by: 2019);
  ev('Ole', DateTime(1995, 11, 30), DateTime(1995, 11, 30), 'k', allDay: true, kind: EventKind.birthday, by: 1995);
  ev('Oma', DateTime(1950, 12, 24), DateTime(1950, 12, 24), 'k', allDay: true, kind: EventKind.birthday, by: 1950);
}

Widget app(Widget home) => MaterialApp(
      debugShowCheckedModeBanner: false,
      locale: const Locale('de', 'DE'),
      supportedLocales: const [Locale('de', 'DE')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: ThemeData(
        fontFamily: 'Roboto',
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1976D2)),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1976D2),
          foregroundColor: Colors.white,
          centerTitle: true,
          titleTextStyle: TextStyle(fontFamily: 'Roboto', fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white),
        ),
      ),
      home: home,
    );

Widget shell(Widget body, String title, int tab) => Scaffold(
      appBar: AppBar(
        leading: const Icon(Icons.menu),
        title: Text(title),
        actions: const [Icon(Icons.brush_outlined), SizedBox(width: 12), Icon(Icons.search), SizedBox(width: 12), Icon(Icons.add, size: 30), SizedBox(width: 8)],
      ),
      body: body,
      floatingActionButton: FloatingActionButton(onPressed: () {}, child: const Icon(Icons.mic)),
      bottomNavigationBar: NavigationBar(selectedIndex: tab, destinations: const [
        NavigationDestination(icon: Icon(Icons.calendar_view_month), label: 'Kalender'),
        NavigationDestination(icon: Icon(Icons.view_agenda_outlined), label: 'Termine'),
        NavigationDestination(icon: Icon(Icons.cake_outlined), label: 'Geburtstage'),
      ]),
    );

void main() {
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await initializeDateFormatting('de_DE');
    const f = '/opt/sdk/flutter/bin/cache/dart-sdk/bin/resources/devtools/assets/packages/devtools_app_shared/fonts/Roboto';
    await loadFont('Roboto', ['$f/Roboto-Regular.ttf', '$f/Roboto-Bold.ttf', '$f/Roboto-Medium.ttf']);
    await loadFont('MaterialIcons', ['/opt/sdk/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf']);
    seed();
  });

  Future<void> shot(WidgetTester t, Widget w, String name) async {
    t.view.physicalSize = const Size(1080, 2280);
    t.view.devicePixelRatio = 2.625;
    await t.pumpWidget(app(w));
    await t.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('/tmp/claude-0/-home-user-Test/cd4db189-3460-55ed-b918-077f9e0d3ba7/scratchpad/shots/$name.png'));
  }

  testWidgets('monat', (t) async {
    await shot(t, shell(MonthView(onDayTap: (_) {}, onDayLongPress: (_) {}, onEventTap: (_) {}), 'Heute', 0), 'monat');
  });
  testWidgets('agenda', (t) async {
    await shot(t, shell(AgendaScreen(onOpen: (_) {}), 'Termine', 1), 'agenda');
  });
  testWidgets('geburtstage', (t) async {
    await shot(t, shell(BirthdaysScreen(onOpen: (_) {}), 'Geburtstage', 2), 'geburtstage');
  });
  testWidgets('editor', (t) async {
    final e = store.events.values.firstWhere((e) => e.title == 'Düsseldorf');
    await shot(t, EventEditor(event: e), 'editor');
  });
  testWidgets('detail', (t) async {
    final e = store.events.values.firstWhere((e) => e.title == 'Kaffee und Kuchen');
    await shot(t, EventDetail(eventId: e.id), 'detail');
  });
}
