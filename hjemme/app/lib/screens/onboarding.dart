import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../store.dart';
import '../ui.dart';

/// Einrichtung: Begrüßung → Profil → Kreis gründen oder beitreten
class Onboarding extends StatefulWidget {
  final VoidCallback onDone;
  final bool onlyCircle;
  const Onboarding({super.key, required this.onDone, this.onlyCircle = false});
  @override
  State<Onboarding> createState() => _OnboardingState();
}

class _OnboardingState extends State<Onboarding> {
  late int step = widget.onlyCircle ? 2 : 0;
  final name = TextEditingController();
  final circleName = TextEditingController(text: 'Familie');
  final code = TextEditingController();
  int color = memberColors.first;
  String emoji = '';
  bool busy = false;
  bool joinMode = false;
  Uint8List? photo;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: navy,
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 400), child: switch (step) {
        0 => _welcome(),
        1 => _profile(),
        _ => _circle(),
      }),
    );
  }

  Widget _welcome() {
    return Stack(key: const ValueKey(0), fit: StackFit.expand, children: [
      Image.asset('assets/welcome.jpg', fit: BoxFit.cover),
      const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0x00000000), Color(0x22000000), Color(0xEE0B1433), Color(0xFF0B1433)],
            stops: [0, 0.45, 0.72, 1],
          ),
        ),
      ),
      SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 0, 28, 28),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Spacer(),
            ShaderMask(
              shaderCallback: (r) => brandGradient.createShader(r),
              child: const Text('Hjemme', style: TextStyle(fontSize: 52, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: -1.5)),
            ),
            const SizedBox(height: 8),
            const Text('Wissen, dass alle gut ankommen.',
                style: TextStyle(fontSize: 22, color: Colors.white, fontWeight: FontWeight.w600, height: 1.2)),
            const SizedBox(height: 12),
            Text('Live-Karte für deine Familie, Benachrichtigungen bei Ankunft, SOS-Alarm, Fahrberichte und Chat – '
                'privat auf deinem eigenen Server.',
                style: TextStyle(fontSize: 15, color: Colors.white.withValues(alpha: 0.75), height: 1.4)),
            const SizedBox(height: 28),
            GradientButton('Los geht\'s', icon: Icons.arrow_forward_rounded, onTap: () => setState(() => step = 1)),
          ]),
        ),
      ),
    ]);
  }

  Widget _card({required List<Widget> children, Key? key}) => SafeArea(
        key: key,
        child: ListView(padding: const EdgeInsets.all(24), children: children),
      );

  Widget _profile() {
    final white = Colors.white.withValues(alpha: 0.85);
    return _card(key: const ValueKey(1), children: [
      const SizedBox(height: 12),
      const Text('Wer bist du?', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: Colors.white)),
      const SizedBox(height: 6),
      Text('So sieht dich deine Familie auf der Karte.', style: TextStyle(color: white)),
      const SizedBox(height: 28),
      Center(
        child: GestureDetector(
          onTap: _pickPhoto,
          child: Stack(clipBehavior: Clip.none, children: [
            Container(
              width: 130,
              height: 130,
              padding: EdgeInsets.all(photo == null ? 0 : 5),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: mColor(color),
                boxShadow: [BoxShadow(color: mColor(color).withValues(alpha: 0.6), blurRadius: 30)],
              ),
              alignment: Alignment.center,
              child: photo != null
                  ? ClipOval(child: Image.memory(photo!, width: 120, height: 120, fit: BoxFit.cover))
                  : Text(
                      emoji.isNotEmpty ? emoji : (name.text.trim().isEmpty ? '?' : String.fromCharCode(name.text.trim().runes.first).toUpperCase()),
                      style: TextStyle(fontSize: emoji.isNotEmpty ? 56 : 48, color: Colors.white, fontWeight: FontWeight.w900),
                    ),
            ),
            Positioned(
              right: -2,
              bottom: -2,
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(gradient: brandGradient, shape: BoxShape.circle, border: Border.all(color: navy, width: 3)),
                child: const Icon(Icons.photo_camera_rounded, color: Colors.white, size: 22),
              ),
            ),
          ]),
        ),
      ),
      const SizedBox(height: 10),
      Center(
        child: TextButton.icon(
          onPressed: _pickPhoto,
          icon: const Icon(Icons.add_photo_alternate_rounded, color: Colors.white),
          label: Text(photo == null ? 'Eigenes Foto hochladen' : 'Foto ändern',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        ),
      ),
      const SizedBox(height: 14),
      TextField(
        controller: name,
        autofocus: true,
        textCapitalization: TextCapitalization.words,
        style: const TextStyle(color: Colors.white, fontSize: 18),
        decoration: InputDecoration(hintText: 'Dein Name, z. B. Mama', fillColor: Colors.white.withValues(alpha: 0.08),
            hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4))),
        onChanged: (_) => setState(() {}),
      ),
      const SizedBox(height: 22),
      Text('Farbe', style: TextStyle(color: white, fontWeight: FontWeight.w700)),
      const SizedBox(height: 10),
      Wrap(spacing: 12, runSpacing: 12, children: [
        for (final c in memberColors)
          GestureDetector(
            onTap: () => setState(() => color = c),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: mColor(c),
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: c == color ? 3 : 0),
              ),
            ),
          ),
      ]),
      const SizedBox(height: 22),
      Text('Symbol (optional)', style: TextStyle(color: white, fontWeight: FontWeight.w700)),
      const SizedBox(height: 10),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final e in memberEmojis)
          ChoiceChip(
            label: Text(e.isEmpty ? 'Aa' : e, style: const TextStyle(fontSize: 18)),
            selected: emoji == e,
            onSelected: (_) => setState(() => emoji = e),
          ),
      ]),
      const SizedBox(height: 32),
      GradientButton('Weiter', onTap: name.text.trim().isEmpty || busy ? null : _register),
    ]);
  }

  Future<void> _pickPhoto() async {
    final src = await showModalBottomSheet<ImageSource?>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.photo_camera_rounded), title: const Text('Foto aufnehmen'), onTap: () => Navigator.pop(ctx, ImageSource.camera)),
          ListTile(leading: const Icon(Icons.photo_library_rounded), title: const Text('Aus der Galerie wählen'), onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
          if (photo != null)
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded),
              title: const Text('Foto entfernen'),
              onTap: () {
                setState(() => photo = null);
                Navigator.pop(ctx);
              },
            ),
        ]),
      ),
    );
    if (src == null) return;
    try {
      final f = await ImagePicker().pickImage(source: src, maxWidth: 512, maxHeight: 512, imageQuality: 82, preferredCameraDevice: CameraDevice.front);
      if (f == null) return;
      final b = await f.readAsBytes();
      if (mounted) setState(() => photo = b);
    } catch (e) {
      if (mounted) toast(context, 'Foto konnte nicht geladen werden');
    }
  }

  Future<void> _register() async {
    setState(() => busy = true);
    final ok = await guard(context, () async {
      await store.register(name.text.trim(), color, emoji);
      if (photo != null) await store.uploadAvatar(photo!);
      return true;
    });
    if (!mounted) return;
    setState(() {
      busy = false;
      if (ok == true) step = 2;
    });
  }

  Widget _circle() {
    final white = Colors.white.withValues(alpha: 0.8);
    return _card(key: const ValueKey(2), children: [
      if (widget.onlyCircle) Align(alignment: Alignment.centerLeft, child: BackButton(color: Colors.white, onPressed: () => Navigator.pop(context))),
      const SizedBox(height: 12),
      const Text('Dein Kreis', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: Colors.white)),
      const SizedBox(height: 6),
      Text('Ein Kreis ist eine Gruppe, die ihre Standorte teilt – Familie, Großeltern, beste Freunde.', style: TextStyle(color: white, height: 1.4)),
      const SizedBox(height: 24),
      SegmentedButton<bool>(
        segments: const [
          ButtonSegment(value: false, label: Text('Neu gründen'), icon: Icon(Icons.add_circle_outline)),
          ButtonSegment(value: true, label: Text('Beitreten'), icon: Icon(Icons.vpn_key_outlined)),
        ],
        selected: {joinMode},
        onSelectionChanged: (s) => setState(() => joinMode = s.first),
        style: SegmentedButton.styleFrom(foregroundColor: Colors.white, selectedBackgroundColor: violet, selectedForegroundColor: Colors.white),
      ),
      const SizedBox(height: 24),
      if (!joinMode) ...[
        TextField(
          controller: circleName,
          style: const TextStyle(color: Colors.white, fontSize: 18),
          decoration: InputDecoration(labelText: 'Name des Kreises', fillColor: Colors.white.withValues(alpha: 0.08),
              labelStyle: TextStyle(color: Colors.white.withValues(alpha: 0.6))),
        ),
        const SizedBox(height: 10),
        Wrap(spacing: 8, children: [
          for (final s in ['Familie', 'Großeltern', 'Freunde', 'WG'])
            ActionChip(label: Text(s), onPressed: () => setState(() => circleName.text = s)),
        ]),
        const SizedBox(height: 28),
        GradientButton('Kreis gründen', icon: Icons.favorite_rounded, onTap: busy ? null : () => _go(() => store.createCircle(circleName.text.trim()))),
      ] else ...[
        TextField(
          controller: code,
          textCapitalization: TextCapitalization.characters,
          textAlign: TextAlign.center,
          maxLength: 6,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')), _Upper()],
          style: const TextStyle(color: Colors.white, fontSize: 34, letterSpacing: 10, fontWeight: FontWeight.w800),
          decoration: InputDecoration(hintText: 'ABC123', fillColor: Colors.white.withValues(alpha: 0.08), counterText: '',
              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.2))),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 8),
        Text('Den Code findet ein Mitglied unter „Kreis → Einladen“.', textAlign: TextAlign.center, style: TextStyle(color: white)),
        const SizedBox(height: 28),
        GradientButton('Beitreten', icon: Icons.login_rounded,
            onTap: busy || code.text.length < 6 ? null : () => _go(() => store.join(code.text.trim()))),
      ],
    ]);
  }

  Future<void> _go(Future Function() f) async {
    setState(() => busy = true);
    final ok = await guard(context, () async {
      await f();
      return true;
    });
    if (!mounted) return;
    setState(() => busy = false);
    if (ok == true) widget.onDone();
  }
}

class _Upper extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue o, TextEditingValue n) => n.copyWith(text: n.text.toUpperCase());
}
