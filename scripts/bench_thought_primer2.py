#!/usr/bin/env python3
"""Decide whether the Qwen-style pre-closed thought block helps Gemma 4.

Compares two candidates across several task types:
  A: system directive only            (current default)
  C: system directive + primed thought block

Reports generated token count and the answer, so brevity gains can be weighed
against answer quality.
"""

import subprocess
import sys

MODEL = "resources/models/gemma-4-e2b-mlx-q6-text"
PYTHON = ".venv-mlx/bin/python"
DIRECTIVE = (
    "Antworte direkt und knapp. Gib ausschliesslich das Ergebnis aus - "
    "keine Analyse, keine Optionen, keine Erklaerung."
)
PRIMER = "Der Nutzer will nur das Ergebnis. Ich antworte direkt."

TASKS = {
    "absaetze": "Setze Absaetze in diesen Text:\n\nEr ging zur Tuer. Sie war offen. Draussen regnete es. Maria wartete.",
    "stil": "Verbessere diesen Satz stilistisch:\n\nEr ging sehr schnell und hastig zu der Tuer die offen war.",
    "entity": "Nenne alle Personennamen in diesem Text als kommagetrennte Liste:\n\nMaria sah Peter am Fenster. Spaeter kam Anna dazu.",
}


def build(task: str, primed: bool) -> str:
    prompt = f"<|turn>system\n{DIRECTIVE}<turn|>\n<|turn>user\n{task}<turn|>\n<|turn>model\n"
    if primed:
        prompt += f"<|channel>thought\n{PRIMER}\n<channel|>"
    return prompt


def run(prompt: str) -> tuple[str, int]:
    result = subprocess.run(
        [PYTHON, "-m", "mlx_lm", "generate", "--model", MODEL,
         "--prompt", "-", "--max-tokens", "900", "--temp", "0.2"],
        input=prompt, capture_output=True, text=True,
    )
    out = result.stdout
    parts = out.split("==========")
    text = parts[1].strip() if len(parts) >= 2 else out.strip()
    tokens = 0
    for line in out.splitlines():
        if line.startswith("Generation:"):
            tokens = int(line.split()[1])
    if "<channel|>" in text:
        text = text.rsplit("<channel|>", 1)[1].strip()
    return text, tokens


def main() -> None:
    totals = {"A": 0, "C": 0}
    for name, task in TASKS.items():
        print(f"\n{'=' * 70}\nTASK: {name}\n{'=' * 70}")
        for key, primed in (("A", False), ("C", True)):
            text, tokens = run(build(task, primed))
            totals[key] += tokens
            print(f"\n--- {key} ({tokens} tokens) ---")
            print(text[:300])
            sys.stdout.flush()
    print(f"\n\nTOTAL A (directive only): {totals['A']} tokens")
    print(f"TOTAL C (directive+primer): {totals['C']} tokens")


if __name__ == "__main__":
    main()
