import { useMemo, useState } from 'react'

import { ALL_CARDS, cardFullName, cardOracle } from '@rb/cards'
import type { CardDefinition } from '@rb/cards'
import { RUNE_DECK_SIZE, DUEL_BATTLEFIELDS, MIN_MAIN_DECK, validateDeck } from '@rb/engine'
import type { DeckList } from '@rb/engine'

import {
  addCard,
  cleanName,
  countOf,
  emptyDeck,
  removeCard,
  upsertPreset,
} from '../../../shared/presets.js'
import { useStore } from '../store.js'

const oracle = cardOracle()

type Section = 'main' | 'runes' | 'battlefields'

const MAIN_TYPES = new Set(['unit', 'gear', 'spell'])

function sectionFor(card: CardDefinition): Section | 'legend' | null {
  if (card.type === 'legend') return 'legend'
  if (card.type === 'rune') return 'runes'
  if (card.type === 'battlefield') return 'battlefields'
  if (MAIN_TYPES.has(card.type)) return 'main'
  return null
}

function costLabel(card: CardDefinition): string {
  if (!card.cost) return ''
  return (
    String(card.cost.energy) + (card.cost.power.length ? ` +${String(card.cost.power.length)}` : '')
  )
}

function CardTile(props: {
  card: CardDefinition
  deck: DeckList
  onChange: (deck: DeckList) => void
}) {
  const { card, deck, onChange } = props
  const section = sectionFor(card)
  const isChampion = card.supertypes?.includes('champion') ?? false

  let count = 0
  if (section === 'legend') count = deck.legend === card.id ? 1 : 0
  else if (section) count = countOf(deck[section], card.id)
  const chosenChampion = deck.champion === card.id

  return (
    <div className={`tile ${count > 0 || chosenChampion ? 'in-deck' : ''}`}>
      <div className="tile-head">
        <span className="tile-name">{cardFullName(card)}</span>
        {card.cost && <span className="cost">{costLabel(card)}</span>}
      </div>
      <div className="tile-meta muted small">
        {card.id} · {card.type}
        {card.might !== undefined ? ` · ${String(card.might)} might` : ''} ·{' '}
        {card.domains.join(', ') || 'colourless'}
      </div>
      {card.text && <p className="tile-text small">{card.text}</p>}
      <div className="tile-actions">
        {section === 'legend' ? (
          <button onClick={() => onChange({ ...deck, legend: count ? '' : card.id })}>
            {count ? 'Remove legend' : 'Set as legend'}
          </button>
        ) : section ? (
          <>
            <button
              onClick={() => onChange(removeCard(deck, section, card.id))}
              disabled={count === 0}
            >
              −
            </button>
            <span className="count">{count}</span>
            <button onClick={() => onChange(addCard(deck, section, card.id))}>+</button>
          </>
        ) : null}
        {isChampion && (
          <button
            className={chosenChampion ? 'secondary' : ''}
            onClick={() => onChange({ ...deck, champion: chosenChampion ? '' : card.id })}
          >
            {chosenChampion ? 'Chosen champion' : 'Choose as champion'}
          </button>
        )}
      </div>
    </div>
  )
}

export function Builder({ presetId }: { presetId: string | null }) {
  const file = useStore((s) => s.presets)
  const save = useStore((s) => s.savePresets)
  const select = useStore((s) => s.selectPreset)
  const go = useStore((s) => s.go)
  const existing = file.presets.find((p) => p.id === presetId)

  const [name, setName] = useState(existing?.name ?? '')
  const [deck, setDeck] = useState<DeckList>(existing?.deck ?? emptyDeck())
  const [query, setQuery] = useState('')
  const validation = useMemo(() => validateDeck(deck, oracle), [deck])
  const problems = useMemo(() => {
    // An empty slot is reported by the engine as an unknown card with no id,
    // which reads as a bug. Say what is actually missing instead.
    const missing = [
      ...(deck.legend ? [] : [{ key: 'legend', message: 'Choose a legend.', rule: '103.1' }]),
      ...(deck.champion
        ? []
        : [{ key: 'champion', message: 'Choose a champion.', rule: '103.2.a' }]),
    ]
    const rest = validation.errors
      .filter((error) => !(error.code === 'unknown-card' && !error.card))
      .map((error, i) => ({
        key: `${error.code}-${String(i)}`,
        message: error.message,
        rule: error.rule,
      }))
    return [...missing, ...rest]
  }, [deck.legend, deck.champion, validation])

  const shown = ALL_CARDS.filter((card) => {
    const q = query.trim().toLowerCase()
    return !q || cardFullName(card).toLowerCase().includes(q) || card.id.toLowerCase().includes(q)
  })

  async function saveDeck() {
    const id = existing?.id ?? crypto.randomUUID()
    await save(upsertPreset(file, { id, name: cleanName(name), deck, updatedAt: Date.now() }))
    select(id)
    go({ name: 'decks' })
  }

  return (
    <div className="builder">
      <section className="pool">
        <div className="pool-head">
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards"
          />
          <span className="muted small">{shown.length} cards</span>
        </div>
        <div className="tiles">
          {shown.map((card) => (
            <CardTile key={card.id} card={card} deck={deck} onChange={setDeck} />
          ))}
        </div>
        <p className="hint">
          Only part of the Proving Grounds set has been entered so far, so no deck can be fully
          legal yet.
        </p>
      </section>

      <aside className="card summary">
        <label className="field">
          <span className="label">Deck name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled deck"
          />
        </label>

        <dl className="counts">
          <dt>Main deck</dt>
          <dd>
            {validation.mainDeckSize} / {MIN_MAIN_DECK}+
          </dd>
          <dt>Runes</dt>
          <dd>
            {deck.runes.length} / {RUNE_DECK_SIZE}
          </dd>
          <dt>Battlefields</dt>
          <dd>
            {deck.battlefields.length} / {DUEL_BATTLEFIELDS}
          </dd>
          <dt>Domains</dt>
          <dd>{validation.domains.join(', ') || '—'}</dd>
        </dl>

        <div className={validation.valid ? 'legality ok' : 'legality warn'}>
          {validation.valid
            ? 'Legal deck'
            : `${String(problems.length)} ${problems.length === 1 ? 'problem' : 'problems'}`}
        </div>
        {!validation.valid && (
          <ul className="problems">
            {problems.slice(0, 12).map((problem) => (
              <li key={problem.key}>
                {problem.message} <span className="muted small">({problem.rule})</span>
              </li>
            ))}
          </ul>
        )}

        <div className="actions">
          <button className="primary" onClick={() => void saveDeck()}>
            Save deck
          </button>
          <button className="link" onClick={() => go({ name: 'decks' })}>
            Cancel
          </button>
        </div>
        <p className="hint">Decks that are not legal can still be saved while you work on them.</p>
      </aside>
    </div>
  )
}
