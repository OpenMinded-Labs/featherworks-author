# TODO – FeatherWorks Author

**Stand:** 11. Dezember 2024

Dieses Dokument enthält die tatsächlich offenen Aufgaben und nächsten Schritte.

---

## 🔴 Kritisch (vor Release)

### UX/Polish
- [ ] Fehlerbehandlung für fehlgeschlagene AI-Requests (User-Feedback)
- [ ] Loading-States für alle async Operationen
- [ ] Keyboard-Shortcuts Übersicht (Help Modal)
- [ ] Onboarding/Tutorial für neue User

### Bugs prüfen
- [ ] Editor-Performance bei sehr großen Dokumenten (>50k Wörter)
- [ ] Memory-Leak Check bei langem AI-Streaming
- [ ] Backup-Recovery nach Crash testen

---

## 🟡 Wichtig (v1.0 Features)

### Export verbessern
- [ ] ePub: Besseres Styling, Cover-Support
- [ ] PDF: Buchformat-Presets (A5, 6x9", etc.)
- [ ] DOCX: Formatierungen vollständig übernehmen

### Rechtschreibung
- [ ] Hunspell vollständig integrieren (derzeit Basis)
- [ ] Benutzerwörterbuch (Wörter hinzufügen)
- [ ] Inline-Korrekturvorschläge

### Collaboration Basics
- [ ] Versionierung: Snapshots bei größeren Änderungen
- [ ] Version-Diff Ansicht (side-by-side)
- [ ] Einfache Kommentare im Text

---

## 🟢 Nice-to-Have (Post-Launch)

### Editor
- [ ] Typewriter-Modus (Cursor bleibt zentriert)
- [ ] Key-Sounds (optional, WebAudio)
- [ ] Split-View (zwei Szenen nebeneinander)
- [ ] Markdown Import/Export

### AI/Fontaine
- [x] RAG mit Embeddings (fastembed/onnx)
- [ ] Bessere Prompt-Templates
- [x] Model-Download in-App (Phi-3, Mistral von HuggingFace)
- [x] Mehr Provider (Mistral, Ollama)
- [ ] **KI-Funktionen ausblenden wenn keine AI geladen/aktiviert**
  - Fontaine-Button in ToolRail ausgrauen oder verstecken
  - Lektorat-Button im Editor deaktivieren  
  - Entity-Extraction Button deaktivieren
  - Hinweis zeigen: "KI-Modell herunterladen, um diese Funktion zu nutzen"

### Statistiken
- [ ] Produktivitäts-Dashboard
- [ ] Schreib-Heatmap (Tage/Wochen)
- [ ] WPM-Tracking über Zeit
- [ ] Tagesziele mit Progress

### Welt-Building
- [ ] Karten-Upload und Annotation
- [ ] Timeline-Visualisierung
- [ ] Charakter-Beziehungsgraph

---

## ⚙️ Technische Schulden

### Code-Qualität
- [ ] `main.rs` ist sehr groß (~2600 Zeilen) → Refactoring in Module
- [ ] Mehr Unit-Tests für kritische Pfade
- [ ] E2E-Tests mit Playwright/Tauri

### Performance
- [ ] Lazy-Loading für Entity-Listen bei großen Projekten
- [ ] Virtualisierung für lange Kapitel-Listen
- [ ] IndexedDB Cache im Frontend

### Dokumentation
- [ ] API-Dokumentation für Tauri Commands
- [ ] Architektur-Diagramm
- [ ] Contributor Guide

---

## 📝 Bekannte Einschränkungen

Diese sind **bewusst so** und kein Bug:

1. **Laufende AI-Jobs nicht abbrechbar** 
   - Grund: Cooperative Cancellation in llama.cpp komplex
   - Workaround: Wartezeit bis Job fertig
   
2. **Webhook-URL für Support hardcoded**
   - Grund: Einfachheit, keine Server-Konfiguration nötig
   - Fallback: Lokale Speicherung funktioniert immer

3. **Tauri-Version statisch "1.8"**
   - Grund: Kein einfacher Runtime-Zugriff auf Version
   - Impact: Minimal, nur für Bug-Reports relevant

---

## 🎯 Nächste Sprint-Kandidaten

Vorschläge für die nächste Entwicklungsphase:

### Option A: "Polish & Export"
1. ePub Export verbessern
2. Rechtschreibung fertigstellen  
3. Keyboard-Shortcuts Hilfe
4. Performance-Audit

### Option B: "Collaboration Light"
1. Versionierung implementieren
2. Diff-Ansicht
3. Einfache Kommentare
4. Track Changes Basis

### Option C: "AI Power"
1. RAG mit Embeddings
2. Model-Download
3. Bessere Prompts
4. Proaktive Analyse

---

## 🤖 Background AI Pipeline (Geplant)

**Konzept:** Speculative Pre-Processing – KI arbeitet proaktiv im Hintergrund während der User schreibt. Bei Button-Press sind Ergebnisse bereits gecached → gefühlt Instant-Response.

### Architektur
```
┌─────────────────────────────────────────────────────┐
│                 PRIORITY QUEUE                       │
├─────────────────────────────────────────────────────┤
│  P0 (URGENT)  │ User Chat-Anfragen                  │
│  P1 (HIGH)    │ Aktiver Absatz/Szene (Cursor)       │
│  P2 (MEDIUM)  │ Sichtbarer Viewport                 │
│  P3 (LOW)     │ Restliches Kapitel                  │
│  P4 (IDLE)    │ Andere Kapitel, globale Analysen    │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│               RESULT CACHE (SQLite)                  │
│  text_hash → entities, lektorat, summary            │
│  TTL + Invalidation bei Textänderung                │
└─────────────────────────────────────────────────────┘
```

### Phasen
- [ ] **Phase 1:** Result Cache in SQLite + Hash-basierte Invalidation
- [ ] **Phase 2:** Idle-Detection → Background-Jobs für aktive Szene
- [ ] **Phase 3:** Cursor/Viewport-Tracking → Smart Scheduling
- [ ] **Phase 4:** Optional Multi-Worker (zweite Phi-3 Instanz)

### User-Modi
- **Standard-Modus:** Background-Processing läuft, aber User muss Button drücken um Entities in DB zu speichern oder Lektorat anzuzeigen
- **Agent-Modus:** Vollautomatisch – Entities werden direkt in DB geschrieben, Lektorat automatisch angezeigt

### Hinweise
- Nur aktiv wenn User KI nicht komplett deaktiviert hat
- Phi-3-mini leicht genug für die meiste Hardware (~4GB RAM)
- Bestehende Queue (`queue.rs`) + Background-System (`background.rs`) als Basis nutzen

---

## Erledigt (letzte Session) ✅

- [x] AI Request Queue mit Prioritäten
- [x] Background Job System
- [x] Bug-Report System (Backend + Frontend)
- [x] Hilfe-Menü mit Support-Items
- [x] BugReportModal Komponente
- [x] TODO-Kommentare bereinigt
- [x] ROADMAP.md aktualisiert

---

*Zuletzt aktualisiert von der Entwicklungssession am 11.12.2024*
