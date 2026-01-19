# KI Architektur (Draft)

## Ziele
- Lokales Inferencing (phi-3-mini Pflicht, mistral-7b optional)
- Austauschbare Runtime (candle oder llama.cpp bindings)
- Streaming-Unterstützung (Token für Token)
- Ressourcen-bewusste Lade-Strategie

## Geplanter Pfad
```
src-tauri/src/ai/
  loader.rs        # Gemeinsames Trait ModelLoader
  session.rs       # Inferenz-Session (Context, KV Cache)
  engines/
    candle.rs      # Candle Backend
    llamacpp.rs    # llama.cpp Backend
  tokenizer/
    mod.rs         # Trait + Implementierungen
  registry.rs      # Bekannte Modelle (Pfad, Parameter)
```

## Model Registry Beispiel
```rust
pub struct ModelInfo {
  pub id: &'static str,
  pub file: &'static str,
  pub params: ModelParams,
}
```

## Sicherheit
- Keine externen Requests ohne explizite Zustimmung
- Optionale Telemetrie => Default off

## Offene Punkte
- Prompt Template Library
- Kontextzusammenfassung für lange Projekte
- Stilprofil Serialisierung (JSON + Hash)
