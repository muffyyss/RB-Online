# Reference material

This folder holds Riot's official Riftbound Core Rules and the machine-readable
corpus we derive from it. **Nothing here except this README is committed** — the
rules text is Riot's, and this is a non-commercial fan project, so we keep it
local and regenerate it on demand.

## Regenerating the corpus

1. Download the Core Rules PDF from
   [playriftbound.com](https://playriftbound.com/en-us/news/rules-and-releases/gameplay-guide-core-rules/)
   (Rules & Releases → Core Rules) and save it here as `riftbound-core-rules.pdf`.

2. Install poppler once (provides `pdftotext` with `-bbox-layout`):

   ```
   winget install --id oschwartz10612.Poppler -e
   ```

   > The `pdftotext` that ends up on `PATH` may be Xpdf's build, which has no
   > `-bbox-layout`. The extractor locates poppler's own binary itself, so you do
   > not need to fix `PATH`.

3. Run the extractor from the repo root:

   ```
   python scripts/rules/extract_rules.py
   ```

This produces:

| File | Contents |
| --- | --- |
| `core-rules.json` | `[{id, page, depth, kind, text, notes}, ...]` — the engine's source of truth |
| `core-rules.md` | The same corpus, human-readable and numbered |

## Why an extractor rather than copy-paste

The rulebook renders each rule as a left-column label (`103.1.b.2.`) at x≈43 with
the rule body indented at x≥128, sharing a baseline. Plain `pdftotext -layout`
loses that pairing — labels and text drift apart and become unusable. The
extractor works from word bounding boxes and re-pairs label to body by
y-coordinate, so rule numbers survive.

Lines indented *deeper* than a rule's body are that rule's annotations —
`Example: ...` blocks and `See rule N` cross-references — and are captured as
`notes` on the owning rule.

Current fidelity: **2381 rules, 415 notes, 99.99% of the document's text
attached to a numbered rule.** The only unattached lines are the running page
header and the "Last Updated" date.

## How the corpus is used

`docs/rules-spec.md` is the hand-written engine contract, and engine code and
tests cite rule numbers directly from this corpus:

```ts
// rules-spec §327 (chain) / core-rules 330.1: only one Chain can exist at a time
```

When Riot publishes a rules update, drop in the new PDF, re-run the extractor,
and diff `core-rules.json` to see exactly which rules changed.
