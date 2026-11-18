import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';

import 'models.dart';
import 'templates.dart';

/// Zahl aus Text lesen – versteht 1.234,56 / 1,234.56 / 1 234 / 1234
double? parseNumber(String raw) {
  var s = raw.replaceAll(RegExp(r'[^0-9,.\-]'), '');
  if (s.isEmpty || !RegExp(r'\d').hasMatch(s)) return null;
  final lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replaceAll('.', '').replaceAll(',', '.');
    } else {
      s = s.replaceAll(',', '');
    }
  } else {
    // nur ein Trennzeichen-Typ: 1,5 / 12.50 = Dezimal ; 1,234 / 1.234 / 1.234.567 = Tausender
    for (final sep in [',', '.']) {
      final idx = s.lastIndexOf(sep);
      if (idx < 0) continue;
      final count = sep.allMatches(s).length;
      final after = s.length - idx - 1;
      s = (count > 1 || after == 3) ? s.replaceAll(sep, '') : s.replaceAll(sep, '.');
    }
  }
  return double.tryParse(s);
}

final _pointWords = RegExp(
    r'punkt|point|pkt|bonus|saldo|balance|meilen|miles|stars|sterne|guthaben|stempel|stamps|credits|coins|kr\.? bonus|optjent|tilgode',
    caseSensitive: false);

/// Kandidat aus OCR / pkpass
class NumberCandidate {
  final double value;
  final String context;
  final int score;
  NumberCandidate(this.value, this.context, this.score);
}

/// Sucht in erkanntem Text nach dem wahrscheinlichsten Punktestand.
List<NumberCandidate> findPointCandidates(String text) {
  final lines = text.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).toList();
  final out = <NumberCandidate>[];
  final numRe = RegExp(r'-?\d[\d.,  ]*\d|\d');
  for (var i = 0; i < lines.length; i++) {
    final l = lines[i];
    for (final m in numRe.allMatches(l)) {
      final raw = m.group(0)!.replaceAll(RegExp(r'[  ]'), '');
      final v = parseNumber(raw);
      if (v == null || v < 0) continue;
      // Datum, Uhrzeit, Telefonnummern, lange Kartennummern überspringen
      if (RegExp(r'^\d{1,2}[./]\d{1,2}[./]\d{2,4}$').hasMatch(raw)) continue;
      if (RegExp(r'\d{1,2}:\d{2}').hasMatch(l.substring(m.start, (m.end + 3).clamp(0, l.length)))) continue;
      if (raw.replaceAll(RegExp(r'\D'), '').length > 9) continue;
      var score = 0;
      final near = [if (i > 0) lines[i - 1], l, if (i + 1 < lines.length) lines[i + 1]].join(' ');
      if (_pointWords.hasMatch(l)) score += 6;
      if (_pointWords.hasMatch(near)) score += 3;
      if (v >= 10) score += 1;
      if (v == v.roundToDouble()) score += 1;
      if (RegExp(r'%').hasMatch(l)) score -= 3;
      if (v > 1900 && v < 2100 && v == v.roundToDouble()) score -= 2; // Jahreszahl
      out.add(NumberCandidate(v, l, score));
    }
  }
  out.sort((a, b) => b.score.compareTo(a.score));
  // Doppelte Werte entfernen
  final seen = <double>{};
  return out.where((c) => seen.add(c.value)).take(8).toList();
}

// ------------------------------------------------------------------
// Apple-Wallet-Pässe (.pkpass) – werden u. a. von Fluglinien, Kinos,
// Konzertveranstaltern und vielen Kundenkarten per Mail verschickt.
// ------------------------------------------------------------------

class PassImport {
  final WalletCard card;
  final Uint8List? logo;
  final Uint8List? strip;
  PassImport(this.card, this.logo, this.strip);
}

int? _rgb(String? s) {
  if (s == null) return null;
  final m = RegExp(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)').firstMatch(s);
  if (m != null) {
    return 0xFF000000 | (int.parse(m[1]!) << 16) | (int.parse(m[2]!) << 8) | int.parse(m[3]!);
  }
  if (s.startsWith('#') && s.length == 7) return 0xFF000000 | int.parse(s.substring(1), radix: 16);
  return null;
}

CodeType _passFormat(String? f) => switch (f) {
      'PKBarcodeFormatQR' => CodeType.qr,
      'PKBarcodeFormatPDF417' => CodeType.pdf417,
      'PKBarcodeFormatAztec' => CodeType.aztec,
      'PKBarcodeFormatCode128' => CodeType.code128,
      _ => CodeType.qr,
    };

String _decodeText(List<int> b) {
  if (b.length >= 2 && b[0] == 0xFF && b[1] == 0xFE) {
    final u = <int>[];
    for (var i = 2; i + 1 < b.length; i += 2) {
      u.add(b[i] | (b[i + 1] << 8));
    }
    return String.fromCharCodes(u);
  }
  if (b.length >= 2 && b[0] == 0xFE && b[1] == 0xFF) {
    final u = <int>[];
    for (var i = 2; i + 1 < b.length; i += 2) {
      u.add((b[i] << 8) | b[i + 1]);
    }
    return String.fromCharCodes(u);
  }
  var s = utf8.decode(b, allowMalformed: true);
  if (s.startsWith('﻿')) s = s.substring(1);
  return s;
}

Map<String, String> _strings(Archive a) {
  final out = <String, String>{};
  for (final lang in ['de', 'da', 'en', 'Base']) {
    final f = a.findFile('$lang.lproj/pass.strings');
    if (f == null) continue;
    final txt = _decodeText(f.content as List<int>);
    for (final m in RegExp(r'"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;').allMatches(txt)) {
      out.putIfAbsent(m[1]!, () => m[2]!.replaceAll(r'\"', '"').replaceAll(r'\n', '\n'));
    }
    if (out.isNotEmpty) break;
  }
  return out;
}

Uint8List? _img(Archive a, String base) {
  for (final n in ['$base@3x.png', '$base@2x.png', '$base.png']) {
    final f = a.findFile(n);
    if (f != null) return Uint8List.fromList(f.content as List<int>);
  }
  return null;
}

PassImport parsePkpass(Uint8List bytes, String Function() newId) {
  final a = ZipDecoder().decodeBytes(bytes);
  final pf = a.findFile('pass.json');
  if (pf == null) throw const FormatException('Keine gültige .pkpass-Datei (pass.json fehlt)');
  final j = jsonDecode(_decodeText(pf.content as List<int>)) as Map<String, dynamic>;
  final loc = _strings(a);
  String t(dynamic v) {
    final s = v?.toString() ?? '';
    return loc[s] ?? s;
  }

  String style = 'generic';
  for (final s in ['storeCard', 'coupon', 'eventTicket', 'boardingPass', 'generic']) {
    if (j[s] is Map) {
      style = s;
      break;
    }
  }
  final body = Map<String, dynamic>.from(j[style] ?? {});
  final fields = <InfoField>[];
  double? points;
  String unit = 'Punkte';
  double? balance;
  for (final group in ['headerFields', 'primaryFields', 'secondaryFields', 'auxiliaryFields', 'backFields']) {
    for (final f in (body[group] as List? ?? [])) {
      final m = Map<String, dynamic>.from(f);
      final label = t(m['label']);
      var value = m['value'];
      String vs;
      if (m['currencyCode'] != null && value is num) {
        vs = '${value.toStringAsFixed(2)} ${m['currencyCode']}';
      } else if (m['dateStyle'] != null && value is String && DateTime.tryParse(value) != null) {
        final d = DateTime.parse(value).toLocal();
        vs = '${d.day}.${d.month}.${d.year}${m['timeStyle'] != null && m['timeStyle'] != 'PKDateStyleNone' ? ' ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}' : ''}';
      } else {
        vs = t(value);
      }
      if (vs.trim().isEmpty && label.isEmpty) continue;
      fields.add(InfoField(label, vs));
      final key = '${m['key'] ?? ''} $label';
      if (group != 'backFields' && _pointWords.hasMatch(key)) {
        final n = value is num ? value.toDouble() : parseNumber(vs);
        if (n != null) {
          if (m['currencyCode'] != null || RegExp(r'guthaben|balance|saldo', caseSensitive: false).hasMatch(key)) {
            balance ??= n;
          } else {
            points ??= n;
            final u = label.trim();
            if (u.isNotEmpty && u.length < 20) unit = u;
          }
        }
      }
    }
  }

  Map<String, dynamic>? bc;
  if (j['barcodes'] is List && (j['barcodes'] as List).isNotEmpty) {
    bc = Map<String, dynamic>.from((j['barcodes'] as List).first);
  } else if (j['barcode'] is Map) {
    bc = Map<String, dynamic>.from(j['barcode']);
  }

  final org = t(j['organizationName']);
  final logoText = t(j['logoText']);
  final desc = t(j['description']);
  final name = [logoText, org, desc].firstWhere((s) => s.trim().isNotEmpty, orElse: () => 'Wallet-Pass');
  final kind = switch (style) {
    'storeCard' => points != null ? CardKind.points : CardKind.loyalty,
    'coupon' => CardKind.voucher,
    'eventTicket' => CardKind.ticket,
    'boardingPass' => CardKind.travel,
    _ => CardKind.other,
  };
  final tpl = guessTemplate('$org $logoText $desc');
  final card = WalletCard(
    id: newId(),
    name: name,
    kind: kind,
    code: bc?['message']?.toString() ?? '',
    number: bc?['altText']?.toString() ?? '',
    codeType: bc == null ? CodeType.none : _passFormat(bc['format']),
    color: _rgb(j['backgroundColor']) ?? tpl?.color ?? 0xFF1E3A8A,
    notes: desc != name ? desc : '',
    expires: DateTime.tryParse(j['expirationDate'] ?? '')?.toLocal(),
    eventDate: DateTime.tryParse(j['relevantDate'] ?? '')?.toLocal(),
    fields: fields,
    source: 'pkpass',
    website: tpl?.website ?? '',
    pointValue: tpl?.pointValue,
    currency: tpl?.currency ?? '€',
  );
  if (points != null) {
    card.pointsUnit = unit;
    card.setPoints(points, note: 'aus Wallet-Pass');
  }
  if (balance != null) card.balance = balance;
  return PassImport(card, _img(a, 'logo') ?? _img(a, 'thumbnail') ?? _img(a, 'icon'), _img(a, 'strip'));
}
