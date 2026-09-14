/**
 * The four decks in the Origins: Proving Grounds box, as they ship.
 *
 * Lists taken from Rift Mana's Proving Grounds deck lists, and the Annie list
 * cross-checked against a second listing; every deck totals 40 Main Deck
 * cards, 12 Runes and one Battlefield.
 *
 * Two things are ours rather than the box's:
 *
 *  - **Chosen Champion.** The box lists each deck's champions among its 40 cards
 *    without naming one for the Champion Zone (103.2.a). One copy is chosen
 *    here; change `champion` to pick the other.
 *  - **Format.** The boxed decks bring one Battlefield, not the three a Duel
 *    requires (485.4.a), so they are legal in the `starter` format only. See
 *    `DeckFormat` in the engine.
 */

import type { DeckFormat, DeckList } from '@rb/engine'

export interface StarterDeck {
  readonly id: string
  readonly name: string
  readonly format: DeckFormat
  readonly deck: DeckList
}

/** `n` copies of a card. */
function copies(n: number, id: string): string[] {
  return Array.from({ length: n }, () => id)
}

/**
 * Build a deck from the box's 40-card list, taking the Chosen Champion out of
 * it: the champion starts in the Champion Zone but still counts toward the 40
 * (103.2, 103.2.a.1).
 */
function boxed(params: {
  legend: string
  champion: string
  runes: [number, string][]
  battlefield: string
  cards: [number, string][]
}): DeckList {
  const main = params.cards.flatMap(([n, id]) => copies(n, id))
  const index = main.indexOf(params.champion)
  if (index === -1) throw new Error(`${params.champion} is not in the list`)
  main.splice(index, 1)
  return {
    legend: params.legend,
    champion: params.champion,
    main,
    runes: params.runes.flatMap(([n, id]) => copies(n, id)),
    battlefields: [params.battlefield],
  }
}

export const PROVING_GROUNDS_DECKS: readonly StarterDeck[] = [
  {
    id: 'ogs-annie',
    name: 'Annie — Proving Grounds',
    format: 'starter',
    deck: boxed({
      legend: 'OGS-017', // Dark Child, Starter
      champion: 'OGS-010', // Annie, Stubborn
      runes: [
        [6, 'OGN-007'], // Fury Rune
        [6, 'OGN-166'], // Chaos Rune
      ],
      battlefield: 'OGN-296', // Void Gate
      cards: [
        [3, 'OGN-169'], // Gust
        [2, 'OGS-011'], // Flash
        [3, 'OGS-003'], // Incinerate
        [3, 'OGN-170'], // Morbid Return
        [3, 'OGN-171'], // Mystic Poro
        [2, 'OGN-013'], // Pouty Poro
        [3, 'OGN-185'], // Traveling Merchant
        [3, 'OGN-176'], // Sneaky Deckhand
        [2, 'OGS-010'], // Annie, Stubborn
        [3, 'OGN-005'], // Disintegrate
        [2, 'OGS-001'], // Annie, Fiery
        [3, 'OGN-191'], // Maddened Marauder
        [3, 'OGS-002'], // Firestorm
        [3, 'OGN-174'], // Sai Scout
        [2, 'OGS-018'], // Tibbers
      ],
    }),
  },
  {
    id: 'ogs-lux',
    name: 'Lux — Proving Grounds',
    format: 'starter',
    deck: boxed({
      legend: 'OGS-021', // Lady of Luminosity, Starter
      champion: 'OGS-014', // Lux, Crownguard
      runes: [
        [6, 'OGN-089'], // Mind Rune
        [6, 'OGN-214'], // Order Rune
      ],
      battlefield: 'OGN-288', // Startipped Peak
      cards: [
        [3, 'OGN-095'], // Stupefy
        [3, 'OGN-210'], // Daring Poro
        [3, 'OGN-103'], // Ravenbloom Student
        [3, 'OGN-206'], // Back to Back
        [2, 'OGN-084'], // Eager Apprentice
        [3, 'OGN-087'], // Lecturing Yordle
        [2, 'OGS-014'], // Lux, Crownguard
        [3, 'OGN-219'], // Vanguard Sergeant
        [3, 'OGN-085'], // Falling Comet
        [3, 'OGS-012'], // Blast of Power
        [2, 'OGS-006'], // Lux, Illuminated
        [3, 'OGN-105'], // Singularity
        [3, 'OGS-016'], // Vanguard Attendant
        [2, 'OGN-088'], // Mega-Mech
        [2, 'OGS-022'], // Final Spark
      ],
    }),
  },
  {
    id: 'ogs-garen',
    name: 'Garen — Proving Grounds',
    format: 'starter',
    deck: boxed({
      legend: 'OGS-023', // Might of Demacia, Starter
      champion: 'OGS-013', // Garen, Commander
      runes: [
        [6, 'OGN-126'], // Body Rune
        [6, 'OGN-214'], // Order Rune
      ],
      battlefield: 'OGN-294', // Trifarian War Camp
      cards: [
        [3, 'OGN-129'], // Confront
        [3, 'OGN-210'], // Daring Poro
        [3, 'OGN-206'], // Back to Back
        [3, 'OGN-130'], // Crackshot Corsair
        [3, 'OGN-211'], // Faithful Manufactor
        [3, 'OGN-132'], // First Mate
        [3, 'OGN-222'], // Noxian Drummer
        [3, 'OGN-219'], // Vanguard Sergeant
        [2, 'OGS-024'], // Decisive Strike
        [2, 'OGN-131'], // Dune Drake
        [2, 'OGN-215'], // Petty Officer
        [2, 'OGS-013'], // Garen, Commander
        [2, 'OGS-007'], // Garen, Rugged
        [3, 'OGS-015'], // Recruit the Vanguard
        [3, 'OGS-016'], // Vanguard Attendant
      ],
    }),
  },
  {
    id: 'ogs-master-yi',
    name: 'Master Yi — Proving Grounds',
    format: 'starter',
    deck: boxed({
      legend: 'OGS-019', // Wuju Bladesman, Starter
      champion: 'OGS-004', // Master Yi, Meditative
      runes: [
        [6, 'OGN-042'], // Calm Rune
        [6, 'OGN-126'], // Body Rune
      ],
      battlefield: 'OGN-279', // Fortified Position
      cards: [
        [3, 'OGN-046'], // En Garde
        [3, 'OGN-127'], // Cannon Barrage
        [2, 'OGN-129'], // Confront
        [3, 'OGN-048'], // Meditation
        [3, 'OGN-134'], // Mobilize
        [3, 'OGN-052'], // Stalwart Poro
        [3, 'OGN-055'], // Wielder of Water
        [2, 'OGS-020'], // Highlander
        [2, 'OGS-004'], // Master Yi, Meditative
        [3, 'OGN-049'], // Playful Phantom
        [3, 'OGS-008'], // Gentlemen's Duel
        [3, 'OGS-005'], // Zephyr Sage
        [2, 'OGS-009'], // Master Yi, Honed
        [3, 'OGN-137'], // Stormclaw Ursine
        [2, 'OGN-142'], // Mountain Drake
      ],
    }),
  },
]
