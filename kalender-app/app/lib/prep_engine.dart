// Intelligenter Vorbereitungs-Assistent:
// erkennt am Termin, worum es geht, stellt passende Fragen und erzeugt
// eine Checkliste, bei der jeder Punkt zum richtigen Zeitpunkt fällig wird.
import 'models.dart';

class PrepQuestion {
  final String key;
  final String label;
  final List<(String, String)> options; // (Wert, Anzeige)
  final bool multi;
  const PrepQuestion(this.key, this.label, this.options, {this.multi = false});
}

class G {
  static const docs = '📄 Dokumente';
  static const clothes = '👕 Kleidung';
  static const hygiene = '🧴 Hygiene & Gesundheit';
  static const tech = '🔌 Technik';
  static const car = '🚗 Auto';
  static const flight = '✈️ Flug';
  static const train = '🚆 Bahn';
  static const ferry = '⛴️ Fähre & Schiff';
  static const stay = '🏕️ Unterkunft';
  static const activity = '🏖️ Unternehmungen';
  static const kids = '🧸 Kinder';
  static const dog = '🐶 Hund';
  static const home = '🏠 Zuhause';
  static const gift = '🎁 Geschenk & Feier';
  static const appointment = '🩺 Zum Termin';
  static const todo = '✅ Erledigen';
  static const own = '📝 Eigene';
  static const order = [todo, docs, flight, train, ferry, car, clothes, hygiene, tech, activity, stay, kids, dog, gift, appointment, home, own];
}

// ---------- Erkennung ----------

String _text(CalEvent ev) => ' ${ev.title} ${ev.location} ${ev.notes} '.toLowerCase();

bool _any(String t, List<String> words) {
  for (final w in words) {
    if (w.startsWith('^')) {
      // nur am Wortanfang (für kurze Wörter wie "op", "amt")
      if (RegExp('(?<![a-zäöüß])${RegExp.escape(w.substring(1))}').hasMatch(t)) return true;
    } else if (t.contains(w)) {
      return true;
    }
  }
  return false;
}

const _travelWords = ['urlaub', 'reise', 'ferien', 'trip', 'flug', 'flughafen', 'airport', 'kreuzfahrt', 'camping', 'städtetrip', 'staedtetrip',
  'wochenende in', 'kurztrip', 'hotel', 'ferienhaus', 'sommerhus', 'ferienwohnung', 'skiurlaub', 'roadtrip', 'klassenfahrt', 'dienstreise', 'kur '];
const _warm = ['mallorca', 'ibiza', 'menorca', 'spanien', 'kanaren', 'teneriffa', 'gran canaria', 'fuerteventura', 'lanzarote', 'türkei', 'tuerkei',
  'antalya', 'side', 'ägypten', 'aegypten', 'hurghada', 'griechenland', 'kreta', 'rhodos', 'korfu', 'kos ', 'italien', 'sizilien', 'sardinien',
  'toskana', 'gardasee', 'portugal', 'algarve', 'madeira', 'kroatien', 'zypern', 'malta', 'dubai', 'thailand', 'karibik', 'dominikanische',
  'mexiko', 'florida', 'bali', 'tunesien', 'marokko', 'strand', 'beach', 'südfrankreich', 'cote d', 'côte d'];
const _cold = ['norwegen', 'lappland', 'island', 'finnland', 'tromsø', 'tromso', 'alpen', 'ski', 'snowboard', 'gletscher', 'grönland', 'arktis',
  'winterurlaub', 'schnee', 'hütte', 'huette', 'zermatt', 'ischgl', 'kitzbühel', 'sölden'];
const _eu = ['dänemark', 'daenemark', 'danmark', 'kopenhagen', 'københavn', 'aarhus', 'odense', 'sønderborg', 'sonderborg', 'aabenraa', 'esbjerg',
  'billund', 'legoland', 'blåvand', 'blavand', 'rømø', 'romo', 'skagen', 'bornholm', 'polen', 'frankreich', 'paris', 'spanien', 'mallorca',
  'niederlande', 'holland', 'amsterdam', 'belgien', 'brüssel', 'österreich', 'oesterreich', 'wien', 'italien', 'rom ', 'tschechien', 'prag',
  'schweden', 'stockholm', 'finnland', 'griechenland', 'kroatien', 'portugal', 'malta', 'zypern', 'ungarn', 'budapest', 'slowenien',
  'luxemburg', 'irland', 'estland', 'lettland', 'litauen', 'norwegen', 'schweiz', 'island', 'kanaren', 'teneriffa', 'kreta', 'sizilien',
  'gardasee', 'toskana', 'algarve', 'madeira', 'ibiza', 'gran canaria', 'fuerteventura', 'lanzarote', 'rhodos', 'korfu', 'alpen', 'dk '];
const _nonEu = ['türkei', 'tuerkei', 'antalya', 'ägypten', 'aegypten', 'hurghada', 'usa', 'amerika', 'new york', 'florida', 'kanada',
  'thailand', 'dubai', 'emirate', 'london', 'england', 'schottland', 'großbritannien', 'grossbritannien', 'tunesien', 'marokko', 'mexiko',
  'karibik', 'dominikanische', 'japan', 'china', 'bali', 'indonesien', 'australien', 'südafrika', 'kenia', 'brasilien', 'cuba', 'kuba'];
const _cityTrip = ['städtetrip', 'staedtetrip', 'berlin', 'hamburg', 'münchen', 'paris', 'london', 'rom ', 'prag', 'wien', 'kopenhagen',
  'amsterdam', 'barcelona', 'new york', 'stadt'];

/// Welche Situationen stecken in diesem Termin?
Set<String> detectCategories(CalEvent ev) {
  final t = _text(ev);
  final c = <String>{};
  final nights = ev.allDay ? dateOnly(ev.end).difference(dateOnly(ev.start)).inHours ~/ 24 : dateOnly(ev.end).difference(dateOnly(ev.start)).inHours ~/ 24;

  if (ev.isBirthday) {
    c.add('birthdayOther');
    return c;
  }
  if (ev.isVacation || _any(t, _travelWords) || (nights >= 1 && ev.location.trim().isNotEmpty)) c.add('travel');
  if (_any(t, ['flug', 'flughafen', 'airport', 'abflug', 'boarding', 'fliegen', 'eurowings', 'ryanair', 'lufthansa', 'condor', 'easyjet', 'tuifly'])) {
    c.add('flight');
  }
  if (_any(t, ['zahnarzt', 'zahnärzt', 'kieferorthop', 'prophylaxe', 'zahnreinigung'])) c.add('dentist');
  if (_any(t, ['arzt', 'ärztin', 'aerztin', 'praxis', 'doktor', '^dr.', '^dr ', 'physio', 'krankengymnast', 'ergotherap', 'logopäd', 'impf',
    'blutabnahme', 'vorsorge', 'check-up', 'checkup', '^u1', '^u2', '^u3', '^u4', '^u5', '^u6', '^u7', '^u8', '^u9', '^j1', '^mrt', '^ct ',
    'röntgen', 'roentgen', 'ultraschall', 'heilpraktiker', 'psychotherap', 'osteopath', 'orthopäd', 'hautarzt', 'dermatolog', 'augenarzt',
    'frauenarzt', 'gynäkolog', 'kinderarzt', 'hausarzt', 'hno', 'urolog', 'kardiolog', 'dermatolog'])) {
    c.add('doctor');
  }
  if (_any(t, ['blutabnahme', 'nüchtern', 'nuechtern', 'blutbild', 'magenspiegelung', 'darmspiegelung', 'koloskop', 'gastroskop'])) c.add('fasting');
  if (_any(t, ['krankenhaus', 'klinik', '^op ', '^op-', 'operation', 'reha', '^kur', 'stationär', 'stationaer', 'entbindung', 'geburt '])) c.add('hospital');
  if (_any(t, ['impf'])) c.add('vaccine');
  if (_any(t, ['augenarzt', 'optiker'])) c.add('eyes');
  if (_any(t, ['kinderarzt', '^u1', '^u2', '^u3', '^u4', '^u5', '^u6', '^u7', '^u8', '^u9', '^j1'])) c.add('kidsDoctor');
  if (_any(t, ['tierarzt', 'tierklinik'])) c.add('vet');
  if (_any(t, ['kindergeburtstag'])) c.add('kidsParty');
  if (_any(t, ['geburtstag', 'bday', 'birthday', 'jubiläum', 'jubilaeum']) && !c.contains('kidsParty')) c.add('party');
  if (_any(t, ['party', 'feier', 'fete', 'grillen', 'grillabend', 'grillparty', 'silvester', 'einweihung', 'polterabend', 'sommerfest',
    'weihnachtsfeier', 'kaffee und kuchen', 'kaffeetrinken', 'besuch bei', 'brunch', 'essen bei', 'spieleabend'])) {
    c.add('party');
  }
  if (_any(t, ['hochzeit', 'trauung', 'standesamt', 'taufe', 'konfirmation', 'kommunion', 'jugendweihe', 'firmung'])) c.add('ceremony');
  if (_any(t, ['beerdigung', 'trauerfeier', 'beisetzung', 'urnenbeisetzung'])) c.add('funeral');
  if (_any(t, ['vorstellungsgespräch', 'vorstellungsgespraech', 'bewerbung', 'jobinterview', 'probearbeit'])) c.add('job');
  if (_any(t, ['^amt', 'bürgeramt', 'buergeramt', 'behörde', 'behoerde', 'rathaus', 'zulassungsstelle', 'kfz-zulassung', 'finanzamt',
    'jobcenter', 'arbeitsamt', 'agentur für arbeit', 'notar', 'anwalt', 'gericht', 'ausländerbehörde', 'standesamt', 'bank', 'versicherung',
    'kommune', 'borgerservice', 'skat'])) {
    c.add('authority');
  }
  if (_any(t, ['werkstatt', '^tüv', '^tuev', '^hu ', '^hu/', 'hauptuntersuchung', 'inspektion', 'reifenwechsel', 'reifen wechseln',
    'ölwechsel', 'oelwechsel', 'autowäsche', 'synsk', 'dekra', 'kundendienst auto'])) {
    c.add('carService');
  }
  if (_any(t, ['schwimm', 'hallenbad', 'freibad', 'therme', 'sauna', 'spaßbad', 'erlebnisbad', 'badesee', 'aquapark'])) c.add('swim');
  if (_any(t, ['training', 'fitness', '^gym', 'fußball', 'fussball', 'handball', 'volleyball', 'basketball', 'tennis', 'badminton', 'yoga',
    'pilates', 'turnen', 'reiten', 'laufen', 'joggen', 'marathon', 'lauftreff', 'radtour', 'fahrrad', 'zumba', 'kampfsport', 'karate',
    'judo', 'tanzen', 'tanzkurs', 'klettern', 'bouldern', 'sport'])) {
    c.add('sport');
  }
  if (_any(t, ['elternabend', 'elterngespräch', 'elternsprechtag', 'schule', 'kita', 'kindergarten', 'einschulung', 'wandertag',
    'schulausflug', 'zeugnis', 'hort'])) {
    c.add('school');
  }
  if (_any(t, ['klassenfahrt', 'ferienlager', 'zeltlager', 'jugendfreizeit'])) c.add('kidsTrip');
  if (_any(t, ['konzert', 'kino', 'theater', 'musical', 'oper', 'festival', 'stadion', 'messe', 'zirkus', 'freizeitpark', 'zoo',
    'tierpark', 'legoland', 'heide park', 'hansa-park', 'museum', 'show', 'comedy'])) {
    c.add('event');
  }
  if (_any(t, ['festival', 'wacken', 'roskilde'])) c.add('festival');
  if (_any(t, ['hundeschule', 'hundetraining', 'gassi', 'hundeplatz', 'agility', 'welpen'])) c.add('dogSchool');
  if (_any(t, ['müll', 'muell', 'tonne', 'gelber sack', 'gelbe tonne', 'biotonne', 'papiertonne', 'altpapier', 'restmüll', 'glas/',
    'sperrmüll', 'sperrmuell', 'skrald'])) {
    c.add('garbage');
  }
  if (_any(t, ['umzug', 'umziehen', 'renovier', 'streichen'])) c.add('move');
  if (_any(t, ['prüfung', 'pruefung', 'klausur', 'examen', 'führerschein', 'fuehrerschein', 'abitur', 'abschlussprüfung', 'test '])) c.add('exam');
  if (_any(t, ['meeting', 'besprechung', 'präsentation', 'praesentation', 'konferenz', 'kundentermin', 'dienstreise', 'workshop',
    'seminar', 'schulung', 'fortbildung'])) {
    c.add('business');
  }
  if (_any(t, ['einkauf', 'einkaufen', 'großeinkauf', 'grosseinkauf', 'wocheneinkauf', 'baumarkt', 'ikea', 'shoppen', 'shopping'])) c.add('shopping');
  if (_any(t, ['friseur', 'frisör', 'frisoer', 'barber', 'kosmetik', 'nagelstudio', 'massage'])) c.add('beauty');
  if (_any(t, ['date', 'restaurant', 'essen gehen', 'abendessen', 'dinner', 'jahrestag', 'hochzeitstag', 'valentin'])) c.add('date');
  if (_any(t, ['picknick', 'ausflug', 'wanderung', 'wandern', 'tagesausflug'])) c.add('outing');
  if (_any(t, ['handwerker', 'elektriker', 'klempner', 'installateur', 'monteur', 'techniker kommt', 'ablesung', 'zählerablesung',
    'schornsteinfeger', 'heizungswartung', 'wartung', 'lieferung', 'paket', 'abholung sperr', 'umbau', 'reparatur'])) {
    c.add('craftsman');
  }
  if (_any(t, ['besuch kommt', 'gäste', 'gaeste', 'kommen zu besuch', 'übernachtungsgast', 'besuch von'])) c.add('guests');
  if (_any(t, ['frist', 'deadline', 'kündigung', 'kuendigung', 'kündigen', 'vertrag läuft', 'abgabe', 'einreichen', 'antrag',
    'steuererklärung', 'steuer', 'widerspruch'])) {
    c.add('deadline');
  }
  if (_any(t, ['miete', 'rechnung', 'überweisen', 'ueberweisen', 'zahlung', 'bezahlen', 'rate ', 'beitrag', 'abbuchung'])) c.add('payment');
  if (_any(t, ['blutspende', 'blut spenden'])) c.add('bloodDonation');
  if (_any(t, ['babysitter', 'oma passt auf', 'kinderbetreuung', 'tagesmutter'])) c.add('babysitter');
  if (_any(t, ['musikschule', 'klavier', 'gitarre', 'geige', 'flöte', 'floete', 'chor', 'orchester', 'bandprobe', 'nachhilfe',
    'fahrstunde', 'fahrschule', 'kurs', 'vhs'])) {
    c.add('lesson');
  }
  if (_any(t, ['bibliothek', 'bücherei', 'buecherei', 'ausleihe', 'rückgabe', 'rueckgabe', 'zurückgeben'])) c.add('library');
  if (_any(t, ['tanken', 'reifendruck', 'waschanlage'])) c.add('carService');
  if (_any(t, ['kind abholen', 'abholen', 'bringen', 'hinbringen'])) c.add('pickup');
  if (_any(t, ['fähre', 'faehre', 'kreuzfahrt', 'schiff', 'scandlines', 'færge', 'faerge', 'puttgarden', 'rødby', 'rodby'])) c.add('ferry');
  if (_any(t, ['zug', 'bahn', '^ice', '^ic ', 'dsb', 'flixtrain'])) c.add('train');
  return c;
}

const travelQuestions = [
  PrepQuestion('climate', 'Wie ist das Wetter dort?', [('warm', '☀️ Warm'), ('mild', '🌤️ Mild'), ('kalt', '❄️ Kalt')]),
  PrepQuestion('transport', 'Wie geht es hin?', [('auto', '🚗 Auto'), ('flug', '✈️ Flugzeug'), ('zug', '🚆 Zug'), ('schiff', '⛴️ Fähre/Schiff'), ('bus', '🚌 Bus')],
      multi: true),
  PrepQuestion('abroad', 'Ins Ausland?', [('nein', '🇩🇪 Inland'), ('eu', '🇪🇺 Europa (z. B. 🇩🇰)'), ('welt', '🌍 Außerhalb EU')]),
  PrepQuestion('stay', 'Wo wird übernachtet?', [('hotel', '🏨 Hotel'), ('ferienhaus', '🏡 Ferienhaus'), ('camping', '⛺ Camping'), ('familie', '👵 Bei Familie/Freunden')]),
  PrepQuestion('activity', 'Was habt ihr vor?', [('strand', '🏖️ Strand'), ('wandern', '🥾 Wandern'), ('ski', '⛷️ Ski'), ('stadt', '🏙️ Stadt'),
    ('wellness', '🧖 Wellness'), ('business', '💼 Beruflich')], multi: true),
  PrepQuestion('with', 'Wer kommt mit?', [('kinder', '🧒 Kinder'), ('baby', '👶 Baby'), ('hund', '🐶 Hund')], multi: true),
];

const _homePetQuestion = PrepQuestion('pets', 'Bleiben Tiere oder Pflanzen zu Hause?', [('tiere', '🐈 Tiere'), ('pflanzen', '🪴 Pflanzen')], multi: true);
const _giftQuestion = PrepQuestion('gift', 'Brauchst du ein Geschenk?', [('ja', '🎁 Ja'), ('nein', 'Nein')]);
const _bringQuestion = PrepQuestion('bring', 'Sollst du etwas mitbringen?', [('essen', '🥗 Essen/Salat'), ('getraenke', '🍾 Getränke'), ('nichts', 'Nichts')],
    multi: true);
const _driveQuestion = PrepQuestion('transport', 'Wie kommst du hin?', [('auto', '🚗 Auto'), ('oeffi', '🚌 Bus/Bahn'), ('rad', '🚲 Rad/zu Fuß')]);

/// Fragen, die für diesen Termin sinnvoll sind
List<PrepQuestion> questionsFor(Set<String> cats) {
  final q = <PrepQuestion>[];
  if (cats.contains('travel')) {
    q.addAll(travelQuestions);
    q.add(_homePetQuestion);
  } else {
    if (cats.contains('party') || cats.contains('kidsParty') || cats.contains('ceremony')) {
      q.add(_giftQuestion);
      q.add(_bringQuestion);
    }
    if (cats.intersection({'doctor', 'hospital', 'authority', 'job', 'event', 'party', 'ceremony', 'funeral', 'business', 'exam', 'outing'}).isNotEmpty) {
      q.add(_driveQuestion);
    }
  }
  return q;
}

/// Kluge Voreinstellungen aus Titel, Ort, Notizen und Jahreszeit
const _north = ['dänemark', 'daenemark', 'danmark', 'blåvand', 'blavand', 'rømø', 'romo', 'skagen', 'bornholm', 'sommerhus', 'ostsee', 'nordsee',
  'sylt', 'amrum', 'föhr', 'rügen', 'usedom', 'fehmarn', 'st. peter', 'büsum', 'schweden', 'aarhus', 'esbjerg', 'hvide sande', 'løkken'];

Map<String, String> guessAnswers(CalEvent ev, Set<String> cats) {
  // Abflug-/Startort ("Flug ab Hamburg") nicht als Reiseziel werten
  final t = _text(ev).replaceAll(RegExp(r'(ab|von|über|ueber) [a-zäöüß]+'), ' ');
  final a = <String, String>{};
  if (cats.contains('travel')) {
    final m = ev.start.month;
    if (_any(t, _cold)) {
      a['climate'] = 'kalt';
    } else if (_any(t, _north)) {
      a['climate'] = (m >= 5 && m <= 9) ? 'mild' : 'kalt';
    } else if (_any(t, _warm)) {
      a['climate'] = (m >= 11 || m <= 3) && !_any(t, ['ägypten', 'aegypten', 'dubai', 'thailand', 'karibik', 'kanaren', 'teneriffa', 'gran canaria',
              'fuerteventura', 'lanzarote', 'mexiko', 'bali', 'hurghada', 'dominikanische'])
          ? 'mild'
          : 'warm';
    } else {
      a['climate'] = (m == 12 || m <= 2) ? 'kalt' : ((m >= 6 && m <= 8) ? 'warm' : 'mild');
    }
    final tr = <String>[];
    if (cats.contains('flight')) tr.add('flug');
    if (cats.contains('train')) tr.add('zug');
    if (cats.contains('ferry')) tr.add('schiff');
    if (_any(t, ['bus ', 'flixbus', 'reisebus'])) tr.add('bus');
    if (tr.isEmpty || _any(t, ['auto', 'roadtrip', 'wohnmobil', 'camper'])) tr.insert(0, 'auto');
    a['transport'] = tr.join(',');
    a['abroad'] = _any(t, _nonEu) ? 'welt' : (_any(t, _eu) ? 'eu' : 'nein');
    a['stay'] = _any(t, ['camping', 'zelt', 'wohnmobil', 'camper', 'festival'])
        ? 'camping'
        : _any(t, ['ferienhaus', 'sommerhus', 'ferienwohnung', 'fewo', 'hütte', 'huette', 'airbnb', 'bungalow'])
            ? 'ferienhaus'
            : _any(t, ['oma', 'opa', 'eltern', 'mama', 'papa', 'schwester', 'bruder', 'familie', 'tante', 'onkel', 'freunde', ' bei '])
                ? 'familie'
                : 'hotel';
    final act = <String>[];
    if (_any(t, ['strand', 'beach', 'meer', 'ostsee', 'nordsee', 'baden', 'küste', 'kueste', 'insel']) ||
        (_any(t, _north) && m >= 5 && m <= 9) || (a['climate'] == 'warm' && !_any(t, _cityTrip))) {
      act.add('strand');
    }
    if (_any(t, ['wandern', 'wanderung', 'berge', 'alpen', 'harz', 'gebirge', 'trekking'])) act.add('wandern');
    if (_any(t, ['ski', 'snowboard', 'piste', 'langlauf'])) act.add('ski');
    if (_any(t, _cityTrip)) act.add('stadt');
    if (_any(t, ['wellness', 'therme', 'spa ', 'spa-', 'sauna', 'massage'])) act.add('wellness');
    if (_any(t, ['dienstreise', 'messe', 'geschäft', 'geschaeft', 'kunde', 'konferenz', 'seminar', 'schulung'])) act.add('business');
    a['activity'] = act.join(',');
    final w = <String>[];
    if (_any(t, ['kinder', 'kids', 'familienurlaub'])) w.add('kinder');
    if (_any(t, ['baby'])) w.add('baby');
    if (_any(t, ['hund', 'mit dem hund'])) w.add('hund');
    a['with'] = w.join(',');
    a['pets'] = 'pflanzen';
  }
  if (cats.contains('party') || cats.contains('kidsParty') || cats.contains('ceremony')) {
    a['gift'] = cats.contains('kidsParty') || cats.contains('ceremony') || _any(t, ['geburtstag', 'einweihung', 'jubiläum']) ? 'ja' : 'nein';
    a['bring'] = _any(t, ['grill', 'buffet', 'büfett', 'potluck', 'mitbring']) ? 'essen' : 'nichts';
  }
  a['transport'] ??= 'auto';
  return a;
}

// ---------- Erzeugen ----------

List<PrepItem> generatePrep(CalEvent ev, Map<String, String> answers, {String Function()? idGen}) {
  final cats = detectCategories(ev);
  final out = <PrepItem>[];
  var n = 0;
  String id() => idGen?.call() ?? 'p${DateTime.now().microsecondsSinceEpoch}${n++}';
  void add(String text, String group, int days) {
    if (out.any((p) => p.text == text)) return;
    out.add(PrepItem(id: id(), text: text, group: group, days: days));
  }

  Set<String> multi(String k) => (answers[k] ?? '').split(',').where((e) => e.isNotEmpty).toSet();
  final transport = multi('transport');
  final nights = dateOnly(ev.end).difference(dateOnly(ev.start)).inHours ~/ 24;
  final t = _text(ev);
  final month = ev.start.month;

  // --- Reisen ---
  if (cats.contains('travel')) {
    final climate = answers['climate'] ?? 'mild';
    final abroad = answers['abroad'] ?? 'nein';
    final stay = answers['stay'] ?? 'hotel';
    final act = multi('activity');
    final withW = multi('with');
    final pets = multi('pets');
    final days = nights + 1;
    final clothesN = days.clamp(1, 8);

    // Dokumente
    add('Personalausweis', G.docs, 1);
    if (abroad == 'welt') {
      add('Reisepass – noch mindestens 6 Monate gültig?', G.docs, 42);
      add('Visum / Einreisebestimmungen prüfen', G.docs, 42);
      add('Impfungen für das Reiseland prüfen', G.hygiene, 42);
      add('Auslandskrankenversicherung abschließen', G.docs, 14);
      add('Kreditkarte & etwas Bargeld in Landeswährung', G.docs, 3);
      add('Reisestecker-Adapter', G.tech, 2);
      add('Handy-Tarif: Roaming / Datenpaket prüfen', G.tech, 3);
    } else if (abroad == 'eu') {
      add('Krankenkassenkarte (EHIC auf der Rückseite)', G.docs, 1);
      add('Handy-Roaming aktiv?', G.tech, 1);
    }
    if (abroad != 'eu') add('Krankenkassenkarte', G.docs, 1);
    add('EC-/Kreditkarte & Bargeld', G.docs, 1);
    if (stay != 'familie') add('Buchungsbestätigung (Unterkunft)', G.docs, 2);
    add('Haustürschlüssel', G.docs, 0);

    // Transport: Flug
    if (transport.contains('flug')) {
      add('Flugtickets / Buchung bereit', G.flight, 14);
      add('Sitzplätze reservieren', G.flight, 7);
      add('Parken am Flughafen oder Fahrt dorthin organisieren', G.flight, 7);
      add('Gepäckbestimmungen prüfen (Gewicht, Handgepäck)', G.flight, 3);
      add('Online einchecken', G.flight, 1);
      add('Bordkarten aufs Handy laden / ausdrucken', G.flight, 1);
      add('Koffer wiegen', G.flight, 1);
      add('Flüssigkeiten max. 100 ml in Zip-Beutel', G.flight, 1);
      add('Powerbank ins Handgepäck (nicht in den Koffer!)', G.flight, 1);
      add('Abflugzeit & Terminal nochmal prüfen', G.flight, 0);
      add('Rechtzeitig los: ca. 2 Std. vor Abflug am Flughafen', G.flight, 0);
      if (abroad == 'welt') add('ESTA / eTA / Einreiseformular online ausfüllen', G.flight, 21);
    }
    // Bahn
    if (transport.contains('zug')) {
      add('Zugtickets kaufen (Sparpreis früh buchen)', G.train, 14);
      add('Sitzplätze reservieren', G.train, 7);
      add('Tickets aufs Handy laden', G.train, 1);
      add('Verbindung & Verspätungen prüfen', G.train, 0);
      add('Proviant für die Fahrt', G.train, 1);
    }
    // Fähre
    if (transport.contains('schiff')) {
      add('Fährticket buchen', G.ferry, 14);
      add('Abfahrtszeit & Check-in-Schluss prüfen', G.ferry, 0);
      add('Mittel gegen Seekrankheit', G.ferry, 2);
    }
    if (transport.contains('bus')) {
      add('Bustickets bereit', G.train, 7);
      add('Abfahrtsort & -zeit prüfen', G.train, 0);
    }
    // Auto
    if (transport.contains('auto')) {
      add('Führerschein & Fahrzeugschein', G.docs, 1);
      add('Ölstand prüfen', G.car, 3);
      add('Kühlflüssigkeit prüfen', G.car, 3);
      add('Reifendruck prüfen (beladen!)', G.car, 2);
      add('Scheibenwischwasser auffüllen', G.car, 2);
      add('Warnweste, Warndreieck, Verbandkasten an Bord?', G.car, 3);
      add('Volltanken / Akku laden', G.car, 1);
      add('Route & Staus checken', G.car, 0);
      add('Snacks & Getränke für die Fahrt', G.car, 1);
      if (nights >= 3) add('Licht & Bremsen kurz checken', G.car, 3);
      if (climate == 'kalt' || month >= 11 || month <= 3) {
        add('Winterreifen drauf?', G.car, 7);
        add('Eiskratzer & Frostschutz', G.car, 2);
        if (climate == 'kalt') add('Schneeketten (Pflicht in manchen Ländern)', G.car, 7);
      }
      if (abroad != 'nein') {
        add('Vignette / Maut fürs Reiseland', G.car, 7);
        add('Länder-Regeln prüfen (z. B. Warnweste, Umweltzonen)', G.car, 7);
      }
      if (withW.contains('kinder') || withW.contains('baby')) add('Kindersitz(e) einbauen', G.car, 1);
    }

    // Kleidung
    add('Unterwäsche (×${clothesN + 1})', G.clothes, 1);
    add('Socken (×${clothesN + 1})', G.clothes, 1);
    add('T-Shirts / Oberteile (×$clothesN)', G.clothes, 1);
    add('Hosen (×${(clothesN / 2).ceil()})', G.clothes, 1);
    add('Schlafsachen', G.clothes, 1);
    add('Bequeme Schuhe', G.clothes, 1);
    if (climate == 'warm') {
      add('Badesachen', G.clothes, 1);
      add('Kurze Hosen / Kleider', G.clothes, 1);
      add('Sandalen / Flip-Flops', G.clothes, 1);
      add('Sonnenhut / Kappe', G.clothes, 1);
      add('Sonnenbrille', G.clothes, 1);
      add('Sonnencreme (hoher LSF)', G.hygiene, 1);
      add('After-Sun', G.hygiene, 1);
      add('Mückenschutz', G.hygiene, 1);
      add('Leichte Jacke für abends', G.clothes, 1);
    } else if (climate == 'kalt') {
      add('Winterjacke', G.clothes, 1);
      add('Schal', G.clothes, 1);
      add('Mütze', G.clothes, 1);
      add('Handschuhe', G.clothes, 1);
      add('Warme Socken', G.clothes, 1);
      add('Thermo-Unterwäsche', G.clothes, 1);
      add('Pullover / Fleece', G.clothes, 1);
      add('Winterschuhe (wasserdicht)', G.clothes, 1);
      add('Lippenpflege & fettige Creme', G.hygiene, 1);
    } else {
      add('Regenjacke', G.clothes, 1);
      add('Pullover / Strickjacke', G.clothes, 1);
      add('Regenschirm', G.clothes, 1);
    }
    add('Wetter am Ziel checken', G.todo, 2);

    // Hygiene
    add('Zahnbürste & Zahnpasta', G.hygiene, 0);
    add('Deo', G.hygiene, 1);
    add('Duschgel & Shampoo', G.hygiene, 1);
    add('Haarbürste / Kamm', G.hygiene, 1);
    add('Rasierer', G.hygiene, 1);
    add('Medikamente – reicht der Vorrat?', G.hygiene, 7);
    add('Medikamente einpacken', G.hygiene, 1);
    add('Reiseapotheke (Pflaster, Schmerzmittel, Durchfall)', G.hygiene, 2);
    add('Brille / Kontaktlinsen + Mittel', G.hygiene, 1);
    if (stay == 'camping' || stay == 'ferienhaus') add('Handtücher & Bettwäsche – inklusive?', G.stay, 7);

    // Technik
    add('Handy-Ladegerät', G.tech, 0);
    add('Powerbank laden', G.tech, 1);
    add('Kopfhörer', G.tech, 1);
    add('Offline-Karten herunterladen', G.tech, 2);
    if (nights >= 3) add('Fotos vom Handy sichern (Platz schaffen)', G.tech, 3);

    // Aktivitäten
    if (act.contains('strand')) {
      add('Strandtuch', G.activity, 1);
      add('Wasserdichte Handyhülle', G.activity, 2);
      add('Schnorchel / Taucherbrille', G.activity, 1);
      if (withW.contains('kinder')) add('Strandspielzeug & Schwimmflügel', G.kids, 1);
    }
    if (act.contains('wandern')) {
      add('Wanderschuhe', G.activity, 1);
      add('Rucksack & Trinkflasche', G.activity, 1);
      add('Blasenpflaster', G.activity, 1);
      add('Wanderkarte / App', G.activity, 2);
    }
    if (act.contains('ski')) {
      add('Skikleidung (Jacke & Hose)', G.activity, 2);
      add('Skibrille & Helm', G.activity, 2);
      add('Skipass online kaufen', G.activity, 7);
      add('Skiausrüstung (oder Verleih reservieren)', G.activity, 7);
      add('Handwärmer', G.activity, 1);
    }
    if (act.contains('stadt')) {
      add('Tickets für Sehenswürdigkeiten vorab buchen', G.activity, 7);
      add('Tagesrucksack', G.activity, 1);
    }
    if (act.contains('wellness')) {
      add('Bademantel', G.activity, 1);
      add('Badeschlappen', G.activity, 1);
      add('Massage / Anwendungen reservieren', G.activity, 7);
    }
    if (act.contains('business')) {
      add('Laptop + Ladegerät', G.tech, 1);
      add('Business-Kleidung', G.clothes, 1);
      add('Unterlagen / Präsentation', G.docs, 2);
      add('Abwesenheitsnotiz einstellen', G.todo, 0);
    }

    // Unterkunft
    if (stay == 'camping') {
      add('Zelt (vollständig? Heringe!)', G.stay, 3);
      add('Schlafsack & Isomatte', G.stay, 1);
      add('Campingkocher & Gas', G.stay, 2);
      add('Taschenlampe / Stirnlampe', G.stay, 1);
      add('Geschirr & Besteck', G.stay, 1);
      add('Campingplatz reserviert?', G.stay, 14);
    } else if (stay == 'ferienhaus') {
      add('Schlüsselübergabe klären', G.stay, 3);
      add('Kaffee, Spüli, Grundvorrat', G.stay, 1);
    } else if (stay == 'familie') {
      add('Gastgeschenk', G.gift, 2);
    }

    // Mitreisende
    if (withW.contains('kinder')) {
      add('Kuscheltier', G.kids, 0);
      add('Beschäftigung für die Fahrt (Bücher, Spiele)', G.kids, 1);
      add('Wechselkleidung', G.kids, 1);
      add('Kinder-Sonnencreme', G.kids, 1);
      if (abroad != 'nein') add('Kinderreisepass / Ausweis der Kinder', G.docs, 21);
    }
    if (withW.contains('baby')) {
      add('Windeln & Feuchttücher', G.kids, 1);
      add('Fläschchen & Babynahrung', G.kids, 1);
      add('Kinderwagen / Trage', G.kids, 1);
      add('Schnuller (+ Ersatz)', G.kids, 0);
    }
    if (withW.contains('hund')) {
      add('Hundefutter & Leckerlis', G.dog, 1);
      add('Napf (Wasser & Futter)', G.dog, 1);
      add('Leine & Kotbeutel', G.dog, 0);
      add('Hundedecke', G.dog, 1);
      if (abroad != 'nein') add('EU-Heimtierausweis & Tollwutimpfung prüfen', G.dog, 28);
      add('Hundefreundliche Unterkunft bestätigt?', G.dog, 14);
    }

    // Zuhause
    if (pets.contains('tiere')) add('Tierbetreuung organisieren', G.home, 14);
    if (pets.contains('pflanzen')) add('Pflanzen gießen lassen / organisieren', G.home, 3);
    if (nights >= 3) add('Nachbarn Bescheid geben (Briefkasten)', G.home, 3);
    if (nights >= 7) add('Zeitung / Abo pausieren', G.home, 7);
    add('Koffer packen', G.todo, 1);
    add('Kühlschrank leeren (Verderbliches)', G.home, 1);
    add('Müll rausbringen', G.home, 0);
    add('Fenster schließen', G.home, 0);
    add('Herd, Bügeleisen, Kaffeemaschine aus', G.home, 0);
    if (month >= 10 || month <= 4) add('Heizung runterdrehen', G.home, 0);
    if (nights >= 7) add('Wasserhaupthahn zudrehen?', G.home, 0);
  }

  // --- Feste & Anlässe ---
  if (cats.contains('birthdayOther')) {
    final age = ev.birthYear != null ? ev.start.year - ev.birthYear! : null;
    if (age != null && age > 0 && (age % 10 == 0 || age == 18 || age == 25)) {
      add('Runder Geburtstag ($age)! Etwas Besonderes planen', G.gift, 30);
    }
    add('Geschenkidee überlegen', G.gift, 14);
    add('Geschenk besorgen', G.gift, 5);
    add('Karte schreiben', G.gift, 1);
    add('Geschenk einpacken', G.gift, 1);
    add('Gratulieren / anrufen 🎉', G.gift, 0);
  }
  if (cats.contains('party') || cats.contains('kidsParty') || cats.contains('ceremony')) {
    if (answers['gift'] == 'ja') {
      add('Geschenk besorgen', G.gift, 5);
      add('Karte schreiben', G.gift, 1);
      add('Geschenk einpacken', G.gift, 1);
    }
    final bring = multi('bring');
    if (bring.contains('essen')) add('Essen / Salat vorbereiten', G.gift, 1);
    if (bring.contains('getraenke')) add('Getränke kaufen & kühlen', G.gift, 1);
    if (!cats.contains('travel')) add('Zu- oder absagen', G.todo, 7);
  }
  if (cats.contains('kidsParty')) {
    add('Wer bringt / holt das Kind?', G.kids, 1);
    add('Allergien / Abholzeit klären', G.kids, 1);
  }
  if (cats.contains('ceremony')) {
    add('Outfit raussuchen / reinigen lassen', G.clothes, 7);
    add('Schuhe putzen', G.clothes, 1);
    add('Friseur-Termin?', G.todo, 10);
    add('Umschlag mit Geldgeschenk?', G.gift, 2);
  }
  if (cats.contains('funeral')) {
    add('Dunkle Kleidung bereitlegen', G.clothes, 2);
    add('Blumen / Gesteck bestellen', G.todo, 3);
    add('Trauerkarte schreiben', G.todo, 1);
    add('Taschentücher', G.appointment, 0);
  }
  if (cats.contains('date')) {
    add('Tisch reservieren', G.todo, 3);
    add('Outfit überlegen', G.clothes, 0);
    if (_any(t, ['jahrestag', 'hochzeitstag', 'valentin'])) add('Kleine Überraschung / Blumen', G.gift, 2);
  }

  // --- Gesundheit ---
  if (cats.contains('doctor') || cats.contains('dentist') || cats.contains('hospital')) {
    add('Krankenkassenkarte', G.appointment, 0);
    add('Fragen & Beschwerden notieren', G.appointment, 1);
    add('Aktuelle Medikamentenliste', G.appointment, 0);
    if (_any(t, ['facharzt', 'orthopäd', 'radiolog', 'mrt', 'röntgen', 'kardiolog', 'neurolog', 'urolog', 'hautarzt', 'dermatolog', 'hno'])) {
      add('Überweisung vom Hausarzt', G.appointment, 3);
    }
    add('Termin noch aktuell? (ggf. absagen)', G.todo, 1);
  }
  if (cats.contains('dentist')) {
    add('Bonusheft', G.appointment, 0);
    add('Vorher Zähne putzen', G.appointment, 0);
  }
  if (cats.contains('fasting')) add('Nüchtern bleiben: ab 22 Uhr am Vorabend nichts essen', G.appointment, 1);
  if (cats.contains('vaccine')) add('Impfpass', G.appointment, 0);
  if (cats.contains('eyes')) {
    add('Brille / Kontaktlinsen mitnehmen', G.appointment, 0);
    add('Augentropfen: danach nicht selbst fahren', G.appointment, 0);
  }
  if (cats.contains('kidsDoctor')) {
    add('Gelbes U-Heft', G.appointment, 0);
    add('Impfpass des Kindes', G.appointment, 0);
    add('Kuscheltier zum Trost', G.kids, 0);
  }
  if (cats.contains('hospital')) {
    add('Kliniktasche packen', G.todo, 2);
    add('Einweisungsschein & Vorbefunde', G.docs, 1);
    add('Schlafanzug, Bademantel, Hausschuhe', G.clothes, 2);
    add('Ladekabel (lang!)', G.tech, 1);
    add('Abholung / Fahrt nach Hause organisieren', G.todo, 3);
  }
  if (cats.contains('vet')) {
    add('Impfausweis des Tieres', G.appointment, 0);
    add('Leine / Transportbox', G.appointment, 0);
    add('Auffälligkeiten notieren', G.appointment, 1);
  }

  // --- Alltag ---
  if (cats.contains('job')) {
    add('Bewerbungsunterlagen ausdrucken', G.docs, 1);
    add('Über die Firma informieren', G.todo, 2);
    add('Outfit bereitlegen', G.clothes, 1);
    add('Fragen an den Arbeitgeber notieren', G.todo, 1);
    add('Anfahrt prüfen: 15 Min. früher da sein', G.todo, 0);
  }
  if (cats.contains('authority')) {
    add('Personalausweis', G.docs, 0);
    add('Nötige Unterlagen zusammensuchen', G.docs, 3);
    add('Terminbestätigung', G.docs, 0);
    add('Kartenzahlung möglich? Sonst Bargeld', G.docs, 0);
  }
  if (cats.contains('carService')) {
    add('Fahrzeugschein', G.docs, 0);
    add('Serviceheft', G.docs, 0);
    add('Felgenschloss-Schlüssel', G.car, 0);
    add('Persönliches aus dem Auto räumen', G.car, 1);
    add('Rückweg / Ersatzwagen klären', G.todo, 1);
    if (_any(t, ['reifen'])) add('Reifen aus dem Keller ins Auto laden', G.car, 1);
  }
  if (cats.contains('swim')) {
    add('Badesachen', G.clothes, 0);
    add('Handtuch', G.clothes, 0);
    add('Duschgel & Badeschlappen', G.hygiene, 0);
    add('Münze für den Spind', G.docs, 0);
  }
  if (cats.contains('sport')) {
    add('Sporttasche packen', G.clothes, 0);
    add('Sportschuhe', G.clothes, 0);
    add('Trinkflasche füllen', G.hygiene, 0);
    add('Handtuch', G.clothes, 0);
  }
  if (cats.contains('school')) {
    add('Unterlagen / Elternbriefe', G.docs, 0);
    add('Fragen an die Lehrkraft notieren', G.todo, 1);
  }
  if (cats.contains('kidsTrip')) {
    add('Packliste der Schule abhaken', G.kids, 3);
    add('Taschengeld', G.kids, 1);
    add('Krankenkassenkarte (Kopie) & Notfallnummern', G.docs, 2);
    add('Schlafsack', G.kids, 2);
    add('Namen in Kleidung schreiben', G.kids, 5);
  }
  if (cats.contains('event')) {
    add('Tickets aufs Handy / ausdrucken', G.docs, 1);
    add('Anfahrt & Parken klären', G.todo, 1);
    add('Powerbank laden', G.tech, 0);
  }
  if (cats.contains('festival')) {
    add('Gummistiefel & Regenponcho', G.clothes, 1);
    add('Ohrstöpsel', G.hygiene, 1);
    add('Zelt, Schlafsack, Isomatte', G.stay, 2);
  }
  if (cats.contains('dogSchool')) {
    add('Leckerlis', G.dog, 0);
    add('Leine & Kotbeutel', G.dog, 0);
    add('Wasser für den Hund', G.dog, 0);
  }
  if (cats.contains('garbage')) {
    add('Tonne / Säcke am Vorabend rausstellen', G.home, 1);
  }
  if (cats.contains('move')) {
    add('Umzugskartons besorgen', G.todo, 21);
    add('Transporter mieten', G.todo, 21);
    add('Helfer fragen', G.todo, 14);
    add('Halteverbot beantragen', G.todo, 14);
    add('Nachsendeauftrag Post', G.todo, 7);
    add('Zählerstände notieren', G.todo, 0);
    add('Getränke & Essen für Helfer', G.todo, 1);
  }
  if (cats.contains('exam')) {
    add('Lernen / Wiederholen', G.todo, 7);
    add('Ausweis / Einladung', G.docs, 0);
    add('Stifte, Taschenrechner, erlaubte Hilfsmittel', G.appointment, 1);
    add('Früh schlafen gehen', G.todo, 1);
  }
  if (cats.contains('business') && !cats.contains('travel')) {
    add('Unterlagen / Präsentation vorbereiten', G.docs, 2);
    add('Laptop laden', G.tech, 0);
  }
  if (cats.contains('shopping')) {
    add('Einkaufsliste schreiben', G.todo, 0);
    add('Taschen & Pfand mitnehmen', G.todo, 0);
  }
  if (cats.contains('outing')) {
    add('Wetter checken', G.todo, 1);
    add('Proviant & Getränke', G.todo, 0);
    add('Sonnen- / Regenschutz', G.clothes, 0);
  }
  if (cats.contains('beauty')) {
    if (_any(t, ['friseur', 'frisör', 'frisoer', 'barber'])) add('Foto der Wunschfrisur raussuchen', G.appointment, 1);
    add('Bargeld / Trinkgeld', G.appointment, 0);
  }
  if (cats.contains('craftsman')) {
    add('Zu Hause sein / Zugang klären', G.todo, 0);
    add('Arbeitsbereich freiräumen', G.home, 1);
    add('Fragen & Mängel notieren', G.todo, 1);
    add('Haustiere wegsperren', G.home, 0);
  }
  if (cats.contains('guests')) {
    add('Gästebett beziehen', G.home, 1);
    add('Einkaufen fürs Essen', G.todo, 1);
    add('Aufräumen & Bad putzen', G.home, 1);
    add('Handtücher bereitlegen', G.home, 0);
  }
  if (cats.contains('deadline')) {
    add('Unterlagen zusammensuchen', G.docs, 7);
    add('Rechtzeitig absenden (Einschreiben / Bestätigung)', G.todo, 3);
    add('Kopie / Nachweis aufheben', G.docs, 0);
  }
  if (cats.contains('payment')) {
    add('Kontostand prüfen', G.todo, 2);
    add('Überweisung ausführen', G.todo, 1);
  }
  if (cats.contains('bloodDonation')) {
    add('Personalausweis & Blutspendeausweis', G.docs, 0);
    add('Vorher gut essen & viel trinken', G.hygiene, 0);
  }
  if (cats.contains('babysitter')) {
    add('Notfallnummern & Infos aufschreiben', G.kids, 1);
    add('Essen / Schlafenszeit absprechen', G.kids, 1);
  }
  if (cats.contains('lesson')) {
    add('Noten / Hefte / Material einpacken', G.appointment, 0);
    add('Hausaufgaben / Übungen erledigt?', G.todo, 1);
    if (_any(t, ['fahrstunde', 'fahrschule'])) add('Brille & Ausbildungsnachweis', G.docs, 0);
  }
  if (cats.contains('library')) add('Bücher / Medien einpacken', G.todo, 0);
  if (cats.contains('pickup')) {
    add('Pünktlich losfahren', G.todo, 0);
    if (_any(t, ['kind', 'kita', 'schule', 'kindergarten'])) add('Kindersitz im Auto?', G.car, 0);
  }
  if (!cats.contains('travel') && answers['transport'] == 'oeffi' && questionsFor(cats).isNotEmpty) {
    add('Verbindung raussuchen', G.todo, 0);
  }
  if (!cats.contains('travel') && answers['transport'] == 'auto' && questionsFor(cats).isNotEmpty && ev.location.isNotEmpty) {
    add('Route & Parkmöglichkeit prüfen', G.todo, 0);
  }
  return out;
}

/// Neue Vorschläge einmischen: Erledigtes und Eigenes bleiben erhalten
List<PrepItem> mergePrep(List<PrepItem> old, List<PrepItem> fresh) {
  final res = <PrepItem>[];
  final byText = {for (final p in old) p.text: p};
  for (final f in fresh) {
    res.add(byText.remove(f.text) ?? f);
  }
  // Eigene Punkte und Erledigtes nicht verlieren
  res.addAll(byText.values.where((p) => p.group == G.own || p.done.isNotEmpty));
  return res;
}

bool hasPrepSuggestions(CalEvent ev) => detectCategories(ev).isNotEmpty;

String dueLabel(PrepItem p, DateTime occStart, {DateTime? now}) {
  final today = dateOnly(now ?? DateTime.now());
  final due = p.dueDate(occStart);
  final diff = due.difference(today).inHours ~/ 24;
  if (diff < 0) return 'überfällig';
  if (diff == 0) return p.days == 0 ? 'am Tag selbst' : 'heute fällig';
  if (diff == 1) return 'morgen fällig';
  return 'in $diff Tagen';
}

String daysBeforeLabel(int d) {
  if (d == 0) return 'am Tag';
  if (d == 1) return '1 Tag vorher';
  if (d % 7 == 0) return d == 7 ? '1 Woche vorher' : '${d ~/ 7} Wochen vorher';
  return '$d Tage vorher';
}
