import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../models.dart';
import '../ocr.dart';
import '../parse.dart';
import '../store.dart';
import '../templates.dart';
import '../ui.dart';
import 'edit.dart';
import 'scan.dart';

/// Auswahl, wie eine neue Karte hinzukommt.
Future<void> showAddSheet(BuildContext context) async {
  final choice = await showModalBottomSheet<String>(
    context: context,
    backgroundColor: K.navy2,
    showDragHandle: true,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Karte hinzufügen', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          _opt(ctx, 'scan', Icons.qr_code_scanner_rounded, K.gold, 'Barcode scannen', 'Kundenkarte, Gutschein, Ticket – Kamera drauf, fertig'),
          _opt(ctx, 'photo', Icons.photo_camera_rounded, K.teal, 'Karte fotografieren', 'Vorder- und Rückseite als Bild, Code wird automatisch gesucht'),
          _opt(ctx, 'pkpass', Icons.wallet_rounded, K.coral, 'Wallet-Pass importieren (.pkpass)', 'Boardingpässe, Tickets, Kundenkarten aus Mails – inkl. Punkte'),
          _opt(ctx, 'template', Icons.auto_awesome_rounded, const Color(0xFF9C8CFF), 'Aus Vorlage', 'PAYBACK, Coop, Miles & More, … mit Punkte-Link'),
          _opt(ctx, 'manual', Icons.edit_rounded, K.muted, 'Selbst eintragen', 'Nummer, Notizen, PIN, Ausweis, alles was du willst'),
        ]),
      ),
    ),
  );
  if (choice == null || !context.mounted) return;
  switch (choice) {
    case 'scan':
      await _scanFlow(context);
    case 'photo':
      await _photoFlow(context);
    case 'pkpass':
      await importPkpass(context);
    case 'template':
      await _templateFlow(context);
    case 'manual':
      await _openEditor(context, WalletCard(id: store.newId(), name: ''));
  }
}

Widget _opt(BuildContext ctx, String id, IconData icon, Color c, String title, String sub) => Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: K.navy3.withValues(alpha: .6),
        borderRadius: BorderRadius.circular(16),
        child: ListTile(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          leading: CircleAvatar(backgroundColor: c.withValues(alpha: .18), child: Icon(icon, color: c)),
          title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(sub, style: const TextStyle(color: K.muted, fontSize: 12.5)),
          onTap: () => Navigator.pop(ctx, id),
        ),
      ),
    );

Future<void> _openEditor(BuildContext context, WalletCard c, {bool isNew = true}) async {
  await Navigator.push(context, MaterialPageRoute(builder: (_) => EditCardScreen(card: c, isNew: isNew)));
}

Future<void> _scanFlow(BuildContext context) async {
  final r = await Navigator.push<ScanResult>(context, MaterialPageRoute(builder: (_) => const ScanScreen()));
  if (r == null || !context.mounted) return;
  final c = WalletCard(id: store.newId(), name: '', code: r.code, codeType: r.type, source: r.code.isEmpty ? 'manual' : 'scan');
  final t = guessTemplate(r.code);
  if (t != null) _applyTemplate(c, t);
  if (!context.mounted) return;
  await _openEditor(context, c);
}

void _applyTemplate(WalletCard c, CardTemplate t) {
  c.name = c.name.isEmpty ? t.name : c.name;
  c.color = t.color;
  c.kind = t.kind;
  c.pointsUnit = t.unit;
  c.pointValue = t.pointValue;
  c.currency = t.currency;
  c.website = t.website;
  c.tracksPoints = t.tracksPoints;
  if (c.code.isEmpty) c.codeType = t.code;
}

Future<void> _templateFlow(BuildContext context) async {
  final t = await showModalBottomSheet<CardTemplate>(
    context: context,
    backgroundColor: K.navy2,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: .75,
      builder: (ctx, sc) => ListView(controller: sc, padding: const EdgeInsets.all(12), children: [
        const Padding(padding: EdgeInsets.all(8), child: Text('Vorlage wählen', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
        for (final t in templates)
          ListTile(
            leading: Container(width: 44, height: 28, decoration: BoxDecoration(color: Color(t.color), borderRadius: BorderRadius.circular(6))),
            title: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text(t.kind == CardKind.points ? 'Punkte in ${t.unit}${t.pointValue != null ? ' · 1 = ${t.pointValue} ${t.currency}' : ''}' : t.kind.label,
                style: const TextStyle(color: K.muted)),
            onTap: () => Navigator.pop(ctx, t),
          ),
      ]),
    ),
  );
  if (t == null || !context.mounted) return;
  final c = WalletCard(id: store.newId(), name: t.name);
  _applyTemplate(c, t);
  // gleich scannen anbieten
  if (t.code != CodeType.none) {
    final r = await Navigator.push<ScanResult>(context, MaterialPageRoute(builder: (_) => const ScanScreen()));
    if (r != null && r.code.isNotEmpty) {
      c.code = r.code;
      c.codeType = r.type;
      c.source = 'scan';
    }
  }
  if (!context.mounted) return;
  await _openEditor(context, c);
}

/// Sucht in einem Bild nach einem Barcode
Future<ScanResult?> findCodeInImage(String path) async {
  final ctrl = MobileScannerController(autoStart: false);
  try {
    final res = await ctrl.analyzeImage(path);
    if (res == null || res.barcodes.isEmpty || res.barcodes.first.rawValue == null) return null;
    final b = res.barcodes.first;
    return ScanResult(b.rawValue!, codeTypeFrom(b.format));
  } catch (_) {
    return null;
  } finally {
    await ctrl.dispose();
  }
}

Future<void> _photoFlow(BuildContext context) async {
  final picker = ImagePicker();
  final front = await picker.pickImage(source: ImageSource.camera, imageQuality: 88, maxWidth: 1600);
  if (front == null || !context.mounted) return;
  final c = WalletCard(id: store.newId(), name: '', source: 'photo', codeType: CodeType.none);
  c.frontImage = await store.saveImageFile(front.path);
  var code = await findCodeInImage(front.path);
  if (!context.mounted) return;
  final back = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Rückseite auch?'),
      content: Text(code != null ? 'Code gefunden ✓ – willst du die Rückseite trotzdem fotografieren?' : 'Auf der Vorderseite war kein Code. Meist ist er hinten – Rückseite fotografieren?'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Nein')),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Rückseite')),
      ],
    ),
  );
  String text = '';
  try {
    text = await readText(front.path);
  } catch (_) {}
  if (back == true) {
    final b = await picker.pickImage(source: ImageSource.camera, imageQuality: 88, maxWidth: 1600);
    if (b != null) {
      c.backImage = await store.saveImageFile(b.path);
      code ??= await findCodeInImage(b.path);
      try {
        text = '$text\n${await readText(b.path)}';
      } catch (_) {}
    }
  }
  if (code != null) {
    c.code = code.code;
    c.codeType = code.type;
  }
  final t = guessTemplate(text);
  if (t != null) _applyTemplate(c, t);
  if (c.name.isEmpty) {
    // Längste Zeile mit Buchstaben als Namensvorschlag
    final lines = text.split('\n').where((l) => RegExp(r'[A-Za-zÄÖÜÆØÅäöüæøå]{3,}').hasMatch(l) && l.length < 30).toList();
    if (lines.isNotEmpty) c.name = lines.first.trim();
  }
  if (c.code.isEmpty) {
    final m = RegExp(r'\b\d[\d ]{7,22}\d\b').firstMatch(text);
    if (m != null) c.number = m.group(0)!;
  }
  if (!context.mounted) return;
  await _openEditor(context, c);
}

Future<void> importPkpass(BuildContext context, {Uint8List? bytes}) async {
  try {
    if (bytes == null) {
      final files = await FilePicker.pickFiles(type: FileType.any);
      if (files.isEmpty) return;
      final p = files.first.path;
      if (p == null) throw Exception('Datei nicht lesbar');
      bytes = await File(p).readAsBytes();
    }
    final imp = parsePkpass(bytes, store.newId);
    if (imp.logo != null) imp.card.logoImage = await store.saveImageBytes(imp.logo!, ext: 'png');
    if (!context.mounted) return;
    await _openEditor(context, imp.card);
  } catch (e) {
    if (context.mounted) toast(context, 'Import nicht möglich: $e');
  }
}
