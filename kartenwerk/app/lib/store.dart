import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'models.dart';

enum SortMode { smart, name, recent, kind }

/// Speichert alle Karten lokal auf dem Gerät (JSON + Bilderordner).
class WalletStore extends ChangeNotifier {
  final List<WalletCard> cards = [];
  late Directory _dir;
  late Directory imgDir;
  bool lockEnabled = false;
  bool brightOnShow = true;
  SortMode sort = SortMode.smart;
  bool loaded = false;

  static const _uuid = Uuid();
  String newId() => _uuid.v4();

  Future<void> load({Directory? baseDir}) async {
    _dir = baseDir ?? await getApplicationDocumentsDirectory();
    imgDir = Directory('${_dir.path}/bilder');
    if (!imgDir.existsSync()) imgDir.createSync(recursive: true);
    final f = File('${_dir.path}/karten.json');
    if (f.existsSync()) {
      try {
        final j = jsonDecode(await f.readAsString()) as Map<String, dynamic>;
        cards
          ..clear()
          ..addAll(((j['cards'] as List?) ?? []).map((e) => WalletCard.fromJson(Map<String, dynamic>.from(e))));
      } catch (_) {
        // beschädigte Datei sichern statt überschreiben
        await f.copy('${_dir.path}/karten-defekt-${DateTime.now().millisecondsSinceEpoch}.json');
      }
    }
    if (baseDir == null) {
      final p = await SharedPreferences.getInstance();
      lockEnabled = p.getBool('lock') ?? false;
      brightOnShow = p.getBool('bright') ?? true;
      sort = SortMode.values.firstWhere((s) => s.name == p.getString('sort'), orElse: () => SortMode.smart);
    }
    loaded = true;
    notifyListeners();
  }

  Future<void> _save() async {
    final f = File('${_dir.path}/karten.json');
    final tmp = File('${f.path}.tmp');
    await tmp.writeAsString(jsonEncode({'v': 1, 'cards': cards.map((c) => c.toJson()).toList()}));
    await tmp.rename(f.path);
  }

  Future<void> setPref(String key, Object v) async {
    final p = await SharedPreferences.getInstance();
    if (v is bool) await p.setBool(key, v);
    if (v is String) await p.setString(key, v);
    if (key == 'lock') lockEnabled = v as bool;
    if (key == 'bright') brightOnShow = v as bool;
    if (key == 'sort') sort = SortMode.values.firstWhere((s) => s.name == v);
    notifyListeners();
  }

  WalletCard? byId(String id) {
    for (final c in cards) {
      if (c.id == id) return c;
    }
    return null;
  }

  Future<void> upsert(WalletCard c) async {
    final i = cards.indexWhere((x) => x.id == c.id);
    if (i >= 0) {
      cards[i] = c;
    } else {
      cards.add(c);
    }
    notifyListeners();
    await _save();
  }

  Future<void> remove(WalletCard c) async {
    cards.removeWhere((x) => x.id == c.id);
    for (final n in [c.frontImage, c.backImage, c.logoImage]) {
      if (n != null) {
        final f = File('${imgDir.path}/$n');
        if (f.existsSync()) f.deleteSync();
      }
    }
    notifyListeners();
    await _save();
  }

  Future<void> touch(WalletCard c) async {
    c.uses++;
    c.lastUsed = DateTime.now();
    await _save();
    notifyListeners();
  }

  Future<void> changed() async {
    notifyListeners();
    await _save();
  }

  File image(String name) => File('${imgDir.path}/$name');

  Future<String> saveImageBytes(Uint8List bytes, {String ext = 'jpg'}) async {
    final name = '${newId()}.$ext';
    await File('${imgDir.path}/$name').writeAsBytes(bytes);
    return name;
  }

  Future<String> saveImageFile(String path) async {
    final ext = path.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
    return saveImageBytes(await File(path).readAsBytes(), ext: ext);
  }

  /// Sortierte Liste nach gewählter Reihenfolge
  List<WalletCard> sorted([String query = '']) {
    final q = query.trim().toLowerCase();
    final list = cards.where((c) {
      if (q.isEmpty) return true;
      return c.name.toLowerCase().contains(q) ||
          c.holder.toLowerCase().contains(q) ||
          c.notes.toLowerCase().contains(q) ||
          c.displayNumber.toLowerCase().contains(q) ||
          c.kind.label.toLowerCase().contains(q);
    }).toList();
    int smartScore(WalletCard c) {
      var s = c.uses * 2;
      if (c.lastUsed != null) {
        final d = DateTime.now().difference(c.lastUsed!).inDays;
        s += (30 - d).clamp(0, 30);
      }
      return s;
    }

    switch (sort) {
      case SortMode.smart:
        list.sort((a, b) {
          if (a.favorite != b.favorite) return a.favorite ? -1 : 1;
          return smartScore(b).compareTo(smartScore(a));
        });
      case SortMode.name:
        list.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      case SortMode.recent:
        list.sort((a, b) => b.created.compareTo(a.created));
      case SortMode.kind:
        list.sort((a, b) {
          final k = a.kind.index.compareTo(b.kind.index);
          return k != 0 ? k : a.name.toLowerCase().compareTo(b.name.toLowerCase());
        });
    }
    return list;
  }

  /// Karten, die bald ablaufen (inkl. abgelaufene der letzten 7 Tage)
  List<WalletCard> expiringSoon({int days = 30}) {
    final l = cards.where((c) {
      final d = c.daysLeft;
      return d != null && d <= days && d >= -7;
    }).toList();
    l.sort((a, b) => a.daysLeft!.compareTo(b.daysLeft!));
    return l;
  }

  List<WalletCard> get pointCards => cards.where((c) => c.hasPoints || c.balance != null).toList()
    ..sort((a, b) => b.totalWorth.compareTo(a.totalWorth));

  /// Gesamtwert pro Währung
  Map<String, double> totalWorth() {
    final m = <String, double>{};
    for (final c in cards) {
      final w = c.totalWorth;
      if (w > 0) m[c.currency] = (m[c.currency] ?? 0) + w;
    }
    return m;
  }

  // ---------- Sicherung ----------

  Future<File> exportBackup() async {
    final a = Archive();
    final json = utf8.encode(jsonEncode({'v': 1, 'app': 'kartenwerk', 'cards': cards.map((c) => c.toJson()).toList()}));
    a.addFile(ArchiveFile('karten.json', json.length, json));
    for (final f in imgDir.listSync().whereType<File>()) {
      final b = f.readAsBytesSync();
      a.addFile(ArchiveFile('bilder/${f.uri.pathSegments.last}', b.length, b));
    }
    final zip = ZipEncoder().encode(a);
    final tmp = await getTemporaryDirectory();
    final d = DateTime.now();
    final out = File('${tmp.path}/Kartenwerk-Sicherung-${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}.zip');
    await out.writeAsBytes(zip);
    return out;
  }

  /// Gibt (neu, aktualisiert) zurück
  Future<(int, int)> importBackup(Uint8List bytes) async {
    final a = ZipDecoder().decodeBytes(bytes);
    final js = a.findFile('karten.json');
    if (js == null) throw Exception('Keine Kartenwerk-Sicherung');
    final j = jsonDecode(utf8.decode(js.content as List<int>)) as Map<String, dynamic>;
    for (final f in a.files) {
      if (f.isFile && f.name.startsWith('bilder/')) {
        final name = f.name.substring(7);
        if (name.isEmpty || name.contains('/') || name.contains('..')) continue;
        final target = File('${imgDir.path}/$name');
        if (!target.existsSync()) await target.writeAsBytes(f.content as List<int>);
      }
    }
    var neu = 0, upd = 0;
    for (final e in (j['cards'] as List? ?? [])) {
      final c = WalletCard.fromJson(Map<String, dynamic>.from(e));
      final i = cards.indexWhere((x) => x.id == c.id);
      if (i >= 0) {
        cards[i] = c;
        upd++;
      } else {
        cards.add(c);
        neu++;
      }
    }
    notifyListeners();
    await _save();
    return (neu, upd);
  }
}

final store = WalletStore();
