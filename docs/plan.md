# Riftbound Online — Full System Plan

## Context

You want to build **Riftbound: League of Legends TCG** as an online Windows desktop
application so you and a small community of friends can play together. The repository
(`C:\Work\GitThreemandown\RB-Online`) is empty — this is a greenfield build.

**Requirements locked in:**

|                  |                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Stack**        | "Newest and popular" → **TypeScript everywhere** (rationale below)                                                                                     |
| **Server**       | **Windows Server** — native services, no Docker                                                                                                        |
| **V1 scope**     | **1v1 only**, plus deck builder / collection                                                                                                           |
| **Cards**        | **Origins: Proving Grounds (OGS)** starter set only — 41 cards, 4 decks. Other sets added later, once V1 is proven                                     |
| **Accounts**     | Registration and login built from scratch, in-client, invite-gated. **Guests may join rooms without registering; only registered players create them** |
| **Audience**     | Friends + small community. **Non-commercial, no monetization**                                                                                         |
| **Card effects** | Must be **easy to change later** (e.g. tuning a skill from 3 → 2) without touching engine code                                                         |

**Why TypeScript everywhere:** the most important property of a TCG is that the
_rules engine runs identically on server and client_. The server must be authoritative
(so nobody can cheat); the client must predict locally (a card game that waits for a
server round-trip before highlighting a legal target feels broken). One shared TS
package means we write the rules **once**. Unity/C# would give nicer VFX but forces
either a duplicated engine or a dumb client. Node 24 and npm 11 are already installed.

**Scale reality check:** for friends and a small community, a **single Node process on
one Windows box handles this comfortably**. No Redis, no clustering, no load balancer.
The plan keeps the door open for scaling but deliberately does not build for it.

**IP note (stated once, then proceeding):** Riftbound is Riot IP. Your non-commercial,
friends-only use is the least risky category and fits the spirit of Riot's fan-content
policy — but a full online client using their card art still carries takedown risk.
Keep it unmonetized and unbranded as "official". Proceeding as requested.

---

## Part 1 — Game rules grounding

Confirmed from official/community sources:

- **2–4 players** in the real game; **V1 implements 1v1 only**.
- **Win condition: 8 points**, scored by conquering and holding **Battlefields**.
- **Card types:** Legend, Champion, Unit, Spell, Gear, Rune, Battlefield, Token.
- **Legend** defines your deck's Domains (colors) and core ability.
- **Runes** are a separate **12-card resource deck**. You gain **2 per turn**, and each
  can be spent two ways: **exhausted** (sideways) for normal costs, or **recycled**
  (returned to the rune deck) for more powerful costs. This dual-spend model must be
  first-class in the cost system — it is not ordinary "tap for mana".
- **Combat = "Showdowns"** at Battlefields; Units deal damage using **Might**.
- **Chain** = the priority/reaction stack. Keywords include _Exhaust_, _Ganking_,
  _Holding_, _Burning Out_ (deck-out → shuffle Trash back in, an opponent gains 1 point).

### The official rulebook — status and how we read it

You downloaded it. It is at:

```
C:\Users\Administrator\Downloads\Riftbound-Core-Rules-RUP4-July-16-2026.pdf
```

**138 pages, 43 MB — and it has no text layer.** I verified this: the pages are vector
artwork with the text drawn as glyph outlines rather than characters, so programmatic
text extraction returns nothing usable (14 KB of stray `fi`/`fl` ligatures out of a
138-page document). The pages must be _rendered to images_ and read visually.

**M1 step 1 — one-time setup (requires leaving plan mode):**

```bash
winget install --id oschwartz10612.Poppler -e
```

Then add its `bin` folder to `PATH` so `pdftoppm` is available. That enables direct
page-by-page reading of the PDF. After that:

1. Copy the PDF to `docs/reference/riftbound-core-rules.pdf` (keep it in the repo, and
   in `.gitignore` if you'd rather not redistribute Riot's document).
2. Read it in ~20-page passes and transcribe into **`docs/rules-spec.md`**: the exact
   phase and step list, chain resolution order, showdown steps, scoring and Hold timing,
   deck construction limits, the full keyword list, and state-based action checks.
3. `docs/rules-spec.md` becomes the engine's written contract — each rule numbered so
   engine code and tests can cite it (e.g. `// rules-spec §7.3`).

> **This gates M3.** The phase table must be **transcribed, not invented**. Every "it
> probably works like Magic" guess becomes a bug that surfaces months later, mid-game, in
> front of players. Everything in this plan's rules summary above came from official
> web sources and community wikis — treat it as provisional until checked against the PDF.

---

## Part 2 — Architecture

```
┌──────────────────────────────┐         ┌──────────────────────────────────┐
│  Windows Desktop Client      │  HTTPS  │  Windows Server                  │
│  Electron + React + Vite     │◄───────►│  Caddy (:443, auto-TLS, WS proxy)│
│                              │   WSS   │    │                             │
│  ┌────────────────────────┐  │         │    ▼                             │
│  │ @rb/engine (predictive)│  │         │  Node service (Fastify)          │
│  └────────────────────────┘  │         │   ├── Auth / REST API            │
│  card data fetched at login  │         │   ├── WebSocket game gateway     │
└──────────────────────────────┘         │   ├── Rooms (code) + simple queue│
                                         │   ├── MatchRoom (authoritative)  │
                                         │   │    └── @rb/engine  ◄── SAME  │
                                         │   └── Card data + art (served)   │
                                         │  PostgreSQL 17 (localhost only)  │
                                         └──────────────────────────────────┘
```

**Golden rule:** the server owns the truth. Each client receives a _redacted_ view —
opponent's hand is card backs, decks hidden, face-down cards hidden. The client is never
sent information the player isn't entitled to see. This one decision eliminates the
entire class of "read the opponent's hand" cheats. Even among friends, build it this way
— it costs nothing extra now and is very painful to retrofit.

### Monorepo layout

```
RB-Online/
├─ package.json                 # npm workspaces
├─ packages/
│  ├─ engine/                   # pure rules engine — NO I/O, NO Date.now(), NO Math.random()
│  │  ├─ src/state/             # GameState, zones, redaction
│  │  ├─ src/actions/           # action types + legality checks
│  │  ├─ src/flow/              # round/turn/phase state machine, priority
│  │  ├─ src/chain/             # chain links, triggers, resolution
│  │  ├─ src/combat/            # showdown resolution
│  │  ├─ src/effects/           # effect-step interpreter  ◄── tuning happens here
│  │  ├─ src/continuous/        # buffs / static abilities layering
│  │  ├─ src/deck/              # deck legality validator (shared client + server)
│  │  └─ test/scenarios/        # golden replay tests (JSON in → events out)
│  ├─ cards/
│  │  ├─ src/sets/ogs/          # ◄── V1: Origins Proving Grounds, one file per card
│  │  ├─ src/sets/ogn/          # (later — additive, no engine change)
│  │  └─ src/schema.ts          # zod schema for CardDefinition
│  └─ protocol/                 # zod-validated WS messages + REST DTOs
├─ apps/
│  ├─ server/                   # Fastify + ws + Drizzle + Postgres
│  └─ client/                   # Electron main + preload + React renderer
├─ tools/
│  ├─ card-lint/                # every card validates + has a test
│  └─ sim/                      # headless bot-vs-bot simulator
└─ docs/
   ├─ rules-spec.md             # transcribed Core Rules → engine contract
   └─ card-authoring.md         # how to write / tune a card
```

### Technology choices

| Layer      | Choice                      | Why                                                               |
| ---------- | --------------------------- | ----------------------------------------------------------------- |
| Language   | TypeScript 5.9 (strict)     | Shared engine, best tooling                                       |
| Monorepo   | npm workspaces              | Already installed, no extra tooling                               |
| Server     | **Fastify 5**               | Fastest popular Node framework, TS-first                          |
| WebSocket  | `@fastify/websocket`        | Integrates with Fastify auth/lifecycle                            |
| Database   | **PostgreSQL 17**           | JSONB match logs, real transactions                               |
| ORM        | **Drizzle**                 | TS-native, clean SQL migrations, no codegen daemon                |
| Validation | **Zod 4**                   | One schema for REST + WS + card definitions                       |
| Client UI  | **React 19 + Vite 7**       | Newest, most popular                                              |
| Desktop    | **Electron 38**             | Mature Windows packaging + auto-update                            |
| State      | **Zustand**                 | Minimal boilerplate                                               |
| Animation  | **Motion**                  | Enough for card movement; PixiJS only if you later want heavy VFX |
| Passwords  | **argon2id**                | Current best practice (not bcrypt)                                |
| Logging    | **pino**                    | Structured JSON                                                   |
| Tests      | **Vitest**                  | Fast, native TS/ESM                                               |
| Proxy      | **Caddy (Windows service)** | Auto-TLS + native WebSocket proxying, ~4 lines of config          |

---

## Part 3 — The rules engine (`packages/engine`)

The heart of the project, and where TCG projects usually die. Build it **first**,
**headless**, and **fully tested before any UI exists**.

### Core contract

```ts
// Pure, deterministic, serializable. Same input → same output, always.
function applyAction(
  state: GameState,
  action: GameAction,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } | { error: RuleViolation }

function legalActions(state: GameState, player: PlayerId): GameAction[]
function redactFor(state: GameState, player: PlayerId): PlayerView
```

**Event-sourced.** The server stores `{ seed, actions[] }` — full state is always
rebuildable by replay. That gives you, for free: replays, spectating, reconnection,
crash recovery, and reproducible bug reports ("here's the action log that broke it").

**No hidden nondeterminism.** The engine may never call `Math.random()`, `Date.now()`,
or touch I/O. Shuffles take a `SeededRng`. Enforce with an ESLint rule.

### Zones

`hand`, `mainDeck`, `runeDeck`, `runePool`, `base`, `battlefields[]`, `trash`,
`legendZone`, `championZone`, `chain`, `removed`.

### Flow model

A declarative step table, not hardcoded `if` chains — so it is cheap to correct once you
transcribe the Core Rules PDF:

```ts
const ROUND_STRUCTURE: PhaseDef[] = [
  { id: 'awaken', steps: ['ready', 'gainRunes', 'draw'], grantsPriority: false },
  { id: 'action', steps: ['mainLoop'], grantsPriority: true },
  { id: 'scoring', steps: ['holdCheck', 'awardPoints'], grantsPriority: true },
  { id: 'ending', steps: ['cleanup', 'discardToLimit'], grantsPriority: false },
]
```

### Chain & priority

- `chain: ChainLink[]` — each link = a card play or triggered ability with source,
  chosen targets and modes.
- `priority: PlayerId`. Passing with a non-empty chain resolves the **top** link and
  returns priority. Passing with an empty chain advances the step.
- Triggered abilities collect in `pendingTriggers`, get ordered (active player first),
  are pushed onto the chain, _then_ priority is granted.
- **Mid-resolution player choices** (targeting, modal, "you may") are the #1 bug source.
  Model them explicitly: the engine emits `PENDING_CHOICE` and **suspends**. The game
  cannot advance until a `RESOLVE_CHOICE` arrives from that specific player. Never let an
  effect block, await, or call back into user input.

### Cost system (Riftbound-specific)

Costs are not single-currency:

```ts
type Cost = {
  energy: number // generic — paid by exhausting runes
  power: Partial<Record<Domain, number>> // colored requirement
  recycle?: number // runes returned to rune deck ("powerful" spend)
  additional?: CostAtom[] // exhaust a unit, discard a card, etc.
}
```

The payment solver enumerates valid rune assignments (exhaust vs. recycle) and, when
ambiguous, hands the player a choice rather than guessing on their behalf.

### Continuous effects

Keep **base state** and **derived state** separate. After every mutation recompute
`derived = applyContinuousEffects(base)` — buffs, Might modifiers, static abilities,
granted keywords — in a fixed layer order. Never write buffed values back into base
state; that is how buffs get permanently "stuck" after their source leaves play.

### Testing (non-negotiable)

1. **Unit tests** per subsystem.
2. **Golden replay scenarios** — `test/scenarios/*.json`: seed + action list + expected
   event stream. Diffing events catches subtle rule regressions.
3. **Every card ships with at least one test.** `card-lint` fails CI otherwise.
4. **`tools/sim`** — two random-legal-move bots play 10,000 full games headless. Any
   crash, hang, or illegal state is a bug. Runs in CI.

> **Milestone gate: a complete game must play to 8 points in tests before any UI exists.**

---

## Part 4 — Card authoring & easy tuning (`packages/cards`)

**This section directly addresses your "I want to change a skill from 3 to 2 easily"
requirement.** It is a first-class design goal, not an afterthought.

### Cards are data, not code

Every card is a declarative definition with an **explicit, numbered list of effect
steps**. The engine interprets those steps; cards never contain arbitrary logic. This is
what makes tuning safe and trivial.

```ts
// packages/cards/src/sets/ogs/annie-tibbers.ts
export default defineCard({
  id: 'OGS-014',
  name: 'Annie',
  type: 'Champion',
  domains: ['Fury'],
  cost: { energy: 3, power: { Fury: 1 } },
  might: 4,
  tags: ['Noxus', 'Mage'],

  abilities: [
    triggered({
      id: 'annie-etb-burn',
      on: 'ENTERS_PLAY',
      steps: [
        // step 1 — pick a target
        { op: 'chooseTarget', as: 'victim', filter: 'ENEMY_UNIT', at: 'SAME_LOCATION' },
        // step 2 — the tunable number lives HERE, all by itself
        { op: 'deal', amount: 3, target: '$victim' },
      ],
    }),
  ],
})
```

**To change that skill from 3 to 2, you edit one number on one line.** No engine change,
no recompile of the engine, no migration, no touching the client. `card-lint` re-validates
and the card's test tells you immediately whether anything else depended on the old value.

### Fixed effect vocabulary

The interpreter's entire world — cards can only compose these:

`draw` · `discard` · `deal` · `heal` · `destroy` · `move` · `exhaust` · `ready` ·
`recycle` · `buff` · `grantKeyword` · `search` · `createToken` · `gainPoints` · `stun` ·
`chooseTarget` · `seq` · `ifThen` · `modal` · `forEach` · `may`

If a card can't be expressed, you extend the vocabulary _deliberately_ and give the new
atom its own tests. You never drop into raw code inside a card. This keeps every card
serializable, statically analyzable, and safe to run on the client for prediction.

### Balance changes reach players without a reinstall

Because cards are data, the **server is the source of truth for card definitions**:

- The client **downloads card data at login** and caches it locally.
- Both sides carry a `cardDataVersion` hash. At match start, the server checks that both
  players are on the same version; a mismatch forces a refresh before queueing.
- So when you tune Annie from 3 to 2, you edit one line, restart the server, and
  **everyone gets it on next login** — no new installer, no asking friends to update.

This is worth the small extra complexity precisely _because_ you said you'll want to
change things later.

### Dev workflow

- `npm run cards:watch` — hot-reloads card definitions into the local dev server.
- `npm run card-lint` — schema validation, cost sanity, missing-test detection.
- `docs/card-authoring.md` — a written guide with a worked example per card type.
- A future (post-V1) option: a small web admin page to tune numbers without editing
  files. Not needed for V1 — one-line edits are already easy.

### V1 card scope

**Origins: Proving Grounds (OGS)** — 41 cards, 4 preconstructed decks
(**Annie, Master Yi, Lux, Garen**). Realistically ~1 week of authoring, not months.

Sets are separate folders under `src/sets/`, registered in a set index. Adding Origins
(OGN) later is purely additive: new folder, new cards, no engine or server changes.

### Card art

Store originals in `assets/cards/src/`; a build script emits WebP at two sizes (256px
thumb, 750px full) with content-hashed filenames into `apps/server/public/cdn/`, served
with 1-year immutable cache headers.

---

## Part 5 — Server (`apps/server`)

### Database schema (Drizzle → PostgreSQL)

```
users               id, username(uniq), email(uniq, citext), created_at, status, role
user_credentials    user_id, password_hash(argon2id), password_updated_at
refresh_tokens      id, user_id, token_hash, device_label, expires_at, revoked_at
email_verifications user_id, token_hash, expires_at, consumed_at
password_resets     user_id, token_hash, expires_at, consumed_at
invite_codes        id, code_hash, created_by, max_uses, used_count, expires_at, note
invite_redemptions  invite_code_id, user_id, redeemed_at
cards               id, set, name, type, domains[], cost jsonb, text, art_url  -- search index
matches             id, format, seed, started_at, ended_at, winner_user_id, end_reason
match_players       match_id, user_id, seat, deck_snapshot jsonb   -- snapshot: decks get edited
match_actions       match_id, seq, actor, action jsonb, created_at -- the replay log
audit_log           id, user_id, event, ip, ua, created_at
```

`deck_snapshot` matters: never reference a live deck from a match, because decks change.

### Registration system (built fresh — nothing exists today)

Registration happens **inside the desktop client** — no website needed. Screen order:
`Register → (verify or invite gate) → Login → Lobby`.

**Registration form:** username, email, password, confirm password, age/terms checkbox.

**Server-side validation** (client mirrors it for instant feedback, server is authoritative):

| Field    | Rule                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| Username | 3–16 chars, `[a-zA-Z0-9_-]`, **case-insensitively unique**, profanity/reserved-word blocklist |
| Email    | RFC-valid, stored `citext` so uniqueness is case-insensitive, normalized (trim + lowercase)   |
| Password | Min 10 chars, strength-scored with **zxcvbn** (reject weak), no length cap below 128          |
| Terms    | Must be explicitly checked                                                                    |

**Password policy (confirmed):** 8-16 characters, `a-z A-Z 0-9` only, no symbols.

**Storage & security:**

- **argon2id** hashing, memory ≥ 64 MB, unique salt per user. Never store the password.
- **Duplicates are reported plainly** — "that email already has an account". The usual
  defence is to answer identically either way, but it is not worth its cost here:
  registration is invite-gated, so nobody can probe without a code, and with no email
  being sent there would be no way to tell a legitimate returning player why nothing
  happened. A deliberate trade, reversible via `revealDuplicates` if the server ever
  opens to the public. Timing is equalised regardless, so response time alone never
  answers the question.
- Rate limited per-IP and per-email (`@fastify/rate-limit`), with a short artificial
  delay on failures.
- Every registration writes an `audit_log` row (ip, user agent, timestamp).

**Invite-code gated (confirmed).** Registration requires an admin-issued code.
The `email` mode below stays available behind a config flag if the community ever
opens up.

**Two gating modes — pick one via config flag** (`REGISTRATION_MODE`):

1. **`invite`** _(recommended for you)_ — registration requires an admin-issued invite
   code. No SMTP server to run, no deliverability headaches, and it keeps a small
   friends-and-community server closed to strangers and bots. Codes live in an
   `invite_codes` table (code hash, created_by, max_uses, used_count, expires_at).
2. **`email`** — open registration with an emailed verification link (single-use hashed
   token, 24h expiry). Needs working SMTP. Switch to this if the community grows and you
   want open signups.

**Account states:** `pending` → `active` → (`suspended` | `deleted`). Only `active`
accounts can queue for matches or create rooms.

**Admin tooling (small CLI, part of M5):** create invite codes, list/suspend users,
force password reset, promote to admin. A CLI is enough — no admin web UI in V1.

### Guest accounts

**Confirmed with the project owner.** A player who has not registered still gets
in, under an automatic name like `Guest000001`. Registering is what unlocks a
chosen name and, later, profile customisation. (Customisation itself is not in
scope yet — only the account model is being fixed here.)

**Guests may join a room, never create one.** This is what stops guest access
from undoing the invite gate. To play at all you need a room code, and only a
registered player can produce one — so somebody already in the community has to
let you in. It mirrors how a private game actually works, and it is
self-limiting: a bot cannot farm guest accounts because it cannot get into a
room without being handed a code.

**A guest lives on their machine until the game is uninstalled.** The identity
is stored locally alongside the deck presets, so quitting and reopening keeps
the same name and the same decks.

**The number comes from the server, once.** Sequential names like `Guest000001`
need a counter, which cannot live on the client — two machines would both call
themselves `Guest000001`. So the server allocates a number the first time a
guest joins a room, and the client stores it forever after. That gets the
sequential name and the local lifetime at the same time, and the allocation is
naturally rate-limited: you only get a number by entering a real room.

**Upgrading to a real account keeps everything.** A guest who registers keeps
their decks — those are local files and never move — and their history follows
them, because the server links the guest id to the new user id rather than
starting fresh. The registration flow therefore has to accept an optional guest
id to adopt, which is worth building in from the start rather than retrofitting.

What this means for the schema, when it is built: guests need a row (a number
has to be unique and allocated), but not credentials, an email, or an invite
redemption. Most likely a `guests` table keyed by a client-generated id, with
`users.adopted_guest_id` recording an upgrade.

### Login & sessions

- **Access token:** JWT, 15-minute expiry, carries `sub` / `username` / `role`.
- **Refresh token:** opaque 256-bit random, stored **hashed**, 30-day expiry, **rotated
  on every use** with reuse detection — a replayed token revokes the whole family. That's
  your stolen-token tripwire.
- Rate limiting per-IP and per-account on login / register / reset
  (`@fastify/rate-limit`).
- **Client storage:** refresh token in **Electron `safeStorage`** (Windows DPAPI), never
  `localStorage`. Access token in memory only.
- Password reset + email change via single-use hashed tokens.
- TOTP 2FA deferred post-V1, but leave the `users.mfa_secret` column in place.

### REST API

```
POST   /api/auth/register            POST /api/auth/login
POST   /api/auth/refresh             POST /api/auth/logout
POST   /api/auth/verify-email        POST /api/auth/request-reset  /reset
GET    /api/auth/check-username?u=   # live availability check for the register form
POST   /api/auth/redeem-invite       # invite mode
GET    /api/me                       PATCH /api/me/password
GET    /api/cards?set=&domain=&type=&cost=&q=   # + ?version= for the cardDataVersion hash
GET    /api/matches/:id/replay
GET    /health
```

### Decks are local, not server-stored

**Confirmed with the project owner.** Deck presets live on the player's machine
as a plain JSON file; there is no deck table, no deck API, and no sync. Simpler
server, and the data stays theirs.

What this does _not_ change: when a match starts the client sends its decklist
and the server validates it with `validateDeck` before play begins. Local storage
decides where a deck lives between games, never whether it is legal — a modified
client that saved an illegal preset is rejected at the door.

Two consequences to design around, both handled by **deck codes** (plain,
shareable text produced by `encodeDeck`): presets do not follow a player to
another machine, and a reinstall loses them.

The client requires **at least one saved preset** before it will let a player
create or join a room. That is a product rule, not a rulebook one, and it is a
UX gate rather than a security boundary.

### Every card is always available

No collection, no packs, no ownership. The deck builder is a card browser plus
the shared validator. This is a non-commercial fan client, so there is nothing
to grind for and no reason to gate cards behind acquisition.

### WebSocket gateway

One socket per client, authenticated by access token on connect.

```
C→S: ROOM_CREATE {deckId} | ROOM_JOIN {code, deckId} | ROOM_LEAVE
     QUEUE_JOIN {deckId}  | QUEUE_LEAVE
     MATCH_ACTION {matchId, seq, action}
     MATCH_RESYNC {matchId, lastSeenSeq}
     CONCEDE {matchId}    | PING
S→C: ROOM_STATE {code, players}      | QUEUE_STATE {position}
     MATCH_FOUND {matchId, opponent, seat}
     MATCH_STATE {view, seq}         # full redacted snapshot
     MATCH_EVENTS {events[], seq}    # incremental, redacted
     MATCH_ERROR {code, message}     | MATCH_END {winner, reason}
     TIMER {clocks}                  | PONG
```

Every message zod-validated in **both** directions.

### Starting a game — rooms first, queue second

For a friends-and-small-community game, **a shareable room code is more useful than a
matchmaking queue** — with 10 people online, a queue is often empty while your friend is
waiting. So V1 builds both, room codes first:

1. **Room code (primary):** host creates a room → gets a 6-character code → sends it to a
   friend → friend joins → both ready up → match starts.
2. **Quick match (secondary):** one simple FIFO queue. No rating in V1; the `rating`
   column exists but is unused until ranked ships later.

Deck legality is re-validated **server-side** at match start — never trust the client's
legality check.

### MatchRoom

One in-process object per active match:

- Serializes actions — one at a time, no concurrency inside the engine.
- **Validates every action** against `legalActions()` for the _requesting_ player at the
  _current_ priority. Never trust the client about whose turn it is.
- Redacts events per recipient before sending.
- **Clocks:** chess-clock — 25-minute bank + 15s increment per action. Flag = loss.
  _(Make these config values; friendly games may want them longer or off.)_
- **Disconnect:** 60-second grace, clock keeps running, then auto-concede.
- **Reconnect:** client sends `lastSeenSeq`, server replays redacted events from there;
  if the gap is too big, sends a full `MATCH_STATE` snapshot instead.
- Persists the action log on completion, checkpointing every 20 actions so a server
  restart doesn't kill in-progress games.

### Scaling

V1 is one Node process — ample for your community. Don't build clustering, but don't
preclude it: keep all match state inside `MatchRoom` (no module-level globals) so a later
Redis pub/sub + match→node registry is purely additive.

---

## Part 6 — Client (`apps/client`)

### Electron security (mandatory)

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, strict CSP, all
privileged operations through a narrow typed preload bridge. The renderer never gets Node
APIs. Block `window.open` and external navigation.

### Structure

```
apps/client/
├─ electron/main.ts        # window, auto-update, safeStorage, deep links
├─ electron/preload.ts     # narrow contextBridge surface
└─ src/
   ├─ net/                 # WS client w/ reconnect backoff, REST client
   ├─ store/               # Zustand: session, cards, decks, match
   ├─ engine-bridge/       # local prediction over the redacted view
   ├─ screens/             # Register, Login, Lobby(+room code), DeckBuilder, Collection, Match
   └─ components/board/    # Card, Hand, Base, Battlefield, Chain, RunePool, Timer
```

### Local prediction

The client runs `@rb/engine` over its **redacted** view to compute `legalActions()`
instantly — highlighting playable cards and valid targets with zero latency. The server
stays authoritative: on any divergence the client discards local state and re-syncs from
the server snapshot. Optimistic rendering, authoritative truth.

### Deck builder

- Card grid with filters (domain / type / cost / tag) and search. With 41 cards this is
  simple — no virtualization needed until later sets land.
- **Start from the 4 preconstructed OGS decks** (Annie, Master Yi, Lux, Garen) — players
  can play immediately and customize from there.
- Live legality panel driven by **the same validator the server runs**
  (`packages/engine/src/deck`), so the client can never show "legal" for a deck the server
  will reject.
- Separate rune-deck pane (12 cards, Domains constrained by your Legend).
- Import/export decks as a plain text code — easy sharing in a Discord community.

### Packaging

`electron-builder` → NSIS installer + portable exe. `electron-updater` against a static
feed on your server (`/updates/`).

**Code signing:** an unsigned installer triggers a Windows SmartScreen warning. For a
friends-only distribution that's tolerable (tell people to click "More info → Run
anyway"), and it saves you the ~$200–400/yr OV certificate. Worth revisiting only if the
community grows. _Note: because card data is server-served, balance changes don't require
a new installer at all — only client code changes do._

---

### Getting the first account in

Registration needs an invite code and issuing a code needs an administrator, so
there has to be a way in from outside the application. That is `apps/server`'s
admin CLI, run on the server itself with the same `DATABASE_URL`:

```bash
npm run admin -- invite create --uses 1 --days 7 --label "for Sam"
```

The code is printed **once**. Only its hash is stored, so a lost code is
reissued, never recovered — `invite list` can show that a code exists, who it
was for and whether it has been spent, but not the code itself.

The rest:

```bash
npm run admin -- invite list
npm run admin -- invite revoke <id>
npm run admin -- user list
npm run admin -- user suspend <username>
npm run admin -- user promote <username>
```

## Part 7 — Windows Server deployment

Native services — Windows Server + Docker is more pain than it's worth here:

1. **PostgreSQL 17** — official Windows installer. Bind to `localhost` only. Dedicated
   app role with least privilege.
2. **Node app as a Windows Service** — via **NSSM** (simplest) or `node-windows`.
   Auto-restart on failure. Runs as a low-privilege service account, **not Administrator**.
3. **Caddy as a Windows service** — TLS on :443 with automatic Let's Encrypt certs,
   reverse-proxying HTTP + WebSocket to Node on `127.0.0.1:3000`:
   ```
   rb.yourdomain.com {
       encode zstd gzip
       reverse_proxy 127.0.0.1:3000
   }
   ```
   Caddy proxies WebSockets natively — no extra config, unlike IIS + ARR.
4. **Firewall:** inbound 80/443 only. Postgres and the Node port never public.
5. **Backups:** scheduled `pg_dump` (daily, 30-day retention) plus an off-box copy.
   Test a restore _before_ launch, not after your first incident.
6. **Logs:** pino → rotated files. `/health` endpoint + an external uptime check.
7. **Config:** all secrets in a gitignored `.env` outside the repo (`JWT_SECRET`,
   `DATABASE_URL`, SMTP creds). Commit a `.env.example`.

---

## Part 8 — Milestones

| #      | Milestone         | Deliverable                                                                                                                              | Effort    |
| ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **M0** | Foundation        | Monorepo, strict TS configs, Vitest, ESLint/Prettier, CI                                                                                 | 1–2 days  |
| **M1** | Rules spec        | Install poppler; render + read all 138 PDF pages; transcribe → `docs/rules-spec.md` (**gates M3**)                                       | 3–5 days  |
| **M2** | Card DSL          | `CardDefinition` schema, effect-step interpreter, ~8 representative cards, `card-lint`                                                   | 1–2 weeks |
| **M3** | Engine core       | Zones, flow machine, chain/priority, costs, showdowns, scoring, continuous effects. **Gate: bots play a full game to 8 points in tests** | 3–5 weeks |
| **M4** | Card content      | All **41 OGS cards** + 4 preconstructed decks, each with tests                                                                           | ~1 week   |
| **M5** | Server foundation | Postgres schema, migrations, **registration + invite codes + login/sessions**, admin CLI, REST API, deck CRUD + legality                 | 1–2 weeks |
| **M6** | Match server      | WS gateway, room codes, queue, MatchRoom, redaction, timers, reconnect, replays                                                          | 1–2 weeks |
| **M7** | Client shell      | Electron app, **register + login screens**, lobby + room codes, collection, deck builder                                                 | 2–3 weeks |
| **M8** | Game board        | Full play UI, targeting, chain visualization, animations, prediction                                                                     | 3–4 weeks |
| **M9** | Ship              | Windows Server deploy, monitoring, backups, installer + auto-update, playtest with friends                                               | 1 week    |

Roughly **3–4 months** of steady part-time work to a playable 1v1 client. M4 can run in
parallel with M3 once the DSL is stable.

### Risks

| Risk                                            | Mitigation                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Chain/showdown complexity sinks the project** | Engine-first, headless, no UI until the M3 gate passes                                       |
| **Rules guessed instead of transcribed**        | M1 is a hard prerequisite — no engine code before `docs/rules-spec.md`                       |
| **Wanting to tune cards constantly**            | Effect-step DSL + server-served card data: one-line edits, no client rebuild                 |
| **Cheating**                                    | Server-authoritative + per-player redaction + server-side legality on every action           |
| **Scope creep into sets 2+ / 4-player**         | V1 is 1v1 + OGS only. Sets and multiplayer are additive by design — resist until V1 is solid |
| **Riot IP takedown**                            | Non-commercial, unbranded, friends-only; accept the risk knowingly                           |

---

## Part 9 — Verification

**Engine (the important one):**

```bash
npm run test -w packages/engine        # unit + golden replay scenarios
npm run sim -- --games 10000           # bot-vs-bot; zero crashes / illegal states
npm run card-lint                      # every card validates and has a test
```

**Tuning check (proves your requirement works):** change one `amount:` value in an OGS
card, run `npm run card-lint && npm run test -w packages/cards` — the affected card test
should fail with a clear diff, and **no engine file should need editing**. Restart the
server and confirm a client picks up the new value on next login via the
`cardDataVersion` bump.

**Server:**

```bash
npm run db:migrate -w apps/server
npm run test -w apps/server            # auth flows, deck legality, WS protocol
```

**Registration acceptance checks:**

- Register with a valid invite code → account created in `pending`/`active` per mode.
- Register with an **invalid or exhausted** invite code → rejected, no user row created.
- Register with a **duplicate username** differing only in case (`Muffy` vs `muffy`) → rejected.
- Register with a **duplicate email** → rejected with a clear message, and no second
  user row exists. Timing matches a fresh signup.
- Weak password (`password123`) → rejected as too common, with a helpful message.
- Hammer `/api/auth/register` 20× → rate limiter blocks; check the `audit_log` rows.
- Confirm the DB stores an `argon2id$...` hash and **never** the plaintext password.

Then: login → refresh rotation (old refresh token must be rejected on reuse) → build a
deck → `POST /api/decks/:id/validate` rejects an illegal deck with a _specific_ reason.

**End-to-end (the real test):** run the server locally, launch two client instances as
different accounts, one creates a room code and the other joins, then play a complete
game to 8 points. Then verify:

- Kill one client mid-match → it reconnects and resumes at the correct state.
- Inspect WebSocket frames in devtools → **the opponent's hand contents must not appear
  in any message.** This is the anti-cheat acceptance test.
- Let a clock expire → the correct loss is recorded.
- `GET /api/matches/:id/replay` deterministically replays the finished game.

**Deployment:** deploy to the Windows server, confirm `https://.../health` over TLS,
confirm the WSS upgrade works through Caddy, then restart the Windows service mid-match
and confirm the game recovers from the checkpointed action log.
