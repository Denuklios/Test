import 'package:material_ui/material_ui.dart';

/// Art der Karte – bestimmt Symbol, Felder und Sortierung.
enum CardKind {
  loyalty('Kundenkarte', Icons.loyalty_rounded),
  points('Bonus & Punkte', Icons.stars_rounded),
  voucher('Gutschein / Geschenkkarte', Icons.card_giftcard_rounded),
  ticket('Ticket / Event', Icons.confirmation_number_rounded),
  travel('Reise / Boarding', Icons.flight_takeoff_rounded),
  membership('Mitgliedschaft', Icons.badge_rounded),
  id('Ausweis / Versicherung', Icons.health_and_safety_rounded),
  payment('Bank / Kreditkarte', Icons.credit_card_rounded),
  library('Bibliothek / Schule', Icons.local_library_rounded),
  other('Sonstiges', Icons.style_rounded);

  final String label;
  final IconData icon;
  const CardKind(this.label, this.icon);

  static CardKind byName(String? n) => CardKind.values.firstWhere((k) => k.name == n, orElse: () => CardKind.other);
}

/// Unterstützte Code-Arten (Namen wie in mobile_scanner / pkpass).
enum CodeType {
  none('Kein Code'),
  qr('QR-Code'),
  ean13('EAN-13'),
  ean8('EAN-8'),
  upcA('UPC-A'),
  upcE('UPC-E'),
  code128('Code 128'),
  code39('Code 39'),
  code93('Code 93'),
  itf('ITF'),
  codabar('Codabar'),
  pdf417('PDF417'),
  aztec('Aztec'),
  dataMatrix('Data Matrix');

  final String label;
  const CodeType(this.label);
  static CodeType byName(String? n) => CodeType.values.firstWhere((k) => k.name == n, orElse: () => CodeType.code128);
  bool get is2D => this == qr || this == pdf417 || this == aztec || this == dataMatrix;
}

class PointsEntry {
  final DateTime at;
  final double value;
  final String note;
  PointsEntry(this.at, this.value, [this.note = '']);
  Map<String, dynamic> toJson() => {'at': at.toIso8601String(), 'v': value, 'n': note};
  factory PointsEntry.fromJson(Map<String, dynamic> j) =>
      PointsEntry(DateTime.tryParse(j['at'] ?? '') ?? DateTime.now(), (j['v'] as num?)?.toDouble() ?? 0, j['n'] ?? '');
}

class InfoField {
  final String label;
  final String value;
  InfoField(this.label, this.value);
  Map<String, dynamic> toJson() => {'l': label, 'v': value};
  factory InfoField.fromJson(Map<String, dynamic> j) => InfoField(j['l'] ?? '', j['v'] ?? '');
}

class WalletCard {
  String id;
  String name;
  String holder;
  CardKind kind;
  String code; // Inhalt des Barcodes
  String number; // angezeigte Kartennummer (falls abweichend)
  CodeType codeType;
  int color;
  String? frontImage; // Dateiname im Bilderordner
  String? backImage;
  String? logoImage;
  String notes;
  String pin;
  // Punkte
  bool tracksPoints;
  double? points;
  String pointsUnit;
  double? pointValue; // Wert eines Punktes in Währung
  double? pointsGoal;
  List<PointsEntry> history;
  // Guthaben (Gutscheine)
  double? balance;
  String currency;
  DateTime? expires;
  DateTime? eventDate;
  String website;
  List<InfoField> fields;
  bool favorite;
  int uses;
  DateTime? lastUsed;
  DateTime created;
  String source; // manual, scan, pkpass, photo

  WalletCard({
    required this.id,
    required this.name,
    this.holder = '',
    this.kind = CardKind.loyalty,
    this.code = '',
    this.number = '',
    this.codeType = CodeType.code128,
    this.color = 0xFF1E3A8A,
    this.frontImage,
    this.backImage,
    this.logoImage,
    this.notes = '',
    this.pin = '',
    this.tracksPoints = false,
    this.points,
    this.pointsUnit = 'Punkte',
    this.pointValue,
    this.pointsGoal,
    List<PointsEntry>? history,
    this.balance,
    this.currency = '€',
    this.expires,
    this.eventDate,
    this.website = '',
    List<InfoField>? fields,
    this.favorite = false,
    this.uses = 0,
    this.lastUsed,
    DateTime? created,
    this.source = 'manual',
  })  : history = history ?? [],
        fields = fields ?? [],
        created = created ?? DateTime.now();

  Color get colorValue => Color(color);

  /// Geldwert der Punkte (falls Punktwert bekannt)
  double? get pointsWorth => (points != null && pointValue != null) ? points! * pointValue! : null;

  /// Gesamter Wert dieser Karte (Guthaben + Punktewert)
  double get totalWorth => (balance ?? 0) + (pointsWorth ?? 0);

  bool get hasPoints => tracksPoints || points != null;

  int? get daysLeft {
    if (expires == null) return null;
    final now = DateTime.now();
    return DateTime(expires!.year, expires!.month, expires!.day).difference(DateTime(now.year, now.month, now.day)).inDays;
  }

  String get displayNumber => number.isNotEmpty ? number : code;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'holder': holder,
        'kind': kind.name,
        'code': code,
        'number': number,
        'codeType': codeType.name,
        'color': color,
        'front': frontImage,
        'back': backImage,
        'logo': logoImage,
        'notes': notes,
        'pin': pin,
        'tracks': tracksPoints,
        'points': points,
        'unit': pointsUnit,
        'pv': pointValue,
        'goal': pointsGoal,
        'history': history.map((e) => e.toJson()).toList(),
        'balance': balance,
        'currency': currency,
        'expires': expires?.toIso8601String(),
        'event': eventDate?.toIso8601String(),
        'web': website,
        'fields': fields.map((e) => e.toJson()).toList(),
        'fav': favorite,
        'uses': uses,
        'last': lastUsed?.toIso8601String(),
        'created': created.toIso8601String(),
        'source': source,
      };

  factory WalletCard.fromJson(Map<String, dynamic> j) => WalletCard(
        id: j['id'],
        name: j['name'] ?? '',
        holder: j['holder'] ?? '',
        kind: CardKind.byName(j['kind']),
        code: j['code'] ?? '',
        number: j['number'] ?? '',
        codeType: CodeType.byName(j['codeType']),
        color: j['color'] ?? 0xFF1E3A8A,
        frontImage: j['front'],
        backImage: j['back'],
        logoImage: j['logo'],
        notes: j['notes'] ?? '',
        pin: j['pin'] ?? '',
        tracksPoints: j['tracks'] ?? false,
        points: (j['points'] as num?)?.toDouble(),
        pointsUnit: j['unit'] ?? 'Punkte',
        pointValue: (j['pv'] as num?)?.toDouble(),
        pointsGoal: (j['goal'] as num?)?.toDouble(),
        history: ((j['history'] as List?) ?? []).map((e) => PointsEntry.fromJson(Map<String, dynamic>.from(e))).toList(),
        balance: (j['balance'] as num?)?.toDouble(),
        currency: j['currency'] ?? '€',
        expires: DateTime.tryParse(j['expires'] ?? ''),
        eventDate: DateTime.tryParse(j['event'] ?? ''),
        website: j['web'] ?? '',
        fields: ((j['fields'] as List?) ?? []).map((e) => InfoField.fromJson(Map<String, dynamic>.from(e))).toList(),
        favorite: j['fav'] ?? false,
        uses: j['uses'] ?? 0,
        lastUsed: DateTime.tryParse(j['last'] ?? ''),
        created: DateTime.tryParse(j['created'] ?? ''),
        source: j['source'] ?? 'manual',
      );

  /// Punktestand setzen und im Verlauf merken
  void setPoints(double v, {String note = ''}) {
    points = v;
    tracksPoints = true;
    final last = history.isNotEmpty ? history.last : null;
    if (last != null && DateTime.now().difference(last.at).inMinutes < 2) {
      history.removeLast();
    }
    history.add(PointsEntry(DateTime.now(), v, note));
    if (history.length > 400) history.removeRange(0, history.length - 400);
  }
}
