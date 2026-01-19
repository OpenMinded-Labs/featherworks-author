# Featherworks Author v1.1 Roadmap

> Geplante Features nach dem initialen Release v1.0

## 🎯 Fokus: Intelligentere KI-Assistenz

### 1. Semantische Suche für Fontaine Chat
**Priorität:** Hoch | **Aufwand:** 2-3 Tage

**Problem v1.0:**
- Keyword-basierte Suche mit `LIKE '%wort%'`
- Findet nur exakte Wortvorkommen
- "Wie alt ist Maria?" findet nicht "Maria wurde 1995 geboren"

**Lösung v1.1:**
- [ ] Embedding-Modell integrieren (`all-MiniLM-L6-v2`, ~80 MB)
- [ ] Vektor-Index für Szenen und Entities aufbauen
- [ ] Cosine-Similarity statt Keyword-Matching
- [ ] Embeddings beim Speichern aktualisieren

**Technische Details:**
```
Optionen für Rust:
- rust-bert (groß, aber mächtig)
- candle (Hugging Face, leichtgewichtig)
- ort (ONNX Runtime, gute Performance)

Vektor-Speicher:
- sqlite-vss (SQLite Extension)
- In-Memory mit ndarray
```

**Impact:**
- +80 MB App-Größe
- +1-2 sec Startzeit (Modell laden)
- Deutlich bessere Antwortqualität

---

### 2. Mehrstufiger Chat-Agent
**Priorität:** Mittel | **Aufwand:** 3-5 Tage

**Ablauf:**
1. LLM analysiert Frage → "Welche Infos brauche ich?"
2. System sucht relevante Daten (Entities, Szenen, RAG)
3. LLM antwortet mit vollständigem Kontext

**Vorteile:**
- Versteht komplexe Fragen besser
- Kann mehrere Quellen kombinieren
- Selbst-korrigierend bei fehlenden Infos

**Nachteile:**
- 2-3x längere Antwortzeit
- Höhere Komplexität

---

### 3. Lektor-Modus (Track Changes)
**Priorität:** Hoch | **Aufwand:** 1 Woche

**Features:**
- [ ] Inline-Annotationen im Text
- [ ] Änderungsvorschläge akzeptieren/ablehnen
- [ ] Kommentar-Thread pro Annotation
- [ ] Export mit Änderungsmarkierungen

**Zielgruppe:** Professionelle Lektoren, die mit Autoren zusammenarbeiten

---

### 4. Verbessertes Kommentar-System
**Priorität:** Mittel | **Aufwand:** 2-3 Tage

- [ ] Kommentare per Tastenkürzel (Cmd+K)
- [ ] Kommentar-Panel in Sidebar
- [ ] Kommentare exportieren (Markdown/PDF)
- [ ] Kommentare filtern (gelöst/offen)

---

## 🔧 Kleinere Verbesserungen

- [ ] Manuskript-weite Suche UI (Cmd+Shift+F) - Backend schon vorbereitet
- [ ] Thesaurus-Caching für schnellere Synonyme
- [ ] Bessere Fehlerbehandlung bei LLM-Timeout
- [ ] Statistik-Dashboard (Wörter/Tag, Fortschritt)

---

## 📅 Timeline

| Phase | Zeitraum | Fokus |
|-------|----------|-------|
| v1.0 Release | Jan 2025 | Stabilität, Core-Features |
| v1.1 Beta | Feb 2025 | Semantische Suche, Lektor-Modus |
| v1.1 Release | März 2025 | Bugfixes, Feinschliff |

---

## 💡 Ideen für später (v1.2+)

- Cloud-Sync zwischen Geräten
- Kollaboratives Schreiben (mehrere Autoren)
- iOS/Android Companion App (Lesemodus)
- Integration mit Scrivener/Word Import
- Hörbuch-Export (TTS)
