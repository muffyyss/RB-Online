# Architecture

Diagrams for how Riftbound Online fits together. Rule numbers in parentheses cite
Riot's Core Rules via the corpus described in
[docs/reference/README.md](reference/README.md).

---

## 1. System overview

One Windows box runs everything. Caddy terminates TLS and proxies both HTTP and
WebSocket traffic to a single Node process; PostgreSQL is bound to localhost and
never exposed.

```mermaid
flowchart LR
    subgraph client["Windows Desktop Client — Electron"]
        UI["React UI<br/>lobby · deck builder · board"]
        PRED["@rb/engine<br/><i>local prediction</i>"]
        STORE["Zustand store<br/>redacted view only"]
        UI <--> STORE
        STORE <--> PRED
    end

    subgraph server["Windows Server"]
        CADDY["Caddy :443<br/>auto-TLS · WS proxy"]

        subgraph node["Node process — Fastify"]
            AUTH["Auth<br/>register · login · sessions"]
            REST["REST API<br/>cards · decks"]
            WS["WebSocket gateway"]
            ROOM["MatchRoom<br/><b>authoritative</b>"]
            ENG["@rb/engine<br/><i>same package</i>"]
            CDN["Card data + art"]
            WS --> ROOM
            ROOM --> ENG
        end

        DB[("PostgreSQL 17<br/>localhost only")]
        CADDY --> AUTH & REST & WS & CDN
        AUTH & REST & ROOM --> DB
    end

    STORE -- "HTTPS" --> CADDY
    STORE <-- "WSS<br/>redacted events" --> CADDY

    style ENG fill:#1f6f4a,color:#fff
    style PRED fill:#1f6f4a,color:#fff
    style ROOM fill:#7a3b8f,color:#fff
    style DB fill:#2b4c7e,color:#fff
```

The two green boxes are **the same TypeScript package**. The server runs it as the
source of truth; the client runs it over its redacted view to resolve legal moves
with no round-trip. Writing the rules once is the reason the whole stack is
TypeScript.

---

## 2. Package dependencies

```mermaid
flowchart TD
    PROTO["@rb/protocol<br/><small>wire types · zod schemas</small>"]
    ENGINE["@rb/engine<br/><small>pure rules engine</small>"]
    CARDS["@rb/cards<br/><small>hand-authored definitions</small>"]
    LINT["@rb/card-lint<br/><small>validates cards</small>"]
    SIM["@rb/sim<br/><small>bot-vs-bot harness</small>"]
    SERVER["apps/server<br/><small>M5</small>"]
    CLIENT["apps/client<br/><small>M7</small>"]

    PROTO --> ENGINE --> CARDS
    CARDS --> LINT
    CARDS --> SIM
    ENGINE --> SIM
    CARDS --> SERVER
    CARDS --> CLIENT
    PROTO --> SERVER
    PROTO --> CLIENT

    style ENGINE fill:#1f6f4a,color:#fff
    style CARDS fill:#8a6d1f,color:#fff
```

Dependencies only ever point **downward into the engine**. Nothing the engine
depends on can perform I/O, which is what keeps it deterministic — ESLint enforces
this by banning `Math.random`, `Date.now`, timers and Node imports inside
`packages/engine`.

---

## 3. An action, end to end

This is the anti-cheat core. The server never trusts the client's claim about
whose turn it is, and each player receives a view redacted for them individually.

```mermaid
sequenceDiagram
    participant A as Player A client
    participant WS as WebSocket gateway
    participant R as MatchRoom
    participant E as Engine
    participant B as Player B client

    A->>A: legalActions(myRedactedView)
    Note over A: UI highlights instantly —<br/>no round-trip
    A->>WS: MATCH_ACTION {matchId, seq, action}
    WS->>R: queue action

    R->>R: is A the player with priority?
    alt not A's priority, or illegal action
        R-->>A: MATCH_ERROR
    else legal
        R->>E: applyAction(state, action, rng)
        E-->>R: {nextState, events[]}
        R->>R: append to action log
        R-->>A: MATCH_EVENTS (redacted for A)
        R-->>B: MATCH_EVENTS (redacted for B)
        Note over R,B: B's copy omits A's hand,<br/>both decks, face-down cards
    end

    A->>A: reconcile — on divergence,<br/>discard local state and resync
```

Actions are serialised one at a time — the engine is synchronous and never sees
concurrency. A match persists as `{seed, actions[]}`, so replaying the log
reproduces the game exactly. That single property gives replays, spectating,
reconnection and crash recovery without extra machinery.

---

## 4. Turn states and the chain

Grounded in the extracted rules, not guessed. The full phase table is transcribed
in `docs/rules-spec.md` (M1, in progress).

```mermaid
stateDiagram-v2
    [*] --> Neutral

    Neutral: Neutral State
    Neutral: any playable card or ability
    Showdown: Showdown State
    Showdown: only Action / Reaction keywords (308.1.a)

    Neutral --> Showdown: showdown or combat begins (308.1)
    Showdown --> Neutral: combat resolves

    state "Chain open" as Chain
    Chain: one Chain at a time (330.1)
    Chain: exists while any Chain Item is on it

    Neutral --> Chain: card played or ability activated (328)
    Showdown --> Chain: Action / Reaction played
    Chain --> Chain: respond — push another Chain Item
    Chain --> Neutral: all items resolved, Chain empty
    Chain --> Showdown: all items resolved, combat ongoing

    note right of Chain
        With an empty Chain and the Turn Player
        declining discretionary actions, the phase
        or step ends (305).
    end note
```

Player choices made _during_ resolution — targeting, modal picks, "you may" — are
the single largest source of bugs in a TCG engine. The engine never blocks or
awaits: it emits `PENDING_CHOICE` and suspends until a `RESOLVE_CHOICE` arrives
from that specific player.

---

## 5. Registration and session lifetime

Registration happens inside the desktop client — there is no website. Invite-code
mode is the default: no SMTP to run, and a small community server stays closed to
strangers and bots.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Auth service
    participant DB as PostgreSQL

    C->>S: POST /auth/register {username, email, password, inviteCode}
    S->>S: validate — length, charset, zxcvbn strength
    S->>DB: invite code valid and not exhausted?
    S->>DB: username taken? (case-insensitive)
    Note over S: Duplicate email returns an identical<br/>response AND identical timing —<br/>no account enumeration
    S->>S: hash with argon2id (>=64MB)
    S->>DB: INSERT user, credentials, audit_log
    S-->>C: created

    C->>S: POST /auth/login
    S-->>C: access JWT (15 min) + refresh token (30 d)
    C->>C: refresh token to Electron safeStorage (Windows DPAPI)
    Note over C: never localStorage —<br/>access token stays in memory

    loop every 15 minutes
        C->>S: POST /auth/refresh
        S->>DB: rotate — old token revoked
        alt revoked token replayed
            S->>DB: revoke entire token family
            S-->>C: 401 — reauthenticate
        end
    end
```

---

## 6. How Riot's rulebook becomes engine code

```mermaid
flowchart LR
    PDF["Core Rules PDF<br/><small>120 pages, local only</small>"]
    EX["scripts/rules/<br/>extract_rules.py"]
    JSON["core-rules.json<br/><small>2381 rules · 415 notes</small>"]
    SPEC["docs/rules-spec.md<br/><small>hand-written contract</small>"]
    CODE["packages/engine<br/><small>cites rule numbers</small>"]
    TEST["golden replay tests"]

    PDF --> EX --> JSON --> SPEC --> CODE --> TEST
    JSON -. "re-extract on a rules update,<br/>diff to see what changed" .-> JSON

    style PDF fill:#6b2d2d,color:#fff
    style JSON fill:#2b4c7e,color:#fff
```

The extractor exists because `pdftotext -layout` loses the pairing between a rule's
left-column number and its indented body, which makes the numbers useless. Working
from word bounding boxes and re-pairing by baseline recovers **99.99%** of the
document's text against correct rule numbers.

Riot's PDF and everything derived from it are gitignored. Only the extractor is
committed.
