import { defineCard } from '../../schema.js'

/**
 * OGS-004 — transcribed from the printed card.
 *
 * "Runes" are the runes he controls on the board, exhausted or not.
 */
export default defineCard({
  id: 'OGS-004',
  set: 'ogs',
  name: 'Master Yi',
  subtitle: 'Meditative',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Master Yi', 'Ionia'],
  domains: ['calm'],
  cost: { energy: 5, power: [{ kind: 'domain', domain: 'calm' }] },
  might: 4,
  abilities: [
    {
      kind: 'passive',
      id: 'master-yi-meditative-eight-runes',
      text: 'While you have 8+ runes, I have +4 Might.',
      effect: {
        kind: 'might',
        amount: 4,
        to: 'me',
        while: [{ kind: 'count', of: { kind: 'rune', controller: 'self' }, atLeast: 8 }],
      },
    },
  ],
  text: 'While you have 8+ runes, I have +4 [Might].',
  flavor: 'Anger gives motivation without purpose.',
})
