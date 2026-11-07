// Übersetzungen der Oberfläche (Deutsch ist die Grundsprache).
// Funktionsweise: Ein MutationObserver übersetzt jeden Text, den die App anzeigt – auch nachträglich
// eingefügte Inhalte. Exakte Texte stehen in DICT, Texte mit Zahlen/Namen in PATTERNS (reguläre Ausdrücke).
// Die Anleitung liegt je Sprache als ganzer HTML-Block in GUIDE.

const KEY = 'gassi.lang';
export const LANGS = { de: 'Deutsch', da: 'Dansk', en: 'English' };

function detect() {
  try { const s = localStorage.getItem(KEY); if (s && LANGS[s]) return s; } catch { /* egal */ }
  const n = (navigator.language || 'de').slice(0, 2).toLowerCase();
  return n === 'da' || n === 'nb' || n === 'sv' ? 'da' : n === 'de' ? 'de' : 'en';
}
export let lang = detect();
export function setLang(l) { try { localStorage.setItem(KEY, l); } catch { /* egal */ } }
export const locale = () => ({ de: 'de-DE', da: 'da-DK', en: 'en-GB' }[lang]);

// [deutsch, dansk, english]
const ROWS = [
  ['Gassirunde', 'Gassirunde', 'Gassirunde'],
  ['Karte', 'Kort', 'Map'],
  ['Anleitung: So funktioniert Gassirunde', 'Vejledning: Sådan virker Gassirunde', 'Guide: How Gassirunde works'],
  ['Wetter der nächsten 3 Stunden', 'Vejret de næste 3 timer', 'Weather for the next 3 hours'],
  ['Mich auf der Karte zeigen', 'Vis mig på kortet', 'Show me on the map'],
  ['Mein Profil', 'Min profil', 'My profile'],
  ['Spaziergang starten', 'Start tur', 'Start walk'],
  ['Spaziergang beenden', 'Afslut tur', 'End walk'],
  ['Runden und Live', 'Ruter og live', 'Routes and live'],
  ['Fenster vergrößern oder verkleinern', 'Gør vinduet større eller mindre', 'Enlarge or shrink window'],
  ['Runden', 'Ruter', 'Routes'],
  ['Finden', 'Find', 'Find'],
  ['Live', 'Live', 'Live'],
  ['Treffen', 'Mødes', 'Meetups'],
  ['Wie viel Zeit hast du?', 'Hvor meget tid har du?', 'How much time do you have?'],
  ['20 Min.', '20 min.', '20 min'], ['40 Min.', '40 min.', '40 min'], ['1 Std.', '1 time', '1 hr'], ['1,5 Std.', '1,5 time', '1.5 hrs'],
  ['Was ist dir wichtig?', 'Hvad er vigtigt for dig?', 'What matters to you?'],
  ['Wasser für den Hund', 'Vand til hunden', 'Water for the dog'],
  ['Möglichst wenig Begegnungen', 'Så få møder som muligt', 'As few encounters as possible'],
  ['Freilauf', 'Fri løb', 'Off-leash'],
  ['Gerade unterwegs', 'Ude lige nu', 'Out right now'],
  ['Dein Status', 'Din status', 'Your status'],
  ['Gern zusammen', 'Gerne sammen', 'Happy to join'],
  ['Andere sehen dich grün und dürfen dir winken.', 'Andre ser dig grøn og må vinke til dig.', 'Others see you in green and may wave to you.'],
  ['Unterwegs', 'På tur', 'Out walking'],
  ['Einfach sichtbar, ohne besonderen Wunsch.', 'Bare synlig, uden særligt ønske.', 'Just visible, no particular wish.'],
  ['Bitte Abstand', 'Hold afstand', 'Please keep distance'],
  ['Abstand', 'Afstand', 'Distance'],
  ['Wie die gelbe Schleife: Andere werden ab 150 m gewarnt.', 'Som den gule sløjfe: Andre advares inden for 150 m.', 'Like the yellow ribbon: others are warned within 150 m.'],
  ['Meine Position während des Spaziergangs teilen', 'Del min position under turen', 'Share my position during the walk'],
  ['Aufnahme läuft', 'Optager', 'Recording'],
  ['Pausiert', 'På pause', 'Paused'],
  ['Kilometer', 'Kilometer', 'Kilometres'],
  ['Zeit', 'Tid', 'Time'],
  ['Min. pro km', 'Min. pr. km', 'Min per km'],
  ['Pause', 'Pause', 'Pause'], ['Weiter', 'Fortsæt', 'Resume'],
  ['Beenden', 'Afslut', 'End'],
  ['Spaziergang beendet', 'Tur afsluttet', 'Walk finished'],
  ['Als Runde mit anderen teilen', 'Del som rute med andre', 'Share as a route with others'],
  ['Name der Runde', 'Rutens navn', 'Route name'],
  ['z. B. Feldweg hinter dem Sportplatz', 'f.eks. markvejen bag sportspladsen', 'e.g. field path behind the sports ground'],
  ['Ort / Gegend', 'Sted / område', 'Place / area'],
  ['z. B. Musterstadt-Nord', 'f.eks. Byens nordlige del', 'e.g. North of town'],
  ['Ort wird ermittelt …', 'Finder stedet …', 'Finding place …'],
  ['Beschreibung', 'Beskrivelse', 'Description'],
  ['Was macht die Runde besonders?', 'Hvad gør ruten særlig?', 'What makes the route special?'],
  ['Schatten', 'Skygge', 'Shade'], ['wenig', 'lidt', 'little'], ['mittel', 'middel', 'medium'], ['viel', 'meget', 'a lot'],
  ['Untergrund', 'Underlag', 'Surface'], ['Wald & Wiese', 'Skov & eng', 'Forest & meadow'], ['gemischt', 'blandet', 'mixed'], ['viel Asphalt', 'meget asfalt', 'lots of asphalt'],
  ['Leine', 'Snor', 'Leash'], ['Freilauf erlaubt', 'Fri løb tilladt', 'Off-leash allowed'], ['teilweise Pflicht', 'delvis påbudt', 'partly required'], ['Leinenpflicht', 'Hunde i snor', 'Leash required'],
  ['Straßen zu queren', 'Veje at krydse', 'Roads to cross'],
  ['Wasser unterwegs (Bach, See, Brunnen)', 'Vand undervejs (bæk, sø, brønd)', 'Water along the way (stream, lake, fountain)'],
  ['Mülleimer für Kotbeutel', 'Skraldespande til hømposer', 'Bins for poo bags'],
  ['Anfang und Ende um 100 m kürzen', 'Forkort start og slut med 100 m', 'Trim start and end by 100 m'],
  ['Die Runde beginnt dort, wo du auf „Spaziergang starten“ gedrückt hast. Wenn du direkt vor der Haustür startest oder endest, kürze Anfang und Ende, damit niemand sieht, wo du wohnst.',
    'Ruten begynder der, hvor du trykkede på „Start tur“. Starter eller slutter du lige uden for døren, så forkort start og slut, så ingen kan se, hvor du bor.',
    'The route starts where you tapped “Start walk”. If you start or end right at your front door, trim start and end so nobody can see where you live.'],
  ['Verwerfen', 'Kassér', 'Discard'], ['Wirklich verwerfen?', 'Vil du virkelig kassere?', 'Really discard?'],
  ['Speichern', 'Gem', 'Save'], ['Speichern & bewerten', 'Gem & bedøm', 'Save & rate'],
  ['Alles klar', 'Forstået', 'Got it'],
  ['Nachricht an die Gruppe …', 'Besked til gruppen …', 'Message to the group …'], ['Nachricht', 'Besked', 'Message'],
  ['Senden', 'Send', 'Send'], ['Schließen', 'Luk', 'Close'],
  ['Treffen vorschlagen', 'Foreslå et møde', 'Suggest a meetup'],
  ['Tag', 'Dag', 'Day'], ['Uhrzeit', 'Klokkeslæt', 'Time'],
  ['Notiz (freiwillig)', 'Note (valgfri)', 'Note (optional)'],
  ['z. B. Langsames Tempo, Welpe dabei', 'f.eks. roligt tempo, hvalp med', 'e.g. slow pace, puppy coming along'],
  ['Treffpunkt ist der Start der Runde. Alle in der Nähe sehen dein Treffen und können mitmachen.', 'Mødestedet er rutens start. Alle i nærheden kan se dit møde og deltage.', 'The meeting point is the start of the route. Everyone nearby can see your meetup and join.'],
  ['Abbrechen', 'Annullér', 'Cancel'], ['Vorschlagen', 'Foreslå', 'Suggest'],
  ['Anmelden', 'Log ind', 'Log in'],
  ['Neu hier? Die', 'Ny her? ', 'New here? The'], ['Pfote mit dem i', 'Poten med i’et', 'paw with the i'],
  ['oben links erklärt dir die ganze App.', 'øverst til venstre forklarer hele appen.', 'at the top left explains the whole app.'],
  ['Anleitung', 'Vejledning', 'Guide'],
  ['Neues Konto', 'Ny konto', 'New account'], ['Konto anlegen', 'Opret konto', 'Create account'],
  ['E-Mail-Adresse', 'E-mailadresse', 'Email address'], ['Passwort', 'Adgangskode', 'Password'],
  ['Mindestens 8 Zeichen.', 'Mindst 8 tegn.', 'At least 8 characters.'],
  ['Dein Vorname', 'Dit fornavn', 'Your first name'], ['z. B. Robert', 'f.eks. Robert', 'e.g. Robert'],
  ['Name des Hundes', 'Hundens navn', 'Dog’s name'], ['z. B. Bello', 'f.eks. Bella', 'e.g. Buddy'],
  ['Rasse', 'Race', 'Breed'], ['Alter', 'Alder', 'Age'],
  ['Mischung aus', 'Blanding af', 'Mix of'], ['und', 'og', 'and'],
  ['Rasse und Alter für andere sichtbar', 'Race og alder synlig for andre', 'Breed and age visible to others'],
  ['Ich spreche', 'Jeg taler', 'I speak'],
  ['Rasse und Alter sind freiwillig. Andere sehen nie deine E-Mail-Adresse.', 'Race og alder er valgfrit. Andre ser aldrig din e-mailadresse.', 'Breed and age are optional. Others never see your email address.'],
  ['Erst umsehen', 'Kig dig omkring først', 'Look around first'],
  ['Du & dein Hund', 'Dig & din hund', 'You & your dog'],
  ['Demo-Modus: GPS simulieren (zum Ausprobieren am Schreibtisch)', 'Demotilstand: simulér GPS (til at prøve ved skrivebordet)', 'Demo mode: simulate GPS (to try it out at your desk)'],
  ['Meine Spaziergänge', 'Mine ture', 'My walks'],
  ['Passwort ändern', 'Skift adgangskode', 'Change password'], ['Aktuelles Passwort', 'Nuværende adgangskode', 'Current password'],
  ['Neues Passwort (mind. 8 Zeichen)', 'Ny adgangskode (mindst 8 tegn)', 'New password (at least 8 characters)'],
  ['Konto löschen', 'Slet konto', 'Delete account'],
  ['Löscht dein Konto, deine Spaziergänge, deine Bewertungen und die Runden, die du geteilt hast. Das lässt sich nicht rückgängig machen.',
    'Sletter din konto, dine ture, dine bedømmelser og de ruter, du har delt. Det kan ikke fortrydes.',
    'Deletes your account, your walks, your ratings and the routes you shared. This cannot be undone.'],
  ['Zur Bestätigung dein Passwort', 'Din adgangskode som bekræftelse', 'Your password to confirm'],
  ['Konto endgültig löschen', 'Slet kontoen endeligt', 'Delete account permanently'],
  ['Abmelden', 'Log ud', 'Log out'],
  ['Sprache der App', 'Appens sprog', 'App language'],
  ['Keine Angabe', 'Ikke angivet', 'Not specified'], ['Unbekannt', 'Ukendt', 'Unknown'],
  ['Andere Rasse', 'Anden race', 'Other breed'], ['Mischling', 'Blanding', 'Mixed breed'],
  ['unter 1 Jahr', 'under 1 år', 'under 1 year'],
  ['Schattig', 'Skyggefuld', 'Shady'], ['Mit Wasser', 'Med vand', 'With water'], ['Hundeauslauf', 'Hundeskov', 'Dog park'],
  ['bis 3 km', 'op til 3 km', 'up to 3 km'], ['3–6 km', '3–6 km', '3–6 km'], ['über 6 km', 'over 6 km', 'over 6 km'],
  ['Hund', 'Hund', 'Dog'], ['schattig', 'skyggefuld', 'shady'], ['Wasser', 'Vand', 'Water'],
  ['Gassirunde-Tipp', 'Gassirunde-tip', 'Gassirunde tip'], ['Von der Community', 'Fra fællesskabet', 'From the community'], ['Wanderweg', 'Vandresti', 'Hiking trail'],
  ['Der Hunde-Score (0–100) bewertet Wasser, Schatten, Untergrund, Straßen, Leinenregel und Mülleimer. Hundeausläufe und Wanderwege stammen aus OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL). Verschiebe die Karte, um Runden in anderen Gegenden zu sehen.',
    'Hunde-scoren (0–100) vurderer vand, skygge, underlag, veje, snorregler og skraldespande. Hundeskove og vandrestier kommer fra OpenStreetMap (© OpenStreetMap-bidragydere, ODbL). Flyt kortet for at se ruter i andre områder.',
    'The dog score (0–100) rates water, shade, surface, roads, leash rules and bins. Dog parks and hiking trails come from OpenStreetMap (© OpenStreetMap contributors, ODbL). Move the map to see routes in other areas.'],
  ['Keine Runde passt zu den Filtern. Nimm einen Filter heraus oder verschiebe die Karte.', 'Ingen rute passer til filtrene. Fjern et filter eller flyt kortet.', 'No route matches the filters. Remove a filter or move the map.'],
  ['← Alle Runden', '← Alle ruter', '← All routes'],
  ['Hunde-Score', 'Hunde-score', 'Dog score'],
  ['Startpunkt von dir aus', 'Startpunkt fra dig', 'Start point from you'],
  ['Auto', 'Bil', 'Car'], ['Zu Fuß', 'Til fods', 'On foot'],
  ['Weg dorthin', 'Vejen derhen', 'Route there'], ['Navigation starten', 'Start navigation', 'Start navigation'],
  ['Entfernung zeigen', 'Vis afstand', 'Show distance'], ['Weg wird berechnet …', 'Beregner vej …', 'Calculating route …'],
  ['Kein Weg gefunden.', 'Ingen vej fundet.', 'No route found.'],
  ['So setzt sich der Score zusammen', 'Sådan beregnes scoren', 'How the score is made up'],
  ['Wie voll ist es?', 'Hvor travlt er der?', 'How busy is it?'],
  ['Typischer Tagesverlauf. Mit echten Nutzern lernt die App ihn aus den aufgezeichneten Spaziergängen.', 'Typisk dagsforløb. Med rigtige brugere lærer appen det af de optagede ture.', 'Typical day. With real users the app learns it from recorded walks.'],
  ['Gemeinsam gehen', 'Gå sammen', 'Walk together'],
  ['Lade Treffen …', 'Henter møder …', 'Loading meetups …'], ['Lade …', 'Henter …', 'Loading …'],
  ['Bewertungen', 'Bedømmelser', 'Ratings'],
  ['Noch keine Bewertungen. Sei die erste Person!', 'Ingen bedømmelser endnu. Vær den første!', 'No ratings yet. Be the first!'],
  ['Runde bewerten', 'Bedøm ruten', 'Rate the route'], ['Deine Bewertung ändern', 'Ret din bedømmelse', 'Change your rating'],
  ['Was sollten andere Hundehalter wissen? (optional)', 'Hvad skal andre hundeejere vide? (valgfrit)', 'What should other dog owners know? (optional)'],
  ['Bewertung speichern', 'Gem bedømmelse', 'Save rating'],
  ['Diese Runde laufen', 'Gå denne rute', 'Walk this route'],
  ['Meine Runde löschen', 'Slet min rute', 'Delete my route'], ['Wirklich löschen?', 'Vil du virkelig slette?', 'Really delete?'],
  ['Melde dich an, um die Runde zu laufen und aufzuzeichnen.', 'Log ind for at gå og optage ruten.', 'Log in to walk and record the route.'],
  ['Melde dich an, um ein Treffen vorzuschlagen.', 'Log ind for at foreslå et møde.', 'Log in to suggest a meetup.'],
  ['Melde dich an, um Runden zu bewerten.', 'Log ind for at bedømme ruter.', 'Log in to rate routes.'],
  ['Melde dich an, um anderen zu winken.', 'Log ind for at vinke til andre.', 'Log in to wave to others.'],
  ['Melde dich an, um Spaziergänge aufzuzeichnen und Runden zu teilen.', 'Log ind for at optage ture og dele ruter.', 'Log in to record walks and share routes.'],
  ['Melde dich an, um Treffen zu sehen, mitzumachen und im Chat zu schreiben.', 'Log ind for at se møder, deltage og skrive i chatten.', 'Log in to see meetups, join and chat.'],
  ['Melde dich an, um geplante Treffen auf dieser Runde zu sehen.', 'Log ind for at se planlagte møder på denne rute.', 'Log in to see planned meetups on this route.'],
  ['Melde dich an, um zu sehen, wer gerade mit Hund unterwegs ist, und um selbst auf der Karte zu erscheinen.', 'Log ind for at se, hvem der er ude med hund lige nu, og selv blive vist på kortet.', 'Log in to see who is out with a dog right now and to appear on the map yourself.'],
  ['Deine Runde wurde gelöscht.', 'Din rute er slettet.', 'Your route was deleted.'],
  ['Bitte wähle 1 bis 5 Sterne.', 'Vælg 1 til 5 stjerner.', 'Please choose 1 to 5 stars.'],
  ['Danke! Deine Bewertung ist gespeichert.', 'Tak! Din bedømmelse er gemt.', 'Thanks! Your rating is saved.'],
  ['Dieses Gerät liefert keinen Standort.', 'Denne enhed giver ingen position.', 'This device provides no location.'],
  ['Standort nicht verfügbar. Bitte den Standortzugriff erlauben.', 'Position ikke tilgængelig. Tillad adgang til position.', 'Location unavailable. Please allow location access.'],
  ['Standort nicht verfügbar.', 'Position ikke tilgængelig.', 'Location unavailable.'],
  ['Du bist dabei', 'Du er med', 'You’re in'], ['In der Nähe', 'I nærheden', 'Nearby'], ['Meine Treffen', 'Mine møder', 'My meetups'],
  ['Gerade ist hier kein Treffen geplant. Öffne eine Runde und tippe auf „Treffen vorschlagen“.', 'Der er ingen møder planlagt her lige nu. Åbn en rute og tryk på „Foreslå et møde“.', 'No meetup is planned here right now. Open a route and tap “Suggest a meetup”.'],
  ['Treffen sehen nur angemeldete Nutzer. Den Chat eines Treffens lesen und schreiben nur, wer mitmacht.', 'Kun loggede ind brugere ser møder. Kun deltagere kan læse og skrive i chatten.', 'Only logged-in users see meetups. Only participants can read and write in a meetup’s chat.'],
  ['Noch kein Treffen auf dieser Runde geplant.', 'Intet møde planlagt på denne rute endnu.', 'No meetup planned on this route yet.'],
  ['Treffen konnten nicht geladen werden.', 'Møder kunne ikke hentes.', 'Meetups could not be loaded.'],
  ['Bitte Tag und Uhrzeit wählen.', 'Vælg dag og klokkeslæt.', 'Please choose day and time.'],
  ['Dein Treffen ist eingetragen. Andere in der Nähe sehen es jetzt.', 'Dit møde er oprettet. Andre i nærheden kan se det nu.', 'Your meetup is posted. Others nearby can see it now.'],
  ['Treffen absagen', 'Aflys mødet', 'Cancel meetup'], ['Wirklich absagen?', 'Vil du virkelig aflyse?', 'Really cancel?'],
  ['Doch nicht dabei', 'Alligevel ikke med', 'Not coming after all'], ['Ich bin dabei', 'Jeg er med', 'I’m in'],
  ['Zur Runde & Weg dorthin', 'Til ruten & vejen derhen', 'To the route & directions'],
  ['Chat', 'Chat', 'Chat'],
  ['Noch keine Nachrichten. Schreib zum Beispiel, wann du ankommst.', 'Ingen beskeder endnu. Skriv f.eks., hvornår du kommer.', 'No messages yet. For example, write when you’ll arrive.'],
  ['Mach mit, um den Chat zu lesen und zu schreiben.', 'Deltag for at læse og skrive i chatten.', 'Join to read and write in the chat.'],
  ['Du bist dabei! Im Chat kannst du dich mit den anderen abstimmen.', 'Du er med! I chatten kan du aftale med de andre.', 'You’re in! Use the chat to coordinate with the others.'],
  ['Du bist beim Treffen nicht mehr dabei.', 'Du er ikke længere med til mødet.', 'You’re no longer part of the meetup.'],
  ['Das Treffen ist abgesagt.', 'Mødet er aflyst.', 'The meetup is cancelled.'],
  ['Die Runde wird geladen …', 'Ruten hentes …', 'Loading the route …'],
  ['Heute', 'I dag', 'Today'], ['Morgen', 'I morgen', 'Tomorrow'],
  ['Welpe', 'hvalp', 'puppy'], ['Senior', 'senior', 'senior'], ['erwachsener Hund', 'voksen hund', 'adult dog'], ['älterer Hund', 'ældre hund', 'older dog'],
  ['Gerade ist niemand live unterwegs. Starte einen Spaziergang und teile deine Position, dann sehen dich andere hier.', 'Ingen er ude live lige nu. Start en tur og del din position, så ser andre dig her.', 'Nobody is out live right now. Start a walk and share your position, then others will see you here.'],
  ['Freut sich über Gesellschaft. Wink ihr oder ihm zu, dann könnt ihr ein Stück zusammen gehen.', 'Glad for selskab. Vink, så kan I gå et stykke sammen.', 'Happy to have company. Give a wave and walk a stretch together.'],
  ['Ist einfach unterwegs, ohne besonderen Wunsch. Ein freundlicher Gruß ist in Ordnung.', 'Er bare på tur uden særligt ønske. En venlig hilsen er fin.', 'Just out walking, no particular wish. A friendly hello is fine.'],
  ['Wie die gelbe Schleife an der Leine: Bitte mindestens 150 m Abstand halten oder einen anderen Weg nehmen.', 'Som den gule sløjfe på snoren: Hold mindst 150 m afstand, eller tag en anden vej.', 'Like the yellow ribbon on the leash: please keep at least 150 m away or take another path.'],
  ['Offen für Gesellschaft', 'Åben for selskab', 'Open to company'], ['Einfach unterwegs', 'Bare på tur', 'Just out walking'],
  ['Entfernung', 'Afstand', 'Distance'], ['Zuletzt gesehen', 'Sidst set', 'Last seen'], ['Gerade auf', 'Lige nu på', 'Currently on'],
  ['Spricht', 'Taler', 'Speaks'], ['keiner bekannten Runde', 'ingen kendt rute', 'no known route'],
  ['erst beim Spaziergang', 'først under turen', 'only during a walk'], ['gerade eben', 'lige nu', 'just now'],
  ['Auf Karte zeigen', 'Vis på kortet', 'Show on map'], ['Winken', 'Vink', 'Wave'], ['Zurückwinken', 'Vink tilbage', 'Wave back'],
  ['nicht mehr unterwegs', 'ikke længere ude', 'no longer out'], ['ohne Hundenamen', 'uden hundenavn', 'no dog name'],
  ['Lust auf eine gemeinsame Runde?', 'Lyst til en tur sammen?', 'Fancy a walk together?'],
  ['Gerne! Ich gehe langsam weiter, komm einfach nach.', 'Gerne! Jeg går langsomt videre, kom bare efter.', 'Sure! I’ll keep walking slowly, just catch up.'],
  ['Dieses Gerät liefert keinen Standort. Zum Ausprobieren im Profil den Demo-Modus einschalten.', 'Denne enhed giver ingen position. Slå demotilstand til i profilen for at prøve.', 'This device provides no location. Turn on demo mode in your profile to try it out.'],
  ['GPS funktioniert nur über eine sichere Verbindung (https). Zum Ausprobieren im Profil den Demo-Modus einschalten.', 'GPS virker kun over en sikker forbindelse (https). Slå demotilstand til i profilen for at prøve.', 'GPS only works over a secure connection (https). Turn on demo mode in your profile to try it out.'],
  ['Eigene Runde', 'Egen rute', 'Own route'],
  ['Bitte erlaube den Standortzugriff, damit die Runde aufgezeichnet wird.', 'Tillad adgang til position, så ruten kan optages.', 'Please allow location access so the route can be recorded.'],
  ['Warte auf GPS-Signal …', 'Venter på GPS-signal …', 'Waiting for GPS signal …'],
  ['Ohne Standortzugriff kann die App die Runde nicht aufzeichnen. Du kannst ihn in den Android-Einstellungen unter Apps → Gassirunde erlauben.', 'Uden adgang til position kan appen ikke optage ruten. Du kan tillade det i Android-indstillingerne under Apps → Gassirunde.', 'Without location access the app can’t record the route. You can allow it in Android settings under Apps → Gassirunde.'],
  ['Standortzugriff wurde abgelehnt. Erlaube ihn in den Browser-Einstellungen, oder nutze im Profil den Demo-Modus.', 'Adgang til position blev afvist. Tillad det i browserindstillingerne, eller brug demotilstand i profilen.', 'Location access was denied. Allow it in your browser settings or use demo mode in your profile.'],
  ['Kein GPS-Signal. Geh ein paar Schritte ins Freie, die Aufnahme läuft weiter.', 'Intet GPS-signal. Gå et par skridt ud i det fri, optagelsen fortsætter.', 'No GPS signal. Take a few steps into the open, recording continues.'],
  ['Demo-Modus mit simuliertem GPS (3-fach Zeitraffer)', 'Demotilstand med simuleret GPS (3x hurtigere)', 'Demo mode with simulated GPS (3x time-lapse)'],
  ['Deine Position ist für andere sichtbar', 'Din position er synlig for andre', 'Your position is visible to others'],
  ['Position wird nicht geteilt', 'Positionen deles ikke', 'Position is not shared'],
  ['Der Spaziergang war zu kurz zum Speichern (unter 30 m).', 'Turen var for kort til at gemme (under 30 m).', 'The walk was too short to save (under 30 m).'],
  ['Bitte gib der Runde einen Namen.', 'Giv ruten et navn.', 'Please give the route a name.'],
  ['Nach dem Kürzen bleibt von der Runde nichts übrig. Lass „kürzen“ aus oder geh eine längere Runde.', 'Efter forkortelsen er der intet tilbage af ruten. Lad være med at forkorte, eller gå en længere tur.', 'After trimming nothing is left of the route. Don’t trim or walk a longer route.'],
  ['Deine Runde ist gespeichert und für andere sichtbar.', 'Din rute er gemt og synlig for andre.', 'Your route is saved and visible to others.'],
  ['Gespeichert. Wie war die Runde? Gib ihr ein paar Sterne.', 'Gemt. Hvordan var ruten? Giv den nogle stjerner.', 'Saved. How was the route? Give it some stars.'],
  ['Spaziergang gespeichert. Du findest ihn in deinem Profil.', 'Tur gemt. Du finder den i din profil.', 'Walk saved. You’ll find it in your profile.'],
  ['Spaziergang verworfen.', 'Tur kasseret.', 'Walk discarded.'],
  ['Andere sehen nur deinen Vornamen und den Namen deines Hundes.', 'Andre ser kun dit fornavn og din hunds navn.', 'Others only see your first name and your dog’s name.'],
  ['Gesamt', 'I alt', 'Total'],
  ['Noch keine Spaziergänge aufgezeichnet.', 'Ingen ture optaget endnu.', 'No walks recorded yet.'],
  ['Spaziergänge konnten nicht geladen werden.', 'Ture kunne ikke hentes.', 'Walks could not be loaded.'],
  ['Bitte gib deinen Vornamen an.', 'Angiv dit fornavn.', 'Please enter your first name.'],
  ['Profil gespeichert.', 'Profil gemt.', 'Profile saved.'],
  ['Passwort geändert. Auf anderen Geräten musst du dich neu anmelden.', 'Adgangskode ændret. På andre enheder skal du logge ind igen.', 'Password changed. You’ll need to log in again on other devices.'],
  ['Beende zuerst deinen Spaziergang.', 'Afslut din tur først.', 'Finish your walk first.'],
  ['Dein Konto und deine Daten wurden gelöscht.', 'Din konto og dine data er slettet.', 'Your account and data were deleted.'],
  ['Du bist abgemeldet.', 'Du er logget ud.', 'You are logged out.'],
  ['Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.', 'Dit login er udløbet. Log ind igen.', 'Your login has expired. Please log in again.'],
  ['Bitte gib deine E-Mail-Adresse ein.', 'Indtast din e-mailadresse.', 'Please enter your email address.'],
  ['Das Passwort braucht mindestens 8 Zeichen.', 'Adgangskoden skal have mindst 8 tegn.', 'The password needs at least 8 characters.'],
  ['Bitte gib dein Passwort ein.', 'Indtast din adgangskode.', 'Please enter your password.'],
  ['Willkommen bei Gassirunde! Melde dich an oder lege ein Konto an.', 'Velkommen til Gassirunde! Log ind eller opret en konto.', 'Welcome to Gassirunde! Log in or create an account.'],
  ['Standort ist hier nicht verfügbar (braucht https).', 'Position er ikke tilgængelig her (kræver https).', 'Location is not available here (needs https).'],
  ['Standort konnte nicht ermittelt werden.', 'Positionen kunne ikke findes.', 'Location could not be determined.'],
  ['Runden konnten nicht geladen werden. Prüfe die Internetverbindung.', 'Ruter kunne ikke hentes. Tjek internetforbindelsen.', 'Routes could not be loaded. Check your internet connection.'],
  // Wetter
  ['Wetter für die Runde', 'Vejret til turen', 'Weather for your walk'], ['Tipps für unterwegs', 'Tips til turen', 'Tips for your walk'],
  ['Wetterdaten: Open-Meteo. Wind in km/h.', 'Vejrdata: Open-Meteo. Vind i km/t.', 'Weather data: Open-Meteo. Wind in km/h.'],
  ['Jetzt', 'Nu', 'Now'], ['An deinem Standort', 'Ved din position', 'At your location'], ['Rund um die Kartenmitte', 'Omkring kortets midte', 'Around the map centre'],
  ['klar', 'klart', 'clear'], ['überwiegend klar', 'overvejende klart', 'mostly clear'], ['teils bewölkt', 'delvis skyet', 'partly cloudy'], ['bedeckt', 'overskyet', 'overcast'],
  ['Nebel', 'tåge', 'fog'], ['Nebel mit Reif', 'tåge med rim', 'freezing fog'], ['leichter Niesel', 'let støvregn', 'light drizzle'], ['Niesel', 'støvregn', 'drizzle'],
  ['starker Niesel', 'kraftig støvregn', 'heavy drizzle'], ['gefrierender Niesel', 'frysende støvregn', 'freezing drizzle'], ['leichter Regen', 'let regn', 'light rain'],
  ['Regen', 'regn', 'rain'], ['starker Regen', 'kraftig regn', 'heavy rain'], ['gefrierender Regen', 'isslag', 'freezing rain'], ['leichter Schnee', 'let sne', 'light snow'],
  ['Schnee', 'sne', 'snow'], ['starker Schnee', 'kraftig sne', 'heavy snow'], ['Schneegriesel', 'kornsne', 'snow grains'], ['Regenschauer', 'regnbyger', 'rain showers'],
  ['kräftige Schauer', 'kraftige byger', 'heavy showers'], ['heftige Schauer', 'voldsomme byger', 'violent showers'], ['Schneeschauer', 'snebyger', 'snow showers'],
  ['Gewitter', 'tordenvejr', 'thunderstorm'], ['Gewitter mit Hagel', 'tordenvejr med hagl', 'thunderstorm with hail'],
  ['Gewitter möglich. Lieber eine kurze Runde in Hausnähe, und nicht unter einzelnen Bäumen unterstellen.', 'Risiko for torden. Tag hellere en kort tur nær hjemmet, og stil dig ikke under enkeltstående træer.', 'Thunderstorms possible. Better a short walk near home, and don’t shelter under single trees.'],
  ['Regen im Anmarsch: Regenjacke an, Schirm einpacken und das Hundehandtuch schon mal an die Haustür legen.', 'Regn på vej: regnjakke på, paraply med og læg hundehåndklædet klar ved døren.', 'Rain on the way: raincoat on, pack an umbrella and put the dog towel by the front door.'],
  ['Es hat vorhin geregnet: Auf Wald- und Feldwegen wird es matschig. Gummistiefel an, und danach ab mit dem Hund unter die Pfotendusche.', 'Det har regnet: Skov- og markveje bliver mudrede. Gummistøvler på, og bagefter poterne under bruseren.', 'It rained earlier: forest and field paths will be muddy. Wellies on, and afterwards paws under the shower.'],
  ['Schnee! Für die meisten Hunde das Größte. Danach Eisklumpen aus dem Pfotenfell holen und die Pfoten abspülen.', 'Sne! Det bedste for de fleste hunde. Fjern bagefter isklumper fra potepelsen og skyl poterne.', 'Snow! The best thing ever for most dogs. Afterwards remove ice clumps from the paw fur and rinse the paws.'],
  ['Frost: Wege können glatt sein, und Streusalz brennt an den Pfoten. Vorher Pfotenbalsam, hinterher lauwarm abspülen.', 'Frost: Vejene kan være glatte, og vejsalt svier i poterne. Potebalsam før, lunkent vand efter.', 'Frost: paths can be slippery and road salt stings the paws. Paw balm before, rinse lukewarm after.'],
  ['Frisch draußen. Mütze auf, und kurzhaarige oder ältere Hunde freuen sich über einen Mantel.', 'Køligt udenfor. Hue på, og korthårede eller ældre hunde er glade for en frakke.', 'Chilly outside. Hat on, and short-haired or older dogs will appreciate a coat.'],
  ['Hitze! Nur früh morgens oder spät abends raus, Asphalt meiden (Handrücken 7 Sekunden auf den Boden) und reichlich Wasser mitnehmen.', 'Hedebølge! Kun tidligt om morgenen eller sent om aftenen, undgå asfalt (håndryggen 7 sekunder mod jorden) og tag rigeligt vand med.', 'Heat! Only go out early morning or late evening, avoid asphalt (back of hand on the ground for 7 seconds) and bring plenty of water.'],
  ['Warm heute: Wasser für den Hund mitnehmen und eine schattige Runde wählen. Der Filter „Schattig“ hilft dabei.', 'Varmt i dag: Tag vand med til hunden og vælg en skyggefuld rute. Filteret „Skyggefuld“ hjælper.', 'Warm today: bring water for the dog and pick a shady route. The “Shady” filter helps.'],
  ['Kurznasige Hunde überhitzen schnell. Heute lieber eine kurze Runde im Schatten.', 'Kortsnudede hunde bliver hurtigt overophedede. Tag hellere en kort tur i skyggen i dag.', 'Short-nosed dogs overheat quickly. Better a short walk in the shade today.'],
  ['Nebel: Mit Leuchthalsband sehen euch Radfahrer und Autos rechtzeitig.', 'Tåge: Med et lysende halsbånd ser cyklister og biler jer i tide.', 'Fog: with a light-up collar cyclists and cars will see you in time.'],
  ['Draußen ist es dunkel. Leuchthalsband oder Blinklicht an, und die Taschenlampe nicht vergessen.', 'Det er mørkt udenfor. Lysende halsbånd eller blinklys på, og husk lommelygten.', 'It’s dark outside. Light-up collar or blinker on, and don’t forget the torch.'],
  ['Perfektes Gassiwetter! Heute darf es ruhig die große Runde sein.', 'Perfekt luftevejr! I dag må det gerne være den store tur.', 'Perfect dog-walking weather! Today it can be the big loop.'],
  ['Nichts Besonderes in Sicht. Leine schnappen und los!', 'Intet særligt i sigte. Snup snoren og af sted!', 'Nothing special ahead. Grab the leash and go!'],
  // Hunde-Score & Hinweise
  ['Wald- & Wiesenwege', 'Skov- & engstier', 'Forest & meadow paths'], ['Gemischter Untergrund', 'Blandet underlag', 'Mixed surface'], ['Viel Asphalt', 'Meget asfalt', 'Lots of asphalt'],
  ['Teilweise Leinenpflicht', 'Delvis snorpligt', 'Leash partly required'], ['Wasser unterwegs', 'Vand undervejs', 'Water along the way'], ['Kein Wasser unterwegs', 'Intet vand undervejs', 'No water along the way'],
  ['Wasser: unbekannt', 'Vand: ukendt', 'Water: unknown'], ['Schatten: unbekannt', 'Skygge: ukendt', 'Shade: unknown'], ['Untergrund unbekannt', 'Underlag ukendt', 'Surface unknown'],
  ['Keine Straßen zu queren', 'Ingen veje at krydse', 'No roads to cross'], ['Straßen: unbekannt', 'Veje: ukendt', 'Roads: unknown'], ['Leinenregel: vor Ort prüfen', 'Snorregler: tjek på stedet', 'Leash rules: check locally'],
  ['Keine Mülleimer bekannt', 'Ingen kendte skraldespande', 'No known bins'], ['Mülleimer: unbekannt', 'Skraldespande: ukendt', 'Bins: unknown'],
  ['Kein Wasser unterwegs. Nimm eine Trinkflasche für den Hund mit.', 'Intet vand undervejs. Tag en drikkeflaske med til hunden.', 'No water along the way. Bring a water bottle for the dog.'],
  ['Ob es unterwegs Wasser gibt, ist nicht bekannt. Nimm eine Trinkflasche für den Hund mit.', 'Det vides ikke, om der er vand undervejs. Tag en drikkeflaske med til hunden.', 'It’s not known whether there is water along the way. Bring a water bottle for the dog.'],
  ['Wenig Schatten. Lieber früh morgens oder abends gehen.', 'Lidt skygge. Gå hellere tidligt om morgenen eller om aftenen.', 'Little shade. Better go early morning or in the evening.'],
  ['Kurznasige Hunde überhitzen schon ab etwa 21 °C. Kurze Runde im Schatten, Wasser mitnehmen, Pausen machen.', 'Kortsnudede hunde bliver overophedede allerede fra ca. 21 °C. Kort tur i skyggen, vand med, hold pauser.', 'Short-nosed dogs overheat from about 21 °C. Short walk in the shade, bring water, take breaks.'],
  ['Streusalz möglich. Pfoten nach der Runde abwaschen.', 'Muligvis vejsalt. Vask poterne efter turen.', 'Road salt possible. Wash paws after the walk.'],
  ['Für Welpen ist die Runde lang. Plane Pausen ein oder kürze ab.', 'Ruten er lang for hvalpe. Planlæg pauser eller tag en genvej.', 'The route is long for puppies. Plan breaks or take a shortcut.'],
  ['Für ältere Hunde eher lang. Achte auf Pausen.', 'Ret lang for ældre hunde. Husk pauser.', 'Rather long for older dogs. Remember to take breaks.'],
  ['ruhig', 'roligt', 'quiet'], ['mäßig besucht', 'moderat besøgt', 'moderately busy'], ['viel los', 'travlt', 'busy'],
  ['Wasser zum Trinken und Planschen', 'vand at drikke og plaske i', 'water to drink and splash in'], ['jetzt gerade ruhig', 'roligt lige nu', 'quiet right now'],
  ['viel Schatten bei der Hitze', 'meget skygge i varmen', 'lots of shade in the heat'],
  ['Beste Wahl: ', 'Bedste valg: ', 'Best choice: '],
  ['Runden filtern', 'Filtrér ruter', 'Filter routes'],
  ['Belebtheit über den Tag, 6 bis 23 Uhr', 'Travlhed i løbet af dagen, kl. 6 til 23', 'How busy it is through the day, 6 am to 11 pm'],
  ['Verkehrsmittel', 'Transportmiddel', 'Mode of transport'], ['Sprache', 'Sprog', 'Language'],
  ['Pfoten', 'Poter', 'Paws'],
  ['Gassirunde-Tipp · ', 'Gassirunde-tip · ', 'Gassirunde tip · '],
  // Meldungen vom Server
  ['Bitte melde dich an.', 'Log ind.', 'Please log in.'],
  ['E-Mail-Adresse oder Passwort stimmt nicht.', 'E-mailadresse eller adgangskode er forkert.', 'Email address or password is incorrect.'],
  ['Bitte gib eine gültige E-Mail-Adresse an.', 'Angiv en gyldig e-mailadresse.', 'Please enter a valid email address.'],
  ['Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich stattdessen an.', 'Der findes allerede en konto med denne e-mailadresse. Log ind i stedet.', 'An account with this email address already exists. Log in instead.'],
  ['Zu viele Fehlversuche. Bitte warte 15 Minuten.', 'For mange fejlforsøg. Vent 15 minutter.', 'Too many failed attempts. Please wait 15 minutes.'],
  ['Das aktuelle Passwort stimmt nicht.', 'Den nuværende adgangskode er forkert.', 'The current password is incorrect.'],
  ['Das Passwort stimmt nicht.', 'Adgangskoden er forkert.', 'The password is incorrect.'],
  ['Die Person ist gerade nicht mehr unterwegs.', 'Personen er ikke længere ude.', 'This person is no longer out.'],
  ['Die Person bittet um Abstand.', 'Personen beder om afstand.', 'This person asks for distance.'],
  ['Dieses Treffen gibt es nicht mehr.', 'Dette møde findes ikke længere.', 'This meetup no longer exists.'],
  ['Bitte wähle einen Termin in den nächsten 60 Tagen.', 'Vælg et tidspunkt inden for de næste 60 dage.', 'Please choose a date within the next 60 days.'],
  ['Den Chat sehen nur Teilnehmer. Mach mit, um mitzuschreiben.', 'Kun deltagere ser chatten. Deltag for at skrive med.', 'Only participants see the chat. Join to write.'],
  ['Die Nachricht ist leer.', 'Beskeden er tom.', 'The message is empty.'],
  ['Nur wer die Runde angelegt hat, kann sie löschen.', 'Kun den, der har oprettet ruten, kan slette den.', 'Only whoever created the route can delete it.'],
  ['Die Runde braucht mindestens zwei GPS-Punkte.', 'Ruten skal have mindst to GPS-punkter.', 'The route needs at least two GPS points.'],
];

// Rassen (Wert bleibt deutsch, nur die Anzeige wird übersetzt)
const BREEDS = [
  ['Berner Sennenhund', 'Berner Sennenhund', 'Bernese Mountain Dog'], ['Dackel', 'Gravhund', 'Dachshund'], ['Dalmatiner', 'Dalmatiner', 'Dalmatian'],
  ['Dänisch-Schwedischer Hofhund', 'Dansk-svensk gårdhund', 'Danish-Swedish Farmdog'], ['Deutsch Drahthaar', 'Ruhåret hønsehund', 'German Wirehaired Pointer'],
  ['Deutsch Kurzhaar', 'Korthåret hønsehund', 'German Shorthaired Pointer'], ['Deutscher Schäferhund', 'Schæferhund', 'German Shepherd'],
  ['Englische Bulldogge', 'Engelsk bulldog', 'English Bulldog'], ['Französische Bulldogge', 'Fransk bulldog', 'French Bulldog'],
  ['Herdenschutzhund', 'Hyrdehund', 'Livestock guardian dog'], ['Mops', 'Mops', 'Pug'], ['Neufundländer', 'Newfoundlandshund', 'Newfoundland'],
  ['Pudel', 'Puddel', 'Poodle'], ['Riesenschnauzer', 'Riesenschnauzer', 'Giant Schnauzer'], ['Spitz', 'Spids', 'Spitz'], ['Windhund', 'Mynde', 'Sighthound'],
  ['Zwergpinscher', 'Dværgpinscher', 'Miniature Pinscher'], ['Zwergpudel', 'Dværgpuddel', 'Miniature Poodle'], ['Zwergschnauzer', 'Dværgschnauzer', 'Miniature Schnauzer'],
  ['Zwergspitz', 'Dværgspids', 'Pomeranian'], ['Staffordshire Terrier', 'Staffordshire terrier', 'Staffordshire Terrier'],
];

// Texte mit Zahlen und Namen: [Muster, dänisch, englisch] – $1, $2 … werden ebenfalls übersetzt
const PATTERNS = [
  [/^(\d+) Runden? (rund um die Kartenmitte|in deiner Nähe)( \(gefiltert\))?$/, (m) => ({ da: `${m[1]} ${m[1] === '1' ? 'rute' : 'ruter'} ${m[2] === 'in deiner Nähe' ? 'i nærheden' : 'omkring kortets midte'}${m[3] ? ' (filtreret)' : ''}`, en: `${m[1]} ${m[1] === '1' ? 'route' : 'routes'} ${m[2] === 'in deiner Nähe' ? 'near you' : 'around the map centre'}${m[3] ? ' (filtered)' : ''}` })],
  [/^bittet um Abstand und ist (.+) entfernt\. Am besten Abstand halten oder einen anderen Weg nehmen\.$/, (m) => ({ da: `beder om afstand og er ${m[1]} væk. Hold afstand eller tag en anden vej.`, en: `asks for distance and is ${m[1]} away. Best keep your distance or take another path.` })],
  [/^(.*?) · (Gassirunde-Tipp|Hinzugefügt von .+|(?:Hundeauslauf|Wanderweg) · Daten: © OpenStreetMap-Mitwirkende)$/, (m) => ({ da: `${m[1]} · ${t(m[2])}`, en: `${m[1]} · ${t(m[2])}` })],
  [/^Beste Wahl: (.+)$/, (m) => ({ da: `Bedste valg: ${m[1]}`, en: `Best choice: ${m[1]}` })],
  [/^(.+ km) · ca\. (\d+) Min\.(?: · (.+))?$/, (m) => ({ da: `${m[1]} · ca. ${m[2]} min.${m[3] ? ' · ' + m[3].split(', ').map((x) => t(x)).join(', ') : ''}`, en: `${m[1]} · approx. ${m[2]} min${m[3] ? ' · ' + m[3].split(', ').map((x) => t(x)).join(', ') : ''}` })],
  [/^(\d\d\.\d\d\.\d\d) · Eigene Runde$/, (m) => ({ da: `${m[1]} · Egen rute`, en: `${m[1]} · Own route` })],
  [/^Weitere (\d+) anzeigen$/, (m) => ({ da: `Vis ${m[1]} mere`, en: `Show ${m[1]} more` })],
  [/^ca\. (\d+) Min\.$/, (m) => ({ da: `ca. ${m[1]} min.`, en: `approx. ${m[1]} min` })],
  [/^ca\. (\d+)$/, (m) => ({ da: `ca. ${m[1]}`, en: `approx. ${m[1]}` })],
  [/^(.+) entfernt$/, (m) => ({ da: `${m[1]} væk`, en: `${m[1]} away` })],
  [/^(.+) Luftlinie$/, (m) => ({ da: `${m[1]} i fugleflugt`, en: `${m[1]} as the crow flies` })],
  [/^(.+) von dir$/, (m) => ({ da: `${m[1]} fra dig`, en: `${m[1]} from you` })],
  [/^jetzt (.+)$/, (m) => ({ da: `nu ${t(m[1])}`, en: `now ${t(m[1])}` })],
  [/^(\d+) (Hund|Hunde) gerade dort$/, (m) => ({ da: `${m[1]} ${m[1] === '1' ? 'hund' : 'hunde'} der lige nu`, en: `${m[1]} ${m[1] === '1' ? 'dog' : 'dogs'} there now` })],
  [/^Minuten \((.+)\)$/, (m) => ({ da: `minutter (${t(m[1])})`, en: `minutes (${t(m[1])})` })],
  [/^Hinzugefügt von (.+)$/, (m) => ({ da: `Tilføjet af ${m[1]}`, en: `Added by ${m[1]}` })],
  [/^(Hundeauslauf|Wanderweg) · Daten: © OpenStreetMap-Mitwirkende$/, (m) => ({ da: `${t(m[1])} · Data: © OpenStreetMap-bidragydere`, en: `${t(m[1])} · Data: © OpenStreetMap contributors` })],
  [/^Mit dem Auto: (.+) · ca\. (.+)$/, (m) => ({ da: `I bil: ${m[1]} · ca. ${tt(m[2])}`, en: `By car: ${m[1]} · approx. ${tt(m[2])}` })],
  [/^Zu Fuß: (.+) · ca\. (.+)$/, (m) => ({ da: `Til fods: ${m[1]} · ca. ${tt(m[2])}`, en: `On foot: ${m[1]} · approx. ${tt(m[2])}` })],
  [/^Routenplaner gerade nicht erreichbar, Luftlinie (.+)\. „Navigation starten“ öffnet Google Maps\.$/, (m) => ({ da: `Ruteplanlæggeren svarer ikke lige nu, ${m[1]} i fugleflugt. „Start navigation“ åbner Google Maps.`, en: `Route planner not reachable right now, ${m[1]} as the crow flies. “Start navigation” opens Google Maps.` })],
  [/^(\d+) (Person|Personen) dabei$/, (m) => ({ da: `${m[1]} ${m[1] === '1' ? 'person' : 'personer'} med`, en: `${m[1]} ${m[1] === '1' ? 'person' : 'people'} going` })],
  [/^(\d+) neue (Nachricht|Nachrichten)$/, (m) => ({ da: `${m[1]} ${m[1] === '1' ? 'ny besked' : 'nye beskeder'}`, en: `${m[1]} new ${m[1] === '1' ? 'message' : 'messages'}` })],
  [/^Treffpunkt: Start der Runde(.*)$/, (m) => ({ da: `Mødested: rutens start${m[1].replace(/ von dir/, ' fra dig').replace(/vorgeschlagen von/, 'foreslået af')}`, en: `Meeting point: start of the route${m[1].replace(/ von dir/, ' from you').replace(/vorgeschlagen von/, 'suggested by')}` })],
  [/^von (.+)$/, (m) => ({ da: `af ${m[1]}`, en: `by ${m[1]}` })],
  [/^mit (.+)$/, (m) => ({ da: `med ${m[1]}`, en: `with ${m[1]}` })],
  [/^Runde: (.+)$/, (m) => ({ da: `Rute: ${m[1]}`, en: `Route: ${m[1]}` })],
  [/^Du läufst: (.+)$/, (m) => ({ da: `Du går: ${m[1]}`, en: `You’re walking: ${m[1]}` })],
  [/^Du hast (.+) gewunken\.$/, (m) => ({ da: `Du har vinket til ${m[1]}.`, en: `You waved to ${m[1]}.` })],
  [/^(.+) winkt dir: „(.+)“$/, (m) => ({ da: `${m[1].replace(/ mit /, ' med ')} vinker til dig: „${t(m[2])}“`, en: `${m[1].replace(/ mit /, ' with ')} waves to you: “${t(m[2])}”` })],
  [/^(.+) bittet um Abstand und ist (.+) entfernt\. Am besten Abstand halten oder einen anderen Weg nehmen\.$/, (m) => ({ da: `${m[1]} beder om afstand og er ${m[2]} væk. Hold afstand eller tag en anden vej.`, en: `${m[1]} asks for distance and is ${m[2]} away. Best keep your distance or take another path.` })],
  [/^ist (.+) entfernt und freut sich über Gesellschaft\.$/, (m) => ({ da: `er ${m[1]} væk og vil gerne have selskab.`, en: `is ${m[1]} away and would love some company.` })],
  [/^GPS-Genauigkeit ±(\d+) m$/, (m) => ({ da: `GPS-nøjagtighed ±${m[1]} m`, en: `GPS accuracy ±${m[1]} m` })],
  [/^Angemeldet als (.+)$/, (m) => ({ da: `Logget ind som ${m[1]}`, en: `Logged in as ${m[1]}` })],
  [/^Willkommen, (.+)! Dein Konto ist angelegt\.$/, (m) => ({ da: `Velkommen, ${m[1]}! Din konto er oprettet.`, en: `Welcome, ${m[1]}! Your account has been created.` })],
  [/^Hallo (.+), schön, dass du da bist\.$/, (m) => ({ da: `Hej ${m[1]}, godt du er her.`, en: `Hi ${m[1]}, nice to see you.` })],
  [/^Neue App-Version (.+) ist da\.$/, (m) => ({ da: `Ny appversion ${m[1]} er klar.`, en: `New app version ${m[1]} is available.` })],
  [/^App-Version (.+)\.$/, (m) => ({ da: `Appversion ${m[1]}.`, en: `App version ${m[1]}.` })],
  [/^(.+) km · (\d+) (Spaziergang|Spaziergänge)$/, (m) => ({ da: `${m[1]} km · ${m[2]} ${m[2] === '1' ? 'tur' : 'ture'}`, en: `${m[1]} km · ${m[2]} ${m[2] === '1' ? 'walk' : 'walks'}` })],
  [/^Berücksichtigt: (.*)$/, (m) => ({ da: `Tager højde for: ${m[1].replace(/erwachsener Hund|älterer Hund|Welpe/, (x) => t(x)).replace(/(\d+) Uhr, wer gerade live unterwegs ist und die Bewertungen anderer\./, 'kl. $1, hvem der er ude live, og andres bedømmelser.')}`, en: `Considers: ${m[1].replace(/erwachsener Hund|älterer Hund|Welpe/, (x) => t(x)).replace(/(\d+) Uhr, wer gerade live unterwegs ist und die Bewertungen anderer\./, '$1:00, who is out live and other people’s ratings.')}` })],
  [/^Rund um die Kartenmitte · (.+) · Stand (.+) Uhr$/, (m) => ({ da: `Omkring kortets midte · ${t(m[1])} · kl. ${m[2]}`, en: `Around the map centre · ${t(m[1])} · as of ${m[2]}` })],
  [/^An deinem Standort · (.+) · Stand (.+) Uhr$/, (m) => ({ da: `Ved din position · ${t(m[1])} · kl. ${m[2]}`, en: `At your location · ${t(m[1])} · as of ${m[2]}` })],
  [/^(\d+) Uhr$/, (m) => ({ da: `kl. ${m[1]}`, en: `${m[1]}:00` })],
  [/^Böen (\d+)$/, (m) => ({ da: `vindstød ${m[1]}`, en: `gusts ${m[1]}` })],
  [/^Vielleicht ein paar Tropfen \(bis (\d+) %\)\. Der kleine Schirm passt in die Jackentasche\.$/, (m) => ({ da: `Måske et par dråber (op til ${m[1]} %). Den lille paraply kan være i jakkelommen.`, en: `Maybe a few drops (up to ${m[1]} %). The small umbrella fits in your pocket.` })],
  [/^Gerade (.+)\. Kapuze auf, dem Hund ist das sowieso egal\.$/, (m) => ({ da: `Lige nu ${t(m[1])}. Hætten op, hunden er ligeglad alligevel.`, en: `Right now ${t(m[1])}. Hood up, the dog doesn’t care anyway.` })],
  [/^Sturmböen bis (\d+) km\/h: (.*)$/, (m) => ({ da: `Stormstød op til ${m[1]} km/t: Gå ikke i skoven i dag, grene kan knække. Hellere åben mark eller strand.`, en: `Gale-force gusts up to ${m[1]} km/h: please stay out of the forest today, branches can break. Better open fields or the beach.` })],
  [/^Ganz schön windig, Böen bis (\d+) km\/h\. (.*)$/, (m) => ({ da: `Ret blæsende, vindstød op til ${m[1]} km/t. Lad hundeørerne blafre, og pas på nedfaldende grene i skoven.`, en: `Pretty windy, gusts up to ${m[1]} km/h. Let the dog’s ears flap and watch for falling branches in the forest.` })],
  [/^Um (.+) geht die Sonne unter\. Leuchthalsband einpacken, falls die Runde länger wird\.$/, (m) => ({ da: `Solen går ned kl. ${m[1]}. Tag et lysende halsbånd med, hvis turen bliver længere.`, en: `The sun sets at ${m[1]}. Pack a light-up collar in case the walk gets longer.` })],
  [/^Bei (\d+) °C wird Asphalt heiß\. (.*)$/, (m) => ({ da: `Ved ${m[1]} °C bliver asfalt varm. Lav håndryg-testen: 7 sekunder mod jorden.`, en: `At ${m[1]} °C asphalt gets hot. Do the back-of-hand test: 7 seconds on the ground.` })],
  [/^Schatten \((\d+) %\)$/, (m) => ({ da: `Skygge (${m[1]} %)`, en: `Shade (${m[1]} %)` })],
  [/^(\d+) Straßen? zu queren$/, (m) => ({ da: `${m[1]} ${m[1] === '1' ? 'vej' : 'veje'} at krydse`, en: `${m[1]} ${m[1] === '1' ? 'road' : 'roads'} to cross` })],
  [/^passt zu deinen (\d+) Minuten \(ca\. (\d+) Min\.\)$/, (m) => ({ da: `passer til dine ${m[1]} minutter (ca. ${m[2]} min.)`, en: `fits your ${m[1]} minutes (approx. ${m[2]} min)` })],
  [/^von anderen mit (.+) Sternen bewertet$/, (m) => ({ da: `bedømt med ${m[1]} stjerner af andre`, en: `rated ${m[1]} stars by others` })],
  [/^Jetzt (.+?)(, (\d+) (Hund|Hunde) gerade auf der Runde|, gerade niemand live auf der Runde)\. Am ruhigsten gegen (\d+) Uhr\.$/, (m) => ({ da: `Nu ${t(m[1])}${m[3] ? `, ${m[3]} ${m[3] === '1' ? 'hund' : 'hunde'} på ruten lige nu` : ', ingen live på ruten lige nu'}. Roligst omkring kl. ${m[5]}.`, en: `Now ${t(m[1])}${m[3] ? `, ${m[3]} ${m[3] === '1' ? 'dog' : 'dogs'} on the route now` : ', nobody live on the route right now'}. Quietest around ${m[5]}:00.` })],
  [/^Jetzt (.+?)([,.]?)$/, (m) => ({ da: `Nu ${t(m[1])}${m[2]}`, en: `Now ${t(m[1])}${m[2]}` })],
  [/^(\d+) (Hund|Hunde) gerade auf der Runde$/, (m) => ({ da: `${m[1]} ${m[1] === '1' ? 'hund' : 'hunde'} på ruten lige nu`, en: `${m[1]} ${m[1] === '1' ? 'dog' : 'dogs'} on the route now` })],
  [/^, gerade niemand live auf der Runde\. Am ruhigsten gegen (\d+) Uhr\.$/, (m) => ({ da: `, ingen live på ruten lige nu. Roligst omkring kl. ${m[1]}.`, en: `, nobody live on the route right now. Quietest around ${m[1]}:00.` })],
  [/^\. Am ruhigsten gegen (\d+) Uhr\.$/, (m) => ({ da: `. Roligst omkring kl. ${m[1]}.`, en: `. Quietest around ${m[1]}:00.` })],
  [/^(\d+) (Jahr|Jahre)$/, (m) => ({ da: `${m[1]} år`, en: `${m[1]} ${m[1] === '1' ? 'year' : 'years'}` })],
  [/^vor (\d+) Sek\.$/, (m) => ({ da: `for ${m[1]} sek. siden`, en: `${m[1]} sec ago` })],
  [/^vor (\d+) Min\.$/, (m) => ({ da: `for ${m[1]} min. siden`, en: `${m[1]} min ago` })],
  [/^(\d+) Min\.$/, (m) => ({ da: `${m[1]} min.`, en: `${m[1]} min` })],
  [/^(\d+) Std\. (\d+) Min\.$/, (m) => ({ da: `${m[1]} t. ${m[2]} min.`, en: `${m[1]} h ${m[2]} min` })],
];

// Eingangstabelle aufbauen
const DICT = { da: new Map(), en: new Map() };
for (const [de, da, en] of [...ROWS, ...BREEDS]) { DICT.da.set(de, da); DICT.en.set(de, en); }

/** Ein deutscher Text in der aktuellen Sprache (unverändert, wenn unbekannt). */
export function t(s) {
  if (lang === 'de' || typeof s !== 'string') return s;
  const key = s.trim();
  if (!key) return s;
  const hit = DICT[lang].get(key);
  if (hit !== undefined) return s.replace(key, hit);
  for (const [re, fn] of PATTERNS) {
    const m = key.match(re);
    if (m) return s.replace(key, fn(m)[lang]);
  }
  // Zusammengesetzt aus Teilen mit „ · “: jeden Teil einzeln
  if (key.includes(' · ')) {
    const parts = key.split(' · ');
    const tr = parts.map((x) => t(x));
    if (tr.some((x, i) => x !== parts[i])) return s.replace(key, tr.join(' · '));
  }
  // Rassen-Angaben wie „Mischling (Labrador Retriever × Pudel) · 4 Jahre“
  if (/Mischling|Jahre?\b|unter 1 Jahr/.test(key) || BREEDS.some(([b]) => key.includes(b))) {
    let out = key.replace(/\b(\d+) Jahre?\b/g, (x, n) => (lang === 'da' ? `${n} år` : `${n} ${n === '1' ? 'year' : 'years'}`));
    for (const [de] of [...BREEDS, ['Mischling'], ['unter 1 Jahr']]) out = out.split(de).join(DICT[lang].get(de) || de);
    if (out !== key) return s.replace(key, out);
  }
  return s;
}
const tt = (s) => t(s); // für verschachtelte Muster

// ---------- Oberfläche automatisch übersetzen ----------
const done = new WeakMap(); // Textknoten -> zuletzt gesetzte Übersetzung
const ATTRS = ['placeholder', 'aria-label', 'title'];

function translateNode(n) {
  if (n.nodeType === 3) {
    if (done.get(n) === n.data) return;
    const p = n.parentNode;
    if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName) || p.closest?.('[data-no-i18n]')) return;
    const out = t(n.data);
    if (out !== n.data) n.data = out;
    done.set(n, n.data);
    return;
  }
  if (n.nodeType !== 1) return;
  if (n.matches?.('[data-no-i18n]')) return;
  for (const a of ATTRS) {
    const v = n.getAttribute?.(a);
    if (v) { const out = t(v); if (out !== v) n.setAttribute(a, out); }
  }
  for (const c of n.childNodes) translateNode(c);
}

export function startI18n() {
  document.documentElement.lang = lang;
  if (lang === 'de') return;
  const guide = document.querySelector('#info-dialog .info-scroll');
  if (guide && GUIDE[lang]) guide.innerHTML = GUIDE[lang];
  translateNode(document.body);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v) { const out = t(v); if (out !== v) m.target.setAttribute(m.attributeName, out); } }
      else for (const n of m.addedNodes) translateNode(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.title = 'Gassirunde';
}

// ---------- Anleitung je Sprache ----------
const GUIDE = {
  da: `
      <h2 id="info-title">Sådan virker Gassirunde</h2>
      <p class="info-lead">Optag ture med hunden, find gode stier, og se hvem der er ude lige nu: for at undgå hinanden eller gå sammen.</p>
      <details open><summary>Optag en tur</summary><ul>
        <li>Tryk på den <b>røde prik</b> nederst til højre. Den glider ud og viser „Start tur“. Et tryk mere starter optagelsen.</li>
        <li>Under optagelsen bliver prikken til en <b>stop-firkant</b>. Tryk også to gange for at afslutte, så intet stopper ved et uheld i lommen.</li>
        <li>Appen optager <b>også med slukket skærm</b>. I notifikationen ser du kilometer og tid.</li>
        <li>Med <b>Pause</b> afbryder du optagelsen uden en lige streg hen over pausen.</li>
        <li>Efter turen kan du <b>dele ruten med andre</b> eller kun gemme den for dig selv. Stedet udfyldes automatisk.</li>
        <li>Ruten begynder først der, hvor du trykker start. Starter eller slutter du ved døren, så vælg „<b>Forkort start og slut med 100 m</b>“, så ingen kan se, hvor du bor.</li>
      </ul></details>
      <details><summary>Find ruter</summary><ul>
        <li>Under <b>Ruter</b> står alle ruter i nærheden, de nærmeste først. Flytter du kortet, henter appen ruterne i det nye område.</li>
        <li><b>Filtrene</b> (skyggefuld, med vand, fri løb, hundeskov, længde) kan kombineres og virker også på kortet. Pilen › viser flere filtre.</li>
        <li>Hvor en rute kommer fra, står ovenover: <b>Gassirunde-tip</b>, <b>Fra fællesskabet</b>, <b>Hundeskov</b> eller <b>Vandresti</b> (begge fra OpenStreetMap). Hundeskove er grønne flader på kortet.</li>
        <li>Under <b>Find</b> fortæller du, hvor meget tid du har, og hvad der er vigtigt. Appen foreslår de tre bedste ruter ud fra vejret, din hunds alder og hvor travlt der er.</li>
        <li>Tryk på en rute for detaljer, afstand og <b>vej derhen</b> (bil eller til fods, eller navigation med Google Maps). Med „<b>Gå denne rute</b>“ vises den som stiplet linje, og optagelsen starter.</li>
        <li>Alle ruter kan få <b>1 til 5 stjerner</b>. Dine egne ruter kan du slette igen.</li>
      </ul></details>
      <details><summary>Hunde-scoren</summary>
        <p>Hver rute får 0 til 100 point for, hvor god den er for hunde:</p>
        <ul><li><b>Vand</b> undervejs (op til 20), <b>skygge</b> (op til 25), <b>underlag</b> skov og eng frem for asfalt (op til 20), få <b>veje</b> at krydse (op til 15), <b>fri løb</b> tilladt (op til 10), <b>skraldespande</b> til hømposer (op til 10).</li>
        <li>Det, der ikke er kendt, står som „ukendt“ og tæller middel. Dertil kommer råd om varme, frost, længde og kortsnudede racer.</li></ul>
      </details>
      <details><summary>Live: hvem er ude?</summary><ul>
        <li>Den, der deler sin position under turen, vises på kortet. Der er tre slags status:
          <span class="info-status"><i class="sdot offen"></i><b>Gerne sammen</b>: glad for selskab, du må gerne vinke.</span>
          <span class="info-status"><i class="sdot neutral"></i><b>På tur</b>: bare synlig, uden særligt ønske.</span>
          <span class="info-status"><i class="sdot abstand"></i><b>Hold afstand</b>: som den gule sløjfe på snoren. Kommer man nærmere end 150 m, advares man.</span></li>
        <li>Tryk på personer i listen eller på kortet for status, afstand, hund, sprog og rute. Med <b>Vink</b> sender du „Lyst til en tur sammen?“.</li>
        <li>Er nogen med „Gerne sammen“ nærmere end 300 m, viser appen en besked. Ved „Hold afstand“ under 150 m advarer den, også i baggrunden med vibration.</li>
      </ul></details>
      <details><summary>Mødes</summary><ul>
        <li>Åbn en rute og tryk på <b>Foreslå et møde</b>: dag, klokkeslæt og en note. Mødestedet er rutens start.</li>
        <li>Under <b>Mødes</b> ser du dine møder og møder i nærheden. Med „Jeg er med“ deltager du og kan skrive i <b>chatten</b>.</li>
      </ul></details>
      <details><summary>Vejret</summary><ul>
        <li>Tryk på <b>temperaturen</b> øverst: temperatur, regn og vind nu og de næste 3 timer, plus tips til turen.</li>
      </ul></details>
      <details><summary>Profil &amp; konto</summary><ul>
        <li>Øverst til højre: fornavn, hundens navn, <b>race</b> (blandinger med to racer), <b>alder</b>, de <b>sprog</b> du taler og <b>appens sprog</b> (dansk, tysk, engelsk).</li>
        <li>Under <b>Mine ture</b> finder du alle optagede ture. Du kan også skifte adgangskode, logge ud eller slette din konto.</li>
        <li><b>Demotilstand</b> simulerer GPS til at prøve ved skrivebordet.</li>
      </ul></details>
      <details><summary>Betjening</summary><ul>
        <li>Det <b>nederste vindue</b> gøres større eller mindre med den grå streg: tryk eller stryg. Under optagelsen bliver det til en smal bjælke.</li>
        <li><b>Sigtekornet</b> øverst viser din position. Tilbage-knappen lukker vinduer og detaljer.</li>
      </ul></details>
      <details><summary>Privatliv</summary><ul>
        <li>Andre ser kun dit <b>fornavn</b>, din hunds navn og dine sprog, samt race og alder hvis du tillader det. Din e-mail ser ingen.</li>
        <li>Din position deles kun <b>under en tur</b> og kun når kontakten er slået til. Den gemmes ikke og forsvinder efter 2 minutter uden signal.</li>
      </ul></details>
      <details><summary>Tips til telefonen</summary><ul>
        <li>Stopper optagelsen i baggrunden, så fjern Gassirunde fra batterioptimering: Indstillinger → Apps → Gassirunde → Batteri → „Ingen begrænsning“.</li>
      </ul></details>
      <p class="hint info-credits">Kort og ruter: © OpenStreetMap-bidragydere (ODbL), kortstil HOT. Vejr: Open-Meteo. <span id="info-version"></span></p>`,
  en: `
      <h2 id="info-title">How Gassirunde works</h2>
      <p class="info-lead">Record walks with your dog, find good paths and see who is out right now: to avoid each other or to walk together.</p>
      <details open><summary>Record a walk</summary><ul>
        <li>Tap the <b>red dot</b> at the bottom right. It slides out and shows “Start walk”. A second tap starts recording.</li>
        <li>While recording, the dot becomes a <b>stop square</b>. Tap twice to end as well, so nothing stops by accident in your pocket.</li>
        <li>The app keeps recording <b>even with the screen off</b>. The notification shows kilometres and time.</li>
        <li><b>Pause</b> interrupts recording without drawing a straight line across the pause.</li>
        <li>After the walk you can <b>share the route</b> or save it just for yourself. The place is filled in automatically.</li>
        <li>The route only starts where you tap start. If you start or end at your door, choose “<b>Trim start and end by 100 m</b>” so nobody can see where you live.</li>
      </ul></details>
      <details><summary>Find routes</summary><ul>
        <li><b>Routes</b> lists all routes nearby, closest first. Move the map and the app loads the routes of the new area.</li>
        <li><b>Filters</b> (shady, with water, off-leash, dog park, length) can be combined and also apply to the map. The arrow › shows more filters.</li>
        <li>Where a route comes from is shown above it: <b>Gassirunde tip</b>, <b>From the community</b>, <b>Dog park</b> or <b>Hiking trail</b> (both from OpenStreetMap). Dog parks are green areas on the map.</li>
        <li>In <b>Find</b> you say how much time you have and what matters. The app suggests the three best routes based on weather, your dog’s age and how busy it is.</li>
        <li>Tap a route for details, distance and <b>directions</b> (car or on foot, or navigation with Google Maps). “<b>Walk this route</b>” shows it as a dotted line and starts recording.</li>
        <li>Every route can be rated with <b>1 to 5 stars</b>. You can delete your own routes.</li>
      </ul></details>
      <details><summary>The dog score</summary>
        <p>Every route gets 0 to 100 points for how good it is for dogs:</p>
        <ul><li><b>Water</b> along the way (up to 20), <b>shade</b> (up to 25), <b>surface</b> forest and meadow instead of asphalt (up to 20), few <b>roads</b> to cross (up to 15), <b>off-leash</b> allowed (up to 10), <b>bins</b> for poo bags (up to 10).</li>
        <li>Anything unknown shows as “unknown” and counts as medium. Plus hints on heat, frost, length and short-nosed breeds.</li></ul>
      </details>
      <details><summary>Live: who is out?</summary><ul>
        <li>Anyone who shares their position during a walk appears on the map. There are three statuses:
          <span class="info-status"><i class="sdot offen"></i><b>Happy to join</b>: glad of company, you may wave.</span>
          <span class="info-status"><i class="sdot neutral"></i><b>Out walking</b>: just visible, no particular wish.</span>
          <span class="info-status"><i class="sdot abstand"></i><b>Please keep distance</b>: like the yellow ribbon on the leash. Anyone closer than 150 m is warned.</span></li>
        <li>Tap people in the list or on the map for status, distance, dog, languages and route. <b>Wave</b> sends “Fancy a walk together?”.</li>
        <li>If someone with “Happy to join” is within 300 m, the app shows a hint. For “Please keep distance” under 150 m it warns you, also in the background with vibration.</li>
      </ul></details>
      <details><summary>Meetups</summary><ul>
        <li>Open a route and tap <b>Suggest a meetup</b>: day, time and a note. The meeting point is the start of the route.</li>
        <li><b>Meetups</b> shows your meetups and those nearby. With “I’m in” you join and can write in the <b>chat</b>.</li>
      </ul></details>
      <details><summary>Weather</summary><ul>
        <li>Tap the <b>temperature</b> at the top: temperature, rain and wind now and for the next 3 hours, plus tips for your walk.</li>
      </ul></details>
      <details><summary>Profile &amp; account</summary><ul>
        <li>Top right: first name, dog’s name, <b>breed</b> (mixed breeds with two breeds), <b>age</b>, the <b>languages</b> you speak and the <b>app language</b> (English, German, Danish).</li>
        <li><b>My walks</b> lists all recorded walks. You can also change your password, log out or delete your account.</li>
        <li><b>Demo mode</b> simulates GPS to try the app at your desk.</li>
      </ul></details>
      <details><summary>Controls</summary><ul>
        <li>The <b>bottom panel</b> can be enlarged or shrunk with the grey bar: tap or swipe. While recording it becomes a slim bar.</li>
        <li>The <b>target button</b> at the top shows your location. The back button closes windows and details.</li>
      </ul></details>
      <details><summary>Privacy</summary><ul>
        <li>Others only see your <b>first name</b>, your dog’s name and your languages, plus breed and age if you allow it. Nobody sees your email.</li>
        <li>Your position is only shared <b>during a walk</b> and only when the switch is on. It isn’t stored and disappears after 2 minutes without signal.</li>
      </ul></details>
      <details><summary>Phone tips</summary><ul>
        <li>If recording stops in the background, exclude Gassirunde from battery optimisation: Settings → Apps → Gassirunde → Battery → “Unrestricted”.</li>
      </ul></details>
      <p class="hint info-credits">Maps and routes: © OpenStreetMap contributors (ODbL), map style HOT. Weather: Open-Meteo. <span id="info-version"></span></p>`,
};
