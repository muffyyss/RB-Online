# Riftbound Online

An unofficial, **non-commercial** fan client for Riot's _Riftbound: League of Legends
TCG_ — a Windows desktop application for playing 1v1 against friends over your own
server.

> Riftbound is Riot Games' intellectual property. This project is a fan work: no
> monetisation, no affiliation with or endorsement by Riot, and not presented as
> official.

## Status

Early build. See [the plan](docs/plan.md) for scope and milestones,
[the architecture](docs/architecture.md) for how the pieces fit together, and
[the rules spec](docs/rules-spec.md) for what the engine must implement.

| Milestone | What                                                   | State   |
| --------- | ------------------------------------------------------ | ------- |
| M0        | Monorepo, TypeScript, lint, tests, CI                  | ✅ done |
| M1        | Core Rules transcribed into a machine-readable corpus  | ✅ done |
| M2        | Card definition schema and effect-step interpreter     | ✅ done |
| M3        | Rules engine — zones, turns, chain, showdowns, scoring | ✅ done |
| M4        | All 41 Origins: Proving Grounds cards                  | next    |
| M5        | Server — registration, login, decks                    |         |
| M6        | Match server — room codes, matchmaking, reconnect      |         |
| M7        | Client shell — Electron, deck builder                  |         |
| M8        | Game board UI                                          |         |
| M9        | Deploy, package, playtest                              |         |

## Layout

```
packages/
  engine/      Pure rules engine. Deterministic, no I/O. Runs on server AND client.
  cards/       Hand-authored card definitions (Origins: Proving Grounds).
  protocol/    Wire types shared by server and client.
tools/
  card-lint/   Validates card definitions; fails if a card has no test.
  sim/         Headless bot-vs-bot simulator.
scripts/
  rules/       Extracts the official Core Rules PDF into a numbered corpus.
docs/
  reference/   Riot's rulebook + derived corpus (local only, never committed).
```

`apps/server` and `apps/client` arrive in M5 and M7.

### Why one shared engine

The server is authoritative — it owns the true game state and sends each player only
a redacted view, so the opponent's hand never crosses the wire. The client runs the
_same_ engine over its redacted view to highlight legal moves instantly, instead of
waiting for a server round-trip. One TypeScript package, so the rules are written
once and cannot drift apart.

The engine is pure and deterministic: a match is stored as a seed plus an ordered
action log, and replaying that log reproduces the game exactly. That gives replays,
spectating, reconnection and crash recovery for free. ESLint enforces the purity
rules (`Math.random`, `Date.now`, timers and Node imports are banned inside
`packages/engine`).

## Getting started

```bash
npm install
npm run check     # format check, lint, typecheck, tests
```

Individual steps:

```bash
npm run typecheck
npm run lint
npm run test
npm run format
```

### Working on the rules corpus

The engine cites rule numbers from Riot's Core Rules. That corpus is generated
locally and never committed — see [docs/reference/README.md](docs/reference/README.md)
for the one-time poppler setup and how to regenerate it.

### Dev skills

This repo pins a set of third-party Claude Code skills (from
[mattpocock/skills](https://github.com/mattpocock/skills)) in `skills-lock.json`.
The skill files themselves are gitignored — they are someone else's content and
would bury the project. To restore them on a new machine:

```bash
npx skills experimental_install
```

They are development tooling only. Nothing in `packages/` or `apps/` depends on
them.

## Licence

No licence is granted. This is a private fan project built for a small community.
