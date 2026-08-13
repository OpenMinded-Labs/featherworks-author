#!/usr/bin/env python3
"""Verify that Gemma 4 actually uses long scene context - not just the beginning.

Motivation: we removed all context truncation (frontend 1500 chars, backend 3000).
The model *can* now see whole scenes. Whether it *uses* them is a different
question: 30 of 35 layers use sliding attention (window 512), only 5 are full
attention.

Method: needle-in-a-haystack. Insert a distinctive fact at a known relative
position in a real chapter, then ask for it. Measures both recall and latency
across context sizes.

Usage:
    ./.venv-mlx/bin/python scripts/verify_long_context.py
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MODEL = REPO / "resources/models/gemma-4-e2b-mlx-q6-text"
PYTHON = REPO / ".venv-mlx/bin/python"
CORPUS = REPO / "test_buecher/_normalized/Martyria_1.txt"

# The needle: a fact that cannot plausibly appear in the source text, so a
# correct answer proves retrieval rather than prior knowledge or guessing.
NEEDLE = (
    "Am Rand des Tisches lag ein zerkratzter Messingkompass, "
    "dessen Nadel unbeirrt nach Suedwesten zeigte."
)
QUESTION = "Welcher Gegenstand lag am Rand des Tisches, und wohin zeigte er?"
EXPECT = ["kompass", "suedwest", "südwest"]

# Scene sizes in characters. 3000 = the old backend cap, for comparison.
SIZES = [3_000, 8_000, 16_000, 32_000]
# Where the needle sits, as a fraction of the text.
POSITIONS = {"anfang": 0.05, "mitte": 0.5, "ende": 0.92}


def build_prompt(scene: str, question: str) -> str:
    """Mirror the real prompt layout from FontainePanel.tsx (chat mode).

    Uses Gemma 4 turn markers directly: <|turn>/<turn|>, NOT the Gemma 2/3
    <start_of_turn>, which is not in this tokenizer's vocabulary.
    """
    system = (
        "Du bist Fontaine, ein freundlicher Schreibassistent fuer einen Roman.\n"
        "Nutze den KONTEXT unten, um Fragen ueber Charaktere, Handlung und "
        "Szenen zu beantworten.\n"
        "Beziehe dich konkret auf den Text.\n\n"
        f"KONTEXT:\n{scene}"
    )
    return (
        f"<|turn>system\n{system}<turn|>\n"
        f"<|turn>user\n{question}<turn|>\n"
        f"<|turn>model\n"
    )


def insert_needle(text: str, size: int, fraction: float) -> str:
    """Cut `size` chars and place the needle at `fraction`, on a sentence break."""
    scene = text[:size]
    target = int(len(scene) * fraction)
    # Snap to the next sentence end so the insert does not break mid-sentence.
    match = re.search(r"[.!?]\s", scene[target:])
    cut = target + (match.end() if match else 0)
    return scene[:cut] + NEEDLE + " " + scene[cut:]


def ask(prompt: str) -> tuple[str, float]:
    started = time.perf_counter()
    proc = subprocess.run(
        [
            str(PYTHON), "-m", "mlx_lm", "generate",
            "--model", str(MODEL),
            "--prompt", prompt,
            # Generous budget: the model emits a <|channel>thought block first.
            # With 150 tokens it never reached the actual answer, which looked
            # like a recall failure but was a truncated generation.
            "--max-tokens", "800",
            "--temp", "0.0",
        ],
        capture_output=True,
        text=True,
        timeout=900,
    )
    elapsed = time.perf_counter() - started
    if proc.returncode != 0:
        return f"<ERROR: {proc.stderr.strip()[-300:]}>", elapsed
    out = proc.stdout
    # mlx_lm frames the answer with ========== separators.
    parts = out.split("=" * 10)
    answer = parts[1].strip() if len(parts) > 2 else out.strip()
    # Drop the thinking block: everything up to and including <channel|>.
    if "<channel|>" in answer:
        answer = answer.rsplit("<channel|>", 1)[1].strip()
    return answer, elapsed


def hit(answer: str) -> bool:
    low = answer.lower()
    return any(token in low for token in EXPECT)


def truncated(answer: str) -> bool:
    """Generation ran out of budget inside the thinking block.

    Such a run measures --max-tokens, not recall, and must not be counted as
    a miss.
    """
    return "<|channel>" in answer and "<channel|>" not in answer


def main() -> int:
    if not PYTHON.exists():
        print(f"venv missing: {PYTHON}", file=sys.stderr)
        return 1
    if not CORPUS.exists():
        print(f"corpus missing: {CORPUS}", file=sys.stderr)
        return 1

    text = CORPUS.read_text(encoding="utf-8")
    print(f"Corpus: {CORPUS.name} ({len(text):,} chars)")
    print(f"Needle: {NEEDLE[:60]}...\n")

    results = []
    for size in SIZES:
        if size > len(text):
            continue
        for label, fraction in POSITIONS.items():
            scene = insert_needle(text, size, fraction)
            answer, elapsed = ask(build_prompt(scene, QUESTION))
            cut = truncated(answer)
            ok = hit(answer)
            results.append(
                {
                    "chars": size,
                    "position": label,
                    "found": ok,
                    "truncated": cut,
                    "seconds": round(elapsed, 1),
                    "answer": answer[:200],
                }
            )
            mark = "CUT " if cut else ("OK  " if ok else "MISS")
            print(f"{mark} {size:>6,} chars | needle {label:<6} | {elapsed:5.1f}s")
            if not ok:
                print(f"       -> {answer[:150]}")

    out_path = REPO / "scripts/verify_long_context_results.json"
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    print("\n--- Summary ---")
    for size in SIZES:
        rows = [r for r in results if r["chars"] == size]
        if not rows:
            continue
        found = sum(r["found"] for r in rows)
        cuts = sum(r["truncated"] for r in rows)
        avg = sum(r["seconds"] for r in rows) / len(rows)
        note = f", {cuts} truncated (invalid)" if cuts else ""
        print(f"{size:>6,} chars: {found}/{len(rows)} found, avg {avg:5.1f}s{note}")
    print(f"\nDetails: {out_path.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
