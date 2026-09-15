/**
 * The match screen: a working board, not the final one.
 *
 * Shows exactly what the server's view contains and offers exactly the actions
 * the server said are legal. It never decides legality itself, so it cannot
 * drift from the rules — at worst it shows a button the server then refuses.
 * The polished board (card art, animation, drag to play) is M8.
 */

import { useEffect, useState } from 'react'

import { cardFullName, getCard } from '@rb/cards'
import { currentMight } from '@rb/engine'
import type { GameAction, GameObject, GameView, Location, ObjectId, PlayerId } from '@rb/engine'

import {
  abilitiesOf,
  canPass,
  canPlay,
  movesOf,
  mustChoose,
  mustMulligan,
  objectsAt,
  waitingOnOpponent,
} from '../../../shared/match.js'
import type { MatchSession } from '../../../shared/match.js'
import { useStore } from '../store.js'

const MULLIGAN_LIMIT = 2

function send(session: MatchSession, action: GameAction): void {
  window.rb.lobby.send({ type: 'match.action', matchId: session.id, action })
}

function nameOf(view: GameView, id: ObjectId): string {
  const object = view.objects[id]
  if (!object) return 'Hidden card'
  const card = getCard(object.cardId)
  return card ? cardFullName(card) : object.cardId
}

function mightOf(object: GameObject): number | undefined {
  const printed = getCard(object.cardId)?.might
  return printed === undefined ? undefined : currentMight(object, printed)
}

/** "+3 this turn", so a player can see why a unit is bigger than printed. */
function signed(amount: number): string {
  return amount > 0 ? `+${String(amount)}` : String(amount)
}

function locationName(view: GameView, location: Location, seat: PlayerId): string {
  if (location.kind === 'base') return location.player === seat ? 'your base' : 'their base'
  return nameOf(view, location.id)
}

function abilityLabel(abilityId: string): string {
  if (abilityId.endsWith('-rune-energy')) return 'Exhaust: +1 Energy'
  const power = /^(\w+)-rune-power$/.exec(abilityId)
  if (power) return `Recycle: +1 ${power[1] ?? ''} Power`
  return abilityId.replace(/-/g, ' ')
}

function Piece(props: { session: MatchSession; view: GameView; id: ObjectId }) {
  const { session, view, id } = props
  const object = view.objects[id]
  if (!object) return null
  const might = mightOf(object)
  const abilities = abilitiesOf(session.legal, id)
  const moves = movesOf(session.legal, id)

  return (
    <div className={`piece ${object.exhausted ? 'exhausted' : ''}`}>
      <div className="piece-name">{nameOf(view, id)}</div>
      <div className="piece-stats small">
        {might !== undefined && <span>{might} might</span>}
        {object.mightThisTurn !== undefined && object.mightThisTurn !== 0 && (
          <span className="muted">({signed(object.mightThisTurn)} this turn)</span>
        )}
        {object.damage > 0 && <span className="damage">{object.damage} damage</span>}
        {object.exhausted && <span className="muted">exhausted</span>}
      </div>
      {(abilities.length > 0 || moves.length > 0) && (
        <div className="piece-actions">
          {abilities.map((abilityId) => (
            <button
              key={abilityId}
              onClick={() =>
                send(session, {
                  type: 'activate-ability',
                  player: session.seat,
                  source: id,
                  abilityId,
                })
              }
            >
              {abilityLabel(abilityId)}
            </button>
          ))}
          {moves.map((to) => (
            <button
              key={to.kind === 'base' ? 'base' : to.id}
              onClick={() => send(session, { type: 'move', player: session.seat, units: [id], to })}
            >
              Move to {locationName(view, to, session.seat)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Zone(props: {
  session: MatchSession
  view: GameView
  title: string
  ids: readonly ObjectId[]
}) {
  return (
    <div className="zone">
      <div className="zone-title label">{props.title}</div>
      <div className="zone-pieces">
        {props.ids.length === 0 ? (
          <span className="muted small">Empty</span>
        ) : (
          props.ids.map((id) => (
            <Piece key={id} session={props.session} view={props.view} id={id} />
          ))
        )}
      </div>
    </div>
  )
}

function Base(props: { session: MatchSession; view: GameView; player: PlayerId }) {
  const { session, view, player } = props
  const ids = objectsAt(view, { kind: 'base', player })
  const isRune = (id: ObjectId) => getCard(view.objects[id]?.cardId ?? '')?.type === 'rune'
  const mine = player === session.seat
  return (
    <div className="base-row">
      <Zone
        session={session}
        view={view}
        title={mine ? 'Your base' : 'Their base'}
        ids={ids.filter((id) => !isRune(id))}
      />
      <Zone
        session={session}
        view={view}
        title={mine ? 'Your runes' : 'Their runes'}
        ids={ids.filter(isRune)}
      />
    </div>
  )
}

function PlayerStrip(props: { session: MatchSession; view: GameView; player: PlayerId }) {
  const { session, view, player } = props
  const p = view.players[player]
  const pool = p.runePool
  const power = Object.entries(pool.power)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([domain, n]) => `${String(n)} ${domain}`)
  const legend = p.legendZone.cards?.[0]
  const champion = p.championZone.cards?.[0]
  return (
    <div className={`strip ${view.priority === player ? 'has-priority' : ''}`}>
      <div className="strip-name">
        {session.players[player].name}
        {player === session.seat && <span className="tag">You</span>}
      </div>
      <div className="points">
        {p.points} <span className="muted small">/ 8</span>
      </div>
      <div className="small muted">
        {legend ? nameOf(view, legend) : ''}
        {champion ? ` · Champion: ${nameOf(view, champion)}` : ''}
      </div>
      <div className="small">
        Hand {p.hand.count} · Deck {p.mainDeck.count} · Runes left {p.runeDeck.count} · Trash{' '}
        {p.trash.count}
      </div>
      <div className="small">
        Pool: {pool.energy} energy{power.length ? `, ${power.join(', ')}` : ''}
        {pool.universal ? `, ${String(pool.universal)} any` : ''}
      </div>
    </div>
  )
}

function Choice(props: { session: MatchSession; view: GameView }) {
  const { session, view } = props
  const choice = view.pendingChoice
  const [picked, setPicked] = useState<ObjectId[]>([])
  if (!choice?.candidates || choice.player !== session.seat) return null
  const toggle = (id: ObjectId) =>
    setPicked((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : current.length < choice.max
          ? [...current, id]
          : current,
    )
  const ok = picked.length >= choice.min && picked.length <= choice.max
  return (
    <div className="card choice">
      <h2>
        Choose{' '}
        {choice.min === choice.max ? choice.max : `${String(choice.min)}–${String(choice.max)}`}
      </h2>
      <div className="choice-options">
        {choice.candidates.map((id) => (
          <label key={id} className="check">
            <input type="checkbox" checked={picked.includes(id)} onChange={() => toggle(id)} />
            {nameOf(view, id)}
          </label>
        ))}
      </div>
      <button
        className="primary"
        disabled={!ok}
        onClick={() => {
          send(session, { type: 'resolve-choice', player: session.seat, chosen: picked })
          setPicked([])
        }}
      >
        Confirm
      </button>
    </div>
  )
}

function Hand(props: { session: MatchSession; view: GameView }) {
  const { session, view } = props
  const hand = view.players[session.seat].hand.cards ?? []
  const mulligan = mustMulligan(session.legal)
  const [aside, setAside] = useState<ObjectId[]>([])
  useEffect(() => {
    if (!mulligan) setAside([])
  }, [mulligan])

  return (
    <div className="card hand">
      <div className="hand-head">
        <h2>{mulligan ? 'Mulligan: set aside up to two' : 'Your hand'}</h2>
        {mulligan && (
          <button
            className="primary"
            onClick={() =>
              send(session, { type: 'mulligan', player: session.seat, setAside: aside })
            }
          >
            {aside.length === 0 ? 'Keep this hand' : `Set aside ${String(aside.length)}`}
          </button>
        )}
      </div>
      <div className="hand-cards">
        {hand.map((id) => {
          const card = getCard(view.objects[id]?.cardId ?? '')
          const chosen = aside.includes(id)
          return (
            <div key={id} className={`hand-card ${chosen ? 'chosen' : ''}`}>
              <div className="piece-name">{nameOf(view, id)}</div>
              <div className="small muted">
                {card?.cost ? `${String(card.cost.energy)} energy` : ''}
                {card?.cost?.power.length ? ` +${String(card.cost.power.length)} power` : ''}
                {card?.might !== undefined ? ` · ${String(card.might)} might` : ''}
              </div>
              {card?.text && <div className="small hand-text">{card.text}</div>}
              {mulligan ? (
                <button
                  onClick={() =>
                    setAside((current) =>
                      chosen
                        ? current.filter((x) => x !== id)
                        : current.length < MULLIGAN_LIMIT
                          ? [...current, id]
                          : current,
                    )
                  }
                >
                  {chosen ? 'Keep' : 'Set aside'}
                </button>
              ) : (
                canPlay(session.legal, id) && (
                  <button
                    className="primary"
                    onClick={() =>
                      send(session, { type: 'play-card', player: session.seat, card: id })
                    }
                  >
                    Play
                  </button>
                )
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Chain({ session, view }: { session: MatchSession; view: GameView }) {
  if (view.chain.length === 0) return null
  return (
    <div className="card chain">
      <span className="label">Chain — the top resolves first</span>
      <ol className="chain-items">
        {[...view.chain].reverse().map((item) => {
          const card = getCard(view.objects[item.source]?.cardId ?? '')
          return (
            <li key={item.id}>
              <strong>{nameOf(view, item.source)}</strong>
              <span className="muted small">
                {' '}
                · {item.controller === session.seat ? 'yours' : 'theirs'}
                {item.pending ? ' · pending' : ''}
              </span>
              {card?.text && <div className="small hand-text">{card.text}</div>}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Ended({ session }: { session: MatchSession }) {
  const dismiss = useStore((s) => s.dismissMatch)
  if (!session.ended) return null
  const { winner, reason } = session.ended
  const won = winner === session.seat
  const why =
    reason === 'concede'
      ? won
        ? 'Your opponent conceded.'
        : 'You conceded.'
      : reason === 'abandoned'
        ? won
          ? 'Your opponent did not come back in time.'
          : 'You were away too long.'
        : ''
  return (
    <div className="overlay">
      <div className="card result">
        <h1>{winner === null ? 'Draw' : won ? 'Victory' : 'Defeat'}</h1>
        {why && <p className="muted">{why}</p>}
        <button className="primary" onClick={dismiss}>
          Back to lobby
        </button>
      </div>
    </div>
  )
}

export function Match({ session }: { session: MatchSession }) {
  const view = session.view
  const [confirmConcede, setConfirmConcede] = useState(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (session.opponentAwayUntil === null) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session.opponentAwayUntil])

  if (!view) return <div className="splash">Setting up the match…</div>

  const me = session.seat
  const them: PlayerId = me === 0 ? 1 : 0
  const yourTurn = view.turnPlayer === me
  const status = session.ended
    ? 'Match over'
    : mustChoose(session.legal)
      ? 'Make your choice'
      : mustMulligan(session.legal)
        ? 'Choose your mulligan'
        : waitingOnOpponent(session)
          ? `Waiting for ${session.players[them].name}…`
          : 'Your move'

  return (
    <div className="match">
      <div className="match-bar">
        <span>
          Turn {view.turnNumber} · {yourTurn ? 'your turn' : 'their turn'} · {view.phase}
          {view.step !== view.phase ? ` / ${view.step}` : ''}
          {view.showdown
            ? ` · ${view.showdown.combat ? 'combat' : 'showdown'} at ${nameOf(view, view.showdown.battlefield)}`
            : ''}
          {view.chain.length > 0 ? ` · chain ${String(view.chain.length)}` : ''}
        </span>
        <strong className="match-status">{status}</strong>
        <div className="actions">
          {canPass(session.legal) && (
            <button className="primary" onClick={() => send(session, { type: 'pass', player: me })}>
              {view.chain.length === 0 && !view.showdown && yourTurn && view.phase === 'main'
                ? 'End turn'
                : 'Pass'}
            </button>
          )}
          {!session.ended &&
            (confirmConcede ? (
              <>
                <button
                  className="danger"
                  onClick={() => send(session, { type: 'concede', player: me })}
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
        </div>
      </div>

      {session.opponentAwayUntil !== null && (
        <div className="banner">
          {session.players[them].name} disconnected. They forfeit in{' '}
          {Math.max(0, Math.ceil((session.opponentAwayUntil - now) / 1000))}s unless they return.
        </div>
      )}

      <Chain session={session} view={view} />
      <PlayerStrip session={session} view={view} player={them} />
      <Base session={session} view={view} player={them} />

      <div className="battlefields">
        {view.battlefields.map((battlefield) => {
          const ids = objectsAt(view, { kind: 'battlefield', id: battlefield.id })
          const theirs = ids.filter((id) => view.objects[id]?.controller === them)
          const mine = ids.filter((id) => view.objects[id]?.controller === me)
          const controller =
            battlefield.controller === undefined
              ? 'uncontrolled'
              : battlefield.controller === me
                ? 'yours'
                : 'theirs'
          return (
            <div key={battlefield.id} className={`card battlefield ${controller}`}>
              <div className="battlefield-head">
                <strong>{nameOf(view, battlefield.id)}</strong>
                <span className="small muted">
                  {controller}
                  {battlefield.contested ? ' · contested' : ''}
                </span>
              </div>
              <Zone session={session} view={view} title="Theirs" ids={theirs} />
              <Zone session={session} view={view} title="Yours" ids={mine} />
            </div>
          )
        })}
      </div>

      <Base session={session} view={view} player={me} />
      <PlayerStrip session={session} view={view} player={me} />
      <Choice session={session} view={view} />
      <Hand session={session} view={view} />
      <Ended session={session} />
    </div>
  )
}
