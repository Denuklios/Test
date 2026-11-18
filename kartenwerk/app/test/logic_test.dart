import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kartenwerk/models.dart';
import 'package:kartenwerk/parse.dart';
import 'package:kartenwerk/store.dart';

Uint8List makePass(Map<String, dynamic> pass, {Map<String, List<int>> extra = const {}}) {
  final a = Archive();
  final j = utf8.encode(jsonEncode(pass));
  a.addFile(ArchiveFile('pass.json', j.length, j));
  extra.forEach((k, v) => a.addFile(ArchiveFile(k, v.length, v)));
  return Uint8List.fromList(ZipEncoder().encode(a));
}

void main() {
  test('Zahlen in allen Schreibweisen', () {
    expect(parseNumber('1.234'), 1234);
    expect(parseNumber('1,234'), 1234);
    expect(parseNumber('12,50'), 12.5);
    expect(parseNumber('12.50'), 12.5);
    expect(parseNumber('1.234.567'), 1234567);
    expect(parseNumber('1.234,56 €'), 1234.56);
    expect(parseNumber('1,234.56'), 1234.56);
    expect(parseNumber('2 450 Punkte'), 2450);
    expect(parseNumber('abc'), null);
  });

  test('Punktestand aus Screenshot-Text finden', () {
    const text = '''
14:32
Mein Konto
Hallo Robert
Dein Punktestand
4.718 °P
entspricht 47,18 €
Coupons 12
Gültig bis 31.12.2026''';
    final c = findPointCandidates(text);
    expect(c.first.value, 4718);
    expect(c.any((x) => x.value == 47.18), true);
  });

  test('Dänischer Bonus-Text', () {
    final c = findPointCandidates('Medlemsnummer 1234 5678 9012\nDin bonus\n87,50 kr\nOptjent i år 312 kr');
    expect(c.first.value, anyOf(87.5, 312));
  });

  test('pkpass: Kundenkarte mit Punkten, Farbe, Barcode, Logo', () {
    final bytes = makePass({
      'formatVersion': 1,
      'organizationName': 'Kaffeebar Nord',
      'description': 'Stempelkarte',
      'backgroundColor': 'rgb(120, 60, 20)',
      'barcodes': [
        {'message': 'KB-998877', 'format': 'PKBarcodeFormatQR', 'altText': '998877'}
      ],
      'expirationDate': '2027-03-01T00:00:00+01:00',
      'storeCard': {
        'primaryFields': [
          {'key': 'points', 'label': 'Punkte', 'value': 1250}
        ],
        'secondaryFields': [
          {'key': 'name', 'label': 'Mitglied', 'value': 'R. A.'}
        ],
        'backFields': [
          {'key': 'info', 'label': 'Info', 'value': 'Jeder 10. Kaffee gratis'}
        ],
      },
    }, extra: {
      'logo@2x.png': [1, 2, 3]
    });
    final imp = parsePkpass(bytes, () => 'id1');
    final c = imp.card;
    expect(c.name, 'Kaffeebar Nord');
    expect(c.kind, CardKind.points);
    expect(c.code, 'KB-998877');
    expect(c.number, '998877');
    expect(c.codeType, CodeType.qr);
    expect(c.color, 0xFF783C14);
    expect(c.points, 1250);
    expect(c.pointsUnit, 'Punkte');
    expect(c.history.length, 1);
    expect(c.expires!.year, 2027);
    expect(c.fields.length, 3);
    expect(imp.logo, isNotNull);
  });

  test('pkpass: Boardingpass mit lokalisierten Texten (UTF-16)', () {
    final strings = '"gate" = "Gate";\n"flight" = "Flug";';
    final u16 = <int>[0xFF, 0xFE];
    for (final cu in strings.codeUnits) {
      u16..add(cu & 0xFF)..add(cu >> 8);
    }
    final bytes = makePass({
      'organizationName': 'Air Test',
      'description': 'Boarding Pass',
      'barcode': {'message': 'M1TEST', 'format': 'PKBarcodeFormatPDF417'},
      'boardingPass': {
        'transitType': 'PKTransitTypeAir',
        'headerFields': [
          {'key': 'gate', 'label': 'gate', 'value': 'B12'}
        ],
        'primaryFields': [
          {'key': 'from', 'label': 'CPH', 'value': 'Kopenhagen'}
        ],
      },
    }, extra: {
      'de.lproj/pass.strings': u16
    });
    final c = parsePkpass(bytes, () => 'id2').card;
    expect(c.kind, CardKind.travel);
    expect(c.codeType, CodeType.pdf417);
    expect(c.fields.first.label, 'Gate');
    expect(c.points, isNull);
  });

  test('Speichern, Laden, Sicherung und Wiederherstellung', () async {
    final dir = await Directory.systemTemp.createTemp('kw');
    final s = WalletStore();
    await s.load(baseDir: dir);
    final c = WalletCard(id: 'a', name: 'PAYBACK', kind: CardKind.points, pointValue: 0.01)..setPoints(5000);
    await s.upsert(c);
    await s.upsert(WalletCard(id: 'b', name: 'Gutschein', kind: CardKind.voucher, balance: 25));
    expect(s.totalWorth()['€'], 75);

    final s2 = WalletStore();
    await s2.load(baseDir: dir);
    expect(s2.cards.length, 2);
    expect(s2.byId('a')!.points, 5000);

    // Sicherung in leeren Speicher einspielen
    final js = utf8.encode(jsonEncode({'cards': s2.cards.map((e) => e.toJson()).toList()}));
    final zip = ZipEncoder().encode(Archive()..addFile(ArchiveFile('karten.json', js.length, js)));
    final dir2 = await Directory.systemTemp.createTemp('kw2');
    final s3 = WalletStore();
    await s3.load(baseDir: dir2);
    final (neu, upd) = await s3.importBackup(Uint8List.fromList(zip));
    expect((neu, upd), (2, 0));
    expect(s3.byId('b')!.balance, 25);
  });

  test('Ablaufende Karten', () {
    final s = WalletStore();
    s.cards.addAll([
      WalletCard(id: '1', name: 'bald', expires: DateTime.now().add(const Duration(days: 3))),
      WalletCard(id: '2', name: 'später', expires: DateTime.now().add(const Duration(days: 90))),
      WalletCard(id: '3', name: 'ohne'),
    ]);
    expect(s.expiringSoon().map((c) => c.name), ['bald']);
  });
}
