import { describe, expect, it } from 'vitest'

import { oracleFrom } from '../src/effects/oracle.js'
import type { CardFacts } from '../src/effects/oracle.js'
import { MIN_MAIN_DECK, validateDeck } from '../src/deck/validate.js'
import type { DeckErrorCode } from '../src/deck/validate.js'
import type { DeckList } from '../src/flow/setup.js'

const oracle = oracleFrom({
  LEGEND: {
    type: 'legend',
    name: 'Dark Child',
    domains: ['chaos', 'fury'],
    tags: ['Annie'],
    keywords: [],
    abilities: [],
  },
  // A second legend with a single domain, for identity tests.
  'LEGEND-MONO': {
    type: 'legend',
    name: 'Mono',
    domains: ['fury'],
    tags: ['Annie'],
    keywords: [],
    abilities: [],
  },
  CHAMPION: {
    type: 'unit',
    name: 'Annie',
    domains: ['fury'],
    tags: ['Annie'],
    supertypes: ['champion'],
    might: 4,
    keywords: [],
    cost: { energy: 3, power: [] },
    abilities: [],
  },
  'CHAMPION-OTHER': {
    type: 'unit',
    name: 'Garen',
    domains: ['fury'],
    tags: ['Garen'],
    supertypes: ['champion'],
    might: 4,
    keywords: [],
    cost: { energy: 3, power: [] },
    abilities: [],
  },
  UNIT: {
    type: 'unit',
    name: 'Soldier',
    domains: ['fury'],
    tags: [],
    might: 2,
    keywords: [],
    cost: { energy: 2, power: [] },
    abilities: [],
  },
  'UNIT-B': {
    type: 'unit',
    name: 'Archer',
    domains: ['fury'],
    tags: [],
    might: 2,
    keywords: [],
    cost: { energy: 2, power: [] },
    abilities: [],
  },
  'UNIT-OFF': {
    type: 'unit',
    name: 'Outsider',
    domains: ['calm'],
    tags: [],
    might: 2,
    keywords: [],
    cost: { energy: 2, power: [] },
    abilities: [],
  },
  'UNIT-DUAL': {
    type: 'unit',
    name: 'Dual',
    domains: ['fury', 'calm'],
    tags: [],
    might: 2,
    keywords: [],
    cost: { energy: 2, power: [] },
    abilities: [],
  },
  SIG: {
    type: 'spell',
    name: 'Signature Blast',
    domains: ['fury'],
    tags: ['Annie'],
    supertypes: ['signature'],
    keywords: [],
    cost: { energy: 2, power: [] },
    abilities: [{ id: 'x', kind: 'spell', steps: [{ op: 'draw', amount: 1 }] }],
  },
  'SIG-B': {
    type: 'spell',
    name: 'Other Signature',
    domains: ['fury'],
    tags: ['Annie'],
    supertypes: ['signature'],
    keywords: [],
    cost: { energy: 2, power: [] },
    abilities: [{ id: 'x', kind: 'spell', steps: [{ op: 'draw', amount: 1 }] }],
  },
  'SIG-WRONG': {
    type: 'spell',
    name: 'Foreign Signature',
    domains: ['fury'],
    tags: ['Garen'],
    supertypes: ['signature'],
    keywords: [],
    cost: { energy: 2, power: [] },
    abilities: [{ id: 'x', kind: 'spell', steps: [{ op: 'draw', amount: 1 }] }],
  },
  RUNE: {
    type: 'rune',
    name: 'Fury Rune',
    domains: ['fury'],
    tags: [],
    keywords: [],
    abilities: [],
  },
  'RUNE-OFF': {
    type: 'rune',
    name: 'Calm Rune',
    domains: ['calm'],
    tags: [],
    keywords: [],
    abilities: [],
  },
  ...Object.fromEntries(
    // 13 distinct names x 3 copies = 39, plus the champion = a legal 40.
    Array.from({ length: 13 }, (_, i) => [
      `FILL-${String(i)}`,
      {
        type: 'unit',
        name: `Filler ${String(i)}`,
        domains: ['fury'],
        tags: [],
        might: 2,
        keywords: [],
        cost: { energy: 2, power: [] },
        abilities: [],
      } satisfies CardFacts,
    ]),
  ),
  BF1: { type: 'battlefield', name: 'Ruins', domains: [], tags: [], keywords: [], abilities: [] },
  BF2: { type: 'battlefield', name: 'Bridge', domains: [], tags: [], keywords: [], abilities: [] },
  BF3: { type: 'battlefield', name: 'Tower', domains: [], tags: [], keywords: [], abilities: [] },
} satisfies Record<string, CardFacts>)

/** 39 main-deck cards within the copy limit: 13 distinct names, 3 copies each. */
function fillerMain(): string[] {
  const main: string[] = []
  for (let i = 0; i < 13; i += 1) {
    for (let copy = 0; copy < 3; copy += 1) main.push(`FILL-${String(i)}`)
  }
  return main
}

/** A legal deck: 1 champion + 39 others = 40, 12 runes, 3 battlefields. */
function legalDeck(overrides: Partial<DeckList> = {}): DeckList {
  const main = fillerMain()
  return {
    legend: 'LEGEND',
    champion: 'CHAMPION',
    main,
    runes: Array.from({ length: 12 }, () => 'RUNE'),
    battlefields: ['BF1', 'BF2', 'BF3'],
    ...overrides,
  }
}

const codes = (deck: DeckList): DeckErrorCode[] =>
  validateDeck(deck, oracle).errors.map((e) => e.code)

describe('the Chosen Champion counts toward the Main Deck (103.2, 103.2.b.1)', () => {
  it('counts champion plus main cards', () => {
    const result = validateDeck(legalDeck(), oracle)
    expect(result.mainDeckSize).toBe(MIN_MAIN_DECK)
  })

  it('rejects a deck one card short', () => {
    const short = legalDeck({ main: Array.from({ length: 38 }, () => 'UNIT') })
    expect(codes(short)).toContain('main-deck-too-small')
  })
})

describe('Legend and Chosen Champion (103.1, 103.2.a)', () => {
  it('requires the champion to share a champion tag with the legend (103.2.a.2)', () => {
    expect(codes(legalDeck({ champion: 'CHAMPION-OTHER' }))).toContain('champion-tag-mismatch')
  })

  it('requires the champion to actually be a champion unit', () => {
    expect(codes(legalDeck({ champion: 'UNIT' }))).toContain('champion-not-a-champion')
  })

  it('requires the legend slot to hold a legend', () => {
    expect(codes(legalDeck({ legend: 'UNIT' }))).toContain('legend-not-a-legend')
  })

  it('reports an unknown card rather than crashing', () => {
    expect(codes(legalDeck({ legend: 'NOPE' }))).toEqual(['unknown-card'])
  })
})

describe('domain identity (103.1.b)', () => {
  it('accepts cards within the identity', () => {
    expect(validateDeck(legalDeck(), oracle).valid).toBe(true)
  })

  it('rejects a card of an absent domain', () => {
    const deck = legalDeck({ main: [...fillerMain().slice(1), 'UNIT-OFF'] })
    expect(codes(deck)).toContain('outside-domain-identity')
  })

  it('requires ALL domains of a multi-domain card, not just one (103.1.b.4)', () => {
    // Dual is Fury+Calm. The Chaos/Fury legend has Fury but not Calm, so it is
    // illegal even though one domain matches - the mistake worth testing for.
    const deck = legalDeck({ main: [...fillerMain().slice(1), 'UNIT-DUAL'] })
    expect(codes(deck)).toContain('outside-domain-identity')
  })

  it('applies to runes too (103.3.a.1)', () => {
    const deck = legalDeck({ runes: [...Array.from({ length: 11 }, () => 'RUNE'), 'RUNE-OFF'] })
    expect(codes(deck)).toContain('outside-domain-identity')
  })
})

describe('copy limit (103.2.b)', () => {
  it('allows three of a name', () => {
    // Exactly three of a name is fine; the legal deck is built that way.
    const errors = validateDeck(legalDeck(), oracle).errors
    expect(errors.filter((e) => e.code === 'too-many-copies')).toEqual([])
  })

  it('rejects a fourth copy', () => {
    // Drop one FILL-12 and add a fourth FILL-0, keeping the deck at 40.
    const main = [...fillerMain().slice(0, 38), 'FILL-0']
    expect(codes(legalDeck({ main }))).toContain('too-many-copies')
  })
})

describe('signature cards (103.2.d)', () => {
  it('allows three in total', () => {
    const main = ['SIG', 'SIG', 'SIG-B', ...fillerMain().slice(3)]
    const errors = validateDeck(legalDeck({ main }), oracle).errors
    expect(errors.map((e) => e.code)).not.toContain('too-many-signature')
  })

  it('rejects a fourth, regardless of name (103.2.d.1)', () => {
    // Three of one name plus one of another: four signature cards in total,
    // and no single name exceeds the copy limit.
    const main = ['SIG', 'SIG', 'SIG', 'SIG-B', ...fillerMain().slice(4)]
    expect(codes(legalDeck({ main }))).toContain('too-many-signature')
  })

  it('requires the legend champion tag (103.2.d.2)', () => {
    const main = ['SIG-WRONG', ...fillerMain().slice(1)]
    expect(codes(legalDeck({ main }))).toContain('signature-tag-mismatch')
  })
})

describe('rune deck (103.3)', () => {
  it('requires exactly twelve', () => {
    expect(codes(legalDeck({ runes: Array.from({ length: 11 }, () => 'RUNE') }))).toContain(
      'rune-deck-wrong-size',
    )
    expect(codes(legalDeck({ runes: Array.from({ length: 13 }, () => 'RUNE') }))).toContain(
      'rune-deck-wrong-size',
    )
  })

  it('rejects non-runes in the rune deck', () => {
    const runes = [...Array.from({ length: 11 }, () => 'RUNE'), 'UNIT']
    expect(codes(legalDeck({ runes }))).toContain('rune-deck-wrong-type')
  })
})

describe('battlefields (103.4, 485.4.a)', () => {
  it('requires three for a duel', () => {
    expect(codes(legalDeck({ battlefields: ['BF1', 'BF2'] }))).toContain('battlefield-count')
  })

  it('rejects two of the same name (103.4.c)', () => {
    expect(codes(legalDeck({ battlefields: ['BF1', 'BF1', 'BF2'] }))).toContain(
      'duplicate-battlefield',
    )
  })

  it('rejects a non-battlefield in the slot', () => {
    expect(codes(legalDeck({ battlefields: ['BF1', 'BF2', 'UNIT'] }))).toContain(
      'battlefield-not-a-battlefield',
    )
  })
})

describe('reporting', () => {
  it('returns every problem at once, not just the first', () => {
    const broken = legalDeck({
      champion: 'CHAMPION-OTHER',
      runes: Array.from({ length: 5 }, () => 'RUNE'),
      battlefields: ['BF1'],
    })
    const found = new Set(codes(broken))
    expect(found).toContain('champion-tag-mismatch')
    expect(found).toContain('rune-deck-wrong-size')
    expect(found).toContain('battlefield-count')
  })

  it('cites the rule behind every error', () => {
    for (const error of validateDeck(legalDeck({ battlefields: ['BF1'] }), oracle).errors) {
      expect(error.rule).toMatch(/^\d{3}(\.\w+)*$/)
    }
  })
})
