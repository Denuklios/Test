
import 'package:flutter/services.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:local_auth/local_auth.dart';
import 'package:material_ui/material_ui.dart';

import 'screens/add.dart';
import 'screens/home.dart';
import 'store.dart';
import 'ui.dart';
import 'updater.dart';

final navKey = GlobalKey<NavigatorState>();
const native = MethodChannel('kartenwerk/native');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('de_DE');
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(statusBarColor: Colors.transparent, systemNavigationBarColor: K.navy2));
  await store.load();
  runApp(const KartenwerkApp());
}

class KartenwerkApp extends StatelessWidget {
  const KartenwerkApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Kartenwerk',
        navigatorKey: navKey,
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        locale: const Locale('de', 'DE'),
        supportedLocales: const [Locale('de', 'DE'), Locale('da', 'DK'), Locale('en')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: const Shell(),
      );
}

/// Startbildschirm, App-Sperre, Updates und geöffnete .pkpass-Dateien
class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> with WidgetsBindingObserver {
  bool splash = true;
  bool locked = store.lockEnabled;
  bool authing = false;
  DateTime? pausedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Future.delayed(const Duration(milliseconds: 1700), () {
      if (!mounted) return;
      setState(() => splash = false);
      if (locked) _unlock();
      _afterStart();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.paused) pausedAt = DateTime.now();
    if (s == AppLifecycleState.resumed) {
      if (store.lockEnabled && !authing && pausedAt != null && DateTime.now().difference(pausedAt!).inSeconds > 60) {
        setState(() => locked = true);
        _unlock();
      }
      _afterStart();
    }
  }

  Future<void> _afterStart() async {
    if (locked) return;
    final ctx = navKey.currentContext;
    if (ctx == null) return;
    await _incoming();
    if (ctx.mounted) Updater.autoCheck(ctx);
  }

  /// .pkpass, das über „Öffnen mit“ an die App geschickt wurde
  Future<void> _incoming() async {
    try {
      final b = await native.invokeMethod<Uint8List>('takeIncoming');
      final ctx = navKey.currentContext;
      if (b != null && b.isNotEmpty && ctx != null && ctx.mounted) await importPkpass(ctx, bytes: b);
    } catch (_) {}
  }

  Future<void> _unlock() async {
    if (authing) return;
    authing = true;
    try {
      final ok = await LocalAuthentication().authenticate(localizedReason: 'Kartenwerk entsperren', persistAcrossBackgrounding: true);
      if (ok && mounted) {
        setState(() => locked = false);
        _afterStart();
      }
    } catch (_) {
      // Ohne Gerätesperre nicht aussperren
      if (mounted) setState(() => locked = false);
    } finally {
      authing = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      const HomeScreen(),
      if (locked && !splash)
        Positioned.fill(
          child: Material(
            color: K.navy,
            child: SafeArea(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                ClipRRect(borderRadius: BorderRadius.circular(24), child: Image.asset('assets/icon.png', width: 96)),
                const SizedBox(height: 24),
                const Text('Kartenwerk ist gesperrt', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 20),
                FilledButton.icon(onPressed: _unlock, icon: const Icon(Icons.fingerprint_rounded), label: const Text('Entsperren')),
              ]),
            ),
          ),
        ),
      IgnorePointer(
        ignoring: !splash,
        child: AnimatedOpacity(
          opacity: splash ? 1 : 0,
          duration: const Duration(milliseconds: 600),
          curve: Curves.easeOut,
          child: const SplashView(),
        ),
      ),
    ]);
  }
}

class SplashView extends StatelessWidget {
  const SplashView({super.key});
  @override
  Widget build(BuildContext context) => Material(
        color: K.navy,
        child: Stack(fit: StackFit.expand, children: [
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 1.08, end: 1.0),
            duration: const Duration(milliseconds: 1800),
            curve: Curves.easeOutCubic,
            builder: (_, s, child) => Transform.scale(scale: s, child: child),
            child: Image.asset('assets/splash.jpg', fit: BoxFit.cover),
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: [0, .42, .62],
                colors: [Color(0xF00B1630), Color(0xB00B1630), Color(0x000B1630)],
              ),
            ),
          ),
          Align(
            alignment: const Alignment(0, -.7),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: const Duration(milliseconds: 900),
              curve: Curves.easeOut,
              builder: (_, v, child) => Opacity(opacity: v, child: Transform.translate(offset: Offset(0, 20 * (1 - v)), child: child)),
              child: const Column(mainAxisSize: MainAxisSize.min, children: [
                Text('Kartenwerk',
                    style: TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: .5, shadows: [Shadow(blurRadius: 24, color: Colors.black54)])),
                SizedBox(height: 6),
                Text('Alle Karten. Alle Punkte. Ein Ort.', style: TextStyle(color: K.gold, fontSize: 15, fontWeight: FontWeight.w600, letterSpacing: .4)),
              ]),
            ),
          ),
        ]),
      );
}
