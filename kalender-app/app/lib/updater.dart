import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'main.dart';

/// Automatische App-Updates: der Server legt app/version.json und die APK ab,
/// die App prüft beim Start und beim Zurückkehren (höchstens stündlich).
class Updater {
  static const _ch = MethodChannel('kalender/prep');
  static DateTime? _lastCheck;
  static bool _dialogOpen = false;

  static Future<String> currentVersion() async {
    try {
      return (await _ch.invokeMethod<String>('appVersion')) ?? '0';
    } catch (_) {
      return '0';
    }
  }

  static Uri? _base() {
    if (store.serverUrl.isEmpty) return null;
    final u = Uri.parse(store.serverUrl);
    final segs = [...u.pathSegments]..removeLast(); // api.php weg
    return u.replace(pathSegments: [...segs, 'app', ''], query: null);
  }

  static bool newer(String a, String b) {
    List<int> p(String s) => s.split(RegExp(r'[.+]')).map((e) => int.tryParse(e) ?? 0).toList();
    final x = p(a), y = p(b);
    for (var i = 0; i < 4; i++) {
      final xi = i < x.length ? x[i] : 0, yi = i < y.length ? y[i] : 0;
      if (xi != yi) return xi > yi;
    }
    return false;
  }

  /// Gibt (version, url, notes) zurück, wenn eine neuere Version bereitliegt.
  static Future<(String, Uri, String)?> check() async {
    final base = _base();
    if (base == null) return null;
    final r = await http.get(base.resolve('version.json?t=${DateTime.now().millisecondsSinceEpoch}')).timeout(const Duration(seconds: 15));
    if (r.statusCode != 200) return null;
    final j = jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
    final v = (j['version'] ?? '').toString();
    if (v.isEmpty || !newer(v, await currentVersion())) return null;
    return (v, base.resolve('${j['file'] ?? 'familienkalender.apk'}?v=$v'), (j['notes'] ?? '').toString());
  }

  static bool _installing = false;

  /// Automatisch beim Start / Zurückkehren: still laden und ohne Rückfrage installieren
  static Future<void> autoCheck(BuildContext context) async {
    await _announceUpdated(context);
    if (_dialogOpen || _installing) return;
    if (_lastCheck != null && DateTime.now().difference(_lastCheck!) < const Duration(hours: 1)) return;
    _lastCheck = DateTime.now();
    try {
      final u = await check();
      if (u == null || !context.mounted) return;
      if (!store.autoUpdate) {
        await offer(context, u);
        return;
      }
      _installing = true;
      final messenger = ScaffoldMessenger.of(context);
      messenger.showSnackBar(SnackBar(content: Text('Update ${u.$1} wird geladen und installiert …'), duration: const Duration(seconds: 4)));
      final f = await _fetch(u.$2);
      final res = await _ch.invokeMethod<String>('installApkSilent', {'path': f.path});
      _installing = false;
      if (res != 'ok' && context.mounted) {
        // ohne Erlaubnis oder Fehler: wie bisher mit Nachfrage
        await offer(context, u);
      }
    } catch (_) {
      _installing = false;
    }
  }

  /// Nach einem Update einmal „Aktualisiert auf x.y“ zeigen
  static Future<void> _announceUpdated(BuildContext context) async {
    try {
      final p = await SharedPreferences.getInstance();
      final now = await currentVersion();
      final last = p.getString('lastRunVersion') ?? '';
      if (last != now) {
        await p.setString('lastRunVersion', now);
        if (last.isNotEmpty && newer(now, last) && context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Aktualisiert auf $now ✓')));
        }
      }
      final err = await _ch.invokeMethod<String>('lastUpdateError');
      if (err != null && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Automatisches Update fehlgeschlagen: $err')));
      }
    } catch (_) {}
  }

  static Future<File> _fetch(Uri url, {ValueNotifier<double?>? progress}) async {
    final dir = await getTemporaryDirectory();
    final f = File('${dir.path}/familienkalender-update.apk');
    final req = await http.Client().send(http.Request('GET', url));
    if (req.statusCode != 200) throw Exception('HTTP ${req.statusCode}');
    final total = req.contentLength ?? 0;
    var got = 0;
    final sink = f.openWrite();
    await for (final chunk in req.stream) {
      sink.add(chunk);
      got += chunk.length;
      if (total > 0 && progress != null) progress.value = got / total;
    }
    await sink.close();
    return f;
  }

  /// Von Hand (Einstellungen)
  static Future<void> manualCheck(BuildContext context) async {
    try {
      final u = await check();
      if (!context.mounted) return;
      if (u == null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Du hast die neueste Version (${await currentVersion()}) 👍')));
      } else {
        await offer(context, u);
      }
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Update-Prüfung fehlgeschlagen – Internet?')));
    }
  }

  static Future<void> offer(BuildContext context, (String, Uri, String) u) async {
    _dialogOpen = true;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Neue Version ${u.$1} 🎉'),
        content: Text(u.$3.isEmpty ? 'Jetzt aktualisieren? Deine Termine bleiben erhalten.' : '${u.$3}\n\nDeine Termine bleiben erhalten.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Später')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Aktualisieren')),
        ],
      ),
    );
    _dialogOpen = false;
    if (ok == true && context.mounted) await _download(context, u.$2);
  }

  static Future<void> _download(BuildContext context, Uri url) async {
    final progress = ValueNotifier<double?>(null);
    final nav = Navigator.of(context);
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('Update wird geladen …'),
        content: ValueListenableBuilder<double?>(
          valueListenable: progress,
          builder: (_, p, __) => Column(mainAxisSize: MainAxisSize.min, children: [
            LinearProgressIndicator(value: p),
            const SizedBox(height: 8),
            Text(p == null ? '' : '${(p * 100).round()} %'),
          ]),
        ),
      ),
    );
    try {
      final f = await _fetch(url, progress: progress);
      nav.pop();
      // Sitzung bevorzugt: dann ist die App selbst „Installer“ und spätere Updates laufen ohne Rückfrage
      var res = await _ch.invokeMethod<String>('installApkSilent', {'path': f.path});
      if (res != null && res.startsWith('error')) res = await _ch.invokeMethod<String>('installApk', {'path': f.path});
      if (res == 'permission' && context.mounted) {
        await showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Einmal erlauben'),
            content: const Text('Bitte im nächsten Fenster „Aus dieser Quelle zulassen“ einschalten, '
                'zurückkommen und nochmal auf „Aktualisieren“ tippen.'),
            actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
          ),
        );
        await _ch.invokeMethod('openInstallSettings');
        _lastCheck = null;
      }
    } catch (e) {
      nav.pop();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Download fehlgeschlagen: $e')));
    }
  }
}
