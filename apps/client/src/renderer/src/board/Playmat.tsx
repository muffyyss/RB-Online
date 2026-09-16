/**
 * The playmat, laid out like the printed one.
 *
 * The middle of the mat is the Battlefield Zone: one column per Battlefield,
 * the card itself on the line between the players, and above and below it the
 * two Battle Zones where each player's units at that Battlefield stand. Behind
 * each player is their Base with their Main Deck beside it, then their Runes
 * with the Rune Deck and Trash at the edges; the Legend and Hero (the Champion
 * Zone) flank their own Battle Zone. A score track from 0 to 8 runs down each
 * player's edge, starting at their end. The two players face each other, so
 * the far side is the near one mirrored.
 *
 * Everything shown is exactly what the server sent — the client decides nothing
 * about the rules — and every button on it is an action the server said is
 * legal. Interaction is one idea: pick a card, then choose what it does.
 */

import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { cardFullName, cardOracle, getCard } from '@rb/cards'
import { mightOf } from '@rb/engine'
import type {
  BattlefieldState,
  GameAction,
  GameObject,
  GameView,
  Location,
  ObjectId,
  PlayerId,
} from '@rb/engine'

import {
  abilitiesOf,
  canPass,
  movesOf,
  mustChoose,
  mustMulligan,
  objectsAt,
  playsOf,
  waitingOnOpponent,
} from '../../../shared/match.js'
import type { MatchSession } from '../../../shared/match.js'
import { Card } from './Card.js'

const MULLIGAN_LIMIT = 2
const VICTORY_SCORE = 8

const oracle = cardOracle()

/** What the mat needs: the match, the view it is drawing, and a way to act. */
export interface MatHandle {
  readonly session: MatchSession
  readonly view: GameView
  readonly send: (action: GameAction) => void
}

/** Picking a card, and reading one: the two things every card on the mat does. */
interface Hands {
  readonly picked: ObjectId | null
  readonly onPick: (id: ObjectId | null) => void
  readonly onHover: (cardId: string | null) => void
}

function nameOf(view: GameView, id: ObjectId): string {
  const object = view.objects[id]
  if (!object) return 'Hidden card'
  const card = getCard(object.cardId)
  return card ? cardFullName(card) : object.cardId
}

function placeName(view: GameView, at: Location, seat: PlayerId): string {
  if (at.kind === 'base') return at.player === seat ? 'your base' : 'their base'
  return nameOf(view, at.id)
}

/** What a unit's keywords amount to right now: printed, plus any granted. */
function keywordsOf(object: GameObject): readonly string[] {
  const values = new Map<string, number>()
  for (const entry of getCard(object.cardId)?.keywords ?? []) {
    const [keyword, value] = typeof entry === 'string' ? [entry, 1] : entry
    values.set(keyword, value)
  }
  for (const [keyword, value] of Object.entries(object.keywordsThisCombat ?? {})) {
    values.set(keyword, (values.get(keyword) ?? 0) + (value ?? 0))
  }
  return [...values].map(([keyword, value]) =>
    value > 1 ? `${keyword} ${String(value)}` : keyword,
  )
}

/** How far a unit is above or below its printed Might. */
function bonusOf(view: GameView, object: GameObject): number {
  const printed = getCard(object.cardId)?.might
  const current = mightOf(view, object, oracle)
  return printed === undefined || current === undefined ? 0 : current - printed
}

/** A readable label for an ability, from its id, until cards carry one. */
function abilityLabel(abilityId: string): string {
  if (abilityId.endsWith('-rune-energy')) return 'Exhaust for Energy'
  const power = /^(\w+)-rune-power$/.exec(abilityId)
  if (power) return `Recycle for ${power[1] ?? ''} Power`
  return abilityId.replace(/-/g, ' ')
}

const isRune = (view: GameView, id: ObjectId) =>
  getCard(view.objects[id]?.cardId ?? '')?.type === 'rune'

// ---------------------------------------------------------------------------
// The furniture of the mat
// ---------------------------------------------------------------------------

/** An outlined area, named along its edge as the printed mat names them. */
function Zone(props: {
  label: string
  children?: ReactNode
  wide?: boolean
  /** Room for one card, centred: the Battlefield slots in the middle row. */
  slot?: boolean
  tone?: 'held' | 'lost' | 'fighting' | undefined
  /** The far player's areas are named along their top edge, not their bottom. */
  flip?: boolean
}) {
  const classes = [
    'zone',
    props.wide ? 'zone--wide' : '',
    props.slot ? 'zone--slot' : '',
    props.tone ? `zone--${props.tone}` : '',
    props.flip ? 'zone--flip' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes}>
      <div className="zone-cards">{props.children}</div>
      <span className="zone-label">{props.label}</span>
    </div>
  )
}

/** A pile: its top card if anyone may see it, a back if not, and how many. */
function Pile(props: {
  label: string
  count: number
  view: GameView
  onHover: (cardId: string | null) => void
  top?: ObjectId | undefined
  flip?: boolean
}) {
  const top = props.top === undefined ? undefined : props.view.objects[props.top]
  return (
    <div className={`zone zone--pile ${props.flip ? 'zone--flip' : ''}`}>
      <div className="zone-cards">
        {props.count > 0 && <Card cardId={top?.cardId} size="board" onHover={props.onHover} />}
      </div>
      <span className="zone-count">{props.count}</span>
      <span className="zone-label">{props.label}</span>
    </div>
  )
}

/** The score track down the outer edge: 0 to 8, filled up to where they are. */
function ScoreTrack({ points, flip }: { points: number; flip?: boolean }) {
  const steps = Array.from({ length: VICTORY_SCORE + 1 }, (_, i) => i)
  return (
    <div className="score">
      {(flip ? steps : [...steps].reverse()).map((step) => (
        <span key={step} className={`score-step ${step <= points ? 'is-reached' : ''}`}>
          {step}
        </span>
      ))}
    </div>
  )
}

function Piece(props: { mat: MatHandle; id: ObjectId; hands: Hands }) {
  const { mat, id, hands } = props
  const object = mat.view.objects[id]
  if (!object) return null
  const choosing = mat.view.pendingChoice?.candidates?.includes(id) === true
  const actions = abilitiesOf(mat.session.legal, id).length + movesOf(mat.session.legal, id).length
  const aimedAt = mat.view.chain.some((item) => Object.values(item.bindings).flat().includes(id))

  return (
    <Card
      cardId={object.cardId}
      size="board"
      exhausted={object.exhausted}
      might={mightOf(mat.view, object, oracle)}
      bonus={bonusOf(mat.view, object)}
      damage={object.damage}
      role={object.combatRole}
      keywords={keywordsOf(object)}
      selected={hands.picked === id}
      playable={choosing || actions > 0}
      targeted={aimedAt}
      onClick={() => hands.onPick(hands.picked === id ? null : id)}
      onHover={hands.onHover}
    />
  )
}

/**
 * One player's own rows, behind the battle.
 *
 * They run from the middle of the table outwards: the Base with the Main Deck
 * beside it, then the Runes with the Rune Deck and Trash at the edges. The far
 * player's rows are the near one's mirror, as they are across a table.
 */
function Half(props: { mat: MatHandle; player: PlayerId; hands: Hands }) {
  const { mat, player, hands } = props
  const mine = player === mat.session.seat
  const view = mat.view
  const p = view.players[player]
  const flip = !mine

  const base = objectsAt(view, { kind: 'base', player })
  const pieces = (ids: readonly ObjectId[]) =>
    ids.map((id) => <Piece key={id} mat={mat} id={id} hands={hands} />)

  const bases = (
    <div className="mat-row">
      <Zone label="Base" wide flip={flip}>
        {pieces(base.filter((id) => !isRune(view, id)))}
      </Zone>
      <Pile
        label="Main deck"
        count={p.mainDeck.count}
        view={view}
        onHover={hands.onHover}
        flip={flip}
      />
    </div>
  )

  const runes = (
    <div className="mat-row">
      <Pile
        label="Runes deck"
        count={p.runeDeck.count}
        view={view}
        onHover={hands.onHover}
        flip={flip}
      />
      <Zone label="Runes" wide flip={flip}>
        {pieces(base.filter((id) => isRune(view, id)))}
      </Zone>
      <Pile
        label="Trash"
        count={p.trash.count}
        top={p.trash.cards?.[0]}
        view={view}
        onHover={hands.onHover}
        flip={flip}
      />
    </div>
  )

  return (
    <div className={`mat-half ${mine ? 'mat-half--mine' : 'mat-half--theirs'}`}>
      {mine ? (
        <>
          {bases}
          {runes}
        </>
      ) : (
        <>
          {runes}
          {bases}
        </>
      )}
    </div>
  )
}

/**
 * The middle of the mat, where the two players meet.
 *
 * A Battlefield and a Battle Zone are not the same area. The Battlefield cards
 * sit in the Battlefield Zone between the players (107.2), and each Battlefield
 * is a Location (107.2.b) — the units a player has there stand in that player's
 * own Battle Zone, on their side of it. So a column is one Battlefield: their
 * units above the card, ours below it, which is how the two sides meet. Each
 * player's Legend and Hero flank their own Battle Zone.
 */
function Middle(props: { mat: MatHandle; hands: Hands }) {
  const { mat, hands } = props
  const view = mat.view
  const me = mat.session.seat
  const them: PlayerId = me === 0 ? 1 : 0
  const pieces = (ids: readonly ObjectId[]) =>
    ids.map((id) => <Piece key={id} mat={mat} id={id} hands={hands} />)

  // Before setup the Battlefield Zone is empty; keep one column so the middle
  // of the mat still reads as the middle of a mat.
  const columns: readonly (BattlefieldState | null)[] =
    view.battlefields.length > 0 ? view.battlefields : [null]

  /** One player's units at one Battlefield — their side of that column. */
  const battleZone = (player: PlayerId, bf: BattlefieldState | null, key: string) => (
    <Zone
      key={key}
      label="Battle zone"
      tone={bf && view.showdown?.battlefield === bf.id ? 'fighting' : undefined}
      flip={player !== me}
    >
      {bf &&
        pieces(
          objectsAt(view, { kind: 'battlefield', id: bf.id }).filter(
            (id) => view.objects[id]?.controller === player,
          ),
        )}
    </Zone>
  )

  /** The Battlefield card itself, named on the side of the player who brought it. */
  const battlefield = (bf: BattlefieldState | null, key: string) => (
    <Zone
      key={key}
      label="Battlefield"
      slot
      flip={bf !== null && view.objects[bf.id]?.owner !== me}
      tone={
        bf === null
          ? undefined
          : view.showdown?.battlefield === bf.id
            ? 'fighting'
            : bf.controller === undefined
              ? undefined
              : bf.controller === me
                ? 'held'
                : 'lost'
      }
    >
      {bf && <Card cardId={view.objects[bf.id]?.cardId} size="board" onHover={hands.onHover} />}
    </Zone>
  )

  const legends = (player: PlayerId) => {
    const p = view.players[player]
    const flip = player !== me
    return [
      <Zone key="legend" label="Legend" flip={flip}>
        {pieces(p.legendZone.cards ?? [])}
      </Zone>,
      <Zone key="hero" label="Hero" flip={flip}>
        {pieces(p.championZone.cards ?? [])}
      </Zone>,
    ]
  }

  return (
    <section className="mat-mid" style={{ '--columns': columns.length } as CSSProperties}>
      <div className="mat-mid-row mat-mid-row--theirs">
        {legends(them).reverse()}
        {columns.map((bf, i) => battleZone(them, bf, `their-${String(i)}`))}
      </div>
      <div className="mat-mid-row mat-mid-row--fields">
        {columns.map((bf, i) => battlefield(bf, `field-${String(i)}`))}
      </div>
      <div className="mat-mid-row mat-mid-row--mine">
        {columns.map((bf, i) => battleZone(me, bf, `my-${String(i)}`))}
        {legends(me)}
      </div>
    </section>
  )
}

/** Who is who, what they hold, and what they have to spend. */
function Rail(props: { mat: MatHandle; player: PlayerId }) {
  const { mat, player } = props
  const p = mat.view.players[player]
  const mine = player === mat.session.seat
  const pool = p.runePool
  const power = Object.entries(pool.power).filter(([, n]) => (n ?? 0) > 0)
  return (
    <div className={`mat-rail ${mat.view.priority === player ? 'has-priority' : ''}`}>
      <span className="mat-rail-name">
        {mat.session.players[player].name}
        {mine && <em className="tag">you</em>}
      </span>
      <span className="mat-rail-score">
        {p.points}
        <i>/{VICTORY_SCORE}</i>
      </span>
      <span className="small muted mat-rail-legend">
        {p.legendZone.cards?.[0] === undefined
          ? 'no legend'
          : nameOf(mat.view, p.legendZone.cards[0])}
      </span>
      <span className="mat-counts small">
        <b>{p.hand.count}</b> in hand
      </span>
      <span className="mat-pool small">
        <b>{pool.energy}</b> energy
        {power.map(([domain, n]) => (
          <i
            key={domain}
            className={`rb-pip rb-domain--${domain}`}
            title={`${String(n)} ${domain}`}
          >
            {n}
          </i>
        ))}
        {pool.universal > 0 && <i className="rb-pip rb-domain--any">{pool.universal}</i>}
      </span>
    </div>
  )
}

function Hand(props: {
  mat: MatHandle
  hands: Hands
  aside: readonly ObjectId[]
  onAside: (ids: readonly ObjectId[]) => void
}) {
  const { mat, hands } = props
  const cards = mat.view.players[mat.session.seat].hand.cards ?? []
  const mulligan = mustMulligan(mat.session.legal)
  return (
    <div className="mat-hand">
      {cards.length === 0 && <span className="zone-empty">Your hand is empty</span>}
      {cards.map((id) => {
        const setAside = props.aside.includes(id)
        return (
          <div key={id} className={`mat-hand-card ${setAside ? 'is-aside' : ''}`}>
            <Card
              cardId={mat.view.objects[id]?.cardId}
              size="hand"
              playable={playsOf(mat.session.legal, id).length > 0}
              selected={hands.picked === id}
              onHover={hands.onHover}
              onClick={() =>
                mulligan
                  ? props.onAside(
                      setAside
                        ? props.aside.filter((x) => x !== id)
                        : props.aside.length < MULLIGAN_LIMIT
                          ? [...props.aside, id]
                          : props.aside,
                    )
                  : hands.onPick(hands.picked === id ? null : id)
              }
            />
            {setAside && <span className="mat-hand-flag">set aside</span>}
          </div>
        )
      })}
    </div>
  )
}

/** What the picked card can do: the legal actions that name it. */
function Actions(props: { mat: MatHandle; picked: ObjectId; onDone: () => void }) {
  const { mat, picked } = props
  const me = mat.session.seat
  const plays = playsOf(mat.session.legal, picked)
  const abilities = abilitiesOf(mat.session.legal, picked)
  const moves = movesOf(mat.session.legal, picked)
  const act = (action: GameAction) => {
    mat.send(action)
    props.onDone()
  }
  return (
    <div className="mat-actions">
      <strong>{nameOf(mat.view, picked)}</strong>
      {plays.length + abilities.length + moves.length === 0 && (
        <span className="muted small">nothing you can do with it right now</span>
      )}
      {plays.map((play) => (
        <button
          key={play.to?.kind === 'battlefield' ? play.to.id : 'base'}
          className="primary"
          onClick={() => act({ ...play, player: me })}
        >
          {play.to ? `Play to ${placeName(mat.view, play.to, me)}` : 'Play'}
        </button>
      ))}
      {abilities.map((abilityId) => (
        <button
          key={abilityId}
          onClick={() => act({ type: 'activate-ability', player: me, source: picked, abilityId })}
        >
          {abilityLabel(abilityId)}
        </button>
      ))}
      {moves.map((to) => (
        <button
          key={to.kind === 'base' ? 'base' : to.id}
          onClick={() => act({ type: 'move', player: me, units: [picked], to })}
        >
          Move to {placeName(mat.view, to, me)}
        </button>
      ))}
      <button className="link" onClick={props.onDone}>
        Close
      </button>
    </div>
  )
}

function ChainRail({ mat }: { mat: MatHandle }) {
  if (mat.view.chain.length === 0) return null
  return (
    <aside className="mat-chain">
      <span className="label">Chain — top resolves first</span>
      {[...mat.view.chain].reverse().map((item) => {
        const targets = Object.values(item.bindings).flat()
        return (
          <div key={item.id} className="mat-chain-item">
            <Card cardId={mat.view.objects[item.source]?.cardId} size="tiny" />
            <div>
              <strong>{nameOf(mat.view, item.source)}</strong>
              <div className="small muted">
                {item.controller === mat.session.seat ? 'yours' : 'theirs'}
                {item.abilityId ? ` · ${abilityLabel(item.abilityId)}` : ''}
                {item.pending ? ' · being played' : ''}
              </div>
              {targets.length > 0 && (
                <div className="small">
                  → {targets.map((id) => nameOf(mat.view, id)).join(', ')}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </aside>
  )
}

/** The prompt for a choice the engine is waiting on, or for the mulligan. */
function Prompt(props: {
  mat: MatHandle
  aside: readonly ObjectId[]
  onAside: (ids: readonly ObjectId[]) => void
}) {
  const { mat } = props
  const me = mat.session.seat
  const choice = mat.view.pendingChoice
  const [picked, setPicked] = useState<readonly ObjectId[]>([])

  if (mustMulligan(mat.session.legal)) {
    return (
      <div className="mat-prompt">
        <strong>Mulligan</strong>
        <span className="muted small">
          Click up to two cards in hand to set aside ({props.aside.length} chosen), then keep the
          rest.
        </span>
        <button
          className="primary"
          onClick={() => {
            mat.send({ type: 'mulligan', player: me, setAside: props.aside })
            props.onAside([])
          }}
        >
          Keep hand
        </button>
      </div>
    )
  }

  if (!choice || choice.player !== me || !choice.candidates) return null
  const candidates = choice.candidates
  const answer = (chosen: readonly ObjectId[]) => {
    mat.send({ type: 'resolve-choice', player: me, chosen })
    setPicked([])
  }

  // A yes-or-no question, and a look at the top of the deck, are one card each.
  if (choice.kind === 'may' || choice.kind === 'predict') {
    const one = candidates[0]
    return (
      <div className="mat-prompt">
        <strong>
          {choice.kind === 'predict'
            ? `Top of your deck: ${one === undefined ? 'nothing' : nameOf(mat.view, one)}`
            : `Use ${one === undefined ? 'this ability' : nameOf(mat.view, one)}?`}
        </strong>
        {one !== undefined && <Card cardId={mat.view.objects[one]?.cardId} size="tiny" />}
        <button className="primary" onClick={() => answer(candidates)}>
          {choice.kind === 'predict' ? 'Recycle it' : 'Yes'}
        </button>
        <button onClick={() => answer([])}>
          {choice.kind === 'predict' ? 'Keep it on top' : 'No'}
        </button>
      </div>
    )
  }

  const ready = picked.length >= choice.min && picked.length <= choice.max
  return (
    <div className="mat-prompt">
      <strong>
        {choice.kind === 'cost'
          ? 'Additional cost: exhaust a unit, or none'
          : choice.min === choice.max
            ? `Choose ${String(choice.max)}`
            : `Choose ${String(choice.min)}–${String(choice.max)}`}
      </strong>
      <div className="mat-prompt-cards">
        {candidates.map((id) => (
          <Card
            key={id}
            cardId={mat.view.objects[id]?.cardId}
            size="tiny"
            selected={picked.includes(id)}
            playable
            onClick={() =>
              setPicked((current) =>
                current.includes(id)
                  ? current.filter((x) => x !== id)
                  : current.length < choice.max
                    ? [...current, id]
                    : current,
              )
            }
          />
        ))}
      </div>
      <button className="primary" disabled={!ready} onClick={() => answer(picked)}>
        Confirm
      </button>
    </div>
  )
}

/** The card under the cursor, big enough to read. */
function Zoomed({ cardId }: { cardId: string | null }) {
  if (cardId === null) return null
  return (
    <div className="mat-zoom">
      <Card cardId={cardId} size="zoom" />
    </div>
  )
}

function Ended(props: { mat: MatHandle; onDismiss?: (() => void) | undefined }) {
  const ended = props.mat.session.ended
  if (!ended) return null
  const won = ended.winner === props.mat.session.seat
  const why =
    ended.reason === 'concede'
      ? won
        ? 'Your opponent conceded.'
        : 'You conceded.'
      : ended.reason === 'abandoned'
        ? won
          ? 'Your opponent did not come back in time.'
          : 'You were away too long.'
        : ''
  return (
    <div className="overlay">
      <div className="card result">
        <h1>{ended.winner === null ? 'Draw' : won ? 'Victory' : 'Defeat'}</h1>
        {why && <p className="muted">{why}</p>}
        {props.onDismiss && (
          <button className="primary" onClick={props.onDismiss}>
            Back to lobby
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The mat
// ---------------------------------------------------------------------------

export function Playmat(props: { mat: MatHandle; onDismiss?: (() => void) | undefined }) {
  const { mat } = props
  const { session, view } = mat
  const me = session.seat
  const them: PlayerId = me === 0 ? 1 : 0
  const [picked, setPicked] = useState<ObjectId | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [aside, setAside] = useState<readonly ObjectId[]>([])
  const [confirmConcede, setConfirmConcede] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (session.opponentAwayUntil === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session.opponentAwayUntil])

  // A card that has left the board cannot stay selected.
  useEffect(() => {
    if (picked !== null && !view.objects[picked]) setPicked(null)
  }, [picked, view])

  const hands: Hands = { picked, onPick: setPicked, onHover: setHovered }
  const yourTurn = view.turnPlayer === me
  const endTurn = view.chain.length === 0 && !view.showdown && yourTurn && view.phase === 'main'
  const status = session.ended
    ? 'Match over'
    : mustChoose(session.legal)
      ? 'Your choice'
      : mustMulligan(session.legal)
        ? 'Mulligan'
        : waitingOnOpponent(session)
          ? `Waiting for ${session.players[them].name}…`
          : 'Your move'

  return (
    <div className="mat">
      <header className="mat-top">
        <span className="small muted">
          Turn {view.turnNumber} · {yourTurn ? 'your turn' : 'their turn'} · {view.phase}
          {view.step !== view.phase ? ` / ${view.step}` : ''}
          {view.showdown ? (view.showdown.combat ? ' · combat' : ' · showdown') : ''}
        </span>
        <strong className="mat-status">{status}</strong>
        <span className="mat-top-actions">
          {canPass(session.legal) && (
            <button className="primary" onClick={() => mat.send({ type: 'pass', player: me })}>
              {endTurn ? 'End turn' : 'Pass'}
            </button>
          )}
          {!session.ended &&
            (confirmConcede ? (
              <>
                <button
                  className="danger"
                  onClick={() => mat.send({ type: 'concede', player: me })}
                >
                  Concede for real
                </button>
                <button className="link" onClick={() => setConfirmConcede(false)}>
                  Keep playing
                </button>
              </>
            ) : (
              <button className="link" onClick={() => setConfirmConcede(true)}>
                Concede
              </button>
            ))}
        </span>
      </header>

      {session.opponentAwayUntil !== null && (
        <div className="banner">
          {session.players[them].name} disconnected. They forfeit in{' '}
          {Math.max(0, Math.ceil((session.opponentAwayUntil - now) / 1000))}s unless they return.
        </div>
      )}

      <Rail mat={mat} player={them} />
      <div className="mat-body">
        {/* Each track runs the length of its own player's edge, from their end. */}
        <ScoreTrack points={view.players[me].points} />
        <div className="mat-field">
          <Half mat={mat} player={them} hands={hands} />
          <Middle mat={mat} hands={hands} />
          <Half mat={mat} player={me} hands={hands} />
        </div>
        <ScoreTrack points={view.players[them].points} flip />
      </div>
      <Rail mat={mat} player={me} />

      <ChainRail mat={mat} />
      <Prompt mat={mat} aside={aside} onAside={setAside} />
      {picked !== null && <Actions mat={mat} picked={picked} onDone={() => setPicked(null)} />}
      <Hand mat={mat} hands={hands} aside={aside} onAside={setAside} />
      <Zoomed cardId={hovered} />
      <Ended mat={mat} onDismiss={props.onDismiss} />
    </div>
  )
}
