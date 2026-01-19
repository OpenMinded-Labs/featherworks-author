# FeatherWorks Cross-Platform Strategy (Desktop ⇄ Web)

Status: Draft (2025-10-08)  
Maintainer: (add name)  
Scope: Gemeinsame Basis & Austausch zwischen Tauri Desktop App und unabhängiger Web-App.

---
## 1. Grundprinzipien
 - Zwei voneinander lauffähige Produkte (Desktop = Tauri/Rust/SQLite, Web = Next.js/IndexedDB oder später Cloud API).
 - Projekte sollen verlustfrei zwischen beiden Welten austauschbar sein (Roundtrip-fähig).
 - Gemeinsames, versioniertes Austauschformat (`.fwa` / optional verschlüsselt `.fwae`).
 - AI ist Desktop-Only (Web konsumiert/zeigt keine AI-Funktionen), erhält aber AI-Dateien *pass-through* beim Export.
 - AI Settings, Entities, Scenes identische Domain-Semantik (AI nur aktiv auf Desktop Seite interpretiert).
 - Perspektivisch ein konsistentes Corporate Design / Design System (UI-Library ableitbar aus Web-Komponenten).

## 2. Austauschformat (.fwa)
Container: ZIP (oder später TAR+LZ4) mit Struktur:
```
/manifest.json
/project.json
/chapters.json
/scenes/<scene-id>.json
/entities/<entity-id>.json
/ai/settings.json
/attachments/* (optional)
/indexes/checksums.json (optional)
/history/patches.jsonl (optional Zukunft: CRDT/Patches)
```
`manifest.json` Felder (Beispiel):
```json
{
  "format": "featherworks-project",
  "version": "1.0.0",
  "project_id": "uuid-v4",
  "created": "2025-10-08T10:40:00Z",
  "min_desktop": "0.1.0",
  "min_web": "0.1.0",
  "features": { "ai": true, "entities": true, "attachments": false },
  "integrity": { "algorithm": "sha256", "root": "<optional-merkle-root>" }
}
```

## 3. Domain Modelle (Kanonisch)
Geplante JSON Schemas für: `project`, `chapter`, `scene`, `entity`, `ai_settings`.
- Rust: Ableitung via `serde` + (optionell) `schemars`.
- Web: TypeScript Typen generiert aus JSON Schema (`json-schema-to-typescript`).
- Ziel: Single Source of Truth → kein Divergenz-Drift.

## 4. Desktop Implementation (Ist + Soll)
| Bereich | Ist | Soll |
|---------|-----|------|
| Speicherung | SQLite (rusqlite + sqlx) | Bleibt (Optimierung: evtl. nur eine Schicht) |
| Journal/Undo | Patch / Word Count / Recovery | Exportable optional (patches.jsonl) |
| AI | Loader + Hash + Settings (persistiert) | Echte Engine/Pipeline + Streaming + Settings ins Format |
| Export | (Noch nicht umgesetzt) | `.fwa` Export (transaktional, Szenen einzeln) |
| Import | (Noch nicht umgesetzt) | Validierung Schema + Insert in frische DB |

## 5. Web Implementation (Aus Blick auf Import/Export)
| Bereich | Status | Plan |
|---------|--------|------|
| Storage | IndexedDB (geplant) | Stores: project, chapters, scenes, entities, ai_settings |
| Lazy Loading | Möglich (Streaming unzip) | Priorität wenn große Projekte >10k Szenen |
| AI | Noch nicht integriert | UI-Panel Feature Parität, später Web-Inference oder Remote API |
| Export | (Fehlt) | Aus IndexedDB in `.fwa` ZIP streamen |

## 6. Verschlüsselung (Optional `.fwae`)
- Header Magic: `FWAENCv1`.
- Key Derivation: Argon2id (Salt 32B) – Desktop bereits Argon2 vorhanden.
- Cipher: AES-GCM 256.
- Web: WebCrypto + Argon2 (WASM) + Worker (UI nicht blocken).
- `manifest.json` liegt innerhalb des verschlüsselten Containers (Privacy). 

## 7. AI Settings Vereinheitlichung
Desktop-only aktiv. Web: rein pass-through (speichert/rekonstruiert Datei unverändert, kein Parsen nötig). Datei: `ai/settings.json`
```json
{
  "model_id": "phi-3-mini",
  "temperature": 0.72,
  "max_tokens": 512,
  "extras": { "top_p": 0.9, "seed": null }
}
```
- Desktop speichert in SQLite → Export mappt.
- Web speichert in IndexedDB → Export mappt.
- Tolerantes Einlesen: Fehlende Felder = Defaults.

## 8. Design System / Corporate Design
Phase 1: Extraktion vorhandener Web-`components/ui/*` als eigenständiges Paket (`@featherworks/ui`).
Phase 2: Theming Tokens (Farben, Spacing, Typografie) → CSS Vars / Tailwind Config.
Phase 3: Desktop nutzt Paket via Vite (Baumshake). 

## 9. Konfliktstrategie & Zukunft
Kurzfristig: Last-Write-Wins (Timestamp).  
Mittelfristig: Patch-Log (`history/patches.jsonl`).  
Langfristig: CRDT (Yjs) optional – Export enthält Yjs-Dokument als Binary Attachment oder Snapshot + Delta.

## 10. Roadmap (Vorschlag)
1. JSON Schemas entwerfen (v1.0.0) & in Repo ablegen.
2. Desktop: Minimaler `.fwa` Export (ohne Verschlüsselung) + Roundtrip Test.
3. Web: Prototype Import → Scenes Listing.
4. AI Settings Export/Import.
5. Checksums + Integritätsprüfung.
6. Verschlüsselungsschicht.
7. Patches/History optional.
8. Design System Extraktion.
9. CRDT Evaluierung.

## 11. Qualitätskriterien
- Roundtrip (Desktop→Web→Desktop) ohne Datenverlust (Pflicht für v1.0.0).
- Schema-Version Mismatch → Warnung, Read-Only Fallback.
- Export Zeit: < 2s bei 500 Szenen (Baseline Ziel).
- Import Validierung: Fehlerliste statt Silent Fail.

## 12. Risiken & Mitigation
| Risiko | Wirkung | Mitigation |
|-------|---------|-----------|
| Schema Drift | Inkompatible Exporte | Zentralisierte Schemas + CI Test |
| Performance große Projekte | Lange Ladezeiten web | Lazy scene unzip + Index Cache |
| Verschl. Performance im Browser | UX Frustration | WebWorker + Progress-Bar |
| AI Modell Parität schwierig | Unkonsistente Ergebnisse | Settings + Capability Flags |

## 13. Offene Entscheidungen
- Kompression Format final (ZIP vs TAR+LZ4). 
- Merkle Hash Tree Implementierung ja/nein.
- CRDT Einführungszeitpunkt.
- Migration Mechanismus bei v2 Format.

## 14. Nächste Aktionen (Kompakt)
- [ ] Schemas anlegen
- [ ] Export Skeleton (Desktop)
- [ ] Test-Fixture `.fwa`
- [ ] Web Import MVP
- [ ] AI Settings Roundtrip
 - [ ] (AI Desktop-only bestätigt 2025-10-08) Web Pass-Through Implementierung

> Änderungen an diesem Dokument bitte mit Datum und Kurzbegründung unterhalb ergänzen.

---
Änderungshistorie:
- 2025-10-08: Initiale Fassung erstellt.
 - 2025-10-08: Ergänzt: AI Desktop-Only + Pass-Through Verhalten für Web.
