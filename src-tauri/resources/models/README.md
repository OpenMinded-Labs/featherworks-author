# Bundled Model Resources (Tauri)
Dieser Ordner wird ins App-Bundle aufgenommen.

## Unterstützte Runtimes

| Runtime | Plattform | Artefakt |
|---------|-----------|----------|
| **MLX** | macOS (Apple Silicon) | Modell-**Ordner** mit `config.json`, `model.safetensors`, `tokenizer.json` |
| **llama.cpp** | Windows / Linux | Einzelne `.gguf`-Datei |

## Aktuelles Standardmodell

- **ID:** `gemma-4-e2b-mlx-q6`
- **Runtime:** MLX
- **Erwarteter Pfad:** `models/gemma-4-e2b-mlx-q6/`

Achtung: Große Dateien erhöhen Installer-Größe stark.
