# FeatherWorks Author

Lokaler, privater Autoren-Assistent mit eingebettetem Phi-3 Mini Modell (später optional Mistral 7B). Dieses Repository enthält ein frühes Grundgerüst (Tauri + Rust Backend + Platzhalter KI API).

## Setup (macOS Apple Silicon / M4)

```bash
# (Optional) in dieses Verzeichnis wechseln
cd ~/Desktop/featherworks-author

# Setup Script holen & ausführen
chmod +x scripts/setup-macos.sh
./scripts/setup-macos.sh
```

## Entwicklung starten

```bash
npm install   # (fügt später Frontend-Dependencies hinzu)
npm run dev   # startet Tauri Dev (derzeit minimal)
```

### Wichtiger Hinweis: Tauri CLI Version

Dieses Projekt ist aktuell auf Tauri v1 konfiguriert. Falls eine globale Tauri CLI v2 installiert ist (z.B. `tauri-cli 2.x`), führt der Befehl `tauri build` statt `npx tauri build` zu Schema-Fehlern wie:

```
identifier is a required property
Additional properties are not allowed ("devPath", "distDir", "package", "tauri")
```

Ursache: Die globale v2 CLI validiert die `tauri.conf.json` gegen das v2 Schema – das v1 Layout (`build.devPath`, `build.distDir`) ist dort anders organisiert. Verwende deshalb IMMER die npm Scripts (`npm run dev`, `npm run build`) oder `npx tauri ...`.

Das Skript `scripts/ensure-tauri-v1.mjs` prüft beim Start automatisch, ob die lokale (DevDependency) CLI eine v1 Major-Version hat und warnt bei Divergenz mit einer globalen Installation.

Optional kannst du die globale CLI deinstallieren:

```bash
npm uninstall -g @tauri-apps/cli
```

Oder explizit immer lokal aufrufen:

```bash
npx tauri dev
npx tauri build
```

## KI / Fontain API (Platzhalter)
Rust Commands verfügbar (siehe `src-tauri/src/main.rs`):
- `ask_fontain(FontainRequest)` -> liefert Dummy-Response
- `get_current_model()`
- `set_current_model(model)`

Struktur für spätere Modell-Integration:
```
resources/models/          # Modelle (phi-3-mini.gguf etc.)
src-tauri/src/ai/          # KI Backend Module
```

## Nächste Schritte (geplant)
- Einbindung lokaler LLM Runtime (z.B. candle + GGUF Loader oder llama.cpp binding)
- Streaming Token Ausgabe
- Settings View für Modell-Download (Mistral optional)
- Verschlüsseltes SQLite für Projekte
- Stilprofil-Engine

## Sicherheit & Datenschutz
Alles läuft lokal – keine externen API Calls geplant.

## Lizenz
TBD
