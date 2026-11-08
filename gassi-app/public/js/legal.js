// Rechtliche Texte der Gassirunde: Impressum, Datenschutz, Nutzungsbedingungen, Lizenzen.
// Eine Quelle für das Fenster in der App und für die eigene Seite rechtliches.html (später: Website der App).
// Platzhalter in <span class="todo">…</span> vor der Veröffentlichung ausfüllen.

export const LEGAL_STAND = '2026-11-08';

const C = {
  firm: 'Wunsch-Fabrik',
  owner: '<span class="todo">[Name des Inhabers]</span>',
  street: 'Teglgård 1, Vilsbæk',
  city: '6330 Padborg',
  mail: '<a href="mailto:hej@wunsch-fabrik.dk">hej@wunsch-fabrik.dk</a>',
  cvr: '<span class="todo">[CVR-Nummer]</span>',
  web: '<a href="https://www.wunsch-fabrik.dk" target="_blank" rel="noopener">www.wunsch-fabrik.dk</a>',
};

export const LEGAL_TITLES = {
  de: { impressum: 'Impressum', datenschutz: 'Datenschutz', nutzung: 'Nutzungsbedingungen', lizenzen: 'Lizenzen & Quellen', heading: 'Rechtliches', stand: 'Stand' },
  da: { impressum: 'Kolofon', datenschutz: 'Privatlivspolitik', nutzung: 'Vilkår for brug', lizenzen: 'Licenser og kilder', heading: 'Juridisk', stand: 'Opdateret' },
  en: { impressum: 'Legal notice', datenschutz: 'Privacy policy', nutzung: 'Terms of use', lizenzen: 'Licences & sources', heading: 'Legal', stand: 'Last updated' },
};

const SERVICES = {
  de: [
    ['Kartenkacheln', 'OpenStreetMap France (tile.openstreetmap.fr), Kartenstil Humanitarian/HOT', 'IP-Adresse und der angezeigte Kartenausschnitt'],
    ['Weg zur Runde', 'FOSSGIS e. V. (routing.openstreetmap.de)', 'IP-Adresse, dein Standort und der Start der Runde – nur wenn du bei einer Runde „Weg dorthin“ antippst'],
    ['Ortsname beim Speichern', 'OpenStreetMap Foundation (nominatim.openstreetmap.org)', 'IP-Adresse und der Startpunkt deines Spaziergangs'],
    ['Wetter', 'Open-Meteo (api.open-meteo.com)', 'IP-Adresse und dein Standort, auf etwa 100 m gerundet'],
    ['Navigation', 'Google Maps (Google Ireland Ltd.)', 'Nur wenn du „Navigation starten“ antippst; dann gelten die Bestimmungen von Google'],
  ],
  da: [
    ['Kortfliser', 'OpenStreetMap France (tile.openstreetmap.fr), kortstil Humanitarian/HOT', 'IP-adresse og det viste kortudsnit'],
    ['Vej til ruten', 'FOSSGIS e. V. (routing.openstreetmap.de)', 'IP-adresse, din position og rutens start – kun når du trykker på „Vejen derhen“ ved en rute'],
    ['Stednavn ved gemning', 'OpenStreetMap Foundation (nominatim.openstreetmap.org)', 'IP-adresse og startpunktet for din gåtur'],
    ['Vejr', 'Open-Meteo (api.open-meteo.com)', 'IP-adresse og din position, afrundet til ca. 100 m'],
    ['Navigation', 'Google Maps (Google Ireland Ltd.)', 'Kun når du trykker på „Start navigation“; så gælder Googles vilkår'],
  ],
  en: [
    ['Map tiles', 'OpenStreetMap France (tile.openstreetmap.fr), Humanitarian/HOT map style', 'IP address and the map area shown'],
    ['Route to the walk', 'FOSSGIS e. V. (routing.openstreetmap.de)', 'IP address, your location and the start of the walk – only when you tap “Route there” on a walk'],
    ['Place name when saving', 'OpenStreetMap Foundation (nominatim.openstreetmap.org)', 'IP address and the starting point of your walk'],
    ['Weather', 'Open-Meteo (api.open-meteo.com)', 'IP address and your location, rounded to about 100 m'],
    ['Navigation', 'Google Maps (Google Ireland Ltd.)', 'Only when you tap “Start navigation”; Google’s terms then apply'],
  ],
};
const table = (l, head) => `<table class="legal-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${
  SERVICES[l].map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

const address = `${C.firm}<br>${C.owner}<br>${C.street}<br>${C.city}`;

const TEXT = {
  // ---------------------------------------------------------------- Deutsch
  de: {
    impressum: `
<p>${address}<br>Dänemark</p>
<p>E-Mail: ${C.mail}<br>CVR-Nr.: ${C.cvr}<br>Web: ${C.web}</p>
<p>Verantwortlich für den Inhalt: ${C.owner}, Anschrift wie oben.</p>
<h4>Inhalte von Nutzern</h4>
<p>Runden, Bewertungen, Treffen und Chat-Nachrichten stammen von den Nutzerinnen und Nutzern. Wir prüfen sie nicht vorab. Hinweise auf rechtswidrige Inhalte bitte an ${C.mail} – wir entfernen sie umgehend.</p>
<h4>Streitbeilegung</h4>
<p>Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>`,

    datenschutz: `
<p>Gassirunde soll beim Gassigehen helfen – nicht Daten sammeln. Hier steht, welche Daten die App verarbeitet, wozu und wie lange.</p>
<h4>1. Verantwortlich</h4>
<p>${address}, Dänemark · ${C.mail}</p>
<h4>2. Ohne Konto</h4>
<p>Du kannst Runden und die Karte ohne Konto ansehen. Dabei werden keine persönlichen Daten auf unserem Server gespeichert. Der Webserver verarbeitet technisch deine IP-Adresse, um die Seite auszuliefern. Einstellungen wie die Sprache speichert die App nur auf deinem Gerät.</p>
<h4>3. Konto</h4>
<p>Für ein Konto speichern wir E-Mail-Adresse, Anzeigename und dein Passwort – nur als nicht umkehrbaren Hash. Freiwillig: Name, Rasse und Alter deines Hundes, deine Sprachen. Ob andere Rasse und Alter sehen, entscheidest du im Profil. Zur Anmeldung setzen wir ein technisch notwendiges Cookie (gassi_session, 60 Tage). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Nutzung der App).</p>
<h4>4. Standort und Spaziergänge</h4>
<ul>
<li><b>Aufzeichnung:</b> Während du einen Spaziergang aufzeichnest, nutzt die App deinen Standort, auch im Hintergrund (Hinweis in der Benachrichtigungsleiste). Ohne Aufnahme läuft keine Ortung im Hintergrund.</li>
<li><b>Gespeicherte Spaziergänge</b> (Datum, Strecke, Zeit, Weg) liegen in deinem Konto. Eine Runde wird nur öffentlich, wenn du sie ausdrücklich teilst.</li>
<li><b>Live-Karte:</b> Nur während eines Spaziergangs und nur, wenn „Meine Position während des Spaziergangs teilen“ an ist, sehen angemeldete Nutzer in der Nähe deinen ungefähren Standort, deinen Status, Anzeigename und Hund. Der Server hält nur die letzte Position; ohne neues Signal verschwindet sie nach 2 Minuten, beim Ausschalten sofort.</li>
</ul>
<p>Rechtsgrundlage: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du über die Standort-Berechtigung und diesen Schalter jederzeit zurücknehmen kannst.</p>
<h4>5. Bewertungen, Treffen und Chat</h4>
<p>Bewertungen erscheinen mit deinem Anzeigenamen. Treffen und Chat-Nachrichten sehen nur die Teilnehmenden. Treffen samt Chat löschen wir automatisch 30 Tage nach dem Termin. „Winken“ wird nach spätestens 10 Minuten gelöscht.</p>
<h4>6. Sicherheit</h4>
<p>Gegen das Erraten von Passwörtern merken wir uns fehlgeschlagene Anmeldungen je IP-Adresse für 15 Minuten (Art. 6 Abs. 1 lit. f DSGVO, berechtigtes Interesse an einem sicheren Dienst). Die Verbindung ist verschlüsselt (HTTPS).</p>
<h4>7. Dienste anderer Anbieter</h4>
<p>Für einzelne Funktionen ruft die App Dienste auf, die dabei technisch deine IP-Adresse erhalten:</p>
${table('de', ['Funktion', 'Anbieter', 'Übermittelt'])}
<p>Es gibt keine Werbung, kein Tracking und keine Analyse-Werkzeuge. Wir verkaufen keine Daten.</p>
<h4>8. Hosting</h4>
<p>Server und Datenbank liegen bei one.com Group AB bzw. deren Rechenzentren in der EU (Auftragsverarbeitung nach Art. 28 DSGVO).</p>
<h4>9. Speicherdauer</h4>
<p>Kontodaten, Spaziergänge, geteilte Runden und Bewertungen speichern wir, bis du sie oder dein Konto löschst. Beim Löschen des Kontos (Profil → „Konto löschen“) entfernen wir alles sofort.</p>
<h4>10. Deine Rechte</h4>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie auf Widerruf einer Einwilligung mit Wirkung für die Zukunft. Schreib uns an ${C.mail}. Du kannst dich auch bei einer Aufsichtsbehörde beschweren, z. B. bei der dänischen Datatilsynet (<a href="https://www.datatilsynet.dk" target="_blank" rel="noopener">datatilsynet.dk</a>).</p>
<h4>11. Alter</h4>
<p>Gassirunde richtet sich an Personen ab 16 Jahren.</p>`,

    nutzung: `
<h4>1. Die App</h4>
<p>Gassirunde ist ein kostenloses Angebot der ${C.firm}. Es befindet sich in Entwicklung; Funktionen können sich ändern oder wegfallen.</p>
<h4>2. Unterwegs</h4>
<p>Runden, Hunde-Score, Wetter und Wege sind Hinweise ohne Gewähr. Wege können gesperrt, Leinen- und Betretungsregeln anders sein. Achte vor Ort auf Schilder, Verkehr, Wetter und die Regeln für Hunde. Du bist für dich und deinen Hund selbst verantwortlich.</p>
<h4>3. Begegnungen</h4>
<p>Status wie „Bitte Abstand“ sind Wünsche anderer – respektiere sie. Bei Treffen mit fremden Personen gelten die üblichen Vorsichtsregeln; die App prüft niemanden.</p>
<h4>4. Deine Inhalte</h4>
<p>Für Runden, Bewertungen und Nachrichten bist du verantwortlich. Nicht erlaubt: Beleidigungen, falsche oder gefährliche Angaben, Werbung, Inhalte, die Rechte anderer verletzen. Mit dem Teilen einer Runde erlaubst du, dass wir sie in der App anzeigen. Verstöße können wir löschen und Konten sperren.</p>
<h4>5. Haftung</h4>
<p>Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit. Im Übrigen ist die Haftung für das kostenlose Angebot ausgeschlossen, soweit gesetzlich zulässig.</p>
<h4>6. Kündigung</h4>
<p>Du kannst dein Konto jederzeit im Profil löschen.</p>
<h4>7. Recht</h4>
<p>Es gilt dänisches Recht. Zwingende Verbraucherschutzvorschriften deines Wohnsitzlandes bleiben unberührt.</p>`,

    lizenzen: `
<ul>
<li><b>Karten- und Rundendaten:</b> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-Mitwirkende</a>, verfügbar unter der Open Database License (ODbL). Hundeauslaufflächen und Wanderwege stammen aus OpenStreetMap und wurden für die App aufbereitet.</li>
<li><b>Kartenstil:</b> Humanitarian (<a href="https://www.hotosm.org/" target="_blank" rel="noopener">HOT</a>), Kacheln von OpenStreetMap France.</li>
<li><b>Wege:</b> OSRM über FOSSGIS e. V. (routing.openstreetmap.de).</li>
<li><b>Ortsnamen:</b> Nominatim, OpenStreetMap Foundation.</li>
<li><b>Wetter:</b> <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>, CC BY 4.0.</li>
<li><b>Kartenbibliothek:</b> <a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a>, BSD-2-Clause.</li>
<li><b>Schriften:</b> Barlow Condensed und Atkinson Hyperlegible, SIL Open Font License.</li>
</ul>`,
  },

  // ---------------------------------------------------------------- Dansk
  da: {
    impressum: `
<p>${address}<br>Danmark</p>
<p>E-mail: ${C.mail}<br>CVR-nr.: ${C.cvr}<br>Web: ${C.web}</p>
<p>Ansvarlig for indholdet: ${C.owner}, adresse som ovenfor.</p>
<h4>Brugernes indhold</h4>
<p>Ruter, anmeldelser, aftaler og chatbeskeder kommer fra brugerne. Vi kontrollerer dem ikke på forhånd. Henvendelser om ulovligt indhold sendes til ${C.mail} – vi fjerner det straks.</p>
<h4>Tvistløsning</h4>
<p>Vi er ikke forpligtet til og deltager ikke i tvistløsning ved et klagenævn for forbrugere.</p>`,

    datenschutz: `
<p>Gassirunde skal hjælpe dig på gåturen med hunden – ikke indsamle data. Her kan du se, hvilke data appen behandler, hvorfor og hvor længe.</p>
<h4>1. Dataansvarlig</h4>
<p>${address}, Danmark · ${C.mail}</p>
<h4>2. Uden konto</h4>
<p>Du kan se ruter og kortet uden konto. Der gemmes ingen personoplysninger på vores server. Webserveren behandler teknisk din IP-adresse for at levere siden. Indstillinger som sprog gemmer appen kun på din enhed.</p>
<h4>3. Konto</h4>
<p>Til en konto gemmer vi e-mailadresse, visningsnavn og din adgangskode – kun som en ikke-reversibel hash. Frivilligt: din hunds navn, race og alder samt dine sprog. Om andre kan se race og alder, bestemmer du i profilen. Til login bruger vi en teknisk nødvendig cookie (gassi_session, 60 dage). Retsgrundlag: GDPR art. 6, stk. 1, litra b (brug af appen).</p>
<h4>4. Position og gåture</h4>
<ul>
<li><b>Optagelse:</b> Mens du optager en gåtur, bruger appen din position, også i baggrunden (vises i notifikationslinjen). Uden optagelse sker der ingen positionering i baggrunden.</li>
<li><b>Gemte gåture</b> (dato, strækning, tid, rute) ligger på din konto. En rute bliver kun offentlig, hvis du udtrykkeligt deler den.</li>
<li><b>Live-kort:</b> Kun under en gåtur og kun når „Del min position under turen“ er slået til, kan loggede brugere i nærheden se din omtrentlige position, status, visningsnavn og hund. Serveren gemmer kun den seneste position; uden nyt signal forsvinder den efter 2 minutter, ved slukning med det samme.</li>
</ul>
<p>Retsgrundlag: dit samtykke (GDPR art. 6, stk. 1, litra a), som du til enhver tid kan trække tilbage via positionstilladelsen og denne kontakt.</p>
<h4>5. Anmeldelser, aftaler og chat</h4>
<p>Anmeldelser vises med dit visningsnavn. Aftaler og chatbeskeder kan kun deltagerne se. Aftaler inkl. chat slettes automatisk 30 dage efter tidspunktet. „Vink“ slettes senest efter 10 minutter.</p>
<h4>6. Sikkerhed</h4>
<p>For at forhindre gætteri af adgangskoder gemmer vi mislykkede login pr. IP-adresse i 15 minutter (GDPR art. 6, stk. 1, litra f, legitim interesse i en sikker tjeneste). Forbindelsen er krypteret (HTTPS).</p>
<h4>7. Tjenester fra andre udbydere</h4>
<p>Til enkelte funktioner kalder appen tjenester, som teknisk modtager din IP-adresse:</p>
${table('da', ['Funktion', 'Udbyder', 'Overføres'])}
<p>Der er ingen reklamer, ingen sporing og ingen analyseværktøjer. Vi sælger ingen data.</p>
<h4>8. Hosting</h4>
<p>Server og database ligger hos one.com Group AB og deres datacentre i EU (databehandling efter GDPR art. 28).</p>
<h4>9. Opbevaring</h4>
<p>Kontodata, gåture, delte ruter og anmeldelser gemmer vi, indtil du sletter dem eller din konto. Når du sletter kontoen (Profil → „Slet konto“), fjerner vi alt med det samme.</p>
<h4>10. Dine rettigheder</h4>
<p>Du har ret til indsigt, berigtigelse, sletning, begrænsning, dataportabilitet og indsigelse samt til at trække et samtykke tilbage med virkning for fremtiden. Skriv til ${C.mail}. Du kan også klage til Datatilsynet (<a href="https://www.datatilsynet.dk" target="_blank" rel="noopener">datatilsynet.dk</a>).</p>
<h4>11. Alder</h4>
<p>Gassirunde henvender sig til personer fra 16 år.</p>`,

    nutzung: `
<h4>1. Appen</h4>
<p>Gassirunde er et gratis tilbud fra ${C.firm}. Appen er under udvikling; funktioner kan ændres eller udgå.</p>
<h4>2. På tur</h4>
<p>Ruter, hunde-score, vejr og veje er vejledende og uden garanti. Stier kan være lukkede, og regler for snor og adgang kan være anderledes. Hold øje med skilte, trafik, vejr og regler for hunde. Du har selv ansvaret for dig og din hund.</p>
<h4>3. Møder</h4>
<p>Status som „Hold afstand“ er andres ønsker – respekter dem. Ved møder med fremmede gælder de sædvanlige forsigtighedsregler; appen kontrollerer ingen.</p>
<h4>4. Dit indhold</h4>
<p>Du er ansvarlig for ruter, anmeldelser og beskeder. Ikke tilladt: fornærmelser, forkerte eller farlige oplysninger, reklame og indhold, der krænker andres rettigheder. Når du deler en rute, giver du os lov til at vise den i appen. Overtrædelser kan slettes og konti spærres.</p>
<h4>5. Ansvar</h4>
<p>Vi hæfter ubegrænset ved forsæt og grov uagtsomhed samt ved skade på liv, legeme eller helbred. I øvrigt er ansvaret for det gratis tilbud udelukket, så vidt loven tillader det.</p>
<h4>6. Opsigelse</h4>
<p>Du kan til enhver tid slette din konto i profilen.</p>
<h4>7. Lovvalg</h4>
<p>Dansk ret gælder. Ufravigelige forbrugerregler i dit bopælsland berøres ikke.</p>`,

    lizenzen: `
<ul>
<li><b>Kort- og rutedata:</b> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap-bidragydere</a>, tilgængelig under Open Database License (ODbL). Hundeskove og vandrestier kommer fra OpenStreetMap og er bearbejdet til appen.</li>
<li><b>Kortstil:</b> Humanitarian (<a href="https://www.hotosm.org/" target="_blank" rel="noopener">HOT</a>), fliser fra OpenStreetMap France.</li>
<li><b>Veje:</b> OSRM via FOSSGIS e. V. (routing.openstreetmap.de).</li>
<li><b>Stednavne:</b> Nominatim, OpenStreetMap Foundation.</li>
<li><b>Vejr:</b> <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>, CC BY 4.0.</li>
<li><b>Kortbibliotek:</b> <a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a>, BSD-2-Clause.</li>
<li><b>Skrifttyper:</b> Barlow Condensed og Atkinson Hyperlegible, SIL Open Font License.</li>
</ul>`,
  },

  // ---------------------------------------------------------------- English
  en: {
    impressum: `
<p>${address}<br>Denmark</p>
<p>Email: ${C.mail}<br>CVR no.: ${C.cvr}<br>Web: ${C.web}</p>
<p>Responsible for content: ${C.owner}, address as above.</p>
<h4>User content</h4>
<p>Walks, ratings, meetups and chat messages come from users. We do not check them in advance. Please report unlawful content to ${C.mail} – we will remove it promptly.</p>
<h4>Dispute resolution</h4>
<p>We are neither obliged nor willing to take part in dispute resolution proceedings before a consumer arbitration board.</p>`,

    datenschutz: `
<p>Gassirunde is meant to help with dog walks – not to collect data. This page explains which data the app processes, why and for how long.</p>
<h4>1. Controller</h4>
<p>${address}, Denmark · ${C.mail}</p>
<h4>2. Without an account</h4>
<p>You can browse walks and the map without an account. No personal data is stored on our server. The web server technically processes your IP address to deliver the page. Settings such as the language are stored only on your device.</p>
<h4>3. Account</h4>
<p>For an account we store your email address, display name and password – only as a non-reversible hash. Optional: your dog’s name, breed and age, and the languages you speak. You decide in your profile whether others see breed and age. For login we set a strictly necessary cookie (gassi_session, 60 days). Legal basis: Art. 6(1)(b) GDPR (use of the app).</p>
<h4>4. Location and walks</h4>
<ul>
<li><b>Recording:</b> While you record a walk, the app uses your location, also in the background (shown in the notification bar). Without a recording there is no background location.</li>
<li><b>Saved walks</b> (date, distance, time, path) are kept in your account. A walk only becomes public if you explicitly share it.</li>
<li><b>Live map:</b> Only during a walk and only when “Share my position during the walk” is on, signed-in users nearby see your approximate location, status, display name and dog. The server keeps only your latest position; without a new signal it disappears after 2 minutes, immediately when switched off.</li>
</ul>
<p>Legal basis: your consent (Art. 6(1)(a) GDPR), which you can withdraw at any time via the location permission and this switch.</p>
<h4>5. Ratings, meetups and chat</h4>
<p>Ratings are shown with your display name. Meetups and chat messages are visible only to participants. Meetups including chat are deleted automatically 30 days after the meetup date. “Waves” are deleted after 10 minutes at the latest.</p>
<h4>6. Security</h4>
<p>To prevent password guessing we remember failed logins per IP address for 15 minutes (Art. 6(1)(f) GDPR, legitimate interest in a secure service). The connection is encrypted (HTTPS).</p>
<h4>7. Third-party services</h4>
<p>For some features the app calls services that technically receive your IP address:</p>
${table('en', ['Feature', 'Provider', 'Data sent'])}
<p>There are no ads, no tracking and no analytics tools. We do not sell data.</p>
<h4>8. Hosting</h4>
<p>Server and database are hosted by one.com Group AB in data centres in the EU (processing under Art. 28 GDPR).</p>
<h4>9. Retention</h4>
<p>Account data, walks, shared walks and ratings are kept until you delete them or your account. When you delete your account (Profile → “Delete account”), everything is removed immediately.</p>
<h4>10. Your rights</h4>
<p>You have the right of access, rectification, erasure, restriction, data portability and objection, and to withdraw consent with effect for the future. Write to ${C.mail}. You can also lodge a complaint with a supervisory authority, e.g. the Danish Datatilsynet (<a href="https://www.datatilsynet.dk" target="_blank" rel="noopener">datatilsynet.dk</a>).</p>
<h4>11. Age</h4>
<p>Gassirunde is intended for people aged 16 and over.</p>`,

    nutzung: `
<h4>1. The app</h4>
<p>Gassirunde is a free service by ${C.firm}. It is under development; features may change or be discontinued.</p>
<h4>2. Out and about</h4>
<p>Walks, dog score, weather and directions are guidance without guarantee. Paths may be closed and leash or access rules may differ. Watch for signs, traffic, weather and rules for dogs. You are responsible for yourself and your dog.</p>
<h4>3. Encounters</h4>
<p>Statuses such as “Please keep distance” are other people’s wishes – respect them. Usual precautions apply when meeting strangers; the app does not vet anyone.</p>
<h4>4. Your content</h4>
<p>You are responsible for walks, ratings and messages you post. Not allowed: insults, false or dangerous information, advertising, content that infringes others’ rights. By sharing a walk you allow us to show it in the app. We may delete violations and suspend accounts.</p>
<h4>5. Liability</h4>
<p>We are fully liable for intent and gross negligence and for injury to life, body or health. Otherwise liability for this free service is excluded to the extent permitted by law.</p>
<h4>6. Termination</h4>
<p>You can delete your account in your profile at any time.</p>
<h4>7. Governing law</h4>
<p>Danish law applies. Mandatory consumer protection rules of your country of residence remain unaffected.</p>`,

    lizenzen: `
<ul>
<li><b>Map and walk data:</b> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>, available under the Open Database License (ODbL). Dog parks and hiking trails come from OpenStreetMap and were processed for the app.</li>
<li><b>Map style:</b> Humanitarian (<a href="https://www.hotosm.org/" target="_blank" rel="noopener">HOT</a>), tiles by OpenStreetMap France.</li>
<li><b>Directions:</b> OSRM via FOSSGIS e. V. (routing.openstreetmap.de).</li>
<li><b>Place names:</b> Nominatim, OpenStreetMap Foundation.</li>
<li><b>Weather:</b> <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>, CC BY 4.0.</li>
<li><b>Map library:</b> <a href="https://leafletjs.com/" target="_blank" rel="noopener">Leaflet</a>, BSD-2-Clause.</li>
<li><b>Fonts:</b> Barlow Condensed and Atkinson Hyperlegible, SIL Open Font License.</li>
</ul>`,
  },
};

export const LEGAL_SECTIONS = ['impressum', 'datenschutz', 'nutzung', 'lizenzen'];

/** HTML eines Abschnitts in der gewünschten Sprache (Deutsch als Rückfall). */
export function legalHtml(lang, section) {
  const l = TEXT[lang] ? lang : 'de';
  return TEXT[l][section] || '';
}
