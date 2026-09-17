/**
 * The playmat, laid out like the printed one.
 *
 * Each player has the same three rows as the printed mat — their Battlefield
 * area nearest the middle, their Base behind it, their Runes nearest them —
 * with the Legend and Hero (the Champion Zone) beside the Battlefield area, the
 * Main Deck beside the Base, and the Rune Deck and Trash beside the Runes. A
 * score track from 0 to 8 runs down the outer edge. The two players face each
 * other, so the far side is the near one turned around.
 *
 * Inside the Battlefield area each Battlefield has its own cell: the card in a
 * slot of its own, and beside it the units this player has at that Battlefield
 * — a Battlefield is a Location, and what stands there is not the card.
 *
 * Everything shown is exactly what the server sent — the client decides nothing
 * about the rules — and every button on it is an action the server said is
 * legal. Interaction is one idea: pick a card, then choose what it does.
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { cardFullName, cardOracle, getCard } from '@rb/cards'
import { mightOf, pointsToWin } from '@rb/engine'
import type { GameAction, GameObject, GameView, Location, ObjectId, PlayerId } from '@rb/engine'

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
/** 466.2. A Battlefield in play may raise it, so the mat asks the engine. */
const BASE_VICTORY_SCORE = 8

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
  tone?: 'held' | 'lost' | 'fighting' | undefined
  /** The far player's areas are named along their top edge, not their bottom. */
  flip?: boolean
}) {
  const classes = [
    'zone',
    props.wide ? 'zone--wide' : '',
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

/** The score track down the outer edge: 0 to the Victory Score, filled up to where they are. */
function ScoreTrack({ points, target, flip }: { points: number; target: number; flip?: boolean }) {
  const steps = Array.from({ length: target + 1 }, (_, i) => i)
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
 * One player's half of the mat, laid out as the printed one lays it out.
 *
 * Three rows, read from the middle of the table outwards: the Battlefield area
 * with the Legend and Hero beside it, then the Base with the Main Deck, then
 * the Runes with the Rune Deck and Trash at the edges. A score track from 0 to
 * 8 runs down the outer edge. The far player's half is the near one turned
 * around, as it is across a table.
 */
function Half(props: { mat: MatHandle; player: PlayerId; hands: Hands }) {
  const { mat, player, hands } = props
  const mine = player === mat.session.seat
  const view = mat.view
  const p = view.players[player]
  const flip = !mine

  const base = objectsAt(view, { kind: 'base', player })
  const target = pointsToWin(view, oracle, BASE_VICTORY_SCORE)
  const pieces = (ids: readonly ObjectId[]) =>
    ids.map((id) => <Piece key={id} mat={mat} id={id} hands={hands} />)

  /*
   * The Battlefield area holds one cell per Battlefield (107.2.a). Inside a
   * cell the Battlefield card has its own slot and the units this player has
   * there stand beside it — a Battlefield is a Location, and the units at it
   * are not the card (107.2.b). The card sits on the side of the player who
   * brought it, where it is put on the table. Both halves lay the cells out in
   * the same order, so a Battlefield is in the same place on screen for both
   * players and your units read as facing theirs across it.
   */
  const cells = view.battlefields
  const battlefields = (
    <div className="mat-row">
      <Zone label="Battlefield" wide flip={flip}>
        {cells.map((bf) => {
          const card = view.objects[bf.id]
          const tone =
            view.showdown?.battlefield === bf.id
              ? 'fighting'
              : bf.controller === undefined
                ? undefined
                : bf.controller === mat.session.seat
                  ? 'held'
                  : 'lost'
          const units = objectsAt(view, { kind: 'battlefield', id: bf.id }).filter(
            (id) => view.objects[id]?.controller === player,
          )
          return (
            <div
              key={bf.id}
              className={`bf ${tone ? `bf--${tone}` : ''} ${flip ? 'bf--flip' : ''}`}
            >
              {card?.owner === player && (
                <div className="bf-slot">
                  <Card cardId={card.cardId} size="board" onHover={hands.onHover} />
                </div>
              )}
              <div className="bf-units">{pieces(units)}</div>
              <span className="bf-name">{nameOf(view, bf.id)}</span>
            </div>
          )
        })}
      </Zone>
      <Zone label="Legend" flip={flip}>
        {pieces(p.legendZone.cards ?? [])}
      </Zone>
      <Zone label="Hero" flip={flip}>
        {pieces(p.championZone.cards ?? [])}
      </Zone>
    </div>
  )

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
      <ScoreTrack points={p.points} target={target} flip={flip} />
      <div className="mat-rows">
        {mine ? (
          <>
            {battlefields}
            {bases}
            {runes}
          </>
        ) : (
          <>
            {runes}
            {bases}
            {battlefields}
          </>
        )}
      </div>
    </div>
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
        <i>/{pointsToWin(mat.view, oracle, BASE_VICTORY_SCORE)}</i>
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
      <Half mat={mat} player={them} hands={hands} />
      <Half mat={mat} player={me} hands={hands} />
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
