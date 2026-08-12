#!/usr/bin/env python3
"""Download the Gemma MLX model into resources/models/ for FeatherWorks Author."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from huggingface_hub import snapshot_download

REPO_ID = "mlx-community/gemma-4-e2b-it-6bit"
TARGET_DIR = Path(__file__).resolve().parents[1] / "resources" / "models" / "gemma-4-e2b-mlx-q6"


def main() -> int:
    print(f"Downloading {REPO_ID} ...")
    cached = snapshot_download(REPO_ID)
    print(f"Cached at: {cached}")

    if TARGET_DIR.exists():
        shutil.rmtree(TARGET_DIR)
    TARGET_DIR.parent.mkdir(parents=True, exist_ok=True)

    # Copy (resolving symlinks) so the app bundle is self-contained.
    shutil.copytree(cached, TARGET_DIR, symlinks=False)

    total = sum(f.stat().st_size for f in TARGET_DIR.rglob("*") if f.is_file())
    print(f"Installed to: {TARGET_DIR}")
    print(f"Size: {total / 1_000_000_000:.2f} GB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
