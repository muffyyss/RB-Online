import { describe, expect, it } from 'vitest'

import { turnStateOf } from '../src/state/game-state.js'
import { canSee, hiddenIdsFor, redactFor } from '../src/state/redact.js'
import { makeState } from './support/state.js'

const ME = 0 as const
const THEM = 1 as const

describe('redaction — public zones (107, 108)', () => {
  it.each([
    ['base', 107.1],
    ['battlefield', 107.2],
    ['chain', 108.1],
    ['trash', 108.2],
    ['banishment', 108.6],
    ['championZone', 108.3],
    ['legendZone', 107.4],
  ] as const)('shows %s to both players (%s)', (zone, _rule) => {
    const state = makeState([{ id: 'a', owner: THEM, zone }])
    expect(canSee(state.objects.a!, ME)).toBe(true)
    expect(canSee(state.objects.a!, THEM)).toBe(true)
  })

  it('keeps the trash visible — it is public, a common thing to over-redact (108.2.d)', () => {
    const state = makeState([{ id: 'dead', owner: THEM, zone: 'trash' }])
    const view = redactFor(state, ME)
    expect(view.objects.dead).toBeDefined()
    expect(view.players[THEM].trash.cards).toEqual(['dead'])
  })
})

describe('redaction — hands (108.7)', () => {
  it('shows a player their own hand', () => {
    const state = makeState([{ id: 'mine', owner: ME, zone: 'hand' }])
    const view = redactFor(state, ME)
    expect(view.objects.mine).toBeDefined()
    expect(view.players[ME].hand.cards).toEqual(['mine'])
  })

  it('hides the opponent hand contents but not its size (108.7.e)', () => {
    const state = makeState([
      { id: 'theirs-1', owner: THEM, zone: 'hand' },
      { id: 'theirs-2', owner: THEM, zone: 'hand' },
    ])
    const view = redactFor(state, ME)
    expect(view.objects['theirs-1']).toBeUndefined()
    expect(view.players[THEM].hand.cards).toBeUndefined()
    expect(view.players[THEM].hand.count).toBe(2)
  })
})

describe('redaction — decks (129.3, 108.4.d)', () => {
  it('hides deck contents from BOTH players, including the owner', () => {
    // 129.3 groups Main Deck cards with cards in hand: back side presented to
    // conceal Private or Secret information. 108.4.d makes the order Secret,
    // which nobody may look at (128.3).
    const state = makeState([
      { id: 'top', owner: ME, zone: 'mainDeck' },
      { id: 'rune', owner: ME, zone: 'runeDeck' },
    ])
    expect(canSee(state.objects.top!, ME)).toBe(false)
    expect(canSee(state.objects.rune!, ME)).toBe(false)

    const view = redactFor(state, ME)
    expect(view.objects.top).toBeUndefined()
    expect(view.players[ME].mainDeck).toEqual({ count: 1 })
    expect(view.players[ME].runeDeck).toEqual({ count: 1 })
  })
})

describe('redaction — facedown cards (129.4, 107.3)', () => {
  it('lets the controller see their facedown card, and nobody else', () => {
    const state = makeState([{ id: 'trap', owner: ME, zone: 'facedown', faceDown: true }])
    expect(canSee(state.objects.trap!, ME)).toBe(true)
    expect(canSee(state.objects.trap!, THEM)).toBe(false)
  })

  it('keeps a facedown card on the board private even in a public zone (129.4)', () => {
    const state = makeState([{ id: 'hidden-unit', owner: ME, zone: 'battlefield', faceDown: true }])
    expect(canSee(state.objects['hidden-unit']!, THEM)).toBe(false)
    expect(canSee(state.objects['hidden-unit']!, ME)).toBe(true)
  })
})

describe('redaction — pending choices', () => {
  const state = makeState([{ id: 'secret-card', owner: ME, zone: 'hand' }], {
    pendingChoice: {
      player: ME,
      binding: '$discard',
      candidates: ['secret-card'],
      min: 1,
      max: 1,
      optional: false,
    },
  })

  it('gives the choosing player their candidates', () => {
    expect(redactFor(state, ME).pendingChoice?.candidates).toEqual(['secret-card'])
  })

  it('tells the opponent a choice is pending but not what the options are', () => {
    // Candidates can be cards in hand, so leaking them would leak the hand.
    const view = redactFor(state, THEM)
    expect(view.pendingChoice?.player).toBe(ME)
    expect(view.pendingChoice?.candidateCount).toBe(1)
    expect(view.pendingChoice?.candidates).toBeUndefined()
  })
})

describe('redaction — the acceptance test', () => {
  it('never serialises a hidden object id anywhere in the payload', () => {
    // This is the check that matters: not that the client hides things, but
    // that the bytes on the wire never contained them.
    const state = makeState([
      { id: 'their-hand-card', owner: THEM, zone: 'hand' },
      { id: 'their-deck-card', owner: THEM, zone: 'mainDeck' },
      { id: 'my-deck-card', owner: ME, zone: 'mainDeck' },
      { id: 'their-facedown', owner: THEM, zone: 'facedown', faceDown: true },
      { id: 'public-unit', owner: THEM, zone: 'battlefield' },
    ])

    const payload = JSON.stringify(redactFor(state, ME))

    for (const id of hiddenIdsFor(state, ME)) {
      expect(payload).not.toContain(id)
    }
    expect(hiddenIdsFor(state, ME)).toEqual(
      expect.arrayContaining([
        'their-hand-card',
        'their-deck-card',
        'my-deck-card',
        'their-facedown',
      ]),
    )
    // The public unit must still be there — over-redacting breaks the game.
    expect(payload).toContain('public-unit')
  })
})

describe('turn state is derived, never stored (307-310)', () => {
  it('is neutral-open with no chain and no showdown', () => {
    expect(turnStateOf(makeState([]))).toBe('neutral-open')
  })

  it('closes when the chain holds an item (309.1)', () => {
    const state = makeState([], {
      chain: [{ id: 'c1', controller: 0, source: 'x', pending: true, bindings: {} }],
    })
    expect(turnStateOf(state)).toBe('neutral-closed')
  })

  it('is showdown-open during a showdown with an empty chain (310.3)', () => {
    const state = makeState([], { showdown: { battlefield: 'bf-0', combat: true } })
    expect(turnStateOf(state)).toBe('showdown-open')
  })

  it('is showdown-closed during a showdown with a chain (310.4)', () => {
    const state = makeState([], {
      showdown: { battlefield: 'bf-0', combat: true },
      chain: [{ id: 'c1', controller: 0, source: 'x', pending: false, bindings: {} }],
    })
    expect(turnStateOf(state)).toBe('showdown-closed')
  })
})
