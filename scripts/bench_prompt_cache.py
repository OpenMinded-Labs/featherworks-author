#!/usr/bin/env python3
"""Measure whether the mlx_lm server's prompt cache speeds up scene work.

FeatherWorks sends the same scene text repeatedly with different instructions.
If the KV cache holds, only the first request pays the prefill cost.

Requires a running server:
    python -m mlx_lm server --model <dir> --port 8765 --prompt-cache-size 8
"""

from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

URL = "http://127.0.0.1:8765/v1/chat/completions"
SCENE = Path("test_buecher/_normalized/Martyria_1.txt").read_text()[:12000]

INSTRUCTIONS = [
    "Nenne alle Figuren in dieser Szene als kommagetrennte Liste.",
    "An welchem Ort spielt die Szene?",
    "Fasse die Szene in zwei Saetzen zusammen.",
    "Nenne die groesste stilistische Schwaeche.",
]


def ask(instruction: str, scene_first: bool) -> tuple[float, int, int, str]:
    # Cache hits require a stable prefix, so the scene must come first and the
    # varying instruction last.
    content = (
        f"{SCENE}\n\n---\n\n{instruction}" if scene_first
        else f"{instruction}\n\n---\n\n{SCENE}"
    )
    payload = {
        "messages": [{"role": "user", "content": content}],
        "max_tokens": 200,
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    start = time.time()
    with urllib.request.urlopen(req, timeout=600) as resp:
        body = json.loads(resp.read())
    elapsed = time.time() - start

    # The server splits reasoning from the answer; `content` is absent when the
    # model never stopped reasoning within the token budget.
    message = body["choices"][0]["message"]
    text = message.get("content") or f"[nur reasoning] {message.get('reasoning', '')}"

    usage = body.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens", 0)
    cached = usage.get("prompt_tokens_details", {}).get("cached_tokens", 0)
    return elapsed, prompt_tokens, cached, text


def main() -> None:
    print(f"Scene: {len(SCENE):,} chars\n")
    for scene_first in (True, False):
        label = "SCENE FIRST (cacheable)" if scene_first else "INSTRUCTION FIRST"
        print(f"{'=' * 60}\n{label}\n{'=' * 60}")
        for i, instruction in enumerate(INSTRUCTIONS, 1):
            elapsed, ptok, cached, text = ask(instruction, scene_first)
            marker = "  <- cold" if i == 1 else ""
            print(f"  {i}. {elapsed:6.1f}s  prompt={ptok:>6}  cached={cached:>6}{marker}")
            print(f"     {text[:110].strip()}")
        print()


if __name__ == "__main__":
    main()
