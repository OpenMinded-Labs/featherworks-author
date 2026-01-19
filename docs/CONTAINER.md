# FeatherWorks Encrypted Container (.fwauthor) – Draft (M0)

Status: Prototype (nicht für Produktion – Key Ableitung & Param Handling wird in M1/M2 gehärtet)

## Ziel
Eine einzelne, komprimierte und verschlüsselte Datei, die die (komplette) SQLite-Projektdatenbank enthält.

## Aufbau
```
Offset  Größe   Beschreibung
0      7       MAGIC "FWAUTHR"
7      1       VERSION (aktuell 0x01)
8      4       Meta-Länge (u32 BE)
12     n       Meta-String: "<salt_b64>;<argon_params>;<nonce_b64>;"
12+n   8       Uncompressed Length (u64 BE)
20+n   *       Ciphertext (AES-256-GCM) über LZ4 (size-prepended) Bytes
```

## LZ4 Ebene
Verwendet `lz4_flex::compress_prepend_size` → Decrypt Result direkt an `decompress_size_prepended` übergeben.

## Argon2
Derzeit Argon2 (Default). M1: Umstellung auf Argon2id mit festen Parametern + Header-Feld für Param-Dokumentation als JSON.

## Sicherheit (Geplante Härtung)
- Parametrisierung (memory ~ 64 MiB, time cost 3, parallelism 1)
- Separates Versioning bei Paramänderung
- Key Handling (Zeroize + ephemeral)
- Tag-Handling: Aktuell rely on decrypt failure; optional future explicit tag separation.

## Known Limitations
- Kein Integritäts-Subheader für zusätzliche Metadaten
- Keine Multi-Chunk Strategie für sehr große Projekte
- Keine Streaming-Speicherung (kompletter DB Dump notwendig)

## Roadmap
M1: Param JSON, KeySpec, explicit error mapping.
M2: Incremental Save (Page-Level Delta) optional.
M3: Secure Memory (mlock / OS APIs) sofern nötig.
