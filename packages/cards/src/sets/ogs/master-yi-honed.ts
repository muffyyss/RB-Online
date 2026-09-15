import { defineCard } from '../../schema.js'

/**
 * OGS-009 — transcribed from the printed card.
 *
 * [Ganking] (810) lets him move battlefield to battlefield, and entering ready
 * replaces entering exhausted (143.4).
 */
export default defineCard({
  id: 'OGS-009',
  set: 'ogs',
  name: 'Master Yi',
  subtitle: 'Honed',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Master Yi', 'Ionia'],
  domains: ['body'],
  cost: { energy: 7, power: [{ kind: 'domain', domain: 'body' }] },
  might: 6,
  keywords: ['ganking'],
  abilities: [
    {
      kind: 'passive',
      id: 'master-yi-honed-enter-ready',
      text: 'I enter ready.',
      effect: { kind: 'enters-ready' },
    },
  ],
  text: '[Ganking] (I can move from battlefield to battlefield.) I enter ready.',
  flavor: 'The focused mind can pierce through stone.',
})
