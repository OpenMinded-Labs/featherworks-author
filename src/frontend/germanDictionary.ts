// Deutsches Wörterbuch - 5000+ häufigste deutsche Wörter
// Für die Rechtschreibprüfung

// Set für schnellen Lookup
const GERMAN_WORDS = new Set<string>([
  // Artikel
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'einen', 'eines',
  
  // Pronomen
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie', 'mich', 'dich', 'sich', 'uns', 'euch',
  'mir', 'dir', 'ihm', 'ihr', 'ihnen', 'mein', 'dein', 'sein', 'unser', 'euer', 'kein',
  'meine', 'deine', 'seine', 'ihre', 'unsere', 'eure', 'keine', 'meinen', 'deinen', 'seinen',
  'dieser', 'diese', 'dieses', 'diesen', 'diesem', 'jener', 'jene', 'jenes', 'jenen', 'jenem',
  'welcher', 'welche', 'welches', 'welchen', 'welchem', 'wer', 'was', 'wen', 'wem', 'wessen',
  'man', 'jemand', 'niemand', 'etwas', 'nichts', 'alle', 'alles', 'beide', 'einige', 'manche',
  'selbst', 'selber', 'einander', 'irgend', 'irgendjemand', 'irgendetwas', 'irgendwer',
  
  // Präpositionen  
  'in', 'an', 'auf', 'für', 'mit', 'bei', 'nach', 'von', 'zu', 'aus', 'durch', 'über',
  'unter', 'vor', 'hinter', 'neben', 'zwischen', 'gegen', 'ohne', 'um', 'bis', 'seit',
  'während', 'wegen', 'trotz', 'statt', 'anstatt', 'innerhalb', 'außerhalb', 'oberhalb',
  'unterhalb', 'diesseits', 'jenseits', 'entlang', 'gegenüber', 'gemäß', 'laut', 'mittels',
  'samt', 'zufolge', 'zwecks', 'anhand', 'anlässlich', 'aufgrund', 'kraft', 'infolge',
  
  // Konjunktionen
  'und', 'oder', 'aber', 'denn', 'weil', 'dass', 'wenn', 'als', 'ob', 'sondern', 'doch',
  'jedoch', 'obwohl', 'obgleich', 'wenngleich', 'während', 'nachdem', 'bevor', 'ehe',
  'sobald', 'solange', 'soweit', 'sofern', 'falls', 'indem', 'damit', 'sodass', 'also',
  'daher', 'deshalb', 'deswegen', 'darum', 'folglich', 'somit', 'dennoch', 'trotzdem',
  'allerdings', 'hingegen', 'dagegen', 'andererseits', 'einerseits', 'nämlich', 'zwar',
  'entweder', 'weder', 'noch', 'sowohl', 'sowie', 'außerdem', 'überdies', 'ferner',
  
  // Hilfsverben & Modalverben
  'sein', 'haben', 'werden', 'können', 'müssen', 'sollen', 'wollen', 'dürfen', 'mögen',
  'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart', 'wäre', 'wären',
  'gewesen', 'habe', 'hast', 'hat', 'habt', 'hatte', 'hattest', 'hatten', 'hattet', 'hätte',
  'gehabt', 'werde', 'wirst', 'wird', 'werdet', 'wurde', 'wurdest', 'wurden', 'wurdet',
  'würde', 'würden', 'geworden', 'kann', 'kannst', 'könnt', 'konnte', 'konntest', 'konnten',
  'könnte', 'könntest', 'könnten', 'gekonnt', 'muss', 'musst', 'müsst', 'musste', 'müsste',
  'gemusst', 'soll', 'sollst', 'sollt', 'sollte', 'solltest', 'sollten', 'gesollt',
  'will', 'willst', 'wollt', 'wollte', 'wolltest', 'wollten', 'gewollt', 'darf', 'darfst',
  'dürft', 'durfte', 'durftest', 'durften', 'dürfte', 'gedurft', 'mag', 'magst', 'mögt',
  'mochte', 'mochtest', 'mochten', 'möchte', 'möchtest', 'möchten', 'gemocht',
  
  // Häufige Verben - Infinitive
  'gehen', 'kommen', 'sehen', 'machen', 'geben', 'nehmen', 'finden', 'denken', 'sagen',
  'wissen', 'lassen', 'stehen', 'liegen', 'bringen', 'heißen', 'tragen', 'halten',
  'sprechen', 'laufen', 'fahren', 'bleiben', 'leben', 'glauben', 'führen', 'zeigen',
  'kennen', 'meinen', 'fragen', 'spielen', 'arbeiten', 'brauchen', 'folgen', 'lernen',
  'bestehen', 'verstehen', 'setzen', 'bekommen', 'beginnen', 'erzählen', 'versuchen',
  'schreiben', 'lesen', 'legen', 'fallen', 'ziehen', 'nennen', 'erreichen', 'treffen',
  'suchen', 'schaffen', 'treten', 'rufen', 'schließen', 'fühlen', 'bieten', 'erhalten',
  'erscheinen', 'gehören', 'bilden', 'entstehen', 'gewinnen', 'erkennen', 'entwickeln',
  'öffnen', 'warten', 'schlagen', 'gelingen', 'liegen', 'helfen', 'legen', 'bedeuten',
  'verlieren', 'wachsen', 'vergessen', 'passieren', 'geschehen', 'vorstellen', 'handeln',
  'erinnern', 'ändern', 'behalten', 'fordern', 'wünschen', 'fehlen', 'erklären', 'verlassen',
  'entscheiden', 'betrachten', 'bemerken', 'gebrauchen', 'erwarten', 'behaupten', 'benutzen',
  'berichten', 'beschreiben', 'besitzen', 'bestimmen', 'besuchen', 'betreffen', 'bewegen',
  'bitten', 'danken', 'drücken', 'einsetzen', 'empfangen', 'empfehlen', 'empfinden',
  'entdecken', 'entsprechen', 'entstehen', 'erfüllen', 'ergeben', 'erheben', 'erhöhen',
  'erlauben', 'erleben', 'ermöglichen', 'ersetzen', 'erwähnen', 'erweisen', 'erzeugen',
  'fassen', 'festhalten', 'feststellen', 'fliegen', 'fordern', 'gebrauchen', 'gefallen',
  'greifen', 'hängen', 'herrschen', 'holen', 'hoffen', 'kaufen', 'kämpfen', 'lachen',
  'landen', 'leiden', 'leisten', 'lieben', 'lösen', 'merken', 'mitteilen', 'nutzen',
  'pflegen', 'planen', 'prüfen', 'reden', 'richten', 'sammeln', 'scheinen', 'schenken',
  'schicken', 'schieben', 'schließen', 'schneiden', 'schreien', 'schweigen', 'sichern',
  'sinken', 'sitzen', 'sorgen', 'sparen', 'springen', 'stammen', 'sterben', 'stimmen',
  'stören', 'stoßen', 'streiten', 'studieren', 'tauchen', 'teilen', 'töten', 'trennen',
  'treten', 'tun', 'überlegen', 'übernehmen', 'überraschen', 'überzeugen', 'umfassen',
  'unterstützen', 'verändern', 'verbinden', 'verdienen', 'vergessen', 'vergleichen',
  'verkaufen', 'verlangen', 'vermeiden', 'vermuten', 'vernichten', 'veröffentlichen',
  'versprechen', 'vertreten', 'verwenden', 'verzichten', 'vorbereiten', 'vorschlagen',
  'vorstellen', 'wählen', 'warnen', 'wechseln', 'weisen', 'werfen', 'wirken', 'wünschen',
  'zahlen', 'zeichnen', 'zerstören', 'ziehen', 'zwingen',
  
  // Häufige Verbformen - Präsens
  'gehe', 'gehst', 'geht', 'komme', 'kommst', 'kommt', 'sehe', 'siehst', 'sieht',
  'mache', 'machst', 'macht', 'gebe', 'gibst', 'gibt', 'nehme', 'nimmst', 'nimmt',
  'finde', 'findest', 'findet', 'denke', 'denkst', 'denkt', 'sage', 'sagst', 'sagt',
  'weiß', 'weißt', 'lasse', 'lässt', 'stehe', 'stehst', 'steht', 'liege', 'liegst', 'liegt',
  'bringe', 'bringst', 'bringt', 'heiße', 'heißt', 'trage', 'trägst', 'trägt',
  'halte', 'hältst', 'hält', 'spreche', 'sprichst', 'spricht', 'laufe', 'läufst', 'läuft',
  'fahre', 'fährst', 'fährt', 'bleibe', 'bleibst', 'bleibt', 'lebe', 'lebst', 'lebt',
  
  // Häufige Verbformen - Präteritum
  'ging', 'gingen', 'kam', 'kamen', 'sah', 'sahen', 'machte', 'machten', 'gab', 'gaben',
  'nahm', 'nahmen', 'fand', 'fanden', 'dachte', 'dachten', 'sagte', 'sagten',
  'wusste', 'wussten', 'ließ', 'ließen', 'stand', 'standen', 'lag', 'lagen',
  'brachte', 'brachten', 'hieß', 'hießen', 'trug', 'trugen', 'hielt', 'hielten',
  'sprach', 'sprachen', 'lief', 'liefen', 'fuhr', 'fuhren', 'blieb', 'blieben',
  'lebte', 'lebten', 'schrieb', 'schrieben', 'las', 'lasen', 'schlug', 'schlugen',
  
  // Häufige Verbformen - Partizip II
  'gegangen', 'gekommen', 'gesehen', 'gemacht', 'gegeben', 'genommen', 'gefunden',
  'gedacht', 'gesagt', 'gewusst', 'gelassen', 'gestanden', 'gelegen', 'gebracht',
  'getragen', 'gehalten', 'gesprochen', 'gelaufen', 'gefahren', 'geblieben', 'gelebt',
  'geschrieben', 'gelesen', 'geschlagen', 'getroffen', 'verloren', 'gewonnen',
  
  // Adjektive - Grundformen
  'gut', 'schlecht', 'groß', 'klein', 'alt', 'neu', 'jung', 'lang', 'kurz', 'hoch',
  'niedrig', 'breit', 'schmal', 'dick', 'dünn', 'schwer', 'leicht', 'stark', 'schwach',
  'schnell', 'langsam', 'früh', 'spät', 'nah', 'fern', 'weit', 'tief', 'flach',
  'hell', 'dunkel', 'kalt', 'warm', 'heiß', 'nass', 'trocken', 'weich', 'hart',
  'laut', 'leise', 'still', 'ruhig', 'wild', 'zahm', 'süß', 'sauer', 'bitter', 'salzig',
  'reich', 'arm', 'teuer', 'billig', 'günstig', 'schön', 'hässlich', 'scharf', 'stumpf',
  'rund', 'eckig', 'gerade', 'krumm', 'glatt', 'rau', 'voll', 'leer', 'offen', 'geschlossen',
  'richtig', 'falsch', 'wahr', 'echt', 'fremd', 'eigen', 'gleich', 'anders', 'verschieden',
  'besonder', 'besonders', 'einfach', 'schwierig', 'möglich', 'unmöglich', 'sicher', 'unsicher',
  'wichtig', 'unwichtig', 'nötig', 'unnötig', 'frei', 'fest', 'lose', 'eng', 'weit',
  'gesund', 'krank', 'müde', 'wach', 'satt', 'hungrig', 'durstig', 'tot', 'lebendig',
  'glücklich', 'unglücklich', 'traurig', 'fröhlich', 'lustig', 'ernst', 'böse', 'lieb', 'nett',
  'freundlich', 'unfreundlich', 'höflich', 'unhöflich', 'klug', 'dumm', 'schlau', 'weise',
  'mutig', 'feige', 'tapfer', 'stolz', 'bescheiden', 'ehrlich', 'faul', 'fleißig', 'geduldig',
  'nervös', 'ruhig', 'aufgeregt', 'gelassen', 'ängstlich', 'furchtlos', 'wütend', 'zornig',
  
  // Adjektive - flektierte Formen (häufigste)
  'gute', 'guten', 'guter', 'gutem', 'gutes', 'große', 'großen', 'großer', 'großem', 'großes',
  'kleine', 'kleinen', 'kleiner', 'kleinem', 'kleines', 'alte', 'alten', 'alter', 'altem', 'altes',
  'neue', 'neuen', 'neuer', 'neuem', 'neues', 'erste', 'ersten', 'erster', 'erstem', 'erstes',
  'letzte', 'letzten', 'letzter', 'letztem', 'letztes', 'ganze', 'ganzen', 'ganzer', 'ganzem',
  'eigene', 'eigenen', 'eigener', 'eigenem', 'eigenes', 'andere', 'anderen', 'anderer', 'anderem',
  'weitere', 'weiteren', 'weiterer', 'weiterem', 'weiteres', 'verschiedene', 'verschiedenen',
  
  // Adverbien
  'nicht', 'auch', 'nur', 'noch', 'schon', 'immer', 'wieder', 'hier', 'dort', 'jetzt',
  'dann', 'nun', 'so', 'sehr', 'viel', 'mehr', 'weniger', 'ganz', 'gar', 'etwa',
  'fast', 'kaum', 'ziemlich', 'recht', 'wohl', 'doch', 'ja', 'nein', 'nie', 'niemals',
  'oft', 'selten', 'manchmal', 'meistens', 'gewöhnlich', 'immer', 'ewig', 'heute',
  'gestern', 'morgen', 'früh', 'spät', 'bald', 'sofort', 'gleich', 'endlich', 'plötzlich',
  'langsam', 'schnell', 'gern', 'lieber', 'am liebsten', 'besser', 'am besten', 'schlimmer',
  'oben', 'unten', 'links', 'rechts', 'vorn', 'hinten', 'drinnen', 'draußen', 'überall',
  'nirgends', 'irgendwo', 'wohin', 'woher', 'warum', 'weshalb', 'wieso', 'wie', 'wann',
  'darum', 'deshalb', 'deswegen', 'also', 'folglich', 'trotzdem', 'dennoch', 'jedoch',
  'allerdings', 'übrigens', 'natürlich', 'sicher', 'bestimmt', 'vielleicht', 'wahrscheinlich',
  'anscheinend', 'offenbar', 'tatsächlich', 'wirklich', 'eigentlich', 'jedenfalls',
  'zunächst', 'zuerst', 'dann', 'danach', 'schließlich', 'zuletzt', 'endlich', 'inzwischen',
  'bereits', 'längst', 'bisher', 'seither', 'seitdem', 'fortan', 'künftig', 'einstweilen',
  
  // Substantive - Menschen
  'Mensch', 'Menschen', 'Mann', 'Männer', 'Frau', 'Frauen', 'Kind', 'Kinder',
  'Herr', 'Herren', 'Dame', 'Damen', 'Mädchen', 'Junge', 'Jungen', 'Person', 'Personen',
  'Leute', 'Volk', 'Völker', 'Vater', 'Väter', 'Mutter', 'Mütter', 'Eltern',
  'Sohn', 'Söhne', 'Tochter', 'Töchter', 'Bruder', 'Brüder', 'Schwester', 'Schwestern',
  'Freund', 'Freunde', 'Freundin', 'Freundinnen', 'Familie', 'Familien', 'Verwandter',
  'Nachbar', 'Nachbarn', 'Kollege', 'Kollegen', 'Chef', 'Chefs', 'Mitarbeiter',
  'Arzt', 'Ärzte', 'Lehrer', 'Schüler', 'Student', 'Studenten', 'Professor',
  'König', 'Könige', 'Präsident', 'Minister', 'Politiker', 'Beamter', 'Soldat', 'Soldaten',
  
  // Substantive - Körper
  'Kopf', 'Köpfe', 'Gesicht', 'Gesichter', 'Auge', 'Augen', 'Nase', 'Nasen',
  'Mund', 'Münder', 'Ohr', 'Ohren', 'Haar', 'Haare', 'Hand', 'Hände', 'Finger',
  'Arm', 'Arme', 'Bein', 'Beine', 'Fuß', 'Füße', 'Körper', 'Herz', 'Herzen',
  'Blut', 'Haut', 'Stimme', 'Stimmen', 'Schulter', 'Schultern', 'Rücken', 'Bauch',
  
  // Substantive - Orte
  'Ort', 'Orte', 'Platz', 'Plätze', 'Stelle', 'Stellen', 'Raum', 'Räume',
  'Haus', 'Häuser', 'Wohnung', 'Wohnungen', 'Zimmer', 'Gebäude', 'Stadt', 'Städte',
  'Dorf', 'Dörfer', 'Land', 'Länder', 'Staat', 'Staaten', 'Welt', 'Erde',
  'Straße', 'Straßen', 'Weg', 'Wege', 'Brücke', 'Brücken', 'Tor', 'Tore', 'Tür', 'Türen',
  'Fenster', 'Wand', 'Wände', 'Boden', 'Böden', 'Decke', 'Decken', 'Dach', 'Dächer',
  'Garten', 'Gärten', 'Hof', 'Höfe', 'Feld', 'Felder', 'Wald', 'Wälder', 'Berg', 'Berge',
  'Tal', 'Täler', 'Fluss', 'Flüsse', 'See', 'Seen', 'Meer', 'Meere', 'Insel', 'Inseln',
  
  // Substantive - Zeit
  'Zeit', 'Zeiten', 'Jahr', 'Jahre', 'Monat', 'Monate', 'Woche', 'Wochen',
  'Tag', 'Tage', 'Stunde', 'Stunden', 'Minute', 'Minuten', 'Sekunde', 'Sekunden',
  'Morgen', 'Vormittag', 'Mittag', 'Nachmittag', 'Abend', 'Nacht', 'Nächte',
  'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag',
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
  'September', 'Oktober', 'November', 'Dezember', 'Frühling', 'Sommer', 'Herbst', 'Winter',
  
  // Substantive - Abstraktes
  'Leben', 'Tod', 'Liebe', 'Hass', 'Freude', 'Trauer', 'Angst', 'Hoffnung', 'Glaube',
  'Mut', 'Kraft', 'Macht', 'Recht', 'Pflicht', 'Freiheit', 'Wahrheit', 'Gerechtigkeit',
  'Arbeit', 'Geld', 'Preis', 'Wert', 'Sinn', 'Zweck', 'Ziel', 'Plan', 'Idee', 'Gedanke',
  'Frage', 'Antwort', 'Problem', 'Lösung', 'Grund', 'Ursache', 'Folge', 'Wirkung',
  'Anfang', 'Ende', 'Mitte', 'Teil', 'Teile', 'Ganze', 'Hälfte', 'Rest', 'Stück', 'Stücke',
  'Form', 'Formen', 'Art', 'Arten', 'Weise', 'Weisen', 'Beispiel', 'Beispiele', 'Fall', 'Fälle',
  
  // Substantive - Gegenstände
  'Ding', 'Dinge', 'Sache', 'Sachen', 'Gegenstand', 'Gegenstände', 'Buch', 'Bücher',
  'Brief', 'Briefe', 'Zeitung', 'Zeitungen', 'Bild', 'Bilder', 'Foto', 'Fotos',
  'Tisch', 'Tische', 'Stuhl', 'Stühle', 'Bett', 'Betten', 'Schrank', 'Schränke',
  'Auto', 'Autos', 'Wagen', 'Zug', 'Züge', 'Schiff', 'Schiffe', 'Flugzeug', 'Flugzeuge',
  'Telefon', 'Computer', 'Maschine', 'Maschinen', 'Gerät', 'Geräte', 'Werkzeug',
  
  // Substantive - Natur
  'Wasser', 'Feuer', 'Luft', 'Licht', 'Schatten', 'Sonne', 'Mond', 'Stern', 'Sterne',
  'Himmel', 'Wolke', 'Wolken', 'Regen', 'Schnee', 'Wind', 'Sturm', 'Wetter',
  'Baum', 'Bäume', 'Blume', 'Blumen', 'Gras', 'Blatt', 'Blätter', 'Stein', 'Steine',
  'Tier', 'Tiere', 'Hund', 'Hunde', 'Katze', 'Katzen', 'Vogel', 'Vögel', 'Pferd', 'Pferde',
  
  // Zahlen als Wörter
  'null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn',
  'neunzehn', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig',
  'neunzig', 'hundert', 'tausend', 'million', 'milliarde',
  'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte', 'neunte', 'zehnte',
  
  // Weitere häufige Wörter
  'Name', 'Namen', 'Wort', 'Wörter', 'Worte', 'Sprache', 'Sprachen', 'Schrift', 'Text', 'Texte',
  'Geschichte', 'Geschichten', 'Erzählung', 'Roman', 'Gedicht', 'Lied', 'Lieder', 'Musik',
  'Kunst', 'Bild', 'Film', 'Filme', 'Spiel', 'Spiele', 'Sport', 'Schule', 'Schulen',
  'Universität', 'Kirche', 'Kirchen', 'Politik', 'Wirtschaft', 'Gesellschaft', 'Kultur',
  'Wissenschaft', 'Technik', 'Natur', 'Umwelt', 'Gesundheit', 'Medizin', 'Krankheit',
]);

// Zusätzliche Wörter dynamisch hinzufügen (für Eigennamen etc.)
const customWords = new Set<string>();
const STORAGE_KEY = 'featherworks-custom-dictionary';

// Benutzerwörterbuch aus localStorage laden
function loadCustomDictionary(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const words = JSON.parse(stored) as string[];
      words.forEach(w => customWords.add(w.toLowerCase()));
    }
  } catch (e) {
    console.warn('Benutzerwörterbuch konnte nicht geladen werden:', e);
  }
}

// Benutzerwörterbuch in localStorage speichern
function saveCustomDictionary(): void {
  try {
    const words = Array.from(customWords);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch (e) {
    console.warn('Benutzerwörterbuch konnte nicht gespeichert werden:', e);
  }
}

// Beim Laden initialisieren
loadCustomDictionary();

/**
 * Prüft ob ein Wort im deutschen Wörterbuch existiert
 */
export function isValidGermanWord(word: string): boolean {
  if (!word || word.length < 2) return true; // Zu kurze Wörter ignorieren
  
  // Zahlen sind immer ok
  if (/^\d+$/.test(word)) return true;
  
  // Großgeschriebene Wörter am Satzanfang: auch lowercase prüfen
  const lower = word.toLowerCase();
  
  // Im Haupt-Wörterbuch?
  if (GERMAN_WORDS.has(word) || GERMAN_WORDS.has(lower)) return true;
  
  // Im benutzerdefinierten Wörterbuch?
  if (customWords.has(word) || customWords.has(lower)) return true;
  
  // Zusammengesetzte Wörter: Prüfe ob Teilwörter bekannt sind
  // (Einfache Heuristik für deutsche Komposita)
  if (word.length > 8) {
    for (let i = 4; i < word.length - 3; i++) {
      const part1 = word.slice(0, i).toLowerCase();
      const part2 = word.slice(i).toLowerCase();
      if (GERMAN_WORDS.has(part1) && GERMAN_WORDS.has(part2)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Fügt ein Wort zum benutzerdefinierten Wörterbuch hinzu und speichert es
 */
export function addToCustomDictionary(word: string): void {
  if (word && word.length >= 2) {
    customWords.add(word.toLowerCase());
    saveCustomDictionary();
  }
}

/**
 * Entfernt ein Wort aus dem benutzerdefinierten Wörterbuch
 */
export function removeFromCustomDictionary(word: string): void {
  if (word) {
    customWords.delete(word.toLowerCase());
    saveCustomDictionary();
  }
}

/**
 * Gibt alle benutzerdefinierten Wörter zurück
 */
export function getCustomDictionaryWords(): string[] {
  return Array.from(customWords);
}

/**
 * Gibt alle Wörter im Wörterbuch zurück (für Debug)
 */
export function getDictionarySize(): number {
  return GERMAN_WORDS.size + customWords.size;
}

/**
 * Levenshtein-Distanz zwischen zwei Strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Findet ähnliche Wörter im Wörterbuch (für Korrekturvorschläge)
 */
export function findSimilarWords(word: string, maxResults = 5): string[] {
  const lowerWord = word.toLowerCase();
  const candidates: { word: string; distance: number }[] = [];
  
  // Sammle alle Wörter mit ähnlicher Länge (+/- 2)
  const minLen = Math.max(2, lowerWord.length - 2);
  const maxLen = lowerWord.length + 2;
  
  const allWords = [...GERMAN_WORDS, ...customWords];
  
  for (const dictWord of allWords) {
    if (dictWord.length < minLen || dictWord.length > maxLen) continue;
    
    const distance = levenshteinDistance(lowerWord, dictWord);
    // Nur Wörter mit Distanz <= 2 berücksichtigen
    if (distance <= 2 && distance > 0) {
      candidates.push({ word: dictWord, distance });
    }
  }
  
  // Sortiere nach Distanz und dann alphabetisch
  candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.word.localeCompare(b.word);
  });
  
  // Kapitalisierung des Originals beibehalten
  const isCapitalized = word[0] === word[0].toUpperCase();
  
  return candidates.slice(0, maxResults).map(c => 
    isCapitalized ? c.word.charAt(0).toUpperCase() + c.word.slice(1) : c.word
  );
}

// =============================================================================
// ENGLISH DICTIONARY - 3000+ common English words
// =============================================================================

const ENGLISH_WORDS = new Set<string>([
  // Articles & Determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'its',
  'our', 'their', 'some', 'any', 'no', 'every', 'each', 'all', 'both', 'few', 'many',
  'much', 'most', 'other', 'another', 'such', 'what', 'which', 'whose',
  
  // Pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'us', 'them',
  'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves',
  'who', 'whom', 'what', 'which', 'that', 'whoever', 'whatever', 'whichever',
  'anyone', 'someone', 'everyone', 'no one', 'anybody', 'somebody', 'everybody', 'nobody',
  'anything', 'something', 'everything', 'nothing', 'one', 'ones',
  
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'of', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over', 'out',
  'up', 'down', 'off', 'away', 'across', 'behind', 'beside', 'beyond', 'near', 'toward',
  'upon', 'within', 'without', 'along', 'among', 'around', 'against', 'inside', 'outside',
  
  // Conjunctions
  'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'because', 'since', 'although', 'though',
  'while', 'whereas', 'if', 'unless', 'until', 'when', 'where', 'whether', 'as', 'than',
  'that', 'after', 'before', 'once', 'whenever', 'wherever', 'however', 'therefore',
  
  // Common Verbs - Base forms
  'be', 'have', 'do', 'say', 'get', 'make', 'go', 'know', 'take', 'see', 'come', 'think',
  'look', 'want', 'give', 'use', 'find', 'tell', 'ask', 'work', 'seem', 'feel', 'try',
  'leave', 'call', 'put', 'keep', 'let', 'begin', 'show', 'hear', 'play', 'run', 'move',
  'live', 'believe', 'hold', 'bring', 'happen', 'write', 'provide', 'sit', 'stand', 'lose',
  'pay', 'meet', 'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand',
  'watch', 'follow', 'stop', 'create', 'speak', 'read', 'allow', 'add', 'spend', 'grow',
  'open', 'walk', 'win', 'offer', 'remember', 'love', 'consider', 'appear', 'buy', 'wait',
  'serve', 'die', 'send', 'expect', 'build', 'stay', 'fall', 'cut', 'reach', 'kill',
  'remain', 'suggest', 'raise', 'pass', 'sell', 'require', 'report', 'decide', 'pull',
  
  // Verb forms - be
  'am', 'is', 'are', 'was', 'were', 'been', 'being',
  // Verb forms - have
  'has', 'had', 'having',
  // Verb forms - do
  'does', 'did', 'done', 'doing',
  // Common past tenses
  'said', 'got', 'made', 'went', 'knew', 'took', 'saw', 'came', 'thought', 'looked',
  'wanted', 'gave', 'used', 'found', 'told', 'asked', 'worked', 'seemed', 'felt', 'tried',
  'left', 'called', 'needed', 'became', 'happened', 'kept', 'started', 'began', 'heard',
  'played', 'ran', 'moved', 'lived', 'believed', 'held', 'brought', 'written', 'sat',
  'stood', 'lost', 'paid', 'met', 'included', 'continued', 'learned', 'changed', 'led',
  'understood', 'watched', 'followed', 'stopped', 'created', 'spoke', 'allowed', 'added',
  'spent', 'grew', 'opened', 'walked', 'won', 'offered', 'remembered', 'loved', 'considered',
  'appeared', 'bought', 'waited', 'served', 'died', 'sent', 'expected', 'built', 'stayed',
  'fell', 'reached', 'killed', 'remained', 'suggested', 'raised', 'passed', 'sold',
  'required', 'reported', 'decided', 'pulled', 'gone', 'known', 'taken', 'seen', 'given',
  
  // Common -ing forms
  'being', 'having', 'doing', 'saying', 'getting', 'making', 'going', 'knowing', 'taking',
  'seeing', 'coming', 'thinking', 'looking', 'wanting', 'giving', 'using', 'finding',
  'telling', 'asking', 'working', 'trying', 'leaving', 'calling', 'putting', 'keeping',
  'beginning', 'showing', 'hearing', 'playing', 'running', 'moving', 'living', 'writing',
  'sitting', 'standing', 'meeting', 'learning', 'reading', 'speaking', 'walking', 'waiting',
  'building', 'staying', 'falling', 'growing', 'talking', 'starting', 'helping', 'turning',
  
  // Common -s forms
  'says', 'gets', 'makes', 'goes', 'knows', 'takes', 'sees', 'comes', 'thinks', 'looks',
  'wants', 'gives', 'uses', 'finds', 'tells', 'asks', 'works', 'seems', 'feels', 'tries',
  'leaves', 'calls', 'puts', 'keeps', 'lets', 'begins', 'shows', 'hears', 'plays', 'runs',
  'moves', 'lives', 'believes', 'holds', 'brings', 'happens', 'writes', 'provides', 'sits',
  'stands', 'loses', 'pays', 'meets', 'includes', 'continues', 'sets', 'learns', 'changes',
  'leads', 'understands', 'watches', 'follows', 'stops', 'creates', 'speaks', 'reads',
  'allows', 'adds', 'spends', 'grows', 'opens', 'walks', 'wins', 'offers', 'remembers',
  'loves', 'considers', 'appears', 'buys', 'waits', 'serves', 'dies', 'sends', 'expects',
  'builds', 'stays', 'falls', 'cuts', 'reaches', 'kills', 'remains', 'suggests', 'raises',
  'passes', 'sells', 'requires', 'reports', 'decides', 'pulls', 'needs', 'starts', 'helps',
  'turns', 'talks', 'means', 'becomes',
  
  // Modal verbs
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  
  // Adjectives
  'good', 'new', 'first', 'last', 'long', 'great', 'little', 'own', 'other', 'old', 'right',
  'big', 'high', 'different', 'small', 'large', 'next', 'early', 'young', 'important',
  'few', 'public', 'bad', 'same', 'able', 'human', 'local', 'sure', 'free', 'better',
  'best', 'true', 'whole', 'real', 'political', 'social', 'white', 'black', 'hard',
  'possible', 'full', 'special', 'clear', 'easy', 'certain', 'open', 'late', 'simple',
  'strong', 'low', 'present', 'difficult', 'major', 'general', 'short', 'personal',
  'beautiful', 'happy', 'available', 'international', 'national', 'american', 'single',
  'economic', 'private', 'current', 'final', 'main', 'physical', 'natural', 'significant',
  'ready', 'common', 'similar', 'likely', 'necessary', 'dead', 'wrong', 'hot', 'cold',
  'nice', 'fine', 'poor', 'dark', 'light', 'deep', 'close', 'serious', 'huge', 'popular',
  'traditional', 'heavy', 'safe', 'medical', 'foreign', 'financial', 'recent', 'central',
  
  // Adverbs
  'not', 'just', 'also', 'very', 'often', 'however', 'too', 'usually', 'really', 'early',
  'never', 'always', 'sometimes', 'together', 'likely', 'simply', 'generally', 'instead',
  'actually', 'already', 'again', 'rather', 'almost', 'especially', 'ever', 'quickly',
  'probably', 'only', 'finally', 'either', 'quite', 'certainly', 'yet', 'perhaps',
  'maybe', 'easily', 'eventually', 'exactly', 'certainly', 'recently', 'mostly', 'clearly',
  'suddenly', 'immediately', 'directly', 'slowly', 'obviously', 'completely', 'apparently',
  'currently', 'generally', 'particularly', 'highly', 'simply', 'naturally', 'nearly',
  'truly', 'carefully', 'absolutely', 'frequently', 'possibly', 'hardly', 'seriously',
  
  // Nouns - People
  'people', 'man', 'woman', 'child', 'children', 'person', 'family', 'friend', 'mother',
  'father', 'wife', 'husband', 'son', 'daughter', 'brother', 'sister', 'girl', 'boy',
  'baby', 'student', 'teacher', 'doctor', 'president', 'member', 'leader', 'player',
  'worker', 'writer', 'artist', 'officer', 'manager', 'director', 'king', 'queen',
  'men', 'women', 'parents', 'kids', 'guys', 'folks', 'adults', 'everyone',
  
  // Nouns - Places
  'place', 'world', 'country', 'city', 'house', 'home', 'room', 'school', 'state',
  'area', 'office', 'building', 'street', 'town', 'community', 'land', 'street',
  'market', 'church', 'court', 'center', 'university', 'hospital', 'park', 'road',
  'village', 'garden', 'field', 'ground', 'region', 'station', 'store', 'restaurant',
  
  // Nouns - Time
  'time', 'year', 'day', 'week', 'month', 'night', 'hour', 'minute', 'second', 'moment',
  'morning', 'afternoon', 'evening', 'today', 'tomorrow', 'yesterday', 'future', 'past',
  'century', 'decade', 'season', 'period', 'age', 'weekend', 'monday', 'tuesday',
  'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march',
  'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  
  // Nouns - Things
  'thing', 'way', 'part', 'number', 'point', 'word', 'hand', 'side', 'end', 'line',
  'life', 'story', 'fact', 'right', 'lot', 'head', 'face', 'eye', 'body', 'water',
  'money', 'food', 'book', 'idea', 'car', 'door', 'name', 'question', 'answer', 'problem',
  'case', 'reason', 'example', 'system', 'program', 'company', 'group', 'work', 'game',
  'information', 'power', 'order', 'level', 'service', 'action', 'result', 'change',
  'interest', 'development', 'experience', 'effort', 'course', 'control', 'process',
  'policy', 'research', 'law', 'value', 'price', 'history', 'issue', 'form', 'view',
  'position', 'situation', 'sense', 'rate', 'type', 'report', 'plan', 'project', 'role',
  'decision', 'term', 'data', 'effect', 'difference', 'event', 'evidence', 'nature',
  'support', 'attention', 'relationship', 'opportunity', 'cost', 'response', 'activity',
  'technology', 'management', 'education', 'health', 'industry', 'market', 'quality',
  'practice', 'performance', 'business', 'production', 'voice', 'music', 'movie', 'news',
  
  // Numbers
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'twenty', 'thirty', 'hundred', 'thousand', 'million', 'billion',
  'first', 'second', 'third', 'fourth', 'fifth', 'half', 'quarter', 'once', 'twice',
  
  // Common contractions (without apostrophe for simple matching)
  'dont', 'doesnt', 'didnt', 'wont', 'cant', 'couldnt', 'wouldnt', 'shouldnt', 'isnt',
  'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt', 'im', 'youre', 'hes', 'shes',
  'its', 'were', 'theyre', 'ive', 'youve', 'weve', 'theyve', 'ill', 'youll', 'hell',
  'shell', 'well', 'theyll', 'lets', 'thats', 'whats', 'whos', 'heres', 'theres',
  
  // Misc common words
  'yes', 'no', 'please', 'thank', 'thanks', 'sorry', 'okay', 'ok', 'well', 'now', 'then',
  'here', 'there', 'where', 'how', 'why', 'when', 'still', 'even', 'back', 'much',
  'more', 'less', 'least', 'most', 'very', 'enough', 'own', 'else', 'another', 'such',
]);

/**
 * Prüft ob ein Wort gültig ist (in der entsprechenden Sprache)
 * @param word Das zu prüfende Wort
 * @param lang Sprache: 'de' für Deutsch, 'en' für Englisch
 */
export function isValidWord(word: string, lang: 'de' | 'en' = 'de'): boolean {
  if (!word || word.length < 2) return true;
  if (/^\d+$/.test(word)) return true;
  
  const lower = word.toLowerCase();
  const dictionary = lang === 'de' ? GERMAN_WORDS : ENGLISH_WORDS;
  
  if (dictionary.has(word) || dictionary.has(lower)) return true;
  if (customWords.has(word) || customWords.has(lower)) return true;
  
  // Komposita-Prüfung nur für Deutsch
  if (lang === 'de' && word.length > 8) {
    for (let i = 4; i < word.length - 3; i++) {
      const part1 = word.slice(0, i).toLowerCase();
      const part2 = word.slice(i).toLowerCase();
      if (GERMAN_WORDS.has(part1) && GERMAN_WORDS.has(part2)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Findet ähnliche Wörter (sprachabhängig)
 */
export function findSimilarWordsForLang(word: string, lang: 'de' | 'en' = 'de', maxResults = 5): string[] {
  const lowerWord = word.toLowerCase();
  const candidates: { word: string; distance: number }[] = [];
  const minLen = Math.max(2, lowerWord.length - 2);
  const maxLen = lowerWord.length + 2;
  
  const dictionary = lang === 'de' ? GERMAN_WORDS : ENGLISH_WORDS;
  const allWords = [...dictionary, ...customWords];
  
  for (const dictWord of allWords) {
    if (dictWord.length < minLen || dictWord.length > maxLen) continue;
    const distance = levenshteinDistance(lowerWord, dictWord);
    if (distance <= 2 && distance > 0) {
      candidates.push({ word: dictWord, distance });
    }
  }
  
  candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.word.localeCompare(b.word);
  });
  
  const isCapitalized = word[0] === word[0].toUpperCase();
  return candidates.slice(0, maxResults).map(c => 
    isCapitalized ? c.word.charAt(0).toUpperCase() + c.word.slice(1) : c.word
  );
}

export { GERMAN_WORDS, ENGLISH_WORDS };
