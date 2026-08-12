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
der Harness schneidet bei 8000 Zeichen ab, Kapitel 1 hat 34.193. Bei 65k Kontext
unnötig. Vor jeder Modell-Kritik erst mit vollem Kapitel gegenmessen.

Aussagekraft begrenzt: ein Werk, n=5. Die Ausfälle waren Fantasy-Namen
(`Zamah`, `Aszhva`, `Ri`) — Namensschemata unterscheiden sich stark zwischen den
Büchern, daher über mehrere Werke messen.

## Nächste Schritte

### 1. Modell beim App-Start laden, resident halten

Aktuell startet **pro Anfrage** ein Python-Prozess (~2–3 s Ladezeit).
Ziel: `mlx_lm.server` als Hintergrundprozess beim App-Start, abschaltbar über
die AI-Settings. Ersetzt den Subprocess-Aufruf in `MlxEngine::generate_tokens`
durch HTTP.

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

### 3. EAGLE/MTP-Draft-Head (für Speed, ~2×)

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
