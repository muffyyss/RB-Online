"""Verify that every rule citation in the repo points at a real rule.

docs/rules-spec.md and the engine cite the Core Rules by number, e.g. (471.1.b)
or `// 465.2.c.3 - ...`. Those citations are the only thing tying the
implementation back to the rulebook, so a wrong number is worse than no number:
it looks authoritative and sends the next reader to the wrong place.

This walks the given files, pulls out anything shaped like a rule number, and
checks it against the extracted corpus.

Usage:
  python scripts/rules/check_citations.py [paths...]

Defaults to docs/rules-spec.md plus every .ts file under packages/.
Exits non-zero if any citation is unknown.

Note: the corpus is gitignored (it is Riot's text), so this is a local check,
not a CI gate. Run it after editing the spec.
"""

from __future__ import annotations

import json
import os
import re
import sys

CORPUS = "docs/reference/core-rules.json"

# Bare three-digit numbers appear constantly in prose ("at least 40 cards",
# "100+ examples"), so only trust a bare one inside a citation-ish context.
CONTEXTUAL_RE = re.compile(
    # `(?<!\w)` before the bracket keeps function calls like fromSeed(555) out.
    r"(?<!\w)[(\[]\s*(\d{3}(?:\.(?:\d+|[a-z]))*)"     # (471.1.b  or  [471
    r"|(?:rule|rules|see|per|cf\.?)\s+(\d{3}(?:\.(?:\d+|[a-z]))*)"
    r"|\b(\d{3}(?:\.(?:\d+|[a-z]))+)\b",             # anything with a dot is unambiguous
    re.I,
)


def load_corpus() -> set[str]:
    if not os.path.exists(CORPUS):
        sys.exit(
            f"{CORPUS} not found.\n"
            "Regenerate it first: python scripts/rules/extract_rules.py\n"
            "(See docs/reference/README.md for the one-time poppler setup.)"
        )
    with open(CORPUS, encoding="utf-8") as fh:
        return {r["id"] for r in json.load(fh)}


def default_targets() -> list[str]:
    targets = ["docs/rules-spec.md"]
    for root, _dirs, files in os.walk("packages"):
        if "node_modules" in root or "dist" in root:
            continue
        targets += [os.path.join(root, f) for f in files if f.endswith(".ts")]
    return [t for t in targets if os.path.exists(t)]


def main() -> int:
    known = load_corpus()
    targets = sys.argv[1:] or default_targets()

    total = 0
    bad: list[tuple[str, int, str]] = []
    for path in targets:
        with open(path, encoding="utf-8") as fh:
            for lineno, line in enumerate(fh, 1):
                for match in CONTEXTUAL_RE.finditer(line):
                    cite = next(g for g in match.groups() if g)
                    total += 1
                    if cite not in known:
                        bad.append((path, lineno, cite))

    print(f"checked {total} citations across {len(targets)} file(s)")
    if bad:
        print(f"\n{len(bad)} unknown citation(s):")
        for path, lineno, cite in bad:
            print(f"  {path}:{lineno}  ->  {cite}")
        return 1
    print("all citations resolve to real rules")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
