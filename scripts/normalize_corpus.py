#!/usr/bin/env python3
"""Normalize the test corpus (pdf/docx/md) into plain UTF-8 text.

Output goes to test_buecher/_normalized/<stem>.txt so the evaluation harness
can treat every book identically regardless of source format.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

SRC = Path("test_buecher")
DST = SRC / "_normalized"


def from_pdf(path: Path) -> str:
    import fitz  # pymupdf

    with fitz.open(path) as doc:
        return "\n".join(page.get_text() for page in doc)


def from_docx(path: Path) -> str:
    import docx

    return "\n".join(p.text for p in docx.Document(path).paragraphs)


def from_md(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


READERS = {".pdf": from_pdf, ".docx": from_docx, ".md": from_md}


def clean(text: str) -> str:
    # Join words split across line breaks by PDF extraction ("Wort-\nteil").
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    # Collapse runs of blank lines to a single paragraph break.
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit(f"missing corpus directory: {SRC}")
    DST.mkdir(exist_ok=True)

    for path in sorted(SRC.iterdir()):
        reader = READERS.get(path.suffix.lower())
        if not path.is_file() or reader is None:
            continue
        try:
            text = clean(reader(path))
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"  FAIL {path.name}: {exc}")
            continue

        stem = re.sub(r"[^\w.-]+", "_", path.stem).strip("_")
        (DST / f"{stem}.txt").write_text(text, encoding="utf-8")
        print(f"  {path.name:45s} -> {len(text):>9,} chars")

    total = sum(f.stat().st_size for f in DST.glob("*.txt"))
    print(f"\n{len(list(DST.glob('*.txt')))} files, {total / 1e6:.1f} MB in {DST}")


if __name__ == "__main__":
    sys.exit(main())
