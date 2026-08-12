#!/usr/bin/env python3
"""Compare Gemma 4 answer quality/length with and without a pre-closed thought block.

Qwen-style trick: seed a short, already-closed reasoning block so the model
believes it has finished thinking. Measures whether that suppresses the
reasoning ramble without degrading answer quality.
"""

import subprocess
import sys

MODEL = "resources/models/gemma-4-e2b-mlx-q6-text"
PYTHON = ".venv-mlx/bin/python"
PRIMER = "Der Nutzer will nur das Ergebnis. Ich antworte direkt."

TASKS = {
    "absaetze": "Setze Absaetze in diesen Text:\n\nEr ging zur Tuer. Sie war offen. Draussen regnete es. Maria wartete.",
    "stil": "Verbessere diesen Satz stilistisch:\n\nEr ging sehr schnell und hastig zu der Tuer die offen war.",
    "entity": "Nenne alle Personennamen in diesem Text als kommagetrennte Liste:\n\nMaria sah Peter am Fenster. Spaeter kam Anna dazu.",
}


def build(task: str, primed: bool) -> str:
    prompt = f"<|turn>user\n{task}<turn|>\n<|turn>model\n"
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
    # Strip any reasoning that leaked through.
    if "<channel|>" in text:
        text = text.rsplit("<channel|>", 1)[1].strip()
    return text, tokens


def main() -> None:
    for name, task in TASKS.items():
        print(f"\n{'=' * 70}\nTASK: {name}\n{'=' * 70}")
        for primed in (False, True):
            text, tokens = run(build(task, primed))
            label = "PRIMED " if primed else "BASELINE"
            print(f"\n--- {label} ({tokens} tokens) ---")
            print(text[:400])
        sys.stdout.flush()


if __name__ == "__main__":
    main()
