import 'models.dart';

/// Vorlagen für bekannte Programme: Name, Farbe, Art, Punkte-Einheit und
/// Seite, auf der man den echten Punktestand nachsehen kann.
/// Der Punktwert ist ein Richtwert und lässt sich pro Karte ändern.
class CardTemplate {
  final String name;
  final int color;
  final CardKind kind;
  final String unit;
  final double? pointValue;
  final String currency;
  final String website;
  final CodeType code;
  final List<String> match; // Wörter, an denen ein Scan/Import erkannt wird
  const CardTemplate(this.name, this.color, this.kind,
      {this.unit = 'Punkte', this.pointValue, this.currency = '€', this.website = '', this.code = CodeType.code128, this.match = const []});

  bool get tracksPoints => kind == CardKind.points;
}

const templates = <CardTemplate>[
  // Deutschland
  CardTemplate('PAYBACK', 0xFF0046AA, CardKind.points, pointValue: 0.01, website: 'https://www.payback.de/punktestand', code: CodeType.ean13, match: ['payback']),
  CardTemplate('DeutschlandCard', 0xFF0A7B3E, CardKind.points, pointValue: 0.01, website: 'https://www.deutschlandcard.de/meinkonto', match: ['deutschlandcard']),
  CardTemplate('Miles & More', 0xFF0B1F44, CardKind.points, unit: 'Meilen', website: 'https://www.miles-and-more.com', match: ['miles & more', 'miles and more']),
  CardTemplate('BahnBonus', 0xFFEC0016, CardKind.points, website: 'https://www.bahn.de/bahnbonus', match: ['bahnbonus', 'bahn bonus']),
  CardTemplate('dm Payback', 0xFF1C3E8C, CardKind.points, pointValue: 0.01, website: 'https://www.payback.de/punktestand', match: ['dm-drogerie', 'dm drogerie']),
  CardTemplate('Rossmann', 0xFFC8102E, CardKind.loyalty, website: 'https://www.rossmann.de', match: ['rossmann']),
  CardTemplate('Lidl Plus', 0xFF0050AA, CardKind.loyalty, website: 'https://www.lidl.de/lidl-plus', match: ['lidl']),
  CardTemplate('IKEA Family', 0xFF0058A3, CardKind.membership, website: 'https://www.ikea.com/de/de/profile/', match: ['ikea']),
  CardTemplate('ADAC', 0xFFFFCC00, CardKind.membership, website: 'https://www.adac.de', match: ['adac']),
  CardTemplate('Krankenkasse', 0xFF00796B, CardKind.id, code: CodeType.none, match: ['krankenkasse', 'versichertenkarte', 'aok', 'tk ', 'barmer']),
  CardTemplate('Bibliothek', 0xFF5D4037, CardKind.library, match: ['bibliothek', 'bücherei', 'bibliotek']),
  // Dänemark / Skandinavien
  CardTemplate('Coop', 0xFFE2001A, CardKind.points, unit: 'kr bonus', pointValue: 1, currency: 'kr', website: 'https://coop.dk/medlem', match: ['coop']),
  CardTemplate('Salling Group', 0xFF00205B, CardKind.points, unit: 'kr bonus', pointValue: 1, currency: 'kr', website: 'https://sallinggroup.com', match: ['salling', 'netto', 'føtex', 'bilka']),
  CardTemplate('Matas Club', 0xFF003B2F, CardKind.points, unit: 'point', currency: 'kr', website: 'https://www.matas.dk/club-matas', match: ['matas']),
  CardTemplate('SAS EuroBonus', 0xFF000F6E, CardKind.points, unit: 'Points', website: 'https://www.flysas.com/eurobonus', match: ['eurobonus', 'sas ']),
  CardTemplate('Circle K Extra', 0xFFDA291C, CardKind.points, unit: 'point', currency: 'kr', website: 'https://www.circlek.dk', match: ['circle k']),
  // International
  CardTemplate('Flying Blue', 0xFF051C55, CardKind.points, unit: 'Meilen', website: 'https://www.flyingblue.com', match: ['flying blue']),
  CardTemplate('Starbucks Rewards', 0xFF00704A, CardKind.points, unit: 'Stars', website: 'https://www.starbucks.de', match: ['starbucks']),
  CardTemplate('Fitnessstudio', 0xFF212121, CardKind.membership, code: CodeType.qr, match: ['fitness', 'gym', 'mcfit', 'clever fit']),
  CardTemplate('Geschenkkarte', 0xFF8E24AA, CardKind.voucher, match: ['gutschein', 'geschenkkarte', 'gavekort', 'gift card']),
];

CardTemplate? guessTemplate(String text) {
  final t = ' ${text.toLowerCase()} ';
  for (final tp in templates) {
    for (final m in tp.match) {
      if (t.contains(m)) return tp;
    }
  }
  return null;
}

/// Farbpalette für eigene Karten
const cardColors = <int>[
  0xFF1E3A8A, 0xFF0B1630, 0xFF149C9A, 0xFF0E7C66, 0xFF2E7D32, 0xFF7CB342,
  0xFFF5B544, 0xFFFF8F00, 0xFFFF6B3D, 0xFFC62828, 0xFFAD1457, 0xFF8E24AA,
  0xFF5E35B1, 0xFF3949AB, 0xFF0277BD, 0xFF00838F, 0xFF4E342E, 0xFF37474F,
  0xFF212121, 0xFFB0BEC5,
];
