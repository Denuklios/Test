import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:local_auth/local_auth.dart';
import 'package:material_ui/material_ui.dart';
import 'package:share_plus/share_plus.dart';

import '../store.dart';
import '../ui.dart';
import '../updater.dart';
import 'add.dart';

class SettingsTab extends StatefulWidget {
  const SettingsTab({super.key});
  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> {
  String version = '';

  @override
  void initState() {
    super.initState();
    Updater.currentVersion().then((v) => mounted ? setState(() => version = v) : null);
  }

  Future<void> _toggleLock(bool v) async {
    if (v) {
      final auth = LocalAuthentication();
      try {
        if (!await auth.isDeviceSupported()) {
          if (mounted) toast(context, 'Auf diesem Gerät ist keine Bildschirmsperre eingerichtet.');
          return;
        }
        final ok = await auth.authenticate(localizedReason: 'App-Sperre für Kartenwerk einschalten');
        if (!ok) return;
      } catch (e) {
        if (mounted) toast(context, 'Sperre nicht möglich: $e');
        return;
      }
    }
    await store.setPref('lock', v);
  }

  Future<void> _backup() async {
    try {
      final f = await store.exportBackup();
      await SharePlus.instance.share(ShareParams(files: [XFile(f.path)], text: 'Kartenwerk-Sicherung (${store.cards.length} Karten)'));
    } catch (e) {
      if (mounted) toast(context, 'Sicherung fehlgeschlagen: $e');
    }
  }

  Future<void> _restore() async {
    try {
      final files = await FilePicker.pickFiles(type: FileType.any);
      if (files.isEmpty || files.first.path == null) return;
      final (neu, upd) = await store.importBackup(await File(files.first.path!).readAsBytes());
      if (mounted) toast(context, 'Wiederhergestellt: $neu neu, $upd aktualisiert');
    } catch (e) {
      if (mounted) toast(context, 'Wiederherstellen fehlgeschlagen: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) => ListView(padding: const EdgeInsets.only(bottom: 40), children: [
        SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
            child: Row(children: [
              ClipRRect(borderRadius: BorderRadius.circular(14), child: Image.asset('assets/icon.png', width: 56, height: 56)),
              const SizedBox(width: 14),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Kartenwerk', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                Text('Version $version · ${store.cards.length} Karten', style: const TextStyle(color: K.muted)),
              ]),
            ]),
          ),
        ),
        const SectionTitle('Sicherheit & Anzeige'),
        SwitchListTile(
          secondary: const Icon(Icons.fingerprint_rounded),
          title: const Text('App-Sperre'),
          subtitle: const Text('Fingerabdruck / Gesicht / PIN beim Öffnen'),
          value: store.lockEnabled,
          activeThumbColor: K.gold,
          onChanged: _toggleLock,
        ),
        SwitchListTile(
          secondary: const Icon(Icons.brightness_high_rounded),
          title: const Text('Volle Helligkeit beim Vorzeigen'),
          subtitle: const Text('Damit Kassen-Scanner den Code sicher lesen'),
          value: store.brightOnShow,
          activeThumbColor: K.gold,
          onChanged: (v) => store.setPref('bright', v),
        ),
        ListTile(
          leading: const Icon(Icons.sort_rounded),
          title: const Text('Reihenfolge'),
          trailing: DropdownButton<SortMode>(
            value: store.sort,
            underline: const SizedBox.shrink(),
            items: const [
              DropdownMenuItem(value: SortMode.smart, child: Text('Clever (oft genutzt)')),
              DropdownMenuItem(value: SortMode.name, child: Text('Name A–Z')),
              DropdownMenuItem(value: SortMode.recent, child: Text('Neueste zuerst')),
              DropdownMenuItem(value: SortMode.kind, child: Text('Nach Art')),
            ],
            onChanged: (v) => store.setPref('sort', v!.name),
          ),
        ),
        const SectionTitle('Importieren'),
        ListTile(
          leading: const Icon(Icons.wallet_rounded, color: K.coral),
          title: const Text('Wallet-Pass importieren (.pkpass)'),
          subtitle: const Text('Oder in Mail/Downloads auf die Datei tippen → „Kartenwerk“'),
          onTap: () => importPkpass(context),
        ),
        const SectionTitle('Sicherung'),
        ListTile(
          leading: const Icon(Icons.cloud_upload_rounded, color: K.teal),
          title: const Text('Sicherung erstellen & teilen'),
          subtitle: const Text('Alle Karten, Fotos und Punkteverläufe als ZIP – z. B. in Google Drive speichern'),
          onTap: _backup,
        ),
        ListTile(
          leading: const Icon(Icons.cloud_download_rounded, color: K.teal),
          title: const Text('Sicherung wiederherstellen'),
          subtitle: const Text('Vorhandene Karten bleiben, gleiche werden aktualisiert'),
          onTap: _restore,
        ),
        const SectionTitle('App'),
        ListTile(
          leading: const Icon(Icons.system_update_rounded),
          title: const Text('Nach Updates suchen'),
          subtitle: const Text('Updates kommen sonst automatisch'),
          onTap: () => Updater.manualCheck(context),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 16, 20, 0),
          child: Text(
            'Alle Daten bleiben auf deinem Handy. Kartenwerk schickt keine Karten ins Internet – nur die Update-Prüfung fragt den Server nach der neuesten Version.',
            style: TextStyle(color: K.muted, fontSize: 12.5, height: 1.4),
          ),
        ),
      ]),
    );
  }
}
