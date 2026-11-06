import 'package:flutter/material.dart';

import '../api.dart';
import '../main.dart';
import '../models.dart';
import '../notifications.dart';
import '../store.dart';
import '../widgets/common.dart';

/// Einrichtung: Server -> Gruppe (neu / beitreten) -> Wer bin ich?
class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key});
  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final _url = TextEditingController();
  final _code = TextEditingController();
  final _groupName = TextEditingController(text: 'Familie');
  final _invite = TextEditingController();
  final _name = TextEditingController();
  int _color = memberPalette.first;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _url.text = store.serverUrl.isEmpty ? 'https://www.wunsch-fabrik.dk/kalender' : store.serverUrl;
  }

  /// Einladungstext einfügen: erkennt Server-Adresse und Code
  void _parseInvite(String text) {
    final url = RegExp(r'https?://\S+').firstMatch(text)?.group(0);
    final code = RegExp(r'(?:Code|code)[:\s]+([A-Z0-9]{6,12})').firstMatch(text)?.group(1);
    setState(() {
      if (url != null) _url.text = url.replaceAll(RegExp(r'[).,]+$'), '');
      if (code != null) _code.text = code;
    });
  }

  Future<void> _run(Future<void> Function() f) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await f();
    } catch (e) {
      setState(() => _error = e is ApiException ? e.message : 'Fehler: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _connect({required bool create}) => _run(() async {
        final url = Api.normalizeUrl(_url.text);
        if (url.isEmpty) throw ApiException('Bitte die Server-Adresse eingeben.');
        await Api.ping(url);
        String code;
        if (create) {
          code = await Api.createGroup(url, _groupName.text.trim().isEmpty ? 'Familie' : _groupName.text.trim());
        } else {
          code = _code.text.trim().toUpperCase();
          if (code.isEmpty) throw ApiException('Bitte den Gruppen-Code eingeben.');
          await Api(url, code).groupName();
        }
        store.serverUrl = url;
        store.code = code;
        await store.saveSettings();
        await store.sync();
        if (store.lastError != null) throw ApiException(store.lastError!);
        if (create) await store.seedTemplates();
        setState(() {});
      });

  Future<void> _chooseMember(Member m) async {
    store.myId = m.id;
    await store.saveSettings();
    await Notifier.requestPermission();
    store.onDataChanged?.call();
  }

  Future<void> _createMember() => _run(() async {
        final name = _name.text.trim();
        if (name.isEmpty) throw ApiException('Bitte deinen Namen eingeben.');
        final m = Member(id: newId(), name: name, color: _color);
        await store.saveMember(m);
        await _chooseMember(m);
      });

  @override
  Widget build(BuildContext context) {
    final connected = store.isConnected;
    return Scaffold(
      appBar: AppBar(title: const Text('Familienkalender')),
      body: AbsorbPointer(
        absorbing: _busy,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (_busy) const LinearProgressIndicator(),
            if (_error != null)
              Card(
                color: Colors.red.shade50,
                child: Padding(padding: const EdgeInsets.all(12), child: Text(_error!, style: TextStyle(color: Colors.red.shade900))),
              ),
            if (!connected) ..._connectStep() else ..._whoAmIStep(),
          ],
        ),
      ),
    );
  }

  List<Widget> _connectStep() => [
        const Text('Willkommen! 👋', style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        const Text('Hast du eine Einladung bekommen? Dann füge sie einfach hier ein:'),
        const SizedBox(height: 8),
        TextField(
          controller: _invite,
          maxLines: 3,
          minLines: 1,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Einladung einfügen', prefixIcon: Icon(Icons.mail_outline)),
          onChanged: _parseInvite,
        ),
        const SizedBox(height: 24),
        TextField(
          controller: _url,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            labelText: 'Server-Adresse',
            hintText: 'https://deine-seite.de/kalender',
            prefixIcon: Icon(Icons.cloud_outlined),
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Einer Gruppe beitreten', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 8),
              TextField(
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Gruppen-Code', prefixIcon: Icon(Icons.key)),
              ),
              const SizedBox(height: 10),
              FilledButton.icon(onPressed: () => _connect(create: false), icon: const Icon(Icons.login), label: const Text('Beitreten')),
            ]),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Neuen Kalender anlegen', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 8),
              TextField(
                controller: _groupName,
                decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Name, z. B. „Familie Müller“', prefixIcon: Icon(Icons.groups)),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(onPressed: () => _connect(create: true), icon: const Icon(Icons.add), label: const Text('Anlegen')),
            ]),
          ),
        ),
      ];

  List<Widget> _whoAmIStep() {
    final ms = store.activeMembers;
    return [
      Text('Verbunden mit „${store.groupName}“ ✅', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      const SizedBox(height: 16),
      if (ms.isNotEmpty) ...[
        const Text('Wer bist du?', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        ...ms.map((m) => Card(
              child: ListTile(leading: MemberAvatar(m), title: Text(m.name), trailing: const Icon(Icons.chevron_right), onTap: () => _chooseMember(m)),
            )),
        const SizedBox(height: 16),
        const Text('… oder neu dazukommen:'),
      ] else
        const Text('Wie heißt du?', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      Row(children: [
        InkWell(
          onTap: () async {
            final c = await pickColor(context, _color, taken: ms.map((m) => m.color).toList());
            if (c != null) setState(() => _color = c);
          },
          child: ColorDot(Color(_color), size: 48, child: const Icon(Icons.palette, color: Colors.white)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Dein Name'),
          ),
        ),
      ]),
      const SizedBox(height: 12),
      FilledButton(onPressed: _createMember, child: const Text('Los geht’s')),
      const SizedBox(height: 24),
      TextButton(onPressed: () => store.resetConnection().then((_) => setState(() {})), child: const Text('Anderen Server / andere Gruppe')),
    ];
  }
}
