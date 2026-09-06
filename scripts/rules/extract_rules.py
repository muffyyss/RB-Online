"""Extract the Riftbound Core Rules PDF into a structured, numbered corpus.

The rulebook lays each rule out as a left-column label (e.g. "103.1.b.2.") at
x~43 and the rule body indented at x>=128, sharing the same baseline y.
`pdftotext -layout` loses that association, so we work from word bounding
boxes and re-pair label to body by y-coordinate.

Lines indented *deeper* than a rule's body are that rule's annotations --
"Example: ..." blocks and "See rule N" cross-references -- and are captured as
notes rather than discarded.

Outputs:
  docs/reference/core-rules.json  - [{id, page, depth, kind, text, notes}, ...]
  docs/reference/core-rules.md    - human-readable, numbered

Usage: python scripts/rules/extract_rules.py [--pdf PATH] [--poppler DIR]
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field

LABEL_X_MAX = 100.0        # rule labels live in the far-left column
Y_TOLERANCE = 1.5          # label and its body share a baseline within this many pts
CONTINUATION_DY = 24.0     # a wrapped/nested line sits this close under its predecessor

LABEL_RE = re.compile(r"^\d{3}\.(?:(?:\d+|[a-z])\.)*$")
SECTION_RE = re.compile(r"^(\d{3}\.(?:(?:\d+|[a-z])\.)*)\s+(\S.*)$")
LINE_RE = re.compile(
    r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>',
    re.S,
)
WORD_RE = re.compile(r">([^<]*)</word>")
PAGE_RE = re.compile(r"<page .*?</page>", re.S)


@dataclass
class Line:
    x: float
    y: float
    text: str


@dataclass
class Rule:
    id: str
    page: int
    depth: int
    kind: str = "rule"                          # "rule" | "section"
    body_x: float = 0.0
    lines: list[str] = field(default_factory=list)
    note_runs: list[list[str]] = field(default_factory=list)
    text: str = ""
    notes: list[str] = field(default_factory=list)

    def finish(self) -> None:
        self.text = " ".join(" ".join(self.lines).split())
        merged = [" ".join(" ".join(run).split()) for run in self.note_runs]
        self.notes = [n for n in merged if n]


def find_poppler(explicit: str | None) -> str:
    """Locate poppler's pdftotext.

    The winget shim on PATH may resolve to Xpdf's build, which has no
    -bbox-layout, so prefer the real package path.
    """
    if explicit:
        return os.path.join(explicit, "pdftotext")
    local = os.path.expandvars(
        r"%LOCALAPPDATA%\Microsoft\WinGet\Packages"
        r"\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe"
    )
    if os.path.isdir(local):
        for entry in sorted(os.listdir(local), reverse=True):
            cand = os.path.join(local, entry, "Library", "bin", "pdftotext.exe")
            if os.path.isfile(cand):
                return cand
    found = shutil.which("pdftotext")
    if not found:
        sys.exit(
            "pdftotext not found. Install poppler:\n"
            "  winget install --id oschwartz10612.Poppler -e"
        )
    return found


def page_lines(page_xml: str) -> list[Line]:
    out: list[Line] = []
    for x_min, y_min, _x_max, _y_max, inner in LINE_RE.findall(page_xml):
        text = html.unescape(" ".join(WORD_RE.findall(inner))).strip()
        if text:
            out.append(Line(float(x_min), float(y_min), text))
    return out


def parse(xml: str) -> tuple[list[Rule], list[str]]:
    rules: list[Rule] = []
    orphans: list[str] = []
    current: Rule | None = None
    last: Line | None = None          # last line attached to `current`
    last_was_note = False
    indents: list[float] = []

    for page_no, page_xml in enumerate(PAGE_RE.findall(xml), start=1):
        # Reading order, so a wrapped or nested line always follows its parent.
        lines = sorted(page_lines(page_xml), key=lambda ln: (round(ln.y, 1), ln.x))
        consumed: set[int] = set()
        page_first_body = True

        for i, line in enumerate(lines):
            if i in consumed:
                continue

            if line.x < LABEL_X_MAX:
                section = SECTION_RE.match(line.text)
                if LABEL_RE.match(line.text):
                    body_idx = None
                    for j, b in enumerate(lines):
                        if (
                            j not in consumed
                            and j != i
                            and b.x >= LABEL_X_MAX
                            and abs(b.y - line.y) <= Y_TOLERANCE
                        ):
                            body_idx = j
                            break
                    if current is not None:
                        current.finish()
                    if body_idx is None:
                        # Label whose body starts on the next page, or a bare node.
                        current = Rule(id=line.text.rstrip("."), page=page_no, depth=0)
                        rules.append(current)
                        last, last_was_note = None, False
                        continue
                    body = lines[body_idx]
                    consumed.add(body_idx)
                    if body.x not in indents:
                        indents.append(body.x)
                        indents.sort()
                    current = Rule(
                        id=line.text.rstrip("."),
                        page=page_no,
                        depth=indents.index(body.x),
                        body_x=body.x,
                        lines=[body.text],
                    )
                    rules.append(current)
                    last, last_was_note = body, False
                elif section:
                    # e.g. "197. Locations" -- a section heading.
                    if current is not None:
                        current.finish()
                    current = Rule(
                        id=section.group(1).rstrip("."),
                        page=page_no,
                        depth=0,
                        kind="section",
                        lines=[section.group(2)],
                    )
                    rules.append(current)
                    last, last_was_note = None, False
                else:
                    orphans.append(line.text)
                continue

            # Indented text with no label of its own.
            # A rule's text often wraps across a page break, where the y-delta
            # is meaningless -- the first indented line of a page continues
            # whatever rule was open at the end of the previous page.
            crosses_page = page_first_body and current is not None
            adjacent = current is not None and (
                crosses_page
                or (last is not None and 0 < (line.y - last.y) <= CONTINUATION_DY)
            )
            page_first_body = False
            if not adjacent or current is None:
                orphans.append(line.text)
                continue

            if abs(line.x - current.body_x) < 1.0 and not last_was_note:
                current.lines.append(line.text)          # wrapped body line
                last, last_was_note = line, False
            elif line.x > current.body_x:
                same_run = last_was_note and last is not None and abs(line.x - last.x) < 1.0
                if same_run and current.note_runs:
                    current.note_runs[-1].append(line.text)
                else:
                    current.note_runs.append([line.text])
                last, last_was_note = line, True
            elif last_was_note and current.note_runs:
                current.note_runs[-1].append(line.text)
                last = line
            else:
                current.lines.append(line.text)
                last, last_was_note = line, False

    if current is not None:
        current.finish()
    for r in rules:
        r.finish()
    return rules, orphans


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", default="docs/reference/riftbound-core-rules.pdf")
    ap.add_argument("--poppler", default=None)
    ap.add_argument("--out-json", default="docs/reference/core-rules.json")
    ap.add_argument("--out-md", default="docs/reference/core-rules.md")
    ap.add_argument("--dump-orphans", default=None, help="write unattached lines here")
    args = ap.parse_args()

    pdftotext = find_poppler(args.poppler)
    with tempfile.TemporaryDirectory() as tmp:
        xml_path = os.path.join(tmp, "rules.xml")
        subprocess.run(
            [pdftotext, "-bbox-layout", args.pdf, xml_path],
            check=True,
            capture_output=True,
        )
        with open(xml_path, encoding="utf-8") as fh:
            xml = fh.read()

    rules, orphans = parse(xml)
    rules = [r for r in rules if r.text]

    os.makedirs(os.path.dirname(args.out_json), exist_ok=True)
    with open(args.out_json, "w", encoding="utf-8") as fh:
        json.dump(
            [
                {
                    "id": r.id,
                    "page": r.page,
                    "depth": r.depth,
                    "kind": r.kind,
                    "text": r.text,
                    "notes": r.notes,
                }
                for r in rules
            ],
            fh,
            indent=2,
            ensure_ascii=False,
        )

    with open(args.out_md, "w", encoding="utf-8") as fh:
        fh.write("# Riftbound Core Rules - extracted corpus\n\n")
        fh.write(
            "Auto-generated by `scripts/rules/extract_rules.py` from the official "
            "Core Rules PDF. Do not edit by hand.\n"
        )
        for r in rules:
            if r.kind == "section":
                fh.write("\n## " + r.id + ". " + r.text + "\n\n")
                continue
            fh.write("  " * r.depth + "- **" + r.id + ".** " + r.text + "\n")
            for note in r.notes:
                fh.write("  " * (r.depth + 1) + "- _" + note + "_\n")

    if args.dump_orphans:
        with open(args.dump_orphans, "w", encoding="utf-8") as fh:
            fh.write(chr(10).join(orphans))

    sections = sum(1 for r in rules if r.kind == "section")
    noted = sum(len(r.notes) for r in rules)
    print("sections   :", sections)
    print("rules      :", len(rules) - sections)
    print("notes      :", noted)
    print("orphans    :", len(orphans))
    print("json       :", args.out_json)
    print("markdown   :", args.out_md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
