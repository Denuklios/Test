// Allgemeine Termine (nicht an eine Person gebunden) bekommen eine eigene, feste Farbe.
const neutralColors = <String, int>{
  'muell': 0xFF795548, // Braun – Mülltonnen
  'ferien': 0xFFFFC107, // Bernstein – Schulferien, Feiertage
  'familie': 0xFF26A69A, // Mint – Familie & gemeinsam
  'tier': 0xFF43A047, // Grün – Runa, Hund & Tiere
  'haus': 0xFF607D8B, // Blaugrau – Haushalt, Handwerker, Auto
  'anlass': 0xFF9C27B0, // Lila – Hochzeitstage, Feste anderer
};

const _rules = <String, List<String>>{
  'muell': ['müll', 'muell', 'tonne', 'glas/metal', 'abfall', 'sperrmüll', 'altpapier', 'gelber sack', 'biotonne', 'skrald'],
  'ferien': ['ferien', 'feiertag', 'brückentag', 'schulfrei'],
  'familie': ['familie', 'wir  [!]', 'große feier', 'alle zusammen', 'weihnachten bei', 'silvester'],
  'tier': ['hundeschule', 'welpenschule', 'hundewald', 'tierarzt', 'gassi', 'runa'],
  'haus': ['handwerker', 'schornstein', 'ablesung', 'makler', 'wartung', 'tüv', 'werkstatt', 'reifen', 'lieferung', 'umzug'],
  'anlass': ['hochzeitstag', 'jahrestag', 'mittelalterfest', 'stadtfest', 'byfest'],
};

/// Kategorie eines allgemeinen Termins oder null
String? neutralCategory(String title) {
  final t = title.toLowerCase();
  for (final e in _rules.entries) {
    if (e.value.any(t.contains)) return e.key;
  }
  return null;
}

int? neutralColorFor(String title) {
  final c = neutralCategory(title);
  return c == null ? null : neutralColors[c];
}
