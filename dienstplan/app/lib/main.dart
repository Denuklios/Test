import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'app_model.dart';
import 'services/notifications.dart';
import 'ui/home_shell.dart';
import 'ui/login_screen.dart';
import 'ui/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Notifier.init();
  } catch (_) {}
  final model = AppModel();
  runApp(ChangeNotifierProvider.value(value: model, child: const DienstplanApp()));
  await model.init();
}

class DienstplanApp extends StatefulWidget {
  const DienstplanApp({super.key});

  @override
  State<DienstplanApp> createState() => _DienstplanAppState();
}

class _DienstplanAppState extends State<DienstplanApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    // Abgleich bei jedem Zurückkehren in die App
    if (s == AppLifecycleState.resumed) context.read<AppModel>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    Widget home;
    switch (m.phase) {
      case Phase.loading:
        home = const Scaffold(body: Center(child: CircularProgressIndicator()));
      case Phase.login:
        home = const LoginScreen();
      case Phase.ready:
        home = (m.state?.me.mustChange ?? false) ? const ForcePasswordScreen() : const HomeShell();
    }
    return MaterialApp(
      title: 'Dienstplan',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: m.settings.themeMode,
      locale: const Locale('de', 'DE'),
      supportedLocales: const [Locale('de', 'DE')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: AnimatedSwitcher(duration: const Duration(milliseconds: 250), child: KeyedSubtree(key: ValueKey(m.phase), child: home)),
    );
  }
}
