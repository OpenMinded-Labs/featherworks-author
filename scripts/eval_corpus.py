#!/usr/bin/env python3
"""Evaluate Gemma 4 on real FeatherWorks tasks against the test corpus.

Runs the model against excerpts from actual manuscripts and scores it where
ground truth exists (chapter annotations in zusammenfassungen/*.json).

Tasks:
  entities  - extract character names (scored: recall/precision vs. annotations)
  qa        - answer a question about the excerpt (manual review)
  summary   - summarise a chapter (manual review)
  style     - flag stylistic problems (manual review)
  continue  - continue the prose in the author's voice (manual review)

Usage:
    python scripts/eval_corpus.py [task ...]
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
from pathlib import Path

MODEL = "resources/models/gemma-4-e2b-mlx-q6-text"
PYTHON = ".venv-mlx/bin/python"
CORPUS = Path("test_buecher/_normalized")
TRUTH = Path("test_buecher/zusammenfassungen/martyria1_gemini.json")

DIRECTIVE = (
    "Antworte direkt und knapp. Gib ausschliesslich das Ergebnis aus - "
    "keine Analyse, keine Optionen, keine Erklaerung."
)


def build_prompt(system: str, user: str) -> str:
    return (
        f"<|turn>system\n{system}<turn|>\n"
        f"<|turn>user\n{user}<turn|>\n"
        f"<|turn>model\n"
    )


def generate(prompt: str, max_tokens: int = 3000) -> tuple[str, float, int]:
    start = time.time()
    result = subprocess.run(
        [PYTHON, "-m", "mlx_lm", "generate", "--model", MODEL,
         "--prompt", "-", "--max-tokens", str(max_tokens), "--temp", "0.2"],
        input=prompt, capture_output=True, text=True,
    )
    elapsed = time.time() - start
    out = result.stdout
    parts = out.split("==========")
    text = parts[1].strip() if len(parts) >= 2 else out.strip()
    # Drop the reasoning block the same way the Rust engine does.
    if "<channel|>" in text:
        text = text.rsplit("<channel|>", 1)[1].strip()
    tokens = 0
    for line in out.splitlines():
        if line.startswith("Generation:"):
            tokens = int(line.split()[1])
    return text, elapsed, tokens


def load_chapters() -> list[dict]:
    """Slice the Martyria text into chapters using the annotated anchors."""
    data = json.loads(TRUTH.read_text())
    text = (CORPUS / "Martyria_1.txt").read_text()
    flat = re.sub(r"\s+", " ", text)

    chapters = []
    for entry in data["kapitel"]:
        anchor = re.sub(r"\s+", " ", entry["beginn"]).strip()
        idx = flat.find(anchor)
        if idx < 0:
            continue
        chapters.append({
            "nr": entry.get("nr_echt", entry["nr"]),
            "titel": entry["titel"],
            "start": idx,
            "figuren": entry["figuren"],
            "orte": entry["orte"],
            "zusammenfassung": entry["zusammenfassung"],
            "text": flat,
        })
    # A chapter ends where the next one begins.
    chapters.sort(key=lambda c: c["start"])
    for i, ch in enumerate(chapters):
        end = chapters[i + 1]["start"] if i + 1 < len(chapters) else len(flat)
        ch["body"] = flat[ch["start"]:end].strip()
    return chapters


def norm_name(name: str) -> str:
    """Reduce a name to its first token, lowercased.

    The annotations mix full names and short forms ("Bork" vs.
    "Bork Schwefelstein"), so surnames would otherwise cause false misses.
    """
    return re.sub(r"[^\w]", "", name.split()[0]).lower() if name.split() else ""


def name_variants(full: str) -> set[str]:
    """All tokens of a name, so "Bork Schwefelstein" also matches "Schwefelstein".

    Without this, correct surname-only answers were scored as false positives.
    """
    return {re.sub(r"[^\w]", "", part).lower() for part in full.split()} - {""}


def task_entities(chapters: list[dict]) -> None:
    print("\n" + "=" * 72)
    print("TASK: ENTITY EXTRACTION (scored against annotations)")
    print("=" * 72)

    system = (
        "Du bist ein praeziser Text-Analyst fuer Romanmanuskripte. "
        + DIRECTIVE
    )
    total_recall, total_prec, runs = 0.0, 0.0, 0

    for ch in chapters[:5]:
        excerpt = ch["body"][:6000]
        user = (
            "Nenne alle Figuren (Personennamen), die in diesem Textausschnitt "
            "vorkommen. Antworte als kommagetrennte Liste, sonst nichts.\n\n"
            f"{excerpt}"
        )
        answer, elapsed, tokens = generate(build_prompt(system, user))

        found = {norm_name(n) for n in re.split(r"[,\n]", answer) if n.strip()}
        found.discard("")
        expected = {norm_name(n) for n in ch["figuren"]}
        expected.discard("")
        # Surnames and other tokens of an annotated name count as correct.
        accepted = {v for n in ch["figuren"] for v in name_variants(n)}
        # Only names actually present in the excerpt can fairly be expected.
        low = excerpt.lower()
        expected = {n for n in expected if n in low}
        if not expected:
            continue

        hits = found & expected
        recall = len(hits) / len(expected)
        # Anything matching an annotated name variant is a true positive.
        correct = found & accepted
        precision = len(correct) / len(found) if found else 0.0
        total_recall += recall
        total_prec += precision
        runs += 1

        print(f"\n--- Kapitel {ch['nr']}: {ch['titel'][:45]} ---")
        print(f"    {elapsed:.1f}s, {tokens} tokens")
        print(f"    Recall    {recall:.0%}  ({len(hits)}/{len(expected)})")
        print(f"    Precision {precision:.0%}")
        missed = expected - found
        if missed:
            print(f"    Verpasst: {', '.join(sorted(missed))}")
        extra = found - accepted
        if extra:
            print(f"    Nicht annotiert: {', '.join(sorted(extra))}")
        sys.stdout.flush()

    if runs:
        print(f"\n>>> MITTELWERT  Recall {total_recall / runs:.0%}  "
              f"Precision {total_prec / runs:.0%}  (n={runs})")


def task_qa(chapters: list[dict]) -> None:
    print("\n" + "=" * 72)
    print("TASK: QUESTION ANSWERING")
    print("=" * 72)

    system = "Du bist ein Lektor. Antworte praezise auf Basis des Textes. " + DIRECTIVE
    questions = [
        "Wer ist die Hauptfigur in diesem Ausschnitt und was tut sie?",
        "An welchem Ort spielt die Szene?",
        "Welcher Konflikt treibt die Szene an?",
    ]
    ch = chapters[0]
    for q in questions:
        user = f"{q}\n\nTEXT:\n{ch['body'][:6000]}"
        answer, elapsed, tokens = generate(build_prompt(system, user))
        print(f"\n--- {q} ---")
        print(f"    ({elapsed:.1f}s, {tokens} tokens)")
        print(f"    {answer[:400]}")
        sys.stdout.flush()
    print(f"\n[Referenz] {ch['zusammenfassung'][:300]}")


def task_summary(chapters: list[dict]) -> None:
    print("\n" + "=" * 72)
    print("TASK: CHAPTER SUMMARY (compare against reference)")
    print("=" * 72)

    system = "Du bist ein Lektor. " + DIRECTIVE
    for ch in chapters[:2]:
        user = (
            "Fasse dieses Kapitel in 3-4 Saetzen zusammen. Nenne die "
            "wichtigsten Ereignisse.\n\n" + ch["body"][:8000]
        )
        answer, elapsed, tokens = generate(build_prompt(system, user))
        print(f"\n--- Kapitel {ch['nr']} ({elapsed:.1f}s, {tokens} tokens) ---")
        print(f"MODELL:   {answer[:500]}")
        print(f"REFERENZ: {ch['zusammenfassung'][:500]}")
        sys.stdout.flush()


def task_style(chapters: list[dict]) -> None:
    print("\n" + "=" * 72)
    print("TASK: STYLE CRITIQUE")
    print("=" * 72)

    system = "Du bist ein erfahrener Lektor fuer Belletristik. " + DIRECTIVE
    excerpt = chapters[0]["body"][:4000]
    user = (
        "Nenne die drei groessten stilistischen Schwaechen dieses "
        "Textausschnitts. Jeweils ein Satz Begruendung und ein konkretes "
        "Beispiel aus dem Text.\n\n" + excerpt
    )
    answer, elapsed, tokens = generate(build_prompt(system, user))
    print(f"\n({elapsed:.1f}s, {tokens} tokens)")
    print(answer[:1200])


def task_continue(chapters: list[dict]) -> None:
    print("\n" + "=" * 72)
    print("TASK: CONTINUATION IN AUTHOR VOICE")
    print("=" * 72)

    system = (
        "Du bist ein Ghostwriter. Setze den Text im exakt gleichen Stil, "
        "Tempus und Erzaehlperspektive fort. " + DIRECTIVE
    )
    excerpt = chapters[0]["body"][:3000]
    user = "Schreibe die naechsten 2 Absaetze.\n\n" + excerpt
    answer, elapsed, tokens = generate(build_prompt(system, user))
    print(f"\n({elapsed:.1f}s, {tokens} tokens)")
    print(f"[Original-Ende] ...{excerpt[-300:]}\n")
    print(f"[Fortsetzung] {answer[:800]}")


TASKS = {
    "entities": task_entities,
    "qa": task_qa,
    "summary": task_summary,
    "style": task_style,
    "continue": task_continue,
}


def main() -> None:
    chapters = load_chapters()
    print(f"Korpus: {len(chapters)} Kapitel aus Martyria 1 mit Ground Truth")
    print(f"Modell: {MODEL}")

    selected = sys.argv[1:] or list(TASKS)
    for name in selected:
        fn = TASKS.get(name)
        if fn is None:
            print(f"unknown task: {name}")
            continue
        fn(chapters)


if __name__ == "__main__":
    main()
