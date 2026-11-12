import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:workmanager/workmanager.dart';

import 'notifications.dart';
import 'screens/event_detail.dart';
import 'screens/home_screen.dart';
import 'screens/setup_screen.dart';
import 'store.dart';

final store = AppStore();
final navigatorKey = GlobalKey<NavigatorState>();

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, input) async {
    try {
      await initializeDateFormatting('de_DE');
      Intl.defaultLocale = 'de_DE';
      final s = AppStore();
      await s.load();
      if (!s.isConnected) return true;
      await s.sync();
      await Notifier.init();
      // Meldungen über Änderungen kommen vom Push-Wächter (ChangeWatch), hier nicht doppelt
      await Notifier.rescheduleAll(s);
    } catch (_) {}
    return true;
  });
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('de_DE');
  Intl.defaultLocale = 'de_DE';
  await store.load();
  try {
    await Notifier.init();
  } catch (_) {}
  try {
    await Workmanager().initialize(callbackDispatcher);
    await Workmanager().registerPeriodicTask(
      'kalender-sync',
      'sync',
      frequency: const Duration(minutes: 15),
      constraints: Constraints(networkType: NetworkType.connected),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
    );
  } catch (_) {}
  store.onDataChanged = () => Notifier.rescheduleAll(store);
  Notifier.foregroundStore = store;
  store.onSynced = () => Notifier.updateChangeWatch(store);
  Notifier.onOpenEvent = (id) {
    if (!store.events.containsKey(id)) return;
    navigatorKey.currentState?.push(MaterialPageRoute(builder: (_) => EventDetail(eventId: id)));
  };
  runApp(const KalenderApp());
  try {
    final id = await Notifier.launchEventId();
    if (id != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => Notifier.onOpenEvent?.call(id));
    }
  } catch (_) {}
}

class KalenderApp extends StatelessWidget {
  const KalenderApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF1976D2);
    return MaterialApp(
      title: 'Familienkalender',
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      locale: const Locale('de', 'DE'),
      supportedLocales: const [Locale('de', 'DE'), Locale('da', 'DK')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        useMaterial3: true,
        appBarTheme: const AppBarTheme(
          backgroundColor: seed,
          foregroundColor: Colors.white,
          centerTitle: true,
          titleTextStyle: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Colors.white),
        ),
      ),
      home: ListenableBuilder(
        listenable: store,
        builder: (context, _) => store.isSetUp ? const HomeScreen() : const SetupScreen(),
      ),
    );
  }
}
