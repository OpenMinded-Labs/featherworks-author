#!/usr/bin/env python3
"""Strip vision/audio towers from the Gemma 4 MLX artifact.

Fontaine is a text-only authoring tool, so the vision and audio encoders are
dead weight: they consume RAM and load time on every inference call.

This rewrites the model as a pure `gemma4_text` artifact by:
  1. keeping only `language_model.model.*` weights (re-rooted to `model.*`),
  2. promoting `text_config` to the top level of config.json.

Usage:
    python scripts/strip_gemma_multimodal.py <src_dir> <dst_dir>
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import mlx.core as mx

KEEP_PREFIX = "language_model."
# Tokenizer/template files the runtime still needs.
SIDECAR_FILES = (
    "tokenizer.json",
    "tokenizer_config.json",
    "chat_template.jinja",
    "generation_config.json",
)


def strip(src: Path, dst: Path) -> None:
    if not src.is_dir():
        raise SystemExit(f"source not found: {src}")
    dst.mkdir(parents=True, exist_ok=True)

    weights = mx.load(str(src / "model.safetensors"))
    kept = {
        k[len(KEEP_PREFIX):]: v
        for k, v in weights.items()
        if k.startswith(KEEP_PREFIX)
    }
    if not kept:
        raise SystemExit("no language_model weights found - wrong artifact?")

    dropped = len(weights) - len(kept)
    mx.save_safetensors(str(dst / "model.safetensors"), kept)

    config = json.loads((src / "config.json").read_text())
    text_config = config.get("text_config")
    if not text_config:
        raise SystemExit("config.json has no text_config")

    # Promote text_config to top level and carry over quantization settings,
    # which live at the root of the multimodal config.
    new_config = dict(text_config)
    new_config["model_type"] = "gemma4_text"
    new_config["architectures"] = ["Gemma4ForCausalLM"]
    for key in ("quantization", "quantization_config"):
        if key in config:
            new_config[key] = config[key]
    (dst / "config.json").write_text(json.dumps(new_config, indent=2))

    for name in SIDECAR_FILES:
        source = src / name
        if source.exists():
            shutil.copy2(source, dst / name)

    src_size = (src / "model.safetensors").stat().st_size
    dst_size = (dst / "model.safetensors").stat().st_size
    print(f"kept {len(kept)} weights, dropped {dropped}")
    print(f"{src_size / 1e9:.2f} GB -> {dst_size / 1e9:.2f} GB")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    strip(Path(sys.argv[1]), Path(sys.argv[2]))
