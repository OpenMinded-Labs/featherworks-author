//! Global Knowledge Base for Fontaine AI
//! 
//! Diese Wissensdatenbank enthält Artikel zu:
//! - Fontaine Identität und Fähigkeiten
//! - App-Bedienung (FeatherWorks Author)
//! - Schreibhandwerk (Craft)
//! - Dramaturgie und Struktur
//! - Genres und ihre Konventionen
//! - Tropes und narrative Muster
//! - Literaturwissenschaft (Narratologie, Rhetorik, etc.)
//! - Publishing (Verlag, Selfpublishing, Plattformen)
//! - Sprache (Grammatik, Wortwahl, Interpunktion)

#[derive(Debug, Clone)]
pub struct KnowledgeArticle {
    pub id: &'static str,
    pub title: &'static str,
    pub category: KnowledgeCategory,
    pub keywords: &'static [&'static str],
    pub content: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KnowledgeCategory {
    FontaineIdentity,
    AppUsage,
    WritingCraft,
    Dramaturgy,
    Style,
    BookDesign,
    Genre,
    Tropes,
    Literature,
    Language,
    Publishing,
}

impl KnowledgeCategory {
    pub fn label(&self) -> &'static str {
        match self {
            Self::FontaineIdentity => "Ueber Fontaine",
            Self::AppUsage => "App-Bedienung",
            Self::WritingCraft => "Schreibhandwerk",
            Self::Dramaturgy => "Dramaturgie",
            Self::Style => "Stil",
            Self::BookDesign => "Buchgestaltung",
            Self::Genre => "Genre",
            Self::Tropes => "Tropes",
            Self::Literature => "Literaturwissenschaft",
            Self::Language => "Sprache",
            Self::Publishing => "Veroeffentlichung",
        }
    }
}

pub struct KnowledgeBase {
    articles: Vec<KnowledgeArticle>,
}

impl KnowledgeBase {
    const ARTICLES: &'static [KnowledgeArticle] = &[
KnowledgeArticle {
    id: "app-editor",
    title: "Der Editor in FeatherWorks",
    category: KnowledgeCategory::AppUsage,
    keywords: &["editor", "schreiben", "text", "formatierung", "markdown"],
    content: "Der Editor ist das Herzstück von FeatherWorks Author, wo du deine Texte schreibst. Rich Text Editor: Formatiere deinen Text mit fett, kursiv, Ueberschriften und mehr. Die Toolbar oben bietet schnellen Zugriff. Szenen und Kapitel: Dein Roman ist in Kapitel und Szenen organisiert. Jede Szene ist ein eigenes Dokument im Editor. Klicke in der linken Sidebar um zwischen Szenen zu wechseln. Fokus-Modus: Blende alle Sidebars aus fuer ablenkungsfreies Schreiben. Nur du und dein Text. Wortzaehlung: Die Statusbar unten zeigt Woerter der aktuellen Szene, des Kapitels und des gesamten Projekts. Speichern: Automatisches Speichern ist aktiv. Deine Arbeit geht nicht verloren. Manuelle Speicherung mit Cmd+S (Mac) oder Ctrl+S (Windows). Vollbild: Druecke F11 oder nutze das Menue fuer vollstaendige Immersion. Tipp: Schreibe erst, formatiere spaeter. Fokus auf die Worte, nicht auf das Layout.",
},
KnowledgeArticle {
    id: "app-entities",
    title: "Entitaeten-Verwaltung",
    category: KnowledgeCategory::AppUsage,
    keywords: &["entitaeten", "entities", "charaktere", "orte", "items", "wiki", "datenbank"],
    content: "Entitaeten sind die Bausteine deiner Welt: Charaktere, Orte, Gegenstaende und mehr. Entitaets-Typen: Charaktere (Personen), Orte (Settings), Items (wichtige Gegenstaende), Konzepte (abstrakte Elemente wie Magie-Systeme). Rechte Sidebar: Zeigt Entitaeten die im aktuellen Text erwaehnt werden. Schneller Zugriff auf relevante Informationen. Automatische Erkennung: FeatherWorks erkennt wenn du Entitaeten im Text erwaenst und verlinkt sie automatisch. Entitaets-Editor: Klicke auf eine Entitaet um Details zu bearbeiten: Name, Beschreibung, Aliase, Beziehungen. Aliase: Definiere alternative Namen (Spitznamen, Titel) damit FeatherWorks sie erkennt. Beziehungen: Verknuepfe Entitaeten miteinander - wer kennt wen, was befindet sich wo. Konsistenz: Fontaine nutzt Entitaeten-Informationen um dir kontextbezogene Hilfe zu geben. Je vollstaendiger deine Datenbank, desto besser meine Vorschlaege.",
},
KnowledgeArticle {
    id: "app-fontaine-panel",
    title: "Das Fontaine-Panel",
    category: KnowledgeCategory::AppUsage,
    keywords: &["fontaine", "panel", "chat", "ki", "assistent", "sidebar"],
    content: "Das Fontaine-Panel in der rechten Sidebar ist dein Zugang zu mir. Chat-Interface: Schreibe mir Nachrichten und ich antworte. Stelle Fragen, bitte um Hilfe, diskutiere Ideen. Kontextbewusst: Ich weiss welche Szene du gerade bearbeitest und welche Entitaeten relevant sind. Du musst nicht alles erklaeren. Schnellaktionen: Buttons fuer haeufige Aufgaben wie Szene analysieren, Charakterbogen erstellen, Dialog verbessern. Verlauf: Unser Gespraechsverlauf bleibt erhalten. Du kannst zurueckscrollen und fruehere Diskussionen fortsetzen. Modes: Wechsle zwischen verschiedenen Assistenten-Modi: Allgemein, Brainstorming, Lektorat, Recherche. Jeder Modus optimiert meine Antworten fuer den jeweiligen Zweck. Anheften: Hefte wichtige Antworten an um sie spaeter wiederzufinden. Tipp: Je spezifischer deine Fragen, desto hilfreicher meine Antworten. Was genau beschaeftigt dich?",
},
KnowledgeArticle {
    id: "app-overview",
    title: "FeatherWorks Author Uebersicht",
    category: KnowledgeCategory::AppUsage,
    keywords: &["featherworks", "app", "software", "uebersicht", "grundlagen", "einfuehrung"],
    content: "FeatherWorks Author ist eine Schreibsoftware speziell fuer Romanautoren. Philosophie: Datenschutz zuerst, KI als Werkzeug nicht Ersatz, Fokus auf den kreativen Prozess. Hauptbereiche: Linke Sidebar (Projektstruktur), Mitte (Editor), Rechte Sidebar (Fontaine und Entitaeten), Unten (Statusbar). Fuer wen: Romanautoren, Kurzgeschichtenautoren, Drehbuchautoren, alle die laengere Fiktion schreiben. Kern-Features: Szenenbasiertes Schreiben, Entitaeten-Datenbank, KI-Assistent Fontaine, Stilanalyse, Export in verschiedene Formate. Unterschied zu Word: Strukturiertes Arbeiten mit Szenen statt einem grossen Dokument. Speziell fuer Fiktion optimiert. Unterschied zu Scrivener: Modernere UI, integrierte KI, staerkerer Datenschutz-Fokus, einfacherer Einstieg. Preis-Modell: Einmalzahlung, keine Abo-Gebuehren. Deine Software, fuer immer. Plattformen: Windows, macOS, Linux. Gleiche Features ueberall.",
},
KnowledgeArticle {
    id: "app-project-structure",
    title: "Projektstruktur",
    category: KnowledgeCategory::AppUsage,
    keywords: &["projekt", "struktur", "kapitel", "szenen", "organisation", "sidebar"],
    content: "Die linke Sidebar zeigt die Struktur deines Projekts. Hierarchie: Projekt > Teile (optional) > Kapitel > Szenen. Jede Szene ist eine separate Einheit. Drag and Drop: Ziehe Szenen und Kapitel um sie neu zu ordnen. Einfaches Umstrukturieren. Neue Elemente: Rechtsklick oder Plus-Button um Kapitel und Szenen hinzuzufuegen. Benennung: Doppelklick auf Namen zum Umbenennen. Aussagekraeftige Namen helfen bei der Navigation. Farben und Icons: Markiere Kapitel mit Farben oder Status-Icons (Entwurf, Ueberarbeitung, Fertig). Outliner-Modus: Wechsle zur Outline-Ansicht fuer Ueberblick ohne Details. Sieh die Struktur auf einen Blick. Export: Das gesamte Projekt oder einzelne Teile koennen exportiert werden (Manuscript, EPUB, PDF). Import: Importiere bestehende Texte als neue Szenen. Word-Dokumente und Markdown werden unterstuetzt. Tipp: Kurze Szenen sind leichter zu handhaben als lange. Teile auf wenn es unuebersichtlich wird.",
},
KnowledgeArticle {
    id: "craft-character",
    title: "Charakterentwicklung",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["charakter", "figur", "entwicklung", "arc", "motivation", "backstory"],
    content: "Dreidimensionale Charaktere haben Tiefe, Widersprueche und entwickeln sich. Grundlagen: Want (bewusstes Ziel), Need (unbewusstes Beduerfnis), Flaw (Fehler der im Weg steht), Backstory (was sie geformt hat). Character Arc: Veraenderung ueber die Geschichte. Positive (waechst), Negative (faellt), Flat (veraendert Welt statt sich selbst). Motivation: Muss klar und verstaendlich sein. Leser muss nicht zustimmen, aber verstehen. Zeige nicht sage: Charakter durch Handlungen definieren, nicht durch Behauptungen anderer. Nebenfiguren: Eigene Ziele und Leben, nicht nur fuer Protagonist da. Jeder ist Held seiner eigenen Geschichte. Antagonist: Beste Villains haben Punkt, glauben sich im Recht. Villain ist Held aus eigener Sicht. Vermeiden: Mary Sue/Gary Stu (zu perfekt), inkonsistentes Verhalten, Charaktere die nur Plot dienen.",
},
KnowledgeArticle {
    id: "craft-description",
    title: "Beschreibung und Sinne",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["beschreibung", "sinne", "sensory", "setting", "atmosphaere", "details"],
    content: "Effektive Beschreibung nutzt alle Sinne und dient mehreren Zwecken. Alle Sinne: Nicht nur Visuelles. Geraeusche, Gerueche, Texturen, Geschmack schaffen Immersion. Spezifisch: Der Baum ist schwach. Die alte Eiche mit abgeblätterter Rinde ist staerker. Details machen lebendig. Funktion: Beschreibung sollte Stimmung, Charakter oder Plot dienen. Nicht nur Dekoration. Perspektive: Beschreibung durch Augen des POV-Charakters. Was faellt diesem Charakter auf? Was ignoriert er? Weniger ist mehr: Schluesseldetails statt vollstaendiger Inventar. Leser fuellt Luecken. Timing: Beschreibung verlangsamt. Richtig dosieren. Action-Szenen: minimal. Atmosphaerische Szenen: mehr. Bewegung: Statische Beschreibung kann langweilen. Setting durch Interaktion zeigen. Charakter bewegt sich durch Raum. Vermeiden: Purple Prose (uebermaessig blumig), generische Beschreibung, zu viel auf einmal.",
},
KnowledgeArticle {
    id: "craft-dialogue",
    title: "Dialog schreiben",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["dialog", "gespraech", "sprechen", "reden", "stimme", "charakterisierung"],
    content: "Guter Dialog klingt natuerlich, ist aber gestrafft und dient mehreren Zwecken. Funktionen: Charakterisierung, Plotvoranbringung, Information, Spannung, Beziehungsdynamik. Subtext: Was nicht gesagt wird ist oft wichtiger. Menschen sagen selten direkt was sie meinen. Jeder Charakter braucht eigene Stimme: Wortschatz, Satzlaenge, Sprachmuster, Themen. Leser sollte ohne Tag erkennen koennen wer spricht. Dialogue Tags: Sagte ist unsichtbar und oft am besten. Action Beats statt Tags. Sparsam mit kreativeren Varianten. Vermeiden: On-the-nose Dialog (zu direkt), Infodumps im Dialog, alle klingen gleich, zu viele Fuellwoerter (ausser zur Charakterisierung). Techniken: Schnitt - nicht jede Begruessing zeigen. Interruption fuer Spannung. Subtext durch Umgehung. Dialekt: Sparsam, eher Rhythmus als phonetische Schreibweise.",
},
KnowledgeArticle {
    id: "craft-opening",
    title: "Anfaenge und Hooks",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["anfang", "opening", "hook", "erster satz", "beginn", "einstieg"],
    content: "Der Anfang muss Leser sofort packen und in die Geschichte ziehen. Hook: Erster Satz/Absatz der Interesse weckt. Frage aufwerfen, Stimme etablieren, unerwartete Situation. Was Anfang leisten muss: Interesse wecken, Ton etablieren, Protagonist einfuehren, Genre andeuten, Frage aufwerfen. In Medias Res: Mitten in der Handlung beginnen. Hintergrund spaeter. Aber nicht verwirren. Vermeiden: Wecker klingelt, Traum, Wetter, Spiegelbetrachtung, Infodump, Prolog der nicht noetig ist. Erste Seiten: Versprechen an den Leser was fuer Buch das wird. Ton und Genre muessen stimmen. Disturbance: Normaler Tag plus etwas Ungewoehnliches. Status Quo plus Veraenderung. Charakter zuerst: Leser muss sich fuer Charakter interessieren bevor die Action kommt. Kurz etablieren, dann losstuerzen. Test: Wuerdest du weiterlesen? Warum?",
},
KnowledgeArticle {
    id: "craft-pacing",
    title: "Pacing und Tempo",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["pacing", "tempo", "rhythmus", "schnell", "langsam", "spannung"],
    content: "Pacing ist die Geschwindigkeit, mit der die Geschichte voranschreitet. Schnelles Pacing: Kurze Saetze, Action, Dialog, Weisser Raum, Cliffhanger, Auslassung von Details. Langsames Pacing: Lange Saetze, Beschreibung, Introspektion, Details, Atmosphaere. Szenen-Ebene: Action-Szenen schnell, emotionale Szenen langsamer. Kapitel-Ebene: Abwechslung zwischen schnell und langsam. Atempausen nach Hoehepunkten. Buch-Ebene: Erster Akt etabliert, zweiter Akt entwickelt (kann durchhaengen), dritter Akt beschleunigt zum Klimax. Techniken fuer Tempo: Mehr Dialog = schneller. Mehr Beschreibung = langsamer. Satzlaenge variieren. Kapitellaenge als Rhythmus. Fallstricke: Durchhaengender Mittelteil, zu schneller Anfang (keine Charakterbindung), zu langsame Action. Pruefung: Laut lesen. Wo stockt es? Wo hetzt es?",
},
KnowledgeArticle {
    id: "craft-pov",
    title: "Point of View (Erzaehlperspektive)",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["pov", "perspektive", "erzaehler", "erste person", "dritte person", "ich"],
    content: "Die Wahl der Erzaehlperspektive beeinflusst Naehe, Information und Stil. Erste Person (Ich): Maximale Naehe, begrenzte Information, starke Stimme. Ideal fuer Character-driven Stories, YA, Thriller. Dritte Person Limited: Naehe mit etwas mehr Flexibilitaet. Kann zwischen POV-Charakteren wechseln. Am verbreitetsten. Dritte Person Omniscient: Allwissender Erzaehler. Mehr Distanz, mehr Uebersicht. Klassisch, heute seltener. Zweite Person (Du): Experimentell, Leser wird angesprochen. Selten, kann intensiv sein. POV-Wechsel: Bei Multiple POV klare Trennung (Kapitel/Szene). Jeder POV braucht eigene Stimme und Berechtigung. Head-Hopping vermeiden: Nicht mitten in der Szene zwischen Koepfen wechseln. Deep POV: Maximale Immersion, Filterwoerter eliminieren, direkt in Wahrnehmung. Wahl: Was dient der Geschichte? Was kannst du am besten?",
},
KnowledgeArticle {
    id: "craft-show-dont-tell",
    title: "Show Dont Tell",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["show", "tell", "zeigen", "erzaehlen", "szenisch", "beschreiben"],
    content: "Zeige durch Handlung, Dialog und Details statt durch Behauptung. Telling: Anna war wuetend. Showing: Anna knallte die Tuer ins Schloss, ihre Haende zu Faeusten geballt. Techniken: Koerpersprache statt Emotion benennen. Reaktionen anderer zeigen. Sinneswahrnehmungen einsetzen. Dialog statt Zusammenfassung. Wann Tell okay ist: Uebergaenge, unwichtige Informationen, Tempo erhoehen, Variation. Nicht alles muss gezeigt werden. Balance: Show fuer emotionale Schluesselmomente. Tell fuer Uebergaenge und Hintergrund. Anfaenger-Fehler: Dopplung - erst zeigen, dann erklaeren. Vertrau dem Leser. Fortgeschritten: Nicht nur Emotion zeigen, sondern Stimme und Perspektive. Wie nimmt dieser spezifische Charakter die Welt wahr? Filterwoerter vermeiden: Sie sah, er fuehlt, sie hoerte - direkt in die Wahrnehmung gehen. Nicht Sie sah den roten Ball sondern Der rote Ball rollte vorbei.",
},
KnowledgeArticle {
    id: "craft-tension",
    title: "Spannung und Konflikt",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["spannung", "konflikt", "tension", "drama", "stakes", "hindernisse"],
    content: "Spannung haelt Leser am Lesen. Konflikt ist der Motor der Geschichte. Konfliktebenen: Extern (Charakter vs Umwelt, Antagonist), Intern (Charakter vs Selbst), Interpersonal (Charakter vs Charakter). Beste Geschichten haben alle drei. Spannung erzeugen: Fragen aufwerfen und Antworten verzoegern. Dramatic Irony (Leser weiss mehr als Charakter). Ticking Clock. Erhoehe Stakes. Hindernisse. Micro-Tension: Auch in ruhigen Szenen kleine Spannungsquellen. Unausgesprochenes, Unbehagen, Anticipation. Stakes: Was steht auf dem Spiel? Muss persoenlich relevant sein. Welt retten ist gross, aber emotionale Stakes (Beziehung, Identitaet) sind oft staerker. Eskalation: Hindernisse werden schwieriger. Erfolge haben Kosten. Jeder Versuch verschlechtert die Lage, bis zum Wendepunkt. Fehler: Konflikt loest sich zu leicht, Stakes sind unklar, Protagonist ist passiv.",
},
KnowledgeArticle {
    id: "craft-voice",
    title: "Stimme und Stil",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["voice", "stimme", "stil", "ton", "prosa", "einzigartig"],
    content: "Voice ist der einzigartige Fingerabdruck eines Autors oder Charakters. Autor-Stimme: Dein natuerlicher Schreibstil. Entwickelt sich ueber Zeit. Nicht erzwingen. Charakter-Stimme: Wie dieser spezifische Charakter die Welt wahrnimmt und beschreibt. Elemente: Wortwahl (einfach/komplex, modern/archaisch), Satzlaenge, Rhythmus, Metaphern-Typ, Humor, Weltanschauung. Entwicklung: Viel lesen, viel schreiben, eigene Vorlieben erkennen. Was liest du gern? Das beeinflusst deine Stimme. Erzaehlton: Sarkastisch, ernsthaft, lyrisch, nüchtern, warmherzig. Muss zum Genre und zur Geschichte passen. Konsistenz: Voice muss durchgehend stimmig sein. Brueche fallen auf. Gefahr: Voice ueber Klarheit stellen. Stil darf Geschichte nicht ueberdecken. Authentisch: Versuche nicht jemand anderes zu sein. Deine natuerliche Stimme ist am staerksten wenn sie trainiert ist.",
},
KnowledgeArticle {
    id: "craft-worldbuilding",
    title: "Weltenbau",
    category: KnowledgeCategory::WritingCraft,
    keywords: &["worldbuilding", "weltenbau", "setting", "welt", "magie", "gesellschaft"],
    content: "Weltenbau schafft eine glaubwuerdige, konsistente Welt fuer die Geschichte. Eisberg-Prinzip: Autor weiss mehr als auf der Seite steht. Details werden benoetigt, aber nicht alle gezeigt. Integration: Weltenbau durch Handlung und Charakter zeigen, nicht durch Infodumps. Spezifische Details statt allgemeiner Beschreibung. Konsistenz: Regeln etablieren und einhalten. Konsequenzen durchdenken. Wie beeinflusst X den Alltag? Tiefe: Nicht nur Oberflaechliches (Karte, Namen), sondern auch Kultur, Oekonomie, Religion, Geschichte, Machtstrukturen. Magie: Sandersons Gesetze beachten. Grenzen und Kosten sind interessanter als Faehigkeiten. Relevanz: Weltenbau sollte Geschichte dienen, nicht umgekehrt. Nicht alles muss ins Buch. Fallstricke: Zu viel Exposition, inkonsistente Regeln, generisches Worldbuilding (Pseudo-Mittelalter), Welt ohne Vielfalt.",
},
KnowledgeArticle {
    id: "drama-character-arc",
    title: "Character Arc Typen",
    category: KnowledgeCategory::Dramaturgy,
    keywords: &["arc", "entwicklung", "charakter", "wandel", "transformation"],
    content: "Character Arcs beschreiben die innere Entwicklung des Protagonisten ueber die Geschichte. Positive Arc: Charakter ueberwindet Fehler, erreicht Need, waechst. Klassisch. Lie zu Truth. Held glaubt etwas Falsches, lernt Wahrheit. Negative Arc: Charakter faellt, wird schlechter, tragisch. Oft Villain Origin oder Tragedy. Truth zu Lie oder Lie zu Dunklerer Lie. Flat Arc: Charakter veraendert sich nicht, veraendert die Welt. Charakter kennt Truth, bringt sie anderen. Testing Arc: Glaube wird getestet, bestaetigt aber letztlich. Verbindung zu Plot: External Conflict spiegelt Internal Conflict. Aeussere Hindernisse zwingen innere Konfrontation. Want vs Need: Want ist bewusstes Ziel, Need ist was Charakter wirklich braucht. Arc ist die Reise von Want zu Need (oder Scheitern daran). Pro Charakter: Auch Nebencharaktere koennen Arcs haben, aber Fokus auf Protagonist.",
},
KnowledgeArticle {
    id: "drama-heros-journey",
    title: "Heldenreise (Heros Journey)",
    category: KnowledgeCategory::Dramaturgy,
    keywords: &["held", "reise", "journey", "campbell", "monomyth", "mythologie"],
    content: "Joseph Campbells Monomyth beschreibt universelle Stationen der Helden-Erzaehlung. 12 Stationen: 1) Gewoehnliche Welt, 2) Ruf zum Abenteuer, 3) Weigerung, 4) Begegnung mit Mentor, 5) Ueberschreiten der Schwelle, 6) Tests/Verbuendete/Feinde, 7) Vordringen zur innersten Hoehle, 8) Entscheidende Pruefung, 9) Belohnung, 10) Rueckweg, 11) Auferstehung (finale Pruefung), 12) Rueckkehr mit Elixier. Anwendung: Nicht jede Geschichte braucht alle Stationen. Reihenfole kann variieren. Metaphorisch verstehen - Hoehle kann innerer Konflikt sein. Kritik: Kann formelhaft wirken, westlich/maennlich zentriert. Alternativen: Heroines Journey (Murdock), Virgins Promise, verschiedene kulturelle Narrative. Staerken: Emotional resonant, erprobt, gibt klare Checkpoints. Nutzung: Als Analysewerkzeug und Inspirationsquelle, nicht als striktes Rezept.",
},
KnowledgeArticle {
    id: "drama-save-the-cat",
    title: "Save the Cat Beat Sheet",
    category: KnowledgeCategory::Dramaturgy,
    keywords: &["save the cat", "beat sheet", "snyder", "beats", "struktur"],
    content: "Blake Snyders Beat Sheet unterteilt die Drei-Akt-Struktur in 15 spezifische Beats. Opening Image (1%): Startbild, zeigt Ausgangslage. Theme Stated (5%): Thema wird angesprochen, Protagonist versteht es noch nicht. Set-Up (1-10%): Normale Welt, Protagonist, Fehler, Stakes. Catalyst (10%): Inciting Incident. Debate (10-20%): Protagonist zoegert. Break into Two (20%): Entscheidung, Eintritt in neue Welt. B Story (22%): Nebenhandlung, oft Love Interest, traegt Thema. Fun and Games (20-50%): Versprechen der Praemisse einloesen. Midpoint (50%): False Victory oder False Defeat, Stakes steigen. Bad Guys Close In (50-75%): Feinde ruecken naeher, Team broeckelt. All Is Lost (75%): Tiefpunkt, Whiff of Death. Dark Night of the Soul (75-80%): Emotionaler Tiefpunkt. Break into Three (80%): Loesung gefunden. Finale (80-99%): Endkampf in 5 Teilen. Final Image (99-100%): Gegenbild zum Opening, zeigt Wandel.",
},
KnowledgeArticle {
    id: "drama-scene-sequel",
    title: "Scene und Sequel (MRU)",
    category: KnowledgeCategory::Dramaturgy,
    keywords: &["scene", "sequel", "mru", "motivation", "reaktion", "szene"],
    content: "Scene-Sequel-Struktur nach Dwight Swain organisiert den Wechsel zwischen Aktion und Reaktion. Scene (Aktion): Goal (Ziel), Conflict (Hindernis), Disaster (Scheitern oder Twist). Protagonist will etwas, stoesst auf Widerstand, Ergebnis ist meist negativ oder kompliziert. Sequel (Reaktion): Reaction (emotionale Reaktion), Dilemma (Ueberlegung), Decision (Entscheidung). Protagonist verarbeitet, waegt ab, entscheidet naechsten Schritt. MRU (Motivation-Reaction Unit): Auf Mikro-Ebene: Erst Stimulus, dann Reaktion. Erst Gefuehl, dann Aktion. Tempo: Mehr Scene = schneller. Mehr Sequel = langsamer, introspektiver. Balance je nach Genre. Thriller: kurze Sequels. Literary: laengere Sequels. Nutzung: Nicht jede Szene braucht vollstaendiges Sequel. Komprimieren fuer Tempo. Aber Reaktionen nicht ganz weglassen - Leser braucht emotionale Checkpoints.",
},
KnowledgeArticle {
    id: "drama-stakes",
    title: "Stakes und Konsequenzen",
    category: KnowledgeCategory::Dramaturgy,
    keywords: &["stakes", "konsequenzen", "risiko", "verlust", "gefahr", "einsatz"],
    content: "Stakes definieren, was auf dem Spiel steht und warum es wichtig ist. Ebenen: Global (Welt retten), Personal (Beziehung, Leben), Internal (Identitaet, Seele). Beste Geschichten haben alle drei verbunden. Steigerung: Stakes sollten eskalieren. Jeder Versuch erhoehung das Risiko. Was als kleines Problem beginnt, wird existentiell. Konkret machen: Vage Stakes haben wenig Impact. Nicht die Welt sondern diese spezifische Person die wir kennen und lieben. Persoenlich: Selbst bei hohen aeusseren Stakes braucht Protagonist persoenlichen Grund zu kaempfen. Warum er speziell? Verhaeltnis Risiko/Belohnung: Was wird gewonnen, was verloren? Beide Seiten muessen klar sein. Zeigen: Stakes durch Konsequenzen zeigen. Wenn Stakes nie eintreten, verlieren sie Glaubwuerdigkeit. Manchmal muss jemand verlieren. Fehler: Stakes nur behauptet, keine persoenliche Verbindung, Held hat nichts zu verlieren.",
},
KnowledgeArticle {
    id: "drama-three-act",
    title: "Drei-Akt-Struktur",
    category: KnowledgeCategory::Dramaturgy,
    keywords: &["drei", "akt", "struktur", "aufbau", "dramaturgie", "klassisch"],
    content: "Die klassische Drei-Akt-Struktur teilt die Geschichte in Setup, Konfrontation und Aufloesung. Akt 1 (ca. 25%): Normale Welt, Protagonist, Inciting Incident (ca. 10-12%), Weigerung, Aufbruch in Akt 2. Akt 2 (ca. 50%): Steigende Hindernisse, Fun and Games, Midpoint (50% - alles aendert sich), Bad Guys Close In, All is Lost (ca. 75%), Dark Night of the Soul. Akt 3 (ca. 25%): Finale Konfrontation, Klimax, Aufloesung, Neue Normalitaet. Schluessel-Punkte: Inciting Incident startet die Handlung. Midpoint veraendert die Richtung. All is Lost ist der tiefste Punkt. Klimax ist der Hoehepunkt. Flexibilitaet: Dies ist Werkzeug, nicht Gesetz. Manche Geschichten brauchen andere Strukturen. Aber verstehe die Regeln bevor du sie brichst. Funktioniert fuer: Romane, Filme, Episoden, Kurzgeschichten (komprimiert).",
},
KnowledgeArticle {
    id: "fontaine-capabilities",
    title: "Was kann Fontaine?",
    category: KnowledgeCategory::FontaineIdentity,
    keywords: &["faehigkeiten", "capabilities", "kann", "hilfe", "funktion", "unterstuetzung"],
    content: "Meine Faehigkeiten als Schreibassistent umfassen: Brainstorming: Ideen entwickeln, What-If Szenarien, Plotmoeglichkeiten erkunden. Strukturierung: Handlungsboegen planen, Kapitel organisieren, Pacing analysieren. Charakterarbeit: Charaktere vertiefen, Motivation klaeren, Beziehungsdynamik entwickeln. Stilverbesserung: Formulierungen ueberarbeiten, Show dont Tell, Dialogverbesserung. Genre-Beratung: Konventionen und Erwartungen verschiedener Genres erklaeren. Feedback: Szenen analysieren, Staerken und Schwaechen identifizieren. Recherche-Unterstuetzung: Hintergrundinformationen zu Themen liefern (aus meinem Trainingswissen). Blockaden loesen: Schreibblockaden ueberwinden helfen, naechste Schritte vorschlagen. Was ich NICHT kann: Ich schreibe nicht fuer dich (ausser du bittest explizit um einen Entwurf). Ich urheberrechtlich geschuetztes Material kopiere ich nicht. Ich habe keine Internetverbindung fuer aktuelle Recherche.",
},
KnowledgeArticle {
    id: "fontaine-identity",
    title: "Wer ist Fontaine?",
    category: KnowledgeCategory::FontaineIdentity,
    keywords: &["fontaine", "wer", "ich", "du", "assistent", "ki", "ai", "name", "identitaet"],
    content: "Ich bin Fontaine, dein persoenlicher Schreibassistent in FeatherWorks Author. Mein Name vereint drei Bedeutungen: Fontaine (franzoesisch fuer Quelle - Quelle der Inspiration), Fontaene (der sprudelnde Ideenstrom), und Theodor Fontane (der grosse deutsche Romancier). Ich bin hier um dir beim Schreiben zu helfen: Ideen entwickeln, Blockaden ueberwinden, Handlung strukturieren, Charaktere vertiefen, Stil verbessern. Ich ersetze nicht deine Kreativitaet - ich unterstuetze sie. Du bist der Autor, ich bin das Werkzeug. Meine Staerken: Ich kenne Genres, Tropes, Dramaturgie, Handwerk. Ich kann analysieren, vorschlagen, Fragen stellen. Aber letztlich entscheidest du. Jede Geschichte ist deine Geschichte. Ich habe keinen Zugang zum Internet waehrend unserer Gespraeche - alles bleibt lokal auf deinem Computer. Deine Geschichten gehoeren dir.",
},
KnowledgeArticle {
    id: "fontaine-privacy",
    title: "Datenschutz bei Fontaine",
    category: KnowledgeCategory::FontaineIdentity,
    keywords: &["datenschutz", "privacy", "lokal", "offline", "daten", "sicherheit", "speichern"],
    content: "Deine Privatsphaere ist mir wichtig. FeatherWorks Author und ich (Fontaine) arbeiten primaer lokal auf deinem Computer. Deine Texte werden nicht automatisch an Server gesendet. Lokaler Modus: Wenn du ein lokales Sprachmodell verwendest (wie Llama, Mistral), verlassen deine Daten niemals deinen Computer. Voellig offline moeglich. Cloud-Optionen: Wenn du Cloud-Provider wie Claude oder GPT aktivierst, werden nur die fuer die Anfrage noetigen Daten verschluesselt uebertragen. Nie mehr als noetig. Speicherung: Deine Projekte werden in deinem lokalen Dateisystem gespeichert. Du behältst die volle Kontrolle. Keine versteckten Kopien. Keine Telemetrie: Wir sammeln keine Nutzungsdaten ohne deine explizite Zustimmung. Deine Schreibgewohnheiten sind deine Sache. Philosophie: Datenschutz ist kein Feature, sondern ein Grundrecht. Kreatives Schreiben ist intim - deine Worte gehoeren dir.",
},
KnowledgeArticle {
    id: "genre-contemporary",
    title: "Gegenwartsroman",
    category: KnowledgeCategory::Genre,
    keywords: &["gegenwart", "contemporary", "realistisch", "alltag", "beziehung", "familie"],
    content: "Der Gegenwartsroman spielt in der heutigen Zeit ohne uebernatuerliche Elemente. Fokus auf realistische Charaktere in nachvollziehbaren Situationen. Themen: Beziehungen, Familie, Karriere, Identitaet, gesellschaftliche Fragen. Women's Fiction: Fokus auf weibliche Protagonist, emotionale Reise, nicht notwendigerweise romantisch. Book Club Fiction: Diskussionswuerdige Themen, moralische Fragen. Family Saga: Mehrere Generationen, Familiengeheimnisse. Domestic Fiction: Ehe, Elternschaft, Alltag. Chick Lit: Leichter Ton, Humor, urbanes Setting, Selbstfindung. Beach Read: Unterhaltsam, eskapistisch, oft romantisch. Die Kunst liegt im Finden des Universellen im Spezifischen. Authentische Dialoge sind entscheidend. Aktuelle Technologie und Kultur einbeziehen, aber nicht datieren. Emotionale Wahrheit wichtiger als dramatische Ereignisse. Fallstricke: Zu alltaeglich ohne Konflikt, datierte Referenzen, Nabelschau.",
},
KnowledgeArticle {
    id: "genre-cozy",
    title: "Cozy Fantasy und Cozy Mystery",
    category: KnowledgeCategory::Genre,
    keywords: &["cozy", "gemuetlich", "niedrige stakes", "comfort", "wholesome", "cottagecore"],
    content: "Cozy-Genres bieten Komfort ohne hohe Stakes oder explizite Gewalt. Cozy Fantasy: Alltaegliche Magie, kleine Gemeinschaften, Problemloesung durch Freundlichkeit (Legends and Lattes). Cozy Mystery: Amateurdetektiv, oft in Kleinstadt, keine graphische Gewalt, sympathische Gemeinschaft. Elemente: Warme Atmosphaere, essen/trinken als Motiv (Baeckerei, Teeladen, Buchhandlung), Haustiere, saisonale Settings. Antagonisten sind eher laestig als boese. Stakes: Persoenlich statt weltrettend. Protagonist will Ziel erreichen, nicht Welt retten. Cottagecore-Aesthetik: Natur, Handarbeit, Langsamkeit. Romances sind slow-burn und sweet. Konflikt kommt von Missverstaendnissen, nicht von Gewalt. Der Ton ist eskapistisch, heilsam, nostalgisch. Fehler: Zu viel Konflikt, zu duestere Themen, zynische Charaktere.",
},
KnowledgeArticle {
    id: "genre-dark-romance",
    title: "Dark Romance",
    category: KnowledgeCategory::Genre,
    keywords: &["dark", "dunkel", "morally grey", "villain", "toxic", "antiheldin", "antiheld"],
    content: "Dark Romance enthaealt dunklere Themen und moralisch ambivalente Protagonisten. Trigger Warnings sind Standard und erwartet. Typische Elemente: Machtungleichgewicht, Obsession, Possessivitaet, Rache, Mafia/Cartel, Captive, Enemies. Love Interest ist oft Antiheld oder Villain. Wichtig: Consent und Agency muessen letztlich gegeben sein, auch wenn die Reise dahin dunkel ist. Es ist Fiktion, keine Anleitung. Unterschied zu Romance: HEA nicht garantiert, dunklere Konflikte, explizitere Inhalte. Subgenres: Mafia Romance, Bully Romance, Captive Romance, Monster Romance. Der Appeal liegt im sicheren Erkunden von Tabuthemen. Emotional safety des Lesers durch fiktionale Distanz. Balance: Genug Dunkle fuer Genre-Fans, aber nicht gratuitous. Fallstricke: Romanticizing abuse ohne Reflexion, kein character growth, Schock ohne Substanz.",
},
KnowledgeArticle {
    id: "genre-fantasy",
    title: "Fantasy",
    category: KnowledgeCategory::Genre,
    keywords: &["fantasy", "magie", "weltenbau", "elfen", "drachen", "magiesystem", "epic"],
    content: "Fantasy definiert sich durch uebernatuerliche Elemente, die im Rahmen der erzaehlten Welt als real gelten. Kernelemente: Magiesysteme (hart/weich), Weltenbau, mythologische Elemente. High/Epic Fantasy: Sekundaerwelt, grosser Konflikt (Tolkien, Sanderson). Low Fantasy: Unsere Welt mit magischen Elementen. Urban Fantasy: Magie in moderner Grossstadt. Dark Fantasy: Duestere Atmosphaere, moralische Ambiguitaet. Romantasy: Fantasy mit zentraler Liebesgeschichte. Cozy Fantasy: Gemuetlich, niedrige Stakes. Portal Fantasy: Protagonist betritt magische Welt. Wichtig: Konsistente Regeln fuer Magie. Sandersons Gesetze: 1) Die Faehigkeit, Konflikte mit Magie zu loesen, ist proportional zum Verstaendnis der Leser fuer die Magie. 2) Limitationen sind interessanter als Faehigkeiten. 3) Erweitere, was du hast, bevor du Neues hinzufuegst. Haeufige Fallstricke: Ueberladener Weltenbau, Deus ex Machina durch Magie, generische Elfen/Zwerge.",
},
KnowledgeArticle {
    id: "genre-historical",
    title: "Historischer Roman",
    category: KnowledgeCategory::Genre,
    keywords: &["historisch", "geschichte", "epoche", "mittelalter", "viktorianisch", "regency"],
    content: "Der historische Roman spielt in einer vergangenen Epoche und nutzt historische Authentizitaet als Kulisse. Zeitraeume: Antike, Mittelalter, Renaissance, Regency, Viktorianisch, Weltkriege, etc. Balance: Genug Details fuer Atmosphaere, nicht so viel dass es lehrbuchartig wird. Sprache: Moderner Lesefluss mit historischem Flair, keine falschen Archaismen. Recherche ist essentiell: Alltagsleben, Standesunterschiede, Technologie, Sprache, Kleidung, Essen. Historische Figuren: Vorsicht bei realen Personen, Fakten respektieren. Anacronismen vermeiden: Keine modernen Konzepte in historischen Koepfen. Was war damals normal, was skandaloes? Soziale Normen verstehen und zeigen. Fiktive Charaktere koennen an historischen Ereignissen teilnehmen, aber Geschichte nicht umschreiben. Subgenres: Historical Romance, Historical Mystery, Alternative History. Fehler: Wikipedia-Dumps, moderne Moral in historischen Settings, Anachronismen, Stereotypen.",
},
KnowledgeArticle {
    id: "genre-horror",
    title: "Horror",
    category: KnowledgeCategory::Genre,
    keywords: &["horror", "angst", "grusel", "uebernatuerlich", "monster", "psychohorror"],
    content: "Horror zielt darauf ab, Angst, Unbehagen oder Ekel beim Leser zu erzeugen. Kernelemente: Bedrohung (uebernatuerlich oder menschlich), Atmosphaere, Verletzlichkeit der Charaktere. Supernatural Horror: Geister, Daemonen, Flueche. Psychological Horror: Angst kommt von innen, Wahnsinn, Paranoia. Body Horror: Koerperliche Transformation oder Verstoemmelung. Cosmic Horror: Lovecraft-Stil, Bedeutungslosigkeit des Menschen. Slasher: Serienkiller, hoher Bodycount. Gothic Horror: Alte Herrenhaeuser, Familiengeheimnisse. Die Angst muss persoenlich relevant sein fuer die Charaktere. Langsamer Aufbau ist effektiver als Jump Scares. Das Unbekannte ist scarier als das Enthüllte. Isolation verstaerkt Horror. Alltaegliches wird unheimlich (Uncanny). Zeige wenig, suggeriere viel. Humor kann als Ventil dienen, aber vorsichtig dosieren. Fehler: Zu fruehe Monster-Enthuellung, dumme Opfer, Erklaerung des Unerklärlichen.",
},
KnowledgeArticle {
    id: "genre-literary",
    title: "Literarische Fiktion",
    category: KnowledgeCategory::Genre,
    keywords: &["literarisch", "anspruchsvoll", "charakter", "stil", "thema", "literary fiction"],
    content: "Literarische Fiktion priorisiert Sprache, Charaktertiefe und thematische Komplexitaet ueber Plot. Merkmale: Nuancierte Prosa, psychologische Tiefe, moralische Ambiguitaet, gesellschaftliche Themen. Weniger plotgetrieben, mehr charaktergetrieben. Innere Entwicklung wichtiger als aeussere Ereignisse. Thematische Dichte: Jedes Element traegt zur Bedeutung bei. Symbolik und Metaphorik sind zentral. Mehrere Interpretationsebenen. Der Stil ist nicht Dekoration, sondern Inhalt. Experimentierfreude: Unkonventionelle Struktur, Perspektiven, Zeitebenen. Offene Enden sind akzeptabel. Epiphanie: Moment der Erkenntnis oder Veraenderung. Upmarket Fiction: Literarischer Stil mit Genre-Plot (zugaenglicher). Unterschied zur Genre-Fiktion: Literarisch fragt 'Was bedeutet das?', Genre fragt 'Was passiert als naechstes?'. Beide koennen sich ueberscneiden. Fallstricke: Praetentioes, handlungsarm, unnahbare Charaktere, Stil ueber Substanz.",
},
KnowledgeArticle {
    id: "genre-mystery",
    title: "Krimi und Mystery",
    category: KnowledgeCategory::Genre,
    keywords: &["krimi", "mystery", "detektiv", "mord", "ermittlung", "raetsel", "whodunit"],
    content: "Mystery und Krimi drehen sich um die Aufklaerung eines Verbrechens, meist Mord. Whodunit: Klassisches Raetsel, Leser kann mitraten (Christie). Hardboiled: Zynischer Ermittler, korrupte Welt (Chandler). Cozy Mystery: Amateurdetektiv, keine explizite Gewalt, Gemeinschaft. Police Procedural: Realistische Polizeiarbeit. Noir: Duestere Atmosphaere, moralisch ambivalente Figuren. Fair Play: Alle Hinweise muessen dem Leser zugaenglich sein. Der Moerder muss frueh eingefuehrt werden. Red Herrings lenken ab, aber unfaire Tricks sind tabu. Clue-Planting: Hinweise verstecken, ohne zu betruegen. Der Ermittler braucht eine einzigartige Methode oder Perspektive. Das Verbrechen muss es wert sein, aufgeklaert zu werden. Fallstricke: Zufaellige Aufklaerung, offensichtlicher Taeter, unrealistische Forensik, uebersehene offensichtliche Ermittlungsschritte.",
},
KnowledgeArticle {
    id: "genre-regency",
    title: "Regency Romance",
    category: KnowledgeCategory::Genre,
    keywords: &["regency", "historisch", "england", "duke", "ton", "season", "bridgerton"],
    content: "Regency Romance spielt im England der Regentschaft (1811-1820), erweitert oft auf 1795-1837. Inspiriert von Jane Austen. Gesellschaftliche Konventionen als Hindernis fuer die Liebe. The Ton: Hochadel und Gentry, Ballsaison, Heiratsmarkt. Typische Figuren: Rakes, Dukes, Wallflowers, Bluestockings, Dowagers. Setting: Ballrooms, Country Houses, Hyde Park, Almacks. Sprache: Formal aber lesbar, keine falschen Archaismen. Historische Genauigkeit in Kleidung, Etikette, Titeln. Tropes: Marriage of Convenience, Rake Reformed, Bluestocking Heroine, Scandal. Bridgerton-Effekt: Modernere, diversere Interpretationen. Sexuelle Spannung trotz (oder wegen) strenger Regeln. Ruination als echte Gefahr. Fehler: Anachronismen, falsche Titel, moderne Moral in historischen Koepfen, ignorieren von Klassenschranken.",
},
KnowledgeArticle {
    id: "genre-romance",
    title: "Liebesroman (Romance)",
    category: KnowledgeCategory::Genre,
    keywords: &["romance", "liebe", "liebesroman", "beziehung", "romantik", "hea", "hfn"],
    content: "Der Liebesroman stellt die romantische Beziehung zwischen zwei (oder mehr) Protagonisten ins Zentrum. Kernversprechen: Eine emotionale Reise mit garantiert positivem Ende (HEA = Happily Ever After oder HFN = Happy For Now). Die Liebesgeschichte muss die Haupthandlung sein, nicht Nebenplot. Lesererwartung: Hoffnung, emotionale Katharsis, Erfuellung. Strukturell folgen Romance-Romane oft dem Beat Sheet: Meet Cute, Wachsende Naehe, Schwarzer Moment (Trennung), Grand Gesture, Reunion. Subgenres: Contemporary Romance (Gegenwart), Historical Romance (historisch), Paranormal Romance (uebernatuerlich), Romantic Suspense (mit Thriller-Elementen), Erotic Romance (explizit). Typische Tropes: Enemies to Lovers, Fake Dating, Second Chance, Forbidden Love, Friends to Lovers. Haeufige Fehler: Zu schnelle Entwicklung, fehlende Chemie, unlogische Konflikte. Staerken: Tiefe Charakterentwicklung, emotionale Resonanz, universelles Thema.",
},
KnowledgeArticle {
    id: "genre-romantasy",
    title: "Romantasy",
    category: KnowledgeCategory::Genre,
    keywords: &["romantasy", "fantasy", "romance", "magie", "liebe", "fae", "court"],
    content: "Romantasy verbindet Fantasy mit Romance als gleichwertige Elemente. Beide Genres sind zentral, nicht nur Nebenhandlung. Typisch: Fae-Hoefe, Magiesysteme, Gefaehrten-Trope (Mates), langsam aufbauende Romantik. Spicier Romantasy: Explizitere romantische Szenen (Maas, Armentrout). Clean Romantasy: Fade-to-black. Weltenbau ist wichtig, aber nicht so komplex wie in Epic Fantasy. Die romantische Entwicklung folgt Fantasy-Beats: Gefahr bringt zusammen, Magie als Verbindung. Populaere Elemente: Grumpy/Sunshine, Forced Proximity durch Quest, Touch her and die, Found Family. Oft Reihenformat mit durchgehender Romantik. Balance: Fantasy-Stakes muessen echt sein, nicht nur Kulisse. Romantik muss verdient sein, nicht nur wegen Prophezeiung. Fallstricke: Magie loest alle Probleme, instalove ohne Chemie, generisches Worldbuilding.",
},
KnowledgeArticle {
    id: "genre-scifi",
    title: "Science Fiction",
    category: KnowledgeCategory::Genre,
    keywords: &["scifi", "science fiction", "zukunft", "raumschiff", "technologie", "dystopie", "utopie"],
    content: "Science Fiction extrapoliert wissenschaftliche oder technologische Entwicklungen in die Zukunft oder alternative Realitaeten. Kernfrage: Was waere wenn? Hard SF: Wissenschaftlich akkurat (Clarke, Weir). Soft SF: Fokus auf gesellschaftliche Auswirkungen (Le Guin, Dick). Space Opera: Epische Abenteuer im All (Star Wars-Stil). Cyberpunk: High-Tech, Low-Life, Megacorporations. Dystopie: Warnende Zukunftsvision (Orwell, Atwood). Military SF: Fokus auf Kriegsfuehrung und Militaer. Zeitreise: Paradoxien und Konsequenzen. Wichtig: Interne Konsistenz der Technologie. Die Technologie sollte die Handlung ermoeglichen, nicht dominieren. Novum: Das eine neue Element, das alles veraendert. Frag dich: Wie veraendert diese Technologie Gesellschaft, Beziehungen, Identitaet? Haeufige Fehler: Technobabble ohne Substanz, moderne Menschen in Zukunftskulissen, ignorierte gesellschaftliche Folgen der Technologie.",
},
KnowledgeArticle {
    id: "genre-thriller",
    title: "Thriller",
    category: KnowledgeCategory::Genre,
    keywords: &["thriller", "spannung", "suspense", "action", "gefahr", "jagd"],
    content: "Der Thriller erzeugt anhaltende Spannung durch Bedrohung, Zeitdruck und hohe Einsaetze. Kernelemente: Protagonist in Gefahr, maechtiger Antagonist, eskalierende Spannung. Unterschied zum Krimi: Im Krimi wird ein Verbrechen aufgeklaert, im Thriller wird eines verhindert oder ueberlebt. Psychothriller: Mentale Spiele, unzuverlaessige Wahrnehmung. Legal Thriller: Gerichtssaal, Anwaelte (Grisham). Medical Thriller: Medizinische Bedrohung (Cook, Gerritsen). Political Thriller: Verschwoerungen, Macht. Domestic Thriller: Gefahr im eigenen Heim. Techniken: Cliffhanger an Kapitelenden, Ticking Clock (Zeitdruck), Multiple POV fuer dramatische Ironie, Red Herrings, Plottwists. Pacing ist kritisch: Atempausen zwischen Actionsequenzen. Sympathischer Held mit klaren Schwaechen. Antagonist muss glaubwuerdig ueberlegen sein. Fehler: Zu fruehe Aufloesung, unlogische Entscheidungen, Deus ex Machina.",
},
KnowledgeArticle {
    id: "genre-urban-fantasy",
    title: "Urban Fantasy",
    category: KnowledgeCategory::Genre,
    keywords: &["urban", "stadt", "modern", "versteckte welt", "uebernatuerlich", "paranormal"],
    content: "Urban Fantasy spielt in einer modernen Stadt mit uebernatuerlichen Elementen. Die magische Welt existiert parallel zur Realitaet, oft versteckt. Masquerade: Normalos wissen nichts von Magie. Protagonist entdeckt verborgene Welt. Noir-Einfluss: Oft detektivische Elemente, moralisch graue Zonen. Typische Wesen: Vampire, Werwolfe, Fae, Hexen, Daemonen. Setting: Grossstadt bei Nacht, Clubs, Unterwelt. Serien-Format dominant: Dresden Files, Kate Daniels. Staerkere Action-Elemente als High Fantasy. Humor oft praesent. Romantische Subplot haeufig. Unterschied zu Paranormal Romance: In UF ist Romance Subplot, nicht Hauptfokus. Worldbuilding: Wie funktioniert Magie in moderner Welt? Wie bleibt sie geheim? Was passiert, wenn enthüllt? Fehler: Vergessen der modernen Technologie, zu viele Wesen gleichzeitig einfuehren.",
},
KnowledgeArticle {
    id: "genre-womens-fiction",
    title: "Frauenroman (Womens Fiction)",
    category: KnowledgeCategory::Genre,
    keywords: &["women", "frauen", "frauenroman", "weiblich", "emanzipation", "selbstfindung"],
    content: "Women's Fiction fokussiert auf die emotionale Reise einer weiblichen Protagonistin. Nicht zwingend romantisch - die zentrale Beziehung kann zu sich selbst, Familie oder Freunden sein. Themen: Selbstfindung, Neuanfang, Mutter-Tochter-Beziehungen, Freundschaft, Karriere, Lebensuebergaenge. Zielgruppe: Primaer erwachsene Frauen, aber nicht exklusiv. Unterschied zu Romance: Romantische Beziehung ist optional, nicht zentral. Das HEA ist persoenliches Wachstum. Upmarket Women's Fiction: Literarischer Stil, tiefere Themen. Commercial Women's Fiction: Zugaenglicher, plotorientierter. Beach Reads: Leicht, unterhaltsam, Sommer. Book Club Picks: Diskussionsstoff, emotionale Tiefe. Generationenroman: Muetter, Toechter, Grossmuetter. Wichtig: Authentische weibliche Stimme, keine Stereotypen, Agentur der Protagonistin. Sie loest ihre Probleme selbst. Fallstricke: Maennliche Rettung, passive Heldin, Kitsch, Klischees.",
},
KnowledgeArticle {
    id: "genre-ya",
    title: "Young Adult (YA)",
    category: KnowledgeCategory::Genre,
    keywords: &["young adult", "ya", "jugend", "teenager", "coming of age", "jugendbuch"],
    content: "Young Adult richtet sich an Leser von 12-18, wird aber breit gelesen. Protagonist ist typischerweise 14-18 Jahre alt. Themen: Identitaet, erste Liebe, Zugehoerigkeit, Rebellion gegen Autoritaet, Erwachsenwerden. Voice ist entscheidend: Authentisch jugendlich ohne herablassend zu sein. Keine Belehrungen. Coming-of-Age: Protagonist entwickelt sich, trifft eigene Entscheidungen. Hohe emotionale Intensitaet, aber nicht melodramatisch. Schnelles Pacing, kurze Kapitel. YA Fantasy: Hunger Games, Divergent-Stil. YA Contemporary: Realistische Probleme (Green, Dessen). YA Romance: Erste Liebe im Fokus. Crossover Appeal: Erwaschsene lesen auch YA. Unterschied zu Middle Grade (8-12): Komplexere Themen, romantische Elemente, dunklere Toene erlaubt. Fehler: Erwachsene Stimme, uebertriebener Slang, Moralisieren, unterschaetzte Intelligenz der Leser, Erwachsene loesen Probleme fuer Teens.",
},
KnowledgeArticle {
    id: "lang-grammatik",
    title: "Deutsche Grammatik fuer Autoren",
    category: KnowledgeCategory::Language,
    keywords: &["grammatik", "deutsch", "konjunktiv", "tempus", "kasus", "syntax"],
    content: "Grammatik als Werkzeug, nicht als Fessel. Tempus: Praeteritum ist Standard in deutscher Erzaehlung (anders als englisches Past Tense vs. Present). Praesens fuer Unmittelbarkeit, selten aber wirkungsvoll. Konjunktiv: Konjunktiv I fuer indirekte Rede (Er sagte, er sei muede), Konjunktiv II fuer Irrealis und hoefliche Distanz (Wenn ich koennte, wuerde ich). Stilistische Wahl. Passiv: Oft vermeiden fuer aktivere Prosa, aber legitimes Stilmittel (Der Mann wurde erschossen - Taeter unbekannt/unwichtig). Nebensaetze: Hypotaxe (verschachtelt) vs. Parataxe (Hauptsaetze). Verschachtelung erschwert Lesefluss, kann aber Komplexitaet spiegeln. Kommata: Deutsche Kommaregeln komplex, aber wichtig. Komma vor erweitertem Infinitiv optional aber empfohlen. Wortstellung: Verb-Zweit im Hauptsatz, Verb-Ende im Nebensatz. Variation moeglich fuer Betonung.",
},
KnowledgeArticle {
    id: "lang-interpunktion",
    title: "Interpunktion und Typografie",
    category: KnowledgeCategory::Language,
    keywords: &["interpunktion", "typografie", "gedankenstrich", "anfuehrungszeichen", "punkt", "komma"],
    content: "Satzzeichen sind Werkzeuge des Rhythmus und der Klarheit. Gedankenstrich vs. Bindestrich: Gedankenstrich (–) fuer Einschuebe und Pausen, Bindestrich (-) fuer Wortkopplung. Deutsche Anfuehrungszeichen: Unten oeffnend, oben schliessend (nicht englisch). Alternativ Guillemets nach innen zeigend. Auslassungspunkte: Drei Punkte (...) fuer Abbruch, Zoegern, Verschweigen. Kein Leerzeichen davor wenn Wort abbricht. Ausrufezeichen: Sparsam! Zu viele schwaechten die Wirkung! Semikolon: Verbindet verwandte Hauptsaetze, stilistisch anspruchsvoll, heute seltener. Doppelpunkt: Ankuendigung, Erklaerung, vor woertlicher Rede. Absaetze: Strukturieren den Text, neue Idee = neuer Absatz, Dialog = jeder Sprecher neuer Absatz. Typografie: Keine Unterstreichung (veraltet), kursiv fuer Betonung und Gedanken, fett sparsam.",
},
KnowledgeArticle {
    id: "lang-wortwahl",
    title: "Wortwahl und Wortschatz",
    category: KnowledgeCategory::Language,
    keywords: &["wortwahl", "wortschatz", "synonym", "konkret", "abstrakt", "praezision"],
    content: "Die richtige Wortwahl macht Prosa lebendig und praezise. Konkret vor abstrakt: Eiche statt Baum, fluestern statt sagen, rot statt farbig. Spezifische Details verankern. Verben: Starke Verben tragen mehr als schwache. Gehen -> schlendern, hasten, stolzieren. Verben der Bewegung und Wahrnehmung. Adjektive: Sparsam einsetzen, nur wenn sie Information tragen. Rotes Blut ist redundant. Adverbien: Oft Zeichen schwacher Verben (Sie ging schnell -> Sie hastete). Aber nicht dogmatisch vermeiden. Register: Umgangssprache, Standardsprache, gehobene Sprache - je nach Szene und Figur. Figurensprache muss zur Figur passen. Neologismen: Neue Woerter erfinden fuer Fantasy/SciFi, aber sparsam und intuitiv verstaendlich. Cliches: Abgedroschene Wendungen vermeiden (rabenschwarze Nacht). Frische Bilder finden oder schlicht bleiben.",
},
KnowledgeArticle {
    id: "lit-charakterisierung",
    title: "Literarische Charakterisierung",
    category: KnowledgeCategory::Literature,
    keywords: &["charakterisierung", "figur", "direkt", "indirekt", "flach", "rund"],
    content: "Charakterisierung macht Figuren lebendig. Direkte Charakterisierung: Erzaehler oder andere Figuren beschreiben explizit (Er war ein ehrlicher Mann). Indirekte Charakterisierung: Leser schliesst aus Handlungen, Sprache, Gedanken, Aussehen, Umgebung. E.M. Forster: Flat Characters (eindimensional, ein Merkmal) vs. Round Characters (komplex, widerspruchlich, entwicklungsfaehig). Statische vs. Dynamische Figuren: Veraendern sie sich? Foil Characters: Kontrastfiguren die Protagonist spiegeln oder beleuchten. Psychologische Tiefe durch: Inneren Monolog, Erlebte Rede, Widersprueche zwischen Wort und Tat. Zeigesche Redewiedergabe: Direkte, indirekte, erlebte Rede. Typen vs. Individuen: Archetypen geben Wiedererkennbarkeit, Individualitaet gibt Leben.",
},
KnowledgeArticle {
    id: "lit-intertextualitaet",
    title: "Intertextualitaet",
    category: KnowledgeCategory::Literature,
    keywords: &["intertextualitaet", "bezug", "zitat", "anspielung", "parodie", "pastiche"],
    content: "Intertextualitaet bezeichnet Bezuege zwischen Texten. Jeder Text existiert im Dialog mit anderen. Typen: Zitat (woertliche Uebernahme), Anspielung (impliziter Verweis), Parodie (komische Nachahmung), Pastiche (stilistische Nachahmung), Adaption (Neuerzaehlung), Fortsetzung. Markiert vs. Unmarkiert: Offene Zitate vs. versteckte Referenzen. Palimpsest (Genette): Text als Schicht ueber frueheren Texten. Funktionen: Bedeutungsanreicherung, Hommage, Kritik, Spiel mit Erwartungen. Retelling: Maerchen, Mythen, Klassiker neu erzaehlt (Circe, The Song of Achilles). Archetypen als intertextueller Bezug: Unbewusste Anknuepfung an Urmuster. Vorsicht: Zu viele Referenzen koennen elitaer wirken oder von der eigenen Geschichte ablenken.",
},
KnowledgeArticle {
    id: "lit-narratologie",
    title: "Narratologie (Erzaehltheorie)",
    category: KnowledgeCategory::Literature,
    keywords: &["narratologie", "erzaehltheorie", "genette", "stanzel", "erzaehler", "fokalisierung"],
    content: "Narratologie ist die wissenschaftliche Untersuchung von Erzaehlstrukturen. Gerard Genette praegte zentrale Begriffe: Diegese (erzaehlte Welt), Fokalisierung (Perspektive: null/intern/extern), Stimme (wer erzaehlt), Modus (wie wird erzaehlt). Zeit: Ordnung (Analepse=Rueckblende, Prolepse=Vorausschau), Dauer (Szene, Summary, Ellipse, Pause), Frequenz (singulativ, repetitiv, iterativ). Franz Stanzel: Erzaehlsituationen - auktorial (allwissend), personal (figurengebunden), Ich-Erzaehler. Unterscheidung: Story (Was passiert) vs. Discourse (Wie wird es erzaehlt). Unreliable Narrator (Wayne Booth): Erzaehler dessen Darstellung nicht vertrauenswuerdig ist. Metalepse: Durchbrechen der Erzaehlebenen. Anwendung: Bewusste Wahl der Erzaehlmittel verstaerkt Wirkung.",
},
KnowledgeArticle {
    id: "lit-poetik",
    title: "Poetik und Literaturtheorie",
    category: KnowledgeCategory::Literature,
    keywords: &["poetik", "aristoteles", "katharsis", "mimesis", "literaturtheorie", "gattung"],
    content: "Poetik fragt: Was macht Literatur aus? Wie wirkt sie? Aristoteles (Poetik): Mimesis (Nachahmung), Katharsis (Reinigung durch Mitleid und Furcht), Einheit von Handlung/Zeit/Ort. Gattungstheorie: Epik (erzaehlend), Dramatik (darstellend), Lyrik (gefuehlsbetonend). Moderne Theorien: Formalismus (Literarizitaet), Strukturalismus (Tiefenstrukturen), Rezeptionsaesthetik (Leserrolle), Dekonstruktion (Bedeutungsinstabilitaet). Gustav Freytag: Pyramidenmodell des Dramas (Exposition, Steigerung, Hoehepunkt, Fall, Katastrophe). Unterscheidung: Showing (szenisch) vs. Telling (berichtend). Fiktionalitaet: Der Vertrag zwischen Autor und Leser, das Erzaehlte als wahr zu behandeln. Suspension of Disbelief: Bereitschaft, Unglaubwuerdiges zu akzeptieren.",
},
KnowledgeArticle {
    id: "lit-raum",
    title: "Raum und Setting",
    category: KnowledgeCategory::Literature,
    keywords: &["raum", "setting", "ort", "atmosphaere", "chronotopos", "schauplatz"],
    content: "Der literarische Raum ist mehr als Kulisse - er traegt Bedeutung. Funktionen: Atmosphaere schaffen, Charakter spiegeln, Thema verkoerpern, Handlung ermoeglichen. Chronotopos (Bachtin): Untrennbare Einheit von Zeit und Raum (die Strasse als Ort der Begegnung). Typen: Realistische Orte, Phantastische Welten, Symbolische Raeume (das Schloss, der Wald, die Stadt). Beschreibung: Was nimmt der POV-Charakter wahr? Spezifische Details statt generischer Beschreibung. Kontrastsettings: Innen/Aussen, Hell/Dunkel, Sicher/Gefaehrlich. Pathetic Fallacy: Wetter spiegelt Emotionen (Sturm bei Drama). Raumwechsel als Strukturelement: Kapitel nach Orten. Setting als Konfliktquelle: Wueste, eingeschneite Huette, feindliches Territorium. Der Raum sollte die Geschichte beeinflussen, nicht nur rahmen.",
},
KnowledgeArticle {
    id: "lit-rhetorik",
    title: "Rhetorik und Stilmittel",
    category: KnowledgeCategory::Literature,
    keywords: &["rhetorik", "stilmittel", "metapher", "ironie", "anapher", "figuren"],
    content: "Rhetorik ist die Kunst der wirkungsvollen Rede, ihre Mittel gelten auch fuer Prosa. Tropen (Bedeutungsverschiebung): Metapher (Bedeutungsuebertragung), Metonymie (Ersetzung durch Verwandtes), Synekdoche (Teil fuer Ganzes), Ironie (Gegenteil des Gemeinten). Figuren (Anordnung): Anapher (Wiederholung am Satzanfang), Chiasmus (Kreuzstellung), Klimax (Steigerung), Parallelismus (Gleichbau), Antithese (Gegensatz). Klangfiguren: Alliteration, Assonanz, Onomatopoesie. Drei Redestile: genus humile (schlicht), genus medium (mittel), genus grande (erhaben). Aristoteles: Ethos (Glaubwuerdigkeit), Pathos (Emotion), Logos (Argument). Fuer Autoren: Stilmittel gezielt einsetzen, nicht anhaeufen. Die beste Rhetorik ist unsichtbar.",
},
KnowledgeArticle {
    id: "lit-stilistik",
    title: "Stilistik",
    category: KnowledgeCategory::Literature,
    keywords: &["stilistik", "stil", "register", "ton", "diktion", "syntax"],
    content: "Stilistik analysiert sprachliche Gestaltungsmittel und ihre Wirkung. Stilebenen: hoch (formell, literarisch), mittel (Standard), niedrig (umgangssprachlich, dialektal). Register: situationsabhaengige Sprachvarietaet (Fachsprache, Jugendsprache, etc.). Diktion: Wortwahl - konkret/abstrakt, einfach/komplex, anglo-saechsisch/latinisiert. Syntax: Satzlaenge, Satzbau (parataktisch=Hauptsaetze, hypotaktisch=Nebensaetze), Rhythmus. Figurenrede vs. Erzaehlerrede: Stilwechsel charakterisiert. Erlebte Rede: Verschmelzung von Erzaehler- und Figurenperspektive. Stilbruch: Bewusster Wechsel als Mittel. Stilanalyse-Fragen: Welche Woerter? Welche Saetze? Welche Bilder? Welche Wirkung? Stilentwicklung braucht viel Lesen und Schreiben.",
},
KnowledgeArticle {
    id: "lit-symbolik",
    title: "Symbolik und Motivik",
    category: KnowledgeCategory::Literature,
    keywords: &["symbol", "motiv", "leitmotiv", "allegorie", "metapher", "bildlichkeit"],
    content: "Symbole und Motive tragen Bedeutung ueber den woertlichen Sinn hinaus. Symbol: Konkretes Objekt steht fuer abstrakten Begriff (Taube = Frieden). Anders als Metapher: Symbol ist im Text real vorhanden. Motiv: Wiederkehrendes Element (Gegenstand, Situation, Thema). Leitmotiv: Motiv das Figur oder Thema kennzeichnet, wiederholt auftaucht. Allegorie: Durchgaengige symbolische Erzaehlung (Pilgrim's Progress). Bildfeld: Zusammenhaengende Metaphern aus einem Bereich (Kriegsmetaphorik fuer Liebe). Vorbereitung: Symbole frueh einfuehren, bevor sie wichtig werden. Dosierung: Zu viel Symbolik wirkt praetentioes. Subtilitaet: Die besten Symbole funktionieren auch woertlich. Leser sollte nicht suchen muessen - Bedeutung entsteht organisch.",
},
KnowledgeArticle {
    id: "lit-thema",
    title: "Thema und Bedeutung",
    category: KnowledgeCategory::Literature,
    keywords: &["thema", "bedeutung", "botschaft", "subtext", "aussage", "interpretation"],
    content: "Das Thema ist die zentrale Idee oder Frage, die ein Werk durchzieht. Thema vs. Motiv: Thema ist abstrakt (Liebe, Tod, Macht), Motiv ist konkret wiederkehrend (die Rose, der Brief). Thema vs. Plot: Plot ist was passiert, Thema ist worum es eigentlich geht. Praemisse: Die These die das Werk illustriert (Gier fuehrt zum Untergang). Universelle Themen: Liebe, Tod, Identitaet, Macht, Familie, Gerechtigkeit, Freiheit. Subtext: Die unausgesprochene Bedeutungsebene unter der Oberflaeche. Thematische Einheit: Alle Elemente sollten das Thema stuetzen. Gefahr: Zu explizite Botschaft wirkt didaktisch. Besser: Thema durch Handlung und Charakter zeigen, Leser eigene Schluesse ziehen lassen. Mehrschichtigkeit: Gute Literatur hat mehrere Interpretationsebenen.",
},
KnowledgeArticle {
    id: "lit-zeit",
    title: "Zeit in der Erzaehlung",
    category: KnowledgeCategory::Literature,
    keywords: &["zeit", "analepse", "prolepse", "rueckblende", "vorausschau", "erzaehlzeit"],
    content: "Zeit ist ein zentrales Gestaltungselement der Erzaehlung. Erzaehlzeit vs. Erzaehlte Zeit: Wie lange liest man vs. wie viel Zeit vergeht. Ordnung: Chronologisch, Analepse (Rueckblende/Flashback), Prolepse (Vorausschau/Flashforward), In Medias Res. Dauer: Szene (realzeit-nah), Summary (Raffung), Ellipse (Auslassung), Pause (Zeit steht, Beschreibung), Dehnung (Zeitlupe). Frequenz: Singulativ (einmal erzaehlt, was einmal passierte), Repetitiv (mehrfach erzaehlt), Iterativ (einmal erzaehlt, was oft passierte: Jeden Morgen...). Tempus: Praeteritum (Standard), Praesens (Unmittelbarkeit), Futur (selten). Zeitebenen: Rahmenerzaehlung, Binenerzaehlung. Zeitspruenge muessen klar markiert sein um Leser nicht zu verwirren.",
},
KnowledgeArticle {
    id: "pub-bod",
    title: "Books on Demand (BoD)",
    category: KnowledgeCategory::Publishing,
    keywords: &["bod", "books on demand", "print", "deutschland", "norderstedt"],
    content: "Deutscher POD-Pionier mit Sitz in Norderstedt, einer der aeltesten Anbieter. Modelle: BoD Classic (kostenlos, geringste Marge), BoD Comfort, BoD Professional. Formate: Taschenbuch, Hardcover, Ebook. Staerken: Etabliert, zuverlaessig, deutsche ISBN, Buchhandel-Listung (VLB), gute Print-Qualitaet, persoenlicher Support. Schwaechen: Interface etwas altmodisch, Margen nicht optimal, Ebook-Reichweite begrenzt. Preisgestaltung: Mindestpreis basiert auf Seitenzahl und Format, davon abhaengig die Marge. Zusatzservices: Lektorat, Korrektorat, Cover (kostenpflichtig). Distribution: VLB-gelistet, Buchhandel bestellbar, Libri, KNV, Umbreit. Vergleich zu Tredition: Aehnliches Modell, BoD etwas etablierter, Tredition etwas moderner. Fuer wen: Autoren die Print-Qualitaet und Buchhandel-Zugang priorisieren.",
},
KnowledgeArticle {
    id: "pub-international",
    title: "Internationale SP-Plattformen",
    category: KnowledgeCategory::Publishing,
    keywords: &["international", "ingram", "kobo", "apple", "draft2digital", "smashwords"],
    content: "Globale Selfpublishing-Optionen jenseits von Amazon. IngramSpark: Groesste globale Print-Distribution, 40.000+ Haendler, Bibliotheken, professionelle Qualitaet. Gebuehren pro Titel, aber beste Reichweite. Kobo Writing Life: Direkter Zugang zu Kobo-Stores (stark in Kanada, Frankreich), faire Tantiemen, Kobo Plus (Abo-Modell). Apple Books: Ueber iTunes Connect, keine Gebuehren, 70% Tantiemen, iOS/Mac-Nutzer als Zielgruppe, erfordert Mac fuer Upload (oder Aggregator). Draft2Digital: Aggregator - ein Upload, Distribution an viele Shops (Kobo, Apple, B&N, etc.), 10% Gebuehr auf Tantiemen, sehr benutzerfreundlich. Smashwords (jetzt D2D): Frueh Aggregator, mit D2D fusioniert. Google Play Books: Direkt oder via Aggregator, starke Suche. Tolino Media: Fuer DACH-Raum, Thalia/Hugendubel/etc., deutscher Markt jenseits Amazon. Strategie: Wide gehen (ueberall) oder KDP Select (Amazon-exklusiv) - Testens wert.",
},
KnowledgeArticle {
    id: "pub-isbn-basics",
    title: "ISBN und Metadaten",
    category: KnowledgeCategory::Publishing,
    keywords: &["isbn", "metadaten", "vlb", "asin", "barcode", "katalog"],
    content: "ISBN (International Standard Book Number) identifiziert Buecher eindeutig weltweit. Struktur: 13 Ziffern, Laendergruppe, Verlag, Titelnummer, Pruefziffer. Jedes Format braucht eigene ISBN: Taschenbuch, Hardcover, Ebook (jeweils separate). Deutschland: MVB (Marketing- und Verlagsservice des Buchhandels) vergibt ISBNs, Einzelkauf moeglich aber teuer. Kostenlose ISBN: Von Plattformen (KDP, BoD, Tredition) - aber Plattform als Verlag eingetragen. Eigene ISBN: Professioneller, du als Verlag, unabhaengiger, aber Kosten. ASIN: Amazons eigene Identifikationsnummer, zusaetzlich zur ISBN. VLB (Verzeichnis lieferbarer Buecher): Deutsche Titeldatenbank, Voraussetzung fuer Buchhandels-Bestellbarkeit. Metadaten wichtig: Titel, Autor, Beschreibung, Keywords, Kategorien - bestimmen Auffindbarkeit.",
},
KnowledgeArticle {
    id: "pub-kdp",
    title: "Amazon KDP (Kindle Direct Publishing)",
    category: KnowledgeCategory::Publishing,
    keywords: &["kdp", "amazon", "kindle", "ebook", "print", "taschenbuch"],
    content: "Amazons Selfpublishing-Plattform, Marktfuehrer im Ebook-Bereich. Formate: Ebook (Kindle), Taschenbuch (POD), Hardcover. Tantiemen: 35% oder 70% bei Ebook (70% erfordert Preisrange 2.99-9.99 EUR und Teilnahme an Select), 60% minus Druckkosten bei Print. KDP Select: 90-Tage-Exklusivitaet, dafuer Kindle Unlimited (Seitenverguetung), Countdown Deals, Gratis-Aktionen. Vorteile: Groesste Reichweite, schnelle Veroeffentlichung, keine Vorabkosten, gute Tools, Paperback-Qualitaet okay. Nachteile: Abhaengigkeit von Amazon, KU kannibalisiert Verkaeufe, Algorithmus-Aenderungen, kein echter Buchhandel. Best Practices: Professionelles Cover, optimierte Produktseite, Keywords und Kategorien sorgfaeltig waehlen, Rezensionen aufbauen. International: Verfuegbar in USA, UK, DE, FR, ES, IT, NL, JP, BR, MX, AU, IN.",
},
KnowledgeArticle {
    id: "pub-marketing",
    title: "Buchmarketing Grundlagen",
    category: KnowledgeCategory::Publishing,
    keywords: &["marketing", "werbung", "amazon ads", "facebook", "newsletter", "launch"],
    content: "Sichtbarkeit ist die groesste Herausforderung im Selfpublishing. Pre-Launch: Cover Reveal, Newsletter aufbauen, ARC-Leser (Advance Reader Copies) fuer Rezensionen. Launch: Koordinierter Release, Rezensionen am Tag 1, Kategorie-Ranking pushen. Werbung: Amazon Ads (PPC, direkt auf Plattform), Facebook/Instagram Ads (Zielgruppen), BookBub (teuer aber effektiv), Buchblogger. Organisch: Newsletter ist Goldstandard (eigene Liste), Social Media (Leser dort wo sie sind), Website/Blog, Goodreads. Pricing-Strategien: 0.99 Launch, Preisaktionen, Box Sets, Kindle Countdown. Langfristig: Backlist aufbauen, in Serie schreiben, Read-Through optimieren (Leser kaufen Folgebaende). Fehler: Zu frueh Geld ausgeben, Marketing vor fertigem Produkt, keine Zielgruppe kennen. Wichtig: Bestes Marketing ist das naechste gute Buch.",
},
KnowledgeArticle {
    id: "pub-tredition",
    title: "Tredition",
    category: KnowledgeCategory::Publishing,
    keywords: &["tredition", "deutschland", "print", "distribution", "buchhandel"],
    content: "Deutscher Selfpublishing-Dienstleister mit Fokus auf Buchhandels-Distribution. Modelle: Basic (kostenlos, geringere Marge), Comfort, Professional (Zusatzleistungen). Formate: Taschenbuch, Hardcover, Ebook. Staerken: Echte ISBN (nicht Amazon-gebunden), Buchhandel-Listung (VLB), Bibliotheks-Distribution, deutsche Ansprechpartner. Schwaechsten: Teurer als reine POD-Dienste, Margen geringer als KDP, komplexere Preisgestaltung. Zusatzservices: Lektorat, Cover-Design, Marketing (kostenpflichtig). Besonders geeignet fuer: Autoren die Buchhandel-Praesenz wollen, Sach-/Fachbuecher, wer nicht Amazon-exklusiv sein will. Distribution: Lieferbar ueber alle deutschen Buchgrosshaendler, international ueber Ingram. Kombination moeglich: Tredition fuer Print/Buchhandel, KDP fuer Ebook.",
},
KnowledgeArticle {
    id: "pub-verlag-vs-sp",
    title: "Verlag vs. Selfpublishing",
    category: KnowledgeCategory::Publishing,
    keywords: &["verlag", "selfpublishing", "sp", "indie", "traditional", "veroeffentlichung"],
    content: "Zwei Wege zur Veroeffentlichung mit unterschiedlichen Vor- und Nachteilen. Verlag: Vorteile - kein finanzielles Risiko, professionelles Lektorat/Cover/Satz inklusive, Buchhandel-Praesenz, Vorschuss moeglich, Prestige. Nachteile - lange Wartezeit (1-3 Jahre), geringe Tantiemen (5-15%), wenig Kontrolle, schwer reinzukommen, Rechteabgabe. Selfpublishing: Vorteile - volle Kontrolle, hohe Tantiemen (35-70%), schnelle Veroeffentlichung, alle Rechte behalten, keine Gatekeeper. Nachteile - Vorabkosten (Cover, Lektorat), Marketing selbst, kein Buchhandel-Zugang, Stigma (schwindet), alles selbst organisieren. Hybridweg: Beides kombinieren, verschiedene Projekte verschiedene Wege. Entscheidungskriterien: Genre (Romance/Thriller stark im SP), Kontrollbeduerfnis, Zeitrahmen, finanzielle Situation, Karriereziele.",
},
KnowledgeArticle {
    id: "trope-chosen-one",
    title: "The Chosen One",
    category: KnowledgeCategory::Tropes,
    keywords: &["chosen one", "auserwaehlter", "prophezeiung", "schicksal", "held", "destiny"],
    content: "Ein Charakter ist durch Prophezeiung oder Schicksal bestimmt, etwas Wichtiges zu tun. Klassisch in Fantasy: Der eine, der den Dunklen Lord besiegen kann. Problem: Kann passiv wirken - Schicksal, nicht Wahl macht zum Helden. Moderne Subversion: Chosen One lehnt Schicksal ab. Oder: Wahl macht wuerdiger als Geburt. Mehrere Kandidaten, einer waehlt es wirklich. Schluessel: Der Charakter muss agency haben. Schicksal gibt Moeglichkeit, Wahl macht zum Helden. Varianten: Chosen One ist falsch, der wahre ist Nebencharakter. Chosen One scheitert, jemand anderes tritt ein. Prophezeiung ist mehrdeutig. Emotional: Last des Auserwaehlten. Alle erwarten etwas. Keine normale Kindheit. Isolation. Fehler: Protagonist ist passiv, andere loesen Probleme, Prophezeiung ist zu spezifisch und vorhersehbar.",
},
KnowledgeArticle {
    id: "trope-enemies-to-lovers",
    title: "Enemies to Lovers",
    category: KnowledgeCategory::Tropes,
    keywords: &["enemies", "lovers", "feinde", "hass", "liebe", "rivalen", "konflikt"],
    content: "Zwei Charaktere beginnen als Feinde oder Rivalen und entwickeln romantische Gefuehle. Essenziell: Der Hass muss glaubwuerdig sein, nicht nur Missverstaendnis. Beide muessen gleich stark sein - kein Machtgefaelle. Schluessel: Langsame Entwicklung, Momente der Verletzlichkeit, Respekt waechst vor Liebe. Banter und Wortgefechte zeigen Chemie. Sie muessen einander herausfordern und besser machen. Varianten: Workplace Rivals, Academic Rivals, Political Enemies, Warring Kingdoms. Funktioniert in allen Genres: Contemporary, Fantasy, Historical. Das erste Zugestaendnis ist der Wendepunkt - einer gibt zu, dass der andere nicht so schlimm ist. Fehler: Zu schneller Wandel, unverzeihliche Taten die dann vergeben werden, Feindschaft nur oberflaechlich. Der Grund fuer die Feindschaft sollte echt sein, aber ueberwindbar.",
},
KnowledgeArticle {
    id: "trope-fake-dating",
    title: "Fake Dating / Fake Relationship",
    category: KnowledgeCategory::Tropes,
    keywords: &["fake", "dating", "beziehung", "schein", "taeuschen", "vortaeuschen", "arrangement"],
    content: "Zwei Charaktere taeuschen eine Beziehung vor, entwickeln dann echte Gefuehle. Gruende: Familie beruhigen, Ex eifersuchtig machen, Geschaeftsdeal, Visum, gesellschaftliche Erwartung. Spannung: Oeffentliche Zuneigung vs. private Gefuehle. Wann wird aus dem Spiel Ernst? Schluessel: Regeln der Fake-Beziehung, die gebrochen werden. Erste oeffentliche Handlung, erste private. Varianten: Fake Engagement, Fake Marriage (Marriage of Convenience), Contract Relationship. Forced Proximity verstaerkt den Trope. Das Fake erzwingt Intimitaet, die zu echter fuehrt. Verwandt: Only One Bed (zwingt koerperliche Naehe). Der Moment der Wahrheit: Wann wird es real? Wie reagiert das Umfeld? Fehler: Keine echte Chemie unter der Fassade, unrealistischer Setup, dritte Person als reiner Plot-Device.",
},
KnowledgeArticle {
    id: "trope-fish-out-of-water",
    title: "Fish Out of Water",
    category: KnowledgeCategory::Tropes,
    keywords: &["fish", "water", "fremd", "neu", "anpassung", "kultur", "aussenseiter"],
    content: "Charakter befindet sich in voellig unbekannter Umgebung oder Situation. Narrativer Nutzen: Leser lernt die Welt durch die Augen des Neulings. Exposition wird natuerlich. Varianten: Stadtmensch auf dem Land, Zeitreise, Standeswechsel (Prince and Pauper), Kulturschock, neue Schule/Job. Humor-Potenzial: Missverstaendnisse, falsche Annahmen, Fettnaepchentreten. Charakter-Entwicklung: Anpassung und Wachstum. Was bringt der Outsider mit, was die Einheimischen nicht haben? Spannungsfeld: Wunsch zu passen vs. eigene Identitaet bewahren. Oft mit Romance kombiniert: Local Love Interest als Guide und Lehrer. Reibung durch unterschiedliche Welten. Genres: Rom-Com, Fantasy (Portal), YA (neue Schule), Fish out of Water Thriller (Zeuge in unbekannter Welt). Fehler: Protagonist ist zu inkompetent, lokale Kultur ist nur Kulisse, keine echte Anpassung.",
},
KnowledgeArticle {
    id: "trope-forbidden-love",
    title: "Forbidden Love",
    category: KnowledgeCategory::Tropes,
    keywords: &["forbidden", "verboten", "tabu", "gesellschaft", "heimlich", "verborgen"],
    content: "Die Liebe ist aus externen Gruenden verboten oder geaechtet. Gruende: Standesunterschied, verfeindete Familien, Lehrer-Schueler, Chef-Angestellter, illegale Beziehung, kulturelle Tabus. Romeo und Julia ist der Urtyp. Spannung: Entdeckungsrisiko, Konsequenzen, Loyalitaetskonflikte. Was opfern sie fuer die Liebe? Schluessel: Das Verbot muss echt und relevant sein. Gesellschaft, nicht nur Eltern. Stakes muessen real sein. Heimlichkeit: Geheime Treffen, versteckte Blicke, Double Life. Intensiviert die Emotionen. Varianten: Star-Crossed (Schicksal), Wrong Side of the Tracks (Klasse), Age Gap (Alter), Boss/Employee (Macht). Modernes Problem: Manche Verbote sind aus gutem Grund verboten. Power Imbalance beachten. Fehler: Verbot ist trivial oder leicht umgehbar, keine echten Konsequenzen, problematische Dynamik romantisiert.",
},
KnowledgeArticle {
    id: "trope-forced-proximity",
    title: "Forced Proximity",
    category: KnowledgeCategory::Tropes,
    keywords: &["forced", "proximity", "naehe", "eingesperrt", "zusammen", "isolation", "cabin"],
    content: "Charaktere sind gezwungen, Zeit miteinander zu verbringen. Settings: Snowed In (eingeschneit), Stuck in Elevator, Cabin/Island Isolation, Road Trip, Shared Accommodation. Only One Bed ist Unterkategorie. Funktion: Beschleunigt Intimitaet, entfernt Ausweichmoeglichkeiten, erzwingt Kommunikation. Externe Zwang erlaubt Charakteren Ausreden fuer Annaeherung. Die Situation, nicht sie, ist verantwortlich - emotional sicherer. Spannung: Wie lange haelt die Situation? Was wenn sie endet? Varianten: Arranged Marriage, Bodyguard, Undercover together, Quest/Journey. Kombination mit anderen Tropes: Enemies to Lovers wird intensiver durch Forced Proximity. Fehler: Setup zu konstruiert, keine andere Entwicklung als die romantische, Charaktere passiv statt reaktiv auf Situation.",
},
KnowledgeArticle {
    id: "trope-found-family",
    title: "Found Family",
    category: KnowledgeCategory::Tropes,
    keywords: &["found family", "wahlfamilie", "gruppe", "freunde", "zusammenhalt", "loyalitaet"],
    content: "Charaktere ohne (gute) Blutsfamilie finden Zugehoerigkeit in einer selbstgewaehlten Gruppe. Emotional resonant: Viele Leser haben komplizierte Familienbeziehungen. Gefunden werden, akzeptiert werden. Aufbau: Protagonist ist isoliert, trifft Individuen, Gruppe formt sich, Loyalitaeten werden getestet, Familie besteht. Typische Mitglieder: Der Leader, der Grobian mit Herz, das juengste Mitglied, der Heiler, der Comic Relief. Jeder bringt etwas ein. Spannung: Bedrohung der Einheit, Verrat, Verlust eines Mitglieds. Unterschied zu Freundschaft: Family impliziert tiefere, unbedingte Loyalitaet. Blut macht nicht Familie. Genres: Besonders stark in Fantasy (Quest-Gruppen), SciFi (Crews), YA. Fehler: Zu grosse Gruppe ohne individuelle Charakterisierung, keine echten Konflikte innerhalb der Familie, Aufbau wird uebersprungen.",
},
KnowledgeArticle {
    id: "trope-friends-to-lovers",
    title: "Friends to Lovers",
    category: KnowledgeCategory::Tropes,
    keywords: &["friends", "lovers", "freunde", "freundschaft", "liebe", "beste freunde"],
    content: "Langjährige Freunde erkennen romantische Gefuehle fuereinander. Staerke: Bestehende Chemie, tiefe Kenntnis, Vertrauen als Fundament. Spannung: Angst, die Freundschaft zu ruinieren. Was wenn es nicht klappt? Epiphanie-Moment: Ein Charakter realisiert ploetzlich, dass Gefuehle tiefer sind. Oft durch Eifersucht, Beinahe-Verlust, oder Sehen des anderen in neuem Licht ausgeloest. Schluessel: Die Freundschaft muss echt etabliert sein, nicht nur behauptet. Zeige, warum sie Freunde sind. Mutual Pining Variante: Beide haben Gefuehle, keiner gesteht. Angst vor Ablehnung. Queer-Coding: Historisch wichtig fuer LGBTQ-Darstellung. Fehler: Freundschaft nicht glaubwuerdig, zu schnelle Eskalation, andere Freunde als Kuppler ohne eigene Tiefe. Der Moment nach dem ersten Kuss: Wie aendert sich alles? Wie bleibt es gleich?",
},
KnowledgeArticle {
    id: "trope-grumpy-sunshine",
    title: "Grumpy / Sunshine",
    category: KnowledgeCategory::Tropes,
    keywords: &["grumpy", "sunshine", "mueffelig", "froelich", "gegensaetze", "optimist", "pessimist"],
    content: "Ein muerischer, verschlossener Charakter trifft auf einen froelichen Optimisten. Dynamik: Sunshine bricht Grumpys Mauern, Grumpy gibt Sunshine Tiefe. Beide lernen voneinander. Schluessel: Grumpy ist nicht gemein, sondern schuetzt sich. Sunshine ist nicht naiv, sondern bewusst positiv. Spannung: Wird Grumpy sich oeffnen? Akzeptiert Sunshine die Grenzen? Varianten: Grumpy Boss/Sunshine Employee, Grumpy Neighbor, Grumpy Only For You (soft for love interest). Soft Moment: Der erste Riss in Grumpys Fassade. Sunshine sieht, wer dahinter ist. Funktioniert besonders gut: Grumpy Mann / Sunshine Frau (traditionell), aber jede Kombination moeglich. Banter ist essenziell: Sunshines Frohsinn nervt Grumpy, aber auch beeindruckt heimlich. Fehler: Grumpy ist abusive statt schuetzend, Sunshine hat keine eigene Tiefe, Transformation ist zu schnell oder total.",
},
KnowledgeArticle {
    id: "trope-love-triangle",
    title: "Love Triangle",
    category: KnowledgeCategory::Tropes,
    keywords: &["triangle", "dreieck", "rivalen", "entscheidung", "zwei", "wahl"],
    content: "Ein Charakter muss zwischen zwei romantischen Interessen waehlen. Typen: A liebt B und C (klassisch), A liebt B, B liebt C (Kette). Funktion: Innerer Konflikt externalisiert. Verschiedene Lebensoptionen personifiziert. Gefahr: Protagonist wirkt untreu oder unentschlossen. Loesungen: Ein Interest ist klar besser, der andere war nie echte Option (Uebergang). Oder: Einer zieht sich zurueck. Poly-Loesung: Alle drei zusammen (selten, aber moeglich). Schluessel: Beide Interessen muessen echte, unterschiedliche Qualitaeten haben. Keine Strohmaenner. Was sagt die Wahl ueber den Protagonisten? Modern: Love Triangles sind weniger populaer, wirken oft wie unnuetiges Drama. Wenn genutzt: Protagonist muss aktive Wahl treffen, nicht Situation entscheidet. Fehler: Ein Interest ist offensichtlich falsch, zu langes Hinhalten, Protagonist ist passiv.",
},
KnowledgeArticle {
    id: "trope-marriage-convenience",
    title: "Marriage of Convenience",
    category: KnowledgeCategory::Tropes,
    keywords: &["marriage", "convenience", "heirat", "zweck", "arrangement", "vertrag"],
    content: "Heirat aus praktischen Gruenden, nicht aus Liebe - Liebe entwickelt sich dann. Gruende: Erbe, Visum, gesellschaftlicher Druck, Schutz, geschaeftlich, politisch. Historisch: Arrangierte Ehen waren Norm. Spannung: Business wird persoenlich. Wann ueberschreiten sie die Grenze? Regeln der Beziehung und deren Bruch. Varianten: Fake Marriage (nur auf Papier), Real aber emotionslos, Mail Order Bride. Forced Proximity eingebaut: Sie leben zusammen. Intimacy negotiation: Getrenntes Schlafzimmer? Wie oeffentlich sind sie affektioniert? Emotionaler Wendepunkt: Einer bemerkt, dass es mehr ist. Gesteht er? Versteckt er? Abgrenzung: Fake Dating endet, Marriage of Convenience hat mehr commitment und legale Folgen. Fehler: Zu schnelle Entwicklung, keine echten Konsequenzen eines Scheiterns, einer hat immer Gefuehle (asymmetrisch).",
},
KnowledgeArticle {
    id: "trope-mentor",
    title: "Mentor Figure",
    category: KnowledgeCategory::Tropes,
    keywords: &["mentor", "lehrer", "meister", "weise", "training", "guide", "obi-wan"],
    content: "Eine erfahrene Figur lehrt und leitet den Protagonisten. Funktion: Exposition, Training, moralische Leitlinie, Motivation. Oft muss der Mentor sterben oder verschwinden, damit Held allein bestehen kann. Archetypen: Weiser Alter (Gandalf), Strenger Lehrer, Widerwilliger Mentor, Gebrochener Held als Mentor. Beziehung: Kann vateraerlich/mutterlich sein, romantisch aufgeladen (selten, problematisch), oder kameradschaftlich. Subversion: Mentor ist falsch/boese (Palpatine), Mentor hat eigene dunkle Vergangenheit, Schueler uebertrifft Meister. Dead Mentor Walking: Leser wissen, dass Mentor sterben wird. Emotional vorbereiten, aber es trotzdem wirkungsvoll machen. Schluessel: Mentor braucht eigene Tiefe, ist nicht nur fuer Held da. Eigene Geschichte, Fehler, Motive. Fehler: Mentor ist allwissend und perfekt, stirbt nur als Plot-Device, hat keine Persoenlichkeit ausserhalb des Lehrens.",
},
KnowledgeArticle {
    id: "trope-redemption-arc",
    title: "Redemption Arc",
    category: KnowledgeCategory::Tropes,
    keywords: &["redemption", "erloesung", "wandel", "boese", "gut", "vergebung", "suehne"],
    content: "Ein Charakter, der Schlechtes getan hat, arbeitet an seiner Erlosung. Elemente: Erkenntnis des Fehlers, Reue, aktive Wiedergutmachung, Akzeptanz dass Vergebung nicht garantiert ist. Muss verdient sein: Reden reicht nicht. Handlungen. Opfer. Konsequenzen akzeptieren. Typen: Villain wird Held, Gefallener Held erhebt sich, Nebencharakter macht Wandlung. Timing: Zu frueh wirkt unglaubwuerdig, zu spaet ist tragisch (Vader). Beides kann funktionieren. Vergeben vs. Vertrauen: Andere Charaktere koennen vergeben aber trotzdem vorsichtig sein. Vertrauen muss neu aufgebaut werden. Beliebte Figuren: Zuko (Avatar), Jaime Lannister, Snape (posthum). Schluessel: Die schlimmen Taten nicht verharmlosen. Zeige warum er so wurde, entschuldige es nicht. Fehler: Redemption durch Tod (billig), Love Interest vergibt fuer Leser, Schlechtes wird vergessen statt gesühnt, Wandlung ist ploetzlich.",
},
KnowledgeArticle {
    id: "trope-second-chance",
    title: "Second Chance Romance",
    category: KnowledgeCategory::Tropes,
    keywords: &["second chance", "zweite chance", "ex", "reunion", "vergangenheit", "wiedersehen"],
    content: "Ehemalige Liebende treffen wieder aufeinander und bekommen eine zweite Chance. Emotionale Tiefe: Geteilte Geschichte, alte Wunden, unfinished business. Spannung: Was ging damals schief? Haben sie sich veraendert? Die Trennung muss glaubwuerdig und ueberwindbar sein. Varianten: High School Sweethearts, Divorced Couple, The One That Got Away, Reunion. Schluessel: Beide muessen gewachsen sein. Das Problem von damals muss adressiert werden. Kein Replay der gleichen Fehler. Emotional Heavy: Dieser Trope traegt Gewicht. Vergangene Verletzung, Reue, Sehnsucht. Nostalgie vs. Realitaet: Wer sind sie heute? Passt das noch? Variante mit Kind: Das gemeinsame Kind bringt sie wieder zusammen. Fehler: Problem von damals wird ignoriert, einer hat sich nicht veraendert, zu einfache Vergebung ohne Arbeit.",
},
KnowledgeArticle {
    id: "trope-slow-burn",
    title: "Slow Burn Romance",
    category: KnowledgeCategory::Tropes,
    keywords: &["slow burn", "langsam", "aufbau", "spannung", "warten", "tension"],
    content: "Die romantische Entwicklung braucht Zeit, oft ueber viele Kapitel oder Buecher. Spannung durch Antizipation: Der Leser wartet, hofft, leidet mit. Belohnung ist intensiver. Micro-Moments: Kleine Fortschritte - ein Blick, eine Beruehrung, ein Fast-Kuss. Jeder ist bedeutsam. Schluessel: Leser muss investiert sein. Warum dauert es? Interne (emotionale Blocker) und externe (Situation) Gruende. Varianten: Multi-Book Slow Burn (Serien), Single Book Slow Burn. Unterschied zu Will They Wont They: Slow Burn hat mehr emotionale Tiefe, weniger Hin-und-Her-Drama. Tension vs. Frustration: Langsam ist gut, aber Fortschritt muss erkennbar sein. Statik ist langweilig. Pay-Off: Wenn es passiert, muss es all das Warten wert sein. Emotionale und evtl. physische Erfuellung. Fehler: Zu langsam, keine sichtbaren Fortschritte, Zusammenkommen ist antiklimaktisch.",
},
KnowledgeArticle {
    id: "trope-unreliable-narrator",
    title: "Unreliable Narrator",
    category: KnowledgeCategory::Tropes,
    keywords: &["unreliable", "narrator", "unzuverlaessig", "erzaehler", "taeuschung", "twist"],
    content: "Der Erzaehler vermittelt keine objektive Wahrheit - absichtlich oder unbewusst. Typen: Luegner (weiss, dass er taeuscht), Naiv (versteht nicht alles), Wahnsinnig (verzerrte Wahrnehmung), Verdraengend (unterdrueckt Wahrheit). Hinweise pflanzen: Kleine Inkonsistenzen, andere Figuren reagieren anders als erwartet, der Leser ahnt es. Enthuellung: Kann explizit sein (grosser Twist) oder implizit (Leser muss selbst schliessen). Reread Value: Das Buch wird beim zweiten Lesen anders. Klassiker: Gone Girl, Fight Club, Rebecca. Risiko: Leser fuehlt sich betrogen wenn zu unfair. Es muessen genug Hinweise da sein. Genres: Thriller, Literary Fiction, Psychological Drama. Technik: Erste Person ist klassisch, aber dritte Person limited funktioniert auch. Fehler: Twist kommt aus dem Nichts, Unzuverlaessigkeit hat keinen thematischen Sinn, Charakter taeuscht auch ueber belanglose Dinge.",
},
    ];
    
    pub fn new() -> Self {
        Self { articles: Self::ARTICLES.to_vec() }
    }
    
    pub fn search(&self, query: &str, limit: usize) -> Vec<&KnowledgeArticle> {
        let query_lower = query.to_lowercase();
        let query_words: Vec<&str> = query_lower.split_whitespace().collect();
        
        let mut scored: Vec<(&KnowledgeArticle, i32)> = self.articles
            .iter()
            .filter_map(|article| {
                let score = Self::score_article(article, &query_words);
                if score > 0 { Some((article, score)) } else { None }
            })
            .collect();
        
        scored.sort_by(|a, b| b.1.cmp(&a.1));
        scored.into_iter().take(limit).map(|(a, _)| a).collect()
    }
    
    fn score_article(article: &KnowledgeArticle, query_words: &[&str]) -> i32 {
        let mut score = 0;
        for word in query_words {
            for keyword in article.keywords {
                if keyword.contains(word) || word.contains(keyword) { score += 10; }
            }
            if article.title.to_lowercase().contains(word) { score += 5; }
            if article.content.to_lowercase().contains(word) { score += 1; }
        }
        score
    }
    
    pub fn by_category(&self, category: KnowledgeCategory) -> Vec<&KnowledgeArticle> {
        self.articles.iter().filter(|a| std::mem::discriminant(&a.category) == std::mem::discriminant(&category)).collect()
    }
    
    pub fn get(&self, id: &str) -> Option<&KnowledgeArticle> {
        self.articles.iter().find(|a| a.id == id)
    }
    
    pub fn len(&self) -> usize { self.articles.len() }
    pub fn is_empty(&self) -> bool { self.articles.is_empty() }
}

impl Default for KnowledgeBase {
    fn default() -> Self { Self::new() }
}

/// Convert ASCII-safe text back to proper German umlauts
fn restore_umlauts(text: &str) -> String {
    // Only convert the clear umlaut replacements, not ss→ß (too ambiguous)
    text.replace("ae", "ä")
        .replace("oe", "ö")
        .replace("ue", "ü")
        .replace("Ae", "Ä")
        .replace("Oe", "Ö")
        .replace("Ue", "Ü")
}

/// Format an article for inclusion in AI context
pub fn format_for_context(article: &KnowledgeArticle, max_chars: usize) -> String {
    // Restore umlauts from ASCII-safe storage
    let content_with_umlauts = restore_umlauts(article.content);
    
    let content = if content_with_umlauts.len() > max_chars {
        format!("{}...", &content_with_umlauts[..max_chars.min(content_with_umlauts.len())])
    } else {
        content_with_umlauts
    };
    
    // Add instruction for AI to paraphrase, not quote directly
    format!("[Wissen zu {}]\n{}", article.title, content.trim())
}
