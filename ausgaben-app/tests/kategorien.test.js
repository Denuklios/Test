// Prüft die automatische Kategorie-Zuordnung mit typischen Eingaben.  Aufruf: node tests/kategorien.test.js
const P = require('../app/src/main/assets/www/parsers.js');
const cases = {
  lebensmittel: ['REWE', 'rewe', 'Lidl', 'Aldi Süd', 'Edeka Center', 'Bäcker', 'Bäckerei Schmidt', 'Brötchen', 'Metzgerei', 'Wocheneinkauf', 'Einkauf', 'Supermarkt', 'Netto Marken-Discount', 'Kiosk', 'Getränke Hoffmann', 'Wochenmarkt Obst', 'Føtex', 'Rema 1000', 'Brot'],
  mobilitaet: ['Tanken', 'tanken', 'Tankstelle', 'Aral', 'Shell Station', 'Benzin', 'Diesel', 'Parken', 'Parkhaus', 'Werkstatt', 'Reifenwechsel', 'TÜV', 'Autowäsche', 'Waschstraße', 'ADAC', 'Maut', 'Auto'],
  oepnv: ['Bahn', 'Deutsche Bahn', 'Bahnticket', 'Bus', 'Deutschlandticket', 'Flixbus', 'Taxi', 'Uber', 'Hotel', 'Flug', 'Ryanair', 'Mietwagen', 'Urlaub', 'Airbnb', 'Fahrkarte'],
  restaurant: ['Pizza', 'Pizzeria Roma', 'Döner', 'McDonalds', "McDonald's", 'Burger King', 'Café', 'Kaffee', 'Starbucks', 'Restaurant', 'Essen gehen', 'Mittagessen', 'Lieferando', 'Sushi', 'Eis', 'Eisdiele', 'Imbiss', 'Kantine', 'Biergarten'],
  wohnen: ['Miete', 'Nebenkosten', 'Hausverwaltung', 'Kaution', 'Umzug', 'Husleje'],
  energie: ['Strom', 'Stromabschlag', 'Gas', 'Stadtwerke', 'Heizöl', 'Wasser', 'Vattenfall', 'E.ON', 'Fernwärme'],
  versicherung: ['Versicherung', 'HUK', 'Kfz-Versicherung', 'Haftpflicht', 'Hausrat', 'Allianz', 'Krankenkasse', 'AOK', 'Rechtsschutz'],
  abos: ['Netflix', 'Spotify', 'Disney+', 'Fitnessstudio', 'McFit', 'Abo', 'Amazon Prime', 'Zeitung', 'YouTube Premium', 'iCloud', 'ChatGPT'],
  telefon: ['Telekom', 'Vodafone', 'O2', 'Handyvertrag', 'Internet', 'DSL', 'Congstar', 'Prepaid'],
  online: ['Amazon', 'eBay', 'Temu', 'Paket', 'Bestellung', 'MediaMarkt', 'Otto', 'Vinted'],
  kleidung: ['Kleidung', 'H&M', 'Schuhe', 'Deichmann', 'Zara', 'Jacke', 'Jeans', 'Primark', 'Zalando', 'Decathlon'],
  gesundheit: ['Apotheke', 'Arzt', 'Zahnarzt', 'Brille', 'Fielmann', 'Physiotherapie', 'Medikamente', 'Zuzahlung', 'Krankenhaus'],
  pflege: ['Friseur', 'Frisör', 'Haarschnitt', 'Barber', 'Nagelstudio', 'Kosmetik', 'Massage', 'Douglas', 'Parfüm', 'Sauna'],
  freizeit: ['Kino', 'Konzert', 'Museum', 'Zoo', 'Eintritt', 'Schwimmbad', 'Bowling', 'Steam', 'Playstation', 'Bücher', 'Thalia', 'Lotto', 'Verein', 'Freizeitpark', 'Fahrrad'],
  kinder: ['Kita', 'Kindergarten', 'Windeln', 'Spielzeug', 'Hundefutter', 'Katzenfutter', 'Tierarzt', 'Fressnapf', 'Schule', 'Nachhilfe', 'Taschengeld', 'Hund'],
  kredit: ['Kredit', 'Rate', 'Ratenzahlung', 'Leasing', 'Sparplan', 'Tagesgeld', 'Bausparvertrag', 'Darlehen', 'ETF'],
  bar: ['Geldautomat', 'Bargeld', 'Auszahlung', 'ATM'],
  geschenke: ['Geschenk', 'Geburtstagsgeschenk', 'Blumen', 'Gutschein', 'Weihnachtsgeschenk', 'Juwelier', 'Hochzeit'],
  gebuehren: ['Steuer', 'Kfz-Steuer', 'Finanzamt', 'Rundfunkbeitrag', 'GEZ', 'Kontoführungsgebühr', 'Bußgeld', 'Strafzettel', 'Spende', 'Hundesteuer', 'Anwalt', 'Personalausweis'],
  drogerie: ['dm', 'Rossmann', 'Drogerie', 'IKEA', 'Baumarkt', 'OBI', 'Waschmittel', 'Möbel', 'Toilettenpapier', 'Action', 'Pflanzen']
};
let ok = 0, bad = [];
for (const [cat, list] of Object.entries(cases)) for (const t of list) { const g = P.guessCategory(t); if (g === cat) ok++; else bad.push(`${t} -> ${g} (soll ${cat})`); }
// Bankzeilen dürfen nicht durch Füllwörter falsch landen
const bank = [['Hausverwaltung Meier – FOLGELASTSCHRIFT Miete Oktober', 'wohnen'], ['ARAL Tankstelle – Kartenzahlung', 'mobilitaet'], ['HUK-COBURG – Kfz-Versicherung', 'versicherung'], ['Netflix International – Abo', 'abos'], ['Stadtwerke Kiel – Abschlag Strom', 'energie'], ['Sparkasse – Entgelt Kontoführung', 'gebuehren'], ['Friseur Haarscharf – Kartenzahlung', 'pflege'], ['SEPA Lastschrift Buchung', 'sonstiges']];
for (const [t, c] of bank) { const g = P.guessCategory(t); if (g === c) ok++; else bad.push(`${t} -> ${g} (soll ${c})`); }
console.log(ok + ' richtig, ' + bad.length + ' falsch'); bad.forEach(b => console.log('  ' + b));
process.exit(bad.length ? 1 : 0);
