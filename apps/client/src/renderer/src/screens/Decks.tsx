import { useMemo, useState } from 'react'

import { PROVING_GROUNDS_DECKS, cardOracle } from '@rb/cards'
import { validateDeck } from '@rb/engine'
import type { DeckPreset } from '@rb/engine'

import {
  addStarterDecks,
  exportDeckCode,
  importDeckCode,
  removePreset,
  upsertPreset,
} from '../../../shared/presets.js'
import { useStore } from '../store.js'

const oracle = cardOracle()

function PresetRow({ preset }: { preset: DeckPreset }) {
  const file = useStore((s) => s.presets)
  const save = useStore((s) => s.savePresets)
  const go = useStore((s) => s.go)
  const notify = useStore((s) => s.notify)
  const [confirming, setConfirming] = useState(false)
  // A deck legal for a Duel is simply "Legal". The boxed decks bring one
  // battlefield, so they pass only the starter format, and say so.
  const legality = useMemo(() => {
    if (validateDeck(preset.deck, oracle, 'duel').valid) return 'duel'
    if (validateDeck(preset.deck, oracle, 'starter').valid) return 'starter'
    return null
  }, [preset.deck])

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(exportDeckCode(preset))
      notify(`Copied the deck code for “${preset.name}”.`)
    } catch {
      notify('Could not copy to the clipboard.')
    }
  }

  return (
    <li className="card preset">
      <div className="preset-main">
        <div className="preset-name">{preset.name}</div>
        <div className="muted small">
          {preset.deck.main.length + (preset.deck.champion ? 1 : 0)} main ·{' '}
          {preset.deck.runes.length} runes · {preset.deck.battlefields.length} battlefields
        </div>
      </div>
      <span
        className={legality ? 'badge ok' : 'badge warn'}
        title={
          legality === 'starter'
            ? 'Legal with the one battlefield it ships with. A Duel needs three.'
            : undefined
        }
      >
        {legality === 'duel' ? 'Legal' : legality === 'starter' ? 'Starter legal' : 'Not legal'}
      </span>
      <div className="actions">
        <button onClick={() => go({ name: 'builder', presetId: preset.id })}>Edit</button>
        <button onClick={() => void copyCode()}>Copy code</button>
        {confirming ? (
          <>
            <button className="danger" onClick={() => void save(removePreset(file, preset.id))}>
              Delete for good
            </button>
            <button className="link" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <button className="link" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
    </li>
  )
}

function ImportDeck() {
  const file = useStore((s) => s.presets)
  const save = useStore((s) => s.savePresets)
  const select = useStore((s) => s.selectPreset)
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const result = importDeckCode(code, name, crypto.randomUUID(), Date.now())
    if (!result.ok) {
      setError(result.message)
      return
    }
    await save(upsertPreset(file, result.preset))
    select(result.preset.id)
    setOpen(false)
    setCode('')
    setName('')
    setError(null)
  }

  if (!open) return <button onClick={() => setOpen(true)}>Import deck code</button>
  return (
    <div className="card import">
      <label className="field">
        <span className="label">Deck code</span>
        <textarea
          value={code}
          rows={3}
          onChange={(e) => setCode(e.target.value)}
          placeholder="RB1|…"
        />
      </label>
      <label className="field">
        <span className="label">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Imported deck" />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="actions">
        <button className="primary" onClick={() => void submit()} disabled={!code.trim()}>
          Import
        </button>
        <button className="link" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function AddStarterDecks() {
  const file = useStore((s) => s.presets)
  const save = useStore((s) => s.savePresets)
  const select = useStore((s) => s.selectPreset)
  const selected = useStore((s) => s.selectedPresetId)
  const notify = useStore((s) => s.notify)
  const missing = PROVING_GROUNDS_DECKS.filter((d) => !file.presets.some((p) => p.id === d.id))
  if (missing.length === 0) return null

  async function add() {
    const result = addStarterDecks(file, PROVING_GROUNDS_DECKS, Date.now())
    await save(result.file)
    if (!selected) select(result.file.presets[0]?.id ?? null)
    notify(
      `Added ${String(result.added)} Proving Grounds ${result.added === 1 ? 'deck' : 'decks'}.`,
    )
  }

  return <button onClick={() => void add()}>Add Proving Grounds decks</button>
}

export function Decks() {
  const presets = useStore((s) => s.presets.presets)
  const go = useStore((s) => s.go)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Decks</h1>
          <p className="muted">
            Saved on this computer only. Copy a deck code to move a deck or share it.
          </p>
        </div>
        <div className="actions">
          <AddStarterDecks />
          <ImportDeck />
          <button className="primary" onClick={() => go({ name: 'builder', presetId: null })}>
            New deck
          </button>
        </div>
      </div>
      {presets.length === 0 ? (
        <div className="card empty">
          <p className="muted">
            No decks yet. Add the four Proving Grounds decks to play straight away, build one, or
            import a code a friend sent you.
          </p>
        </div>
      ) : (
        <ul className="preset-list">
          {presets.map((preset) => (
            <PresetRow key={preset.id} preset={preset} />
          ))}
        </ul>
      )}
    </div>
  )
}
