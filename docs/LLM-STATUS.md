# Fontaine / Gemma 4 — Stand & nächste Schritte

Stand: 12.08.2026. Ergänzt `docs/ARCHITECTURE.md` um den LLM-Teil.

## Erledigt

- **Migration Phi-3 → Gemma 4 E2B (MLX q6)**, Dual-Backend über `RuntimeKind::{Mlx, LlamaCpp}`
- **Prompt-Format korrigiert** (kritisch, siehe unten)
- **Vision/Audio gestrippt**: 4.71 → 3.76 GB (`scripts/strip_gemma_multimodal.py`)
- **Terse-Directive** als Default im System-Turn: −37 % Tokens
- **Evaluation an echten Manuskripten** (`scripts/eval_corpus.py`)

## Fallstricke (verifiziert, nicht raten)

### Turn-Marker

Gemma 4 nutzt `<|turn>role` … `<turn|>` (Token-IDs 105/106).
`<start_of_turn>` / `<end_of_turn>` aus Gemma 2/3 sind **nicht im Vokabular**
und zerfallen in ~8 Klartext-Tokens — die Turn-Struktur wird still zerstört.
Regressionstest: `never_emits_gemma3_markers`.

### System-Rolle

Gemma 4 hat — anders als Gemma 3 — eine **native** `system`-Rolle.
Nicht in den User-Turn mergen.

### Thinking

- Aktivierung: `<|think|>` (id 98) als erstes im System-Turn.
- E2B/E4B denken **auch ohne** das Token (Model Card nimmt sie explizit von der
  "leerer Thought-Block"-Regel aus) → `strip_thinking()` bleibt Pflicht,
  Token-Budget bleibt großzügig.

- Reasoning schließt mit `<channel|>`, öffnet mit `<|channel>` (asymmetrisch!).

### Qwen-Trick (vorgeschlossener Thought-Block) — NICHT als Default

Halbiert zwar die Tokens (933 → 375), kostet aber Qualität bei
Transformationsaufgaben:

| Aufgabe | nur Direktive | + Primer |
| --- | --- | --- |
| Absätze setzen | korrekt | **Text unverändert zurück** |
| Stil verbessern | Redundanz entfernt | Redundanz bleibt |
| Entitäten | korrekt | korrekt |

→ Kandidat für ein **Task-Flag**: bei Extraktion an, bei Lektorat aus.
Benchmarks: `scripts/bench_thought_primer{,2}.py`.

## Evaluationsergebnisse (n=5 Kapitel, Martyria 1)

Ground Truth: `test_buecher/zusammenfassungen/martyria1_gemini.json`

| Aufgabe | Ergebnis |
| --- | --- |
| Entitäten | Recall 80 %, Precision 80 % |
| Stilkritik | stark, mit wörtlichen Belegen |
| Fortsetzung | trifft Ton und Perspektive |
| Zusammenfassung | nur ~⅓ des Kapitels |
| QA | brauchbar, zu abstrakt |

**Wichtig:** Die Zusammenfassungs-Schwäche ist vermutlich ein **Testartefakt** —
der Harness schneidet bei 8000 Zeichen ab, Kapitel 1 hat 34.193. Bei 128k Kontext
unnötig. Vor jeder Modell-Kritik erst mit vollem Kapitel gegenmessen.

Aussagekraft begrenzt: ein Werk, n=5. Die Ausfälle waren Fantasy-Namen
(`Zamah`, `Aszhva`, `Ri`) — Namensschemata unterscheiden sich stark zwischen den
Büchern, daher über mehrere Werke messen.

## Langkontext verifiziert (13.08.2026)

Nach dem Entfernen der Kürzungen geprüft, ob das Modell lange Szenen wirklich
nutzt. Methode: Needle-in-a-Haystack — ein erfundener Fakt (Messingkompass) wird
an definierter Position eingefügt und abgefragt. Skript:
`scripts/verify_long_context.py`.

**Recall: 12/12** über 3k/8k/16k/32k Zeichen × Position Anfang/Mitte/Ende.
Auch bei 32.000 Zeichen mit Nadel am Ende gefunden. Die Sliding-Attention-Sorge
(30 von 35 Layern, Fenster 512) hat sich für diese Aufgabe **nicht** bestätigt —
die 5 Full-Attention-Layer und `num_kv_shared_layers: 20` reichen offenbar aus.

Prefill (isoliert gemessen, ohne Prozessstart und Generierung):

| Zeichen | Tokens | Prefill | Peak-RAM |
| --- | --- | --- | --- |
| 3.000 | 1.052 | 0,6 s | 4,36 GB |
| 16.000 | 4.833 | 2,7 s | 4,51 GB |
| 32.000 | 9.638 | 5,7 s | 4,67 GB |
| 60.000 | 17.741 | 11,4 s | 5,02 GB |

Durchsatz fällt nur leicht (1858 → 1557 tok/s), Speicher wächst moderat
(+0,66 GB für 17k Tokens) — dank Sliding Window. **Kein Grund für ein
Zeichenlimit**; der Engpass ist Prefill-Zeit, nicht Qualität oder RAM.

→ Damit ist der residente Server umso wichtiger: aktuell wird bei *jeder*
Anfrage neu geprefillt.

**Messfalle:** Der erste Durchlauf zeigte 4/12 und sah nach Recall-Versagen aus.
Tatsächlich waren `--max-tokens 150` aufgebraucht, bevor der `<|channel>thought`-
Block endete — gemessen wurde das Token-Budget, nicht das Modell. Das Skript
markiert solche Läufe jetzt als `CUT` statt als Miss.

## Nächste Schritte

### 1. Modell beim App-Start laden, resident halten — implementiert, ungetestet

`src-tauri/src/ai/server.rs`: startet `mlx_lm.server` nach erfolgreichem
Modell-Laden in einem Hintergrund-Thread, hält den Prozess in einem `OnceLock`,
killt ihn via `Drop` und bei `RunEvent::ExitRequested`.

- Portsuche 8765–8774, `--host 127.0.0.1` explizit.
- Fällt bei jedem Fehler auf den bisherigen Subprocess-Weg zurück.
- Abschaltbar über `FONTAINE_NO_SERVER=1`.
- Commands: `get_ai_server_status`, `stop_ai_server`.

Verifizierte Server-Eigenschaften:

| Beobachtung | Konsequenz |
| --- | --- |
| `reasoning` und `content` sind getrennt | `strip_thinking()` auf diesem Pfad unnötig |
| Chat-Template wird selbst angewendet | Prompt muss als **Rollen** übergeben werden, nicht mit Turn-Markern |
| Präfix-Cache greift: `cached=4822/4834` bei wechselnder Frage | anders als `mlx_lm.generate`, das nur ganze Prompts matcht |
| **`model` im Request wird bei Unbekanntheit von HF geladen** | Modell-ID muss exakt der `--model`-Pfad sein, sonst Download-Versuch |

Der letzte Punkt ist der gefährlichste: `"model": "gemma"` erzeugte einen
404-Request gegen huggingface.co statt das geladene Modell zu nutzen. In einer
Offline-App wäre das ein stiller Netzzugriff.

**Gemessen (GPU frei, `tests/mlx_server_flow.rs`):**

| | Zeit | Prompt-Tokens | davon gecached |
| --- | --- | --- | --- |
| Serverstart | 1,1 s | | |
| 1. Anfrage (kalt) | 13,9 s | 4033 | 0 |
| 2. Anfrage (warm) | 12,7 s | 4032 | **4020** |

Der Präfix-Cache greift eindeutig — **aber er bringt nur 1,2 s**. Grund:

| Phase | Durchsatz | Anteil an 13,9 s |
| --- | --- | --- |
| Prefill | ~1750 tok/s | 2,3 s |
| Generierung | **37 tok/s** | ~11 s |

Prefill ist **47× schneller** als Generierung. Der Cache kann nur den
Prefill-Anteil einsparen, und der ist klein. Die Erwartung „7,2 s statt 17–58 s"
aus früheren Notizen bezog sich auf den eingesparten *Modell-Ladevorgang*
(~2–3 s pro Aufruf) — der entfällt tatsächlich, ist aber ebenfalls nicht der
Hauptkostenfaktor.

**Der eigentliche Hebel ist die Anzahl generierter Tokens.** Bei der trivialen
Frage „Nenne drei Farben" erzeugte das Modell 191 Tokens: 619 Zeichen Denkblock
für 19 Zeichen Antwort. Das heißt für die Priorisierung:

1. **Denkblock unterdrücken** — erledigt, siehe unten. Grösster Hebel.
2. **EAGLE/MTP-Draft-Head** — setzt an den 37 tok/s an.
3. Präfix-Cache — nice to have, aber zweitrangig.

Der residente Server bleibt trotzdem richtig: er spart den Modell-Ladevorgang,
ist Voraussetzung für den Draft-Head und macht Streaming erst möglich.

### 1b. Thinking standardmässig aus — erledigt

`mlx_lm.server` akzeptiert `chat_template_kwargs` **pro Request**
(`server.py:1192`), womit sich `enable_thinking` je Aufgabe steuern lässt. Das
Chat-Template gibt `<|think|>` nur bei `enable_thinking=true` aus.

Gemessen an echtem Erzähltext (`scripts/bench_thinking_flag.py`, 6k Zeichen aus
Martyria 1 ab Position 43.000):

| Aufgabe | mit Thinking | ohne Thinking | Faktor |
| --- | --- | --- | --- |
| Entitäten | 186,0 s → **leere Antwort** | 24,5 s, 2/2 Namen, JSON gültig | 7,6× |
| Zusammenfassung | 40,1 s → **leere Antwort** | 5,9 s, 3 Sätze korrekt | 6,8× |
| Stilkritik | 25,3 s, nach 159 Zeichen abgebrochen | 24,7 s, 2753 Zeichen | 1,0× |

Der Denkblock verbrauchte in zwei von drei Fällen das **gesamte** Token-Budget,
sodass gar keine Antwort ankam. Das ist kein Qualitätsvorteil, sondern
Totalausfall — die frühere Sorge („Thinking hilft bei Extraktion") hat sich
nicht bestätigt.

Umgesetzt: `server::chat()` hat einen `thinking`-Parameter, gespeist aus dem
bestehenden `<|think|>`-Marker. Default ist **aus**. Integrationstest
`thinking_disabled_answers_within_budget` sichert das ab.

Effekt im Integrationstest: dieselbe Anfrage **13,9 s → 4,0 s**.

**Messfalle (zweimal getappt):** Der erste Durchlauf nutzte die ersten 6000
Zeichen der Datei — das ist Titelei und Weltenbeschreibung, kein Erzähltext.
Ergebnis: das Modell nannte den *Autor* als Figur. Bei Korpus-Messungen immer
prüfen, ob der Textausschnitt die gemessene Eigenschaft überhaupt enthält.

### 2. Szenen-KV-Cache (TTFS)

FeatherWorks arbeitet **szenenbezogen**, nicht kapitelbezogen. Kontext ist:
Szenentext + Summaries vorangegangener Kapitel.

Voraussetzungen, damit der Cache greift:

- Prompt-Layout muss **stabiles Präfix zuerst** haben (Summaries + Szene),
  wechselnde Instruktion ans Ende. Aktuell steht die Aufgabe im System-Turn
  ganz vorne → würde jeden Cache invalidieren.

- Cache-Key: Hash aus Szenen-ID + Textinhalt + Modell-ID.
- **Sliding Window beachten**: 30 der 35 Layer nutzen `sliding_attention`
  (Fenster 512), dazu `num_kv_shared_layers: 20`. Sliding- und Global-Layer
  müssen unterschiedlich behandelt werden; nach 512 Tokens haben Sliding-Layer
  keinen vollständigen Zustand. Vor dem Bauen `mlx-lm --prompt-cache-file`
  empirisch gegen einen Frisch-Prefill prüfen, nicht auf Korrektheit vertrauen.

### 3. EAGLE/MTP-Draft-Head (für Speed)

Nach der Thinking-Abschaltung ist die Generierungsrate von **37 tok/s** der
verbleibende Engpass. Erwartung nicht aus der Literatur, sondern **gemessen in
Ailey Nitro**: 2,0× bei Greedy, **1,6× bei Temperatur > 0** (Sampling verwirft
mehr Draft-Tokens). Fontaine fährt temp=0.2 → realistisch ~59 tok/s.

Existiert als **separates** Modell: `google/gemma-4-E2B-it-assistant`,
MLX-Konvertierung bereits geladen unter
`resources/models/gemma-4-e2b-assistant-mtp` (181 MB, 4 Layer, hidden 256).

Blocker:

- `mlx_lm 0.31.3` (= neueste) kennt `model_type: gemma4_assistant` nicht.
- Kein eigenständiges Modell: `pre_projection (256, 3072)` erwartet
  Backbone-Hidden ⊕ Embedding, `post_projection (1536, 256)` geht in den
  Backbone-Raum zurück; kein `k_proj`/`v_proj` → nutzt den **KV-Cache des
  Backbones**. `--draft-model` erwartet dagegen ein unabhängiges Modell.

→ Erfordert eigene MLX-Implementierung (4 Layer + Fusion + Verify-Loop)
oder Wechsel auf llama.cpp/GGUF, wo die Kopplung fertig ist
(`Architecture: gemma4-assistant`).

### 3b. Python-Runtime beim Kunden — Entscheidung: Embedded Python

**Fällig vor der Closed Alpha**, nicht vorher. In Development läuft Fontaine
über `.venv-mlx` im Repo; beim Tester existiert die nicht.

Geprüfte Optionen:

| Weg | Bewertung |
| --- | --- |
| **Embedded Python** ✅ | gewählt: kalkulierbar, ändert nichts am Stack (~100 MB + mlx-lm) |
| `mlx-rs` | **verworfen** |
| llama.cpp/GGUF | offen als Alternative, falls Embedded scheitert |

`mlx-rs` verworfen, weil (Stand 13.08.2026):

- Letzter Commit vor 5 Monaten, „in active development", inoffiziell, 364 Stars.
- Der `mlx-lm`-Teil unterstützt Mistral und Llama 3.2 1B. **Kein Gemma 4.**
- Bindet die MLX-*Array*-Ebene. Architektur (Attention-Mischung, KV-Sharing,
  q6-Layout, Tokenizer, Sampler) müsste selbst implementiert werden — Nachbauen,
  nicht Anbinden, und das gekoppelt an ein ruhendes Projekt.

Offen beim Umsetzen: Bundle-Größe, Code-Signing der Python-Binaries unter
macOS (Notarisierung!), Startzeit.

### 4. Kontext-Kuratierung statt harter Limits

Die aktuelle Szene geht seit `context.rs` ungekürzt in den Prompt. Bei
Entitäten reicht das Prinzip „alles rein" aber nicht — ein Projekt mit 80
Figuren füllt den Kontext mit Irrelevantem.

Geplant:

- **Heuristische Vorfilterung**, welche Entitäten das Modell überhaupt sieht
  (Nennung in der Szene, Nennung in der Frage, Beziehungsnähe).
- **Tool-Use für RAG-Suche**: Gemma 4 E2B ist tool-use-fähig. Statt Kontext
  vorab zu raten, sucht das Modell selbst nach Bedarf.
- **Vektor-Store auf LanceDB** statt Chroma (embedded, keine Server-Runtime —
  passt zum Auslieferungsproblem).
- **Knowledge Graph**, den das Modell selbst pflegt. Bei narrativen Büchern
  besonders wertvoll: Figurenbeziehungen, Zeitlinien, Orte über Bände hinweg.

### 5. KV-Cache auf 4 Bit quantisieren

Reduziert den Speicherbedarf bei langen Kontexten deutlich. Relevant, sobald
ganze Szenen + Summaries regelmäßig im Prompt stehen.

### 6. Agenting

Autonomes Arbeiten, User-Interrupts, Task-Unterbrechung. Referenzimplemen-
tierung: **Ailey** (System des Autors) — Konzepte dort abschauen statt neu
erfinden.

### 7. Kleinkram

- Icons auf **Lucide** umstellen (optisch konsistenter).
- Thinking-Task-Flag: Primer bei Entity-Extraktion an, bei Lektorat aus.
- Python-Runtime beim Kunden (Blocker für Release, siehe oben).

## Pfade

| Zweck | Pfad |
| --- | --- |
| Modell | `resources/models/gemma-4-e2b-mlx-q6-text` |
| Draft-Head | `resources/models/gemma-4-e2b-assistant-mtp` |
| venv | `.venv-mlx` (Override: `FONTAINE_PYTHON`) |
| App-Bundle | `src-tauri/target/release/bundle/macos/` |
| Modell-Symlink | `~/Library/Application Support/featherworks-author/models/` |

Build: `npm run build && bash scripts/manual-bundle-macos.sh`

**Achtung:** Die App auf dem Desktop ist ein **Symlink**. Eine Kopie würde
`.venv-mlx` nicht finden, da aufwärts vom Executable gesucht wird.
