import { useState } from 'react'

import { canEnterRoom, encodeDeck } from '@rb/engine'
import { ROOM_CODE_LENGTH, normaliseRoomCode } from '@rb/protocol'
import type { RoomView } from '@rb/protocol'

import { useStore } from '../store.js'

function PresetPicker() {
  const presets = useStore((s) => s.presets.presets)
  const selected = useStore((s) => s.selectedPresetId)
  const select = useStore((s) => s.selectPreset)
  const go = useStore((s) => s.go)

  if (!canEnterRoom(presets)) {
    return (
      <div className="card empty">
        <h2>Build a deck first</h2>
        <p className="muted">You need at least one saved deck to create or join a room.</p>
        <button className="primary" onClick={() => go({ name: 'decks' })}>
          Go to decks
        </button>
      </div>
    )
  }

  return (
    <label className="field">
      <span className="label">Deck</span>
      <select value={selected ?? ''} onChange={(e) => select(e.target.value || null)}>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function useSelectedDeckCode(): string | null {
  const presets = useStore((s) => s.presets.presets)
  const selected = useStore((s) => s.selectedPresetId)
  const preset = presets.find((p) => p.id === selected) ?? presets[0]
  return preset ? encodeDeck(preset.deck) : null
}

function Lobby() {
  const auth = useStore((s) => s.auth)
  const connection = useStore((s) => s.connection)
  const presets = useStore((s) => s.presets.presets)
  const roomClosed = useStore((s) => s.roomClosed)
  const deck = useSelectedDeckCode()
  const [code, setCode] = useState('')

  const online = connection === 'online'
  const isGuest = auth.kind === 'guest'
  const hasDeck = canEnterRoom(presets) && deck !== null
  const typed = normaliseRoomCode(code)

  return (
    <div className="lobby">
      {roomClosed === 'host-left' && <div className="banner">The host closed the room.</div>}
      <PresetPicker />

      <div className="grid-2">
        <section className="card">
          <h2>Host a room</h2>
          <p className="muted">Get a code to send to a friend.</p>
          <button
            className="primary"
            disabled={!online || !hasDeck || isGuest}
            onClick={() => deck && window.rb.lobby.send({ type: 'room.create', deck })}
          >
            Create room
          </button>
          {isGuest && <p className="hint">Guests can’t host. Create an account to host rooms.</p>}
        </section>

        <section className="card">
          <h2>Join a room</h2>
          <p className="muted">Enter the code your friend sent you.</p>
          <form
            className="join"
            onSubmit={(e) => {
              e.preventDefault()
              if (deck) window.rb.lobby.send({ type: 'room.join', code: typed, deck })
            }}
          >
            <input
              className="code-input"
              value={code}
              maxLength={ROOM_CODE_LENGTH + 2}
              placeholder="ABC123"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              aria-label="Room code"
            />
            <button
              className="primary"
              type="submit"
              disabled={!online || !hasDeck || typed.length !== ROOM_CODE_LENGTH}
            >
              Join
            </button>
          </form>
        </section>
      </div>

      {!online && (
        <p className="hint center">
          {connection === 'outdated'
            ? 'This version of the game is out of date. Please update it.'
            : connection === 'replaced'
              ? 'You connected from another window or computer. Log out and back in to play here.'
              : 'Waiting for the server…'}
        </p>
      )}
    </div>
  )
}

function Room({ room }: { room: RoomView }) {
  const presets = useStore((s) => s.presets.presets)
  const selected = useStore((s) => s.selectedPresetId)
  const select = useStore((s) => s.selectPreset)
  const [copied, setCopied] = useState(false)

  const me = room.seats[room.yourSeat]
  const locked = room.status === 'starting'

  async function copy() {
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  function changeDeck(id: string) {
    select(id)
    const preset = presets.find((p) => p.id === id)
    if (preset) window.rb.lobby.send({ type: 'room.deck', deck: encodeDeck(preset.deck) })
  }

  return (
    <div className="room">
      <section className="card code-card">
        <span className="label">Room code</span>
        <div className="room-code">{room.code}</div>
        <button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy code'}</button>
      </section>

      <section className="seats">
        {[0, 1].map((index) => {
          const seat = room.seats[index]
          return (
            <div key={index} className={`card seat ${seat?.ready ? 'ready' : ''}`}>
              {seat ? (
                <>
                  <div className="seat-name">
                    {seat.name}
                    {index === room.yourSeat && <span className="tag">You</span>}
                    {seat.host && <span className="tag">Host</span>}
                    {seat.kind === 'guest' && <span className="tag">Guest</span>}
                  </div>
                  <div className={seat.ready ? 'status ok' : 'status'}>
                    {seat.ready ? 'Ready' : 'Choosing…'}
                  </div>
                </>
              ) : (
                <div className="muted">Waiting for a friend to join…</div>
              )}
            </div>
          )
        })}
      </section>

      <section className="card room-controls">
        <label className="field">
          <span className="label">Your deck</span>
          <select
            value={selected ?? ''}
            disabled={locked}
            onChange={(e) => changeDeck(e.target.value)}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button
            className={me?.ready ? 'secondary' : 'primary'}
            disabled={locked}
            onClick={() => window.rb.lobby.send({ type: 'room.ready', ready: !me?.ready })}
          >
            {me?.ready ? 'Not ready' : 'Ready'}
          </button>
          <button className="danger" onClick={() => window.rb.lobby.send({ type: 'room.leave' })}>
            Leave room
          </button>
        </div>
        {locked && (
          <p className="hint">
            Both players are ready. Matches are not built yet — this is where the game will start.
          </p>
        )}
      </section>
    </div>
  )
}

export function Home() {
  const room = useStore((s) => s.room)
  return <div className="page">{room ? <Room room={room} /> : <Lobby />}</div>
}
