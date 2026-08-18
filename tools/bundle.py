"""Emit the corpus as a plain script instead of a JSON file.

Chrome treats `file://` as an opaque origin, so a page opened by double-click
cannot `fetch()` even a sibling file. `<script src>` is not subject to that
check, which is why content.js loads and laws.json did not. Shipping the data
as a script is what makes the PC copy work without a server, and it keeps the
Android WebView and the PWA on the same single artifact.

The payload is wrapped in JSON.parse() rather than written as an object
literal: for a few megabytes the JSON parser is markedly faster than having
the JavaScript parser read the same bytes as source code.
"""
from __future__ import annotations

import json
from pathlib import Path


def write_bundle(path: Path, variable: str, data: object) -> int:
    """Write `window.<variable>=JSON.parse("…")` and return the byte size."""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    literal = json.dumps(payload, ensure_ascii=False)
    # "</" would close the enclosing <script> early; U+2028/29 are line
    # terminators that older engines reject inside a string literal.
    literal = (
        literal.replace("</", "<\\/")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"window.{variable}=JSON.parse({literal});\n", encoding="utf-8")
    return path.stat().st_size
