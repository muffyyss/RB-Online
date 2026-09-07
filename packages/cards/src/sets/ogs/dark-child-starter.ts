import { defineCard } from '../../schema.js'

/**
 * OGS-017 — transcribed from the printed card. Annie's starter Legend.
 *
 * A Legend sets the deck's Domain Identity (103.1.b), so this deck may play
 * Chaos and Fury cards. Legends have no printed cost — they start in the Legend
 * Zone and are never played (133.6.b.1).
 *
 * "ready 2 runes" targets Runes, which sit on the board but are not Permanents
 * (161.1.a) — hence the dedicated `rune` selector kind.
 */
export default defineCard({
  id: 'OGS-017',
  set: 'ogs',
  name: 'Dark Child',
  subtitle: 'Starter',
  type: 'legend',
  tags: ['Annie'],
  domains: ['chaos', 'fury'],
  abilities: [
    {
      kind: 'triggered',
      id: 'dark-child-ready-runes',
      on: 'end-of-turn',
      steps: [{ op: 'ready', target: { kind: 'rune', controller: 'self', count: 2 } }],
    },
  ],
  text: 'At the end of your turn, ready 2 runes.',
})
