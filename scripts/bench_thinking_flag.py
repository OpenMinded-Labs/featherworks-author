#!/usr/bin/env python3
"""Does disabling the thinking block cost quality?

`chat_template_kwargs={"enable_thinking": false}` makes Gemma 4 answer without
its reasoning block. On a trivial prompt that was 7x faster (0.9s vs 6.5s), but
speed is worthless if the answers get worse - an earlier attempt with a Qwen
style "pre-closed thought block" cut tokens by 60% and silently degraded
editing tasks.

This measures both modes on real manuscript text so the flag can be decided
per task type instead of globally.

Requires a running server:
    ./.venv-mlx/bin/python -m mlx_lm server \
        --model resources/models/gemma-4-e2b-mlx-q6-text --port 8791

Usage:
    ./.venv-mlx/bin/python scripts/bench_thinking_flag.py
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
URL = "http://127.0.0.1:8791/v1/chat/completions"
MODEL = "resources/models/gemma-4-e2b-mlx-q6-text"
CORPUS = REPO / "test_buecher/_normalized/Martyria_1.txt"

# The file starts with ~40k chars of front matter (title page, copyright, world
# primer). Measuring there tests the wrong thing - a first attempt returned the
# *author's* name as a character. Narrative dialogue starts around 43k.
NARRATIVE_START = 43_000
SCENE_CHARS = 6_000

# Figures appearing in that slice.
KNOWN_ENTITIES = ["Zrassha", "Sierrkha"]


def ask(messages: list[dict], max_tokens: int, thinking: bool) -> tuple[float, int, str]:
    body = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.2,
        "chat_template_kwargs": {"enable_thinking": thinking},
    }
    req = urllib.request.Request(
        URL, json.dumps(body).encode(), {"Content-Type": "application/json"}
    )
    started = time.perf_counter()
    with urllib.request.urlopen(req, timeout=600) as response:
        data = json.load(response)
    elapsed = time.perf_counter() - started
    return (
        elapsed,
        data["usage"]["completion_tokens"],
        data["choices"][0]["message"].get("content") or "",
    )


def task_entities(scene: str) -> tuple[list[dict], int]:
    return [
        {
            "role": "system",
            "content": "Du extrahierst Entitaeten aus Romantext. "
            "Antworte als JSON-Liste von Objekten mit 'name' und 'typ'.",
        },
        {"role": "user", "content": f"Extrahiere alle Figuren:\n\n{scene}"},
    ], 800


def task_summary(scene: str) -> tuple[list[dict], int]:
    return [
        {"role": "system", "content": "Du bist ein Lektor."},
        {"role": "user", "content": f"Fasse die Passage in 3 Saetzen zusammen:\n\n{scene}"},
    ], 500


def task_style(scene: str) -> tuple[list[dict], int]:
    return [
        {"role": "system", "content": "Du bist ein Lektor."},
        {
            "role": "user",
            "content": "Nenne drei konkrete stilistische Schwaechen mit Textbeleg:\n\n"
            + scene,
        },
    ], 700


def score_entities(answer: str) -> str:
    found = [e for e in KNOWN_ENTITIES if e.lower() in answer.lower()]
    parses = False
    match = re.search(r"\[.*\]", answer, re.DOTALL)
    if match:
        try:
            json.loads(match.group())
            parses = True
        except json.JSONDecodeError:
            pass
    return f"{len(found)}/{len(KNOWN_ENTITIES)} Namen, JSON={'ok' if parses else 'FEHLT'}"


def score_generic(answer: str) -> str:
    sentences = len(re.findall(r"[.!?]", answer))
    return f"{len(answer):4} Zeichen, ~{sentences} Saetze"


TASKS = [
    ("Entitaeten", task_entities, score_entities),
    ("Zusammenf.", task_summary, score_generic),
    ("Stilkritik", task_style, score_generic),
]


def main() -> int:
    if not CORPUS.exists():
        print(f"corpus missing: {CORPUS}", file=sys.stderr)
        return 1

    scene = CORPUS.read_text(encoding="utf-8")[
        NARRATIVE_START : NARRATIVE_START + SCENE_CHARS
    ]

    try:
        ask([{"role": "user", "content": "ping"}], 10, False)
    except urllib.error.URLError as e:
        print(f"server not reachable at {URL}: {e}", file=sys.stderr)
        return 1

    results = []
    for name, build, score in TASKS:
        messages, budget = build(scene)
        print(f"\n=== {name} ===")
        for thinking in (True, False):
            elapsed, tokens, answer = ask(messages, budget, thinking)
            label = "mit  Thinking" if thinking else "ohne Thinking"
            print(f"{label}: {elapsed:5.1f}s | {tokens:4} tok | {score(answer)}")
            print(f"    {answer[:180].strip()!r}")
            results.append(
                {
                    "task": name,
                    "thinking": thinking,
                    "seconds": round(elapsed, 1),
                    "tokens": tokens,
                    "answer": answer,
                }
            )

    out = REPO / "scripts/bench_thinking_flag_results.json"
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    print("\n--- Speedup ---")
    for name, _, _ in TASKS:
        with_t = next(r for r in results if r["task"] == name and r["thinking"])
        without = next(r for r in results if r["task"] == name and not r["thinking"])
        factor = with_t["seconds"] / without["seconds"] if without["seconds"] else 0
        print(
            f"{name}: {with_t['seconds']:5.1f}s -> {without['seconds']:5.1f}s "
            f"({factor:.1f}x, {with_t['tokens']} -> {without['tokens']} tok)"
        )
    print(f"\nDetails: {out.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
