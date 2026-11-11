// Suche: versteht Personennamen, Jahre, Monate, Jahreszeiten, Farben, Gefühle, Favoriten
// und alles andere über die KI-Bildsuche (deutsche Wörter werden ins Englische übertragen).
import { store } from './store.js';
import { MONTHS, COLOR_NAMES } from './util.js';
import { searchByText, clipState, CATEGORIES } from './smart.js';

// Häufige deutsche Begriffe → Englisch (für das Bildmodell). Unbekannte Wörter werden unverändert übernommen.
const DE_EN = {
  auto: 'car', autos: 'cars', wagen: 'car', pkw: 'car', lkw: 'truck', laster: 'truck', bus: 'bus', traktor: 'tractor', oldtimer: 'vintage car',
  motorrad: 'motorcycle', roller: 'scooter', fahrrad: 'bicycle', rad: 'bicycle', zug: 'train', bahn: 'train', flugzeug: 'airplane',
  flughafen: 'airport', boot: 'boat', schiff: 'ship', segelboot: 'sailboat', hafen: 'harbor', wohnmobil: 'camper van', zelt: 'tent', camping: 'camping',
  haus: 'house', häuser: 'houses', gebäude: 'building', wohnung: 'apartment', zimmer: 'room', küche: 'kitchen', wohnzimmer: 'living room',
  schlafzimmer: 'bedroom', bad: 'bathroom', badezimmer: 'bathroom', garten: 'garden', balkon: 'balcony', terrasse: 'terrace', kirche: 'church',
  burg: 'castle', schloss: 'castle', brücke: 'bridge', turm: 'tower', stadt: 'city', straße: 'street', dorf: 'village', markt: 'market',
  pflanze: 'plant', pflanzen: 'plants', blume: 'flower', blumen: 'flowers', rose: 'rose', rosen: 'roses', tulpe: 'tulip', sonnenblume: 'sunflower',
  baum: 'tree', bäume: 'trees', wald: 'forest', wiese: 'meadow', feld: 'field', gras: 'grass', blatt: 'leaf', blätter: 'leaves', kaktus: 'cactus',
  pilz: 'mushroom', pilze: 'mushrooms', gemüse: 'vegetables', obst: 'fruit', apfel: 'apple', erdbeeren: 'strawberries', tomaten: 'tomatoes',
  hund: 'dog', hunde: 'dogs', welpe: 'puppy', katze: 'cat', katzen: 'cats', kätzchen: 'kitten', vogel: 'bird', vögel: 'birds', pferd: 'horse',
  pferde: 'horses', kuh: 'cow', kühe: 'cows', schaf: 'sheep', ziege: 'goat', schwein: 'pig', huhn: 'chicken', hühner: 'chickens', ente: 'duck',
  fisch: 'fish', hase: 'rabbit', kaninchen: 'rabbit', hamster: 'hamster', meerschweinchen: 'guinea pig', tiger: 'tiger', löwe: 'lion',
  elefant: 'elephant', giraffe: 'giraffe', zebra: 'zebra', affe: 'monkey', bär: 'bear', reh: 'deer', hirsch: 'deer', fuchs: 'fox',
  eichhörnchen: 'squirrel', schmetterling: 'butterfly', biene: 'bee', spinne: 'spider', tier: 'animal', tiere: 'animals', zoo: 'zoo',
  strand: 'beach', meer: 'sea', see: 'lake', fluss: 'river', wasser: 'water', berg: 'mountain', berge: 'mountains', alpen: 'alps', himmel: 'sky',
  wolken: 'clouds', sonne: 'sun', sonnenuntergang: 'sunset', sonnenaufgang: 'sunrise', regenbogen: 'rainbow', regen: 'rain', schnee: 'snow',
  eis: 'ice', nebel: 'fog', gewitter: 'thunderstorm', nacht: 'night', mond: 'moon', sterne: 'stars', feuerwerk: 'fireworks', insel: 'island',
  wüste: 'desert', wasserfall: 'waterfall', höhle: 'cave', landschaft: 'landscape', urlaub: 'vacation', reise: 'travel', pool: 'swimming pool',
  mensch: 'person', menschen: 'people', person: 'person', personen: 'people', leute: 'people', mann: 'man', männer: 'men', frau: 'woman',
  frauen: 'women', kind: 'child', kinder: 'children', baby: 'baby', babys: 'babies', junge: 'boy', mädchen: 'girl', familie: 'family',
  gruppe: 'group of people', gruppenfoto: 'group photo', freunde: 'friends', oma: 'grandmother', opa: 'grandfather', paar: 'couple',
  selfie: 'selfie', portrait: 'portrait', porträt: 'portrait', gesicht: 'face', brille: 'glasses', sonnenbrille: 'sunglasses', hut: 'hat', mütze: 'cap',
  bart: 'beard', kleid: 'dress', anzug: 'suit', schuhe: 'shoes',
  essen: 'food', mahlzeit: 'meal', frühstück: 'breakfast', mittagessen: 'lunch', abendessen: 'dinner', pizza: 'pizza', nudeln: 'pasta',
  burger: 'burger', salat: 'salad', suppe: 'soup', brot: 'bread', kuchen: 'cake', torte: 'cake', kekse: 'cookies', eiscreme: 'ice cream',
  speiseeis: 'ice cream', grillen: 'barbecue', grill: 'barbecue', kaffee: 'coffee', tee: 'tea', bier: 'beer', wein: 'wine', getränk: 'drink',
  cocktail: 'cocktail', restaurant: 'restaurant', sushi: 'sushi', pommes: 'french fries', wurst: 'sausage', fleisch: 'meat', käse: 'cheese',
  geburtstag: 'birthday party', party: 'party', feier: 'celebration', hochzeit: 'wedding', braut: 'bride', weihnachten: 'christmas',
  weihnachtsbaum: 'christmas tree', ostern: 'easter', ostereier: 'easter eggs', silvester: 'new year fireworks', karneval: 'carnival costume',
  fasching: 'carnival costume', halloween: 'halloween', konzert: 'concert', geschenk: 'gift', geschenke: 'gifts', kerze: 'candle', kerzen: 'candles',
  luftballons: 'balloons', schule: 'school', einschulung: 'first day of school',
  sport: 'sports', fußball: 'soccer', tennis: 'tennis', schwimmen: 'swimming', ski: 'skiing', skifahren: 'skiing', wandern: 'hiking',
  joggen: 'jogging', radfahren: 'cycling', reiten: 'horse riding', yoga: 'yoga', spielplatz: 'playground', schaukel: 'swing',
  dokument: 'document', dokumente: 'documents', text: 'text', quittung: 'receipt', rechnung: 'invoice', kassenbon: 'receipt', buch: 'book',
  bücher: 'books', zettel: 'note', karte: 'map', bildschirm: 'screen', screenshot: 'screenshot', handy: 'smartphone', computer: 'computer',
  laptop: 'laptop', fernseher: 'television', spielzeug: 'toy', spielzeuge: 'toys', teddy: 'teddy bear', lego: 'lego', puppe: 'doll',
  kunst: 'art', bild: 'picture', gemälde: 'painting', zeichnung: 'drawing', graffiti: 'graffiti', skulptur: 'sculpture', statue: 'statue',
  stuhl: 'chair', tisch: 'table', sofa: 'sofa', bett: 'bed', fenster: 'window', tür: 'door', treppe: 'stairs', lampe: 'lamp', uhr: 'clock',
  werkzeug: 'tools', maschine: 'machine', nähmaschine: 'sewing machine', stickerei: 'embroidery', stoff: 'fabric', tshirt: 't-shirt', shirt: 'shirt',
  rot: 'red', rote: 'red', roter: 'red', rotes: 'red', blau: 'blue', blaue: 'blue', blauer: 'blue', blaues: 'blue', grün: 'green', grüne: 'green',
  grüner: 'green', grünes: 'green', gelb: 'yellow', gelbe: 'yellow', gelber: 'yellow', gelbes: 'yellow', orange: 'orange', lila: 'purple',
  violett: 'purple', rosa: 'pink', pink: 'pink', schwarz: 'black', schwarze: 'black', schwarzer: 'black', schwarzes: 'black', weiß: 'white',
  weiße: 'white', weißer: 'white', weißes: 'white', grau: 'gray', graue: 'gray', grauer: 'gray', graues: 'gray', braun: 'brown', braune: 'brown',
  brauner: 'brown', braunes: 'brown', bunt: 'colorful', bunte: 'colorful', bunter: 'colorful', buntes: 'colorful', gold: 'golden', silber: 'silver',
  groß: 'big', große: 'big', großer: 'big', großes: 'big', klein: 'small', kleine: 'small', kleiner: 'small', kleines: 'small', alt: 'old',
  alte: 'old', alter: 'old', altes: 'old', neu: 'new', neue: 'new', neuer: 'new', neues: 'new', schön: 'beautiful', lustig: 'funny',
  süß: 'cute', niedlich: 'cute', nass: 'wet', dunkel: 'dark', hell: 'bright',
  mit: 'with', und: 'and', auf: 'on', im: 'in the', in: 'in', am: 'at the', unter: 'under', vor: 'in front of', neben: 'next to', bei: 'at',
  der: '', die: '', das: '', ein: 'a', eine: 'a', einem: 'a', einer: 'a', einen: 'a', den: '', dem: '', des: '', von: 'of', zum: 'to the', zur: 'to the',
};

const SEASONS = { frühling: [2, 3, 4], sommer: [5, 6, 7], herbst: [8, 9, 10], winter: [11, 0, 1] };
const EMOTIONS = {
  lachen: 'happy', lacht: 'happy', lachend: 'happy', lachende: 'happy', lächeln: 'happy', lächelnd: 'happy', glücklich: 'happy', fröhlich: 'happy',
  überrascht: 'surprised', staunen: 'surprised', erstaunt: 'surprised', traurig: 'sad', weinen: 'sad', wütend: 'angry', böse: 'angry', sauer: 'angry',
};
const FAV_WORDS = ['favorit', 'favoriten', 'lieblingsfotos', 'herz', '♥', '❤️'];

export function translate(text) {
  return text.split(/\s+/).map((w) => {
    const low = w.toLowerCase();
    if (low in DE_EN) return DE_EN[low];
    // einfache Endungen abschneiden: "Blumenwiese" bleibt, "Hunden" → "Hund"
    for (const suf of ['en', 'n', 'e', 's', 'er', 'es']) {
      if (low.endsWith(suf) && low.slice(0, -suf.length) in DE_EN) return DE_EN[low.slice(0, -suf.length)];
    }
    return w;
  }).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Zerlegt eine Suchanfrage in Filter und freien Text */
export function parseQuery(q) {
  const res = { people: [], years: [], months: [], emotion: null, fav: false, color: null, category: null, text: [] };
  const people = [...store.people.values()].filter((p) => p.name);
  let rest = ' ' + q.trim() + ' ';
  // Mehrwortnamen zuerst ("Oma Erna")
  for (const p of people.sort((a, b) => b.name.length - a.name.length)) {
    const re = new RegExp(`\\s${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'i');
    if (re.test(rest)) { res.people.push(p.id); rest = rest.replace(re, ' '); }
  }
  for (const word of rest.split(/[\s,]+/).filter(Boolean)) {
    const w = word.toLowerCase();
    if (/^(19|20)\d\d$/.test(w)) res.years.push(+w);
    else if (MONTHS.some((m) => m.toLowerCase() === w)) res.months.push(MONTHS.findIndex((m) => m.toLowerCase() === w));
    else if (w in SEASONS) res.months.push(...SEASONS[w]);
    else if (w in EMOTIONS) res.emotion = EMOTIONS[w];
    else if (FAV_WORDS.includes(w)) res.fav = true;
    else if (['und', '&', 'mit', 'von'].includes(w) && !res.text.length) continue;
    else res.text.push(word);
  }
  // reiner Farbname → Farbfilter (schnell und ohne KI)
  if (res.text.length === 1) {
    const c = COLOR_NAMES.find((c) => c.label.toLowerCase() === res.text[0].toLowerCase() || c.id === res.text[0].toLowerCase());
    if (c) { res.color = c.id; res.text = []; }
  }
  return res;
}

/** Führt die Suche aus. Gibt { photos, info } zurück. */
export async function runSearch(query, opts = {}) {
  const q = parseQuery(query);
  let list = store.sorted();
  const info = [];
  if (q.people.length) {
    for (const pid of q.people) {
      const ids = new Set(store.facesOfPerson(pid).map((f) => f.photoId));
      list = list.filter((p) => ids.has(p.id));
    }
    info.push(q.people.map((id) => store.personName(id)).join(' & '));
  }
  if (q.years.length) { list = list.filter((p) => q.years.includes(new Date(p.date).getFullYear())); info.push(q.years.join(', ')); }
  if (q.months.length) { list = list.filter((p) => q.months.includes(new Date(p.date).getMonth())); }
  if (q.fav) { list = list.filter((p) => p.fav); info.push('Favoriten'); }
  if (q.color) { list = list.filter((p) => p.colorName === q.color); info.push('Farbe'); }
  if (q.emotion) {
    const ids = new Set([...store.faces.values()]
      .filter((f) => (q.emotion === 'happy' ? f.happy > 0.6 : f.expr === q.emotion && f.exprScore > 0.4)).map((f) => f.photoId));
    list = list.filter((p) => ids.has(p.id));
  }
  if (q.text.length) {
    const raw = q.text.join(' ');
    // Kategorie-Name genau getroffen? ("Autos", "Pflanzen")
    const cat = CATEGORIES.find((c) => c[1].toLowerCase() === raw.toLowerCase() || c[0] === raw.toLowerCase());
    const english = translate(raw);
    if (clipState.ready) {
      const ranked = cat
        ? await searchCategory(cat[0], list)
        : await searchByText(english, list);
      list = ranked.map((x) => x.p);
      info.push(`„${raw}“${english.toLowerCase() !== raw.toLowerCase() ? ` (${english})` : ''}`);
    } else {
      // ohne KI: Dateiname und Schlagwörter
      const low = raw.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(low) || (cat && p.tags.includes(cat[0])));
      info.push(`„${raw}“ im Dateinamen – die smarte Suche lädt noch`);
    }
  }
  return { photos: list, info, parsed: q, ...opts };
}

/** Kategorie-Suche: getaggte Bilder zuerst, dann ähnliche */
export async function searchCategory(catId, list = store.sorted()) {
  const { categoryVectors, rankByVector } = await import('./smart.js');
  const cv = await categoryVectors();
  const i = CATEGORIES.findIndex((c) => c[0] === catId);
  const ranked = rankByVector(cv[i], list, { min: 0.14, rel: 0.75 });
  const tagged = list.filter((p) => p.tags.includes(catId));
  const seen = new Set();
  const out = [];
  for (const p of tagged) { seen.add(p.id); out.push({ p, s: 1 }); }
  for (const x of ranked) if (!seen.has(x.p.id)) out.push(x);
  return out;
}

export function suggestions() {
  const out = [];
  store.peopleList().filter((p) => p.name).slice(0, 8).forEach((p) => out.push(p.name));
  const years = [...new Set([...store.photos.values()].map((p) => new Date(p.date).getFullYear()))].sort((a, b) => b - a);
  out.push(...years.slice(0, 4).map(String));
  out.push('Auto', 'Haus', 'Pflanzen', 'Strand', 'Hund', 'Essen', 'lachen', 'Sonnenuntergang', 'Sommer', 'Favoriten');
  return out;
}
