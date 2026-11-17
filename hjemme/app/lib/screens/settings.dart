import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';
import '../events.dart';
import '../models.dart';
import '../store.dart';
import '../tracker.dart';
import '../ui.dart';
import '../updater.dart';
import 'home.dart';
import 'member.dart';
import 'onboarding.dart';

String appLink() {
  final u = Uri.parse(store.api.server);
  final segs = [...u.pathSegments]..removeLast();
  return u.replace(pathSegments: [...segs, ''], query: null).toString().replaceAll('?', '');
}

void showInvite(BuildContext context, Circle c) {
  final msg = 'Komm in meinen Kreis „${c.name}“ bei Hjemme! 💜\n\n'
      '1. App laden: ${appLink()}\n'
      '2. Beim Einrichten „Beitreten“ wählen und den Code eingeben: ${c.code}';
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('In „${c.name}“ einladen', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            decoration: BoxDecoration(gradient: brandGradient, borderRadius: BorderRadius.circular(20)),
            child: Text(c.code, style: const TextStyle(color: Colors.white, fontSize: 40, letterSpacing: 10, fontWeight: FontWeight.w900)),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
            child: QrImageView(data: '${appLink()}#${c.code}', size: 170),
          ),
          const SizedBox(height: 8),
          const Text('QR-Code führt zum App-Download, der Code steht dabei.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12)),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: c.code));
                  toast(ctx, 'Code kopiert');
                },
                icon: const Icon(Icons.copy_rounded),
                label: const Text('Kopieren'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: FilledButton.icon(
                onPressed: () => SharePlus.instance.share(ShareParams(text: msg)),
                icon: const Icon(Icons.share_rounded),
                label: const Text('Teilen'),
              ),
            ),
          ]),
        ]),
      ),
    ),
  );
}

/// Schritt für Schritt: Standort „Immer“, Benachrichtigungen, Akku-Optimierung aus
Future<void> askBackgroundPermission(BuildContext context) async {
  var p = await Geolocator.checkPermission();
  if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
  if (p == LocationPermission.deniedForever) {
    await Geolocator.openAppSettings();
    return;
  }
  if (p != LocationPermission.always && context.mounted) {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Standort „Immer erlauben“'),
        content: const Text('Damit deine Familie auch Bescheid bekommt, wenn die App geschlossen ist, '
            'braucht Hjemme den Standort im Hintergrund.\n\nIm nächsten Fenster bitte „Immer zulassen“ wählen.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Später')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Weiter')),
        ],
      ),
    );
    if (go == true) {
      final r = await Permission.locationAlways.request();
      if (!r.isGranted) await Geolocator.openAppSettings();
    }
  }
  if (!await Permission.ignoreBatteryOptimizations.isGranted) {
    await Permission.ignoreBatteryOptimizations.request();
  }
  await Tracker.i.start();
}

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final c = store.circle;
        final me = c?.member(store.api.memberId ?? '') ?? store.me;
        final admin = me?.isAdmin ?? false;
        return Scaffold(
          appBar: AppBar(title: const Text('Einstellungen')),
          body: ListView(children: [
            if (me != null)
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                leading: Avatar(me, size: 56),
                title: Text(me.name, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                subtitle: const Text('Profil, Foto, Telefonnummer'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen())),
              ),
            if (me != null && c != null) Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: privacyControls(context, me)),
            if (c != null) ...[
              _head('Kreis „${c.name}“'),
              ListTile(
                leading: const Icon(Icons.swap_horiz_rounded),
                title: const Text('Kreis wechseln'),
                subtitle: Text('Aktuell: ${c.name}${store.circles.length > 1 ? ' · ${store.circles.length} Kreise' : ''}'),
                onTap: () => showCirclePicker(context),
              ),
              ListTile(leading: const Icon(Icons.person_add_alt_1_rounded), title: const Text('Einladen'), subtitle: Text('Code ${c.code}'), onTap: () => showInvite(context, c)),
              if (admin)
                ListTile(
                  leading: const Icon(Icons.edit_rounded),
                  title: const Text('Kreis umbenennen'),
                  onTap: () async {
                    final n = await _ask(context, 'Name des Kreises', c.name);
                    if (n != null && n.isNotEmpty && context.mounted) await guard(context, () => store.updateCircle(name: n));
                  },
                ),
              if (admin)
                ListTile(
                  leading: const Icon(Icons.speed_rounded),
                  title: const Text('Tempo-Warnung'),
                  subtitle: Text(c.speedLimit > 0 ? 'Meldung ab ${c.speedLimit.round()} km/h' : 'Aus'),
                  onTap: () async {
                    final v = await showDialog<double>(
                      context: context,
                      builder: (ctx) => SimpleDialog(title: const Text('Benachrichtigen ab …'), children: [
                        for (final v in [0, 60, 80, 100, 120, 130, 150])
                          SimpleDialogOption(onPressed: () => Navigator.pop(ctx, v.toDouble()), child: Text(v == 0 ? 'Aus' : '$v km/h')),
                      ]),
                    );
                    if (v != null && context.mounted) await guard(context, () => store.updateCircle(settings: {'speedLimit': v}));
                  },
                ),
              if (admin)
                ListTile(
                  leading: const Icon(Icons.autorenew_rounded),
                  title: const Text('Neuen Einladungs-Code erzeugen'),
                  subtitle: const Text('Der alte Code funktioniert dann nicht mehr'),
                  onTap: () => guard(context, () => store.updateCircle(newCode: true)),
                ),
              ListTile(
                leading: const Icon(Icons.add_circle_outline_rounded),
                title: const Text('Weiteren Kreis gründen oder beitreten'),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AddCircleScreen())),
              ),
              ListTile(
                leading: const Icon(Icons.logout_rounded, color: Colors.red),
                title: const Text('Kreis verlassen', style: TextStyle(color: Colors.red)),
                onTap: () async {
                  final ok = await _confirm(context, '„${c.name}“ verlassen?', 'Du siehst die anderen dann nicht mehr und sie dich nicht.');
                  if (ok && context.mounted) await guard(context, () => store.leave(c.id));
                },
              ),
            ],
            _head('Benachrichtigungen'),
            const _NotifySwitches(),
            _head('Hintergrund'),
            const _BackgroundStatus(),
            _head('App'),
            ListTile(
              leading: const Icon(Icons.system_update_rounded),
              title: const Text('Nach Updates suchen'),
              subtitle: FutureBuilder<String>(future: Updater.currentVersion(), builder: (_, s) => Text('Version ${s.data ?? ''}')),
              onTap: () => Updater.manualCheck(context),
            ),
            ListTile(
              leading: const Icon(Icons.dns_rounded),
              title: const Text('Server'),
              subtitle: Text(store.api.server),
              onTap: () async {
                final s = await _ask(context, 'Server-Adresse (api.php)', store.api.server);
                if (s == null || s.isEmpty) return;
                store.api.server = s;
                await store.api.save();
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_forever_rounded, color: Colors.red),
              title: const Text('Konto löschen', style: TextStyle(color: Colors.red)),
              subtitle: const Text('Entfernt dich aus allen Kreisen und löscht deinen Verlauf'),
              onTap: () async {
                final ok = await _confirm(context, 'Konto wirklich löschen?', 'Alle Standorte und dein Verlauf werden gelöscht. Das lässt sich nicht rückgängig machen.');
                if (!ok || !context.mounted) return;
                await guard(context, () => store.api.post('delete_account', {}));
                await store.logout();
                if (context.mounted) Navigator.of(context).popUntil((r) => r.isFirst);
              },
            ),
            const SizedBox(height: 30),
            Center(child: Text('Hjemme · Kartendaten © OpenStreetMap-Mitwirkende, Esri', style: TextStyle(fontSize: 11, color: Theme.of(context).hintColor))),
            const SizedBox(height: 30),
          ]),
        );
      },
    );
  }

  Widget _head(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 22, 16, 4),
        child: Text(t.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12, letterSpacing: 1.2, color: violet)),
      );
}

Future<bool> _confirm(BuildContext context, String title, String text) async =>
    await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(text),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Ja')),
        ],
      ),
    ) ==
    true;

Future<String?> _ask(BuildContext context, String label, String initial, {TextInputType? type}) {
  final t = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(label),
      content: TextField(controller: t, autofocus: true, keyboardType: type),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Abbrechen')),
        FilledButton(onPressed: () => Navigator.pop(ctx, t.text.trim()), child: const Text('OK')),
      ],
    ),
  );
}

class _NotifySwitches extends StatefulWidget {
  const _NotifySwitches();
  @override
  State<_NotifySwitches> createState() => _NotifySwitchesState();
}

class _NotifySwitchesState extends State<_NotifySwitches> {
  Set<String> off = {};
  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) => setState(() => off = (p.getStringList('notifyOff') ?? []).toSet()));
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      for (final e in notifyKinds.entries)
        SwitchListTile(
          title: Text(e.value),
          value: !off.contains(e.key),
          onChanged: (v) async {
            setState(() => v ? off.remove(e.key) : off.add(e.key));
            final p = await SharedPreferences.getInstance();
            await p.setStringList('notifyOff', off.toList());
          },
        ),
      const ListTile(dense: true, leading: Icon(Icons.info_outline_rounded), title: Text('SOS und „Handy klingeln“ kommen immer an.')),
    ]);
  }
}

class _BackgroundStatus extends StatefulWidget {
  const _BackgroundStatus();
  @override
  State<_BackgroundStatus> createState() => _BackgroundStatusState();
}

class _BackgroundStatusState extends State<_BackgroundStatus> {
  bool? always, battery;
  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final a = await Tracker.hasPermission(background: true);
    final b = await Permission.ignoreBatteryOptimizations.isGranted;
    if (mounted) {
      setState(() {
        always = a;
        battery = b;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget row(String t, bool? ok) => ListTile(
          leading: Icon(ok == true ? Icons.check_circle_rounded : Icons.error_rounded, color: ok == true ? Colors.green : coral),
          title: Text(t),
          subtitle: Text(ok == true ? 'Eingeschaltet' : 'Tippen zum Einschalten'),
          onTap: ok == true
              ? null
              : () async {
                  await askBackgroundPermission(context);
                  _check();
                },
        );
    return Column(children: [
      row('Standort „Immer“', always),
      row('Akku-Optimierung aus (zuverlässiger)', battery),
    ]);
  }
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late Member me = store.circle?.member(store.api.memberId ?? '') ?? store.me!;
  late final name = TextEditingController(text: me.name);
  late final phone = TextEditingController(text: me.phone ?? '');
  late int color = me.color;
  late String emoji = me.emoji;
  bool busy = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mein Profil')),
      body: ListenableBuilder(
        listenable: store,
        builder: (context, _) {
          me = store.circle?.member(store.api.memberId ?? '') ?? store.me ?? me;
          return ListView(padding: const EdgeInsets.all(20), children: [
            Center(
              child: Stack(children: [
                Avatar(Member(id: me.id, name: name.text, color: color, emoji: emoji, avatar: me.avatar), size: 120),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: FloatingActionButton.small(heroTag: 'pic', onPressed: _photo, child: const Icon(Icons.photo_camera_rounded)),
                ),
              ]),
            ),
            const SizedBox(height: 20),
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name'), onChanged: (_) => setState(() {})),
            const SizedBox(height: 12),
            TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Telefonnummer (für „Anrufen“)', prefixIcon: Icon(Icons.phone_rounded))),
            const SizedBox(height: 18),
            const Text('Farbe', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Wrap(spacing: 10, runSpacing: 10, children: [
              for (final c in memberColors)
                GestureDetector(
                  onTap: () => setState(() => color = c),
                  child: Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(color: mColor(c), shape: BoxShape.circle,
                        border: Border.all(color: Theme.of(context).colorScheme.onSurface, width: c == color ? 3 : 0)),
                  ),
                ),
            ]),
            const SizedBox(height: 18),
            const Text('Symbol', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final e in memberEmojis)
                ChoiceChip(label: Text(e.isEmpty ? 'Aa' : e), selected: emoji == e, onSelected: (_) => setState(() => emoji = e)),
            ]),
            const SizedBox(height: 28),
            GradientButton('Speichern', icon: Icons.check_rounded, onTap: busy
                ? null
                : () async {
                    setState(() => busy = true);
                    final ok = await guard(context, () async {
                      await store.profile(name: name.text.trim(), phone: phone.text.trim(), color: color, emoji: emoji);
                      return true;
                    });
                    if (!context.mounted) return;
                    setState(() => busy = false);
                    if (ok == true) Navigator.pop(context);
                  }),
          ]);
        },
      ),
    );
  }

  Future<void> _photo() async {
    final src = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.photo_camera_rounded), title: const Text('Foto aufnehmen'), onTap: () => Navigator.pop(ctx, ImageSource.camera)),
          ListTile(leading: const Icon(Icons.photo_library_rounded), title: const Text('Aus Galerie'), onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
        ]),
      ),
    );
    if (src == null) return;
    final f = await ImagePicker().pickImage(source: src, maxWidth: 400, maxHeight: 400, imageQuality: 80, preferredCameraDevice: CameraDevice.front);
    if (f == null || !mounted) return;
    final bytes = await f.readAsBytes();
    if (!mounted) return;
    await guard(context, () => store.uploadAvatar(bytes));
  }
}

class AddCircleScreen extends StatelessWidget {
  const AddCircleScreen({super.key});
  @override
  Widget build(BuildContext context) => Onboarding(onlyCircle: true, onDone: () => Navigator.pop(context));
}

// für Tests/Debug: Server erreichbar?
Future<bool> serverReachable() async {
  try {
    await Api(server: store.api.server).get('ping');
    return true;
  } catch (_) {
    return false;
  }
}
