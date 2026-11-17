import 'dart:convert';

import 'package:material_ui/material_ui.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'notify.dart';
import 'screens/home.dart';
import 'screens/member.dart';
import 'screens/onboarding.dart';
import 'screens/settings.dart';
import 'store.dart';
import 'tracker.dart';
import 'ui.dart';
import 'updater.dart';

final navKey = GlobalKey<NavigatorState>();
final homeKey = GlobalKey<HomeState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('de');
  await Notify.init();
  await store.init();
  runApp(const HjemmeApp());
}

class HjemmeApp extends StatelessWidget {
  const HjemmeApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Hjemme',
      navigatorKey: navKey,
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      locale: const Locale('de'),
      supportedLocales: const [Locale('de')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: const Root(),
    );
  }
}

class Root extends StatefulWidget {
  const Root({super.key});
  @override
  State<Root> createState() => _RootState();
}

class _RootState extends State<Root> {
  bool get ready => store.api.loggedIn && store.circles.isNotEmpty;
  bool _started = false;

  @override
  void initState() {
    super.initState();
    store.addListener(_upd);
    Notify.onTap = _onNotification;
    if (store.api.loggedIn) {
      store.poll().then((_) => _start());
    }
    Notify.launchPayload().then((p) {
      if (p != null) Future.delayed(const Duration(milliseconds: 900), () => _onNotification(p));
    });
  }

  void _upd() {
    if (mounted) setState(() {});
    if (ready && !_started) _start();
  }

  Future<void> _start() async {
    if (_started || !ready) return;
    _started = true;
    store.startPolling();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final ctx = navKey.currentContext;
      if (ctx == null) return;
      await Notify.requestPermission();
      if (!await Tracker.hasPermission(background: true) && ctx.mounted) {
        await askBackgroundPermission(ctx);
      } else {
        await Tracker.i.start();
      }
      if (await Tracker.hasPermission()) {
        await Tracker.i.start();
        await Tracker.i.sendNow();
      }
      final c2 = navKey.currentContext;
      if (c2 != null && c2.mounted) Updater.autoCheck(c2);
    });
  }

  void _onNotification(String? payload) {
    if (payload == null) return;
    try {
      final j = jsonDecode(payload) as Map<String, dynamic>;
      final circle = (j['circle'] as num?)?.toInt();
      if (circle != null && store.circles.any((c) => c.id == circle)) store.selectCircle(circle);
      final m = store.circle?.member((j['member'] ?? '').toString());
      if (j['type'] == 'ring') {
        Notify.cancel(900001);
        return;
      }
      if (m != null) {
        homeKey.currentState?.focusMember(m, open: false);
        final ctx = navKey.currentContext;
        if (ctx != null) showMember(ctx, m.id);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) {
      return Onboarding(onDone: () {
        setState(() {});
        _start();
      });
    }
    return Home(key: homeKey);
  }
}

// Wird von Geolocator nicht direkt gebraucht, aber hält den Import für die Tracker-Typen schlank.
typedef Pos = Position;
