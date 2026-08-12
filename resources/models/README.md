# Lokale Modelle

Leg hier deine lokalen Modelle ab. Beim Build werden sie gebundled (siehe `tauri.conf.json`).

## Standardmodell (macOS / Apple Silicon)

- **ID:** `gemma-4-e2b-mlx-q6`
- **Runtime:** MLX
- **Pfad:** `models/gemma-4-e2b-mlx-q6/` (Ordner mit `config.json`, `model.safetensors`, `tokenizer.json`)

## Fallback (Windows / Linux)

- **ID:** `mistral-7b`
- **Runtime:** llama.cpp
- **Pfad:** `models/mistral-7b-instruct-v0.3-q4_k_m.gguf`

Beachte die Paketgröße. Für große Modelle empfiehlt sich Download-on-demand.
