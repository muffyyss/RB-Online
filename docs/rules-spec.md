# Rules spec — the engine contract

What `packages/engine` must implement, derived from Riot's Core Rules
(RUP4, 2026-07-16).

**This is not a copy of the rulebook.** It maps the rules onto engine structures and
records the decisions the rulebook leaves to an implementer. Numbers in parentheses
cite the official rule, e.g. (471.1.b). Regenerate the citable corpus with
`python scripts/rules/extract_rules.py` — see [reference/README.md](reference/README.md).

**Convention:** engine code and tests cite rules inline, so a reader can check the
implementation against the source:

```ts
// 465.2.c.3 — lethal damage must be assigned in full before moving to another unit
```

When this document and the corpus disagree, **the corpus wins** and this document is
wrong. Fix it here rather than working around it in code.

---

## 1. V1 scope — 1v1 (Duel)

Mode variables (485):

| Variable              | Value                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Players               | 2                                                                         |
| Victory Score         | **8 points**                                                              |
| Battlefields in play  | **2**                                                                     |
| Battlefields per deck | 3 — one chosen at random during setup, other two removed (485.4.a, 485.5) |
| Format                | Best of 1                                                                 |
| Second player         | Channels **one extra Rune** during their first Channel Phase (485.7)      |

Deck construction (103):

| Part            | Rule                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| Champion Legend | Exactly 1. Sets the deck's **Domain Identity** (103.1.b)                        |
| Main Deck       | **At least 40** cards: a Chosen Champion Unit, plus Units, Gear, Spells (103.2) |
| Chosen Champion | A champion unit whose champion tag matches the Legend's tag (103.2.a.2)         |
| Copies          | Max **3** per card name, including the Chosen Champion (103.2.b)                |
| Signature cards | Max **3 total**, all matching the Legend's champion tag (103.2.d)               |
| Rune Deck       | Exactly **12**, all within Domain Identity (103.3)                              |
| Battlefields    | 3 for Duel, no duplicate names (103.4.c)                                        |

Domain Identity: a single-Domain card is legal if the Legend has that Domain; a
multi-Domain card requires the Legend to have **all** of them (103.1.b.3–4).

> The deck validator in `packages/engine/src/deck` is the single source of truth and
> runs unchanged on client and server. The client must never be able to show "legal"
> for a deck the server rejects.

---

## 2. Redaction — what each player may see

**This table drives the anti-cheat design.** The server holds full state and derives a
per-player view; nothing above a player's entitlement may cross the wire. Privacy
levels are defined in 128: **Secret** (nobody may look), **Private** (only the
controller/owner), **Public** (anyone). A card's privacy defaults to its zone's (128.2.a).

| Zone             | Rule             | Privacy                           | In a redacted view                     |
| ---------------- | ---------------- | --------------------------------- | -------------------------------------- |
| Base             | 107.1.d          | Public                            | Full contents                          |
| Battlefield Zone | 107.2.c          | Public                            | Full contents                          |
| Facedown Zone    | 107.3.f          | Zone public, **cards Private**    | Existence + count only                 |
| Legend Zone      | 107.4.c          | Public                            | Full                                   |
| Chain            | 108.1.b          | Public                            | Full                                   |
| Trash            | 108.2.d          | Public                            | Full, unordered                        |
| Champion Zone    | 108.3.e          | Public                            | Full                                   |
| Main Deck        | 108.4.d, 129.3   | Faces concealed, **order Secret** | Count only                             |
| Rune Deck        | 108.5.d, 129.3   | Faces concealed, **order Secret** | Count only                             |
| Banishment       | 108.6.e          | Public                            | Full                                   |
| Hand             | 108.7.c, 108.7.e | **Private**, count Public         | Own hand full; opponent's = count only |

Two consequences that are easy to get wrong:

- **Trash and Banishment are public.** Do not redact them.
- **Decks are concealed, and their order is Secret.** 129.3 groups Main Deck cards with
  cards in hand: both have their back side presented to conceal Private or Secret
  information. On top of that, 108.4.d makes the _order_ Secret — a level nobody may
  look at, not even the owner (128.3). So a redacted view exposes deck **length only**,
  to both players, and the server must not leak remaining contents or sequence.
- **Facedown cards on the board are Private, not Secret** (129.4) — their controller
  may look. The Facedown Zone itself is a Public zone (107.3.f), so its occupancy is
  visible even though the card is not.

Acceptance test: play a full game and inspect every WebSocket frame. The opponent's
hand contents and both deck orders must appear nowhere.

---

## 3. Zones

Board zones (107): `base` (per player, a **Location**), `battlefieldZone` (each
Battlefield is individually a Location), `facedownZone` (one per Battlefield, max
occupancy 1 by default, **not** a Location — 107.3.e), `legendZone`.

Non-board zones (108): `chain`, `trash`, `championZone`, `mainDeck`, `runeDeck`,
`banishment`, `hand`.

Notes for the state model:

- A **Location** is a movement destination. Bases and Battlefields are Locations;
  Facedown Zones and the Legend Zone are not (107.3.e, 107.4.b).
- Runes sit in the Base but are **not Permanents** (161.1.a).
- The Champion Legend cannot leave the Legend Zone (107.4.d).
- Facedown cards are removed in the next Cleanup if their controller loses the
  Battlefield (107.3.d).

---

## 4. Turn states

Two independent axes (307–310), giving four states:

|                                  | **Open** (no Chain)                          | **Closed** (Chain exists) |
| -------------------------------- | -------------------------------------------- | ------------------------- |
| **Neutral** (no Showdown/Combat) | Neutral Open — default play window (310.1.a) | Neutral Closed            |
| **Showdown** (Showdown/Combat)   | Showdown Open                                | Showdown Closed           |

Play restrictions stack:

- Showdown State → only **Action** or **Reaction** cards/abilities (308.1.a).
- Closed State → only **Reaction** (309.1.a).
- Neutral Open, Turn Player's Main Phase → anything, by default (310.1.a, 316.5.b).

> Model these as _derived_ properties of the state, never as stored flags — they are
> functions of "is a Showdown/Combat in progress" and "is the Chain non-empty".

---

## 5. Priority and Focus

**Two distinct permissions** (311–313). Conflating them is a bug.

- **Priority** — the exclusive right to take Discretionary Actions (312.1). At most
  one player has it; sometimes nobody does (312.1.b).
- **Focus** — permission to act during a **Showdown Open** state (313.1).

Rules that must hold:

- Gaining Focus also grants Priority (313.2).
- Passing Priority **retains** Focus (313.3).
- A player with Focus but not Priority may not act (313.4).
- In a Neutral State, nobody has Focus (313.5).
- Limited Actions may always be taken when instructed, regardless of Priority (312.1.b.1).

Action types (410): **Discretionary** (chosen freely, needs Priority) vs **Limited**
(performed only when a game effect instructs). The engine's `legalActions()` returns
Discretionary Actions; Limited Actions arrive as `PENDING_CHOICE` resolutions.

---

## 6. The core loop — HOT FEPR

The engine's main loop (334): **H**andle **O**utstanding **T**asks, then **F**inalize,
**E**xecute, **P**ass, **R**esolve.

```
loop:
  if outstandingTasks: handle them          # Cleanups, phase tasks, combat steps (333)
                                            # Chain items may be added; they wait (334.1)
  else if pendingChainItems: FEPR
  else if showdownInProgress: player with Focus gets Priority        (335.1)
  else if mainPhase: Turn Player gets Priority                       (335)
  else: advance to next substep / step / phase / turn                (335)
```

FEPR (337–340):

| Step            | Behaviour                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Finalize** | Controller of the **oldest** Pending item completes playing it until Finalized or it leaves the Chain (337.1). Finalizing does **not** pass Priority (337.1.a). If the item is a **Unit, Gear, or a resource-Adding ability, it resolves immediately** → jump to Resolve (337.2). More Pending items → repeat. Otherwise the controller of the next item gains Priority → Execute. |
| **2. Execute**  | Player with Priority either plays a legally-timed card/ability (→ new Pending item, back to Finalize) or passes (→ Pass) (338.1).                                                                                                                                                                                                                                                  |
| **3. Pass**     | If **all** players passed in sequence without adding to the Chain → Resolve. Otherwise pass to the next player in turn order → Execute (339).                                                                                                                                                                                                                                      |
| **4. Resolve**  | The **newest** Finalized item resolves fully (340.1). Chain now empty → Open State; if in a Showdown and the chain was not started by a triggered or resource-Adding ability, **Focus passes** (340.2.a). Pending items remain → Finalize. No Pending items → controller of newest item gains Priority → Execute.                                                                  |

337.2 is the "you cannot respond to a unit" rule and is easy to miss.

### Cleanups

A Cleanup becomes an Outstanding Task after (319): state transitions Open↔Closed;
phase transitions; a Pending item is added; a Pending item becomes Finalized; a Chain
Item leaves the Chain; objects enter/leave the Board; any object's status changes; a
Move completes.

**During a Cleanup, Chain Items cannot be Finalized or Resolved, and Priority/Focus are
neither passed nor awarded** (320, 320.1). New Pending items may still be added.

---

## 7. Phases

| Phase                 | Step             | Tasks                                                                                                                                                                                        |
| --------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Awaken** (315.1)    | —                | Turn Player readies all Game Objects they control that can be readied                                                                                                                        |
| **Beginning** (315.2) | Beginning Step   | Start-of-Beginning-Phase effects                                                                                                                                                             |
|                       | **Scoring Step** | Turn Player **Holds** all Battlefields they Control (315.2.b.2)                                                                                                                              |
| **Channel** (315.3)   | —                | Turn Player channels **2** Runes from the Rune Deck; fewer if the deck is short (315.3.b.1)                                                                                                  |
| **Draw** (315.4)      | —                | Turn Player draws 1; empty deck → **Burn Out**, then still draws 1 (315.4.b.2)                                                                                                               |
| **Main** (316)        | —                | Rune Pools empty (316.3); start-of-Main effects; then **unstructured** Neutral Open play (316.5). Combats and Showdowns occur here as sub-phases. Ends when the Turn Player declares (316.9) |
| **Ending** (317)      | Ending Step      | End-of-turn effects                                                                                                                                                                          |
|                       | Expiration Step  | Ending Special Cleanup + heal all Units + all "this turn" effects expire + Rune Pools empty (317.2.b–d). **If anything underwent FEPR, restart the Expiration Step** (317.2.f)               |

Then the next queued player becomes Turn Player (317.3).

> Implement `ROUND_STRUCTURE` as a declarative step table matching this exactly. The
> Expiration Step's restart loop (317.2.f) is a real loop and needs a guard against
> pathological non-termination.

---

## 8. Resources

Runes are **not** drawn — they are **Channeled** onto the board, readied by default
(430.2.a), 2 per Channel Phase (430.4.a).

A Basic Rune has exactly two abilities (164.2):

- `[E]: [Reaction] — Add [1]` — exhaust for **1 Energy**
- `Recycle this: [Reaction] — Add [C]` — recycle to the Rune Deck for **1 Power** of
  that Rune's Domain (164.2.b.1)

Resources land in the **Rune Pool** (166) and must be added before spending (166.2):

- **Energy** — generic, no Domain, no type (163.1)
- **Power** — Domain-associated; some Power is Universal (163.2.b)

**The Rune Pool empties at the start of each player's Main Phase and at the end of each
player's turn; unspent resources are lost (167).** Note it empties at the _start_ of
Main, after the Channel and Draw phases.

Recycle (416): cards go to the **bottom** of the corresponding deck — Main Deck cards to
the Main Deck, Runes to the Rune Deck (416.1.a–b), always to their **owner's** deck
(416.1.c). Simultaneous recycles to the Main Deck are placed in **random order**
(416.5); to the Rune Deck, in the **owner's chosen order** (416.5.a). That asymmetry is
deliberate and needs the seeded RNG on one path only.

### Burn Out (431)

Triggered when a player must move more cards out of their Main Deck than it holds. In
sequence (431.2): do as much as possible → **recycle Trash into Main Deck** → **choose
an opponent to gain 1 point** → complete the remainder.

- Repeated Burn Outs are legal and expected; each gives an opponent a point (431.3.a).
- Points from a Burn Out after the first **cannot be prevented or replaced** (431.3.b).
- A Burn Out point that reaches the Victory Score wins **immediately**, without waiting
  for a Cleanup (431.3.c.1) — an exception to 472.

---

## 9. Combat

A Combat is **Staged** when units controlled by two opposing players are at a
Battlefield but the steps have not begun (461). It starts when a Cleanup occurs, the
Chain is empty, a Combat is staged, and no Showdown/Combat is ongoing elsewhere (460).
Combat is strictly **two players** (462).

### Step 1 — Combat Showdown (464)

1. Start-of-combat/showdown effects.
2. Establish **Attacker** (the player whose units applied Contested) and **Defender**
   (464.2.c). Units at the Battlefield inherit the designation; units arriving later
   gain it in the following Cleanup (464.2.c.3.a).
3. Attacker gains Focus (464.2.d).
4. Triggered abilities go on the Chain: Attacker first, then non-Defenders in turn
   order, then Defender (464.2.e.1).

### Step 2 — Combat Damage (465)

Only if both Attacking and Defending units remain (465.1).

1. Sum Attacker Might; sum Defender Might.
2. Starting with the Attacker, each assigns damage equal to their summed Might among
   the other's units:
   - **Assigning is not Dealing** — all damage is assigned first, then dealt
     simultaneously (465.2.c.1).
   - Lethal damage must be assigned **in full** to a unit before any goes to another
     (465.2.c.3).
   - A unit may not be assigned **more than the minimum lethal** amount unless no other
     units remain (465.2.c.4).
   - A unit that cannot be dealt damage has no lethal threshold and is exempt from
     mandatory assignment (465.2.c.10).
3. Deal all assigned damage.
4. **Skip FEPR and cancel outstanding tasks**, go to Resolution (465.3). No responses
   between damage and resolution.

### Step 3 — Resolution (466)

1. Combat Cleanup, with two inserted steps: **heal all Units**, and **recall Attackers
   still present if Defenders remain** (466.1.a).
2. Determine result: a player **wins** if they are the only one with units remaining;
   **loses** if they are the only one with none; **No Result** if units were recalled,
   both have units, or neither does (466.3). No Result with both players still present
   → stage a new Showdown and Combat (466.3.d.1).
3. If nothing is staged, the player with units remaining **Establishes Control** if they
   did not already hold it; clear Contested; Battlefield becomes Uncontrolled if empty;
   remove opposing Hidden cards. **Establishing Control is a Conquer** if that player
   has not yet Scored this Battlefield this turn (466.5.d).
4. Combat ends: clear Attacker/Defender, run end-of-combat effects, expire all "this
   combat" effects (466.7).

---

## 10. Scoring

A player Scores by **Conquer** or **Hold**, at most **once per Battlefield per turn**
(469, 470).

- **Conquer** — gaining Control of a Battlefield not yet Scored this turn (469.1).
- **Hold** — retaining Control during their own Beginning Phase Scoring Step (469.2).

On Scoring, two things happen (471): gain up to one Point, and trigger that
Battlefield's Score abilities (Conquer abilities on a Conquer, Hold abilities on a
Hold — 471.2).

### The Final Point (471.1.b) — do not miss this

When a player attempts to gain a point **through a Conquer** while at or above
`VictoryScore − 1`:

- If they have Scored **every** Battlefield this turn → they gain the Final Point.
- Otherwise → **they draw a card instead.**

This restriction applies only to Conquer. Points from other sources — Burn Out, card
effects — are not restricted (471.1.a.1).

### Winning

On a Cleanup, a player with points ≥ Victory Score **and** more points than any
opponent wins (472). Exception: a Burn Out point that reaches the score wins
immediately (431.3.c.1). A player may concede at any time (650).

---

## 11. Layers

Continuous effects apply in three layers (477), repeatedly until a fixpoint (476):

1. **Trait-Altering** — grants/removes/replaces inherent traits. **Might assignment**
   and all **copy** effects live here (477.1.a.1, 477.1.b).
2. **Ability-Altering** — non-copy effects granting/removing abilities or rules text.
   Attached cards' effect text is appended here (477.2.c).
3. **Arithmetic** — numeric modification. **Increases first, then decreases**
   (477.3.e). Might Bonuses from attachments apply here (477.3.d).

Rules the implementation must honour:

- Apply layers in sequence; each effect applies **exactly once** across all passes
  (476.1). Re-run the whole sequence until nothing changes (476.2).
- **Snapshotting** (477.3.b): a limitation on a non-passive arithmetic effect is fixed
  at application time and remembered at that level for the effect's duration.
- A numeric attribute cannot be increased by a negative amount — use 0 instead (477.3.c).

> Keep **base state** and **derived state** separate. Recompute derived state after every
> mutation; never write layered results back into base state.

---

## 12. Game Action vocabulary

The rulebook defines the action vocabulary (412–444). **The effect DSL's `op` names
must match these**, rather than inventing synonyms — it keeps card definitions readable
against the rules and makes card text mechanically checkable.

`Draw` (413) · `Exhaust` (414) · `Ready` (415) · `Recycle` (416) · `Deal` (417) ·
`Heal` (418) · `Play` (419) · `Move` (420) · `Hide` (421) · `Discard` (422) ·
`Stun` (423) · `Reveal` (424) · `Counter` (425) · `Buff` (426) · `Banish` (427) ·
`Kill` (428) · `Add` (429) · `Channel` (430) · `Burn Out` (431) · `Double` (432) ·
`Swap` (433) · `Attach` (434) · `Detach` (435) · `Predict` (436) · `Prevent` (437) ·
`Replace` (438) · `Create` (439) · `Burn` (440) · `Empower` (441) · `Disempower` (442) ·
`Skip` (443) · `Pay` (444)

Plus control-flow atoms that are ours, not the rulebook's: `seq`, `ifThen`, `modal`,
`forEach`, `may`, `chooseTarget`.

### Keywords (804–829)

`Accelerate` · `Action` · `Assault` · `Deathknell` · `Deflect` · `Ganking` · `Hidden` ·
`Legion` · `Reaction` · `Shield` · `Tank` · `Temporary` · `Vision` · `Equip` ·
`Quick-Draw` · `Repeat` · `Weaponmaster` · `Ambush` · `Hunt` · `Level` · `Unique` ·
`Backline` · `Empower` · `Empowered` · `Flow`

**Action** and **Reaction** are load-bearing for timing (308.1.a, 309.1.a) and must be
implemented before any card that uses them. The rest are needed only as the OGS set
requires — implement on demand, each with its own test.

---

## 13. Deliberate V1 exclusions

Implemented as explicit "unsupported" errors, not silent gaps:

- Modes other than 1v1 Duel — FFA3/FFA4/2v2 (487–489) and all teammate rules
- Additional Turns (734) and XP (728) — no OGS card is expected to need them
- Multiplayer-only combat restrictions (462.1–462.2)

Anything here that an OGS card turns out to need gets promoted into scope, not
worked around.

---

## 14. Open questions

To settle before or during implementation. Each needs a corpus citation before it is
answered in code.

1. **Mulligan** (117) — not yet transcribed. Needed for setup.
2. **Setup order** (110–118) — full sequence beyond "each player draws 4" (116).
3. **Contested status** — referenced throughout combat; where it is applied and cleared
   needs a dedicated pass (190 Battlefields / Control).
4. **Standard Move** (144) — the Unit intrinsic ability; interacts with Ganking (810).
5. **Replacement effects** (367, 438) and the **FEPR** interaction in 317.2.f.
6. **Attach/Detach** (434, 435) — required for Gear with `Equip` (818).
7. **Hidden** (811, 20 sub-rules) — interacts with the Facedown Zone and redaction;
   likely the hardest keyword to get right.
